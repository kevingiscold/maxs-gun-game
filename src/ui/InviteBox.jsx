// How friends reach this room: an internet invite (desktop app, via a Cloudflare
// quick tunnel), a same-Wi-Fi invite, or the address you joined through.
import React, { useEffect, useState } from 'react';
import { useStore } from '../store.js';
import { formatInvite } from '../net/invite.js';

function useLanInvite(code) {
  const [lan, setLan] = useState(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (window.gunApp) {
          const info = await window.gunApp.info();
          if (alive && info.lan[0]) setLan(formatInvite(`${info.lan[0]}:${info.port}`, code));
        } else {
          const info = await (await fetch('/api/info')).json();
          const port = location.port || (location.protocol === 'https:' ? 443 : 80);
          if (alive && info.lan[0]) setLan(formatInvite(`${info.lan[0]}:${port}`, code));
        }
      } catch {
        /* no LAN info: fine */
      }
    })();
    return () => {
      alive = false;
    };
  }, [code]);
  return lan;
}

const BROWSER_HINT = "Friends without the app open this in Chrome, Edge or Firefox on a computer. Lighter graphics, same game.";
const browserLink = (server, code) => `${String(server).replace(/\/$/, '')}/${code}`;

function CopyRow({ label, value, hint }) {
  const showToast = useStore((s) => s.showToast);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      showToast('Invite copied. Send it to your friends.');
    } catch {
      showToast(value);
    }
  };
  return (
    <div className="invite-row">
      <div className="label">{label}</div>
      <button className="invite-value" onClick={copy} title="Copy invite">
        <span>{value}</span>
        <em>copy</em>
      </button>
      {hint && <div className="hint">{hint}</div>}
    </div>
  );
}

export function InviteBox({ room }) {
  const roomServer = useStore((s) => s.roomServer);
  const tunnelUrl = useStore((s) => s.tunnelUrl);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const lan = useLanInvite(room.code);
  const isLocalPage = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

  // Joined someone else's server: the invite is just where we connected.
  if (roomServer) {
    return (
      <div className="invite">
        <CopyRow label="Invite" value={formatInvite(roomServer, room.code)} hint="Anyone with this can join while the host is online." />
        {roomServer.startsWith('https://') && <CopyRow label="Browser link" value={browserLink(roomServer, room.code)} hint={BROWSER_HINT} />}
      </div>
    );
  }

  const openToInternet = async () => {
    setBusy(true);
    setErr('');
    const res = await window.gunApp.startTunnel();
    setBusy(false);
    if (res.ok) useStore.setState({ tunnelUrl: res.url });
    else setErr(res.error);
  };

  return (
    <div className="invite">
      {window.gunApp ? (
        tunnelUrl ? (
          <>
            <CopyRow label="Internet invite" value={formatInvite(tunnelUrl, room.code)} hint="Friends with the app paste this into Join. Works from anywhere." />
            <CopyRow label="Browser link" value={browserLink(tunnelUrl, room.code)} hint={BROWSER_HINT} />
          </>
        ) : (
          <div className="invite-row">
            <button className="btn primary" disabled={busy} onClick={openToInternet}>
              {busy ? 'Opening… (about 15 s)' : 'Open to the internet'}
            </button>
            <div className="hint">Creates a temporary public address for this match through Cloudflare. No router setup.</div>
          </div>
        )
      ) : (
        !isLocalPage &&
        (location.protocol === 'https:' ? (
          <CopyRow label="Browser link" value={browserLink(location.origin, room.code)} hint={BROWSER_HINT} />
        ) : (
          <CopyRow label="Invite" value={formatInvite(location.origin, room.code)} />
        ))
      )}
      {err && <p className="error">{err}</p>}
      {lan && <CopyRow label="Same Wi-Fi invite" value={lan} />}
    </div>
  );
}
