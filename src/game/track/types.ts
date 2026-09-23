export type EdgeKind = 'wall' | 'water' | 'lava' | 'drop';
export type ThemeId = 'sunny' | 'coast' | 'frost' | 'magma';

export interface ControlPoint {
  x: number;
  z: number;
  /** Elevation of the road centre (m). */
  y?: number;
  /** Road width override (m). */
  w?: number;
  /** Banking in degrees; positive lowers the right-hand side. */
  bank?: number;
}

/** A stretch of track addressed by (fractional) control point indices; wraps if from > to. */
export interface TrackSection {
  from: number;
  to: number;
  left?: EdgeKind;
  right?: EdgeKind;
  offroad?: number;
  ice?: boolean;
}

export interface BoostPadDef {
  at: number; // control point index
  lat?: number; // -1..1 across the road (positive = right)
  length?: number;
  width?: number;
}

export interface RampDef {
  at: number; // control point index where the ramp starts
  length: number;
  height: number;
  lat?: number;
  width?: number; // defaults to the full road width
  trick?: boolean; // glowing trick ramp
}

export interface TrackDef {
  id: string;
  name: string;
  theme: ThemeId;
  /** Closed loop; point 0 is the start/finish line. Racing direction is increasing index. */
  points: ControlPoint[];
  width: number;
  offroad: number;
  edge: EdgeKind;
  sections?: TrackSection[];
  itemRows: number[];
  boostPads?: BoostPadDef[];
  ramps?: RampDef[];
  /** Stretches with no road surface (jumped over from a ramp). */
  gaps?: { from: number; to: number }[];
  seed: number;
}
