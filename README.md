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

- `backend/worker.js` — deployable Cloudflare Worker that holds the Toast credentials
  and exposes `/api/health`, `/api/locations`, `/api/menu`, `/api/orders?phone=`
  (returns items + dates only — no names, no payment data)
- `backend/dev-server.py` — dependency-free local mirror of the worker
  (`python3 backend/dev-server.py`, reads `.env`, serves on :8788)
- `js/toast-live.js` + `js/toast-map.js` — frontend live mode + the Toast-name →
  app-dish mapping table
- Credentials live in a git-ignored `.env` (`TOAST_CLIENT_ID`, `TOAST_CLIENT_SECRET`,
  `TOAST_API_HOST`); to go live on GitHub Pages, deploy the worker and set
  `SOCO.LIVE_API` in `js/data.js` to its URL

Still on the wishlist: Pleasant Hill & San Jose (need adding to the Toast credential
set), and true in-app ordering + loyalty writes (needs the **Toast partner program**;
until then checkout hands off to each location's official Toast page).

## Notes

- Prices/items transcribed from the posted Castro Valley menu (July 2026) — each location's live Toast menu governs.
- Rewards ladder values are **samples** for the demo.
- All state (points, badges, cart) is stored locally in the browser (`localStorage`).
