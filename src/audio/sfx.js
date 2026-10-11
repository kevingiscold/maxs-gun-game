// All effects are synthesised with WebAudio. Music is a CC0 track
// (public/audio/horror-atmosphere.ogg — "Horror Atmosphere" by Juhani Junkala).
//
// Graph:
//   sfx sources ─┬─> sfxGain ──────────────┐
//                └─> reverbSend ─> convolver ┤
//   ambience ──> bedGain ─> muffle ──────────┼─> world (low-pass) ─> compressor ─> out
//   music <audio> ─> musicGain ─┘            │
//   gunshot ─> drive ─> blast bus ─> limiter ─────────────────────────────> out
//   tinnitus ───────────────────────────────────────────────────────────────> out
//
// The gunshot has its own bus and brick-wall limiter so it hits as hard as the
// output allows instead of being squashed with everything else. Right after it,
// the whole "world" bus is low-passed to a dull thud and only the ringing is
// clear: the deafened, ears-blown-out moment.
import { useStore } from '../store.js';

let ctx = null;
let out = null; // compressor
let sfxGain = null;
let reverbSend = null;
let bedGain = null; // music + ambience (ducked together)
let muffle = null; // low-pass on the bed
let world = null; // low-pass on everything except the blast and the ringing
let blastLimiter = null;
let musicGain = null;
let musicEl = null;
let ambience = null;
let riserNodes = null;

function applyVolumes() {
  if (!ctx) return;
  const { volume, musicVolume } = useStore.getState().settings;
  sfxGain.gain.value = volume;
  reverbSend.gain.value = 0.55 * volume;
  musicGain.gain.value = (musicVolume ?? 0.35) * 0.6;
}

function ac() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    out = ctx.createDynamicsCompressor();
    out.threshold.value = -10;
    out.knee.value = 6;
    out.ratio.value = 6;
    out.attack.value = 0.002;
    out.release.value = 0.25;
    out.connect(ctx.destination);

    world = ctx.createBiquadFilter();
    world.type = 'lowpass';
    world.frequency.value = 20000;
    world.Q.value = 0.9;
    world.connect(out);

    blastLimiter = ctx.createDynamicsCompressor();
    blastLimiter.threshold.value = -1.5;
    blastLimiter.knee.value = 0;
    blastLimiter.ratio.value = 20;
    blastLimiter.attack.value = 0.0005;
    blastLimiter.release.value = 0.3;
    blastLimiter.connect(ctx.destination);

    sfxGain = ctx.createGain();
    sfxGain.connect(world);

    const conv = ctx.createConvolver();
    conv.buffer = impulse(3.4, 2.2);
    reverbSend = ctx.createGain();
    reverbSend.connect(conv).connect(world);

    muffle = ctx.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value = 18000;
    bedGain = ctx.createGain();
    bedGain.connect(muffle).connect(world);
    musicGain = ctx.createGain();
    musicGain.connect(bedGain);

    applyVolumes();
    useStore.subscribe(applyVolumes);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** Synthetic room impulse: a few early reflections, then a dark decaying tail. */
function impulse(seconds, decay) {
  const c = ctx;
  const len = Math.floor(c.sampleRate * seconds);
  const buf = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      lp += 0.25 * ((Math.random() * 2 - 1) - lp); // gentle low-pass: a wooden room, not a cathedral
      d[i] = lp * Math.pow(1 - t, decay);
    }
    for (const [ms, g] of [[11, 0.7], [23, 0.5], [37, 0.45], [58, 0.3]]) {
      const at = Math.floor((ms + ch * 3) * c.sampleRate / 1000);
      d[at] += g * (ch ? -1 : 1);
    }
  }
  return buf;
}

const noiseCache = {};
function noise(seconds) {
  const key = seconds;
  if (noiseCache[key]) return noiseCache[key];
  const c = ac();
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noiseCache[key] = buf);
}

function env(param, t, attack, decay, peak = 1) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function shaper(amount) {
  const curve = new Float32Array(1024);
  for (let i = 0; i < 1024; i++) {
    const x = (i / 1023) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  const ws = ctx.createWaveShaper();
  ws.curve = curve;
  ws.oversample = '2x';
  return ws;
}

/** Route a node to the dry bus and the reverb. */
function send(node, wet = 1) {
  node.connect(sfxGain);
  if (wet) {
    const g = ctx.createGain();
    g.gain.value = wet;
    node.connect(g).connect(reverbSend);
  }
}

function noiseBurst(t, dur, { type = 'lowpass', freq = 4000, endFreq, q = 0.7, peak = 1, attack = 0.001, wet = 1, through } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noise(Math.max(0.05, dur + 0.05));
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(freq, t);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  env(g.gain, t, attack, dur, peak);
  src.connect(f).connect(g);
  if (through) g.connect(through);
  else send(g, wet);
  src.start(t);
  src.stop(t + dur + 0.1);
}

function tone(t, { freq, endFreq, dur, peak = 1, type = 'sine', wet = 0.3, through }) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
  const g = ctx.createGain();
  env(g.gain, t, 0.002, dur, peak);
  o.connect(g);
  if (through) g.connect(through);
  else send(g, wet);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/**
 * Deafened: the world drops to a dull thud and a harsh ring takes over, then
 * hearing slowly comes back. `close` = you were in the duel: longer and worse.
 */
function shellShock(t, close) {
  const seconds = close ? 9 : 5.5;
  const vol = useStore.getState().settings.volume;
  // everything but the ring goes under water
  world.frequency.cancelScheduledValues(t);
  world.frequency.setValueAtTime(world.frequency.value, t);
  world.frequency.exponentialRampToValueAtTime(close ? 140 : 260, t + 0.04);
  world.frequency.setValueAtTime(close ? 140 : 260, t + seconds * 0.35);
  world.frequency.exponentialRampToValueAtTime(1400, t + seconds * 0.75);
  world.frequency.exponentialRampToValueAtTime(20000, t + seconds);
  bedGain.gain.cancelScheduledValues(t);
  bedGain.gain.setValueAtTime(0.02, t);
  bedGain.gain.linearRampToValueAtTime(0.3, t + seconds * 0.7);
  bedGain.gain.linearRampToValueAtTime(1, t + seconds);
  // the ring: two detuned tones beating against each other + a thin upper one,
  // with a slow wobble so it never settles
  const peak = (close ? 0.17 : 0.08) * vol;
  for (const [f, k] of [[3960, 1], [4010, 0.8], [7930, 0.25]]) {
    const o = ctx.createOscillator();
    o.frequency.value = f;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.35 + Math.random() * 0.3;
    const depth = ctx.createGain();
    depth.gain.value = f * 0.0025;
    lfo.connect(depth).connect(o.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak * k + 0.0001, t + 0.08);
    g.gain.setValueAtTime(peak * k + 0.0001, t + seconds * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(g).connect(out);
    o.start(t);
    lfo.start(t);
    o.stop(t + seconds + 0.1);
    lfo.stop(t + seconds + 0.1);
  }
}

export const sfx = {
  unlock: () => ac(),

  /** Dry fire: hammer on an empty chamber. Metallic, with the room ringing after it. */
  click() {
    ac();
    const t = ctx.currentTime;
    sfx.stopRiser();
    noiseBurst(t, 0.03, { type: 'bandpass', freq: 3400, q: 9, peak: 1.6, wet: 1.4 });
    noiseBurst(t + 0.006, 0.06, { type: 'bandpass', freq: 1250, q: 14, peak: 1.2, wet: 1.4 });
    tone(t, { freq: 2650, dur: 0.18, peak: 0.12, type: 'triangle', wet: 1 }); // metal ring
    tone(t, { freq: 140, endFreq: 90, dur: 0.08, peak: 0.4, wet: 0.2 });
  },

  /**
   * The gunshot: saturated, as loud as the output allows, a long room tail, then
   * deafness and ringing. `close` = you were the shooter or target. `pan`
   * (-1 left … 1 right) places it in the room; 0 = from no direction at all.
   */
  bang({ close = true, pan = 0 } = {}) {
    ac();
    const t = ctx.currentTime;
    sfx.stopRiser();
    const vol = useStore.getState().settings.volume;
    const bus = ctx.createGain();
    bus.gain.value = 2.6 * vol;
    if (pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      bus.connect(p).connect(blastLimiter);
    } else bus.connect(blastLimiter);
    const drive = shaper(7);
    drive.connect(bus);
    const verb = ctx.createGain();
    verb.gain.value = 1.4;
    drive.connect(verb).connect(reverbSend);
    // 1) supersonic crack
    noiseBurst(t, 0.04, { type: 'highpass', freq: 1800, peak: 4, through: drive });
    // 2) muzzle blast
    noiseBurst(t, 0.75, { type: 'lowpass', freq: 11000, endFreq: 140, peak: 4.5, through: drive });
    // 3) the punch in the chest
    tone(t, { freq: 120, endFreq: 30, dur: 0.8, peak: 3.5, through: drive });
    tone(t, { freq: 48, endFreq: 24, dur: 1.8, peak: 2.2, through: bus });
    // 4) torn, ragged tail
    noiseBurst(t + 0.03, 1.4, { type: 'bandpass', freq: 700, endFreq: 120, q: 0.6, peak: 0.9, through: drive });
    // 5) slap back off the walls
    noiseBurst(t + 0.11, 0.5, { type: 'lowpass', freq: 1600, endFreq: 200, peak: 0.8, wet: 2 });
    shellShock(t + 0.03, close);
  },

  /**
   * The gun made ready: one loud, hard, metallic click that rings out in the room.
   * `pan` places someone else's click (-1 left … 1 right); `level` < 1 for theirs.
   */
  cock({ pan = 0, level = 1 } = {}) {
    ac();
    const t = ctx.currentTime;
    let through;
    if (pan) {
      through = ctx.createStereoPanner();
      through.pan.value = Math.max(-1, Math.min(1, pan));
      send(through, 1.4);
    }
    noiseBurst(t, 0.018, { type: 'bandpass', freq: 2300, q: 3, peak: 3.2 * level, wet: 1.6, through });
    noiseBurst(t, 0.05, { type: 'bandpass', freq: 900, q: 5, peak: 1.4 * level, wet: 1.2, through });
    tone(t, { freq: 3100, dur: 0.09, peak: 0.12 * level, type: 'triangle', wet: 1, through });
  },

  /** Murder!: the breaker trips. A heavy clunk and the room's hum dies. */
  lightsOut() {
    ac();
    const t = ctx.currentTime;
    noiseBurst(t, 0.06, { type: 'lowpass', freq: 900, peak: 2.4, wet: 1.6 });
    tone(t, { freq: 110, endFreq: 40, dur: 0.35, peak: 1.4, wet: 0.8 });
    tone(t, { freq: 120, endFreq: 30, dur: 0.6, peak: 0.25, type: 'sawtooth', wet: 0.3 }); // mains hum winding down
  },

  /** …and back: a clunk, then the bulb buzzing as it catches. */
  lightsOn() {
    ac();
    const t = ctx.currentTime;
    noiseBurst(t, 0.05, { type: 'lowpass', freq: 1200, peak: 1.8, wet: 1.4 });
    for (const [at, len] of [[0.05, 0.08], [0.2, 0.05], [0.3, 0.5]]) {
      tone(t + at, { freq: 100, dur: len, peak: 0.12, type: 'square', wet: 0.2 });
    }
  },

  /** Rising dread under the trigger squeeze; cut dead by bang()/click(). */
  riser(seconds = 0.9) {
    ac();
    sfx.stopRiser();
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35 * useStore.getState().settings.volume + 0.0001, t + seconds);
    g.connect(out);
    const nodes = [g];
    // detuned low strings + a rising filtered noise swell
    for (const f of [55, 58.3, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.5, t + seconds);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(200, t);
      lp.frequency.exponentialRampToValueAtTime(1600, t + seconds);
      o.connect(lp).connect(g);
      o.start(t);
      nodes.push(o);
    }
    const src = ctx.createBufferSource();
    src.buffer = noise(2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 3;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(3500, t + seconds);
    src.connect(bp).connect(g);
    src.start(t);
    nodes.push(src);
    riserNodes = nodes;
  },

  stopRiser() {
    if (!riserNodes) return;
    const t = ctx.currentTime;
    const [g, ...srcs] = riserNodes;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    srcs.forEach((s) => {
      try {
        s.stop(t + 0.02);
      } catch {
        /* already stopped */
      }
    });
    riserNodes = null;
  },

  /** One lub-dub. `level` 0..1 (louder when it's your life on the line). */
  heartbeat(level = 0.5) {
    ac();
    const t = ctx.currentTime;
    const p = 0.5 + level;
    tone(t, { freq: 62, endFreq: 40, dur: 0.12, peak: p, wet: 0 });
    tone(t + 0.16, { freq: 55, endFreq: 36, dur: 0.14, peak: p * 0.7, wet: 0 });
  },

  spin() {
    ac();
    const t0 = ctx.currentTime;
    let t = t0;
    let gap = 0.03;
    for (let i = 0; i < 26; i++) {
      noiseBurst(t, 0.012, { type: 'highpass', freq: 3000, peak: 0.45, wet: 0.4 });
      t += gap;
      gap *= 1.11;
    }
    // the cylinder locking into place
    noiseBurst(t + 0.05, 0.03, { type: 'bandpass', freq: 2200, q: 5, peak: 1, wet: 0.8 });
  },

  thud() {
    ac();
    const t = ctx.currentTime;
    tone(t, { freq: 90, endFreq: 38, dur: 0.3, peak: 1, wet: 0.5 });
    noiseBurst(t, 0.15, { type: 'lowpass', freq: 600, peak: 0.5, wet: 0.5 });
  },

  tick() {
    ac();
    tone(ctx.currentTime, { freq: 1200, dur: 0.03, peak: 0.15, type: 'square', wet: 0.2 });
  },

  /** Room tone + the music bed. */
  ambience(on) {
    ac();
    if (on && !ambience) {
      const src = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < d.length; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        d[i] = last * 3.5;
      }
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      const g = ctx.createGain();
      g.gain.value = 0.14;
      src.connect(lp).connect(g).connect(bedGain);
      src.start();
      ambience = { src };

      if (!musicEl) {
        musicEl = new Audio('audio/horror-atmosphere.ogg');
        musicEl.loop = true;
        musicEl.crossOrigin = 'anonymous';
        ctx.createMediaElementSource(musicEl).connect(musicGain);
      }
      musicEl.play().catch(() => {});
    } else if (!on && ambience) {
      ambience.src.stop();
      ambience = null;
      musicEl?.pause();
    }
  },
};
