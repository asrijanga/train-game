import './style.css';
import { Game } from './game.js';

const msg = document.getElementById('loading-msg');
const say = (t) => { if (msg) msg.textContent = t; };

async function boot() {
  // let the loading card paint before the heavy world generation
  await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  try {
    const game = new Game(document.getElementById('app'), document.getElementById('ui'), say);
    await game.init();
    window.__game = game;
    document.getElementById('loading').classList.add('done');
  } catch (err) {
    console.error(err);
    say('Oh dear — the ink spilled: ' + (err?.message || err));
  }
}

boot();
