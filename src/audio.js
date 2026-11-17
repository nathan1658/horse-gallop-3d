/**
 * Procedural Web Audio synthesizer for equine hoof impacts + rushing headwind.
 * Strictly opt-in (muted until user clicks Sound toggle).
 */
export function createGallopAudio() {
  let ctx = null;
  let enabled = false;
  let windGain = null;
  let noiseBuffer = null;

  function initContext() {
    if (ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();

    // Pre-generate 2 seconds of pink-ish noise for wet sand spray & headwind
    const length = ctx.sampleRate * 2;
    noiseBuffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.96300 * b1 + white * 0.296516;
      b2 = 0.57000 * b2 + white * 1.052691;
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.16;
    }

    // Continuous subtle headwind loop
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = noiseBuffer;
    windSrc.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 0.85;

    windGain = ctx.createGain();
    windGain.gain.value = 0.0;

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(ctx.destination);
    windSrc.start();
  }

  function setEnabled(nextState) {
    enabled = nextState;
    if (enabled) {
      initContext();
      if (ctx && ctx.state === 'suspended') ctx.resume();
    }
    if (windGain && ctx) {
      windGain.gain.setTargetAtTime(enabled ? 0.055 : 0.0, ctx.currentTime, 0.18);
    }
    return enabled;
  }

  function triggerHoofStrike(intensity = 1.0, panX = 0) {
    if (!enabled || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;

    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (panner) {
      panner.pan.value = Math.max(-0.6, Math.min(0.6, panX * 2.5));
      panner.connect(ctx.destination);
    }
    const dest = panner || ctx.destination;

    // 1. Sub-bass earth impact thud
    const osc = ctx.createOscillator();
    const thudGain = ctx.createGain();
    osc.type = 'triangle';
    const baseFreq = 92 + Math.random() * 18;
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(34, now + 0.095);

    thudGain.gain.setValueAtTime(0.24 * intensity, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(thudGain);
    thudGain.connect(dest);
    osc.start(now);
    osc.stop(now + 0.13);

    // 2. Wet volcanic sand & gravel splash transient
    if (noiseBuffer) {
      const gritSrc = ctx.createBufferSource();
      gritSrc.buffer = noiseBuffer;
      const gritFilter = ctx.createBiquadFilter();
      gritFilter.type = 'bandpass';
      gritFilter.frequency.value = 1150 + Math.random() * 450;
      gritFilter.Q.value = 1.1;

      const gritGain = ctx.createGain();
      gritGain.gain.setValueAtTime(0.14 * intensity, now);
      gritGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

      gritSrc.connect(gritFilter);
      gritFilter.connect(gritGain);
      gritGain.connect(dest);
      gritSrc.start(now, Math.random() * 1.4, 0.10);
    }
  }

  function updateWind(speedRatio) {
    if (!enabled || !windGain || !ctx) return;
    const target = Math.min(0.11, 0.025 + 0.05 * speedRatio);
    windGain.gain.setTargetAtTime(target, ctx.currentTime, 0.12);
  }

  return {
    isEnabled: () => enabled,
    setEnabled,
    triggerHoofStrike,
    updateWind,
  };
}
