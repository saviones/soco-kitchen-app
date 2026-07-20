#!/usr/bin/env python3
"""Local dev runner for the SoCo Toast proxy — no dependencies, Python 3.9+.

Mirrors backend/worker.js (the deployable Cloudflare Worker) endpoint-for-
endpoint so the app can be developed on machines without Node:

    GET /api/health
    GET /api/locations
    GET /api/menu?loc=cv
    GET /api/orders?phone=##########

Reads credentials from ../.env. Usage:  python3 backend/dev-server.py
"""
import json, re, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ENV = {}
for line in (Path(__file__).parent.parent / ".env").read_text().splitlines():
    m = re.match(r"^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$", line)
    if m:
        ENV[m.group(1)] = m.group(2)

TOAST_LOCATIONS = {
    "cv": "70015dc4-f626-4a4b-b15a-30c341b4e6c0",
    "al": "edfb0ad7-5a52-4a19-8f2c-c80a1d427bce",
    "ph": None,
    "sj": None,
}
ORDER_LOOKBACK_DAYS = 14
WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
PORT = 8788

cache = {"token": None, "menus": {}, "locations": None, "orders": {}}


def toast_request(path, guid=None, method="GET", body=None, retries=5):
    headers = {"Content-Type": "application/json"}
    if guid:
        headers["Authorization"] = "Bearer " + get_token()
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


def get_token():
    tok = cache["token"]
    if tok and tok["exp"] > time.time():
        return tok["value"]
    body = toast_request("/authentication/v1/authentication/login", body={
        "clientId": ENV["TOAST_CLIENT_ID"],
        "clientSecret": ENV["TOAST_CLIENT_SECRET"],
        "userAccessType": "TOAST_MACHINE_CLIENT",
    }, method="POST")
    t = body["token"]
    cache["token"] = {"value": t["accessToken"], "exp": time.time() + t["expiresIn"] - 120}
    return cache["token"]["value"]


def to_min(t):
    h, m = t.split(":")[:2]
    return int(h) * 60 + int(m)


def api_locations():
    hit = cache["locations"]
    if hit and hit["exp"] > time.time():
        return hit["value"]
    out = {}
    for loc, guid in TOAST_LOCATIONS.items():
        if not guid:
            continue
        r = toast_request(f"/restaurants/v1/restaurants/{guid}", guid)
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
    cache["locations"] = {"value": out, "exp": time.time() + 1800}
    return out


def api_menu(loc):
    guid = TOAST_LOCATIONS.get(loc)
    if not guid:
        return {"error": "location not live"}, 404
    hit = cache["menus"].get(loc)
    if hit and hit["exp"] > time.time():
        return hit["value"]
    data = toast_request("/menus/v2/menus", guid)
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
    cache["menus"][loc] = {"value": value, "exp": time.time() + 600}
    return value


# modest parallelism — Toast rate-limits aggressive bursts (HTTP 429)
POOL = ThreadPoolExecutor(max_workers=4)
PAGE_BATCH = 4
MAX_PAGES = 48


def scan_location(loc, guid):
    """Full lookback scan of one location -> phone-keyed order index.
    Toast returns range queries oldest-first with no early exit, so every
    page gets fetched (in parallel batches) and the result is cached."""
    hit = cache["orders"].get(loc)
    if hit and hit["exp"] > time.time():
        return hit["value"]
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=ORDER_LOOKBACK_DAYS)
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000-0000")

    def fetch_page(page):
        q = urllib.parse.urlencode({
            "startDate": iso(start), "endDate": iso(end), "page": page, "pageSize": 100})
        return toast_request(f"/orders/v2/ordersBulk?{q}", guid)

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
    cache["orders"][loc] = {"value": index, "exp": time.time() + 300}
    return index


def api_orders(phone):
    if not re.match(r"^\d{10}$", phone or ""):
        return {"error": "phone must be 10 digits"}, 400
    # sequential per location — scan_location fans out on POOL internally,
    # and nesting POOL.map inside POOL.map can starve the worker pool
    indexes = [scan_location(loc, guid) for loc, guid in TOAST_LOCATIONS.items() if guid]
    matched = [{k: v for k, v in row.items() if k != "phone"}
               for index in indexes for row in index if row["phone"] == phone]
    matched.sort(key=lambda o: o["ts"] or "")
    return {"orders": matched}


class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(url.query)
        try:
            if url.path == "/api/health":
                out = {"ok": True, "live": {k: bool(v) for k, v in TOAST_LOCATIONS.items()}}
            elif url.path == "/api/locations":
                out = api_locations()
            elif url.path == "/api/menu":
                out = api_menu((qs.get("loc") or ["cv"])[0])
            elif url.path == "/api/orders":
                out = api_orders((qs.get("phone") or [""])[0])
            else:
                out = ({"error": "not found"}, 404)
        except Exception as e:
            out = ({"error": str(e)}, 502)
        body, status = out if isinstance(out, tuple) else (out, 200)
        data = json.dumps(body).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self._cors()
        self.end_headers()
        self.wfile.write(data)

    def _cors(self):
        origin = self.headers.get("Origin", "")
        ok = origin == "https://saviones.github.io" or re.match(r"^http://(localhost|127\.0\.0\.1)(:\d+)?$", origin)
        self.send_header("Access-Control-Allow-Origin", origin if ok else "https://saviones.github.io")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Vary", "Origin")

    def log_message(self, fmt, *args):
        print(f"[toast-proxy] {self.address_string()} {fmt % args}")


if __name__ == "__main__":
    print(f"SoCo Toast proxy → http://localhost:{PORT}/api/health")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
