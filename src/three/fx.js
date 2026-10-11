// Tiny mutable channel for per-frame data shared between scene components
// without React re-renders.
import * as THREE from 'three';

export const fx = {
  shotAt: -1e9, // performance.now() of the last gunshot
  clickAt: -1e9, // last dry fire
  // Where the revolver's grip is this frame, and whose hand holds it. The
  // holder's arm reaches for this point with IK, so hand and gun can't drift apart.
  grip: new THREE.Vector3(),
  gripHolder: null,
};

export const sinceShot = () => performance.now() - fx.shotAt;
