/* ============================================================
   SoCo Kitchen App — hand-rolled SVG infographics
   ============================================================ */
const IG = (() => {
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));

  /* ---------- Flavor DNA radar (6 axes) ---------- */
  function radar(dna){
    const KEYS = [["heat","Heat","#ff6b5e"],["crunch","Crunch","#ffc93c"],["comfort","Comfort","#ff8fd6"],
                  ["fresh","Fresh","#3ecf7c"],["rich","Rich","#b28dff"],["sweet","Sweet","#5ec8ff"]];
    const cx = 160, cy = 112, R = 82;
    const pt = (i, v) => {
      const a = (-90 + i*60) * Math.PI/180;
      return [cx + Math.cos(a)*R*(v/10), cy + Math.sin(a)*R*(v/10)];
    };
    const ring = f => KEYS.map((_,i) => pt(i, 10*f).join(",")).join(" ");
    const user = KEYS.map(([k],i) => pt(i, Math.max(0.4, dna[k]||0)).join(",")).join(" ");
    return `<svg viewBox="0 0 320 224" xmlns="http://www.w3.org/2000/svg">
      ${[0.25,0.5,0.75,1].map(f => `<polygon points="${ring(f)}" fill="none" stroke="#3a2870" stroke-width="${f===1?1.5:1}" opacity="${f===1?.9:.55}"/>`).join("")}
      ${KEYS.map((_,i) => { const [x,y] = pt(i,10); return `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#3a2870" stroke-width="1" opacity=".5"/>`; }).join("")}
      <polygon points="${user}" fill="rgba(255,201,60,.22)" stroke="#ffc93c" stroke-width="2.5" stroke-linejoin="round"/>
      ${KEYS.map(([k],i) => { const [x,y] = pt(i, Math.max(0.4, dna[k]||0)); return `<circle cx="${x}" cy="${y}" r="4" fill="#ffc93c" stroke="#160b2e" stroke-width="1.5"/>`; }).join("")}
      ${KEYS.map(([k,l,c],i) => {
        const a = (-90 + i*60) * Math.PI/180;
        const x = cx + Math.cos(a)*(R+22), y = cy + Math.sin(a)*(R+20);
        return `<text x="${x}" y="${y}" font-size="11" font-weight="700" fill="${c}" text-anchor="middle" dominant-baseline="central">${l}</text>
                <text x="${x}" y="${y+13}" font-size="9" fill="#9a87c7" text-anchor="middle">${(dna[k]||0).toFixed(1)}</text>`;
      }).join("")}
    </svg>`;
  }

  /* ---------- category progress donuts ---------- */
  function rings(){
    const s = Store.state;
    const cats = SOCO.CATS.filter(c => SOCO.MENU.some(m => m.cat === c.id && m.quest !== false));
    const r = 26, C = 2*Math.PI*r;
    const cell = (c, i) => {
      const items = SOCO.MENU.filter(m => m.cat === c.id && m.quest !== false);
      const done = items.filter(m => s.eaten[m.id]).length;
      const pct = done/items.length;
      const x = 55 + (i%3)*105, y = 46 + Math.floor(i/3)*112;
      return `
        <g transform="translate(${x},${y})">
          <circle r="${r}" fill="none" stroke="#241345" stroke-width="9"/>
          <circle r="${r}" fill="none" stroke="${c.color}" stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${(pct*C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90)"/>
          <text y="1" font-size="13" font-weight="800" fill="#f6efff" text-anchor="middle" dominant-baseline="central">${Math.round(pct*100)}%</text>
          <text y="44" font-size="14" text-anchor="middle">${c.emoji}</text>
          <text y="58" font-size="8.5" fill="#9a87c7" text-anchor="middle">${esc(c.name)}</text>
          <text y="69" font-size="8" font-weight="700" fill="${c.color}" text-anchor="middle">${done}/${items.length}</text>
        </g>`;
    };
    return `<svg viewBox="0 0 320 ${Math.ceil(cats.length/3)*112 + 8}" xmlns="http://www.w3.org/2000/svg">${cats.map(cell).join("")}</svg>`;
  }

  /* ---------- spice tolerance sparkline ---------- */
  function spiceSpark(){
    const s = Store.state;
    const entries = s.log.slice(-12).map(l => ({ sp: (SOCO.item(l.id) || {spice:0}).spice }));
    const n = entries.length;
    const W = 320, H = 104, x0 = 26, x1 = W-14, y = sp => 84 - sp*22;
    const xs = i => n === 1 ? (x0+x1)/2 : x0 + (x1-x0) * i/(n-1);
    const cols = ["#3ecf7c","#ffc93c","#ff9d5e","#ff6b5e"];
    const pts = entries.map((e,i) => `${xs(i)},${y(e.sp)}`).join(" ");
    return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      ${[0,1,2,3].map(sp => `<line x1="${x0-4}" y1="${y(sp)}" x2="${x1}" y2="${y(sp)}" stroke="#241345" stroke-width="1"/>
        <text x="${x0-8}" y="${y(sp)}" font-size="9" fill="#9a87c7" text-anchor="end" dominant-baseline="central">${sp ? "🌶".repeat(sp) : "0"}</text>`).join("")}
      ${n > 1 ? `<polyline points="${pts}" fill="none" stroke="#ff8fd6" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>` : ""}
      ${entries.map((e,i) => `<circle cx="${xs(i)}" cy="${y(e.sp)}" r="4.5" fill="${cols[e.sp]}" stroke="#160b2e" stroke-width="1.5"/>`).join("")}
    </svg>`;
  }

  /* ---------- stylized Bay Area map ---------- */
  function bayMap(homeId){
    const mark = SOCO.LOCATIONS.map(l => {
      const home = l.id === homeId;
      return `<g onclick="App.setHomeLoc('${l.id}')" style="cursor:pointer">
        ${home ? `<circle cx="${l.mapX}" cy="${l.mapY}" r="13" fill="none" stroke="#ffc93c" stroke-width="2" opacity=".9">
          <animate attributeName="r" values="10;17;10" dur="2.2s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values=".9;0;.9" dur="2.2s" repeatCount="indefinite"/></circle>` : ""}
        <circle cx="${l.mapX}" cy="${l.mapY}" r="9.5" fill="${home ? "#ffc93c" : "#2a1852"}" stroke="${home ? "#fff2c9" : "#b28dff"}" stroke-width="2.5"/>
        <text x="${l.mapX}" y="${l.mapY+0.5}" font-size="9" text-anchor="middle" dominant-baseline="central">⚜️</text>
        <text x="${l.mapX + (l.id==="al" ? -14 : 14)}" y="${l.mapY+1}" font-size="10.5" font-weight="700"
          fill="${home ? "#ffc93c" : "#c9b8ec"}" text-anchor="${l.id==="al" ? "end" : "start"}">${esc(l.name)}</text>
      </g>`;
    }).join("");
    return `<svg viewBox="0 0 320 300" xmlns="http://www.w3.org/2000/svg">
      <rect width="320" height="300" rx="14" fill="#20113f"/>
      <path d="M0 0 H58 C50 40 62 70 54 108 C48 140 60 190 48 234 C42 262 50 284 44 300 H0 Z" fill="#170c31"/>
      <path d="M120 0 C132 26 128 52 142 74 C158 98 148 128 162 152 C176 176 172 200 188 226 C200 246 216 258 226 276 C230 284 232 292 233 300 L200 300 C196 280 184 262 172 244 C158 222 150 196 140 172 C128 146 132 118 122 92 C114 68 108 32 104 0 Z" fill="#170c31" stroke="#43307a" stroke-width="1.2"/>
      <line x1="58" y1="74" x2="104" y2="82" stroke="#ffc93c" stroke-width="3" stroke-linecap="round" opacity=".85"/>
      <text x="66" y="64" font-size="8.5" fill="#9a87c7">Golden Gate</text>
      <text x="78" y="130" font-size="10" font-weight="700" fill="#6a51b0">SF</text>
      <text x="196" y="176" font-size="10" font-weight="700" fill="#6a51b0">EAST BAY</text>
      <text x="258" y="292" font-size="10" font-weight="700" fill="#6a51b0">SOUTH BAY</text>
      ${mark}
    </svg>`;
  }

  /* ---------- fan favorites bars ---------- */
  function hitParade(){
    const top = [...SOCO.MENU].sort((a,b) => b.pop - a.pop).slice(0,8);
    const W = 320, rowH = 30;
    return `<svg viewBox="0 0 ${W} ${top.length*rowH + 6}" xmlns="http://www.w3.org/2000/svg">
      ${top.map((m,i) => {
        const y = i*rowH + 4, w = (m.pop/10) * 170;
        return `<g onclick="App.openItem('${m.id}')" style="cursor:pointer">
          <text x="2" y="${y+13}" font-size="13">${m.emoji}</text>
          <text x="24" y="${y+9}" font-size="9.5" font-weight="600" fill="#c9b8ec">${esc(m.name.length>26 ? m.name.slice(0,25)+"…" : m.name)}</text>
          <rect x="24" y="${y+13}" width="${170}" height="7" rx="3.5" fill="#241345"/>
          <rect x="24" y="${y+13}" width="${w}" height="7" rx="3.5" fill="url(#hitg)"/>
          <text x="${200}" y="${y+20}" font-size="9" font-weight="800" fill="#ffc93c">${m.pop}/10</text>
          <text x="${W-4}" y="${y+20}" font-size="9.5" font-weight="700" fill="#9a87c7" text-anchor="end">${App.money(m.price)}</text>
        </g>`;
      }).join("")}
      <defs><linearGradient id="hitg" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#e8a20c"/><stop offset="1" stop-color="#ffc93c"/>
      </linearGradient></defs>
    </svg>`;
  }

  return { radar, rings, spiceSpark, bayMap, hitParade };
})();
