"""sc_sync.py —— 仓库 push 后把脚本文件同步到脚本猫商店 #6006

两条用法：
  1) 本地手动：python sc_sync.py --check
              python sc_sync.py --push --url https://scriptcat.org/api/v2/webhook/<token>
  2) CI（Gitea Actions）：见 .gitea/workflows/sync-store.yml，webhook URL 存仓库 Secret

只依赖标准库，不需要浏览器、不需要登录 cookie —— webhook URL 本身即凭据。
"""

# 项目版本号：与 microsoft-rewards.user.js @version / zy.py 保持一致，便于核对。
__version__ = "1.0.6"

import argparse
import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))          # tools/
ROOT = os.path.dirname(HERE)                               # 仓库根目录

# 仓库里脚本的文件名，放在仓库根目录。
# 2026-11-23 定名：microsoft-rewards.user.js。
# 旧名按优先级保留兜底：在还没同步这次改名的分支/clone 上跑也能找到文件。
SCRIPT_FILE = "microsoft-rewards.user.js"
SCRIPT_FILE_LEGACY = ("微软积分（优化版）.user.js", "zy.js")


def script_path(name=None):
    """取脚本文件的绝对路径（脚本在仓库根目录）；新名不存在就依次退回旧名/旧布局。"""
    if name:
        return name if os.path.isabs(name) else os.path.join(ROOT, name)
    candidates = [os.path.join(ROOT, SCRIPT_FILE)]
    for legacy in SCRIPT_FILE_LEGACY:
        candidates.append(os.path.join(ROOT, legacy))
    # 兼容脚本还在 tools/ 里的旧布局
    for legacy in (SCRIPT_FILE,) + tuple(SCRIPT_FILE_LEGACY):
        candidates.append(os.path.join(HERE, legacy))
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]

SITE = "https://scriptcat.org"
DEFAULT_SCRIPT_ID = "6006"
NOTES_DIR = os.path.join(HERE, "release-notes")


def meta_version(code):
    """从脚本头部读 @version（不依赖 sc_deploy，CI 里更好跑）"""
    m = re.search(r"^//\s*@version\s+([^\s]+)", code, re.M)
    return m.group(1).strip() if m else "?"


def local_version(path=None):
    with open(script_path(path), encoding="utf-8") as f:
        return meta_version(f.read())


UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36")


def _get_json(url, timeout=25):
    """Cloudflare 会拦 Python 默认 UA，必须带浏览器 UA"""
    req = urllib.request.Request(url)
    req.add_header("User-Agent", UA)
    req.add_header("Accept", "application/json")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def online_version(script_id=DEFAULT_SCRIPT_ID):
    d = _get_json("%s/api/v2/scripts/%s" % (SITE, script_id))
    return d["data"]["script"].get("version")


def online_changelog(script_id=DEFAULT_SCRIPT_ID):
    d = _get_json("%s/api/v2/scripts/%s" % (SITE, script_id))
    return d["data"]["script"].get("changelog")


def pick_notes(ver, explicit=""):
    """更新说明：显式文件 > release-notes/v<版本>.md > CHANGELOG.md 对应小节"""
    if explicit and explicit != "auto" and os.path.exists(explicit):
        with open(explicit, encoding="utf-8") as f:
            return f.read().strip()
    p = os.path.join(NOTES_DIR, "v%s.md" % ver)
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            return f.read().strip()
    chl = os.path.join(HERE, "CHANGELOG.md")
    if os.path.exists(chl):
        import re
        with open(chl, encoding="utf-8") as f:
            text = f.read()
        m = re.search(r"^## v%s\b.*?$(.*?)(?=^## v|\Z)" % re.escape(ver),
                      text, re.M | re.S)
        if m:
            return re.sub(r"\n{3,}", "\n\n", m.group(1)).strip()
    return "v%s 更新" % ver


# 报文格式候选：站点 webhook 的字段名没有公开文档，先按最可能的来，不对再用 --format 换
FORMATS = {
    1: lambda code, notes, sid, ver: {"code": code, "changelog": notes},
    2: lambda code, notes, sid, ver: {"script_id": int(sid), "code": code, "changelog": notes},
    3: lambda code, notes, sid, ver: {"id": int(sid), "code": code, "changelog": notes},
    4: lambda code, notes, sid, ver: {"code": code, "changelog": notes,
                                      "version": ver, "script_id": int(sid)},
    5: lambda code, notes, sid, ver: {"script": {"id": int(sid), "code": code,
                                                "changelog": notes}},
}


def post_webhook(url, payload, timeout=180):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", UA)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")


def cmd_check(args):
    v_local = local_version(args.code)
    v_online = online_version(args.script_id)
    print("本地 v%s ｜ 线上 v%s ｜ 线上说明：%s"
          % (v_local, v_online, online_changelog(args.script_id)))
    if str(v_local) != str(v_online):
        print("→ 不一致，可以 push")
    return 0


def cmd_push(args):
    path = script_path(args.code)
    with open(path, encoding="utf-8") as f:
        code = f.read()
    ver = meta_version(code)
    notes = pick_notes(ver, args.notes)
    before = online_version(args.script_id)
    print("准备推送 %s v%s（%d 字节）→ 脚本 %s，线上当前 v%s"
          % (os.path.basename(path), ver, len(code.encode()), args.script_id, before))
    print("更新说明：%s" % (notes.splitlines()[0] if notes else "（空）"))
    if str(before) == str(ver) and not args.force:
        print("ℹ️  线上已经是 v%s，跳过（--force 可强推）" % ver)
        return 0
    if args.dry:
        print("（--dry：不提交）")
        return 0
    payload = FORMATS[args.format](code, notes, args.script_id, ver)
    st, body = post_webhook(args.url, payload)
    print("POST %s [format %d] → %s %s" % (args.url.split("?")[0], args.format, st, body[:300]))
    time.sleep(3)
    after = online_version(args.script_id)
    if str(after) != str(before):
        print("✅ 线上版本 v%s → v%s" % (before, after))
        return 0
    print("⚠️  线上版本未变化（仍 v%s）。换 --format 2/3/4/5 再试，或检查 webhook 是否绑定到这个脚本"
          % after)
    return 3


def main():
    ap = argparse.ArgumentParser(description="把脚本文件同步到脚本猫商店")
    ap.add_argument("-V", "--version", action="version", version=f"sc_sync.py {__version__}")
    ap.add_argument("--check", action="store_true", help="对比本地/线上版本")
    ap.add_argument("--push", action="store_true", help="推送更新")
    ap.add_argument("--url", default=os.getenv("SCRIPTCAT_WEBHOOK", ""),
                    help="脚本猫用户 webhook 地址（或环境变量 SCRIPTCAT_WEBHOOK）")
    ap.add_argument("--code", default=SCRIPT_FILE)
    ap.add_argument("--notes", default="auto")
    ap.add_argument("--script-id", default=DEFAULT_SCRIPT_ID)
    ap.add_argument("--format", type=int, default=1, choices=sorted(FORMATS))
    ap.add_argument("--force", action="store_true", help="版本相同也推")
    ap.add_argument("--dry", action="store_true")
    args = ap.parse_args()
    if args.check:
        return cmd_check(args)
    if args.push:
        if not args.url:
            print("缺少 webhook 地址：--url 或环境变量 SCRIPTCAT_WEBHOOK")
            return 2
        return cmd_push(args)
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
