// Point d'entrée : routage, accueil « Mes voyages », page d'un voyage (destinations + calendrier).
import { html, render, useState, useEffect, useRef } from './lib.js';
import { loadData, actions, getData, flush, DATA_VERSION } from './store.js';
import { useData, ToastHost, Modal, navigate, toast, useAutoFocus } from './ui.js';
import { Workspace } from './workspace.js';
import {
  datesBetween, dayLong, formatRange, orderedDestinations, itemsOf, todayISO, safeColor,
} from './util.js';
import { searchPlaces } from './geo.js';

function parseRoute() {
  const p = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  if (p[0] === 'trip' && p[1]) {
    if (p[2] === 'dest' && p[3]) return { name: 'dest', tripId: p[1], destId: p[3] };
    return { name: 'trip', tripId: p[1] };
  }
  return { name: 'home' };
}

function App() {
  const data = useData();
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const f = () => setRoute(parseRoute());
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);

  let page;
  if (route.name === 'dest') {
    const dest = data.destinations.find((d) => d.id === route.destId);
    page = dest ? html`<${Workspace} key=${dest.id} destId=${dest.id} />` : html`<${NotFound} />`;
  } else if (route.name === 'trip') {
    page = html`<${TripPage} key=${route.tripId} data=${data} tripId=${route.tripId} />`;
  } else {
    page = html`<${Home} data=${data} />`;
  }
  return html`${page}<${ToastHost} />`;
}

function NotFound() {
  return html`<div class="page"><p>Élément introuvable.</p><a class="btn" href="#/">← Mes voyages</a></div>`;
}

// ================= Accueil =================
function Home({ data }) {
  const [creating, setCreating] = useState(false);
  const trips = [...data.trips].sort((a, b) => (a.start || '9999').localeCompare(b.start || '9999'));
  return html`
    <div class="page">
      <header class="page-head">
        <h1>Mes voyages</h1>
        <button class="btn primary" onClick=${() => setCreating(true)}>+ Nouveau voyage</button>
      </header>
      ${trips.length === 0 && html`<div class="empty">Aucun voyage pour l'instant. Crée ton premier voyage pour commencer.</div>`}
      <div class="cards">
        ${trips.map((t) => {
          const dests = orderedDestinations(data, t.id);
          return html`
            <a class="card" href=${'#/trip/' + t.id} key=${t.id}>
              <div class="card-title">${t.name || 'Voyage sans nom'}</div>
              <div class="muted">${formatRange(t.start, t.end)}</div>
              <div class="card-sub">${dests.map((d) => d.name).join(' → ') || 'Aucune destination'}</div>
            </a>`;
        })}
      </div>
      <${BackupSection} />
      ${creating && html`<${TripForm}
        title="Nouveau voyage"
        onClose=${() => setCreating(false)}
        onSave=${(f) => {
          const id = actions.createTrip(f);
          setCreating(false);
          navigate('#/trip/' + id);
        }}
      />`}
    </div>`;
}

function TripForm({ title, trip, onClose, onSave, onDelete }) {
  const [name, setName] = useState(trip?.name || '');
  const [start, setStart] = useState(trip?.start || '');
  const [end, setEnd] = useState(trip?.end || '');
  const nameRef = useAutoFocus();
  const invalid = !name.trim() || (start && end && end < start);
  return html`
    <${Modal} title=${title} onClose=${onClose}>
      <form class="form" onSubmit=${(e) => {
        e.preventDefault();
        if (!invalid) onSave({ name: name.trim(), start, end: end || start });
      }}>
        <label>Nom du voyage<input ref=${nameRef} value=${name} onInput=${(e) => setName(e.target.value)} placeholder="ex. Athènes" /></label>
        <div class="form-row">
          <label>Début<input type="date" value=${start} onInput=${(e) => { setStart(e.target.value); if (!end || end < e.target.value) setEnd(e.target.value); }} /></label>
          <label>Fin<input type="date" value=${end} min=${start} onInput=${(e) => setEnd(e.target.value)} /></label>
        </div>
        ${start && end && end < start && html`<div class="error">La date de fin doit être après la date de début.</div>`}
        <div class="form-actions">
          ${onDelete && html`<button type="button" class="btn danger" onClick=${onDelete}>Supprimer le voyage</button>`}
          <span class="spacer"></span>
          <button type="button" class="btn" onClick=${onClose}>Annuler</button>
          <button class="btn primary" disabled=${invalid}>Enregistrer</button>
        </div>
      </form>
    <//>`;
}

// ================= Sauvegarde : export / import =================
function BackupSection() {
  const fileRef = useRef();
  const doExport = async () => {
    await flush();
    const payload = { app: 'carnet-voyage', version: DATA_VERSION, exportedAt: new Date().toISOString(), data: getData() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `carnet-voyage-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const doImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const obj = JSON.parse(await file.text());
      const d = obj.data || obj;
      if (!Array.isArray(d.trips)) throw new Error('format');
      const n = d.trips.length;
      if (!confirm(`Importer ${n} voyage(s) ?\n\nToutes les données actuelles de cet appareil seront remplacées par celles du fichier.`)) return;
      actions.replaceAll(d);
      await flush();
      toast('Données importées');
      navigate('#/');
    } catch {
      alert("Ce fichier n'est pas une sauvegarde valide du carnet de voyage.");
    }
  };
  return html`
    <section class="backup">
      <h2>Sauvegarde et transfert</h2>
      <p class="muted">Tes données sont enregistrées uniquement sur cet appareil. Pour les passer de l'ordinateur au téléphone : exporte un fichier ici, envoie-le sur ton téléphone, puis importe-le dans l'application du téléphone. La carte hors connexion se télécharge ensuite directement sur le téléphone.</p>
      <div class="row-actions">
        <button class="btn" onClick=${doExport}>⬇ Exporter mes données</button>
        <button class="btn" onClick=${() => fileRef.current.click()}>⬆ Importer un fichier</button>
        <input type="file" accept="application/json,.json" ref=${fileRef} onChange=${doImport} hidden />
      </div>
    </section>`;
}

// ================= Page d'un voyage =================
function TripPage({ data, tripId }) {
  const trip = data.trips.find((t) => t.id === tripId);
  const [editing, setEditing] = useState(false);
  const [addingDest, setAddingDest] = useState(false);
  const [editDest, setEditDest] = useState(null);
  if (!trip) return html`<${NotFound} />`;

  const dests = orderedDestinations(data, trip.id);
  const destIds = new Set(dests.map((d) => d.id));
  const tripDays = data.days.filter((d) => destIds.has(d.destinationId));
  const dates = [...new Set([...datesBetween(trip.start, trip.end), ...tripDays.map((d) => d.date)])].sort();
  const inRange = (date) => trip.start && date >= trip.start && date <= trip.end;

  const toggle = (dest, date, day) => {
    if (day) {
      const n = itemsOf(data, day.id).length;
      if (n > 0 && !confirm(`Retirer ${dest.name} du ${dayLong(date)} ?\n\nLes ${n} élément(s) de cette journée seront retirés : les lieux redeviennent non planifiés, les notes sont supprimées.`)) return;
    }
    actions.toggleDay(dest.id, date);
  };

  return html`
    <div class="page">
      <header class="page-head">
        <a class="back" href="#/">← Mes voyages</a>
      </header>
      <div class="trip-title">
        <div>
          <h1>${trip.name}</h1>
          <div class="muted">${formatRange(trip.start, trip.end)}</div>
        </div>
        <button class="btn small" onClick=${() => setEditing(true)}>Modifier</button>
      </div>

      <section>
        <h2>Destinations</h2>
        <div class="cards">
          ${dests.map((dest) => {
            const nDays = data.days.filter((d) => d.destinationId === dest.id).length;
            const nPlaces = data.places.filter((p) => p.destinationId === dest.id).length;
            return html`
              <div class="card dest-card" key=${dest.id}>
                <a href=${`#/trip/${trip.id}/dest/${dest.id}`}>
                  <div class="card-title">${dest.name}</div>
                  <div class="muted">${nDays} journée(s) · ${nPlaces} lieu(x)</div>
                  <div class="card-open">Ouvrir →</div>
                </a>
                <button class="icon-btn small" title="Renommer ou supprimer" onClick=${() => setEditDest(dest)}>⋯</button>
              </div>`;
          })}
          <button class="card add-card" onClick=${() => setAddingDest(true)}>+ Ajouter une destination</button>
        </div>
      </section>

      <section>
        <h2>Calendrier</h2>
        ${dates.length === 0 && html`<div class="empty">Ajoute les dates du voyage (bouton « Modifier ») pour afficher le calendrier.</div>`}
        ${dates.length > 0 && dests.length === 0 && html`<div class="empty">Ajoute une destination, puis associe-la aux dates ci-dessous.</div>`}
        ${dates.length > 0 && dests.length > 0 && html`
          <p class="muted">Touche une destination pour l'associer à une date. Un jour de transfert peut avoir deux destinations.</p>
          <div class="calendar">
            ${dates.map((date) => html`
              <div class=${'cal-row' + (inRange(date) ? '' : ' out')} key=${date}>
                <div class="cal-date">${dayLong(date)}</div>
                <div class="cal-chips">
                  ${dests.map((dest) => {
                    const day = tripDays.find((d) => d.destinationId === dest.id && d.date === date);
                    const c = day && safeColor(day.color);
                    return html`<button
                      key=${dest.id}
                      class=${'chip' + (day ? ' on' : '')}
                      style=${day ? { background: c, borderColor: c } : null}
                      aria-pressed=${!!day}
                      onClick=${() => toggle(dest, date, day)}
                    >${day ? '✓ ' : ''}${dest.name}</button>`;
                  })}
                </div>
              </div>`)}
          </div>`}
      </section>

      ${editing && html`<${TripForm}
        title="Modifier le voyage"
        trip=${trip}
        onClose=${() => setEditing(false)}
        onSave=${(f) => { actions.updateTrip(trip.id, f); setEditing(false); }}
        onDelete=${() => {
          if (confirm(`Supprimer définitivement le voyage « ${trip.name} » et tous ses lieux ?`)) {
            actions.deleteTrip(trip.id);
            navigate('#/');
          }
        }}
      />`}
      ${addingDest && html`<${DestinationForm} tripId=${trip.id} onClose=${() => setAddingDest(false)} />`}
      ${editDest && html`<${DestinationEdit} dest=${editDest} onClose=${() => setEditDest(null)} />`}
    </div>`;
}

function DestinationForm({ tripId, onClose }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const ref = useAutoFocus();
  const submit = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n || busy) return;
    setBusy(true);
    let geo = {};
    try {
      const [r] = await searchPlaces(n);
      if (r) geo = { lat: r.lat, lng: r.lng, bbox: r.bbox };
    } catch {}
    actions.createDestination(tripId, { name: n, ...geo });
    toast(geo.lat != null ? 'Destination ajoutée' : 'Destination ajoutée (position à cadrer sur la carte)');
    onClose();
  };
  return html`
    <${Modal} title="Nouvelle destination" onClose=${onClose}>
      <form class="form" onSubmit=${submit}>
        <label>Ville ou région<input ref=${ref} value=${name} onInput=${(e) => setName(e.target.value)} placeholder="ex. Athènes" /></label>
        <p class="muted small">La carte sera centrée automatiquement sur cette destination (si tu as une connexion).</p>
        <div class="form-actions">
          <span class="spacer"></span>
          <button type="button" class="btn" onClick=${onClose}>Annuler</button>
          <button class="btn primary" disabled=${!name.trim() || busy}>${busy ? 'Recherche…' : 'Ajouter'}</button>
        </div>
      </form>
    <//>`;
}

function DestinationEdit({ dest, onClose }) {
  const [name, setName] = useState(dest.name);
  return html`
    <${Modal} title="Destination" onClose=${onClose}>
      <form class="form" onSubmit=${(e) => {
        e.preventDefault();
        if (name.trim()) actions.updateDestination(dest.id, { name: name.trim() });
        onClose();
      }}>
        <label>Nom<input value=${name} onInput=${(e) => setName(e.target.value)} /></label>
        <div class="form-actions">
          <button type="button" class="btn danger" onClick=${() => {
            if (confirm(`Supprimer « ${dest.name} », ses journées et tous ses lieux ?`)) {
              actions.deleteDestination(dest.id);
              onClose();
            }
          }}>Supprimer</button>
          <span class="spacer"></span>
          <button type="button" class="btn" onClick=${onClose}>Annuler</button>
          <button class="btn primary">Enregistrer</button>
        </div>
      </form>
    <//>`;
}

// ================= Démarrage =================
async function boot() {
  await loadData();
  try {
    navigator.storage?.persist?.();
  } catch {}
  const root = document.getElementById('app');
  root.textContent = '';
  render(html`<${App} />`, root);
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((e) => console.warn('Service worker', e));
  }
}
boot();
