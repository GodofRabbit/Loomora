# Loomora · 织光成画

> 面向个人创作者的 AI 图片创作、管理与编辑桌面工作台。

[![Electron](https://img.shields.io/badge/Electron-31-6F4AB8?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Vue](https://img.shields.io/badge/Vue-3-7952B3?logo=vuedotjs&logoColor=white)](https://vuejs.org/)
[![Vite](https://img.shields.io/badge/Vite-5-8A63D2?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS-8A63D2)](#运行环境)
[![License](https://img.shields.io/badge/License-Apache--2.0-D6A84B)](#license)

Loomora 将 AI 生图、聊天式创作历史、本地作品库、灵感复用、图片编辑和离线 OCR 集中在一个桌面应用中。作品、提示词、编辑版本和整理信息保存在本机；API Key 使用系统安全存储加密，不会写入作品目录或备份包，适合需要长期积累个人素材的创作者。

## 核心能力

| 模块     | 当前能力                                                        |
| -------- | --------------------------------------------------------------- |
| AI 创作  | GPT Image 2、单张流式预览、最多 10 张批量生成、最多 16 张参考图 |
| 服务接入 | OpenAI 兼容接口、Replicate、多配置档案、连接测试与模型列表读取  |
| 生成队列 | 本地持久化、任务进度、点击定位、暂停、失败重试、清理已完成任务  |
| 创作历史 | 聊天式记录、按需加载、编辑提示词、复用参考图、原对话内重试      |
| 作品库   | 最新作品优先、瀑布流、日期时间轴、搜索、专辑/标签/颜色筛选      |
| 作品管理 | 导入、拖拽导入、收藏、回收站、批量整理、批量导出与去重          |
| 图片信息 | 查看并编辑完整提示词、参数、专辑、标签、颜色、备注和存储位置    |
| 图片处理 | TOAST UI 图片编辑器、马赛克、撤销/重做、历史记录、版本恢复      |
| 文字识别 | Paddle.js OCR 本地模型、独立工作窗口、结果复制                  |
| 数据管理 | 自定义存储目录、本地备份与恢复、清除本地数据、可配置快捷键      |
| 桌面体验 | Windows NSIS、macOS DMG、系统文件框、自定义标题栏和应用图标     |

## AI 创作

![Loomora AI 创作工作台](docs/screenshots/creation-workspace.jpg)

- OpenAI 兼容服务默认模型为 `gpt-image-2`，提示词上限为 4000 个字符，单次最多生成 10 张图片。
- 支持 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2` 和 `2:3` 七种画面比例。
- 支持自动尺寸及常用 2K、4K 规格，输出格式可选 `PNG`、`JPEG` 或 `WEBP`。
- 最多添加 16 张参考图，可通过系统文件框选择，也可使用 `Ctrl+V` 从剪贴板粘贴。
- 官方 OpenAI 兼容接口的单张请求支持流式中间图预览；第三方 OpenAI 兼容接口会按能力自动降级为非流式请求，避免因代理不支持流式图片而降低成功率。
- 缺少服务地址或 API Key 时会立即提示并打开设置，不会进入无效的长时间等待。
- 每次生成都会记录提示词、参数、服务档案、参考图、进度和结果。历史对话中的重试会更新原记录，不会新增重复对话。
- 生成队列中的“生成中”任务可点击跳回创作历史，并平滑定位到对应对话轮次；目标对话会短暂高亮。

### 多服务配置

设置中可以创建多个服务档案。每个档案独立保存服务类型、接口地址、模型和 API Key，生成队列同时记录 `providerId` 与 `profileId`，确保任务始终使用创建时选择的服务。

当前内置：

- **OpenAI 兼容接口**：支持文本生图、参考图编辑、流式预览、批量生成、尺寸、质量和输出格式。
- **Replicate**：模型填写 `owner/model`，使用异步任务轮询，完成后将图片下载到本地作品库。

配置页支持连接测试和远程模型列表读取。Provider 可以声明流式、批量、参考图、尺寸、质量、格式、轮询和取消等能力；界面会根据能力隐藏或降级不受支持的选项。第三方接口地址会自动清理末尾空格、中文标点等常见粘贴问题。

## 本地作品库

![Loomora 本地作品库](docs/screenshots/works-gallery-female.png)

- 图片默认按 `Gallery/YYYY-MM-DD/` 归档，并按日期和修改时间由新到旧展示。
- 瀑布流保持原图比例，并根据窗口宽度自动调整列数。
- 支持按名称、提示词、标签和备注搜索，也可按日期、专辑、标签和颜色快速筛选。
- 点击“导入图片”可通过系统文件框多选，也可以把外部图片直接拖入作品库。
- 相同内容通过 SHA-256 校验跳过重复导入。
- 支持大图预览、提示词抽屉、复制、重命名、下载、编辑、OCR、作为参考图创作、重新创作和打开文件位置。
- 收藏与回收站均保存在本地；回收站图片可以恢复，永久删除前会再次确认。
- 多选模式支持批量设置专辑、追加标签、颜色标记、导出和删除。
- 下载、导出和编辑器“另存为新图”会先打开系统文件框，由用户确认文件名和保存位置。
- 编辑后的新图使用保存时的最新日期进入作品库，并保留可查看、对比和恢复的版本信息。
- 大型作品库采用元数据优先、图片按需加载和窗口化渲染，降低首次加载压力。

## 灵感广场

![Loomora 灵感广场](docs/screenshots/inspiration-square.jpg)

灵感图片和提示词随应用保存在本地，浏览时不依赖远程图片地址。页面最多显示四列，可按主题筛选或搜索，并支持：

- 查看完整提示词；
- 将提示词和推荐画面规格填入快速创作；
- 直接把案例图片作为参考图开始创作；
- 打开大图预览。

## 图片编辑与 OCR

![Loomora 图片编辑器](docs/screenshots/image-editor.png)

- 编辑器基于 TOAST UI Image Editor，工具名称、按钮和提示已中文化。
- 支持裁剪、翻转、旋转、涂鸦、形状、图标、文字、滤镜、颜色、透明度和画布缩放。
- 颜色工具包含预设色、详细选色面板、HEX 输入和色相指示。
- 马赛克支持笔刷大小和实时预览，并纳入统一的撤销、重做和历史记录。
- 顶部与底部工具栏不会遮挡图片；编辑器打开时不默认选中任何工具。
- Paddle.js OCR 模型随应用保存在本地，并在独立隐藏窗口中运行，避免阻塞主界面。
- OCR 可从大图预览、作品右键菜单和编辑器进入，识别过程可取消，识别结果支持一键复制。

## 数据与隐私

- 生成图片默认保存到 `Gallery/YYYY-MM-DD/`，创作记录保存在对应目录的 `conversations.json`。
- Windows 开发版和安装版优先使用程序目录下可写的 `Gallery/`；不可写时回退到 Electron 用户数据目录。
- macOS 安装版使用 Electron 用户数据目录，避免向 `.app` 应用包内部写入内容。
- 可以在设置中更换存储目录；已有目录仍参与历史和作品读取，无需强制迁移。
- API Key 通过 Electron `safeStorage` 加密，并按服务档案隔离保存。
- 本地备份包含作品、提示词、对话、编辑版本和整理信息，不包含 API Key。
- “清除本地数据”会清理作品、历史、缓存、接口配置和首次使用状态。
- 图片生成请求只发送到用户选择的服务；作品管理、图片编辑和 OCR 均在本地执行。
- 图片提示词弹窗会完整展示存储位置，长路径自动换行；点击路径可直接在系统文件夹中定位对应文件。
- “查看当前提示词”快捷键支持开关式操作，当前图片的提示词弹窗已打开时再次触发会关闭。

## 首次使用

首次安装后的第一次启动会显示六步蒙层引导，依次介绍：

1. 配置生图服务；
2. 使用快速创作区；
3. 查看历史对话；
4. 管理本地作品；
5. 使用灵感广场；
6. 点击 Logo 或名称返回创作首屏。

引导完成状态保存在 Electron 用户数据目录，之后启动不会重复弹出。也可以从“关于与帮助”中随时重新打开。

## 快速开始

### 运行环境

- Windows 10/11 或 macOS
- Node.js 18+
- npm 9+

### 安装与开发

```bash
npm install
npm start
```

`npm start` 会同时启动 Vite 开发服务和 Electron 窗口。渲染层支持热更新，主进程相关文件变化时会自动重启窗口。

### 测试与构建

```bash
npm test
npm run build:ui
npm run start:prod
```

前端构建产物写入 `renderer-dist/`。

### 打包桌面应用

```bash
npm run dist

# 指定平台
npm run dist:win
npm run dist:mac
```

Windows 生成可选择安装目录的 NSIS 安装包，卸载时会询问是否删除本地数据；macOS 生成 DMG。跨平台打包仍需满足 electron-builder 对目标系统和签名工具的要求。

生产包关闭开发者工具，且不会包含开发环境地址、API Key、作品目录或首次引导状态。

## API 约定

OpenAI 兼容 Provider 使用以下接口：

```text
POST /v1/images/generations
POST /v1/images/edits
```

无参考图时发送 JSON；有参考图时使用 `/v1/images/edits`，并通过 multipart 表单的 `image[]` 字段上传图片。提示词会统一清理空字符、规范换行并去除首尾空白。官方 OpenAI 接口的单张生成可启用流式预览；第三方兼容接口默认使用非流式请求，数量大于 1 时使用 `n` 参数。

Replicate Provider 使用模型预测接口创建任务，并轮询任务状态；取消生成时会同时请求取消远程预测。

## Provider 扩展

Provider 位于 `electron/providers/`，通过注册表提供统一能力元数据与生成结果。新增平台时实现并注册以下内容即可复用现有设置、队列、历史和作品保存流程：

- `id`、显示名称与能力声明；
- `generate()` 统一生成入口；
- 可选的 `testConnection()`、`listModels()` 和 `cancel()`；
- 返回响应流或标准化图片结果。

## 技术栈

| 用途       | 技术                                         |
| ---------- | -------------------------------------------- |
| 桌面运行时 | Electron 31                                  |
| 前端框架   | Vue 3                                        |
| 开发与构建 | Vite 5                                       |
| 图标组件   | Lucide Vue Next                              |
| 图片编辑   | TOAST UI Image Editor                        |
| 文字识别   | Paddle.js OCR                                |
| 桌面打包   | electron-builder（Windows NSIS / macOS DMG） |

主进程负责窗口生命周期、Provider 调用、本地文件和系统对话框；渲染进程通过启用 `contextIsolation` 的预加载桥接调用桌面能力，未开启 Node.js 集成。OCR 使用独立的隐藏工作窗口运行。

## 项目结构

```text
Loomora/
├─ electron/
│  ├─ providers/                  # Provider 注册表与平台适配器
│  ├─ gallery.js                  # 作品库、创作历史和文件 IPC
│  ├─ galleryMetadata.js          # 提示词、标签、专辑和版本元数据
│  ├─ galleryTrash.js             # 回收站
│  ├─ generation.js               # 生图请求与流式事件
│  ├─ generationQueue.js          # 本地持久化生成队列
│  ├─ backup.js                   # 本地备份与恢复
│  ├─ secureCredentials.js        # API Key 加密存储
│  └─ ocr.js                      # OCR 工作窗口与任务调度
├─ renderer/
│  ├─ assets/                     # 品牌、头像与灵感图片资源
│  ├─ public/models/ocr/          # 本地 OCR 模型
│  ├─ src/components/             # 页面、弹层与工具组件
│  ├─ src/composables/            # 生成、编辑器与 OCR 逻辑
│  ├─ src/config/                 # 模型与编辑器配置
│  ├─ src/data/                   # 内置灵感数据
│  └─ styles/                     # 按功能拆分的样式
├─ docs/screenshots/              # README 实际界面截图
├─ scripts/                       # 开发与打包脚本
├─ test/                          # Provider 契约测试
├─ main.js                        # Electron 主进程入口
├─ preload.js                     # 主窗口安全桥接
└─ vite.config.mjs                # Vite 配置
```

## License

Apache-2.0
