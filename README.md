# Ludens Agent · Hero

独立单屏首页，所有源码、图片、字体依赖和构建配置均在 `website/` 内，不依赖 Minecraft 服务。页面包含完整的浅色 / 深色主题，不使用参考图中的中间分界线。

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

构建产物是 `dist/`，可放到静态服务器，包括子路径；生产预览为 <http://127.0.0.1:4173/>。不自动发布。

## 交互与实现

- `src/particles.js`：用离屏 Canvas 读取透明 PNG 的 RGBA 像素，每隔两个采样像素创建一个粒子，保留颜色、透明度、目标位置。桌面采样宽度为 960，手机为 480，具体粒子数量由图片透明轮廓决定。
- 整个人物始终由 Three.js `Points` 和自定义着色器绘制，从屏幕四边外部飞向对应像素目标；不使用纹理覆盖层。脸、手、服装和鲸尾由紧密聚合的彩色粒子呈现，只有左侧一小部分头发使用更疏散、更柔和的粒子。
- 头发区域由空间范围和蓝色像素共同限定，粒子沿原发丝轮廓向外飘移；密度、透明度、软边和位移渐变过渡，没有硬切线。鼠标可排斥整个人物的粒子，移开后归位。
- 鼠标 / 触摸局部排斥使用独立粒子的偏移和速度，阻尼弹簧让它们返回原位置。解构把粒子散布到全屏，再次点击可聚合；重播从屏幕四边重新开始。
- 首屏用内联关键样式直接显示当前主题底色并隐藏原图，等待页面资源、字体和 PNG 解码就绪后，先用 0.45 秒淡入界面，再播放约 3.6 秒的粒子汇聚，避免原图闪现和字体重排打断动画。底部提供重播、解构 / 聚合、暂停 / 继续。页面不可见时停止绘制。按设计要求，系统开启“减少动态效果”时仍播放入场和主题过渡，只减弱持续的环境与发丝运动；需要完全静止时点击暂停。用户主动重播或解构时播放完整动画。
- 桌面右侧状态文案在汇聚完成后开始打字：8 套文案随机切换，完整显示后停留 2.4–3.2 秒，逐字删除后输入下一句，相邻文案不重复。闪烁光标和文字跟随暂停按钮暂停，打字使用粒子动画的时间轴，不额外启动计时器。
- WebGL 2 不可用时显示同一张静态插图，并隐藏无法工作的粒子控制。JavaScript 禁用时也提供插图和入口链接。
- 主题默认跟随系统，手动选择保存为仅包含 `light` / `dark` 的本地 Cookie；背景、文本、按钮、轨道和散点以约 0.8 秒平滑渐变。CSS 注册颜色变量让渐变遮罩同步过渡，Canvas 独立插值主题色；粒子暂停时仍可切换主题，快速反向切换从当前颜色继续。
- 字体通过 npm 本地打包，不依赖运行时字体 CDN。标题 / 正文使用 Manrope Variable，技术文字使用 IBM Plex Mono，均为 OFL 授权。
- 项目入口与文档链接根据本仓库 `origin` 指向 `https://github.com/Decision2016/Curio`，可直接修改 `index.html` 中的链接。

## 素材与设计依据

最终人物素材：`public/assets/whale-girl.png`，1024 × 1536、RGBA 透明 PNG，由内置 imagegen 生成和定向编辑。

设计以用户提供的网站参考图为主体：蓝发蓝眼、白蓝服装、深色束腰、肩带银扣、透明飘带、伸手姿势；只从另一张角色立绘补充小鲸鳍耳和细长鲸尾。按最后确认采用短裙冒险家版本，前景手已修复为四指加一拇指。参考图的半幅明暗分割仅表示两个主题，不进入页面。

最终提示词要点：

> Preserve the reference website character's face, blue hair, white-blue adventure dress, shoulder buckles, navy lace-up corset, translucent ribbons, short skirt and reaching pose. Add only small dark whale-fin ears with pale inner surfaces and one slender navy whale tail from the character reference. Use a complete, solid character on a genuinely transparent background, without baked particles, UI or dividing lines. The foreground open hand must have exactly five digits: one thumb and four fingers; remove the extra rightmost digit without changing the other features.

角色特征核对参考：[社区角色规范](https://github.com/Neko3000/deepseek-whalechan)。这是用户参考图基础上的生成素材，不标作 DeepSeek 官方角色图。

字体参考：[Manrope 原作者仓库](https://github.com/sharanda/manrope)、[IBM Plex](https://github.com/IBM/plex)。字体授权文件保留在 `public/licenses/`，会随静态构建一同分发。
