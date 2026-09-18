import type { Cargo, Container } from './types'
import { containerTemplates } from './data/containerTemplates'

export const container40HQ: Container = containerTemplates.find(c => c.id === '40HQ')!

export const sampleCargo: Cargo[] = [
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
