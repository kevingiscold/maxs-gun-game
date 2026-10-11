// Table/seat geometry shared by avatars, the revolver and the camera rig.
import * as THREE from 'three';

export const TABLE_RADIUS = 1.15;
export const TABLE_HEIGHT = 0.78;
export const SEAT_RADIUS = 1.75;

// Points in an avatar's local space (avatar faces +z, its right hand is -x).
export const LOCAL = {
  head: new THREE.Vector3(0, 1.36, 0),
  eye: new THREE.Vector3(0, 1.39, 0.19), // first-person camera, just in front of the face
  hand: new THREE.Vector3(-0.18, 1.26, 0.5), // right hand, gun raised to head height
  // Self-aim: the gun's origin sits out to the right so the muzzle (0.30 in
  // front of the origin) rests against the temple instead of inside the skull.
  temple: new THREE.Vector3(-0.44, 1.44, 0.05),
  templeAim: new THREE.Vector3(0, 1.41, 0.02),
  handLow: new THREE.Vector3(-0.2, 0.93, 0.5), // gun lowered over the table edge
};

/** Seat i of n, anti-clockwise seen from above; seat 0 faces the default camera. */
export function seat(i, n) {
  const theta = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  const x = SEAT_RADIUS * Math.cos(theta);
  const z = -SEAT_RADIUS * Math.sin(theta);
  return { position: new THREE.Vector3(x, 0, z), rotY: Math.atan2(-x, -z) };
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/** Convert a local avatar point (LOCAL.*) to world space for seat i of n. */
export function seatPoint(i, n, local, out = new THREE.Vector3()) {
  const s = seat(i, n);
  _q.setFromAxisAngle(_up, s.rotY);
  _m.compose(s.position, _q, new THREE.Vector3(1, 1, 1));
  return out.copy(local).applyMatrix4(_m);
}
