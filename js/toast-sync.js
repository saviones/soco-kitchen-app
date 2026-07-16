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

  function render(target){
    el = target;
    const s = Store.state;
    const lvl = Game.levelFor(s.points);

    const ladder = SOCO.REWARDS.map(r => {
      const can = s.points >= r.cost;
      const claimed = s.vouchers.some(v => v.rid === r.id);
      return `<div class="rrow">
        <div class="ri">${r.icon}</div>
        <div class="rn">${esc(r.name)}<div class="rc">${r.cost.toLocaleString()} pts</div></div>
        <button class="btn small ${can ? "gold" : ""}" ${can && !claimed ? "" : "disabled"}
          onclick="ToastSync.redeem('${r.id}')">${claimed ? "Claimed ✓" : can ? "Redeem" : "🔒"}</button>
      </div>`;
    }).join("");

    const vouchers = s.vouchers.length ? s.vouchers.map(v => `
      <div class="voucher">
        <div class="row"><span style="font-size:20px">${v.icon}</span>
          <div class="grow"><b style="font-size:13px">${esc(v.name)}</b>
          <div class="code mt6">${v.code}</div></div>
        </div>
        <div class="sub" style="font-size:10px;margin-top:6px">Show at the counter · sample voucher, not redeemable</div>
      </div>`).join("") : "";

    el.innerHTML = `
      <h1 class="mt6">Rewards</h1>
      <div class="sub">Every dish banks points. Points become food.</div>

      <div class="card mt10 levelcard">
        <div class="lvlrow">
          <div class="lvlicon">⚜️</div>
          <div class="grow">
            <div class="lvlname">${s.points.toLocaleString()} points</div>
            <div class="lvlpts">${lvl.icon} ${esc(lvl.name)} · ${s.lifetimePoints.toLocaleString()} lifetime</div>
          </div>
        </div>
      </div>

      <h2>Toast account link <span class="rule"></span></h2>
      <div class="card toastcard" id="toastcard">${linkCard()}</div>

      <h2>Rewards ladder <span class="rule"></span></h2>
      <div class="card">
        ${ladder}
        <div class="notice">Sample rewards to demo the mechanic — SoCo sets the real ladder before launch.</div>
      </div>
      ${vouchers ? `<h2>Your vouchers <span class="rule"></span></h2>${vouchers}` : ""}

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
      </div>`;
  }

  function linkCard(){
    const s = Store.state;
    if (!s.toast.linked){
      return `
        <div class="row" style="justify-content:space-between">
          <span class="toastlogo"><span class="t">T</span> Toast Loyalty</span>
          <span class="demo">Demo Mode</span>
        </div>
        <div class="sub mt10">Link the phone number you use at checkout and your real orders turn into quest points — automatically, at all 4 locations.</div>
        <div class="phinput">
          <input id="toastPhone" type="tel" inputmode="tel" placeholder="(510) 555-0134" maxlength="14">
          <button class="btn gold" onclick="ToastSync.link()">Link</button>
        </div>`;
    }
    const orders = s.toast.orders.slice().reverse().map(o => `
      <div class="order-r">
        <div class="oic">🧾</div>
        <div><b>Order #${o.num}</b> · ${esc(SOCO.loc(o.loc).name)}
          <div class="ot">${new Date(o.ts).toLocaleString([], {month:"short", day:"numeric", hour:"numeric", minute:"2-digit"})} · ${o.items.map(i => esc(SOCO.item(i).name)).join(", ")}</div>
        </div>
        <div class="opts">+${o.pts}</div>
      </div>`).join("");
    return `
      <div class="row" style="justify-content:space-between">
        <span class="toastlogo"><span class="t">T</span> Toast Loyalty</span>
        <span class="demo">Demo Mode</span>
      </div>
      <div class="statusbar" style="margin-top:10px"><span class="dot open"></span>
        <div class="grow" style="font-size:12.5px">Linked to <b>${esc(s.toast.phone)}</b> — orders sync to points</div>
      </div>
      <div class="orderfeed">${orders || `<div class="sub center mt10">No synced orders yet.</div>`}</div>
      <button class="btn wide mt10" onclick="ToastSync.simulateOrder()">⚡ Simulate an incoming Toast order</button>
      <button class="btn small ghost wide mt6" style="color:var(--ink-faint)" onclick="ToastSync.unlink()">Unlink account</button>`;
  }

  function link(){
    const input = document.getElementById("toastPhone");
    const val = (input.value || "").replace(/[^0-9]/g, "");
    if (val.length < 10){ App.notify("Enter a 10-digit phone number to link", "📵", 2600); return; }
    const s = Store.state;
    const card = document.getElementById("toastcard");
    card.innerHTML = `<div class="empty"><span class="e">🔗</span>Contacting Toast…<br><span class="dim small">matching your order history</span></div>`;
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
    Store.state.toast = { linked:false, phone:null, orders:[] };
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

  function redeem(rid){
    const r = SOCO.REWARDS.find(x => x.id === rid);
    const s = Store.state;
    if (s.points < r.cost) return;
    s.points -= r.cost;
    const code = "SOCO-" + Math.random().toString(36).slice(2,6).toUpperCase() + "-" + Math.random().toString(36).slice(2,6).toUpperCase();
    s.vouchers.push({ rid, name: r.name, icon: r.icon, code, ts: Date.now(), cost: r.cost });
    Store.save();
    Game.confetti(130);
    App.notify(`Redeemed: <b>${esc(r.name)}</b> 🎉 Voucher ${code}`, r.icon, 4600);
    App.refresh(); App.updateHeader();
  }

  return { render, link, unlink, simulateOrder, redeem };
})();
