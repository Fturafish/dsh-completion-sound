# 任务完成提示音 / Completion Chime

会话运行结束时，在 Harness 网页界面播放一声很轻的两音提示音（A5 → E6，约 0.45 秒）。

- 当前正在看的会话跑完时提示；
- 在别处时结束的后台会话同样提示（ui-session 的 `completionUnread`）；
- 同一瞬间多个会话结束只响一声；两次提示音之间有 0.9 秒的冷却。

## 安装

要求 DSH 提供 `shell.overlay` 插槽与 `useSessionStatus`（来自 `@deepseek-ai/dsh-client-ui-session`，
属基础组成）。本插件是纯客户端插件，Host 半边不注册任何服务，也不依赖 `webServer`。
包名保留 `@local/` 前缀（本地包的命名约定），以 `link` 方式装入你的 profile，不影响使用。

### 从克隆目录安装（本机当前安装即由此路径完成）

```bash
git clone https://github.com/Fturafish/dsh-completion-sound.git
```

然后让 DSH 智能体用 `plugin_manager` 工具安装该目录，`target` 填克隆下来的**绝对路径**：

```jsonc
{ "action": "install_bundle", "target": "/绝对路径/dsh-completion-sound" }
```

工具会把目录链接进 profile、解析 bundle patch，返回 `application: "applied"` 表示已生效。
新装的 bundle 可通过 HMR 直接生效；若是**替换**已安装的版本，则需要重启 Harness 才会加载新的
JavaScript 模块。

### 验证已加载

让智能体执行 `plugin_manager` 的 `list_plugins`，应能看到一行 `"moduleName": "@local/dsh-completion-sound"`、
`"fiberPhase": "active"`，该行 id 为 `completion-sound`（见 [cordis.patch.yml](cordis.patch.yml)）。

浏览器侧可用 `__dshCompletionSound.state()` 自检：`context: 'running'` 表示音频已解锁。

### 移动或改名之后

移动已安装的文件夹、或改动包名之后，**重启 Harness**。Host 半边会热更新，但页面的客户端模块图在
Web 应用启动时构建，此后只刷新页面仍会沿用旧图 —— 表现为功能在、但插件静默失效。

### 卸载

先执行 `plugin_manager` 的 `list_bundles`（或 `list_plugins`）取得该条目的确切标识，再移除：

```jsonc
{ "action": "remove_bundle", "target": "<list_bundles 返回的标识>" }
```

## 实现

Host 半边（`index.js`）是空实现；全部逻辑在浏览器半边 `client.js`：

1. 在根作用域的 `shell.overlay` 插槽注册一个不渲染任何内容的组件（`id: completion-sound`），
   它读取 ui-session 提供的标准属性 `useSessionStatus`，订阅全部会话的
   `{ running, completionUnread }` 状态。
2. `running` 由 `true` 变 `false`，或后台会话的 `completionUnread` 变为 `true` 时，
   播放提示音（同一状态变更里只播放一次）。
3. 声音用 Web Audio 现场合成，不依赖任何音频文件；音频上下文在页面的第一次点击或按键时创建，
   以符合浏览器的自动播放策略。若完成事件早于该手势到达，会记住并在解锁后补播。

本插件不联网、不读写本地存储、不上报任何数据：它只读取每个会话的
`running` / `completionUnread` 两个布尔值，且仅用于判断何时响铃。

## 兼容性

本插件依赖 DSH 的内部接口，不是公开稳定 API：

- `window.__ModuleLoader__.load(...)` 注册客户端模块；
- `useSessionStatus`（由 `@deepseek-ai/dsh-client-ui-session` 通过 Slot 注入）；
- `shell.overlay` 插槽与 `ctx.slots` / `ctx.effect`。

DSH 升级后这些接口可能改名或改变语义，届时提示音会失效（通常表现为控制台告警
`[completion-sound] useSessionStatus is unavailable; no chime will play.`），
需要按新版接口调整 `client.js`。

## 自检（可选）

在浏览器开发者工具里：

```js
__dshCompletionSound.play()   // 立即播放一次提示音
__dshCompletionSound.state()  // { context: 'running' | 'suspended' | 'absent', queued, lastPlayedAt }
```

`context: 'running'` 表示音频已解锁，之后每次会话结束都会响起。

## 关闭

设置 → 插件 里停用「任务完成提示音」即可。

## 免责声明

非 DeepSeek 官方插件，与 DeepSeek 无隶属或背书关系。使用内部接口存在随版本升级失效的风险。

## 许可

MIT，见 [LICENSE](LICENSE)。
