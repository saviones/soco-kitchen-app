/* ============================================================
   SoCo Kitchen App — Toast loyalty link (DEMO SIMULATION)
   ------------------------------------------------------------
   SoCo runs ordering on Toast. A production version of this
   feature uses the Toast Partner/Loyalty APIs: Toast fires an
   order webhook -> SoCo backend matches the guest by phone ->
   points post to the app. This module fakes that loop locally
   so the experience can be felt end-to-end. Everything it
   creates is labeled DEMO.
   ============================================================ */
const ToastSync = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  let el = null;
  const live = () => window.ToastLive && ToastLive.isOn();

  /* Two currencies, deliberately:
       quest points  — Store.state.points, from manually logged dishes.
                       Drives levels/badges/the map. Self-reported, so it
                       stays on the device and buys nothing.
       reward points — the server wallet, derived from real Toast orders.
                       The only currency that can be spent on food.
     In demo mode (no backend) there is no wallet, so the ladder falls
     back to quest points and every voucher is stamped DEMO. */
  const wallet = () => (live() && ToastLive.wallet) ? ToastLive.wallet() : null;
  const spendable = () => { const w = wallet(); return w ? w.balance : Store.state.points; };
  const voucherList = () => { const w = wallet(); return w ? (w.vouchers || []) : Store.state.vouchers; };
  const badge = () => live()
    ? `<span class="demo" style="color:var(--green);border-color:rgba(62,207,124,.5);background:rgba(62,207,124,.1)">● LIVE</span>`
    : `<span class="demo">Demo Mode</span>`;

  function render(target){
    el = target;
    const s = Store.state;
    const lvl = Game.levelFor(s.points);

    const bal = spendable();
    const vlist = voucherList();

    const ladder = SOCO.REWARDS.map(r => {
      const can = bal >= r.cost;
      /* an unburned voucher for this reward is already in the guest's wallet */
      const held = vlist.some(v => (v.rewardId || v.rid) === r.id && v.status !== "burned");
      return `<div class="rrow">
        <div class="ri">${r.icon}</div>
        <div class="rn">${esc(r.name)}<div class="rc">${r.cost.toLocaleString()} pts</div></div>
        <button class="btn small ${can ? "gold" : ""}" ${can && !held ? "" : "disabled"}
          onclick="ToastSync.redeem('${r.id}')">${held ? "In wallet ✓" : can ? "Redeem" : "🔒"}</button>
      </div>`;
    }).join("");

    const vouchers = vlist.length ? vlist.map(v => {
      const burned = v.status === "burned";
      const expired = v.expiresAt && Date.now() > v.expiresAt && !burned;
      const note = burned ? `Redeemed ${new Date(v.burnedAt).toLocaleDateString()} · spent`
        : expired ? "Expired"
        : live() ? "Show this code at the counter"
        : "Sample voucher — demo mode, not redeemable";
      return `
      <div class="voucher" style="${burned || expired ? "opacity:.5" : ""}">
        <div class="row"><span style="font-size:20px">${v.icon}</span>
          <div class="grow"><b style="font-size:13px">${esc(v.name)}</b>
          <div class="code mt6">${esc(v.code)}</div></div>
        </div>
        <div class="sub" style="font-size:10px;margin-top:6px">${esc(note)}</div>
      </div>`;
    }).join("") : "";

    el.innerHTML = `
      <h1 class="mt6">Rewards</h1>
      <div class="sub">Every dish banks points. Points become food.</div>

      <div class="card mt10 levelcard">
        <div class="lvlrow">
          <div class="lvlicon">⚜️</div>
          <div class="grow">
            <div class="lvlname">${bal.toLocaleString()} points</div>
            <div class="lvlpts">${wallet()
              ? `spendable · earned from ${wallet().orderCount || 0} Toast order${wallet().orderCount === 1 ? "" : "s"}`
              : `${lvl.icon} ${esc(lvl.name)} · ${s.lifetimePoints.toLocaleString()} lifetime`}</div>
          </div>
        </div>
        ${wallet() ? `<div class="sub" style="font-size:11px;margin-top:8px;border-top:1px solid var(--line);padding-top:8px">
          ${lvl.icon} <b>${esc(lvl.name)}</b> · ${s.points.toLocaleString()} quest points from dishes you've logged
          <span class="dim">— quest points rank you up; only Toast orders buy food.</span>
        </div>` : ""}
      </div>

      <h2>Toast account link <span class="rule"></span></h2>
      <div class="card toastcard" id="toastcard">${linkCard()}</div>

      <h2>Rewards ladder <span class="rule"></span></h2>
      <div class="card">
        ${ladder}
        <div class="notice">Sample rewards to demo the mechanic — SoCo sets the real ladder before launch.</div>
      </div>
      ${vouchers ? `<h2>Your vouchers <span class="rule"></span></h2>${vouchers}` : ""}

      ${live() ? `
      <h2>Connection <span class="rule"></span></h2>
      <div class="card">
        <div class="sub" style="line-height:1.65">
          <b style="color:var(--green)">✅ Connected to Toast</b> via SoCo's read-only Standard API proxy.<br>
          Live hours, live menu prices, and real order → points sync for <b>Castro Valley</b> & <b>Alameda</b>.<br>
          <span class="dim" style="font-size:11px">Pleasant Hill & San Jose join when they're added to the API credential set. In-app ordering needs the Toast partner program — checkout hands off to Toast's page until then.</span>
        </div>
      </div>` : `
      <h2>How the real hookup works <span class="rule"></span></h2>
      <div class="card">
        <div class="sub" style="line-height:1.65">
          <b style="color:var(--ink)">For SoCo ops — the production path:</b><br>
          1️⃣ All 4 locations already run ordering & POS on <b>Toast</b>.<br>
          2️⃣ Join the Toast API partner program (or enable Toast Loyalty) to get order webhooks.<br>
          3️⃣ Each completed order → webhook → SoCo's little backend matches the guest's phone number.<br>
          4️⃣ Points post here automatically, quest stations light up, streaks & badges fire.<br>
          <span class="dim" style="font-size:11px">Until then, this screen simulates that loop so the whole experience can be play-tested.</span>
        </div>
      </div>`}`;
  }

  function linkCard(){
    const s = Store.state;
    if (!s.toast.linked){
      return `
        <div class="row" style="justify-content:space-between">
          <span class="toastlogo"><span class="t">T</span> Toast Loyalty</span>
          ${badge()}
        </div>
        <div class="sub mt10">${live()
          ? "Use the phone number you give at the counter. From here on, every order banks points automatically — just give that number when you order.<br><span class='dim' style='font-size:11px'>Starts fresh from today; past orders don't count.</span>"
          : "Link the phone number you use at checkout and your real orders turn into quest points — automatically, at all 4 locations."}</div>
        <div class="phinput">
          <input id="toastPhone" type="tel" inputmode="tel" placeholder="(510) 555-0134" maxlength="14">
          <button class="btn gold" onclick="ToastSync.link()">Link</button>
        </div>`;
    }
    /* Only reachable when the tenant is running a closed pilot — otherwise
       linking a number enrols it on the spot. */
    if (live() && ToastLive.isEnrolled && !ToastLive.isEnrolled()){
      const closed = ToastLive.isEnrollClosed && ToastLive.isEnrollClosed();
      return `
        <div class="row" style="justify-content:space-between">
          <span class="toastlogo"><span class="t">T</span> Toast Loyalty</span>
          ${badge()}
        </div>
        <div class="notice mt10" style="line-height:1.6">
          ${closed
            ? `<b>We're in a limited pilot right now.</b><br>
               Rewards are open to a small group while we get it right.
               Ask at the counter and we'll add <b>${esc(s.toast.phone)}</b>.`
            : `<b>${esc(s.toast.phone)} hasn't joined yet.</b><br>
               Tap below to try again — joining takes a second and points start
               with your next order.`}
        </div>
        <button class="btn small ghost wide mt10" style="color:var(--ink-faint)" onclick="ToastSync.unlink()">Use a different number</button>`;
    }

    const orders = s.toast.orders.slice().reverse().map(o => `
      <div class="order-r">
        <div class="oic">🧾</div>
        <div><b>Order #${o.num}</b> · ${esc((SOCO.loc(o.loc) || {}).name || "SoCo")}
          <div class="ot">${new Date(o.ts).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})} · ${(o.names || o.items.map(i => SOCO.item(i).name)).map(esc).join(", ")}</div>
        </div>
        <div class="opts">+${o.pts}</div>
      </div>`).join("");
    return `
      <div class="row" style="justify-content:space-between">
        <span class="toastlogo"><span class="t">T</span> Toast Loyalty</span>
        ${badge()}
      </div>
      <div class="statusbar" style="margin-top:10px"><span class="dot open"></span>
        <div class="grow" style="font-size:12.5px">Linked to <b>${esc(s.toast.phone)}</b> — orders sync to points</div>
      </div>
      <div class="orderfeed">${orders || `<div class="sub center mt10">No synced orders yet.</div>`}</div>
      ${live()
        ? `<button class="btn wide mt10" onclick="ToastLive.syncOrders(true)">🔄 Sync Toast orders now</button>`
        : `<button class="btn wide mt10" onclick="ToastSync.simulateOrder()">⚡ Simulate an incoming Toast order</button>`}
      <button class="btn small ghost wide mt6" style="color:var(--ink-faint)" onclick="ToastSync.unlink()">Unlink account</button>`;
  }

  function link(){
    const input = document.getElementById("toastPhone");
    const val = (input.value || "").replace(/[^0-9]/g, "");
    if (val.length < 10){ App.notify("Enter a 10-digit phone number to link", "📵", 2600); return; }
    const s = Store.state;
    const card = document.getElementById("toastcard");
    card.innerHTML = `<div class="empty"><span class="e">🔗</span>Contacting Toast…<br><span class="dim small">matching your order history</span></div>`;
    if (live()){
      const pretty = `(${val.slice(0,3)}) ${val.slice(3,6)}-${val.slice(6,10)}`;
      ToastLive.enrollPhone(val).then(res => {
        s.toast.linked = true;
        s.toast.phone = pretty;
        Store.save();
        if (res.alreadyEnrolled){
          App.notify(`Welcome back — <b>${res.balance.toLocaleString()} points</b> ⚜️`, "🔗", 3600);
        } else {
          App.notify(`You're in! Points start with your next order at <b>${esc(pretty)}</b> ⚜️`, "🎉", 4600);
          Game.confetti(120);
        }
        App.refresh(); App.updateHeader();
      }).catch(e => {
        const d = e.data || {};
        App.notify(d.message || "Couldn't join right now — try again in a minute", "📡", 4200);
        App.refresh();
      });
      return;
    }
    setTimeout(() => {
      s.toast.linked = true;
      s.toast.phone = `(${val.slice(0,3)}) ${val.slice(3,6)}-${val.slice(6,10)}`;
      Store.save();
      // import two plausible past orders
      importOrder(["fried-chicken-sandwich","cajun-fries","lemonade"], daysAgo(6));
      importOrder(["gumbo","bread-pudding"], daysAgo(2));
      App.notify(`Toast linked! <b>2 past orders</b> imported — points banked ⚜️`, "🔗", 4200);
      Game.confetti(120);
      App.refresh();
    }, 1600);
  }

  function unlink(){
    // keep `seen` so relinking never double-awards points for the same order
    Store.state.toast = { linked:false, phone:null, orders:[], seen: Store.state.toast.seen || {} };
    Store.save(); App.refresh();
    App.notify("Toast account unlinked", "🔌", 2200);
  }

  const daysAgo = d => Date.now() - d*86400000 - Math.floor(Math.random()*4)*3600000;

  function importOrder(items, ts){
    const s = Store.state;
    let pts = 0;
    items.forEach(id => pts += Game.logDish(id, "toast", true)); // silent logs
    s.toast.orders.push({ num: 1000 + Math.floor(Math.random()*9000), loc: s.homeLoc, ts, items, pts });
    Store.save();
  }

  function simulateOrder(){
    const s = Store.state;
    const pool = SOCO.MENU.filter(m => m.quest !== false);
    const untried = pool.filter(m => !s.eaten[m.id]);
    const n = 1 + Math.floor(Math.random()*2);
    const items = [];
    for (let i=0; i<n; i++){
      const src = untried.length ? untried : pool;
      const pick = src[Math.floor(Math.random()*src.length)];
      if (!items.includes(pick.id)) items.push(pick.id);
      const ix = untried.indexOf(pick); if (ix > -1) untried.splice(ix,1);
    }
    const loc = SOCO.LOCATIONS[Math.floor(Math.random()*SOCO.LOCATIONS.length)].id;
    let pts = 0;
    items.forEach(id => pts += Game.logDish(id, "toast", true));
    const num = 1000 + Math.floor(Math.random()*9000);
    s.toast.orders.push({ num, loc, ts: Date.now(), items, pts });
    Store.save();
    App.notify(`<b>Toast webhook:</b> Order #${num} @ ${esc(SOCO.loc(loc).name)}<br>${items.map(i => esc(SOCO.item(i).name)).join(" · ")} → <b>+${pts} pts</b>`, "⚡", 5000);
    Game.confetti(90);
    App.refresh();
  }

  /* LIVE: the server prices the reward, checks the balance and mints the
     code. The browser only names which reward it wants — it cannot set
     the price, the balance, or the code.
     DEMO: no backend, so this stays a local simulation and every voucher
     it produces is labelled as such and worth nothing at the counter. */
  async function redeem(rid){
    const r = SOCO.REWARDS.find(x => x.id === rid);
    if (!r) return;

    if (live()){
      App.notify("Issuing your voucher…", "⏳", 1800);
      try {
        const res = await ToastLive.redeemReward(rid);
        Game.confetti(130);
        App.notify(`Redeemed: <b>${esc(r.name)}</b> 🎉<br>Code <b>${esc(res.voucher.code)}</b> — show it at the counter`, r.icon, 6000);
      } catch(e){
        const d = e.data || {};
        if (d.reason === "insufficient_points"){
          App.notify(`Not enough points yet — <b>${(d.cost - d.balance).toLocaleString()}</b> to go`, "🔒", 3600);
        } else {
          App.notify("Couldn't reach the rewards server — nothing was charged. Try again.", "📡", 3600);
        }
      }
      App.refresh(); App.updateHeader();
      return;
    }

    const s = Store.state;
    if (s.points < r.cost) return;
    s.points -= r.cost;
    const code = "DEMO-" + Math.random().toString(36).slice(2,6).toUpperCase() + "-" + Math.random().toString(36).slice(2,6).toUpperCase();
    s.vouchers.push({ rewardId: rid, name: r.name, icon: r.icon, code, ts: Date.now(), cost: r.cost, status: "issued" });
    Store.save();
    Game.confetti(130);
    App.notify(`Redeemed: <b>${esc(r.name)}</b> 🎉 Demo voucher ${code}`, r.icon, 4600);
    App.refresh(); App.updateHeader();
  }

  return { render, link, unlink, simulateOrder, redeem };
})();
