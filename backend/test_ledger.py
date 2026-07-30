#!/usr/bin/env python3
"""Adversarial tests for the rewards ledger.

Toast is stubbed — this tests the money logic, not the proxy.
Run: python3 backend/test_ledger.py   (~1s, no credentials needed)
"""
import importlib.util, os, sys, threading, tempfile
from pathlib import Path

APP = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("devsrv", APP / "backend" / "dev-server.py")
srv = importlib.util.module_from_spec(spec)
sys.modules["devsrv"] = srv
spec.loader.exec_module(srv)

TENANT = dict(srv.REGISTRY["soco"])          # copy — don't mutate the real registry
PHONE = "5105550134"
STRANGER = "4155559999"
TENANT["allowlist"] = [PHONE, "5105550999"]  # STRANGER deliberately absent

results = []
def check(name, cond, detail=""):
    results.append((name, cond, detail))
    print(("  PASS  " if cond else "  FAIL  ") + name + (f"   {detail}" if detail and not cond else ""))

def body_of(out):
    return out[0] if isinstance(out, tuple) else out

def fresh_ledger():
    srv.LEDGER_PATH = Path(tempfile.mkdtemp()) / "ledger.json"
    srv._member_locks.clear()

def order(guid, points):
    return {"guid": guid, "ts": "2026-07-20T18:04:00.000+0000", "loc": "cv",
            "points": points, "names": ["Seafood Gumbo"]}

fresh_ledger()

print("\n=== earn rule ===")
pts = srv.earned_from_orders(
    [{"items": [{"name": "Gumbo", "price": 15.0}, {"name": "Mac", "price": 8.0}]}],
    TENANT["pointsPerDollar"])
check("$23 order earns 230 pts at 10 pts/$", pts == 230, f"got {pts}")

print("\n=== crediting is idempotent ===")
srv.credit_member(TENANT, PHONE, [order("o1", 300), order("o2", 200)])
check("two orders credit 500", srv.api_balance(TENANT, PHONE)["balance"] == 500)
srv.credit_member(TENANT, PHONE, [order("o1", 300), order("o2", 200)])
check("replaying the same orders credits nothing more",
      srv.api_balance(TENANT, PHONE)["balance"] == 500,
      f"got {srv.api_balance(TENANT, PHONE)['balance']}")
srv.credit_member(TENANT, PHONE, [order("o3", 100)])
check("a genuinely new order still credits", srv.api_balance(TENANT, PHONE)["balance"] == 600)

print("\n=== concurrent crediting ===")
fresh_ledger()
threads = [threading.Thread(target=srv.credit_member, args=(TENANT, PHONE, [order(f"c{i}", 100)]))
           for i in range(20)]
for t in threads: t.start()
for t in threads: t.join()
bal = srv.api_balance(TENANT, PHONE)["balance"]
check("20 concurrent credits land exactly once each", bal == 2000, f"got {bal}")

print("\n=== the soft-launch allowlist ===")
out = body_of(srv.api_balance(TENANT, STRANGER))
check("an unenrolled number has no balance to read", out.get("error") == "not_enrolled", f"got {out}")
out = body_of(srv.api_redeem(TENANT, {"phone": STRANGER, "rewardId": "r-lemonade"}))
check("an unenrolled number cannot redeem", out.get("error") == "not_enrolled", f"got {out}")
srv.credit_member(TENANT, STRANGER, [order("s1", 99999)])
out = body_of(srv.api_redeem(TENANT, {"phone": STRANGER, "rewardId": "r-lemonade"}))
check("even holding points, an unenrolled number is refused",
      out.get("error") == "not_enrolled", f"got {out}")
out = body_of(srv.api_admin_credit(TENANT, {"members": {STRANGER: [order("s2", 500)]}}))
check("backfill skips unenrolled numbers", out.get("skipped") == [STRANGER], f"got {out}")

print("\n=== the forgery that used to work ===")
fresh_ledger()
srv.credit_member(TENANT, PHONE, [order("o1", 600)])
out = body_of(srv.api_redeem(TENANT, {"phone": PHONE, "rewardId": "r-platter"}))   # 12,000
check("cannot buy a 12,000-pt platter on 600 pts",
      out.get("reason") == "insufficient_points", f"got {out}")

print("\n=== client cannot set its own price ===")
out = body_of(srv.api_redeem(TENANT, {"phone": PHONE, "rewardId": "r-platter", "cost": 1, "price": 1}))
check("injected 'cost' is ignored, server prices it",
      out.get("reason") == "insufficient_points", f"got {out}")
out = body_of(srv.api_redeem(TENANT, {"phone": PHONE, "rewardId": "../../r-lemonade"}))
check("unknown reward id rejected", out.get("error") == "unknown reward", f"got {out}")

print("\n=== a redemption the guest can afford ===")
fresh_ledger()
srv.credit_member(TENANT, PHONE, [order("o1", 1500)])
out = body_of(srv.api_redeem(TENANT, {"phone": PHONE, "rewardId": "r-lemonade"}))   # 1,000
check("redeem succeeds when affordable", out.get("ok") is True, f"got {out}")
code = out.get("voucher", {}).get("code", "")
check("code uses the tenant prefix", code.startswith("SOCO-"), f"got {code}")
check("code avoids ambiguous 0/O/1/I/L",
      not set(code.split("-", 1)[1]) & set("01OIL"), f"got {code}")
check("balance deducted", out.get("balance") == 500, f"got {out.get('balance')}")

print("\n=== double-spend under concurrency ===")
fresh_ledger()
srv.credit_member(TENANT, PHONE, [order("o1", 1500)])   # affords exactly one 1,000-pt reward
oks, rejected = [], []
def hammer():
    b = body_of(srv.api_redeem(TENANT, {"phone": PHONE, "rewardId": "r-lemonade"}))
    (oks if b.get("ok") else rejected).append(b)
threads = [threading.Thread(target=hammer) for _ in range(12)]
for t in threads: t.start()
for t in threads: t.join()
check("exactly one of 12 simultaneous redeems succeeded",
      len(oks) == 1, f"{len(oks)} succeeded, {len(rejected)} rejected")
check("points spent exactly once", srv.api_balance(TENANT, PHONE)["spent"] == 1000)

print("\n=== burning ===")
good = oks[0]["voucher"]["code"]
out = body_of(srv.api_voucher(TENANT, good))
check("staff lookup finds it", out.get("ok") is True, f"got {out}")
check("guest phone masked to staff", out.get("phone", "").startswith("•••"), f"got {out.get('phone')}")
out = body_of(srv.api_burn(TENANT, good, {"staff": "Marcus"}))
check("first burn succeeds", out.get("ok") is True, f"got {out}")
check("burn records who", out.get("voucher", {}).get("burnedBy") == "Marcus")
out = body_of(srv.api_burn(TENANT, good, {"staff": "Marcus"}))
check("second burn refused", out.get("reason") == "already_redeemed", f"got {out}")

print("\n=== concurrent burns of one voucher ===")
fresh_ledger()
srv.credit_member(TENANT, "5105550999", [order("o9", 1500)])
v = body_of(srv.api_redeem(TENANT, {"phone": "5105550999", "rewardId": "r-lemonade"}))["voucher"]["code"]
burns = []
def burn_race():
    burns.append(bool(body_of(srv.api_burn(TENANT, v, {"staff": "till"})).get("ok")))
ts = [threading.Thread(target=burn_race) for _ in range(8)]
for t in ts: t.start()
for t in ts: t.join()
check("one voucher burns exactly once across 8 tills", sum(burns) == 1, f"{sum(burns)} got a yes")

print("\n=== forged codes ===")
check("made-up code not found", body_of(srv.api_voucher(TENANT, "SOCO-AAAA-BBBB")).get("reason") == "not_found")
check("made-up code cannot be burned", body_of(srv.api_burn(TENANT, "SOCO-AAAA-BBBB", {})).get("reason") == "not_found")

print("\n=== only finalised checks are credited ===")
def raw(guid, price, **check_extra):
    c = {"guid": guid, "customer": {"phone": PHONE},
         "selections": [{"displayName": "Gumbo", "price": price}]}
    c.update(check_extra)
    return {"guid": "o-" + guid, "openedDate": "2026-07-20T18:00:00.000+0000", "checks": [c]}

grouped = srv.checks_to_members([raw("open1", 15.0)], TENANT, "cv")
check("a check still being rung in is skipped", grouped == {}, f"got {grouped}")

grouped = srv.checks_to_members([raw("paid1", 15.0, paidDate="2026-07-20T18:40:00.000+0000")], TENANT, "cv")
check("a paid check is credited", len(grouped.get(PHONE, [])) == 1, f"got {grouped}")

grouped = srv.checks_to_members([raw("closed1", 15.0, closedDate="2026-07-20T18:40:00.000+0000")], TENANT, "cv")
check("a closed check is credited", len(grouped.get(PHONE, [])) == 1, f"got {grouped}")

grouped = srv.checks_to_members(
    [raw("void1", 15.0, paidDate="2026-07-20T18:40:00.000+0000", voided=True)], TENANT, "cv")
check("a voided check earns nothing", grouped == {}, f"got {grouped}")

grouped = srv.checks_to_members(
    [raw("stranger", 15.0, paidDate="x", customer={"phone": STRANGER})], TENANT, "cv")
check("an unenrolled guest's check is skipped by the sync", grouped == {}, f"got {grouped}")

print("\n=== ladder sanity ===")
# Generic figure — the real measured average ticket lives in LAUNCH.local.md,
# which is gitignored because this repo is public and orders x ticket is
# the location's revenue. Override with AVG_TICKET to check a real ladder.
avg_ticket = float(os.environ.get("AVG_TICKET", 30.0))
per_visit = avg_ticket * TENANT["pointsPerDollar"]
first = min(r["cost"] for r in TENANT["rewards"])
check("first reward reachable inside 4 visits",
      first / per_visit <= 4, f"{first/per_visit:.1f} visits")
check("reward costs strictly increase",
      all(a["cost"] < b["cost"] for a, b in zip(TENANT["rewards"], TENANT["rewards"][1:])))

failed = [r for r in results if not r[1]]
print(f"\n{'='*54}\n{len(results)-len(failed)}/{len(results)} passed")
if failed:
    print("FAILURES:")
    for n, _, d in failed:
        print(f"  - {n}  {d}")
sys.exit(1 if failed else 0)
