/**
 * Wheel-style tilt steering from the gravity vector.
 *
 * With the phone held sideways like a steering wheel, steering is the rotation of the
 * phone in its own screen plane. We read gravity in device coordinates (x, y) and take
 * its angle. That angle is independent of how far the phone leans back, and the sign of
 * a rotation is the same whichever way round the phone is held (and on iOS, which reports
 * the vector inverted). "Straight" snaps to whichever landscape horizontal is nearest,
 * plus an optional user trim.
 */

type MotionPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

const TAU = Math.PI * 2;
const wrap = (a: number) => a - TAU * Math.floor((a + Math.PI) / TAU);

export class TiltSteering {
  available = false;
  /** Raw roll relative to level, radians (positive = rotated clockwise = steer right). */
  roll = 0;
  trim = 0;
  onFlick: () => void = () => {};

  private gx = 0;
  private gy = 0;
  private neutral: number | null = null;
  private lastFlick = 0;

  /** Must be called from a user gesture on iOS. */
  async requestPermission(): Promise<boolean> {
    const DM = (window as unknown as { DeviceMotionEvent?: MotionPermission }).DeviceMotionEvent;
    if (DM && typeof DM.requestPermission === 'function') {
      try {
        const res = await DM.requestPermission();
        if (res !== 'granted') return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  start() {
    window.addEventListener('devicemotion', this.onMotion);
  }

  private onMotion = (e: DeviceMotionEvent) => {
    const g = e.accelerationIncludingGravity;
    if (!g || g.x == null || g.y == null) return;
    // Low-pass filter to remove hand shake and linear jolts.
    const k = this.available ? 0.35 : 1;
    this.gx += (g.x - this.gx) * k;
    this.gy += (g.y - this.gy) * k;
    this.available = true;

    const angle = Math.atan2(this.gy, this.gx);
    if (this.neutral === null || Math.abs(wrap(angle - this.neutral)) > (2 * Math.PI) / 3) {
      // Snap to the nearer landscape horizontal (0 or PI depending on how it is held).
      this.neutral = Math.abs(angle) < Math.PI / 2 ? 0 : Math.PI;
    }
    this.roll = wrap(angle - this.neutral);

    // An upward/downward flick of the wheel = pitch rotation spike.
    const r = e.rotationRate;
    if (r) {
      const pitch = Math.hypot(r.beta ?? 0, r.gamma ?? 0);
      const now = performance.now();
      if (pitch > 380 && now - this.lastFlick > 600) {
        this.lastFlick = now;
        this.onFlick();
      }
    }
  };

  /** Resets the neutral so the phone's current angle counts as straight. */
  calibrate() {
    this.trim = Math.max(-0.6, Math.min(0.6, this.roll));
  }

  /** Steering in [-1, 1]. */
  steer(maxDeg: number, invert: boolean): number {
    if (!this.available) return 0;
    const deg = ((this.roll - this.trim) * 180) / Math.PI;
    const dead = 2.5;
    const mag = Math.max(0, Math.abs(deg) - dead) / (maxDeg - dead);
    const v = Math.sign(deg) * Math.min(1, Math.pow(mag, 1.15));
    return invert ? -v : v;
  }
}
