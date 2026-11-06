import type { WeightAnalysis } from '../analysis/weight'
import type { Container } from '../types'

export default function CenterOfGravity({ analysis, container, lang = 'zh' }: {
  analysis: WeightAnalysis
  container: Container
  lang?: 'zh' | 'en'
}) {
  const dx = analysis.cg.x - container.length / 2
  const dy = analysis.cg.y - container.width / 2
  const plotX = 18 + (analysis.cg.x / container.length) * 144
  const plotY = 14 + (analysis.cg.y / container.width) * 72
  const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(1)} mm`

  return (
    <div className="cg-panel">
      <div className="cg-title">
        <span>{lang === 'zh' ? '装载重心 · 俯视与分层' : 'LOAD CG · PLAN & LAYERS'}</span>
      </div>

      <div className="cg-box" style={{ padding: '8px 10px' }}>
        <svg viewBox="0 0 180 100" role="img" aria-label={lang === 'zh' ? '集装箱平面重心位置' : 'Container plan CG position'} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <rect x="18" y="14" width="144" height="72" rx="1" fill="none" stroke="currentColor" strokeWidth="1.2" />
          <line x1="90" y1="14" x2="90" y2="86" stroke="#2674c8" strokeWidth="1.4" />
          <line x1="18" y1="50" x2="162" y2="50" stroke="#e58a2d" strokeWidth="1.4" strokeDasharray="4 3" />
          <line x1="90" y1="50" x2={Math.max(18, Math.min(162, plotX))} y2={Math.max(14, Math.min(86, plotY))} stroke="#e8792e" strokeWidth="1.8" />
          <circle cx={Math.max(18, Math.min(162, plotX))} cy={Math.max(14, Math.min(86, plotY))} r="4" fill="#e8792e" stroke="#fff" strokeWidth="1" />
          <text x="18" y="9" fontSize="6" fill="currentColor">{lang === 'zh' ? '柜头' : 'FRONT'}</text>
          <text x="162" y="9" fontSize="6" textAnchor="end" fill="currentColor">{lang === 'zh' ? '柜门' : 'DOOR'}</text>
          <text x="90" y="97" fontSize="6" textAnchor="middle" fill="currentColor">{lang === 'zh' ? '蓝线：纵向中心 · 橙线：横向中心' : 'Blue: longitudinal centre · Orange: transverse centre'}</text>
        </svg>
      </div>

      <div className="cg-layer-summary" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
        <div>
          <small>{lang === 'zh' ? '纵向偏移' : 'X OFFSET'}</small>
          <strong>{signed(dx)}</strong>
        </div>
        <div>
          <small>{lang === 'zh' ? '横向偏移' : 'Y OFFSET'}</small>
          <strong>{signed(dy)}</strong>
        </div>
      </div>

      <div className="cg-layer-list" style={{ marginTop: '12px' }}>
        <div className="cg-title">
          <span>{lang === 'zh' ? `各装载高度层 · ${analysis.layers.length} 层` : `LOADING LEVELS · ${analysis.layers.length}`}</span>
        </div>
        {analysis.layers.length === 0 ? (
          <p className="analysis-note">{lang === 'zh' ? '暂无已装载货物' : 'No cargo loaded'}</p>
        ) : (
          <div style={{ display: 'grid', gap: '5px', marginTop: '7px' }}>
            {analysis.layers.map((layer, index) => (
              <div key={`${layer.z}-${index}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(44px,.65fr) minmax(55px,.8fr) 1fr 1fr', gap: '5px', alignItems: 'center', padding: '6px 7px', border: '1px solid rgba(130,150,170,.22)', borderRadius: '4px', fontSize: '11px' }}>
                <span>{lang === 'zh' ? `Z ${Math.round(layer.z)}` : `Z ${Math.round(layer.z)}`}</span>
                <strong>{layer.total.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg</strong>
                <span title={lang === 'zh' ? '相对集装箱纵向中心线' : 'Offset from longitudinal centreline'}>X {signed(layer.cg.x - container.length / 2)}</span>
                <span title={lang === 'zh' ? '相对集装箱横向中心线' : 'Offset from transverse centreline'}>Y {signed(layer.cg.y - container.width / 2)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
