// ORGANISATION : journées colorées, chacune une liste simple de lieux et de notes,
// dans l'ordre choisi, avec une heure facultative.
import { html, useState, useRef } from './lib.js';
import { actions, getData } from './store.js';
import { Dot } from './ui.js';
import { DAY_COLORS, catOf, dayLong, datesBetween, itemsOf, safeColor, NEUTRAL } from './util.js';
import { useSortable, revertDom } from './dnd.js';

// Sur écran tactile, le champ heure natif (sélecteur Android) est posé directement sur la pastille.
const TOUCH = matchMedia('(pointer: coarse)').matches;

export function OrgaPanel({ dest, trip, days, places, hiddenDays, onToggleDay, onSetAllDays, selected, onSelect }) {
  const data = getData();
  const placesById = new Map(places.map((p) => [p.id, p]));
  const planned = new Set(data.items.filter((i) => i.type === 'place').map((i) => i.placeId));
  const unplannedCount = places.filter((p) => !planned.has(p.id)).length;
  const allHidden = hiddenDays.includes('unplanned') && days.every((d) => hiddenDays.includes(d.id));
  const usedDates = new Set(days.map((d) => d.date));
  const freeDates = datesBetween(trip.start, trip.end).filter((d) => !usedDates.has(d));

  return html`
    <div class="panel-inner">
      <div class="panel-head">
        <h3>ORGANISATION</h3>
        <span class="spacer"></span>
        <button class="link" onClick=${() => onSetAllDays(!allHidden)}>${allHidden ? 'Tout afficher' : 'Tout masquer'} sur la carte</button>
      </div>
      <div class="panel-scroll">
        <div class="unplanned-row">
          <span class="swatch" style=${{ background: '#fff', borderColor: NEUTRAL }}></span>
          <span>Non planifiés</span>
          <span class="count">${unplannedCount}</span>
          <span class="spacer"></span>
          <${Dot} on=${!hiddenDays.includes('unplanned')} color=${NEUTRAL} label="lieux non planifiés" onClick=${() => onToggleDay('unplanned')} />
        </div>
        ${days.length === 0 && html`<div class="empty">Aucune journée pour ${dest.name}.<br />Ajoute une date ci-dessous ou depuis le calendrier du voyage.</div>`}
        ${days.map((day) => html`<${DayBlock}
          key=${day.id}
          day=${day}
          items=${itemsOf(data, day.id).filter((it) => it.type === 'note' || placesById.has(it.placeId))}
          placesById=${placesById}
          hidden=${hiddenDays.includes(day.id)}
          onToggle=${() => onToggleDay(day.id)}
          selected=${selected}
          onSelect=${onSelect}
        />`)}
        ${freeDates.length > 0 && html`
          <div class="add-day">
            <select value="" onChange=${(e) => { if (e.target.value) actions.addDay(dest.id, e.target.value); e.target.value = ''; }} aria-label="Ajouter une journée">
              <option value="">+ Ajouter une journée…</option>
              ${freeDates.map((d) => html`<option value=${d}>${dayLong(d)}</option>`)}
            </select>
          </div>`}
      </div>
    </div>`;
}

function DayBlock({ day, items, placesById, hidden, onToggle, selected, onSelect }) {
  const listRef = useRef();
  const [colorOpen, setColorOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteText, setNoteText] = useState('');
  const color = safeColor(day.color);

  useSortable(listRef, {
    group: { name: 'plan', pull: true, put: true },
    onAdd(evt) {
      revertDom(evt);
      const { placeId, itemId } = evt.item.dataset;
      if (evt.pullMode === 'clone' && placeId) actions.assignPlace(placeId, day.id, evt.newIndex);
      else if (itemId) actions.moveItem(itemId, day.id, evt.newIndex);
    },
    onUpdate(evt) {
      revertDom(evt);
      actions.moveItem(evt.item.dataset.itemId, day.id, evt.newIndex);
    },
  });

  const placeCount = items.filter((i) => i.type === 'place').length;
  const del = () => {
    const msg = items.length
      ? `Supprimer la journée du ${dayLong(day.date)} ?\n\nSes lieux redeviennent non planifiés (ils restent dans PLACE) et ses notes sont supprimées.`
      : `Supprimer la journée du ${dayLong(day.date)} ?`;
    if (confirm(msg)) actions.deleteDay(day.id);
  };
  const addNote = (e) => {
    e.preventDefault();
    if (noteText.trim()) actions.addNote(day.id, noteText.trim());
    setNoteText('');
    setNoteOpen(false);
  };

  return html`
    <div class=${'day-block' + (hidden ? ' map-hidden' : '')} style=${{ '--day': color }}>
      <div class="day-head">
        <button class="swatch" style=${{ background: color, borderColor: color }} onClick=${() => setColorOpen(!colorOpen)} title="Changer la couleur" aria-label="Changer la couleur"></button>
        <div class="day-title">${dayLong(day.date)}</div>
        <span class="count">${placeCount}</span>
        <span class="spacer"></span>
        <${Dot} on=${!hidden} color=${color} label=${dayLong(day.date)} onClick=${onToggle} />
        <button class="icon-btn small" title="Supprimer la journée" aria-label="Supprimer la journée" onClick=${del}>🗑</button>
      </div>
      ${colorOpen && html`
        <div class="palette">
          ${DAY_COLORS.map((c) => html`<button
            class=${'swatch' + (c === color ? ' current' : '')}
            style=${{ background: c, borderColor: c }}
            aria-label=${'Couleur ' + c}
            onClick=${() => { actions.setDayColor(day.id, c); setColorOpen(false); }}
          ></button>`)}
        </div>`}
      <ul class="day-list" data-day=${day.id} ref=${listRef}>
        ${items.map((it) => html`<${DayItem}
          key=${it.id}
          item=${it}
          place=${placesById.get(it.placeId)}
          isSelected=${it.type === 'place' && selected.id === it.placeId}
          onSelect=${onSelect}
        />`)}
      </ul>
      <div class="day-foot">
        ${noteOpen
          ? html`<form class="note-form" onSubmit=${addNote}>
              <input value=${noteText} onInput=${(e) => setNoteText(e.target.value)} placeholder="ex. Train 10h → 12h" ref=${(el) => el && !el.dataset.f && (el.dataset.f = 1, el.focus())} />
              <button class="btn small primary">OK</button>
              <button type="button" class="btn small" onClick=${() => { setNoteOpen(false); setNoteText(''); }}>Annuler</button>
            </form>`
          : html`<button class="link" onClick=${() => setNoteOpen(true)}>+ Note</button>`}
      </div>
    </div>`;
}

function DayItem({ item, place, isSelected, onSelect }) {
  const [editTime, setEditTime] = useState(false);
  const [editText, setEditText] = useState(false);
  const focusOnce = (el) => {
    if (el && !el.dataset.f) {
      el.dataset.f = 1;
      el.focus();
    }
  };
  const saveTime = (e) => {
    actions.updateItem(item.id, { time: e.target.value });
    setEditTime(false);
  };
  const saveText = (e) => {
    const v = e.target.value.trim();
    if (v) actions.updateItem(item.id, { text: v });
    setEditText(false);
  };
  return html`
    <li class=${'day-item ' + item.type + (isSelected ? ' selected' : '')}
      data-type=${item.type} data-item-id=${item.id} data-place-id=${item.type === 'place' ? item.placeId : undefined}>
      <div class="row">
        ${TOUCH
          ? html`<label class="time-wrap" title="Heure (facultatif)">
              <span class=${'time' + (item.time ? ' set' : '')}>${item.time || '+ h'}</span>
              <input type="time" class="time-overlay" value=${item.time} onChange=${(e) => actions.updateItem(item.id, { time: e.target.value })} aria-label="Heure (facultatif)" />
            </label>`
          : editTime
            ? html`<input type="time" class="time-input" value=${item.time} ref=${focusOnce} onBlur=${saveTime} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`
            : html`<button class=${'time' + (item.time ? ' set' : '')} onClick=${() => setEditTime(true)} title=${item.time ? "Modifier l'heure" : 'Ajouter une heure (facultatif)'}>${item.time || '+ h'}</button>`}
        ${item.type === 'place'
          ? html`<span class="p-icon" aria-hidden="true">${catOf(place.category).icon}</span>
              <button class="p-name as-link" onClick=${() => onSelect(isSelected ? null : place.id)}>${place.name}</button>`
          : editText
            ? html`<input class="note-input" value=${item.text} ref=${focusOnce} onBlur=${saveText} onKeyDown=${(e) => e.key === 'Enter' && e.target.blur()} />`
            : html`<span class="p-icon" aria-hidden="true">📝</span><span class="note-text" onClick=${() => setEditText(true)} title="Modifier la note">${item.text}</span>`}
        <button class="icon-btn small" title=${item.type === 'place' ? 'Retirer de la journée (le lieu reste dans PLACE)' : 'Supprimer la note'} aria-label="Retirer" onClick=${() => actions.removeItem(item.id)}>✕</button>
      </div>
    </li>`;
}
