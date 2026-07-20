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

  let on = false;          // proxy reachable
  let liveLocs = {};       // { cv:true, al:true, ph:false, sj:false }
  let pricesFrom = null;   // which location's menu prices are applied

  async function getJson(path, timeoutMs = 6000){
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await fetch(API + path, { signal: ctl.signal });
      if (!r.ok) throw new Error(`HTTP ${r.status} on ${path}`);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  async function boot(){
    if (!API) return;
    try {
      const h = await getJson("/api/health", 3000);
      if (!h.ok) return;
      liveLocs = h.live || {};
      on = true;
      await Promise.all([applyLocations(), applyMenu()]);
      App.refresh();
      App.notify("Connected to <b>Toast</b> — live hours & menu prices ⚡", "🔌", 3400);
      syncOrders();
    } catch(e){
      console.warn("Toast live mode unavailable, staying in demo:", e);
    }
  }

  const fmtPhone = d => d && d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : null;

  async function applyLocations(){
    const data = await getJson("/api/locations");
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
    const data = await getJson(`/api/menu?loc=${loc}`);
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

  /* pull the linked phone's real orders; award points once per order guid */
  async function syncOrders(manual){
    const s = Store.state;
    if (!on || !s.toast.linked || !s.toast.phone) return;
    const phone = s.toast.phone.replace(/\D/g, "").slice(-10);
    try {
      const data = await getJson(`/api/orders?phone=${phone}`, 60000); // cold scan pages through 2 weeks of orders
      s.toast.seen = s.toast.seen || {};
      let newOrders = 0, newPts = 0;
      for (const o of data.orders){
        if (s.toast.seen[o.guid]) continue;
        s.toast.seen[o.guid] = 1;
        let pts = 0;
        const names = [];
        for (const it of o.items){
          names.push(it.name);
          const id = ToastMap.match(it.name);
          if (id){
            pts += Game.logDish(id, "toast", true);
          } else if (it.price){
            /* unknown dish still earns base points off its price */
            const p = Math.round(it.price * 10);
            s.points += p; s.lifetimePoints += p; pts += p;
          }
        }
        s.toast.orders.push({
          num: o.guid.slice(0, 4).toUpperCase(),
          loc: o.loc, ts: o.ts, names, pts,
        });
        newOrders++; newPts += pts;
      }
      if (s.toast.orders.length > 25) s.toast.orders = s.toast.orders.slice(-25);
      Store.save();
      if (newOrders){
        App.notify(`<b>Toast sync:</b> ${newOrders} order${newOrders>1?"s":""} → <b>+${newPts.toLocaleString()} pts</b> ⚜️`, "⚡", 5000);
        Game.confetti(100);
      } else if (manual){
        App.notify("You're all caught up — no new Toast orders", "✅", 2600);
      }
      App.refresh(); App.updateHeader();
    } catch(e){
      console.warn("Order sync failed:", e);
      if (manual) App.notify("Couldn't reach Toast right now — try again in a minute", "📡", 3000);
    }
  }

  return {
    boot, syncOrders,
    isOn: () => on,
    isLiveLoc: id => !!liveLocs[id],
    pricesFrom: () => pricesFrom,
  };
})();

window.ToastLive = ToastLive; // `const` doesn't attach to window; the live()/isOn() guards need this
window.addEventListener("load", () => ToastLive.boot());
