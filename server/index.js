// Authoritative game server: rooms, lobby, match state, WebRTC signalling relay.
// The chamber result lives only here; each socket gets its own filtered view.

import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { CODE_LENGTH, CODE_ALPHABET, MODE, MURDER, limitsFor } from '../shared/constants.js';
import { sanitizeAvatar, sanitizeName } from '../shared/avatar.js';
import { MatchRunner, MurderRunner } from '../shared/runner.js';
import { viewFor } from '../shared/engine.js';
import { murderView, clampGoal } from '../shared/murder.js';
import { makeBot, createBotDriver, createMurderBotDriver } from '../shared/bot.js';
import os from 'node:os';

const app = express();
const http = createServer(app);
// Any origin may connect: friends reach a host through a tunnel or LAN address,
// and the desktop app's page always runs on its own localhost origin.
const io = new Server(http, { cors: { origin: true } });

/** Non-internal IPv4 addresses, for "friends on your Wi-Fi join at …". */
function lanAddresses() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a.address);
}

app.get('/api/info', (_req, res) => {
  res.json({ name: 'maxs-gun-game', port: http.address()?.port, lan: lanAddresses() });
});

// Production / desktop app: serve the built client from the same port.
const dist = path.resolve(fileURLToPath(import.meta.url), '../../dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

/** @type {Map<string, Room>} */
const rooms = new Map();

/**
 * @typedef {{ id:string, name:string, avatar:object, ready:boolean, ping:number, socketId:string }} Member
 * @typedef {{ code:string, leaderId:string, members:Member[], status:'lobby'|'playing', mode:string, killGoal:number, runner:MatchRunner|MurderRunner|null }} Room
 */

function newCode() {
  for (;;) {
    let c = '';
    for (let i = 0; i < CODE_LENGTH; i++) c += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    if (!rooms.has(c)) return c;
  }
}

const gameView = (state, viewerId) => (state.mode === MODE.MURDER ? murderView(state, viewerId) : viewFor(state, viewerId));

function roomPayload(room, viewerId) {
  return {
    code: room.code,
    leaderId: room.leaderId,
    status: room.status,
    mode: room.mode,
    killGoal: room.killGoal,
    you: viewerId,
    members: room.members.map(({ id, name, avatar, ready, ping, isBot }) => ({ id, name, avatar, ready, ping, isBot: !!isBot })),
    game: room.runner ? gameView(room.runner.state, viewerId) : null,
  };
}

const humans = (room) => room.members.filter((m) => !m.isBot);

/**
 * Murder!: does this member get to know who did something right now? In the
 * light everyone sees; in the dark only the dead and the murderer do (and everyone once it's over).
 */
function seesInDark(room, memberId, dark) {
  const st = room.runner?.state;
  if (!st || st.phase !== 'playing' || !dark) return true;
  if (memberId === st.murdererId) return true; // the murderer sees in the dark
  const pl = st.players.find((p) => p.id === memberId);
  return !pl || !pl.alive;
}

/**
 * A cock or a shot: everyone hears it, but in the dark the living only hear
 * *that* it happened — not who, not at whom. The person who did it already
 * played their own sound and isn't sent it back.
 */
function routeMurderEvent(room, e) {
  if (e.type !== 'cock' && e.type !== 'shot') return;
  const actor = e.type === 'cock' ? e.id : e.shooterId;
  const dark = e.type === 'cock' ? room.runner.state.dark : e.dark;
  for (const m of humans(room)) {
    if (m.id === actor) continue;
    const full = seesInDark(room, m.id, dark);
    io.to(m.socketId).emit('murder:fx', full ? e : { type: e.type, dark: true });
  }
}

/** Where a living player is looking: to everyone in the light; in the dark, to ghosts and the murderer. */
function relayAim(room, msg) {
  const st = room.runner?.state;
  if (!st || st.mode !== MODE.MURDER) return;
  for (const m of humans(room)) {
    if (m.id === msg.id || !seesInDark(room, m.id, st.dark)) continue;
    io.to(m.socketId).volatile.emit('aim:pose', msg);
  }
}

function broadcast(room) {
  for (const m of humans(room)) io.to(m.socketId).emit('room:state', roomPayload(room, m.id));
}

function leave(socket) {
  const room = rooms.get(socket.data.code);
  if (!room) return;
  const id = socket.data.playerId;
  room.members = room.members.filter((m) => m.id !== id);
  socket.leave(room.code);
  socket.data.code = null;
  socket.to(room.code).emit('rtc:peer-left', { id });
  // Bots don't keep a table open on their own.
  if (humans(room).length === 0) {
    room.runner?.dispose();
    room.botDriver?.dispose();
    rooms.delete(room.code);
    return;
  }
  if (room.leaderId === id) room.leaderId = humans(room)[0].id;
  if (room.runner) room.runner.removePlayer(id); // emits via onChange
  else broadcast(room);
}

function join(socket, room, { name, avatar }) {
  const member = {
    id: socket.data.playerId,
    name: sanitizeName(name),
    avatar: sanitizeAvatar(avatar),
    ready: false,
    ping: 0,
    socketId: socket.id,
  };
  room.members.push(member);
  socket.join(room.code);
  socket.data.code = room.code;
}

io.on('connection', (socket) => {
  // Stable for the life of the socket; the client learns it from room:state.you
  socket.data.playerId = socket.id;
  socket.data.code = null;

  const roomOf = () => rooms.get(socket.data.code);
  const ack = (cb, payload) => typeof cb === 'function' && cb(payload);

  socket.on('room:create', (profile, cb) => {
    leave(socket);
    const room = { code: newCode(), leaderId: socket.data.playerId, members: [], status: 'lobby', mode: MODE.CLASSIC, killGoal: 4, runner: null };
    rooms.set(room.code, room);
    join(socket, room, profile || {});
    ack(cb, { ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('room:join', ({ code, ...profile } = {}, cb) => {
    const room = rooms.get(String(code || '').toUpperCase().trim());
    if (!room) return ack(cb, { ok: false, error: 'No room with that code.' });
    if (room.members.some((m) => m.id === socket.data.playerId)) return ack(cb, { ok: true, code: room.code });
    if (room.status !== 'lobby') return ack(cb, { ok: false, error: 'That match is already underway.' });
    const cap = limitsFor(room.mode).max;
    if (room.members.length >= cap) return ack(cb, { ok: false, error: `Table is full (${cap} max).` });
    leave(socket);
    join(socket, room, profile);
    ack(cb, { ok: true, code: room.code });
    broadcast(room);
  });

  socket.on('room:leave', () => leave(socket));

  socket.on('player:update', (patch = {}) => {
    const room = roomOf();
    const me = room?.members.find((m) => m.id === socket.data.playerId);
    if (!me || room.status !== 'lobby') return;
    if ('name' in patch) me.name = sanitizeName(patch.name);
    if ('avatar' in patch) me.avatar = sanitizeAvatar(patch.avatar);
    if ('ready' in patch) me.ready = !!patch.ready;
    broadcast(room);
  });

  socket.on('room:start', (_opts, cb) => {
    const room = roomOf();
    if (!room) return ack(cb, { ok: false, error: 'Not in a room.' });
    if (room.leaderId !== socket.data.playerId) return ack(cb, { ok: false, error: 'Only the party leader can start.' });
    if (room.status !== 'lobby') return ack(cb, { ok: false, error: 'Already playing.' });
    const lim = limitsFor(room.mode);
    if (room.members.length < lim.min) {
      return ack(cb, { ok: false, error: `Need at least ${lim.min} players. Add a bot or invite a friend.` });
    }
    if (room.members.length > lim.max) {
      return ack(cb, { ok: false, error: `This mode seats ${lim.max} at most. Remove a bot or pick Murder!.` });
    }
    const notReady = room.members.filter((m) => m.id !== room.leaderId && !m.ready);
    if (notReady.length) return ack(cb, { ok: false, error: `Waiting on: ${notReady.map((m) => m.name).join(', ')}` });

    const players = room.members.map(({ id, name, avatar, isBot }) => ({ id, name, avatar, isBot }));

    room.status = 'playing';
    if (room.mode === MODE.MURDER) {
      startMurder(room, players);
      return ack(cb, { ok: true });
    }
    // Test-only overrides (unset in normal play): a fixed roll sequence like
    // "0,1" (0 = empty, 1 = loaded), the bots' decision, and who shoots first.
    const testRolls = process.env.GUN_TEST_ROLLS?.split(',').map((x) => x.trim() === '1');
    let rollAt = 0;
    room.runner = new MatchRunner({
      roll: testRolls ? () => testRolls[rollAt++ % testRolls.length] : undefined,
      players,
      onChange: () => {
        broadcast(room);
        room.botDriver?.drive();
      },
    });
    room.botDriver = createBotDriver(room.runner, (id, text) => io.to(room.code).emit('room:emote', { id, text }));
    room.runner.start(process.env.GUN_TEST_FIRST === 'last' ? players[players.length - 1].id : undefined);
    ack(cb, { ok: true });
  });

  // Bots fill player slots in the lobby (leader only).
  socket.on('room:addBot', (_opts, cb) => {
    const room = roomOf();
    if (!room || room.leaderId !== socket.data.playerId || room.status !== 'lobby') return ack(cb, { ok: false });
    const cap = limitsFor(room.mode).max;
    if (room.members.length >= cap) return ack(cb, { ok: false, error: `Table is full (${cap} max).` });
    const taken = new Set(room.members.map((m) => m.name));
    const bot = makeBot(`bot:${room.code}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, Math.random, taken);
    room.members.push({ ...bot, ready: true, ping: 0, socketId: null });
    broadcast(room);
    ack(cb, { ok: true });
  });

  // Leader picks the mode (and, for Murder!, how many bodies the murderer needs).
  socket.on('room:settings', ({ mode, killGoal } = {}) => {
    const room = roomOf();
    if (!room || room.leaderId !== socket.data.playerId || room.status !== 'lobby') return;
    if (mode === MODE.CLASSIC || mode === MODE.MURDER) room.mode = mode;
    const g = Math.round(Number(killGoal));
    if (Number.isFinite(g)) room.killGoal = Math.min(MURDER.goalMax, Math.max(MURDER.goalMin, g));
    broadcast(room);
  });

  socket.on('room:removeBot', ({ id } = {}) => {
    const room = roomOf();
    if (!room || room.leaderId !== socket.data.playerId || room.status !== 'lobby') return;
    room.members = room.members.filter((m) => !(m.isBot && m.id === id));
    broadcast(room);
  });

  // Ghosts: a dead player's position goes to the other dead players and no one
  // else — the living can't see (or receive) them.
  socket.on('ghost:pose', ({ p, yaw } = {}) => {
    const room = roomOf();
    const st = room?.runner?.state;
    const me = st?.players.find((x) => x.id === socket.data.playerId);
    if (!me || me.alive) return;
    if (!Array.isArray(p) || p.length !== 3 || !p.every((v) => Number.isFinite(v) && Math.abs(v) < 20)) return;
    const msg = { id: me.id, p, yaw: Number.isFinite(yaw) ? yaw : 0 };
    for (const m of humans(room)) {
      if (m.id === me.id) continue;
      const pl = st.players.find((x) => x.id === m.id);
      if (pl && !pl.alive) io.to(m.socketId).volatile.emit('ghost:pose', msg);
    }
  });

  // Murder!: click one cocks, click two fires at whoever is in your sights.
  const murderRunner = () => {
    const r = roomOf()?.runner;
    return r instanceof MurderRunner ? r : null;
  };
  const murderAct = (fn) => {
    const r = murderRunner();
    return r ? fn(r) : 'no-match';
  };
  socket.on('game:cock', (_x, cb) => {
    const err = murderAct((r) => r.cock(socket.data.playerId));
    ack(cb, err ? { ok: false, error: err } : { ok: true });
  });
  socket.on('game:lower', (_x, cb) => {
    const err = murderAct((r) => r.lower(socket.data.playerId));
    ack(cb, err ? { ok: false, error: err } : { ok: true });
  });
  socket.on('game:shoot', ({ targetId } = {}, cb) => {
    const t = typeof targetId === 'string' ? targetId : null;
    const err = murderAct((r) => r.shoot(socket.data.playerId, t));
    ack(cb, err ? { ok: false, error: err } : { ok: true });
  });
  socket.on('aim:pose', ({ yaw, pitch } = {}) => {
    const room = roomOf();
    const st = murderRunner()?.state;
    const me = st?.players.find((x) => x.id === socket.data.playerId);
    if (!me || !me.alive || st.phase !== 'playing') return;
    if (!Number.isFinite(yaw) || !Number.isFinite(pitch) || Math.abs(yaw) > 10 || Math.abs(pitch) > 2) return;
    relayAim(room, { id: me.id, yaw, pitch });
  });

  socket.on('game:action', ({ action } = {}, cb) => {
    const room = roomOf();
    if (!room?.runner?.act) return ack(cb, { ok: false, error: 'No match.' });
    const err = room.runner.act(socket.data.playerId, action);
    ack(cb, err ? { ok: false, error: err } : { ok: true });
  });

  socket.on('room:reset', () => {
    const room = roomOf();
    if (!room || room.leaderId !== socket.data.playerId) return;
    room.runner?.dispose();
    room.botDriver?.dispose();
    room.runner = null;
    room.status = 'lobby';
    for (const m of room.members) m.ready = !!m.isBot;
    broadcast(room);
  });

  // Latency: client times the ack round trip, then reports it for the lobby list.
  socket.on('net:ping', (_t, cb) => ack(cb, Date.now()));
  socket.on('net:report', (ms) => {
    const room = roomOf();
    const me = room?.members.find((m) => m.id === socket.data.playerId);
    if (!me) return;
    me.ping = Math.max(0, Math.min(9999, Math.round(Number(ms) || 0)));
    if (room.status === 'lobby') broadcast(room);
  });

  // WebRTC signalling: relay only between members of the same room.
  socket.on('rtc:signal', ({ to, data } = {}) => {
    const room = roomOf();
    const peer = room?.members.find((m) => m.id === to && !m.isBot);
    if (!peer) return;
    io.to(peer.socketId).emit('rtc:signal', { from: socket.data.playerId, data });
  });

  socket.on('disconnect', () => leave(socket));
});

/** Murder!: pick the murderer, start the lights clock and the bots. */
function startMurder(room, players) {
  // Test-only overrides: who the murderer is ('first' | 'last' | 'leader' | seat index), and
  // a different lights clock as "firstMs,gapMs,darkMs".
  const want = process.env.GUN_TEST_MURDERER;
  const pickTest = /^\d+$/.test(want || '') ? players[Number(want)]?.id : { first: players[0].id, last: players[players.length - 1].id, leader: room.leaderId }[want];
  const [first, gap, dark] = (process.env.GUN_TEST_DARK || '').split(',').map(Number);
  room.runner = new MurderRunner({
    players,
    killGoal: clampGoal(room.killGoal, players.length),
    murdererId: pickTest,
    first: first || undefined,
    gap: gap || undefined,
    dark: dark || undefined,
    onChange: () => broadcast(room),
    onEvent: (e) => {
      routeMurderEvent(room, e);
      room.botDriver?.event(e);
    },
  });
  room.botDriver = createMurderBotDriver(room.runner, { aim: (id, a) => relayAim(room, { id, ...a }) });
  room.runner.start();
  room.botDriver.start();
}

/**
 * Listen on `port` (all interfaces, so LAN friends can join). If it's taken —
 * e.g. a second copy of the app on the same PC — fall back to a free port.
 * @returns {Promise<{ port: number, lan: string[], close: () => void }>}
 */
export function startServer({ port = 3001, fallback = true } = {}) {
  return new Promise((resolve, reject) => {
    const onError = (err) => {
      if (err.code === 'EADDRINUSE' && fallback && port !== 0) {
        http.listen(0);
      } else reject(err);
    };
    http.once('error', onError);
    http.once('listening', () => {
      http.off('error', onError);
      const actual = http.address().port;
      console.log(`[gun-game] server on http://localhost:${actual}`);
      resolve({ port: actual, lan: lanAddresses(), close: () => http.close() });
    });
    http.listen(port);
  });
}

// `node server/index.js` (dev, or a hosted deployment): start immediately.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Dev always uses 3001 (Vite proxies to it); production honours $PORT.
  const port = process.argv.includes('--dev') ? 3001 : Number(process.env.PORT) || 3001;
  startServer({ port, fallback: false });
}
