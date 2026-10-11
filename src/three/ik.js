// Two-bone arm IK (shoulder -> elbow -> hand), used to put a hand exactly on
// the revolver's grip. Bones hang along local -Y at rest.
import * as THREE from 'three';

export const UPPER = 0.28;
export const LOWER = 0.28; // elbow to the centre of the hand

const DOWN = new THREE.Vector3(0, -1, 0);
const _t = new THREE.Vector3();
const _d = new THREE.Vector3();
const _up = new THREE.Vector3();
const _elbow = new THREE.Vector3();
const _axis = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _qInv = new THREE.Quaternion();

/**
 * Solve in the shoulder's parent space. `side` is -1 for the right arm (the
 * avatar faces +z, so its right is -x) and +1 for the left. The elbow is
 * pushed down, outward and back, like a person holding something up.
 * Writes the shoulder quaternion into `qs` and the elbow's (relative to the
 * upper arm) into `qe`.
 */
export function solveArm(shoulderPos, target, side, qs, qe) {
  _d.copy(target).sub(shoulderPos);
  const dist = THREE.MathUtils.clamp(_d.length(), 0.06, UPPER + LOWER - 0.002);
  _d.normalize();
  // angle between the shoulder->hand line and the upper arm (law of cosines)
  const a1 = Math.acos(THREE.MathUtils.clamp((UPPER * UPPER + dist * dist - LOWER * LOWER) / (2 * UPPER * dist), -1, 1));
  _pole.set(side * 0.7, -1, -0.5).normalize();
  _axis.crossVectors(_d, _pole);
  if (_axis.lengthSq() < 1e-6) _axis.set(1, 0, 0);
  _axis.normalize();
  _up.copy(_d).applyAxisAngle(_axis, a1); // upper arm swings toward the pole
  qs.setFromUnitVectors(DOWN, _up);
  _elbow.copy(shoulderPos).addScaledVector(_up, UPPER);
  _t.copy(target).sub(_elbow).normalize(); // forearm direction in parent space
  _qInv.copy(qs).invert();
  qe.setFromUnitVectors(DOWN, _t.applyQuaternion(_qInv));
}

/** Forward kinematics: where the hand ends up for given joint rotations. */
export function handPosition(shoulderPos, qs, qe, out = new THREE.Vector3()) {
  const elbow = new THREE.Vector3(0, -UPPER, 0).applyQuaternion(qs).add(shoulderPos);
  const fore = new THREE.Vector3(0, -LOWER, 0).applyQuaternion(qe).applyQuaternion(qs);
  return out.copy(elbow).add(fore);
}
