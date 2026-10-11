import React from 'react';
import { useStore } from '../store.js';
import { session } from '../net/session.js';
import { useMedia, setMicMuted } from '../net/media.js';
import { FaceIcon } from './FaceIcon.jsx';
import { InviteBox } from './InviteBox.jsx';
import { lockPointer, unlockPointer } from '../three/input.js';
import { MODE, MURDER, limitsFor } from '../../shared/constants.js';
import { goalRange, clampGoal } from '../../shared/murder.js';

const MODES = [
  { id: MODE.CLASSIC, name: 'Classic', blurb: 'Roulette duels: read the target, pass or shoot. 2–6 players.' },
  { id: MODE.MURDER, name: 'Murder!', blurb: 'Everyone is armed. One secret murderer who sees in the dark. The lights keep going out. 5–12 players.' },
];

/** Leader picks the mode; everyone sees it. Murder! also sets the body count. */
function ModePicker({ room, isLeader }) {
  const mode = room.mode || MODE.CLASSIC;
  const n = room.members.length;
  const range = n >= 5 ? goalRange(n) : { min: MURDER.goalMin, max: MURDER.goalMax };
  const goal = n >= 5 ? clampGoal(room.killGoal, n) : room.killGoal;
  const setGoal = (g) => session.setRoomSettings({ killGoal: Math.min(range.max, Math.max(range.min, g)) });
  return (
    <div className="mode-picker">
      <div className="mode-row">
        {MODES.map((m) => (
          <button
            key={m.id}
            className={`mode-btn ${mode === m.id ? 'on' : ''}`}
            disabled={!isLeader}
            onClick={() => session.setRoomSettings({ mode: m.id })}
          >
            <b>{m.name}</b>
            <small>{m.blurb}</small>
          </button>
        ))}
      </div>
      {mode === MODE.MURDER && (
        <div className="goal-row">
          <span>Bodies the murderer needs</span>
          {isLeader && (
            <button className="btn small" disabled={goal <= range.min} onClick={() => setGoal(goal - 1)}>
              −
            </button>
          )}
          <b className="goal">{goal}</b>
          {isLeader && (
            <button className="btn small" disabled={goal >= range.max} onClick={() => setGoal(goal + 1)}>
              +
            </button>
          )}
          <small className="hint">
            {range.min}–{range.max}
            {n < 5 ? ' (never more than the other players)' : ''}
          </small>
        </div>
      )}
    </div>
  );
}

export function Lobby() {
  const room = useStore((s) => s.room);
  const showToast = useStore((s) => s.showToast);
  const localError = useMedia((s) => s.localError);
  const hasCam = useMedia((s) => !!s.local);
  const micMuted = useMedia((s) => s.micMuted);

  if (!room) return null;
  const me = room.members.find((m) => m.id === room.you);
  const isLeader = room.leaderId === room.you;
  const { min: MIN_PLAYERS, max: MAX_PLAYERS } = limitsFor(room.mode);
  const full = room.members.length >= MAX_PLAYERS;
  const enough = room.members.length >= MIN_PLAYERS;
  const over = room.members.length > MAX_PLAYERS;

  const start = async () => {
    lockPointer();
    const res = await session.start();
    if (!res?.ok) {
      unlockPointer();
      showToast(res?.error || 'Could not start.');
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(room.code);
      showToast('Room code copied.');
    } catch {
      showToast(`Code: ${room.code}`);
    }
  };

  return (
    <div className="lobby">
      <div className="panel lobby-panel">
        <div className="lobby-head">
          <div>
            <div className="label">Room code</div>
            <button className="room-code" onClick={copy} title="Copy">
              {room.code}
            </button>
          </div>
          <div className="count">
            {room.members.length}/{MAX_PLAYERS}
          </div>
        </div>
        <InviteBox room={room} />
        <ModePicker room={room} isLeader={isLeader} />

        <ul className="members">
          {room.members.map((m) => (
            <li key={m.id} className={m.id === room.you ? 'me' : ''}>
              <FaceIcon avatar={m.avatar} size={42} />
              <div className="m-name">
                {m.id === room.leaderId && <span className="crown" title="Party leader">♛</span>}
                {m.name}
                {m.id === room.you && <em> (you)</em>}
                {m.isBot && <span className="bot-tag">bot</span>}
              </div>
              {m.isBot ? (
                isLeader && (
                  <button className="btn small ghost remove-bot" onClick={() => session.removeBot(m.id)} title="Remove bot">
                    ✕
                  </button>
                )
              ) : (
                <>
                  <span className={`ping ${m.ping > 200 ? 'bad' : m.ping > 100 ? 'meh' : ''}`}>{m.ping ? `${m.ping} ms` : '—'}</span>
                  <span className={`ready ${m.ready || m.id === room.leaderId ? 'ok' : ''}`}>
                    {m.id === room.leaderId ? 'leader' : m.ready ? 'ready' : 'not ready'}
                  </span>
                </>
              )}
            </li>
          ))}
          {Array.from({ length: Math.max(0, MAX_PLAYERS - room.members.length) }, (_, i) => (
            <li key={`e${i}`} className="empty">
              empty seat
            </li>
          ))}
        </ul>

        <div className="media-row">
          <span className={hasCam ? 'ok' : 'warn'}>{hasCam ? '● camera + mic on' : `○ ${localError || 'no camera'}`}</span>
          {hasCam && (
            <button className="btn small" onClick={() => setMicMuted(!micMuted)}>
              {micMuted ? 'Unmute mic' : 'Mute mic'}
            </button>
          )}
        </div>

        <div className="lobby-actions">
          {isLeader ? (
            <>
              <button className="btn" disabled={full} onClick={session.addBot}>
                Add bot
              </button>
              <button className="btn primary" disabled={!enough || over} onClick={start}>
                Start
              </button>
            </>
          ) : (
            <button className={`btn ${me?.ready ? '' : 'primary'}`} onClick={() => session.update({ ready: !me?.ready })}>
              {me?.ready ? 'Not ready' : 'Ready up'}
            </button>
          )}
          <button className="btn ghost" onClick={session.leave}>
            Leave
          </button>
        </div>
        {isLeader && !enough && <p className="hint">You need at least {MIN_PLAYERS} players. Add a bot, or invite a friend.</p>}
        {isLeader && over && <p className="hint">Classic seats {MAX_PLAYERS} at most. Remove a bot, or play Murder!.</p>}
        {!isLeader && <p className="hint">The party leader starts the match.</p>}
      </div>
    </div>
  );
}
