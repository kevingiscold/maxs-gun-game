import React, { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, PerformanceMonitor } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette, Noise, ChromaticAberration, SMAA } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import { useStore } from '../store.js';
import { Room } from './Room.jsx';
import { Avatar, Chair } from './Avatar.jsx';
import { Revolver } from './Revolver.jsx';
import { FeedScreens } from './FeedScreens.jsx';
import { Ghosts, clearGhosts } from './Ghosts.jsx';
import { takeMouse, unlockPointer, held } from './input.js';
import { session } from '../net/session.js';
import { LOCAL, seat, seatPoint } from './layout.js';
import { avatarPose, flinching, gunPose, lookTarget, seatIndexMap, visiblyAlive } from './choreo.js';
import { fx } from './fx.js';
import { sfx } from '../audio/sfx.js';
import { PHASE, OUTCOME, TIMING } from '../../shared/constants.js';

const elapsedNow = () => performance.now() - useStore.getState().phaseLocalStart;

/** Who sits at the table right now (game > lobby > nobody). */
function useTablePlayers() {
  const game = useStore((s) => s.game);
  const room = useStore((s) => s.room);
  const screen = useStore((s) => s.screen);
  if (game && screen === 'game') return game.players;
  if (room && screen !== 'menu') return room.members.map((m) => ({ ...m, alive: true }));
  return [];
}

function SeatedPlayer({ player, index, n }) {
  const [pose, setPose] = useState('rest');
  const [flinch, setFlinch] = useState(false);
  const look = useRef(new THREE.Vector3());
  const [hasLook, setHasLook] = useState(false);
  const role = useStore((s) => {
    const g = s.game;
    if (!g || s.screen !== 'game') return null;
    if (g.winnerId === player.id) return 'winner';
    if (g.shooterId === player.id) return 'shooter';
    if (g.targetId === player.id) return 'target';
    return null;
  });
  const isMe = useStore((s) => s.myId === player.id || s.room?.you === player.id);
  const emote = useStore((s) => s.emotes?.[player.id]);
  const ready = player.ready;
  const inLobby = useStore((s) => s.screen !== 'game');
  const firstPerson = useStore((s) => s.firstPersonId === player.id);
  const tagRef = useRef();
  const headWorld = useMemo(() => seatPoint(index, n, LOCAL.head), [index, n]);

  useFrame(({ camera }) => {
    // fade the name tag of whoever the camera is looking over the shoulder of
    if (tagRef.current) {
      const d = camera.position.distanceTo(headWorld);
      tagRef.current.style.opacity = String(THREE.MathUtils.clamp((d - 1.1) / 0.6, 0, 1));
    }
    const st = useStore.getState();
    const g = st.screen === 'game' ? st.game : null;
    const el = elapsedNow();
    const p2 = avatarPose(player, g, el);
    if (p2 !== pose) setPose(p2);
    const f = flinching(player, g, el);
    if (f !== flinch) setFlinch(f);
    if (g) {
      const idx = seatIndexMap(g.players);
      const got = lookTarget(player, g, idx, g.players.length, look.current);
      if (!!got !== hasLook) setHasLook(!!got);
    }
  });

  const s = seat(index, n);
  return (
    <group position={s.position} rotation={[0, s.rotY, 0]}>
      <Avatar config={player.avatar} pose={pose} flinch={flinch} lookAt={hasLook ? look.current : null} hideHead={firstPerson} playerId={player.id} />
      {pose === 'dead' && <BloodPool />}
      <Html position={[0, 1.82, 0]} center distanceFactor={3.2} zIndexRange={[5, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={tagRef} className={`tag ${role || ''} ${pose === 'dead' ? 'dead' : ''}`}>
          <span className="tag-name">
            {player.name}
            {isMe && <em> (you)</em>}
          </span>
          {role && pose !== 'dead' && <span className="tag-role">{role}</span>}
          {inLobby && <span className={`tag-role ${ready ? 'ok' : ''}`}>{ready ? 'ready' : '…'}</span>}
          {pose === 'dead' && <span className="tag-role">dead</span>}
          {emote && pose !== 'dead' && <div className="emote">{emote.text}</div>}
        </div>
      </Html>
    </group>
  );
}

function EmptyChairs({ n = 4 }) {
  return Array.from({ length: n }, (_, i) => {
    const s = seat(i, n);
    return (
      <group key={i} position={s.position} rotation={[0, s.rotY + (i % 2 ? 0.25 : -0.15), 0]}>
        <Chair />
      </group>
    );
  });
}

/** Dark, wet pool that spreads under a body. */
function BloodPool() {
  const ref = useRef();
  const born = useMemo(() => performance.now(), []);
  useFrame(() => {
    const k = Math.min(1, (performance.now() - born) / 5000);
    const e = 1 - Math.pow(1 - k, 3);
    ref.current.scale.set(0.15 + e * 0.85, 0.15 + e * 0.85, 1);
  });
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0.7]} position={[0.08, 0.008, -0.05]}>
      <circleGeometry args={[0.42, 24]} />
      <meshStandardMaterial color="#2a0202" roughness={0.08} metalness={0.2} polygonOffset polygonOffsetFactor={-2} />
    </mesh>
  );
}

/** One persistent red light over the target (moved, never re-mounted). */
function TargetLight() {
  const ref = useRef();
  const p = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const st = useStore.getState();
    const g = st.screen === 'game' ? st.game : null;
    const live = g && (g.phase === PHASE.AIMING || g.phase === PHASE.DECISION) && g.targetId;
    if (live) {
      const idx = seatIndexMap(g.players);
      seatPoint(idx.get(g.targetId), g.players.length, LOCAL.head, p);
      ref.current.position.set(p.x * 0.85, p.y + 0.55, p.z * 0.85);
    }
    const want = live ? 2.6 : 0;
    ref.current.intensity += (want - ref.current.intensity) * 0.08;
  });
  return <pointLight ref={ref} color="#ff2a1a" intensity={0} distance={2.4} decay={2} />;
}

function GunController({ players }) {
  const ref = useRef(players);
  ref.current = players;
  return (
    <Revolver
      getPose={() => {
        const st = useStore.getState();
        const g = st.screen === 'game' ? st.game : null;
        return gunPose(g, g ? g.players : ref.current, elapsedNow(), performance.now() / 1000);
      }}
    />
  );
}

/** Plays sounds and sets fx timestamps at fixed offsets into each phase. */
function Cues() {
  const fired = useRef({ key: '', set: new Set() });
  useFrame(() => {
    const st = useStore.getState();
    const g = st.game;
    const flash = document.querySelector('.hitflash');
    if (flash) {
      const since = performance.now() - fx.shotAt;
      flash.style.opacity = since < 1400 ? String(0.7 * Math.pow(1 - since / 1400, 2)) : '0';
    }
    if (!g || st.screen !== 'game') return;
    const f = fired.current;
    if (f.key !== st.phaseKey) {
      f.key = st.phaseKey;
      f.set = new Set();
      f.nextBeat = undefined;
    }
    const el = elapsedNow();
    const once = (id, at, fn) => {
      if (el >= at && !f.set.has(id)) {
        f.set.add(id);
        if (el < at + 1500) fn(); // don't replay stale cues after a tab switch
      }
    };
    const me = st.myId;
    const inDuel = me === (g.result?.shooterId ?? g.shooterId) || me === (g.result?.targetId ?? g.targetId);
    const beat = (interval) => {
      if (el >= (f.nextBeat ?? 300)) {
        sfx.heartbeat(inDuel ? 0.9 : 0.35);
        f.nextBeat = el + interval;
      }
    };

    if (g.phase === PHASE.AIMING) once('spin', 300, sfx.spin);
    if (g.phase === PHASE.DECISION) {
      const dur = g.deadline ? g.deadline - g.phaseStartedAt : 0;
      if (dur) for (let s = 5; s >= 1; s--) once(`tick${s}`, dur - s * 1000, sfx.tick);
      // Heartbeat that quickens as the clock runs; loudest for whoever's in the duel.
      const progress = dur ? Math.min(1, el / dur) : Math.min(1, el / 20000);
      beat(1150 - 550 * progress);
    }
    if (g.phase === PHASE.RESOLVING) {
      const o = g.result.outcome;
      const shot = o === OUTCOME.KILL || o === OUTCOME.MISFIRE || o === OUTCOME.SURVIVED;
      const bang = () => {
        fx.shotAt = performance.now();
        sfx.bang({ close: inDuel });
      };
      if (shot) {
        // one loud click: it's ready. Then nothing but a racing heart until the trigger.
        once('cock', TIMING.cock, sfx.cock);
        if (el > TIMING.cock && el < TIMING.trigger) beat(460);
      }
      if (o === OUTCOME.KILL) once('bang', TIMING.trigger, bang);
      if (o === OUTCOME.MISFIRE || o === OUTCOME.SURVIVED) {
        const dry = () => {
          fx.clickAt = performance.now();
          sfx.click();
        };
        once('click', TIMING.trigger, dry);
        // silence... the gun turns around, slowly... ready... and
        once('cock2', TIMING.selfAim + 1200, sfx.cock);
        if (el > TIMING.selfAim + 1200 && el < TIMING.selfShot) beat(400);
        once('self', TIMING.selfShot, o === OUTCOME.MISFIRE ? bang : dry);
      }
      if (o === OUTCOME.PASS || o === OUTCOME.TIMEOUT) once('thud', 2600, sfx.thud);
      for (const e of g.result.eliminated) once(`fall-${e.id}`, e.at + 700, sfx.thud);
    }
  });
  return null;
}

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _v = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _euler = new THREE.Euler(0, 0, 0, 'YXZ');

const yawTo = (d) => Math.atan2(-d.x, -d.z); // camera looks down -z
const pitchTo = (d) => Math.asin(THREE.MathUtils.clamp(d.y / (d.length() || 1), -1, 1));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const NECK_YAW = 1.9; // how far you can turn your head from facing the table
const GHOST_SPEED = 1.5; // m/s
const GHOST_RADIUS = 4.4; // ghosts stay in the room around the table
const MOUSE = 0.0022;

/**
 * Camera rules:
 *  - alive at the table: your own eyes. Mouse-look (pointer locked) turns your
 *    head within a neck's range; Shooter/Target start facing each other.
 *  - dead: a ghost. Fly anywhere near the table, through anything.
 *  - menus / lobby: a slow orbit; game over: orbit the winner.
 */
function CameraRig() {
  const { camera } = useThree();
  const rig = useRef({ mode: '', offYaw: 0, offPitch: 0, baseYaw: 0, basePitch: 0, duelKey: '', recenter: 0, ghost: new THREE.Vector3(), gYaw: 0, gPitch: 0, sentAt: 0 });

  useFrame((state, delta) => {
    const st = useStore.getState();
    const r = rig.current;
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const g = st.screen === 'game' ? st.game : null;
    const el = elapsedNow();
    const sens = (st.settings.freeLookSpeed ?? 1) * MOUSE;

    // ----- which camera?
    let next = st.screen === 'customize' ? 'custom' : 'menu';
    let me = null;
    let myIdx = -1;
    let idx = null;
    if (g) {
      idx = seatIndexMap(g.players);
      me = g.players.find((p) => p.id === st.myId);
      myIdx = me ? idx.get(me.id) : -1;
      const alive = me && visiblyAlive(me, g, el);
      if (me && !alive && !st.deathAt) useStore.setState({ deathAt: performance.now() });
      if (g.phase === PHASE.GAMEOVER) next = 'over';
      else if (alive) next = 'seat';
      else if (me) next = 'ghost';
      else next = 'over';
    }

    if (next !== r.mode) {
      const prev = r.mode;
      r.mode = next;
      if (next === 'ghost') {
        // rise out of the body, keep looking where you were looking
        seatPoint(myIdx, g.players.length, LOCAL.eye, r.ghost).y += 0.3;
        _euler.setFromQuaternion(camera.quaternion, 'YXZ');
        r.gYaw = _euler.y;
        r.gPitch = _euler.x;
        clearGhosts();
      }
      if (next === 'seat') {
        r.offYaw = 0;
        r.offPitch = 0;
        r.duelKey = '';
      }
      if (next === 'menu' || next === 'over' || next === 'custom') unlockPointer();
      if (prev === 'ghost') clearGhosts();
      useStore.setState({ firstPersonId: next === 'seat' ? st.myId : null, ghost: next === 'ghost' });
    }

    const mouse = takeMouse();
    const wantFov = next === 'seat' ? (st.myId === (g.result?.shooterId ?? g.shooterId) ? 58 : st.myId === (g.result?.targetId ?? g.targetId) ? 40 : 55) : next === 'ghost' ? 65 : 42;
    if (Math.abs(camera.fov - wantFov) > 0.05) {
      camera.fov += (wantFov - camera.fov) * (1 - Math.exp(-dt * 4));
      camera.updateProjectionMatrix();
    }

    // gunshot shake (much harder when you're right there)
    const since = performance.now() - fx.shotAt;
    const shakeAmt = since < 900 ? Math.pow(1 - since / 900, 2) * (next === 'seat' ? 0.09 : 0.04) : 0;
    _v.set((Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt, (Math.random() - 0.5) * shakeAmt);

    if (next === 'seat') {
      const n = g.players.length;
      const sId = g.result?.shooterId ?? g.shooterId;
      const tId = g.result?.targetId ?? g.targetId;
      const inDuel = me.id === sId || me.id === tId;
      // What your eyes are drawn to: your opponent, or the person being aimed at.
      if (inDuel) seatPoint(idx.get(me.id === sId ? tId : sId), n, LOCAL.head, _look);
      else if (tId != null && idx.has(tId)) seatPoint(idx.get(tId), n, LOCAL.head, _look);
      else _look.set(0, 0.95, 0);
      seatPoint(myIdx, n, LOCAL.eye, _pos);
      _dir.subVectors(_look, _pos);
      const wantYaw = yawTo(_dir);
      const wantPitch = pitchTo(_dir);
      r.baseYaw += wrap(wantYaw - r.baseYaw) * (1 - Math.exp(-dt * 3));
      r.basePitch += (wantPitch - r.basePitch) * (1 - Math.exp(-dt * 3));

      // Your head snaps back to your opponent when a duel involving you begins.
      const duelKey = inDuel ? `${g.turn}:${me.id === sId ? 's' : 't'}` : '';
      if (duelKey && duelKey !== r.duelKey) r.recenter = 0.7;
      r.duelKey = duelKey;
      if (r.recenter > 0) {
        r.recenter -= dt;
        r.offYaw *= Math.exp(-dt * 6);
        r.offPitch *= Math.exp(-dt * 6);
      }

      r.offYaw -= mouse.x * sens;
      r.offPitch -= mouse.y * sens;
      // neck limits, measured from facing the table centre
      const seatYaw = yawTo(_dir.copy(_pos).negate().setY(0));
      const yaw = seatYaw + THREE.MathUtils.clamp(wrap(r.baseYaw + r.offYaw - seatYaw), -NECK_YAW, NECK_YAW);
      r.offYaw = wrap(yaw - r.baseYaw);
      const pitch = THREE.MathUtils.clamp(r.basePitch + r.offPitch, -1.0, 0.75);
      r.offPitch = pitch - r.basePitch;

      // Nerves: a tremor that builds through the stare and the trigger squeeze.
      let nerve = 0.15;
      if (inDuel && g.phase === PHASE.DECISION) nerve = 0.2 + Math.min(1, el / 25000) * 0.8;
      if (inDuel && g.phase === PHASE.RESOLVING && el < TIMING.trigger) nerve = 1 + (el / TIMING.trigger) * 1.5;
      const o = g.result?.outcome;
      if (me.id === sId && (o === OUTCOME.MISFIRE || o === OUTCOME.SURVIVED) && el > TIMING.selfAim && el < TIMING.selfShot) nerve = 2.5;
      const amp = 0.0022 * nerve;
      _euler.set(
        pitch + Math.sin(t * 9.7) * amp * 2 + Math.sin(t * 1.1) * 0.006,
        yaw + Math.sin(t * 7.3) * amp * 2.5 + Math.sin(t * 13.1) * amp,
        0,
        'YXZ',
      );
      camera.quaternion.setFromEuler(_euler);
      _pos.y += Math.sin(t * 1.5) * 0.004; // breathing
      camera.position.copy(_pos).add(_v);
      return;
    }

    if (next === 'ghost') {
      r.gYaw -= mouse.x * sens;
      r.gPitch = THREE.MathUtils.clamp(r.gPitch - mouse.y * sens, -1.5, 1.5);
      const fwd = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0);
      const side = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0);
      const up = (held('Space', 'KeyE') ? 1 : 0) - (held('ShiftLeft', 'ShiftRight', 'ControlLeft', 'KeyQ', 'KeyC') ? 1 : 0);
      const sy = Math.sin(r.gYaw);
      const cy = Math.cos(r.gYaw);
      r.ghost.x += (-sy * fwd + cy * side) * GHOST_SPEED * dt;
      r.ghost.z += (-cy * fwd - sy * side) * GHOST_SPEED * dt;
      r.ghost.y += up * GHOST_SPEED * dt;
      // stay in the room: a soft boundary around the table, floor to ceiling
      const h = Math.hypot(r.ghost.x, r.ghost.z);
      if (h > GHOST_RADIUS) {
        r.ghost.x *= GHOST_RADIUS / h;
        r.ghost.z *= GHOST_RADIUS / h;
      }
      r.ghost.y = THREE.MathUtils.clamp(r.ghost.y, 0.25, 3.8);
      camera.position.copy(r.ghost).add(_v);
      _euler.set(r.gPitch, r.gYaw, Math.sin(t * 0.7) * 0.02, 'YXZ'); // a slow, weightless sway
      camera.quaternion.setFromEuler(_euler);
      if (performance.now() - r.sentAt > 100) {
        r.sentAt = performance.now();
        session.sendGhost(r.ghost.toArray().map((v) => +v.toFixed(3)), +r.gYaw.toFixed(3));
      }
      return;
    }

    // orbits: menu / lobby / customise / game over
    let speed = 1.6;
    if (next === 'custom') {
      _pos.set(0, 1.5, 3);
      _look.set(0, 1, 0);
    } else if (next === 'over' && g?.winnerId && idx?.has(g.winnerId)) {
      seatPoint(idx.get(g.winnerId), g.players.length, LOCAL.head, _look);
      const a = t * 0.25;
      _pos.set(_look.x + Math.cos(a) * 1.6, _look.y + 0.25, _look.z + Math.sin(a) * 1.6);
    } else {
      const a = t * 0.06 + 0.6;
      _pos.set(Math.cos(a) * 4.4, 2.3, Math.sin(a) * 4.4);
      _look.set(0, 0.9, 0);
    }
    const k = 1 - Math.exp(-dt * speed);
    camera.position.lerp(_pos, k);
    camera.lookAt(_look);
  });
  return null;
}

function Effects() {
  const quality = useStore((s) => s.settings.quality);
  if (quality === 'off') return null;
  // Depth of field was removed: on integrated GPUs it halved the frame rate.
  if (quality === 'high') {
    return (
      <EffectComposer multisampling={0}>
        <SMAA />
        <Bloom luminanceThreshold={0.88} luminanceSmoothing={0.12} intensity={1.1} mipmapBlur />
        <ChromaticAberration offset={[0.0006, 0.0006]} radialModulation modulationOffset={0.4} />
        <Noise opacity={0.08} blendFunction={BlendFunction.OVERLAY} />
        <Vignette offset={0.22} darkness={0.95} />
      </EffectComposer>
    );
  }
  if (quality === 'balanced') {
    return (
      <EffectComposer multisampling={0}>
        <Bloom luminanceThreshold={0.88} luminanceSmoothing={0.12} intensity={0.9} resolutionScale={0.5} />
        <Noise opacity={0.08} blendFunction={BlendFunction.OVERLAY} />
        <Vignette offset={0.22} darkness={0.95} />
      </EffectComposer>
    );
  }
  return (
    <EffectComposer multisampling={0}>
      <Noise opacity={0.07} blendFunction={BlendFunction.OVERLAY} />
      <Vignette offset={0.22} darkness={0.95} />
    </EffectComposer>
  );
}

export function SceneCanvas() {
  const players = useTablePlayers();
  const ghost = useStore((s) => s.ghost);
  const quality = useStore((s) => s.settings.quality);
  // Render resolution adapts to the frame rate (PerformanceMonitor below).
  // Resolution follows a pixel budget, not the screen's scaling factor: a big
  // window on a laptop GPU otherwise renders 2.5M+ pixels a frame.
  const budget = quality === 'high' ? 2.2e6 : quality === 'balanced' ? 1.2e6 : 0.8e6;
  const fit = Math.sqrt(budget / (window.innerWidth * window.innerHeight));
  const maxDpr = Math.max(0.6, Math.min(window.devicePixelRatio || 1, 1.5, fit));
  const [dpr, setDpr] = useState(maxDpr);
  return (
    <Canvas
      shadows
      dpr={dpr}
      camera={{ position: [3.5, 2.2, 3.5], fov: 42, near: 0.05, far: 40 }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}
      onCreated={(state) => {
        if (import.meta.env.DEV) window.__r3f = state; // probing from devtools
      }}
    >
      <PerformanceMonitor
        bounds={() => [45, 58]}
        onDecline={() => setDpr((d) => Math.max(0.6, +(d - 0.15).toFixed(2)))}
        onIncline={() => setDpr((d) => Math.min(maxDpr, +(d + 0.15).toFixed(2)))}
      />
      <Suspense fallback={null}>
        <Room quality={quality} />
        {players.length ? (
          players.map((p, i) => <SeatedPlayer key={p.id} player={p} index={i} n={players.length} />)
        ) : (
          <EmptyChairs />
        )}
        <GunController players={players} />
      </Suspense>
      <TargetLight />
      <FeedScreens />
      <Cues />
      <CameraRig />
      {ghost && <Ghosts />}
      <Effects />
    </Canvas>
  );
}
