// Shared between the Node server and the browser client.

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const CODE_LENGTH = 5;
// No 0/O/1/I/L — codes get read aloud over voice chat.
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Every single trigger pull — at the target or at yourself — is an independent
// 1-in-4. No memory: five empty clicks in a row don't make the sixth more likely.
export const LOAD_CHANCE = 1 / 4;

export const PHASE = {
  AIMING: 'aiming', // gun swings to the target, cylinder spins
  DECISION: 'decision', // target can peek, shooter picks PASS / SHOOT
  RESOLVING: 'resolving', // outcome animation plays
  GAMEOVER: 'gameover',
};

export const OUTCOME = {
  PASS: 'pass',
  KILL: 'kill', // shot, chamber loaded: target dies
  MISFIRE: 'misfire', // shot was empty; shooter's own pull was loaded: shooter dies
  SURVIVED: 'survived', // shot was empty; shooter's own pull was empty too: nobody dies
  TIMEOUT: 'timeout', // shooter ran out of time: treated as a pass
};

// Milliseconds. The resolution timeline is what both the server timers and the
// client animation/sound cues are keyed off, so they stay in step.
// Deliberately slow: the waiting is the game.
export const TIMING = {
  aim: 4500, // slow cylinder spin, gun swings round
  minStare: 4000, // shooter must hold the stare this long before acting
  decision: 45000,
  resolve: {
    [OUTCOME.PASS]: 4500,
    [OUTCOME.TIMEOUT]: 4500,
    [OUTCOME.KILL]: 8500,
    [OUTCOME.MISFIRE]: 12000,
    [OUTCOME.SURVIVED]: 12500,
  },
  // cue offsets inside the resolving phase
  cock: 700, // one loud click: the gun is ready. Then nothing until the trigger.
  trigger: 2900, // trigger pull (bang or click)
  selfAim: 5200, // misfire: after the silence, the gun slowly turns on the shooter
  selfShot: 8400, // misfire: the self-inflicted shot
  blackout: 5000, // how long your screen stays black after you die
};

export const BOT_NAMES = ['Dutch', 'Velma', 'Rook', 'Hollis', 'Mae', 'Abel'];
