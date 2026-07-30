/* ============================================================
   SoCo Kitchen App — LIVE Toast mode
   ------------------------------------------------------------
   Talks to the SoCo Toast proxy (backend/worker.js). When the
   proxy is reachable, the app flips from demo to live:
     - real hours & open/closed status per location
     - real online-ordering prices on the menu
     - "link your phone" pulls the guest's real recent orders
       and banks points for them (dedup'd by order guid)
   When the proxy is missing (e.g. plain GitHub Pages with no
   backend deployed), everything silently stays in demo mode.
   ============================================================ */
const ToastLive = (() => {
  const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const API = SOCO.LIVE_API || (LOCAL ? "http://localhost:8788" : "");
  const BASE = `/api/v1/${SOCO.id}`;   // every route is tenant-scoped

  let on = false;          // proxy reachable
  let liveLocs = {};       // { cv:true, al:true, ph:false, sj:false }
  let pricesFrom = null;   // which location's menu prices are applied
  let rewardsLadder = null;// server-priced ladder; null until fetched

  async function call(path, { method = "GET", body, timeoutMs = 6000 } = {}){
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(API + BASE + path, {
        method, signal: ctl.signal,
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(data.error || `HTTP ${r.status} on ${path}`); e.data = data; e.status = r.status; throw e; }
      return data;
    } finally { clearTimeout(t); }
  }
  const getJson = (path, timeoutMs = 6000) => call(path, { timeoutMs });

  async function boot(){
    if (!API) return;
    try {
      const h = await getJson("/health", 3000);
      if (!h.ok) return;
      liveLocs = h.live || {};
      on = true;
      await Promise.all([applyLocations(), applyMenu(), applyRewards()]);
      App.refresh();
      App.notify("Connected to <b>Toast</b> — live hours & menu prices ⚡", "🔌", 3400);
      syncOrders();
    } catch(e){
      console.warn("Toast live mode unavailable, staying in demo:", e);
    }
  }

  const fmtPhone = d => d && d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : null;

  /* The reward ladder is priced by the server. Whatever the tenant
     config says locally is display-only demo data — if the two ever
     disagree, the server wins, because it is what actually charges
     points and issues the voucher. */
  async function applyRewards(){
    try {
      const data = await getJson("/rewards");
      if (!data.enabled){ rewardsLadder = []; SOCO.REWARDS = []; SOCO.REWARDS_ENABLED = false; return; }
      rewardsLadder = data.rewards || [];
      SOCO.REWARDS = rewardsLadder;
    } catch(e){
      console.warn("Reward ladder unavailable, using local config:", e);
    }
  }

  async function applyLocations(){
    const data = await getJson("/locations");
    for (const [id, info] of Object.entries(data)){
      const loc = SOCO.loc(id);
      if (!loc || !info.hours) continue;
      loc.hours = info.hours;
      if (info.phone) loc.phone = fmtPhone(info.phone) || loc.phone;
      if (info.orderUrl) loc.toast = info.orderUrl;
      loc.live = true;
    }
  }

  async function applyMenu(){
    const s = Store.state;
    const loc = liveLocs[s.homeLoc] ? s.homeLoc : "cv";
    const data = await getJson(`/menu?loc=${loc}`);
    const unmatched = [];
    let updated = 0;
    for (const it of data.items){
      if (it.price == null || it.price === 0) continue;
      const id = ToastMap.match(it.name);
      if (!id){ unmatched.push(it.name); continue; }
      const m = SOCO.item(id);
      if (m && m.price !== it.price){ m.price = it.price; updated++; }
      if (m) m.livePriced = true;
    }
    pricesFrom = loc;
    if (unmatched.length) console.info("Live menu items with no app match:", unmatched);
    return updated;
  }

  /* Refresh the wallet and fold its order history into quest progress.
     The server credits reward points ahead of time (cron sync), so this
     is a single cheap read — no Toast round-trip. Dishes the guest
     actually ordered legitimately count toward the quest too, deduped
     by order id so nothing is logged twice. */
  async function syncOrders(manual){
    const s = Store.state;
    if (!on || !s.toast.linked || !s.toast.phone) return;
    try {
      const w = await refreshWallet();
      if (!w){
        if (manual) App.notify("Couldn't reach the rewards server — try again in a minute", "📡", 3000);
        return;
      }
      s.toast.seen = s.toast.seen || {};
      s.toast.orders = [];
      let newOrders = 0;
      for (const o of w.orders || []){
        const names = o.names || [];
        let questPts = 0;
        if (!s.toast.seen[o.guid]){
          s.toast.seen[o.guid] = 1;
          newOrders++;
          for (const name of names){
            const id = ToastMap.match(name);
            if (id) questPts += Game.logDish(id, "toast", true);
          }
        }
        s.toast.orders.push({
          num: String(o.guid).slice(0, 4).toUpperCase(),
          loc: o.loc, ts: o.ts, names, pts: o.points,
        });
      }
      s.toast.orders = s.toast.orders.slice(-25);
      Store.save();
      if (newOrders){
        App.notify(`<b>Toast sync:</b> ${newOrders} order${newOrders>1?"s":""} · balance <b>${w.balance.toLocaleString()} pts</b> ⚜️`, "⚡", 5000);
        Game.confetti(100);
      } else if (manual){
        App.notify("You're all caught up — no new Toast orders", "✅", 2600);
      }
      App.refresh(); App.updateHeader();
    } catch(e){
      console.warn("Wallet sync failed:", e);
      if (manual) App.notify("Couldn't reach the rewards server — try again in a minute", "📡", 3000);
    }
  }

  /* ---- server-authoritative rewards wallet ----
     `Store.state.points` is the QUEST score: it counts manually logged
     dishes and drives levels, badges and the streetcar map. It is
     self-reported, lives on the device, and buys nothing.

     The wallet below is the spendable currency. The server derives it
     from Toast orders the restaurant actually rang up, so the browser
     cannot inflate it, and the server issues every voucher code. */
  let wallet = null;      // { earned, spent, balance, orders[], vouchers[] }
  let enrolled = true;    // false = number isn't on the soft-launch allowlist

  async function refreshWallet(){
    const s = Store.state;
    if (!on || !s.toast.linked || !s.toast.phone){ wallet = null; return null; }
    const phone = s.toast.phone.replace(/\D/g, "").slice(-10);
    try {
      wallet = await getJson(`/balance?phone=${phone}`, 20000);
      enrolled = true;
    } catch(e){
      /* during the soft launch only enrolled numbers exist; this is an
         expected state, not an error */
      if (e.status === 403 && e.data && e.data.error === "not_enrolled"){
        enrolled = false;
      } else {
        console.warn("Wallet unavailable:", e);
      }
      wallet = null;
    }
    return wallet;
  }

  /* Sends only the reward id — the server prices it from its own table,
     checks the balance and issues the code inside a Durable Object, so
     a tampered client cannot buy a $30 platter for 2 points or spend
     the same points twice with two simultaneous taps. */
  async function redeemReward(rewardId){
    const s = Store.state;
    const phone = s.toast.phone ? s.toast.phone.replace(/\D/g, "").slice(-10) : null;
    if (!phone) throw new Error("link your phone first");
    const res = await call("/redeem", { method: "POST", body: { phone, rewardId }, timeoutMs: 60000 });
    await refreshWallet();
    return res;
  }

  return {
    boot, syncOrders,
    isOn: () => on,
    isLiveLoc: id => !!liveLocs[id],
    pricesFrom: () => pricesFrom,
    wallet: () => wallet,
    isEnrolled: () => enrolled,
    refreshWallet, redeemReward,
  };
})();

window.ToastLive = ToastLive; // `const` doesn't attach to window; the live()/isOn() guards need this
window.addEventListener("load", () => ToastLive.boot());
