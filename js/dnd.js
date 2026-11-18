// Glisser-déposer (SortableJS, souris + tactile avec appui long).
// SortableJS déplace les éléments du DOM ; on annule ce déplacement et on met à jour
// les données à la place, pour que l'affichage reste piloté par l'état de l'application.
import { useEffect, useRef } from './lib.js';

export function useSortable(ref, options) {
  const optRef = useRef(options);
  optRef.current = options;
  useEffect(() => {
    const el = ref.current;
    if (!el || !window.Sortable) return;
    const o = optRef.current;
    const s = window.Sortable.create(el, {
      group: o.group,
      sort: o.sort !== false,
      animation: 150,
      delay: 280,
      delayOnTouchOnly: true,
      touchStartThreshold: 6,
      handle: '.row',
      filter: 'input, textarea, select, .no-drag',
      preventOnFilter: false,
      ghostClass: 'drag-ghost',
      chosenClass: 'drag-chosen',
      onAdd: (e) => optRef.current.onAdd?.(e),
      onUpdate: (e) => optRef.current.onUpdate?.(e),
    });
    return () => s.destroy();
  }, []);
}

/** Remet le DOM dans son état d'avant le dépôt (l'état de l'app fera le reste). */
export function revertDom(evt) {
  const el = evt.item;
  if (evt.pullMode === 'clone' && evt.clone && evt.clone.parentNode) {
    evt.clone.parentNode.replaceChild(el, evt.clone);
  } else {
    el.remove();
    evt.from.insertBefore(el, evt.from.children[evt.oldIndex] || null);
  }
}
