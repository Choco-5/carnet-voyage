// Constantes et fonctions utilitaires (dates, catégories, couleurs).

export const CATEGORIES = [
  { id: 'restaurant', label: 'Restaurants', icon: '🍽️' },
  { id: 'cafe', label: 'Cafés & bars', icon: '☕' },
  { id: 'activity', label: 'Activités', icon: '🎟️' },
  { id: 'culture', label: 'Monuments & culture', icon: '🏛️' },
  { id: 'viewpoint', label: 'Points de vue', icon: '🌄' },
  { id: 'lodging', label: 'Hébergements', icon: '🛏️' },
  { id: 'transport', label: 'Transports', icon: '🚉' },
  { id: 'other', label: 'Autres', icon: '📍' },
];
const CAT = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));
export const catOf = (id) => CAT[id] || CAT.other;
export const catIdOf = (place) => (CAT[place.category] ? place.category : 'other');

export const DAY_COLORS = [
  '#e8590c', '#1c7ed6', '#2f9e44', '#d6336c', '#7048e8', '#0c8599',
  '#c92a2a', '#e67700', '#364fc7', '#66a80f', '#9c36b5', '#8d5524',
];
export const NEUTRAL = '#868e96';
export const safeColor = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : NEUTRAL);

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

// ---- Dates (format AAAA-MM-JJ, interprété en heure locale) ----
const WEEKDAYS = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const pad = (n) => String(n).padStart(2, '0');

export function parseDate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
export const toISO = (dt) => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
export const todayISO = () => toISO(new Date());

/** « Lundi 7 » */
export function dayShort(s) {
  const d = parseDate(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}
/** « Lundi 7 décembre » */
export function dayLong(s) {
  const d = parseDate(s);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function formatRange(a, b) {
  if (!a) return 'Dates à définir';
  const da = parseDate(a);
  const db = b ? parseDate(b) : da;
  const left = `${da.getDate()} ${MONTHS_SHORT[da.getMonth()]}`;
  const right = `${db.getDate()} ${MONTHS_SHORT[db.getMonth()]} ${db.getFullYear()}`;
  return a === b || !b ? right : `${left} → ${right}`;
}
export function datesBetween(a, b) {
  if (!a || !b) return [];
  const out = [];
  const d = parseDate(a);
  const end = parseDate(b);
  while (d <= end && out.length < 400) {
    out.push(toISO(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ---- Lecture des données ----
export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0);
export function sortDays(days) {
  return [...days].sort((a, b) => a.date.localeCompare(b.date) || (a.createdAt || 0) - (b.createdAt || 0));
}
export function daysOf(data, destId) {
  return sortDays(data.days.filter((d) => d.destinationId === destId));
}
export function itemsOf(data, dayId) {
  return data.items.filter((i) => i.dayId === dayId).sort(byOrder);
}
/** Map placeId -> journée à laquelle le lieu est affecté. */
export function assignmentMap(data) {
  const dayById = new Map(data.days.map((d) => [d.id, d]));
  const m = new Map();
  for (const it of data.items) {
    if (it.type === 'place' && dayById.has(it.dayId)) m.set(it.placeId, dayById.get(it.dayId));
  }
  return m;
}
/** Destinations d'un voyage, dans l'ordre de leur première journée. */
export function orderedDestinations(data, tripId) {
  const first = new Map();
  for (const d of data.days) {
    const cur = first.get(d.destinationId);
    if (!cur || d.date < cur) first.set(d.destinationId, d.date);
  }
  return data.destinations
    .filter((d) => d.tripId === tripId)
    .sort((a, b) => {
      const fa = first.get(a.id) || '9999';
      const fb = first.get(b.id) || '9999';
      return fa.localeCompare(fb) || (a.createdAt || 0) - (b.createdAt || 0);
    });
}

export const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function mapsUrl(place) {
  const q = place.lat != null && place.lng != null
    ? `${place.lat},${place.lng}`
    : [place.name, place.address].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
