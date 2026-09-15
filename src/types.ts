export type CargoType = 'carton' | 'pallet' | 'woodCrate'

export interface Cargo {
  id: string
  name: string
  type: CargoType
  quantity: number
  length: number
  width: number
  height: number
  weight: number
  color: string
  stackable: boolean
  rotatable: boolean
  maxStackLayers: number
  maxLoadOnTop: number
  breakablePallet: boolean
}

export interface LashingPoint {
  id: string
  x: number
  y: number
  z: number
  type: 'floor' | 'side' | 'corner'
  maxLoad?: number
}

export interface Container {
  id: string
  name: string
  length: number
  width: number
  height: number
  outerLength: number
  outerWidth: number
  outerHeight: number
  floorThickness: number
  wallThickness: number
  roofThickness: number
  doorWidth: number
  doorHeight: number
  doorFrameDepth: number
  maxPayload: number
  tareWeight?: number
  lashingPoints: LashingPoint[]
}

export interface PlacedCargo {
  id: string
  cargoId: string
  cargoType: CargoType
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  rotation: number
  weight: number
  color: string
  placementMode: 'automatic' | 'manual'
  locked: boolean
}

export type SecuringMaterialType = 'triangleWood' | 'lashingBelt' | 'airBag' | 'doorNet'
export interface SecuringItem {
  id: string
  type: SecuringMaterialType
  cargoId?: string
  x: number
  y: number
  z: number
  length: number
  width: number
  height: number
  rotation: number
}

export interface DunnageAirBag { id: string; cargoId: string; x: number; y: number; z: number; length: number; width: number; height: number; ratedCapacity?: number }
export interface TriangleWood { id: string; cargoId: string; x: number; y: number; z: number; length: number; width: number; height: number; rotation: number; nailCount: number }
export interface LashingBelt { id: string; cargoId: string; startPoint: string; endPoint: string; width: number; length: number; ratedCapacity?: number; type: 'transverse' | 'longitudinal' | 'cross' }
export interface DoorNet { id: string; width: number; height: number; ratedCapacity?: number }
export interface SecuringPlan { cargoId: string; triangleWood: TriangleWood[]; lashingBelts: LashingBelt[]; airBags: DunnageAirBag[]; doorNet?: DoorNet; status: 'none' | 'partial' | 'secured' }
export interface ValidationResult { ok: boolean; errors: string[]; warnings: string[] }
