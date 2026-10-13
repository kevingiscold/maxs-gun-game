import React, { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { session } from '../net/session.js';
import { useMedia, setMicMuted } from '../net/media.js';
import { Feeds, RemoteAudio } from './Feeds.jsx';
import { FaceIcon } from './FaceIcon.jsx';
import { PHASE, OUTCOME, TIMING } from '../../shared/constants.js';
import { visiblyAlive, visibleLives } from '../three/choreo.js';
import { MurderHud } from './MurderHud.jsx';

export function useTick(ms = 100) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

const elapsed = () => performance.now() - useStore.getState().phaseLocalStart;

/** Target: the chamber, right there, the whole time. Keep your face still. */
function ChamberCard({ chamber, chaos }) {
  const loaded = chamber === 'loaded';
  return (
    <div className="peek">
      <div className={`peek-card ${loaded ? 'loaded' : 'empty'}`}>
        <div className="peek-cyl">
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className={i === 0 ? (loaded ? 'pip live' : 'pip void') : 'pip'} />
          ))}
        </div>
        <strong>{loaded ? 'LOADED' : 'EMPTY'}</strong>
        <small>
          {chaos
            ? loaded
              ? 'If they shoot you, you lose a life. Make them think it\'s empty.'
              : 'If they shoot you, they lose a life instead. Make them do it.'
            : loaded
              ? 'If they pull it, you die. Talk them out of it.'
              : "If they pull it, it's their turn to put it to their own head. Make them."}
        </small>
      </div>
      <div className="peek-title">Only you can see this. Don't let your face give it away.</div>
    </div>
  );
}

/** The "everyone but the shooter sees it" option: spectators watch knowing. */
function SpectatorChamber({ game }) {
  const loaded = game.chamber === 'loaded';
  const name = (id) => game.players.find((p) => p.id === id)?.name ?? '?';
  const S = name(game.shooterId);
  const right = game.variant === 'chaos' ? (loaded ? `shoot ${name(game.targetId)}` : 'shoot themselves') : loaded ? 'shoot' : 'pass';
  return (
    <div className="peek ghost-peek spectator-peek">
      <div className={`peek-card ${loaded ? 'loaded' : 'empty'}`}>
        <strong>{loaded ? 'LOADED' : 'EMPTY'}</strong>
        <small>
          The right call for {S}: {right}.
        </small>
      </div>
      <div className="peek-title">Everyone can see this except {S}. Will they guess right?</div>
    </div>
  );
}

/** Ghosts know every chamber. The living can't hear them say so. */
function GhostChamber({ game }) {
  const loaded = game.chamber === 'loaded';
  const name = (id) => game.players.find((p) => p.id === id)?.name ?? '?';
  return (
    <div className="peek ghost-peek">
      <div className={`peek-card ${loaded ? 'loaded' : 'empty'}`}>
        <strong>{loaded ? 'LOADED' : 'EMPTY'}</strong>
        <small>
          {loaded
            ? `If ${name(game.shooterId)} pulls it, ${name(game.targetId)} dies.`
            : `If ${name(game.shooterId)} pulls it, the gun turns on them.`}
        </small>
      </div>
      <div className="peek-title">You see what only {name(game.targetId)} sees.</div>
    </div>
  );
}

function ShooterControls({ game }) {
  if (game.variant === 'chaos') return <ChaosControls game={game} />;
  return <ClassicControls game={game} />;
}

/** Chaos: call it. Shoot them (it's loaded) or shoot yourself (it's empty). */
function ChaosControls({ game }) {
  useTick(200);
  const mouseLocked = useStore((s) => s.pointerLocked);
  const [busy, setBusy] = useState(false);
  const el = elapsed();
  const dur = game.deadline ? game.deadline - game.phaseStartedAt : 0;
  const left = dur ? Math.max(0, dur - el) : null;
  const locked = el < TIMING.minStare;
  const target = game.players.find((p) => p.id === game.targetId)?.name ?? 'them';
  const fire = async (action) => {
    setBusy(true);
    const res = await session.act(action);
    if (!res?.ok) setBusy(false);
  };
  return (
    <div className="shooter-ui">
      <div className="peek-title">
        {locked ? `Look at them. Really look. (${Math.ceil((TIMING.minStare - el) / 1000)})` : 'Fifty-fifty. Call it.'}
      </div>
      <div className={`shoot-row ${locked ? 'locked' : ''}`}>
        <button className="btn action pass" disabled={busy || locked} onClick={() => fire('self')}>
          Shoot yourself
          <small>empty: then {target} loses a life</small>
        </button>
        <button className="btn action shoot" disabled={busy || locked} onClick={() => fire('shoot')}>
          Shoot {target}
          <small>empty: you lose a life</small>
        </button>
      </div>
      <div className="mouse-hint">Left-click to SHOOT THEM · Right-click to SHOOT YOURSELF{mouseLocked ? '' : ' (click the room first)'}</div>
      {left !== null && (
        <div className="timer">
          <div className="timer-bar" style={{ width: `${(left / dur) * 100}%` }} />
          <span>{Math.ceil(left / 1000)}s, then the gun passes on its own</span>
        </div>
      )}
    </div>
  );
}

/** Chaos: your lives, bottom right. One heart goes the moment a shot takes it. */
function Hearts({ game, myId }) {
  useTick(150);
  const me = game.players.find((p) => p.id === myId);
  if (!me || game.variant !== 'chaos') return null;
  const n = visibleLives(me, game, elapsed());
  return (
    <div className="hearts" title={`${n} ${n === 1 ? 'life' : 'lives'} left`}>
      {Array.from({ length: 3 }, (_, i) => (
        <span key={i} className={`heart ${i < n ? 'full' : 'lost'}`}>
          ♥
        </span>
      ))}
    </div>
  );
}

function ClassicControls({ game }) {
  useTick(200);
  const mouseLocked = useStore((s) => s.pointerLocked);
  const [busy, setBusy] = useState(false);
  const el = elapsed();
  const dur = game.deadline ? game.deadline - game.phaseStartedAt : 0;
  const left = dur ? Math.max(0, dur - el) : null;
  const locked = el < TIMING.minStare;
  const fire = async (action) => {
    setBusy(true);
    const res = await session.act(action);
    if (!res?.ok) setBusy(false);
  };
  return (
    <div className="shooter-ui">
      <div className="peek-title">
        {locked ? `Look at them. Really look. (${Math.ceil((TIMING.minStare - el) / 1000)})` : 'One in four. Is it this one?'}
      </div>
      <div className={`shoot-row ${locked ? 'locked' : ''}`}>
        <button className="btn action pass" disabled={busy || locked} onClick={() => fire('pass')}>
          Pass
          <small>hand them the gun</small>
        </button>
        <button className="btn action shoot" disabled={busy || locked} onClick={() => fire('shoot')}>
          Shoot
          <small>empty = 1 in 4 on you</small>
        </button>
      </div>
      <div className="mouse-hint">Left-click to SHOOT · Right-click to PASS{mouseLocked ? '' : ' (click the room first)'}</div>
      {left !== null && (
        <div className="timer">
          <div className="timer-bar" style={{ width: `${(left / dur) * 100}%` }} />
          <span>{Math.ceil(left / 1000)}s, then the gun passes on its own</span>
        </div>
      )}
    </div>
  );
}

function Narration({ game }) {
  useTick(100);
  const name = (id) => game.players.find((p) => p.id === id)?.name ?? '?';
  const el = elapsed();
  if (game.phase === PHASE.AIMING) {
    return (
      <div className="narration">
        {el < 2400 ? (
          <>
            <b>{name(game.shooterId)}</b> spins the cylinder…
          </>
        ) : (
          <>
            …and levels it at <b>{name(game.targetId)}</b>.
          </>
        )}
      </div>
    );
  }
  if (game.phase !== PHASE.RESOLVING) return null;
  const r = game.result;
  const S = <b>{name(r.shooterId)}</b>;
  const T = <b>{name(r.targetId)}</b>;
  const squeeze = el < TIMING.cock ? <>{S} decides.</> : <>Click. The gun is ready…</>;
  const died = (id) => r.eliminated.some((e) => e.id === id);
  const lost = (who, id) => (died(id) ? <>{who} is dead.</> : <>{who} loses a life.</>);
  let line;
  if (r.outcome === OUTCOME.KILL) line = el < TIMING.trigger ? squeeze : game.variant === 'chaos' ? lost(T, r.targetId) : <>{T} is dead.</>;
  else if (r.outcome === OUTCOME.SELF_HIT)
    line = el < TIMING.trigger ? <>{S} puts it to their own head…</> : lost(S, r.shooterId);
  else if (r.outcome === OUTCOME.SELF_CLEAR)
    line =
      el < TIMING.trigger ? (
        <>{S} puts it to their own head…</>
      ) : el < TIMING.trigger + 1400 ? (
        <>Click.</>
      ) : el < TIMING.selfAim ? (
        <>Empty.</>
      ) : el < TIMING.selfShot ? (
        <>…and turns it on {T}.</>
      ) : (
        lost(T, r.targetId)
      );
  else if (r.outcome === OUTCOME.MISFIRE || r.outcome === OUTCOME.SURVIVED)
    line =
      el < TIMING.trigger ? (
        squeeze
      ) : el < TIMING.trigger + 1400 ? (
        <>Click.</>
      ) : el < TIMING.selfAim ? (
        <>Empty.</>
      ) : el < TIMING.selfShot ? (
        <>{S} turns the gun around…</>
      ) : r.outcome === OUTCOME.MISFIRE ? (
        game.variant === 'chaos' ? lost(S, r.shooterId) : <>{S} pays for the miss.</>
      ) : el < TIMING.selfShot + 1400 ? (
        <>Click.</>
      ) : (
        <>{S} lives. The gun goes to {T}.</>
      );
  else if (r.outcome === OUTCOME.TIMEOUT) line = <>{S} can't do it. The gun slides to {T}.</>;
  else line = el < 1800 ? <>{S} lowers the gun…</> : <>…and slides it across to {T}.</>;
  const selfRound = (r.outcome === OUTCOME.MISFIRE && game.variant !== 'chaos') || r.outcome === OUTCOME.SURVIVED;
  const shotRound = [OUTCOME.KILL, OUTCOME.MISFIRE, OUTCOME.SURVIVED, OUTCOME.SELF_HIT, OUTCOME.SELF_CLEAR].includes(r.outcome);
  const reveal = shotRound ? el > TIMING.trigger + 1400 : el > 2200;
  return (
    <div className={`narration big ${r.outcome}`}>
      {line}
      {reveal && <div className={`reveal ${r.loaded ? 'loaded' : 'empty'}`}>The chamber was {r.loaded ? 'LOADED' : 'EMPTY'}.</div>}
      {selfRound && el > TIMING.selfShot + 600 && (
        <div className={`reveal ${r.selfLoaded ? 'loaded' : 'empty'}`}>Their own pull: {r.selfLoaded ? 'LOADED' : 'EMPTY'}.</div>
      )}
    </div>
  );
}

/**
 * Who's at the table. Uses what's *visible* — the server already knows who dies
 * the moment the trigger is chosen, and showing that early spoils the shot.
 */
export function Roster({ game }) {
  useTick(150);
  const el = elapsed();
  return (
    <div className="roster">
      {game.players.map((p) => {
        const alive = visiblyAlive(p, game, el);
        return (
          <div
            key={p.id}
            className={`roster-p ${alive ? '' : 'dead'} ${p.id === game.shooterId ? 'shooter' : ''} ${p.id === game.targetId ? 'target' : ''}`}
          >
            <FaceIcon avatar={p.avatar} size={30} dead={!alive} />
            <span>{p.name}</span>
            {game.variant === 'chaos' && (
              <em className="roster-hearts">{'♥'.repeat(alive ? visibleLives(p, game, el) : 0) || '✕'}</em>
            )}
            {p.id === game.murdererId && <em className="roster-role">murderer</em>}
          </div>
        );
      })}
    </div>
  );
}

/** Your own death: the screen goes black, then you're a spectator. */
export function DeathScreen() {
  useTick(100);
  const deathAt = useStore((s) => s.deathAt);
  if (!deathAt) return null;
  const t = performance.now() - deathAt;
  if (t > TIMING.blackout) return null;
  const fadeOut = Math.max(0, (t - (TIMING.blackout - 1500)) / 1500);
  return (
    <div className="death" style={{ opacity: 1 - fadeOut }}>
      {t > 900 && <span>You're dead.</span>}
    </div>
  );
}

function Victory({ game, isLeader }) {
  const winner = game.players.find((p) => p.id === game.winnerId);
  return (
    <div className="victory panel">
      <div className="label">Last one standing</div>
      <h2>{winner ? winner.name : 'Nobody'}</h2>
      <table className="stats">
        <thead>
          <tr>
            <th />
            <th>Bluffs</th>
            <th>Kills</th>
            <th>Baited</th>
            <th>Survived own gun</th>
            <th>Passes</th>
            <th>Shots</th>
            {game.variant === 'chaos' && <th>Lives</th>}
          </tr>
        </thead>
        <tbody>
          {game.players.map((p) => (
            <tr key={p.id} className={p.id === game.winnerId ? 'win' : ''}>
              <td className="who">
                <FaceIcon avatar={p.avatar} size={26} dead={!p.alive} /> {p.name}
                {p.isBot && <em> (bot)</em>}
                {p.forfeited && <em> (left)</em>}
              </td>
              <td>{p.stats.bluffs}</td>
              <td>{p.stats.eliminations}</td>
              <td>{p.stats.survivedMisfires}</td>
              <td>{p.stats.selfSurvived ?? 0}</td>
              <td>{p.stats.passes}</td>
              <td>{p.stats.shots}</td>
              {game.variant === 'chaos' && <td>{'♥'.repeat(p.lives ?? 0) || '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="hint">
        {game.variant === 'chaos'
          ? 'Bluff = the shooter called it wrong while you held their eyes.'
          : 'Bluff = survived a loaded chamber because they passed, or baited a shot into an empty one.'}
      </p>
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

export function Hud() {
  const game = useStore((s) => s.game);
  const myId = useStore((s) => s.myId);
  const room = useStore((s) => s.room);
  const setScreen = useStore((s) => s.setScreen);
  const ghost = useStore((s) => s.ghost);
  const locked = useStore((s) => s.pointerLocked);
  const micMuted = useMedia((s) => s.micMuted);
  const hasLocal = useMedia((s) => !!s.local);
  if (!game) return null;
  if (game.mode === 'murder') return <MurderHud game={game} />;

  const me = game.players.find((p) => p.id === myId);
  const deciding = game.phase === PHASE.DECISION;
  const isShooter = game.shooterId === myId;
  const isTarget = game.targetId === myId;
  const solo = game.players.some((p) => p.isBot);

  return (
    <div className="hud">
      <RemoteAudio />
      <div className="hud-top">
        <div className="round">
          Round {game.turn}
          {game.variant === 'chaos' && <span className="badge chaos">Chaos</span>}
          {solo && <span className="badge">vs bot</span>}
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
      {game.phase !== PHASE.GAMEOVER && <Hearts game={game} myId={myId} />}

      {game.phase !== PHASE.GAMEOVER && <Feeds />}
      <Narration game={game} />

      <div className="hud-bottom">
        {deciding && isTarget && <ChamberCard chamber={game.chamber} chaos={game.variant === 'chaos'} />}
        {deciding && isShooter && <ShooterControls key={game.turn} game={game} />}
        {deciding && !isShooter && !isTarget && !ghost && game.chamber && <SpectatorChamber game={game} />}
        {deciding && !isShooter && !isTarget && !ghost && !game.chamber && <div className="spectate">Not your duel. Watch their faces.</div>}
        {deciding && ghost && game.chamber && <GhostChamber game={game} />}
      </div>

      {game.phase === PHASE.GAMEOVER && <Victory game={game} isLeader={room?.leaderId === myId} />}
      {game.phase !== PHASE.GAMEOVER && !locked && !ghost && <div className="lock-hint">Click to sit at the table and look around</div>}
      {game.phase !== PHASE.GAMEOVER && locked && !ghost && <div className="esc-hint">Esc frees your mouse</div>}
      {ghost && game.phase !== PHASE.GAMEOVER && (
        <>
          <div className="ghost-tint" />
          <div className="afterlife">
            <div className="afterlife-title">You're a ghost.</div>
            <div className="hint">Only other ghosts can see you. Your body stays at the table.</div>
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
