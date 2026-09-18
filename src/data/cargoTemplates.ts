import type { Cargo } from '../types'

// Default regression-test load: 15 pallets, 1100 × 1200 × 1600 mm.
// A 40HQ can tile these in two 1100 mm lanes along the 12032 mm length.
export const cargoTemplates: Cargo[] = [
  {
    id: 'TEST-PALLET-001',
    name: '测试托盘 1100×1200×1600',
    type: 'pallet',
    quantity: 15,
    length: 1100,
    width: 1200,
    height: 1600,
    weight: 500,
    color: '#c9954e',
    showName: false,
    locked: false,
    stackable: false,
    loadBearing: true,
    rotatable: true,
    maxStackLayers: 1,
    maxLoadOnTop: 0,
    breakablePallet: false,
  },
]
