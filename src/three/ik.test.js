import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveArm, handPosition, UPPER, LOWER } from './ik.js';

const shoulder = new THREE.Vector3(-0.235, 0.6, 0); // right shoulder in body space

test('hand lands on every reachable target', () => {
  const qs = new THREE.Quaternion();
  const qe = new THREE.Quaternion();
  let worst = 0;
  for (let i = 0; i < 2000; i++) {
    const dir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
    const target = shoulder.clone().addScaledVector(dir, 0.1 + Math.random() * (UPPER + LOWER - 0.12));
    solveArm(shoulder, target, -1, qs, qe);
    worst = Math.max(worst, handPosition(shoulder, qs, qe).distanceTo(target));
  }
  assert.ok(worst < 1e-4, `worst miss ${worst}`);
});

test('out-of-reach targets get a straight arm pointing at them', () => {
  const qs = new THREE.Quaternion();
  const qe = new THREE.Quaternion();
  const target = shoulder.clone().add(new THREE.Vector3(0, 0, 2));
  solveArm(shoulder, target, -1, qs, qe);
  const hand = handPosition(shoulder, qs, qe);
  assert.ok(hand.distanceTo(shoulder) > UPPER + LOWER - 0.01, 'fully extended');
  assert.ok(hand.clone().sub(shoulder).normalize().dot(new THREE.Vector3(0, 0, 1)) > 0.99, 'aimed at target');
});

test('the elbow bends down and outward, not up into the face', () => {
  const qs = new THREE.Quaternion();
  const qe = new THREE.Quaternion();
  // gun held up at the right temple (the self-aim pose)
  const target = new THREE.Vector3(-0.33, 0.85, 0.02);
  solveArm(shoulder, target, -1, qs, qe);
  const elbow = new THREE.Vector3(0, -UPPER, 0).applyQuaternion(qs).add(shoulder);
  assert.ok(elbow.y < target.y, 'elbow below the hand');
  assert.ok(elbow.x < shoulder.x + 0.05, 'elbow out to the right side (−x)');
});
