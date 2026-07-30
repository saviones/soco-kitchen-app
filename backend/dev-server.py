#!/usr/bin/env python3
"""Local dev runner for the rewards backend — no dependencies, Python 3.9+.

Mirrors backend/worker.js (the deployable Cloudflare Worker) route-for-route
so the app can be developed on machines without Node:

    GET  /api/v1/<tenant>/health
    GET  /api/v1/<tenant>/locations
    GET  /api/v1/<tenant>/menu?loc=cv
    GET  /api/v1/<tenant>/orders?phone=##########
    GET  /api/v1/<tenant>/rewards
    GET  /api/v1/<tenant>/balance?phone=##########
    POST /api/v1/<tenant>/redeem              {phone, rewardId}
    GET  /api/v1/<tenant>/voucher/<code>      staff (X-Staff-Token)
    POST /api/v1/<tenant>/voucher/<code>/burn staff (X-Staff-Token)

Tenant registry comes from backend/tenants.json — the same file the Worker
imports, so the two backends cannot drift.

The Worker serialises ledger writes with a Durable Object per member. Here a
per-member threading.Lock plays that role, giving the same guarantee: the
balance check and the deduction are one atomic step, so two simultaneous
redeems cannot double-spend. State persists to backend/.ledger-dev.json
(gitignored) so restarts do not wipe test vouchers.

Reads credentials from ../.env. Usage:  python3 backend/dev-server.py
"""
import json, os, re, secrets, threading, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).parent
ENV = {}
env_file = HERE.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
        if m:
            ENV[m.group(1)] = m.group(2)
ENV.update(os.environ)

REGISTRY = json.loads((HERE / "tenants.json").read_text())["tenants"]

WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
PORT = int(os.environ.get("PORT") or 8788)

# codes get read aloud and hand-typed at a noisy counter — no 0/O/1/I/L
ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"

cache = {"tokens": {}, "menus": {}, "locations": {}, "orders": {}}


# ---------------------------------------------------------------- credentials

def tenant_env(tenant, key):
    name = tenant["secrets"].get(key)
    val = ENV.get(name) if name else None
    # fall back to the pre-multi-tenant names so an existing .env keeps working
    if not val and key == "clientId":
        val = ENV.get("TOAST_CLIENT_ID")
    if not val and key == "clientSecret":
        val = ENV.get("TOAST_CLIENT_SECRET")
    return val


# ---------------------------------------------------------------- Toast API

def toast_request(tenant, path, guid=None, method="GET", body=None, retries=5):
    headers = {"Content-Type": "application/json"}
    if guid:
        headers["Authorization"] = "Bearer " + get_token(tenant)
        headers["Toast-Restaurant-External-ID"] = guid
    req = urllib.request.Request(
        ENV["TOAST_API_HOST"] + path, method=method, headers=headers,
        data=json.dumps(body).encode() if body else None)
    for attempt in range(retries):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < retries - 1:
                retry_after = e.headers.get("Retry-After")
                time.sleep(float(retry_after) if retry_after else 0.7 * (2 ** attempt))
                continue
            raise


def get_token(tenant):
    tok = cache["tokens"].get(tenant["id"])
    if tok and tok["exp"] > time.time():
        return tok["value"]
    cid, sec = tenant_env(tenant, "clientId"), tenant_env(tenant, "clientSecret")
    if not cid or not sec:
        raise RuntimeError(
            f"missing Toast credentials for tenant '{tenant['id']}' — expected "
            f"{tenant['secrets']['clientId']} / {tenant['secrets']['clientSecret']} in .env")
    body = toast_request(tenant, "/authentication/v1/authentication/login", body={
        "clientId": cid, "clientSecret": sec, "userAccessType": "TOAST_MACHINE_CLIENT",
    }, method="POST")
    t = body["token"]
    cache["tokens"][tenant["id"]] = {"value": t["accessToken"], "exp": time.time() + t["expiresIn"] - 120}
    return cache["tokens"][tenant["id"]]["value"]


def live_locations(tenant):
    return [(loc, guid) for loc, guid in tenant["locations"].items() if guid]


def to_min(t):
    h, m = t.split(":")[:2]
    return int(h) * 60 + int(m)


def api_locations(tenant):
    hit = cache["locations"].get(tenant["id"])
    if hit and hit["exp"] > time.time():
        return hit["value"]
    out = {}
    for loc, guid in live_locations(tenant):
        r = toast_request(tenant, f"/restaurants/v1/restaurants/{guid}", guid)
        sched = r.get("schedules") or {}
        days = []
        for d in WEEK:
            ds = (sched.get("daySchedules") or {}).get((sched.get("weekSchedule") or {}).get(d))
            if ds and ds.get("openTime") and ds.get("closeTime"):
                o, c = to_min(ds["openTime"]), to_min(ds["closeTime"])
                if c <= o:
                    c = 1439  # overnight schedule — cap at midnight for the app's day-based model
                days.append([o, c])
            else:
                days.append(None)
        out[loc] = {
            "name": (r.get("general") or {}).get("name"),
            "phone": (r.get("location") or {}).get("phone"),
            "hours": days,
            "orderUrl": (r.get("urls") or {}).get("orderOnline"),
        }
    cache["locations"][tenant["id"]] = {"value": out, "exp": time.time() + 1800}
    return out


def api_menu(tenant, loc):
    guid = tenant["locations"].get(loc)
    if not guid:
        return {"error": "location not live"}, 404
    key = f"{tenant['id']}:{loc}"
    hit = cache["menus"].get(key)
    if hit and hit["exp"] > time.time():
        return hit["value"]
    data = toast_request(tenant, "/menus/v2/menus", guid)
    menu = next((m for m in data["menus"] if "TOAST_ONLINE_ORDERING" in (m.get("visibility") or [])),
                data["menus"][0])
    items = []

    def walk(groups):
        for g in groups or []:
            for it in g.get("menuItems") or []:
                items.append({"name": it.get("name"), "price": it.get("price"), "guid": it.get("guid")})
            walk(g.get("menuGroups"))

    walk(menu.get("menuGroups"))
    value = {"lastUpdated": data.get("lastUpdated"), "menuName": menu.get("name"), "items": items}
    cache["menus"][key] = {"value": value, "exp": time.time() + 600}
    return value


# modest parallelism — Toast rate-limits aggressive bursts (HTTP 429)
POOL = ThreadPoolExecutor(max_workers=4)
PAGE_BATCH = 4
MAX_PAGES = 48


def scan_location(tenant, loc, guid):
    """Full lookback scan of one location -> phone-keyed order index.
    Toast returns range queries oldest-first with no early exit, so every
    page gets fetched (in parallel batches) and the result is cached."""
    key = f"{tenant['id']}:{loc}"
    hit = cache["orders"].get(key)
    if hit and hit["exp"] > time.time():
        return hit["value"]
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=tenant["lookbackDays"])
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000-0000")

    def fetch_page(page):
        q = urllib.parse.urlencode({
            "startDate": iso(start), "endDate": iso(end), "page": page, "pageSize": 100})
        return toast_request(tenant, f"/orders/v2/ordersBulk?{q}", guid)

    index = []
    page = 1
    while page <= MAX_PAGES:
        pages = list(POOL.map(fetch_page, range(page, page + PAGE_BATCH)))
        for orders in pages:
            for o in orders:
                if o.get("voided") or o.get("deleted"):
                    continue
                for c in o.get("checks") or []:
                    if c.get("voided") or c.get("deleted"):
                        continue
                    p = re.sub(r"\D", "", (c.get("customer") or {}).get("phone") or "")[-10:]
                    if len(p) != 10:
                        continue
                    items = [{"name": s["displayName"], "price": s.get("price")}
                             for s in c.get("selections") or []
                             if not s.get("voided") and s.get("displayName")]
                    if items:
                        index.append({"phone": p, "guid": o["guid"], "loc": loc,
                                      "ts": o.get("openedDate"), "items": items})
        if any(len(orders) < 100 for orders in pages):
            break
        page += PAGE_BATCH
    cache["orders"][key] = {"value": index, "exp": time.time() + 300}
    return index


def orders_for_phone(tenant, phone):
    # sequential per location — scan_location fans out on POOL internally,
    # and nesting POOL.map inside POOL.map can starve the worker pool
    indexes = [scan_location(tenant, loc, guid) for loc, guid in live_locations(tenant)]
    matched = [{k: v for k, v in row.items() if k != "phone"}
               for index in indexes for row in index if row["phone"] == phone]
    matched.sort(key=lambda o: o["ts"] or "")
    return matched


def earned_from_orders(orders, points_per_dollar):
    total = 0
    for o in orders:
        for it in o.get("items") or []:
            price = it.get("price")
            if isinstance(price, (int, float)) and price > 0:
                total += round(price * points_per_dollar)
    return total


# ---------------------------------------------------------------- ledger

LEDGER_PATH = HERE / ".ledger-dev.json"
_ledger_lock = threading.Lock()          # guards the file + the member map
_member_locks = {}                       # member key -> Lock (the DO analogue)


def _load_ledger():
    if LEDGER_PATH.exists():
        try:
            return json.loads(LEDGER_PATH.read_text())
        except (ValueError, OSError):
            pass
    return {"members": {}, "index": {}}


def _save_ledger(data):
    tmp = LEDGER_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=2))
    tmp.replace(LEDGER_PATH)


def member_lock(key):
    with _ledger_lock:
        if key not in _member_locks:
            _member_locks[key] = threading.Lock()
        return _member_locks[key]


def generate_code(prefix):
    chars = "".join(secrets.choice(ALPHABET) for _ in range(8))
    return f"{prefix}-{chars[:4]}-{chars[4:]}"


def member_state(key):
    led = _load_ledger()
    m = led["members"].get(key) or {"earned": 0, "spent": 0, "vouchers": {}, "seen": {}, "orders": []}
    m.setdefault("earned", 0)
    m.setdefault("seen", {})
    m.setdefault("orders", [])
    return led, m


def can_enroll(tenant, phone):
    """Optional gate on who may JOIN. Enrolment itself is self-service — a
    guest links their phone in the app. null (the default) means anyone with
    the app can join; a list narrows it to a closed pilot."""
    if tenant.get("allowlist") is None:
        return True
    return phone in (tenant.get("allowlist") or [])


def get_enrolled(tenant):
    return (_load_ledger().get("enrolled") or {}).get(tenant["id"], {})


def is_enrolled(tenant, phone):
    return phone in get_enrolled(tenant)


def enroll_member(tenant, phone):
    """Records WHEN a guest joined. The sync credits only orders from that
    moment on — nothing is backdated, so joining never hands anyone points
    they did not opt in for."""
    with _ledger_lock:
        led = _load_ledger()
        led.setdefault("enrolled", {}).setdefault(tenant["id"], {})
        existing = led["enrolled"][tenant["id"]].get(phone)
        if existing:
            return {"ok": True, "alreadyEnrolled": True, "enrolledAt": existing}
        now = int(time.time() * 1000)
        led["enrolled"][tenant["id"]][phone] = now
        _save_ledger(led)
        return {"ok": True, "alreadyEnrolled": False, "enrolledAt": now}


def credit_member(tenant, phone, orders):
    """Idempotent by order id, so a replayed sync window cannot pay twice."""
    key = f"{tenant['id']}:{phone}"
    with member_lock(key):
        led, m = member_state(key)
        added = credited = 0
        for o in orders:
            guid = o.get("guid")
            if not guid or guid in m["seen"]:
                continue
            m["seen"][guid] = 1
            added += o.get("points") or 0
            credited += 1
            m["orders"].append(o)
        if not credited:
            return {"ok": True, "credited": 0, "added": 0}
        m["earned"] += added
        # keep both lists bounded
        if len(m["seen"]) > 2000:
            m["seen"] = {k: 1 for k in list(m["seen"])[-2000:]}
        m["orders"] = m["orders"][-100:]
        led["members"][key] = m
        _save_ledger(led)
        return {"ok": True, "credited": credited, "added": added, "earned": m["earned"]}


def api_enroll(tenant, body):
    phone = re.sub(r"\D", "", body.get("phone") or "")[-10:]
    if not re.match(r"^\d{10}$", phone):
        return {"error": "phone must be 10 digits"}, 400
    if not tenant.get("rewardsEnabled"):
        return {"error": "rewards disabled for this tenant"}, 403
    if not can_enroll(tenant, phone):
        return {"error": "enrollment_closed",
                "message": "The rewards programme is in a limited pilot right now — ask at the counter."}, 403
    res = enroll_member(tenant, phone)
    res.update(api_balance(tenant, phone))
    return res


def api_balance(tenant, phone):
    if not is_enrolled(tenant, phone):
        return {"error": "not_enrolled",
                "message": "This number hasn't joined the rewards programme yet."}, 403
    key = f"{tenant['id']}:{phone}"
    _, m = member_state(key)
    vouchers = sorted(m["vouchers"].values(), key=lambda v: v["issuedAt"], reverse=True)
    return {"earned": m["earned"], "spent": m["spent"],
            "balance": max(0, m["earned"] - m["spent"]),
            "vouchers": vouchers, "orderCount": len(m["orders"]),
            "orders": m["orders"][-25:]}


def api_redeem(tenant, body):
    phone = re.sub(r"\D", "", body.get("phone") or "")[-10:]
    if not re.match(r"^\d{10}$", phone):
        return {"error": "phone must be 10 digits"}, 400
    if not tenant.get("rewardsEnabled"):
        return {"error": "rewards disabled for this tenant"}, 403
    if not is_enrolled(tenant, phone):
        return {"error": "not_enrolled",
                "message": "This number hasn't joined the rewards programme yet."}, 403
    reward = next((r for r in tenant["rewards"] if r["id"] == body.get("rewardId")), None)
    if not reward:
        return {"error": "unknown reward"}, 400

    key = f"{tenant['id']}:{phone}"

    # everything from here is serialised per member — the balance check and the
    # deduction must not interleave with another redeem for the same guest
    with member_lock(key):
        led, m = member_state(key)
        balance = m["earned"] - m["spent"]
        if balance < reward["cost"]:
            return {"ok": False, "reason": "insufficient_points",
                    "balance": balance, "cost": reward["cost"]}, 409

        now = int(time.time() * 1000)
        voucher = {
            "code": generate_code(tenant.get("codePrefix") or tenant["id"].upper()),
            "rewardId": reward["id"], "name": reward["name"], "icon": reward["icon"],
            "cost": reward["cost"], "issuedAt": now,
            "expiresAt": now + tenant["voucherTtlDays"] * 86400000,
            "status": "issued", "burnedAt": None, "burnedBy": None,
        }
        m["vouchers"][voucher["code"]] = voucher
        m["spent"] += reward["cost"]
        led["members"][key] = m
        led["index"][voucher["code"]] = key
        _save_ledger(led)
        return {"ok": True, "voucher": voucher, "balance": balance - reward["cost"]}


def api_voucher(tenant, code):
    led = _load_ledger()
    key = led["index"].get(code)
    if not key or not key.startswith(tenant["id"] + ":"):
        return {"ok": False, "reason": "not_found"}, 404
    v = (led["members"].get(key) or {}).get("vouchers", {}).get(code)
    if not v:
        return {"ok": False, "reason": "not_found"}, 404
    return {"ok": True, "voucher": v, "phone": "•••-•••-" + key.split(":")[1][-4:]}


def api_burn(tenant, code, body):
    led = _load_ledger()
    key = led["index"].get(code)
    if not key or not key.startswith(tenant["id"] + ":"):
        return {"ok": False, "reason": "not_found"}, 404

    with member_lock(key):
        led, m = member_state(key)
        v = m["vouchers"].get(code)
        if not v:
            return {"ok": False, "reason": "not_found"}, 404
        if v["status"] == "burned":
            return {"ok": False, "reason": "already_redeemed", "voucher": v}, 409
        if int(time.time() * 1000) > v["expiresAt"]:
            v["status"] = "expired"
            led["members"][key] = m
            _save_ledger(led)
            return {"ok": False, "reason": "expired", "voucher": v}, 409
        v["status"] = "burned"
        v["burnedAt"] = int(time.time() * 1000)
        v["burnedBy"] = body.get("staff") or "counter"
        led["members"][key] = m
        _save_ledger(led)
        return {"ok": True, "voucher": v}


# ---------------------------------------------------------------- http

SYNC_WINDOW_MS = 6 * 3600 * 1000
SYNC_MIN_WINDOW_MS = 15 * 60 * 1000
# Stay this far behind live and skip unclosed checks: Toast returns a check
# as soon as it opens, and crediting one mid-meal would bank a fraction of
# the ticket that dedup would then prevent correcting. See worker.js.
SYNC_SETTLE_MS = 90 * 60 * 1000
SYNC_OVERLAP_MS = 30 * 60 * 1000
# a Toast page fetch and a member write each cost one Cloudflare subrequest,
# so the real constraint is their sum — see OPS_BUDGET in worker.js
OPS_BUDGET = 35


def checks_to_members(rows, tenant, loc, enrolled=None):
    """Group Toast checks by guest phone, skipping anyone not enrolled and
    any order predating their enrolment."""
    if enrolled is None:
        enrolled = get_enrolled(tenant)
    by_phone = {}
    for o in rows:
        if o.get("voided") or o.get("deleted"):
            continue
        for c in o.get("checks") or []:
            if c.get("voided") or c.get("deleted"):
                continue
            # still being rung in — its total is not final yet
            if not c.get("closedDate") and not c.get("paidDate") and not o.get("closedDate"):
                continue
            phone = re.sub(r"\D", "", (c.get("customer") or {}).get("phone") or "")[-10:]
            if len(phone) != 10:
                continue
            # only enrolled guests earn, and only from the moment they enrolled
            enrolled_at = enrolled.get(phone)
            if enrolled_at is None:
                continue
            # Grace window covers the visit someone is actually on — a guest who
            # orders then joins while waiting for their food would otherwise get
            # nothing for the meal in front of them. Hours, not weeks, so it never
            # reopens the back-catalogue this rule exists to prevent.
            grace_ms = tenant.get("enrollGraceMinutes", 120) * 60000
            opened = o.get("openedDate")
            if opened:
                try:
                    ts = datetime.strptime(opened[:19], "%Y-%m-%dT%H:%M:%S").replace(
                        tzinfo=timezone.utc).timestamp() * 1000
                    if ts < enrolled_at - grace_ms:
                        continue
                except ValueError:
                    pass
            items = [{"name": s["displayName"], "price": s.get("price")}
                     for s in c.get("selections") or []
                     if not s.get("voided") and s.get("displayName")]
            if not items:
                continue
            by_phone.setdefault(phone, []).append({
                "guid": c.get("guid") or o["guid"],
                "ts": o.get("openedDate"),
                "loc": loc,
                "points": earned_from_orders([{"items": items}], tenant["pointsPerDollar"]),
                "names": [i["name"] for i in items][:6],
            })
    return by_phone


def sync_location(tenant, loc, guid, now_ms=None):
    """Walk the cursor forward and push points into member ledgers.
    Mirrors scheduled() in worker.js. Same path serves catch-up and steady state."""
    now_ms = (now_ms or int(time.time() * 1000)) - SYNC_SETTLE_MS   # never sync up to live
    led = _load_ledger()
    ckey = f"cursor:{tenant['id']}:{loc}"
    cursor = led.get("cursors", {}).get(ckey)
    cursor = int(cursor) if cursor else now_ms

    iso = lambda ms: datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000-0000")
    ops = pages = members = credited = 0
    window_ms = SYNC_WINDOW_MS

    # read the enrolment map once per pass, not once per guest
    enrolled = get_enrolled(tenant)
    if not enrolled:
        led = _load_ledger()
        led.setdefault("cursors", {})[ckey] = now_ms
        _save_ledger(led)
        return {"loc": loc, "pages": 0, "members": 0, "credited": 0,
                "cursor": now_ms, "enrolled": 0}

    while cursor < now_ms and ops < OPS_BUDGET:
        win_end = min(cursor + window_ms, now_ms)
        win_start = max(0, cursor - SYNC_OVERLAP_MS)
        rows = []
        page = 1
        while ops < OPS_BUDGET:
            q = urllib.parse.urlencode({"startDate": iso(win_start), "endDate": iso(win_end),
                                        "page": page, "pageSize": 100})
            batch = toast_request(tenant, f"/orders/v2/ordersBulk?{q}", guid)
            pages += 1
            ops += 1
            rows.extend(batch)
            if len(batch) < 100:
                break
            page += 1

        by_phone = checks_to_members(rows, tenant, loc, enrolled)

        # A window too busy for the remaining budget must shrink, not stall —
        # refusing to advance past an undrainable window loops forever on catch-up.
        if ops + len(by_phone) > OPS_BUDGET and window_ms > SYNC_MIN_WINDOW_MS:
            window_ms = max(SYNC_MIN_WINDOW_MS, window_ms // 4)
            continue

        for phone, orders in by_phone.items():
            res = credit_member(tenant, phone, orders)
            members += 1
            ops += 1
            credited += res["credited"]
        cursor = win_end

    led = _load_ledger()
    led.setdefault("cursors", {})[ckey] = cursor
    _save_ledger(led)
    return {"loc": loc, "pages": pages, "members": members, "credited": credited,
            "cursor": cursor, "enrolled": len(enrolled)}


def sync_tenant(tenant):
    out = []
    for loc, guid in live_locations(tenant):
        try:
            out.append(sync_location(tenant, loc, guid))
        except Exception as e:
            out.append({"loc": loc, "error": str(e)})
    return out


def api_admin_credit(tenant, body):
    out = {"members": 0, "credited": 0, "skipped": []}
    for raw, orders in (body.get("members") or {}).items():
        phone = re.sub(r"\D", "", raw)[-10:]
        if len(phone) != 10:
            continue
        # backfill still only touches people who chose to join
        if not is_enrolled(tenant, phone):
            out["skipped"].append(phone)
            continue
        res = credit_member(tenant, phone, orders)
        out["members"] += 1
        out["credited"] += res["credited"]
    return out


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def _dispatch(self, method):
        url = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(url.query)
        parts = [p for p in url.path.split("/") if p]
        body = {}
        if method == "POST":
            length = int(self.headers.get("Content-Length") or 0)
            if length:
                try:
                    body = json.loads(self.rfile.read(length).decode())
                except ValueError:
                    body = {}
        try:
            out = self._route(method, parts, qs, body)
        except Exception as e:
            out = ({"error": str(e)}, 502)
        self._respond(out)

    def _route(self, method, parts, qs, body):
        if len(parts) < 3 or parts[0] != "api" or parts[1] != "v1":
            return {"error": "not found"}, 404
        tenant = REGISTRY.get(parts[2])
        if not tenant:
            return {"error": "unknown tenant"}, 404
        route = parts[3:]
        if not route:
            return {"error": "not found"}, 404
        head = route[0]

        if head == "health" and method == "GET":
            return {"ok": True, "tenant": tenant["id"], "name": tenant["name"],
                    "live": {k: bool(v) for k, v in tenant["locations"].items()},
                    "rewardsEnabled": bool(tenant.get("rewardsEnabled")),
                    "enrollmentOpen": tenant.get("allowlist") is None,
                    "enrolledCount": len(get_enrolled(tenant))}
        if head == "locations" and method == "GET":
            return api_locations(tenant)
        if head == "menu" and method == "GET":
            default_loc = next(iter(tenant["locations"]))
            return api_menu(tenant, (qs.get("loc") or [default_loc])[0])
        # NOTE: there is deliberately no /orders route. It scanned Toast on
        # demand (~131 subrequests for 90 days at Castro Valley's volume) and
        # sat in front of every guest opening the app. Order history now
        # arrives with the balance, credited ahead of time by the sync.
        if head == "rewards" and method == "GET":
            return {"enabled": bool(tenant.get("rewardsEnabled")), "rewards": tenant.get("rewards") or []}
        if head == "balance" and method == "GET":
            phone = re.sub(r"\D", "", (qs.get("phone") or [""])[0])[-10:]
            if not re.match(r"^\d{10}$", phone):
                return {"error": "phone must be 10 digits"}, 400
            return api_balance(tenant, phone)
        if head == "enroll" and method == "POST":
            return api_enroll(tenant, body)
        if head == "redeem" and method == "POST":
            return api_redeem(tenant, body)
        if head == "voucher" and len(route) > 1:
            expected = ENV.get(tenant["secrets"]["staffToken"])
            if not expected:
                return {"error": f"staff token not configured ({tenant['secrets']['staffToken']})"}, 500
            if self.headers.get("X-Staff-Token") != expected:
                return {"error": "unauthorized"}, 401
            code = urllib.parse.unquote(route[1]).upper()
            if len(route) > 2 and route[2] == "burn" and method == "POST":
                return api_burn(tenant, code, body)
            if len(route) == 2 and method == "GET":
                return api_voucher(tenant, code)
        if head == "admin" and len(route) > 1:
            expected = ENV.get(tenant["secrets"]["adminToken"])
            if not expected:
                return {"error": f"admin token not configured ({tenant['secrets']['adminToken']})"}, 500
            if self.headers.get("X-Admin-Token") != expected:
                return {"error": "unauthorized"}, 401
            if route[1] == "credit" and method == "POST":
                return api_admin_credit(tenant, body)
            if route[1] == "sync" and method == "GET":
                return {"ok": True, "result": sync_tenant(tenant)}
        return {"error": "not found"}, 404

    def _respond(self, out):
        body, status = out if isinstance(out, tuple) else (out, 200)
        data = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _cors(self):
        origin = self.headers.get("Origin", "")
        ok = origin == "https://saviones.github.io" or re.match(
            r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", origin)
        self.send_header("Access-Control-Allow-Origin", origin if ok else "https://saviones.github.io")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Staff-Token")
        self.send_header("Vary", "Origin")

    def log_message(self, fmt, *args):
        print(f"[rewards-dev] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    names = ", ".join(REGISTRY)
    print(f"rewards backend (dev) → http://localhost:{PORT}/api/v1/<tenant>/health")
    print(f"tenants: {names}")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
