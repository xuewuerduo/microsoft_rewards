#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sc_deploy.py — 脚本猫（ScriptCat）扩展 + 商店脚本「一键部署 / 更新」工具（CDP，全程无 GUI）

本文件由 sc_update.py 与 sc_e2e.py 合并而来，既可作为命令行工具，也可被 zy.py 直接 import。
放在 zy.py 同一目录即可被自动加载。

═══ 给新用户的浏览器装「扩展 + 脚本」（装完即可用）═══
  python3 sc_deploy.py --install --port 9222
  python3 sc_deploy.py --install --port 9222 \
      --ext /app/extensions/scriptcat --user-dir /data/profiles/user-long
  做四件事：① 确认/加载脚本猫扩展 ② 开「允许用户脚本」+开发者模式
            ③ 装商店最新脚本并启用 ④ 写 Cookie 永久授权（--run 再跑一次）

═══ 手动更新脚本到商店最新版 ═══
  python3 sc_deploy.py --update --port 9222
  python3 sc_deploy.py --update                  # 四个账号 9222~9225 一起
  把 checkUpdateUrl 回正到商店真实地址 → checkScriptUpdate(system) → 等版本号变化。
  与脚本猫「每天自动更新」走完全同一条路径，不造版本、不改脚本内容。

═══ 只看版本 ═══
  python3 sc_deploy.py --status
  python3 sc_deploy.py --status --port 9333

═══ 本地从零验证整套流程（起一个独立测试浏览器）═══
  python3 sc_deploy.py --self-test --keep

其他开关：
  --script 6006        商店脚本 ID（默认 6006 = 微软积分（优化版））
  --name 微软积分      按脚本名片段筛选已装脚本
  --hosts a,b,c        配合 --grant-cookie / --install 的 Cookie 域名清单
  --run                授权后让脚本跑一次
  --ext DIR            解包扩展目录（自动安装未加载的扩展时用）
  --user-dir DIR       浏览器 profile 目录（只用于从 Preferences 认扩展 ID）
  --allow-userscripts  只开「允许用户脚本」
  --grant-cookie       只写 Cookie 永久授权
  --no-launch          配合 --update：浏览器没在跑时不临时拉起

原理（读脚本猫 v1.5.x 源码确认过的协议）：
  脚本猫后台 service worker 把整套服务注册成 RPC，消息走标准 chrome.runtime：
    chrome.runtime.sendMessage({action, data}, callback) -> {code:0, data:...}
  action 格式 "serviceWorker/<组>/<方法>"，本工具用到：
    serviceWorker/script/{getAllScripts,installByCode,enables,setCheckUpdateUrl,
                          checkScriptUpdate,stopScript}
    serviceWorker/value/setScriptValues
    serviceWorker/runtime/runScript
    serviceWorker/log/getLogs
  MV3 的坑：service worker 里自己 sendMessage，自己的 onMessage 收不到，
  所以必须借一个「扩展页面」(chrome-extension://<id>/src/options.html) 转发。
  这个页面用 CDP 后台打开即可，不需要 GUI、不需要人看见或点击。

依赖：仅 Python 标准库。
"""

import argparse
import base64
import hashlib
import json
import os
import re
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, quote

# ============================ 常量 ============================
DEFAULT_SCRIPT_ID = "6006"                 # scriptcat 商店脚本 ID：微软积分（优化版）
SCRIPT_NAME_HINT = "微软积分"               # 用来从已装脚本列表里认出目标脚本
ACCOUNTS = [(9222, "long"), (9223, "marvin"), (9224, "joe"), (9225, "Dean")]

RPC_PREFIX = "serviceWorker/script/"
# 扩展页面路径随版本变化：1.5.x 是 src/options.html，更老的版本是 pages/manage.html
EXT_PAGE_CANDIDATES = ["src/options.html", "pages/manage.html", "pages/options.html"]

STORE_API = "https://scriptcat.org/api/v2/scripts/%s/code"
# 脚本猫对 @grant GM_cookie 按「域名 + 时长」授权；这里预先写 allow 记录，
# 等价于弹窗里选「永久 + 允许」，不需要 GUI、不需要真的跑一遍。
COOKIE_HOSTS_DEFAULT = [
    "bing.com", "www.bing.com", "cn.bing.com", "rewards.bing.com",
    "prod.rewardsplatform.microsoft.com", "login.live.com", "account.live.com",
]
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/157.0.0.0 Safari/537.36")

HERE = os.path.dirname(os.path.abspath(__file__))


# ============================ 极简 WebSocket ============================
def _ws_connect(url):
    parsed = urlparse(url)
    host, port = parsed.hostname, parsed.port or 80
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    sock = socket.create_connection((host, port), timeout=8)
    key = base64.b64encode(os.urandom(16)).decode()
    req = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    )
    sock.sendall(req.encode())
    resp = b""
    while b"\r\n\r\n" not in resp:
        chunk = sock.recv(4096)
        if not chunk:
            raise ConnectionError("ws 握手失败")
        resp += chunk
    if b"101" not in resp.split(b"\r\n", 1)[0]:
        raise ConnectionError("ws 握手被拒绝: " + resp[:200].decode("utf-8", "replace"))
    return sock


def _ws_send(sock, payload, opcode=0x1):
    mask = os.urandom(4)
    length = len(payload)
    if length < 126:
        header = struct.pack("!BB", 0x80 | opcode, 0x80 | length)
    elif length < 65536:
        header = struct.pack("!BBH", 0x80 | opcode, 0x80 | 126, length)
    else:
        header = struct.pack("!BBQ", 0x80 | opcode, 0x80 | 127, length)
    masked = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    sock.sendall(header + mask + masked)


def _ws_recv_frame(sock):
    def _read(n):
        data = b""
        while len(data) < n:
            chunk = sock.recv(n - len(data))
            if not chunk:
                raise ConnectionError("连接关闭")
            data += chunk
        return data

    b1, b2 = _read(2)
    fin = (b1 & 0x80) != 0
    opcode = b1 & 0x0F
    masked = (b2 & 0x80) != 0
    length = b2 & 0x7F
    if length == 126:
        length = struct.unpack("!H", _read(2))[0]
    elif length == 127:
        length = struct.unpack("!Q", _read(8))[0]
    mask = _read(4) if masked else None
    payload = _read(length)
    if mask:
        payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
    return fin, opcode, payload


def _ws_recv_message(sock):
    payload = b""
    while True:
        fin, opcode, chunk = _ws_recv_frame(sock)
        if opcode == 0x9:                      # ping → pong
            _ws_send(sock, chunk, opcode=0xA)
            continue
        if opcode == 0x8:                      # close
            return None
        payload += chunk
        if fin:
            return payload.decode("utf-8", "replace") if opcode == 0x1 else None


class _CdpSession:
    def __init__(self, ws_url):
        self.sock = _ws_connect(ws_url)
        self._mid = 0

    def _recv_until(self, target_id, timeout):
        self.sock.settimeout(timeout)
        deadline = time.time() + timeout
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                raise TimeoutError("CDP 响应超时")
            try:
                msg = _ws_recv_message(self.sock)
            except socket.timeout:
                raise TimeoutError("CDP 响应超时")
            if msg is None:
                raise ConnectionError("CDP 连接关闭")
            try:
                ev = json.loads(msg)
            except Exception:
                continue
            if ev.get("id") == target_id:
                return ev

    def call(self, method, params=None, timeout=20):
        self._mid += 1
        mid = self._mid
        _ws_send(self.sock, json.dumps(
            {"id": mid, "method": method, "params": params or {}}).encode())
        resp = self._recv_until(mid, timeout)
        if resp.get("error"):
            raise RuntimeError("CDP %s 错误: %s" % (method, resp["error"]))
        return resp.get("result", {})

    def evaluate(self, expr, timeout=60):
        res = self.call("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True,
        }, timeout)
        inner = res.get("result") or {}
        if inner.get("exceptionDetails"):
            raise RuntimeError("页面脚本异常: %s" % inner["exceptionDetails"])
        return inner.get("value")

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


# ============================ CDP target ============================
def http_json(url, timeout=5):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def list_targets(port):
    return http_json("http://127.0.0.1:%d/json/list" % port)


def open_page(port, url):
    """Chrome 111+ 访问 /json/new 必须用 PUT"""
    req = urllib.request.Request(
        "http://127.0.0.1:%d/json/new?%s" % (port, quote(url, safe="")), method="PUT")
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


def _create_target(port, url):
    """备用开页通道：/json/new 被禁用时，走浏览器级 CDP 的 Target.createTarget"""
    v = http_json("http://127.0.0.1:%d/json/version" % port)
    sess = _CdpSession(v["webSocketDebuggerUrl"])
    try:
        return sess.call("Target.createTarget", {"url": url}, timeout=10)
    finally:
        sess.close()


def close_page(port, target_id):
    """关掉自己开的临时 tab（404 错误页不要留着）"""
    if not target_id:
        return
    try:
        urllib.request.urlopen(
            "http://127.0.0.1:%d/json/close/%s" % (port, target_id), timeout=4).read()
    except Exception:
        pass


def _ext_ids_ordered(targets, prefer=None):
    """候选扩展 ID：显式指定的 → 有 service worker / 后台页的 → 其他页面里的。
    Chrome 自带组件扩展（如 web store payments）也会出现在 target 列表里，所以要排序。"""
    sw_ids, page_ids = [], []
    for t in targets:
        url = t.get("url") or ""
        if not url.startswith("chrome-extension://"):
            continue
        eid = url.split("/")[2]
        (sw_ids if t.get("type") in ("service_worker", "background_page") else page_ids).append(eid)
    out = []
    if prefer:
        out.append(prefer)
    for eid in sw_ids + page_ids:
        if eid not in out:
            out.append(eid)
    return out


def _valid_ext_page(ws):
    """扩展页面有效性：能拿到 chrome.runtime.id 才算真的加载了扩展页面（否则是 404 错误页）"""
    sess = None
    try:
        sess = _CdpSession(ws)
        return bool(sess.evaluate(
            "(function(){try{return !!(window.chrome&&chrome.runtime&&chrome.runtime.id)}"
            "catch(e){return false}})()", timeout=10))
    except Exception:
        return False
    finally:
        if sess:
            sess.close()


def ext_page_ws(port, auto_open=True, verbose=True, ext_id=None, log=None):
    """拿一个扩展页面 target 的 ws（用来发 chrome.runtime 消息）。没有就后台开一个。"""
    log = log or (print if verbose else (lambda *a, **k: None))
    targets = list_targets(port)
    pages = [t for t in targets
             if t.get("type") == "page"
             and (t.get("url") or "").startswith("chrome-extension://")
             and t.get("webSocketDebuggerUrl")]
    if ext_id:
        pages.sort(key=lambda t: 0 if ("//%s/" % ext_id) in (t.get("url") or "") else 1)
    # 已有扩展页面：必须校验通过（否则是上次留下的 404 错误页）
    for t in pages:
        if not ext_id or ("//%s/" % ext_id) in (t.get("url") or "") or len(pages) == 1:
            if _valid_ext_page(t["webSocketDebuggerUrl"]):
                return t["webSocketDebuggerUrl"]

    ids = _ext_ids_ordered(targets, prefer=ext_id)
    if not ids:
        log("    [!] 找不到任何 chrome-extension:// target（扩展没加载？）")
        return None
    if not auto_open:
        log("    [!] 没开扩展页面（需要 auto_open）")
        return None

    for eid in ids[:3]:
        for rel in EXT_PAGE_CANDIDATES:
            page_url = "chrome-extension://%s/%s" % (eid, rel)
            try:
                opened = open_page(port, page_url)
            except Exception as e:
                log("    [!] 打开扩展页面失败（/json/new 被禁用？）: %s" % e)
                try:
                    opened = _create_target(port, page_url)
                except Exception as e2:
                    log("    [!] Target.createTarget 也失败: %s" % e2)
                    continue
            time.sleep(1.6)
            for t in list_targets(port):
                u = t.get("url") or ""
                if (t.get("type") == "page" and u.startswith(page_url)
                        and t.get("webSocketDebuggerUrl")):
                    if _valid_ext_page(t["webSocketDebuggerUrl"]):
                        return t["webSocketDebuggerUrl"]
                    close_page(port, t.get("id") or "")
                    break
    return None


def sw_ws(port):
    """service worker target 的 ws（备用通道用）"""
    for t in list_targets(port):
        if t.get("type") == "service_worker" and t.get("webSocketDebuggerUrl"):
            return t["webSocketDebuggerUrl"]
    return None


# ============================ 扩展 ID 识别 ============================
def ext_id_from_prefs(user_dir):
    """从 profile 的 Preferences 里认脚本猫扩展 ID（解包加载的扩展会带 path）。"""
    if not user_dir:
        return None
    try:
        prefs = os.path.join(user_dir, "Default", "Preferences")
        if not os.path.exists(prefs):
            return None
        with open(prefs, "r", encoding="utf-8") as f:
            d = json.load(f)
        settings = (d.get("extensions") or {}).get("settings") or {}
        by_path, by_loc = [], []
        for eid, v in settings.items():
            if not isinstance(v, dict):
                continue
            p = str(v.get("path", "")).rstrip("/")
            if p and re.search(r"scriptcat$", p, re.I):
                by_path.append(eid)
            elif v.get("location") == 4:       # 4 = 解包扩展
                by_loc.append(eid)
        if by_path:
            return by_path[0]
        if len(by_loc) == 1:
            return by_loc[0]
    except Exception:
        pass
    return None


def ext_id_from_path(ext_dir):
    """解包扩展（manifest 无 key）的 ID = sha256(绝对路径) 前 32 位 hex → a-p 映射"""
    if not ext_dir:
        return None
    try:
        h = hashlib.sha256(os.path.abspath(ext_dir).encode("utf-8")).hexdigest()[:32]
        return "".join(chr(ord("a") + int(c, 16)) for c in h)
    except Exception:
        return None


def detect_ext_id(port, log=None):
    """从 chrome://extensions + developerPrivate 认脚本猫扩展 ID（最可靠）。"""
    log = log or (lambda *a, **k: None)
    try:
        open_page(port, "chrome://extensions/")
    except Exception:
        try:
            _create_target(port, "chrome://extensions/")
        except Exception:
            return None
    time.sleep(1.6)
    ws = None
    for t in list_targets(port):
        if (t.get("url") or "").startswith("chrome://extensions"):
            ws = t.get("webSocketDebuggerUrl")
            break
    if not ws:
        return None
    js = r"""(function(){return new Promise(function(res){
      try{chrome.developerPrivate.getExtensionsInfo({includeDisabled:true},function(l){
        l = l || [];
        var byName = l.filter(function(e){ return /脚本猫|ScriptCat/i.test(e.name||''); });
        var byPerm = l.filter(function(e){
          var sp=(e.permissions&&e.permissions.simplePermissions)||[];
          return sp.indexOf('userScripts')>=0;
        });
        var hit = byName.length ? byName : byPerm;
        res(JSON.stringify(hit.map(function(e){return {id:e.id,name:e.name,v:e.version};})));
      });}catch(e){res(JSON.stringify({err:String(e)}));}});})()"""
    sess = _CdpSession(ws)
    try:
        raw = sess.evaluate(js, timeout=20)
        data = json.loads(raw) if isinstance(raw, str) else []
        if isinstance(data, dict) and data.get("err"):
            log("    [!] developerPrivate 不可用: %s" % data["err"])
            return None
        if data:
            return data[0].get("id")
    except Exception as e:
        log("    [!] 读扩展信息失败: %s" % e)
    finally:
        sess.close()
    return None


def resolve_ext_id(port, ext_dir=None, user_dir=None, log=None, guess=True):
    """按可靠性顺序认扩展 ID：Preferences → chrome://extensions → 路径哈希。

    guess=False 时不做「路径哈希」这种猜测——猜测出来的 ID 在扩展没加载时会让
    调用方误以为扩展已就绪，从而跳过 loadUnpacked 安装。
    """
    eid = ext_id_from_prefs(user_dir)
    if eid:
        return eid
    eid = detect_ext_id(port, log=log)
    if eid:
        return eid
    return ext_id_from_path(ext_dir) if guess else None


def load_unpacked(port, ext_dir, log=None):
    """浏览器级 CDP：Extensions.loadUnpacked 装未打包扩展（Chrome 137+ 需要
    --enable-unsafe-extension-debugging；老版 Chromium 无此 domain → 返回 None）。"""
    log = log or (lambda *a, **k: None)
    try:
        v = http_json("http://127.0.0.1:%d/json/version" % port)
        sess = _CdpSession(v["webSocketDebuggerUrl"])
        try:
            r = sess.call("Extensions.loadUnpacked", {"path": os.path.abspath(ext_dir)}, timeout=40)
            return r.get("id")
        finally:
            sess.close()
    except Exception as e:
        log("    [!] loadUnpacked 失败（旧版浏览器可忽略，扩展已由 --load-extension 加载）: %s" % e)
        return None


# ============================ RPC ============================
# 在扩展页面主世界执行：chrome.runtime.sendMessage -> 脚本猫后台 RPC
_RPC_JS = r"""(async function(){
  var ACTION = __ACTION__, DATA = __DATA__, TIMEOUT = __TIMEOUT__;
  try {
    return await new Promise(function(resolve){
      var done = false;
      var timer = setTimeout(function(){
        if (!done) { done = true; resolve({timeout:true}); }
      }, TIMEOUT);
      function finish(v){ if (done) return; done = true; clearTimeout(timer); resolve(v); }
      try {
        chrome.runtime.sendMessage({action: ACTION, data: DATA}, function(resp){
          finish({resp: resp || null,
                  lastError: (chrome.runtime.lastError && chrome.runtime.lastError.message) || ""});
        });
      } catch (e) { finish({thrown: String(e && e.message || e)}); }
    });
  } catch (e) { return {outerErr: String(e && e.message || e)}; }
})()"""


def rpc_action(sess, action, data, timeout_ms=15000):
    expr = (_RPC_JS
            .replace("__ACTION__", json.dumps(action))
            .replace("__DATA__", json.dumps(data))
            .replace("__TIMEOUT__", str(timeout_ms)))
    return sess.evaluate(expr, timeout=max(30, timeout_ms / 1000 + 15))


def rpc(sess, method, data=None, timeout_ms=15000):
    return rpc_action(sess, RPC_PREFIX + method, data, timeout_ms)


def _unwrap(result, label):
    """把 RPC 结果拆成 (ok, payload/text)。payload 为响应里的 data 字段。"""
    if not isinstance(result, dict):
        return False, "无返回(%r)" % (result,)
    if result.get("timeout"):
        return False, "超时（脚本猫后台没响应，可能 SW 被冻结）"
    if result.get("thrown"):
        return False, "抛异常: " + result["thrown"]
    if result.get("outerErr"):
        return False, "异常: " + result["outerErr"]
    if result.get("lastError"):
        return False, "runtime.lastError: " + result["lastError"]
    resp = result.get("resp")
    if not isinstance(resp, dict):
        return False, "响应格式异常(%r)" % (resp,)
    if resp.get("code") not in (0, None):
        return False, "RPC 错误 %s: %s" % (resp.get("code"), resp.get("message"))
    return True, resp.get("data")


def call(sess, method, data=None, timeout_ms=15000):
    return _unwrap(rpc(sess, method, data, timeout_ms), method)


# ============================ 商店脚本 ============================
def fetch_store_script(script_id=DEFAULT_SCRIPT_ID):
    """取商店脚本源码：返回 (code, version, meta)"""
    req = urllib.request.Request(STORE_API % script_id, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=40) as r:
        d = json.loads(r.read().decode("utf-8", "replace"))
    sc = ((d.get("data") or {}).get("script") or {})
    code = sc.get("code") or ""
    if not code.startswith("//"):
        raise RuntimeError("商店返回的 code 不像 userscript（前 40 字: %r）" % code[:40])
    return code, str(sc.get("version") or "?"), sc


def store_script_url(script_id, name):
    """商店里脚本的真实 .user.js 地址（ScriptCat 正常安装后 checkUpdateUrl 就是它）"""
    return "https://scriptcat.org/scripts/code/%s/%s.user.js" % (
        script_id, urllib.parse.quote(name))


def meta_name(code, default=SCRIPT_NAME_HINT):
    m = re.search(r"@name\s+([^\r\n]+)", code)
    return m.group(1).strip() if m else default


def meta_version(code):
    m = re.search(r"@version\s+([0-9][\w.\-]*)", code)
    return m.group(1) if m else "?"


# ============================ 脚本猫操作 ============================
def script_ver(hit):
    v = ((hit or {}).get("metadata") or {}).get("version")
    if isinstance(v, list):
        v = v[0] if v else "?"
    return str(v if v is not None else "?")


def find_script(sess, hint=SCRIPT_NAME_HINT):
    """按名字片段找已装脚本，返回 (script|None, 说明)"""
    ok, data = call(sess, "getAllScripts", None)
    if not ok or not isinstance(data, list):
        return None, "读不到脚本列表: %s" % data
    for s in data:
        if hint and hint in (s.get("name") or ""):
            return s, ""
    return None, "已装脚本: %s" % (", ".join((x.get("name") or "?") for x in data) or "（无）")


def enable_script(sess, uuid):
    ok, data = call(sess, "enables", {"uuids": [uuid], "enable": True})
    return ok, data


def install_script(sess, code, timeout_ms=180000):
    return call(sess, "installByCode", {"code": code, "upsertBy": "user"}, timeout_ms)


def read_logs(sess, minutes=10):
    now = int(time.time() * 1000)
    start = now - minutes * 60 * 1000
    for action in ("serviceWorker/log/getLogs", "serviceWorker/logger/getLogs"):
        try:
            # 完整 action（log 组不在 script 组下，不能用 rpc()）
            ok, data = _unwrap(rpc_action(sess, action, {"start": start, "end": now}), action)
            if ok:
                return data
        except Exception:
            continue
    return None


def flatten_logs(data):
    """日志结构随版本变，尽量把能看到的 message 抽出来"""
    msgs = []

    def walk(x, depth=0):
        if depth > 4 or x is None:
            return
        if isinstance(x, str):
            if len(x) < 500:
                msgs.append(x)
            return
        if isinstance(x, list):
            for i in x[:200]:
                walk(i, depth + 1)
            return
        if isinstance(x, dict):
            for k in ("msg", "message", "content", "text", "log"):
                if isinstance(x.get(k), str):
                    msgs.append(x[k])
                    break
            else:
                for v in x.values():
                    walk(v, depth + 1)

    walk(data)
    return msgs


# ============================ 允许用户脚本 ============================
# 只在 chrome://extensions 上下文能跑：chrome.developerPrivate 只在那里暴露。
_ALLOW_JS = r"""(async function(){
  var ENABLE = __ENABLE__;
  var dp = (typeof chrome !== 'undefined') ? chrome.developerPrivate : null;
  if (!dp) return JSON.stringify({err: "chrome.developerPrivate 不可用（不是 chrome://extensions 页面？）"});
  function call(fn, arg){
    return new Promise(function(res){
      try {
        if (arg === undefined) fn(function(x){ res(x); });
        else fn(arg, function(x){ res(x); });
      } catch(e) { res(undefined); }
    });
  }
  var profile = await call(dp.getProfileConfiguration.bind(dp)) || {};
  var devMode = !!profile.inDeveloperMode;
  if (ENABLE && !devMode) {
    await call(dp.updateProfileConfiguration.bind(dp), {inDeveloperMode: true});
    devMode = true;
  }
  var list = await call(dp.getExtensionsInfo.bind(dp), {includeDisabled: true}) || [];
  var hits = list.filter(function(e){
    var sp = (e.permissions && e.permissions.simplePermissions) || [];
    return sp.indexOf('userScripts') >= 0 || /脚本猫|ScriptCat/i.test(e.name || '');
  });
  var changed = [], errors = [];
  if (ENABLE) {
    for (var i = 0; i < hits.length; i++) {
      var e = hits[i];
      var on = !!(e.userScriptsAccess && e.userScriptsAccess.isActive);
      if (!on) {
        try {
          await new Promise(function(res, rej){
            dp.updateExtensionConfiguration({extensionId: e.id, userScriptsAccess: true}, function(){
              if (chrome.runtime.lastError) rej(String(chrome.runtime.lastError.message)); else res(1);
            });
          });
          changed.push(e.id);
        } catch (err) { errors.push((e.name||e.id) + ": " + String(err)); }
      }
    }
  }
  // 重载一次：worker 被冻结/没在轮询时，光改权限它不会自己重新注册用户脚本
  for (var k = 0; k < changed.length; k++) {
    var rid = changed[k];
    await new Promise(function(res){
      try { dp.reload(rid, {failQuietly: true}, function(){ res(1); }); } catch(e) { res(0); }
    });
  }
  if (changed.length) await new Promise(function(res){ setTimeout(res, 1200); });
  var out = [];
  for (var j = 0; j < hits.length; j++) {
    var info = await call(dp.getExtensionInfo.bind(dp), hits[j].id) || {};
    var usa = info.userScriptsAccess;
    out.push({id: info.id || hits[j].id, name: info.name || hits[j].name,
              version: info.version, state: info.state,
              hasKey: (usa !== undefined),
              active: !!(usa && usa.isActive), enabled: !!(usa && usa.isEnabled)});
  }
  return JSON.stringify({devMode: devMode, exts: out, changed: changed, errors: errors});
})()"""


def allow_userscripts(port, log=print):
    """开启脚本猫「允许用户脚本」+ 开发者模式。老版 Chrome 无此开关时视为通过。"""
    try:
        list_targets(port)
    except Exception as e:
        log("    [!] 连不上 CDP %d: %s" % (port, e))
        return False

    ws = None
    try:
        open_page(port, "chrome://extensions/")
    except Exception:
        try:
            _create_target(port, "chrome://extensions/")
        except Exception as e:
            log("    [!] 打不开 chrome://extensions/: %s" % e)
            return False
    time.sleep(1.8)
    for t in list_targets(port):
        if (t.get("url") or "").startswith("chrome://extensions"):
            ws = t.get("webSocketDebuggerUrl")
            break
    if not ws:
        log("    [!] 没有 chrome://extensions 页面 target")
        return False

    sess = _CdpSession(ws)
    try:
        raw = sess.evaluate(_ALLOW_JS.replace("__ENABLE__", "true"), timeout=40)
        res = json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception as e:
        log("    [!] 设置失败: %s" % e)
        return False
    finally:
        sess.close()

    if res.get("err"):
        log("    [!] %s" % res["err"])
        return False
    exts = res.get("exts") or []
    if not exts:
        log("    [!] 没找到声明 userScripts 权限的扩展（脚本猫没装？）")
        return False

    ok = True
    for e in exts:
        if not e.get("hasKey"):
            log("    · %s v%s：旧版 Chrome 无「允许用户脚本」开关，跳过" % (
                e.get("name"), e.get("version")))
            continue
        good = bool(e.get("active"))
        log("    %s %s v%s [%s] allowed=%s/effective=%s" % (
            "✅" if good else "❌", e.get("name"), e.get("version"), e.get("state"),
            e.get("enabled"), e.get("active")))
        if not good:
            ok = False
    for err in res.get("errors") or []:
        # 老版本不支持 userScriptsAccess 参数时会报错，这种情况不算失败
        if "userScriptsAccess" in str(err) or "not supported" in str(err).lower():
            log("    · %s（旧版忽略）" % err)
            continue
        log("    [!] %s" % err)
        ok = False
    if res.get("changed"):
        log("    · 已新开启 %d 个扩展：%s" % (len(res["changed"]), ", ".join(res["changed"])))
    log("    · 开发者模式：%s" % ("已开启" if res.get("devMode") else "未开启（可能影响用户脚本）"))
    return ok


# ============================ 静默更新开关 ============================
def _cfg_get(sess, key, area="sync"):
    expr = ("(async function(){try{var o=await chrome.storage.%s.get(%s);"
            "return JSON.stringify(o||{});}catch(e){return '{\"__err\":\"'+String(e)+'\"}'}})()"
            % (area, json.dumps(key)))
    raw = sess.evaluate(expr, timeout=20)
    try:
        return json.loads(raw) if isinstance(raw, str) else (raw or {})
    except Exception:
        return {}


def _cfg_set(sess, kv, area="sync"):
    expr = ("(async function(){try{await chrome.storage.%s.set(%s);return 'ok'}"
            "catch(e){return String(e)}})()" % (area, json.dumps(kv)))
    return sess.evaluate(expr, timeout=20)


def reload_ext(port, ext_id, log=print):
    """重载扩展：让 SystemConfig 的内存缓存重建，storage 里改的开关才会真正生效"""
    try:
        open_page(port, "chrome://extensions/")
    except Exception:
        try:
            _create_target(port, "chrome://extensions/")
        except Exception:
            return False
    time.sleep(1.6)
    ws = None
    for t in list_targets(port):
        if (t.get("url") or "").startswith("chrome://extensions"):
            ws = t.get("webSocketDebuggerUrl")
            break
    if not ws:
        return False
    js = ("""(function(){return new Promise(function(res){
      try{chrome.developerPrivate.reload(%s,{failQuietly:true},function(){res(1)});}
      catch(e){res(0)}});})()""" % json.dumps(ext_id))
    sess = _CdpSession(ws)
    try:
        sess.evaluate(js, timeout=20)
    except Exception:
        return False
    finally:
        sess.close()
    time.sleep(2.0)
    return True


def _ver_tuple(v):
    """把 "1.5.2" / "v1.2.3" 解析成可比较的元组；解析不出来返回 None。"""
    nums = re.findall(r"\d+", str(v or ""))
    return tuple(int(x) for x in nums) if nums else None


def _extensions_page_ws(port, log=None):
    """chrome://extensions 页面的 ws（没有就后台开一个，复用已有的）。
    chrome.developerPrivate 只在这个上下文里暴露：读扩展版本、reload、点「更新」都靠它。"""
    try:
        for t in list_targets(port):
            if (t.get("url") or "").startswith("chrome://extensions"):
                ws = t.get("webSocketDebuggerUrl")
                if ws:
                    return ws
    except Exception:
        return None
    opened = False
    for opener in (open_page, _create_target):
        try:
            opener(port, "chrome://extensions/")
            opened = True
            break
        except Exception:
            continue
    if not opened:
        if log:
            log("    [!] 打不开 chrome://extensions/")
        return None
    time.sleep(1.6)
    try:
        for t in list_targets(port):
            if (t.get("url") or "").startswith("chrome://extensions"):
                return t.get("webSocketDebuggerUrl")
    except Exception:
        return None
    return None


_EXT_INFO_JS = r"""(async function(){
  var dp = (typeof chrome !== 'undefined') ? chrome.developerPrivate : null;
  if (!dp) return JSON.stringify({err: "chrome.developerPrivate 不可用"});
  var id = __ID__;
  function call(fn, arg){
    return new Promise(function(res){
      try {
        if (arg === undefined) fn(function(x){ res(x); });
        else fn(arg, function(x){ res(x); });
      } catch(e) { res(null); }
    });
  }
  var info = await call(dp.getExtensionInfo.bind(dp), id);
  if (!info) {
    var list = await call(dp.getExtensionsInfo.bind(dp), {includeDisabled: true}) || [];
    info = (list || []).filter(function(e){ return e.id === id; })[0] || null;
  }
  if (!info) return JSON.stringify({err: "extension not found"});
  return JSON.stringify({id: info.id || id, name: info.name || "",
                         version: info.version || "", state: info.state,
                         location: info.location || "",
                         updateUrl: info.updateUrl || ""});
})()"""


def ext_info(port, ext_id, log=None):
    """读已加载扩展的 id/name/version/state；读不到返回 {}（不抛异常）。"""
    ws = _extensions_page_ws(port, log=log)
    if not ws:
        return {}
    sess = _CdpSession(ws)
    try:
        raw = sess.evaluate(_EXT_INFO_JS.replace("__ID__", json.dumps(ext_id)), timeout=20)
        d = json.loads(raw) if isinstance(raw, str) else (raw or {})
        return d if isinstance(d, dict) and not d.get("err") else {}
    except Exception:
        return {}
    finally:
        sess.close()


def disk_ext_version(ext_dir):
    """解包扩展目录里 manifest.json 的版本号（取不到返回空串）。"""
    if not ext_dir:
        return ""
    try:
        with open(os.path.join(ext_dir, "manifest.json"), encoding="utf-8") as f:
            return str((json.load(f) or {}).get("version") or "")
    except Exception:
        return ""


_AUTO_UPDATE_JS = r"""(function(){return new Promise(function(res){
  var dp = (typeof chrome !== 'undefined') ? chrome.developerPrivate : null;
  if (!dp || !dp.autoUpdate) return res(JSON.stringify({ok:false, err:"没有 autoUpdate"}));
  try { dp.autoUpdate(function(){ res(JSON.stringify({ok:true})); }); }
  catch(e) { res(JSON.stringify({ok:false, err:String(e)})); }
});})()"""


def auto_update_ext(port, log=None):
    """点一次 chrome://extensions 顶部的「更新」——只对商店安装的扩展有效。
    解包扩展没有更新源，点了也不会有变化（不报错，交给调用方比对版本）。"""
    ws = _extensions_page_ws(port, log=log)
    if not ws:
        return False
    sess = _CdpSession(ws)
    try:
        raw = sess.evaluate(_AUTO_UPDATE_JS, timeout=30)
        d = json.loads(raw) if isinstance(raw, str) else (raw or {})
        return bool(isinstance(d, dict) and d.get("ok"))
    except Exception:
        return False
    finally:
        sess.close()


def ensure_ext_current(port, ext_id, ext_dir=None, allow_store=True, log=print):
    """把已加载的脚本猫扩展对齐到「磁盘上那份」或商店最新。只 reload，不重启浏览器。

    · 磁盘解包目录版本更高 → reload 让 Chrome 重读文件（同路径同 ID，脚本与授权都不丢）
    · 版本相同            → 什么都不做
    · 磁盘版本更低        → 保留浏览器里的（避免把开发版顶回旧版）
    · 没有磁盘目录（商店 CRX）→ 点一次「更新」让商店自己拉
    返回 {ok, changed, before, after, source}
    """
    res = {"ok": False, "changed": False, "before": "", "after": "", "source": ""}
    before = str(ext_info(port, ext_id, log=log).get("version") or "")
    res["before"] = res["after"] = before
    disk = disk_ext_version(ext_dir)
    if disk:
        res["source"] = "disk"
        dt, bt = _ver_tuple(disk), _ver_tuple(before)
        if bt is not None and dt is not None and dt <= bt:
            res["ok"] = True
            return res
        log("    · 磁盘扩展 v%s，浏览器里是 v%s → 重载让 Chrome 读新文件…" % (disk, before or "?"))
        if not reload_ext(port, ext_id, log=log):
            return res
    elif allow_store:
        res["source"] = "store"
        if not auto_update_ext(port, log=log):
            log("    · 商店更新未受理（解包扩展没有更新源，或网络不通）")
            res["ok"] = True          # 不是错误：本来就没有商店通道
            return res
        time.sleep(3.0)
    else:
        res["ok"] = True
        return res

    time.sleep(1.0)
    after = str(ext_info(port, ext_id, log=log).get("version") or "")
    # reload 了但版本没变：说明浏览器里这份扩展不是从该解包目录加载的（商店 CRX 装的），
    # 此时退回「商店更新」再试一次，避免把「reload 无效」误报成「已是最新」。
    if disk and before and after and after == before and allow_store:
        log("    · 重载后版本没变（浏览器里这份不是该解包目录），改走商店更新…")
        if auto_update_ext(port, log=log):
            time.sleep(3.0)
            again = str(ext_info(port, ext_id, log=log).get("version") or "")
            if again:
                after = again
    res["after"] = after or before
    res["ok"] = bool(after or before)
    res["changed"] = bool(after and before and after != before)
    return res


def set_silent_update(port, ext_id=None, log=print):
    """打开「静默更新非重大变更」。返回 (ok, changed)。
    changed=True 表示刚写入，必须 reload 扩展才生效（SW 里缓存了旧值）。
    注意：这个键不在本地键白名单里，实际落在 chrome.storage.sync 的 system_ 前缀下。"""
    ws = ext_page_ws(port, ext_id=ext_id, log=log)
    if not ws:
        return False, False
    sess = _CdpSession(ws)
    try:
        cur = _cfg_get(sess, "system_silence_update_script", "sync")
        if cur.get("system_silence_update_script") is True:
            return True, False
        r = _cfg_set(sess, {"system_silence_update_script": True}, "sync")
        return (r == "ok"), True
    finally:
        sess.close()


# ============================ Cookie 永久授权 ============================
_GRANT_COOKIE_JS = r"""(async function(){
  var UUID = "__UUID__", HOSTS = __HOSTS__, RUN = __RUN__;
  var out = {written: [], existed: [], errors: [], rows: [], resetFlags: null, run: null};
  var now = Date.now();
  var all0 = await chrome.storage.local.get(null);

  for (var i = 0; i < HOSTS.length; i++) {
    var h = HOSTS[i];
    var key = "permission:" + UUID + ":cookie:" + h;
    var old = all0[key];
    if (old && old.allow) { out.existed.push(h); continue; }
    var rec = {
      allow: true,
      createtime: (old && old.createtime) || now,
      permission: "cookie",
      permissionValue: h,
      updatetime: 0,
      uuid: UUID
    };
    var kv = {}; kv[key] = rec;
    try {
      await chrome.storage.local.set(kv);
      out.written.push(h);
    } catch (e) { out.errors.push(h + " local: " + String(e && e.message || e)); continue; }
    try { await chrome.storage.session.set(kv); }
    catch (e) { out.errors.push(h + " session: " + String(e && e.message || e)); }
  }

  // 只有真写了新授权（或要求立刻跑）时才清「曾拒绝/已探测」标记，
  // 避免每次启动都把脚本内的探测状态推倒重来。
  if (out.written.length > 0 || RUN) {
    try {
      var r = await new Promise(function(res){
        chrome.runtime.sendMessage({
          action: "serviceWorker/value/setScriptValues",
          // 新老两套键都清：zy.js 0.72 起把标记改到 Perm. 前缀（不再被每轮收工清掉），
          // 老版本写的是 Config. 前缀，留着会互相打架。Denied 改成记录时间戳，
          // 清成 0 就等于「从没拒绝过」，下一次运行会重新申请并拿到授权。
          data: {uuid: UUID, keyValuePairs: [
            ["Perm.cookieDeniedAt", 0], ["Perm.cookieProbed", false],
            ["Config.cookieDenied", false], ["Config.cookieProbed", false]
          ]}
        }, function(x){ res(x || {code: -1, message: String(chrome.runtime.lastError && chrome.runtime.lastError.message || "")}); });
      });
      out.resetFlags = {code: (r && r.code), message: (r && r.message) || ""};
    } catch (e) { out.resetFlags = {code: -1, message: String(e)}; }
  }

  if (RUN) {
    try {
      var rr = await new Promise(function(res){
        chrome.runtime.sendMessage({action: "serviceWorker/runtime/runScript", data: UUID},
          function(x){ res(x || {code: -1, message: String(chrome.runtime.lastError && chrome.runtime.lastError.message || "")}); });
      });
      out.run = {code: (rr && rr.code), message: (rr && rr.message) || ""};
    } catch (e) { out.run = {code: -1, message: String(e)}; }
  }

  var all = await chrome.storage.local.get(null);
  var pre = "permission:" + UUID + ":cookie:";
  Object.keys(all).filter(function(k){ return k.indexOf(pre) === 0; }).forEach(function(k){
    out.rows.push({host: all[k].permissionValue, allow: !!all[k].allow});
  });
  return JSON.stringify(out);
})()"""


def grant_cookie(port, hosts=None, do_run=False, ext_id=None,
                 name_hint=SCRIPT_NAME_HINT, log=print):
    """写入 Cookie 永久授权（等价弹窗里选「永久 + 允许」），无需 GUI。"""
    hosts = hosts or list(COOKIE_HOSTS_DEFAULT)
    try:
        list_targets(port)
    except Exception as e:
        log("    [!] 连不上 CDP %d: %s" % (port, e))
        return False

    ws = ext_page_ws(port, ext_id=ext_id, log=log)
    if not ws:
        return False
    sess = _CdpSession(ws)
    try:
        hit, why = find_script(sess, name_hint)
        if not hit:
            log("    [!] 没找到脚本，无法授权：%s" % why)
            return False
        uuid = hit.get("uuid") or ""
        if not uuid:
            log("    [!] 脚本没有 uuid，无法授权")
            return False
        js = (_GRANT_COOKIE_JS
              .replace("__UUID__", uuid)
              .replace("__HOSTS__", json.dumps(hosts))
              .replace("__RUN__", "true" if do_run else "false"))
        raw = sess.evaluate(js, timeout=60)
        try:
            res = json.loads(raw) if isinstance(raw, str) else (raw or {})
        except Exception:
            log("    [!] 授权返回无法解析: %r" % (raw,))
            return False

        if res.get("written"):
            log("    ✅ 新授权: %s" % ", ".join(res["written"]))
        if res.get("existed"):
            log("    = 已有授权: %s" % ", ".join(res["existed"]))
        for err in res.get("errors") or []:
            log("    [!] %s" % err)
        rows = res.get("rows") or []
        deny = [r["host"] for r in rows if not r.get("allow")]
        allow_n = len([r for r in rows if r.get("allow")])
        log("    · 当前 authorized 域名 %d 个" % allow_n)
        if deny:
            log("    [!] 存在 allow=false：%s" % ", ".join(deny))
        if do_run:
            run = res.get("run") or {}
            if run.get("code") == 0:
                log("    · 已触发脚本运行一次")
            else:
                log("    [!] 触发运行失败: %s" % (run.get("message") or run))
        return not res.get("errors") and not deny
    except Exception as e:
        log("    [!] 授权失败: %s" % e)
        return False
    finally:
        sess.close()


def run_script(port, ext_id=None, name_hint=SCRIPT_NAME_HINT, log=print, retries=3):
    ws = ext_page_ws(port, ext_id=ext_id, log=log)
    if not ws:
        return False
    sess = _CdpSession(ws)
    try:
        hit, why = find_script(sess, name_hint)
        if not hit:
            log("    [!] 没找到要运行的脚本: %s" % why)
            return False
        uuid = hit.get("uuid") or ""
        for i in range(retries):
            # 注意：runScript 属于 runtime 组，不是 script 组，必须用完整 action
            ok, data = _unwrap(
                rpc_action(sess, "serviceWorker/runtime/runScript", uuid, 60000), "runScript")
            if ok:
                return True
            log("    [!] runScript 失败(%d/%d): %s" % (i + 1, retries, str(data)[:160]))
            time.sleep(2)
        return False
    finally:
        sess.close()


# ============================ 高层：安装 / 更新 / 状态 ============================
def get_status(port, name_hint=SCRIPT_NAME_HINT, ext_id=None, log=print):
    """读当前已装脚本版本。返回 dict(ok, name, version, status, checkUpdateUrl)"""
    out = {"ok": False, "port": port, "name": None, "version": None,
           "status": None, "checkUpdateUrl": None, "detail": ""}
    ws = ext_page_ws(port, ext_id=ext_id, log=log)
    if not ws:
        out["detail"] = "拿不到扩展页面"
        return out
    sess = _CdpSession(ws)
    try:
        hit, why = find_script(sess, name_hint)
        if not hit:
            out["detail"] = why
            return out
        out.update(ok=True, name=hit.get("name"), version=script_ver(hit),
                   status=hit.get("status"),
                   checkUpdateUrl=hit.get("checkUpdateUrl"))
        return out
    finally:
        sess.close()


def ensure_browser(port, ext_dir=None, user_dir=None, script_id=DEFAULT_SCRIPT_ID,
                   name_hint=SCRIPT_NAME_HINT, grant=True, run=False,
                   install_ext=True, hosts=None, log=print):
    """给一个正在运行的浏览器把「脚本猫扩展 + 商店脚本」准备到可用状态（幂等）。

    新用户第一次跑任务时调用即可；已装过的只会做「启用 + 授权」这类轻量检查。
    返回 dict：ok / ext_id / installed / version / uuid / steps / detail
    """
    res = {"ok": False, "port": port, "ext_id": None, "installed": False,
           "version": None, "uuid": None, "cookie_ok": None, "steps": [], "detail": ""}

    def st(ok, label, detail=""):
        res["steps"].append({"ok": bool(ok), "label": label, "detail": detail})
        log(("    ✅ " if ok else "    ❌ ") + label + ((" — " + detail) if detail else ""))
        return ok

    # ⓪ 先确认浏览器在（否则后面所有报错都会指向「扩展找不到」，容易误判）
    try:
        http_json("http://127.0.0.1:%d/json/version" % port, timeout=3)
    except Exception as e:
        res["detail"] = "连不上 CDP %d（浏览器没运行？）: %s" % (port, e)
        st(False, "连接浏览器 CDP %d" % port, res["detail"])
        return res

    # ① 扩展（浏览器刚起来时扩展可能还没注册完，重试几次）
    #    先只用「真凭实据」（Preferences / chrome://extensions）认 ID；认不到才去装，
    #    装不上最后才退回按路径猜 ID，避免「猜对了 ID 但扩展根本没加载」的假成功。
    ext_id = None
    for attempt in range(3):
        ext_id = resolve_ext_id(port, ext_dir=ext_dir, user_dir=user_dir, log=log, guess=False)
        if ext_id:
            break
        time.sleep(2)
    if not ext_id and install_ext and ext_dir:
        ext_id = load_unpacked(port, ext_dir, log=log)
        if ext_id:
            st(True, "已通过 CDP 装入未打包扩展", "id=%s" % ext_id)
    if not ext_id:
        ext_id = resolve_ext_id(port, ext_dir=ext_dir, user_dir=user_dir, log=log, guess=True)
    if not ext_id:
        res["detail"] = "找不到脚本猫扩展（浏览器没加载，且无法自动安装）"
        st(False, "脚本猫扩展", res["detail"])
        return res
    res["ext_id"] = ext_id
    st(True, "脚本猫扩展就绪", "id=%s" % ext_id)

    # ② 允许用户脚本
    ok_users = allow_userscripts(port, log=log)
    st(ok_users, "允许运行用户脚本", "" if ok_users else "脚本猫可能拒绝安装/运行脚本")

    # ③ 脚本：没有就装商店最新，有就确保启用
    ws = ext_page_ws(port, ext_id=ext_id, log=log)
    if not ws:
        res["detail"] = "拿不到扩展页面（扩展未加载或页面路径不匹配）"
        st(False, "扩展页面", res["detail"])
        return res
    sess = _CdpSession(ws)
    core_ok = True
    try:
        hit, why = find_script(sess, name_hint)
        if hit:
            uuid = hit.get("uuid") or ""
            res["installed"] = False
            st(True, "脚本已安装", "%s v%s" % (hit.get("name"), script_ver(hit)))
        else:
            try:
                code, store_ver, _ = fetch_store_script(script_id)
            except Exception as e:
                res["detail"] = "取商店脚本失败: %s" % e
                st(False, "取商店脚本", str(e)[:160])
                return res
            name_hint = meta_name(code, name_hint)
            ok, data = install_script(sess, code)
            st(ok, "安装商店脚本", ("v%s" % store_ver) if ok else str(data)[:200])
            if not ok:
                res["detail"] = "installByCode 失败: %s" % str(data)[:200]
                return res
            hit, why = find_script(sess, name_hint)
            if not hit:
                res["detail"] = "装完找不到脚本: %s" % why
                st(False, "脚本已就位", res["detail"])
                return res
            uuid = hit.get("uuid") or ""
            res["installed"] = True
            st(True, "脚本已就位", "%s v%s" % (hit.get("name"), script_ver(hit)))

        res["uuid"] = uuid
        res["version"] = script_ver(hit)

        # installByCode 装出来的脚本默认 status=2（关闭），定时任务不会跑
        if hit.get("status") != 1:
            ok_en, data_en = enable_script(sess, uuid)
            time.sleep(0.6)
            hit2, _ = find_script(sess, name_hint)
            st(hit2 and hit2.get("status") == 1, "脚本已启用",
               "status=%s" % (hit2 or {}).get("status"))
            core_ok = core_ok and bool(hit2 and hit2.get("status") == 1)
        else:
            st(True, "脚本已启用", "status=1")

        # 更新地址：installByCode 装出来的是空，旧安装可能被指到已关掉的本地服务。
        # 不补的话脚本猫每天「检查更新」不知道去哪查，表现就是永远停在当前版本。
        try:
            hit_now, _ = find_script(sess, name_hint)
            cur_url = str((hit_now or {}).get("checkUpdateUrl") or "")
            if res["installed"] or not cur_url.startswith("https://scriptcat.org/scripts/code/"):
                su_url = store_script_url(script_id, (hit_now or {}).get("name") or name_hint)
                ok_u, data_u = call(sess, "setCheckUpdateUrl",
                                    {"uuid": uuid, "checkUpdate": True, "checkUpdateUrl": su_url})
                st(ok_u, "更新地址指向商店", "" if ok_u else str(data_u)[:160])
        except Exception as e:
            st(False, "设置更新地址", str(e)[:160])
    finally:
        sess.close()

    # ④ 静默更新开关（写 storage 后必须 reload 才生效）
    ok_cfg, changed = set_silent_update(port, ext_id=ext_id, log=log)
    if ok_cfg and changed:
        reload_ext(port, ext_id, log=log)
        st(True, "已开启「静默更新非重大变更」", "（已重载扩展使其生效）")
    elif ok_cfg:
        st(True, "「静默更新非重大变更」已开启")
    else:
        st(False, "开启「静默更新」失败", "更新时可能只提示、不自动安装")

    # ⑤ Cookie 永久授权
    if grant:
        ok_cookie = grant_cookie(port, hosts=hosts, do_run=run, ext_id=ext_id,
                                 name_hint=name_hint, log=log)
        res["cookie_ok"] = ok_cookie
        st(ok_cookie, "Cookie 永久授权", "" if ok_cookie else "首次运行可能弹窗")

    res["ok"] = bool(core_ok)
    return res


def update_script(port, script_id=DEFAULT_SCRIPT_ID, name_hint=SCRIPT_NAME_HINT,
                  ext_id=None, log=print, poll_times=12, poll_gap=1.5):
    """把已装脚本更新到商店最新版（与每天自动更新同一条路径）。

    返回 dict：ok / before / after / store / changed / detail
    """
    out = {"ok": False, "port": port, "before": None, "after": None,
           "store": None, "changed": False, "detail": ""}
    ext_id = ext_id or resolve_ext_id(port, log=log)
    ws = ext_page_ws(port, ext_id=ext_id, log=log)
    if not ws:
        out["detail"] = "拿不到扩展页面（扩展没加载？）"
        return out
    sess = _CdpSession(ws)
    try:
        hit, why = find_script(sess, name_hint)
        if not hit:
            out["detail"] = why
            return out
        uuid = hit.get("uuid") or ""
        before = script_ver(hit)
        out["before"] = before
        log("    · 当前：%s v%s（status=%s）" % (hit.get("name"), before, hit.get("status")))

        try:
            code, store_ver, _ = fetch_store_script(script_id)
        except Exception as e:
            out["detail"] = "取商店版本失败: %s" % e
            return out
        out["store"] = store_ver
        name_hint = meta_name(code, name_hint)
        log("    · 商店最新：v%s" % store_ver)
    finally:
        sess.close()

    # 必须开着静默更新，否则检查更新只会「标记有新版」而不安装
    ok_cfg, changed_cfg = set_silent_update(port, ext_id=ext_id, log=log)
    if ok_cfg and changed_cfg:
        reload_ext(port, ext_id, log=log)
    elif not ok_cfg:
        log("    [!] 静默更新开关未能确认，若版本不变请检查脚本猫设置")

    ws = ext_page_ws(port, ext_id=ext_id, log=log)
    if not ws:
        out["detail"] = "重载后拿不到扩展页面"
        return out
    sess = _CdpSession(ws)
    try:
        url = store_script_url(script_id, name_hint)
        ok, data = call(sess, "setCheckUpdateUrl",
                        {"uuid": uuid, "checkUpdate": True, "checkUpdateUrl": url})
        if not ok:
            log("    [!] 设置更新地址失败: %s" % str(data)[:160])
        log("    · 更新地址：%s" % url)

        log("    · 触发检查更新（system / 静默）…")
        ok, data = call(sess, "checkScriptUpdate", {"checkType": "system"}, timeout_ms=180000)
        if not ok:
            out["detail"] = "检查更新失败: %s" % str(data)[:200]
            return out

        final = before
        for i in range(poll_times):
            time.sleep(poll_gap)
            h2, _ = find_script(sess, name_hint)
            v2 = script_ver(h2) if h2 else final
            if v2 != final:
                log("    · 第 %.0fs：v%s → v%s" % ((i + 1) * poll_gap, final, v2))
                final = v2
            if final == store_ver:
                break
        out["after"] = final
        out["changed"] = (final != before)
        out["ok"] = (final == store_ver) or (final == before and before == store_ver)

        # 更新后仍要确保是启用状态
        h2, _ = find_script(sess, name_hint)
        if h2 and h2.get("status") != 1:
            enable_script(sess, h2.get("uuid") or uuid)
            log("    · 已重新启用脚本")
        if not out["ok"] and final != store_ver:
            out["detail"] = "版本没变（商店 v%s / 当前 v%s）" % (store_ver, final)
        return out
    finally:
        sess.close()


# ============================ 本地自检（起独立测试浏览器） ============================
CHROME_CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    os.path.expandvars(r"%LOCALAPPDATA%\Google\Chrome\Application\chrome.exe"),
    "/usr/bin/ungoogled-chromium", "/usr/bin/chromium", "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome", "/opt/google/chrome/chrome",
]
LOCAL_PORT = 18765


class _Srv(BaseHTTPRequestHandler):
    body = b""

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        # 扩展 SW（chrome-extension:// 属公网源）访问 127.0.0.1 会被 PNA 拦，必须显式允许
        self.send_header("Access-Control-Allow-Private-Network", "true")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(self.body)))
        self._cors()
        self.end_headers()
        self.wfile.write(self.body)

    def log_message(self, *a):
        pass


def start_local_server(code_bytes):
    _Srv.body = code_bytes
    srv = ThreadingHTTPServer(("127.0.0.1", LOCAL_PORT), _Srv)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


def bump_version(code):
    """把 @version 抬一个小版本（仅自检用，生产更新绝不改脚本内容）"""
    cur = meta_version(code)
    parts = re.findall(r"\d+", cur)
    if not parts:
        raise RuntimeError("脚本没有 @version，无法造新版")
    nums = [int(x) for x in parts]
    nums[-1] += 1
    new = ".".join(str(x) for x in nums)
    out, n = re.subn(r"(@version\s+)([0-9][\w.\-]*)", r"\g<1>" + new, code, count=1)
    if n != 1:
        raise RuntimeError("改 @version 失败")
    return new, out


def find_chrome():
    env = os.environ.get("CHROME_PATH")
    if env and os.path.exists(env):
        return env
    for p in CHROME_CANDIDATES:
        if p and os.path.exists(p):
            return p
    import shutil
    for name in ("ungoogled-chromium", "chromium", "chromium-browser",
                 "google-chrome", "google-chrome-stable", "chrome"):
        p = shutil.which(name)
        if p:
            return p
    raise SystemExit("找不到 chrome/chromium，可用环境变量 CHROME_PATH 指定")


def wait_cdp(port, timeout=40):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            v = http_json("http://127.0.0.1:%d/json/version" % port, timeout=2)
            if v.get("webSocketDebuggerUrl"):
                return v
        except Exception:
            pass
        time.sleep(0.6)
    return None


def launch_chrome(port, profile, keep=False):
    os.makedirs(profile, exist_ok=True)
    args = [
        find_chrome(),
        "--user-data-dir=%s" % profile,
        "--remote-debugging-port=%d" % port,
        # Chrome 137+ 才能通过 CDP 装未打包扩展
        "--enable-unsafe-extension-debugging",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-search-engine-choice-screen",
        "about:blank",
    ]
    flags = 0
    if keep and os.name == "nt":
        flags = 0x00000008 | 0x01000000 | 0x00000200
    try:
        proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                creationflags=flags, close_fds=True)
    except PermissionError:
        proc = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                close_fds=True)
    info = wait_cdp(port)
    if not info:
        proc.terminate()
        raise SystemExit("浏览器起来了但 CDP %d 没响应" % port)
    print("  浏览器就绪: %s" % info.get("Browser"))
    return proc, info


def self_test(args):
    """本地从零验证：装扩展 → 允许用户脚本 → 装商店脚本 → 授权 → 运行 → 验证静默更新"""
    ext_dir = args.ext or os.path.join(HERE, ".chrome-test", "sc-ext")
    if not os.path.isdir(ext_dir):
        raise SystemExit("扩展目录不存在: %s（先用 --ext 指定脚本猫解包目录）" % ext_dir)
    profile = args.profile or os.path.join(HERE, ".chrome-test", "self-profile")
    if args.fresh_profile:
        profile = "%s-%s" % (profile, time.strftime("%H%M%S"))
    port = args.port or 9333
    RESULT = []

    def step(ok, label, detail=""):
        RESULT.append((label, ok, detail))
        print("  %s %s%s" % ("✅" if ok else "❌", label, (" — " + detail) if detail else ""))

    proc = srv = None
    try:
        print("\n① 启动独立测试浏览器")
        proc, _ = launch_chrome(port, profile, keep=args.keep)

        print("\n② 安装扩展（loadUnpacked）")
        ext_id = load_unpacked(port, ext_dir) or detect_ext_id(port)
        step(bool(ext_id), "扩展已加载", "id=%s" % ext_id if ext_id else "")
        if not ext_id:
            return 1

        print("\n③ 允许用户脚本")
        step(allow_userscripts(port), "允许用户脚本")

        print("\n④ 安装商店脚本 #%s" % args.script)
        r = ensure_browser(port, ext_dir=ext_dir, script_id=args.script,
                           grant=False, log=lambda m: print(m))
        step(r["ok"], "脚本已安装并启用", "v%s" % r.get("version"))

        print("\n⑤ Cookie 永久授权")
        step(grant_cookie(port, do_run=False, ext_id=ext_id,
                          log=lambda m: print(m)), "Cookie 授权")

        print("\n⑥ 运行一次")
        step(run_script(port, ext_id=ext_id, log=lambda m: print(m)), "触发运行")
        time.sleep(5)
        ws = ext_page_ws(port, ext_id=ext_id)
        if ws:
            sess = _CdpSession(ws)
            try:
                msgs = flatten_logs(read_logs(sess, minutes=5) or [])
                cookie_msgs = [m for m in msgs if "cookie" in m.lower() or "🔑" in m]
                step(bool(cookie_msgs), "日志里看到 cookie 输出",
                     " | ".join(cookie_msgs[-2:])[:260] if cookie_msgs else "（无关键词）")
            finally:
                sess.close()

        if args.skip_update_test:
            print("\n（跳过 ⑦ 验证更新）")
        else:
            print("\n⑦ 造 +1 版本验证静默更新")
            code, store_ver, _ = fetch_store_script(args.script)
            name = meta_name(code)
            new_ver, code2 = bump_version(code)
            srv = start_local_server(code2.encode("utf-8"))
            local_url = "http://127.0.0.1:%d/self.user.js" % LOCAL_PORT
            ws = ext_page_ws(port, ext_id=ext_id)
            sess = _CdpSession(ws)
            try:
                hit, _ = find_script(sess, name)
                uuid = (hit or {}).get("uuid") or r.get("uuid")
                call(sess, "setCheckUpdateUrl",
                     {"uuid": uuid, "checkUpdate": True, "checkUpdateUrl": local_url})
                call(sess, "checkScriptUpdate", {"checkType": "system"}, timeout_ms=180000)
                ver2 = store_ver
                for _ in range(10):
                    time.sleep(1.5)
                    h2, _ = find_script(sess, name)
                    ver2 = script_ver(h2)
                    if ver2 == new_ver:
                        break
                step(ver2 == new_ver, "静默更新生效", "v%s → v%s" % (store_ver, ver2))
                # 收尾：把 profile 还原成「商店地址 + 商店最新版」
                call(sess, "setCheckUpdateUrl",
                     {"uuid": uuid, "checkUpdate": True,
                      "checkUpdateUrl": store_script_url(args.script, name)})
                call(sess, "installByCode", {"uuid": uuid, "code": code, "upsertBy": "user"},
                     timeout_ms=180000)
                call(sess, "enables", {"uuids": [uuid], "enable": True})
                step(True, "还原为商店最新版", "v%s" % store_ver)
            finally:
                sess.close()
    finally:
        if srv:
            srv.shutdown()
        bad = [x for x in RESULT if not x[1]]
        print("\n" + "=" * 60)
        print("全部通过 ✅" if not bad else "有 %d 项未通过 ❌" % len(bad))
        if proc and not args.keep:
            proc.terminate()
        elif proc:
            print("浏览器保持运行：CDP %d，profile=%s" % (port, profile))
    return 0 if not [x for x in RESULT if not x[1]] else 1


# ============================ 命令行 ============================
def main():
    ap = argparse.ArgumentParser(
        description="脚本猫扩展 + 商店脚本 一键安装/更新（CDP，无需 GUI）",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("port_arg", nargs="?", type=int, metavar="PORT",
                    help="单个 CDP 端口（如 9222）")
    ap.add_argument("--port", type=int, help="同位置参数，指定 CDP 端口")
    ap.add_argument("--install", "--bootstrap", dest="install", action="store_true",
                    help="给浏览器装扩展 + 商店脚本 + Cookie 授权（新用户用）")
    ap.add_argument("--update", action="store_true", help="手动更新脚本到商店最新版")
    ap.add_argument("--status", action="store_true", help="只看已装脚本版本")
    ap.add_argument("--allow-userscripts", action="store_true", help="只开「允许用户脚本」")
    ap.add_argument("--grant-cookie", action="store_true", help="只写 Cookie 永久授权")
    ap.add_argument("--self-test", action="store_true", help="本地起独立浏览器跑全流程验证")
    ap.add_argument("--script", default=DEFAULT_SCRIPT_ID, help="商店脚本 ID（默认 %s）" % DEFAULT_SCRIPT_ID)
    ap.add_argument("--name", default="", help="已装脚本名片段（默认「%s」）" % SCRIPT_NAME_HINT)
    ap.add_argument("--ext", default="", help="脚本猫解包扩展目录（自动安装扩展时用）")
    ap.add_argument("--user-dir", default="", help="浏览器 profile 目录（用于从 Preferences 认扩展 ID）")
    ap.add_argument("--hosts", default="", help="Cookie 域名清单，逗号分隔")
    ap.add_argument("--run", action="store_true", help="授权后让脚本跑一次")
    ap.add_argument("--profile", default="", help="自检用 profile 目录")
    ap.add_argument("--fresh-profile", action="store_true", help="自检用全新 profile 目录")
    ap.add_argument("--skip-update-test", action="store_true", help="自检跳过「验证更新」")
    ap.add_argument("--keep", action="store_true", help="自检结束后不关浏览器")

    args = ap.parse_args()
    # 位置参数与 --port 共用同一个含义；argparse 里不能同名（位置参数的默认值
    # 会把 --port 的值覆盖成 None），所以这里合并一次。
    args.port = args.port or args.port_arg
    name_hint = args.name or SCRIPT_NAME_HINT
    hosts = [h.strip() for h in (args.hosts or "").split(",") if h.strip()] or None
    ext_dir = args.ext or None

    if args.self_test:
        return self_test(args)

    ports = [(args.port, "指定端口")] if args.port else ACCOUNTS

    if args.allow_userscripts:
        ok_all = True
        for port, name in ports:
            print("\n=== %s / CDP %d — 允许用户脚本 ===" % (name, port))
            ok_all = allow_userscripts(port) and ok_all
        return 0 if ok_all else 1

    if args.grant_cookie:
        ok_all = True
        for port, name in ports:
            print("\n=== %s / CDP %d — Cookie 授权 ===" % (name, port))
            eid = resolve_ext_id(port, ext_dir=ext_dir, user_dir=args.user_dir or None)
            ok_all = grant_cookie(port, hosts=hosts, do_run=args.run, ext_id=eid,
                                  name_hint=name_hint) and ok_all
        return 0 if ok_all else 1

    if args.status:
        ok_all = True
        for port, name in ports:
            try:
                eid = resolve_ext_id(port, ext_dir=ext_dir, user_dir=args.user_dir or None)
                r = get_status(port, name_hint=name_hint, ext_id=eid)
            except Exception as e:
                print("  %-6s CDP %-5d  ❌ 连不上：%s" % (name, port, e))
                ok_all = False
                continue
            if r["ok"]:
                print("  %-6s CDP %-5d  %s v%s  status=%s" % (
                    name, port, r["name"], r["version"], r["status"]))
            else:
                print("  %-6s CDP %-5d  ❌ %s" % (name, port, r["detail"]))
                ok_all = False
        return 0 if ok_all else 1

    if args.install:
        ok_all = True
        for port, name in ports:
            print("\n=== %s / CDP %d — 安装扩展 + 脚本 ===" % (name, port))
            r = ensure_browser(port, ext_dir=ext_dir, user_dir=args.user_dir or None,
                               script_id=args.script, name_hint=name_hint,
                               grant=True, run=args.run, hosts=hosts)
            print("  → %s（扩展 %s，脚本 v%s）" % (
                "OK" if r["ok"] else "未完成", r.get("ext_id"), r.get("version")))
            ok_all = r["ok"] and ok_all
        return 0 if ok_all else 1

    # 默认 / --update：触发更新（只处理正在运行的浏览器；要拉起浏览器请用 zy.py --update-script）
    ok_all = True
    for port, name in ports:
        print("\n=== %s / CDP %d — 检查更新 ===" % (name, port))
        try:
            list_targets(port)
        except Exception as e:
            print("  [!] 连不上 CDP %d：%s（浏览器没运行？）" % (port, e))
            ok_all = False
            continue
        eid = resolve_ext_id(port, ext_dir=ext_dir, user_dir=args.user_dir or None)
        r = update_script(port, script_id=args.script, name_hint=name_hint, ext_id=eid)
        if r["ok"]:
            print("  ✅ v%s → v%s（商店 v%s）%s" % (
                r["before"], r["after"], r["store"], "" if r["changed"] else " 已是最新"))
        else:
            print("  ❌ %s（v%s → v%s，商店 v%s）" % (
                r["detail"], r["before"], r["after"], r["store"]))
            ok_all = False
    return 0 if ok_all else 1


if __name__ == "__main__":
    sys.exit(main())
