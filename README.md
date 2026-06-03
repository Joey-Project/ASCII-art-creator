# Glyph Mosaic Creator

Glyph Mosaic Creator 是一个静态 Web App, 用字符和字形把用户上传的图片重建成 typographic mosaic。首版面向 GitHub Pages 部署, 采用 Vite + TypeScript + pnpm 的静态 SPA 形态, 不需要服务端处理图片或字体。

Production domain: <https://glyph-mosaic-creator.mahane.me/>

## 核心能力

- 上传图片后在浏览器本地生成 glyph mosaic。
- 默认只启用 ASCII 候选字符, 保持首屏性能和输出可预测。
- 非 ASCII 字形只在用户输入字符或显式启用 glyph pack 后进入候选库, 可覆盖汉字、日文假名、数学符号、emoji、音乐符号等可渲染 glyph。
- 支持按 cell 级别混排 `glyph + font + weight`, 不依赖浏览器排版引擎做整段多字体流排。
- 支持单色和彩色模式: 单色模式用灰度和字体颜色生成, 彩色模式保留源图颜色并用字符表达明暗、纹理或轮廓。
- 支持上传字体和本机字体扫描的渐进增强; 浏览器不支持本机字体访问时仍可使用默认字体和上传字体。
- 支持设置网格密度: 直接指定行数/列数, 或按每多少源图像素对应一个 glyph 计算。默认根据上传图片尺寸推荐一个桌面可预览、移动端可操作的网格。
- 目标导出格式包括 `.txt`, `.png`, `.jpeg`, `.svg`, `.pdf`; 图片和 PDF 导出支持分辨率倍率和背景设置, PNG/SVG 在可行时支持透明背景。

## 使用模型

1. 选择或上传图片。
2. 调整网格设置: 使用推荐行列数, 手动设置行/列, 或按像素步长生成 cell。
3. 选择 glyph 候选来源。默认 ASCII; 需要多语言或符号时, 输入字符或显式启用对应 glyph pack。
4. 选择字体来源和字重。默认字体可直接使用, 上传字体和本机字体扫描作为增强能力。
5. 选择单色或彩色策略, 可启用边缘方向、局部对比度、形状匹配和 dithering 等质量选项。
6. 预览结果并导出目标格式。

## 字体和隐私

所有图片和字体处理都应在浏览器本地完成。上传的图片、上传字体和本机字体列表不需要发送到服务器。Local Font Access API 只在支持它的桌面浏览器中作为可选能力出现, 并且必须经过用户授权。

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
