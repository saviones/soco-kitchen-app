/* ============================================================
   SoCo Kitchen App — Data
   Menu transcribed from the real Castro Valley menu (socokitchen.net).
   Prices/items as of the posted menu; may vary by location.
   ============================================================ */

const SOCO = {};

/* Deployed Toast proxy URL (backend/worker.js on Cloudflare Workers).
   Empty = demo mode. When running locally, toast-live.js auto-uses
   http://localhost:8788 (node backend/dev-server.mjs). */
SOCO.LIVE_API = "";

SOCO.BRAND = {
  name: "Southern Comfort Kitchen",
  short: "SoCo Kitchen",
  tagline: "Comfort In Every Bite!",
  sub: "Where Bay Area Meets New Orleans",
  founded: 2013,
  story: "Three brothers born in New Orleans brought their family recipes west. What started as a single food truck rolling through the Bay is now four kitchens, a catering crew, and a whole lot of gumbo.",
  site: "https://socokitchen.net",
  instagram: "https://www.instagram.com/socokitchen",
  tiktok: "https://www.tiktok.com/@soco.kitchen",
  cateringUrl: "https://www.toasttab.com/catering/locations/78229fe2-c3cd-46dd-9a08-2a219714714c"
};

/* ---- Locations (hours: [Sun..Sat] as [openMin, closeMin] or null=closed) ---- */
SOCO.LOCATIONS = [
  {
    id: "cv", name: "Castro Valley", tag: "The Flagship · Since 2013",
    addr: "3571 Castro Valley Blvd, Castro Valley, CA 94546",
    phone: "(510) 397-6705",
    toast: "https://order.toasttab.com/online/southern-comfort-kitchen-castro-valley-3571-castro-valley-blvd",
    hours: [[660,1140],[660,1230],[660,1230],[660,1230],[660,1230],[660,1260],[660,1230]],
    lat: 37.6955, lng: -122.0790, mapX: 196, mapY: 132
  },
  {
    id: "ph", name: "Pleasant Hill", tag: "Crescent Drive",
    addr: "55 Crescent Dr Ste F, Pleasant Hill, CA 94523",
    phone: "(925) 849-4170",
    toast: "https://order.toasttab.com/online/southern-comfort-kitchen-pleasant-hill-55-crescent-drive",
    hours: [[660,1140],null,[660,1230],[660,1230],[660,1230],[660,1230],[660,1230]],
    lat: 37.9530, lng: -122.0620, mapX: 208, mapY: 52
  },
  {
    id: "al", name: "Alameda", tag: "Drive-Thru + Patio",
    addr: "1708 Webster St, Alameda, CA 94501",
    phone: "(510) 995-8900",
    toast: "https://www.toasttab.com/southern-comfort-kitchen-alameda-1708-webster-street",
    hours: [[660,1260],[660,1260],[660,1260],[660,1260],[660,1260],[660,1380],[660,1380]],
    lat: 37.7726, lng: -122.2778, mapX: 128, mapY: 108
  },
  {
    id: "sj", name: "San Jose", tag: "San Pedro Square · Newest",
    addr: "100 N Almaden Ave, San Jose, CA 95110",
    phone: null,
    toast: "https://order.toasttab.com/online/southern-comfort-kitchen-san-jose-new-100-n-almaden-ave",
    hours: [[660,1260],[660,1260],[660,1260],[660,1260],[660,1260],[660,1380],[660,1380]],
    lat: 37.3375, lng: -121.8944, mapX: 236, mapY: 268
  }
];

/* ---- Menu ----
   dna: heat/crunch/comfort/fresh/rich/sweet, each 0-10 (editorial, for fun)
   pop: fan-favorite score 1-10 (editorial)
   quest: counts toward "eat the whole menu" (drinks don't)
---- */
SOCO.CATS = [
  { id: "sides",      name: "Starters & Sides",    line: "St. Charles Line",  color: "#3ecf7c", emoji: "🍟" },
  { id: "salads",     name: "Salads",              line: "Esplanade Line",    color: "#a7e163", emoji: "🥗" },
  { id: "classics",   name: "New Orleans Classics",line: "Canal St. Line",    color: "#ff6b5e", emoji: "🍲" },
  { id: "sandwiches", name: "Sandwiches",          line: "Magazine St. Line", color: "#5ec8ff", emoji: "🥪" },
  { id: "poboys",     name: "Po' Boys",            line: "Bourbon St. Line",  color: "#ffc93c", emoji: "🥖" },
  { id: "desserts",   name: "Desserts",            line: "Riverfront Line",   color: "#ff8fd6", emoji: "🍰" },
  { id: "drinks",     name: "Drinks",              line: "Frenchmen St. Line",color: "#b28dff", emoji: "🥤" }
];

SOCO.MENU = [
  /* -------- Starters & Sides -------- */
  { id:"hush-puppies", cat:"sides", name:"Hush Puppies", price:8, emoji:"🌽",
    desc:"Savory deep-fried balls made from corn meal batter.",
    spice:0, pop:7, dna:{heat:1,crunch:8,comfort:7,fresh:1,rich:5,sweet:3}, pair:"lemonade" },
  { id:"green-beans", cat:"sides", name:"Green Beans", price:8, emoji:"🫛",
    desc:"Fresh blackened green beans with a touch of garlic.",
    spice:1, pop:6, dna:{heat:2,crunch:5,comfort:4,fresh:8,rich:2,sweet:1}, pair:"blackened-fish-platter" },
  { id:"brussels", cat:"sides", name:"Brussels Sprouts", price:8, emoji:"🥬",
    desc:"Fried crispy with sea salt, pepper & a drizzle of maple syrup.",
    spice:0, pop:8, dna:{heat:1,crunch:8,comfort:5,fresh:6,rich:3,sweet:5}, pair:"blackened-fish-platter" },
  { id:"jambalaya-cup", cat:"sides", name:"Jambalaya (Cup)", price:8, emoji:"🍚",
    desc:"A starter cup of the famous chicken & sausage jambalaya.",
    spice:2, pop:7, dna:{heat:5,crunch:1,comfort:9,fresh:2,rich:7,sweet:1}, pair:"lemonade" },
  { id:"etouffee-cup", cat:"sides", name:"Crawfish Étouffée (Cup)", price:8, emoji:"🦞",
    desc:"A starter cup of Louisiana crawfish tails in rich sauce.",
    spice:2, pop:6, dna:{heat:5,crunch:0,comfort:9,fresh:2,rich:8,sweet:1}, pair:"tea" },
  { id:"gumbo-cup", cat:"sides", name:"Seafood Gumbo (Cup)", price:8, emoji:"🥣",
    desc:"A starter cup of the seafood gumbo with shrimp, cod & rock crab.",
    spice:1, pop:7, dna:{heat:4,crunch:0,comfort:9,fresh:3,rich:7,sweet:0}, pair:"beers" },
  { id:"red-beans", cat:"sides", name:"Red Beans & Rice", price:8, emoji:"🫘", img:"assets/food/red-beans.jpg",
    desc:"New Orleans red beans and rice cooked low & slow with ham hocks, topped with grilled beef & pork andouille sausage.",
    spice:1, pop:9, dna:{heat:3,crunch:1,comfort:10,fresh:1,rich:8,sweet:1}, pair:"lemonade" },
  { id:"mac-cheese", cat:"sides", name:"Mac & Cheese", price:8, emoji:"🧀", img:"assets/food/mac-cheese.jpg",
    desc:"3-cheese sauce topped with toasted bread crumbs.",
    spice:0, pop:9, dna:{heat:0,crunch:3,comfort:10,fresh:0,rich:10,sweet:1}, pair:"who-dat" },
  { id:"cajun-fries", cat:"sides", name:"Cajun Fries", price:7, emoji:"🍟",
    desc:"Fries tossed with a blend of 9 seasonings.",
    spice:2, pop:8, dna:{heat:5,crunch:9,comfort:8,fresh:0,rich:5,sweet:0}, pair:"fried-chicken-sandwich" },
  { id:"regular-fries", cat:"sides", name:"Regular Fries", price:6, emoji:"🍟",
    desc:"Fries with a touch of sea salt.",
    spice:0, pop:5, dna:{heat:0,crunch:9,comfort:8,fresh:0,rich:4,sweet:0}, pair:"fried-chicken-sandwich" },

  /* -------- Salads -------- */
  { id:"house-salad", cat:"salads", name:"SoCo House Salad", price:8, emoji:"🥗",
    desc:"Organic spring mix with roma tomatoes, cucumbers, carrots, croutons and candied walnuts. Choice of SoCo vinaigrette or blackened ranch.",
    spice:0, pop:5, dna:{heat:0,crunch:6,comfort:2,fresh:10,rich:1,sweet:3},
    options:{ label:"Make it a meal", choices:[
      {label:"Just the salad", delta:0},
      {label:"Add Southern Fried Chicken", delta:7},
      {label:"Add Blackened Grilled Chicken", delta:7},
      {label:"Add Blackened Shrimp", delta:7} ]},
    pair:"lemonade" },
  { id:"shrimp-remoulade-salad", cat:"salads", name:"Shrimp Remoulade Salad", price:15, emoji:"🍤",
    desc:"5 grilled shrimp over organic spring mix with roma tomatoes, celery, cucumbers & house-made blackened croutons. Served with remoulade dressing.",
    spice:1, pop:6, dna:{heat:2,crunch:5,comfort:3,fresh:9,rich:3,sweet:1}, pair:"wines" },

  /* -------- New Orleans Classics -------- */
  { id:"crab-cajun-fries", cat:"classics", name:"Crab Cajun Fries", price:16, emoji:"🦀", img:"assets/food/crab-fries.jpg",
    desc:"Cajun fries layered with Old Bay garlic aioli, fresh Pacific rock crab & a sprinkle of green onion.",
    spice:2, pop:10, dna:{heat:4,crunch:7,comfort:9,fresh:3,rich:9,sweet:1}, pair:"lemonade", signature:true },
  { id:"fried-catfish", cat:"classics", name:"Fried Catfish w/ Cajun Fries", price:16, emoji:"🐟",
    desc:"4 Mississippi catfish fillets tossed in seasoned corn meal & fried to crispy perfection.",
    spice:1, pop:8, dna:{heat:3,crunch:9,comfort:8,fresh:1,rich:7,sweet:0}, pair:"tea" },
  { id:"fried-shrimp", cat:"classics", name:"Fried Shrimp w/ Cajun Fries", price:15, emoji:"🍤",
    desc:"7 large Gulf shrimp tossed in seasoned corn flour & fried golden. Served with a side of remoulade sauce.",
    spice:1, pop:8, dna:{heat:3,crunch:8,comfort:7,fresh:2,rich:6,sweet:0}, pair:"lemonade" },
  { id:"fried-oysters", cat:"classics", name:"Fried Oysters w/ Cajun Fries", price:16, emoji:"🦪",
    desc:"4 Pacific oysters coated in seasoned organic corn flour & fried golden. Side of remoulade.",
    spice:1, pop:7, dna:{heat:3,crunch:8,comfort:6,fresh:3,rich:7,sweet:0}, pair:"beers" },
  { id:"soft-shell-crab", cat:"classics", name:"Soft Shell Crab w/ Cajun Fries", price:16, emoji:"🦀",
    desc:"Louisiana blue crab coated in seasoned organic corn flour & fried golden. Side of remoulade.",
    spice:1, pop:7, dna:{heat:3,crunch:8,comfort:6,fresh:3,rich:7,sweet:0}, pair:"wines" },
  { id:"fifty-fifty", cat:"classics", name:"50/50 w/ Cajun Fries", price:16, emoji:"⚖️",
    desc:"4 fresh large Gulf shrimp & 2 pieces of Mississippi catfish fried golden. Side of remoulade.",
    spice:1, pop:7, dna:{heat:3,crunch:8,comfort:7,fresh:2,rich:7,sweet:0}, pair:"tea" },
  { id:"seafood-platter", cat:"classics", name:"Seafood Platter", price:30, emoji:"🏆",
    desc:"The platter is fatter! 4 shrimp, 2 oysters, 2 catfish, 1 soft shell crab. Served with cajun fries & choice of 2 dipping sauces.",
    spice:1, pop:8, dna:{heat:3,crunch:9,comfort:8,fresh:3,rich:9,sweet:0}, pair:"beers", feast:true },
  { id:"chicken-strips", cat:"classics", name:"Fried Chicken Strips w/ Cajun Fries", price:14, emoji:"🍗",
    desc:"4 marinated chicken breast strips hand-battered in seasoned white flour & fried. Side of blackened ranch.",
    spice:0, pop:7, dna:{heat:1,crunch:8,comfort:8,fresh:0,rich:6,sweet:0}, pair:"fountain" },
  { id:"jambalaya", cat:"classics", name:"Chicken & Sausage Jambalaya", price:14, emoji:"🍚",
    desc:"Our famous Cajun rice dish with chunks of chicken, beef & pork andouille sausage & spices, topped with green onions.",
    spice:2, pop:9, dna:{heat:6,crunch:1,comfort:10,fresh:1,rich:8,sweet:0}, pair:"lemonade", signature:true },
  { id:"gumbo", cat:"classics", name:"Seafood Gumbo", price:15, emoji:"🥣",
    desc:"A seafood stew with Gulf shrimp, Pacific cod & rock crab. Topped with white rice & green onions. Served with French bread.",
    spice:1, pop:9, dna:{heat:4,crunch:0,comfort:10,fresh:3,rich:8,sweet:0}, pair:"beers", signature:true },
  { id:"blackened-fish-platter", cat:"classics", name:"Blackened Fish Platter", price:18, emoji:"🐟", img:"assets/food/blackened-fish.jpg",
    desc:"Pan-seared blackened rainbow trout with your choice of Brussels sprouts or red beans & rice with beef & pork sausage.",
    spice:2, pop:7, dna:{heat:5,crunch:3,comfort:6,fresh:6,rich:5,sweet:0}, pair:"wines" },
  { id:"etouffee", cat:"classics", name:"Crawfish Étouffée", price:15, emoji:"🦞",
    desc:"Louisiana crawfish tails smothered in a rich sauce. Topped with white rice & green onions. Served with French bread.",
    spice:2, pop:8, dna:{heat:5,crunch:0,comfort:10,fresh:1,rich:9,sweet:1}, pair:"tea" },
  { id:"crawfish-pasta", cat:"classics", name:"Crawfish Pasta", price:17, emoji:"🍝", img:"assets/food/crawfish-pasta.jpg",
    desc:"Pasta smothered in a spicy crawfish sauce with white wine, roma tomatoes, green onions & a dash of lemon.",
    spice:3, pop:7, dna:{heat:7,crunch:0,comfort:8,fresh:3,rich:9,sweet:0}, pair:"wines" },
  { id:"blackened-shrimp", cat:"classics", name:"Blackened Shrimp w/ Grits or Rice", price:16, emoji:"🍤", img:"assets/food/blackened-shrimp.jpg",
    desc:"7 large Gulf shrimp pan-seared in butter, rosemary, blackened seasoning & fresh garlic. Over seasoned rice or cheesy grits with green onions & French bread.",
    spice:2, pop:9, dna:{heat:6,crunch:1,comfort:8,fresh:3,rich:8,sweet:0},
    options:{ label:"Served over", choices:[{label:"Cheesy Grits", delta:0},{label:"Seasoned Rice", delta:0}] },
    pair:"lemonade" },
  { id:"who-dat", cat:"classics", name:"Who Dat Shrimp or Chicken", price:15, emoji:"⚜️", img:"assets/food/who-dat-shrimp.jpg",
    desc:"7 shrimp or 4 chicken strips fried in seasoned white flour & tossed in a sweet & spicy Creole sauce. With cajun fries, seasoned rice, grits or spring mix.",
    spice:3, pop:9, dna:{heat:8,crunch:6,comfort:8,fresh:1,rich:7,sweet:5},
    options:{ label:"Pick your player", choices:[{label:"Who Dat Shrimp", delta:0},{label:"Who Dat Chicken Strips", delta:0}] },
    pair:"tea", signature:true },
  { id:"lil-weezy", cat:"classics", name:"Lil Weezy Shrimp or Chicken", price:15, emoji:"🔥",
    desc:"7 shrimp or 4 chicken strips fried in seasoned white flour & tossed in a buttery hot sauce. With cajun fries, seasoned rice, grits or spring mix.",
    spice:3, pop:8, dna:{heat:9,crunch:6,comfort:7,fresh:1,rich:8,sweet:1},
    options:{ label:"Pick your player", choices:[{label:"Lil Weezy Shrimp", delta:0},{label:"Lil Weezy Chicken Strips", delta:0}] },
    pair:"lemonade" },

  /* -------- Sandwiches -------- */
  { id:"fried-chicken-sandwich", cat:"sandwiches", name:"Southern Fried Chicken Sandwich", price:14, emoji:"🥪", img:"assets/food/chicken-sandwich.jpg",
    desc:"Marinated chicken breast fried to perfection & served on a French bun dressed with our vinaigrette slaw & house-made Old Bay garlic aioli.",
    spice:1, pop:10, dna:{heat:2,crunch:8,comfort:9,fresh:3,rich:7,sweet:1}, pair:"lemonade", signature:true },
  { id:"blackened-chicken-sandwich", cat:"sandwiches", name:"Grilled Blackened Chicken Sandwich", price:14, emoji:"🥪",
    desc:"Grilled chicken breast with blackened seasonings, served on a French bun topped with spring mix, roma tomatoes, pickles & our original remoulade sauce.",
    spice:2, pop:7, dna:{heat:4,crunch:3,comfort:7,fresh:6,rich:5,sweet:0}, pair:"tea" },
  { id:"muffaletta", cat:"sandwiches", name:"Muffaletta", price:11, emoji:"🥯",
    desc:"A traditional New Orleans sandwich. Italian bread layered with marinated olive salad, salami, mortadella, black forest ham, prosciutto, provolone & swiss cheese.",
    spice:1, pop:8, dna:{heat:2,crunch:4,comfort:8,fresh:2,rich:10,sweet:0},
    options:{ label:"How hungry?", choices:[
      {label:"Quarter", delta:0},{label:"Half", delta:9},{label:"Full — bring friends", delta:27} ]},
    pair:"beers" },

  /* -------- Po' Boys -------- */
  { id:"shrimp-poboy", cat:"poboys", name:"Fried Shrimp Po' Boy", price:14, emoji:"🍤",
    desc:"On a freshly baked toasted French roll with vinaigrette coleslaw, ripe roma tomatoes, pickles & house-made remoulade.",
    spice:1, pop:10, dna:{heat:3,crunch:7,comfort:9,fresh:3,rich:7,sweet:0}, pair:"lemonade", signature:true },
  { id:"catfish-poboy", cat:"poboys", name:"Fried Catfish Po' Boy", price:15, emoji:"🐟",
    desc:"On a freshly baked toasted French roll with vinaigrette coleslaw, ripe roma tomatoes, pickles & house-made remoulade.",
    spice:1, pop:8, dna:{heat:3,crunch:7,comfort:9,fresh:3,rich:7,sweet:0}, pair:"tea" },
  { id:"oyster-poboy", cat:"poboys", name:"Fried Oyster Po' Boy", price:15, emoji:"🦪",
    desc:"On a freshly baked toasted French roll with vinaigrette coleslaw, ripe roma tomatoes, pickles & house-made remoulade.",
    spice:1, pop:7, dna:{heat:3,crunch:7,comfort:8,fresh:3,rich:8,sweet:0}, pair:"beers" },
  { id:"crab-poboy", cat:"poboys", name:"Fried Soft Shell Crab Po' Boy", price:16, emoji:"🦀",
    desc:"On a freshly baked toasted French roll with vinaigrette coleslaw, ripe roma tomatoes, pickles & house-made remoulade.",
    spice:1, pop:7, dna:{heat:3,crunch:7,comfort:8,fresh:3,rich:8,sweet:0}, pair:"wines" },
  { id:"blackened-fish-poboy", cat:"poboys", name:"Grilled Blackened Fish Po' Boy", price:15, emoji:"🐟",
    desc:"On a freshly baked toasted French roll with vinaigrette coleslaw, ripe roma tomatoes, pickles & house-made remoulade.",
    spice:2, pop:7, dna:{heat:5,crunch:4,comfort:7,fresh:5,rich:5,sweet:0}, pair:"tea" },
  { id:"blackened-shrimp-poboy", cat:"poboys", name:"Blackened Shrimp Po' Boy", price:15, emoji:"🍤",
    desc:"On a freshly baked toasted French roll with vinaigrette coleslaw, ripe roma tomatoes, pickles & house-made remoulade.",
    spice:2, pop:8, dna:{heat:5,crunch:4,comfort:8,fresh:4,rich:6,sweet:0}, pair:"lemonade" },

  /* -------- Desserts -------- */
  { id:"beignets", cat:"desserts", name:"3 Beignets", price:8, emoji:"☁️", sundayOnly:true,
    desc:"A New Orleans treat! Dough fried & covered with powdered sugar. Served fresh & hot. Sundays only.",
    spice:0, pop:10, dna:{heat:0,crunch:3,comfort:10,fresh:0,rich:6,sweet:10}, pair:"fountain", signature:true },
  { id:"bread-pudding", cat:"desserts", name:"Linda B's Bread Pudding", price:6.5, emoji:"🍮",
    desc:"Freshly baked & topped with a whisky sauce.",
    spice:0, pop:8, dna:{heat:0,crunch:1,comfort:10,fresh:0,rich:8,sweet:9}, pair:"fountain" },
  { id:"carrot-cake", cat:"desserts", name:"Stevie B's Carrot Cake", price:6.5, emoji:"🥕", img:"assets/food/carrot-cake.jpg",
    desc:"Homemade carrot cake with cream cheese frosting.",
    spice:0, pop:7, dna:{heat:0,crunch:2,comfort:9,fresh:1,rich:8,sweet:9}, pair:"tea" },

  /* -------- Drinks (points, but not part of the quest map) -------- */
  { id:"fountain", cat:"drinks", name:"Fountain Drinks", price:3.5, emoji:"🥤", quest:false,
    desc:"Coke products, ice cold.", spice:0, pop:6, dna:{heat:0,crunch:0,comfort:4,fresh:5,rich:0,sweet:7} },
  { id:"tea", cat:"drinks", name:"Iced Tea / Sweet Tea", price:3.5, emoji:"🧋", quest:false,
    desc:"Brewed the Southern way — get it sweet.", spice:0, pop:7, dna:{heat:0,crunch:0,comfort:5,fresh:6,rich:0,sweet:6} },
  { id:"lemonade", cat:"drinks", name:"Brown Sugar Lemonade", price:4, emoji:"🍋", quest:false, signature:true,
    desc:"House-made lemonade with a brown sugar kick.", spice:0, pop:9, dna:{heat:0,crunch:0,comfort:5,fresh:8,rich:1,sweet:8} },
  { id:"beers", cat:"drinks", name:"New Orleans Beers", price:6.5, emoji:"🍺", quest:false, adult:true,
    desc:"Rotating brews straight from NOLA. 21+.", spice:0, pop:7, dna:{heat:0,crunch:0,comfort:6,fresh:4,rich:3,sweet:1} },
  { id:"wines", cat:"drinks", name:"Wines", price:12, emoji:"🍷", quest:false, adult:true,
    desc:"By the glass. 21+.", spice:0, pop:5, dna:{heat:0,crunch:0,comfort:5,fresh:3,rich:5,sweet:3} }
];

/* ---- Game levels ---- */
SOCO.LEVELS = [
  { at: 0,    name: "Tourist",                icon: "🧳" },
  { at: 600,  name: "French Quarter Freshman",icon: "🎺" },
  { at: 1500, name: "Bayou Regular",          icon: "🐊" },
  { at: 3000, name: "Creole Connoisseur",     icon: "⚜️" },
  { at: 5500, name: "Kitchen Legend",         icon: "👑" },
  { at: 9000, name: "Honorary Brill Brother", icon: "🏆" }
];

/* ---- Badges ---- */
SOCO.BADGES = [
  { id:"first-taste", name:"First Bite on Bourbon", icon:"🎉",
    desc:"Log your first SoCo dish.",
    test: s => Object.keys(s.eaten).length >= 1 },
  { id:"poboy-royalty", name:"Po' Boy Royalty", icon:"👑",
    desc:"Eat all 6 Po' Boys.",
    test: s => SOCO.MENU.filter(m=>m.cat==="poboys").every(m=>s.eaten[m.id]) },
  { id:"gumbo-guru", name:"Gumbo Guru", icon:"🥣",
    desc:"Gumbo, étouffée & jambalaya — cups or bowls, all of them.",
    test: s => ["gumbo","gumbo-cup","etouffee","etouffee-cup","jambalaya","jambalaya-cup"].every(id=>s.eaten[id]) },
  { id:"fry-baby", name:"Fry Baby", icon:"🍟",
    desc:"Regular fries, Cajun fries AND Crab Cajun Fries.",
    test: s => ["regular-fries","cajun-fries","crab-cajun-fries"].every(id=>s.eaten[id]) },
  { id:"fire-walker", name:"Creole Fire Walker", icon:"🔥",
    desc:"Eat 5 different dishes rated 🌶🌶 or hotter.",
    test: s => SOCO.MENU.filter(m=>m.spice>=2 && s.eaten[m.id]).length >= 5 },
  { id:"sugar-rush", name:"Sugar Rush", icon:"🍰",
    desc:"Clear the whole dessert line.",
    test: s => SOCO.MENU.filter(m=>m.cat==="desserts").every(m=>s.eaten[m.id]) },
  { id:"sunday-society", name:"Sunday Beignet Society", icon:"☁️",
    desc:"Beignets. It has to be beignets.",
    test: s => !!s.eaten["beignets"] },
  { id:"who-dat-nation", name:"Who Dat Nation", icon:"⚜️",
    desc:"Who Dat AND Lil Weezy. Respect.",
    test: s => !!s.eaten["who-dat"] && !!s.eaten["lil-weezy"] },
  { id:"muffaletta-mountain", name:"Muffaletta Mountain", icon:"⛰️",
    desc:"Take on the Muffaletta.",
    test: s => !!s.eaten["muffaletta"] },
  { id:"sea-legend", name:"Gulf Coast Legend", icon:"🌊",
    desc:"Every fried seafood classic, plus the Seafood Platter.",
    test: s => ["fried-catfish","fried-shrimp","fried-oysters","soft-shell-crab","fifty-fifty","seafood-platter"].every(id=>s.eaten[id]) },
  { id:"halfway", name:"Halfway to Heaven", icon:"🌗",
    desc:"Try 50% of the food menu.",
    test: s => { const q=SOCO.MENU.filter(m=>m.quest!==false); return q.filter(m=>s.eaten[m.id]).length >= Math.ceil(q.length/2); } },
  { id:"whole-hog", name:"THE WHOLE HOG", icon:"🐷",
    desc:"Eat the ENTIRE food menu. All 40 dishes. Menu Legend status.",
    test: s => SOCO.MENU.filter(m=>m.quest!==false).every(m=>s.eaten[m.id]) }
];

/* ---- Rewards ladder (sample rewards for the demo — not live offers) ---- */
SOCO.REWARDS = [
  { id:"r-lemonade", cost:2500,  name:"Free Brown Sugar Lemonade", icon:"🍋" },
  { id:"r-side",     cost:5000,  name:"Free Side (any $8 side)",   icon:"🍟" },
  { id:"r-beignets", cost:7500,  name:"Free Beignets on Sunday",   icon:"☁️" },
  { id:"r-poboy",    cost:12500, name:"Free Po' Boy",              icon:"🥖" },
  { id:"r-platter",  cost:25000, name:"Seafood Platter on the House", icon:"🏆" },
  { id:"r-brill",    cost:50000, name:"Brill Brothers' Table — feast for 4 + merch", icon:"👨‍🍳" }
];

/* ---- Helpers ---- */
SOCO.item = id => SOCO.MENU.find(m => m.id === id);
SOCO.cat  = id => SOCO.CATS.find(c => c.id === id);
SOCO.loc  = id => SOCO.LOCATIONS.find(l => l.id === id);
SOCO.questItems = () => SOCO.MENU.filter(m => m.quest !== false);
SOCO.basePts = m => Math.round(m.price * 10);
