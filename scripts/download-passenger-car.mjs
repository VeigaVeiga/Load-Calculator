import { mkdir, stat, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const modelPath = resolve(projectRoot, 'public/models/passenger-sedan.glb')
const modelUrl = 'https://storage.googleapis.com/ai-services-quality/jobs/04dtwkw5.glb'

try {
  const existing = await stat(modelPath)
  if (existing.size > 100_000) {
    console.log('Passenger car model already present; skipping download.')
    process.exit(0)
  }
} catch {
  // The model is not present yet; download it below.
}

console.log('Downloading the CC BY 4.0 passenger sedan model...')
const response = await fetch(modelUrl, { redirect: 'follow' })
if (!response.ok) {
  throw new Error(`Passenger car model download failed: HTTP ${response.status}`)
}

const bytes = new Uint8Array(await response.arrayBuffer())
if (bytes.byteLength < 100_000 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'glTF') {
  throw new Error('Downloaded passenger car asset is not a valid GLB file.')
}

await mkdir(dirname(modelPath), { recursive: true })
await writeFile(modelPath, bytes)
console.log(`Passenger car model ready (${(bytes.byteLength / 1024 / 1024).toFixed(2)} MB).`)
