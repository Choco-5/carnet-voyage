// PLACE : bibliothèque des lieux, en volets par catégorie.
//  - déplier / replier un volet = lecture de la liste
//  - le petit point = afficher / masquer la catégorie sur la carte
import { html, useState, useRef, useEffect } from './lib.js';
import { actions, getData } from './store.js';
import { DayDots, Dot, copyText } from './ui.js';
import { CATEGORIES, CAT_COLORS, catOf, catIdOf, catColor, dayShort, mapsUrl, norm, safeColor } from './util.js';
import { useSortable, revertDom } from './dnd.js';

export function PlacePanel({
  places, days, assignments, hiddenCats, onToggleCat, onSetAllCats,
  collapsed, onToggleCollapse, onExpand, selected, onSelect, onEdit, onAdd,
}) {
  const [q, setQ] = useState('');
  const filtered = q ? places.filter((p) => norm(p.name + ' ' + p.notes + ' ' + p.address).includes(norm(q))) : places;
  const groups = CATEGORIES.map((c) => ({
    cat: c,
    items: filtered.filter((p) => catIdOf(p) === c.id).sort((a, b) => a.name.localeCompare(b.name, 'fr')),
  })).filter((g) => g.items.length > 0);
  const present = CATEGORIES.filter((c) => places.some((p) => catIdOf(p) === c.id));
  const allHidden = present.length > 0 && present.every((c) => hiddenCats.includes(c.id));

  // Sélection depuis la carte : ouvrir le volet concerné
  const selPlace = places.find((p) => p.id === selected.id);
  useEffect(() => {
    if (selPlace && selected.source === 'map' && collapsed.includes(catIdOf(selPlace))) onExpand(catIdOf(selPlace));
  }, [selected.id, selected.source]);

  return html`
    <div class="panel-inner">
      <div class="panel-head">
        <h3>PLACE</h3>
        <span class="count">${places.length}</span>
        <button class="add-place-btn" onClick=${onAdd} title="Ajouter un lieu" aria-label="Ajouter un lieu">+</button>
        <span class="spacer"></span>
        ${present.length > 0 && html`<button class="link" onClick=${() => onSetAllCats(!allHidden)}>${allHidden ? 'Tout afficher' : 'Tout masquer'} sur la carte</button>`}
      </div>
      ${places.length > 0 && html`
        <div class="panel-tools">
          <input type="search" placeholder="Rechercher dans mes lieux…" value=${q} onInput=${(e) => setQ(e.target.value)} />
        </div>`}
      <div class="panel-scroll">
        ${places.length === 0 && html`<div class="empty">Aucun lieu pour l'instant.<br />Utilise <b>+ Ajouter</b> pour enregistrer un restaurant, une activité, ton hôtel…</div>`}
        ${places.length > 0 && groups.length === 0 && html`<div class="empty">Aucun lieu ne correspond à « ${q} ».</div>`}
        ${groups.map((g) => html`<${CategoryGroup}
          key=${g.cat.id}
          cat=${g.cat}
          items=${g.items}
          hidden=${hiddenCats.includes(g.cat.id)}
          isCollapsed=${collapsed.includes(g.cat.id) && !q}
          onToggleCat=${onToggleCat}
          onToggleCollapse=${onToggleCollapse}
          assignments=${assignments}
          days=${days}
          selected=${selected}
          onSelect=${onSelect}
          onEdit=${onEdit}
        />`)}
      </div>
    </div>`;
}

function CategoryGroup({ cat, items, hidden, isCollapsed, onToggleCat, onToggleCollapse, assignments, days, selected, onSelect, onEdit }) {
  const listRef = useRef();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const color = catColor(getData(), cat.id);
  useSortable(listRef, {
    // On tire une « copie » visuelle : le lieu reste dans PLACE (pas de copie dans les données).
    group: {
      name: 'plan',
      pull: 'clone',
      put: (to, from, dragEl) => from.el.classList.contains('day-list') && dragEl.dataset.type === 'place',
    },
    sort: false,
    // Un lieu glissé d'une journée vers PLACE est retiré de sa journée.
    onAdd(evt) {
      revertDom(evt);
      const itemId = evt.item.dataset.itemId;
      if (itemId) actions.removeItem(itemId);
    },
  });
  return html`
    <div class=${'cat-group' + (hidden ? ' map-hidden' : '') + (isCollapsed ? '' : ' open')} style=${{ '--cat': color }}>
      <div class="cat-head">
        <button class="cat-toggle" onClick=${() => onToggleCollapse(cat.id)} aria-expanded=${!isCollapsed}>
          <span class="chev" aria-hidden="true">▶</span>
          <span class="cat-icon">${cat.icon}</span>
          <span class="cat-label">${cat.label}</span>
          <span class="count">${items.length}</span>
        </button>
        <button class="swatch cat-swatch" style=${{ background: color, borderColor: color }}
          onClick=${() => setPaletteOpen(!paletteOpen)} title="Changer la couleur du volet" aria-label=${'Couleur : ' + cat.label}></button>
        <${Dot} on=${!hidden} label=${cat.label} onClick=${() => onToggleCat(cat.id)} />
      </div>
      ${paletteOpen && html`
        <div class="palette cat-palette">
          ${CAT_COLORS.map((c) => html`<button
            class=${'swatch' + (c === color ? ' current' : '')}
            style=${{ background: c, borderColor: c }}
            aria-label=${'Couleur ' + c}
            onClick=${() => { actions.setCategoryColor(cat.id, c); setPaletteOpen(false); }}
          ></button>`)}
        </div>`}
      <ul class="place-list" ref=${listRef} hidden=${isCollapsed}>
        ${items.map((p) => html`<${PlaceRow}
          key=${p.id}
          place=${p}
          planned=${assignments.get(p.id) || []}
          days=${days}
          isSelected=${selected.id === p.id}
          fromMap=${selected.source === 'map'}
          onSelect=${onSelect}
          onEdit=${onEdit}
        />`)}
      </ul>
    </div>`;
}

function PlaceRow({ place, planned, days, isSelected, fromMap, onSelect, onEdit }) {
  const ref = useRef();
  useEffect(() => {
    if (isSelected && fromMap) setTimeout(() => ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50);
  }, [isSelected, fromMap]);
  const cat = catOf(place.category);
  return html`
    <li ref=${ref} class=${'place-row' + (isSelected ? ' selected' : '')} data-type="place" data-place-id=${place.id}>
      <div class="row" onClick=${() => onSelect(isSelected ? null : place.id)}>
        <span class="p-icon" aria-hidden="true">${cat.icon}</span>
        <span class="p-name">${place.name}</span>
        ${place.lat == null && html`<span class="no-pos" title="Pas de position : ce lieu n'apparaît pas sur la carte">sans position</span>`}
        <${DayDots} days=${planned} />
      </div>
      ${isSelected && html`<${PlaceDetails} place=${place} planned=${planned} days=${days} onEdit=${onEdit} />`}
    </li>`;
}

/** Détails d'un lieu (utilisé dans PLACE et dans la carte). */
export function PlaceDetails({ place, planned, days, onEdit }) {
  const hasPos = place.lat != null && place.lng != null;
  return html`
    <div class="details">
      ${place.address
        ? html`<button class="addr" onClick=${() => copyText(place.address)} title="Copier l'adresse">
            <span class="addr-text">${place.address}</span><span class="copy">⧉ Copier</span>
          </button>`
        : hasPos
          ? html`<button class="addr" onClick=${() => copyText(`${place.lat.toFixed(6)}, ${place.lng.toFixed(6)}`, 'Coordonnées copiées')} title="Copier les coordonnées">
              <span class="addr-text muted">${place.lat.toFixed(5)}, ${place.lng.toFixed(5)}</span><span class="copy">⧉ Copier</span>
            </button>`
          : html`<div class="muted small">Pas d'adresse ni de position.</div>`}
      ${place.notes && html`<div class="notes"><span class="notes-label">Mes notes</span>${place.notes}</div>`}
      ${days.length > 0 && html`
        <div class="day-chips" role="group" aria-label="Journées prévues">
          <span class="day-chips-label">Prévu :</span>
          ${days.map((d) => {
            const on = planned.some((x) => x.id === d.id);
            const c = safeColor(d.color);
            return html`<button
              key=${d.id}
              class=${'day-chip' + (on ? ' on' : '')}
              style=${on ? { background: c, borderColor: c } : { borderColor: c }}
              aria-pressed=${on}
              title=${on ? 'Retirer de ' + dayShort(d.date) : 'Ajouter à ' + dayShort(d.date)}
              onClick=${() => (on ? actions.unassignPlace(place.id, d.id) : actions.assignPlace(place.id, d.id))}
            >${on ? '✓ ' : ''}${dayShort(d.date)}</button>`;
          })}
        </div>`}
      <div class="details-actions">
        ${(hasPos || place.address) && html`<a class="btn small" href=${mapsUrl(place)} target="_blank" rel="noopener">Ouvrir dans Maps</a>`}
        <button class="btn small" onClick=${() => onEdit(place.id)}>Modifier</button>
      </div>
    </div>`;
}
