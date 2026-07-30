#!/usr/bin/env python3
"""One-time import of Toast order history into the rewards ledger.

The cron sync in worker.js starts from "now" — deliberately, because a
90-day catch-up is ~131 Toast page fetches and Cloudflare caps a request
at 50 subrequests. This script does that catch-up from your machine,
where there is no such ceiling, and pushes the result to the deployed
worker's admin endpoint in batches.

Only guests who have already joined in the app are credited, so running this
before anyone has joined is a no-op. Joining never backdates points on its
own — this script is the deliberate exception, for crediting a long-standing
regular as a gesture.

Usage:
    python3 backend/backfill.py --tenant soco --days 90 \\
        --url https://restaurant-rewards.<you>.workers.dev \\
        --admin-token "$ADMIN_TOKEN_SOCO"

    # dry run first — shows what would be credited, writes nothing
    python3 backend/backfill.py --tenant soco --days 90 --dry-run
"""
import argparse, importlib.util, json, sys, urllib.parse, urllib.request
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).parent
spec = importlib.util.spec_from_file_location("devsrv", HERE / "dev-server.py")
srv = importlib.util.module_from_spec(spec)
sys.modules["devsrv"] = srv
spec.loader.exec_module(srv)

BATCH_MEMBERS = 50


def scan(tenant, days, verbose=True):
    """Page through every location's history, grouped by guest phone."""
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    iso = lambda d: d.strftime("%Y-%m-%dT%H:%M:%S.000-0000")
    members = defaultdict(list)
    stats = {"pages": 0, "orders": 0, "checks": 0, "no_phone": 0, "not_enrolled": 0}

    for loc, guid in srv.live_locations(tenant):
        page = 1
        while True:
            q = urllib.parse.urlencode({"startDate": iso(start), "endDate": iso(end),
                                        "page": page, "pageSize": 100})
            rows = srv.toast_request(tenant, f"/orders/v2/ordersBulk?{q}", guid)
            stats["pages"] += 1
            stats["orders"] += len(rows)
            if verbose:
                print(f"  {loc} page {page:>3} … {len(rows):>3} orders", flush=True)

            for o in rows:
                if o.get("voided") or o.get("deleted"):
                    continue
                for c in o.get("checks") or []:
                    if c.get("voided") or c.get("deleted"):
                        continue
                    import re
                    phone = re.sub(r"\D", "", (c.get("customer") or {}).get("phone") or "")[-10:]
                    if len(phone) != 10:
                        stats["no_phone"] += 1
                        continue
                    if not srv.allowed(tenant, phone):
                        stats["not_enrolled"] += 1
                        continue
                    items = [{"name": s["displayName"], "price": s.get("price")}
                             for s in c.get("selections") or []
                             if not s.get("voided") and s.get("displayName")]
                    if not items:
                        continue
                    stats["checks"] += 1
                    members[phone].append({
                        "guid": c.get("guid") or o["guid"],
                        "ts": o.get("openedDate"),
                        "loc": loc,
                        "points": srv.earned_from_orders([{"items": items}], tenant["pointsPerDollar"]),
                        "names": [i["name"] for i in items][:6],
                    })
            if len(rows) < 100:
                break
            page += 1
    return members, stats


def push(url, tenant_id, token, members):
    """Send in batches — one giant POST would be a single point of failure."""
    sent = credited = 0
    items = list(members.items())
    for i in range(0, len(items), BATCH_MEMBERS):
        chunk = dict(items[i:i + BATCH_MEMBERS])
        req = urllib.request.Request(
            f"{url.rstrip('/')}/api/v1/{tenant_id}/admin/credit",
            method="POST",
            headers={"Content-Type": "application/json", "X-Admin-Token": token},
            data=json.dumps({"members": chunk}).encode())
        with urllib.request.urlopen(req, timeout=120) as r:
            res = json.loads(r.read().decode())
        sent += res.get("members", 0)
        credited += res.get("credited", 0)
        print(f"  batch {i // BATCH_MEMBERS + 1}: {res.get('members', 0)} guests, "
              f"{res.get('credited', 0)} orders credited", flush=True)
    return sent, credited


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--tenant", default="soco")
    ap.add_argument("--days", type=int, default=None, help="defaults to the tenant's lookbackDays")
    ap.add_argument("--url", help="deployed worker base URL")
    ap.add_argument("--admin-token")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    tenant = srv.REGISTRY.get(args.tenant)
    if not tenant:
        sys.exit(f"unknown tenant '{args.tenant}' — known: {', '.join(srv.REGISTRY)}")
    days = args.days or tenant["lookbackDays"]

    allowlist = tenant.get("allowlist")
    if allowlist is not None and not allowlist:
        print("⚠️  the allowlist is empty — nobody may join, so nothing will be credited.")
        print("   Set allowlist to null (open) or list numbers in tenants.json.\n")

    print(f"Scanning {days} days of {tenant['name']} history…")
    members, stats = scan(tenant, days)
    total_points = sum(o["points"] for orders in members.values() for o in orders)

    print(f"\n{'='*54}")
    print(f"  pages fetched      {stats['pages']}")
    print(f"  orders seen        {stats['orders']}")
    print(f"  checks credited    {stats['checks']}")
    print(f"  checks w/o phone   {stats['no_phone']}")
    print(f"  checks not enrolled{stats['not_enrolled']:>4}")
    print(f"  guests             {len(members)}")
    print(f"  points to credit   {total_points:,}")
    if members:
        top = sorted(members.items(), key=lambda kv: -sum(o['points'] for o in kv[1]))[:5]
        print("\n  biggest balances:")
        for ph, orders in top:
            pts = sum(o["points"] for o in orders)
            print(f"    •••-•••-{ph[-4:]}  {pts:>8,} pts  ({len(orders)} orders)")
    print("=" * 54)

    if args.dry_run or not members:
        print("\ndry run — nothing written.")
        return
    if not args.url or not args.admin_token:
        sys.exit("\n--url and --admin-token are required to write (or pass --dry-run)")

    print(f"\nPushing to {args.url} …")
    sent, credited = push(args.url, tenant["id"], args.admin_token, members)
    print(f"\ndone — {sent} guests, {credited} orders credited")


if __name__ == "__main__":
    main()
