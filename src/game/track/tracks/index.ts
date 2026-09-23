import type { TrackDef } from '../types';
import { sunnyCircuit } from './sunny';
import { coralCoast } from './coast';
import { frostyPeaks } from './frost';
import { magmaKeep } from './magma';

/** The cup, in Grand Prix order. */
export const TRACKS: TrackDef[] = [sunnyCircuit, coralCoast, frostyPeaks, magmaKeep];
