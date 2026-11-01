# Ludens Agent · Hero

Ludens Agent 的独立单屏展示站，源码、图片、字体依赖和构建配置都在本仓库内，不依赖 Minecraft 服务。页面包含完整的浅色 / 深色主题、真实 Canvas 粒子人物和线性鲸尾 Logo，支持 GitHub Pages 部署。

## 运行

需要 Node.js 22.12+ 或 24+。

```powershell
cd website
npm ci
npm run dev
```

打开 <http://127.0.0.1:5173/>。

```powershell
npm run check
npm run build
npm run preview
```

构建产物是 `dist/`；生产预览为 <http://127.0.0.1:4173/>。本地构建不会发布网站。

## GitHub Pages

部署工作流为 [`.github/workflows/pages.yml`](.github/workflows/pages.yml)，在推送 `main` 或手动触发时执行。工作流使用 Node.js 24，安装锁定依赖、检查 JavaScript、构建 `dist/`，然后通过 GitHub 官方 Pages Actions 发布。

首次使用：

1. 在 GitHub 创建一个空仓库，不额外初始化 README 或其他文件。
2. 在本地仓库目录连接远程并推送，将下面的 `<owner>` 和 `<repo>` 替换为实际值：

   ```powershell
   git remote add origin https://github.com/<owner>/<repo>.git
   git push -u origin main
   ```

3. 在远程仓库的 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**。
4. 在 **Actions → Deploy GitHub Pages → Run workflow** 运行部署。以后每次推送 `main` 都会自动更新页面。若首次推送时尚未开启 Pages，完成设置后重新运行工作流即可。

工作流读取 Pages 的 `base_path`，自动匹配项目站点的 `/<repo>/` 路径或根域名路径，无需在代码中写死仓库名。部署完成后的页面地址会显示在 Actions 的 `github-pages` 环境中。无需手动创建 `gh-pages` 分支，也无需把 `dist/` 或 `node_modules/` 提交到 Git。

本地可验证项目子路径构建：

```powershell
npm run build -- --base /website/
npm run preview -- --base /website/
```

访问 <http://127.0.0.1:4173/website/>。普通本地构建仍使用相对路径 `./`。

配置依据：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Vite 的 GitHub Pages 部署说明](https://vite.dev/guide/static-deploy.html#github-pages)。

## 提交历史来源

本仓库通过 `git subtree split --prefix=website` 从原项目提取，只保留网站文件及相关提交。文件提升到仓库根目录后，Git 提交哈希会改变，原作者、时间、提交说明和网站修改顺序均保留。

| 原项目提交 | 独立仓库提交 | 内容 |
| --- | --- | --- |
| `42730b7` | `4a5656e` | 初始粒子展示站 |
| `f338267` | `4c07720` | 全人物粒子与局部发丝虚化 |
| `56d5f7d` | `a759a3c` | 加载顺序、主题过渡、随机打字 |
| `eef02af` | `5565b84` | 线性鲸尾、右上角控制栏、缩短入场空档 |

## 交互与实现

- `src/particles.js`：用离屏 Canvas 读取透明 PNG 的 RGBA 像素，每隔两个采样像素创建一个粒子，保留颜色、透明度、目标位置。桌面采样宽度为 960，手机为 480，具体粒子数量由图片透明轮廓决定。
- 整个人物始终由 Three.js `Points` 和自定义着色器绘制，从屏幕四边外部飞向对应像素目标；不使用纹理覆盖层。脸、手、服装和鲸尾由紧密聚合的彩色粒子呈现，只有左侧一小部分头发使用更疏散、更柔和的粒子。
- 头发区域由空间范围和蓝色像素共同限定，粒子沿原发丝轮廓向外飘移；密度、透明度、软边和位移渐变过渡，没有硬切线。鼠标可排斥整个人物的粒子，移开后归位。
- 鼠标 / 触摸局部排斥使用独立粒子的偏移和速度，阻尼弹簧让它们返回原位置。解构把粒子散布到全屏，再次点击可聚合；重播从屏幕四边重新开始。
- 首屏用内联关键样式直接显示当前主题底色并隐藏原图，等待页面资源、字体和 PNG 解码就绪后，先用 0.18 秒淡入界面，再播放约 3.6 秒的粒子汇聚；各粒子的错峰启动控制在前 16% 时长内，让粒子更早进入画面，避免原图闪现和字体重排打断动画。右上角明暗切换下方提供重播、解构 / 聚合、暂停 / 继续，桌面与手机均靠右排列。页面不可见时停止绘制。按设计要求，系统开启“减少动态效果”时仍播放入场和主题过渡，只减弱持续的环境与发丝运动；需要完全静止时点击暂停。用户主动重播或解构时播放完整动画。
- 桌面右侧状态文案在汇聚完成后开始打字：8 套文案随机切换，完整显示后停留 2.4–3.2 秒，逐字删除后输入下一句，相邻文案不重复。闪烁光标和文字跟随暂停按钮暂停，打字使用粒子动画的时间轴，不额外启动计时器。
- WebGL 2 不可用时显示同一张静态插图，并隐藏无法工作的粒子控制。JavaScript 禁用时也提供插图和入口链接。
- 主题默认跟随系统，手动选择保存为仅包含 `light` / `dark` 的本地 Cookie；背景、文本、按钮、轨道和散点以约 0.8 秒平滑渐变。CSS 注册颜色变量让渐变遮罩同步过渡，Canvas 独立插值主题色；粒子暂停时仍可切换主题，快速反向切换从当前颜色继续。
- 字体通过 npm 本地打包，不依赖运行时字体 CDN。标题 / 正文使用 Manrope Variable，技术文字使用 IBM Plex Mono，均为 OFL 授权。
- 项目入口与文档链接指向主项目 `https://github.com/Decision2016/Curio`，展示站自身的远程仓库可独立配置；可直接修改 `index.html` 中的入口链接。

## 素材与设计依据

最终人物素材：`public/assets/whale-girl.png`，1024 × 1536、RGBA 透明 PNG，由内置 imagegen 生成和定向编辑。

设计以用户提供的网站参考图为主体：蓝发蓝眼、白蓝服装、深色束腰、肩带银扣、透明飘带、伸手姿势；只从另一张角色立绘补充小鲸鳍耳和细长鲸尾。按最后确认采用短裙冒险家版本，前景手已修复为四指加一拇指。参考图的半幅明暗分割仅表示两个主题，不进入页面。

最终提示词要点：

> Preserve the reference website character's face, blue hair, white-blue adventure dress, shoulder buckles, navy lace-up corset, translucent ribbons, short skirt and reaching pose. Add only small dark whale-fin ears with pale inner surfaces and one slender navy whale tail from the character reference. Use a complete, solid character on a genuinely transparent background, without baked particles, UI or dividing lines. The foreground open hand must have exactly five digits: one thumb and four fingers; remove the extra rightmost digit without changing the other features.

角色特征核对参考：[社区角色规范](https://github.com/Neko3000/deepseek-whalechan)。这是用户参考图基础上的生成素材，不标作 DeepSeek 官方角色图。

字体参考：[Manrope 原作者仓库](https://github.com/sharanda/manrope)、[IBM Plex](https://github.com/IBM/plex)。字体授权文件保留在 `public/licenses/`，会随静态构建一同分发。
