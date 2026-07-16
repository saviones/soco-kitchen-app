# SoCo Kitchen — the Southern Comfort Kitchen phone app

A mobile app prototype for **Southern Comfort Kitchen** (socokitchen.net) — real menu,
real photos, real locations, real Toast ordering links, plus a mini-game that turns
eating through the whole menu into a quest.

## 📱 Try it right now

**Live app: https://savvi111.github.io/soco-kitchen-app/**

- On your **phone**: open the link, then "Add to Home Screen" — it installs like a real app and works offline.
- On a **desktop**: same link, it renders inside a phone frame.

## Run it locally

Clone or [download ZIP](https://github.com/savvi111/soco-kitchen-app/archive/refs/heads/main.zip), then
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

The demo simulates the loop locally. The production path:

1. All 4 locations already run on Toast.
2. Enroll in the **Toast API partner program** (or Toast Loyalty) to receive order webhooks.
3. A completed order fires a webhook → a small SoCo backend matches the guest phone number → points post to the app.
4. In-app ordering (not just handoff) is also possible via the Toast Orders API once partner access is granted.

## Notes

- Prices/items transcribed from the posted Castro Valley menu (July 2026) — each location's live Toast menu governs.
- Rewards ladder values are **samples** for the demo.
- All state (points, badges, cart) is stored locally in the browser (`localStorage`).
