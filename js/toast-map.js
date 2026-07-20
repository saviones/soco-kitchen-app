/* ============================================================
   SoCo Kitchen App — Toast item-name → app-menu-id mapping
   ------------------------------------------------------------
   Toast has 4 menus (in-house/online, catering, 2 delivery-app
   menus) and item names drift between them ("Cajun Crab Fries",
   "Half Cajun Crab Fries", "Crab Cajun Fries" are all the same
   dish). Orders can arrive with any variant, so everything joins
   on a normalized name → SOCO.MENU id table. Unmatched names
   still earn generic points, they just don't light quest stations.
   ============================================================ */
const ToastMap = (() => {

  /* lowercase, strip accents & punctuation, collapse spaces */
  const norm = s => String(s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ").trim();

  const ALIASES = {
    /* sides */
    "hush puppies": "hush-puppies",
    "green beans": "green-beans",
    "brussels sprouts": "brussels",
    "brussles sprouts": "brussels",
    "side jambalaya": "jambalaya-cup",
    "jambalaya cup": "jambalaya-cup",
    "side crawfish etouffee": "etouffee-cup",
    "crawfish etouffee cup": "etouffee-cup",
    "side gumbo": "gumbo-cup",
    "seafood gumbo cup": "gumbo-cup",
    "side red beans rice": "red-beans",
    "red beans rice": "red-beans",
    "red beans rice w sausage": "red-beans",
    "mac cheese": "mac-cheese",
    "mac n cheese": "mac-cheese",
    "large mac n cheese": "mac-cheese",
    "cajun fries": "cajun-fries",
    "side cajun fry": "cajun-fries",
    "regular fries": "regular-fries",
    "side reg fry": "regular-fries",
    /* salads */
    "soco house salad": "house-salad",
    "shrimp remoulade salad": "shrimp-remoulade-salad",
    /* classics */
    "crab cajun fries": "crab-cajun-fries",
    "cajun crab fries": "crab-cajun-fries",
    "half cajun crab fries": "crab-cajun-fries",
    "fried catfish w cajun fries": "fried-catfish",
    "catfish w cajun fries": "fried-catfish",
    "fried shrimp w cajun fries": "fried-shrimp",
    "shrimp w cajun fries": "fried-shrimp",
    "fried oysters w cajun fries": "fried-oysters",
    "oysters w cajun fries": "fried-oysters",
    "soft shell crab w cajun fries": "soft-shell-crab",
    "50 50 w cajun fries": "fifty-fifty",
    "seafood platter": "seafood-platter",
    "seafood platter w cajun fries": "seafood-platter",
    "fried chicken strips w cajun fries": "chicken-strips",
    "chicken strips w cajun fries": "chicken-strips",
    "jambalaya": "jambalaya",
    "chicken sausage jambalaya": "jambalaya",
    "seafood gumbo": "gumbo",
    "crawfish etouffee": "etouffee",
    "gulf shrimp etouffee": "etouffee",   /* renamed on the live menu */
    "blackened fish platter": "blackened-fish-platter",
    "crawfish pasta": "crawfish-pasta",
    "creamy creole pasta": "crawfish-pasta", /* renamed on the live menu */
    "blackened shrimp w grits": "blackened-shrimp",
    "blackened shrimp w rice": "blackened-shrimp",
    "blackened shrimp w grits or rice": "blackened-shrimp",
    "who dat shrimp w cajun fries": "who-dat",
    "who dat chicken strips w cajun fries": "who-dat",
    "who dat shrimp or chicken": "who-dat",
    "who dat 50 50": "who-dat",
    "who dat chicken sandwich": "who-dat",
    "lil weezy shrimp w cajun fries": "lil-weezy",
    "lil weezy chicken strips w cajun fries": "lil-weezy",
    "lil weezy shrimp or chicken": "lil-weezy",
    "lil weezy 50 50": "lil-weezy",
    "weezy chicken sandwich": "lil-weezy",
    /* sandwiches */
    "southern fried chicken sandwich": "fried-chicken-sandwich",
    "grilled blackened chicken sandwich": "blackened-chicken-sandwich",
    "blackened chicken sandwich": "blackened-chicken-sandwich",
    "muffaletta": "muffaletta",
    "quarter muffaletta": "muffaletta",
    /* po' boys */
    "fried shrimp po boy": "shrimp-poboy",
    "shrimp po boy": "shrimp-poboy",
    "fried catfish po boy": "catfish-poboy",
    "catfish po boy": "catfish-poboy",
    "fried oyster po boy": "oyster-poboy",
    "oyster po boy": "oyster-poboy",
    "fried soft shell crab po boy": "crab-poboy",
    "classic po boy": "crab-poboy",       /* live menu's name for the soft-shell classic */
    "grilled blackened fish po boy": "blackened-fish-poboy",
    "blackened fish po boy": "blackened-fish-poboy",
    "blackened shrimp po boy": "blackened-shrimp-poboy",
    /* desserts */
    "3 beignets": "beignets",
    "3 beignets sunday only": "beignets",
    "linda b s bread pudding": "bread-pudding",
    "stevie b s carrot cake": "carrot-cake",
    "whole carrot cake": "carrot-cake",
    /* drinks */
    "fountain drink": "fountain",
    "fountain drinks": "fountain",
    "coca cola": "fountain",
    "diet coke": "fountain",
    "sprite": "fountain",
    "fanta orange": "fountain",
    "root beer": "fountain",
    "rootbeer": "fountain",
    "brown sugar lemonade": "lemonade",
    "sweet tea": "tea",
    "ice tea": "tea",
    "sweet ice tea": "tea",
    "iced tea sweet tea": "tea",
    "arnold palmer": "tea",
    "abita beer": "beers",
    "new orleans beers": "beers",
    "wine": "wines",
    "wines": "wines",
    "dark horse saul blanc": "wines",
    "dark horse rose": "wines",
    "dark horse point noir": "wines",
  };

  /* returns a SOCO.MENU id or null */
  function match(name) {
    const n = norm(name);
    if (ALIASES[n]) return ALIASES[n];
    // exact match against app menu names as a fallback
    const hit = SOCO.MENU.find(m => norm(m.name) === n);
    return hit ? hit.id : null;
  }

  return { match, norm };
})();
