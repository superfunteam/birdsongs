// All sound is synthesised in the browser: no samples to download.
//
//   voices ─ lowpass ─ wow/flutter ─ tape saturation ─┬─ dry ──┐
//                                                     └─ reverb ┴─ musicGate ─┐
//   vinyl crackle ───────────────────────────────────────────────────────────┤
//   rain / wind / waves / thunder / wing flaps ─────────── ambGate ────────┼─ master ─ compressor ─ out

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function noiseBuffer(ctx, seconds, kind, channels = 1) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(channels, len, ctx.sampleRate);
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    // crossfade the loop seam
    const fade = Math.floor(ctx.sampleRate * 0.05);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[i] = d[i] * k + d[len - fade + i] * (1 - k);
    }
  }
  return buf;
}

function impulseResponse(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const pre = Math.floor(ctx.sampleRate * 0.018);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / (len - pre);
      const w = Math.random() * 2 - 1;
      // darker as it decays
      const a = 0.65 - 0.55 * t;
      lp += a * (w - lp);
      d[i] = lp * Math.pow(1 - t, 2.4) * (i < pre + 400 ? (i - pre) / 400 : 1);
    }
  }
  return buf;
}

function crackleBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * 0.004;
  const pops = Math.floor(seconds * 9);
  for (let p = 0; p < pops; p++) {
    const at = Math.floor(Math.random() * (len - 200));
    const big = Math.random() < 0.08;
    const amp = (big ? rand(0.35, 0.6) : rand(0.04, 0.18)) * (Math.random() < 0.5 ? -1 : 1);
    const width = big ? 40 : rand(3, 14);
    for (let i = 0; i < width * 4; i++) d[at + i] += amp * Math.exp(-i / width) * (i % 2 ? -0.6 : 1);
  }
  return buf;
}

function rainDropsBuffer(ctx, seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const sr = ctx.sampleRate;
  const drops = Math.floor(seconds * 140);
  for (let k = 0; k < drops; k++) {
    const at = Math.floor(Math.random() * (len - 2000));
    const f = rand(1800, 6500);
    const decay = rand(0.002, 0.008) * sr;
    const amp = Math.pow(Math.random(), 2.2) * 0.35;
    const pan = Math.random();
    const n = Math.floor(decay * 5);
    for (let i = 0; i < n; i++) {
      const env = Math.exp(-i / decay);
      const s = Math.sin((2 * Math.PI * f * i) / sr * (1 - i / (n * 3))) * env * amp + (Math.random() - 0.5) * env * amp * 0.4;
      L[at + i] += s * (1 - pan * 0.7);
      R[at + i] += s * (0.3 + pan * 0.7);
    }
  }
  return buf;
}

function tapeCurve() {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.4) / Math.tanh(1.4);
  }
  return c;
}

// [ratio, amplitude, decay-to-silence multiplier (of base decay) | absolute seconds if negative]
const PATCHES = {
  musicbox: {
    decay: (f) => clamp(4.6 * Math.pow(523 / f, 0.45), 1.8, 7),
    partials: [[1, 1, 1], [2, 0.16, 0.4], [3, 0.05, 0.25], [6.27, 0.12, -0.16], [17.55, 0.035, -0.045]],
    click: 0.05,
    gain: 0.2,
  },
  celesta: {
    decay: (f) => clamp(4.2 * Math.pow(523 / f, 0.4), 1.8, 6.5),
    partials: [[1, 1, 1], [2, 0.3, 0.45], [3, 0.09, 0.25], [4, 0.07, 0.18], [7.1, 0.035, -0.09]],
    click: 0.025,
    gain: 0.2,
  },
  // soft felt-piano plunk: warm, a little detuned, quick upper partials
  plunk: {
    decay: (f) => clamp(3.4 * Math.pow(392 / f, 0.4), 1.6, 6),
    partials: [[1, 1, 1], [1.0035, 0.45, 0.85], [2, 0.3, 0.42], [3, 0.1, 0.25], [4.02, 0.05, -0.14]],
    attack: 0.009,
    thump: 0.1,
    thumpFreq: 210,
    gain: 0.21,
  },
  kalimba: {
    decay: (f) => clamp(3.8 * Math.pow(523 / f, 0.4), 1.5, 6),
    partials: [[1, 1, 1], [3.0, 0.05, 0.3], [5.7, 0.2, -0.12], [11.4, 0.04, -0.05]],
    glide: 0.012,
    thump: 0.06,
    gain: 0.22,
  },
};

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.musicOn = true;
    this.soundOn = true;
    this.volume = 0.8;
    this.ambTargets = {};
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  async start() {
    if (!this.ctx) this.build();
    if (this.ctx.state !== 'running') await this.ctx.resume();
  }

  build() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC({ latencyHint: 'playback' });
    this.ctx = ctx;
    this.white = noiseBuffer(ctx, 2, 'white');
    this.pink = noiseBuffer(ctx, 7, 'pink', 2);
    this.brown = noiseBuffer(ctx, 7, 'brown', 2);

    // master
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 14;
    comp.ratio.value = 3;
    comp.attack.value = 0.008;
    comp.release.value = 0.35;
    const makeup = ctx.createGain();
    makeup.gain.value = 1.7;
    this.master.connect(comp);
    comp.connect(makeup).connect(ctx.destination);
    this.output = makeup; // the final mix, e.g. for recording

    // ---- music bus
    this.musicGate = ctx.createGain();
    this.musicGate.gain.value = this.musicOn ? 1 : 0;
    this.musicGate.connect(this.master);
    this.voices = ctx.createGain();
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 4300;
    tone.Q.value = 0.5;
    const wow = ctx.createDelay(0.1);
    wow.delayTime.value = 0.014;
    const lfo1 = ctx.createOscillator();
    lfo1.frequency.value = 0.37;
    const lfo1g = ctx.createGain();
    lfo1g.gain.value = 0.0011;
    const lfo2 = ctx.createOscillator();
    lfo2.frequency.value = 5.3;
    const lfo2g = ctx.createGain();
    lfo2g.gain.value = 0.00011;
    lfo1.connect(lfo1g).connect(wow.delayTime);
    lfo2.connect(lfo2g).connect(wow.delayTime);
    lfo1.start();
    lfo2.start();
    const tape = ctx.createWaveShaper();
    tape.curve = tapeCurve();
    tape.oversample = '2x';
    const dry = ctx.createGain();
    dry.gain.value = 0.82;
    const send = ctx.createGain();
    send.gain.value = 0.6;
    const verb = ctx.createConvolver();
    verb.buffer = impulseResponse(ctx, 4.2);
    const wet = ctx.createGain();
    wet.gain.value = 0.62;
    this.voices.connect(tone).connect(wow).connect(tape);
    tape.connect(dry).connect(this.musicGate);
    tape.connect(send).connect(verb).connect(wet).connect(this.musicGate);

    const crackle = ctx.createBufferSource();
    crackle.buffer = crackleBuffer(ctx, 7);
    crackle.loop = true;
    const crackleHp = ctx.createBiquadFilter();
    crackleHp.type = 'bandpass';
    crackleHp.frequency.value = 2400;
    crackleHp.Q.value = 0.4;
    const crackleGain = ctx.createGain();
    crackleGain.gain.value = 0.1;
    crackle.connect(crackleHp).connect(crackleGain).connect(this.musicGate);
    crackle.start();

    // ---- ambience bus
    this.ambGate = ctx.createGain();
    this.ambGate.gain.value = this.soundOn ? 1 : 0;
    this.ambGate.connect(this.master);
    this.amb = {};
    const loop = (buffer, chain, name) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const g = ctx.createGain();
      g.gain.value = 0;
      let node = src;
      for (const n of chain) node = node.connect(n);
      node.connect(g).connect(this.ambGate);
      src.start(0, Math.random() * buffer.duration);
      this.amb[name] = g;
      return g;
    };
    const filt = (type, f, q = 0.7) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    loop(this.pink, [filt('highpass', 650), filt('lowpass', 8000)], 'rainHiss');
    loop(rainDropsBuffer(ctx, 9), [filt('lowpass', 7000)], 'rainDrops');
    loop(this.brown, [filt('lowpass', 260)], 'rainRumble');
    this.windFilter = filt('bandpass', 420, 0.8);
    loop(this.pink, [this.windFilter], 'wind');
    loop(this.brown, [filt('lowpass', 620)], 'waves');
    loop(this.pink, [filt('bandpass', 1600, 0.5)], 'wash');
    loop(this.brown, [filt('lowpass', 110)], 'city');

    this.gust = 0;
    this.gustTarget = 0;
  }

  // ------------------------------------------------------------ toggles
  ramp(param, value, tc = 0.12) {
    if (!this.ctx) return;
    param.cancelScheduledValues(this.ctx.currentTime);
    param.setTargetAtTime(value, this.ctx.currentTime, tc);
  }

  setMusic(on) {
    this.musicOn = on;
    if (this.ctx) this.ramp(this.musicGate.gain, on ? 1 : 0, 0.25);
  }

  setSound(on) {
    this.soundOn = on;
    if (this.ctx) this.ramp(this.ambGate.gain, on ? 1 : 0, 0.25);
  }

  setVolume(v) {
    this.volume = v;
    if (this.ctx) this.ramp(this.master.gain, v * v, 0.08);
  }

  // ------------------------------------------------------------ notes
  voiceOut(pan) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -0.9, 0.9);
    p.connect(this.voices);
    return p;
  }

  playNote(midi, t, vel, instrument, pan = 0) {
    if (instrument === 'rhodes') return this.rhodes(midi, t, vel, pan);
    const patch = PATCHES[instrument] || PATCHES.musicbox;
    const ctx = this.ctx;
    const f = mtof(midi);
    const base = patch.decay(f);
    const out = this.voiceOut(pan);
    let lastStop = t;
    let lastOsc = null;
    for (const [ratio, amp, dk] of patch.partials) {
      const pf = f * ratio;
      if (pf > 15000) continue;
      const d60 = dk < 0 ? -dk : base * dk;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(pf, t);
      if (patch.glide && ratio === 1) {
        osc.frequency.setValueAtTime(pf * (1 + patch.glide), t);
        osc.frequency.exponentialRampToValueAtTime(pf, t + 0.05);
      }
      const g = ctx.createGain();
      const peak = amp * vel * patch.gain;
      const atk = patch.attack || 0.0035;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + atk);
      g.gain.setTargetAtTime(0, t + atk, d60 / 6.9);
      osc.connect(g).connect(out);
      osc.start(t);
      const stop = t + d60 * 1.15 + 0.05;
      osc.stop(stop);
      if (stop > lastStop) {
        lastStop = stop;
        lastOsc = osc;
      }
    }
    if (lastOsc) lastOsc.onended = () => out.disconnect();
    if (patch.click) this.noiseTick(t, patch.click * vel, 3800, 0.006, out);
    if (patch.thump) this.noiseTick(t, patch.thump * vel, patch.thumpFreq || 380, 0.02, out);
  }

  rhodes(midi, t, vel, pan) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const out = this.voiceOut(pan);
    const d60 = clamp(6.5 * Math.pow(262 / f, 0.35), 2.8, 8);
    const car = ctx.createOscillator();
    car.frequency.value = f;
    const mod = ctx.createOscillator();
    mod.frequency.value = f;
    const idx = ctx.createGain();
    idx.gain.setValueAtTime(f * (0.6 + 1.9 * vel), t);
    idx.gain.setTargetAtTime(f * 0.18, t, 0.28);
    mod.connect(idx).connect(car.frequency);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, t);
    amp.gain.linearRampToValueAtTime(0.2 * vel, t + 0.006);
    amp.gain.setTargetAtTime(0, t + 0.006, d60 / 6.9);
    car.connect(amp).connect(out);
    const tine = ctx.createOscillator();
    tine.frequency.value = f * 7.02;
    const tg = ctx.createGain();
    tg.gain.setValueAtTime(0, t);
    tg.gain.linearRampToValueAtTime(0.03 * vel, t + 0.002);
    tg.gain.setTargetAtTime(0, t + 0.002, 0.03);
    tine.connect(tg).connect(out);
    const stop = t + d60 * 1.1;
    for (const o of [car, mod]) {
      o.start(t);
      o.stop(stop);
    }
    tine.start(t);
    tine.stop(t + 0.4);
    car.onended = () => out.disconnect();
  }

  noiseTick(t, amp, freq, len, out) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq;
    bp.Q.value = 0.9;
    const g = ctx.createGain();
    g.gain.setValueAtTime(amp, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(bp).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + len + 0.02);
  }

  // event from the conductor; delay is seconds from now
  playEvent(ev, delay) {
    if (!this.running) return;
    const t = this.ctx.currentTime + Math.max(0.005, delay);
    if (this.musicOn) {
      if (ev.midi != null) this.playNote(ev.midi, t, ev.vel, ev.instrument, ev.pan);
      if (ev.chord) {
        const { bass, tones } = ev.chord;
        const chordVel = ev.vel * (ev.midi == null ? 0.55 : 0.32);
        this.playNote(bass, t, chordVel * 1.15, ev.instrument, ev.pan * 0.3);
        tones.forEach((m, i) => this.playNote(m, t + 0.045 * (i + 1), chordVel * 0.8, ev.instrument, ev.pan * 0.3 + (i - 1) * 0.12));
      }
    }
    if (this.soundOn && ev.flap) this.flap(Math.max(this.ctx.currentTime + 0.005, t + ev.flap.offset), ev.pan, ev.flap.size);
  }

  // a few soft wingbeats: each one a short "fwup" of low noise whose
  // cutoff sweeps down, like air pushed by a wing
  flap(t, pan, size = 1) {
    const ctx = this.ctx;
    const p = ctx.createStereoPanner();
    p.pan.value = clamp(pan, -0.9, 0.9);
    p.connect(this.ambGate);
    const beats = 2 + Math.floor(Math.random() * 3);
    const rate = rand(6.5, 9.5) / Math.sqrt(size);
    const top = rand(900, 1400) / Math.sqrt(size);
    const peak = rand(0.06, 0.11);
    let last = null;
    for (let i = 0; i < beats; i++) {
      const ti = t + i / rate;
      const len = 0.11 * Math.sqrt(size);
      const src = ctx.createBufferSource();
      src.buffer = this.pink;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.Q.value = 0.6;
      lp.frequency.setValueAtTime(top, ti);
      lp.frequency.exponentialRampToValueAtTime(220, ti + len);
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 90;
      const g = ctx.createGain();
      const a = peak * (1 - i / (beats + 1.5));
      g.gain.setValueAtTime(0.0001, ti);
      g.gain.linearRampToValueAtTime(a, ti + 0.018);
      g.gain.exponentialRampToValueAtTime(0.0001, ti + len);
      src.connect(lp).connect(hp).connect(g).connect(p);
      src.start(ti, Math.random() * 5);
      src.stop(ti + len + 0.02);
      last = src;
    }
    if (last) last.onended = () => p.disconnect();
  }

  thunder(near, delay) {
    if (!this.running || !this.soundOn) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(260 + near * 900, t);
    lp.frequency.exponentialRampToValueAtTime(70, t + 5);
    const g = ctx.createGain();
    const peak = 0.35 + 0.55 * near;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.08 + (1 - near) * 0.5);
    let tt = t + 0.4;
    for (let i = 0; i < 6; i++) {
      tt += rand(0.25, 0.8);
      g.gain.linearRampToValueAtTime(peak * rand(0.25, 0.9) * (1 - i / 7), tt);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, tt + 2.5);
    src.connect(lp).connect(g).connect(this.ambGate);
    src.start(t, Math.random() * 3);
    src.stop(tt + 2.6);
    if (near > 0.65) {
      const crack = ctx.createBufferSource();
      crack.buffer = this.white;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1200;
      const cg = ctx.createGain();
      cg.gain.setValueAtTime(0.0001, t);
      cg.gain.linearRampToValueAtTime(0.18 * near, t + 0.01);
      cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      crack.connect(hp).connect(cg).connect(this.ambGate);
      crack.start(t);
      crack.stop(t + 0.4);
    }
  }

  // ------------------------------------------------------------ ambience
  // called ~10x/second with the current weather + scene
  updateAmbience(now, { rain, storm, wind, snow, scene }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const set = (name, v, tc = 1.2) => this.amb[name].gain.setTargetAtTime(v, t, tc);
    const a = scene?.ambience || {};

    set('rainHiss', rain * 0.13 + storm * 0.03);
    set('rainDrops', Math.min(1, rain * 1.3) * 0.5);
    set('rainRumble', rain * 0.16 + storm * 0.12);

    // gusty wind: a wandering target
    if (Math.random() < 0.05) this.gustTarget = Math.random();
    this.gust += (this.gustTarget - this.gust) * 0.04;
    const windLevel = (0.02 + wind * 0.11 + snow * 0.03) * (0.6 + 0.8 * this.gust) * (a.hush ? 0.8 : 1);
    set('wind', windLevel, 0.6);
    this.windFilter.frequency.setTargetAtTime(280 + this.gust * 520 + wind * 200, t, 0.8);

    const waves = a.waves || 0;
    const swell = 0.5 + 0.5 * Math.sin((now / 8.5) * Math.PI * 2 + Math.sin(now * 0.11) * 1.5);
    set('waves', waves * (0.05 + 0.2 * swell), 0.5);
    set('wash', waves * 0.06 * Math.pow(swell, 3), 0.4);

    set('city', (a.city || 0) * 0.08, 2);
  }
}
