// Bot-only Murder! games on a mocked clock: how often does the murderer win,
// how long do games last, and how trigger-happy are the innocents?
// node scripts/murder-bots-sim.mjs [games] [players]
import { mock } from 'node:test';
import { MurderRunner } from '../shared/runner.js';
import { createMurderBotDriver } from '../shared/bot.js';

const games = Number(process.argv[2]) || 40;
const n = Number(process.argv[3]) || 8;
mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });

const results = [];
for (let g = 0; g < games; g++) {
  const players = Array.from({ length: n }, (_, i) => ({ id: `b${i}`, name: `B${i}`, isBot: true }));
  let driver;
  const shots = { light: 0, dark: 0, lightKillsOfInnocents: 0, darkKillsByMurderer: 0 };
  const runner = new MurderRunner({
    players,
    killGoal: 4,
    onChange: () => {},
    onEvent: (e) => {
      if (e.type === 'shot') {
        shots[e.dark ? 'dark' : 'light'] += 1;
        const s = runner.state;
        if (e.killed && !e.dark && e.targetId !== s.murdererId) shots.lightKillsOfInnocents += 1;
        if (e.killed && e.dark && e.shooterId === s.murdererId) shots.darkKillsByMurderer += 1;
      }
      driver?.event(e);
    },
  });
  driver = createMurderBotDriver(runner, { aim: () => {} });
  runner.start();
  driver.start();
  const t0 = Date.now();
  while (runner.state.phase === 'playing' && Date.now() - t0 < 15 * 60000) mock.timers.tick(250);
  const s = runner.state;
  results.push({ winner: s.winner ?? 'timeout', secs: Math.round((Date.now() - t0) / 1000), blackouts: s.cycle, ...shots });
  driver.dispose();
  runner.dispose();
}
const avg = (k) => +(results.reduce((a, r) => a + r[k], 0) / results.length).toFixed(1);
const count = (w) => results.filter((r) => r.winner === w).length;
console.log(
  JSON.stringify({
    games,
    players: n,
    murdererWins: count('murderer'),
    tableWins: count('town'),
    timeouts: count('timeout'),
    avgSeconds: avg('secs'),
    avgBlackouts: avg('blackouts'),
    avgLightShots: avg('light'),
    avgDarkShots: avg('dark'),
    avgDarkKillsByMurderer: avg('darkKillsByMurderer'),
    avgInnocentsKilledInLight: avg('lightKillsOfInnocents'),
  }),
);
