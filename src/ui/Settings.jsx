import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.js';
import { listDevices, acquireLocalMedia, releaseLocalMedia, useMedia } from '../net/media.js';
import { session } from '../net/session.js';
import { sfx } from '../audio/sfx.js';

function CamPreview() {
  const local = useMedia((s) => s.local);
  const ref = useRef();
  useEffect(() => {
    if (ref.current) ref.current.srcObject = local;
  }, [local]);
  return local ? <video ref={ref} className="cam-preview" autoPlay muted playsInline /> : <div className="cam-preview off">no camera</div>;
}

export function Settings() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const room = useStore((s) => s.room);
  const mode = useStore((s) => s.mode);
  const setScreen = useStore((s) => s.setScreen);
  const localError = useMedia((s) => s.localError);
  const [devices, setDevices] = useState({ cams: [], mics: [] });

  const refresh = () => listDevices().then(setDevices);
  useEffect(() => {
    refresh();
    // A camera opened here just for "Test camera" shouldn't stay on in the menu.
    return () => {
      const st = useStore.getState();
      if (!st.room) releaseLocalMedia();
    };
  }, []);

  const applyDevices = async (patch) => {
    setSettings(patch);
    const { camId, micId } = { ...settings, ...patch };
    await acquireLocalMedia({ camId, micId });
    session.refreshMedia();
    refresh(); // labels only appear after permission is granted
  };

  return (
    <div className="center-col">
      <div className="panel settings">
        <h2>Settings</h2>

        <section>
          <h3>Audio</h3>
          <label className="range">
            <span>Effects volume</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.volume}
              onChange={(e) => setSettings({ volume: +e.target.value })}
              onPointerUp={() => sfx.click()}
            />
          </label>
          <label className="range">
            <span>Music volume</span>
            <input type="range" min={0} max={1} step={0.05} value={settings.musicVolume ?? 0.35} onChange={(e) => setSettings({ musicVolume: +e.target.value })} />
          </label>
          <label className="range">
            <span>Voice volume</span>
            <input type="range" min={0} max={1} step={0.05} value={settings.voiceVolume} onChange={(e) => setSettings({ voiceVolume: +e.target.value })} />
          </label>
        </section>

        <section>
          <h3>Webcam &amp; mic</h3>
          <label className="select">
            <span>Camera</span>
            <select value={settings.camId} onChange={(e) => applyDevices({ camId: e.target.value })}>
              <option value="">Default</option>
              {devices.cams.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Camera ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <label className="select">
            <span>Microphone</span>
            <select value={settings.micId} onChange={(e) => applyDevices({ micId: e.target.value })}>
              <option value="">Default</option>
              {devices.mics.map((d, i) => (
                <option key={d.deviceId || i} value={d.deviceId}>
                  {d.label || `Mic ${i + 1}`}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <CamPreview />
            <button className="btn small" onClick={() => applyDevices({})}>
              Test camera
            </button>
          </div>
          {localError && <p className="error">{localError}</p>}
        </section>

        <section>
          <h3>Input &amp; display</h3>
          <label className="range">
            <span>Mouse sensitivity</span>
            <input type="range" min={0.3} max={2} step={0.1} value={settings.freeLookSpeed} onChange={(e) => setSettings({ freeLookSpeed: +e.target.value })} />
          </label>
          <label className="select">
            <span>Graphics</span>
            <select value={settings.quality} onChange={(e) => setSettings({ quality: e.target.value })}>
              <option value="high">High (bloom, smoke, anti-aliasing)</option>
              <option value="balanced">Balanced (recommended)</option>
              <option value="low">Low (fastest)</option>
              <option value="off">Off (no post-processing)</option>
            </select>
          </label>
        </section>

        <button className="btn primary" onClick={() => setScreen(room ? (room.status === 'playing' ? 'game' : 'lobby') : 'menu')}>
          Done
        </button>
      </div>
    </div>
  );
}
