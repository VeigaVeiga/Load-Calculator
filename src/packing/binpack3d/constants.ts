export enum RotationType {
  WHD = 0,
  HWD = 1,
  HDW = 2,
  DHW = 3,
  DWH = 4,
  WDH = 5,
}

export const ALL_ROTATIONS: readonly RotationType[] = [
  RotationType.WHD,
  RotationType.HWD,
  RotationType.HDW,
  RotationType.DHW,
  RotationType.DWH,
  RotationType.WDH,
];

// When the item cannot be flipped (updown=false), the input H dimension
// must remain along the vertical axis (Axis.HEIGHT, index 1). Only two of
// the six rotations satisfy this — they keep H upright while letting the
// horizontal pair (W and D, which map to form L and form W) swap freely.
//   WHD: [w, h, d] — h at index 1 ✓
//   DHW: [d, h, w] — h at index 1 ✓, w↔d swapped horizontally
export const NOTUPDOWN_ROTATIONS: readonly RotationType[] = [
  RotationType.WHD,
  RotationType.DHW,
];

export enum Axis {
  WIDTH = 0,
  HEIGHT = 1,
  DEPTH = 2,
}

export const ALL_AXES: readonly Axis[] = [Axis.WIDTH, Axis.HEIGHT, Axis.DEPTH];

export const DEFAULT_NUMBER_OF_DECIMALS = 2;
export const DEFAULT_SUPPORT_SURFACE_RATIO = 0.75;
