/* ============================================================
   SoCo Kitchen App — Store (state) + Game (Menu Quest engine)
   ============================================================ */

const Store = {
  KEY: "socoapp_state_v1",
  state: null,
  fresh(){
    return {
      homeLoc: "cv",
      points: 0, lifetimePoints: 0,
      eaten: {},            // id -> {count, first, last}
      log: [],              // {id, ts, pts, source}
      badges: {},           // id -> ts
      cart: { loc: "cv", items: [] },
      toast: { linked: false, phone: null, orders: [] },
      vouchers: []
    };
  },
  load(){
    try {
      const raw = localStorage.getItem(this.KEY);
      this.state = raw ? Object.assign(this.fresh(), JSON.parse(raw)) : this.fresh();
    } catch(e){ this.state = this.fresh(); }
    return this.state;
  },
  save(){ try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); } catch(e){} },
  reset(){ this.state = this.fresh(); this.save(); }
};

const Game = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

  /* ---------- points & levels ---------- */
  function lagniappe(){
    // one dish per day gets +50% points — seeded by date
    const d = new Date();
    const key = d.getFullYear()*372 + d.getMonth()*31 + d.getDate();
    const pool = SOCO.questItems();
    return pool[key % pool.length];
  }
  function ptsFor(m){
    const s = Store.state;
    let pts = SOCO.basePts(m);
    if (!s.eaten[m.id]) pts *= 2;                       // first taste ×2
    if (lagniappe().id === m.id) pts = Math.round(pts * 1.5); // daily lagniappe
    return Math.round(pts);
  }
  function levelFor(pts){
    let lvl = SOCO.LEVELS[0];
    for (const l of SOCO.LEVELS) if (pts >= l.at) lvl = l;
    return lvl;
  }
  function nextLevel(pts){
    return SOCO.LEVELS.find(l => l.at > pts) || null;
  }

  /* ---------- the one true way to log a dish ---------- */
  function logDish(id, source, silent){
    const s = Store.state;
    const m = SOCO.item(id);
    if (!m) return 0;
    const before = levelFor(s.points);
    const pts = ptsFor(m);
    const first = !s.eaten[id];

    const e = s.eaten[id] || { count: 0, first: Date.now() };
    e.count++; e.last = Date.now();
    s.eaten[id] = e;
    s.points += pts;
    s.lifetimePoints += pts;
    s.log.push({ id, ts: Date.now(), pts, source: source || "manual" });

    // badges
    const newBadges = [];
    for (const b of SOCO.BADGES){
      if (!s.badges[b.id] && b.test(s)){ s.badges[b.id] = Date.now(); newBadges.push(b); }
    }
    const after = levelFor(s.points);
    Store.save();

    if (!silent){
      App.notify(`<b>+${pts} pts</b> — ${esc(m.name)}${first ? " · first taste ×2! 🎉" : ""}`, m.emoji, 2600);
      if (newBadges.length || after !== before) confetti(after !== before ? 160 : 90);
      newBadges.forEach((b,i) => setTimeout(() =>
        App.notify(`Badge unlocked: <b>${esc(b.name)}</b><br><span class="dim">${esc(b.desc)}</span>`, b.icon, 4200), 500 + i*700));
      if (after !== before) setTimeout(() =>
        App.notify(`LEVEL UP! You're now a <b>${esc(after.name)}</b> ${after.icon}`, "🎺", 4600), 400);
      App.refresh();
    }
    return pts;
  }

  /* ---------- confetti (Mardi Gras beads) ---------- */
  function confetti(n = 110){
    const cv = document.getElementById("confetti");
    const phone = document.getElementById("phone");
    const r = phone.getBoundingClientRect();
    cv.width = r.width; cv.height = r.height;
    cv.style.display = "block";
    const ctx = cv.getContext("2d");
    const colors = ["#ffc93c","#b28dff","#3ecf7c","#ff8fd6","#ffffff"];
    const parts = Array.from({length:n}, () => ({
      x: Math.random()*r.width, y: -20 - Math.random()*r.height*0.4,
      vy: 2.4 + Math.random()*3.4, vx: -1.4 + Math.random()*2.8,
      rot: Math.random()*Math.PI, vr: -0.14 + Math.random()*0.28,
      s: 4 + Math.random()*6, c: colors[Math.floor(Math.random()*colors.length)],
      bead: Math.random() < 0.3
    }));
    const t0 = performance.now();
    (function tick(t){
      const el = t - t0;
      ctx.clearRect(0,0,cv.width,cv.height);
      for (const p of parts){
        p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vy += 0.045;
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c;
        if (p.bead){ // little 3-bead string
          for (let i=-1;i<=1;i++){ ctx.beginPath(); ctx.arc(i*p.s*0.9, 0, p.s*0.42, 0, 7); ctx.fill(); }
        } else {
          ctx.fillRect(-p.s/2, -p.s/3, p.s, p.s*0.66);
        }
        ctx.restore();
      }
      if (el < 2100) requestAnimationFrame(tick);
      else { ctx.clearRect(0,0,cv.width,cv.height); cv.style.display = "none"; }
    })(t0);
  }

  /* ---------- streetcar map ---------- */
  function railMap(){
    const s = Store.state;
    const W = 380, X = [46, 118, 190, 262, 334], ROW = 62, HEAD = 34, PAD = 12;
    let y = 26, svg = "", legend = [];
    const questCats = SOCO.CATS.filter(c => SOCO.MENU.some(m => m.cat === c.id && m.quest !== false));

    for (const c of questCats){
      const items = SOCO.MENU.filter(m => m.cat === c.id && m.quest !== false);
      const done = items.filter(m => s.eaten[m.id]).length;
      legend.push({ c, done, total: items.length });

      // header
      svg += `<text x="14" y="${y}" font-size="12" font-weight="800" fill="${c.color}" letter-spacing="1.5">🚋 ${esc(c.line.toUpperCase())}</text>
              <text x="${W-14}" y="${y}" font-size="11" font-weight="700" fill="#9a87c7" text-anchor="end">${done}/${items.length}</text>`;
      y += 16;

      // station coordinates (serpentine, 5 per row)
      const pts = items.map((m,i) => {
        const row = Math.floor(i/5), col = i%5;
        const x = X[row % 2 === 0 ? col : 4-col];
        return { m, x, y: y + row*ROW + 18 };
      });

      // path through stations with elbow turns
      let d = `M ${pts[0].x} ${pts[0].y}`;
      for (let i=1; i<pts.length; i++){
        const a = pts[i-1], b = pts[i];
        d += a.y === b.y ? ` L ${b.x} ${b.y}` : ` L ${a.x} ${(a.y+b.y)/2} L ${b.x} ${(a.y+b.y)/2} L ${b.x} ${b.y}`;
      }
      svg += `<path d="${d}" fill="none" stroke="#241345" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>`;
      svg += `<path d="${d}" fill="none" stroke="${c.color}" stroke-width="5" stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>`;

      // stations
      for (const p of pts){
        const ate = !!s.eaten[p.m.id];
        svg += `<g onclick="App.openItem('${p.m.id}')" style="cursor:pointer">
          ${ate ? `<circle cx="${p.x}" cy="${p.y}" r="15" fill="${c.color}" opacity=".22"/>` : ""}
          <circle cx="${p.x}" cy="${p.y}" r="10.5" fill="${ate ? "#ffc93c" : "#2a1852"}" stroke="${ate ? "#fff2c9" : c.color}" stroke-width="3"/>
          <text x="${p.x}" y="${p.y+0.5}" font-size="${ate ? 10 : 9}" text-anchor="middle" dominant-baseline="central">${ate ? "✓" : p.m.emoji}</text>
          <text x="${p.x}" y="${p.y+24}" font-size="7.2" text-anchor="middle" fill="${ate ? "#ffc93c" : "#9a87c7"}" font-weight="${ate?"700":"400"}">${esc(shortName(p.m.name))}</text>
        </g>`;
      }
      y += Math.ceil(items.length/5)*ROW + PAD;
    }
    return { svg: `<svg id="railmap" viewBox="0 0 ${W} ${y}" xmlns="http://www.w3.org/2000/svg">${svg}</svg>`, legend };
  }
  function shortName(n){
    n = n.replace(/ w\/.*$/i,"").replace(/\(.*\)/,"").trim();
    return n.length > 15 ? n.slice(0,14) + "…" : n;
  }

  /* ---------- quest screen ---------- */
  function renderQuest(el){
    const s = Store.state;
    const lvl = levelFor(s.points), nxt = nextLevel(s.points);
    const pct = nxt ? Math.min(100, Math.round(((s.points - lvl.at) / (nxt.at - lvl.at)) * 100)) : 100;
    const lag = lagniappe();
    const q = SOCO.questItems();
    const eaten = q.filter(m => s.eaten[m.id]).length;
    const map = railMap();
    const wholePct = Math.round(eaten / q.length * 100);

    const badgesHtml = SOCO.BADGES.map(b => `
      <div class="badge ${s.badges[b.id] ? "won" : ""}">
        <div class="bi">${b.icon}</div>
        <div class="bn">${esc(b.name)}</div>
        <div class="bd">${esc(b.desc)}</div>
      </div>`).join("");

    el.innerHTML = `
      <h1 class="mt6">The SoCo Streetcar Challenge</h1>
      <div class="sub">Eat your way down every line. ${q.length} dishes. One legend.</div>

      <div class="card levelcard mt10">
        <div class="lvlrow">
          <div class="lvlicon">${lvl.icon}</div>
          <div class="grow">
            <div class="lvlname">${esc(lvl.name)}</div>
            <div class="lvlpts">${s.points.toLocaleString()} pts${nxt ? ` · ${(nxt.at - s.points).toLocaleString()} to ${esc(nxt.name)}` : " · MAX LEVEL"}</div>
          </div>
          <div style="text-align:right"><div class="big" style="font-size:22px;font-weight:800;color:var(--gold)">${wholePct}%</div><div class="lbl" style="font-size:9.5px;color:var(--ink-faint);text-transform:uppercase;letter-spacing:.8px">menu eaten</div></div>
        </div>
        <div class="progress"><i style="width:${pct}%"></i></div>
        <div class="progress-lbl"><span>${lvl.icon} ${esc(lvl.name)}</span><span>${nxt ? `${nxt.icon} ${esc(nxt.name)}` : "👑 legend status"}</span></div>
      </div>

      <div class="card lagcard mt10">
        <div class="lag-k">🎁 Today's Lagniappe — "a little something extra"</div>
        <div class="lag-dish">
          <span class="lag-e">${lag.emoji}</span>
          <div class="grow"><h3>${esc(lag.name)}</h3><div class="sub" style="font-size:11px">Worth <b style="color:var(--gold)">+50% points</b> today only</div></div>
          <button class="btn small gold" onclick="App.openItem('${lag.id}')">View</button>
        </div>
      </div>

      <h2>Route map <span class="rule"></span></h2>
      <div class="card mapcard">
        <div class="maplegend">${map.legend.map(l => `<span class="lg"><i style="background:${l.c.color}"></i>${esc(l.c.line)} ${l.done}/${l.total}</span>`).join("")}</div>
        ${map.svg}
        <div class="sub center" style="padding:6px 0 10px;font-size:10.5px">Tap any station to see the dish · gold ✓ = conquered</div>
      </div>

      <h2>Badges <span class="rule"></span></h2>
      <div class="badges">${badgesHtml}</div>

      <h2>Your flavor profile <span class="rule"></span></h2>
      ${eaten ? `
        <div class="ig card"><div class="igtitle"><span class="accent"></span>Flavor DNA — what you actually love</div>${IG.radar(userDNA())}</div>
        <div class="ig card mt10"><div class="igtitle"><span class="accent"></span>Line-by-line progress</div>${IG.rings()}</div>
        <div class="ig card mt10"><div class="igtitle"><span class="accent"></span>Spice tolerance over time</div>${IG.spiceSpark()}
          <div class="sub center mt6" style="font-size:10.5px">Average 🌶 rating of your last 12 dishes</div></div>`
      : `<div class="card"><div class="empty"><span class="e">🧬</span>Log your first dish and your personal Flavor DNA appears here.</div></div>`}

      <div class="center mt14">
        <button class="btn small ghost" style="color:var(--ink-faint)" onclick="Game.resetConfirm()">Reset quest progress</button>
      </div>`;
  }

  function userDNA(){
    const s = Store.state;
    const keys = ["heat","crunch","comfort","fresh","rich","sweet"];
    const out = {}; let w = 0;
    keys.forEach(k => out[k] = 0);
    for (const [id, e] of Object.entries(s.eaten)){
      const m = SOCO.item(id); if (!m) continue;
      keys.forEach(k => out[k] += m.dna[k] * e.count);
      w += e.count;
    }
    if (w) keys.forEach(k => out[k] = +(out[k]/w).toFixed(1));
    return out;
  }

  function resetConfirm(){
    document.getElementById("sheet").innerHTML = `
      <div class="grab"></div>
      <h2>Reset everything?</h2>
      <div class="sub mt6">Points, badges, eaten dishes, vouchers and the Toast demo link all go back to zero. The menu stays delicious.</div>
      <div class="btnrow mt14">
        <button class="btn grow" onclick="App.closeSheet()">Keep my progress</button>
        <button class="btn grow" style="background:rgba(255,107,94,.15);border-color:rgba(255,107,94,.5);color:var(--red)" onclick="Store.reset();App.closeSheet();App.refresh();App.notify('Fresh plate. Welcome back, Tourist. 🧳','🔄')">Reset it all</button>
      </div>`;
    document.getElementById("sheetwrap").classList.add("open");
  }

  return { logDish, ptsFor, levelFor, nextLevel, lagniappe, confetti, renderQuest, userDNA, resetConfirm };
})();
