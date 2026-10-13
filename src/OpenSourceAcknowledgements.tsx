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
        <section className="ack-section">
          <div className="ack-section-label">MEME IMAGE & COPY DATA</div>
          <h2>{zh ? '梗图与文案数据来源' : 'Meme image & copy data sources'}</h2>
          <div className="ack-table-wrap"><table className="ack-table"><thead><tr><th>{zh ? '素材' : 'Asset'}</th><th>{zh ? '来源 / 作者' : 'Source / author'}</th><th>{zh ? '说明' : 'Notes'}</th></tr></thead><tbody>
            <tr><td><b>{zh ? '侧栏梗图' : 'Sidebar meme image'}</b></td><td><a href="https://r2.vme.im/memes/1769666983755-8bc2f86c1eed.png" target="_blank" rel="noreferrer">VME50 hosted image ↗</a><br/><a href="https://github.com/vikiboss/v50" target="_blank" rel="noreferrer">vikiboss/v50 ↗</a></td><td>{zh ? '由用户指定的 VME50 图片资源下载并裁剪为白底本地图片。该资源页未标明原始创作者，故在此注明托管来源，不将原创权归于本站。' : 'Downloaded from the VME50-hosted asset supplied by the site owner and cropped onto a white background. The original creator is not identified in the asset URL; hosting source is credited without claiming authorship.'}</td></tr>
            <tr><td><b>{zh ? '随机文案数据' : 'Random copy dataset'}</b></td><td><a href="https://github.com/vikiboss/v50" target="_blank" rel="noreferrer">vikiboss/v50 ↗</a></td><td>{zh ? '本项目通过 CDN / GitHub Raw 读取 V50 的 static/v50.json，并在浏览器中随机抽取。V50 作者声明文案来自公开互联网，若有侵权可联系其删除。' : 'This project reads static/v50.json from V50 via CDN / GitHub Raw and picks an entry in the browser. V50 states its copy data was collected from the public internet and provides a removal contact for rights concerns.'}</td></tr>
            <tr><td><b>Upstream content projects</b></td><td><a href="https://github.com/zkl2333/vme" target="_blank" rel="noreferrer">zkl2333/vme ↗</a><br/><a href="https://github.com/whitescent/KFC-Crazy-Thursday" target="_blank" rel="noreferrer">whitescent/KFC-Crazy-Thursday ↗</a><br/><a href="https://github.com/FriedRiceNoodles/AyachiNene" target="_blank" rel="noreferrer">FriedRiceNoodles/AyachiNene ↗</a></td><td>{zh ? 'V50 作者特别列出的主要文案来源项目，感谢相关作者与贡献者。V50 未逐条标注每条文案的原始出处，因此无法保证具体句子与某个上游项目一一对应。' : 'Projects specifically acknowledged by V50 as major copy sources. V50 does not map every individual entry to its original source, so individual lines cannot reliably be attributed to a specific upstream project.'}</td></tr>
          </tbody></table></div>
          <p className="ack-small">{zh ? '素材归属与许可：梗图和文案的原始权利可能属于各自创作者；收录于公开仓库或可访问的 CDN 并不自动代表获得重新分发许可。本项目仅作来源致谢，不声称拥有这些素材的版权。如你是权利人并认为使用不妥，请通过项目 GitHub 联系维护者，我们会核查并及时移除。' : 'Rights and licensing: the original rights to the image and copy may belong to their respective creators. Public availability on a repository or CDN does not itself grant redistribution permission. This project credits sources and does not claim ownership. Rights holders who object may contact the maintainer through this project’s GitHub repository for review and prompt removal.'}</p>
        </section>
        <footer className="ack-footer"><span>LOAD CALCULATOR</span><span>{zh ? '感谢开源社区' : 'THANK YOU, OPEN-SOURCE COMMUNITY'}</span></footer>
      </main>
    </div>
  )
}
