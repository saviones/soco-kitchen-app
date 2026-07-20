/* ============================================================
   SoCo Kitchen — Toast API proxy
   ------------------------------------------------------------
   Holds the Toast Standard-API credentials (read-only) and
   exposes the minimum the app needs:

     GET /api/health              -> which locations are live
     GET /api/locations           -> live hours/phone per location
     GET /api/menu?loc=cv         -> online-ordering menu (name/price)
     GET /api/orders?phone=##########  -> recent orders for that phone
                                        (items + dates only, no PII)

   Runs two ways with the same code:
     - Cloudflare Worker (deploy: wrangler deploy, secrets via
       `wrangler secret put TOAST_CLIENT_ID` / `TOAST_CLIENT_SECRET`)
     - Local dev: `node backend/dev-server.mjs` (reads ../.env)
   ============================================================ */

/* Toast restaurant GUIDs per app location id (not secret — they appear
   in public Toast ordering URLs). ph/sj are not in this credential set yet. */
const TOAST_LOCATIONS = {
  cv: "70015dc4-f626-4a4b-b15a-30c341b4e6c0",
  al: "edfb0ad7-5a52-4a19-8f2c-c80a1d427bce",
  ph: null,
  sj: null,
};

const ORDER_LOOKBACK_DAYS = 14;
const MENU_TTL_MS = 10 * 60 * 1000;
const LOCATIONS_TTL_MS = 30 * 60 * 1000;
const ORDERS_TTL_MS = 60 * 1000;

const ALLOWED_ORIGINS = [
  "https://saviones.github.io",
  "http://localhost:8737",
  "http://127.0.0.1:8737",
];

/* module-level caches survive between requests in a worker isolate */
const cache = { token: null, menus: {}, locations: null, orders: {} };

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const ok = ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": ok ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

function json(data, request, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

async function getToken(env) {
  if (cache.token && cache.token.exp > Date.now()) return cache.token.value;
  const res = await fetch(`${env.TOAST_API_HOST}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: env.TOAST_CLIENT_ID,
      clientSecret: env.TOAST_CLIENT_SECRET,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });
  if (!res.ok) throw new Error(`Toast auth failed: ${res.status}`);
  const body = await res.json();
  const tok = body.token;
  cache.token = { value: tok.accessToken, exp: Date.now() + (tok.expiresIn - 120) * 1000 };
  return cache.token.value;
}

async function toastGet(env, path, guid, retries = 5) {
  const token = await getToken(env);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${env.TOAST_API_HOST}${path}`, {
      headers: { "Authorization": `Bearer ${token}`, "Toast-Restaurant-External-ID": guid },
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

/* ---- /api/locations : hours in the app's format ([Sun..Sat] of [openMin, closeMin]) ---- */
const toMin = t => { const [h, m] = t.split(":"); return (+h) * 60 + (+m); };
const WEEK = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

async function handleLocations(env, request) {
  if (cache.locations && cache.locations.exp > Date.now()) return json(cache.locations.value, request);
  const out = {};
  for (const [loc, guid] of Object.entries(TOAST_LOCATIONS)) {
    if (!guid) continue;
    const r = await toastGet(env, `/restaurants/v1/restaurants/${guid}`, guid);
    const day = WEEK.map(d => {
      const sched = r.schedules?.daySchedules?.[r.schedules?.weekSchedule?.[d]];
      if (!sched || !sched.openTime || !sched.closeTime) return null;
      const open = toMin(sched.openTime);
      let close = toMin(sched.closeTime);
      if (close <= open) close = 1439; // overnight schedule — cap at midnight for the app's day-based model
      return [open, close];
    });
    out[loc] = {
      name: r.general?.name,
      phone: r.location?.phone || null,
      hours: day,
      orderUrl: r.urls?.orderOnline || null,
    };
  }
  cache.locations = { value: out, exp: Date.now() + LOCATIONS_TTL_MS };
  return json(out, request);
}

/* ---- /api/menu?loc=cv : flattened online-ordering menu ---- */
async function handleMenu(env, request, loc) {
  const guid = TOAST_LOCATIONS[loc];
  if (!guid) return json({ error: "location not live" }, request, 404);
  const hit = cache.menus[loc];
  if (hit && hit.exp > Date.now()) return json(hit.value, request);

  const data = await toastGet(env, "/menus/v2/menus", guid);
  /* the online-ordering menu is the one guests see; skip catering + delivery-app menus */
  const menu = data.menus.find(m => (m.visibility || []).includes("TOAST_ONLINE_ORDERING")) || data.menus[0];
  const items = [];
  (function walk(groups) {
    for (const g of groups || []) {
      for (const it of g.menuItems || []) {
        items.push({ name: it.name, price: it.price ?? null, guid: it.guid });
      }
      walk(g.menuGroups);
    }
  })(menu.menuGroups);

  const value = { lastUpdated: data.lastUpdated, menuName: menu.name, items };
  cache.menus[loc] = { value, exp: Date.now() + MENU_TTL_MS };
  return json(value, request);
}

/* ---- /api/orders?phone=########## : recent orders matching a phone ----
   Toast returns range queries oldest-first with no filter/early-exit, so a
   full lookback scan of each location is cached as a phone-keyed index and
   phone lookups just filter it. Pages fetch in parallel batches.
   NOTE: a cold scan costs ~15-50 Toast subrequests; on Cloudflare's free
   plan (50 subrequest cap) keep ORDER_LOOKBACK_DAYS modest, or move the
   scan to a cron-triggered KV refresh for production. */
/* modest parallelism — Toast rate-limits aggressive bursts (HTTP 429) */
const PAGE_BATCH = 4;
const MAX_PAGES = 48;

async function scanLocation(env, loc, guid) {
  const hit = cache.orders[loc];
  if (hit && hit.exp > Date.now()) return hit.value;
  const end = new Date();
  const start = new Date(end.getTime() - ORDER_LOOKBACK_DAYS * 86400000);
  const iso = d => d.toISOString().replace("Z", "-0000");
  const fetchPage = page => toastGet(env,
    `/orders/v2/ordersBulk?startDate=${encodeURIComponent(iso(start))}&endDate=${encodeURIComponent(iso(end))}&page=${page}&pageSize=100`,
    guid);

  const index = [];
  for (let page = 1; page <= MAX_PAGES; page += PAGE_BATCH) {
    const pages = await Promise.all(
      Array.from({ length: PAGE_BATCH }, (_, i) => fetchPage(page + i)));
    for (const orders of pages) {
      for (const o of orders) {
        if (o.voided || o.deleted) continue;
        for (const c of o.checks || []) {
          if (c.voided || c.deleted) continue;
          const phone = (c.customer?.phone || "").replace(/\D/g, "").slice(-10);
          if (phone.length !== 10) continue;
          const items = (c.selections || [])
            .filter(s => !s.voided && s.displayName)
            .map(s => ({ name: s.displayName, price: s.price ?? null }));
          if (items.length) index.push({ phone, guid: o.guid, loc, ts: o.openedDate, items });
        }
      }
    }
    if (pages.some(orders => orders.length < 100)) break;
  }
  cache.orders[loc] = { value: index, exp: Date.now() + 5 * 60 * 1000 };
  return index;
}

async function handleOrders(env, request, phone) {
  if (!/^\d{10}$/.test(phone || "")) return json({ error: "phone must be 10 digits" }, request, 400);
  const matched = [];
  for (const [loc, guid] of Object.entries(TOAST_LOCATIONS)) {
    if (!guid) continue;
    const index = await scanLocation(env, loc, guid);
    for (const row of index) {
      if (row.phone === phone) matched.push({ guid: row.guid, loc: row.loc, ts: row.ts, items: row.items });
    }
  }
  matched.sort((a, b) => new Date(a.ts) - new Date(b.ts));
  return json({ orders: matched }, request);
}

/* ---- router ---- */
export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") {
        const live = Object.fromEntries(Object.entries(TOAST_LOCATIONS).map(([k, v]) => [k, !!v]));
        return json({ ok: true, live }, request);
      }
      if (url.pathname === "/api/locations") return handleLocations(env, request);
      if (url.pathname === "/api/menu") return handleMenu(env, request, url.searchParams.get("loc") || "cv");
      if (url.pathname === "/api/orders") return handleOrders(env, request, url.searchParams.get("phone"));
      return json({ error: "not found" }, request, 404);
    } catch (e) {
      return json({ error: String(e.message || e) }, request, 502);
    }
  },
};
