# Max's Gun Game

A 3D bluffing game for 2–6 players with live webcams. Each turn the Shooter aims
at the next player anti-clockwise. **Only the Target sees whether the chamber is
loaded** (every pull is an independent 1-in-4). The Shooter reads the Target's face and
either **passes** the gun to them or **shoots**:

- loaded → the Target dies and the Shooter aims at the next player
- empty → the Shooter must turn the gun on themselves and pull again: another
  independent 1-in-4. Either way the Target takes the gun next.

The last player alive wins.

## Murder! (5–12 players)

The leader picks **Murder!** in the lobby and sets how many bodies the murderer
needs: 3–8, never more than the other players.

- **Roles:** one secret player is the murderer, and everyone else is innocent.
- **Guns:** everyone holds a gun and can shoot anyone at any time.
  - **First click:** cocks it. The click is audible, and in the light your gun
    visibly comes up.
  - **Second click:** fires at whoever is under your crosshair.
  - **Every shot:** needs its own cock first.
  - **Right-click:** eases the hammer back down.
- **Blackouts:** the lights go out 15 s in, then after every 20 s of light, for
  10 s each time.
  - Everyone gets **one shot per blackout**; in the light, as many as they like.
  - **The murderer sees in the dark** (a dim, cold view). Everyone else sees
    black, and their shots and clicks come from no particular direction: the
    server doesn't even tell them who fired. In the light, sounds are panned to
    the shooter's seat.
  - Innocents only find bodies from the dark when the lights come back, and who
    fired in the dark is never revealed to them until the game ends.
- **Winning:** every death of a non-murderer counts for the murderer, including
  innocents shot by innocents. If the goal is reached, the murderer wins. If the
  murderer is shot, the table wins.
- **Ghosts:** they work as in Classic. They hear everyone, only other ghosts hear
  them, they see through the dark dimly, and they're told who the murderer is.
- **Webcams:** not shown in Murder!. Twelve-way peer-to-peer video is too much
  upload for home connections. Voice is on the whole time.
- **Bots:** they act on what a person at the table could know.
  - They grow suspicious of anyone who kills or fires in the light, cocks a gun
    in the light, or had their hammer back when the lights went out.
  - When a body turns up, each innocent bot gets a "gut read", their version of
    reading faces: right about a third of the time, otherwise wrong.
  - A bot only shoots once its suspicion passes a bar, and the bar drops as the
    bodies pile up. Only one bot moves at a time.
  - A murderer bot kills in nearly every blackout.
  - `node scripts/murder-bots-sim.mjs [games] [players]` plays bot-only games on a
    mocked clock. At tuning time the murderer won about 55% at 5–8 players and
    35% at 12, with about one shot in the light per game.

## Characters

- **Accessories:** wear several at once, one per place. Head: cap. Eyes:
  glasses, shades or eyepatch. Mouth: cigar. Picking one for a place that's
  already taken swaps it.
- **Facial hair:** built in the head's own shape, so it hugs the face. Stubble
  is a fine dot texture that fades out at the top. The moustache is a drooping
  chevron.
- `GUN_SELFTEST_FACE=<folder>` (with `GUN_USER_DATA`) captures each facial hair
  style and some accessory combinations.

## Giving it to friends (Windows + Mac)

The **Release** GitHub Actions workflow (`.github/workflows/release.yml`) builds
Windows, Apple-chip Mac and Intel Mac, smoke-tests each build, and publishes a
GitHub Release with one-line installers (`installer/`). Run it from the Actions
tab, or push a tag like `v0.2.0` (bump `version` in package.json first). Friends paste:

- **Windows** (PowerShell): `irm https://github.com/<owner>/<repo>/releases/latest/download/install.ps1 | iex`
- **Mac** (Terminal): `curl -fsSL https://github.com/<owner>/<repo>/releases/latest/download/install.sh | bash`

The commands avoid the "unverified app" blocks: files fetched by PowerShell/curl
aren't flagged as downloads, so SmartScreen/Gatekeeper don't stop the unsigned
app. The Mac app is ad-hoc signed (`scripts/after-pack.cjs`); there's no Apple
certificate. The repo must be public for the links to work without a login.

Locally, `npm run dist` builds `release/MaxsGunGame-Setup.exe` (installer) and
`MaxsGunGame-Portable.exe`. Opened from a browser download, those show
"Windows protected your PC" → **More info → Run anyway**.

**Playing:**
- **Alone:** Play → **Start vs bot**. A bot takes the other chair. It follows the
  same rules and shows a tell when it's the target, honest about two-thirds of the time.
- **With friends:**
  1. The host presses Play, then **Open to the internet**. About 15 s later an invite
     appears, like `quiet-river-12.trycloudflare.com/G7ZJ6`.
  2. Friends open the app → **Join friends** → paste the invite → **Join**.
  3. Everyone readies up and the host presses **Start**.

**Controls:** click the room once to sit down. The cursor is captured and moving
the mouse turns your head (within a neck's reach), no button needed. In a duel
you start facing your opponent. As the Shooter: **left-click shoots,
right-click passes**. **Esc** gives your cursor back (for Settings, Leave, the
on-screen buttons).

**Dying:** after the blackout your body stays slumped in the chair and you
become a ghost: mouse to look, **WASD** to drift, **Space / Shift** to rise and
sink, straight through walls and furniture, anywhere in the room around the
table (not out of it). Other ghosts see you; the living never do (the server only
sends ghost positions to dead players). **Leave game** is bottom-left: press Esc,
then click it.

**How a turn feels:**
- If you're the Shooter, you see through your own eyes, gun in hand, at the Target.
- If you're the Target, you look straight down the barrel at the Shooter, and you
  see LOADED/EMPTY on screen the whole time.
- Everyone else watches from their own chair, looking where they like.
- Turns are deliberately slow: a slow cylinder spin, then a 4 s forced stare before
  the Shooter can act (the server enforces it), a hammer cock, a long trigger squeeze
  with a rising heartbeat, and a blackout when you die. After a gunshot your hearing
  goes: everything turns to a muffled thud under a long ring. It's longer and harsher
  if you were in the duel.

Friends on the same Wi-Fi can use the "Same Wi-Fi invite" instead, with no tunnel.

How it works: the app runs the game server inside itself. "Open to the internet"
starts Cloudflare's free quick tunnel (bundled `cloudflared`, forced to `http2`
because UDP/QUIC is blocked on many networks), which gives the host's PC a
temporary public https address. No router setup or account is needed. The address
dies when the host closes the app.

The app's page always runs on its own `localhost`, so cameras work no matter where
the server is.

## Developing

```bash
npm install
npm run dev
```

Opens http://localhost:5173 (game server on 3001, proxied).

- `npm run app`: build and run the desktop app locally
- `npm test`: rules + invite parsing tests
- `npm run assets`: re-download the CC0 textures/music and `cloudflared` (needs Python + ffmpeg)
- `node scripts/tunnel-check.mjs 3001 --protocol http2`: end-to-end check that two
  players can create, join and start a match *through* a real tunnel

Self-tests (no screenshots of your desktop; camera access is denied while they run):
- `GUN_SELFTEST=<folder>`: starts a game vs the bot, measures fps, saves a capture of
  its own window and prints `SELFTEST {...}`. Add `GUN_SELFTEST_TUNNEL=1` to also test
  the internet invite.
- `GUN_SELFTEST_PLAY=<folder>`: plays one full round vs the bot and captures each
  stage (`PLAYTEST {...}`).
- `GUN_SELFTEST_SCENE=<folder>` + `GUN_SELFTEST_BOTS=n` + `GUN_SELFTEST_SHOTS=name@ms,…`:
  captures staged moments. Combine with the server's test-only overrides
  `GUN_TEST_ROLLS=0,1` (0 empty / 1 loaded, cycled), `GUN_TEST_BOT=shoot|pass`,
  `GUN_TEST_FIRST=last`.
- Self-tests never capture the mouse and deny camera access.
- `node scripts/ghost-check.mjs`: the living never receive ghost positions.
- `node scripts/lobby-check.mjs`: Start needs 2+ slots, bots fill up to 6.
- `node scripts/murder-check.mjs`: Murder! seat limits, and that the living learn
  nothing about who fired, who died or who's aiming while the lights are out.
- `GUN_SELFTEST_MURDER=<folder>` (+ `GUN_SELFTEST_BOTS`, `GUN_SELFTEST_STEPS="cock@ms,fire@ms,snap:name@ms,fps@ms"`):
  plays a Murder! match and fakes the pointer lock inside the page. Pair it with
  `GUN_TEST_MURDERER=<seat>|leader|first|last`, `GUN_TEST_DARK=periodMs,darkMs` and
  `GUN_TEST_BOT=idle|avenge|hunt`.

## Performance notes

Measured on an Intel Iris Xe:

- The first build ran at 29 fps. Depth of field alone halved the frame rate; it's gone.
- Webcam `<video>` elements layered over the WebGL canvas cost about 20 fps. Feeds
  are now drawn inside the 3D renderer as video textures (`src/three/FeedScreens.jsx`)
  behind transparent HTML frames.
- Render resolution follows a pixel budget per quality preset, then
  `PerformanceMonitor` adapts it to hold 60 fps.
- Only 3 dynamic lights: the lamp spot (shadows), the target light and the muzzle
  flash. The target light is never re-mounted, because changing the light count
  recompiles every shader (that caused 80 ms hitches).
- Result: a steady 60 fps (worst frame about 17 ms) in a 1386×823 window on
  Balanced, both in the browser and the packaged app.

Graphics presets (Settings → Graphics): High (smoke, SMAA, chromatic aberration),
Balanced (default), Low, Off.

## Layout

| Path | What |
| --- | --- |
| `shared/engine.js` | Pure rules + `viewFor()` (the only place that decides who sees the chamber) |
| `shared/runner.js` | Timers around the engine (one per room) |
| `shared/bot.js` | The solo-play opponent: same rules, minimum stare, unreliable tells; Murder! bots |
| `shared/murder.js` | Murder! rules + `murderView()` (the only place that decides what the living may know) |
| `server/index.js` | Rooms, codes, leader, ready/ping, per-player state, WebRTC signalling; `startServer()` |
| `electron/` | Desktop shell: embedded server, tunnel, camera permission, self-test |
| `src/net/` | Socket session, invites, WebRTC mesh, camera/mic + simulated webcams |
| `src/game/testMode.js` | Local runner + bots + dev overrides |
| `src/three/` | Bar scene (CC0 PBR textures), avatars, revolver, choreography, camera, feeds |
| `src/audio/sfx.js` | Synthesised SFX (layered gunshot, reverb, tinnitus, heartbeat, riser) + music bus |
| `src/ui/` | Menu, party, lobby + invites, customiser, settings, HUD, dev panel |

Asset licenses are in [CREDITS.md](CREDITS.md). Everything is CC0 or Apache-2.0.

## Known gaps

- Video between players is peer-to-peer with STUN only. If two players are both
  behind strict NATs (some mobile/corporate networks), their video won't connect;
  game state and the invite still work. Fixing that needs a TURN server.
- Quick tunnels are Cloudflare's free, no-SLA service. They're fine for friends,
  but not a production host.
- Windows only for now; Mac builds need a Mac or CI.
- Two players can pass back and forth forever. The 45 s timer only auto-passes.
- The bot can't read faces: as Shooter it just shoots about 45% of the time.
- No reconnect: closing the app mid-match forfeits your seat.
