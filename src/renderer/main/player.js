export const soundUrl = (sound) =>
  sound.kind === 'file' ? `app://ui/sound/user/${encodeURIComponent(sound.file)}` : `app://ui/sound/builtin/${sound.id}.wav`;

const BARS = 4;

// One preview at a time. Listeners hear which sound is playing and, every frame while it
// plays, four live levels read from the audio itself.
export function createPlayer() {
  let audio = null;
  let key = null;
  let ctx = null;
  let analyser = null;
  let bins = null;
  let raf = 0;
  const changeListeners = new Set();
  const levelListeners = new Set();

  const emit = () => changeListeners.forEach((fn) => fn(key));

  // The audio device takes a moment to open and the meter reads silence until it has,
  // so the graph is built when a sound picker appears rather than on the first click.
  function warm() {
    try {
      ctx ??= new AudioContext();
      analyser ??= Object.assign(ctx.createAnalyser(), { fftSize: 64, smoothingTimeConstant: 0.6 });
      bins ??= new Uint8Array(analyser.frequencyBinCount);
      analyser.connect(ctx.destination);
      ctx.resume().catch(() => {});
      return true;
    } catch {
      return false;
    }
  }

  function graph(el) {
    if (!warm()) return false;
    try {
      ctx.createMediaElementSource(el).connect(analyser);
      return true;
    } catch {
      return false;
    }
  }

  function loop() {
    if (!audio || !analyser) return;
    analyser.getByteFrequencyData(bins);
    const per = Math.floor(bins.length / 2 / BARS);
    const levels = Array.from({ length: BARS }, (_, i) => {
      let sum = 0;
      for (let j = i * per; j < (i + 1) * per; j++) sum += bins[j];
      return Math.min(1, sum / per / 200);
    });
    levelListeners.forEach((fn) => fn(levels));
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    audio?.pause();
    audio = null;
    if (key == null) return;
    key = null;
    levelListeners.forEach((fn) => fn(new Array(BARS).fill(0)));
    emit();
  }

  return {
    get playing() {
      return key;
    },
    onChange(fn) {
      changeListeners.add(fn);
      return () => changeListeners.delete(fn);
    },
    onLevels(fn) {
      levelListeners.add(fn);
      return () => levelListeners.delete(fn);
    },
    stop,
    warm,
    // Resolves false when the file cannot be decoded, which drives the sound error state.
    async play(playKey, sound, volume) {
      stop();
      const el = new Audio();
      el.src = soundUrl(sound);
      el.volume = volume;
      audio = el;
      key = playKey;
      emit();
      // Once an element feeds the meter, it is only heard through the AudioContext; a context
      // that won't run (no device yet, device switched) would leave the preview silent. Then
      // the sound plays directly instead, just without the live meter.
      const running = warm() && (await Promise.race([ctx.resume().then(() => ctx.state === 'running', () => false), new Promise((r) => setTimeout(() => r(false), 300))]));
      // Another preview started meanwhile: this one simply steps aside (not an error).
      if (audio !== el) return true;
      const metered = running && graph(el);
      el.addEventListener('ended', () => audio === el && stop(), { once: true });
      try {
        await el.play();
        if (metered) loop();
        return true;
      } catch {
        if (audio === el) stop();
        return false;
      }
    },
  };
}
