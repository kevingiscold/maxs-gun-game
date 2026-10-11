// Draws the Shooter/Target webcam streams as video textures, glued to the
// camera exactly behind the transparent HTML frames in ui/Feeds.jsx.
import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { useMedia } from '../net/media.js';

const DIST = 0.2; // in front of the camera, inside the near-clip budget

function useVideoTexture(stream) {
  const tex = useMemo(() => {
    if (!stream) return null;
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.srcObject = stream;
    video.play().catch(() => {});
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    return t;
  }, [stream]);
  useEffect(
    () => () => {
      if (!tex) return;
      tex.image.pause();
      tex.image.srcObject = null;
      tex.dispose();
    },
    [tex],
  );
  return tex;
}

const _v = new THREE.Vector3();

function Screen({ role, feed }) {
  const mesh = useRef();
  const tex = useVideoTexture(feed?.stream);
  const { camera, size } = useThree();

  useFrame(() => {
    const m = mesh.current;
    const el = document.querySelector(`.feed.${role} .feed-frame`);
    if (!m || !tex || !el) {
      if (m) m.visible = false;
      return;
    }
    const r = el.getBoundingClientRect();
    const h = 2 * DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const w = h * camera.aspect;
    const cx = ((r.left + r.width / 2) / size.width) * 2 - 1;
    const cy = -(((r.top + r.height / 2) / size.height) * 2 - 1);
    _v.set((cx * w) / 2, (cy * h) / 2, -DIST);
    m.position.copy(camera.localToWorld(_v));
    m.quaternion.copy(camera.quaternion);
    m.scale.set(((r.width / size.width) * w) * (feed.mirror ? -1 : 1), (r.height / size.height) * h, 1);
    m.visible = true;

    // object-fit: cover
    const vid = tex.image;
    if (vid.videoWidth) {
      const va = vid.videoWidth / vid.videoHeight;
      const fa = r.width / r.height;
      if (va > fa) tex.repeat.set(fa / va, 1);
      else tex.repeat.set(1, va / fa);
      tex.offset.set((1 - tex.repeat.x) / 2, (1 - tex.repeat.y) / 2);
    }
  });

  if (!tex) return null;
  return (
    <mesh ref={mesh} renderOrder={1000} frustumCulled={false}>
      <planeGeometry />
      {/* warm, slightly desaturated "security cam" grade */}
      <meshBasicMaterial map={tex} color="#fff4e4" toneMapped={false} depthTest={false} depthWrite={false} fog={false} side={THREE.DoubleSide} />
    </mesh>
  );
}

export function FeedScreens() {
  const feedGL = useMedia((s) => s.feedGL);
  return (
    <>
      <Screen role="shooter" feed={feedGL.shooter} />
      <Screen role="target" feed={feedGL.target} />
    </>
  );
}
