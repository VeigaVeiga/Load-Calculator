import {
  Axis,
  DEFAULT_NUMBER_OF_DECIMALS,
  DEFAULT_SUPPORT_SURFACE_RATIO,
} from './constants.js';
import { aabbOverlap, rectIntersect } from './intersect.js';
import { Item } from './item.js';
import type { BinInput, Vec3 } from './types.js';

function scale(v: number, decimals: number): number {
  return Math.round(v * 10 ** decimals);
}

interface ObstacleBox {
  position: Vec3;
  whd: Vec3;
  label: string;
}

export class Bin {
  readonly partno: string;
  readonly whd: Vec3;
  readonly maxWeight: number;
  readonly fixPoint: boolean;
  readonly checkStable: boolean;
  readonly supportSurfaceRatio: number;
  readonly putType: 1 | 2;
  readonly corner: number; // integer-scaled

  /** Integer-scaled, validated obstacle AABBs (corner cubes + user obstacles). */
  private readonly obstacleBoxes: readonly ObstacleBox[];
  private obstaclesInjected = false;

  items: Item[] = [];
  unfittedInBin: Item[] = [];

  constructor(input: BinInput, numberOfDecimals: number = DEFAULT_NUMBER_OF_DECIMALS) {
    this.partno = input.partno;
    this.whd = [
      scale(input.whd[0], numberOfDecimals),
      scale(input.whd[1], numberOfDecimals),
      scale(input.whd[2], numberOfDecimals),
    ];
    this.maxWeight = scale(input.maxWeight, numberOfDecimals);
    this.fixPoint = input.fixPoint ?? true;
    this.checkStable = input.checkStable ?? true;
    this.supportSurfaceRatio = input.supportSurfaceRatio ?? DEFAULT_SUPPORT_SURFACE_RATIO;
    this.putType = input.putType ?? 1;
    this.corner = scale(input.corner ?? 0, numberOfDecimals);

    this.obstacleBoxes = this.buildObstacleBoxes(input, numberOfDecimals);
  }

  /**
   * Combine corner-cube AABBs and user-provided obstacle AABBs into a single
   * validated list. Throws on out-of-bounds, oversized corner, or any AABB
   * overlap between obstacles (touching faces are allowed).
   */
  private buildObstacleBoxes(
    input: BinInput,
    numberOfDecimals: number,
  ): readonly ObstacleBox[] {
    const boxes: ObstacleBox[] = [];

    if ((input.corner ?? 0) < 0) {
      throw new Error(`Bin "${this.partno}": corner must be >= 0`);
    }

    if (this.corner > 0) {
      const minDim = Math.min(this.whd[0], this.whd[1], this.whd[2]);
      if (this.corner * 2 > minDim) {
        throw new Error(
          `Bin "${this.partno}": corner*2 (${this.corner * 2}) exceeds smallest bin dimension (${minDim})`,
        );
      }
      const c = this.corner;
      const [w, h, d] = this.whd;
      const cornerPositions: Vec3[] = [
        [0, 0, 0],
        [0, 0, d - c],
        [0, h - c, d - c],
        [0, h - c, 0],
        [w - c, h - c, 0],
        [w - c, 0, 0],
        [w - c, 0, d - c],
        [w - c, h - c, d - c],
      ];
      for (let i = 0; i < 8; i++) {
        boxes.push({ position: cornerPositions[i], whd: [c, c, c], label: `corner${i}` });
      }
    }

    const userObstacles = input.obstacles ?? [];
    for (let i = 0; i < userObstacles.length; i++) {
      const o = userObstacles[i];
      const pos: Vec3 = [
        scale(o.position[0], numberOfDecimals),
        scale(o.position[1], numberOfDecimals),
        scale(o.position[2], numberOfDecimals),
      ];
      const dim: Vec3 = [
        scale(o.whd[0], numberOfDecimals),
        scale(o.whd[1], numberOfDecimals),
        scale(o.whd[2], numberOfDecimals),
      ];
      if (dim[0] <= 0 || dim[1] <= 0 || dim[2] <= 0) {
        throw new Error(`Bin "${this.partno}": obstacle[${i}] has non-positive dimension`);
      }
      if (
        pos[0] < 0 ||
        pos[1] < 0 ||
        pos[2] < 0 ||
        pos[0] + dim[0] > this.whd[0] ||
        pos[1] + dim[1] > this.whd[1] ||
        pos[2] + dim[2] > this.whd[2]
      ) {
        throw new Error(
          `Bin "${this.partno}": obstacle[${i}] at ${JSON.stringify(o.position)} size ${JSON.stringify(o.whd)} extends outside bin bounds`,
        );
      }
      boxes.push({ position: pos, whd: dim, label: `obstacle${i}` });
    }

    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (aabbOverlap(boxes[i].position, boxes[i].whd, boxes[j].position, boxes[j].whd)) {
          throw new Error(
            `Bin "${this.partno}": ${boxes[i].label} overlaps ${boxes[j].label}`,
          );
        }
      }
    }

    return boxes;
  }

  /**
   * Push corner-cube and user-obstacle items into `this.items` so subsequent
   * placements see them as AABB blockers. Idempotent: a second call is a no-op.
   * Normally called once per bin by the packer; calling from user code is fine
   * but only matters if `putItem` is being driven directly.
   */
  injectObstacles(): void {
    if (this.obstaclesInjected) return;
    this.obstaclesInjected = true;
    for (const box of this.obstacleBoxes) {
      const it = new Item(
        {
          partno: `${this.partno}-${box.label}`,
          name: box.label,
          // Already integer-scaled — pass 0 decimals to avoid re-scaling.
          whd: box.whd,
          weight: 0,
          loadbear: 0,
          updown: true,
          color: '#000000',
        },
        0,
      );
      it.position = box.position;
      it.isObstacle = true;
      this.items.push(it);
    }
  }

  getVolume(): number {
    return this.whd[0] * this.whd[1] * this.whd[2];
  }

  getTotalWeight(): number {
    return this.items.reduce((sum, it) => sum + it.weight, 0);
  }

  /**
   * Attempt to place `item` at `pivot`. Tries all allowed rotations and picks
   * the one with the best fit score instead of the first that fits — keeps
   * results stable under input dim permutations (e.g. flipping a row's
   * L/W/H labels) and improves packing density on regular cargo.
   * Mutates item on success. Returns true if placed.
   */
  putItem(item: Item, pivot: Vec3): boolean {
    const originalPosition = item.position;
    const originalRotation = item.rotationType;

    let bestRotation: number | null = null;
    let bestPosition: Vec3 | null = null;
    let bestScore = -Infinity;

    for (const rot of item.getAllowedRotations()) {
      item.rotationType = rot;
      item.position = pivot;
      const dim = item.getDimension();

      // (1) Fits inside bin bounds
      if (
        this.whd[0] < pivot[0] + dim[0] ||
        this.whd[1] < pivot[1] + dim[1] ||
        this.whd[2] < pivot[2] + dim[2]
      ) continue;

      // (2) No AABB overlap with placed items
      const overlaps = this.items.some((placed) =>
        aabbOverlap(placed.position, placed.getDimension(), pivot, dim),
      );
      if (overlaps) continue;

      // (3) Total weight gate
      if (this.getTotalWeight() + item.weight > this.maxWeight) continue;

      // (4) Fragile / nonStackable: nothing can stack on top of a fragile/nonStack item.
      // Check is before settle, so we use the trial pivot Y.
      const blocked = this.items.some((placed) => {
        if (!(placed.fragile || placed.nonStackable)) return false;
        const placedTop = placed.position[Axis.HEIGHT] + placed.getDimension()[Axis.HEIGHT];
        if (pivot[Axis.HEIGHT] < placedTop) return false;
        // Footprints overlap on W×D plane?
        return rectIntersect(
          placed.position,
          placed.getDimension(),
          pivot,
          dim,
          Axis.WIDTH,
          Axis.DEPTH,
        );
      });
      if (blocked) continue;

      // (5) Loadbear: each item directly under the new item's footprint must support its weight.
      const underloaded = this.items.some((placed) => {
        const placedTop = placed.position[Axis.HEIGHT] + placed.getDimension()[Axis.HEIGHT];
        if (placedTop !== pivot[Axis.HEIGHT]) return false;
        if (
          !rectIntersect(
            placed.position,
            placed.getDimension(),
            pivot,
            dim,
            Axis.WIDTH,
            Axis.DEPTH,
          )
        )
          return false;
        return placed.loadbear < item.weight;
      });
      if (underloaded) continue;

      // (6) fixPoint: slide item toward -HEIGHT, then -WIDTH, then -DEPTH to contact.
      if (this.fixPoint) {
        this.settle(item, dim);
      }

      // (7) checkStable: requires fixPoint to be active.
      if (this.fixPoint && this.checkStable && !this.isStable(item)) continue;

      // (8) Score this rotation. The integer-grid fill ratio per axis is
      //   fill_axis = floor(avail / dim) * dim / avail
      // — i.e. how much of the still-reachable space along that axis this
      // rotation tiles cleanly. We multiply the three (rather than summing)
      // to reward rotations that balance fit across ALL axes; a sum can be
      // dominated by one axis hitting 1.0 while the others waste space.
      // This matches the heuristic used by olragon/binpackingjs.
      const px = item.position[0];
      const py = item.position[1];
      const pz = item.position[2];
      const availW = this.whd[0] - px;
      const availH = this.whd[1] - py;
      const availD = this.whd[2] - pz;
      const fillW = availW > 0 ? (Math.floor(availW / dim[0]) * dim[0]) / availW : 0;
      const fillH = availH > 0 ? (Math.floor(availH / dim[1]) * dim[1]) / availH : 0;
      const fillD = availD > 0 ? (Math.floor(availD / dim[2]) * dim[2]) / availD : 0;
      // Tiebreaker: prefer the rotation that lands lowest (gravity-stable).
      const settledHeight = py + dim[1];
      const score = fillW * fillH * fillD - settledHeight * 1e-9;

      if (score > bestScore) {
        bestScore = score;
        bestRotation = rot;
        bestPosition = [px, py, pz];
      }
    }

    if (bestRotation !== null && bestPosition !== null) {
      item.rotationType = bestRotation;
      item.position = bestPosition;
      this.items.push(item);
      return true;
    }

    item.position = originalPosition;
    item.rotationType = originalRotation;
    return false;
  }

  /** Pull item toward -HEIGHT, then -WIDTH, then -DEPTH, stopping at first contact. */
  private settle(item: Item, dim: Vec3): void {
    for (const axis of [Axis.HEIGHT, Axis.WIDTH, Axis.DEPTH] as const) {
      const pos: [number, number, number] = [item.position[0], item.position[1], item.position[2]];
      while (pos[axis] > 0) {
        pos[axis] -= 1;
        const trial: Vec3 = [pos[0], pos[1], pos[2]];
        if (
          trial[axis] < 0 ||
          this.items.some((p) => aabbOverlap(p.position, p.getDimension(), trial, dim))
        ) {
          pos[axis] += 1; // step back
          break;
        }
      }
      item.position = [pos[0], pos[1], pos[2]];
    }
  }

  /** True if the four bottom corners are each supported or the supported area ratio is met. */
  private isStable(item: Item): boolean {
    const dim = item.getDimension();
    const y = item.position[Axis.HEIGHT];
    if (y === 0) return true;

    // Items whose top face is at this item's bottom face. Obstacles are
    // excluded — they're container fixtures (corner cubes, chamfer steps),
    // not cargo, and don't bear load. This forces items to be supported by
    // real items below them; overhangs into the obstacle region still pass
    // as long as enough of the item's footprint sits over real supports
    // (4 corners or the support-area ratio).
    const supports = this.items.filter(
      (p) =>
        p !== item &&
        !p.isObstacle &&
        p.position[Axis.HEIGHT] + p.getDimension()[Axis.HEIGHT] === y,
    );

    const x0 = item.position[Axis.WIDTH];
    const z0 = item.position[Axis.DEPTH];
    const corners: Vec3[] = [
      [x0, y, z0],
      [x0 + dim[0], y, z0],
      [x0, y, z0 + dim[2]],
      [x0 + dim[0], y, z0 + dim[2]],
    ];

    const cornerSupported = (c: Vec3) =>
      supports.some((p) => {
        const pd = p.getDimension();
        return (
          c[0] >= p.position[0] &&
          c[0] <= p.position[0] + pd[0] &&
          c[2] >= p.position[2] &&
          c[2] <= p.position[2] + pd[2]
        );
      });

    if (corners.every(cornerSupported)) return true;

    // Fall back to support-area ratio.
    let supportedArea = 0;
    for (const p of supports) {
      const pd = p.getDimension();
      const ox = Math.max(
        0,
        Math.min(x0 + dim[0], p.position[0] + pd[0]) - Math.max(x0, p.position[0]),
      );
      const oz = Math.max(
        0,
        Math.min(z0 + dim[2], p.position[2] + pd[2]) - Math.max(z0, p.position[2]),
      );
      supportedArea += ox * oz;
    }
    const itemArea = dim[0] * dim[2];
    return supportedArea / itemArea >= this.supportSurfaceRatio;
  }

  /**
   * Quadrant weight % [FL, FR, BL, BR] in the WIDTH×DEPTH plane.
   * Front (F) = low-WIDTH half. Left (L) = low-DEPTH half.
   * Weight is distributed by the fraction of each item's footprint in each quadrant.
   */
  gravityCenter(): readonly [number, number, number, number] {
    const total = this.getTotalWeight();
    if (total === 0) return [0, 0, 0, 0] as const;

    const midW = this.whd[Axis.WIDTH] / 2;
    const midD = this.whd[Axis.DEPTH] / 2;

    // q[0]=FL, q[1]=FR, q[2]=BL, q[3]=BR
    const q: [number, number, number, number] = [0, 0, 0, 0];

    for (const it of this.items) {
      const d = it.getDimension();
      const x0 = it.position[Axis.WIDTH];
      const x1 = x0 + d[Axis.WIDTH];
      const z0 = it.position[Axis.DEPTH];
      const z1 = z0 + d[Axis.DEPTH];
      const itemFootprint = d[Axis.WIDTH] * d[Axis.DEPTH];
      if (itemFootprint === 0) continue;

      // Overlap with each of the 4 quadrants: [0..midW] x [0..midD], etc.
      const quadrantBounds: [number, number, number, number][] = [
        [0, midW, 0, midD],    // FL: front (low W) + left (low D)
        [0, midW, midD, this.whd[Axis.DEPTH]],  // FR: front (low W) + right (high D)
        [midW, this.whd[Axis.WIDTH], 0, midD],  // BL: back (high W) + left (low D)
        [midW, this.whd[Axis.WIDTH], midD, this.whd[Axis.DEPTH]], // BR
      ];

      for (let qi = 0; qi < 4; qi++) {
        const [qx0, qx1, qz0, qz1] = quadrantBounds[qi];
        const overlapW = Math.max(0, Math.min(x1, qx1) - Math.max(x0, qx0));
        const overlapD = Math.max(0, Math.min(z1, qz1) - Math.max(z0, qz0));
        const fraction = (overlapW * overlapD) / itemFootprint;
        q[qi] += it.weight * fraction;
      }
    }

    return [
      (q[0] / total) * 100,
      (q[1] / total) * 100,
      (q[2] / total) * 100,
      (q[3] / total) * 100,
    ] as const;
  }
}
