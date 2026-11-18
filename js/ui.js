// Petits composants et aides d'interface partagés.
import { html, useState, useEffect, useRef } from './lib.js';
import { subscribe, getData } from './store.js';
import { dayShort, safeColor } from './util.js';

export function useData() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return getData();
}

// ---- Préférences d'affichage (propres à cet appareil) ----
export function getPref(key, def) {
  try {
    const v = localStorage.getItem('pref:' + key);
    return v == null ? def : JSON.parse(v);
  } catch {
    return def;
  }
}
export function setPref(key, val) {
  try {
    localStorage.setItem('pref:' + key, JSON.stringify(val));
  } catch {}
}
export function usePref(key, def) {
  const [v, setV] = useState(() => getPref(key, def));
  const set = (nv) =>
    setV((prev) => {
      const r = typeof nv === 'function' ? nv(prev) : nv;
      setPref(key, r);
      return r;
    });
  return [v, set];
}

export function useIsMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const f = () => setM(mq.matches);
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  return m;
}

export function useOnline() {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const f = () => setOn(navigator.onLine);
    addEventListener('online', f);
    addEventListener('offline', f);
    return () => {
      removeEventListener('online', f);
      removeEventListener('offline', f);
    };
  }, []);
  return on;
}

export const navigate = (hash) => {
  location.hash = hash;
};

// ---- Toast ----
let toastFn = null;
export const toast = (msg) => toastFn?.(msg);
export function ToastHost() {
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    let t;
    toastFn = (m) => {
      setMsg(m);
      clearTimeout(t);
      t = setTimeout(() => setMsg(null), 2200);
    };
    return () => (toastFn = null);
  }, []);
  return msg ? html`<div class="toast" role="status">${msg}</div>` : null;
}

export async function copyText(text, label = 'Adresse copiée') {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  toast(label);
}

// ---- Modale ----
export function Modal({ title, onClose, children, wide }) {
  useEffect(() => {
    const f = (e) => e.key === 'Escape' && onClose?.();
    addEventListener('keydown', f);
    return () => removeEventListener('keydown', f);
  }, [onClose]);
  return html`
    <div class="modal-backdrop" onMouseDown=${(e) => e.target === e.currentTarget && onClose?.()}>
      <div class=${'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-label=${title}>
        <div class="modal-head">
          <h2>${title}</h2>
          <button class="icon-btn" onClick=${onClose} aria-label="Fermer">✕</button>
        </div>
        <div class="modal-body">${children}</div>
      </div>
    </div>`;
}

// ---- Pastille de journée : « Lundi 7 » sur la couleur de la journée ----
export function DayPill({ day }) {
  return html`<span class="day-pill" style=${{ background: safeColor(day.color) }}>${dayShort(day.date)}</span>`;
}

// ---- Petit point : affiché / masqué sur la carte ----
export function Dot({ on, color, onClick, label }) {
  const c = color ? safeColor(color) : 'var(--ink)';
  return html`<button
    class=${'dot' + (on ? ' on' : '')}
    aria-pressed=${on}
    title=${(on ? 'Masquer de la carte : ' : 'Afficher sur la carte : ') + label}
    aria-label=${(on ? 'Masquer de la carte : ' : 'Afficher sur la carte : ') + label}
    onClick=${(e) => {
      e.stopPropagation();
      onClick();
    }}
  ><span style=${on ? { background: c, borderColor: c } : { borderColor: c }}></span></button>`;
}

// ---- Mode nuit ----
export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#1d2023' : '#1f6f5c');
}
export function ThemeToggle() {
  const [theme, setTheme] = useState(() => getPref('theme', 'light'));
  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setPref('theme', next);
    applyTheme(next);
    setTheme(next);
  };
  const label = theme === 'dark' ? 'Passer en mode jour' : 'Passer en mode nuit';
  return html`<button class="icon-btn theme-btn" onClick=${toggle} title=${label} aria-label=${label}>${theme === 'dark' ? '☀️' : '🌙'}</button>`;
}

export function useAutoFocus() {
  const ref = useRef();
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return ref;
}
