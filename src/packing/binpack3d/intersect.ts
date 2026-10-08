import { Axis, ALL_AXES } from './constants.js';
import type { Vec3 } from './types.js';

/** Centered overlap test on a single axis. Strict (>0). */
function axisOverlap(pos1: number, dim1: number, pos2: number, dim2: number): boolean {
  const center1 = pos1 + dim1 / 2;
  const center2 = pos2 + dim2 / 2;
  const distance = Math.abs(center1 - center2);
  return distance < (dim1 + dim2) / 2;
}

/** Overlap of two boxes' projections onto the (axis1, axis2) plane. */
export function rectIntersect(
  pos1: Vec3,
  dim1: Vec3,
  pos2: Vec3,
  dim2: Vec3,
  axis1: Axis,
  axis2: Axis,
): boolean {
  return (
    axisOverlap(pos1[axis1], dim1[axis1], pos2[axis1], dim2[axis1]) &&
    axisOverlap(pos1[axis2], dim1[axis2], pos2[axis2], dim2[axis2])
  );
}

/** Full 3D AABB overlap. */
export function aabbOverlap(pos1: Vec3, dim1: Vec3, pos2: Vec3, dim2: Vec3): boolean {
  return ALL_AXES.every((ax) => axisOverlap(pos1[ax], dim1[ax], pos2[ax], dim2[ax]));
}
