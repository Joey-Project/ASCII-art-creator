# Glyph Mosaic Creator

Glyph Mosaic Creator 是一个静态 Web App, 用字符和字形把用户上传的图片重建成 typographic mosaic。首版面向 GitHub Pages 部署, 采用 Vite + TypeScript + pnpm 的静态 SPA 形态, 不需要服务端处理图片或字体。

Production domain: <https://glyph-mosaic-creator.mahane.me/>

## 核心能力

- 上传图片后先在浏览器本地确认 source edit, 再生成 glyph mosaic。
- Source edit 支持 crop, 90 度旋转, 无级旋转, horizontal/vertical flip, reset all 和按功能 reset。
- 默认只启用 ASCII 候选字符, 保持首屏性能和输出可预测。
- 非 ASCII 字形只在用户输入字符或显式启用 glyph pack 后进入候选库, 可覆盖汉字、日文假名、数学符号、emoji、音乐符号等可渲染 glyph。
- 默认只勾选一个内置字体和一个字重, 额外字体、font weight 和 glyph pack 由用户显式启用。
- 支持按 cell 级别混排 `glyph + font + weight`, 不依赖浏览器排版引擎做整段多字体流排。
- 支持单色和彩色模式: 单色模式用灰度和字体颜色生成, 彩色模式保留源图颜色并用字符表达明暗、纹理或轮廓。Color influence 滑块控制源图 cell 平均色参与候选评分的强度; 设为 0 会回到纯 feature matching。emoji 等内建彩色 glyph 也会按采样到的 native color 参与评分。
- 支持上传字体和本机字体扫描的渐进增强; 浏览器不支持本机字体访问时仍可使用默认字体和上传字体。字体列表支持 fuzzy search 和 exact text match。
- 支持设置网格密度: 直接指定行数/列数, 或按每多少源图像素对应一个 glyph 计算。默认根据上传图片尺寸推荐一个桌面可预览、移动端可操作的网格。
- 目标导出格式包括 `.txt`, `.png`, `.jpeg`, `.svg`, `.pdf`; 图片和 PDF 导出支持分辨率倍率和背景设置, PNG/SVG 在可行时支持透明背景。

## 使用模型

1. 选择或上传图片。上传图会先进入编辑确认步骤; `Load sample` 会直接生成, 但之后也可以用 `Edit source` 回到编辑器。
2. 在 source editor 顶部两行按钮中按需要 crop, rotate, flip。第一行是编辑操作和确认/取消, 第二行是对应 reset。Crop 模式有辅助线和暗化 overlay; `Expand crop` 允许裁剪框超出图像并用透明 padding 补齐。
3. 点 `Confirm` 后, 编辑结果会作为下游 source cache, 并按编辑后的尺寸推荐行列数。
4. 调整网格设置: 使用推荐行列数, 手动设置行/列, 或按像素步长生成 cell。
5. 选择 glyph 候选来源。默认 ASCII; 需要多语言或符号时, 输入字符或显式启用对应 glyph pack。User glyphs 会追加到已勾选 packs; 如果只想使用输入框里的字符, 需要取消勾选 ASCII 和其他 packs。
6. 选择字体来源和字重。默认只勾选 Monospace 和 `400 Regular`; 其它内置字体、上传字体和本机字体扫描作为显式增强能力。字体多时可以用搜索框筛选, 默认 fuzzy match, 也可以切到 exact text match。
7. 选择单色或彩色策略, 并用 Color influence 控制颜色还原对候选 glyph 的影响。默认值会把源图平均色、候选 foreground、背景色和 glyph 密度一起纳入评分; 设为 0 可只按明暗/纹理/轮廓匹配。
8. 预览结果并导出目标格式。

## Source edit 语义

编辑器保留原图和一组按用户操作顺序 replay 的 edit stages。每次工具操作完成后都成为一个 stage; 如果尾部已经是同类 stage, 继续进入同一工具会编辑这个尾部 stage, 否则会追加新 stage。编辑器打开时会暂时锁住下游生成和重新打开 source editor, 避免未确认上传被旧 source 覆盖。90 度旋转和 flip 不重采样; 无级旋转使用 Canvas `imageSmoothingQuality = high` 的浏览器高质量重采样。无级旋转会先保留完整外接画布, 只有最终确认时才执行旋转造成的出框裁剪; 如果后续 crop 使用 expand, 可以把旋转后原本会被裁掉的区域重新纳入输出。

如果没有任何 edit stage, `Confirm` 会保留原始上传图作为下游 source。实际进入编辑路径时, 工作 canvas 会限制在浏览器友好的尺寸预算内; 超大图片或过大的 expanded crop 会被限制到该预算, 以避免确认前就触发 canvas 内存或尺寸失败。拖拽 crop/rotate 时会缓存当前操作前的 replay stage, 并用 `requestAnimationFrame` 合并预览重绘, 避免每个 pointermove 都从原图重放所有操作。

例如先 rotate 再 crop 时, crop stage 会建立在旋转后的图像空间里; 先 crop 再 rotate 再 crop 时, 第二个 crop 是新的后续 stage, 不会改写前一个 crop。按功能 reset 会保守处理坐标依赖: reset rotate 或 flip 时, 这些变换之后创建的 crop 会被一并丢弃, 避免把旧坐标系里的裁剪框错误套到新图像空间。

## 字体和隐私

所有图片和字体处理都应在浏览器本地完成。上传的图片、上传字体和本机字体列表不需要发送到服务器。Local Font Access API 只在支持它的桌面 Chromium 浏览器、HTTPS 或 localhost 环境中作为可选能力出现, 并且必须经过用户授权; 不支持时 UI 会显示原因。

## 开发和验证

工程使用 Vite + TypeScript + pnpm。本地和 CI 验证命令:

- `pnpm format:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:e2e`
- `pnpm build`

Playwright e2e 是首版质量门槛的一部分, 覆盖上传图片生成非空预览、桌面/移动布局、显式非 ASCII glyph pack、source-pixels 网格模式、以及主要导出格式产生非空文件。

## 设计文档

- [Architecture](docs/design/architecture.md)
- [Project State](docs/PROJECT_STATE.md)
- [Project TODO](docs/PROJECT_TODO.md)
