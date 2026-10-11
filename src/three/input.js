// Mouse-look + ghost movement input. While the pointer is locked, mouse motion
// turns your head (no button needed) and keys move your ghost. Esc releases the
// lock (the browser does that), giving you your cursor back.
import { useStore } from '../store.js';

export const input = { dx: 0, dy: 0, keys: new Set(), locked: false };

let installed = false;
export function installInput() {
  if (installed) return;
  installed = true;
  document.addEventListener('mousemove', (e) => {
    if (!document.pointerLockElement) return;
    input.dx += e.movementX;
    input.dy += e.movementY;
  });
  document.addEventListener('pointerlockchange', () => {
    input.locked = !!document.pointerLockElement;
    if (!input.locked) input.keys.clear();
    useStore.setState({ pointerLocked: input.locked });
  });
  window.addEventListener('keydown', (e) => {
    if (!input.locked) return;
    input.keys.add(e.code);
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  window.addEventListener('blur', () => input.keys.clear());
}

/** Mouse movement since the last call. */
export function takeMouse() {
  const m = { x: input.dx, y: input.dy };
  input.dx = 0;
  input.dy = 0;
  return m;
}

export function lockPointer() {
  if (window.__noPointerLock) return; // automated self-tests must never grab the user's mouse
  const el = document.querySelector('.scene canvas');
  if (!el || document.pointerLockElement === el) return;
  try {
    // Chromium returns a promise and rejects if asked again too soon after Esc.
    const p = el.requestPointerLock({ unadjustedMovement: true });
    p?.catch?.(() => el.requestPointerLock()?.catch?.(() => {}));
  } catch {
    /* not available */
  }
}

export function unlockPointer() {
  if (document.pointerLockElement) document.exitPointerLock();
}

export const held = (...codes) => codes.some((c) => input.keys.has(c));
