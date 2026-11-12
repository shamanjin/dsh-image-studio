# dsh-image-studio

[![version](https://img.shields.io/badge/version-1.0.0-blue)](https://github.com/shamanjin/dsh-image-studio/releases)
[![license](https://img.shields.io/badge/license-MIT-green)](./LICENSE)

DeepSeek Harness（DSH）插件：管理多套「OpenAI 兼容」的图片生成服务配置，并注册 `image_generate` 工具。

插件在界面中显示为**图片工作台**——不绑定任何一家厂商，GPT、Grok、Nano Banana、Flux、Seedream、Qwen-Image 等只要接口兼容都可用；同时支持文生图与图生图。

- **多套配置**：以方块列出，点击即切换当前使用，出图请求使用当前配置
- **无初始默认**：首次安装没有任何配置，只显示「+ 添加配置」
- **不预设厂商**：接口地址无默认值，仅提供 `https://api.example.com/v1` 占位提示
- **模型按需拉取**：`获取模型` 用「地址 + Key」查 `/models`，下拉选择或直接输入模型 ID
- **密钥不落配置文件**：配置文件只存凭据引用名，真值在 `$DSH_HOME/.credentials.yaml`
- **统一保存**：API Key 随底部「保存」一次性写入，无独立保存按钮
- **文生图 + 图生图**：`image_generate` 支持参考图（本地路径或 URL）

## 安装

从 GitHub 仓库安装（需已初始化 profile）：

```bash
dsh plugin --profile <profile> add github:shamanjin/dsh-image-studio
```

或使用 Release 里的 tgz：

```bash
dsh plugin --profile <profile> add "https://github.com/shamanjin/dsh-image-studio/releases/download/v1.0.0/dsh-image-studio-1.0.0.tgz"
```

装完重启 DSH，侧栏 → 插件 → **图片工作台**。

> 仓库若为私有，只有拿到授权的账号才能安装。

## 界面

侧栏 → 插件 → **图片工作台**：

```
┌────────────────┐ ┌────────────────┐ ┌ ─ ─ ─ ─ ┐
│ 生产网关  使用中 │ │ 备用服务        │   +      │
│ api.example.com│ │ api.example.org│   添加配置 │
│ gpt-image-2.6… │ │ 未指定模型      │ └ ─ ─ ─ ─ ┘
│ 已存Key 编辑配置 │ │ 未存Key 编辑    │
└────────────────┘ └────────────────┘
```

点方块＝切换当前使用（立即落盘）；点「+」或「编辑配置」弹出宽版对话框（约 700px）：

| 位置 | 字段 |
|---|---|
| 第一行（两列） | 名称 / 输出目录（留空＝`/dsh_outputs/images`，相对工作目录） |
| 第二行 | 接口地址 |
| 第三行 | API Key（只写，随保存写入凭据存储） |
| 第四行 | 模型：输入框 + 下拉 + `获取模型` |
| 底部 | 删除 / 测试连接 / 状态 / 取消 / 保存 |

- 下拉选中即回填输入框；输入框与下拉是同一个值
- 提示信息全部中文：连接成功显示 `● 连接正常 · 298ms · 4 个模型可用`，失败显示服务端原因的中文摘要
- 「获取模型」优先用该 Key 的 `/models`；连不上再退回 new-api 类站点的公开 `/api/pricing`
- 下拉里图像模型排前面（`image` / `dall-e` / `flux` / `seedream` / `qwen-image`… 启发式），其余按字母排

## 数据存放

| 内容 | 位置 |
|---|---|
| 配置列表 | `$DSH_HOME/dsh-image-studio/config.json` |
| API Key | `$DSH_HOME/.credentials.yaml` 的 `refs.<引用名>` |

```json
{
  "version": 1,
  "activeId": "p-1a2b3c4d",
  "profiles": [
    {
      "id": "p-1a2b3c4d",
      "name": "生产网关",
      "baseUrl": "https://api.example.com/v1",
      "model": "gpt-image-2.6-sunburst",
      "outDir": "",
      "apiKeyRef": "IMAGE_STUDIO_KEY_P_1A2B3C4D"
    }
  ]
}
```

`outDir` 为空时，出图保存到**当前工作目录**下的 `dsh_outputs/images`（目录自动创建）。

工作目录的取值顺序：会话自己的工作目录 → 插件加载时的启动目录 → 进程 cwd。插件通过可选的 `workingDirectory` 服务取得它，该服务不存在时自动回落，不影响加载。

## 路由（宿主半侧）

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | `/dsh-image-studio/state` | 读配置列表 + 每套是否已存 Key + 当前默认输出目录 |
| POST | `/dsh-image-studio/state` | 保存配置列表 / 切换当前使用 |
| POST | `/dsh-image-studio/models` | 按 `{baseUrl, apiKey?, apiKeyRef?}` 拉模型 |
| POST | `/dsh-image-studio/test` | 连通性检查（延迟 / 模型数 / 目标模型是否可见） |
| POST | `/dsh-image-studio/generate` | 直接出图（调试用） |

这些路由没有内置鉴权，依赖 DSH 服务器只监听 loopback；不要把监听地址改成 `0.0.0.0`。

## 工具

`image_generate(prompt, images?, mask?, size?, quality?, n?)`

**保存目录固定跟随配置**：配置了输出目录就只写那一处，没配置才用 `<工作目录>/dsh_outputs/images`。模型侧传 `outDir` 会被忽略，避免图片落到配置以外的地方。工具返回里会带上实际保存目录。

- **只给 `prompt`** → 文生图，`POST /images/generations`
- **同时给 `images`** → 图生图／图片编辑，`POST /images/edits`：先按官方形式发 `multipart/form-data`（`image` 字段，多张用 `image[]`），被网关拒绝时自动退回 JSON + data URL
- `images` 每项可以是本地绝对路径或 `http(s)` URL；`mask` 用于局部重绘（需模型支持）

返回图片绝对路径并以 markdown 图片渲染。未添加配置、地址或 Key 缺失时返回明确的中文提示。

### 强制规则：只许用当前选中的配置

插件通过 `systemPrompt.section` 注入一条硬性规则（`plugin:image-studio/rules`），模型侧被要求：

1. 只能调用 `image_generate` 出图，不准直接请求接口或写脚本绕开
2. 地址、Key、模型一律以「图片工作台」页当前选中的那套配置为准
3. 禁止修改 `config.json`、`.credentials.yaml`、`cordis.patch.yml`，禁止切换配置或改地址、密钥
4. 配置缺失时停下并要求用户去插件页配置，不准自己填一个
5. 用户要换模型/服务商时，由用户在插件页切换配置

工具实现上也做了限制：**模型参数不接受覆盖**，`model` 传了会被忽略，始终使用当前配置里的模型。

## 装法 / 卸载

```powershell
New-Item -ItemType Junction -Path "$env:USERPROFILE\.dsh\profiles\desktop\node_modules\dsh-image-studio" -Target "<包目录>"
```

再把 `dsh-image-studio` 加进 profile `package.json` 的 `dsh.profile.bundles`，重启 DSH。卸载＝删 junction + 从 `bundles` 移除。

**改宿主半侧或浏览器半侧都需要重启 DSH。**

## 开发自测

```powershell
node --check lib/client.js
node test/locale-check.mjs                                  # 文案 key 覆盖（中英各 38 个，无缺失/无冗余）
node test/client-render.mjs                                 # 假 React：方块 → 弹窗 → 保存
node --import ./test/register-mock.mjs test/host-smoke.mjs  # 替身 ctx：state/models/test 三个路由
```

`preview.html` 是卡片的静态样式预览，可直接用浏览器打开。

`test/` 里的 shim 只用于脱离 DSH 单测，不参与运行时。
