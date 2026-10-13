// The bar: textured floor/walls/table (CC0 Poly Haven), back bar with instanced
// bottles, a single shadow-casting lamp with a fake volumetric cone, and smoke.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Sparkles, Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';
import { TABLE_HEIGHT, TABLE_RADIUS } from './layout.js';
import { sinceShot } from './fx.js';
import { usePBR, smokeTexture } from './materials.js';
import { useStore } from '../store.js';

const LAMP_Y = 2.55;

function mulberry(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- shell ----------

function Shell() {
  const floor = usePBR('old_wood_floor', [5, 5]);
  const wall = usePBR('decrepit_wallpaper', [7, 1.6]);
  const panel = usePBR('dark_wood', [10, 0.6]);
  const rug = usePBR('dirty_carpet', [3, 3], { normalScale: 1.5 });
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[6.5, 48]} />
        <meshStandardMaterial {...floor} color="#7a6250" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, 0]} receiveShadow>
        <circleGeometry args={[2.7, 64]} />
        <meshStandardMaterial {...rug} color="#6a1d18" />
      </mesh>
      {/* walls: wallpaper above, dark wood wainscot below */}
      <mesh position={[0, 2.6, 0]}>
        <cylinderGeometry args={[6.4, 6.4, 3.2, 40, 1, true]} />
        <meshStandardMaterial {...wall} color="#6b5444" side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[6.38, 6.38, 1.0, 40, 1, true]} />
        <meshStandardMaterial {...panel} color="#5a3a26" side={THREE.BackSide} />
      </mesh>
      <mesh position={[0, 1.02, 0]}>
        <torusGeometry args={[6.34, 0.035, 6, 64]} />
        <meshStandardMaterial color="#1e120a" roughness={0.4} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 4.2, 0]}>
        <circleGeometry args={[6.5, 32]} />
        <meshStandardMaterial color="#0c0806" roughness={1} />
      </mesh>
    </>
  );
}

// ---------- table ----------

function Table() {
  const top = usePBR('wood_table_worn', [1.5, 1.5]);
  const dark = usePBR('dark_wood', [2, 1]);
  const felt = usePBR('dirty_carpet', [2.5, 2.5], { normalScale: 0.6 });
  return (
    <group>
      <mesh position={[0, TABLE_HEIGHT - 0.035, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[TABLE_RADIUS, TABLE_RADIUS - 0.03, 0.07, 64]} />
        <meshStandardMaterial {...top} color="#8a6448" />
      </mesh>
      {/* padded leather rail */}
      <mesh position={[0, TABLE_HEIGHT + 0.005, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
        <torusGeometry args={[TABLE_RADIUS - 0.05, 0.05, 12, 64]} />
        <meshStandardMaterial color="#1a0d08" roughness={0.35} />
      </mesh>
      <mesh position={[0, TABLE_HEIGHT + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[TABLE_RADIUS - 0.1, 64]} />
        <meshStandardMaterial map={felt.map} normalMap={felt.normalMap} normalScale={felt.normalScale} color="#1d4a2c" roughness={0.95} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.13, 0.76, 20]} />
        <meshStandardMaterial {...dark} color="#4a2e1c" />
      </mesh>
      <mesh position={[0, 0.035, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.58, 0.07, 32]} />
        <meshStandardMaterial {...dark} color="#3a2416" />
      </mesh>
      {/* props: shot glasses, ashtray with a smouldering butt, scattered rounds */}
      {[0.5, 2.3, 4.2].map((a, i) => (
        <mesh key={i} position={[Math.cos(a) * 0.78, TABLE_HEIGHT + 0.04, Math.sin(a) * 0.78]} castShadow>
          <cylinderGeometry args={[0.032, 0.026, 0.07, 16]} />
          <meshStandardMaterial color="#c9a46a" transparent opacity={0.45} roughness={0.05} metalness={0.1} />
        </mesh>
      ))}
      <group position={[0.42, TABLE_HEIGHT + 0.015, -0.38]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.085, 0.075, 0.03, 20]} />
          <meshStandardMaterial color="#2a2a2c" metalness={0.8} roughness={0.35} />
        </mesh>
        <mesh position={[0.03, 0.02, 0]} rotation={[0, 0.4, Math.PI / 2]}>
          <cylinderGeometry args={[0.007, 0.007, 0.05, 8]} />
          <meshStandardMaterial color="#d8cfc0" />
        </mesh>
        <mesh position={[0.055, 0.02, 0.01]}>
          <sphereGeometry args={[0.006, 8, 6]} />
          <meshBasicMaterial color="#ff5a1a" toneMapped={false} />
        </mesh>
      </group>
      {[[-0.35, 0.3, 0.3], [-0.42, 0.24, 1.9], [0.3, -0.5, 0.9]].map(([x, z, r], i) => (
        <mesh key={i} position={[x, TABLE_HEIGHT + 0.01, z]} rotation={[0, r, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.0075, 0.0075, 0.04, 10]} />
          <meshStandardMaterial color="#b8893a" metalness={0.9} roughness={0.25} />
        </mesh>
      ))}
    </group>
  );
}

// ---------- back bar ----------

function Bottles() {
  const ref = useRef();
  const items = useMemo(() => {
    const rnd = mulberry(7);
    const colors = ['#2f5a22', '#7a3a10', '#a07a2a', '#2a4a6a', '#6a1414', '#d8c89a', '#1a1a1a'];
    const out = [];
    for (let shelf = 0; shelf < 3; shelf++) {
      for (let i = 0; i < 17; i++) {
        out.push({
          x: -3.2 + i * 0.4 + rnd() * 0.12,
          y: 1.22 + shelf * 0.55,
          h: 0.22 + rnd() * 0.16,
          r: 0.04 + rnd() * 0.025,
          color: colors[Math.floor(rnd() * colors.length)],
        });
      }
    }
    return out;
  }, []);
  useEffect(() => {
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    items.forEach((b, i) => {
      m.compose(new THREE.Vector3(b.x, b.y + b.h / 2, 0.1), new THREE.Quaternion(), new THREE.Vector3(b.r / 0.05, b.h / 0.3, b.r / 0.05));
      ref.current.setMatrixAt(i, m);
      ref.current.setColorAt(i, c.set(b.color));
    });
    ref.current.instanceMatrix.needsUpdate = true;
    ref.current.instanceColor.needsUpdate = true;
  }, [items]);
  const dark = usePBR('dark_wood', [6, 1]);
  return (
    <group position={[0, 0, -5.1]} scale={[0.85, 1, 1]}>
      <mesh position={[0, 0.55, 1.1]} castShadow receiveShadow>
        <boxGeometry args={[8, 1.1, 0.8]} />
        <meshStandardMaterial {...dark} color="#4a2e1c" />
      </mesh>
      <mesh position={[0, 1.12, 1.1]}>
        <boxGeometry args={[8.1, 0.06, 0.9]} />
        <meshStandardMaterial color="#160b05" roughness={0.15} />
      </mesh>
      {[0, 1, 2].map((s) => (
        <mesh key={s} position={[0, 1.2 + s * 0.55, 0.1]}>
          <boxGeometry args={[7.6, 0.04, 0.35]} />
          <meshStandardMaterial {...dark} color="#3a2416" />
        </mesh>
      ))}
      <instancedMesh ref={ref} args={[null, null, items.length]}>
        <cylinderGeometry args={[0.03, 0.05, 0.3, 10]} />
        <meshStandardMaterial roughness={0.08} metalness={0.2} transparent opacity={0.82} emissive="#331400" emissiveIntensity={0.2} />
      </instancedMesh>
      {/* back-lit shelf strips */}
      {[0, 1, 2].map((s) => (
        <mesh key={s} position={[0, 1.235 + s * 0.55, -0.06]}>
          <boxGeometry args={[7.6, 0.012, 0.012]} />
          <meshBasicMaterial color="#ff8a3a" toneMapped={false} />
        </mesh>
      ))}
      {/* red exit sign */}
      <mesh position={[3.4, 3.2, 0.3]}>
        <boxGeometry args={[0.5, 0.18, 0.04]} />
        <meshBasicMaterial color="#ff2010" toneMapped={false} />
      </mesh>
    </group>
  );
}

// ---------- lamp, light cone, smoke ----------

const coneShader = {
  uniforms: { uColor: { value: new THREE.Color('#ffc890') }, uStrength: { value: 0.03 } },
  vertexShader: /* glsl */ `
    varying float vY; varying vec3 vN; varying vec3 vView;
    void main() {
      vY = uv.y;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vView = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor; uniform float uStrength;
    varying float vY; varying vec3 vN; varying vec3 vView;
    void main() {
      float edge = pow(abs(dot(vN, vView)), 3.0);   // fade at silhouette edges
      float fall = pow(vY, 1.6);                   // fade towards the floor (uv.y=0)
      gl_FragColor = vec4(uColor, edge * fall * uStrength);
    }`,
};

function Lamp({ shadowSize = 1024 }) {
  const spot = useRef();
  const swing = useRef();
  const cone = useRef();
  const power = useRef(1); // Murder!: the lamp dies during a blackout
  const target = useMemo(() => {
    const o = new THREE.Object3D();
    o.position.set(0, 0, 0);
    return o;
  }, []);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const flicker = 0.94 + Math.sin(t * 13) * 0.02 + Math.sin(t * 31.7) * 0.015 + (Math.random() < 0.004 ? -0.35 : 0);
    const shot = sinceShot();
    const boost = shot < 160 ? 2.2 : 1;
    const st = useStore.getState();
    const g = st.screen === 'game' && st.game?.mode === 'murder' ? st.game : null;
    const dark = g?.dark;
    // the murderer sees in the dark: for them the room only dims a little
    const killerEyes = dark && g.murdererId === st.myId && !st.ghost;
    // off: instantly (a breaker trips); on: a stuttering catch
    power.current = killerEyes ? 0.7 : dark ? 0.04 : power.current < 1 ? Math.min(1, power.current + 0.02 + (Math.random() < 0.15 ? 0.3 : 0)) : 1;
    spot.current.intensity = 62 * flicker * boost * power.current;
    if (cone.current) cone.current.material.uniforms.uStrength.value = 0.03 * flicker * power.current;
    swing.current.rotation.z = Math.sin(t * 0.6) * 0.02 + (shot < 1800 ? Math.sin(shot / 95) * 0.07 * (1 - shot / 1800) : 0);
    swing.current.rotation.x = Math.sin(t * 0.43) * 0.012;
  });
  return (
    <group ref={swing} position={[0, 4.2, 0]}>
      <primitive object={target} position={[0, -4.2, 0]} />
      <mesh position={[0, -(4.2 - LAMP_Y) / 2, 0]}>
        <cylinderGeometry args={[0.006, 0.006, 4.2 - LAMP_Y, 6]} />
        <meshStandardMaterial color="#111" />
      </mesh>
      <group position={[0, -(4.2 - LAMP_Y), 0]}>
        <mesh>
          <coneGeometry args={[0.42, 0.28, 32, 1, true]} />
          <meshStandardMaterial color="#1f3322" side={THREE.FrontSide} roughness={0.4} metalness={0.6} />
        </mesh>
        <mesh>
          <coneGeometry args={[0.415, 0.278, 32, 1, true]} />
          <meshStandardMaterial color="#fff0d8" emissive="#ffcf90" emissiveIntensity={0.6} side={THREE.BackSide} />
        </mesh>
        <mesh position={[0, -0.08, 0]}>
          <sphereGeometry args={[0.065, 16, 12]} />
          <meshBasicMaterial color="#ffe2b0" toneMapped={false} />
        </mesh>
        <spotLight
          ref={spot}
          position={[0, -0.1, 0]}
          target={target}
          angle={1.08}
          penumbra={0.55}
          color="#ffb46b"
          intensity={55}
          distance={7}
          decay={2}
          castShadow
          shadow-mapSize={[shadowSize, shadowSize]}
          shadow-bias={-0.0004}
          shadow-normalBias={0.02}
          shadow-camera-near={0.3}
          shadow-camera-far={5}
        />
        {/* fake volumetric beam */}
        <mesh ref={cone} position={[0, -1.3, 0]} renderOrder={2}>
          <cylinderGeometry args={[0.4, 2.3, 2.45, 40, 1, true]} />
          <shaderMaterial
            args={[coneShader]}
            transparent
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            side={THREE.FrontSide}
          />
        </mesh>
      </group>
    </group>
  );
}

function Smoke() {
  const group = useRef();
  const puffs = useMemo(() => {
    const rnd = mulberry(11);
    // Hangs in the lamp light above head height, not between camera and faces.
    return Array.from({ length: 9 }, () => {
      const a = rnd() * Math.PI * 2;
      const r = rnd() * 1.1;
      return {
        x: Math.cos(a) * r,
        y: 1.95 + rnd() * 0.5,
        z: Math.sin(a) * r,
        s: 0.7 + rnd() * 0.7,
        speed: 0.03 + rnd() * 0.04,
        spin: (rnd() - 0.5) * 0.1,
        phase: rnd() * 10,
      };
    });
  }, []);
  const tex = useMemo(() => smokeTexture(), []);
  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    group.current.children.forEach((m, i) => {
      const p = puffs[i];
      m.position.set(p.x + Math.sin(t * p.speed + p.phase) * 0.35, p.y + Math.sin(t * 0.1 + p.phase) * 0.1, p.z + Math.cos(t * p.speed + p.phase) * 0.35);
      m.quaternion.copy(camera.quaternion);
      m.rotateZ(t * p.spin + p.phase);
      // fade out anything drifting close to the lens
      const d = camera.position.distanceTo(m.position);
      m.material.opacity = 0.16 * THREE.MathUtils.clamp((d - 0.9) / 1.2, 0, 1);
    });
  });
  return (
    <group ref={group}>
      {puffs.map((p, i) => (
        <mesh key={i} scale={p.s} renderOrder={3}>
          <planeGeometry />
          <meshBasicMaterial map={tex} color="#e0b890" transparent opacity={0.16} depthWrite={false} fog={false} />
        </mesh>
      ))}
    </group>
  );
}

export function Room({ quality = 'high' }) {
  return (
    <>
      <color attach="background" args={['#070403']} />
      <fog attach="fog" args={['#070403', 5, 13]} />
      <ambientLight intensity={0.06} color="#ffcf9a" />
      <hemisphereLight args={['#5a3418', '#0a0503', 0.35]} />
      {/* Reflections only, rendered once: makes metal, glass and varnish read as real. */}
      <Environment resolution={quality === 'lite' ? 32 : 64} frames={1} environmentIntensity={0.35}>
        <Lightformer form="circle" intensity={6} color="#ffc890" position={[0, 3, 0]} rotation-x={Math.PI / 2} scale={2} />
        <Lightformer form="rect" intensity={1.5} color="#ff7a30" position={[0, 1.5, -5]} scale={[8, 1, 1]} />
        <Lightformer form="rect" intensity={0.4} color="#ff2a10" position={[5, 2, 2]} rotation-y={-Math.PI / 2} scale={[3, 2, 1]} />
      </Environment>
      <Shell />
      <Bottles />
      <Lamp key={quality} shadowSize={quality === 'high' ? 1024 : 512} />
      <Table />
      {quality === 'high' && <Smoke />}
      {quality !== 'lite' && <Sparkles count={quality === 'low' ? 30 : 70} scale={[4, 2.5, 4]} position={[0, 1.6, 0]} size={1.4} speed={0.12} opacity={0.4} color="#ffd9a8" />}
    </>
  );
}
