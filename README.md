# SoCo Kitchen — the Southern Comfort Kitchen phone app

A mobile app prototype for **Southern Comfort Kitchen** (socokitchen.net) — real menu,
real photos, real locations, real Toast ordering links, plus a mini-game that turns
eating through the whole menu into a quest.

## 📱 Try it right now

**Live app: https://saviones.github.io/soco-kitchen-app/**

- On your **phone**: open the link, then "Add to Home Screen" — it installs like a real app and works offline.
- On a **desktop**: same link, it renders inside a phone frame.

## Run it locally

Clone or [download ZIP](https://github.com/saviones/soco-kitchen-app/archive/refs/heads/main.zip), then
double-click **run.bat** (serves at http://localhost:8737 and opens your browser).
On a desktop browser it renders inside a phone frame; on an actual phone it's full-screen
and installable (PWA — "Add to Home Screen").

## What's inside

| Tab | What it does |
|---|---|
| **Home** | Live open/closed status from real hours, Beignet-Sunday countdown, Spice Roulette (shake your phone!), the SoCo story timeline, Bay Area map of all 4 kitchens, fan-favorites chart |
| **Menu** | The full transcribed Castro Valley menu (~45 items) with real photos where the site has them, search, filters, spice meters, Flavor DNA per dish, pairings |
| **Order** | Cart + location picker for all 4 spots (Castro Valley, Pleasant Hill, Alameda, San Jose) with live hours — checkout hands off to each location's **official Toast page** and copies your cart summary |
| **Quest** | **The SoCo Streetcar Challenge**: every dish is a station on a transit-style map (one line per category). Eat dishes → stations light up → badges, levels (Tourist → Honorary Brill Brother), daily Lagniappe bonus, Mardi Gras confetti |
| **Rewards** | Points, rewards ladder, vouchers, and a **simulated Toast loyalty link** (labeled DEMO) that shows how real orders would auto-earn points |

## About the Toast integration

The app now has a **real Toast integration** (read-only Standard API access) with an
automatic demo-mode fallback when no backend is reachable:

- **Live hours & open/closed status** from each location's Toast schedule
- **Live menu prices** from the Toast online-ordering menu
- **Real order → points sync**: link the phone number used at checkout and the last
  2 weeks of orders at Castro Valley & Alameda turn into points/quest progress
  (dedup'd per order, so nothing double-counts)

How it's wired:

- `backend/worker.js` — deployable Cloudflare Worker holding the Toast credentials,
  serving every route under `/api/v1/<tenant>/…`
- `backend/dev-server.py` — dependency-free local mirror of the worker
  (`python3 backend/dev-server.py`, reads `.env`, serves on :8788)
- `js/toast-live.js` + `js/toast-map.js` — frontend live mode + the Toast-name →
  app-dish mapping table
- Credentials live in a git-ignored `.env`; to go live on GitHub Pages, deploy the
  worker and set `T.LIVE_API` in `tenants/soco/config.js` to its URL

Still on the wishlist: Pleasant Hill & San Jose (need adding to the Toast credential
set), and true in-app ordering + loyalty writes (needs the **Toast partner program**;
until then checkout hands off to each location's official Toast page).

## Two currencies

| | Quest points | Reward points |
|---|---|---|
| Where they live | `localStorage`, on the device | The server ledger |
| Earned by | Manually logging dishes you ate | Real Toast orders only |
| What they do | Levels, badges, the streetcar map | Buy vouchers |

The split is deliberate. Quest points are self-reported, so they can never be
verified and must never buy anything. Reward points are derived server-side from
orders the restaurant actually rang up, so they can.

## Redeeming, and why the server owns it

A voucher is issued by the backend, never the browser. The app sends only a reward
*id*; the server prices it from `backend/tenants.json`, checks the balance, mints the
code with a CSPRNG and records it — all inside a Durable Object, so two simultaneous
taps cannot spend the same points twice.

Staff validate codes at **`/staff/`** — enter the code, see what it is and whether
it's live, tap once to burn it. Burning is atomic and idempotent: the same code
cannot be honoured at two tills. Staff need the backend URL, the tenant id and the
tenant's staff token (`STAFF_TOKEN_<TENANT>`).

Codes use an alphabet with no `0`, `O`, `1`, `I` or `L` — they get read aloud and
hand-typed at a noisy counter.

Run the ledger's adversarial tests (no Toast credentials needed, ~1s):

```bash
python3 backend/test_ledger.py
```

## Multi-tenant

Nothing about the engine is SoCo-specific.

- `tenants/<id>/config.js` — brand, locations, menu, levels, badges (declarative
  rules, no code), and the demo reward ladder
- `backend/tenants.json` — the server's registry: Toast GUIDs, earn rate, and the
  authoritative reward costs. Read by both `backend/tenants.js` (Worker) and
  `backend/dev-server.py`, so the two backends cannot drift
- `core/rules.js` + `core/tenant.js` — the tenant-agnostic engine

Adding a restaurant is a new tenant config, a new entry in `tenants.json`, and that
tenant's secrets. No engine changes. A tenant that doesn't want rewards sets
`rewardsEnabled: false` and the whole programme disappears from the app.

## Going live

**[LAUNCH.md](LAUNCH.md)** is the Castro Valley runbook: deploy, enrol pilot
guests, brief the counter, what to watch in week one, and how to stop.

## Deploying the backend

```bash
cd backend
wrangler kv namespace create VOUCHER_INDEX   # paste the id into wrangler.toml
wrangler secret put TOAST_SOCO_CLIENT_ID
wrangler secret put TOAST_SOCO_CLIENT_SECRET
wrangler secret put STAFF_TOKEN_SOCO
wrangler deploy
```

## Notes

- Prices/items transcribed from the posted Castro Valley menu (July 2026) — each location's live Toast menu governs.
- Quest progress, badges and the cart stay in `localStorage`. Points that buy food do not.
- **Guests enrol themselves and earn only from that moment on.** Linking a phone
  in the app is the sign-up; nothing is backdated, so no one has a balance sitting
  in an account they never opted into. There is no verification step, so the
  exposure is bounded to what someone earns after joining rather than a back
  catalogue. A tenant can run a closed pilot via `allowlist` — see [LAUNCH.md](LAUNCH.md).
