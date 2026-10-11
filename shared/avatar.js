// Avatar option catalogue + sanitiser. The server runs every incoming avatar
// through sanitizeAvatar so a client can't push arbitrary data to other players.

export const AVATAR_OPTIONS = {
  skin: ['#f6d7c3', '#eac09f', '#d7a07a', '#b97d55', '#8d5a3a', '#5e3a24', '#3f2617'],
  eyeShape: ['round', 'narrow', 'wide', 'sleepy'],
  eyeColor: ['#3b2a1e', '#4f7a3a', '#3d6fa8', '#7a7a7a', '#a4692b', '#1b1b1b'],
  brows: ['neutral', 'angry', 'raised', 'thick', 'none'],
  mouth: ['neutral', 'smile', 'frown', 'smirk', 'open'],
  hair: ['bald', 'short', 'long', 'mohawk', 'afro', 'bun', 'slick'],
  hairColor: ['#1a1410', '#4a3020', '#8a5a2b', '#c9a35a', '#a83a1e', '#9a9a9a', '#e8e2d0'],
  facialHair: ['none', 'stubble', 'mustache', 'goatee', 'beard'],
  accessory: ['none', 'glasses', 'shades', 'cap', 'eyepatch', 'cigar'],
  shirt: ['#5a1f1f', '#22303f', '#2f3a24', '#3b2d4a', '#6b5a3a', '#1c1c1c', '#c8b89a'],
};

export const DEFAULT_AVATAR = {
  skin: AVATAR_OPTIONS.skin[2],
  eyeShape: 'round',
  eyeColor: AVATAR_OPTIONS.eyeColor[0],
  brows: 'neutral',
  mouth: 'neutral',
  hair: 'short',
  hairColor: AVATAR_OPTIONS.hairColor[1],
  facialHair: 'stubble',
  accessory: 'none',
  shirt: AVATAR_OPTIONS.shirt[0],
};

export function sanitizeAvatar(input) {
  const out = { ...DEFAULT_AVATAR };
  if (!input || typeof input !== 'object') return out;
  for (const key of Object.keys(AVATAR_OPTIONS)) {
    if (AVATAR_OPTIONS[key].includes(input[key])) out[key] = input[key];
  }
  return out;
}

export function randomAvatar(rng = Math.random) {
  const out = {};
  for (const [key, list] of Object.entries(AVATAR_OPTIONS)) {
    out[key] = list[Math.floor(rng() * list.length)];
  }
  return out;
}

export function sanitizeName(name, fallback = 'Stranger') {
  const clean = String(name ?? '')
    .replace(/[\u0000-\u001f<>]/g, '')
    .trim()
    .slice(0, 16);
  return clean || fallback;
}
