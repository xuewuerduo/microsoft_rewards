# Microsoft_Rewards

微软积分（优化版）脚本 + 部署工具。脚本猫商店地址：<https://scriptcat.org/script-show-page/6006>


## 目录

仓库根目录只放用户脚本，方便在 Gitea 页面直接点“安装”；其余项目文件统一收在 `tools/`。

```
.
├── microsoft-rewards.user.js   ← 脚本源码（@version 是唯一版本来源；任务逻辑取自商店 #8787）
├── .gitattributes  .gitignore  ← Git 专用文件，必须留在根目录
└── tools/
    ├── zy.py            容器里的调度器：拉起多账号浏览器、写运行计划、挂日志采集、启动时校准脚本版本
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
| `zy.py` | 容器启动 / 面板任务 | 调度器本体：拉浏览器、写计划、挂日志、校准版本 | ✅ 主流程 |
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

```
本地改 microsoft-rewards.user.js（记得改 @version）
        ↓
本地执行 tools/sc_sync.py --push --url <webhook>
        ↓ 读根目录的 user.js + tools/release-notes/v<版本>.md
脚本猫用户 webhook  →  商店 #6006 生成新版本
        ↓ 容器下次启动
tools/zy.py 的启动校准：已装 vX < 商店 vY → 自动更新 4 个账号的脚本
```

### 发版方式（本地 webhook，不依赖 CI）

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

- `microsoft-rewards.user.js` 头部 `@version` 是唯一版本号，改代码必须同时改它，否则商店不会生成新版本。
- 线上比本地新时不要强推（`--force` 只在需要覆盖时用）。

## 授权说明

本仓库为私有仓库。脚本会读取本机浏览器的 Cookie 用于微软积分任务，请勿在公开环境分享账号凭据。
