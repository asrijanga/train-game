import { sketchBg, ICONS } from './sketch.js';
import './ui.css';

const TOOLS = [
  { id: 'explore', label: 'Explore', hint: 'Drag to wander · pinch to zoom · twist to turn · three fingers to tilt' },
  { id: 'track', label: 'Track', hint: 'Draw with one finger to lay track · start on a line to branch · two fingers move the map' },
  { id: 'station', label: 'Station', hint: 'Tap a piece of track to build a station beside it' },
  { id: 'train', label: 'Trains', hint: 'Create a train, then tap stations to plan its journey' },
  { id: 'remove', label: 'Remove', hint: 'Tap track, a station or a train to clear it away' },
];

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

let seedCounter = 1;
export function sketchify(e, fill = '#f6efdc', stroke = '#2b2a33', opts) {
  e.style.backgroundImage = sketchBg(fill, stroke, seedCounter++, opts);
  return e;
}

export class UI {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.buttons = {};

    // toolbar
    const bar = el('div', 'toolbar');
    for (const t of TOOLS) {
      const b = sketchify(el('button', 'tool', `${ICONS[t.id]}<span>${t.label}</span>`));
      b.addEventListener('click', () => game.setTool(t.id));
      bar.appendChild(b);
      this.buttons[t.id] = b;
    }
    const sep = el('div', 'tool-sep');
    bar.appendChild(sep);
    const undo = sketchify(el('button', 'tool small', `${ICONS.undo}<span>Undo</span>`));
    undo.addEventListener('click', () => game.undo());
    bar.appendChild(undo);
    this.undoBtn = undo;
    root.appendChild(bar);
    this.toolbar = bar;

    // hint ribbon
    this.hint = sketchify(el('div', 'hint'), '#fbf6e8');
    root.appendChild(this.hint);

    // toast
    this.toastEl = sketchify(el('div', 'toast'), '#fff7e6', '#8a2a1e');
    root.appendChild(this.toastEl);

    // side panel container (tools put content here)
    this.panel = sketchify(el('div', 'panel hidden'), '#f8f1de');
    root.appendChild(this.panel);
  }

  setTool(id) {
    for (const [k, b] of Object.entries(this.buttons)) b.classList.toggle('active', k === id);
    const t = TOOLS.find((x) => x.id === id);
    this.setHint(t?.hint || '');
  }

  setHint(text) {
    this.hint.textContent = text;
    this.hint.classList.toggle('hidden', !text);
  }

  toast(text, ms = 2200) {
    this.toastEl.textContent = text;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }

  showPanel(node) {
    this.panel.innerHTML = '';
    if (node) {
      this.panel.appendChild(node);
      this.panel.classList.remove('hidden');
    } else this.panel.classList.add('hidden');
  }

  setUndoEnabled(on) {
    this.undoBtn.classList.toggle('disabled', !on);
  }
}
