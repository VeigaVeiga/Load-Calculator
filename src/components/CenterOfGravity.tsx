import type { WeightAnalysis } from '../analysis/weight'
import type { Container } from '../types'

export default function CenterOfGravity({analysis,container,lang='zh'}:{analysis:WeightAnalysis;container:Container;lang?:'zh'|'en'}){
  // Diagram is intentionally vertical: X (length) runs from FRONT to DOOR;
  // Y (width) runs horizontally. No left/right labels are used.
  const dx=analysis.cg.x-container.length/2
  const dy=analysis.cg.y-container.width/2
  const x=Math.max(18,Math.min(102,60+(dy/container.width)*42))
  const y=Math.max(14,Math.min(206,110-(dx/container.length)*88))
  const z=lang==='zh'
    ? {title:'重心',front:'柜头',door:'柜门',x:'X 方向',y:'Y 方向'}
    : {title:'Center of Gravity',front:'FRONT',door:'DOOR',x:'X direction',y:'Y direction'}
  return <div className="cg-panel">
    <div className="cg-title"><span>{z.title}</span><b>{analysis.total.toFixed(0)} kg</b></div>
    <div className="cg-box cg-vertical-box">
      <svg viewBox="0 0 120 220" aria-label={z.title}>
        <rect x="18" y="10" width="84" height="200"/>
        <line x1="60" y1="10" x2="60" y2="210" className="cg-axis"/>
        <line x1="18" y1="110" x2="102" y2="110" className="cg-axis"/>
        <line x1="60" y1="110" x2={x} y2={y} className="cg-vector"/>
        <circle cx={x} cy={y} r="5"/>
        <text x="60" y="7" text-anchor="middle">{z.front}</text>
        <text x="60" y="219" text-anchor="middle">{z.door}</text>
        <text x="105" y="114">Y+</text>
        <text x="63" y="20">X−</text>
        <text x="63" y="207">X+</text>
      </svg>
    </div>
    <div className="cg-values"><span>ΔX · {z.x}<b>{dx>=0?'+':''}{dx.toFixed(0)} mm</b></span><span>ΔY · {z.y}<b>{dy>=0?'+':''}{dy.toFixed(0)} mm</b></span></div>
  </div>
}
