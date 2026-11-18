// Fiche d'ajout / modification d'un lieu (ajout manuel, avec recherche d'adresse facultative).
import { html, useState } from './lib.js';
import { Modal, useAutoFocus, useOnline } from './ui.js';
import { CATEGORIES } from './util.js';
import { searchPlaces } from './geo.js';

export function PlaceForm({ isNew, draft, setDraft, dest, onSave, onCancel, onPick, onDelete }) {
  const online = useOnline();
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [catTouched, setCatTouched] = useState(!isNew);
  const nameRef = useAutoFocus();
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const hasPos = draft.lat != null && draft.lng != null;

  const search = async () => {
    const query = (q || draft.name).trim();
    if (!query) return;
    setBusy(true);
    setErr('');
    try {
      const r = await searchPlaces(query, dest.bbox);
      setResults(r);
      if (r.length === 0) setErr('Aucun résultat. Essaie une adresse, ou place le lieu sur la carte.');
    } catch {
      setErr('Recherche impossible (pas de connexion ?). Tu peux placer le lieu sur la carte.');
    }
    setBusy(false);
  };
  const choose = (r) => {
    setDraft((d) => ({
      ...d,
      name: d.name.trim() ? d.name : r.name,
      address: r.address,
      lat: r.lat,
      lng: r.lng,
      category: !catTouched && r.category ? r.category : d.category,
    }));
    setResults(null);
  };

  return html`
    <${Modal} title=${isNew ? 'Ajouter un lieu' : 'Modifier le lieu'} onClose=${onCancel} wide>
      <form class="form" onSubmit=${(e) => { e.preventDefault(); if (draft.name.trim()) onSave(draft); }}>
        <label>Nom *<input ref=${nameRef} value=${draft.name} onInput=${(e) => set({ name: e.target.value })} placeholder="ex. Taverna Klimataria" /></label>
        <label>Catégorie
          <select value=${draft.category} onChange=${(e) => { setCatTouched(true); set({ category: e.target.value }); }}>
            ${CATEGORIES.map((c) => html`<option value=${c.id}>${c.icon} ${c.label}</option>`)}
          </select>
        </label>

        <fieldset class="pos-box">
          <legend>Adresse et position</legend>
          <label>Adresse<input value=${draft.address} onInput=${(e) => set({ address: e.target.value })} placeholder="ex. Platia Theatrou 2, Athina" /></label>
          <div class="search-line">
            <input type="search" value=${q} onInput=${(e) => setQ(e.target.value)} placeholder=${'Rechercher « ' + (draft.name || 'nom ou adresse') + ' »'}
              onKeyDown=${(e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } }} disabled=${!online} />
            <button type="button" class="btn" onClick=${search} disabled=${busy || !online || !(q || draft.name).trim()}>${busy ? '…' : '🔎 Rechercher'}</button>
          </div>
          ${!online && html`<div class="muted small">Recherche indisponible hors connexion : place le lieu sur la carte.</div>`}
          ${err && html`<div class="muted small">${err}</div>`}
          ${results && results.length > 0 && html`
            <ul class="results">
              ${results.map((r) => html`<li key=${r.id}><button type="button" onClick=${() => choose(r)}>
                <strong>${r.name}</strong><span class="muted small">${r.full}</span>
              </button></li>`)}
            </ul>`}
          <div class="pos-line">
            <span class=${hasPos ? 'pos-ok' : 'muted'}>${hasPos ? `📍 Position définie (${draft.lat.toFixed(5)}, ${draft.lng.toFixed(5)})` : "Pas de position : le lieu n'apparaîtra pas sur la carte."}</span>
            <span class="spacer"></span>
            <button type="button" class="btn small" onClick=${onPick}>${hasPos ? 'Déplacer sur la carte' : 'Placer sur la carte'}</button>
            ${hasPos && html`<button type="button" class="btn small" onClick=${() => set({ lat: null, lng: null })}>Retirer</button>`}
          </div>
        </fieldset>

        <label>Mes notes personnelles
          <textarea rows="4" value=${draft.notes} onInput=${(e) => set({ notes: e.target.value })} placeholder="ex. Réserver la veille, demander la terrasse…"></textarea>
        </label>

        <div class="form-actions">
          ${onDelete && html`<button type="button" class="btn danger" onClick=${onDelete}>Supprimer</button>`}
          <span class="spacer"></span>
          <button type="button" class="btn" onClick=${onCancel}>Annuler</button>
          <button class="btn primary" disabled=${!draft.name.trim()}>${isNew ? 'Ajouter à PLACE' : 'Enregistrer'}</button>
        </div>
      </form>
    <//>`;
}
