// Other dead players, drawn only for you when you're dead too. Their positions
// come from the server, which relays ghost movement to dead players only.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { useStore } from '../store.js';

/** id -> { target: Vector3, yaw, at } — written by the network handler. */
export const ghostPoses = new Map();

export function receiveGhost({ id, p, yaw }) {
  if (!Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)) return;
  const known = ghostPoses.get(id);
  if (known) {
    known.target.fromArray(p);
    known.yaw = Number(yaw) || 0;
    known.at = performance.now();
  } else {
    ghostPoses.set(id, { target: new THREE.Vector3().fromArray(p), yaw: Number(yaw) || 0, at: performance.now() });
    useStore.setState((s) => ({ ghostIds: [...new Set([...s.ghostIds, id])] }));
  }
}

export function clearGhosts() {
  ghostPoses.clear();
  useStore.setState({ ghostIds: [] });
}

const ghostMat = () =>
  new THREE.MeshBasicMaterial({
    color: '#bfe4ff',
    transparent: true,
    opacity: 0.32,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });

function GhostFigure({ id }) {
  const group = useRef();
  const mats = useMemo(() => [ghostMat(), ghostMat()], []);
  const name = useStore((s) => s.game?.players.find((p) => p.id === id)?.name ?? '');
  const placed = useRef(false);
  useFrame(({ clock }, delta) => {
    const g = ghostPoses.get(id);
    const live = g && performance.now() - g.at < 3000;
    group.current.visible = !!live;
    if (!live) return;
    if (!placed.current) {
      group.current.position.copy(g.target);
      placed.current = true;
    }
    group.current.position.lerp(g.target, 1 - Math.exp(-Math.min(delta, 0.05) * 8));
    group.current.rotation.y = g.yaw;
    const t = clock.elapsedTime;
    const flicker = 0.26 + Math.sin(t * 3 + id.length) * 0.05 + (Math.random() < 0.02 ? -0.12 : 0);
    mats[0].opacity = flicker;
    mats[1].opacity = flicker * 0.7;
  });
  return (
    <group ref={group} visible={false}>
      {/* head at the camera point, a body that thins into a wisp below */}
      <mesh material={mats[0]}>
        <sphereGeometry args={[0.15, 20, 16]} />
      </mesh>
      <mesh material={mats[1]} position={[0, -0.48, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.22, 0.75, 20, 1, true]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.05, 0.02, -0.13]}>
          <sphereGeometry args={[0.022, 8, 6]} />
          <meshBasicMaterial color="#05080c" />
        </mesh>
      ))}
      <Html position={[0, 0.3, 0]} center distanceFactor={3.2} style={{ pointerEvents: 'none' }}>
        <div className="tag ghost-tag">
          <span className="tag-name">{name}</span>
          <span className="tag-role">ghost</span>
        </div>
      </Html>
    </group>
  );
}

export function Ghosts() {
  const ids = useStore((s) => s.ghostIds);
  const myId = useStore((s) => s.myId);
  return ids.filter((id) => id !== myId).map((id) => <GhostFigure key={id} id={id} />);
}
