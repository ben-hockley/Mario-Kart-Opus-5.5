import './controller.css';
import { BTN, PLAYER_COLORS, type MenuAction, type PhoneMode, type ServerToPhone } from '../shared/protocol';
import { ControllerNet } from './net';
import { TiltSteering } from './tilt';

// ---------------------------------------------------------------------------
// Settings (persisted per phone)
// ---------------------------------------------------------------------------

interface Settings {
  mode: 'tilt' | 'touch';
  sens: number; // degrees of tilt for full lock
  autoGas: boolean;
  flick: boolean;
  invert: boolean;
  trim: number;
}

const SETTINGS_KEY = 'kart.settings';
const hasMotion = typeof DeviceMotionEvent !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const settings: Settings = {
  mode: hasMotion ? 'tilt' : 'touch',
  sens: 32,
  autoGas: false,
  flick: true,
  invert: false,
  trim: 0,
};
try {
  Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'));
} catch {
  // ignore corrupt or unavailable storage
}
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));

const net = new ControllerNet();
const tilt = new TiltSteering();
tilt.trim = settings.trim;

let started = false;
let assigned = false;
let hostConnected = false;
let mode: PhoneMode = 'wait';
let trickUntil = 0;

function setPlayer(num: number | null, color: string) {
  document.documentElement.style.setProperty('--pc', color);
  for (const el of $$('[data-badge]')) el.textContent = num ? `P${num}` : '…';
}

function showBanner(text: string, ms = 3000) {
  const el = $('#banner');
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout((showBanner as unknown as { t?: number }).t);
  (showBanner as unknown as { t?: number }).t = window.setTimeout(() => el.classList.add('hidden'), ms);
}

function updateScreen() {
  let name = 'start';
  if (started) {
    if (!net.connected) name = 'wait';
    else if (!hostConnected || mode === 'wait') name = 'wait';
    else name = mode;
  }
  for (const s of $$('.screen')) s.classList.toggle('active', s.id === `screen-${name}`);
  $('#wait-text').textContent = !net.connected
    ? 'Reconnecting…'
    : !hostConnected
      ? 'Waiting for the game screen… open it on your PC.'
      : 'Look at the TV!';
  document.body.classList.toggle('mode-tilt', settings.mode === 'tilt');
  document.body.classList.toggle('mode-touch', settings.mode === 'touch');
}

// ---------------------------------------------------------------------------
// Networking
// ---------------------------------------------------------------------------

net.onStatus = (connected) => {
  const startBtn = $<HTMLButtonElement>('#btn-start');
  if (!connected) {
    assigned = false;
    startBtn.disabled = true;
    $('#start-status').textContent = 'Connecting…';
  }
  updateScreen();
};

net.onMessage = (msg: ServerToPhone) => {
  switch (msg.t) {
    case 'assigned': {
      assigned = true;
      setPlayer(msg.slot + 1, PLAYER_COLORS[msg.slot]);
      $('#start-status').textContent = 'Connected!';
      $<HTMLButtonElement>('#btn-start').disabled = false;
      break;
    }
    case 'full':
      $('#start-status').textContent = 'The game already has 4 phones connected.';
      break;
    case 'host':
      hostConnected = msg.connected;
      if (!msg.connected) mode = 'wait';
      break;
    case 'you':
      setPlayer(msg.player + 1, msg.color);
      break;
    case 'mode':
      mode = msg.mode;
      $('#menu-hint').textContent = msg.hint ?? '';
      if (mode === 'race') calibrateHint();
      break;
    case 'rejected':
      showBanner(msg.reason, 5000);
      break;
  }
  updateScreen();
};

function calibrateHint() {
  if (settings.mode === 'tilt' && !tilt.available) showBanner('Tilt not detected – try Touch steering in ⚙');
}

// ---------------------------------------------------------------------------
// Start (user gesture: permissions, fullscreen, wake lock)
// ---------------------------------------------------------------------------

let wakeLock: { release(): Promise<void> } | null = null;
async function acquireWakeLock() {
  try {
    const nav = navigator as unknown as { wakeLock?: { request(type: 'screen'): Promise<{ release(): Promise<void> }> } };
    wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
  } catch {
    wakeLock = null;
  }
}

$('#btn-start').addEventListener('click', async () => {
  if (!assigned) return;
  const granted = await tilt.requestPermission();
  tilt.start();
  if (!granted && settings.mode === 'tilt') {
    settings.mode = 'touch';
    saveSettings();
    showBanner('Motion access denied – using touch steering');
  }
  try {
    await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    await (screen.orientation as unknown as { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    // not supported (iPhone) – fine
  }
  acquireWakeLock();
  started = true;
  updateScreen();
  setTimeout(() => {
    if (settings.mode === 'tilt' && !tilt.available) {
      settings.mode = 'touch';
      saveSettings();
      syncSettingsUI();
      updateScreen();
      showBanner('No motion sensor found – switched to touch steering');
    }
  }, 1500);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    net.ensureConnected();
    if (started && !wakeLock) acquireWakeLock();
  } else {
    wakeLock = null;
  }
});

tilt.onFlick = () => {
  if (settings.flick && settings.mode === 'tilt') trickUntil = performance.now() + 160;
};

// ---------------------------------------------------------------------------
// Multi-touch handling for race buttons + floating joystick
// ---------------------------------------------------------------------------

interface Ptr {
  x: number;
  y: number;
  joy: boolean;
}
const pointers = new Map<number, Ptr>();
const pressed = new Set<string>();
let joyOrigin: { x: number; y: number } | null = null;
let joyPointer = -1;
let joySteer = 0;
const JOY_RADIUS = 60;

const raceScreen = $('#screen-race');
const leftZone = $('#left-zone');
const joyBase = $('#joy-base');
const joyKnob = $('#joy-knob');

function refreshButtons() {
  pressed.clear();
  for (const p of pointers.values()) {
    if (p.joy) continue;
    const el = document.elementFromPoint(p.x, p.y)?.closest<HTMLElement>('[data-btn]');
    if (el && el.offsetParent !== null) pressed.add(el.dataset.btn!);
  }
  for (const el of $$('#screen-race [data-btn]')) el.classList.toggle('pressed', pressed.has(el.dataset.btn!));
}

raceScreen.addEventListener('pointerdown', (e) => {
  if ((e.target as HTMLElement).closest('.icon-btn')) return;
  e.preventDefault();
  const zoneRect = leftZone.getBoundingClientRect();
  const inLeft = e.clientX < zoneRect.right && e.clientY > zoneRect.top;
  const joy = settings.mode === 'touch' && inLeft && joyPointer < 0 && !(e.target as HTMLElement).closest('[data-btn]');
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, joy });
  if (joy) {
    joyPointer = e.pointerId;
    joyOrigin = { x: e.clientX - zoneRect.left, y: e.clientY - zoneRect.top };
    joyBase.style.left = `${joyOrigin.x}px`;
    joyBase.style.top = `${joyOrigin.y}px`;
    joyBase.classList.add('show');
    joyKnob.style.transform = '';
    joySteer = 0;
  }
  refreshButtons();
});

raceScreen.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  p.x = e.clientX;
  p.y = e.clientY;
  if (p.joy && joyOrigin) {
    const rect = leftZone.getBoundingClientRect();
    const dx = e.clientX - rect.left - joyOrigin.x;
    const dy = e.clientY - rect.top - joyOrigin.y;
    const len = Math.hypot(dx, dy);
    const k = len > JOY_RADIUS ? JOY_RADIUS / len : 1;
    joyKnob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    const raw = Math.max(-1, Math.min(1, dx / JOY_RADIUS));
    joySteer = Math.abs(raw) < 0.08 ? 0 : raw;
  } else {
    refreshButtons();
  }
});

function endPointer(e: PointerEvent) {
  const p = pointers.get(e.pointerId);
  if (!p) return;
  pointers.delete(e.pointerId);
  if (p.joy) {
    joyPointer = -1;
    joyOrigin = null;
    joySteer = 0;
    joyBase.classList.remove('show');
  }
  refreshButtons();
}
raceScreen.addEventListener('pointerup', endPointer);
raceScreen.addEventListener('pointercancel', endPointer);
document.addEventListener('contextmenu', (e) => e.preventDefault());

$('#btn-pause').addEventListener('click', () => net.send({ t: 'menu', a: 'pause' }));

// ---------------------------------------------------------------------------
// Menu d-pad / A / B with hold-to-repeat
// ---------------------------------------------------------------------------

for (const btn of $$('[data-menu]')) {
  const action = btn.dataset.menu as MenuAction;
  const repeats = ['up', 'down', 'left', 'right'].includes(action);
  let timer = 0;
  const stop = () => {
    btn.classList.remove('pressed');
    clearTimeout(timer);
    clearInterval(timer);
  };
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.setPointerCapture(e.pointerId);
    btn.classList.add('pressed');
    net.send({ t: 'menu', a: action });
    if (repeats) {
      timer = window.setTimeout(() => {
        timer = window.setInterval(() => net.send({ t: 'menu', a: action }), 140);
      }, 380);
    }
  });
  btn.addEventListener('pointerup', stop);
  btn.addEventListener('pointercancel', stop);
  btn.addEventListener('lostpointercapture', stop);
}

// ---------------------------------------------------------------------------
// Settings panel
// ---------------------------------------------------------------------------

const settingsEl = $('#settings');
function syncSettingsUI() {
  for (const b of $$('#seg-mode button')) b.classList.toggle('on', b.dataset.mode === settings.mode);
  $<HTMLInputElement>('#sens').value = String(settings.sens);
  $<HTMLInputElement>('#auto-gas').checked = settings.autoGas;
  $<HTMLInputElement>('#flick').checked = settings.flick;
  $<HTMLInputElement>('#invert').checked = settings.invert;
}
for (const b of $$('[data-open-settings]')) {
  b.addEventListener('click', () => {
    syncSettingsUI();
    settingsEl.classList.remove('hidden');
  });
}
$('#btn-close-settings').addEventListener('click', () => settingsEl.classList.add('hidden'));
for (const b of $$('#seg-mode button')) {
  b.addEventListener('click', async () => {
    settings.mode = b.dataset.mode as Settings['mode'];
    if (settings.mode === 'tilt') {
      await tilt.requestPermission();
      tilt.start();
    }
    saveSettings();
    syncSettingsUI();
    updateScreen();
  });
}
$<HTMLInputElement>('#sens').addEventListener('input', (e) => {
  settings.sens = Number((e.target as HTMLInputElement).value);
  saveSettings();
});
for (const [id, key] of [
  ['#auto-gas', 'autoGas'],
  ['#flick', 'flick'],
  ['#invert', 'invert'],
] as const) {
  $<HTMLInputElement>(id).addEventListener('change', (e) => {
    settings[key] = (e.target as HTMLInputElement).checked;
    saveSettings();
  });
}
$('#btn-calibrate').addEventListener('click', () => {
  tilt.calibrate();
  settings.trim = tilt.trim;
  saveSettings();
  showBanner('Straight-ahead angle set', 1500);
});
$('#btn-reset-cal').addEventListener('click', () => {
  tilt.trim = settings.trim = 0;
  saveSettings();
  showBanner('Calibration reset', 1500);
});

// ---------------------------------------------------------------------------
// Input send loop
// ---------------------------------------------------------------------------

let lastSent = '';
let lastSentAt = 0;
const wheel = $('#wheel .wheel-inner');

function currentSteer(): number {
  return settings.mode === 'tilt' ? tilt.steer(settings.sens, settings.invert) : joySteer;
}

setInterval(() => {
  const racing = started && mode === 'race' && hostConnected;
  let steer = 0;
  let bits = 0;
  if (racing) {
    steer = Math.round(currentSteer() * 100) / 100;
    if (pressed.has('accel') || (settings.autoGas && !pressed.has('brake'))) bits |= BTN.ACCEL;
    if (pressed.has('brake')) bits |= BTN.BRAKE;
    if (pressed.has('drift')) bits |= BTN.DRIFT;
    if (pressed.has('item')) bits |= BTN.ITEM;
    if (performance.now() < trickUntil) bits |= BTN.TRICK;
  }
  const key = `${steer}|${bits}`;
  const now = performance.now();
  if (key !== lastSent || now - lastSentAt > 100) {
    if (racing || key !== lastSent) net.send({ t: 'in', s: steer, b: bits });
    lastSent = key;
    lastSentAt = now;
  }
}, 16);

function animate() {
  if (settings.mode === 'tilt') wheel.style.transform = `rotate(${currentSteer() * 90}deg)`;
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

setInterval(() => {
  net.ping();
  $('#net-info').textContent = net.latencyMs ? `Latency: ${Math.round(net.latencyMs)} ms round trip` : 'Latency: –';
}, 2000);

// ---------------------------------------------------------------------------

setPlayer(null, PLAYER_COLORS[0]);
updateScreen();
net.connect();
