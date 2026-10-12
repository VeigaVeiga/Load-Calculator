import assert from 'node:assert/strict'
import { createServer } from 'vite'

const server = await createServer({
  configFile: './vite.config.ts',
  server: { middlewareMode: true },
  appType: 'custom',
})

try {
  const { basePack } = await server.ssrLoadModule('/src/packing/baseSolver.ts')
  const { validatePlan } = await server.ssrLoadModule('/src/packing/geometry.ts')

  const container = (maxPayload = 26000) => ({
    id: '40HQ',
    name: '40HQ',
    length: 12032,
    width: 2352,
    height: 2698,
    outerLength: 12192,
    outerWidth: 2438,
    outerHeight: 2896,
    floorThickness: 30,
    wallThickness: 30,
    roofThickness: 30,
    doorWidth: 2340,
    doorHeight: 2585,
    doorFrameDepth: 100,
    maxPayload,
    tareWeight: 3800,
    lashingPoints: [],
  })

  const cargo = (overrides) => ({
    id: 'cargo',
    name: 'Cargo',
    type: 'carton',
    quantity: 1,
    length: 400,
    width: 300,
    height: 300,
    weight: 20,
    color: '#888888',
    showName: true,
    locked: false,
    stackable: true,
    loadBearing: true,
    rotatable: true,
    maxStackLayers: 3,
    maxLoadOnTop: 100,
    breakablePallet: false,
    ...overrides,
  })

  function assertPlan(result, box, shipment, label) {
    const audit = validatePlan(result.placed, box, shipment)
    assert.equal(audit.ok, true, label + ': invalid plan: ' + audit.errors.join('; '))
    for (const item of shipment) {
      const count = result.placed.filter(p => p.cargoId === item.id).length
      assert.ok(count <= Math.floor(item.quantity), label + ': over-placed ' + item.id)
    }
    assert.equal(
      result.placed.length + result.unplaced.length,
      shipment.reduce((sum, item) => sum + Math.max(0, Math.floor(item.quantity)), 0),
      label + ': placed/unplaced unit accounting mismatch',
    )
  }

  // Regression 1: homogeneous floor grid must preserve the exact requested
  // count when the whole shipment fits in a single floor layer.
  {
    const shipment = [cargo({
      id: 'homogeneous',
      quantity: 60,
      length: 600,
      width: 400,
      height: 400,
      weight: 80,
      maxStackLayers: 1,
    })]
    const result = basePack(shipment, container(), [])
    assertPlan(result, container(), shipment, 'homogeneous-grid')
    assert.equal(result.placed.length, 60, 'homogeneous-grid: expected all 60 units')
  }

  // Regression 2: mixed pallet/carton loading should not strand cartons simply
  // because the foundation and upper-layer cargo are different SKUs.
  {
    const shipment = [
      cargo({
        id: 'pallets',
        name: 'Palletized cargo',
        type: 'pallet',
        quantity: 4,
        length: 1200,
        width: 1000,
        height: 1200,
        weight: 400,
        stackable: false,
        loadBearing: true,
        rotatable: true,
        maxStackLayers: 1,
        maxLoadOnTop: 5000,
      }),
      cargo({
        id: 'cartons',
        quantity: 24,
        length: 400,
        width: 300,
        height: 300,
        weight: 20,
        stackable: true,
        loadBearing: true,
        maxStackLayers: 3,
        maxLoadOnTop: 100,
      }),
    ]
    const result = basePack(shipment, container(), [])
    assertPlan(result, container(), shipment, 'mixed-pallet-carton')
    assert.ok(result.placed.length >= 24, 'mixed-pallet-carton: expected at least 24/28 units loaded')
    assert.equal(result.placed.filter(p => p.cargoId === 'pallets').length, 4, 'mixed-pallet-carton: all pallets should fit')
  }

  // Regression 3: payload is a hard constraint even when the geometric floor
  // has room for more cargo.
  {
    const shipment = [cargo({
      id: 'heavy',
      quantity: 4,
      length: 600,
      width: 400,
      height: 400,
      weight: 2000,
      maxStackLayers: 1,
    })]
    const box = container(5000)
    const result = basePack(shipment, box, [])
    assertPlan(result, box, shipment, 'payload-limit')
    assert.equal(result.placed.length, 2, 'payload-limit: must load exactly two 2000 kg units')
  }

  console.log('Packing regression checks passed: homogeneous grid, mixed pallet/carton, payload limit.')
} finally {
  await server.close()
}
