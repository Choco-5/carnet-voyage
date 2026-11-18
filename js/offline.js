// Carte hors connexion : télécharge dans le cache du navigateur les tuiles de la zone affichée
// (zoom 0 à 14 ; au-delà, la carte agrandit les tuiles du niveau 14), le style, les polices et les icônes.
// Le service worker (sw.js) sert ensuite ces fichiers sans connexion.
import { html, useState } from './lib.js';
import { Modal, getPref, setPref, toast } from './ui.js';
import { getCurrentMap, STYLE_URL } from './map-panel.js';

export const MAP_CACHE = 'map-v1';
const MAX_Z = 14;
const MAX_TILES = 8000;
const GLYPH_RANGES = ['0-255', '256-511', '768-1023', '7936-8191', '8192-8447'];

function tileRange(b, z) {
  const n = 2 ** z;
  const clamp = (v) => Math.max(0, Math.min(n - 1, v));
  const lx = (lng) => clamp(Math.floor(((lng + 180) / 360) * n));
  const ly = (lat) => {
    const r = (lat * Math.PI) / 180;
    return clamp(Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n));
  };
  return { x0: lx(b.w), x1: lx(b.e), y0: ly(b.n), y1: ly(b.s) };
}
function countTiles(b, minZ, maxZ) {
  let c = 0;
  for (let z = minZ; z <= maxZ; z++) {
    const r = tileRange(b, z);
    c += (r.x1 - r.x0 + 1) * (r.y1 - r.y0 + 1);
  }
  return c;
}
function boundsOf(map) {
  const bb = map.getBounds();
  return { w: bb.getWest(), s: bb.getSouth(), e: bb.getEast(), n: Math.min(bb.getNorth(), 85) };
}

async function fetchAndCache(cache, url) {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  await cache.put(url, r.clone());
  return r;
}

async function downloadArea(b, onProgress) {
  const cache = await caches.open(MAP_CACHE);
  const style = await (await fetchAndCache(cache, STYLE_URL)).json();
  const urls = [];
  for (const src of Object.values(style.sources || {})) {
    let tiles = src.tiles;
    let minzoom = src.minzoom ?? 0;
    let maxzoom = src.maxzoom ?? MAX_Z;
    if (src.url) {
      const tj = await (await fetchAndCache(cache, src.url)).json();
      tiles = tj.tiles;
      minzoom = tj.minzoom ?? minzoom;
      maxzoom = tj.maxzoom ?? maxzoom;
    }
    if (!tiles?.length || (src.type !== 'vector' && src.type !== 'raster')) continue;
    const tpl = tiles[0];
    for (let z = Math.max(0, minzoom); z <= Math.min(MAX_Z, maxzoom); z++) {
      const r = tileRange(b, z);
      for (let x = r.x0; x <= r.x1; x++)
        for (let y = r.y0; y <= r.y1; y++) urls.push(tpl.replace('{z}', z).replace('{x}', x).replace('{y}', y));
    }
  }
  // Polices utilisées par le style (latin + grec + ponctuation)
  const fonts = new Set();
  for (const l of style.layers || []) {
    const f = l.layout?.['text-font'];
    if (Array.isArray(f) && f.every((x) => typeof x === 'string')) fonts.add(f.join(','));
  }
  if (style.glyphs) {
    for (const f of fonts)
      for (const r of GLYPH_RANGES) urls.push(style.glyphs.replace('{fontstack}', encodeURI(f)).replace('{range}', r));
  }
  if (typeof style.sprite === 'string') {
    for (const s of ['', '@2x']) urls.push(`${style.sprite}${s}.json`, `${style.sprite}${s}.png`);
  }

  let done = 0;
  let failed = 0;
  let i = 0;
  const worker = async () => {
    while (i < urls.length) {
      const url = urls[i++];
      try {
        if (!(await cache.match(url))) await fetchAndCache(cache, url);
      } catch {
        failed++;
      }
      done++;
      onProgress(done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return { total: urls.length, failed };
}

export function OfflineModal({ dest, mapVisible, onShowMap, onClose }) {
  const key = 'offline:' + dest.id;
  const [info, setInfo] = useState(() => getPref(key, null));
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const map = mapVisible ? getCurrentMap() : null;
  // Zone = ce qui est affiché + (au minimum) l'emprise de la destination.
  let b = map ? boundsOf(map) : null;
  if (b && dest.bbox) {
    const [w, s, e, nn] = dest.bbox;
    b = { w: Math.min(b.w, w), s: Math.min(b.s, s), e: Math.max(b.e, e), n: Math.max(b.n, nn) };
  }
  const n = b ? countTiles(b, 0, MAX_Z) : 0;
  const tooBig = n > MAX_TILES;
  const zoom = map ? map.getZoom() : 0;

  const start = async () => {
    setError('');
    setProgress({ done: 0, total: 1 });
    try {
      try {
        await navigator.storage?.persist?.();
      } catch {}
      const res = await downloadArea(b, (done, total) => setProgress({ done, total }));
      const v = { date: Date.now(), tiles: res.total, failed: res.failed, bbox: [b.w, b.s, b.e, b.n] };
      setPref(key, v);
      setInfo(v);
      toast(res.failed ? `Carte téléchargée (${res.failed} fichiers manquants)` : 'Carte téléchargée pour le hors connexion');
    } catch (e) {
      console.error(e);
      setError('Téléchargement impossible. Vérifie ta connexion et réessaie.');
    }
    setProgress(null);
  };

  return html`
    <${Modal} title="Carte hors connexion" onClose=${progress ? null : onClose}>
      <div class="form">
        <p>Télécharge la carte de <b>${dest.name}</b> <b>sur l'appareil que tu emporteras</b> (ton téléphone), avec le Wi-Fi, avant le départ. Tes lieux, notes et journées sont déjà disponibles sans connexion.</p>
        ${info
          ? html`<div class="ok-box">✓ Zone téléchargée sur cet appareil le ${new Date(info.date).toLocaleDateString('fr-FR')} (${info.tiles} fichiers${info.failed ? `, ${info.failed} manquants` : ''}).</div>`
          : html`<div class="muted">Aucune carte téléchargée sur cet appareil pour cette destination.</div>`}
        ${!map && html`<div class="warn-box">Affiche la carte (MAP) et cadre la zone à télécharger, puis rouvre cette fenêtre.
          <div><button class="btn small" onClick=${() => { onShowMap(); onClose(); }}>Afficher la carte</button></div></div>`}
        ${map && html`
          <div>Zone : <b>${dest.name}</b>${dest.bbox ? ' et' : ''} <b>ce qui est affiché sur la carte</b>. Pour inclure plus large (excursions, aéroport…), fais un zoom arrière avant de télécharger.</div>
          <div class="muted small">${n} tuiles${!tooBig ? ` · environ ${Math.max(1, Math.round((n * 40) / 1024))} Mo` : ''}${zoom < 9 ? ' · zone très large' : ''}</div>
          ${tooBig && html`<div class="warn-box">Zone trop grande. Zoome un peu sur la ville avant de télécharger.</div>`}`}
        ${progress && html`
          <div class="progress"><div style=${{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}></div></div>
          <div class="muted small">${progress.done} / ${progress.total}</div>`}
        ${error && html`<div class="error">${error}</div>`}
        <div class="form-actions">
          <span class="spacer"></span>
          <button class="btn" onClick=${onClose} disabled=${!!progress}>Fermer</button>
          ${map && html`<button class="btn primary" onClick=${start} disabled=${!!progress || tooBig || !navigator.onLine}>${info ? 'Re-télécharger cette zone' : 'Télécharger cette zone'}</button>`}
        </div>
      </div>
    <//>`;
}
