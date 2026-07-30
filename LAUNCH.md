# Castro Valley soft launch — runbook

Pilot: **Castro Valley only**, invited guests only, no SMS verification.
Read "What this launch is not" at the bottom before opening it up wider.

A baseline was measured from the Toast API on 29 Jul 2026 — order volume,
average ticket, phone-attach rate and weekly repeat rate — so you can tell
later whether any of this worked.

**Those figures live in `LAUNCH.local.md`, which is gitignored.** This
repository is public, and orders/day multiplied by average ticket is the
location's revenue. Keep operating numbers out of it.

---

## 0. What this costs, and why there's a server at all

**Cost: $0.** Everything below fits inside Cloudflare's free plan, with room:

| | Free allowance | What we actually use |
|---|---|---|
| Worker requests | 100,000/day | ~1,500/day (cron + guests opening the app) |
| Cron triggers | 5 | 1 |
| Durable Object writes | ~3M/month | ~20k/month (cursors + credits) |
| DO SQLite storage | 5 GB, not billed on free | kilobytes |
| KV writes | **1,000/day** | a few — one per redemption |

That KV row is the tight one, which is why the sync cursors live in a
Durable Object instead. Writing them to KV would have burned 288/day per
location and broken at the third restaurant.

**Why a server is not optional:** the Toast credentials cannot go in the
browser — anyone could read them and pull every customer's order history.
And the moment the ledger runs client-side, points are forgeable again.
Any host would do; Cloudflare is chosen because the free tier covers a
real workload and cron is included.

## 1. Before you start

You need:

- A **Cloudflare account** (free plan is enough) and `npm i -g wrangler`
- Toast Standard API credentials — you already have these in `.env`
- A list of **phone numbers to enrol** (staff, family, regulars who agree)
- 20 minutes

---

## 2. Deploy the backend

```bash
cd backend
wrangler kv namespace create VOUCHER_INDEX
```

Paste the returned id into `wrangler.toml` under `[[kv_namespaces]]`, then:

```bash
wrangler secret put TOAST_SOCO_CLIENT_ID
wrangler secret put TOAST_SOCO_CLIENT_SECRET
wrangler secret put STAFF_TOKEN_SOCO
wrangler secret put ADMIN_TOKEN_SOCO
wrangler deploy
```

Use long random values for the two tokens — e.g. `openssl rand -hex 24`.
The staff token goes to the counter. The admin token stays with you.

Confirm it's alive (replace with your deployed URL):

```bash
curl https://restaurant-rewards.<you>.workers.dev/api/v1/soco/health
```

You want `"ok": true` and `"cv": true`.

---

## 3. Enrol your pilot guests

Edit `backend/tenants.json` → `allowlist`, 10 digits, no punctuation:

```json
"allowlist": ["5105550134", "5105550199", "5109876543"]
```

Then `wrangler deploy` again.

**This is the security boundary for the whole pilot.** There is no SMS
verification, so a phone number is the only thing identifying a guest. An
unenrolled number earns nothing and can redeem nothing, which means
guessing a number gains an attacker nothing unless it is already on this
list. Keep it short and keep it people you can phone.

`[]` means nobody. That is the safe default and it is what ships.

---

## 4. Optional: credit past spend

The cron starts from now, so enrolled guests begin at zero. To give them
credit for history instead:

```bash
python3 backend/backfill.py --tenant soco --days 90 --dry-run
```

Read what it says. Then, to actually write:

```bash
python3 backend/backfill.py --tenant soco --days 90 \
  --url https://restaurant-rewards.<you>.workers.dev \
  --admin-token "<ADMIN_TOKEN_SOCO>"
```

Only enrolled numbers are credited, so **enrol first, then backfill.**

Worth a thought: starting everyone at zero is cleaner and avoids "why do I
have 4,000 points already?" A middle path is 30 days rather than 90.

---

## 5. Point the app at the backend

In `tenants/soco/config.js`:

```js
T.LIVE_API = "https://restaurant-rewards.<you>.workers.dev";
```

Commit and push; GitHub Pages serves it at
`https://saviones.github.io/soco-kitchen-app/`.

If `origins` in `tenants.json` doesn't list the domain the app is served
from, the browser will block every call. It currently lists
`https://saviones.github.io`.

---

## 6. Set up the counter

Staff open **`https://saviones.github.io/soco-kitchen-app/staff/`**, tap
Settings once and enter:

- Backend URL — your worker URL
- Restaurant id — `soco`
- Staff token — `STAFF_TOKEN_SOCO`
- Their name — appears on the redemption record

It remembers this. Bookmark it on the till tablet.

**The rule for staff, in one line:** if the screen doesn't say **Valid** in
green, don't give anything away.

- **Valid** → hand over the item, tap "Give the item & mark redeemed"
- **Already redeemed** → politely refuse; it shows who redeemed it and when
- **No such code** → typo, or not real. Codes never contain 0, O, 1, I or L
- **Expired** → past 60 days; your call, but the system says no

Tap *before* handing the item over, not after.

---

## 7. Week one

Check the sync is running:

```bash
wrangler tail
```

You want a `[sync]` line every 5 minutes with a small `credited` count.

Things that would tell you something is wrong:

- `credited` always 0 during service → check the allowlist, or nobody is
  giving their phone at the till
- `error` lines mentioning Toast → credential or rate-limit problem
- A guest saying their points are missing → they probably didn't give their
  phone number at the counter. That's the 49% problem below.

**Points appear ~90 minutes after a visit, not instantly.** That is
deliberate — Toast reports a check the moment it opens, and crediting one
mid-meal would bank a fraction of the ticket that could never be corrected.
Tell staff this so they don't chase a "bug".

---

## 8. The biggest lever isn't code

**Only about half your checks carry a phone number** (exact figure in
`LAUNCH.local.md`). Those orders earn nothing, and no amount of
engineering fixes it from this side — it is a question staff ask, or
don't. If the pilot works, the single highest-value change is the till
prompt, not the app.

---

## 9. If you need to stop

Fastest kill switch, no deploy needed — set in `tenants.json` and deploy:

```json
"rewardsEnabled": false
```

The reward ladder disappears from the app and redemptions are refused.
Already-issued vouchers still validate at the counter, so nobody is left
holding something worthless.

To pause earning entirely, remove the `[triggers]` block and redeploy.

Balances and vouchers live in Durable Objects and survive all of this.

---

## Adding restaurant #2 (and #3, and #20)

**You do not repeat any of the above.** Sections 2–6 are a one-time setup
for the platform, not per customer. One worker serves every restaurant.

Onboarding a new one is:

1. Add an entry to `backend/tenants.json` — their Toast location GUIDs,
   earn rate, reward ladder, allowlist, and the names of their secrets
2. `wrangler secret put TOAST_<NAME>_CLIENT_ID` (and secret, staff token,
   admin token) using the credentials they generate in their own Toast Web
3. Copy `tenants/soco/` to `tenants/<name>/` and change the branding, menu
   and colours
4. `wrangler deploy`

No new account, no new infrastructure, no code changes. Their data is
scoped by tenant id at every route, cache and ledger key, and a voucher
issued by one restaurant cannot be looked up or burned by another.

The realistic per-customer work is almost entirely the *content* — their
menu, photos and reward ladder — not the plumbing.

One thing that does scale with customers: each restaurant must generate
their own Toast Standard API credentials from their own Toast account and
give them to you. That is a conversation, not a technical step, and it is
also the moment they are agreeing to let you read their order data.

## What this launch is not

- **Identity is a phone number on the allowlist — nothing more.** There is
  no SMS verification, by design: the pilot runs with people you chose and
  can phone. The allowlist is what makes that work, so the security of the
  programme is exactly the security of that list.

  The one change that alters this: setting `allowlist` to `null` opens
  enrolment to anyone. At that point "people we know" stops being the
  boundary and any visitor can type any number. If you go there, add a
  verification step first.
- **One location.** Alameda has credentials and would work, but the pilot
  is deliberately Castro Valley only.
- **Staff share one token.** A redemption is attributed to whatever name
  the person typed in Settings, which is a label, not proof.
- **Quest points are not money.** Manually logging dishes ranks you up and
  fills the streetcar map. Only real Toast orders buy food. The app says
  this in the Rewards screen; make sure staff can say it too.
