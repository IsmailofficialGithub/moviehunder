/** Tiny bridge so any screen can open the global music player modal. */
let opener = null;

export function registerMusicPlayerOpener(fn) {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openMusicPlayer() {
  try {
    opener?.();
  } catch {
    /* ignore */
  }
}
