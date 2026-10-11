import { create } from 'zustand';
import { DEFAULT_AVATAR, sanitizeAvatar, sanitizeName } from '../shared/avatar.js';

const load = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};
const save = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode etc. */
  }
};

const storedProfile = load('mgg.profile', { name: '', avatar: DEFAULT_AVATAR });

export const DEFAULT_SETTINGS = {
  volume: 0.8, // SFX
  voiceVolume: 1, // other players' mics
  camId: '',
  micId: '',
  musicVolume: 0.35,
  quality: 'balanced', // high | balanced | low | off (see three/Scene.jsx Effects)
  freeLookSpeed: 1,
  version: 2,
};

function loadSettings() {
  const s = load('mgg.settings', DEFAULT_SETTINGS);
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem('mgg.settings'));
  } catch {
    /* unreadable: treat as fresh */
  }
  // v1 defaulted to 'high', which used depth of field and halved the frame rate.
  if (stored && (stored.version ?? 1) < 2) {
    if (s.quality === 'high') s.quality = 'balanced';
    s.version = 2;
    save('mgg.settings', s);
  }
  return s;
}

export const useStore = create((set, get) => ({
  // 'menu' | 'customize' | 'settings' | 'lobby' | 'game'
  screen: 'menu',
  setScreen: (screen) => set({ screen }),

  profile: { name: storedProfile.name, avatar: sanitizeAvatar(storedProfile.avatar) },
  setProfile: (patch) => {
    const profile = { ...get().profile, ...patch };
    profile.name = patch.name !== undefined ? String(patch.name).slice(0, 16) : profile.name;
    save('mgg.profile', profile);
    set({ profile });
  },
  displayName: () => sanitizeName(get().profile.name, 'Stranger'),

  settings: loadSettings(),
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    save('mgg.settings', settings);
    set({ settings });
  },

  // 'online' | null
  mode: null,
  // Server room payload — {code, leaderId, status, you, members, game}
  room: null,
  roomServer: null, // origin of the server we joined, null = this page's own
  tunnelUrl: null, // desktop app: public address while "open to the internet"
  game: null,
  myId: null,
  emotes: {}, // playerId -> {text, at}: bot tells
  pointerLocked: false, // mouse captured for looking around (Esc releases it)
  ghost: false, // you're dead and floating around as a ghost
  ghostIds: [], // other ghosts you've seen (positions live in three/Ghosts.jsx)
  firstPersonId: null, // whose eyes the camera is in (hide that head)
  // performance.now() when *you* died, for the blackout.
  deathAt: 0,

  toast: null,
  showToast: (text) => {
    set({ toast: { text, at: Date.now() } });
    setTimeout(() => get().toast?.text === text && set({ toast: null }), 3500);
  },

  // Local timestamp of when the current phase began, so animations don't rely
  // on server/client clock agreement.
  phaseKey: '',
  phaseLocalStart: 0,
  setGame: (game, myId) => {
    const key = game ? `${game.turn}:${game.phase}` : '';
    const prev = get();
    set({
      game,
      myId,
      phaseKey: key,
      phaseLocalStart: key !== prev.phaseKey ? performance.now() : prev.phaseLocalStart,
    });
  },
}));
