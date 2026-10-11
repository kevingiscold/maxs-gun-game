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
import { fx } from './three/fx.js';
import { sights } from './three/murder.js';

/**
 * Murder!: left-click once to pull the hammer back (the click everyone near you
 * hears), left-click again to fire at whoever is under the crosshair. Every
 * shot needs its own click to cock first. Right-click eases the hammer down.
 * Sound and recoil play the instant you click; the server decides who dies.
 */
function onMurderClick(e, st, g) {
  const me = g.players.find((p) => p.id === st.myId);
  if (!me?.alive || g.phase !== 'playing') return;
  if (e.button === 2) {
    if (st.myCocked) {
      useStore.setState({ myCocked: false });
      session.lower();
    }
    return;
  }
  if (e.button !== 0) return;
  if (g.dark && (g.spent || st.spentCycle === g.cycle)) return; // one shot per blackout
  if (!st.myCocked) {
    useStore.setState({ myCocked: true });
    sfx.cock();
    session.cock().then((r) => {
      if (!r?.ok && r?.error !== 'already-cocked') useStore.setState({ myCocked: false });
    });
    return;
  }
  useStore.setState({ myCocked: false, ...(g.dark ? { spentCycle: g.cycle } : {}) });
  const now = performance.now();
  fx.shotAt = now;
  fx.shots.set(st.myId, now);
  sfx.bang({ close: true });
  session.shoot(sights.targetId);
}

/** In a match with the mouse captured: left-click shoots, right-click passes. */
function onSceneMouseDown(e) {
  const st = useStore.getState();
  const g = st.game;
  if (st.screen !== 'game' || !g || g.phase === PHASE.GAMEOVER) return;
  if (!document.pointerLockElement) {
    lockPointer(); // first click just sits you down
    return;
  }
  if (g.mode === 'murder') return onMurderClick(e, st, g);
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
