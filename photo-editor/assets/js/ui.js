// Small UI helpers: icons, toasts, dialogs, busy overlay.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ICONS = {
  open: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  undo: 'M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5M20 9H10a6 6 0 0 0 0 12h3',
  save: 'M12 3v12M7 10l5 5 5-5M4 20h16',
  crop: 'M6 2v14a2 2 0 0 0 2 2h14M2 6h14a2 2 0 0 1 2 2v14',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  text: 'M4 7V4h16v3M12 4v16M9 20h6',
  picture: 'M3 5h18v14H3zM3 16l5-5 4 4 3-3 6 6M8.5 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z',
  wand: 'M4 20 15 9M14 3l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1zM19 12l.7 1.3 1.3.7-1.3.7-.7 1.3-.7-1.3-1.3-.7 1.3-.7z',
  drop: 'M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.500 6-11 6-11z',
  shapes: 'M3 13h8v8H3zM17 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM14 21l4-7 4 7z',
};
export function initIcons() {
  $$('[data-icon]').forEach(el => {
    el.outerHTML = `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[el.dataset.icon]}"/></svg>`;
  });
}

export function toast(msg, bad = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (bad ? ' bad' : '');
  t.textContent = msg;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), bad ? 4500 : 2600);
}

let busyCount = 0;
export function busy(msg = 'Working…') { busyCount++; $('#busyText').textContent = msg; $('#busy').hidden = false; }
export function done() { busyCount = Math.max(0, busyCount - 1); if (!busyCount) $('#busy').hidden = true; }
export const nextFrame = () => new Promise(r => setTimeout(r, 30));

// In-page dialog. Resolves { value, body } — value is null when cancelled with Esc.
export function dialog({ title, text = '', html = '', buttons }) {
  return new Promise(resolve => {
    const ov = document.createElement('div');
    ov.className = 'dlg-ov';
    ov.innerHTML = `<div class="dlg card" role="dialog" aria-modal="true"><h2></h2><p></p><div class="dlg-body"></div><div class="dlg-btns"></div></div>`;
    $('h2', ov).textContent = title;
    const p = $('p', ov); p.textContent = text; if (!text) p.remove();
    const body = $('.dlg-body', ov); body.innerHTML = html;
    const prev = document.activeElement;
    const close = v => { ov.remove(); document.removeEventListener('keydown', key, true); prev && prev.focus && prev.focus(); resolve({ value: v, body }); };
    let primary = null;
    buttons.forEach(b => {
      const el = document.createElement('button');
      el.className = 'pill' + (b.primary ? ' primary' : '');
      el.textContent = b.label;
      el.onclick = () => close(b.value);
      if (b.primary) primary = el;
      $('.dlg-btns', ov).append(el);
    });
    const key = e => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(null); }
      else if (e.key === 'Enter' && primary && e.target.tagName !== 'BUTTON') { e.preventDefault(); e.stopPropagation(); primary.click(); }
      else if (e.key === 'Tab') {
        const f = $$('button,input,select,textarea', ov);
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      } else e.stopPropagation();
    };
    document.addEventListener('keydown', key, true);
    document.body.append(ov);
    (body.querySelector('input[type=text]') || primary || $('button', ov)).focus();
  });
}
