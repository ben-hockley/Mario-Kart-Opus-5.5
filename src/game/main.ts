import './ui/game.css';
import { App } from './core/app';
import { loadCharacterModels } from './kart/characterModels';
import { loadVehicleModels } from './kart/vehicleModels';
import { vehicleById } from './kart/vehicles';
import { LobbyState } from './states/menus';
import { RaceState } from './states/raceState';
import { showGarage } from './debug/garage';

async function main() {
  const ui = document.getElementById('ui')!;
  ui.innerHTML = '<div class="loading">Loading racers…</div>';
  try {
    await Promise.all([loadCharacterModels(), loadVehicleModels()]);
  } catch (e) {
    ui.innerHTML = `<div class="loading">Couldn't load the racers: ${(e as Error).message}</div>`;
    throw e;
  }
  ui.innerHTML = '';

  const params = new URLSearchParams(location.search);
  // Debug page for checking how drivers fit their vehicles (see garage.ts).
  if (params.has('garage')) return showGarage(params);

  const app = new App();

  // Debug shortcut: ?quick=<trackIndex>[&players=n][&vehicle=id] jumps straight into a race with keyboard control.
  if (params.has('quick')) {
    const n = Math.max(1, Math.min(4, Number(params.get('players') ?? 1)));
    app.addPlayer('kb');
    for (let i = 1; i < n; i++) app.addPlayer(`phone${i}`);
    if (params.has('vehicle')) for (const p of app.session.players) p.vehicleId = vehicleById(params.get('vehicle')!).id;
    app.session.mode = 'vs';
    app.session.buildRoster();
    app.start(new RaceState(app, Number(params.get('quick')) || 0));
  } else {
    app.start(new LobbyState(app));
  }

  (window as unknown as { __app: App }).__app = app;
}

main();
