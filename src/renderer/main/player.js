export const soundUrl = (sound) =>
  sound.kind === 'file' ? `app://sound/user/${encodeURIComponent(sound.file)}` : `app://sound/builtin/${sound.id}.wav`;

// Resolves false when the file cannot be decoded, which drives the sound error state.
export function createPlayer() {
  let audio = null;
  return {
    play(sound, volume) {
      audio?.pause();
      audio = new Audio(soundUrl(sound));
      audio.volume = volume;
      return audio.play().then(
        () => true,
        () => false,
      );
    },
  };
}
