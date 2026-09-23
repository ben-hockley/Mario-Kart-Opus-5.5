import './ui/game.css';
import { App } from './core/app';
import { LobbyState } from './states/menus';
import { RaceState } from './states/raceState';

const app = new App();
const params = new URLSearchParams(location.search);

// Debug shortcut: ?quick=<trackIndex>[&players=n] jumps straight into a race with keyboard control.
if (params.has('quick')) {
  const n = Math.max(1, Math.min(4, Number(params.get('players') ?? 1)));
  app.addPlayer('kb');
  for (let i = 1; i < n; i++) app.addPlayer(`phone${i}`);
  app.session.mode = 'vs';
  app.session.buildRoster();
  app.start(new RaceState(app, Number(params.get('quick')) || 0));
} else {
  app.start(new LobbyState(app));
}

(window as unknown as { __app: App }).__app = app;
