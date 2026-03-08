// Synthetic ambient audio using Web Audio API — dark tactical atmosphere
let ambientCtx: AudioContext | null = null;
let ambientNodes: OscillatorNode[] = [];
let ambientGain: GainNode | null = null;
let pingTimer: ReturnType<typeof setTimeout> | null = null;

export function startAmbientAudio() {
  if (ambientCtx && ambientCtx.state !== 'closed') return;

  try {
    const ctx = new AudioContext();
    ambientCtx = ctx;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0, ctx.currentTime);
    master.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 3);
    master.connect(ctx.destination);
    ambientGain = master;

    // ── Deep sub bass drone ──
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = 55;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.4;
    sub.connect(subGain).connect(master);
    sub.start();
    ambientNodes.push(sub);

    // ── Low rumble with LFO ──
    const rumble = ctx.createOscillator();
    rumble.type = 'sawtooth';
    rumble.frequency.value = 40;
    const rumbleFilter = ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.value = 90;
    const rumbleGain = ctx.createGain();
    rumbleGain.gain.value = 0.18;
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.12;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.1;
    lfo.connect(lfoGain).connect(rumbleGain.gain);
    lfo.start();
    rumble.connect(rumbleFilter).connect(rumbleGain).connect(master);
    rumble.start();
    ambientNodes.push(rumble, lfo);

    // ── Minor chord pad ──
    [110, 130.81, 164.81].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.detune.value = (i - 1) * 6;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 350;
      const gain = ctx.createGain();
      gain.gain.value = 0.05;
      const padLfo = ctx.createOscillator();
      padLfo.type = 'sine';
      padLfo.frequency.value = 0.07 + i * 0.02;
      const padLfoGain = ctx.createGain();
      padLfoGain.gain.value = 0.03;
      padLfo.connect(padLfoGain).connect(gain.gain);
      padLfo.start();
      osc.connect(filter).connect(gain).connect(master);
      osc.start();
      ambientNodes.push(osc, padLfo);
    });

    // ── Noise layer (wind) ──
    const bufLen = ctx.sampleRate * 4;
    const noiseBuffer = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 250;
    noiseFilter.Q.value = 0.4;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.07;
    noise.connect(noiseFilter).connect(noiseGain).connect(master);
    noise.start();

    // ── Metallic pings ──
    const schedulePing = () => {
      if (!ambientCtx || ambientCtx.state === 'closed') return;
      try {
        const p = ctx.createOscillator();
        p.type = 'sine';
        p.frequency.value = 200 + Math.random() * 80;
        const pg = ctx.createGain();
        pg.gain.setValueAtTime(0.1, ctx.currentTime);
        pg.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2);
        p.connect(pg).connect(master);
        p.start();
        p.stop(ctx.currentTime + 2.5);
      } catch {}
      pingTimer = setTimeout(schedulePing, 5000 + Math.random() * 7000);
    };
    pingTimer = setTimeout(schedulePing, 2000);

    console.log('Ambient audio started');
  } catch (e) {
    console.error('Failed to start ambient audio:', e);
  }
}

export function stopAmbientAudio() {
  if (pingTimer) { clearTimeout(pingTimer); pingTimer = null; }
  if (!ambientCtx || !ambientGain) return;

  const ctx = ambientCtx;
  try {
    ambientGain.gain.setValueAtTime(ambientGain.gain.value, ctx.currentTime);
    ambientGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.5);
  } catch {}

  setTimeout(() => {
    ambientNodes.forEach(n => { try { n.stop(); } catch {} });
    ambientNodes = [];
    try { ctx.close(); } catch {}
    ambientCtx = null;
    ambientGain = null;
  }, 2000);
}
