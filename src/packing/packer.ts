import type { Cargo, Container, PlacedCargo } from '../types'
import { basePack } from './baseSolver'

export function expandCargo(cargo: Cargo[]) {
  const out: { cargo: Cargo; index: number }[] = []
  for (const c of cargo) {
    const n = Math.max(0, Math.floor(c.quantity))
    for (let i = 0; i < n; i += 1) out.push({ cargo: c, index: i })
  }
  return out
}

export function autoPack(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
) {
  return basePack(cargo, container, locked).placed
}

export function autoPackAsync(
  cargo: Cargo[],
  container: Container,
  locked: PlacedCargo[] = [],
  progress?: (percent: number) => void,
  options: { signal?: AbortSignal } = {},
): Promise<PlacedCargo[]> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('Packing cancelled'))
      return
    }

    const worker = new Worker(new URL('./packing.worker.ts', import.meta.url), { type: 'module' })

    const cleanup = () => {
      worker.onmessage = null
      worker.onerror = null
      options.signal?.removeEventListener('abort', abort)
      worker.terminate()
    }

    const abort = () => {
      cleanup()
      reject(new Error('Packing cancelled'))
    }

    options.signal?.addEventListener('abort', abort, { once: true })

    worker.onmessage = (event: MessageEvent<any>) => {
      const message = event.data
      if (message?.type === 'progress') {
        progress?.(message.percent)
        return
      }
      if (message?.type === 'result') {
        const result = message.result
        cleanup()
        resolve(result.placed)
        return
      }
      if (message?.type === 'error') {
        cleanup()
        reject(new Error(message.message || 'Packing worker failed'))
      }
    }

    worker.onerror = (event) => {
      cleanup()
      reject(event.error instanceof Error ? event.error : new Error(event.message || 'Packing worker failed'))
    }

    worker.postMessage({ cargo, container, locked })
  })
}
