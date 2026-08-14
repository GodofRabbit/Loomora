# Loomora · 织光成画

> 把灵感变成画面。Loom light into images.

Loomora 是一款面向 Windows 的 AI 图片创作与管理桌面应用，基于 Electron、Vue 3 和 Vite 构建。它可以连接兼容的图片生成服务，通过文字与参考图生成作品，并在本地完成作品管理、图片编辑、马赛克处理和 OCR 文字识别。

## 功能概览

### AI 图片生成

- 支持最长 800 字的中文或英文提示词。
- 支持 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2` 六种画面比例。
- 可配置模型、分辨率和生成质量。
- 单次可连续生成多张图片；抽卡上限会随当前模型联动，并显示请求与任务处理状态。
- 支持同步返回图片和异步任务轮询；生成结果会自动保存到本地。
- 参考图支持文件选择或通过 `Ctrl+V` 从剪贴板直接添加，可点击大图预览，并根据当前模型自动限制数量。

当前内置的模型兼容规则如下：

| 模型                       | 参考图上限 | 抽卡上限 | 质量选项                        |
| -------------------------- | ---------: | -------: | ------------------------------- |
| `gpt-image-2`              |      14 张 |    14 张 | `auto`、`low`、`medium`、`high` |
| `gemini-*`                 |       4 张 |     4 张 | `1K`、`2K`、`4K`                |
| `grok-imagine-image-edit`  |       3 张 |     3 张 | 由服务端处理                    |
| `grok-imagine-image-lite`  |     不支持 |     1 张 | 由服务端处理                    |
| 其他 `grok-imagine-image*` |       1 张 |     1 张 | 由服务端处理                    |

### 本地作品库

- 生成的图片按日期保存到 `Gallery/YYYY-MM-DD/`。
- 作品库按原图比例采用瀑布流排版，并优先展示最新作品。
- 点击图片可进入大图预览，并在多图间切换。
- 右键菜单支持复制、下载、识别文字、编辑、打开文件所在位置和删除。
- 下载时使用系统“另存为”窗口选择保存位置，完成后显示提示。
- 删除本地作品前会弹出二次确认。

应用会优先在程序所在目录创建 `Gallery/`。如果该目录不可写，则自动使用 Electron 用户数据目录下的 `Gallery/`。

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

- 网站地址默认是 `https://www.zexitongxue.com`。
- API Key 默认留空。
- 点击“保存配置”后，网站地址和 API Key 会保存到 `localStorage`，下次启动自动恢复。
- 点击取消、遮罩或按 `Esc` 会放弃本次修改。

注意：API Key 以明文形式存储在应用渲染进程的 `localStorage` 中，请仅在可信设备上使用。

## 快速开始

### 环境要求

- Windows 10/11
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

### 打包 Windows 安装程序

```bash
npm run dist
```

安装包由 electron-builder 以 NSIS 格式生成。

### 代码格式化

```bash
npm run format
npm run format:check
```

## 使用流程

1. 点击顶部右侧齿轮，在设置弹窗中填写网站地址和 API Key，然后保存配置。
2. 输入提示词，根据需要选择模型、比例、分辨率、质量和生成数量。
3. 可选添加参考图，并点击缩略图确认大图内容。
4. 点击“生成”，等待任务完成；生成结果会展示在当前页面并保存到本地作品库。
5. 打开“作品库”预览、下载、编辑、识别或删除已经保存的作品。

## API 约定

Loomora 当前向配置网站的源地址发送以下请求：

```text
POST /v1/images/generations/async
GET  /v1/images/tasks/{task_id}
GET  /v1/images/tasks/{task_id}/content?index={index}
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
  "n": 1,
  "image_url": "data:image/png;base64,..."
}
```

没有参考图时不会发送 `image_url`。多张参考图会将该字段设置为数组。接口既可以直接返回图片，也可以返回 `task_id` 供应用轮询；轮询间隔为 3 秒，最多 200 次。

接口文档：[zexitongxue.com/docs/image-api.html](https://zexitongxue.com/docs/image-api.html)

## 技术栈

| 用途         | 技术                    |
| ------------ | ----------------------- |
| 桌面运行时   | Electron 31             |
| 前端框架     | Vue 3                   |
| 开发与构建   | Vite 5                  |
| 图片编辑     | TOAST UI Image Editor   |
| 文字识别     | Paddle.js OCR           |
| Windows 打包 | electron-builder + NSIS |

Electron 主进程负责网络请求、本地文件读写、系统对话框和剪贴板操作。渲染进程通过启用 `contextIsolation` 的预加载桥接调用这些能力，未开启 Node.js 集成。

## 项目结构

```text
Loomora/
├── main.js                         # Electron 主进程、生成请求与本地文件 IPC
├── preload.js                      # 安全的渲染进程能力桥接
├── package.json                    # 项目依赖、脚本和打包配置
├── vite.config.mjs                 # Vite 配置
├── renderer/
│   ├── assets/                     # 界面图片资源
│   ├── public/models/ocr/          # 本地 PaddleOCR 模型
│   ├── src/
│   │   ├── App.vue                 # 应用界面与交互逻辑
│   │   └── main.js                 # Vue 入口
│   ├── index.html                  # 渲染进程 HTML
│   └── style.css                   # 全局界面样式
└── renderer-dist/                  # 前端构建输出（构建后生成）
```

## License

Apache-2.0
