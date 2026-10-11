import React, { useEffect } from 'react';
import { useStore } from './store.js';
import { SceneCanvas } from './three/Scene.jsx';
import { MainMenu } from './ui/MainMenu.jsx';
import { Lobby } from './ui/Lobby.jsx';
import { Customizer } from './ui/Customizer.jsx';
import { Settings } from './ui/Settings.jsx';
import { Hud } from './ui/Hud.jsx';
import { sfx } from './audio/sfx.js';
import { installInput, lockPointer } from './three/input.js';
import { session } from './net/session.js';
import { PHASE, TIMING } from '../shared/constants.js';

/** In a match with the mouse captured: left-click shoots, right-click passes. */
function onSceneMouseDown(e) {
  const st = useStore.getState();
  const g = st.game;
  if (st.screen !== 'game' || !g || g.phase === PHASE.GAMEOVER) return;
  if (!document.pointerLockElement) {
    lockPointer(); // first click just sits you down
    return;
  }
  const decidable =
    g.phase === PHASE.DECISION && g.shooterId === st.myId && performance.now() - st.phaseLocalStart >= TIMING.minStare;
  if (!decidable) return;
  if (e.button === 0) session.act('shoot');
  if (e.button === 2) session.act('pass');
}

export default function App() {
  const screen = useStore((s) => s.screen);
  const toast = useStore((s) => s.toast);

  // Browsers block audio until a gesture; start the room tone on the first click.
  useEffect(() => {
    installInput();
    const noMenu = (e) => useStore.getState().screen === 'game' && e.preventDefault();
    window.addEventListener('contextmenu', noMenu);
    return () => window.removeEventListener('contextmenu', noMenu);
  }, []);

  useEffect(() => {
    const start = () => {
      sfx.unlock();
      sfx.ambience(true);
      window.removeEventListener('pointerdown', start);
    };
    window.addEventListener('pointerdown', start);
    return () => window.removeEventListener('pointerdown', start);
  }, []);

  return (
    <div className="app">
      <div className="scene" onMouseDown={onSceneMouseDown}>
        {screen !== 'customize' && <SceneCanvas />}
      </div>
      <div className={`overlay screen-${screen}`}>
        {screen === 'menu' && <MainMenu />}
        {screen === 'lobby' && <Lobby />}
        {screen === 'customize' && <Customizer />}
        {screen === 'settings' && <Settings />}
        {screen === 'game' && <Hud />}
      </div>
      <div className="hitflash" />
      {toast && <div className="toast">{toast.text}</div>}
    </div>
  );
}
