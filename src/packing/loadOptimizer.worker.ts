import { optimizeLoad } from './loadOptimizer'
import type { Container, PlacedCargo } from '../types'

type Request = {
  items: PlacedCargo[]
  container: Container
  maxIterations?: number
}

const ctx = self as unknown as {
  onmessage: ((event: MessageEvent<Request>) => void) | null
  postMessage: (value: unknown) => void
}

ctx.onmessage = async (event) => {
  try {
    const { items, container, maxIterations } = event.data
    const result = await optimizeLoad(items, container, {
      maxIterations,
      progress: percent => ctx.postMessage({ type: 'progress', percent }),
    })
    ctx.postMessage({ type: 'result', result })
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : 'Load optimization worker failed',
    })
  }
}
