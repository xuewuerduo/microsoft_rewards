"""sc_pub.py —— 把脚本文件发布/更新到 scriptcat.org 自己的脚本仓库

为什么单独一个脚本：发布需要登录态，而登录态只能来自真实浏览器窗口。
这里用一个专用 profile（.chrome-test/publish-profile）保存登录，之后每次
发布都复用，不用再登。

用法：
  python sc_pub.py --login      首次：弹出窗口，你在里面登录一次（登录态落盘保存）
  python sc_pub.py --status     看登录态 + 线上版本 vs 本地版本
  python sc_pub.py --dump       打开编辑页导出表单结构（调试用）
  python sc_pub.py --publish    上传脚本 + 更新说明

登录态检测：先记下匿名 cookie 名单，出现新 cookie 即认为已登录。
"""
import argparse
import json
import os
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))          # tools/
ROOT = os.path.dirname(HERE)                               # 仓库根目录
sys.path.insert(0, HERE)

# 仓库里脚本的文件名（与脚本头 @name 一致，2026-11-23 定名，放仓库根目录）
# 旧名按优先级保留兜底，兼容还没同步改名的分支/clone
SCRIPT_FILE = "微软积分（优化版）.user.js"
SCRIPT_FILE_LEGACY = ("microsoft-rewards.user.js", "zy.js")


def script_path(name=None):
    """取脚本文件的绝对路径（脚本在仓库根目录）；新名不存在就依次退回旧名/旧布局。"""
    if name:
        return name if os.path.isabs(name) else os.path.join(ROOT, name)
    candidates = [os.path.join(ROOT, SCRIPT_FILE)]
    for legacy in SCRIPT_FILE_LEGACY:
        candidates.append(os.path.join(ROOT, legacy))
    for legacy in (SCRIPT_FILE,) + tuple(SCRIPT_FILE_LEGACY):
        candidates.append(os.path.join(HERE, legacy))
    for p in candidates:
        if os.path.exists(p):
            return p
    return candidates[0]

import sc_deploy as sd  # noqa: E402

SITE = "https://scriptcat.org"
LOGIN_URL = SITE + "/en/login"
EDIT_URL = SITE + "/en/script-edit/6006"
SHOW_URL = SITE + "/en/script-show-page/6006"
DEFAULT_PORT = 9333
DEFAULT_PROFILE = os.path.join(ROOT, ".chrome-test", "publish-profile")


# ---------------------------- CDP 小工具 ----------------------------
def find_page(port, contains=None):
    for t in sd.list_targets(port):
        if t.get("type") != "page":
            continue
        u = t.get("url") or ""
        if contains and contains not in u:
            continue
        return t
    return None


def page_eval(port, expr, contains="scriptcat.org", timeout=60):
    t = find_page(port, contains) or find_page(port)
    if not t:
        raise RuntimeError("没有可用的页面 target")
    sess = sd._CdpSession(t["webSocketDebuggerUrl"])
    try:
        return sess.evaluate(expr, timeout)
    finally:
        sess.close()


def cookies_of(port, url=SITE):
    t = find_page(port) or {}
    ws = t.get("webSocketDebuggerUrl")
    if not ws:
        v = sd.http_json("http://127.0.0.1:%d/json/version" % port)
        ws = v["webSocketDebuggerUrl"]
    sess = sd._CdpSession(ws)
    try:
        r = sess.call("Network.getCookies", {"urls": [url]}, timeout=15)
        return {c["name"]: c for c in (r.get("cookies") or [])}
    finally:
        sess.close()


def goto(port, url, wait=3.0):
    tag = "scpub"
    try:
        sess = sd._CdpSession(sd.http_json(
            "http://127.0.0.1:%d/json/version" % port)["webSocketDebuggerUrl"])
        try:
            tid = sess.call("Target.createTarget", {"url": url}, timeout=15)["targetId"]
        finally:
            sess.close()
    except Exception:
        tid = None
        sd.open_page(port, url)
    time.sleep(wait)
    return tid


def close_target(port, tid):
    if tid:
        try:
            sd.close_page(port, tid)
        except Exception:
            pass


# ---------------------------- 登录 ----------------------------
ANON_HINT = {"NEXT_LOCALE", "theme", "theme-mode", "FCCDCF", "FCNEC",
             "__eoi", "__gads", "__gpi", "cf_clearance"}


def logged_in(port, baseline=None):
    ck = cookies_of(port)
    names = set(ck)
    extra = {n for n in names if n not in ANON_HINT and not n.startswith("_ga")
             and not n.startswith("_gid") and not n.startswith("__gpi")}
    if baseline is not None:
        extra -= baseline
    return (bool(extra), sorted(extra))


def cmd_login(args):
    os.makedirs(args.profile, exist_ok=True)
    if sd.wait_cdp(args.port, timeout=1.5):
        print("ℹ️  端口 %d 上已有浏览器，直接复用" % args.port)
    else:
        sd.launch_chrome(args.port, args.profile, keep=True)
    before = set(cookies_of(args.port)) if sd.wait_cdp(args.port, 1) else set()
    print("   匿名单 %s" % (sorted(before) or "（空）"))

    tid = goto(args.port, LOGIN_URL, wait=2)
    ok, extra = logged_in(args.port, baseline=before)
    if ok:
        print("✅ 已是登录态（%s），无需重新登录" % ", ".join(extra))
        _report_auth(save_auth(args.port))
        return 0

    print("\n👉 已打开登录窗口：%s" % LOGIN_URL)
    print("   请在那个窗口里用账号密码（或 GitHub）登录，登录完成后我会自动继续。\n")
    deadline = time.time() + args.wait
    last = 0
    relaunch = 0
    while time.time() < deadline:
        time.sleep(3)
        try:
            ok, extra = logged_in(args.port, baseline=before)
        except Exception:
            # 窗口被关掉 / 浏览器崩了：自动换一个继续等，别让用户白等
            relaunch += 1
            if relaunch > 5:
                print("⚠️  窗口反复被关闭，放弃等待")
                return 2
            print("⚠️  检测不到浏览器（窗口被关闭？）→ 自动重新打开（第 %d 次）" % relaunch)
            try:
                ensure_browser(args)
                goto(args.port, LOGIN_URL, wait=3)
            except Exception as e:
                print("   重开失败：%s" % e)
            continue
        if ok:
            print("✅ 检测到登录态：%s" % ", ".join(extra))
            _report_auth(save_auth(args.port))
            return 0
        if time.time() - last > 30:
            last = time.time()
            left = int(deadline - time.time())
            print("   …等待登录（剩余 %d 秒）" % left)
    print("⚠️  等待超时，仍未检测到登录态")
    return 2


def _report_auth(a):
    if not a:
        print("⚠️  没拿到 token cookie，登录态未保存")
        return
    tok = a["cookie"].split("token=")[-1].split(";")[0]
    print("   token 已保存（%s…%s）→ %s" % (tok[:6], tok[-6:], AUTH_FILE))
    if a.get("exp"):
        print("   有效期到 %s" % time.strftime("%Y-%m-%d %H:%M", time.localtime(a["exp"])))
    else:
        print("   有效期：未解析（cookie 过期时间见站点会话设置）")


# ---------------------------- 接口探测 ----------------------------
# ---------------------------- 发布 ----------------------------
def read_notes(path, ver):
    """更新说明：优先 --notes 指定的文件；否则从 CHANGELOG.md 里抽当前版本那一节"""
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    chl = os.path.join(HERE, "CHANGELOG.md")
    if os.path.exists(chl):
        with open(chl, encoding="utf-8") as f:
            text = f.read()
        import re
        m = re.search(r"^## v%s\b.*?$(.*?)(?=^## v|\Z)" % re.escape(ver),
                      text, re.M | re.S)
        if m:
            body = m.group(1).strip()
            body = re.sub(r"^#{3,}\s*", "", body, flags=re.M)
            body = re.sub(r"\n{3,}", "\n\n", body)
            return body.strip()
    return "v%s 更新" % ver


def cmd_publish(args):
    path = script_path(args.code)
    with open(path, encoding="utf-8") as f:
        code = f.read()
    ver = sd.meta_version(code)
    notes = read_notes(args.notes, ver)
    st, d = api("GET", "/scripts/%s" % args.script_id)
    online = ((d or {}).get("data") or {}).get("script", {}).get("version") if isinstance(d, dict) else "?"
    print("本地 %s → v%s ；线上当前 v%s" % (os.path.basename(path), ver, online))
    print("更新说明 %d 字：\n%s\n" % (len(notes), "\n".join("   " + l for l in notes.splitlines()[:8])))
    if args.dry:
        print("（--dry：只演练，不提交）")
        return 0
    st, d = api("PUT", "/scripts/%s/code" % args.script_id,
                {"code": code, "changelog": notes}, timeout=180)
    print("PUT /scripts/%s/code → %s %s" % (args.script_id, st,
          "" if st == 200 else json.dumps(d, ensure_ascii=False)[:400]))
    if st != 200:
        return 3
    st, d2 = api("GET", "/scripts/%s" % args.script_id)
    now = ((d2 or {}).get("data") or {}).get("script", {}).get("version") if isinstance(d2, dict) else "?"
    print("✅ 线上版本：v%s → v%s" % (online, now))
    if str(now) != str(ver):
        print("⚠️  线上版本号与本地不一致，检查脚本头部 @version")
    return 0


def cmd_probe(args):
    st, d = api("GET", "/scripts/6006")
    print("GET /scripts/6006 → %s" % st)
    if isinstance(d, dict):
        s = (d.get("data") or {}).get("script") or {}
        print("   version=%s changelog=%r status=%s" % (s.get("version"), s.get("changelog"), s.get("status")))
    st, d = api("GET", "/scripts/6006/code")
    print("GET /scripts/6006/code → %s" % st)
    if isinstance(d, dict):
        data = d.get("data") or {}
        print("   keys=%s" % list(data.keys()))
        if isinstance(data.get("script"), dict):
            print("   script keys=%s" % list(data["script"].keys()))
    return 0


# ---------------------------- 状态 ----------------------------
def store_meta(script_id="6006"):
    with urllib.request.urlopen("%s/api/v2/scripts/%s" % (SITE, script_id), timeout=20) as r:
        d = json.loads(r.read().decode("utf-8"))
    s = d["data"]["script"]
    return {"version": s.get("version"), "changelog": s.get("changelog"),
            "name": s["meta_json"].get("name"), "id": s.get("id")}


def cmd_status(args):
    m = store_meta()
    local_ver = sd.meta_version(open(script_path(args.code), encoding="utf-8").read())
    print("线上：%s v%s（changelog: %s）" % (m["name"], m["version"], m["changelog"]))
    print("本地：%s v%s" % (args.code, local_ver))
    if sd.wait_cdp(args.port, timeout=1.5):
        ok, extra = logged_in(args.port)
        print("登录：%s" % ("✅ 已登录（%s）" % ", ".join(extra) if ok else "❌ 未登录，先跑 --login"))
    else:
        print("登录：浏览器未启动（跑 --login）")
    return 0


# ---------------------------- 调试：导出编辑页结构 ----------------------------
DUMP_JS = r"""
(() => {
  const q = (sel) => Array.from(document.querySelectorAll(sel));
  const info = (el) => ({
    tag: el.tagName.toLowerCase(),
    type: el.type || "",
    id: el.id || "",
    name: el.name || "",
    cls: (el.className && String(el.className).slice(0, 80)) || "",
    placeholder: el.placeholder || el.getAttribute("data-placeholder") || "",
    text: (el.innerText || "").trim().slice(0, 40),
    disabled: !!el.disabled,
  });
  return {
    url: location.href,
    title: document.title,
    inputs: q("input,textarea,select").map(info),
    editables: q("[contenteditable='true']").map(info),
    buttons: q("button").map(info).slice(0, 40),
    editors: q(".monaco-editor,.cm-editor,.CodeMirror,[class*=editor]").map(info).slice(0, 10),
    texts: Array.from(document.body.innerText.split("\n")).filter(Boolean).slice(0, 60),
    js: performance.getEntriesByType("resource").map(e => e.name)
         .filter(n => n.endsWith(".js")).slice(0, 200),
  };
})()
"""


# ---------------------------- 登录状态落盘 ----------------------------
AUTH_FILE = os.path.join(ROOT, ".workbuddy", "tmp", "sc_auth.json")


def save_auth(port):
    """把 token / login_id 落盘：之后发布不必再开浏览器"""
    ck = cookies_of(port)
    keep = {n: ck[n] for n in ("token", "login_id") if n in ck}
    if "token" not in keep:
        return None
    ua = page_eval(port, "navigator.userAgent", contains="", timeout=20)
    exp = None
    tok = keep["token"].get("value") or ""
    if tok.count(".") == 2:
        import base64
        try:
            body = tok.split(".")[1]
            body += "=" * (-len(body) % 4)
            exp = json.loads(base64.urlsafe_b64decode(body)).get("exp")
        except Exception:
            exp = None
    data = {"cookie": "; ".join("%s=%s" % (k, v.get("value")) for k, v in keep.items()),
            "ua": ua, "exp": exp, "saved": int(time.time())}
    os.makedirs(os.path.dirname(AUTH_FILE), exist_ok=True)
    with open(AUTH_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    return data


def load_auth():
    if not os.path.exists(AUTH_FILE):
        return None
    with open(AUTH_FILE, encoding="utf-8") as f:
        return json.load(f)


def api(method, path, body=None, timeout=60, auth=None):
    """带登录 cookie 调 scriptcat.org/api/v2"""
    a = auth or load_auth()
    if not a:
        raise RuntimeError("没有登录态：先跑 python sc_pub.py --login")
    url = path if path.startswith("http") else SITE + "/api/v2" + path
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Cookie", a["cookie"])
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json, text/plain, */*")
    req.add_header("Referer", SITE + "/")
    if a.get("ua"):
        req.add_header("User-Agent", a["ua"])
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            txt = r.read().decode("utf-8", "replace")
            return r.status, (json.loads(txt) if txt.strip().startswith(("{", "[")) else txt)
    except urllib.error.HTTPError as e:
        txt = e.read().decode("utf-8", "replace")
        try:
            return e.code, json.loads(txt)
        except Exception:
            return e.code, txt


def ensure_browser(args, wait=40):
    """端口上没浏览器就按发布专用 profile 起一个（复用已保存的登录态）"""
    if sd.wait_cdp(args.port, timeout=1.5):
        return True
    os.makedirs(args.profile, exist_ok=True)
    try:
        sd.launch_chrome(args.port, args.profile, keep=True)
        return True
    except SystemExit as e:
        print("❌ 启动失败：%s" % e)
        return False


def cmd_dump(args):
    if not ensure_browser(args):
        return 2
    ok, extra = logged_in(args.port)
    print("登录：%s" % ("✅ " + ", ".join(extra) if ok else "❌ 未登录"))
    tid = goto(args.port, args.url or EDIT_URL, wait=args.wait)
    data = page_eval(args.port, DUMP_JS)
    out = os.path.join(ROOT, ".workbuddy", "tmp", "edit_probe.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("已导出 %s" % out)
    print("url=%s title=%s inputs=%d buttons=%d js=%d"
          % (data["url"], data["title"], len(data["inputs"]), len(data["buttons"]), len(data["js"])))
    for i in data["inputs"][:12]:
        print("  [%s] id=%s ph=%s" % (i["tag"], i["id"], i["placeholder"]))
    return 0


def main():
    ap = argparse.ArgumentParser(description="发布脚本到 scriptcat.org")
    ap.add_argument("--login", action="store_true", help="打开窗口登录并保存登录态")
    ap.add_argument("--status", action="store_true", help="看线上/本地版本与登录态")
    ap.add_argument("--dump", action="store_true", help="导出编辑页表单结构（调试）")
    ap.add_argument("--probe", action="store_true", help="用保存的登录态试接口")
    ap.add_argument("--publish", action="store_true", help="发布脚本 + 更新说明")
    ap.add_argument("--port", type=int, default=DEFAULT_PORT)
    ap.add_argument("--profile", default=DEFAULT_PROFILE)
    ap.add_argument("--code", default=SCRIPT_FILE)
    ap.add_argument("--notes", default="")
    ap.add_argument("--script-id", default="6006")
    ap.add_argument("--dry", action="store_true", help="只演练不提交")
    ap.add_argument("--url", default="")
    ap.add_argument("--wait", type=int, default=600, help="等登录的秒数")
    ap.add_argument("--hold", action="store_true", help="跑完不关浏览器")
    args = ap.parse_args()

    for name in ("login", "status", "dump", "probe", "publish"):
        if getattr(args, name):
            return globals()["cmd_" + name](args)
    ap.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
