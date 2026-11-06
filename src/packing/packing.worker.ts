import { basePack } from './baseSolver'
import type { Cargo, Container, PlacedCargo } from '../types'

type Request = {
  cargo: Cargo[]
  container: Container
  locked: PlacedCargo[]
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (value: unknown) => void
}

ctx.onmessage = (event) => {
  try {
    const { cargo, container, locked } = event.data
    const result = basePack(cargo, container, locked, percent => {
      ctx.postMessage({ type: 'progress', percent })
    })
    ctx.postMessage({ type: 'result', result })
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Packing worker failed',
    })
  }
}
