import type { WeightAnalysis } from '../analysis/weight'
import type { Container } from '../types'

export default function CenterOfGravity({analysis,container,lang='zh'}:{analysis:WeightAnalysis;container:Container;lang?:'zh'|'en'}){
  const dx=analysis.cg.x-container.length/2
  const dy=analysis.cg.y-container.width/2
  // Diagram: FRONT at left, DOOR at right; +X points from front to door.
  // +Y points from left wall to right wall, shown bottom -> top.
  const px=Math.max(14,Math.min(186,100+(dx/container.length)*180))
  const py=Math.max(14,Math.min(106,60-(dy/container.width)*92))
  const z=lang==='zh'
    ? {title:'重心',front:'柜头',door:'柜门',left:'左侧',right:'右侧',x:'X 方向',y:'Y 方向'}
    : {title:'Center of Gravity',front:'FRONT',door:'DOOR',left:'LEFT',right:'RIGHT',x:'X direction',y:'Y direction'}
  return <div className="cg-panel">
    <div className="cg-title"><span>{z.title}</span><b>{analysis.total.toFixed(0)} kg</b></div>
    <div className="cg-orientation"><span>← {z.front}</span><span>{z.door} →</span></div>
    <div className="cg-box">
      <svg viewBox="0 0 200 120" aria-label={z.title}>
        <rect x="10" y="10" width="180" height="100"/>
        <line x1="100" y1="10" x2="100" y2="110"/>
        <line x1="10" y1="60" x2="190" y2="60"/>
        <line className="cg-arrow" x1="100" y1="60" x2="186" y2="60"/>
        <line className="cg-arrow" x1="100" y1="60" x2="100" y2="14"/>
        <line className="cg-vector" x1="100" y1="60" x2={px} y2={py}/>
        <circle cx={px} cy={py} r="4"/>
        <text x="15" y="19">{z.front}</text><text x="151" y="19">{z.door}</text>
        <text x="13" y="105">{z.left}</text><text x="160" y="105">{z.right}</text>
        <text x="174" y="56">X+</text><text x="104" y="20">Y+</text>
      </svg>
    </div>
    <div className="cg-values"><span>ΔX · {z.x}<b>{dx>=0?'+':''}{dx.toFixed(0)} mm</b></span><span>ΔY · {z.y}<b>{dy>=0?'+':''}{dy.toFixed(0)} mm</b></span></div>
  </div>
}
