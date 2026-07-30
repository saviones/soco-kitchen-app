/* ============================================================
   Tenant loader
   ------------------------------------------------------------
   Turns the plain data in tenants/<id>/config.js into the runtime
   SOCO.* API the app screens consume.

   Deliberately keeps the SOCO global name and shape: every screen
   (app.js, game.js, infographics.js, toast-*.js) reads SOCO.MENU,
   SOCO.item(), SOCO.BADGES[].test(state) and so on, and none of
   them needed to change to become multi-tenant.

   Swapping tenants is a one-line change in index.html today. When
   tenants become dynamic, replace the <script> with a fetch of
   tenants/<id>/config.json — nothing downstream cares.
   ============================================================ */
const SOCO = (() => {
  const T = window.TENANT_CONFIG;
  if (!T) throw new Error("[tenant] no TENANT_CONFIG loaded — check <script> order in index.html");

  const api = {
    id:      T.id || "unknown",
    LIVE_API: T.LIVE_API || "",
    BRAND:    T.BRAND || {},
    LOCATIONS: T.LOCATIONS || [],
    CATS:      T.CATS || [],
    MENU:      T.MENU || [],
    LEVELS:    T.LEVELS || [],
    /* a tenant that does not want a rewards programme sets this false;
       the Rewards tab hides itself rather than showing an empty ladder */
    REWARDS_ENABLED: T.REWARDS_ENABLED !== false,
  };
  api.REWARDS = api.REWARDS_ENABLED ? (T.REWARDS || []) : [];

  /* ---- lookups ---- */
  api.item = id => api.MENU.find(m => m.id === id);
  api.cat  = id => api.CATS.find(c => c.id === id);
  api.loc  = id => api.LOCATIONS.find(l => l.id === id);
  api.questItems = () => api.MENU.filter(m => m.quest !== false);

  /* earn rate is per-tenant: 10 pts per dollar is SoCo's setting */
  const PPD = T.POINTS_PER_DOLLAR != null ? T.POINTS_PER_DOLLAR : 10;
  api.basePts = m => Math.round(m.price * PPD);
  api.POINTS_PER_DOLLAR = PPD;

  /* ---- badges: declarative rules compiled back into test(state) ---- */
  const menuCtx = { all: () => api.MENU, quest: () => api.questItems() };
  api.BADGES = (T.BADGES || []).map(b =>
    Object.assign({}, b, { test: Rules.compile(b.rule, menuCtx) }));

  return api;
})();
