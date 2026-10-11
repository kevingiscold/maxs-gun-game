import React, { useState } from 'react';
import { useStore } from '../store.js';
import { session } from '../net/session.js';
import { parseInvite } from '../net/invite.js';

export function PartyPanel({ onClose }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const run = async (fn) => {
    setBusy(true);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel party">
      <h2>Join friends</h2>
      <form
        className="join-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (parseInvite(code)) run(() => session.joinRoom(code));
        }}
      >
        <input
          className={`code-input ${code.length > 6 ? 'long' : ''}`}
          value={code}
          placeholder="Paste invite or code"
          spellCheck={false}
          onChange={(e) => setCode(e.target.value.trim())}
        />
        <button className="btn" disabled={busy || !parseInvite(code)}>
          {busy ? '…' : 'Join'}
        </button>
      </form>
      <p className="hint">Invites look like <code>quiet-river-12.trycloudflare.com/G7ZJ6</code>. The host gets one from their lobby.</p>
      {err && <p className="error">{err}</p>}
      <button className="btn ghost" onClick={onClose}>
        Back
      </button>
    </div>
  );
}

export function MainMenu() {
  const setScreen = useStore((s) => s.setScreen);
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const room = useStore((s) => s.room);
  const [party, setParty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const play = async () => {
    if (room) return setScreen('lobby');
    setBusy(true);
    setErr('');
    try {
      await session.createRoom();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="menu">
      <header className="title">
        <span className="title-small">Max's</span>
        <h1>Gun Game</h1>
        <p className="tagline">One in four. Every pull. Look them in the eye.</p>
      </header>

      {party ? (
        <PartyPanel onClose={() => setParty(false)} />
      ) : (
        <nav className="menu-list">
          <label className="name-field">
            <span>Your name</span>
            <input
              value={profile.name}
              maxLength={16}
              placeholder="Stranger"
              onChange={(e) => setProfile({ name: e.target.value })}
            />
          </label>
          <button className="btn primary big" disabled={busy} onClick={play}>
            {room ? `Back to table (${room.code})` : busy ? 'Pulling up a chair…' : 'Play'}
          </button>
          {!room && (
            <button className="btn big" onClick={() => setParty(true)}>
              Join friends
            </button>
          )}
          {err && <p className="error">{err}</p>}
          <button className="btn big" onClick={() => setScreen('customize')}>
            Character
          </button>
          <button className="btn big" onClick={() => setScreen('settings')}>
            Settings
          </button>
        </nav>
      )}
      <footer className="menu-foot">2–6 players · webcams on · bluff or die</footer>
    </div>
  );
}
