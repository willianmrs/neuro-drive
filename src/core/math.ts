export interface Vec { x: number; y: number }
export const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
export const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
/** Parameter along AB at its intersection with CD. Collinear rays have no unique hit. */
export function intersection(a: Vec, b: Vec, c: Vec, d: Vec): number | null {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y;
  const den = cross(rx, ry, sx, sy);
  if (Math.abs(den) < 1e-9) return null;
  const qx = c.x - a.x, qy = c.y - a.y;
  const t = cross(qx, qy, sx, sy) / den, u = cross(qx, qy, rx, ry) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? clamp(t, 0, 1) : null;
}
export function pointInPolygon(p: Vec, polygon: Vec[]) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function hashSeed(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Mulberry32. All evolution randomness goes through this seeded generator. */
export class Random {
  private state: number;
  constructor(seed: string | number) { this.state = typeof seed === 'string' ? hashSeed(seed) : seed >>> 0; }
  next() {
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  }
  normal() { return Math.sqrt(-2 * Math.log(Math.max(1e-12, this.next()))) * Math.cos(2 * Math.PI * this.next()); }
}
