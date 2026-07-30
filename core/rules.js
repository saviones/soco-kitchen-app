/* ============================================================
   Badge rule evaluator — tenant-agnostic
   ------------------------------------------------------------
   Tenant configs describe badges as data, not code, so they can
   be stored as JSON and edited without shipping JavaScript.
   compile() turns a rule into the test(state) function the quest
   engine already expects.

   A rule is { type, ...args }. Unknown types evaluate false and
   warn rather than throwing — one bad badge in a tenant config
   should never take the whole app down.
   ============================================================ */
const Rules = (() => {

  /* field filters: { gte, lte, eq } */
  function cmp(val, f) {
    if (val == null) return false;
    if (f.gte !== undefined && !(val >= f.gte)) return false;
    if (f.lte !== undefined && !(val <= f.lte)) return false;
    if (f.eq  !== undefined && val !== f.eq)    return false;
    return true;
  }
  const matches = (item, where) =>
    Object.entries(where || {}).every(([k, f]) => cmp(item[k], f));

  const ate = (s, id) => !!(s.eaten && s.eaten[id]);

  /* menu = { all(), quest() } — supplied by core/tenant.js */
  const TYPES = {
    eaten_count: (r, menu, s) =>
      Object.keys(s.eaten || {}).length >= r.min,

    all_of: (r, menu, s) =>
      Array.isArray(r.ids) && r.ids.length > 0 && r.ids.every(id => ate(s, id)),

    category_complete: (r, menu, s) => {
      const items = menu.quest().filter(i => i.cat === r.cat);
      return items.length > 0 && items.every(i => ate(s, i.id));
    },

    count_where: (r, menu, s) =>
      menu.all().filter(i => matches(i, r.where) && ate(s, i.id)).length >= r.min,

    quest_pct: (r, menu, s) => {
      const q = menu.quest();
      return q.length > 0 &&
        q.filter(i => ate(s, i.id)).length >= Math.ceil(q.length * r.min / 100);
    },

    quest_complete: (r, menu, s) => {
      const q = menu.quest();
      return q.length > 0 && q.every(i => ate(s, i.id));
    },
  };

  function compile(rule, menu) {
    const fn = TYPES[rule && rule.type];
    if (!fn) {
      console.warn("[rules] unknown badge rule type:", rule && rule.type);
      return () => false;
    }
    return state => {
      try { return !!fn(rule, menu, state); }
      catch (e) { console.warn("[rules] rule threw:", rule.type, e); return false; }
    };
  }

  return { compile, types: Object.keys(TYPES) };
})();

/* worker-side reuse (backend imports this for server-authoritative badges) */
if (typeof module !== "undefined" && module.exports) module.exports = { Rules };
