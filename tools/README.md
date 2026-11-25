# Microsoft_Rewards

微软积分（优化版）脚本 + 部署工具。安装地址（Gitea raw，唯一真源）：<https://gitea.zh-cc.top/lilonglong/microsoft_rewards/raw/branch/main/microsoft-rewards.user.js>

商店页（可选）：<https://scriptcat.org/script-show-page/6006>


## 目录

仓库根目录只放用户脚本，方便在 Gitea 页面直接点“安装”；其余项目文件统一收在 `tools/`。

```
.
├── microsoft-rewards.user.js   ← 脚本源码（@version 是唯一版本来源；任务逻辑取自商店 #8787）
├── .gitattributes  .gitignore  ← Git 专用文件，必须留在根目录
└── tools/
    ├── zy.py            容器里的调度器：拉起多账号浏览器、发端口表、挂日志采集、启动时校准脚本版本
    ├── sc_deploy.py     脚本猫部署核心：装扩展、装脚本、授权 Cookie、更新版本（被 zy.py 调用 + 可独立命令行）
    ├── sc_diag.py       一次性排障工具：读脚本猫 IndexedDB，查各账号执行点/排程（纯手动运行）
    ├── sc_sync.py       把脚本推到商店（本地手动 / CI 自动都用它）
    ├── sc_pub.py        走浏览器登录态的发布工具（备用，商店 webhook 不通时用）
    ├── CHANGELOG.md     完整更新说明（一个版本一节，倒序）
    ├── REFERENCE-8787.md  参考脚本（商店 #8787）解读 + 回归方案（设计参考，不参与运行）
    └── release-notes/   推到商店页面的精简更新说明 v<版本>.md
```

### 三个脚本的分工（别混）

| 脚本 | 谁调用 | 干什么 | 是否进主流程 |
|---|---|---|---|
| `zy.py` | 容器启动 / 面板任务 | 调度器本体：拉浏览器、发端口表（账号→CDP）、挂日志、校准版本 | ✅ 主流程 |
| `sc_deploy.py` | `zy.py` 直接 `import` + 手动命令行 | 干活的库：操作扩展/脚本/授权/更新，zy.py 到处调它的函数 | ✅ 主流程依赖 |
| `sc_diag.py` | 只有人手敲 | 排障：读 IndexedDB 日志看某账号有没有生成执行点 | ❌ 一次性工具 |

> **为什么不合并**：`sc_deploy.py` 是主流程的依赖库（2500+ 行），`sc_diag.py` 是自包含的独立小工具（约 380 行），
> 只在排查"看不到某账号计划"这类问题时才传进容器跑一次。合并会让排查工具背上整个主流程库，
> 丢了"传一个小文件即可诊断"的好处。

> **账号真相源只有一个**：`zy.py` 从面板环境变量 `BING_ACCOUNTS` 派生账号和端口，发布到 `zy-ports.json`。
> `sc_deploy.py`、`sc_diag.py` 都不维护账号表，一律从这份端口表读"端口 → 账号名"。新增账号只要进了
> `BING_ACCOUNTS`，所有脚本自动识别，不用改任何工具代码。

> `zy.py` 通过“同目录查找”加载 `sc_deploy.py`，所以这两个文件在 `tools/` 里必须同级。
> 上传到容器时也要把这两个文件一起放在同一目录。

## 发布链路（Gitea raw 为唯一真源）

脚本只认一个地址：

```
https://gitea.zh-cc.top/lilonglong/microsoft_rewards/raw/branch/main/microsoft-rewards.user.js
```

脚本头部 `@installURL` / `@downloadURL` / `@updateURL` 都指它；`sc_deploy.py` 的 `SCRIPT_SOURCE_URL`
（可用环境变量 `SC_SCRIPT_SOURCE` 覆盖）也是它；脚本猫里每个账号的 `checkUpdateUrl` 同样被设成它。
所以「发布」只有一步：**把 js 推到 main 分支**。

```
本地改 microsoft-rewards.user.js（必须 bump @version）
        ↓
git add -A && git commit && git push origin main      ← 这一下就是发布
        ↓ raw 立刻是新内容
脚本猫自己：checkUpdateUrl → raw，@version 变大就静默更新（每天周期性检查）
        ↓
zy.py 启动校准：拉 raw 的 @version，和每个账号已装版本比，落后就 checkScriptUpdate 立即更新
```

要点：

- **不需要 webhook、不需要商店发版、不需要 CI**。以前那条 webhook 是「仓库 push 触发器」，
  不接受直接携带代码，且常年不同步；现在整条链路绕开它。
- **唯一硬要求：改 js 必须 bump `@version`**。脚本猫按版本号判断有没有新版，版本号不动 = 不更新，
  哪怕内容变了。`zy.py --update-script` 也只会看到「已是最新」。
- 想立刻生效、不等脚本猫自己的检查周期：`python3 tools/zy.py --update-script`（浏览器没跑会临时拉起）。
- 想验证各账号当前版本：`python3 tools/zy.py --script-status` 或 `python3 tools/sc_deploy.py --status`。

### 新机器 / 新账号怎么装

直接用上面的 raw 地址安装（脚本猫「新建脚本 → 导入」或浏览器打开该地址），或让工具装：

```bash
python3 tools/sc_deploy.py --install --port 9222    # 装扩展 + raw 上的脚本 + Cookie 授权
python3 tools/zy.py --install-script                # 所有账号一起
```

### 商店（可选，已不是主链路）

商店页 <https://scriptcat.org/script-show-page/6006> 仍然是公开入口，但**不再作为更新源**：
即使从商店装的是旧版，脚本头部 `@updateURL` 指向 raw，zy.py 校准后也会被拉到 raw 的最新版。
`sc_sync.py` / `sc_pub.py` 保留作为往商店补推的工具，日常发版用不到。


## 版本约定

- `microsoft-rewards.user.js` 头部 `@version` 是**脚本发版号**：改脚本本体必须同时改它，否则脚本猫认为没有新版、不会从 raw 更新。
- 5 个 py 脚本各有 `__version__` 常量（zy / sc_deploy / sc_diag / sc_sync / sc_pub），**与上面的 `@version` 同步**。
  它们是"待发版号"——比如脚本 @version 还没 bump、但 py 已含新改动时，py 会先标到下一版（当前统一 `1.0.6`，CHANGELOG 里对应节标注【待发版】）。发版时把脚本 @version bump 到同一值即可全项目对齐。
- 容器里核对版本：`python3 zy.py --version`（其余 4 个脚本同样支持 `-V/--version`），或看 zy.py 启动日志首行的 `🚀 … vX`。作为库 import 时读 `模块.__version__`。
- 核对「本地 js / raw 线上 / 各账号已装」三者版本：`python3 tools/sc_deploy.py --status`（账号侧）与脚本头部 `@version`（raw 侧，浏览器打开地址即可看到）。

## 授权说明

本仓库为私有仓库。脚本会读取本机浏览器的 Cookie 用于微软积分任务，请勿在公开环境分享账号凭据。
