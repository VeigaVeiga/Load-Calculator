import type { RotationType } from './constants.js';

export type Vec3 = readonly [number, number, number];

export interface ItemInput {
  partno: string;
  name?: string;
  /** width, height, depth (floats, in input units e.g. cm) */
  whd: Vec3;
  weight: number;
  /** 1 (highest) ... 3 (lowest); affects packing order. Default 1. */
  level?: number;
  /** Max weight allowed to be stacked on top (kg). Default 100. */
  loadbear?: number;
  /** Allow upside-down rotations. Default true. */
  updown?: boolean;
  /** Hex color string for the viewer. Default random. */
  color?: string;
  /** Disallow anything stacked on top of this item. Default false. */
  fragile?: boolean;
  /** Disallow anything stacked on top (looser semantics than fragile but
   *  implementation-identical for now). Default false. */
  nonStackable?: boolean;
  /** Optional binding group key. Items with the same key must pack into the same bin. */
  group?: string;
}

/**
 * Axis-aligned obstacle inside a bin. Acts as a pre-placed solid block that
 * real items must pack around. Useful for representing wheel wells, posts, or
 * stair-stepped approximations of chamfered container walls (e.g. ULDs).
 */
export interface ObstacleInput {
  /** Near-bottom-left corner inside the bin (input units, e.g. cm). */
  position: Vec3;
  /** width, height, depth (input units). */
  whd: Vec3;
}

export interface BinInput {
  partno: string;
  /** width, height, depth (floats, in input units e.g. cm) */
  whd: Vec3;
  maxWeight: number;
  /** Fix items downward (eliminate floating). Default true. */
  fixPoint?: boolean;
  /** Enforce stability check (requires fixPoint). Default true. */
  checkStable?: boolean;
  /** Minimum supported-area fraction for stability. Default 0.75. */
  supportSurfaceRatio?: number;
  /** Reserved for future open-top container behavior; default 1 (general). */
  putType?: 1 | 2;
  /**
   * py3dbp-compatible shorthand: place a `corner × corner × corner` solid
   * cube at each of the bin's 8 vertices before packing. Real items must
   * pack around them. `0` (default) disables the feature.
   */
  corner?: number;
  /**
   * Additional user-defined AABB obstacles, injected before packing. Items
   * cannot overlap them. The library ships no container presets — generate
   * the obstacle list yourself for ULDs (LD3 chamfer, etc.) or fixtures.
   */
  obstacles?: ObstacleInput[];
}

export interface PackOptions {
  /** Pack larger bins first. Default true. */
  biggerFirst?: boolean;
  /** Allow auto-distribute across multiple bins. Default false. */
  distributeItems?: boolean;
  /** Decimal places for internal integer scaling. Default 2. */
  numberOfDecimals?: number;
}

export interface PackInput {
  bins: BinInput[];
  items: ItemInput[];
  options?: PackOptions;
}

export interface PlacedItem {
  partno: string;
  name: string;
  /** Position of the item's near-bottom-left corner inside the bin. */
  position: Vec3;
  /** Effective dimensions after rotation (width, height, depth). */
  rotatedWhd: Vec3;
  rotationType: RotationType;
  weight: number;
  color: string;
  fragile: boolean;
  nonStackable: boolean;
  /** 1-based load order within its bin. */
  loadOrder: number;
}

export interface BinResult {
  partno: string;
  whd: Vec3;
  maxWeight: number;
  fittedItems: PlacedItem[];
  totalWeight: number;
  /** Volume utilization 0..1. */
  utilization: number;
  /** Quadrant weight % [FL, FR, BL, BR] in the horizontal plane (WIDTH×DEPTH).
   *  Front = +WIDTH direction (container door side). */
  gravity: readonly [number, number, number, number];
}

export interface UnfitItem {
  partno: string;
  name: string;
  reason: 'no_space' | 'weight_exceeded' | 'binding_broken';
}

export interface PackResult {
  bins: BinResult[];
  unfitItems: UnfitItem[];
}
