// Jääkaappini: kategoriat, päiväyslogiikka ja tilastot.
// Ei DOM-koodia, joten tiedostoa voi testata myös Nodella.

const CATEGORIES = [
  // openedDays: suuntaa-antava säilyvyys avaamisen jälkeen (null = ei rajoitusta)
  // dateType: oletus päiväyksen tyypille (parasta = parasta ennen, viimeinen = viimeinen käyttöpäivä)
  { id: "maito", name: "Maito ja jogurtti", emoji: "🥛", openedDays: 3, dateType: "parasta" },
  { id: "juusto", name: "Juustot", emoji: "🧀", openedDays: 10, dateType: "parasta" },
  { id: "liha", name: "Liha, kala ja leikkeleet", emoji: "🥩", openedDays: 2, dateType: "viimeinen" },
  { id: "valmis", name: "Valmisruoat", emoji: "🍲", openedDays: 2, dateType: "viimeinen" },
  { id: "kasvis", name: "Kasvikset ja hedelmät", emoji: "🥕", openedDays: 3, dateType: "parasta" },
  { id: "kastike", name: "Kastikkeet ja hillot", emoji: "🫙", openedDays: 21, dateType: "parasta" },
  { id: "juoma", name: "Juomat", emoji: "🧃", openedDays: 5, dateType: "parasta" },
  { id: "munat", name: "Kananmunat", emoji: "🥚", openedDays: null, dateType: "parasta" },
  { id: "muu", name: "Muut", emoji: "🥫", openedDays: null, dateType: "parasta" },
];

const DATE_TYPES = {
  parasta: "Parasta ennen",
  viimeinen: "Viimeinen käyttöpäivä",
};

// Nimen perusteella arvattava kategoria (ensimmäinen osuma voittaa).
const CATEGORY_KEYWORDS = [
  ["munat", ["kananmun", "munat", "muna"]],
  ["juusto", ["juusto", "feta", "mozzarella", "halloumi", "parmesaani"]],
  ["maito", ["maito", "jogurt", "rahka", "kerma", "viili", "piimä", "skyr", "voi", "levite"]],
  ["liha", ["liha", "kana", "broiler", "kala", "lohi", "tonnikala", "kinkku", "makkara", "nakki", "leike", "pekoni", "katkarapu"]],
  ["valmis", ["laatikko", "keitto", "pizza", "lasagne", "valmis", "ruoka", "pasta"]],
  ["kastike", ["kastike", "hillo", "ketsuppi", "sinappi", "majoneesi", "pesto", "salsa", "dippi", "marmeladi"]],
  ["juoma", ["mehu", "juoma", "olut", "limu", "smoothie", "siideri", "kivennäisvesi"]],
  ["kasvis", ["salaatti", "kurkku", "tomaatti", "porkkana", "omena", "hedelm", "peruna", "paprika", "kasvi", "marja", "sipuli", "banaani", "appelsiini", "sieni", "parsakaali"]],
];

function categoryById(id) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
}

function guessCategory(name) {
  const n = String(name || "").toLowerCase();
  for (const [id, words] of CATEGORY_KEYWORDS) {
    if (words.some(w => n.includes(w))) return id;
  }
  return "muu";
}

// ---------------------------------------------------------------- päiväykset

function localDateString(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isDateString(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function addDays(dateString, n) {
  const [y, m, d] = dateString.split("-").map(Number);
  const date = new Date(y, m - 1, d, 12);
  date.setDate(date.getDate() + n);
  return localDateString(date);
}

// Negatiivinen luku tarkoittaa mennyttä päivää.
function daysUntil(dateString, today = new Date()) {
  const [y, m, d] = dateString.split("-").map(Number);
  const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - todayUTC) / 86400000);
}

// "14.11." tänä vuonna, muuten "14.11.2027"
function formatDate(dateString, today = new Date()) {
  const [y, m, d] = dateString.split("-").map(Number);
  return y === today.getFullYear() ? `${d}.${m}.` : `${d}.${m}.${y}`;
}

function dayWord(n) {
  return Math.abs(n) === 1 ? "päivä" : "päivää";
}

// ------------------------------------------------------------------ tuotteet

function normalizeProduct(raw) {
  const category = CATEGORIES.some(c => c.id === raw.category) ? raw.category : guessCategory(raw.name);
  const cat = categoryById(category);
  const quantity = Math.max(1, Math.min(99, Math.round(Number(raw.quantity) || 1)));
  const openedDays = raw.openedDays === undefined ? cat.openedDays
    : raw.openedDays === null || raw.openedDays === "" ? null
    : Math.max(0, Math.round(Number(raw.openedDays))) || null;

  return {
    id: String(raw.id || `tuote-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    name: String(raw.name || "Nimetön tuote").trim() || "Nimetön tuote",
    date: isDateString(raw.date) ? raw.date : localDateString(),
    dateType: DATE_TYPES[raw.dateType] ? raw.dateType : cat.dateType,
    category,
    quantity,
    openedAt: isDateString(raw.openedAt) ? raw.openedAt : null,
    openedDays,
    photo: typeof raw.photo === "string" ? raw.photo : null,
    addedAt: typeof raw.addedAt === "number" ? raw.addedAt : 0,
  };
}

// Viimeinen päivä, jolloin avattu tuote kannattaa syödä (tai null).
function openedLimit(product) {
  if (!product.openedAt || !product.openedDays) return null;
  return addDays(product.openedAt, product.openedDays);
}

// Päiväys, jota seurataan: pakkauksen päiväys tai avatun tuotteen raja, kumpi tulee ensin.
function effectiveDate(product) {
  const limit = openedLimit(product);
  return limit && limit < product.date ? limit : product.date;
}

// level: expired (älä syö) · check (parasta ennen mennyt, tarkista) · soon · ok
function productStatus(product, soonDays = 3, today = new Date()) {
  const limit = openedLimit(product);
  const reason = limit && limit < product.date ? "opened" : "date";
  const days = daysUntil(effectiveDate(product), today);

  let level = "ok";
  if (days < 0) level = product.dateType === "viimeinen" ? "expired" : "check";
  else if (days <= soonDays) level = "soon";

  let text;
  if (days < 0) text = `Vanhentunut ${-days} ${dayWord(days)} sitten`;
  else if (days === 0) text = "Käytä tänään";
  else if (days === 1) text = "Käytä huomenna";
  else text = `${days} ${dayWord(days)} jäljellä`;

  let hint = "";
  if (level === "expired") {
    hint = "Viimeinen käyttöpäivä on mennyt. Älä syö, vaikka tuote näyttäisi hyvältä.";
  } else if (level === "check") {
    hint = reason === "opened"
      ? "Avattuna suositeltu säilytysaika on mennyt. Katso, haista, maista ennen syömistä."
      : "Parasta ennen -päiväys on mennyt. Katso, haista, maista: tuote voi olla vielä hyvää.";
  }

  return { days, level, reason, text, hint, limit };
}

function isUrgent(product, soonDays, today = new Date()) {
  return productStatus(product, soonDays, today).level !== "ok";
}

function notificationText(product, soonDays, today = new Date()) {
  const s = productStatus(product, soonDays, today);
  if (s.days < 0) {
    return s.level === "expired"
      ? `Viimeinen käyttöpäivä meni ${-s.days} ${dayWord(s.days)} sitten.`
      : `Päiväys meni ${-s.days} ${dayWord(s.days)} sitten. Tarkista tuote.`;
  }
  const why = s.reason === "opened" ? "Avattu tuote: " : "";
  if (s.days === 0) return `${why}käytä tänään.`;
  if (s.days === 1) return `${why}käytä huomenna.`;
  return `${why}päiväykseen on ${s.days} päivää.`;
}

function exampleProducts(today = new Date()) {
  const t = localDateString(today);
  const make = (id, name, offset, opened, extra = {}) => normalizeProduct({
    id, name, date: addDays(t, offset), openedAt: opened === null ? null : addDays(t, opened), addedAt: 1, ...extra,
  });
  return [
    make("esimerkki-maito", "Maito", -2, -4, { category: "maito" }),
    make("esimerkki-jogurtti", "Jogurtti", 1, null, { category: "maito", quantity: 3 }),
    make("esimerkki-juusto", "Juusto", 3, -2, { category: "juusto" }),
    make("esimerkki-kurkkusalaatti", "Kurkkusalaatti", 10, -1, { category: "kasvis" }),
    make("esimerkki-kananmunat", "Kananmunat", 14, null, { category: "munat", quantity: 10 }),
    make("esimerkki-jauheliha", "Jauheliha", 1, null, { category: "liha" }),
  ];
}

// ------------------------------------------------------------------ tilastot

// history: [{ name, category, outcome: "eaten" | "wasted", at: "YYYY-MM-DD", count }] (count = kpl, oletus 1)
function summarize(history, fromDate = null) {
  const items = fromDate ? history.filter(h => h.at >= fromDate) : history;
  const units = h => Math.max(1, Number(h.count) || 1);
  const sum = outcome => items.filter(h => h.outcome === outcome).reduce((n, h) => n + units(h), 0);
  const eaten = sum("eaten");
  const wasted = sum("wasted");
  const total = eaten + wasted;

  const counts = new Map();
  for (const h of items.filter(h => h.outcome === "wasted")) {
    const key = h.name.trim().toLowerCase();
    const entry = counts.get(key) || { name: h.name.trim(), category: h.category, count: 0 };
    entry.count += units(h);
    counts.set(key, entry);
  }
  const topWasted = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "fi")).slice(0, 5);

  return { eaten, wasted, total, savedPct: total ? Math.round((eaten / total) * 100) : null, topWasted };
}

function monthStart(today = new Date()) {
  return localDateString(new Date(today.getFullYear(), today.getMonth(), 1, 12));
}

if (typeof module !== "undefined") {
  module.exports = {
    CATEGORIES, DATE_TYPES, categoryById, guessCategory, localDateString, addDays, daysUntil, formatDate,
    normalizeProduct, openedLimit, effectiveDate, productStatus, isUrgent, notificationText, exampleProducts,
    summarize, monthStart, isDateString,
  };
}
