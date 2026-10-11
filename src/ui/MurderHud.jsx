// Murder! HUD: your role, the body count, the lights clock, a crosshair, what
// just happened, and the blackout itself (solid black for the living — the
// scene behind it is never drawn through, so there's nothing to squint at).
import React from 'react';
import { useStore } from '../store.js';
import { session } from '../net/session.js';
import { useMedia, setMicMuted } from '../net/media.js';
import { RemoteAudio } from './Feeds.jsx';
import { FaceIcon } from './FaceIcon.jsx';
import { useTick, Roster, DeathScreen } from './Hud.jsx';
import { sights } from '../three/murder.js';

const ROLE_CARD_MS = 7000;

function LightsClock({ game }) {
  const offset = useStore((s) => s.clockOffset);
  if (game.phase !== 'playing') return null;
  const left = Math.max(0, game.nextAt - (Date.now() + offset));
  const secs = Math.ceil(left / 1000);
  if (game.dark) return <span className="lights-clock dark">Lights out · {secs}s</span>;
  return <span className={`lights-clock ${secs <= 5 ? 'soon' : ''}`}>Lights out in {secs}s</span>;
}

/** The blackout. Ghosts see through it, dimly; the murderer sees almost as if the lights were on. */
function Blackout({ game, ghost, myId }) {
  const lightsAt = useStore((s) => s.lightsAt);
  if (!game.dark || game.phase !== 'playing') return null;
  const killer = !ghost && game.murdererId === myId;
  return (
    <div key={lightsAt} className={`lights-out ${ghost ? 'ghost' : ''} ${killer ? 'killer' : ''}`}>
      {killer && <span className="killer-sight">The lights are out. Only you can see.</span>}
    </div>
  );
}

const secs = (ms) => Math.round(ms / 1000);

function RoleCard({ game, myId }) {
  const roleAt = useStore((s) => s.roleAt);
  const t = performance.now() - roleAt;
  if (t > ROLE_CARD_MS || game.phase !== 'playing') return null;
  const murderer = game.murdererId === myId;
  return (
    <div className={`role-card ${murderer ? 'murderer' : ''}`} style={{ opacity: t > ROLE_CARD_MS - 800 ? (ROLE_CARD_MS - t) / 800 : 1 }}>
      <div className="label">You are</div>
      <h2>{murderer ? 'The Murderer' : 'Innocent'}</h2>
      <p>
        {murderer
          ? `${game.killGoal} people have to die. Any death counts, even ones you didn't cause. You can see in the dark. Don't get caught.`
          : `One of you is a murderer. If ${game.killGoal} people die, they win. Shoot the murderer and you all win. Shoot the wrong person and that counts as one of their kills.`}
      </p>
      <small>
        The lights go out after {secs(game.firstMs)} seconds, then after every {secs(game.gapMs)} seconds of light, for {secs(game.darkMs)}.
        In the dark everyone gets one shot{murderer ? ', and only you can see' : ''}.
      </small>
    </div>
  );
}

function RoleChip({ game, myId, ghost }) {
  const murdererName = game.players.find((p) => p.id === game.murdererId)?.name;
  const left = Math.max(0, game.killGoal - game.bodies);
  if (ghost) {
    return (
      <div className="role-chip ghost-chip">
        The murderer is <b>{game.murdererId === myId ? 'you' : murdererName}</b> · {left} more to die
      </div>
    );
  }
  if (game.murdererId === myId) return <div className="role-chip murderer">Murderer · {left} more to go</div>;
  return <div className="role-chip">Innocent · find the murderer before {left} more die</div>;
}

function Crosshair({ game, ghost, myId }) {
  const cocked = useStore((s) => s.myCocked);
  const locked = useStore((s) => s.pointerLocked);
  const me = game.players.find((p) => p.id === myId);
  if (ghost || !me?.alive || game.phase !== 'playing') return null;
  const target = sights.targetId && game.players.find((p) => p.id === sights.targetId);
  const named = target && (!game.dark || game.murdererId === myId);
  const spent = game.dark && game.spent;
  return (
    <>
      <div className={`crosshair ${cocked ? 'cocked' : ''} ${target ? 'on' : ''}`}>
        {named && <span className="sight-name">{target.name}</span>}
      </div>
      <div className="gun-hint">
        {!locked
          ? 'Click the room to sit down'
          : spent
            ? "You've used your one shot for this blackout"
            : cocked
            ? 'Hammer back. Click to fire · right-click to lower it'
            : 'Click to cock your gun · click again to fire'}
      </div>
    </>
  );
}

function Feed() {
  const feed = useStore((s) => s.murderFeed);
  const now = performance.now();
  const recent = feed.filter((f) => now - f.at < 5500).slice(-4);
  if (!recent.length) return null;
  return (
    <div className="murder-feed">
      {recent.map((f) => (
        <div key={f.key} className="feed-line" style={{ opacity: now - f.at > 4500 ? (5500 - (now - f.at)) / 1000 : 1 }}>
          {f.text}
        </div>
      ))}
    </div>
  );
}

function MurderVictory({ game, isLeader, myId }) {
  const town = game.winner === 'town';
  const m = game.players.find((p) => p.id === game.murdererId);
  const by = game.players.find((p) => p.id === game.endedBy);
  const iWon = town ? game.murdererId !== myId : game.murdererId === myId;
  return (
    <div className="victory panel">
      <div className="label">{iWon ? 'You win' : 'You lose'}</div>
      <h2>{town ? 'The table wins' : 'The murderer wins'}</h2>
      <p className="verdict">
        <FaceIcon avatar={m?.avatar} size={30} /> <b>{m?.name}</b> was the murderer.{' '}
        {town ? (by ? `${by.name} shot them.` : 'They left the table.') : `${game.bodies} bodies.`}
      </p>
      <table className="stats">
        <thead>
          <tr>
            <th />
            <th>Role</th>
            <th>Kills</th>
            <th>Shots</th>
          </tr>
        </thead>
        <tbody>
          {game.players.map((p) => (
            <tr key={p.id} className={p.id === game.murdererId ? 'murderer-row' : ''}>
              <td className="who">
                <FaceIcon avatar={p.avatar} size={26} dead={!p.alive} /> {p.name}
                {p.isBot && <em> (bot)</em>}
                {p.forfeited && <em> (left)</em>}
              </td>
              <td>{p.id === game.murdererId ? 'Murderer' : 'Innocent'}</td>
              <td>{p.stats?.kills ?? 0}</td>
              <td>{p.stats?.shots ?? 0}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        {isLeader ? (
          <button className="btn primary" onClick={session.reset}>
            Back to lobby
          </button>
        ) : (
          <span className="hint">Waiting for the leader…</span>
        )}
        <button className="btn ghost" onClick={session.leave}>
          Main menu
        </button>
      </div>
    </div>
  );
}

export function MurderHud({ game }) {
  useTick(200);
  const myId = useStore((s) => s.myId);
  const room = useStore((s) => s.room);
  const setScreen = useStore((s) => s.setScreen);
  const ghost = useStore((s) => s.ghost);
  const locked = useStore((s) => s.pointerLocked);
  const micMuted = useMedia((s) => s.micMuted);
  const hasLocal = useMedia((s) => !!s.local);
  const over = game.phase === 'gameover';

  return (
    <div className="hud murder">
      <RemoteAudio />
      <Blackout game={game} ghost={ghost} myId={myId} />
      <div className="hud-top">
        <div className="round">
          Murder!
          <span className="badge bodies">
            {game.bodies}/{game.killGoal} dead
          </span>
          <LightsClock game={game} />
        </div>
        <div className="hud-buttons">
          {hasLocal && (
            <button className="btn small" onClick={() => setMicMuted(!micMuted)}>
              {micMuted ? '🔇 Unmute' : '🎙 Mute'}
            </button>
          )}
          <button className="btn small" onClick={() => setScreen('settings')}>
            ⚙
          </button>
          <button className="btn small ghost" onClick={session.leave}>
            Leave
          </button>
        </div>
      </div>

      <Roster game={game} />
      <Feed />
      <Crosshair game={game} ghost={ghost} myId={myId} />
      <RoleCard game={game} myId={myId} />

      <div className="hud-bottom">{!over && <RoleChip game={game} myId={myId} ghost={ghost} />}</div>

      {over && <MurderVictory game={game} isLeader={room?.leaderId === myId} myId={myId} />}
      {!over && locked && !ghost && <div className="esc-hint">Esc frees your mouse</div>}
      {ghost && !over && (
        <>
          <div className="ghost-tint" />
          <div className="afterlife">
            <div className="afterlife-title">You're a ghost.</div>
            <div className="hint">You hear everyone; only ghosts hear you. You see in the dark.</div>
            <div className="hint">
              {locked ? 'Mouse to look · WASD or arrow keys to drift · Space / Shift to rise and sink · Esc for your cursor' : 'Click the room to float again'}
            </div>
            <button className="btn" onClick={session.leave}>
              Leave game
            </button>
          </div>
        </>
      )}
      <DeathScreen />
    </div>
  );
}
