// All audio synthesized with WebAudio.  Nothing here runs until the first
// user gesture creates the AudioContext.

import { G } from './state.js';

let ac = null;
let master = null;
let musicGain = null;
let musicTimer = null;
let currentTrack = null;

try { G.musicOn = localStorage.getItem('emberdale_music') !== '0'; } catch (e) { /* default on */ }

export function initAudio() {
  if (ac) return;
  ac = new (window.AudioContext || window.webkitAudioContext)();
  master = ac.createGain();
  master.gain.value = 0.5;
  master.connect(ac.destination);
  musicGain = ac.createGain();
  musicGain.gain.value = G.musicOn ? 0.42 : 0;
  musicGain.connect(master);
}

export function setMusicEnabled(on) {
  G.musicOn = on;
  if (musicGain) musicGain.gain.value = on ? 0.42 : 0;
  try { localStorage.setItem('emberdale_music', on ? '1' : '0'); } catch (e) { /* ignore */ }
}

export function setMuted(m) {
  G.muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

export function toggleMute() { setMuted(!G.muted); }

// --- tiny helpers ------------------------------------------------------

function osc(type, freq, t0, dur, vol, dest, slideTo = null) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(dest);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

let noiseBuf = null;
function noise(t0, dur, vol, dest, freq = 0) {
  if (!noiseBuf) {
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ac.createBufferSource();
  s.buffer = noiseBuf; s.loop = true;
  const g = ac.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  let node = s;
  if (freq) {
    const f = ac.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.2;
    s.connect(f); node = f;
  }
  node.connect(g).connect(dest);
  s.start(t0);
  s.stop(t0 + dur + 0.02);
}

const mid = (n) => 440 * Math.pow(2, (n - 69) / 12);

// --- sound effects -----------------------------------------------------

const SFX = {
  swing:  (t) => { noise(t, 0.09, 0.25, master, 2600); osc('square', 500, t, 0.08, 0.06, master, 180); },
  hurt:   (t) => { osc('sawtooth', 320, t, 0.22, 0.22, master, 70); noise(t, 0.12, 0.2, master, 500); },
  die:    (t) => { osc('square', 300, t, 0.3, 0.16, master, 40); noise(t, 0.25, 0.22, master, 700); },
  pickup: (t) => { osc('square', mid(76), t, 0.07, 0.14, master); osc('square', mid(83), t + 0.07, 0.1, 0.14, master); },
  coin:   (t) => { osc('square', mid(88), t, 0.05, 0.12, master); osc('square', mid(93), t + 0.05, 0.12, 0.12, master); },
  buy:    (t) => { noise(t, 0.05, 0.2, master, 3000); osc('square', mid(84), t + 0.05, 0.08, 0.14, master); osc('square', mid(91), t + 0.13, 0.14, 0.14, master); },
  deny:   (t) => { osc('square', 130, t, 0.16, 0.18, master, 90); },
  levelup:(t) => [60, 64, 67, 72].forEach((n, i) => osc('square', mid(n + 12), t + i * 0.09, 0.14, 0.16, master)),
  quest:  (t) => [67, 71, 74, 79].forEach((n, i) => osc('triangle', mid(n), t + i * 0.11, 0.22, 0.22, master)),
  menu:   (t) => osc('square', mid(81), t, 0.04, 0.08, master),
  step:   (t) => noise(t, 0.04, 0.07, master, 1400),
  door:   (t) => { noise(t, 0.2, 0.15, master, 300); osc('triangle', 90, t, 0.2, 0.15, master, 60); },
  heal:   (t) => osc('triangle', mid(72), t, 0.25, 0.2, master, mid(84)),
  boss:   (t) => { osc('sawtooth', 70, t, 0.7, 0.3, master, 45); noise(t, 0.5, 0.2, master, 200); },
  slash_hit:(t) => { noise(t, 0.06, 0.3, master, 1200); osc('square', 220, t, 0.07, 0.15, master, 90); },
  type:   (t) => osc('square', 1050 + Math.random() * 260, t, 0.022, 0.035, master),
  heartbeat:(t) => { osc('sine', 62, t, 0.13, 0.5, master, 40);
                     osc('sine', 55, t + 0.17, 0.16, 0.34, master, 36); },
  dodge:  (t) => { noise(t, 0.14, 0.16, master, 900); osc('square', 420, t, 0.1, 0.06, master, 150); },
  parry:  (t) => { osc('square', 900, t, 0.07, 0.14, master, 1500); noise(t, 0.05, 0.2, master, 4000); },
  crit:   (t) => { noise(t, 0.09, 0.4, master, 1500); osc('square', 300, t, 0.12, 0.2, master, 70);
                   osc('square', 900, t, 0.09, 0.1, master, 1400); },
  charge: (t) => osc('triangle', 180, t, 0.55, 0.09, master, 620),
  break:  (t) => { noise(t, 0.16, 0.32, master, 700); osc('square', 130, t, 0.12, 0.14, master, 50); },
  upgrade:(t) => [72, 76, 79, 84].forEach((n, i) => osc('triangle', mid(n), t + i * 0.07, 0.2, 0.15, master)),
  telegraph:(t) => osc('sawtooth', 240, t, 0.18, 0.07, master, 380),
};

export function sfx(name) {
  if (!ac || G.muted) return;
  SFX[name](ac.currentTime);
}

// --- music -------------------------------------------------------------
// Each track: bpm + voices.  A voice is [waveform, volume, pattern] where the
// pattern is a list of [midiNote|0(rest), beats].

const TRACKS = {
  overworld: {
    bpm: 132,
    voices: [
      ['square', 0.10, [
        [76,1],[79,1],[81,2],[79,1],[76,1],[74,2],[72,1],[74,1],[76,2],[74,1],[72,1],[69,2],
        [72,1],[74,1],[76,1],[79,1],[81,1],[79,1],[76,2],[74,1],[72,1],[74,1],[76,1],[72,2],[0,2],
      ]],
      ['triangle', 0.30, [
        [45,2],[52,2],[48,2],[52,2],[41,2],[48,2],[45,2],[52,2],
        [45,2],[52,2],[48,2],[52,2],[41,2],[48,2],[45,1],[47,1],[48,1],[50,1],
      ]],
    ],
    drums: [[0, 'kick'], [1, 'hat'], [2, 'snare'], [3, 'hat']],
  },
  town: {
    bpm: 96,
    voices: [
      ['triangle', 0.22, [
        [72,2],[76,1],[79,2],[76,1],[74,2],[72,1],[74,2],[76,1],
        [72,2],[76,1],[81,2],[79,1],[76,2],[74,1],[72,3],
      ]],
      ['triangle', 0.26, [
        [48,1],[55,1],[52,1],[48,1],[55,1],[52,1],[46,1],[53,1],[50,1],[46,1],[53,1],[50,1],
        [48,1],[55,1],[52,1],[48,1],[55,1],[52,1],[43,1],[50,1],[47,1],[48,2],[0,1],
      ]],
    ],
    drums: [],
  },
  danger: {
    bpm: 140,
    voices: [
      ['sawtooth', 0.08, [
        [57,1],[0,1],[57,1],[60,1],[57,1],[0,1],[63,1],[62,1],
        [57,1],[0,1],[57,1],[60,1],[65,1],[63,1],[62,1],[60,1],
      ]],
      ['triangle', 0.30, [
        [33,1],[33,1],[45,1],[33,1],[33,1],[45,1],[36,1],[48,1],
        [33,1],[33,1],[45,1],[33,1],[31,1],[43,1],[32,1],[44,1],
      ]],
    ],
    drums: [[0, 'kick'], [1.5, 'kick'], [2, 'snare'], [3, 'hat'], [3.5, 'hat']],
  },
};

const DRUMS = {
  kick:  (t) => osc('sine', 130, t, 0.12, 0.5, musicGain, 40),
  snare: (t) => noise(t, 0.09, 0.25, musicGain, 1800),
  hat:   (t) => noise(t, 0.03, 0.10, musicGain, 6000),
};

let nextBarTime = 0;

export function music(name) {
  if (currentTrack === name) return;
  currentTrack = name;
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (!ac || !name) return;
  nextBarTime = ac.currentTime + 0.05;
  const schedule = () => {
    const tr = TRACKS[name];
    const spb = 60 / tr.bpm;
    while (nextBarTime < ac.currentTime + 0.6) {
      const t0 = nextBarTime;
      let barBeats = 0;
      for (const [wave, vol, pat] of tr.voices) {
        let bt = 0;
        for (const [note, beats] of pat) {
          if (note) osc(wave, mid(note), t0 + bt * spb, beats * spb * 0.92, vol, musicGain);
          bt += beats;
        }
        barBeats = Math.max(barBeats, bt);
      }
      const totalBeats = barBeats || 4;
      for (let b = 0; b < totalBeats; b += 4) {
        for (const [beat, drum] of tr.drums) {
          if (b + beat < totalBeats) DRUMS[drum](t0 + (b + beat) * spb);
        }
      }
      nextBarTime += totalBeats * spb;
    }
  };
  schedule();
  musicTimer = setInterval(schedule, 250);
}
