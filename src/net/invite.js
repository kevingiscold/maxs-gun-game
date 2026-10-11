// Invites are "<server>/<CODE>", e.g. "quiet-river-12.trycloudflare.com/G7ZJ6"
// or "192.168.1.20:3001/G7ZJ6". A bare code means "the server this page came from".
import { CODE_LENGTH, CODE_ALPHABET } from '../../shared/constants.js';

const CODE_RE = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);

/** @returns {{ server: string|null, code: string } | null} */
export function parseInvite(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const bare = raw.toUpperCase();
  if (CODE_RE.test(bare)) return { server: null, code: bare };

  let s = raw.replace(/\s+/g, '');
  if (!/^https?:\/\//i.test(s)) {
    // trycloudflare is https-only; LAN addresses are plain http
    s = (/trycloudflare\.com/i.test(s) ? 'https://' : 'http://') + s;
  }
  let url;
  try {
    url = new URL(s);
  } catch {
    return null;
  }
  const fromPath = url.pathname.split('/').filter(Boolean).pop() || '';
  const code = (url.searchParams.get('room') || fromPath).toUpperCase();
  if (!CODE_RE.test(code)) return null;
  return { server: url.origin, code };
}

export function formatInvite(server, code) {
  return `${String(server).replace(/^https?:\/\//, '').replace(/\/$/, '')}/${code}`;
}
