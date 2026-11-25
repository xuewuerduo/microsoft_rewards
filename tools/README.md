# Microsoft_Rewards

微软积分（优化版）脚本 + 部署工具。脚本猫商店地址：<https://scriptcat.org/script-show-page/6006>


## 目录

仓库根目录只放用户脚本，方便在 Gitea 页面直接点“安装”；其余项目文件统一收在 `tools/`。

```
.
├── microsoft-rewards.user.js   ← 脚本源码（@version 是唯一版本来源；任务逻辑取自商店 #8787）
├── .gitattributes  .gitignore  ← Git 专用文件，必须留在根目录
└── tools/
    ├── zy.py            容器里的调度器：拉起多账号浏览器、发端口表、挂日志采集、把本地 js 直推进脚本猫
    ├── sc_deploy.py     脚本猫部署核心：装扩展、装/更新脚本（本地直推 or 商店）、授权 Cookie（被 zy.py 调用 + 可独立命令行）
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

## 发布链路

### 两条路，互不依赖

```
【A 本地直推】推荐：改了 js 就能生效，商店死活同步不上也不影响
本地改 microsoft-rewards.user.js（顺手 bump @version）
        ↓ 把 js 和 zy.py 放同一目录（容器 /app），或用 SC_LOCAL_SCRIPT 指路径
容器下次启动 zy.py → 读本地 js 的 @version / 内容指纹
        ↓ 已装版本更旧，或版本相同但内容变了
CDP → 脚本猫 installByCode（upsertBy=user）就地覆盖 → 启用 → 关掉该脚本的商店自动检查

【B 商店发版】想让别人也能从商店装到新版时才需要
本地 tools/sc_sync.py --push --url <webhook>
        ↓ 读根目录的 user.js + tools/release-notes/v<版本>.md
脚本猫用户 webhook  →  商店 #6006 生成新版本
        ↓ 容器下次启动（前提：没有本地 js，或 SC_LOCAL_UPDATE=0）
tools/zy.py 的启动校准：已装 vX < 商店 vY → 自动更新各账号脚本
```

### A：本地直推（`SC_LOCAL_UPDATE`，默认开）

- **判据**：本地 `.user.js` 的 `@version` 比各账号已装版本新 → 推；版本相同但**内容指纹**变了也推
  （防止"改了 js 忘了 bump"漏更新）；已装版本更新于本地 → 不降级。
- **原理**：`sc_deploy.install_local()` 走脚本猫的 `installByCode`（`upsertBy=user`），
  按脚本名就地覆盖，**完全不经过商店**。
- **副作用与配套**：覆盖后自动确保 `status=1`（启用）；默认关掉该脚本的
  「商店自动检查更新」，否则脚本猫每天还会去商店比对、把本地版盖回旧版
  （想保留商店检查：`SC_LOCAL_KEEP_STORE_CHECK=1`）。若覆盖导致 uuid 变化，
  会自动重写 Cookie 永久授权（授权是按 uuid 存的）。
- **路径查找顺序**：`SC_LOCAL_SCRIPT` → 仓库根 → `zy.py` 同目录 → 当前工作目录。
- **手动推一次**：`python3 zy.py --update-script`（浏览器没跑会临时拉起，完成即关）。
- **看状态**：`python3 zy.py --script-status` 第一行会打印本地 js 的版本与路径。
- 推送记录落在 `/app/data/zy-script-pushed.json`（账号 → 版本 + 内容指纹）。

> 容器部署只需 `zy.py` + `sc_deploy.py` + `microsoft-rewards.user.js` 三个文件同目录。
> 只传前两个的话，zy.py 会在启动日志里警告"未找到本地脚本"并退回跟商店比版本。

### B：发版方式（本地 webhook，不依赖 CI）

本环境没有 act_runner，Gitea 工作流文件已删除，**发版不依赖任何 CI/push 触发**。
发版统一走本地命令：

```bash
python tools/sc_sync.py --push --url <webhook地址>
# 演练不提交：python tools/sc_sync.py --push --dry --url <webhook地址>
```

webhook 地址：登录 <https://scriptcat.org> → 用户设置里拿（形如
`https://scriptcat.org/api/v2/webhook/<token>`，可"刷新 token"重置）。这个地址本身就是凭据，
别提交进仓库；也可以设成环境变量 `SCRIPTCAT_WEBHOOK`，命令里就不用带 `--url`。

### 每次发版的固定动作

```bash
# 1. 改根目录的 microsoft-rewards.user.js，把头部 @version 0.73 → 0.74
# 2. 写更新说明
#    tools/release-notes/v0.74.md（商店页面用这个，短）
#    tools/CHANGELOG.md 追加一节（完整版，含根因/验证方法）
# 3. 提交推送
git add -A && git commit -m "v0.74: 说明" && git push
```

`tools/sc_sync.py` 会自动按 `@version` 找 `tools/release-notes/v<版本>.md`；找不到才从 `tools/CHANGELOG.md` 抽对应小节。

### 手动核对

```bash
python tools/sc_sync.py --check     # 本地 vs 线上版本
python tools/sc_sync.py --push --dry --url <webhook地址>   # 演练，不提交
```

## 版本约定

- `microsoft-rewards.user.js` 头部 `@version` 是**脚本发版号**：改脚本本体必须同时改它，否则商店不会生成新版本。
- 5 个 py 脚本各有 `__version__` 常量（zy / sc_deploy / sc_diag / sc_sync / sc_pub），**与上面的 `@version` 同步**。
  它们是"待发版号"——比如脚本 @version 还没 bump、但 py 已含新改动时，py 会先标到下一版（当前统一 `1.0.5`）。发版时把脚本 @version bump 到同一值即可全项目对齐。
- 容器里核对版本：`python3 zy.py --version`（其余 4 个脚本同样支持 `-V/--version`），或看 zy.py 启动日志首行的 `🚀 … vX`。作为库 import 时读 `模块.__version__`。
- 线上比本地新时不要强推（`--force` 只在需要覆盖时用）。

## 授权说明

本仓库为私有仓库。脚本会读取本机浏览器的 Cookie 用于微软积分任务，请勿在公开环境分享账号凭据。
