import { el, sketchify } from './ui.js';
import { ICONS } from './sketch.js';

// A warm welcome on first launch and a little getting-started checklist.
export class Onboarding {
  constructor(game) {
    this.game = game;
    const s = game.settings;
    if (!s.welcomed) this.welcome();
    else if (!s.onboarded) this.checklist();
  }

  welcome() {
    const g = this.game;
    const wrap = el('div', 'welcome');
    const card = sketchify(el('div', 'welcome-card'), '#f8f1de');
    card.innerHTML = `
      <h1>Welcome aboard</h1>
      <p class="lede">A quiet island, a box of pencils, and all the track you could ever want.</p>
      <div class="steps">
        <div>${ICONS.track}<span><b>Draw track</b> with one finger — it curves gently by itself.</span></div>
        <div>${ICONS.station}<span><b>Tap beside the line</b> to build stations that suit the land.</span></div>
        <div>${ICONS.train}<span><b>Create a train</b> and tap the stations it should visit.</span></div>
        <div>${ICONS.explore}<span><b>Two fingers</b> pan, pinch and twist the map. Three fingers tilt.</span></div>
      </div>`;
    const b = sketchify(el('button', 'btn go', `${ICONS.check}<span>Let's begin</span>`), '#dcebd2');
    b.onclick = () => {
      g.settings.welcomed = true;
      g.markDirty();
      wrap.classList.add('bye');
      setTimeout(() => wrap.remove(), 600);
      this.checklist();
      g.audio?.pop(1.3);
    };
    card.append(b);
    wrap.append(card);
    g.uiRoot.append(wrap);
  }

  checklist() {
    const g = this.game;
    const card = sketchify(el('div', 'checklist'), '#fbf6e8');
    card.innerHTML = `<div class="ttl">Getting started</div>`;
    this.items = [
      { text: 'Draw a stretch of track', done: () => g.rail.net.edges.size > 0 },
      { text: 'Build two stations', done: () => g.stations.list.length >= 2 },
      { text: 'Send a train on its way', done: () => g.trains.list.length > 0 },
    ];
    for (const it of this.items) {
      it.el = el('div', 'item', `<span class="box"></span>${it.text}`);
      card.append(it.el);
    }
    g.uiRoot.append(card);
    this.card = card;
  }

  update() {
    if (!this.card) return;
    let all = true;
    for (const it of this.items) {
      const d = it.done();
      it.el.classList.toggle('done', d);
      all = all && d;
    }
    if (all && !this.finished) {
      this.finished = true;
      this.card.querySelector('.ttl').textContent = 'Your railway is running ✿';
      this.game.settings.onboarded = true;
      this.game.markDirty();
      setTimeout(() => { this.card.classList.add('bye'); setTimeout(() => this.card?.remove(), 800); }, 6000);
    }
  }
}
