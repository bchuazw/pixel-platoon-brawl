// Sound effects using Web Audio API
let audioCtx: AudioContext | null = null;

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
