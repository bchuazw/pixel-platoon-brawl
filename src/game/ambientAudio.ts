// Synthetic ambient audio using Web Audio API — dark tactical atmosphere
let ambientCtx: AudioContext | null = null;
let ambientNodes: AudioNode[] = [];
let ambientGain: GainNode | null = null;

export function startAmbientAudio() {
  if (ambientCtx) return; // already playing

  const ctx = new AudioContext();
  ambientCtx = ctx;
  const master = ctx.createGain();
  master.gain.value = 0;
  master.connect(ctx.destination);
  ambientGain = master;

  // Fade in over 3 seconds
  master.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 3);

  // ── Deep sub bass drone (50Hz) ──
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.value = 50;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.35;
  sub.connect(subGain).connect(master);
  sub.start();
  ambientNodes.push(sub);

  // ── Low rumble with slow LFO modulation ──
  const rumble = ctx.createOscillator();
  rumble.type = 'sawtooth';
  rumble.frequency.value = 38;
  const rumbleFilter = ctx.createBiquadFilter();
  rumbleFilter.type = 'lowpass';
  rumbleFilter.frequency.value = 80;
  rumbleFilter.Q.value = 2;
  const rumbleGain = ctx.createGain();
  rumbleGain.gain.value = 0.15;
  // LFO to modulate rumble volume
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 0.15; // very slow pulse
  const lfoGain = ctx.createGain();
  lfoGain.gain.value = 0.08;
  lfo.connect(lfoGain).connect(rumbleGain.gain);
  lfo.start();
  rumble.connect(rumbleFilter).connect(rumbleGain).connect(master);
  rumble.start();
  ambientNodes.push(rumble, lfo);

  // ── Mid-range tension pad (minor chord tones) ──
  const padNotes = [110, 130.81, 164.81]; // A2, C3, E3 (Am chord)
  padNotes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    // Slight detuning for thickness
    osc.detune.value = (i - 1) * 8;
    const padFilter = ctx.createBiquadFilter();
    padFilter.type = 'lowpass';
    padFilter.frequency.value = 300;
    padFilter.Q.value = 1;
    const padGain = ctx.createGain();
    padGain.gain.value = 0.04;
    // Slow volume swell
    const padLfo = ctx.createOscillator();
    padLfo.type = 'sine';
    padLfo.frequency.value = 0.08 + i * 0.03;
    const padLfoGain = ctx.createGain();
    padLfoGain.gain.value = 0.025;
    padLfo.connect(padLfoGain).connect(padGain.gain);
    padLfo.start();
    osc.connect(padFilter).connect(padGain).connect(master);
    osc.start();
    ambientNodes.push(osc, padLfo);
  });

  // ── Filtered noise layer (wind/static) ──
  const noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    noiseData[i] = (Math.random() * 2 - 1);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;
  noise.loop = true;
  const noiseFilter = ctx.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.value = 200;
  noiseFilter.Q.value = 0.5;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = 0.06;
  // Slow filter sweep for movement
  const noiseLfo = ctx.createOscillator();
  noiseLfo.type = 'sine';
  noiseLfo.frequency.value = 0.05;
  const noiseLfoGain = ctx.createGain();
  noiseLfoGain.gain.value = 100;
  noiseLfo.connect(noiseLfoGain).connect(noiseFilter.frequency);
  noiseLfo.start();
  noise.connect(noiseFilter).connect(noiseGain).connect(master);
  noise.start();
  ambientNodes.push(noiseLfo);

  // ── Occasional low metallic ping (every ~8s) ──
  const schedulePing = () => {
    if (!ambientCtx) return;
    const pingOsc = ctx.createOscillator();
    pingOsc.type = 'sine';
    pingOsc.frequency.value = 220 + Math.random() * 60;
    const pingGain = ctx.createGain();
    pingGain.gain.value = 0.08;
    pingGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5);
    const pingFilter = ctx.createBiquadFilter();
    pingFilter.type = 'lowpass';
    pingFilter.frequency.value = 400;
    pingOsc.connect(pingFilter).connect(pingGain).connect(master);
    pingOsc.start();
    pingOsc.stop(ctx.currentTime + 3);
    setTimeout(schedulePing, 6000 + Math.random() * 6000);
  };
  setTimeout(schedulePing, 3000);
}

export function stopAmbientAudio() {
  if (!ambientCtx || !ambientGain) return;

  // Fade out over 1.5 seconds
  const ctx = ambientCtx;
  ambientGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);

  setTimeout(() => {
    ambientNodes.forEach(n => {
      try { (n as OscillatorNode).stop(); } catch {}
    });
    ambientNodes = [];
    try { ctx.close(); } catch {}
    ambientCtx = null;
    ambientGain = null;
  }, 2000);
}
