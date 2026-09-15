import type { Cargo } from '../types'
export const cargoTemplates:Cargo[]=[
 {id:'CARTON-001',name:'Standard Carton',type:'carton',quantity:20,length:600,width:400,height:400,weight:18,color:'#b88b5a',showName:false,stackable:true,rotatable:true,maxStackLayers:5,maxLoadOnTop:200,breakablePallet:false},
 {id:'PALLET-001',name:'Euro Pallet',type:'pallet',quantity:4,length:1200,width:800,height:1450,weight:520,color:'#c9954e',showName:false,stackable:false,rotatable:true,maxStackLayers:1,maxLoadOnTop:0,breakablePallet:false},
 {id:'CRATE-001',name:'Wooden Crate',type:'woodCrate',quantity:3,length:1000,width:800,height:900,weight:260,color:'#a87845',showName:false,stackable:true,rotatable:true,maxStackLayers:3,maxLoadOnTop:250,breakablePallet:false},
]
