import {
  ALL_ROTATIONS,
  DEFAULT_NUMBER_OF_DECIMALS,
  NOTUPDOWN_ROTATIONS,
  RotationType,
} from './constants.js';
import type { ItemInput, Vec3 } from './types.js';

function scale(v: number, decimals: number): number {
  return Math.round(v * 10 ** decimals);
}

export class Item {
  readonly partno: string;
  readonly name: string;
  /** Original (unrotated) integer-scaled width, height, depth. */
  private readonly baseWhd: Vec3;
  readonly weight: number; // integer-scaled
  readonly level: number;
  readonly loadbear: number; // integer-scaled
  readonly updown: boolean;
  readonly color: string;
  readonly fragile: boolean;
  readonly nonStackable: boolean;
  readonly group: string | undefined;

  rotationType: RotationType = RotationType.WHD;
  /** integer-scaled position of near-bottom-left corner */
  position: Vec3 = [0, 0, 0];
  /**
   * Internal: true when this Item is a Bin-injected obstacle (from
   * BinInput.corner / BinInput.obstacles), not a user item. Excluded from
   * BinResult.fittedItems and from utilization volume.
   */
  isObstacle = false;

  constructor(input: ItemInput, numberOfDecimals: number = DEFAULT_NUMBER_OF_DECIMALS) {
    this.partno = input.partno;
    this.name = input.name ?? input.partno;
    this.baseWhd = [
      scale(input.whd[0], numberOfDecimals),
      scale(input.whd[1], numberOfDecimals),
      scale(input.whd[2], numberOfDecimals),
    ];
    this.weight = scale(input.weight, numberOfDecimals);
    this.level = input.level ?? 1;
    this.loadbear = scale(input.loadbear ?? 100, numberOfDecimals);
    this.updown = input.updown ?? true;
    this.color = input.color ?? '#888';
    this.fragile = input.fragile ?? false;
    this.nonStackable = input.nonStackable ?? false;
    this.group = input.group;
  }

  getVolume(): number {
    return this.baseWhd[0] * this.baseWhd[1] * this.baseWhd[2];
  }

  getDimension(): Vec3 {
    const [w, h, d] = this.baseWhd;
    switch (this.rotationType) {
      case RotationType.WHD: return [w, h, d];
      case RotationType.HWD: return [h, w, d];
      case RotationType.HDW: return [h, d, w];
      case RotationType.DHW: return [d, h, w];
      case RotationType.DWH: return [d, w, h];
      case RotationType.WDH: return [w, d, h];
    }
  }

  getAllowedRotations(): readonly RotationType[] {
    return this.updown ? ALL_ROTATIONS : NOTUPDOWN_ROTATIONS;
  }
}
