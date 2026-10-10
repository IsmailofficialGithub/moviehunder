/**
 * Global bridge so PosterCard, WideTitleCard, or any component
 * can open the video preview modal on mobile.
 */
let opener = null;

export function registerPreviewOpener(fn) {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openPreview(item) {
  try {
    opener?.(item);
  } catch {
    /* ignore */
  }
}
