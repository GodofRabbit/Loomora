# Loomora · 织光成画

> 把灵感变成画面。Loom light into images.

Loomora 是一款面向 Windows 与 macOS 的跨平台 AI 图片创作与管理桌面应用，基于 Electron、Vue 3 和 Vite 构建。它默认通过 OpenAI 官方图片生成接口生成作品，也支持切换到兼容 OpenAI 协议的服务地址，并在本地完成作品管理、图片编辑、马赛克处理和 OCR 文字识别。

## 功能概览

### AI 图片生成

- 支持最长 4000 字的中文或英文提示词。
- 支持 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3` 等常用画面比例。
- 分辨率提供按比例自动、常用基础尺寸、`16:9（2K）`、`9:16（2K）`、`16:9（4K）`、`9:16（4K）` 等选项。
- 支持选择官方输出格式 `PNG`、`JPEG` 和 `WEBP`，默认使用 `PNG`。
- 基于 OpenAI 官方 `gpt-image-2`，生成过程支持流式预览。
- 创作页采用聊天式历史记录，每一次生成都会保留为一轮对话，可向上回看提示词、生成参数、进度、结果图和保存位置。
- 创作对话会按日期保存到作品目录，每个 `Gallery/YYYY-MM-DD/` 下会维护一个当天的 `conversations.json`。
- 接口地址默认是 `https://api.openai.com`，可改为兼容 OpenAI 协议的第三方服务。
- 单次可连续生成多张图片，OpenAI 官方模型当前在应用内限制最多 10 张。
- 单张生成走流式预览，批量生成走一次性返回的 `n` 请求，结果都会自动保存到本地。
- 参考图支持文件选择或通过 `Ctrl+V` 从剪贴板直接添加，可点击大图预览。

### 本地作品库

- 生成的图片按日期保存到 `Gallery/YYYY-MM-DD/`，当天的创作对话保存到同目录下的 `conversations.json`。
- 作品库按原图比例采用瀑布流排版，并优先展示最新作品。
- 可点击“导入图片”或直接拖拽图片到作品库区域导入本地图片。
- 作品库左侧提供浮动日期时间线，按“全部”或某一天筛选，日期节点会显示对应作品数量。
- 作品库支持批量导出全部、当前日期或勾选图片，导出时会自动创建文件夹。
- 点击图片可进入大图预览，并在多图间切换。
- 右键菜单支持复制、下载、识别文字、编辑、重命名、打开文件所在位置和删除。
- 下载时使用系统“另存为”窗口选择保存位置，完成后显示提示。
- 删除本地作品前会弹出二次确认。

开发模式和 Windows 打包版会优先在程序所在目录创建 `Gallery/`，如果该目录不可写，则自动使用 Electron 用户数据目录下的 `Gallery/`。macOS 打包版会优先使用 Electron 用户数据目录下的 `Gallery/`，避免向 `.app` 应用包内部写入作品。

### 图片编辑

作品库中的图片可以从预览窗口或右键菜单进入编辑器。编辑功能由 TOAST UI Image Editor 提供，界面已汉化，支持：

- 裁剪、翻转和旋转。
- 涂鸦、形状、图标和文字。
- 图片滤镜。
- 可调笔刷大小的马赛克涂抹工具。
- 在当前编辑画面中识别文字。

编辑完成后会以新的 PNG 图片保存到原作品目录，不会覆盖原图。

### 本地 OCR 文字识别

Loomora 集成 Paddle.js OCR，可从以下入口识别图片文字：

- 图片大图预览。
- 作品右键菜单。
- 图片编辑器中的当前画面。

检测与识别模型随应用保存在 `renderer/public/models/ocr/`，识别过程在本地执行，不需要额外配置 OCR 服务。识别结果从右侧抽屉展示，并支持一键复制全部文字。

### 接口设置

点击顶部导航右侧的齿轮图标即可打开设置弹窗：

- 接口地址默认填充 `https://api.openai.com`。
- API Key 默认留空。
- 点击“保存配置”后，接口地址和 API Key 会保存到 `localStorage`，下次启动自动恢复。
- 点击取消、关闭按钮或按 `Esc` 会放弃本次修改；点击遮罩不会关闭弹窗。

注意：API Key 以明文形式存储在应用渲染进程的 `localStorage` 中，请仅在可信设备上使用。

## 快速开始

### 环境要求

- Windows 10/11 或 macOS
- Node.js 18 或更高版本
- npm 9 或更高版本

### 安装依赖

```bash
npm install
```

### 开发模式

同时启动 Vite 开发服务器与 Electron 窗口，并启用前端热更新：

```bash
npm run dev
```

### 构建前端

```bash
npm run build:ui
```

构建产物会写入 `renderer-dist/`。

### 生产模式运行

构建前端后启动 Electron：

```bash
npm start
```

### 打包桌面应用

```bash
npm run dist
```

`npm run dist` 会按当前系统平台调用 electron-builder。也可以使用平台明确的命令：

```bash
npm run dist:win
npm run dist:mac
```

Windows 生成 NSIS 安装包，macOS 生成 DMG 安装包。

### 代码格式化

```bash
npm run format
npm run format:check
```

## 使用流程

1. 点击顶部右侧齿轮，在设置弹窗中确认接口地址并填写 API Key，然后保存配置。
2. 输入提示词，根据需要选择比例、分辨率、质量和生成数量。
3. 可选添加参考图，并点击缩略图确认大图内容。
4. 点击“生成”。单张会显示流式预览，批量会显示抽卡队列，生成结果会以聊天记录形式保留在创作页，并保存到本地作品库。
5. 打开“作品库”后可通过左侧时间线按日期筛选，通过“导出全部 / 导出当前 / 导出已选”批量导出为文件夹。
6. 作品库可点击“导入图片”导入本地图片，也支持把图片直接拖拽到作品库区域导入。

## API 约定

Loomora 会向设置中的 OpenAI 兼容接口地址发送以下请求。默认地址是 `https://api.openai.com`：

```text
POST /v1/images/generations
POST /v1/images/edits
```

生成请求使用 Bearer Token：

```http
Authorization: Bearer <API_KEY>
Content-Type: application/json
```

核心请求字段包括：

```json
{
  "model": "gpt-image-2",
  "prompt": "画面描述",
  "size": "2048x1152",
  "quality": "auto",
  "output_format": "png",
  "stream": true,
  "partial_images": 2
}
```

没有参考图时使用 `POST /v1/images/generations`；有参考图时改用 `POST /v1/images/edits`，并把参考图作为 multipart 表单上传。流式响应会返回 partial image 事件，完成后返回最终图片。

当生成数量大于 1 时，请求会使用非流式模式并带上 `n` 参数；单张生成保持流式预览。

参考图按官方编辑接口的 multipart 方式传入，字段名是 `image[]`，当前最多支持 16 张。

`gpt-image-2` 的尺寸会按 OpenAI 官方约束校验：宽高不小于 1024、宽高为 16 的倍数、宽高比小于 3:1、总像素不超过 16,777,216。OpenAI 文档列出的热门尺寸包括 `2048x1152`、`3840x2160` 和 `2160x3840`。

官方文档：

- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/reference/resources/images/generation-streaming-events
- https://developers.openai.com/api/reference/resources/images/edit-streaming-events

## 技术栈

| 用途         | 技术                    |
| ------------ | ----------------------- |
| 桌面运行时   | Electron 31             |
| 前端框架     | Vue 3                   |
| 开发与构建   | Vite 5                  |
| 图片编辑     | TOAST UI Image Editor   |
| 文字识别     | Paddle.js OCR           |
| 桌面打包     | electron-builder（Windows NSIS / macOS DMG） |

Electron 主进程负责窗口生命周期，并将图片生成和图库文件能力拆分到独立模块。渲染进程通过启用 `contextIsolation` 的预加载桥接调用这些能力，未开启 Node.js 集成。

## 项目结构

```text
Loomora/
├── electron/
│   ├── gallery.js                  # 图库文件、系统对话框与相关 IPC
│   └── generation.js               # OpenAI 图片生成请求与流式事件
├── main.js                         # Electron 窗口生命周期
├── preload.js                      # 安全的渲染进程能力桥接
├── package.json                    # 项目依赖、脚本和打包配置
├── vite.config.mjs                 # Vite 配置
├── index.html                      # Vite 页面入口
├── renderer/
│   ├── assets/                     # 界面图片资源
│   ├── public/models/ocr/          # 本地 PaddleOCR 模型
│   ├── src/
│   │   ├── components/              # 页面与弹层组件
│   │   ├── composables/             # 生成、编辑器与 OCR 状态逻辑
│   │   ├── config/                  # 模型和编辑器配置
│   │   ├── utils/                   # 无状态工具函数
│   │   ├── App.vue                  # 应用状态协调层
│   │   └── main.js                 # Vue 入口
│   └── styles/                     # 按功能拆分的全局样式
└── renderer-dist/                  # 前端构建输出（构建后生成）
```

## License

Apache-2.0
