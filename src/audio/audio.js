// Procedural soundscape: wind, birds, crickets, waves, steam chuffs, whistles,
// station bells, a pencil-scratch while drawing, and a gentle generative tune.
// Everything is synthesised; Safari needs a user gesture to start it.
export class AudioEngine {
  constructor(game) {
    this.game = game;
    this.ctx = null;
    this.enabled = game.settings.sound !== false;
    this.musicOn = game.settings.music !== false;
    const start = () => {
      this.start();
      removeEventListener('pointerdown', start, true);
      removeEventListener('touchend', start, true);
    };
    addEventListener('pointerdown', start, true);
    addEventListener('touchend', start, true);
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    if (ctx.state === 'suspended') ctx.resume();
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 0.9 : 0;
    this.master.connect(ctx.destination);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.8);
    const rv = ctx.createGain();
    rv.gain.value = 0.35;
    this.reverb.connect(rv).connect(this.master);
    this.sfx = ctx.createGain();
    this.sfx.gain.value = 0.8;
    this.sfx.connect(this.master);
    this.sfx.connect(this.reverb);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.5;
    this.amb.connect(this.master);
    this.music = ctx.createGain();
    this.music.gain.value = this.musicOn ? 0.22 : 0;
    this.music.connect(this.master);
    this.music.connect(this.reverb);
    this.noise = this.noiseBuffer();
    this.startWind();
    this.startWaves();
    this.nextBird = 2;
    this.nextNote = 1;
    this.nextCricket = 0;
    this.scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    this.root = 57; // A3
    this.chord = 0;
  }

  setEnabled(on) {
    this.enabled = on;
    this.game.settings.sound = on;
    if (this.master) this.master.gain.setTargetAtTime(on ? 0.9 : 0, this.ctx.currentTime, 0.2);
  }

  setMusic(on) {
    this.musicOn = on;
    this.game.settings.music = on;
    if (this.music) this.music.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.5);
  }

  impulse(sec) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    return buf;
  }

  noiseBuffer() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  loopNoise(dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.connect(dest);
    src.start();
    return src;
  }

  startWind() {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 380;
    f.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.12;
    this.loopNoise(f);
    f.connect(this.windGain).connect(this.amb);
    this.windFilter = f;
  }

  startWaves() {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 0.4;
    this.waveGain = ctx.createGain();
    this.waveGain.gain.value = 0;
    this.loopNoise(f);
    f.connect(this.waveGain).connect(this.amb);
  }

  // ---------------------------------------------------------------- one-shots
  env(g, t, a, peak, d) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  panner(pan) {
    const p = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : this.ctx.createGain();
    if (p.pan) p.pan.value = Math.max(-1, Math.min(1, pan));
    return p;
  }

  // Loudness & stereo position for a world position relative to the view.
  spatial(pos) {
    const g = this.game;
    const cam = g.camera;
    const t = g.rig.target;
    const d = Math.hypot(pos.x - t.x, pos.z - t.z);
    const zoom = g.rig.cur.d;
    const reach = 40 + zoom * 0.9;
    const vol = Math.max(0, 1 - d / reach) * Math.max(0.15, 1 - zoom / 450);
    const v = pos.clone ? pos.clone().project(cam) : { x: 0 };
    return { vol, pan: Math.max(-1, Math.min(1, v.x)) * 0.8 };
  }

  chuff(train, k) {
    if (!this.ctx || !this.enabled) return;
    const { vol, pan } = this.spatial(train.vehicles[0].group.position);
    if (vol < 0.02) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 500 + Math.random() * 300;
    f.Q.value = 1.2;
    const g = ctx.createGain();
    const p = this.panner(pan);
    src.connect(f).connect(g).connect(p).connect(this.sfx);
    this.env(g, t, 0.008, 0.25 * vol * (0.5 + k * 0.6), 0.16 + 0.1 * (1 - k));
    src.start(t, Math.random());
    src.stop(t + 0.45);
  }

  whistle(train) {
    if (!this.ctx || !this.enabled) return;
    const { vol, pan } = this.spatial(train.vehicles[0].group.position);
    if (vol < 0.03) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const kind = train.vehicles[0].steam ? 'steam' : train.consistIds[0] === 'diesel' ? 'horn' : 'chime';
    const p = this.panner(pan);
    p.connect(this.sfx);
    const out = ctx.createGain();
    out.connect(p);
    if (kind === 'steam') {
      const dur = 0.9;
      for (const fr of [740, 932, 1108]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        o.frequency.setValueAtTime(fr * 0.97, t);
        o.frequency.linearRampToValueAtTime(fr, t + 0.12);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 6;
        const lg = ctx.createGain();
        lg.gain.value = 4;
        lfo.connect(lg).connect(o.frequency);
        const g = ctx.createGain();
        o.connect(g).connect(out);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.09 * vol, t + 0.08);
        g.gain.setValueAtTime(0.09 * vol, t + dur);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.25);
        o.start(t); lfo.start(t); o.stop(t + dur + 0.3); lfo.stop(t + dur + 0.3);
      }
      // breathy steam
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 2500;
      const g = ctx.createGain();
      src.connect(f).connect(g).connect(out);
      this.env(g, t, 0.05, 0.05 * vol, 1.1);
      src.start(t); src.stop(t + 1.3);
    } else if (kind === 'horn') {
      for (const [fr, st] of [[311, 0], [370, 0], [466, 0], [311, 0.55], [370, 0.55], [466, 0.55]]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = fr;
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 1400;
        const g = ctx.createGain();
        o.connect(f).connect(g).connect(out);
        g.gain.setValueAtTime(0.0001, t + st);
        g.gain.exponentialRampToValueAtTime(0.05 * vol, t + st + 0.04);
        g.gain.setValueAtTime(0.05 * vol, t + st + 0.38);
        g.gain.exponentialRampToValueAtTime(0.0001, t + st + 0.48);
        o.start(t + st); o.stop(t + st + 0.5);
      }
    } else {
      [659, 784, 988].forEach((fr, i) => this.bell(fr, t + i * 0.18, 0.06 * vol, out));
    }
  }

  bell(fr, t, amp, dest) {
    const ctx = this.ctx;
    for (const [m, a] of [[1, 1], [2.4, 0.4], [3.9, 0.2]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = fr * m;
      const g = ctx.createGain();
      o.connect(g).connect(dest || this.sfx);
      this.env(g, t, 0.005, amp * a, 1.6 / m);
      o.start(t);
      o.stop(t + 2);
    }
  }

  stationBell(st) {
    if (!this.ctx || !this.enabled) return;
    const { vol, pan } = this.spatial(st.center);
    if (vol < 0.05) return;
    const p = this.panner(pan);
    p.connect(this.sfx);
    const t = this.ctx.currentTime;
    this.bell(1318, t, 0.05 * vol, p);
    this.bell(1046, t + 0.25, 0.05 * vol, p);
  }

  // UI feedback
  pop(pitch = 1) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(520 * pitch, t);
    o.frequency.exponentialRampToValueAtTime(880 * pitch, t + 0.06);
    const g = this.ctx.createGain();
    o.connect(g).connect(this.sfx);
    this.env(g, t, 0.005, 0.08, 0.12);
    o.start(t);
    o.stop(t + 0.2);
  }

  thunk() {
    if (!this.ctx || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 900;
      const g = ctx.createGain();
      src.connect(f).connect(g).connect(this.sfx);
      this.env(g, t + i * 0.09, 0.004, 0.25, 0.07);
      src.start(t + i * 0.09, Math.random());
      src.stop(t + i * 0.09 + 0.15);
    }
    this.bell(784, t + 0.25, 0.03);
  }

  // Pencil scratching while drawing track; speed 0..1
  scratch(speed) {
    if (!this.ctx) return;
    if (!this.scratchGain) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3200;
      f.Q.value = 0.8;
      this.scratchGain = this.ctx.createGain();
      this.scratchGain.gain.value = 0;
      this.loopNoise(f);
      f.connect(this.scratchGain).connect(this.sfx);
    }
    const v = this.enabled ? Math.min(0.12, speed * 0.12) : 0;
    this.scratchGain.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
  }

  // ---------------------------------------------------------------- tick
  update(dt) {
    if (!this.ctx || this.ctx.state !== 'running') {
      if (this.ctx && this.ctx.state === 'suspended' && !this._resuming) {
        this._resuming = true;
        this.ctx.resume().finally(() => (this._resuming = false));
      }
      return;
    }
    const g = this.game;
    const night = g.sky.night;
    const t = this.ctx.currentTime;
    // wind louder when zoomed out / in the mountains
    const tgt = g.rig.target;
    const zoom = g.rig.cur.d;
    const high = Math.max(0, Math.min(1, (g.terrain.heightAt(tgt.x, tgt.z) - 10) / 20));
    const windV = 0.06 + Math.min(1, zoom / 300) * 0.12 + high * 0.15 + Math.sin(g.time * 0.13) * 0.03;
    this.windGain.gain.setTargetAtTime(windV, t, 0.8);
    this.windFilter.frequency.setTargetAtTime(300 + Math.sin(g.time * 0.21) * 120 + high * 300, t, 1);
    // waves near water
    let wet = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = 10 + zoom * 0.15;
      if (g.terrain.heightAt(tgt.x + Math.cos(a) * r, tgt.z + Math.sin(a) * r) < 0) wet++;
    }
    const swell = 0.5 + 0.5 * Math.sin(g.time * 0.7);
    this.waveGain.gain.setTargetAtTime((wet / 8) * (0.05 + swell * 0.08) * Math.max(0.2, 1 - zoom / 400), t, 0.6);

    // birdsong by day, crickets by night
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = 1.5 + Math.random() * 5;
      if (night < 0.5 && zoom < 260) this.birdCall(0.04 * (1 - night) * Math.max(0.3, 1 - zoom / 260));
    }
    if (night > 0.4) {
      this.nextCricket -= dt;
      if (this.nextCricket <= 0) {
        this.nextCricket = 0.35 + Math.random() * 0.4;
        this.cricket(0.012 * night);
      }
    }
    // generative music
    this.nextNote -= dt;
    if (this.nextNote <= 0 && this.musicOn) {
      this.playNote();
    }
  }

  birdCall(amp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const base = 2200 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 4);
    const p = this.panner(Math.random() * 1.6 - 0.8);
    p.connect(this.amb);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      const st = t + i * (0.09 + Math.random() * 0.06);
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.25), st);
      o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.3), st + 0.06);
      const g = ctx.createGain();
      o.connect(g).connect(p);
      this.env(g, st, 0.01, amp, 0.07);
      o.start(st);
      o.stop(st + 0.12);
    }
  }

  cricket(amp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = 4400 + Math.random() * 300;
    const g = ctx.createGain();
    const p = this.panner(Math.random() * 1.6 - 0.8);
    o.connect(g).connect(p).connect(this.amb);
    for (let i = 0; i < 3; i++) {
      g.gain.setValueAtTime(0.0001, t + i * 0.045);
      g.gain.exponentialRampToValueAtTime(amp, t + i * 0.045 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.045 + 0.035);
    }
    o.start(t);
    o.stop(t + 0.16);
  }

  playNote() {
    const ctx = this.ctx, t = ctx.currentTime;
    const night = this.game.sky.night;
    this.nextNote = (night > 0.5 ? 1.2 : 0.7) + Math.random() * (night > 0.5 ? 2.5 : 1.8);
    if (Math.random() < 0.08) this.chord = (this.chord + [0, 5, 7, -5][Math.floor(Math.random() * 4)] + 12) % 12;
    const deg = this.scale[Math.floor(Math.random() * this.scale.length)];
    const midi = this.root + this.chord + deg + (Math.random() < 0.25 ? 12 : 0);
    const fr = 440 * Math.pow(2, (midi - 69) / 12);
    this.pluck(fr, t, 0.11);
    if (Math.random() < 0.3) this.pluck(fr / 2, t, 0.07);
    if (Math.random() < 0.15) this.pluck(fr * 1.5, t + 0.25, 0.05);
  }

  pluck(fr, t, amp) {
    const ctx = this.ctx;
    // soft "felt piano": sine + quiet octave + gentle lowpassed triangle
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1800;
    out.connect(lp).connect(this.music);
    for (const [type, m, a] of [['sine', 1, 1], ['triangle', 1, 0.35], ['sine', 2, 0.18]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = fr * m;
      o.detune.value = (Math.random() - 0.5) * 6;
      const g = ctx.createGain();
      o.connect(g).connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp * a, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2 / m);
      o.start(t);
      o.stop(t + 3.4);
    }
  }
}
