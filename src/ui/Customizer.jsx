import React, { Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import { useStore } from '../store.js';
import { session } from '../net/session.js';
import { Avatar } from '../three/Avatar.jsx';
import { AVATAR_OPTIONS, DEFAULT_AVATAR, randomAvatar } from '../../shared/avatar.js';

const LABELS = {
  skin: 'Skin tone',
  eyeShape: 'Eye shape',
  eyeColor: 'Eye colour',
  brows: 'Eyebrows',
  mouth: 'Expression',
  hair: 'Hair',
  hairColor: 'Hair colour',
  facialHair: 'Facial hair',
  accessory: 'Accessory',
  shirt: 'Shirt',
};
const isColor = (v) => typeof v === 'string' && v.startsWith('#');

function Preview({ avatar }) {
  return (
    <Canvas shadows camera={{ position: [0.8, 1.5, 2.1], fov: 35 }} dpr={[1, 2]}>
      <color attach="background" args={['#0f0a07']} />
      <ambientLight intensity={0.35} color="#ffd9b0" />
      <spotLight position={[1.5, 3, 2]} angle={0.5} penumbra={0.6} intensity={40} color="#ffbf80" castShadow />
      <pointLight position={[-1.5, 1.6, -1]} intensity={4} color="#ff6a3a" />
      <Suspense fallback={null}>
        <Avatar config={avatar} />
      </Suspense>
      <ContactShadows position={[0, 0.001, 0]} opacity={0.6} scale={3} blur={2.4} />
      <OrbitControls target={[0, 1.15, 0]} minDistance={0.6} maxDistance={3.2} enablePan={false} />
    </Canvas>
  );
}

export function Customizer() {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const room = useStore((s) => s.room);
  const setScreen = useStore((s) => s.setScreen);
  const a = profile.avatar;

  const set = (key, value) => setProfile({ avatar: { ...useStore.getState().profile.avatar, [key]: value } });
  const done = () => {
    if (room?.status === 'lobby') session.update({ avatar: profile.avatar, name: useStore.getState().displayName() });
    setScreen(room ? 'lobby' : 'menu');
  };

  return (
    <div className="customizer">
      <div className="preview">
        <Preview avatar={a} />
        <span className="preview-hint">drag to turn · scroll to zoom</span>
      </div>
      <div className="panel options">
        <h2>Character</h2>
        <label className="name-field">
          <span>Name</span>
          <input value={profile.name} maxLength={16} placeholder="Stranger" onChange={(e) => setProfile({ name: e.target.value })} />
        </label>
        {Object.entries(AVATAR_OPTIONS).map(([key, list]) => (
          <div className="opt" key={key}>
            <div className="opt-label">{LABELS[key]}</div>
            <div className="opt-values">
              {list.map((v) =>
                isColor(v) ? (
                  <button
                    key={v}
                    className={`swatch ${a[key] === v ? 'on' : ''}`}
                    style={{ background: v }}
                    onClick={() => set(key, v)}
                    aria-label={v}
                  />
                ) : (
                  <button key={v} className={`chip ${a[key] === v ? 'on' : ''}`} onClick={() => set(key, v)}>
                    {v}
                  </button>
                ),
              )}
            </div>
          </div>
        ))}
        <div className="row">
          <button className="btn" onClick={() => setProfile({ avatar: randomAvatar() })}>
            Randomise
          </button>
          <button className="btn ghost" onClick={() => setProfile({ avatar: DEFAULT_AVATAR })}>
            Reset
          </button>
          <button className="btn primary" onClick={done}>
            Save
          </button>
        </div>
        <p className="hint">Saved on this device and sent to the room when you join.</p>
      </div>
    </div>
  );
}
