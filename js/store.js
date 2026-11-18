// Données de l'application, stockées localement (IndexedDB) sur l'appareil.
//
// Modèle :
//   trips        { id, name, start, end }
//   destinations { id, tripId, name, lat, lng, bbox }
//   days         { id, destinationId, date, color }          -> la couleur appartient à la journée
//   places       { id, destinationId, name, category, address, lat, lng, notes }
//   items        { id, dayId, type: 'place'|'note', placeId?, text?, time, order }
//                -> une affectation est un lien vers le lieu, jamais une copie.
//                   Règle v1 : un lieu n'apparaît que dans une seule journée.

import { uid, DAY_COLORS, byOrder } from './util.js';

const DB_NAME = 'carnet-voyage';
const STORE = 'kv';
const KEY = 'data';
export const DATA_VERSION = 1;

const empty = () => ({ version: DATA_VERSION, trips: [], destinations: [], days: [], places: [], items: [], settings: { catColors: {} } });

let data = empty();
const listeners = new Set();

// ---------- IndexedDB ----------
let dbPromise = null;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

export function normalize(v) {
  const out = empty();
  if (!v || typeof v !== 'object') return out;
  for (const k of ['trips', 'destinations', 'days', 'places', 'items']) {
    out[k] = Array.isArray(v[k]) ? v[k].filter((x) => x && typeof x === 'object' && x.id) : [];
  }
  const cc = v.settings?.catColors;
  if (cc && typeof cc === 'object') {
    for (const [k, c] of Object.entries(cc)) if (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c)) out.settings.catColors[k] = c;
  }
  return out;
}

export async function loadData() {
  try {
    const d = await db();
    const val = await new Promise((res, rej) => {
      const r = d.transaction(STORE).objectStore(STORE).get(KEY);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    if (val) data = normalize(val);
  } catch (e) {
    console.error('Lecture impossible', e);
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 200);
}
export async function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(data, KEY);
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
  } catch (e) {
    console.error('Sauvegarde impossible', e);
    alert('Attention : la sauvegarde locale a échoué. Exporte tes données par sécurité.');
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && saveTimer) flush();
});

export const getData = () => data;
export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  listeners.forEach((f) => f());
}
function commit(mutator) {
  const draft = structuredClone(data);
  const result = mutator(draft);
  data = draft;
  scheduleSave();
  emit();
  return result;
}

// ---------- Aides internes ----------
function setDayList(d, dayId, list) {
  d.items = d.items.filter((i) => i.dayId !== dayId).concat(list.map((x, k) => ({ ...x, dayId, order: k })));
}
function dayList(d, dayId) {
  return d.items.filter((i) => i.dayId === dayId).sort(byOrder);
}
function insertItem(d, dayId, item, index) {
  const list = dayList(d, dayId).filter((i) => i.id !== item.id);
  const idx = Math.max(0, Math.min(index ?? list.length, list.length));
  list.splice(idx, 0, item);
  setDayList(d, dayId, list);
}
function removeItemsWhere(d, pred) {
  const touched = new Set(d.items.filter(pred).map((i) => i.dayId));
  d.items = d.items.filter((i) => !pred(i));
  for (const dayId of touched) setDayList(d, dayId, dayList(d, dayId));
}
function nextColor(d, destinationId) {
  const used = d.days.filter((x) => x.destinationId === destinationId).map((x) => x.color);
  return DAY_COLORS.find((c) => !used.includes(c)) || DAY_COLORS[used.length % DAY_COLORS.length];
}
function createDay(d, destinationId, date) {
  const existing = d.days.find((x) => x.destinationId === destinationId && x.date === date);
  if (existing) return existing.id;
  const id = uid();
  d.days.push({ id, destinationId, date, color: nextColor(d, destinationId), createdAt: Date.now() });
  return id;
}
function removeDay(d, dayId) {
  d.items = d.items.filter((i) => i.dayId !== dayId);
  d.days = d.days.filter((x) => x.id !== dayId);
}
function removeDestination(d, destId) {
  for (const day of d.days.filter((x) => x.destinationId === destId)) removeDay(d, day.id);
  const placeIds = new Set(d.places.filter((p) => p.destinationId === destId).map((p) => p.id));
  d.items = d.items.filter((i) => !placeIds.has(i.placeId));
  d.places = d.places.filter((p) => p.destinationId !== destId);
  d.destinations = d.destinations.filter((x) => x.id !== destId);
}
const patchOne = (arr, id, patch) => {
  const x = arr.find((o) => o.id === id);
  if (x) Object.assign(x, patch);
};

// ---------- Actions ----------
export const actions = {
  createTrip(fields) {
    return commit((d) => {
      const id = uid();
      d.trips.push({ id, name: '', start: '', end: '', createdAt: Date.now(), ...fields });
      return id;
    });
  },
  updateTrip: (id, patch) => commit((d) => patchOne(d.trips, id, patch)),
  deleteTrip(id) {
    commit((d) => {
      for (const dest of d.destinations.filter((x) => x.tripId === id)) removeDestination(d, dest.id);
      d.trips = d.trips.filter((t) => t.id !== id);
    });
  },

  createDestination(tripId, fields) {
    return commit((d) => {
      const id = uid();
      d.destinations.push({ id, tripId, name: '', lat: null, lng: null, bbox: null, createdAt: Date.now(), ...fields });
      return id;
    });
  },
  updateDestination: (id, patch) => commit((d) => patchOne(d.destinations, id, patch)),
  deleteDestination: (id) => commit((d) => removeDestination(d, id)),

  addDay: (destinationId, date) => commit((d) => createDay(d, destinationId, date)),
  toggleDay(destinationId, date) {
    commit((d) => {
      const ex = d.days.find((x) => x.destinationId === destinationId && x.date === date);
      if (ex) removeDay(d, ex.id);
      else createDay(d, destinationId, date);
    });
  },
  deleteDay: (id) => commit((d) => removeDay(d, id)),
  setDayColor: (id, color) => commit((d) => patchOne(d.days, id, { color })),

  createPlace(destinationId, fields) {
    return commit((d) => {
      const id = uid();
      d.places.push({
        id, destinationId, name: '', category: 'other', address: '', lat: null, lng: null, notes: '',
        createdAt: Date.now(), ...fields,
      });
      return id;
    });
  },
  updatePlace: (id, patch) => commit((d) => patchOne(d.places, id, patch)),
  deletePlace(id) {
    commit((d) => {
      d.places = d.places.filter((p) => p.id !== id);
      removeItemsWhere(d, (i) => i.placeId === id);
    });
  },

  /** Affecte un lieu à une journée (ou le désaffecte si dayId est vide). Pas de copie. */
  assignPlace(placeId, dayId, index) {
    commit((d) => {
      const old = d.items.find((i) => i.type === 'place' && i.placeId === placeId);
      removeItemsWhere(d, (i) => i.type === 'place' && i.placeId === placeId);
      if (dayId) {
        insertItem(d, dayId, { id: old?.id || uid(), type: 'place', placeId, time: old?.time || '' }, index);
      }
    });
  },
  moveItem(itemId, dayId, index) {
    commit((d) => {
      const it = d.items.find((i) => i.id === itemId);
      if (!it) return;
      removeItemsWhere(d, (i) => i.id === itemId);
      insertItem(d, dayId, { ...it }, index);
    });
  },
  removeItem: (itemId) => commit((d) => removeItemsWhere(d, (i) => i.id === itemId)),
  addNote(dayId, text) {
    commit((d) => insertItem(d, dayId, { id: uid(), type: 'note', text, time: '' }, Infinity));
  },
  updateItem: (id, patch) => commit((d) => patchOne(d.items, id, patch)),

  setCategoryColor: (catId, color) => commit((d) => {
    d.settings = d.settings || { catColors: {} };
    d.settings.catColors = { ...(d.settings.catColors || {}), [catId]: color };
  }),

  replaceAll(newData) {
    data = normalize(newData);
    scheduleSave();
    emit();
  },
};
