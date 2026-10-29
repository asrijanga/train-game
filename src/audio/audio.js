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
    this.pink = this.pinkBuffer();
    this.startWind();
    this.startWaves();
    this.startLoops();
    this.nextBird = 2;
    this.nextNote = 1;
    this.nextCricket = 0;
    this.nextChime = 4;
    this.nextBell = 40 + Math.random() * 60;
    this.nextFrog = 1;
    this.nextOwl = 20;
    this.scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
    this.inScale = [0, 1, 5, 7, 8, 12, 13, 17, 19, 20];
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
    const len = ctx.sampleRate * 3;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // Pink-ish noise (Paul Kellet) — softer and more natural for wind and water.
  pinkBuffer() {
    const ctx = this.ctx;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    }
    // crossfade the loop seam
    const f = 2000;
    for (let i = 0; i < f; i++) d[len - f + i] = d[len - f + i] * (1 - i / f) + d[i] * (i / f);
    return buf;
  }

  loopNoise(dest, pink = false) {
    const src = this.ctx.createBufferSource();
    src.buffer = pink ? this.pink : this.noise;
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    src.loop = true;
    src.connect(dest);
    src.start();
    return src;
  }

  // Wind: a soft low body plus an airy whistle that rises with gusts.
  startWind() {
    const ctx = this.ctx;
    const low = ctx.createBiquadFilter();
    low.type = 'lowpass';
    low.frequency.value = 260;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.0;
    this.loopNoise(low, true);
    low.connect(this.windGain).connect(this.amb);
    this.windFilter = low;
    const air = ctx.createBiquadFilter();
    air.type = 'bandpass';
    air.frequency.value = 900;
    air.Q.value = 1.4;
    this.airGain = ctx.createGain();
    this.airGain.gain.value = 0;
    const p = this.panner(0.3);
    this.loopNoise(air, true);
    air.connect(this.airGain).connect(p).connect(this.amb);
    this.airFilter = air;
  }

  startWaves() {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    this.waveGain = ctx.createGain();
    this.waveGain.gain.value = 0;
    this.loopNoise(f, true);
    f.connect(this.waveGain).connect(this.amb);
  }

  // Leaves, a river babble and summer cicadas: continuous beds, faded in and out.
  startLoops() {
    const ctx = this.ctx;
    const mk = (type, freq, q, pink, pan = 0) => {
      const f = ctx.createBiquadFilter();
      f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      this.loopNoise(f, pink);
      f.connect(g).connect(this.panner(pan)).connect(this.amb);
      return { f, g };
    };
    this.leaves = mk('highpass', 2600, 0.5, false, -0.25);
    this.river = mk('bandpass', 1400, 0.6, true, 0.2);
    // cicada: noise through a resonant band, amplitude-modulated by a fast LFO
    const c = mk('bandpass', 4600, 4, false, 0.15);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 38;
    const lg = ctx.createGain();
    lg.gain.value = 0.5;
    const trem = ctx.createGain();
    trem.gain.value = 0.5;
    c.f.disconnect();
    c.f.connect(trem).connect(c.g);
    lfo.connect(lg).connect(trem.gain);
    lfo.start();
    this.cicada = c;
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
    const hour = g.sky.hour;
    const season = g.nature?.seasonIndex ?? 1; // 0 spring .. 3 winter
    const t = this.ctx.currentTime;
    const tgt = g.rig.target;
    const zoom = g.rig.cur.d;
    const close = Math.max(0.15, 1 - zoom / 500);
    const wind = g.nature?.strength ?? 0.5;
    const gust = g.nature?.gust ?? 0;
    const high = Math.max(0, Math.min(1, (g.terrain.heightAt(tgt.x, tgt.z) - 10) / 20));

    // wind: quiet and soft, swelling only with real gusts
    this.windGain.gain.setTargetAtTime(0.03 + wind * 0.05 + high * 0.06 + Math.min(1, zoom / 600) * 0.03, t, 1.2);
    this.windFilter.frequency.setTargetAtTime(180 + wind * 160 + high * 200, t, 1.5);
    this.airGain.gain.setTargetAtTime(gust * 0.025 + high * 0.02, t, 0.8);
    this.airFilter.frequency.setTargetAtTime(700 + gust * 600, t, 1);

    // what's around the view?
    let wet = 0, treesNear = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, r = 10 + zoom * 0.15;
      if (g.terrain.heightAt(tgt.x + Math.cos(a) * r, tgt.z + Math.sin(a) * r) < 0) wet++;
    }
    if (g.scenery) treesNear = Math.min(1, g.scenery.treeDensityAt(tgt.x, tgt.z, 14) * 1.5);
    const town = g.towns?.nearest(tgt.x, tgt.z, 25);
    const coast = Math.abs(tgt.x) > 380 || Math.abs(tgt.z) > 380;
    const swell = 0.5 + 0.5 * Math.sin(g.time * 0.5);
    this.waveGain.gain.setTargetAtTime((wet / 8) * (coast ? 0.05 + swell * 0.07 : 0.015) * close, t, 0.8);
    this.river.g.gain.setTargetAtTime(!coast && wet > 0 && wet < 6 ? 0.025 * close : 0, t, 1);
    this.leaves.g.gain.setTargetAtTime(season === 3 ? 0 : treesNear * (0.004 + gust * 0.02) * close, t, 0.5);
    const cicadas = season === 1 && night < 0.3 && hour > 9 && hour < 18 ? (0.006 + treesNear * 0.01) * close : 0;
    this.cicada.g.gain.setTargetAtTime(cicadas, t, 2);

    // birds by day; which ones depends on the season and the place
    this.nextBird -= dt;
    if (this.nextBird <= 0) {
      this.nextBird = (season === 3 ? 6 : 1.8) + Math.random() * 5;
      if (night < 0.45 && zoom < 320) {
        const amp = 0.028 * (1 - night) * close;
        const r = Math.random();
        if (coast && r < 0.4) this.gull(amp);
        else if (season === 0 && r < 0.3) this.uguisu(amp * 1.1);
        else if (season <= 1 && r < 0.42) this.cuckoo(amp * 0.9);
        else if (r < 0.55) this.dove(amp);
        else this.birdCall(amp);
      }
    }
    // dusk higurashi in summer, crickets in late summer & autumn nights, frogs in spring/summer
    if (night > 0.35) {
      this.nextCricket -= dt;
      if (this.nextCricket <= 0) {
        this.nextCricket = 0.3 + Math.random() * 0.5;
        if (season === 1 || season === 2) this.cricket(0.009 * night * close);
      }
      this.nextFrog -= dt;
      if (this.nextFrog <= 0) {
        this.nextFrog = 0.4 + Math.random() * 1.2;
        if (season <= 1) this.frog(0.02 * night * close);
      }
      this.nextOwl -= dt;
      if (this.nextOwl <= 0) {
        this.nextOwl = 25 + Math.random() * 40;
        if (treesNear > 0.2) this.owl(0.03 * close);
      }
    }
    if (season === 1 && hour > 17.6 && hour < 19.3 && Math.random() < dt * 0.25) this.higurashi(0.012 * close);
    // wind chimes in towns when the breeze lifts
    this.nextChime -= dt * (0.4 + gust * 2);
    if (this.nextChime <= 0) {
      this.nextChime = 2 + Math.random() * 4;
      if (town && season !== 3) this.chime(0.02 * close);
    }
    // a distant temple bell in the evening and early morning
    this.nextBell -= dt;
    if (this.nextBell <= 0) {
      this.nextBell = 90 + Math.random() * 90;
      if ((hour > 17 && hour < 21) || (hour > 5 && hour < 7)) this.templeBell(0.05);
    }
    this.nextNote -= dt;
    if (this.nextNote <= 0 && this.musicOn) this.playNote();
  }

  uguisu(amp) {
    // Japanese bush warbler: a long rising whistle, then "ho-ke-kyo"
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(Math.random() * 1.4 - 0.7);
    p.connect(this.amb);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(1150, t);
    o.frequency.linearRampToValueAtTime(1500, t + 0.9);
    const g = ctx.createGain();
    o.connect(g).connect(p);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(amp, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    o.start(t); o.stop(t + 1.05);
    [[2100, 1.15, 0.12], [2900, 1.3, 0.1], [2300, 1.45, 0.35]].forEach(([f, st, d]) => {
      const q = ctx.createOscillator();
      q.type = 'sine';
      q.frequency.setValueAtTime(f * 1.06, t + st);
      q.frequency.exponentialRampToValueAtTime(f, t + st + d);
      const gg = ctx.createGain();
      q.connect(gg).connect(p);
      this.env(gg, t + st, 0.01, amp, d);
      q.start(t + st); q.stop(t + st + d + 0.05);
    });
  }

  cuckoo(amp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(Math.random() * 1.6 - 0.8);
    p.connect(this.amb);
    [[690, 0], [560, 0.32]].forEach(([f, st]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 1200;
      const g = ctx.createGain();
      o.connect(lp).connect(g).connect(p);
      this.env(g, t + st, 0.03, amp, 0.24);
      o.start(t + st); o.stop(t + st + 0.32);
    });
  }

  dove(amp) {
    // turtle dove: soft, low "hoo-hoo, hoo"
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(Math.random() * 1.6 - 0.8);
    p.connect(this.amb);
    [[0, 0.35], [0.45, 0.3], [0.95, 0.5]].forEach(([st, d]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(470, t + st);
      o.frequency.linearRampToValueAtTime(430, t + st + d);
      const g = ctx.createGain();
      o.connect(g).connect(p);
      this.env(g, t + st, 0.06, amp * 0.8, d);
      o.start(t + st); o.stop(t + st + d + 0.1);
    });
  }

  gull(amp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(Math.random() * 1.6 - 0.8);
    p.connect(this.amb);
    for (let i = 0; i < 2 + Math.floor(Math.random() * 2); i++) {
      const st = t + i * 0.32;
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.setValueAtTime(1500, st);
      o.frequency.exponentialRampToValueAtTime(950, st + 0.25);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 2;
      const g = ctx.createGain();
      o.connect(bp).connect(g).connect(p);
      this.env(g, st, 0.02, amp * 1.4, 0.24);
      o.start(st); o.stop(st + 0.3);
    }
  }

  frog(amp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(Math.random() * 1.6 - 0.8);
    p.connect(this.amb);
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const st = t + i * 0.12;
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = 260 + Math.random() * 60;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 700;
      const g = ctx.createGain();
      o.connect(lp).connect(g).connect(p);
      this.env(g, st, 0.005, amp, 0.07);
      o.start(st); o.stop(st + 0.1);
    }
  }

  owl(amp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(Math.random() * 1.6 - 0.8);
    p.connect(this.amb);
    [[0, 0.4], [0.65, 0.25], [1.0, 0.6]].forEach(([st, d]) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(380, t + st);
      o.frequency.linearRampToValueAtTime(350, t + st + d);
      const g = ctx.createGain();
      o.connect(g).connect(p);
      this.env(g, t + st, 0.08, amp, d);
      o.start(t + st); o.stop(t + st + d + 0.15);
    });
  }

  higurashi(amp) {
    // evening cicada: a cascade of falling "kana-kana-kana"
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(Math.random() * 1.6 - 0.8);
    p.connect(this.amb);
    for (let i = 0; i < 14; i++) {
      const st = t + i * 0.11;
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(4800 - i * 60, st);
      o.frequency.exponentialRampToValueAtTime(3900 - i * 60, st + 0.08);
      const g = ctx.createGain();
      o.connect(g).connect(p);
      this.env(g, st, 0.005, amp * (1 - i / 16), 0.08);
      o.start(st); o.stop(st + 0.1);
    }
  }

  chime(amp) {
    // furin glass wind chime
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(Math.random() * 1.2 - 0.6);
    p.connect(this.sfx);
    const base = [2637, 3136, 3520, 3951][Math.floor(Math.random() * 4)];
    const n = 1 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const st = t + i * (0.12 + Math.random() * 0.2);
      for (const [m, a] of [[1, 1], [2.76, 0.3], [5.4, 0.12]]) {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = base * m * (1 + (Math.random() - 0.5) * 0.004);
        const g = ctx.createGain();
        o.connect(g).connect(p);
        this.env(g, st, 0.003, amp * a, 1.6 / m);
        o.start(st); o.stop(st + 1.8);
      }
    }
  }

  templeBell(amp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const p = this.panner(Math.random() * 1.0 - 0.5);
    p.connect(this.sfx);
    for (const [f, a, d] of [[98, 1, 9], [196.5, 0.5, 7], [261, 0.35, 6], [392, 0.2, 4], [523, 0.12, 3]]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 2.2 + Math.random();
      const lg = ctx.createGain();
      lg.gain.value = f * 0.004;
      lfo.connect(lg).connect(o.frequency);
      const g = ctx.createGain();
      o.connect(g).connect(p);
      this.env(g, t, 0.02, amp * a, d);
      o.start(t); lfo.start(t); o.stop(t + d + 0.5); lfo.stop(t + d + 0.5);
    }
  }

  birdCall(amp) {
    const ctx = this.ctx, t = ctx.currentTime;
    const base = 2400 + Math.random() * 1600;
    const n = 3 + Math.floor(Math.random() * 6);
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
    const sc = night > 0.5 ? this.inScale : this.scale;
    const deg = sc[Math.floor(Math.random() * sc.length)];
    const midi = this.root + this.chord + deg + (Math.random() < 0.25 ? 12 : 0);
    const fr = 440 * Math.pow(2, (midi - 69) / 12);
    if (Math.random() < 0.35) this.koto(fr * 2, t, 0.06);
    else this.pluck(fr, t, 0.1);
    if (Math.random() < 0.3) this.pluck(fr / 2, t, 0.07);
    if (Math.random() < 0.15) this.pluck(fr * 1.5, t + 0.25, 0.05);
  }

  koto(fr, t, amp) {
    // plucked string: bright attack, quick decay, slight pitch bend
    const ctx = this.ctx;
    const out = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(4200, t);
    lp.frequency.exponentialRampToValueAtTime(900, t + 0.6);
    out.connect(lp).connect(this.music);
    for (const [type, m, a] of [['sawtooth', 1, 0.35], ['triangle', 1, 0.8], ['sine', 2, 0.25]]) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(fr * m * 1.01, t);
      o.frequency.exponentialRampToValueAtTime(fr * m, t + 0.08);
      const g = ctx.createGain();
      o.connect(g).connect(out);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp * a, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      o.start(t);
      o.stop(t + 1.9);
    }
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
