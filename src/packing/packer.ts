import type { Cargo, Container, PlacedCargo } from '../types'
import { dims, overlap } from './geometry'

const SNAP=10
const EPS=1

type Orientation={length:number;width:number;rotation:0|90}
type Unit={cargo:Cargo;index:number}
type Point={x:number;y:number;z:number}

action
