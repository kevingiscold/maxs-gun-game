// CC0 Poly Haven texture sets (see scripts/fetch-assets.py). Loaded once and
// cloned per repeat, so every surface shares the same GPU images.
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';
import { useMemo } from 'react';

const SETS = ['wood_table_worn', 'old_wood_floor', 'decrepit_wallpaper', 'dark_wood', 'dirty_carpet'];
const path = (name, map) => `textures/${name}_${map}.jpg`;
export const ALL_TEXTURE_PATHS = SETS.flatMap((n) => ['diff', 'nor', 'rough'].map((m) => path(n, m)));

/** {map, normalMap, roughnessMap} for a set, tiled `repeat` times. */
export function usePBR(name, repeat = [1, 1], { normalScale = 1 } = {}) {
  const [diff, nor, rough] = useTexture([path(name, 'diff'), path(name, 'nor'), path(name, 'rough')]);
  return useMemo(() => {
    const prep = (t, srgb) => {
      const c = t.clone();
      c.wrapS = c.wrapT = THREE.RepeatWrapping;
      c.repeat.set(repeat[0], repeat[1]);
      c.anisotropy = 4;
      c.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      c.needsUpdate = true;
      return c;
    };
    return {
      map: prep(diff, true),
      normalMap: prep(nor, false),
      roughnessMap: prep(rough, false),
      normalScale: new THREE.Vector2(normalScale, normalScale),
    };
  }, [diff, nor, rough, repeat[0], repeat[1], normalScale]);
}

useTexture.preload(ALL_TEXTURE_PATHS);

/** Soft round smoke puff, drawn once on a canvas (no texture file needed). */
let smokeTex = null;
export function smokeTexture() {
  if (smokeTex) return smokeTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 26; i++) {
    const x = 64 + (Math.random() - 0.5) * 50;
    const y = 64 + (Math.random() - 0.5) * 50;
    const r = 18 + Math.random() * 30;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
  }
  smokeTex = new THREE.CanvasTexture(c);
  smokeTex.colorSpace = THREE.SRGBColorSpace;
  return smokeTex;
}
