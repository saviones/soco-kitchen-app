/* ============================================================
   SoCo Kitchen App — core UI + router + menu + ordering
   ============================================================ */
const App = (() => {

  /* ---------- utils ---------- */
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const money = n => "$" + (Number.isInteger(n) ? n : n.toFixed(2));
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  function fmtMin(min){
    let h = Math.floor(min/60), m = min%60;
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12; if (h === 0) h = 12;
    return m ? `${h}:${String(m).padStart(2,"0")}${ap}` : `${h}${ap}`;
  }
  function hoursLabel(loc, day){
    const h = loc.hours[day];
    return h ? `${fmtMin(h[0])} – ${fmtMin(h[1])}` : "Closed";
  }
  function isOpenNow(loc){
    const now = new Date();
    const day = now.getDay(), cur = now.getHours()*60 + now.getMinutes();
    const h = loc.hours[day];
    if (h && cur >= h[0] && cur < h[1]) return { open:true, label:`Open now · closes ${fmtMin(h[1])}` };
    // find next opening
    for (let i = 0; i < 7; i++){
      const d = (day + i) % 7, hh = loc.hours[d];
      if (!hh) continue;
      if (i === 0 && cur < hh[0]) return { open:false, label:`Closed · opens today ${fmtMin(hh[0])}` };
      if (i > 0) return { open:false, label:`Closed · opens ${i===1?"tomorrow":DAYS[d]} ${fmtMin(hh[0])}` };
    }
    return { open:false, label:"Closed" };
  }
  function dishArt(m, h=200){
    const cat = SOCO.cat(m.cat);
    if (m.img) return `<img src="${m.img}" alt="${esc(m.name)}" loading="lazy">`;
    return `<svg viewBox="0 0 200 ${h}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="${esc(m.name)}">
      <defs><linearGradient id="g-${m.id}" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${cat.color}" stop-opacity=".28"/>
        <stop offset="1" stop-color="#1b0e38"/>
      </linearGradient></defs>
      <rect width="200" height="${h}" fill="url(#g-${m.id})"/>
      <text x="14" y="${h-12}" font-size="15" opacity=".25">⚜️</text>
      <text x="100" y="${h/2}" font-size="54" text-anchor="middle" dominant-baseline="central">${m.emoji}</text>
    </svg>`;
  }
  const peppers = n => n ? "🌶".repeat(n) : "";

  /* ---------- in-app notifications ---------- */
  function notify(html, emoji="⚜️", ms=3400){
    const box = document.createElement("div");
    box.className = "not";
    box.innerHTML = `<span class="ne">${emoji}</span><div>${html}</div>`;
    $("#nots").appendChild(box);
    setTimeout(() => { box.classList.add("out"); setTimeout(() => box.remove(), 320); }, ms);
  }

  /* ---------- tabs ---------- */
  const TABS = ["home","menu","order","quest","rewards"];
  let tab = "home";
  function go(t, opts={}){
    tab = t;
    document.querySelectorAll("nav button").forEach(b => b.classList.toggle("on", b.dataset.tab === t));
    TABS.forEach(x => $("#scr-"+x).classList.toggle("active", x === t));
    render(t, opts);
    $("#main").scrollTo({ top:0, behavior:"instant" });
  }
  function render(t, opts={}){
    if (t === "home") renderHome();
    if (t === "menu") renderMenu(opts);
    if (t === "order") renderOrder();
    if (t === "quest") Game.renderQuest($("#scr-quest"));
    if (t === "rewards") ToastSync.render($("#scr-rewards"));
  }
  function refresh(){ render(tab); updateHeader(); }

  /* ---------- header ---------- */
  function updateHeader(){
    const s = Store.state;
    $("#locChipTxt").textContent = SOCO.loc(s.homeLoc).name;
    /* Show the SPENDABLE balance once a wallet exists. The quest score is a
       different, larger number, and a guest reading it in the header would
       reasonably expect to be able to spend it. Quest rank still shows on
       the Rewards and Quest screens, where it is labelled. */
    const w = window.ToastLive && ToastLive.wallet && ToastLive.wallet();
    $("#ptsChipTxt").textContent = (w ? w.balance : s.points).toLocaleString();
    const n = s.cart.items.reduce((a,i) => a + i.qty, 0);
    const dot = $("#cartDot");
    dot.style.display = n ? "grid" : "none";
    dot.textContent = n;
  }

  /* ================= HOME ================= */
  function renderHome(){
    const s = Store.state;
    const loc = SOCO.loc(s.homeLoc);
    const st = isOpenNow(loc);
    const eatenCount = SOCO.questItems().filter(m => s.eaten[m.id]).length;
    const total = SOCO.questItems().length;
    const badges = SOCO.BADGES.filter(b => s.badges[b.id]).length;
    const lvl = Game.levelFor(s.points);

    $("#scr-home").innerHTML = `
      <div class="hero">
        <img src="assets/brand/hero.jpg" alt="Southern Comfort Kitchen spread">
        <div class="veil"></div>
        <div class="txt">
          <div class="kicker">${esc(SOCO.BRAND.tagline)}</div>
          <h1>Where the Bay<br>Meets New Orleans</h1>
          <div class="btnrow">
            <button class="btn gold" onclick="App.go('order')">🛒 Order Now</button>
            <button class="btn" onclick="App.go('quest')">🚋 Menu Quest</button>
          </div>
        </div>
      </div>

      <div class="statusbar">
        <span class="dot ${st.open ? "open" : "closed"}"></span>
        <div class="grow"><b>${esc(loc.name)}</b> · <span class="dim">${st.label}</span></div>
        <button class="btn small ghost" onclick="App.openLocPicker()">Change</button>
      </div>

      <div class="tiles">
        <div class="tile"><div class="big">${s.points.toLocaleString()}</div><div class="lbl">Points</div></div>
        <div class="tile"><div class="big">${eatenCount}<span style="font-size:12px;color:var(--ink-faint)">/${total}</span></div><div class="lbl">Dishes Tried</div></div>
        <div class="tile"><div class="big">${lvl.icon}</div><div class="lbl">${esc(lvl.name)}</div></div>
      </div>

      <div class="card mt10" id="beignetCard"></div>

      <div class="card mt10">
        <div class="row">
          <div class="grow">
            <b style="font-size:14.5px">🎲 Spice Roulette</b>
            <div class="sub mt6">Can't decide? Shake your phone (or tap) and the kitchen picks a dish you haven't tried yet.</div>
          </div>
          <button class="btn small" onclick="App.roulette()">Spin</button>
        </div>
      </div>

      <h2>Straight from the truck <span class="rule"></span></h2>
      <div class="strip">
        <img src="assets/food/beignets-plate.jpg" alt="SoCo food truck in San Francisco">
        <img src="assets/food/gallery-1.jpg" alt="SoCo truck at City Hall">
        <img src="assets/food/food-69894.jpg" alt="SoCo truck at the ballpark">
        <img src="assets/food/gallery-2.jpg" alt="Line at the truck">
        <img src="assets/food/food-truck-1.jpg" alt="Blackened wings">
        <img src="assets/food/catering-line.jpg" alt="Catering line">
      </div>

      <h2>The SoCo story <span class="rule"></span></h2>
      <div class="card">
        <div class="sub">${esc(SOCO.BRAND.story)}</div>
        <div class="timeline mt14">
          <div class="tl"><div class="ty">2013</div><div class="tt">Three brothers, one dream</div><div class="td">Born in New Orleans, the Brill brothers start serving family recipes in the Bay.</div></div>
          <div class="tl"><div class="ty">FOOD TRUCK ERA</div><div class="tt">Purple truck, gold letters</div><div class="td">City Hall, ballparks, festivals — the gumbo goes wherever the people are.</div></div>
          <div class="tl"><div class="ty">CASTRO VALLEY</div><div class="tt">The flagship opens</div><div class="td">A permanent home on Castro Valley Blvd — and the Bay shows up hungry.</div></div>
          <div class="tl"><div class="ty">TODAY</div><div class="tt">4 kitchens strong</div><div class="td">Castro Valley · Pleasant Hill · Alameda (drive-thru!) · San Jose — plus trucks & catering.</div></div>
        </div>
      </div>

      <div class="ig card mt10">
        <div class="igtitle"><span class="accent"></span>4 kitchens across the Bay</div>
        ${IG.bayMap(s.homeLoc)}
        <div class="sub center mt6" style="font-size:10.5px">Tap a marker to make it your home kitchen</div>
      </div>

      <div class="ig card mt10">
        <div class="igtitle"><span class="accent"></span>SoCo Hit Parade — fan favorites</div>
        ${IG.hitParade()}
      </div>

      <div class="card mt10">
        <b style="font-size:14.5px">🚚 Food truck & catering</b>
        <div class="sub mt6">Bring the purple truck to your block — weddings, offices, block parties. Chafing dishes of jambalaya as far as the eye can see.</div>
        <div class="btnrow mt10">
          <a class="btn small" href="${SOCO.BRAND.cateringUrl}" target="_blank" rel="noopener">Catering via Toast ↗</a>
          <a class="btn small ghost" href="${SOCO.BRAND.site}" target="_blank" rel="noopener">socokitchen.net ↗</a>
        </div>
      </div>

      <div class="btnrow mt14" style="justify-content:center">
        <a class="btn small ghost" href="${SOCO.BRAND.instagram}" target="_blank" rel="noopener">📸 @socokitchen</a>
        <a class="btn small ghost" href="${SOCO.BRAND.tiktok}" target="_blank" rel="noopener">🎵 @soco.kitchen</a>
      </div>
      <div class="notice center">${window.ToastLive && ToastLive.isOn()
        ? "⚡ Live hours & prices synced from Toast. This app is a concept prototype for Southern Comfort Kitchen."
        : "Menu & prices from the posted Castro Valley menu — may vary by location. This app is a concept prototype for Southern Comfort Kitchen."}</div>
    `;
    renderBeignetCard();
  }

  /* Beignet Sunday countdown */
  let beignetTimer = null;
  function renderBeignetCard(){
    const el = $("#beignetCard");
    if (!el) return;
    const paint = () => {
      if (!document.body.contains(el)) { clearInterval(beignetTimer); return; }
      const now = new Date();
      const isSun = now.getDay() === 0;
      const loc = SOCO.loc(Store.state.homeLoc);
      const h = loc.hours[0];
      const openNow = h && (now.getHours()*60+now.getMinutes()) >= h[0] && (now.getHours()*60+now.getMinutes()) < h[1];
      if (isSun && openNow){
        el.innerHTML = `<div class="center"><div style="font-size:26px">☁️✨</div>
          <b style="font-size:16px">IT'S BEIGNET SUNDAY — RIGHT NOW</b>
          <div class="sub mt6">Fresh & hot, covered in powdered sugar. Sundays only, and today is the day.</div>
          <button class="btn gold mt10" onclick="App.openItem('beignets')">Get Beignets →</button></div>`;
        return;
      }
      // next Sunday open time
      const target = new Date(now);
      const add = isSun && (now.getHours()*60+now.getMinutes()) >= (h ? h[1] : 0) ? 7 : (7 - now.getDay()) % 7;
      target.setDate(now.getDate() + (isSun && !openNow && (now.getHours()*60+now.getMinutes()) < h[0] ? 0 : (add === 0 ? 7 : add)));
      target.setHours(11,0,0,0);
      let diff = Math.max(0, target - now);
      const d = Math.floor(diff/86400000); diff -= d*86400000;
      const hh = Math.floor(diff/3600000); diff -= hh*3600000;
      const mm = Math.floor(diff/60000);
      const ss = Math.floor((diff - mm*60000)/1000);
      el.innerHTML = `
        <div class="center"><b style="font-size:14.5px">☁️ Beignet Sunday Countdown</b>
        <div class="sub" style="margin-top:3px">Beignets are a Sunday-only ritual. Set your alarm.</div></div>
        <div class="count">
          <div class="cell"><div class="n">${d}</div><div class="u">days</div></div>
          <div class="cell"><div class="n">${hh}</div><div class="u">hrs</div></div>
          <div class="cell"><div class="n">${mm}</div><div class="u">min</div></div>
          <div class="cell"><div class="n">${ss}</div><div class="u">sec</div></div>
        </div>`;
    };
    clearInterval(beignetTimer);
    paint();
    beignetTimer = setInterval(paint, 1000);
  }

  /* ================= MENU ================= */
  let menuFilter = { q:"", cat:"all", flags:{} };
  function renderMenu(opts={}){
    if (opts.cat) menuFilter.cat = opts.cat;
    const s = Store.state;
    const isSun = new Date().getDay() === 0;

    const catChips = [`<button class="fchip ${menuFilter.cat==="all"?"on":""}" onclick="App.setCat('all')">All</button>`]
      .concat(SOCO.CATS.map(c => `<button class="fchip ${menuFilter.cat===c.id?"on":""}" onclick="App.setCat('${c.id}')">${c.emoji} ${esc(c.name)}</button>`)).join("");

    const flagChips = [
      ["spicy","🌶 Spicy"],["seafood","🦐 Seafood"],["under10","💸 Under $10"],["untried","✨ Not tried yet"],["photos","📷 With photos"]
    ].map(([k,l]) => `<button class="fchip ${menuFilter.flags[k]?"on":""}" onclick="App.toggleFlag('${k}')">${l}</button>`).join("");

    const seafoodRe = /(shrimp|catfish|oyster|crab|fish|gumbo|crawfish|seafood|50\/50)/i;
    let items = SOCO.MENU.filter(m => {
      if (menuFilter.cat !== "all" && m.cat !== menuFilter.cat) return false;
      if (menuFilter.q && !(m.name+" "+m.desc).toLowerCase().includes(menuFilter.q)) return false;
      const f = menuFilter.flags;
      if (f.spicy && m.spice < 2) return false;
      if (f.seafood && !seafoodRe.test(m.name)) return false;
      if (f.under10 && m.price >= 10) return false;
      if (f.untried && s.eaten[m.id]) return false;
      if (f.photos && !m.img) return false;
      return true;
    });

    let body = "";
    for (const c of SOCO.CATS){
      const group = items.filter(m => m.cat === c.id);
      if (!group.length) continue;
      const done = group.filter(m => s.eaten[m.id]).length;
      body += `<div class="cathead"><span class="cdot" style="background:${c.color}"></span><h2 style="margin:0">${esc(c.name)}</h2><span class="cnt">${done}/${group.length} tried</span></div>
        <div class="sub" style="font-size:10.5px">🚋 ${esc(c.line)}</div>`;
      body += group.map(m => {
        const ate = !!s.eaten[m.id];
        const lag = Game.lagniappe().id === m.id;
        return `
        <div class="mcard" onclick="App.openItem('${m.id}')">
          <div class="ph">${dishArt(m, 200)}${ate ? `<span class="eaten">✓ TRIED</span>` : ""}</div>
          <div>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${m.signature ? `<span class="tagpill sig">⚜️ Signature</span>` : ""}
              ${m.sundayOnly ? `<span class="tagpill sun">${isSun ? "☁️ TODAY!" : "Sundays only"}</span>` : ""}
              ${lag ? `<span class="tagpill sig" style="color:var(--pink);border-color:rgba(255,143,214,.4);background:rgba(255,143,214,.12)">🎁 Lagniappe +50%</span>` : ""}
            </div>
            <h3>${esc(m.name)}</h3>
            <div class="desc">${esc(m.desc)}</div>
            <div class="mrow">
              <span class="price">${money(m.price)}${m.options && m.options.choices.some(o=>o.delta>0) ? "+" : ""}</span>
              <span class="peppers">${peppers(m.spice)}</span>
              <span class="ptspill">+${Game.ptsFor(m)} pts</span>
            </div>
            <div class="mact">
              <button class="mbtn add" onclick="event.stopPropagation();App.quickAdd('${m.id}')">+ Add</button>
              <button class="mbtn ate ${ate?"done":""}" onclick="event.stopPropagation();Game.logDish('${m.id}','manual')">${ate ? "✓ Again" : "🍴 I ate this"}</button>
            </div>
          </div>
        </div>`;
      }).join("");
    }
    if (!body) body = `<div class="empty"><span class="e">🦐</span>Nothing matches — loosen the filters, cher.</div>`;

    $("#scr-menu").innerHTML = `
      <div class="searchrow">
        <input class="search" placeholder="Search gumbo, po' boys, beignets…" value="${esc(menuFilter.q)}" oninput="App.setQuery(this.value)">
        <div class="chips">${catChips}</div>
        <div class="chips">${flagChips}</div>
      </div>
      ${body}
      <div class="notice center">${window.ToastLive && ToastLive.isOn()
        ? "⚡ Prices live from Toast online ordering (" + esc(SOCO.loc(ToastLive.pricesFrom() || "cv").name) + ")."
        : "Prices from the posted Castro Valley menu. Each location's live Toast menu governs at checkout."}</div>`;
  }
  function setQuery(q){ menuFilter.q = q.trim().toLowerCase(); renderMenu(); const el = $("#scr-menu .search"); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  function setCat(c){ menuFilter.cat = c; renderMenu(); }
  function toggleFlag(k){ menuFilter.flags[k] = !menuFilter.flags[k]; renderMenu(); }

  /* ---------- item sheet ---------- */
  let sheetSel = { opt:0, qty:1 };
  function openItem(id){
    const m = SOCO.item(id);
    sheetSel = { opt:0, qty:1 };
    paintItemSheet(m);
    $("#sheetwrap").classList.add("open");
  }
  function paintItemSheet(m){
    const s = Store.state;
    const cat = SOCO.cat(m.cat);
    const ate = s.eaten[m.id];
    const lag = Game.lagniappe().id === m.id;
    const pair = m.pair ? SOCO.item(m.pair) : null;
    const dna = [["Heat","heat"],["Crunch","crunch"],["Comfort","comfort"],["Fresh","fresh"],["Rich","rich"],["Sweet","sweet"]];
    const optHtml = m.options ? `
      <div class="optgroup"><div class="olabel">${esc(m.options.label)}</div>
      ${m.options.choices.map((o,i) => `
        <div class="opt ${sheetSel.opt===i?"on":""}" onclick="App.pickOpt(${i},'${m.id}')">
          <span>${esc(o.label)}</span>${o.delta ? `<span class="odelta">+${money(o.delta)}</span>` : ""}
        </div>`).join("")}
      </div>` : "";
    const unit = m.price + (m.options ? m.options.choices[sheetSel.opt].delta : 0);

    $("#sheet").innerHTML = `
      <div class="grab"></div>
      <div class="bigph">${dishArt(m, 200)}</div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <span class="tagpill" style="background:${cat.color}22;color:${cat.color};border:1px solid ${cat.color}66">${cat.emoji} ${esc(cat.name)}</span>
        ${m.signature ? `<span class="tagpill sig">⚜️ Signature</span>` : ""}
        ${m.sundayOnly ? `<span class="tagpill sun">Sundays only</span>` : ""}
        ${m.adult ? `<span class="tagpill sun" style="color:var(--blue);border-color:rgba(94,200,255,.4);background:rgba(94,200,255,.1)">21+</span>` : ""}
        ${lag ? `<span class="tagpill sig" style="color:var(--pink)">🎁 Today's Lagniappe +50% pts</span>` : ""}
        ${ate ? `<span class="tagpill sig" style="color:var(--green);border-color:rgba(62,207,124,.5);background:rgba(62,207,124,.1)">✓ Tried ×${ate.count}</span>` : ""}
      </div>
      <h2 class="mt6">${esc(m.name)}</h2>
      <div class="row"><span class="price" style="font-size:18px">${money(unit)}</span><span class="peppers">${peppers(m.spice)}</span><span class="ptspill">+${Game.ptsFor(m)} pts${ate ? "" : " · ×2 first taste!"}</span></div>
      <div class="sub mt10">${esc(m.desc)}</div>
      ${m.spice ? `<div class="dna"><div class="olabel" style="font-size:12px;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:1px">Heat check</div>
        <div class="spicemeter">${[1,2,3].map(i => `<span class="flame ${m.spice>=i?"on":""}">🔥</span>`).join("")}
        <span class="sub" style="align-self:center;margin-left:4px">${["","warm & friendly","proper kick","full Creole fire"][m.spice]}</span></div></div>` : ""}
      <div class="dna">
        <div class="olabel" style="font-size:12px;font-weight:700;color:var(--ink-dim);text-transform:uppercase;letter-spacing:1px">Flavor DNA</div>
        ${dna.map(([l,k]) => `<div class="dnarow"><span class="lbl">${l}</span><div class="bar"><i style="width:${m.dna[k]*10}%"></i></div><span class="val">${m.dna[k]}</span></div>`).join("")}
      </div>
      ${optHtml}
      ${pair ? `<div class="card mt14" style="padding:11px"><div class="row"><span style="font-size:20px">${pair.emoji}</span>
        <div class="grow"><div style="font-size:10px;font-weight:800;letter-spacing:1.5px;color:var(--gold);text-transform:uppercase">Kitchen pairing</div>
        <b style="font-size:13px">${esc(pair.name)} · ${money(pair.price)}</b></div>
        <button class="btn small" onclick="App.quickAdd('${pair.id}')">+ Add</button></div></div>` : ""}
      <div class="qtyrow">
        <button class="qbtn" onclick="App.bumpQty(-1,'${m.id}')">−</button>
        <span class="qty">${sheetSel.qty}</span>
        <button class="qbtn" onclick="App.bumpQty(1,'${m.id}')">+</button>
      </div>
      <div class="btnrow">
        <button class="btn gold grow" onclick="App.addFromSheet('${m.id}')">Add to order · ${money(unit * sheetSel.qty)}</button>
        <button class="btn" onclick="Game.logDish('${m.id}','manual');App.closeSheet()">🍴 I ate this</button>
      </div>`;
  }
  function pickOpt(i, id){ sheetSel.opt = i; paintItemSheet(SOCO.item(id)); }
  function bumpQty(d, id){ sheetSel.qty = Math.max(1, Math.min(9, sheetSel.qty + d)); paintItemSheet(SOCO.item(id)); }
  function addFromSheet(id){
    const m = SOCO.item(id);
    const opt = m.options ? m.options.choices[sheetSel.opt] : null;
    addToCart(id, opt ? opt.label : null, m.price + (opt ? opt.delta : 0), sheetSel.qty);
    closeSheet();
  }
  function quickAdd(id){
    const m = SOCO.item(id);
    if (m.options){ openItem(id); return; }
    addToCart(id, null, m.price, 1);
  }
  function closeSheet(){ $("#sheetwrap").classList.remove("open"); }

  /* ---------- cart ---------- */
  function addToCart(id, opt, unit, qty){
    const s = Store.state;
    const same = s.cart.items.find(i => i.id === id && i.opt === opt);
    if (same) same.qty = Math.min(9, same.qty + qty); else s.cart.items.push({ id, opt, unit, qty });
    Store.save();
    updateHeader();
    const m = SOCO.item(id);
    notify(`<b>${esc(m.name)}</b> added to your ${esc(SOCO.loc(s.cart.loc).name)} order`, m.emoji, 2200);
    if (tab === "order") renderOrder();
  }
  function cartCount(){ return Store.state.cart.items.reduce((a,i) => a + i.qty, 0); }
  function bumpCart(idx, d){
    const s = Store.state;
    const it = s.cart.items[idx];
    it.qty += d;
    if (it.qty <= 0) s.cart.items.splice(idx,1);
    Store.save(); updateHeader(); renderOrder();
  }
  function setCartLoc(id){
    Store.state.cart.loc = id;
    Store.state.homeLoc = Store.state.homeLoc || id;
    Store.save(); updateHeader(); renderOrder();
  }

  /* ================= ORDER ================= */
  function renderOrder(){
    const s = Store.state;
    const locCards = SOCO.LOCATIONS.map(l => {
      const st = isOpenNow(l);
      const today = hoursLabel(l, new Date().getDay());
      const picked = s.cart.loc === l.id;
      return `
      <div class="card loccard">
        <div class="top">
          <div><div class="tag">${esc(l.tag)}</div><h3>${esc(l.name)}</h3>
          <div class="addr">${esc(l.addr)}</div></div>
          <span class="dot ${st.open?"open":"closed"}" style="margin-top:6px"></span>
        </div>
        <div class="hoursline">🕐 Today: <b>${today}</b> · <span class="dim">${st.label}</span></div>
        <div class="locbtns">
          <button class="pick ${picked?"on":""}" onclick="App.setCartLoc('${l.id}')">${picked ? "✓ Ordering here" : "Order here"}</button>
          ${l.phone ? `<a class="pick" style="text-align:center;text-decoration:none;color:var(--ink)" href="tel:${l.phone.replace(/[^0-9]/g,"")}">📞 Call</a>` : ""}
          <a class="pick" style="text-align:center;text-decoration:none;color:var(--ink)" target="_blank" rel="noopener" href="https://maps.google.com/?q=${encodeURIComponent("Southern Comfort Kitchen " + l.addr)}">🗺️ Go</a>
        </div>
      </div>`;
    }).join("");

    const items = s.cart.items;
    let cartHtml;
    if (!items.length){
      cartHtml = `<div class="empty"><span class="e">🛒</span>Cart's empty, cher.<br>Go grab a po' boy from the menu.<div class="mt10"><button class="btn gold" onclick="App.go('menu')">Browse the menu</button></div></div>`;
    } else {
      const sub = items.reduce((a,i) => a + i.unit * i.qty, 0);
      const pts = items.reduce((a,i) => a + Game.ptsFor(SOCO.item(i.id)) * i.qty, 0);
      cartHtml = items.map((i,idx) => {
        const m = SOCO.item(i.id);
        return `<div class="cartline">
          <div><div class="nm">${m.emoji} ${esc(m.name)}</div>${i.opt ? `<div class="op">${esc(i.opt)}</div>` : ""}
          <div class="op">${money(i.unit)} each</div></div>
          <div class="ctr"><button class="cbtn" onclick="App.bumpCart(${idx},-1)">−</button><b>${i.qty}</b><button class="cbtn" onclick="App.bumpCart(${idx},1)">+</button>
          <b style="min-width:52px;text-align:right">${money(i.unit*i.qty)}</b></div>
        </div>`;
      }).join("") + `
        <div class="totrow mt10"><span>Subtotal</span><span>${money(sub)}</span></div>
        <div class="totrow"><span>Points you'll bank</span><span style="color:var(--violet)">+${pts} ⚜️</span></div>
        <div class="totrow grand"><span>Total (before tax)</span><span>${money(sub)}</span></div>
        <button class="btn gold wide mt10" onclick="App.checkout()">Checkout via Toast → ${esc(SOCO.loc(s.cart.loc).name)}</button>
        <div class="notice">Payment, taxes & pickup times are handled securely on ${esc(SOCO.loc(s.cart.loc).name)}'s official Toast page. Your cart summary gets copied so you can rebuild it there in seconds.</div>`;
    }

    $("#scr-order").innerHTML = `
      <h1 class="mt6">Order pickup</h1>
      <div class="sub">All 4 kitchens, one app. Pick your spot.</div>
      ${locCards}
      <h2>Your order <span class="rule"></span></h2>
      <div class="card">${cartHtml}</div>`;
  }
  function checkout(){
    const s = Store.state;
    const loc = SOCO.loc(s.cart.loc);
    const lines = s.cart.items.map(i => {
      const m = SOCO.item(i.id);
      return `${i.qty}× ${m.name}${i.opt ? ` (${i.opt})` : ""} — ${money(i.unit*i.qty)}`;
    });
    const sub = s.cart.items.reduce((a,i) => a + i.unit*i.qty, 0);
    const txt = `SoCo Kitchen order — ${loc.name}\n${lines.join("\n")}\nSubtotal: ${money(sub)}`;
    try { navigator.clipboard && navigator.clipboard.writeText(txt); } catch(e){}
    window.open(loc.toast, "_blank", "noopener");
    notify(`Order summary copied — finishing checkout on <b>${esc(loc.name)}</b>'s Toast page`, "🧾", 4200);
  }

  /* ---------- location picker ---------- */
  function openLocPicker(){
    const s = Store.state;
    $("#sheet").innerHTML = `
      <div class="grab"></div>
      <h2>Pick your home kitchen</h2>
      <div class="sub">Hours, countdowns & ordering default to this spot.</div>
      ${SOCO.LOCATIONS.map(l => {
        const st = isOpenNow(l);
        return `<div class="opt ${s.homeLoc===l.id?"on":""}" style="margin-top:8px" onclick="App.setHomeLoc('${l.id}')">
          <div><b>${esc(l.name)}</b><div class="sub" style="font-size:11px">${esc(l.tag)}</div></div>
          <span class="dot ${st.open?"open":"closed"}"></span>
        </div>`;
      }).join("")}`;
    $("#sheetwrap").classList.add("open");
  }
  function setHomeLoc(id){
    Store.state.homeLoc = id;
    Store.state.cart.loc = id;
    Store.save(); closeSheet(); refresh();
    notify(`Home kitchen set to <b>${esc(SOCO.loc(id).name)}</b>`, "📍", 2400);
  }

  /* ---------- roulette + shake ---------- */
  function roulette(){
    const s = Store.state;
    const pool = SOCO.questItems().filter(m => !s.eaten[m.id]);
    const pick = (pool.length ? pool : SOCO.questItems())[Math.floor(Math.random() * (pool.length ? pool.length : SOCO.questItems().length))];
    notify(`The kitchen says: <b>${esc(pick.name)}</b> 🎯`, "🎲", 2600);
    setTimeout(() => openItem(pick.id), 450);
  }
  let lastShake = 0;
  function armShake(){
    if (!window.DeviceMotionEvent) return;
    window.addEventListener("devicemotion", e => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      const mag = Math.abs(a.x||0) + Math.abs(a.y||0) + Math.abs(a.z||0);
      if (mag > 45 && Date.now() - lastShake > 8000){
        lastShake = Date.now();
        roulette();
      }
    });
  }

  /* ---------- init ---------- */
  function init(){
    Store.load();
    updateHeader();
    document.querySelectorAll("nav button").forEach(b => b.addEventListener("click", () => go(b.dataset.tab)));
    go("home");
    armShake();
    setTimeout(() => $("#splash").classList.add("hide"), 1000);
    if (location.protocol.startsWith("http") && "serviceWorker" in navigator){
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  }
  document.addEventListener("DOMContentLoaded", init);

  return { go, refresh, notify, openItem, closeSheet, pickOpt, bumpQty, addFromSheet, quickAdd,
    setQuery, setCat, toggleFlag, bumpCart, setCartLoc, checkout, openLocPicker, setHomeLoc,
    roulette, isOpenNow, hoursLabel, money, esc, dishArt, updateHeader };
})();
