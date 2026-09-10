import { useMemo, useState } from 'react'
import ContainerScene from './components/ContainerScene'
import { container40HQ, sampleCargo } from './data'
import type { Cargo } from './types'

function App() {
  const [cargo, setCargo] = useState<Cargo[]>(sampleCargo)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const totals = useMemo(() => {
    const cartons = cargo.reduce((sum, item) => sum + item.quantity, 0)
    const volume = cargo.reduce(
      (sum, item) =>
        sum + item.length * item.width * item.height * item.quantity / 1_000_000_000,
      0,
    )
    const weight = cargo.reduce(
      (sum, item) => sum + item.weight * item.quantity,
      0,
    )

    const containerVolume =
      container40HQ.length *
      container40HQ.width *
      container40HQ.height /
      1_000_000_000

    return {
      cartons,
      volume,
      weight,
      volumePercent: Math.min(100, volume / containerVolume * 100),
      weightPercent: Math.min(100, weight / container40HQ.maxWeight * 100),
    }
  }, [cargo])

  function addCargo() {
    const newCargo: Cargo = {
      id: `NEW-${cargo.length + 1}`,
      name: `NEW-${cargo.length + 1}`,
      quantity: 1,
      length: 500,
      width: 300,
      height: 300,
      weight: 10,
      color: '#f59e0b',
    }
    setCargo([...cargo, newCargo])
  }

  function updateCargo(id: string, field: keyof Cargo, value: string) {
    setCargo((current) =>
      current.map((item) => {
        if (item.id !== id) return item
        if (field === 'name' || field === 'id' || field === 'color') {
          return { ...item, [field]: value }
        }
        return { ...item, [field]: Number(value) }
      }),
    )
  }

  function removeCargo(id: string) {
    setCargo(cargo.filter((item) => item.id !== id))
    if (selectedId?.startsWith(id)) setSelectedId(null)
  }

  return (
    <div className="app">
      <header className="topbar">
        <div>
          <div className="eyebrow">LOGISTICS TOOL</div>
          <h1>Load Calculator</h1>
        </div>

        <div className="container-select">
          <span>Equipment</span>
          <strong>40HQ</strong>
          <span className="muted">12,032 × 2,352 × 2,698 mm</span>
        </div>
      </header>

      <section className="summary">
        <div>
          <span>Cartons</span>
          <strong>{totals.cartons}</strong>
        </div>
        <div>
          <span>Volume</span>
          <strong>{totals.volume.toFixed(2)} m³</strong>
        </div>
        <div>
          <span>Gross weight</span>
          <strong>{totals.weight.toFixed(1)} kg</strong>
        </div>
        <div className="summary-wide">
          <span>Utilization</span>
          <div className="progress-row">
            <label>Volume</label>
            <div className="progress"><i style={{ width: `${totals.volumePercent}%` }} /></div>
            <b>{totals.volumePercent.toFixed(0)}%</b>
          </div>
          <div className="progress-row">
            <label>Weight</label>
            <div className="progress"><i style={{ width: `${totals.weightPercent}%` }} /></div>
            <b>{totals.weightPercent.toFixed(0)}%</b>
          </div>
        </div>
      </section>

      <main className="workspace">
        <aside className="sidebar">
          <div className="sidebar-head">
            <div>
              <h2>Cargo</h2>
              <span>{cargo.length} cargo types</span>
            </div>
            <button onClick={addCargo}>+ Add</button>
          </div>

          <div className="cargo-list">
            {cargo.map((item) => (
              <div
                className={`cargo-card ${selectedId?.startsWith(item.id) ? 'active' : ''}`}
                key={item.id}
              >
                <div className="cargo-title">
                  <span className="dot" style={{ background: item.color }} />
                  <input
                    value={item.name}
                    onChange={(e) => updateCargo(item.id, 'name', e.target.value)}
                  />
                  <button className="delete" onClick={() => removeCargo(item.id)}>×</button>
                </div>

                <div className="fields">
                  <label>
                    Qty
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateCargo(item.id, 'quantity', e.target.value)}
                    />
                  </label>
                  <label>
                    Weight
                    <input
                      type="number"
                      value={item.weight}
                      onChange={(e) => updateCargo(item.id, 'weight', e.target.value)}
                    />
                  </label>
                </div>

                <div className="dims">
                  {item.length} × {item.width} × {item.height} mm
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="viewer">
          <div className="viewer-head">
            <div>
              <h2>3D Load View</h2>
              <span>Drag to rotate · Scroll to zoom · Click a box</span>
            </div>
            <div className="view-badge">PREVIEW</div>
          </div>

          <div className="canvas-wrap">
            <ContainerScene
              container={container40HQ}
              cargo={cargo}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </div>

          <div className="viewer-foot">
            <div>
              <span>Selected</span>
              <strong>{selectedId ?? 'None'}</strong>
            </div>
            <div>
              <span>Max payload</span>
              <strong>{container40HQ.maxWeight.toLocaleString()} kg</strong>
            </div>
            <div>
              <span>Mode</span>
              <strong>Simple shelf</strong>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App