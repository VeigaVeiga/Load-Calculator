type Props = { lang: 'zh' | 'en'; onBack: () => void }

export default function OpenSourceAcknowledgements({ lang, onBack }: Props) {
  const zh = lang === 'zh'
  return (
    <div className="ack-page">
      <header className="ack-topbar">
        <div className="ack-brand"><span className="ack-mark">LC</span><div><b>{zh ? '集装箱装载规划器' : 'Container Loading Planner'}</b><small>OPEN-SOURCE ACKNOWLEDGEMENTS</small></div></div>
        <button type="button" className="ack-back" onClick={onBack}>← {zh ? '返回装载规划器' : 'Back to planner'}</button>
      </header>
      <main className="ack-content">
        <div className="ack-eyebrow">ABOUT THIS PROJECT</div>
        <h1>{zh ? '开源致谢与许可证' : 'Open-source acknowledgements & licenses'}</h1>
        <p className="ack-lead">{zh ? '网站作者：Veiga。特别鸣谢所有开源作者与维护者，感谢他们分享优秀的工具、框架和技术成果。' : 'Created by Veiga. Special thanks to all open-source authors and maintainers for sharing their excellent tools, frameworks, and technical work.'}</p>
        <section className="ack-section">
          <div className="ack-section-label">OPEN-SOURCE COMPONENTS</div>
          <h2>{zh ? '主要开源组件' : 'Key open-source components'}</h2>
          <div className="ack-table-wrap"><table className="ack-table"><thead><tr><th>{zh ? '组件' : 'Component'}</th><th>Version</th><th>{zh ? '许可证' : 'License'}</th><th>{zh ? '项目链接' : 'Project'}</th></tr></thead><tbody>
            <tr><td><b>React / React DOM</b></td><td>19.2.0</td><td><span className="ack-license">MIT</span></td><td><a href="https://github.com/facebook/react" target="_blank" rel="noreferrer">GitHub ↗</a></td></tr>
            <tr><td><b>Three.js</b></td><td>0.180.0</td><td><span className="ack-license">MIT</span></td><td><a href="https://threejs.org/license/" target="_blank" rel="noreferrer">License ↗</a></td></tr>
            <tr><td><b>@react-three/fiber</b></td><td>9.7.0</td><td><span className="ack-license">MIT</span></td><td><a href="https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE" target="_blank" rel="noreferrer">License ↗</a></td></tr>
            <tr><td><b>@react-three/drei</b></td><td>10.7.8</td><td><span className="ack-license">MIT</span></td><td><a href="https://github.com/pmndrs/drei/blob/master/LICENSE" target="_blank" rel="noreferrer">License ↗</a></td></tr>
            <tr><td><b>SheetJS Community Edition (xlsx)</b></td><td>0.18.5</td><td><span className="ack-license ack-apache">Apache-2.0</span></td><td><a href="https://docs.sheetjs.com/docs/miscellany/license/" target="_blank" rel="noreferrer">License ↗</a></td></tr>
          </tbody></table></div>
          <p className="ack-small">{zh ? '各第三方组件均受其自身许可证约束。完整许可条款及版权声明请参阅对应项目的官方页面。' : 'Third-party components remain subject to their respective licenses. Please refer to each project’s official page for full terms and copyright notices.'}</p>
          <p className="ack-small">{zh ? '本页面仅为第三方组件致谢，不代表 Load Calculator 整个项目采用上述任何开源许可证。' : 'This page acknowledges third-party components and does not mean the entire Load Calculator project is licensed under any of the licenses listed above.'}</p>
        </section>
        <footer className="ack-footer"><span>LOAD CALCULATOR</span><span>{zh ? '感谢开源社区' : 'THANK YOU, OPEN-SOURCE COMMUNITY'}</span></footer>
      </main>
    </div>
  )
}
