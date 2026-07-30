/* ============================================================
   Member ledger — server-authoritative points & vouchers
   ------------------------------------------------------------
   WHY THIS EXISTS
   Points used to live in localStorage and voucher codes were made
   with Math.random() in the browser, so a guest could set
   Store.state.points = 999999 and hand the counter a code that
   looked exactly like a real one. Fine for a demo; unacceptable
   once staff honour codes.

   Now every number that can buy food lives here:
     - Points are credited by a cron that reads real Toast orders.
       The client never asserts a balance.
     - Voucher codes are issued server-side with a CSPRNG and
       recorded before anyone sees them.
     - Crediting, redeeming and burning all run inside a Durable
       Object, so concurrent requests cannot double-credit,
       double-spend or double-burn.

   WHY EARNED POINTS ARE STORED, NOT COMPUTED
   Deriving the balance by scanning Toast on demand needed ~131
   subrequests for a 90-day window at Castro Valley's measured order
   volume against Cloudflare's cap of 50, and it put a
   Toast round-trip in front of every guest opening the app. A cron
   now pushes new orders in (see scheduled() in worker.js) and a
   balance read touches nothing but this object.

   TWO CURRENCIES, DELIBERATELY
   The quest game still awards local "quest points" for manually
   logging dishes — self-reported, so they stay on the device and
   buy nothing. Only points credited from real Toast orders spend.
   ============================================================ */

/* Unambiguous alphabet: no 0/O/1/I/L — these get read aloud and
   hand-typed by staff at a noisy counter. */
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

/* How many recent order ids to remember for dedup. The cron cursor
   only moves forward, so this only has to cover a replayed window
   after a failure — it does not need to be unbounded. */
const SEEN_CAP = 2000;

export function generateCode(prefix = "SOCO") {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, b => ALPHABET[b % ALPHABET.length]);
  return `${prefix}-${chars.slice(0, 4).join("")}-${chars.slice(4).join("")}`;
}

export const memberKey = (tenantId, phone) => `${tenantId}:${phone}`;

/* Points for one Toast check. Kept here so the cron and any future
   backfill agree on the earn rule. */
export function pointsForItems(items, pointsPerDollar) {
  let total = 0;
  for (const it of items || []) {
    if (typeof it.price === "number" && it.price > 0) {
      total += Math.round(it.price * pointsPerDollar);
    }
  }
  return total;
}

/* ---------------------------------------------------------------
   Durable Object: one instance per tenant, holding the sync cursors.

   These live here rather than in KV because the cron writes a cursor
   every pass: at a 5-minute schedule that is 288 writes per location
   per day, and Workers KV allows 1,000 writes/day on the free plan.
   Two locations already burn half of it and a third restaurant would
   break it outright. Durable Object storage allows ~3M writes/month
   free, so the same traffic is a rounding error.
   --------------------------------------------------------------- */
export class SyncState {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const key = url.searchParams.get("loc") || "default";
    if (request.method === "POST") {
      const { cursor } = await request.json();
      await this.state.storage.put(`cursor:${key}`, cursor);
      return new Response(JSON.stringify({ ok: true }),
        { headers: { "Content-Type": "application/json" } });
    }
    const cursor = await this.state.storage.get(`cursor:${key}`);
    return new Response(JSON.stringify({ cursor: cursor ?? null }),
      { headers: { "Content-Type": "application/json" } });
  }
}

/* ---------------------------------------------------------------
   Durable Object: one instance per (tenant, phone).
   Serialises every write for that member, which is what makes
   check-then-deduct a single atomic step.
   --------------------------------------------------------------- */
export class MemberLedger {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const url = new URL(request.url);
    const body = request.method === "POST" ? await request.json() : {};
    try {
      switch (url.pathname) {
        case "/state":  return this.json(await this.summary());
        case "/credit": return this.json(await this.credit(body));
        case "/redeem": return this.json(await this.redeem(body));
        case "/burn":   return this.json(await this.burn(body));
        default:        return this.json({ error: "not found" }, 404);
      }
    } catch (e) {
      return this.json({ error: String(e.message || e) }, 400);
    }
  }

  json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status, headers: { "Content-Type": "application/json" },
    });
  }

  async load() {
    const [earned, spent, vouchers, seen, orders] = await Promise.all([
      this.state.storage.get("earned"),
      this.state.storage.get("spent"),
      this.state.storage.get("vouchers"),
      this.state.storage.get("seen"),
      this.state.storage.get("orders"),
    ]);
    return {
      earned: earned || 0,
      spent: spent || 0,
      vouchers: vouchers || {},
      seen: seen || {},
      orders: orders || [],
    };
  }

  async summary() {
    const { earned, spent, vouchers, orders } = await this.load();
    return {
      earned,
      spent,
      balance: Math.max(0, earned - spent),
      orderCount: orders.length,
      orders: orders.slice(-25),
      vouchers: Object.values(vouchers).sort((a, b) => b.issuedAt - a.issuedAt),
    };
  }

  /* Credit points from Toast orders. Idempotent by order id, so a
     replayed cron window cannot pay a guest twice.
     body: { orders: [{ guid, ts, loc, points, names }] } */
  async credit({ orders: incoming }) {
    if (!Array.isArray(incoming) || !incoming.length) return { ok: true, credited: 0, added: 0 };
    const { earned, seen, orders } = await this.load();

    let added = 0, credited = 0;
    for (const o of incoming) {
      if (!o.guid || seen[o.guid]) continue;
      seen[o.guid] = 1;
      added += o.points || 0;
      credited++;
      orders.push({ guid: o.guid, ts: o.ts, loc: o.loc, points: o.points, names: o.names || [] });
    }
    if (!credited) return { ok: true, credited: 0, added: 0 };

    /* keep both lists bounded — a regular over a few years would
       otherwise grow this object without limit */
    const seenKeys = Object.keys(seen);
    const trimmedSeen = seenKeys.length > SEEN_CAP
      ? Object.fromEntries(seenKeys.slice(-SEEN_CAP).map(k => [k, 1]))
      : seen;

    await this.state.storage.put({
      earned: earned + added,
      seen: trimmedSeen,
      orders: orders.slice(-100),
    });
    return { ok: true, credited, added, earned: earned + added };
  }

  /* body: { reward:{id,cost,name,icon}, prefix, ttlDays } */
  async redeem({ reward, prefix, ttlDays = 60 }) {
    if (!reward || typeof reward.cost !== "number") throw new Error("reward required");
    const { earned, spent, vouchers } = await this.load();
    const balance = earned - spent;
    if (balance < reward.cost) {
      return { ok: false, reason: "insufficient_points", balance, cost: reward.cost };
    }

    const now = Date.now();
    const voucher = {
      code: generateCode(prefix),
      rewardId: reward.id,
      name: reward.name,
      icon: reward.icon,
      cost: reward.cost,
      issuedAt: now,
      expiresAt: now + ttlDays * 86400000,
      status: "issued",
      burnedAt: null,
      burnedBy: null,
    };

    vouchers[voucher.code] = voucher;
    /* one transaction: the deduction and the voucher land together
       or not at all */
    await this.state.storage.put({ spent: spent + reward.cost, vouchers });

    return { ok: true, voucher, balance: balance - reward.cost };
  }

  /* body: { code, staff } — idempotent: burning an already-burned
     voucher reports the original burn rather than burning twice. */
  async burn({ code, staff }) {
    const { vouchers } = await this.load();
    const v = vouchers[code];
    if (!v) return { ok: false, reason: "not_found" };

    if (v.status === "burned") {
      return { ok: false, reason: "already_redeemed", voucher: v };
    }
    if (Date.now() > v.expiresAt) {
      v.status = "expired";
      await this.state.storage.put("vouchers", vouchers);
      return { ok: false, reason: "expired", voucher: v };
    }

    v.status = "burned";
    v.burnedAt = Date.now();
    v.burnedBy = staff || "counter";
    await this.state.storage.put("vouchers", vouchers);
    return { ok: true, voucher: v };
  }
}
