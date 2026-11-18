// MAP : carte interactive (MapLibre + tuiles OpenFreeMap / OpenStreetMap, gratuites).
// Marqueur : icône = catégorie, couleur = journée (neutre si non planifié).
import { html, useEffect, useRef, useState } from './lib.js';
import { getPref, setPref, DayDots } from './ui.js';
import { catOf, catIdOf, safeColor } from './util.js';
import { PlaceDetails } from './place-panel.js';

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

// Vue satellite : imagerie Esri World Imagery (en ligne uniquement, non téléchargée pour le hors connexion).
const SAT_SOURCE = {
  type: 'raster',
  tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  tileSize: 256,
  maxzoom: 19,
  attribution: 'Imagerie © Esri, Maxar, Earthstar Geographics',
};
function setSatellite(map, on) {
  if (!map.isStyleLoaded() && !map.getStyle()) return;
  const has = !!map.getLayer('satellite');
  if (on && !has) {
    if (!map.getSource('satellite')) map.addSource('satellite', SAT_SOURCE);
    // Sous les libellés (noms de rues et de lieux restent visibles par-dessus l'image)
    const firstSymbol = map.getStyle().layers.find((l) => l.type === 'symbol')?.id;
    map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite' }, firstSymbol);
  } else if (!on && has) {
    map.removeLayer('satellite');
  }
}

let currentMap = null;
export const getCurrentMap = () => currentMap;

/** Règle de visibilité combinant le filtre catégories et le filtre journées. */
// planned = journées où le lieu est prévu (peut être vide ou en contenir plusieurs).
export function isPlaceVisible(place, planned, hiddenCats, hiddenDays) {
  const cat = catIdOf(place);
  if (hiddenCats.includes(cat)) return false;
  if (planned?.length) return planned.some((d) => !hiddenDays.includes(d.id));
  // Un hébergement non planifié reste toujours visible (sauf si sa catégorie est masquée).
  if (cat === 'lodging') return true;
  return !hiddenDays.includes('unplanned');
}

export function MapPanel({
  dest, places, days, assignments, hiddenCats, hiddenDays, selected, onSelect, showCard,
  picking, onPick, onCancelPick, onAddAt, onEdit,
}) {
  const elRef = useRef();
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const lastMarkerClick = useRef(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [satellite, setSatPref] = useState(() => getPref('satellite', false));
  const toggleSatellite = () => {
    const next = !satellite;
    setPref('satellite', next);
    setSatPref(next);
  };
  useEffect(() => {
    const map = mapRef.current;
    if (map && ready) setSatellite(map, satellite);
  }, [satellite, ready]);
  const cb = useRef();
  cb.current = { onSelect, onPick, picking, onAddAt };

  // ---- Création de la carte (une seule fois) ----
  useEffect(() => {
    if (!window.maplibregl) {
      setFailed(true);
      return;
    }
    const view = getPref('view:' + dest.id, null);
    const opts = {
      container: elRef.current,
      style: STYLE_URL,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    };
    if (view) Object.assign(opts, { center: view.center, zoom: view.zoom });
    else if (dest.bbox) opts.bounds = [[dest.bbox[0], dest.bbox[1]], [dest.bbox[2], dest.bbox[3]]];
    else if (dest.lng != null) Object.assign(opts, { center: [dest.lng, dest.lat], zoom: 12 });
    else Object.assign(opts, { center: [15, 30], zoom: 2 });

    let map;
    try {
      map = new maplibregl.Map(opts);
    } catch (e) {
      console.error(e);
      setFailed(true);
      return;
    }
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'top-right');
    map.on('moveend', () => setPref('view:' + dest.id, { center: map.getCenter().toArray(), zoom: map.getZoom() }));
    map.on('click', (e) => {
      if (Date.now() - lastMarkerClick.current < 300) return;
      if (cb.current.picking) cb.current.onPick({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      else cb.current.onSelect(null);
    });
    // Ajouter un lieu : clic droit (ordinateur) ou appui long (téléphone)
    map.on('contextmenu', (e) => {
      if (!cb.current.picking) cb.current.onAddAt({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });
    let pressTimer = null;
    const cancelPress = () => clearTimeout(pressTimer);
    map.on('touchstart', (e) => {
      cancelPress();
      if (e.originalEvent.touches.length !== 1 || cb.current.picking) return;
      const ll = e.lngLat;
      pressTimer = setTimeout(() => cb.current.onAddAt({ lat: ll.lat, lng: ll.lng }), 650);
    });
    map.on('touchend', cancelPress);
    map.on('touchcancel', cancelPress);
    map.on('movestart', cancelPress);
    map.on('load', () => setReady(true));

    mapRef.current = map;
    currentMap = map;
    const ro = new ResizeObserver(() => map.resize());
    ro.observe(elRef.current);
    return () => {
      ro.disconnect();
      cancelPress();
      markersRef.current.clear();
      map.remove();
      if (currentMap === map) currentMap = null;
    };
  }, []);

  // ---- Synchronisation des marqueurs avec les données et les filtres ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const ms = markersRef.current;
    const seen = new Set();
    for (const p of places) {
      if (p.lat == null || p.lng == null) continue;
      const planned = assignments.get(p.id) || [];
      if (!isPlaceVisible(p, planned, hiddenCats, hiddenDays)) continue;
      seen.add(p.id);
      let m = ms.get(p.id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'marker';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          lastMarkerClick.current = Date.now();
          if (!cb.current.picking) cb.current.onSelect(el.dataset.id);
        });
        m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map);
        ms.set(p.id, m);
      }
      const el = m.getElement();
      el.dataset.id = p.id;
      el.title = p.name;
      m.setLngLat([p.lng, p.lat]);
      // Couleur des journées affichées ; plusieurs journées = marqueur partagé en parts de couleur.
      const colors = planned.filter((d) => !hiddenDays.includes(d.id)).map((d) => safeColor(d.color));
      let style = '';
      if (colors.length === 1) style = `background:${colors[0]};border-color:${colors[0]}`;
      else if (colors.length > 1) {
        const step = 360 / colors.length;
        const stops = colors.map((c, i) => `${c} ${i * step}deg ${(i + 1) * step}deg`).join(',');
        style = `background:conic-gradient(${stops});border-color:#fff`;
      }
      el.innerHTML = `<span class="pin${colors.length ? ' planned' : ''}"${style ? ` style="${style}"` : ''}>${catOf(p.category).icon}</span>`;
      el.classList.toggle('selected', selected.id === p.id);
    }
    for (const [id, m] of ms) {
      if (!seen.has(id)) {
        m.remove();
        ms.delete(id);
      }
    }
  });

  // ---- Sélection depuis une liste : recentrer la carte ----
  useEffect(() => {
    const map = mapRef.current;
    const p = places.find((x) => x.id === selected.id);
    if (!map || !p || p.lat == null || selected.source !== 'list') return;
    map.easeTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
  }, [selected.id, selected.source]);

  const fitAll = () => {
    const map = mapRef.current;
    const pts = places.filter((p) => p.lat != null && isPlaceVisible(p, assignments.get(p.id), hiddenCats, hiddenDays));
    if (!map || pts.length === 0) return;
    if (pts.length === 1) return map.easeTo({ center: [pts[0].lng, pts[0].lat], zoom: 15 });
    const b = new maplibregl.LngLatBounds();
    pts.forEach((p) => b.extend([p.lng, p.lat]));
    map.fitBounds(b, { padding: 60, maxZoom: 16, duration: 600 });
  };

  const sel = places.find((p) => p.id === selected.id);
  const selPlanned = (sel && assignments.get(sel.id)) || [];

  return html`
    <div class=${'map-wrap' + (picking ? ' picking' : '') + (satellite ? ' sat' : '')}>
      <div class="map" ref=${elRef}></div>
      ${failed && html`<div class="map-error">La carte n'a pas pu être chargée. Vérifie ta connexion, ou télécharge la carte hors connexion lors de ta prochaine connexion.</div>`}
      <div class="map-tools">
        <button class="map-btn" onClick=${fitAll} title="Voir tous les lieux affichés">⤢ Mes lieux</button>
        <button class=${'map-btn' + (satellite ? ' on' : '')} onClick=${toggleSatellite} aria-pressed=${satellite}
          title=${satellite ? 'Revenir au plan' : 'Vue satellite (nécessite une connexion)'}>${satellite ? '🗺️ Plan' : '🛰️ Satellite'}</button>
      </div>
      ${picking && html`<div class="pick-banner">Touche la carte pour placer le lieu <button class="btn small" onClick=${onCancelPick}>Annuler</button></div>`}
      ${!picking && ready && places.length === 0 && html`<div class="map-hint">Astuce : clic droit (ou appui long) sur la carte pour ajouter un lieu à cet endroit.</div>`}
      ${showCard && sel && !picking && html`
        <div class="map-card">
          <div class="map-card-head">
            <span class="p-icon">${catOf(sel.category).icon}</span>
            <strong>${sel.name}</strong>
            <${DayDots} days=${selPlanned} />
            <span class="spacer"></span>
            <button class="icon-btn small" onClick=${() => onSelect(null)} aria-label="Fermer">✕</button>
          </div>
          <${PlaceDetails} place=${sel} planned=${selPlanned} days=${days} onEdit=${onEdit} />
        </div>`}
    </div>`;
}
