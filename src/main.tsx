import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import './beta.css'

class AppErrorBoundary extends React.Component<React.PropsWithChildren, {error: Error | null}> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error, info: React.ErrorInfo) { console.error('Load Calculator runtime error:', error, info) }
  render() {
    if (this.state.error) return <div style={{minHeight:'100%',display:'grid',placeItems:'center',background:'#171b1d',color:'#eee',fontFamily:'system-ui',padding:24}}><div style={{maxWidth:720,width:'100%',border:'1px solid #6d7578',padding:24,background:'#242a2c'}}><div style={{fontSize:12,letterSpacing:2,color:'#d88a45'}}>SYSTEM FAULT</div><h1 style={{margin:'10px 0'}}>装载系统启动失败</h1><p style={{color:'#b9c0c1'}}>3D 模块或浏览器运行环境发生错误。请打开浏览器 F12 → Console 查看具体错误。</p><pre style={{whiteSpace:'pre-wrap',fontSize:12,color:'#e6b36f',overflow:'auto'}}>{this.state.error.message}</pre><button onClick={()=>location.reload()} style={{padding:'9px 14px'}}>重新启动</button></div></div>
    return this.props.children
  }
}

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')
ReactDOM.createRoot(root).render(<AppErrorBoundary><App /></AppErrorBoundary>)
