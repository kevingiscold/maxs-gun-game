// Revolver built from an extruded side profile. Barrel points along local +z so
// Object3D.lookAt aims it.
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fx } from './fx.js';
import { usePBR } from './materials.js';

const PI = Math.PI;

/** Side profile (x = forward, y = up) extruded `depth` wide, re-oriented so forward is +z. */
function profile(points, depth, bevel = 0.003) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 6,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-PI / 2);
  g.computeVertexNormals();
  return g;
}

const FRAME = profile(
  [
    [-0.05, 0.026], [0.045, 0.026], [0.05, 0.02], [0.05, -0.012], [0.028, -0.016],
    [-0.012, -0.016], [-0.028, -0.034], [-0.036, -0.03], [-0.048, -0.01], [-0.06, 0.012], [-0.058, 0.026],
  ],
  0.026,
);
const GRIP = profile(
  [
    [-0.03, -0.028], [-0.04, -0.06], [-0.048, -0.1], [-0.055, -0.122], [-0.075, -0.128], [-0.094, -0.12],
    [-0.088, -0.09], [-0.072, -0.045], [-0.062, -0.012], [-0.05, -0.008],
  ],
  0.034,
  0.006,
);
const HAMMER = profile(
  [[0, 0], [0.012, 0], [0.006, 0.02], [-0.012, 0.03], [-0.016, 0.026], [-0.004, 0.014]],
  0.008,
  0.0015,
);
const TRIGGER = profile([[0, 0], [0.004, 0], [-0.002, -0.018], [-0.008, -0.022], [-0.006, -0.016]], 0.005, 0.001);

export function RevolverModel({ drumRef, flashRef, hammerRef }) {
  const wood = usePBR('dark_wood', [0.2, 0.3]);
  const mats = useMemo(
    () => ({
      steel: new THREE.MeshPhysicalMaterial({ color: '#202227', metalness: 1, roughness: 0.27, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
      drum: new THREE.MeshPhysicalMaterial({ color: '#2a2c31', metalness: 1, roughness: 0.22, clearcoat: 0.5 }),
      bore: new THREE.MeshBasicMaterial({ color: '#000' }),
      brass: new THREE.MeshStandardMaterial({ color: '#b8893a', metalness: 1, roughness: 0.3 }),
    }),
    [],
  );
  return (
    <group scale={1.35}>
      <mesh geometry={FRAME} material={mats.steel} castShadow />
      <mesh geometry={GRIP} castShadow>
        <meshStandardMaterial {...wood} color="#8a4a26" roughness={0.45} />
      </mesh>
      {/* grip screw */}
      <mesh position={[0.018, -0.07, -0.062]} rotation={[0, 0, PI / 2]} material={mats.steel}>
        <cylinderGeometry args={[0.004, 0.004, 0.003, 10]} />
      </mesh>
      {/* barrel, top rib, ejector housing, front sight, bore */}
      <mesh position={[0, 0.014, 0.135]} rotation={[PI / 2, 0, 0]} material={mats.steel} castShadow>
        <cylinderGeometry args={[0.0105, 0.012, 0.17, 20]} />
      </mesh>
      <mesh position={[0, 0.025, 0.13]} material={mats.steel}>
        <boxGeometry args={[0.008, 0.007, 0.17]} />
      </mesh>
      <mesh position={[0, -0.003, 0.11]} rotation={[PI / 2, 0, 0]} material={mats.steel}>
        <cylinderGeometry args={[0.0062, 0.0062, 0.12, 12]} />
      </mesh>
      <mesh position={[0, 0.031, 0.212]} material={mats.steel}>
        <boxGeometry args={[0.003, 0.009, 0.012]} />
      </mesh>
      <mesh position={[0, 0.014, 0.2205]} material={mats.bore}>
        <circleGeometry args={[0.0058, 16]} />
      </mesh>
      {/* cylinder (spins): six chambers, flutes, brass case heads at the back */}
      <group ref={drumRef} position={[0, 0.004, 0.025]}>
        <mesh rotation={[PI / 2, 0, 0]} material={mats.drum} castShadow>
          <cylinderGeometry args={[0.03, 0.03, 0.058, 24]} />
        </mesh>
        {Array.from({ length: 6 }, (_, i) => {
          const a = (i * PI) / 3;
          const b = a + PI / 6;
          return (
            <group key={i}>
              <mesh position={[Math.cos(b) * 0.029, Math.sin(b) * 0.029, 0]} rotation={[0, 0, b]}>
                <boxGeometry args={[0.006, 0.009, 0.042]} />
                <meshStandardMaterial color="#0d0e10" metalness={1} roughness={0.4} />
              </mesh>
              <mesh position={[Math.cos(a) * 0.018, Math.sin(a) * 0.018, 0.0295]} rotation={[PI / 2, 0, 0]} material={mats.bore}>
                <cylinderGeometry args={[0.0055, 0.0055, 0.002, 10]} />
              </mesh>
              <mesh position={[Math.cos(a) * 0.018, Math.sin(a) * 0.018, -0.0295]} rotation={[PI / 2, 0, 0]} material={mats.brass}>
                <cylinderGeometry args={[0.0062, 0.0062, 0.002, 10]} />
              </mesh>
            </group>
          );
        })}
      </group>
      {/* hammer pivots at the back of the frame */}
      <group ref={hammerRef} position={[0, 0.018, -0.05]}>
        <mesh geometry={HAMMER} material={mats.steel} />
      </group>
      {/* trigger guard + trigger */}
      <mesh position={[0, -0.03, 0.006]} rotation={[0, PI / 2, 0]} material={mats.steel}>
        <torusGeometry args={[0.022, 0.0035, 8, 20, PI]} />
      </mesh>
      <mesh geometry={TRIGGER} position={[0, -0.012, 0.008]} material={mats.steel} />
      {/* muzzle flash */}
      <group ref={flashRef} position={[0, 0.014, 0.23]} visible={false}>
        <mesh rotation={[PI / 2, 0, 0]} position={[0, 0, 0.06]}>
          <coneGeometry args={[0.055, 0.16, 12, 1, true]} />
          <meshBasicMaterial color="#ffd27a" transparent opacity={0.9} toneMapped={false} side={THREE.DoubleSide} />
        </mesh>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, 0, (i * PI) / 4]} position={[0, 0, 0.02]}>
            <planeGeometry args={[0.16, 0.02]} />
            <meshBasicMaterial color="#ffb040" transparent opacity={0.8} toneMapped={false} side={THREE.DoubleSide} />
          </mesh>
        ))}
        <mesh>
          <sphereGeometry args={[0.045, 10, 8]} />
          <meshBasicMaterial color="#fff6d0" toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

// Centre of the wooden grip in the gun's local space (model is scaled 1.35).
const GRIP_LOCAL = new THREE.Vector3(0, -0.062, -0.068).multiplyScalar(1.35);
const _target = new THREE.Object3D();
const _kick = new THREE.Quaternion();
const _xAxis = new THREE.Vector3(1, 0, 0);

/**
 * @param getPose () => ({ position, lookAt|rotation, spin, tremble }) evaluated
 * every frame so the animation stays locked to phase time.
 */
export function Revolver({ getPose }) {
  const group = useRef();
  const drum = useRef();
  const flash = useRef();
  const hammer = useRef();
  const light = useRef();
  const base = useMemo(() => new THREE.Quaternion(), []);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const pose = getPose();
    if (!pose || !group.current) return;
    const g = group.current;

    _target.position.copy(pose.position);
    if (pose.lookAt) _target.lookAt(pose.lookAt);
    else if (pose.rotation) _target.rotation.copy(pose.rotation);

    const k = 1 - Math.exp(-dt * 3.2);
    g.position.lerp(_target.position, k);
    base.slerp(_target.quaternion, k);

    // Recoil kick after a gunshot, plus a nervous tremble while aiming.
    const now = performance.now();
    const since = now - fx.shotAt;
    const kick = since < 400 ? Math.exp(-since / 90) * 0.6 : 0;
    const tremble = pose.tremble ? Math.sin(now / 37) * 0.004 + Math.sin(now / 53) * 0.003 : 0;
    _kick.setFromAxisAngle(_xAxis, -kick + tremble);
    g.quaternion.copy(base).multiply(_kick);

    // tell the holder's arm where to put the hand
    fx.gripHolder = pose.holderId ?? null;
    fx.grip.copy(GRIP_LOCAL).applyQuaternion(g.quaternion).add(g.position);

    if (drum.current) drum.current.rotation.z += dt * 22 * (pose.spin || 0);
    // Hammer: cocked while the gun is up, snaps forward on the trigger pull.
    if (hammer.current) {
      const fired = now - Math.max(fx.shotAt, fx.clickAt) < 400;
      const cocked = (pose.tremble || pose.spin) && !fired;
      const want = cocked ? -0.7 : 0;
      hammer.current.rotation.x += (want - hammer.current.rotation.x) * (fired ? 1 : 1 - Math.exp(-dt * 10));
    }
    flash.current.visible = since < 60;
    if (flash.current.visible) flash.current.rotation.z = Math.random() * PI;
    if (light.current) light.current.intensity = since < 120 ? 90 * (1 - since / 120) : 0;
  });

  return (
    <group ref={group}>
      <RevolverModel drumRef={drum} flashRef={flash} hammerRef={hammer} />
      <pointLight ref={light} position={[0, 0.03, 0.4]} color="#ffb060" distance={7} decay={2} intensity={0} />
    </group>
  );
}
