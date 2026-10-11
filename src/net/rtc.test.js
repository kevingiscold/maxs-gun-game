// Voice channels: the living hear only the living, ghosts hear everyone.
// Checked on the sending side with fake peers (no real WebRTC in node).
import test from 'node:test';
import assert from 'node:assert/strict';
import { Mesh } from './rtc.js';
import { useMedia } from './media.js';

const mic = { kind: 'audio' };
const cam = { kind: 'video' };

function setup(peerIds) {
  useMedia.setState({ local: { getTracks: () => [mic, cam] } });
  const socket = { on() {}, off() {}, emit() {} };
  const mesh = new Mesh(socket, 'me');
  for (const id of peerIds) {
    const fake = (track) => ({ track, replaceTrack(t) { this.track = t; return Promise.resolve(); } });
    mesh.peers.set(id, { id, pc: { close() {} }, senders: { audio: fake(mic), video: fake(null) } });
  }
  const hears = () => Object.fromEntries([...mesh.peers].map(([id, p]) => [id, p.senders.audio.track === mic]));
  return { mesh, hears };
}

test('alive: my voice goes to everyone, living and ghosts', () => {
  const { mesh, hears } = setup(['alive1', 'ghost1']);
  mesh.setVoiceRoute(false, ['ghost1']);
  assert.deepEqual(hears(), { alive1: true, ghost1: true });
});

test('ghost: my voice goes only to other ghosts', () => {
  const { mesh, hears } = setup(['alive1', 'alive2', 'ghost1']);
  mesh.setVoiceRoute(true, ['me', 'ghost1']);
  assert.deepEqual(hears(), { alive1: false, alive2: false, ghost1: true });
});

test('a new match puts everyone back on one channel', () => {
  const { mesh, hears } = setup(['alive1', 'ghost1']);
  mesh.setVoiceRoute(true, ['me', 'ghost1']);
  mesh.setVoiceRoute(false, []);
  assert.deepEqual(hears(), { alive1: true, ghost1: true });
});

test('video gating still works alongside voice routing', () => {
  const { mesh } = setup(['alive1']);
  mesh.setVoiceRoute(true, ['me']);
  mesh.setSendingVideo(true);
  const p = mesh.peers.get('alive1');
  assert.equal(p.senders.video.track, cam);
  assert.equal(p.senders.audio.track, null);
});
