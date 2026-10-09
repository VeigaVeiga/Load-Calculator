import type { Cargo } from '../types'

// TEMPORARY REGRESSION FIXTURE — remove after the 20-pallet / 200-carton
// loading and load-bearing behavior has been verified.
export const cargoTemplates: Cargo[] = [
  {
    id: 'TEST-PALLET-20',
    name: '测试托盘（临时）',
    type: 'pallet',
    quantity: 20,
    length: 1200,
    width: 1000,
    height: 150,
    weight: 500,
    color: '#b98a56',
    showName: false,
    locked: false,
    stackable: true,
    loadBearing: true,
    rotatable: true,
    maxStackLayers: 0,
    maxLoadOnTop: 0,
    breakablePallet: false,
  },
  {
    id: 'TEST-CARTON-200',
    name: '测试纸箱（临时）',
    type: 'carton',
    quantity: 200,
    length: 600,
    width: 400,
    height: 400,
    weight: 15,
    color: '#c9a77b',
    showName: false,
    locked: false,
    stackable: true,
    loadBearing: true,
    rotatable: true,
    maxStackLayers: 0,
    maxLoadOnTop: 0,
    breakablePallet: false,
  },
]
