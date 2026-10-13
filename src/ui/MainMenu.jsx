import React, { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { session } from '../net/session.js';
import { parseInvite } from '../net/invite.js';
import { IN_BROWSER } from '../store.js';

// Opened in a browser from an invite link (https://<host>/<CODE>): straight to "join this table".
const urlInvite = IN_BROWSER ? parseInvite(location.pathname.replace(/^\/+/, '')) : null;
const touchOnly = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;

/**
 * Opened over plain http (the host's same-Wi-Fi address): the browser won't
 * allow a camera or mic here. Wait for the host's secure https link and jump to it.
 */
function InsecureNotice() {
  const [waiting, setWaiting] = useState(true);
  useEffect(() => {
    let alive = true;
    const check = async () => {
      try {
        const { publicUrl } = await (await fetch('/api/info')).json();
        if (alive && publicUrl) return location.replace(publicUrl + location.pathname + location.search);
      } catch {
        if (alive) setWaiting(false);
      }
      if (alive) setTimeout(check, 3000);
    };
    check();
    return () => {
      alive = false;
    };
  }, []);
  return (
    <div className="insecure-note">
      <b>Your camera and microphone are blocked on this link.</b> It's a plain <code>http://</code> address, and browsers only allow cameras on secure
      (<code>https://</code>) pages. Ask the host to press <b>Open to the internet</b> and send you the <b>Browser link</b>.
      {waiting && <span className="insecure-wait"> This page will switch to it by itself as soon as it exists.</span>}
    </div>
  );
}

function InviteLanding({ code }) {
  const profile = useStore((s) => s.profile);
  const setProfile = useStore((s) => s.setProfile);
  const setScreen = useStore((s) => s.setScreen);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const join = async () => {
    setBusy(true);
    setErr('');
    try {
      await session.joinRoom(code);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <nav className="menu-list">
      {!window.isSecureContext && <InsecureNotice />}
      <div className="landing-note">
        You're invited to table <b>{code}</b>
      </div>
      <label className="name-field">
        <span>Your name</span>
        <input value={profile.name} maxLength={16} placeholder="Stranger" onChange={(e) => setProfile({ name: e.target.value })} />
      </label>
      <button className="btn primary big" disabled={busy} onClick={join}>
        {busy ? 'Pulling up a chair…' : 'Join the table'}
      </button>
      {err && <p className="error">{err}</p>}
      <button className="btn big" onClick={() => setScreen('customize')}>
        Character
      </button>
      <button className="btn big" onClick={() => setScreen('settings')}>
        Settings
      </button>
      <p className="hint landing-hint">
        Playing in the browser: needs a mouse and keyboard. Your browser will ask to use your camera and microphone.
        {touchOnly && <b> This looks like a phone or tablet, which won't work: open the link on a computer.</b>}
      </p>
    </nav>
  );
}

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

      {urlInvite && !room && !party ? (
        <InviteLanding code={urlInvite.code} />
      ) : party ? (
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
      <footer className="menu-foot">2–12 players · webcams on · bluff or die</footer>
    </div>
  );
}
