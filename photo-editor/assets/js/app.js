/* CC Photo Editor — main logic. Everything runs in the browser. */
import { $, $$, initIcons, toast, dialog, busy, done, nextFrame } from './ui.js';
import { makeCanvas, cloneCanvas, zeroAdj, isIdentity, applyAdjust, blurCanvas, floodErase, subjectMask } from './pixels.js';

const fabric = window.fabric;
const MAX_SIDE = 3000, MAX_TABS = 15, MAX_HIST = 30;
const COLORS = ['#ffffff', '#1c2b45', '#000000', '#e85d5d', '#f6a04d', '#f6d24d', '#58c48b', '#4f86e8', '#6f63c6', '#f48fb1'];
const FONTS = ['Noto Sans SC', 'Noto Serif SC', 'ZCOOL KuaiLe', 'Ma Shan Zheng', 'Poppins', 'Playfair Display', 'Bebas Neue', 'Dancing Script'];
const LOOKS = [
  ['Original', {}], ['Brighter', { brightness: 18, contrast: 6 }], ['Vivid', { contrast: 14, saturation: 40 }],
  ['Warm', { warmth: 30, saturation: 8 }], ['Cool', { warmth: -30 }], ['Soft', { brightness: 8, contrast: -12, blur: 6 }],
  ['B&W', { saturation: -100, contrast: 10 }], ['Vintage', { saturation: -35, warmth: 28, contrast: -8, brightness: 6 }],
];
const ADJ = [['brightness', 'Brightness', -100], ['contrast', 'Contrast', -100], ['saturation', 'Colour strength', -100], ['warmth', 'Warmth', -100], ['blur', 'Blur', 0]];

const docs = [];
let cur = null, tool = 'crop', uidN = 0, verN = 0;
const app = $('#app'), stage = $('#stage');
const uid = () => 'o' + (++uidN) + Math.random().toString(36).slice(2, 6);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } } };

fabric.Object.prototype.set({
  transparentCorners: false, cornerColor: '#ffffff', cornerStrokeColor: '#6f63c6', borderColor: '#6f63c6',
  cornerStyle: 'circle', cornerSize: 14, touchCornerSize: 32, borderScaleFactor: 2,
});

/* ------------------------------------------------------------ images */
function makeImage(src, opts = {}) {
  const o = new fabric.Image(src, { originX: 'center', originY: 'center', objectCaching: false, ...opts });
  o.srcCanvas = src; o.uid = opts.uid || uid(); o.adj = zeroAdj(); o.ver = -1; o.rver = null; o.restoreCanvas = null;
  return o;
}
function setBaseProps(o) {
  o.set({ isBase: true, originX: 'left', originY: 'top', left: 0, top: 0, scaleX: 1, scaleY: 1, angle: 0, selectable: false, evented: false });
}
// Re-draw an image object from its source pixels + colour sliders.
// preview=true works on a smaller copy so dragging a slider stays smooth.
function refreshImage(o, preview = false) {
  const src = o.srcCanvas, adj = o.adj;
  let el = src;
  if (isIdentity(adj)) o.outCanvas = null;
  else {
    let from = src;
    const m = Math.max(src.width, src.height);
    if (preview && m > 1200) {
      if (!o._pv || o._pvFor !== o.ver) {
        o._pv = makeCanvas(src.width * 1200 / m, src.height * 1200 / m);
        o._pv.getContext('2d').drawImage(src, 0, 0, o._pv.width, o._pv.height); o._pvFor = o.ver;
      }
      from = o._pv;
      el = o._pvOut || (o._pvOut = makeCanvas(from.width, from.height));
    } else el = o.outCanvas || (o.outCanvas = makeCanvas(src.width, src.height));
    if (el.width !== from.width || el.height !== from.height) { el.width = from.width; el.height = from.height; }
    const ctx = el.getContext('2d', { willReadFrequently: true });
    ctx.clearRect(0, 0, el.width, el.height); ctx.drawImage(from, 0, 0);
    const id = ctx.getImageData(0, 0, el.width, el.height);
    applyAdjust(id.data, adj); ctx.putImageData(id, 0, 0);
    if (adj.blur > 0) {
      const b = blurCanvas(el, adj.blur / 100 * Math.max(el.width, el.height) * 0.02);
      ctx.clearRect(0, 0, el.width, el.height); ctx.drawImage(b, 0, 0);
    }
  }
  if (o._ts) { o.scaleX = o._ts.x; o.scaleY = o._ts.y; o._ts = null; }
  o.setElement(el);
  const fx = src.width / el.width, fy = src.height / el.height;
  if (fx !== 1 || fy !== 1) { o._ts = { x: o.scaleX, y: o.scaleY }; o.scaleX *= fx; o.scaleY *= fy; }
  else { o._pv = o._pvOut = null; }
  o.setCoords(); o.dirty = true;
  if (o.canvas) o.canvas.requestRenderAll();
}
// Fast update of one rectangle after a brush dab.
function refreshRect(o, x, y, w, h) {
  if (!isIdentity(o.adj) && o.outCanvas) {
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
    w = Math.min(o.srcCanvas.width - x, Math.ceil(w) + 1); h = Math.min(o.srcCanvas.height - y, Math.ceil(h) + 1);
    if (w > 0 && h > 0) {
      const ctx = o.outCanvas.getContext('2d', { willReadFrequently: true });
      ctx.clearRect(x, y, w, h); ctx.drawImage(o.srcCanvas, x, y, w, h, x, y, w, h);
      const id = ctx.getImageData(x, y, w, h); applyAdjust(id.data, o.adj); ctx.putImageData(id, x, y);
    }
  }
  o.dirty = true; o.canvas && o.canvas.requestRenderAll();
}
const baseOf = d => d.canvas.getObjects().find(o => o.isBase);
const activeObj = () => cur && cur.canvas.getActiveObject();
// Which picture do the pixel tools work on: the selected picture, else the main photo.
function pixelTarget() { const a = activeObj(); return a && a.type === 'image' ? a : baseOf(cur); }
const targetName = () => (pixelTarget() && !pixelTarget().isBase ? 'Selected picture' : 'Main photo');

/* ------------------------------------------------------------ pixel versions (for undo) */
function newVersion(doc, canvas, blob) {
  const id = ++verN;
  doc.vers.set(id, blob ? Promise.resolve(blob) : new Promise(res => canvas.toBlob(res, 'image/png')));
  return id;
}
async function decode(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* fall through */ }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image(); img.src = url; await img.decode(); return img;
  } finally { URL.revokeObjectURL(url); }
}
async function loadVersion(doc, ver, canvas) {
  const bmp = await decode(await doc.vers.get(ver));
  canvas.width = bmp.width; canvas.height = bmp.height;
  canvas.getContext('2d').drawImage(bmp, 0, 0);
  bmp.close && bmp.close();
}

/* ------------------------------------------------------------ documents and tabs */
function createDoc({ name, canvas: src, handle = null, type = 'image/png', isNew = false, blob = null }) {
  if (docs.length >= MAX_TABS) { toast(`You can have ${MAX_TABS} photos open. Close one first.`, true); return null; }
  const wrap = document.createElement('div'); wrap.className = 'doc-wrap';
  const el = document.createElement('canvas'); wrap.append(el); $('#docs').append(wrap);
  const cv = new fabric.Canvas(el, { preserveObjectStacking: true, selection: false, backgroundColor: '', uniformScaling: true });
  const doc = {
    id: uid(), name, handle, type, isNew, wrap, canvas: cv, w: src.width, h: src.height, bg: null,
    zoom: 1, userZoomed: false, history: [], hi: -1, savedKey: null, vers: new Map(), q: Promise.resolve(),
    thumb: Object.assign(document.createElement('canvas'), { width: 68, height: 68 }),
  };
  const base = makeImage(src); setBaseProps(base); base.ver = newVersion(doc, src, blob);
  cv.add(base);
  cv.on('selection:created', onSelection); cv.on('selection:updated', onSelection); cv.on('selection:cleared', onSelection);
  cv.on('object:modified', () => commit(doc));
  cv.on('text:changed', e => { syncTextPanel(); ensureFont(e.target); });
  cv.on('text:editing:exited', e => { if (!e.target.text.trim()) cv.remove(e.target); commit(doc); });
  cv.on('path:created', e => { e.path.uid = uid(); e.path.shapeKind = 'pen'; commit(doc); });
  docs.push(doc);
  fit(doc); cv.renderAll();
  commit(doc); doc.savedKey = doc.history[0].key;
  return doc;
}
function switchTo(doc) {
  exitModes();
  cur = doc;
  docs.forEach(d => { d.wrap.hidden = d !== doc; });
  app.classList.toggle('empty', !doc);
  if (doc) { doc.userZoomed ? setZoom(doc, doc.zoom) : fit(doc); }
  setTool(tool);
  renderTabs(); refreshUI(); onSelection();
}
function renderTabs() {
  const bar = $('#tabs'); bar.textContent = '';
  docs.forEach(d => {
    const t = document.createElement('div');
    t.className = 'tab' + (d === cur ? ' on' : ''); t.setAttribute('role', 'tab'); t.tabIndex = 0; t.title = d.name;
    const nm = Object.assign(document.createElement('span'), { className: 'nm', textContent: d.name });
    const dot = Object.assign(document.createElement('span'), { className: 'dot', title: 'Not saved yet' });
    const x = Object.assign(document.createElement('button'), { className: 'x', textContent: '×', title: 'Close' });
    x.setAttribute('aria-label', 'Close ' + d.name);
    x.onclick = e => { e.stopPropagation(); closeDoc(d); };
    t.onclick = () => { if (d !== cur) switchTo(d); };
    t.onkeydown = e => { if (e.key === 'Enter' && d !== cur) switchTo(d); };
    t.append(d.thumb, nm, dot, x); d.tabEl = t; bar.append(t);
  });
  if (docs.length) {
    const add = Object.assign(document.createElement('button'), { className: 'pill tab-add', textContent: '+ Open more' });
    add.onclick = pickAndOpen; bar.append(add);
  }
  refreshUI();
}
const isDirty = d => d.history[d.hi].key !== d.savedKey;
function refreshUI() {
  docs.forEach(d => d.tabEl && d.tabEl.classList.toggle('dirty', isDirty(d)));
  $('#btnUndo').disabled = !cur || cur.hi <= 0;
  $('#btnRedo').disabled = !cur || cur.hi >= cur.history.length - 1;
  $('#btnSave').disabled = $('#btnSaveAs').disabled = !cur;
  $$('#rail button').forEach(b => { b.disabled = !cur; });
  $('#zoomLabel').textContent = cur ? Math.round(cur.zoom * 100) + '%' : '–';
}
function updateThumb(doc) {
  setTimeout(() => {
    if (!docs.includes(doc)) return;
    const s = doc.canvas.lowerCanvasEl, c = doc.thumb.getContext('2d'), m = Math.min(s.width, s.height);
    c.fillStyle = '#fff'; c.fillRect(0, 0, 68, 68);
    c.drawImage(s, (s.width - m) / 2, (s.height - m) / 2, m, m, 0, 0, 68, 68);
  }, 90);
}
async function closeDoc(doc) {
  if (isDirty(doc)) {
    const { value } = await dialog({
      title: 'Save your changes?', text: `"${doc.name}" has changes that are not saved yet.`,
      buttons: [{ label: 'Cancel', value: null }, { label: "Don't save", value: 'drop' }, { label: 'Save', value: 'save', primary: true }],
    });
    if (!value) return;
    if (value === 'save' && !(await save(doc))) return;
  }
  const i = docs.indexOf(doc);
  if (i < 0) return;
  if (cur === doc) exitModes();
  docs.splice(i, 1);
  doc.canvas.dispose(); doc.wrap.remove(); doc.vers.clear(); doc.history.length = 0;
  if (cur === doc) switchTo(docs[Math.min(i, docs.length - 1)] || null); else renderTabs();
}

/* ------------------------------------------------------------ zoom */
const maxZoom = d => Math.max(0.1, Math.min(4, Math.sqrt(16e6 / (d.w * d.h)) / (window.devicePixelRatio || 1)));
function setZoom(d, z, user = false) {
  z = clamp(z, 0.05, maxZoom(d));
  d.zoom = z; if (user) d.userZoomed = true;
  const cw = Math.round(d.w * z), ch = Math.round(d.h * z);
  if (d.canvas.getZoom() !== z) d.canvas.setZoom(z);
  if (d.canvas.width !== cw || d.canvas.height !== ch) d.canvas.setDimensions({ width: cw, height: ch });
  if (d === cur) { $('#zoomLabel').textContent = Math.round(z * 100) + '%'; drawCrop(); sizeCursor(); }
}
function fit(d) {
  const z = Math.min((stage.clientWidth - 32) / d.w, (stage.clientHeight - 32) / d.h, 1);
  d.userZoomed = false; setZoom(d, z > 0 ? z : 0.1);
}
const zoomBy = f => cur && setZoom(cur, cur.zoom * f, true);
new ResizeObserver(() => { if (cur && !cur.userZoomed) fit(cur); }).observe(stage);
stage.addEventListener('wheel', e => { if (cur && (e.ctrlKey || e.metaKey)) { e.preventDefault(); zoomBy(Math.exp(-e.deltaY * 0.002)); } }, { passive: false });
// Two-finger pinch to zoom and pan on phones.
let pinch = null;
stage.addEventListener('touchstart', e => {
  if (e.touches.length === 2 && cur) {
    const [a, b] = e.touches;
    pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), z: cur.zoom, x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 };
    cur.canvas._currentTransform = null; stroke = null;
  }
}, { passive: true, capture: true });
stage.addEventListener('touchmove', e => {
  if (!pinch || e.touches.length !== 2 || !cur) return;
  e.preventDefault(); e.stopPropagation();
  const [a, b] = e.touches, mx = (a.clientX + b.clientX) / 2, my = (a.clientY + b.clientY) / 2;
  setZoom(cur, pinch.z * Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) / pinch.d, true);
  stage.scrollLeft -= mx - pinch.x; stage.scrollTop -= my - pinch.y; pinch.x = mx; pinch.y = my;
}, { passive: false, capture: true });
stage.addEventListener('touchend', e => { if (e.touches.length < 2) pinch = null; }, { capture: true });

/* ------------------------------------------------------------ history */
const PROPS = ['left', 'top', 'scaleX', 'scaleY', 'angle', 'flipX', 'flipY', 'opacity', 'originX', 'originY'];
function serialize(o) {
  if (o.type !== 'image') return { kind: 'obj', json: o.toObject(['uid', 'shapeKind']) };
  const p = {}; PROPS.forEach(k => { p[k] = o[k]; });
  if (o._ts) { p.scaleX = o._ts.x; p.scaleY = o._ts.y; }
  return { kind: 'img', uid: o.uid, ver: o.ver, rver: o.rver, adj: { ...o.adj }, isBase: !!o.isBase, p };
}
function commit(doc = cur) {
  if (!doc) return;
  const snap = { w: doc.w, h: doc.h, bg: doc.bg, objs: doc.canvas.getObjects().map(serialize) };
  const key = JSON.stringify(snap);
  if (doc.history[doc.hi] && doc.history[doc.hi].key === key) return;
  doc.history.length = doc.hi + 1;
  doc.history.push({ snap, key });
  if (doc.history.length > MAX_HIST + 1) doc.history.shift();
  doc.hi = doc.history.length - 1;
  const keep = new Set();
  doc.history.forEach(h => h.snap.objs.forEach(s => { if (s.kind === 'img') { keep.add(s.ver); if (s.rver != null) keep.add(s.rver); } }));
  for (const k of doc.vers.keys()) if (!keep.has(k)) doc.vers.delete(k);
  refreshUI(); updateThumb(doc);
}
const enliven = json => new Promise(res => fabric.util.enlivenObjects([json], o => res(o[0])));
async function restore(doc, snap) {
  const cv = doc.canvas; cv.discardActiveObject();
  const live = new Map(), others = new Map();
  cv.getObjects().forEach(o => { (o.type === 'image' ? live : others).set(o.uid, o); });
  const out = [];
  for (const s of snap.objs) {
    if (s.kind !== 'img') {
      const same = others.get(s.json.uid);
      out.push(same && JSON.stringify(same.toObject(['uid', 'shapeKind'])) === JSON.stringify(s.json) ? same : await enliven(s.json));
      continue;
    }
    const o = live.get(s.uid) || makeImage(makeCanvas(1, 1), { uid: s.uid });
    if (o.ver !== s.ver) { await loadVersion(doc, s.ver, o.srcCanvas); o.ver = s.ver; }
    if (o.rver !== s.rver) {
      if (s.rver == null) o.restoreCanvas = null;
      else { o.restoreCanvas = o.restoreCanvas || makeCanvas(1, 1); await loadVersion(doc, s.rver, o.restoreCanvas); }
      o.rver = s.rver;
    }
    o.adj = { ...s.adj }; o._ts = null;
    if (s.isBase) setBaseProps(o);
    o.set(s.p); refreshImage(o); out.push(o);
  }
  cv.remove(...cv.getObjects());
  out.forEach(o => { cv.add(o); o.setCoords(); });
  doc.w = snap.w; doc.h = snap.h; doc.bg = snap.bg; cv.backgroundColor = snap.bg || '';
  if (doc === cur) { doc.userZoomed ? setZoom(doc, doc.zoom) : fit(doc); resetCrop(); onSelection(); }
  cv.requestRenderAll(); refreshUI(); updateThumb(doc);
}
function stepHistory(dir) {
  const doc = cur; if (!doc) return;
  const a = doc.canvas.getActiveObject(); if (a && a.isEditing) a.exitEditing();
  exitModes(true);
  doc.q = doc.q.then(async () => {
    const i = doc.hi + dir;
    if (i < 0 || i >= doc.history.length) return;
    doc.hi = i; await restore(doc, doc.history[i].snap);
  }).catch(e => console.error(e));
  return doc.q;
}

/* ------------------------------------------------------------ opening photos */
async function fileToCanvas(file) {
  const bmp = await decode(file);
  const m = Math.max(bmp.width, bmp.height), f = m > MAX_SIDE ? MAX_SIDE / m : 1;
  const c = makeCanvas(bmp.width * f, bmp.height * f), ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close && bmp.close();
  return { canvas: c, scaled: f < 1 };
}
const isImage = f => f && (/^image\//.test(f.type) || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name || ''));
async function openFiles(items) {
  items = items.filter(i => isImage(i.file));
  if (!items.length) return;
  busy('Opening your photos…'); await nextFrame();
  let last = null, scaled = false, failed = 0;
  for (const { file, handle } of items) {
    if (docs.length >= MAX_TABS) { toast(`Only ${MAX_TABS} photos can be open at once.`, true); break; }
    try {
      const r = await fileToCanvas(file); scaled = scaled || r.scaled;
      const type = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ? file.type : 'image/png';
      const pasted = !file.name || file.name === 'image.png';
      last = createDoc({ name: pasted ? 'Pasted photo.png' : file.name, canvas: r.canvas, handle, type, isNew: pasted, blob: r.scaled ? null : file }) || last;
    } catch (e) { failed++; }
  }
  done();
  if (failed) toast("Sorry, that photo type can't be opened here. Try saving it as JPG first.", true);
  if (scaled) toast('Big photos were made a little smaller so editing stays fast.');
  if (last) switchTo(last);
}
async function pickAndOpen() {
  if (window.showOpenFilePicker) {
    try {
      const hs = await window.showOpenFilePicker({ multiple: true, types: [{ description: 'Photos', accept: { 'image/*': ['.jpg', '.jpeg', '.png', '.webp', '.gif'] } }] });
      return openFiles(await Promise.all(hs.map(async h => ({ file: await h.getFile(), handle: h }))));
    } catch (e) { if (e.name === 'AbortError') return; }
  }
  const inp = $('#fileOpen'); inp.value = ''; inp.click();
}
$('#fileOpen').addEventListener('change', e => openFiles([...e.target.files].map(file => ({ file }))));
function newBlank(w, h) {
  const c = makeCanvas(w, h), x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h);
  const d = createDoc({ name: 'Blank canvas', canvas: c, isNew: true });
  if (d) switchTo(d);
}
async function addPictures(files) {
  files = files.filter(isImage);
  if (!cur || !files.length) return;
  busy('Adding your picture…'); await nextFrame();
  let last = null;
  for (const f of files) {
    try {
      const { canvas } = await fileToCanvas(f);
      const o = makeImage(canvas); o.ver = newVersion(cur, canvas);
      const s = Math.min(1, cur.w * 0.6 / canvas.width, cur.h * 0.6 / canvas.height);
      o.set({ left: cur.w / 2, top: cur.h / 2, scaleX: s, scaleY: s });
      cur.canvas.add(o); last = o;
    } catch { toast("Sorry, that picture can't be opened here.", true); }
  }
  done();
  if (last) { setTool('picture'); cur.canvas.setActiveObject(last); cur.canvas.requestRenderAll(); commit(); toast('Picture added. Drag it into place.'); }
}
document.addEventListener('paste', e => {
  const files = [...(e.clipboardData?.files || [])].filter(isImage);
  if (!files.length || $('.dlg-ov')) return;
  e.preventDefault();
  cur ? addPictures(files) : openFiles(files.map(file => ({ file })));
});
let dragDepth = 0;
const hasFiles = e => [...(e.dataTransfer?.types || [])].includes('Files');
document.addEventListener('dragenter', e => { if (hasFiles(e)) { dragDepth++; $('#dropHint').hidden = false; } });
document.addEventListener('dragleave', e => { if (hasFiles(e) && --dragDepth <= 0) { dragDepth = 0; $('#dropHint').hidden = true; } });
document.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
document.addEventListener('drop', async e => {
  if (!hasFiles(e)) return;
  e.preventDefault(); dragDepth = 0; $('#dropHint').hidden = true;
  const dt = [...e.dataTransfer.items].filter(i => i.kind === 'file');
  const items = await Promise.all(dt.map(async i => {
    const file = i.getAsFile(); let handle = null;
    try { if (i.getAsFileSystemHandle) { const h = await i.getAsFileSystemHandle(); if (h && h.kind === 'file') handle = h; } } catch { /* no handle */ }
    return { file, handle };
  }));
  const good = items.filter(i => isImage(i.file));
  if (!good.length) return toast('Please drop photo files (JPG, PNG or WebP).', true);
  if (!cur) return openFiles(good);
  const { value } = await dialog({
    title: 'What would you like to do?', text: 'You dropped ' + (good.length > 1 ? good.length + ' pictures.' : 'a picture.'),
    buttons: [{ label: 'Cancel', value: null }, { label: 'Open as new photo', value: 'open' }, { label: 'Put on top of this photo', value: 'add', primary: true }],
  });
  if (value === 'open') openFiles(good); else if (value === 'add') addPictures(good.map(i => i.file));
});

/* ------------------------------------------------------------ tools */
function setTool(name) {
  exitModes();
  tool = name;
  $$('#rail button').forEach(b => b.classList.toggle('on', !!cur && b.dataset.tool === name));
  $$('.tool-panel').forEach(p => { p.hidden = p.dataset.panel !== name; });
  if (!cur) return;
  if (name === 'crop') { cur.canvas.discardActiveObject(); cur.canvas.requestRenderAll(); resetCrop(); cur.wrap.append(cropLayer); cropLayer.hidden = false; }
  syncPanels();
}
// Leave brush / pen / crop-frame modes.
function exitModes(keepCrop = false) {
  if (stroke) endStroke();
  paint = null; paintLayer.hidden = true;
  $$('[data-paint]').forEach(b => b.classList.remove('on'));
  if (cur) cur.canvas.isDrawingMode = false;
  $('#btnPen').classList.remove('on');
  if (!keepCrop) cropLayer.hidden = true;
}
function syncPanels() {
  if (!cur) return;
  $$('[data-target]').forEach(el => { el.textContent = targetName(); });
  if (tool === 'adjust') syncAdjust();
  if (tool === 'text') syncTextPanel();
  if (tool === 'removebg') $$('#bgColors .sw').forEach(s => s.classList.toggle('on', (s.dataset.c || null) === cur.bg));
  const a = activeObj();
  $('#picActions').hidden = !(a && a.type === 'image');
}
function onSelection() {
  const a = activeObj();
  $('#selCard').hidden = !a;
  if (a) {
    $('#selOpacity').value = Math.round((1 - a.opacity) * 100);
    if (!paint) {
      if (a.type === 'i-text' && tool !== 'text') return setTool('text');
      if (a.shapeKind && tool !== 'shapes') return setTool('shapes');
      if (a.type === 'image' && !['adjust', 'removebg', 'blur', 'picture'].includes(tool)) return setTool('picture');
    }
    if (a.shapeKind) syncShapeUI(a);
  }
  syncPanels();
}
function swatches(box, onPick, { none = false, picker = true } = {}) {
  const pick = (c, el) => { $$('.sw', box).forEach(s => s.classList.remove('on')); el && el.classList.add('on'); onPick(c); };
  if (none) {
    const n = Object.assign(document.createElement('button'), { className: 'sw none on', title: 'None (see-through)' });
    n.setAttribute('aria-label', 'No colour'); n.onclick = () => pick(null, n); box.append(n);
  }
  COLORS.forEach(c => {
    const b = Object.assign(document.createElement('button'), { className: 'sw', title: c });
    b.style.background = c; b.dataset.c = c; b.setAttribute('aria-label', 'Colour ' + c);
    b.onclick = () => pick(c, b); box.append(b);
  });
  if (picker) {
    const p = Object.assign(document.createElement('input'), { type: 'color', value: '#6f63c6', title: 'Pick any colour' });
    p.setAttribute('aria-label', 'Pick any colour');
    p.oninput = () => pick(p.value, null); box.append(p);
  }
}

/* ------------------------------------------------------------ crop, rotate, flip */
const cropLayer = $('#cropLayer'), cropFrame = $('#cropFrame');
let crop = { x: 0, y: 0, w: 1, h: 1 }, ratio = 0;
const RATIOS = [['Free', 0], ['1:1', 1], ['4:5', 4 / 5], ['3:4', 3 / 4], ['9:16', 9 / 16], ['4:3', 4 / 3], ['16:9', 16 / 9]];
RATIOS.forEach(([label, r], i) => {
  const b = Object.assign(document.createElement('button'), { textContent: label, className: i ? '' : 'on' });
  b.onclick = () => { ratio = r; $$('#ratioRow button').forEach(x => x.classList.toggle('on', x === b)); resetCrop(); };
  $('#ratioRow').append(b);
});
function resetCrop() {
  if (!cur) return;
  const W = cur.w, H = cur.h;
  if (ratio) { const w = Math.min(W, H * ratio), h = w / ratio; crop = { x: (W - w) / 2, y: (H - h) / 2, w, h }; }
  else crop = { x: 0, y: 0, w: W, h: H };
  drawCrop();
}
function drawCrop() {
  if (!cur) return;
  const s = cropFrame.style;
  s.left = crop.x / cur.w * 100 + '%'; s.top = crop.y / cur.h * 100 + '%';
  s.width = crop.w / cur.w * 100 + '%'; s.height = crop.h / cur.h * 100 + '%';
}
function resizeCrop(s, h, dx, dy) {
  const W = cur.w, H = cur.h, MIN = Math.min(40, W, H);
  if (h === 'move') return { x: clamp(s.x + dx, 0, W - s.w), y: clamp(s.y + dy, 0, H - s.h), w: s.w, h: s.h };
  let l = s.x, t = s.y, r = s.x + s.w, b = s.y + s.h;
  const W_ = h.includes('w'), E_ = h.includes('e'), N_ = h.includes('n'), S_ = h.includes('s');
  if (W_) l = clamp(l + dx, 0, r - MIN); if (E_) r = clamp(r + dx, l + MIN, W);
  if (N_) t = clamp(t + dy, 0, b - MIN); if (S_) b = clamp(b + dy, t + MIN, H);
  if (ratio) {
    let w = r - l, hh = b - t;
    if (h.length === 2) {
      const ax = W_ ? r : l, ay = N_ ? b : t;
      w = Math.min(Math.max(w, hh * ratio), W_ ? ax : W - ax, (N_ ? ay : H - ay) * ratio); hh = w / ratio;
      l = W_ ? ax - w : ax; t = N_ ? ay - hh : ay;
    } else if (E_ || W_) {
      const cy = s.y + s.h / 2; w = Math.min(w, 2 * Math.min(cy, H - cy) * ratio); hh = w / ratio;
      if (W_) l = r - w; t = cy - hh / 2;
    } else {
      const cx = s.x + s.w / 2; hh = Math.min(hh, 2 * Math.min(cx, W - cx) / ratio); w = hh * ratio;
      if (N_) t = b - hh; l = cx - w / 2;
    }
    r = l + w; b = t + hh;
  }
  return { x: l, y: t, w: r - l, h: b - t };
}
cropFrame.addEventListener('pointerdown', e => {
  if (!cur) return;
  e.preventDefault();
  const h = e.target.dataset.h || 'move', s = { ...crop }, sx = e.clientX, sy = e.clientY, id = e.pointerId;
  cropFrame.setPointerCapture(id);
  const move = ev => { if (ev.pointerId === id) { crop = resizeCrop(s, h, (ev.clientX - sx) / cur.zoom, (ev.clientY - sy) / cur.zoom); drawCrop(); } };
  const up = () => { cropFrame.removeEventListener('pointermove', move); cropFrame.removeEventListener('pointerup', up); cropFrame.removeEventListener('pointercancel', up); };
  cropFrame.addEventListener('pointermove', move); cropFrame.addEventListener('pointerup', up); cropFrame.addEventListener('pointercancel', up);
});
// Replace the main photo's pixels (and its "put back" copy) using fn(canvas) -> canvas.
function replaceBase(d, fn) {
  const base = baseOf(d);
  base.srcCanvas = fn(base.srcCanvas); base.ver = newVersion(d, base.srcCanvas);
  if (base.restoreCanvas) { base.restoreCanvas = fn(base.restoreCanvas); base.rver = newVersion(d, base.restoreCanvas); }
  base._pv = null; setBaseProps(base); refreshImage(base);
  d.w = base.srcCanvas.width; d.h = base.srcCanvas.height;
}
function afterResize(d) {
  d.canvas.discardActiveObject();
  d.userZoomed ? setZoom(d, d.zoom) : fit(d);
  resetCrop(); commit(d);
}
function applyCrop() {
  const d = cur; if (!d) return;
  const x = Math.round(crop.x), y = Math.round(crop.y);
  const w = Math.min(d.w - x, Math.round(crop.w)), h = Math.min(d.h - y, Math.round(crop.h));
  if (w >= d.w && h >= d.h) return toast('Drag the frame smaller first, then tap Apply crop.');
  replaceBase(d, c => { const n = makeCanvas(w, h); n.getContext('2d').drawImage(c, -x, -y); return n; });
  d.canvas.getObjects().slice().forEach(o => {
    if (o.isBase) return;
    o.set({ left: o.left - x, top: o.top - y }); o.setCoords();
    const b = o.getBoundingRect(true, true);
    if (b.left > w || b.top > h || b.left + b.width < 0 || b.top + b.height < 0) d.canvas.remove(o);
  });
  afterResize(d); toast('Cropped!');
}
function rotateDoc(kind) {
  const d = cur; if (!d) return;
  const W = d.w, H = d.h, quarter = kind === 'left' || kind === 'right';
  replaceBase(d, c => {
    const n = makeCanvas(quarter ? c.height : c.width, quarter ? c.width : c.height), x = n.getContext('2d');
    if (kind === 'right') { x.translate(c.height, 0); x.rotate(Math.PI / 2); }
    else if (kind === 'left') { x.translate(0, c.width); x.rotate(-Math.PI / 2); }
    else if (kind === 'fliph') { x.translate(c.width, 0); x.scale(-1, 1); }
    else { x.translate(0, c.height); x.scale(1, -1); }
    x.drawImage(c, 0, 0); return n;
  });
  d.canvas.getObjects().forEach(o => {
    if (o.isBase) return;
    const c = o.getCenterPoint(); let nx, ny;
    if (kind === 'right') { nx = H - c.y; ny = c.x; o.angle += 90; }
    else if (kind === 'left') { nx = c.y; ny = W - c.x; o.angle -= 90; }
    else if (kind === 'fliph') { nx = W - c.x; ny = c.y; o.angle = -o.angle; o.flipX = !o.flipX; }
    else { nx = c.x; ny = H - c.y; o.angle = -o.angle; o.flipY = !o.flipY; }
    o.setPositionByOrigin(new fabric.Point(nx, ny), 'center', 'center'); o.setCoords();
  });
  afterResize(d);
}
$('#btnApplyCrop').onclick = applyCrop;
$('#btnResetCrop').onclick = resetCrop;
$$('[data-rot]').forEach(b => { b.onclick = () => rotateDoc(b.dataset.rot); });

/* ------------------------------------------------------------ brightness and colour */
ADJ.forEach(([k, label, min]) => {
  const l = document.createElement('label'); l.className = 'slider';
  l.innerHTML = `<span class="top"><span>${label}</span><button class="rs" type="button">Reset</button></span><input type="range" min="${min}" max="100" value="0" data-adj="${k}">`;
  const inp = $('input', l);
  let raf = 0;
  inp.oninput = () => {
    const t = pixelTarget(); if (!t) return;
    t.adj[k] = +inp.value;
    if (!raf) raf = requestAnimationFrame(() => { raf = 0; refreshImage(t, true); });
  };
  inp.onchange = () => { cancelAnimationFrame(raf); raf = 0; const t = pixelTarget(); if (t) { t.adj[k] = +inp.value; refreshImage(t); commit(); } };
  $('.rs', l).onclick = e => { e.preventDefault(); inp.value = 0; inp.onchange(); };
  $('#adjSliders').append(l);
});
LOOKS.forEach(([name, vals]) => {
  const b = document.createElement('button');
  const c = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  b.append(c, name); b.dataset.look = name;
  b.onclick = () => { const t = pixelTarget(); if (!t) return; t.adj = { ...zeroAdj(), ...vals }; refreshImage(t); commit(); syncAdjust(false); };
  $('#looks').append(b);
});
function syncAdjust(thumbs = true) {
  const t = pixelTarget(); if (!t) return;
  $$('[data-adj]').forEach(i => { i.value = t.adj[i.dataset.adj]; });
  if (!thumbs) return;
  const s = t.srcCanvas, m = Math.min(s.width, s.height);
  LOOKS.forEach(([name, vals]) => {
    const c = $(`[data-look="${name}"] canvas`), x = c.getContext('2d', { willReadFrequently: true });
    x.clearRect(0, 0, 64, 64); x.drawImage(s, (s.width - m) / 2, (s.height - m) / 2, m, m, 0, 0, 64, 64);
    const id = x.getImageData(0, 0, 64, 64); applyAdjust(id.data, { ...zeroAdj(), ...vals }); x.putImageData(id, 0, 0);
    if (vals.blur) { const bl = blurCanvas(c, 1.2); x.clearRect(0, 0, 64, 64); x.drawImage(bl, 0, 0); }
  });
}
$('#btnAdjReset').onclick = () => { const t = pixelTarget(); if (t) { t.adj = zeroAdj(); refreshImage(t); commit(); syncAdjust(false); } };

/* ------------------------------------------------------------ text */
const ts = { font: FONTS[0], size: 80, fill: '#ffffff', bold: true, italic: false, align: 'center', shadow: true, highlight: false, hl: '#f6d24d', stroke: 0, strokeColor: '#1c2b45' };
const activeText = () => { const a = activeObj(); return a && a.type === 'i-text' ? a : null; };
FONTS.forEach(f => { const o = new Option(f, f); o.style.fontFamily = `"${f}"`; $('#txtFont').append(o); });
async function ensureFont(o) {
  const fam = o.fontFamily, spec = `${o.fontStyle} ${o.fontWeight} 40px "${fam}"`;
  try { await document.fonts.load(spec, o.text || 'A'); } catch { return; }
  if (!o.canvas) return;
  fabric.util.clearFabricFontCache(fam);
  o.initDimensions(); o.setCoords(); o.canvas.requestRenderAll();
}
function styleText(o) {
  const unit = Math.max(cur.w, cur.h) / 1000, fs = Math.max(8, ts.size * unit);
  o.set({
    fontFamily: ts.font, fontSize: fs, scaleX: 1, scaleY: 1, fill: ts.fill, fontWeight: ts.bold ? 'bold' : 'normal',
    fontStyle: ts.italic ? 'italic' : 'normal', textAlign: ts.align,
    shadow: ts.shadow ? new fabric.Shadow({ color: 'rgba(0,0,0,0.5)', blur: fs * 0.14, offsetX: fs * 0.03, offsetY: fs * 0.05 }) : null,
    textBackgroundColor: ts.highlight ? ts.hl : '',
    stroke: ts.stroke ? ts.strokeColor : null, strokeWidth: ts.stroke ? ts.stroke * fs / 150 : 0, paintFirst: 'stroke', strokeLineJoin: 'round',
  });
  o.setCoords(); ensureFont(o);
}
function readText(o) {
  const unit = Math.max(cur.w, cur.h) / 1000;
  Object.assign(ts, {
    font: o.fontFamily, size: Math.round(o.fontSize * o.scaleY / unit), fill: o.fill, bold: o.fontWeight === 'bold', italic: o.fontStyle === 'italic',
    align: o.textAlign, shadow: !!o.shadow, highlight: !!o.textBackgroundColor, stroke: o.stroke ? Math.round(o.strokeWidth * 150 / o.fontSize) : 0,
  });
  if (o.textBackgroundColor) ts.hl = o.textBackgroundColor;
  if (o.stroke) ts.strokeColor = o.stroke;
}
function syncTextPanel() {
  const o = activeText();
  if (o) { readText(o); if (document.activeElement !== $('#txtContent')) $('#txtContent').value = o.text; }
  else $('#txtContent').value = '';
  $('#txtContent').disabled = !o;
  $('#txtFont').value = ts.font; $('#txtSize').value = ts.size; $('#txtStroke').value = ts.stroke;
  $('#txtBold').classList.toggle('on', ts.bold); $('#txtItalic').classList.toggle('on', ts.italic);
  $('#txtShadow').classList.toggle('on', ts.shadow); $('#txtHighlight').classList.toggle('on', ts.highlight);
  $$('[data-align]').forEach(b => b.classList.toggle('on', b.dataset.align === ts.align));
  $$('#txtColors .sw').forEach(s => s.classList.toggle('on', s.dataset.c === ts.fill));
  if (/^#[0-9a-f]{6}$/i.test(ts.hl)) $('#txtHlColor').value = ts.hl;
  if (/^#[0-9a-f]{6}$/i.test(ts.strokeColor)) $('#txtStrokeColor').value = ts.strokeColor;
}
// Apply a panel change to the selected text (or just remember it for the next one).
function textChange(patch, save = true) {
  const o = activeText();
  if (o) readText(o);
  Object.assign(ts, patch);
  if (o) { styleText(o); cur.canvas.requestRenderAll(); if (save) commit(); }
  syncTextPanel();
}
$('#btnAddText').onclick = () => {
  if (!cur) return;
  const o = new fabric.IText('Your text', { left: cur.w / 2, top: cur.h / 2, originX: 'center', originY: 'center' });
  o.uid = uid(); ts.size = 80;
  cur.canvas.add(o); styleText(o); cur.canvas.setActiveObject(o); cur.canvas.requestRenderAll(); commit();
  const t = $('#txtContent'); t.disabled = false; t.value = o.text;
  if (!matchMedia('(max-width:899px)').matches) { t.focus(); t.select(); }
  toast('Text added. Type your words in the box.');
};
$('#txtContent').oninput = e => { const o = activeText(); if (o) { o.set('text', e.target.value); o.setCoords(); cur.canvas.requestRenderAll(); ensureFont(o); } };
$('#txtContent').onchange = () => commit();
$('#txtFont').onchange = e => textChange({ font: e.target.value });
$('#txtBold').onclick = () => textChange({ bold: !ts.bold });
$('#txtItalic').onclick = () => textChange({ italic: !ts.italic });
$$('[data-align]').forEach(b => { b.onclick = () => textChange({ align: b.dataset.align }); });
$('#txtSize').oninput = e => textChange({ size: +e.target.value }, false);
$('#txtSize').onchange = () => commit();
swatches($('#txtColors'), c => textChange({ fill: c }));
$('#txtShadow').onclick = () => textChange({ shadow: !ts.shadow });
$('#txtHighlight').onclick = () => textChange({ highlight: !ts.highlight });
$('#txtHlColor').oninput = e => textChange({ hl: e.target.value, highlight: true }, false);
$('#txtHlColor').onchange = () => commit();
$('#txtStroke').oninput = e => textChange({ stroke: +e.target.value }, false);
$('#txtStroke').onchange = () => commit();
$('#txtStrokeColor').oninput = e => textChange({ strokeColor: e.target.value }, false);
$('#txtStrokeColor').onchange = () => commit();

/* ------------------------------------------------------------ add picture */
$('#btnAddPicture').onclick = () => { const i = $('#filePicture'); i.value = ''; i.click(); };
$('#filePicture').addEventListener('change', e => addPictures([...e.target.files]));
$('#btnPicRemoveBg').onclick = () => removeBgAuto();
$('#btnPicBright').onclick = () => setTool('adjust');

/* ------------------------------------------------------------ brushes: eraser, put back, blur, click a colour */
const paintLayer = $('#paintLayer'), brushCursor = $('#brushCursor');
let paint = null, stroke = null;
const brushPx = () => +(paint && paint.kind === 'blur' ? $('#blurBrush') : $('#bgBrush')).value;
function sizeCursor() { const s = brushPx(); brushCursor.style.width = brushCursor.style.height = s + 'px'; }
function startPaint(kind) {
  if (!cur) return;
  if (paint && paint.kind === kind) return exitModes();
  const target = pixelTarget();
  if (kind === 'restore' && !target.restoreCanvas) return toast('Nothing has been removed yet, so there is nothing to put back.');
  exitModes();
  paint = { kind, target };
  $$(`[data-paint="${kind}"]`).forEach(b => b.classList.add('on'));
  cur.wrap.append(paintLayer); paintLayer.hidden = false; sizeCursor();
  brushCursor.style.display = 'none';
  toast({ pick: 'Now tap the colour you want to remove.', erase: 'Rub over the parts to remove.', restore: 'Rub to bring parts back.', blur: 'Paint over what you want to hide.' }[kind]);
}
function imgPoint(e) {
  const r = cur.wrap.getBoundingClientRect(), o = paint.target;
  const p = fabric.util.transformPoint({ x: (e.clientX - r.left) / cur.zoom, y: (e.clientY - r.top) / cur.zoom }, fabric.util.invertTransform(o.calcTransformMatrix()));
  return { x: p.x + o.width / 2, y: p.y + o.height / 2 };
}
function ensureRestore(o) { if (!o.restoreCanvas) { o.restoreCanvas = cloneCanvas(o.srcCanvas); o.rver = o.ver; } }
function beginStroke(p) {
  const o = paint.target, ctx = o.srcCanvas.getContext('2d');
  const size = Math.max(1, brushPx() / cur.zoom / Math.abs(o.scaleX || 1));
  ctx.save(); ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = size;
  if (paint.kind === 'erase') { ensureRestore(o); ctx.globalCompositeOperation = 'destination-out'; ctx.strokeStyle = '#000'; }
  else if (paint.kind === 'restore') ctx.strokeStyle = ctx.createPattern(o.restoreCanvas, 'no-repeat');
  else {
    const r = +$('#blurStrength').value / 100 * Math.max(o.srcCanvas.width, o.srcCanvas.height) * 0.035 + 2;
    ctx.strokeStyle = ctx.createPattern(blurCanvas(o.srcCanvas, r), 'no-repeat');
  }
  stroke = { ctx, size, last: { x: p.x - 0.01, y: p.y }, o };
  strokeTo(p);
}
function strokeTo(p) {
  const { ctx, size, last, o } = stroke;
  ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  const pad = size / 2 + 2;
  refreshRect(o, Math.min(last.x, p.x) - pad, Math.min(last.y, p.y) - pad, Math.abs(p.x - last.x) + pad * 2, Math.abs(p.y - last.y) + pad * 2);
  stroke.last = p;
}
function endStroke() {
  const { ctx, o } = stroke; stroke = null;
  ctx.restore();
  o.ver = newVersion(cur, o.srcCanvas);
  if (o.adj.blur > 0) refreshImage(o);
  commit();
}
paintLayer.addEventListener('pointerdown', e => {
  if (!paint || !e.isPrimary || pinch) return;
  e.preventDefault();
  const p = imgPoint(e);
  if (paint.kind === 'pick') {
    const o = paint.target;
    ensureRestore(o);
    const n = floodErase(o.srcCanvas, p.x, p.y, +$('#bgTol').value);
    if (!n) return toast('Tap on a coloured part of the photo.');
    o.ver = newVersion(cur, o.srcCanvas); refreshImage(o); commit(); toast('Colour removed.');
    return;
  }
  try { paintLayer.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  beginStroke(p);
});
paintLayer.addEventListener('pointermove', e => {
  if (!paint) return;
  const r = paintLayer.getBoundingClientRect();
  brushCursor.style.display = paint.kind === 'pick' ? 'none' : 'block';
  brushCursor.style.left = e.clientX - r.left + 'px'; brushCursor.style.top = e.clientY - r.top + 'px';
  if (stroke && e.isPrimary) (e.getCoalescedEvents ? e.getCoalescedEvents() : [e]).concat(e).forEach(ev => strokeTo(imgPoint(ev)));
});
['pointerup', 'pointercancel'].forEach(n => paintLayer.addEventListener(n, () => { if (stroke) endStroke(); }));
paintLayer.addEventListener('pointerleave', () => { brushCursor.style.display = 'none'; });
$$('[data-paint]').forEach(b => { b.onclick = () => startPaint(b.dataset.paint); });
$('#bgBrush').oninput = $('#blurBrush').oninput = sizeCursor;

async function aiMask(target) {
  busy('Getting the magic tool ready… this is only slow the first time.'); await nextFrame();
  try { return await subjectMask(target.srcCanvas); }
  catch (e) {
    console.warn('AI could not start:', e); done();
    await dialog({
      title: "The automatic tool couldn't start",
      text: 'It may need an internet connection the first time, or this browser may be too old. You can still do it by hand with "Click a colour" or the Eraser.',
      buttons: [{ label: 'OK', value: 1, primary: true }],
    });
    return null;
  } finally { done(); }
}
async function removeBgAuto() {
  if (!cur) return;
  exitModes();
  const o = pixelTarget(), mask = await aiMask(o);
  if (!mask) { if (tool !== 'removebg') setTool('removebg'); return; }
  ensureRestore(o);
  const ctx = o.srcCanvas.getContext('2d');
  ctx.save(); ctx.globalCompositeOperation = 'destination-in'; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(mask, 0, 0, o.srcCanvas.width, o.srcCanvas.height); ctx.restore();
  o.ver = newVersion(cur, o.srcCanvas); o._pv = null; refreshImage(o); commit();
  toast('Background removed!');
}
async function blurBackground() {
  if (!cur) return;
  exitModes();
  const o = pixelTarget(), mask = await aiMask(o);
  if (!mask) return;
  const src = o.srcCanvas, w = src.width, h = src.height;
  const subject = cloneCanvas(src), sx = subject.getContext('2d');
  sx.globalCompositeOperation = 'destination-in'; sx.imageSmoothingQuality = 'high'; sx.drawImage(mask, 0, 0, w, h);
  const blurred = blurCanvas(src, +$('#blurStrength').value / 100 * Math.max(w, h) * 0.03 + 2);
  const ctx = src.getContext('2d');
  ctx.drawImage(blurred, 0, 0); ctx.drawImage(subject, 0, 0);
  o.ver = newVersion(cur, src); o._pv = null; refreshImage(o); commit();
  toast('Background blurred!');
}
$('#btnAutoBg').onclick = removeBgAuto;
$('#btnBlurBg').onclick = blurBackground;
swatches($('#bgColors'), c => { if (!cur) return; cur.bg = c; cur.canvas.backgroundColor = c || ''; cur.canvas.requestRenderAll(); commit(); }, { none: true });

/* ------------------------------------------------------------ shapes and pen */
const ss = { color: '#e85d5d', filled: false, thick: 8 };
const thickPx = () => ss.thick * Math.max(cur.w, cur.h) / 1000;
function styleShape(o) {
  const t = thickPx();
  if (['rect', 'round', 'circle'].includes(o.shapeKind)) o.set(ss.filled ? { fill: ss.color, stroke: null, strokeWidth: 0 } : { fill: '', stroke: ss.color, strokeWidth: t });
  else o.set({ stroke: ss.color, strokeWidth: t, fill: '' });
  o.setCoords();
}
function syncShapeUI(o) {
  const c = o.stroke || o.fill; if (typeof c === 'string' && c) ss.color = c;
  if (['rect', 'round', 'circle'].includes(o.shapeKind)) ss.filled = !o.stroke;
  if (o.strokeWidth) ss.thick = clamp(Math.round(o.strokeWidth * 1000 / Math.max(cur.w, cur.h)), 1, 40);
  paintShapeUI();
}
function paintShapeUI() {
  $$('[data-fill]').forEach(b => b.classList.toggle('on', (b.dataset.fill === '1') === ss.filled));
  $$('#shapeColors .sw').forEach(s => s.classList.toggle('on', s.dataset.c === ss.color));
  $('#shapeThick').value = ss.thick;
  if (cur && cur.canvas.isDrawingMode) { cur.canvas.freeDrawingBrush.color = ss.color; cur.canvas.freeDrawingBrush.width = thickPx(); }
}
function shapeChange(patch, save = true) {
  Object.assign(ss, patch);
  const a = activeObj();
  if (a && a.shapeKind) { styleShape(a); cur.canvas.requestRenderAll(); if (save) commit(); }
  paintShapeUI();
}
function addShape(kind) {
  if (!cur) return;
  exitModes();
  const s = Math.min(cur.w, cur.h) * 0.3, common = { left: cur.w / 2, top: cur.h / 2, originX: 'center', originY: 'center', strokeUniform: true, strokeLineCap: 'round', strokeLineJoin: 'round' };
  let o;
  if (kind === 'rect') o = new fabric.Rect({ ...common, width: s * 1.3, height: s });
  else if (kind === 'round') o = new fabric.Rect({ ...common, width: s * 1.3, height: s, rx: s * 0.16, ry: s * 0.16 });
  else if (kind === 'circle') o = new fabric.Ellipse({ ...common, rx: s / 2, ry: s / 2 });
  else if (kind === 'line') o = new fabric.Path(`M 0 0 L ${s * 1.3} 0`, common);
  else { const L = s * 1.3, a = s * 0.22; o = new fabric.Path(`M 0 0 L ${L} 0 M ${L - a} ${-a} L ${L} 0 L ${L - a} ${a}`, common); }
  o.uid = uid(); o.shapeKind = kind; styleShape(o);
  cur.canvas.add(o); cur.canvas.setActiveObject(o); cur.canvas.requestRenderAll(); commit();
}
$$('[data-shape]').forEach(b => { b.onclick = () => addShape(b.dataset.shape); });
$('#btnPen').onclick = () => {
  if (!cur) return;
  const on = !cur.canvas.isDrawingMode;
  exitModes();
  if (on) {
    cur.canvas.discardActiveObject();
    cur.canvas.freeDrawingBrush = new fabric.PencilBrush(cur.canvas);
    cur.canvas.isDrawingMode = true; $('#btnPen').classList.add('on'); paintShapeUI();
    toast('Draw on the photo. Tap Free pen again to stop.');
  }
  cur.canvas.requestRenderAll();
};
swatches($('#shapeColors'), c => shapeChange({ color: c }));
$$('[data-fill]').forEach(b => { b.onclick = () => shapeChange({ filled: b.dataset.fill === '1' }); });
$('#shapeThick').oninput = e => shapeChange({ thick: +e.target.value }, false);
$('#shapeThick').onchange = () => commit();
paintShapeUI();

/* ------------------------------------------------------------ selected item card */
function removeActive() { const a = activeObj(); if (a) { cur.canvas.remove(a); cur.canvas.discardActiveObject(); cur.canvas.requestRenderAll(); commit(); } }
async function duplicateActive() {
  const a = activeObj(); if (!a) return;
  let c;
  if (a.type === 'image') {
    c = makeImage(cloneCanvas(a.srcCanvas)); c.ver = a.ver; c.rver = a.rver; c.adj = { ...a.adj };
    if (a.restoreCanvas) c.restoreCanvas = cloneCanvas(a.restoreCanvas);
    PROPS.forEach(k => { c[k] = a[k]; }); refreshImage(c);
  } else { c = await enliven(a.toObject(['shapeKind'])); c.uid = uid(); }
  const off = Math.max(cur.w, cur.h) * 0.03;
  c.set({ left: a.left + off, top: a.top + off }); c.setCoords();
  cur.canvas.add(c); cur.canvas.setActiveObject(c); cur.canvas.requestRenderAll(); commit();
}
$$('[data-sel]').forEach(b => {
  b.onclick = () => {
    const a = activeObj(); if (!a) return;
    const cv = cur.canvas, k = b.dataset.sel;
    if (k === 'delete') return removeActive();
    if (k === 'duplicate') return duplicateActive();
    if (k === 'forward') cv.bringForward(a);
    if (k === 'backward' && cv.getObjects().indexOf(a) > 1) cv.sendBackwards(a);
    if (k === 'flip') a.set('flipX', !a.flipX);
    cv.requestRenderAll(); commit();
  };
});
$('#selOpacity').oninput = e => { const a = activeObj(); if (a) { a.set('opacity', 1 - e.target.value / 100); cur.canvas.requestRenderAll(); } };
$('#selOpacity').onchange = () => commit();

/* ------------------------------------------------------------ save */
// Draw the whole photo at full size (never the on-screen zoom size).
function renderDoc(doc) {
  const cv = doc.canvas, a = cv.getActiveObject();
  if (a && a.isEditing) a.exitEditing();
  const out = makeCanvas(doc.w, doc.h), keep = { v: cv.viewportTransform, w: cv.width, h: cv.height, i: cv.interactive, r: cv.enableRetinaScaling };
  Object.assign(cv, { viewportTransform: [1, 0, 0, 1, 0, 0], width: doc.w, height: doc.h, interactive: false, enableRetinaScaling: false });
  try { cv.renderCanvas(out.getContext('2d'), cv.getObjects()); }
  finally {
    Object.assign(cv, { viewportTransform: keep.v, width: keep.w, height: keep.h, interactive: keep.i, enableRetinaScaling: keep.r });
    cv.calcViewportBoundaries(); cv.requestRenderAll();
  }
  return out;
}
function exportBlob(doc, type, maxSide = 0) {
  let c = renderDoc(doc);
  const m = Math.max(c.width, c.height), f = maxSide && m > maxSide ? maxSide / m : 1;
  if (f < 1 || type === 'image/jpeg') {
    const n = makeCanvas(c.width * f, c.height * f), x = n.getContext('2d');
    if (type === 'image/jpeg') { x.fillStyle = '#fff'; x.fillRect(0, 0, n.width, n.height); }
    x.imageSmoothingQuality = 'high'; x.drawImage(c, 0, 0, n.width, n.height); c = n;
  }
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('Could not make the file'))), type, 0.92));
}
function download(blob, name) {
  const a = document.createElement('a'), url = URL.createObjectURL(blob);
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}
function markSaved(doc) { doc.savedKey = doc.history[doc.hi].key; refreshUI(); }
const seeThrough = doc => !doc.bg && baseOf(doc).rver != null;
async function save(doc = cur) {
  if (!doc) return false;
  if (doc.isNew) return saveAs(doc);
  if (doc.type === 'image/jpeg' && seeThrough(doc)) {
    const { value } = await dialog({
      title: 'This photo has see-through parts', text: 'A JPG file cannot keep see-through parts. Save as PNG to keep them, or fill them with white.',
      buttons: [{ label: 'Cancel', value: null }, { label: 'Fill with white', value: 'white' }, { label: 'Save as PNG', value: 'png', primary: true }],
    });
    if (!value) return false;
    if (value === 'png') return saveAs(doc, 'image/png');
  }
  busy('Saving…'); await nextFrame();
  try {
    const blob = await exportBlob(doc, doc.type);
    if (doc.handle) {
      try { const w = await doc.handle.createWritable(); await w.write(blob); await w.close(); }
      catch (e) { done(); toast(e.name === 'NotAllowedError' || e.name === 'AbortError' ? 'Not saved. The browser needs your permission to change the file.' : 'Could not save to that file. Try "Save as".', true); return false; }
      toast('Saved!');
    } else {
      download(blob, doc.name);
      if (!store.get('cc-dl-note')) {
        store.set('cc-dl-note', '1'); done();
        await dialog({ title: 'Saved to your Downloads', text: 'This browser cannot change the original file, so a copy with the same name was saved to your Downloads folder.', buttons: [{ label: 'Got it', value: 1, primary: true }] });
      } else toast('Saved to your Downloads folder.');
    }
    markSaved(doc); return true;
  } catch (e) { console.error(e); toast('Sorry, saving did not work. Please try again.', true); return false; }
  finally { done(); }
}
async function saveAs(doc = cur, forceType) {
  if (!doc) return false;
  const stem = doc.name.replace(/\.[^.]+$/, ''), def = doc.isNew ? (stem === 'Blank canvas' ? 'cc-photo-' + new Date().toISOString().slice(0, 10) : stem) : stem + '-edited';
  const png = forceType === 'image/png' || doc.type === 'image/png' || seeThrough(doc);
  const { value, body } = await dialog({
    title: 'Save as',
    html: `<label class="field"><span>File name</span><input type="text" id="saName" value="${def.replace(/"/g, '&quot;')}"></label>
      <div class="field"><span>File type</span><div class="opts">
        <label><input type="radio" name="saType" value="image/jpeg" ${png ? '' : 'checked'}> <span>JPG <small>— smaller file</small></span></label>
        <label><input type="radio" name="saType" value="image/png" ${png ? 'checked' : ''}> <span>PNG <small>— keeps see-through parts</small></span></label></div></div>
      <div class="field"><span>Size</span><div class="opts">
        <label><input type="radio" name="saSize" value="0" checked> <span>Original <small>— ${doc.w} × ${doc.h}</small></span></label>
        <label><input type="radio" name="saSize" value="2048"> <span>Large <small>— 2048 on the long side</small></span></label>
        <label><input type="radio" name="saSize" value="1080"> <span>Social <small>— 1080 on the long side</small></span></label></div></div>`,
    buttons: [{ label: 'Cancel', value: null }, { label: 'Save', value: 'ok', primary: true }],
  });
  if (!value) return false;
  const type = $('[name=saType]:checked', body).value, ext = type === 'image/png' ? '.png' : '.jpg';
  const name = ($('#saName', body).value.trim().replace(/[\\/:*?"<>|]/g, '').replace(/\.(jpe?g|png|webp)$/i, '') || def) + ext;
  busy('Saving…'); await nextFrame();
  try {
    const blob = await exportBlob(doc, type, +$('[name=saSize]:checked', body).value);
    done();
    let viaPicker = false;
    if (window.showSaveFilePicker) {
      try {
        const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: ext === '.png' ? 'PNG picture' : 'JPG picture', accept: { [type]: [ext] } }] });
        const w = await h.createWritable(); await w.write(blob); await w.close(); viaPicker = true;
      } catch (e) { if (e.name === 'AbortError') return false; }
    }
    if (!viaPicker) download(blob, name);
    markSaved(doc); toast(viaPicker ? 'Saved!' : 'Saved to your Downloads folder.'); return true;
  } catch (e) { console.error(e); toast('Sorry, saving did not work. Please try again.', true); return false; }
  finally { done(); }
}

/* ------------------------------------------------------------ top bar, keyboard, start-up */
$('#btnOpen').onclick = $('#btnWelcomeOpen').onclick = pickAndOpen;
$('#btnUndo').onclick = () => stepHistory(-1);
$('#btnRedo').onclick = () => stepHistory(1);
$('#btnZoomIn').onclick = () => zoomBy(1.25);
$('#btnZoomOut').onclick = () => zoomBy(0.8);
$('#btnFit').onclick = () => cur && fit(cur);
$('#btnSave').onclick = () => save();
$('#btnSaveAs').onclick = () => saveAs();
$('#btnMore').onclick = e => { e.stopPropagation(); $('#moreMenu').hidden = !$('#moreMenu').hidden; };
document.addEventListener('click', e => { if (!e.target.closest('#moreMenu .more-zoom')) $('#moreMenu').hidden = true; });
$$('[data-more]').forEach(b => { b.onclick = () => ({ saveas: saveAs, zoomin: () => zoomBy(1.25), zoomout: () => zoomBy(0.8), fit: () => cur && fit(cur) })[b.dataset.more](); });
$$('#rail button').forEach(b => { b.onclick = () => setTool(b.dataset.tool); });
$$('.preset').forEach(b => { b.onclick = () => newBlank(+b.dataset.w, +b.dataset.h); });

let nudgeTimer = 0;
document.addEventListener('keydown', e => {
  if ($('.dlg-ov')) return;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 's') { e.preventDefault(); if (cur) e.shiftKey ? saveAs() : save(); return; }
  const a = activeObj();
  const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range' || (a && a.isEditing);
  if (typing || !cur) return;
  if (mod && k === 'z') { e.preventDefault(); stepHistory(e.shiftKey ? 1 : -1); }
  else if (mod && k === 'y') { e.preventDefault(); stepHistory(1); }
  else if (e.key === 'Escape') { exitModes(tool === 'crop'); cur.canvas.discardActiveObject(); cur.canvas.requestRenderAll(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && a) { e.preventDefault(); removeActive(); }
  else if (a && e.key.startsWith('Arrow') && e.target.type !== 'range') {
    e.preventDefault();
    const s = e.shiftKey ? 10 : 1;
    a.set({ left: a.left + (k === 'arrowleft' ? -s : k === 'arrowright' ? s : 0), top: a.top + (k === 'arrowup' ? -s : k === 'arrowdown' ? s : 0) });
    a.setCoords(); cur.canvas.requestRenderAll();
    clearTimeout(nudgeTimer); nudgeTimer = setTimeout(() => commit(), 400);
  }
});
window.addEventListener('beforeunload', e => { if (docs.some(isDirty)) { e.preventDefault(); e.returnValue = ''; } });

initIcons();
setTool('crop');
refreshUI();
// Small handle used by the automated tests.
window.__cc = { docs, get cur() { return cur; }, renderDoc, baseOf };
