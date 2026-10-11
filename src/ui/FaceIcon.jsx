// Flat 2D portrait of an avatar config, for lobby lists and feed placeholders.
import React from 'react';

export function FaceIcon({ avatar: a, size = 40, dead = false }) {
  const eyeRy = { round: 3, narrow: 1.4, wide: 4, sleepy: 2 }[a.eyeShape] ?? 3;
  const mouth = {
    neutral: 'M17 30 h10',
    smile: 'M16 29 q6 5 12 0',
    frown: 'M16 32 q6 -5 12 0',
    smirk: 'M17 31 q6 0 11 -3',
    open: null,
  }[a.mouth];
  const browY = a.brows === 'raised' ? 14 : 16;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" style={{ filter: dead ? 'grayscale(1) brightness(.5)' : 'none' }}>
      <rect width="44" height="44" rx="6" fill="#1a120c" />
      <path d="M6 44 q16 -14 32 0" fill={a.shirt} />
      {a.hair === 'afro' && <circle cx="22" cy="17" r="15" fill={a.hairColor} />}
      {a.hair === 'long' && <rect x="9" y="12" width="26" height="22" rx="6" fill={a.hairColor} />}
      <ellipse cx="22" cy="22" rx="11" ry="13" fill={a.skin} />
      {['short', 'long', 'bun', 'slick'].includes(a.hair) && (
        <path d="M11 20 q0 -12 11 -12 q11 0 11 12 q-4 -6 -11 -6 q-7 0 -11 6z" fill={a.hairColor} />
      )}
      {a.hair === 'bun' && <circle cx="22" cy="7" r="4" fill={a.hairColor} />}
      {a.hair === 'mohawk' && <rect x="20" y="3" width="4" height="9" fill={a.hairColor} />}
      {a.facialHair === 'beard' && <path d="M12 26 q10 14 20 0 q-2 8 -10 9 q-8 -1 -10 -9z" fill={a.hairColor} />}
      {a.facialHair === 'stubble' && <path d="M12 26 q10 14 20 0" fill={a.hairColor} opacity=".35" />}
      {a.facialHair === 'goatee' && <rect x="20" y="31" width="4" height="5" fill={a.hairColor} />}
      {['mustache', 'goatee', 'beard'].includes(a.facialHair) && <rect x="17" y="27" width="10" height="2" fill={a.hairColor} />}
      {a.brows !== 'none' && (
        <g stroke={a.hairColor} strokeWidth={a.brows === 'thick' ? 2.4 : 1.4}>
          <line x1="14" y1={browY + (a.brows === 'angry' ? -1 : 0)} x2="19" y2={browY + (a.brows === 'angry' ? 1 : 0)} />
          <line x1="25" y1={browY + (a.brows === 'angry' ? 1 : 0)} x2="30" y2={browY + (a.brows === 'angry' ? -1 : 0)} />
        </g>
      )}
      {dead ? (
        <g stroke="#111" strokeWidth="1.5">
          <path d="M14 18 l4 4 M18 18 l-4 4 M26 18 l4 4 M30 18 l-4 4" />
        </g>
      ) : (
        <g>
          <ellipse cx="16.5" cy="20" rx="2.6" ry={eyeRy} fill="#eee" />
          <ellipse cx="27.5" cy="20" rx="2.6" ry={eyeRy} fill="#eee" />
          <circle cx="16.5" cy="20" r="1.3" fill={a.eyeColor} />
          <circle cx="27.5" cy="20" r="1.3" fill={a.eyeColor} />
        </g>
      )}
      {mouth ? (
        <path d={mouth} stroke="#6a2f2a" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      ) : (
        <ellipse cx="22" cy="30" rx="3" ry="2" fill="#1d0a08" />
      )}
      {a.accessory === 'glasses' && (
        <g stroke="#111" fill="none" strokeWidth="1">
          <circle cx="16.5" cy="20" r="3.6" />
          <circle cx="27.5" cy="20" r="3.6" />
          <line x1="20" y1="20" x2="24" y2="20" />
        </g>
      )}
      {a.accessory === 'shades' && <path d="M12 18 h9 v4 h-9z M23 18 h9 v4 h-9z M21 19 h2" fill="#050505" stroke="#050505" />}
      {a.accessory === 'eyepatch' && <circle cx="16.5" cy="20" r="3.6" fill="#050505" />}
      {a.accessory === 'cap' && <path d="M10 13 q12 -14 24 0 z M22 12 h14 v2 h-14z" fill="#5a1f1f" />}
      {a.accessory === 'cigar' && <rect x="25" y="29" width="9" height="2" fill="#5b3a1e" />}
    </svg>
  );
}
