/* ============================================================
   Restaurant rewards backend — multi-tenant Toast proxy + ledger
   ------------------------------------------------------------
   Guest routes (tenant-scoped):
     GET  /api/v1/:tenant/health
     GET  /api/v1/:tenant/locations           live hours/phone
     GET  /api/v1/:tenant/menu?loc=cv         online-ordering menu
     GET  /api/v1/:tenant/rewards             ladder (server priced)
     GET  /api/v1/:tenant/balance?phone=##…   earned / spent / spendable
     POST /api/v1/:tenant/redeem              { phone, rewardId } -> voucher

   Staff routes (X-Staff-Token):
     GET  /api/v1/:tenant/voucher/:code
     POST /api/v1/:tenant/voucher/:code/burn

   Admin routes (X-Admin-Token):
     POST /api/v1/:tenant/admin/credit        historical backfill
     GET  /api/v1/:tenant/admin/sync          run a sync pass now

   POINTS ARE PUSHED, NOT PULLED
   scheduled() walks a per-location cursor forward through Toast and
   credits each guest's Durable Object. Balance reads then touch
   nothing but that object. The earlier design scanned Toast on demand,
   which needed ~131 subrequests for a 90-day window at Castro Valley's
   measured order volume against Cloudflare's cap of 50, and put
   a Toast round-trip in front of every guest opening the app.

   Bindings (wrangler.toml):
     Durable Object  MEMBER_LEDGER -> class MemberLedger
     Durable Object  SYNC_STATE    -> class SyncState (cron cursors)
     KV namespace    VOUCHER_INDEX  (voucher code -> owner)
   ============================================================ */

import { getTenant, tenantCredentials, rewardById, staffToken, adminToken } from "./tenants.js";
import { MemberLedger, SyncState, pointsForItems, memberKey } from "./lib/ledger.js";

export { MemberLedger, SyncState };

const MENU_TTL_MS = 10 * 60 * 1000;
const LOCATIONS_TTL_MS = 30 * 60 * 1000;
const TOKEN_SKEW_S = 120;

/* Sync budget, per location, per cron run.
   Cloudflare's free plan allows 50 subrequests per invocation, and both
   a Toast page fetch and a member write cost one — so the real constraint
   is their sum, which is what OPS_BUDGET caps. 35 leaves headroom for the
   auth call and the cursor write, and for a window overshooting slightly
   at the floor size. Raise it to a few hundred on a paid plan; catch-up
   after downtime then takes fewer passes.

   In steady state none of this is approached: a 5-minute window is a
   handful of orders across a few guests. */
const OPS_BUDGET = 35;
const SYNC_WINDOW_MS = 6 * 3600 * 1000;   // max time advanced per pass
const SYNC_MIN_WINDOW_MS = 15 * 60 * 1000;

/* Let checks settle before crediting them.
   Toast returns a check as soon as it opens, with only the selections rung
   in so far. Crediting one mid-meal would bank a fraction of the ticket,
   and because credits dedup by check id the correction could never land —
   a guest running a $60 dinner would be paid for the $15 appetizer. So the
   sync stays this far behind live and skips anything not yet closed. The
   cost is that points appear ~90 minutes after a visit rather than
   instantly, which is a much better trade than a wrong balance. */
const SYNC_SETTLE_MS = 90 * 60 * 1000;

/* Re-read a little before the cursor so a check that was still open on the
   last pass gets picked up once closed. Credits dedup by check id, so
   re-reading already-credited checks is harmless. */
const SYNC_OVERLAP_MS = 30 * 60 * 1000;

const cache = { tokens: {}, menus: {}, locations: {} };

/* ---------------- http helpers ---------------- */

function corsHeaders(request, tenant) {
  const origin = request.headers.get("Origin") || "";
  const allowed = (tenant && tenant.origins) || [];
  const ok = allowed.includes(origin) ||
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : (allowed[0] || "null"),
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Staff-Token, X-Admin-Token",
    "Vary": "Origin",
  };
}

function json(data, request, status = 200, tenant = null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request, tenant) },
  });
}

const normalizePhone = p => (p || "").replace(/\D/g, "").slice(-10);
const validPhone = p => /^\d{10}$/.test(p);

function unauthorized(msg) {
  const e = new Error(msg || "unauthorized");
  e.status = 401;
  return e;
}

function requireToken(request, header, expected, label) {
  if (!expected) throw new Error(`${label} not configured`);
  if ((request.headers.get(header) || "") !== expected) throw unauthorized();
}

/* ---- soft-launch allowlist ----
   Launch runs without SMS verification, so a phone number is the only
   thing identifying a guest. The allowlist makes "staff and regulars we
   know" an enforced boundary: an unenrolled number earns nothing and can
   redeem nothing, so guessing someone's number gains an attacker nothing
   unless that number is already enrolled. Set allowlist to null to open
   the programme to everyone — do that only once OTP is in place. */
function allowed(tenant, phone) {
  if (!tenant.allowlist) return true;
  return tenant.allowlist.includes(phone);
}

/* ---------------- Toast API ---------------- */

async function getToken(tenant, env) {
  const hit = cache.tokens[tenant.id];
  if (hit && hit.exp > Date.now()) return hit.value;

  const { clientId, clientSecret } = tenantCredentials(tenant, env);
  const res = await fetch(`${env.TOAST_API_HOST}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret, userAccessType: "TOAST_MACHINE_CLIENT" }),
  });
  if (!res.ok) throw new Error(`Toast auth failed for ${tenant.id}: ${res.status}`);
  const tok = (await res.json()).token;
  cache.tokens[tenant.id] = {
    value: tok.accessToken,
    exp: Date.now() + (tok.expiresIn - TOKEN_SKEW_S) * 1000,
  };
  return cache.tokens[tenant.id].value;
}

async function toastGet(tenant, env, path, guid, retries = 5) {
  const token = await getToken(tenant, env);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${env.TOAST_API_HOST}${path}`, {
      headers: { Authorization: `Bearer ${token}`, "Toast-Restaurant-External-ID": guid },
    });
    if (res.status === 429 && attempt < retries - 1) {
      const retryAfter = Number(res.headers.get("Retry-After"));
      await new Promise(r => setTimeout(r, (retryAfter || 0.7 * 2 ** attempt) * 1000));
      continue;
    }
    if (!res.ok) throw new Error(`Toast ${path} -> ${res.status}`);
    return res.json();
  }
}

const liveLocations = tenant =>
  Object.entries(tenant.locations).filter(([, guid]) => !!guid);

/* ---------------- locations & menu ---------------- */

const toMin = t => { const [h, m] = t.split(":"); return +h * 60 + +m; };
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function handleLocations(tenant, env, request) {
  const hit = cache.locations[tenant.id];
  if (hit && hit.exp > Date.now()) return json(hit.value, request, 200, tenant);

  const out = {};
  for (const [loc, guid] of liveLocations(tenant)) {
    const r = await toastGet(tenant, env, `/restaurants/v1/restaurants/${guid}`, guid);
    const day = WEEK.map(d => {
      const sched = r.schedules?.daySchedules?.[r.schedules?.weekSchedule?.[d]];
      if (!sched || !sched.openTime || !sched.closeTime) return null;
      const open = toMin(sched.openTime);
      let close = toMin(sched.closeTime);
      if (close <= open) close = 1439; // overnight schedule — cap at midnight for the app's day model
      return [open, close];
    });
    out[loc] = {
      name: r.general?.name,
      phone: r.location?.phone || null,
      hours: day,
      orderUrl: r.urls?.orderOnline || null,
    };
  }
  cache.locations[tenant.id] = { value: out, exp: Date.now() + LOCATIONS_TTL_MS };
  return json(out, request, 200, tenant);
}

async function handleMenu(tenant, env, request, loc) {
  const guid = tenant.locations[loc];
  if (!guid) return json({ error: "location not live" }, request, 404, tenant);

  const key = `${tenant.id}:${loc}`;
  const hit = cache.menus[key];
  if (hit && hit.exp > Date.now()) return json(hit.value, request, 200, tenant);

  const data = await toastGet(tenant, env, "/menus/v2/menus", guid);
  /* the online-ordering menu is the one guests see; skip catering + delivery-app menus */
  const menu = data.menus.find(m => (m.visibility || []).includes("TOAST_ONLINE_ORDERING")) || data.menus[0];
  const items = [];
  (function walk(groups) {
    for (const g of groups || []) {
      for (const it of g.menuItems || []) items.push({ name: it.name, price: it.price ?? null, guid: it.guid });
      walk(g.menuGroups);
    }
  })(menu.menuGroups);

  const value = { lastUpdated: data.lastUpdated, menuName: menu.name, items };
  cache.menus[key] = { value, exp: Date.now() + MENU_TTL_MS };
  return json(value, request, 200, tenant);
}

/* ---------------- ledger plumbing ---------------- */

function ledgerStub(tenant, env, phone) {
  const id = env.MEMBER_LEDGER.idFromName(memberKey(tenant.id, phone));
  return env.MEMBER_LEDGER.get(id);
}

const callLedger = (stub, path, body) =>
  stub.fetch(`https://ledger${path}`, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  }).then(r => r.json());

/* ---------------- cron sync ----------------
   Walks a cursor forward per location and pushes points into member
   ledgers. Runs the same way for the first catch-up pass and for
   steady state; it simply has more ground to cover the first time. */

/* Cursors live in a Durable Object, not KV — the cron writes one every
   pass and KV only allows 1,000 writes/day on the free plan. */
function syncStub(tenant, env) {
  return env.SYNC_STATE.get(env.SYNC_STATE.idFromName(tenant.id));
}

async function readCursor(tenant, env, loc) {
  const r = await syncStub(tenant, env).fetch(`https://sync/?loc=${encodeURIComponent(loc)}`);
  return (await r.json()).cursor;
}

async function writeCursor(tenant, env, loc, cursor) {
  await syncStub(tenant, env).fetch(`https://sync/?loc=${encodeURIComponent(loc)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cursor }),
  });
}

function checksToOrders(rows, tenant, loc) {
  const byPhone = new Map();
  for (const o of rows) {
    if (o.voided || o.deleted) continue;
    for (const c of o.checks || []) {
      if (c.voided || c.deleted) continue;
      /* still being rung in — its total is not final yet */
      if (!c.closedDate && !c.paidDate && !o.closedDate) continue;
      const phone = normalizePhone(c.customer?.phone);
      if (!validPhone(phone)) continue;
      if (!allowed(tenant, phone)) continue;
      const items = (c.selections || [])
        .filter(s => !s.voided && s.displayName)
        .map(s => ({ name: s.displayName, price: s.price ?? null }));
      if (!items.length) continue;
      const entry = {
        guid: c.guid || o.guid,
        ts: o.openedDate,
        loc,
        points: pointsForItems(items, tenant.pointsPerDollar),
        names: items.map(i => i.name).slice(0, 6),
      };
      if (!byPhone.has(phone)) byPhone.set(phone, []);
      byPhone.get(phone).push(entry);
    }
  }
  return byPhone;
}

async function syncLocation(tenant, env, loc, guid, wallClock = Date.now()) {
  const now = wallClock - SYNC_SETTLE_MS;   // never sync right up to live
  const stored = await readCursor(tenant, env, loc);
  /* first ever run starts at the settle horizon — history is imported
     separately by backend/backfill.py, which has no subrequest ceiling */
  let cursor = stored ? Number(stored) : now;

  let ops = 0, pages = 0, members = 0, credited = 0;
  let windowMs = SYNC_WINDOW_MS;
  const iso = ms => new Date(ms).toISOString().replace("Z", "-0000");

  while (cursor < now && ops < OPS_BUDGET) {
    const windowEnd = Math.min(cursor + windowMs, now);
    const windowStart = Math.max(0, cursor - SYNC_OVERLAP_MS);

    const rows = [];
    for (let page = 1; ops < OPS_BUDGET; page++) {
      const q = `startDate=${encodeURIComponent(iso(windowStart))}` +
                `&endDate=${encodeURIComponent(iso(windowEnd))}&page=${page}&pageSize=100`;
      const batch = await toastGet(tenant, env, `/orders/v2/ordersBulk?${q}`, guid);
      pages++; ops++;
      rows.push(...batch);
      if (batch.length < 100) break;
    }

    const byPhone = checksToOrders(rows, tenant, loc);

    /* A window too busy for the remaining budget must shrink, not stall.
       An earlier version refused to advance past a window it could not
       drain, so a catch-up after downtime looped on it forever. Shrinking
       guarantees forward progress — at Castro Valley's ~3 identified
       identified guests per hour the floor window always fits. Below it we
       accept the overshoot rather than risk never advancing; credits are
       idempotent, so the worst case is a repeated window, never a
       double payment. */
    if (ops + byPhone.size > OPS_BUDGET && windowMs > SYNC_MIN_WINDOW_MS) {
      windowMs = Math.max(SYNC_MIN_WINDOW_MS, Math.floor(windowMs / 4));
      continue;
    }

    for (const [phone, orders] of byPhone) {
      const res = await callLedger(ledgerStub(tenant, env, phone), "/credit", { orders });
      members++; ops++;
      credited += res.credited || 0;
    }
    cursor = windowEnd;
  }

  await writeCursor(tenant, env, loc, cursor);
  return { loc, pages, members, credited, cursor };
}

async function syncTenant(tenant, env) {
  const out = [];
  for (const [loc, guid] of liveLocations(tenant)) {
    try {
      out.push(await syncLocation(tenant, env, loc, guid));
    } catch (e) {
      out.push({ loc, error: String(e.message || e) });
    }
  }
  return out;
}

/* ---------------- guest routes ---------------- */

async function handleBalance(tenant, env, request, phone) {
  if (!allowed(tenant, phone)) {
    return json({ error: "not_enrolled",
      message: "This number isn't in the rewards programme yet — ask at the counter." },
      request, 403, tenant);
  }
  const state = await callLedger(ledgerStub(tenant, env, phone), "/state");
  return json(state, request, 200, tenant);
}

async function handleRedeem(tenant, env, request) {
  const body = await request.json().catch(() => ({}));
  const phone = normalizePhone(body.phone);
  if (!validPhone(phone)) return json({ error: "phone must be 10 digits" }, request, 400, tenant);
  if (!tenant.rewardsEnabled) return json({ error: "rewards disabled for this tenant" }, request, 403, tenant);
  if (!allowed(tenant, phone)) {
    return json({ error: "not_enrolled",
      message: "This number isn't in the rewards programme yet — ask at the counter." },
      request, 403, tenant);
  }

  /* price the reward from the server's own table — never from the client */
  const reward = rewardById(tenant, body.rewardId);
  if (!reward) return json({ error: "unknown reward" }, request, 400, tenant);

  const result = await callLedger(ledgerStub(tenant, env, phone), "/redeem", {
    reward,
    prefix: tenant.codePrefix || tenant.id.toUpperCase(),
    ttlDays: tenant.voucherTtlDays,
  });
  if (!result.ok) return json(result, request, 409, tenant);

  /* index the code so staff can look it up without knowing the phone */
  await env.VOUCHER_INDEX.put(result.voucher.code, memberKey(tenant.id, phone), {
    expirationTtl: Math.ceil((tenant.voucherTtlDays + 30) * 86400),
  });
  return json(result, request, 200, tenant);
}

/* ---------------- staff routes ---------------- */

async function resolveVoucher(tenant, env, code) {
  const owner = await env.VOUCHER_INDEX.get(code);
  if (!owner) return null;
  const [tenantId, phone] = owner.split(":");
  if (tenantId !== tenant.id) return null;   // never cross tenants
  return { phone };
}

async function handleVoucherLookup(tenant, env, request, code) {
  const found = await resolveVoucher(tenant, env, code);
  if (!found) return json({ ok: false, reason: "not_found" }, request, 404, tenant);
  const state = await callLedger(ledgerStub(tenant, env, found.phone), "/state");
  const voucher = (state.vouchers || []).find(v => v.code === code);
  if (!voucher) return json({ ok: false, reason: "not_found" }, request, 404, tenant);
  return json({ ok: true, voucher, phone: `•••-•••-${found.phone.slice(-4)}` }, request, 200, tenant);
}

async function handleVoucherBurn(tenant, env, request, code) {
  const body = await request.json().catch(() => ({}));
  const found = await resolveVoucher(tenant, env, code);
  if (!found) return json({ ok: false, reason: "not_found" }, request, 404, tenant);
  const result = await callLedger(ledgerStub(tenant, env, found.phone), "/burn", {
    code, staff: body.staff,
  });
  return json(result, request, result.ok ? 200 : 409, tenant);
}

/* ---------------- admin routes ---------------- */

/* Bulk credit, used by backend/backfill.py to import order history.
   body: { members: { "<phone>": [ {guid, ts, loc, points, names} ] } } */
async function handleAdminCredit(tenant, env, request) {
  const body = await request.json().catch(() => ({}));
  const members = body.members || {};
  const out = { members: 0, credited: 0, skipped: [] };
  for (const [raw, orders] of Object.entries(members)) {
    const phone = normalizePhone(raw);
    if (!validPhone(phone)) continue;
    if (!allowed(tenant, phone)) { out.skipped.push(phone); continue; }
    const res = await callLedger(ledgerStub(tenant, env, phone), "/credit", { orders });
    out.members++;
    out.credited += res.credited || 0;
  }
  return json(out, request, 200, tenant);
}

/* ---------------- router ---------------- */

export default {
  async scheduled(event, env, ctx) {
    const { TENANTS } = await import("./tenants.js");
    for (const tenant of Object.values(TENANTS)) {
      ctx.waitUntil(syncTenant(tenant, env).then(r =>
        console.log(`[sync] ${tenant.id}`, JSON.stringify(r))));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").filter(Boolean);   // api, v1, :tenant, ...
    const tenant = parts[0] === "api" && parts[1] === "v1" ? getTenant(parts[2]) : null;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request, tenant) });
    }
    if (parts[0] !== "api" || parts[1] !== "v1") return json({ error: "not found" }, request, 404);
    if (!tenant) return json({ error: "unknown tenant" }, request, 404);

    const route = parts.slice(3);
    const isGet = request.method === "GET";
    const isPost = request.method === "POST";

    try {
      if (route[0] === "health" && isGet) {
        return json({
          ok: true,
          tenant: tenant.id,
          name: tenant.name,
          live: Object.fromEntries(Object.entries(tenant.locations).map(([k, v]) => [k, !!v])),
          rewardsEnabled: !!tenant.rewardsEnabled,
          enrollmentOpen: !tenant.allowlist,
        }, request, 200, tenant);
      }

      if (route[0] === "locations" && isGet) return handleLocations(tenant, env, request);

      if (route[0] === "menu" && isGet) {
        return handleMenu(tenant, env, request, url.searchParams.get("loc") || Object.keys(tenant.locations)[0]);
      }

      if (route[0] === "rewards" && isGet) {
        return json({ enabled: !!tenant.rewardsEnabled, rewards: tenant.rewards || [] }, request, 200, tenant);
      }

      if (route[0] === "balance" && isGet) {
        const phone = normalizePhone(url.searchParams.get("phone"));
        if (!validPhone(phone)) return json({ error: "phone must be 10 digits" }, request, 400, tenant);
        return handleBalance(tenant, env, request, phone);
      }

      if (route[0] === "redeem" && isPost) return handleRedeem(tenant, env, request);

      if (route[0] === "voucher" && route[1]) {
        requireToken(request, "X-Staff-Token", staffToken(tenant, env), "staff token");
        const code = decodeURIComponent(route[1]).toUpperCase();
        if (route[2] === "burn" && isPost) return handleVoucherBurn(tenant, env, request, code);
        if (!route[2] && isGet) return handleVoucherLookup(tenant, env, request, code);
      }

      if (route[0] === "admin" && route[1]) {
        requireToken(request, "X-Admin-Token", adminToken(tenant, env), "admin token");
        if (route[1] === "credit" && isPost) return handleAdminCredit(tenant, env, request);
        if (route[1] === "sync" && isGet) {
          return json({ ok: true, result: await syncTenant(tenant, env) }, request, 200, tenant);
        }
      }

      return json({ error: "not found" }, request, 404, tenant);
    } catch (e) {
      return json({ error: String(e.message || e) }, request, e.status || 502, tenant);
    }
  },
};
