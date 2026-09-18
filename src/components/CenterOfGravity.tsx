import type { WeightAnalysis } from '../analysis/weight'
import type { Container } from '../types'

export default function CenterOfGravity({analysis,container,lang='zh'}:{analysis:WeightAnalysis;container:Container;lang?:'zh'|'en'}){
  const dx=analysis.cg.x-container.length/2
  const dy=analysis.cg.y-container.width/2
  const x=Math.max(18,Math.min(102,60+(dy/container.width)*42))
  const y=Math.max(14,Math.min(206,110-(dx/container.length)*88))
  return <div className="cg-panel">
    <div className="cg-title"><span>{lang==='zh'?'装载重心':'LOAD CENTER OF GRAVITY'}</span></div>
    <div className="cg-box cg-vertical-box">
      <svg viewBox="0 0 120 220" aria-label={lang==='zh'?'集装箱重心图':'Container center of gravity'}>
        <rect x="18" y="10" width="84" height="200" rx="1"/>
        <line x1="60" y1="10" x2="60" y2="210" className="cg-axis"/>
        <line x1="18" y1="110" x2="102" y2="110" className="cg-axis"/>
        <line x1="60" y1="110" x2={x} y2={y} className="cg-vector"/>
        <circle cx={x} cy={y} r="5"/>
        <text x="60" y="219" textAnchor="middle">{lang==='zh'?'柜门':'DOOR'}</text>
      </svg>
    </div>
  </div>
}
