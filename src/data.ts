import type { Cargo, Container } from './types'

export const container40HQ: Container = {
  name: '40HQ',
  length: 12032,
  width: 2352,
  height: 2698,
  maxWeight: 26700,
}

export const sampleCargo: Cargo[] = [
  {
    id: 'SBN102-R1',
    name: 'SBN102-R1',
    quantity: 12,
    length: 535,
    width: 230,
    height: 486,
    weight: 9.39,
    color: '#4f7cff',
  },
  {
    id: 'SBN103-R1',
    name: 'SBN103-R1',
    quantity: 8,
    length: 535,
    width: 230,
    height: 486,
    weight: 8.91,
    color: '#8b5cf6',
  },
  {
    id: 'SBN104-R1',
    name: 'SBN104-R1',
    quantity: 6,
    length: 620,
    width: 260,
    height: 410,
    weight: 12.2,
    color: '#10b981',
  },
]