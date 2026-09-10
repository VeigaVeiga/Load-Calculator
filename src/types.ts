export interface Cargo {
  id: string
  name: string
  quantity: number
  length: number
  width: number
  height: number
  weight: number
  color: string
}

export interface Container {
  name: string
  length: number
  width: number
  height: number
  maxWeight: number
}

export interface PackedBox {
  id: string
  cargoId: string
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  color: string
}