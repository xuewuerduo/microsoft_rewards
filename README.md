# Microsoft_Rewards

微软积分（优化版）脚本 + 部署工具。脚本猫商店地址：<https://scriptcat.org/script-show-page/6006>

## 目录

| 文件 | 说明 |
|---|---|
| `zy.js` | 脚本源码（`@version` 是唯一版本来源） |
| `zy.py` | 容器里的调度器：拉起多账号浏览器、写运行计划、挂日志采集、启动时校准脚本版本 |
| `sc_deploy.py` | 脚本猫部署工具（装扩展、装脚本、授权 Cookie、更新版本） |
| `sc_sync.py` | 把 `zy.js` 推到商店（本地手动 / CI 自动都用它） |
| `sc_pub.py` | 走浏览器登录态的发布工具（备用，商店 webhook 不通时用） |
| `CHANGELOG.md` | 完整更新说明（一个版本一节，倒序） |
| `release-notes/v<版本>.md` | 推到商店页面的精简更新说明 |
| `.gitea/workflows/sync-store.yml` | push 后自动同步到商店的流水线 |

## 发布链路

```
本地改 zy.js（记得改 @version）
        ↓ git push
Gitea Actions: .gitea/workflows/sync-store.yml
        ↓ 读 zy.js + release-notes/v<版本>.md
sc_sync.py --push  →  脚本猫用户 webhook  →  商店 #6006 生成新版本
        ↓ 容器下次启动
zy.py 的启动校准：已装 vX < 商店 vY → 自动更新 4 个账号的脚本
```

### 一次性配置（三步）

1. **脚本猫 webhook 地址**：登录 <https://scriptcat.org>，进用户设置里拿到 webhook 地址（形如
   `https://scriptcat.org/api/v2/webhook/<token>`，可"刷新 token"重置）。这个地址本身就是凭据。
2. **存进仓库 Secret**：Gitea → 仓库 → 设置 → Actions → Secrets，新增
   `SCRIPTCAT_WEBHOOK`，值粘贴上一步的地址。
3. **确认 Actions 能跑**：仓库 → Actions 页面能看到 `sync-store` 工作流。若实例没配 act_runner，
   工作流会一直排队 —— 那就退回手动：本地 `git push` 后跑
   `python sc_sync.py --push --url <webhook地址>`。

### 每次发版的固定动作

```bash
# 1. 改 zy.js，把头部 @version 0.73 → 0.74
# 2. 写更新说明
#    release-notes/v0.74.md（商店页面用这个，短）
#    CHANGELOG.md 追加一节（完整版，含根因/验证方法）
# 3. 提交推送
git add -A && git commit -m "v0.74: 说明" && git push
```

`sc_sync.py` 会自动按 `@version` 找 `release-notes/v<版本>.md`；找不到才从 `CHANGELOG.md` 抽对应小节。

### 手动核对

```bash
python sc_sync.py --check     # 本地 vs 线上版本
python sc_sync.py --push --dry --url <webhook地址>   # 演练，不提交
```

## 版本约定

- `zy.js` 头部 `@version` 是唯一版本号，改代码必须同时改它，否则商店不会生成新版本。
- 线上比本地新时不要强推（`--force` 只在需要覆盖时用）。

## 授权说明

本仓库为私有仓库。脚本会读取本机浏览器的 Cookie 用于微软积分任务，请勿在公开环境分享账号凭据。
