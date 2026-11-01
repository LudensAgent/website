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

- `src/particles.js`：用离屏 Canvas 读取透明 PNG 的 RGBA 像素，每隔两个采样像素创建一个粒子，保留颜色、透明度、目标位置。桌面采样宽度为 800，手机为 360，具体粒子数量由图片透明轮廓决定。
- 入场主体由 Three.js `Points` 和自定义着色器绘制，从屏幕四边外部飞向对应像素目标。按用户追加的虚实结合要求，聚合后段逐渐显示高清纹理；纹理与粒子共享不规则渐变遮罩，只在左侧一小部分飘散的蓝色头发上保留虚化，脸、手、服装和鲸尾保持清晰。
- 头发区域由空间范围和蓝色像素共同限定，少量粒子沿原发丝轮廓向外飘移；过渡区没有硬切线。鼠标靠近高清区域时纹理轻微消散，露出对应的可排斥粒子；移开后恢复。
- 鼠标 / 触摸局部排斥使用独立粒子的偏移和速度，阻尼弹簧让它们返回原位置。解构把粒子散布到全屏，再次点击可聚合；重播从屏幕四边重新开始。
- 底部提供重播、解构 / 聚合、暂停 / 继续。页面不可见时停止绘制。系统开启“减少动态效果”时跳过入场并暂停；用户主动重播或继续后启用动画。
- WebGL 2 不可用时显示同一张静态插图，并隐藏无法工作的粒子控制。JavaScript 禁用时也提供插图和入口链接。
- 主题默认跟随系统，手动选择保存为仅包含 `light` / `dark` 的本地 Cookie；背景、文本、按钮、轨道和散点同步切换。
- 字体通过 npm 本地打包，不依赖运行时字体 CDN。标题 / 正文使用 Manrope Variable，技术文字使用 IBM Plex Mono，均为 OFL 授权。
- 项目入口与文档链接根据本仓库 `origin` 指向 `https://github.com/Decision2016/Curio`，可直接修改 `index.html` 中的链接。

## 素材与设计依据

最终人物素材：`public/assets/whale-girl.png`，1024 × 1536、RGBA 透明 PNG，由内置 imagegen 生成和定向编辑。

设计以用户提供的网站参考图为主体：蓝发蓝眼、白蓝服装、深色束腰、肩带银扣、透明飘带、伸手姿势；只从另一张角色立绘补充小鲸鳍耳和细长鲸尾。按最后确认采用短裙冒险家版本，前景手已修复为四指加一拇指。参考图的半幅明暗分割仅表示两个主题，不进入页面。

最终提示词要点：

> Preserve the reference website character's face, blue hair, white-blue adventure dress, shoulder buckles, navy lace-up corset, translucent ribbons, short skirt and reaching pose. Add only small dark whale-fin ears with pale inner surfaces and one slender navy whale tail from the character reference. Use a complete, solid character on a genuinely transparent background, without baked particles, UI or dividing lines. The foreground open hand must have exactly five digits: one thumb and four fingers; remove the extra rightmost digit without changing the other features.

角色特征核对参考：[社区角色规范](https://github.com/Neko3000/deepseek-whalechan)。这是用户参考图基础上的生成素材，不标作 DeepSeek 官方角色图。

字体参考：[Manrope 原作者仓库](https://github.com/sharanda/manrope)、[IBM Plex](https://github.com/IBM/plex)。字体授权文件保留在 `public/licenses/`，会随静态构建一同分发。
