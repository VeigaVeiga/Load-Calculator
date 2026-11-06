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
  const { analyzeWeight } = await server.ssrLoadModule('/src/analysis/weight.ts')
  const { optimizeLoad } = await server.ssrLoadModule('/src/packing/loadOptimizer.ts')

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

  // Regression 4: the mixed IBC + industrial machinery case that previously
  // left valid cargo unplaced despite ample floor area and payload headroom.
  {
    const shipment = [
      cargo({
        id: 'ibc',
        name: 'IBC tank (1000 L)',
        type: 'ibc',
        quantity: 10,
        length: 1200,
        width: 1000,
        height: 1160,
        weight: 1100,
        stackable: true,
        loadBearing: true,
        rotatable: true,
        maxStackLayers: 0,
        maxLoadOnTop: 0,
      }),
      cargo({
        id: 'machinery',
        name: 'Industrial machinery',
        type: 'machinery',
        quantity: 5,
        length: 1800,
        width: 1200,
        height: 1500,
        weight: 850,
        stackable: false,
        loadBearing: false,
        rotatable: true,
        maxStackLayers: 1,
        maxLoadOnTop: 0,
      }),
    ]
    const box = container(26000)
    const result = basePack(shipment, box, [])
    assertPlan(result, box, shipment, 'mixed-ibc-machinery')
    assert.equal(result.placed.length, 15, 'mixed-ibc-machinery: expected all 10 IBC + 5 machines to fit')
  }


  // Regression 5: the weight analysis must include elevated cargo and recover
  // from stale zero weights in placed snapshots using the current cargo list.
  {
    const box = container()
    const shipment = [
      cargo({ id: 'pallets', type: 'pallet', quantity: 1, length: 1200, width: 1000, height: 1200, weight: 400 }),
      cargo({ id: 'cartons', type: 'carton', quantity: 1, length: 400, width: 300, height: 300, weight: 20 }),
    ]
    const placed = [
      { id: 'pallets#1', cargoId: 'pallets', cargoType: 'pallet', x: 5416, y: 676, z: 0, length: 1200, width: 1000, height: 1200, rotation: 0, weight: 0, color: '#9a6638', placementMode: 'automatic', locked: false },
      { id: 'cartons#1', cargoId: 'cartons', cargoType: 'carton', x: 7416, y: 676, z: 1200, length: 400, width: 300, height: 300, rotation: 0, weight: 0, color: '#c7ced3', placementMode: 'automatic', locked: false },
    ]
    const analysis = analyzeWeight(placed, box, shipment)
    assert.equal(analysis.total, 420, 'weight-analysis: must use current cargo weights for all placed levels')
    assert.ok(Math.abs(analysis.cg.x - box.length / 2) > 1, 'weight-analysis: off-centre upper cargo must affect longitudinal CG')
    assert.ok(Math.abs(analysis.cg.y - box.width / 2) > 1, 'weight-analysis: off-centre upper cargo must affect transverse CG')
    assert.ok(analysis.longitudinalOffset > 0, 'weight-analysis: longitudinal imbalance must not report zero')
    assert.ok(analysis.transverseOffsetMm > 1, 'weight-analysis: transverse offset must not report zero')
  }

  // Regression 6: every unit in a multi-level stack contributes its own 3D mass moment.
  // Use stale zero-weight placement snapshots to ensure the authoritative cargo
  // definition is applied to each placed unit, not once per SKU or floor layer.
  {
    const box = container()
    const shipment = [cargo({
      id: 'stacked-cartons',
      quantity: 4,
      length: 400,
      width: 300,
      height: 300,
      weight: 10,
    })]
    const placed = [
      { id: 'stack-1', cargoId: 'stacked-cartons', cargoType: 'carton', x: 1000, y: 200, z: 0, length: 400, width: 300, height: 300, rotation: 0, weight: 0, color: '#aaa', placementMode: 'automatic', locked: false },
      { id: 'stack-2', cargoId: 'stacked-cartons', cargoType: 'carton', x: 1000, y: 200, z: 300, length: 400, width: 300, height: 300, rotation: 0, weight: 0, color: '#aaa', placementMode: 'automatic', locked: false },
      { id: 'stack-3', cargoId: 'stacked-cartons', cargoType: 'carton', x: 1000, y: 200, z: 600, length: 400, width: 300, height: 300, rotation: 0, weight: 0, color: '#aaa', placementMode: 'automatic', locked: false },
      { id: 'stack-4', cargoId: 'stacked-cartons', cargoType: 'carton', x: 5000, y: 1000, z: 900, length: 400, width: 300, height: 300, rotation: 0, weight: 0, color: '#aaa', placementMode: 'automatic', locked: false },
    ]
    const analysis = analyzeWeight(placed, box, shipment)
    assert.equal(analysis.total, 40, 'stacked-weight: every stacked unit must contribute to total weight')
    assert.equal(analysis.cg.x, 2200, 'stacked-weight: X CG must include all four units')
    assert.equal(analysis.cg.y, 550, 'stacked-weight: Y CG must include all four units')
    assert.equal(analysis.cg.z, 600, 'stacked-weight: Z CG must include all four vertical levels')
  }

  // Regression 7: the optimizer's own objective must use the same current SKU
  // weights as the analysis panel, even when placed snapshots are stale.
  {
    const box = container()
    const shipment = [
      cargo({ id: 'heavy-front', weight: 100, quantity: 1 }),
      cargo({ id: 'light-rear', weight: 10, quantity: 1 }),
    ]
    const placed = [
      { id: 'heavy-front#1', cargoId: 'heavy-front', cargoType: 'carton', x: 0, y: 900, z: 0, length: 400, width: 300, height: 300, rotation: 0, weight: 0, color: '#aaa', placementMode: 'automatic', locked: false },
      { id: 'light-rear#1', cargoId: 'light-rear', cargoType: 'carton', x: 10000, y: 900, z: 0, length: 400, width: 300, height: 300, rotation: 0, weight: 0, color: '#aaa', placementMode: 'automatic', locked: false },
    ]
    const optimized = await optimizeLoad(placed, box, {
      cargoWeights: shipment.map(item => ({ id: item.id, weight: item.weight })),
      maxIterations: 100,
    })
    assert.ok(optimized.scoreBefore > 1, 'optimizer-weight: stale zero snapshots must not erase real mass imbalance')
    assert.equal(optimized.placed.length, placed.length, 'optimizer-weight: balancing must preserve loaded unit count')
  }

  // Regression 8: upper layers must be independently balanceable while
  // remaining fully supported; an already-centred pallet must not be dragged
  // around merely because the carton above it is offset.
  {
    const box = container()
    const shipment = [
      cargo({
        id: 'foundation-pallet',
        type: 'pallet',
        quantity: 1,
        length: 1200,
        width: 1000,
        height: 1200,
        weight: 400,
        stackable: false,
        loadBearing: true,
        maxStackLayers: 1,
        maxLoadOnTop: 5000,
      }),
      cargo({
        id: 'upper-carton',
        type: 'carton',
        quantity: 1,
        length: 400,
        width: 300,
        height: 300,
        weight: 20,
        stackable: true,
        loadBearing: true,
        maxStackLayers: 2,
        maxLoadOnTop: 100,
      }),
    ]
    const placed = [
      { id: 'foundation-pallet#1', cargoId: 'foundation-pallet', cargoType: 'pallet', x: 5416, y: 676, z: 0, length: 1200, width: 1000, height: 1200, rotation: 0, weight: 400, color: '#9a6638', placementMode: 'automatic', locked: true, stackable: false, loadBearing: true, maxStackLayers: 1, maxLoadOnTop: 5000 },
      { id: 'upper-carton#1', cargoId: 'upper-carton', cargoType: 'carton', x: 6216, y: 676, z: 1200, length: 400, width: 300, height: 300, rotation: 0, weight: 20, color: '#c7ced3', placementMode: 'automatic', locked: false, stackable: true, loadBearing: true, maxStackLayers: 2, maxLoadOnTop: 100 },
    ]
    assert.equal(validatePlan(placed, box, shipment).ok, true, 'upper-layer-balance: initial plan must be supported')
    const before = analyzeWeight(placed, box, shipment)
    assert.ok(before.maxLayerTransverseOffsetMm > 300, 'upper-layer-balance: per-layer analysis must expose the displaced upper layer')
    const optimized = await optimizeLoad(placed, box, {
      cargoWeights: shipment.map(item => ({ id: item.id, weight: item.weight })),
      maxIterations: 100,
    })
    const pallet = optimized.placed.find(item => item.cargoId === 'foundation-pallet')
    const upper = optimized.placed.find(item => item.cargoId === 'upper-carton')
    console.log('upper-layer-balance debug', { pallet: [pallet.x, pallet.y], upper: [upper.x, upper.y], scoreBefore: optimized.scoreBefore, scoreAfter: optimized.scoreAfter })
    assert.deepEqual([pallet.x, pallet.y], [5416, 676], 'upper-layer-balance: lower support must remain in place')
    assert.ok(Math.abs((upper.x + 200) - box.length / 2) < 6, 'upper-layer-balance: upper carton must move toward the longitudinal centre')
    assert.ok(Math.abs((upper.y + 150) - box.width / 2) < 6, 'upper-layer-balance: upper carton must move toward the transverse centre')
    assert.equal(optimized.placed.length, placed.length, 'upper-layer-balance: optimization must preserve cargo count')
    assert.equal(validatePlan(optimized.placed, box, shipment).ok, true, 'upper-layer-balance: optimized plan must remain supported')
  }

  console.log('Packing regression checks passed: homogeneous grid, mixed pallet/carton, payload limit, IBC + machinery, stacked-cargo weight analysis, independent upper-layer balancing.');

} finally {
  await server.close()
}
