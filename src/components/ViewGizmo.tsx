import type { View } from './ContainerScene'
export default function ViewGizmo({view,onView}:{view:View;onView:(v:View)=>void}){
 return <div className="blender-gizmo"><div className="gizmo-cube"><button className="face top" onClick={()=>onView('top')}>Z</button><button className="face front" onClick={()=>onView('front')}>X</button><button className="face side" onClick={()=>onView('right')}>Y</button><button className="axis ax" onClick={()=>onView('right')}>X</button><button className="axis ay" onClick={()=>onView('left')}>Y</button><button className="axis az" onClick={()=>onView('top')}>Z</button></div><div className="gizmo-caption">{view.toUpperCase()}</div></div>
}
