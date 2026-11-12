# dsh-image-studio

DSH（DeepSeek Harness）插件：在 DSH 里管理多套图片生成服务，并在对话中直接出图。

界面中显示为**图片工作台**。不绑定厂商——只要接口兼容 OpenAI 的 `/images/generations`，都能接进来。

## 功能

- **多套配置**：地址、API Key、模型、输出目录分别保存，点方块切换当前使用
- **模型列表**：按「地址 + Key」拉取 `/models`，下拉选择或直接输入模型 ID
- **文生图与图生图**：只给描述就出图；给参考图则按图编辑
- **密钥安全**：API Key 存在凭据存储里，配置文件只留引用名

## 安装

```bash
dsh plugin --profile <profile> add github:shamanjin/dsh-image-studio
```

或用 Release 里的包：

```bash
dsh plugin --profile <profile> add "https://github.com/shamanjin/dsh-image-studio/releases/download/v1.0.0/dsh-image-studio-1.0.0.tgz"
```

装完重启 DSH。

## 使用

**1. 配置一套服务**

侧栏 → 插件 → 图片工作台 → `+ 添加配置`：

- 接口地址：填到 `/v1` 层，例如 `https://api.example.com/v1`
- API Key：填完随「保存」一起写入
- 模型：点「获取模型」拉列表，在下拉里选；也可以直接输入模型 ID
- 输出目录：可留空

**2. 对话里出图**

配好后回到对话，直接说要什么：

- 「画一张雨夜的乡村车站，动画电影风格」
- 「参考 `D:\images\a.png`，把背景换成雪夜」

出图后返回本地图片路径，并以图片形式展示。

## 说明

| 项 | 说明 |
|---|---|
| 输出目录 | 留空时保存到当前工作目录下的 `dsh_outputs/images` |
| 密钥存放 | `~/.dsh/.credentials.yaml`，配置文件里只有引用名 |
| 生效范围 | 只使用当前选中的那套配置，模型侧无法改地址、Key 或模型 |

## License

MIT
