// Procedural seated character built from primitives. Faces +z; right hand is -x.
// Pose is driven by springs so deaths overshoot and settle ("ragdoll-lite").
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { usePBR } from './materials.js';
import { fx } from './fx.js';
import { solveArm, UPPER, LOWER } from './ik.js';

const PI = Math.PI;

function Mat({ color, rough = 0.8, ...rest }) {
  return <meshStandardMaterial color={color} roughness={rough} metalness={0} {...rest} />;
}

// ---------- face parts ----------

function Eyes({ shape, color, skin }) {
  const scale = { round: [1, 1, 0.6], narrow: [1.15, 0.5, 0.6], wide: [1.25, 1.25, 0.6], sleepy: [1.05, 0.8, 0.6] }[shape];
  const refs = [useRef(), useRef()];
  const next = useRef(1 + Math.random() * 4);
  useFrame(({ clock }) => {
    // blink every 2–6 s, ~130 ms
    const t = clock.elapsedTime;
    if (t > next.current + 0.13) next.current = t + 2 + Math.random() * 4;
    const k = t > next.current ? 0.08 : 1;
    for (const r of refs) if (r.current) r.current.scale.y = k;
  });
  return (
    <>
      {[-1, 1].map((s, i) => (
        <group key={s} ref={refs[i]} position={[s * 0.055, 0.02, 0.122]}>
          <mesh scale={scale}>
            <sphereGeometry args={[0.028, 16, 12]} />
            <Mat color="#f2ece2" rough={0.3} />
          </mesh>
          <mesh position={[0, 0, 0.014]} scale={[1, shape === 'narrow' ? 0.6 : 1, 0.5]}>
            <sphereGeometry args={[0.016, 12, 10]} />
            <Mat color={color} rough={0.2} />
          </mesh>
          <mesh position={[0, 0, 0.02]} scale={[1, 1, 0.4]}>
            <sphereGeometry args={[0.008, 8, 8]} />
            <Mat color="#050505" rough={0.1} />
          </mesh>
          {shape === 'sleepy' && (
            <mesh position={[0, 0.012, 0.004]} rotation={[-0.25, 0, 0]}>
              <sphereGeometry args={[0.031, 14, 8, 0, PI * 2, 0, PI * 0.42]} />
              <Mat color={skin} />
            </mesh>
          )}
        </group>
      ))}
    </>
  );
}

function Brows({ type, color }) {
  if (type === 'none') return null;
  const h = type === 'thick' ? 0.022 : 0.012;
  const y = type === 'raised' ? 0.09 : 0.072;
  return (
    <>
      {[-1, 1].map((s) => {
        // s=+1 is the avatar's left brow; "angry" tilts the inner ends down
        const tilt = type === 'angry' ? -s * 0.38 : type === 'raised' ? s * 0.2 : 0;
        return (
          <mesh key={s} position={[s * 0.055, y, 0.137]} rotation={[0, 0, tilt]}>
            <boxGeometry args={[0.052, h, 0.014]} />
            <Mat color={color} />
          </mesh>
        );
      })}
    </>
  );
}

function Mouth({ type }) {
  const lip = '#6a2f2a';
  const pos = [0, -0.068, 0.133];
  switch (type) {
    case 'smile':
      return (
        <mesh position={[0, -0.058, 0.13]} rotation={[0, 0, PI]}>
          <torusGeometry args={[0.03, 0.006, 6, 16, PI]} />
          <Mat color={lip} />
        </mesh>
      );
    case 'frown':
      return (
        <mesh position={[0, -0.085, 0.128]}>
          <torusGeometry args={[0.028, 0.006, 6, 16, PI]} />
          <Mat color={lip} />
        </mesh>
      );
    case 'smirk':
      return (
        <mesh position={[0.008, -0.066, 0.133]} rotation={[0, 0, 0.22]}>
          <boxGeometry args={[0.055, 0.009, 0.01]} />
          <Mat color={lip} />
        </mesh>
      );
    case 'open':
      return (
        <mesh position={pos} scale={[1, 0.65, 0.4]}>
          <sphereGeometry args={[0.026, 14, 10]} />
          <Mat color="#1d0a08" />
        </mesh>
      );
    default:
      return (
        <mesh position={pos}>
          <boxGeometry args={[0.058, 0.009, 0.01]} />
          <Mat color={lip} />
        </mesh>
      );
  }
}

/**
 * Baseball cap, shaped to the head: the crown is an ellipsoid fitted over the
 * skull (sits above the brows at the front, lower at the back), with a
 * sweatband to hide the seam, six-panel seams, a top button and a curved brim.
 */
export const CAP = { y: 0.056, tilt: -0.3, r: [0.158, 0.112, 0.166] };
const CAP_RED = '#5a1f1f';
function Cap() {
  const [rx, ry, rz] = CAP.r;
  return (
    <group position={[0, CAP.y, 0]} rotation={[CAP.tilt, 0, 0]}>
      <mesh castShadow scale={[rx, ry, rz]}>
        <sphereGeometry args={[1, 32, 14, 0, PI * 2, 0, PI / 2]} />
        <Mat color={CAP_RED} rough={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* sweatband: a short open cylinder round the rim, hiding where cap meets head */}
      <mesh scale={[rx, 1, rz]} position={[0, 0.006, 0]}>
        <cylinderGeometry args={[1.015, 1.015, 0.014, 40, 1, true]} />
        <Mat color="#3e1515" rough={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* panel seams, following the crown */}
      <group scale={[rx, ry, rz]}>
        {[0, 1, 2].map((i) => (
          <mesh key={i} rotation={[0, (i * PI) / 3, 0]}>
            <torusGeometry args={[1.006, 0.02, 4, 40, PI]} />
            <Mat color="#3e1515" rough={0.9} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, ry - 0.002, 0]} scale={[1, 0.5, 1]}>
        <sphereGeometry args={[0.012, 10, 8]} />
        <Mat color="#3e1515" rough={0.9} />
      </mesh>
      {/* brim: the front half of a flat disc, slightly drooped */}
      <group position={[0, 0.004, rz * 0.74]} rotation={[0.16, 0, 0]}>
        <mesh castShadow scale={[1, 1, 0.78]}>
          <cylinderGeometry args={[0.122, 0.122, 0.008, 28, 1, false, -PI / 2, PI]} />
          <Mat color="#4a1818" rough={0.8} />
        </mesh>
      </group>
    </group>
  );
}

/** What still shows of each hairstyle under a cap: below the rim, never through it. */
function HairUnderCap({ type, color }) {
  if (type === 'bald') return null;
  // a trimmed band round the sides and back (front left open for the face)
  // `open` = how much of the front (either side of the face) is left bare
  const band = (r, from, to, k = 0, open = PI / 3) => (
    <mesh key={k} scale={[0.96, 1.04, 1]}>
      <sphereGeometry args={[r, 28, 6, PI / 2 + open, 2 * PI - 2 * open, from, to - from]} />
      <Mat color={color} rough={0.95} />
    </mesh>
  );
  // Bands tilt with the cap so they tuck under its rim all the way round.
  // Ranges checked numerically against the crown: none of this pokes through.
  const bands = [band(0.1535, PI * 0.34, PI * 0.6, 'band')];
  if (type === 'afro') bands.push(band(0.172, PI * 0.41, PI * 0.66, 'afro', PI * 0.5)); // a puff out the back
  return (
    <>
      <group rotation={[CAP.tilt, 0, 0]}>{bands}</group>
      {type === 'long' && (
        // hangs from just under the back of the rim
        <mesh position={[0, -0.12, -0.1]} rotation={[0.1, 0, 0]}>
          <boxGeometry args={[0.26, 0.24, 0.07]} />
          <Mat color={color} rough={0.95} />
        </mesh>
      )}
      {type === 'bun' && (
        // a low bun at the nape, under the back of the cap
        <mesh position={[0, -0.04, -0.165]}>
          <sphereGeometry args={[0.048, 14, 12]} />
          <Mat color={color} rough={0.95} />
        </mesh>
      )}
    </>
  );
}

function Hair({ type, color }) {
  const cap = (
    <mesh rotation={[-0.45, 0, 0]} position={[0, 0.005, -0.005]} scale={[0.97, 1.06, 1]}>
      <sphereGeometry args={[0.158, 28, 16, 0, PI * 2, 0, PI * 0.42]} />
      <Mat color={color} rough={0.95} />
    </mesh>
  );
  switch (type) {
    case 'bald':
      return null;
    case 'long':
      return (
        <>
          {cap}
          <mesh position={[0, -0.09, -0.085]}>
            <boxGeometry args={[0.29, 0.3, 0.1]} />
            <Mat color={color} rough={0.95} />
          </mesh>
        </>
      );
    case 'mohawk':
      return (
        <mesh position={[0, 0.15, -0.02]} rotation={[-0.2, 0, 0]}>
          <boxGeometry args={[0.035, 0.09, 0.27]} />
          <Mat color={color} rough={0.95} />
        </mesh>
      );
    case 'afro':
      return (
        <mesh position={[0, 0.1, -0.08]}>
          <sphereGeometry args={[0.2, 20, 16]} />
          <Mat color={color} rough={1} />
        </mesh>
      );
    case 'bun':
      return (
        <>
          {cap}
          <mesh position={[0, 0.12, -0.13]}>
            <sphereGeometry args={[0.06, 14, 12]} />
            <Mat color={color} rough={0.95} />
          </mesh>
        </>
      );
    case 'slick':
      return (
        <mesh rotation={[-0.55, 0, 0]} position={[0, 0.0, -0.01]} scale={[0.98, 0.95, 1.06]}>
          <sphereGeometry args={[0.157, 28, 16, 0, PI * 2, 0, PI * 0.45]} />
          <Mat color={color} rough={0.25} />
        </mesh>
      );
    default:
      return cap;
  }
}

// The head is a sphere of radius 0.15 squashed by HEAD_SCALE. Facial hair is
// built in that same squashed space so it hugs the face instead of floating off
// it or sinking in.
const HEAD_SCALE = [0.95, 1.05, 0.98];
const HEAD_R = 0.15;

// Facial hair coverage, as sphere angles: theta runs down from the crown; phi
// runs round the head, 0 at one ear, PI/2 at the nose, PI at the other ear.
const JAW = {
  ear: PI * 0.45, // where the beard line meets the sideburns
  corner: PI * 0.615, // level with the moustache tips, at the corners of the mouth
  underLip: PI * 0.685, // the bare gap under the lower lip
  chin: PI * 0.97, // under the chin
  gap: 0.11, // half-width of that gap (radians of phi): about the lips' width
  blend: 0.12, // how quickly the line drops from the corners to under the lip
};

const smooth = (k) => k * k * (3 - 2 * k);
/** Top edge of the beard at angle phi: high by the ears, sloping down to the moustache, a small gap under the lip. */
function beardTop(phi) {
  const d = Math.abs(phi - PI / 2);
  if (d <= JAW.gap) return JAW.underLip;
  if (d <= JAW.gap + JAW.blend) return JAW.underLip + (JAW.corner - JAW.underLip) * smooth((d - JAW.gap) / JAW.blend);
  // up the cheek: climbs quickly from the moustache tips, then levels off to the sideburns
  const k = Math.min(1, (d - JAW.gap - JAW.blend) / (PI / 2 - JAW.gap - JAW.blend));
  return JAW.corner + (JAW.ear - JAW.corner) * Math.pow(k, 0.55);
}

const jawCache = new Map();
/**
 * The jaw: ear to ear across the front, from the beard line down under the
 * chin. A sphere patch of radius R whose top edge follows beardTop(). uv.v runs
 * 1 at the beard line to 0 under the chin.
 */
function jawGeometry(R) {
  if (jawCache.has(R)) return jawCache.get(R);
  const cols = 56;
  const rows = 14;
  const pos = [];
  const nrm = [];
  const uv = [];
  for (let j = 0; j <= rows; j++) {
    for (let i = 0; i <= cols; i++) {
      const phi = (i / cols) * PI;
      const top = beardTop(phi);
      const theta = top + ((JAW.chin - top) * j) / rows;
      const x = -Math.cos(phi) * Math.sin(theta);
      const y = Math.cos(theta);
      const z = Math.sin(phi) * Math.sin(theta);
      pos.push(R * x, R * y, R * z);
      nrm.push(x, y, z);
      uv.push(i / cols, 1 - j / rows);
    }
  }
  const index = [];
  const at = (i, j) => j * (cols + 1) + i;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const a = at(i + 1, j);
      const b = at(i, j);
      const c = at(i, j + 1);
      const d = at(i + 1, j + 1);
      index.push(a, b, d, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  jawCache.set(R, g);
  return g;
}

let stubbleTex = null;
/**
 * Fine dots, used as an alpha map: reads as stubble, not a painted-on shadow.
 * They thin out towards the top (the beard line) so there's no hard edge.
 */
function stubbleAlpha() {
  if (stubbleTex) return stubbleTex;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#000';
  g.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < 30000; i++) {
    const y = Math.random() * c.height;
    const fade = Math.min(1, y / (c.height * 0.3)); // canvas top = beard line
    if (Math.random() > fade) continue;
    g.fillStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.65})`;
    g.fillRect(Math.random() * c.width, y, 1, 1 + (Math.random() < 0.3 ? 1 : 0));
  }
  stubbleTex = new THREE.CanvasTexture(c);
  return stubbleTex;
}

/** The jaw shell standing `r` times the head radius off the skin, in the head's own (squashed) space. */
function JawShell({ r, children }) {
  return (
    <group scale={HEAD_SCALE}>
      <mesh geometry={jawGeometry(+(HEAD_R * r).toFixed(5))}>{children}</mesh>
    </group>
  );
}

/** A chevron moustache: two full, rounded halves that follow the face and droop at the ends. */
function Mustache({ color }) {
  return [-1, 1].map((s) => (
    <group key={s} position={[s * 0.027, -0.047, 0.142]} rotation={[0, s * 0.5, 0]}>
      <mesh rotation={[0, 0, s * (PI / 2 - 0.3)]} scale={[1, 1, 0.75]}>
        <capsuleGeometry args={[0.0115, 0.032, 4, 10]} />
        <Mat color={color} rough={1} />
      </mesh>
    </group>
  ));
}

function FacialHair({ type, color }) {
  const tex = useMemo(() => (type === 'stubble' ? stubbleAlpha() : null), [type]);
  switch (type) {
    case 'stubble':
      return (
        <JawShell r={1.012}>
          <meshStandardMaterial color={color} roughness={1} alphaMap={tex} transparent opacity={0.9} depthWrite={false} side={THREE.DoubleSide} />
        </JawShell>
      );
    case 'mustache':
      return <Mustache color={color} />;
    case 'goatee':
      return (
        <>
          <Mustache color={color} />
          {/* a patch hugging the point of the chin, under the lower lip, with a little point */}
          <mesh position={[0, -0.122, 0.098]} rotation={[-0.75, 0, 0]} scale={[1.2, 1, 0.7]}>
            <coneGeometry args={[0.03, 0.05, 12]} />
            <Mat color={color} rough={1} />
          </mesh>
          <group scale={HEAD_SCALE}>
            <mesh>
              <sphereGeometry args={[HEAD_R * 1.06, 14, 8, PI / 2 - 0.34, 0.68, JAW.underLip, PI * 0.86 - JAW.underLip]} />
              <Mat color={color} rough={1} side={THREE.DoubleSide} />
            </mesh>
          </group>
        </>
      );
    case 'beard':
      return (
        <>
          <Mustache color={color} />
          <JawShell r={1.07}>
            <Mat color={color} rough={1} side={THREE.DoubleSide} />
          </JawShell>
        </>
      );
    default:
      return null;
  }
}

function Accessory({ type }) {
  switch (type) {
    case 'glasses':
      return (
        <group position={[0, 0.02, 0.15]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.055, 0, 0]}>
              <torusGeometry args={[0.03, 0.004, 6, 20]} />
              <Mat color="#222" rough={0.3} metalness={0.6} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.03, 0.005, 0.005]} />
            <Mat color="#222" />
          </mesh>
        </group>
      );
    case 'shades':
      return (
        <group position={[0, 0.02, 0.148]}>
          {[-1, 1].map((s) => (
            <mesh key={s} position={[s * 0.056, 0, 0]}>
              <boxGeometry args={[0.058, 0.036, 0.01]} />
              <Mat color="#060606" rough={0.05} metalness={0.4} />
            </mesh>
          ))}
          <mesh>
            <boxGeometry args={[0.03, 0.006, 0.006]} />
            <Mat color="#111" />
          </mesh>
        </group>
      );
    case 'fedora':
      return (
        <group position={[0, 0.11, -0.01]} rotation={[-0.08, 0, 0.05]}>
          <mesh>
            <cylinderGeometry args={[0.25, 0.25, 0.012, 32]} />
            <Mat color="#2a2119" />
          </mesh>
          <mesh position={[0, 0.07, 0]}>
            <cylinderGeometry args={[0.12, 0.145, 0.13, 24]} />
            <Mat color="#2a2119" />
          </mesh>
          <mesh position={[0, 0.025, 0]}>
            <cylinderGeometry args={[0.146, 0.146, 0.025, 24]} />
            <Mat color="#0d0a08" />
          </mesh>
        </group>
      );
    case 'cap':
      return <Cap />;
    case 'eyepatch':
      return (
        <>
          <mesh position={[-0.055, 0.02, 0.14]} scale={[1, 1, 0.35]}>
            <sphereGeometry args={[0.036, 14, 10]} />
            <Mat color="#080808" />
          </mesh>
          <mesh position={[0, 0.04, 0]} rotation={[0.25, 0, -0.35]}>
            <torusGeometry args={[0.155, 0.004, 6, 40]} />
            <Mat color="#080808" />
          </mesh>
        </>
      );
    case 'cigar':
      return (
        <group position={[0.035, -0.068, 0.15]} rotation={[0.15, 0.35, 0]}>
          <mesh rotation={[PI / 2, 0, 0]} position={[0, 0, 0.04]}>
            <cylinderGeometry args={[0.009, 0.009, 0.09, 10]} />
            <Mat color="#5b3a1e" />
          </mesh>
          <mesh position={[0, 0, 0.086]}>
            <sphereGeometry args={[0.0095, 10, 8]} />
            <meshStandardMaterial color="#ff5a1a" emissive="#ff4a10" emissiveIntensity={3} toneMapped={false} />
          </mesh>
        </group>
      );
    default:
      return null;
  }
}

export function Head({ config }) {
  const c = config;
  const acc = c.accessories || [c.accessory];
  return (
    <>
      <mesh castShadow scale={HEAD_SCALE}>
        <sphereGeometry args={[HEAD_R, 32, 24]} />
        <Mat color={c.skin} rough={0.55} />
      </mesh>
      {/* nose + ears */}
      <mesh position={[0, -0.012, 0.148]} scale={[0.8, 1.2, 1]}>
        <sphereGeometry args={[0.022, 12, 10]} />
        <Mat color={c.skin} rough={0.7} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.145, 0.0, -0.005]} scale={[0.4, 1, 0.7]}>
          <sphereGeometry args={[0.035, 10, 8]} />
          <Mat color={c.skin} rough={0.7} />
        </mesh>
      ))}
      <Eyes shape={c.eyeShape} color={c.eyeColor} skin={c.skin} />
      <Brows type={c.brows} color={c.hairColor} />
      <Mouth type={c.mouth} />
      {acc.includes('cap') ? <HairUnderCap type={c.hair} color={c.hairColor} /> : <Hair type={c.hair} color={c.hairColor} />}
      <FacialHair type={c.facialHair} color={c.hairColor} />
      {acc.map((a) => (
        <Accessory key={a} type={a} />
      ))}
    </>
  );
}

export function Chair() {
  const wood = usePBR('dark_wood', [1, 1]);
  return (
    <group>
      <mesh position={[0, 0.46, -0.05]} castShadow receiveShadow>
        <boxGeometry args={[0.5, 0.05, 0.48]} />
        <meshStandardMaterial {...wood} color="#6a4430" />
      </mesh>
      {/* slatted back */}
      {[-0.18, 0, 0.18].map((x) => (
        <mesh key={x} position={[x, 0.82, -0.29]} castShadow>
          <boxGeometry args={[0.06, 0.55, 0.03]} />
          <meshStandardMaterial {...wood} color="#5a3826" />
        </mesh>
      ))}
      <mesh position={[0, 1.12, -0.29]} castShadow>
        <boxGeometry args={[0.54, 0.08, 0.05]} />
        <meshStandardMaterial {...wood} color="#5a3826" />
      </mesh>
      {[[-0.22, 0.17], [0.22, 0.17], [-0.22, -0.27], [0.22, -0.27]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.22 + (z < 0 ? 0.24 : 0), z]}>
          <cylinderGeometry args={[0.022, 0.018, z < 0 ? 0.93 : 0.45, 8]} />
          <meshStandardMaterial {...wood} color="#5a3826" />
        </mesh>
      ))}
    </group>
  );
}

// Simple damped spring per channel.
function spring(state, key, target, dt, k = 70, damp = 9) {
  const v = state.v[key] ?? 0;
  const x = state.x[key] ?? target;
  const nv = (v + (target - x) * k * dt) * Math.exp(-damp * dt);
  state.v[key] = nv;
  state.x[key] = x + nv * dt;
  return state.x[key];
}

// Torso silhouette (radius, height) from hips to neck, lathed and flattened front-to-back.
const TORSO = new THREE.LatheGeometry(
  [
    [0.0, -0.02], [0.165, 0.0], [0.185, 0.08], [0.178, 0.24], [0.19, 0.38],
    [0.225, 0.52], [0.232, 0.58], [0.2, 0.65], [0.12, 0.7], [0.06, 0.72],
  ].map(([r, y]) => new THREE.Vector2(r, y)),
  28,
);
// Two-segment arm: shoulder -> elbow -> hand (lengths shared with the IK solver).
const SLEEVE = new THREE.CapsuleGeometry(0.058, UPPER - 0.1, 6, 12);
const FOREARM = new THREE.CapsuleGeometry(0.045, LOWER - 0.12, 6, 10);

function Hand({ skin }) {
  return (
    <group position={[0, -LOWER, 0.0]}>
      <mesh scale={[1, 1.15, 0.55]}>
        <sphereGeometry args={[0.048, 12, 10]} />
        <meshStandardMaterial color={skin} roughness={0.55} />
      </mesh>
      <mesh position={[0.035, 0.01, 0.015]} rotation={[0, 0, -0.5]}>
        <capsuleGeometry args={[0.013, 0.035, 4, 6]} />
        <meshStandardMaterial color={skin} roughness={0.55} />
      </mesh>
    </group>
  );
}

function Arm({ shoulderRef, elbowRef, side, shirt, skin, fabric }) {
  return (
    <group ref={shoulderRef} position={[side * 0.235, 0.6, 0.0]}>
      <mesh position={[0, -0.03, 0]} castShadow>
        <sphereGeometry args={[0.075, 14, 12]} />
        <meshStandardMaterial color={shirt} roughness={0.85} normalMap={fabric} />
      </mesh>
      <mesh geometry={SLEEVE} position={[0, -UPPER / 2, 0]} castShadow>
        <meshStandardMaterial color={shirt} roughness={0.85} normalMap={fabric} />
      </mesh>
      <group ref={elbowRef} position={[0, -UPPER, 0]}>
        {/* rolled cuff at the elbow, bare forearm */}
        <mesh>
          <sphereGeometry args={[0.058, 12, 10]} />
          <meshStandardMaterial color={shirt} roughness={0.9} />
        </mesh>
        <mesh geometry={FOREARM} position={[0, -(LOWER - 0.04) / 2, 0]}>
          <meshStandardMaterial color={skin} roughness={0.55} />
        </mesh>
        <Hand skin={skin} />
      </group>
    </group>
  );
}

const _qRest = new THREE.Quaternion();
const _qIk = new THREE.Quaternion();
const _e = new THREE.Euler();

const _inv = new THREE.Matrix4();
const _v = new THREE.Vector3();

/**
 * @param pose 'rest' | 'aim' | 'self' | 'dead'
 * @param lookAt world-space point the head turns towards (or null)
 * @param flinch true for a brief jolt (dry fire / nearby shot)
 */
export function Avatar({ config, pose = 'rest', lookAt = null, flinch = false, chair = true, idle = true, hideHead = false, playerId = null }) {
  const body = useRef();
  const head = useRef();
  const armR = useRef();
  const elbowR = useRef();
  const armL = useRef();
  const elbowL = useRef();
  const ik = useMemo(() => ({ w: 0, qs: new THREE.Quaternion(), qe: new THREE.Quaternion(), local: new THREE.Vector3() }), []);
  const root = useRef();
  const sp = useMemo(() => ({ x: {}, v: {} }), []);
  const phase = useMemo(() => Math.random() * 10, []);
  const fabric = usePBR('dirty_carpet', [3, 3]).normalMap;

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime + phase;
    const dead = pose === 'dead';

    // Body: dead slumps back and to the side with overshoot.
    body.current.rotation.x = spring(sp, 'bx', dead ? -0.95 : flinch ? -0.12 : 0, dt, dead ? 40 : 90, dead ? 5 : 10);
    body.current.rotation.z = spring(sp, 'bz', dead ? 0.3 : 0, dt, 40, 5);
    const breathe = dead || !idle ? 0 : Math.sin(t * 1.6) * 0.012;
    body.current.position.y = 0.5 + breathe;

    // Head: look towards the action, loll when dead.
    let yaw = 0;
    let pitch = Math.sin(t * 0.7) * 0.03;
    if (lookAt && !dead && root.current) {
      root.current.updateWorldMatrix(true, false);
      _inv.copy(root.current.matrixWorld).invert();
      _v.copy(lookAt).applyMatrix4(_inv);
      yaw = THREE.MathUtils.clamp(Math.atan2(_v.x, _v.z), -1.1, 1.1);
      pitch = THREE.MathUtils.clamp(-Math.atan2(_v.y - 1.36, Math.hypot(_v.x, _v.z)), -0.4, 0.4);
    }
    head.current.rotation.y = spring(sp, 'hy', dead ? 0.2 : yaw, dt, 30, 8);
    head.current.rotation.x = spring(sp, 'hx', dead ? -0.5 : pitch, dt, 30, 7);
    head.current.rotation.z = spring(sp, 'hz', dead ? 0.6 : 0, dt, 25, 4);

    // Arms at rest: upper arm down and forward, forearms along the table edge.
    // Dead: hanging slack.
    const sx = spring(sp, 'arx', dead ? -0.1 : -0.35, dt, 50, 8);
    const sz = spring(sp, 'arz', dead ? 0.22 : 0.05, dt, 50, 8);
    const ex = spring(sp, 'aex', dead ? -0.1 : -1.35, dt, 50, 8);
    armL.current.rotation.set(spring(sp, 'alx', dead ? -0.1 : -0.35, dt, 50, 8), 0, spring(sp, 'alz', dead ? -0.22 : -0.05, dt, 50, 8));
    elbowL.current.rotation.set(spring(sp, 'alex', dead ? -0.1 : -1.35, dt, 50, 8), 0, 0);

    // Right arm: when this player holds the gun, the hand goes to the grip
    // (the gun publishes its grip position every frame), blended in and out.
    const grip = playerId == null ? null : fx.gripHolder === playerId ? fx.grip : fx.grips.get(playerId);
    const holding = !dead && !!grip;
    ik.w += ((holding ? 1 : 0) - ik.w) * Math.min(1, dt * 7);
    _qRest.setFromEuler(_e.set(sx, 0, sz));
    if (ik.w > 0.001) {
      body.current.updateWorldMatrix(true, false);
      if (grip) ik.local.copy(grip);
      else ik.local.copy(fx.grip);
      body.current.worldToLocal(ik.local);
      solveArm(armR.current.position, ik.local, -1, ik.qs, _qIk);
      armR.current.quaternion.copy(_qRest).slerp(ik.qs, ik.w);
      ik.qe.setFromEuler(_e.set(ex, 0, 0)).slerp(_qIk, ik.w);
      elbowR.current.quaternion.copy(ik.qe);
    } else {
      armR.current.quaternion.copy(_qRest);
      elbowR.current.rotation.set(ex, 0, 0);
    }
  });

  const c = config;
  const pants = '#1c1714';
  return (
    <group ref={root}>
      {chair && <Chair />}
      {/* legs (don't fall over with the body) */}
      {[-1, 1].map((s) => (
        <group key={s} position={[s * 0.1, 0.53, -0.02]}>
          <mesh position={[0, 0, 0.18]} rotation={[PI / 2, 0, 0]} castShadow>
            <capsuleGeometry args={[0.072, 0.32, 6, 10]} />
            <meshStandardMaterial color={pants} roughness={0.9} normalMap={fabric} />
          </mesh>
          <mesh position={[0, -0.25, 0.39]} castShadow>
            <capsuleGeometry args={[0.058, 0.4, 6, 10]} />
            <meshStandardMaterial color={pants} roughness={0.9} normalMap={fabric} />
          </mesh>
          <mesh position={[0, -0.5, 0.44]} scale={[1, 0.6, 1.6]}>
            <sphereGeometry args={[0.065, 12, 8]} />
            <meshStandardMaterial color="#0b0807" roughness={0.3} />
          </mesh>
        </group>
      ))}
      {/* hip pivot */}
      <group ref={body} position={[0, 0.5, -0.05]}>
        <mesh geometry={TORSO} scale={[1, 1, 0.72]} castShadow>
          <meshStandardMaterial color={c.shirt} roughness={0.85} normalMap={fabric} />
        </mesh>
        {/* belt + buckle + collar */}
        <mesh position={[0, 0.06, 0]} scale={[1, 1, 0.72]}>
          <cylinderGeometry args={[0.188, 0.188, 0.05, 28]} />
          <meshStandardMaterial color="#120c08" roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.06, 0.137]}>
          <boxGeometry args={[0.045, 0.035, 0.01]} />
          <meshStandardMaterial color="#b8955a" metalness={0.9} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0.69, 0.0]} rotation={[PI / 2 - 0.15, 0, 0]}>
          <torusGeometry args={[0.07, 0.018, 8, 20]} />
          <meshStandardMaterial color={c.shirt} roughness={0.85} />
        </mesh>
        <mesh position={[0, 0.74, 0.03]}>
          <cylinderGeometry args={[0.052, 0.062, 0.12, 14]} />
          <meshStandardMaterial color={c.skin} roughness={0.55} />
        </mesh>
        <group ref={head} position={[0, 0.86, 0.05]} visible={!hideHead}>
          <Head config={c} />
        </group>
        <Arm shoulderRef={armR} elbowRef={elbowR} side={-1} shirt={c.shirt} skin={c.skin} fabric={fabric} />
        <Arm shoulderRef={armL} elbowRef={elbowL} side={1} shirt={c.shirt} skin={c.skin} fabric={fabric} />
      </group>
    </group>
  );
}
