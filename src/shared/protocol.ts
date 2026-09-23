// Messages exchanged between the game (host), the relay server and phone controllers.

export const WS_PATH = '/ws';
export const MAX_PHONES = 4;
export const MAX_PLAYERS = 4;

export const PLAYER_COLORS = ['#ff4d5e', '#2f8cff', '#2fd672', '#ffb020'];

/** Button bitmask used in `in` messages. */
export const BTN = {
  ACCEL: 1,
  BRAKE: 2,
  DRIFT: 4,
  ITEM: 8,
  TRICK: 16,
} as const;

export type MenuAction = 'up' | 'down' | 'left' | 'right' | 'ok' | 'back' | 'pause';

export type PhoneMode = 'menu' | 'race' | 'wait';

/** Phone -> server */
export type PhoneToServer =
  | { t: 'join'; token?: string }
  | { t: 'in'; s: number; b: number }
  | { t: 'menu'; a: MenuAction }
  | { t: 'ping'; id: number };

/** Host -> phone (relayed by the server) */
export type HostToPhone =
  | { t: 'mode'; mode: PhoneMode; hint?: string }
  | { t: 'you'; player: number; color: string; name?: string }
  | { t: 'rejected'; reason: string };

/** Server -> phone */
export type ServerToPhone =
  | { t: 'assigned'; slot: number; token: string }
  | { t: 'full' }
  | { t: 'host'; connected: boolean }
  | { t: 'pong'; id: number }
  | HostToPhone;

/** Host -> server */
export type HostToServer =
  | { t: 'host' }
  | { t: 'send'; slot: number; msg: HostToPhone };

/** Server -> host */
export type ServerToHost =
  | { t: 'phoneJoin'; slot: number }
  | { t: 'phoneLeave'; slot: number }
  | { t: 'in'; slot: number; s: number; b: number }
  | { t: 'menu'; slot: number; a: MenuAction };

export interface ServerInfo {
  controllerUrl: string;
  alternateUrls: string[];
  qrSvg: string;
}
