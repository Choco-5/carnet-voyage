// Recherche d'adresses et de lieux via Nominatim (OpenStreetMap) : gratuit, nécessite une connexion.
// Règles d'usage : requêtes déclenchées uniquement par une action de l'utilisateur (≤ 1/s).

const BASE = 'https://nominatim.openstreetmap.org';

export function shortAddress(x) {
  const a = x.address || {};
  const street = [a.road || a.pedestrian || a.footway || a.square || a.neighbourhood, a.house_number]
    .filter(Boolean)
    .join(' ');
  const city = [a.postcode, a.city || a.town || a.village || a.municipality || a.suburb].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ') || x.display_name || '';
}

function guessCategory(x) {
  const c = x.category || x.class;
  const t = x.type;
  if (c === 'amenity') {
    if (['restaurant', 'fast_food', 'food_court'].includes(t)) return 'restaurant';
    if (['cafe', 'bar', 'pub', 'biergarten', 'ice_cream'].includes(t)) return 'cafe';
    if (['theatre', 'cinema', 'arts_centre', 'nightclub'].includes(t)) return 'activity';
    if (t === 'place_of_worship') return 'culture';
    if (['bus_station', 'ferry_terminal', 'taxi'].includes(t)) return 'transport';
  }
  if (c === 'tourism') {
    if (t === 'viewpoint') return 'viewpoint';
    if (['hotel', 'hostel', 'guest_house', 'apartment', 'motel', 'chalet'].includes(t)) return 'lodging';
    if (['theme_park', 'zoo', 'aquarium'].includes(t)) return 'activity';
    if (['museum', 'gallery', 'artwork', 'attraction'].includes(t)) return 'culture';
  }
  if (c === 'historic') return 'culture';
  if (c === 'leisure') return 'activity';
  if (['railway', 'aeroway', 'public_transport'].includes(c)) return 'transport';
  return null;
}

function toResult(x) {
  const bb = x.boundingbox;
  return {
    id: String(x.place_id),
    name: x.name || (x.display_name || '').split(',')[0],
    address: shortAddress(x),
    full: x.display_name || '',
    lat: Number(x.lat),
    lng: Number(x.lon),
    bbox: bb ? [Number(bb[2]), Number(bb[0]), Number(bb[3]), Number(bb[1])] : null, // [O, S, E, N]
    category: guessCategory(x),
  };
}

async function get(path, params) {
  const p = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', 'accept-language': 'fr', ...params });
  const r = await fetch(`${BASE}/${path}?${p}`);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/** bbox facultative [O, S, E, N] pour favoriser les résultats proches de la destination. */
export async function searchPlaces(q, bbox) {
  const params = { q, limit: '8' };
  if (bbox) params.viewbox = `${bbox[0]},${bbox[3]},${bbox[2]},${bbox[1]}`;
  const j = await get('search', params);
  return j.map(toResult);
}

export async function reverseGeocode(lat, lng) {
  const j = await get('reverse', { lat: String(lat), lon: String(lng), zoom: '18' });
  if (!j || j.error) return null;
  return toResult(j);
}
