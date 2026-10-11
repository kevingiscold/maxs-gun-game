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
  // Murder!: everyone holds their own gun. playerId -> world grip point, and
  // playerId -> performance.now() of that gun's last shot (muzzle flash, recoil).
  grips: new Map(),
  shots: new Map(),
  // Where the camera is and which way it faces (for panning sounds).
  cam: { pos: new THREE.Vector3(), yaw: 0 },
};

export const sinceShot = () => performance.now() - fx.shotAt;
