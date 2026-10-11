// Local camera/mic + the streams shown in the webcam overlays.
import { create } from 'zustand';

export const useMedia = create((set) => ({
  local: null, // MediaStream from getUserMedia (null if denied / none)
  localError: null,
  remote: {}, // peerId -> MediaStream
  remoteVideoLive: {}, // peerId -> whether their video track is currently flowing
  feedGL: {}, // 'shooter' | 'target' -> { stream, mirror } drawn by the 3D layer
  micMuted: false,
  set,
}));

export async function acquireLocalMedia({ camId, micId } = {}) {
  const prev = useMedia.getState().local;
  prev?.getTracks().forEach((t) => t.stop());
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: camId ? { deviceId: { exact: camId }, width: 640, height: 480 } : { width: 640, height: 480 },
      audio: micId ? { deviceId: { exact: micId }, echoCancellation: true } : { echoCancellation: true },
    });
    const muted = useMedia.getState().micMuted;
    stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    useMedia.setState({ local: stream, localError: null });
    return stream;
  } catch (err) {
    const msg = !navigator.mediaDevices
      ? 'Camera needs https or localhost.'
      : err?.name === 'NotAllowedError'
        ? 'Camera/mic permission denied.'
        : err?.name === 'NotFoundError'
          ? 'No camera or mic found.'
          : 'Could not open camera.';
    useMedia.setState({ local: null, localError: msg });
    return null;
  }
}

export function releaseLocalMedia() {
  useMedia.getState().local?.getTracks().forEach((t) => t.stop());
  useMedia.setState({ local: null });
}

export function setMicMuted(muted) {
  useMedia.getState().local?.getAudioTracks().forEach((t) => (t.enabled = !muted));
  useMedia.setState({ micMuted: muted });
}

export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return { cams: [], mics: [] };
  const all = await navigator.mediaDevices.enumerateDevices();
  return {
    cams: all.filter((d) => d.kind === 'videoinput'),
    mics: all.filter((d) => d.kind === 'audioinput'),
  };
}

/**
 * Fake webcam for bots: an animated canvas captured as a MediaStream,
 * so the overlay exercises the same <video> path a real peer would.
 */
export function makePlaceholderStream(label, hue = 20) {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 240;
  const g = c.getContext('2d');
  // Pre-rendered static, blitted at a random offset (cheaper than per-pixel noise).
  const noise = document.createElement('canvas');
  noise.width = 640;
  noise.height = 480;
  const ng = noise.getContext('2d');
  for (let i = 0; i < 2500; i++) {
    ng.fillStyle = `rgba(255,255,255,${Math.random() * 0.07})`;
    ng.fillRect(Math.random() * 640, Math.random() * 480, 2, 2);
  }
  let t = 0;
  const draw = () => {
    t += 1;
    g.fillStyle = `hsl(${hue} 25% 12%)`;
    g.fillRect(0, 0, 320, 240);
    // bobbing "head"
    const y = 120 + Math.sin(t / 18) * 6;
    g.fillStyle = `hsl(${hue} 30% 38%)`;
    g.beginPath();
    g.ellipse(160, y, 46, 58, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(100, y + 60, 120, 80);
    // blinking eyes
    const blink = t % 75 < 4 ? 1 : 7;
    g.fillStyle = '#111';
    g.fillRect(138, y - 12, 10, blink);
    g.fillRect(172, y - 12, 10, blink);
    g.drawImage(noise, -Math.random() * 320, -Math.random() * 240);
    g.fillStyle = 'rgba(255,60,40,0.9)';
    g.font = '12px monospace';
    if (t % 38 < 25) g.fillText('● REC', 10, 18);
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.fillText(`SIM CAM — ${label}`, 10, 230);
  };
  const id = setInterval(draw, 1000 / 15);
  draw();
  const stream = c.captureStream(15);
  stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(id));
  stream.stopPlaceholder = () => {
    clearInterval(id);
    stream.getTracks().forEach((tr) => tr.stop());
  };
  return stream;
}
