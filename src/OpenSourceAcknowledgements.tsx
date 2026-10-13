type Props = { lang: 'zh' | 'en'; onBack: () => void }

const MIT_TEXT = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`

export default function OpenSourceAcknowledgements({ lang, onBack }: Props) {
  const zh = lang === 'zh'
  return (
    <div className="ack-page">
      <header className="ack-topbar">
        <div className="ack-brand"><span className="ack-mark">LC</span><div><b>{zh ? '集装箱装载规划器' : 'Container Loading Planner'}</b><small>OPEN-SOURCE ACKNOWLEDGEMENTS</small></div></div>
        <button type="button" className="ack-back" onClick={onBack}>← {zh ? '返回装载规划器' : 'Back to planner'}</button>
      </header>
      <main className="ack-content">
        <div className="ack-eyebrow">ABOUT THIS PROJECT / 01</div>
        <h1>{zh ? '开源致谢与许可证' : 'Open-source acknowledgements & licenses'}</h1>
        <p className="ack-lead">{zh ? '一个实用的装载工具，离不开人的想法、AI 的协作，以及开源社区多年积累的成果。这里记录那些让项目得以持续构建的贡献。' : 'A practical loading tool is made possible by human ideas, AI collaboration, and years of work from the open-source community. This page recognizes the contributions behind the project.'}</p>

        <section className="ack-cast">
          <div className="ack-section-label">{zh ? '特别鸣谢 / THE LEAD CAST' : 'SPECIAL THANKS / THE LEAD CAST'}</div>
          <h2>{zh ? '本站领衔主演' : 'The lead cast'}</h2>
          <div className="ack-cast-grid">
            <article><span className="ack-number">01</span><h3>Veiga</h3><p>{zh ? '产品构想、需求定义与项目负责人' : 'Product vision, requirements, and project lead'}</p></article>
            <article><span className="ack-number">02</span><h3>ChatGPT</h3><p>{zh ? 'AI 技术搭档、代码协作与问题排查' : 'AI technical partner, coding collaboration, and troubleshooting'}</p></article>
            <article><span className="ack-number">03</span><h3>{zh ? '开源社区' : 'Open-source community'}</h3><p>{zh ? '提供优秀的基础工具、框架与技术成果' : 'Libraries, frameworks, and technical work shared by developers worldwide'}</p></article>
          </div>
          <blockquote>{zh ? '本项目由人类提出方向，由 AI 协助开发，并站在开源社区的肩膀上持续迭代。' : 'Guided by human ideas, developed with AI assistance, and continually improved on the shoulders of the open-source community.'}</blockquote>
        </section>

        <section className="ack-section">
          <div className="ack-section-label">02 / THIRD-PARTY SOFTWARE</div>
          <h2>{zh ? '主要开源组件' : 'Key open-source components'}</h2>
          <p>{zh ? '以下列出项目直接声明的主要运行时依赖及其上游许可证入口。依赖的具体版本以仓库中的 package.json 与 package-lock.json 为准。' : 'The following are the main directly declared runtime dependencies and links to their upstream license information. Exact versions are recorded in package.json and package-lock.json.'}</p>
          <div className="ack-table-wrap"><table className="ack-table"><thead><tr><th>{zh ? '组件' : 'Component'}</th><th>Version</th><th>{zh ? '许可证' : 'License'}</th><th>{zh ? '项目与许可证' : 'Project & license'}</th></tr></thead><tbody>
            <tr><td><b>React / React DOM</b><small>{zh ? '界面与应用基础' : 'UI and application foundation'}</small></td><td>19.2.0</td><td><span className="ack-license">MIT</span></td><td><a href="https://github.com/facebook/react" target="_blank" rel="noreferrer">Upstream ↗</a></td></tr>
            <tr><td><b>Three.js</b><small>{zh ? '3D 图形引擎' : '3D graphics engine'}</small></td><td>0.180.0</td><td><span className="ack-license">MIT</span></td><td><a href="https://threejs.org/license/" target="_blank" rel="noreferrer">License ↗</a></td></tr>
            <tr><td><b>@react-three/fiber</b><small>{zh ? 'React 与 Three.js 的渲染桥接' : 'React renderer for Three.js'}</small></td><td>9.7.0</td><td><span className="ack-license">MIT</span></td><td><a href="https://github.com/pmndrs/react-three-fiber/blob/master/LICENSE" target="_blank" rel="noreferrer">License ↗</a></td></tr>
            <tr><td><b>@react-three/drei</b><small>{zh ? '3D 场景辅助工具' : 'Helpers for 3D scenes'}</small></td><td>10.7.8</td><td><span className="ack-license">MIT</span></td><td><a href="https://github.com/pmndrs/drei/blob/master/LICENSE" target="_blank" rel="noreferrer">License ↗</a></td></tr>
            <tr><td><b>SheetJS Community Edition (xlsx)</b><small>{zh ? '电子表格数据处理' : 'Spreadsheet data processing'}</small></td><td>0.18.5</td><td><span className="ack-license ack-apache">Apache-2.0</span></td><td><a href="https://docs.sheetjs.com/docs/miscellany/license/" target="_blank" rel="noreferrer">License & attribution ↗</a></td></tr>
          </tbody></table></div>
          <div className="ack-notice"><b>{zh ? 'SheetJS CE 署名声明' : 'SheetJS CE attribution'}</b><pre>{'SheetJS Community Edition -- https://sheetjs.com/\nCopyright (C) 2012-present SheetJS LLC\nLicensed under the Apache License, Version 2.0 (the "License");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\nhttp://www.apache.org/licenses/LICENSE-2.0\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an "AS IS" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.'}</pre></div>
        </section>

        <section className="ack-section">
          <div className="ack-section-label">03 / LICENSE TEXTS</div>
          <h2>{zh ? '许可证文本与版权声明' : 'License texts & copyright notices'}</h2>
          <p>{zh ? 'MIT 许可组件要求在软件副本或重要部分中保留相应版权声明与许可声明。下方展示 MIT 许可证核心文本；各组件特定的版权归属请以其上游仓库中的 LICENSE 文件为准。' : 'MIT-licensed components require their copyright and permission notices to be retained in copies or substantial portions. The MIT license text is reproduced below; consult each upstream LICENSE file for component-specific copyright notices.'}</p>
          <details className="ack-license-details"><summary>MIT License — text</summary><pre>{MIT_TEXT}</pre></details>
          <p className="ack-small">{zh ? 'Apache License 2.0 的完整文本：' : 'Full text of the Apache License 2.0: '}<a href="https://www.apache.org/licenses/LICENSE-2.0" target="_blank" rel="noreferrer">apache.org/licenses/LICENSE-2.0 ↗</a></p>
          <p className="ack-small">{zh ? '第三方组件可能包含各自的传递依赖；其版权和许可证仍以对应项目及锁定版本所附文件为准。此页面是主要组件的致谢入口，不应被视为完整的法律审计报告。' : 'Third-party components may include transitive dependencies, whose copyrights and licenses are governed by their respective projects and locked versions. This page is an acknowledgement for key components, not a complete legal audit.'}</p>
        </section>

        <section className="ack-scope">
          <div className="ack-section-label">04 / SCOPE</div>
          <h2>{zh ? '适用范围说明' : 'Scope of this notice'}</h2>
          <p>{zh ? '本页面用于说明集装箱装载规划器所使用的部分第三方软件及其许可证信息。第三方组件仍受各自许可证与版权声明约束。本页面本身不授予本应用程序源代码的任何许可证，也不会改变任何第三方组件的许可条款。除非项目另行明确声明，不能仅凭本页面推断整个 Load Calculator 项目采用 MIT、Apache-2.0 或其他开源许可证。' : 'This page documents selected third-party software and license information used by Container Loading Planner. Third-party components remain subject to their own licenses and copyright notices. This page does not grant a license to the Load Calculator application source code or change any third-party terms. Unless separately stated by the project, this page should not be interpreted as licensing the entire application under MIT, Apache-2.0, or any other open-source license.'}</p>
        </section>
        <footer className="ack-footer"><span>LOAD CALCULATOR / OPEN-SOURCE NOTES</span><span>BUILT WITH OPEN-SOURCE SOFTWARE</span></footer>
      </main>
    </div>
  )
}
