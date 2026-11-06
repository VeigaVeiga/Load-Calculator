import { basePack } from './baseSolver'
import { optimizeLoad } from './loadOptimizer'
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

ctx.onmessage = async (event) => {
  try {
    const { cargo, container, locked } = event.data

    // Stage 1: maximize valid loaded units before considering balance.
    const packed = basePack(cargo, container, locked, percent => {
      ctx.postMessage({ type: 'progress', percent: Math.round(percent * 0.72) })
    })

    // Stage 2: optimize the real mass centre without reducing the packed count.
    const optimized = await optimizeLoad(packed.placed, container, {
      // The optimizer and the analysis panel must use the same authoritative SKU weights.
      cargoWeights: cargo.map(item => ({ id: item.id, weight: item.weight })),
      progress: percent => {
        ctx.postMessage({ type: 'progress', percent: 72 + Math.round(percent * 0.27) })
      },
      maxIterations: packed.placed.length > 150 ? 100 : packed.placed.length > 80 ? 180 : 320,
    })

    ctx.postMessage({ type: 'result', result: { ...packed, placed: optimized.placed } })
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Packing worker failed',
    })
  }
}
