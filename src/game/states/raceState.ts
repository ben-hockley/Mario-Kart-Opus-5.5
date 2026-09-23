import type { App, GameState, Player, RosterEntry } from '../core/app';
import { GP_POINTS, LAPS } from '../core/app';
import { Race } from '../race/race';
import { TRACKS } from '../track/tracks';
import { ChaseCamera } from '../render/chaseCamera';
import { Hud } from '../ui/hud';
import { emptyInput, type Kart, type KartEvent } from '../kart/kart';
import type { SfxName } from '../audio/sfx';
import { clamp, formatTime, ordinal } from '../core/math';
import { characterPortraits } from '../ui/portraits';
import { el, CharSelectState, LobbyState, PodiumState } from './menus';
import type * as THREE from 'three';

const STEP = 1 / 60;
/** Debug: ?speed=N runs the simulation N times faster. */
const SIM_SPEED = Math.max(1, Number(new URLSearchParams(location.search).get('speed') ?? 1));

type Sub = 'race' | 'pause' | 'results' | 'standings' | 'after';

const KART_SFX: Partial<Record<KartEvent, SfxName>> = {
  hop: 'hop',
  spark1: 'spark1',
  spark2: 'spark2',
  boost: 'boost',
  trick: 'trick',
  wall: 'wall',
  hit: 'hit',
  fall: 'fall',
  bump: 'bump',
};

export class RaceState implements GameState {
  private race!: Race;
  private hud!: Hud;
  private cams: ChaseCamera[] = [];
  private acc = 0;
  private time = 0;
  private sub: Sub = 'race';
  private overlay: HTMLElement | null = null;
  private menuSel = 0;
  private menuItems: { label: string; action: () => void }[] = [];
  private roulettePrev = new Map<Kart, number>();
  private tickTimer = 0;
  private pointsGiven = false;
  private grid: RosterEntry[] = [];

  constructor(
    private app: App,
    private trackIndex: number,
  ) {}

  enter() {
    const s = this.app.session;
    const def = TRACKS[this.trackIndex];
    this.grid = s.grid();
    this.race = new Race({ trackDef: def, racers: this.grid, difficulty: s.difficulty, laps: LAPS });
    if (new URLSearchParams(location.search).has('auto')) for (const k of this.race.humans) this.race.autopilot(k);
    this.race.humans.forEach((k, i) => {
      const cam = new ChaseCamera();
      cam.startIntro(k, i % 2 ? -1 : 1);
      this.cams.push(cam);
    });
    const t2 =
      s.mode === 'gp'
        ? `Grand Prix · Race ${s.gpRace + 1} of ${TRACKS.length}`
        : `Versus · ${LAPS} laps · ${s.difficulty} opponents`;
    this.hud = new Hud(this.app.hud, this.race, { t1: def.name, t2 });
    this.app.renderer.onResize = () => this.layout();
    this.app.renderer.renderer.setClearColor('#15122a');
    this.layout();
    this.app.sfx.setEngines(this.race.humans.length);
  }

  exit() {
    this.app.sfx.stopEngines();
    this.hud.destroy();
    this.overlay?.remove();
    this.app.renderer.onResize = () => {};
    this.race.dispose();
    this.app.renderer.clear();
  }

  phoneMode(p: Player) {
    if (this.sub === 'race') return { mode: 'race' as const };
    if (this.sub === 'pause') return { mode: 'menu' as const, hint: 'Paused' };
    return { mode: 'menu' as const, hint: p.index === 0 ? 'Press A to continue' : 'Waiting for P1…' };
  }

  private layout() {
    const r = this.app.renderer;
    const n = this.race.humans.length;
    this.hud.layout(r.layout(n), r.width, r.height);
  }

  // ---------------------------------------------------------------------------

  update(dt: number) {
    this.time += dt;
    const actions = this.app.menuActions();
    const race = this.race;

    if (this.sub === 'race') {
      if (actions.some((x) => x.a === 'pause')) {
        this.openPause();
        return;
      }
    } else {
      this.handleMenu(actions);
    }

    if (this.sub !== 'pause') {
      for (const p of this.app.session.players) {
        const kart = race.humans[p.index];
        const src = this.app.input.get(p.sourceId);
        if (!kart) continue;
        Object.assign(kart.input, src?.connected ? src.input : emptyInput());
      }
      this.acc += dt * SIM_SPEED;
      let steps = 0;
      const maxSteps = 6 * SIM_SPEED;
      while (this.acc >= STEP && steps < maxSteps) {
        race.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === maxSteps) this.acc = 0;
      this.processEvents(dt);
      if (race.isOver && this.sub === 'race') this.showResults();
    }

    this.render(dt);
    race.events.length = 0;
    race.items.events.length = 0;
  }

  private render(dt: number) {
    const race = this.race;
    const r = this.app.renderer;
    const alpha = this.sub === 'pause' ? 1 : clamp(this.acc / STEP, 0, 1);
    race.updateVisuals(alpha, this.sub === 'pause' ? 0 : dt, this.time);
    r.clear();
    const rects = r.layout(race.humans.length);
    race.humans.forEach((k, i) => {
      const cam = this.cams[i];
      const rect = rects[i];
      cam.camera.aspect = rect.w / rect.h;
      cam.update(k, this.sub === 'pause' ? 0 : dt);
      race.sky.position.copy(cam.camera.position);
      const ph = r.pixelHeight(rect);
      race.sparks.setViewportHeight(ph, cam.camera.fov);
      race.dust.setViewportHeight(ph, cam.camera.fov);
      r.renderView(race.scene, cam.camera, rect);
    });
    this.hud.update(this.sub === 'pause' ? 0 : dt);
  }

  // ---------------------------------------------------------------------------
  // Audio + banners
  // ---------------------------------------------------------------------------

  private volumeAt(pos: THREE.Vector3) {
    let best = Infinity;
    for (const h of this.race.humans) best = Math.min(best, h.pos.distanceTo(pos));
    return clamp(1 - best / 70, 0, 1) * 0.8;
  }

  private processEvents(dt: number) {
    const race = this.race;
    const sfx = this.app.sfx;
    for (const e of race.events) {
      switch (e.type) {
        case 'countdown':
          sfx.play('beep');
          break;
        case 'go':
          sfx.play('go');
          break;
        case 'lap':
          if (!e.kart.isHuman) break;
          if (e.lap === race.laps) {
            sfx.play('finalLap');
            this.hud.banner(e.kart, 'FINAL LAP!', 'gold', 2.2);
          } else {
            sfx.play('lap');
            this.hud.banner(e.kart, `LAP ${e.lap}`, '', 1.4);
          }
          break;
        case 'finish':
          if (!e.kart.isHuman) break;
          sfx.play('finish');
          this.hud.banner(e.kart, `FINISH! ${ordinal(e.kart.position)}`, e.kart.position <= 3 ? 'gold' : '', 6);
          break;
        case 'kart': {
          const name = KART_SFX[e.ev];
          if (!name) break;
          const vol = e.kart.isHuman ? 1 : this.volumeAt(e.kart.pos);
          sfx.play(name, vol);
          break;
        }
      }
    }
    for (const e of race.items.events) {
      switch (e.type) {
        case 'box':
          if (e.kart.isHuman) sfx.play('itemBox');
          break;
        case 'use':
          if (e.item === 'star') sfx.play('star', e.kart.isHuman ? 1 : this.volumeAt(e.kart.pos));
          break;
        case 'throw':
          sfx.play('throw', e.kart.isHuman ? 1 : this.volumeAt(e.kart.pos));
          break;
        case 'break':
          sfx.play('break', this.volumeAt(e.pos));
          break;
        case 'bounce':
          sfx.play('bounce', this.volumeAt(e.pos));
          break;
      }
    }

    // Roulette ticks for local players
    this.tickTimer -= dt;
    for (const k of race.humans) {
      const prev = this.roulettePrev.get(k) ?? 0;
      if (k.rouletteTimer > 0 && this.tickTimer <= 0) sfx.play('tick');
      if (prev > 0 && k.rouletteTimer <= 0) sfx.play('itemGet');
      this.roulettePrev.set(k, k.rouletteTimer);
    }
    if (this.tickTimer <= 0) this.tickTimer = 0.08;

    race.humans.forEach((k, i) => {
      const active = race.phase !== 'intro' && k.respawnTimer <= 0 && this.sub !== 'pause';
      sfx.updateEngine(i, clamp(k.speed / k.stats.maxSpeed, 0, 1.4), k.boostTimer > 0, k.drifting && k.grounded, active);
    });
  }

  // ---------------------------------------------------------------------------
  // Overlays: pause, results, standings, post-race menu
  // ---------------------------------------------------------------------------

  private setOverlay(html: string) {
    this.overlay?.remove();
    this.overlay = el(html);
    this.app.ui.appendChild(this.overlay);
  }

  private showMenu(title: string, items: { label: string; action: () => void }[], sub: Sub) {
    this.sub = sub;
    this.menuItems = items;
    this.menuSel = 0;
    this.setOverlay(`<div class="overlay-dim"><div class="screen-title">${title}</div><div class="options" data-opts style="margin:0"></div></div>`);
    this.renderMenu();
    this.app.syncPhones();
  }

  private renderMenu() {
    const box = this.overlay?.querySelector('[data-opts]');
    if (!box) return;
    box.innerHTML = '';
    this.menuItems.forEach((m, i) => {
      const node = el(`<div class="opt button ${i === this.menuSel ? 'sel' : ''}">${m.label}</div>`);
      node.addEventListener('click', () => m.action());
      box.appendChild(node);
    });
  }

  private openPause() {
    this.app.sfx.play('menuOk');
    this.app.sfx.stopEngines();
    this.showMenu(
      'Paused',
      [
        { label: 'Resume', action: () => this.resume() },
        { label: 'Restart race', action: () => this.app.setState(new RaceState(this.app, this.trackIndex)) },
        { label: 'Quit to lobby', action: () => this.app.setState(new LobbyState(this.app)) },
      ],
      'pause',
    );
  }

  private resume() {
    this.app.sfx.play('menuOk');
    this.overlay?.remove();
    this.overlay = null;
    this.sub = 'race';
    this.acc = 0;
    this.app.sfx.setEngines(this.race.humans.length);
    this.app.syncPhones();
  }

  private handleMenu(actions: ReturnType<App['menuActions']>) {
    for (const { player, sourceId, a } of actions) {
      const anyone = this.sub === 'pause' || this.sub === 'results' || this.sub === 'standings';
      if (!anyone && !(player?.index === 0 || sourceId === 'kb')) continue;
      if (this.sub === 'pause' && a === 'pause') return this.resume();
      if (this.sub === 'results' || this.sub === 'standings') {
        if (a === 'ok') {
          this.app.sfx.play('menuOk');
          return this.sub === 'results' ? this.afterResults() : this.afterStandings();
        }
        continue;
      }
      if (a === 'up' || a === 'down') {
        const n = this.menuItems.length;
        this.menuSel = (this.menuSel + (a === 'up' ? -1 : 1) + n) % n;
        this.app.sfx.play('menuMove');
        this.renderMenu();
      } else if (a === 'ok') {
        this.menuItems[this.menuSel]?.action();
        return;
      } else if (a === 'back' && this.sub === 'pause') {
        return this.resume();
      }
    }
  }

  private showResults() {
    const s = this.app.session;
    const results = this.race.results();
    const portraits = characterPortraits();
    if (s.mode === 'gp' && !this.pointsGiven) {
      this.pointsGiven = true;
      results.forEach((r, i) => {
        const entry = this.grid[r.kart.id];
        s.points.set(entry.key, (s.points.get(entry.key) ?? 0) + GP_POINTS[i]);
      });
    }
    this.sub = 'results';
    this.hud.root.style.display = 'none';
    const rows = results
      .map((r, i) => {
        const k = r.kart;
        const tag = k.isHuman ? `<span class="tag">P${k.playerIndex + 1}</span>` : '';
        const pts = s.mode === 'gp' ? `+${GP_POINTS[i]}` : '';
        return `<div class="rrow ${k.isHuman ? 'human' : ''}" style="--pc:${k.color};animation-delay:${i * 0.04}s">
          <div class="rpos">${ordinal(i + 1)}</div>
          <div class="who"><img src="${portraits.get(k.char.id)}" alt="">${k.char.name} ${tag}</div>
          <div class="rtime">${r.estimated ? '~' : ''}${formatTime(r.time)}</div>
          <div class="rpts">${pts}</div>
        </div>`;
      })
      .join('');
    this.setOverlay(`<div class="screen over-3d">
      <div class="screen-head"><div class="screen-title">Results</div><div class="screen-sub">${TRACKS[this.trackIndex].name}</div></div>
      <div class="results">${rows}</div>
      <div class="footer-hint"><span><span class="key">A</span> continue</span></div>
    </div>`);
    this.app.syncPhones();
  }

  private afterResults() {
    const s = this.app.session;
    if (s.mode === 'gp') {
      this.showStandings();
      return;
    }
    this.showMenu(
      'What next?',
      [
        { label: 'Race again', action: () => this.app.setState(new RaceState(this.app, this.trackIndex)) },
        {
          label: 'Next track',
          action: () => {
            s.trackIndex = (this.trackIndex + 1) % TRACKS.length;
            this.app.setState(new RaceState(this.app, s.trackIndex));
          },
        },
        { label: 'Change racers', action: () => this.app.setState(new CharSelectState(this.app)) },
        { label: 'Quit to lobby', action: () => this.app.setState(new LobbyState(this.app)) },
      ],
      'after',
    );
  }

  private showStandings() {
    const s = this.app.session;
    const portraits = characterPortraits();
    this.sub = 'standings';
    const rows = s
      .standings()
      .map(({ entry, points }, i) => {
        const human = entry.playerIndex >= 0;
        const tag = human ? `<span class="tag">P${entry.playerIndex + 1}</span>` : '';
        return `<div class="rrow ${human ? 'human' : ''}" style="--pc:${entry.color};animation-delay:${i * 0.04}s">
          <div class="rpos">${ordinal(i + 1)}</div>
          <div class="who"><img src="${portraits.get(entry.char.id)}" alt="">${entry.name} ${tag}</div>
          <div class="rtime"></div>
          <div class="rpts">${points}</div>
        </div>`;
      })
      .join('');
    const last = s.gpRace >= TRACKS.length - 1;
    this.setOverlay(`<div class="screen over-3d">
      <div class="screen-head"><div class="screen-title">Standings</div><div class="screen-sub">After race ${s.gpRace + 1} of ${TRACKS.length}</div></div>
      <div class="results">${rows}</div>
      <div class="footer-hint"><span><span class="key">A</span> ${last ? 'see the trophies' : `next race: ${TRACKS[s.gpRace + 1].name}`}</span></div>
    </div>`);
    this.app.syncPhones();
  }

  private afterStandings() {
    const s = this.app.session;
    if (s.gpRace >= TRACKS.length - 1) {
      this.app.setState(new PodiumState(this.app));
    } else {
      s.gpRace++;
      this.app.setState(new RaceState(this.app, s.gpRace));
    }
  }
}
