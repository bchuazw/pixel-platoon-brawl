// Sound effects + background music using Web Audio API
let audioCtx: AudioContext | null = null;
let bgMusicGain: GainNode | null = null;
let bgMusicPlaying = false;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playNoise(duration: number, frequency: number, type: OscillatorType, volume = 0.15) {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(frequency * 0.3, ctx.currentTime + duration);
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* ignore audio errors */ }
}

function playNoiseBuffer(duration: number, volume = 0.1) {
  try {
    const ctx = getAudioCtx();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    source.connect(gain);
    gain.connect(ctx.destination);
    source.start();
  } catch { /* ignore */ }
}

export function playGunshot() {
  playNoiseBuffer(0.15, 0.2);
  playNoise(0.08, 800, 'square', 0.1);
}

export function playSniperShot() {
  playNoiseBuffer(0.25, 0.25);
  playNoise(0.12, 1200, 'sawtooth', 0.12);
  setTimeout(() => playNoise(0.3, 200, 'sine', 0.05), 50);
}

export function playHeavyShot() {
  playNoiseBuffer(0.3, 0.3);
  playNoise(0.15, 300, 'square', 0.15);
  setTimeout(() => playNoiseBuffer(0.2, 0.15), 80);
}

export function playImpact() {
  playNoise(0.12, 200, 'square', 0.08);
  playNoiseBuffer(0.08, 0.06);
}

export function playCrit() {
  playNoise(0.2, 600, 'sawtooth', 0.12);
  playNoiseBuffer(0.15, 0.15);
  setTimeout(() => playNoise(0.15, 900, 'square', 0.08), 50);
}

export function playMiss() {
  playNoise(0.15, 400, 'sine', 0.04);
}

export function playKill() {
  playNoiseBuffer(0.3, 0.2);
  playNoise(0.3, 100, 'sawtooth', 0.1);
  setTimeout(() => playNoise(0.4, 60, 'square', 0.08), 100);
}

export function playHeal() {
  playNoise(0.2, 600, 'sine', 0.06);
  setTimeout(() => playNoise(0.2, 800, 'sine', 0.06), 100);
  setTimeout(() => playNoise(0.3, 1000, 'sine', 0.05), 200);
}

export function playExplosion() {
  playNoiseBuffer(0.5, 0.3);
  playNoise(0.4, 80, 'sawtooth', 0.15);
  setTimeout(() => playNoiseBuffer(0.3, 0.15), 100);
}

export function playAbility() {
  playNoise(0.15, 500, 'sine', 0.08);
  setTimeout(() => playNoise(0.15, 700, 'sine', 0.08), 80);
}

export function playMove() {
  playNoise(0.06, 200, 'sine', 0.03);
  setTimeout(() => playNoise(0.06, 250, 'sine', 0.03), 100);
}

export function playPickup() {
  playNoise(0.1, 800, 'sine', 0.08);
  setTimeout(() => playNoise(0.1, 1200, 'sine', 0.08), 60);
  setTimeout(() => playNoise(0.15, 1600, 'sine', 0.06), 120);
}

// ── Background Music (procedural ambient battlefield) ──
let bgInterval: ReturnType<typeof setInterval> | null = null;

function playBgNote(freq: number, duration: number, vol: number, type: OscillatorType = 'sine') {
  try {
    const ctx = getAudioCtx();
    if (!bgMusicGain) {
      bgMusicGain = ctx.createGain();
      bgMusicGain.gain.value = 0.04;
      bgMusicGain.connect(ctx.destination);
    }
    const osc = ctx.createOscillator();
    const noteGain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    noteGain.gain.setValueAtTime(vol, ctx.currentTime);
    noteGain.gain.setValueAtTime(vol, ctx.currentTime + duration * 0.7);
    noteGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(noteGain);
    noteGain.connect(bgMusicGain);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch { /* ignore */ }
}

// Dark minor key ambient - battlefield atmosphere
const BG_NOTES = [
  // Am drone pattern
  { freq: 110, dur: 4, vol: 0.3, type: 'sine' as OscillatorType },
  { freq: 82.4, dur: 4, vol: 0.25, type: 'sine' as OscillatorType },
  { freq: 130.8, dur: 3, vol: 0.15, type: 'triangle' as OscillatorType },
  { freq: 164.8, dur: 3, vol: 0.12, type: 'triangle' as OscillatorType },
  { freq: 98, dur: 4, vol: 0.2, type: 'sine' as OscillatorType },
  { freq: 146.8, dur: 3.5, vol: 0.15, type: 'triangle' as OscillatorType },
  { freq: 73.4, dur: 5, vol: 0.25, type: 'sine' as OscillatorType },
  { freq: 123.5, dur: 3, vol: 0.18, type: 'sine' as OscillatorType },
];

let bgNoteIdx = 0;

export function startBgMusic() {
  if (bgMusicPlaying) return;
  bgMusicPlaying = true;
  
  const playNextNote = () => {
    if (!bgMusicPlaying) return;
    const note = BG_NOTES[bgNoteIdx % BG_NOTES.length];
    playBgNote(note.freq, note.dur, note.vol, note.type);
    
    // Occasional distant rumble
    if (Math.random() < 0.3) {
      setTimeout(() => {
        if (bgMusicPlaying) {
          playBgNote(40 + Math.random() * 30, 2, 0.08, 'sawtooth');
        }
      }, 1000 + Math.random() * 2000);
    }
    
    // Occasional high ambient whistle
    if (Math.random() < 0.2) {
      setTimeout(() => {
        if (bgMusicPlaying) {
          playBgNote(800 + Math.random() * 400, 1.5, 0.02, 'sine');
        }
      }, 500 + Math.random() * 1500);
    }
    
    bgNoteIdx++;
  };

  playNextNote();
  bgInterval = setInterval(playNextNote, 3000 + Math.random() * 1000);
}

export function stopBgMusic() {
  bgMusicPlaying = false;
  if (bgInterval) {
    clearInterval(bgInterval);
    bgInterval = null;
  }
}
