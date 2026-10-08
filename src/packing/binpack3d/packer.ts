import { Axis } from './constants.js';
import { Bin } from './bin.js';
import { Item } from './item.js';
import type {
  BinResult,
  PackInput,
  PackResult,
  PlacedItem,
  UnfitItem,
  Vec3,
} from './types.js';

const PIVOT_AXES = [Axis.WIDTH, Axis.HEIGHT, Axis.DEPTH] as const;

function makeVec3(a: number, b: number, c: number): Vec3 {
  return [a, b, c];
}

function packIntoBin(bin: Bin, items: Item[]): { fitted: Item[]; rejected: Item[] } {
  const fitted: Item[] = [];
  const rejected: Item[] = [];

  for (const item of items) {
    let placed = false;

    // Try the origin pivot for the first real item. Obstacles (corner cubes,
    // user obstacles) live in bin.items but don't count — without this, with
    // any obstacle present the first real item would skip (0,0,0) entirely.
    const hasRealItems = bin.items.some((it) => !it.isObstacle);
    if (!hasRealItems) {
      placed = bin.putItem(item, makeVec3(0, 0, 0));
    }
    // Fall through to pivot-from-placed iteration if origin failed or there
    // are already real items. Pivots derived from obstacle faces are valid
    // candidates — they let items pack flush against corner cubes.
    if (!placed && bin.items.length > 0) {
      outer: for (const placedItem of bin.items) {
        const pd = placedItem.getDimension();
        for (const axis of PIVOT_AXES) {
          const px = placedItem.position[0] + (axis === Axis.WIDTH ? pd[0] : 0);
          const py = placedItem.position[1] + (axis === Axis.HEIGHT ? pd[1] : 0);
          const pz = placedItem.position[2] + (axis === Axis.DEPTH ? pd[2] : 0);
          if (bin.putItem(item, makeVec3(px, py, pz))) {
            placed = true;
            break outer;
          }
        }
      }
    }

    if (placed) fitted.push(item);
    else rejected.push(item);
  }
  return { fitted, rejected };
}

function inferUnfitReason(item: Item, bin: Bin): UnfitItem['reason'] {
  // Single-item heavier than the bin's max, OR adding this item would push
  // the bin past its cumulative weight gate — both are weight-exceeded cases.
  if (item.weight > bin.maxWeight) return 'weight_exceeded';
  if (bin.getTotalWeight() + item.weight > bin.maxWeight) return 'weight_exceeded';
  return 'no_space';
}

function toPlaced(item: Item, decimals: number, index: number): PlacedItem {
  const denom = 10 ** decimals;
  return {
    partno: item.partno,
    name: item.name,
    position: makeVec3(
      item.position[0] / denom,
      item.position[1] / denom,
      item.position[2] / denom,
    ),
    rotatedWhd: makeVec3(
      item.getDimension()[0] / denom,
      item.getDimension()[1] / denom,
      item.getDimension()[2] / denom,
    ),
    rotationType: item.rotationType,
    weight: item.weight / denom,
    color: item.color,
    fragile: item.fragile,
    nonStackable: item.nonStackable,
    loadOrder: index + 1,
  };
}

export function pack(input: PackInput): PackResult {
  const decimals = input.options?.numberOfDecimals ?? 2;
  const biggerFirst = input.options?.biggerFirst ?? true;
  const distribute = input.options?.distributeItems ?? false;

  const bins = input.bins.map((b) => new Bin(b, decimals));
  const items = input.items.map((it) => new Item(it, decimals));

  // Sort bins
  bins.sort((a, b) =>
    biggerFirst ? b.getVolume() - a.getVolume() : a.getVolume() - b.getVolume(),
  );

  // Sort items: volume desc, loadbear desc, level asc
  items.sort((a, b) => {
    if (b.getVolume() !== a.getVolume()) return b.getVolume() - a.getVolume();
    if (b.loadbear !== a.loadbear) return b.loadbear - a.loadbear;
    return a.level - b.level;
  });

  // Separate grouped vs ungrouped items
  const groups = new Map<string, Item[]>();
  const ungrouped: Item[] = [];
  for (const it of items) {
    if (it.group) {
      if (!groups.has(it.group)) groups.set(it.group, []);
      groups.get(it.group)!.push(it);
    } else {
      ungrouped.push(it);
    }
  }

  // Track which groups and ungrouped items were successfully placed in at least one bin
  const placedGroups = new Set<string>();
  const placedUngrouped = new Set<Item>();
  const unfitItems: UnfitItem[] = [];

  for (const bin of bins) {
    // Inject corner cubes and user-defined obstacles before any placement so
    // they participate in every overlap check. Idempotent — safe to call from
    // both pack() and direct Bin usage.
    bin.injectObstacles();

    // Try each group as an atomic unit
    for (const [key, members] of groups) {
      // With distribute=true, skip a group once it has been placed
      if (distribute && placedGroups.has(key)) continue;

      // Snapshot current bin state so we can revert on partial failure
      const snapshotItems = [...bin.items];

      // Clone members with 0 decimals: values are already integer-scaled.
      // getDimension() is safe here because members haven't been packed yet,
      // so rotationType is still RotationType.WHD and getDimension() == baseWhd.
      const memberClones = members.map(
        (m) =>
          new Item(
            {
              partno: m.partno,
              name: m.name,
              whd: m.getDimension(),
              weight: m.weight,
              loadbear: m.loadbear,
              updown: m.updown,
              color: m.color,
              fragile: m.fragile,
              nonStackable: m.nonStackable,
              group: m.group,
            },
            0,
          ),
      );

      const { rejected } = packIntoBin(bin, memberClones);

      if (rejected.length > 0) {
        // Revert any partial placements; try this group in the next bin
        bin.items = snapshotItems;
      } else {
        placedGroups.add(key);
      }
    }

    // Then ungrouped items
    const { fitted } = packIntoBin(bin, ungrouped);
    for (const f of fitted) {
      placedUngrouped.add(f);
    }
    if (distribute) {
      for (const f of fitted) {
        const idx = ungrouped.indexOf(f);
        if (idx >= 0) ungrouped.splice(idx, 1);
      }
    }
  }

  // Groups that were never placed are unfit with binding_broken
  for (const [key, members] of groups) {
    if (!placedGroups.has(key)) {
      for (const m of members) {
        unfitItems.push({ partno: m.partno, name: m.name, reason: 'binding_broken' });
      }
    }
  }

  // Ungrouped items never placed in any bin are unfit
  for (const m of ungrouped) {
    if (!placedUngrouped.has(m)) {
      unfitItems.push({ partno: m.partno, name: m.name, reason: inferUnfitReason(m, bins[0]) });
    }
  }

  const binResults: BinResult[] = bins.map((bin) => {
    // Exclude injected obstacles from user-facing output and utilization.
    // They're a property of the container, not packed cargo.
    const realItems = bin.items.filter((it) => !it.isObstacle);
    const fitted = realItems.map((it, idx) => toPlaced(it, decimals, idx));
    const denom = 10 ** decimals;
    return {
      partno: bin.partno,
      whd: makeVec3(bin.whd[0] / denom, bin.whd[1] / denom, bin.whd[2] / denom),
      maxWeight: bin.maxWeight / denom,
      fittedItems: fitted,
      totalWeight: bin.getTotalWeight() / denom,
      utilization:
        bin.getVolume() > 0
          ? realItems.reduce((sum, it) => sum + it.getVolume(), 0) / bin.getVolume()
          : 0,
      gravity: bin.gravityCenter(),
    };
  });

  return { bins: binResults, unfitItems };
}

export { Bin, Item };
