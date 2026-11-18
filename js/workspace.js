// Espace d'une destination : barre du haut + trois panneaux indépendants PLACE | MAP | ORGANISATION.
import { html, useState, useRef } from './lib.js';
import { actions, getData } from './store.js';
import { usePref, useIsMobile, useOnline, navigate, toast, ThemeToggle } from './ui.js';
import { assignmentMap, daysOf, orderedDestinations, CATEGORIES } from './util.js';
import { PlacePanel } from './place-panel.js';
import { MapPanel } from './map-panel.js';
import { OrgaPanel } from './orga-panel.js';
import { PlaceForm } from './place-form.js';
import { OfflineModal } from './offline.js';
import { reverseGeocode } from './geo.js';

const PANELS = [
  { id: 'place', label: 'PLACE', short: 'PLACE' },
  { id: 'map', label: 'MAP', short: 'MAP' },
  { id: 'orga', label: 'ORGANISATION', short: 'ORGA' },
];
const MIN_W = 220;

export function Workspace({ destId }) {
  const data = getData();
  const dest = data.destinations.find((d) => d.id === destId);
  const trip = data.trips.find((t) => t.id === dest.tripId);
  const isMobile = useIsMobile();
  const online = useOnline();

  const [panelsDesk, setPanelsDesk] = usePref('panels', { place: true, map: true, orga: true });
  const [panelsMob, setPanelsMob] = usePref('panels-mobile', { place: true, map: true, orga: false });
  const panels = isMobile ? panelsMob : panelsDesk;
  const setPanels = isMobile ? setPanelsMob : setPanelsDesk;
  const [sizes, setSizes] = usePref('panel-sizes', { place: 1, map: 2, orga: 1.2 });

  // Filtres de la carte et volets repliés (propres à chaque destination, sur cet appareil)
  const [hiddenCats, setHiddenCats] = usePref('hidden-cats:' + destId, []);
  const [hiddenDays, setHiddenDays] = usePref('hidden-days:' + destId, []);
  const [collapsed, setCollapsed] = usePref('collapsed:' + destId, []);

  const [selected, setSelected] = useState({ id: null, source: null });
  const [form, setForm] = useState(null); // { placeId, draft }
  const [picking, setPicking] = useState(false);
  const [showOffline, setShowOffline] = useState(false);
  const containerRef = useRef();

  const places = data.places.filter((p) => p.destinationId === destId);
  const days = daysOf(data, destId);
  const assignments = assignmentMap(data);
  const tripDests = orderedDestinations(data, trip.id);

  const toggleIn = (arr, v) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const togglePanel = (k) => {
    const next = { ...panels, [k]: !panels[k] };
    if (!next.place && !next.map && !next.orga) return;
    setPanels(next);
  };
  const select = (id, source) => setSelected({ id, source });

  // ---- Fiche de lieu (ajout / modification) ----
  const fillAddress = (lat, lng) => {
    if (!navigator.onLine) return;
    reverseGeocode(lat, lng)
      .then((r) => {
        if (!r) return;
        setForm((f) => (f && !f.draft.address && f.draft.lat === lat ? { ...f, draft: { ...f.draft, address: r.address } } : f));
      })
      .catch(() => {});
  };
  const openAdd = (at) => {
    setForm({
      placeId: null,
      draft: { name: '', category: 'other', address: '', lat: at?.lat ?? null, lng: at?.lng ?? null, notes: '' },
    });
    if (at) fillAddress(at.lat, at.lng);
  };
  const openEdit = (placeId) => {
    const p = getData().places.find((x) => x.id === placeId);
    if (p) setForm({ placeId, draft: { ...p } });
  };
  const saveForm = (draft) => {
    const fields = {
      name: draft.name.trim(), category: draft.category, address: draft.address.trim(),
      lat: draft.lat, lng: draft.lng, notes: draft.notes,
    };
    if (form.placeId) {
      actions.updatePlace(form.placeId, fields);
      toast('Lieu modifié');
    } else {
      const id = actions.createPlace(destId, fields);
      setSelected({ id, source: 'list' });
      setCollapsed((c) => c.filter((x) => x !== fields.category));
      toast('Lieu ajouté à PLACE');
    }
    setForm(null);
  };
  const startPick = () => {
    setPicking(true);
    if (!panels.map) setPanels({ ...panels, map: true });
  };
  const onPick = (ll) => {
    setPicking(false);
    setForm((f) => f && { ...f, draft: { ...f.draft, lat: ll.lat, lng: ll.lng } });
    if (form && !form.draft.address) fillAddress(ll.lat, ll.lng);
  };

  // ---- Redimensionnement des panneaux (ordinateur) ----
  const startResize = (a, b, e) => {
    e.preventDefault();
    const el = containerRef.current;
    const visible = PANELS.filter((p) => panels[p.id]).map((p) => p.id);
    const total = visible.reduce((s, k) => s + sizes[k], 0);
    const pxPerW = el.clientWidth / total;
    const sa = sizes[a];
    const sb = sizes[b];
    const minW = MIN_W / pxPerW;
    const x0 = e.clientX;
    const move = (ev) => {
      let d = (ev.clientX - x0) / pxPerW;
      d = Math.max(minW - sa, Math.min(sb - minW, d));
      setSizes((s) => ({ ...s, [a]: sa + d, [b]: sb - d }));
    };
    const up = () => {
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      document.body.classList.remove('resizing');
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    document.body.classList.add('resizing');
  };

  const order = isMobile ? ['map', 'place', 'orga'] : ['place', 'map', 'orga'];
  const visible = order.filter((k) => panels[k]);
  const panelStyle = (k) => {
    if (isMobile) {
      if (k === 'map' && visible.length > 1) return { flex: '0 0 38%' };
      return { flex: '1 1 0px' };
    }
    return { flex: `${sizes[k]} 1 0px` };
  };

  const placeHidden = !panels.place;
  const renderPanel = (k) => {
    if (k === 'place')
      return html`<${PlacePanel}
        places=${places} days=${days} assignments=${assignments}
        hiddenCats=${hiddenCats}
        onToggleCat=${(c) => setHiddenCats((h) => toggleIn(h, c))}
        onSetAllCats=${(hide) => setHiddenCats(hide ? CATEGORIES.map((c) => c.id) : [])}
        collapsed=${collapsed}
        onToggleCollapse=${(c) => setCollapsed((h) => toggleIn(h, c))}
        onExpand=${(c) => setCollapsed((h) => h.filter((x) => x !== c))}
        selected=${selected} onSelect=${(id) => select(id, 'list')} onEdit=${openEdit}
        onAdd=${() => openAdd()}
      />`;
    if (k === 'map')
      return html`<${MapPanel}
        dest=${dest} places=${places} days=${days} assignments=${assignments}
        hiddenCats=${hiddenCats} hiddenDays=${hiddenDays}
        selected=${selected} onSelect=${(id) => select(id, 'map')}
        showCard=${placeHidden || selected.source === 'map'}
        picking=${picking} onPick=${onPick} onCancelPick=${() => setPicking(false)}
        onAddAt=${openAdd} onEdit=${openEdit}
      />`;
    return html`<${OrgaPanel}
      dest=${dest} trip=${trip} days=${days} places=${places}
      hiddenDays=${hiddenDays}
      onToggleDay=${(id) => setHiddenDays((h) => toggleIn(h, id))}
      onSetAllDays=${(hide) => setHiddenDays(hide ? [...days.map((d) => d.id), 'unplanned'] : [])}
      selected=${selected} onSelect=${(id) => select(id, 'list')}
    />`;
  };

  const children = [];
  visible.forEach((k, i) => {
    if (i > 0 && !isMobile) {
      const a = visible[i - 1];
      children.push(html`<div key=${'r-' + a + k} class="resizer" onPointerDown=${(e) => startResize(a, k, e)} title="Glisser pour redimensionner"></div>`);
    }
    children.push(html`<section key=${k} class=${'panel panel-' + k} style=${panelStyle(k)}>${renderPanel(k)}</section>`);
  });

  return html`
    <div class="ws">
      <header class="ws-bar">
        <a class="icon-btn" href=${'#/trip/' + trip.id} title="Retour au voyage" aria-label="Retour au voyage">←</a>
        <select class="dest-select" value=${destId} onChange=${(e) => navigate(`#/trip/${trip.id}/dest/${e.target.value}`)} aria-label="Destination">
          ${tripDests.map((d) => html`<option value=${d.id}>${d.name}</option>`)}
        </select>
        <div class="seg" role="group" aria-label="Panneaux affichés">
          ${PANELS.map((p) => html`<button class=${panels[p.id] ? 'on' : ''} aria-pressed=${!!panels[p.id]} onClick=${() => togglePanel(p.id)}>${isMobile ? p.short : p.label}</button>`)}
        </div>
        <span class="spacer"></span>
        ${!online && html`<span class="offline-badge" title="Pas de connexion : les modifications sont enregistrées sur l'appareil">Hors ligne</span>`}
        <${ThemeToggle} />
        <button class="icon-btn" title="Carte hors connexion" aria-label="Carte hors connexion" onClick=${() => setShowOffline(true)}>⤓</button>
        ${!panels.place && html`<button class="btn primary add-btn" onClick=${() => openAdd()} title="Ajouter un lieu">${isMobile ? '+' : '+ Ajouter'}</button>`}
      </header>
      <div class=${'ws-panels ' + (isMobile ? 'vertical' : 'horizontal')} ref=${containerRef}>${children}</div>
      ${form && !picking && html`<${PlaceForm}
        key=${form.placeId || 'new'}
        isNew=${!form.placeId}
        draft=${form.draft}
        setDraft=${(dr) => setForm((f) => f && { ...f, draft: typeof dr === 'function' ? dr(f.draft) : dr })}
        dest=${dest}
        onSave=${saveForm}
        onCancel=${() => setForm(null)}
        onPick=${startPick}
        onDelete=${form.placeId ? () => {
          if (confirm(`Supprimer « ${form.draft.name} » de PLACE ?`)) {
            actions.deletePlace(form.placeId);
            setForm(null);
            setSelected({ id: null, source: null });
          }
        } : null}
      />`}
      ${showOffline && html`<${OfflineModal}
        dest=${dest}
        mapVisible=${panels.map}
        onShowMap=${() => setPanels({ ...panels, map: true })}
        onClose=${() => setShowOffline(false)}
      />`}
    </div>`;
}
