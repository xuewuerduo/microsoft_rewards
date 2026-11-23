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
import atexit
import base64
import hashlib
import json
import os
import re
import shutil
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, quote

# ============================ 常量 ============================
DEFAULT_SCRIPT_ID = "6006"                 # scriptcat 商店脚本 ID：微软积分（优化版）
SCRIPT_NAME_HINT = "微软积分"               # 用来从已装脚本列表里认出目标脚本


# 端口表由 zy.py 从 BING_ACCOUNTS 派生后发布，是被调工具唯一的账号真相源。
# sc_deploy 自己不维护任何账号表：账号从哪来、几个、端口多少，一律问端口表。
PORT_MAP_FILES = [p for p in (
    os.getenv("PORT_MAP_FILE", "/app/data/zy-ports.json"),
    "/usr/share/novnc/zy-ports.json",
) if p]


def _ports_from_map():
    """从 zy.py 发布的 zy-ports.json 读 (端口, 账号名) 列表。

    主流程里 zy.py 直接按 port 调用本模块的函数，根本用不到账号名；
    这里只服务于「不带 --port 的命令行批量模式」。读不到返回空列表，
    由调用方提示先跑 zy.py 或用 --port 显式指定，绝不回退到写死账号。"""
    for path in PORT_MAP_FILES:
        try:
            with open(path, "r", encoding="utf-8") as f:
                accounts = (json.load(f) or {}).get("accounts", {})
            out = []
            for name, info in accounts.items():
                try:
                    out.append((int(info["port"]), str(name)))
                except (KeyError, TypeError, ValueError):
                    continue
            if out:
                return sorted(out)
        except Exception:
            continue
    return []

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


def _runtime_has_ext(port, ext_id, log=None):
    """用 developerPrivate 确认 ext_id 在浏览器运行时真的存在。

    克隆 profile 的 Preferences 会残留脚本猫 ID，但扩展文件没跟过来/被禁用，
    运行时其实没有这个扩展；直接信 Preferences 会造成「假就绪」并跳过 loadUnpacked。
    detect_ext_id 已经打开 chrome://extensions 页面，这里复用它。
    """
    log = log or (lambda *a, **k: None)
    try:
        for t in list_targets(port):
            if (t.get("url") or "").startswith("chrome://extensions") and t.get("webSocketDebuggerUrl"):
                sess = _CdpSession(t["webSocketDebuggerUrl"])
                try:
                    js = ("(function(){return new Promise(function(res){"
                          "try{chrome.developerPrivate.getExtensionsInfo({includeDisabled:true},function(l){"
                          "res(JSON.stringify((l||[]).some(function(e){return e.id===%s;})));"
                          "});}catch(e){res('false');}});})()" % json.dumps(str(ext_id)))
                    raw = sess.evaluate(js, timeout=15)
                    try:
                        return bool(json.loads(raw)) if isinstance(raw, str) else bool(raw)
                    except Exception:
                        return str(raw).strip().strip('"').lower() == "true"
                finally:
                    sess.close()
    except Exception as e:
        log("    [!] 校验扩展运行时存在性失败: %s" % e)
    return False


def resolve_ext_id(port, ext_dir=None, user_dir=None, log=None, guess=True):
    """按可靠性顺序认扩展 ID：运行时 → Preferences → 路径哈希。

    运行时（chrome://extensions）优先是关键：克隆 profile 的 Preferences 会残留
    脚本猫 ID 但扩展没真正加载，若以它为准就会「假就绪」、跳过 loadUnpacked，
    后续「允许用户脚本 / 扩展页面」全失败（marvin-1 新账号即此症状）。
    guess=False 时不做「路径哈希」猜测，避免猜对 ID 却没加载的假成功。
    """
    eid = detect_ext_id(port, log=log)
    if eid:
        return eid
    eid = ext_id_from_prefs(user_dir)
    if eid and _runtime_has_ext(port, eid, log=log):
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


def _ver_cmp(a, b):
    """比较两个版本号：a<b 返回 -1，相等 0，a>b 返回 1；有解析不出来的返回 None。
    "1.4" 与 "1.4.0" 视为相等（缺位补 0），否则会被误判成「落后」。"""
    ta, tb = _ver_tuple(a), _ver_tuple(b)
    if ta is None or tb is None:
        return None
    n = max(len(ta), len(tb))
    ta = ta + (0,) * (n - len(ta))
    tb = tb + (0,) * (n - len(tb))
    return (ta > tb) - (ta < tb)


# ═══════════════ 线上最新版（脚本猫官方发布源）═══════════════
# 为什么必须有这一段：
#   旧逻辑只比对「浏览器里已装版本 vs 磁盘解包目录版本」。容器镜像里带的解包目录
#   本身就是 1.4.0，两份都是 1.4.0 → 永远得出「已是最新 v1.4.0」，而线上早就 1.5.2。
#   等于拿本地副本当标尺自我确认，判断不出落后。线上最新版必须去发布源查。
SC_EXT_REPO = (os.getenv("SC_EXT_REPO", "scriptscat/scriptcat") or "scriptscat/scriptcat").strip()
SC_EXT_LATEST_TTL = int(os.getenv("SC_EXT_LATEST_TTL", "1800"))       # 缓存 30 分钟
SC_EXT_AUTOINSTALL = (os.getenv("SC_EXT_AUTOINSTALL", "1").strip().lower()
                      not in ("0", "false", "no", "off"))
SC_EXT_PKG_MAX = 200 * 1024 * 1024

_EXT_LATEST_MEM = {"at": 0.0, "data": None}
_EXT_LATEST_LOCK = threading.Lock()


def _ext_latest_cache_file():
    try:
        return os.path.join(HERE, ".sc-ext-latest.json")
    except Exception:
        return ""


def _ext_latest_cache_read():
    p = _ext_latest_cache_file()
    if not p or not os.path.exists(p):
        return None
    try:
        with open(p, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) and d.get("version") else None
    except Exception:
        return None


def _ext_latest_cache_write(d):
    p = _ext_latest_cache_file()
    if not p:
        return
    try:
        tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False)
        os.replace(tmp, p)
    except Exception:
        pass          # 缓存写不进去（只读挂载）不影响功能


def _http_get(url, timeout=20, limit=None):
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "application/vnd.github+json, application/octet-stream, */*",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        if limit:
            data = r.read(limit)
        else:
            data = r.read()
    return data


# ── GitHub 下载加速站 ─────────────────────────────────────────
# 容器在国内出口直连 github.com 下载 5MB 的扩展包经常超时/断流，走加速站稳得多。
# 用法是把原地址整体拼在前缀后面：https://ghfast.top/https://github.com/...
# 配置：SC_EXT_MIRROR="前缀1,前缀2,..."；置空或 off 则只直连。
SC_EXT_MIRROR = os.getenv(
    "SC_EXT_MIRROR",
    "https://ghfast.top/,https://ghproxy.net/,https://gh-proxy.com/",
).strip()


def _ext_mirrors():
    if SC_EXT_MIRROR.lower() in ("", "0", "off", "none", "false", "no"):
        return []
    out = []
    for s in re.split(r"[,;\s]+", SC_EXT_MIRROR):
        s = s.strip()
        if not s:
            continue
        out.append(s if s.endswith("/") else s + "/")
    return out


def _mirror_urls(url):
    """GitHub 资产地址 → [加速站地址..., 原始地址]。非 GitHub 域名不加前缀。"""
    u = str(url or "")
    if not u:
        return []
    is_gh = u.startswith("https://github.com/") or "githubusercontent.com" in u
    if not is_gh:
        return [u]
    return [m + u for m in _ext_mirrors()] + [u]


def _download_file(url, dest, timeout=90, limit=SC_EXT_PKG_MAX, log=None, validator=None):
    """下载 GitHub 资产：先走加速站，失败再直连。返回 (ok, used_url, msg)。"""
    cands = _mirror_urls(url)
    if not cands:
        return False, "", "没有可用的下载地址"
    last = ""
    for u in cands:
        host = urllib.parse.urlparse(u).netloc or u
        try:
            data = _http_get(u, timeout=timeout, limit=limit)
            if not data:
                last = "空响应"
                raise ValueError(last)
            with open(dest, "wb") as f:
                f.write(data)
            if validator and not validator(dest):
                last = "内容校验未通过（可能是加速站错误页）"
                raise ValueError(last)
            if log:
                log("    · 下载通道：%s（%.1f MB）"
                    % ("直连 GitHub" if u == url else host, len(data) / 1048576.0))
            return True, u, ""
        except Exception as e:
            last = "%s: %s" % (type(e).__name__, e)
            if log:
                log("    · 通道 %s 不可用（%s），换下一个…" % (host, last))
    return False, "", last or "全部通道失败"


_PKG_LOCK = threading.Lock()
_PKG_CACHE = {}          # 下载地址 → 本地包路径（同一进程 4 个账号只下 1 次）
_PKG_DIR = []


def _pkg_cache_dir():
    if not _PKG_DIR:
        d = tempfile.mkdtemp(prefix="sc-ext-pkg-")
        _PKG_DIR.append(d)

        def _clean():
            try:
                shutil.rmtree(d, ignore_errors=True)
            except Exception:
                pass
        atexit.register(_clean)
    return _PKG_DIR[0]


def prefetch_ext_zip(zip_url, timeout=180, log=None):
    """预热安装包：后台把官方 chrome.zip 下到进程内缓存，只下不下装。

    用来把 5MB 的下载摊到「部署第 2~4 个账号」那几十秒里 —— 等真正要装的时候
    `_shared_pkg()` 命中缓存，解包 + reload 只要几秒。
    失败不抛：下载失败时安装阶段会照常再试一次。
    """
    if not zip_url:
        return False
    try:
        p, _msg = _shared_pkg(zip_url, timeout=timeout, log=log)
        return bool(p)
    except Exception:
        return False


def _shared_pkg(url, timeout=180, log=None):
    """同一进程内多个账号共用一个安装包：第一个人下载，其余等它下完直接用。

    4 个账号并发校准时若各下 5MB，既慢又容易被加速站限速/断流。
    返回 (本地路径, 错误信息)。
    """
    with _PKG_LOCK:
        p = _PKG_CACHE.get(url)
        if p and os.path.exists(p):
            if log:
                log("    · 复用已下载的安装包（其他账号刚下完）")
            return p, ""
        path = os.path.join(_pkg_cache_dir(), "pkg.zip")
        good, _u, msg = _download_file(url, path, timeout=timeout,
                                       validator=zipfile.is_zipfile, log=log)
        if not good:
            try:
                if os.path.exists(path):
                    os.remove(path)
            except Exception:
                pass
            return "", msg
        _PKG_CACHE[url] = path
        return path, ""


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    """不跟随 3xx：只为读 Location（releases/latest 指向的 tag）。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _http_location(url, timeout=15):
    """返回 3xx 的 Location（不跟随跳转）；取不到返回空串。"""
    import urllib.error
    opener = urllib.request.build_opener(_NoRedirect)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        opener.open(req, timeout=timeout).close()
        return ""
    except urllib.error.HTTPError as e:
        if 300 <= int(e.code) < 400:
            return str(e.headers.get("Location") or "")
        raise


def _url_ok(url, timeout=10):
    """HEAD 探一下资产地址是否真的存在（只是挑名字，不下载内容）。"""
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return 200 <= int(getattr(r, "status", 0) or 0) < 300
    except Exception:
        return False


def _gh_release_by_redirect(timeout=20, log=None):
    """api.github.com 不通时的兜底：用网页跳转拿最新 tag + 真实资产名。

    容器在国内出口经常拿不到 api.github.com（Cloudflare 403 / 限流），
    但 github.com 的网页跳转通常能过：
      /releases/latest                → 302 → /releases/tag/v1.5.2
      /releases/expanded_assets/<tag> → HTML 里列出真实资产名
                                        （scriptcat-1.5.2-chrome.zip，别猜，猜错就 404）
    返回和 ext_latest 同样的结构；失败抛异常由调用方接。
    """
    loc = _http_location("https://github.com/%s/releases/latest" % SC_EXT_REPO,
                         timeout=timeout)
    m = re.search(r"/releases/tag/([^/?#]+)", loc or "")
    if not m:
        raise ValueError("releases/latest 没有跳到 tag（Location=%r）" % (loc or ""))
    tag = urllib.parse.unquote(m.group(1))
    vt = _ver_tuple(tag)
    if not vt:
        raise ValueError("tag 版本号解析失败：%r" % tag)
    ver = ".".join(str(x) for x in vt)
    base = "https://github.com/%s/releases/download/%s/" % (SC_EXT_REPO, tag)
    zip_url = crx_url = ""
    try:
        html = _http_get("https://github.com/%s/releases/expanded_assets/%s"
                         % (SC_EXT_REPO, quote(tag, safe="")),
                         timeout=timeout).decode("utf-8", "replace")
        for n in re.findall(r'href="[^"]*?/([^"/]+\.(?:zip|crx))"', html):
            low = n.lower()
            if low.endswith(".zip") and "chrome" in low and not zip_url:
                zip_url = base + n
            elif low.endswith(".crx") and "chrome" in low and not crx_url:
                crx_url = base + n
    except Exception:
        pass
    if not zip_url:
        # 官方资产名带 v 前缀（实测 scriptcat-v1.5.2-chrome.zip），但不保证永远如此：
        # 先试带 v，再试不带 v，能 HEAD 通的才用，避免拿着一个 404 去下载。
        for cand in ("scriptcat-v%s-chrome.zip" % ver, "scriptcat-%s-chrome.zip" % ver):
            if _url_ok(base + cand, timeout=timeout):
                zip_url = base + cand
                break
    if not zip_url:
        zip_url = base + "scriptcat-v%s-chrome.zip" % ver
    if not crx_url:
        crx_url = base + "scriptcat-v%s-chrome.crx" % ver
    if log:
        log("    · 用 github.com 跳转拿到最新版：%s → %s" % (tag, os.path.basename(zip_url)))
    return {"version": ver, "tag": tag, "zip": zip_url, "crx": crx_url,
            "source": "github-web", "at": time.time()}


def ext_latest(force=False, timeout=20, log=None):
    """查脚本猫「线上最新版」。

    返回 {version, tag, zip, crx, source, at, stale}；查不到返回 {}。
    来源：GitHub Releases（官方 CI 发布，含 scriptcat-<ver>-chrome.zip / .crx）。
    缓存：进程内 + 落盘，默认 30 分钟 —— 4 个账号共用一个结果，避免被 API 限流。
    网络失败时退回过期的落盘缓存（标 stale=True），总比没有标尺好。
    """
    now = time.time()
    t_enter = now          # 进入时刻：等锁期间别人查回来的结果，即使 force 也直接复用
    with _EXT_LATEST_LOCK:
        mem = _EXT_LATEST_MEM
        if mem["data"] and (mem["at"] >= t_enter
                            or ((not force) and now - mem["at"] < SC_EXT_LATEST_TTL)):
            return dict(mem["data"])

    disk = _ext_latest_cache_read()
    if (not force) and disk and time.time() - float(disk.get("at") or 0) < SC_EXT_LATEST_TTL:
        with _EXT_LATEST_LOCK:
            _EXT_LATEST_MEM["data"], _EXT_LATEST_MEM["at"] = disk, time.time()
        return dict(disk)

    # 整个查询 HTTP 过程都放在锁里：4 个账号是并发线程，不串起来会同时打 4 次 API
    # （GitHub 未认证限流 60 次/小时/IP）。等锁的线程回来后再做一次缓存复查。
    with _EXT_LATEST_LOCK:
        mem = _EXT_LATEST_MEM
        if mem["data"] and mem["at"] >= t_enter:
            return dict(mem["data"])
        now = time.time()
        url = "https://api.github.com/repos/%s/releases/latest" % SC_EXT_REPO
        try:
            raw = _http_get(url, timeout=timeout)
            d = json.loads(raw.decode("utf-8", "replace"))
            tag = str(d.get("tag_name") or d.get("name") or "")
            vt = _ver_tuple(tag)
            if not vt:
                raise ValueError("发布版本号解析失败：%r" % tag)
            zip_url = crx_url = ""
            for a in d.get("assets") or []:
                name = str(a.get("name") or "").lower()
                u = str(a.get("browser_download_url") or "")
                if not u:
                    continue
                if name.endswith(".zip") and "chrome" in name and not zip_url:
                    zip_url = u
                elif name.endswith(".crx") and "chrome" in name and not crx_url:
                    crx_url = u
            data = {"version": ".".join(str(x) for x in vt), "tag": tag,
                    "zip": zip_url, "crx": crx_url, "source": "github", "at": now}
            _ext_latest_cache_write(data)
            _EXT_LATEST_MEM["data"], _EXT_LATEST_MEM["at"] = dict(data), now
            return data
        except Exception as e:
            if log:
                log("    [!] api.github.com 查最新版失败（%s）：%s" % (SC_EXT_REPO, e))
            # 通道 2：github.com 网页跳转。容器在国内出口经常拿不到 api（Cloudflare
            # 403 / 未认证限流 60 次/小时/IP），但网页跳转基本能过 —— 只拿 tag 和资产名，
            # 不消耗 API 配额。这条通道不通时才认为「真的查不到」。
            try:
                data = _gh_release_by_redirect(timeout=timeout, log=log)
                _ext_latest_cache_write(data)
                _EXT_LATEST_MEM["data"], _EXT_LATEST_MEM["at"] = dict(data), now
                return data
            except Exception as e2:
                if log:
                    log("    [!] github.com 网页兜底也失败：%s" % e2)
            # 通道 3：显式钉版本（两条网络都废时用，SC_EXT_WANT_VERSION=1.5.2）
            want = (os.getenv("SC_EXT_WANT_VERSION", "") or "").strip()
            if want and _ver_tuple(want):
                ver = ".".join(str(x) for x in _ver_tuple(want))
                data = {
                    "version": ver, "tag": "v" + ver,
                    "zip": "https://github.com/%s/releases/download/v%s/scriptcat-v%s-chrome.zip"
                           % (SC_EXT_REPO, ver, ver),
                    "crx": "https://github.com/%s/releases/download/v%s/scriptcat-v%s-chrome.crx"
                           % (SC_EXT_REPO, ver, ver),
                    "source": "env", "at": now,
                }
                if log:
                    log("    · 两条通道都不通，按 SC_EXT_WANT_VERSION 指定 v%s" % ver)
                _EXT_LATEST_MEM["data"], _EXT_LATEST_MEM["at"] = dict(data), now
                return data
            cached = disk or _ext_latest_cache_read()
            if cached:
                cached = dict(cached)
                cached["stale"] = True
                if log:
                    log("    · 用上次查到的线上版本 v%s（已过期，仅供参考）"
                        % cached.get("version"))
                _EXT_LATEST_MEM["data"], _EXT_LATEST_MEM["at"] = cached, now
                return cached
            return {}


def _zip_prefix(zf):
    """压缩包里 manifest.json 的前缀目录（官方包通常多套一层同名目录，也可能直接在根）。"""
    names = [n.replace("\\", "/") for n in zf.namelist()]
    cands = [n for n in names if n == "manifest.json" or n.endswith("/manifest.json")]
    if not cands:
        return None
    best = min(cands, key=len)
    return best[:-len("manifest.json")]        # 末尾带 "/" 或空串


def _safe_extract(zf, dest, prefix):
    base = os.path.abspath(dest)
    for m in zf.infolist():
        name = m.filename.replace("\\", "/")
        if prefix:
            if not name.startswith(prefix):
                continue
            name = name[len(prefix):]
        name = name.strip("/")
        if not name:
            continue
        parts = name.split("/")
        if name.startswith("/") or ".." in parts:
            raise ValueError("压缩包含非法路径：%s" % m.filename)
        out = os.path.join(base, *parts)
        if not os.path.abspath(out).startswith(base):
            raise ValueError("压缩包含非法路径：%s" % m.filename)
        if m.is_dir():
            os.makedirs(out, exist_ok=True)
            continue
        os.makedirs(os.path.dirname(out) or base, exist_ok=True)
        with zf.open(m) as src, open(out, "wb") as dst:
            shutil.copyfileobj(src, dst)


_EXT_DIR_LOCKS = {}
_EXT_DIR_LOCKS_GUARD = threading.Lock()


def _ext_dir_lock(ext_dir):
    """同一个解包目录一把锁：4 个账号共用一份目录，不能同时解包（会互相覆盖）。"""
    key = os.path.abspath(ext_dir or "")
    with _EXT_DIR_LOCKS_GUARD:
        lk = _EXT_DIR_LOCKS.get(key)
        if lk is None:
            lk = threading.Lock()
            _EXT_DIR_LOCKS[key] = lk
        return lk


def install_ext_zip(ext_dir, zip_url, want_ver="", log=print, timeout=180):
    """下载官方 chrome.zip 覆盖解包扩展目录。返回 (ok, msg)。

    并发：4 个账号指向同一个解包目录，只让第一个真解包，其余账号拿到「已就绪」，
    各自去 reload 自己的浏览器（每个浏览器进程要单独 reload 才读新文件）。
    """
    if not ext_dir:
        return False, "没有解包扩展目录"
    with _ext_dir_lock(ext_dir):
        cur = disk_ext_version(ext_dir)
        if want_ver and cur and _ver_cmp(cur, want_ver) == 0:
            if log:
                log("    · 扩展目录已是 v%s（另一个账号刚装完），跳过重复解包" % cur)
            return True, ""
        return _install_ext_zip_locked(ext_dir, zip_url, want_ver, log, timeout)


def _install_ext_zip_locked(ext_dir, zip_url, want_ver="", log=print, timeout=180):
    """install_ext_zip 的实做（调用方必须持有 _ext_dir_lock）。"""
    if not ext_dir:
        return False, "没有解包扩展目录"
    if not zip_url:
        return False, "官方包没有 chrome.zip 资产"
    parent = os.path.dirname(os.path.abspath(ext_dir)) or "."
    if not os.path.isdir(parent):
        return False, "扩展目录的上级目录不存在：%s" % parent
    try:                       # 真实写一次探测：os.access 在只读挂载 / Windows 上都不准
        fd, probe = tempfile.mkstemp(prefix=".sc-w-", dir=parent)
        os.close(fd)
        os.remove(probe)
    except Exception:
        return False, ("扩展目录所在路径不可写：%s（镜像只读？把 SC_EXT_DIR 指到可写目录）"
                       % parent)

    pkg = ""
    tmp_new = ""
    try:
        pkg, dmsg = _shared_pkg(zip_url, timeout=timeout, log=log)
        if not pkg:
            return False, "下载失败（%s）" % dmsg

        # 先确保目录存在：原方案靠 rename 创建，改成原地换内容后要自己建。
        if not os.path.isdir(ext_dir):
            os.makedirs(ext_dir, exist_ok=True)

        with zipfile.ZipFile(pkg) as zf:
            prefix = _zip_prefix(zf)
            if prefix is None:
                return False, "官方包里找不到 manifest.json"
            try:
                mf = json.loads(zf.read(prefix + "manifest.json").decode("utf-8", "replace")) or {}
            except Exception:
                mf = {}
            ver = str(mf.get("version") or "")
            if want_ver and _ver_cmp(ver, want_ver) not in (0, 1):
                return False, "包内版本 v%s 与线上最新 v%s 不符（包里没有新版？）" % (ver or "?", want_ver)

            # 新内容解到 ext_dir **内部**的临时目录：见下面的注释，必须同设备。
            stamp = int(time.time())
            tmp_new = os.path.join(os.path.abspath(ext_dir), ".sc-new-%d" % stamp)
            if os.path.exists(tmp_new):
                shutil.rmtree(tmp_new, ignore_errors=True)
            os.makedirs(tmp_new, exist_ok=True)
            _safe_extract(zf, tmp_new, prefix)
            if not os.path.exists(os.path.join(tmp_new, "manifest.json")):
                return False, "解包后没有 manifest.json"

        ok, msg = _swap_ext_dir(ext_dir, tmp_new, ver, log=log)
        if ok:
            tmp_new = ""          # 已被消费掉
        return ok, msg
    except Exception as e:
        return False, "%s: %s" % (type(e).__name__, e)
    finally:
        # 安装包是进程内共享的（其他账号可能还要用），由 atexit 统一清理
        try:
            if tmp_new and os.path.exists(tmp_new):
                shutil.rmtree(tmp_new, ignore_errors=True)
        except Exception:
            pass
        # 只留最近一份备份，避免容器里越堆越多
        try:
            base = os.path.basename(ext_dir) + ".bak-"
            sibs = sorted([d for d in os.listdir(parent) if d.startswith(base)],
                          reverse=True)
            for d in sibs[1:]:
                shutil.rmtree(os.path.join(parent, d), ignore_errors=True)
        except Exception:
            pass


def _mv(src, dst):
    """同设备用 rename（瞬时）；万一跨设备（EXDEV）退化成 copy+delete。

    正常路径下 ext_dir 内部的移动都是同设备；这条兜底只针对
    「ext_dir 里某个子目录自己又是一个挂载点」这种极端情况。
    """
    try:
        os.rename(src, dst)
    except OSError as e:
        if getattr(e, "errno", None) != 18:      # 18 = EXDEV
            raise
        shutil.move(src, dst)


def _swap_ext_dir(ext_dir, tmp_new, ver="", log=print):
    """把 ext_dir 里的旧内容换成 tmp_new 里的新内容（**不 rename ext_dir 本身**）。

    为什么不能整体换目录：容器里 `/app/extensions/scriptcat` 常常是单独挂载的卷
    （docker volume / bind mount），它和上级 `/app/extensions` 不在同一设备上，
    `os.rename(ext_dir, "<ext_dir>.bak-xxx")` 会直接失败：

        OSError: [Errno 18] Cross-device link:
        '/app/extensions/scriptcat' -> '/app/extensions/scriptcat.bak-1795358656'

    线上 22:44:16 四个账号全撞这个错，扩展一直升不上去（下载明明成功了）。
    改成就地换内容：旧内容挪到 `ext_dir/.sc-old-<ts>`、新内容从 `ext_dir/.sc-new-<ts>`
    挪进来 —— 所有 rename 都在 ext_dir 内部完成，同一设备，绝不会 EXDEV。
    任一步失败都把旧内容挪回去，目录不会变成半截状态。
    """
    ext_dir = os.path.abspath(ext_dir)
    stamp = int(time.time())
    olddir = os.path.join(ext_dir, ".sc-old-%d" % stamp)
    keep = {os.path.basename(tmp_new), os.path.basename(olddir)}

    # 上次中断遗留的临时目录先清掉（Chrome 只认 manifest.json，多几个隐藏目录无害，
    # 但攒着占空间、也会拖慢目录遍历）
    for d in os.listdir(ext_dir):
        if d.startswith(".sc-new-") or d.startswith(".sc-old-"):
            if d != os.path.basename(tmp_new):
                shutil.rmtree(os.path.join(ext_dir, d), ignore_errors=True)

    old_ver = disk_ext_version(ext_dir) or "?"
    os.makedirs(olddir, exist_ok=True)
    moved = []
    try:
        for item in os.listdir(ext_dir):
            if item in keep:
                continue
            _mv(os.path.join(ext_dir, item), os.path.join(olddir, item))
            moved.append(item)
        new_items = [i for i in os.listdir(tmp_new)]
        for item in new_items:
            _mv(os.path.join(tmp_new, item), os.path.join(ext_dir, item))
    except Exception:
        # 回滚：清掉已经搬进来的新文件，再把旧的搬回去
        for item in os.listdir(ext_dir):
            if item in keep:
                continue
            p = os.path.join(ext_dir, item)
            try:
                shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
            except Exception:
                pass
        for item in moved:
            try:
                _mv(os.path.join(olddir, item), os.path.join(ext_dir, item))
            except Exception:
                pass
        shutil.rmtree(olddir, ignore_errors=True)
        raise

    try:
        os.rmdir(tmp_new)
    except Exception:
        shutil.rmtree(tmp_new, ignore_errors=True)
    shutil.rmtree(olddir, ignore_errors=True)
    if log:
        log("    · 已覆盖解包目录（就地替换，不移动挂载点）：v%s → v%s"
            % (old_ver, disk_ext_version(ext_dir) or ver or "?"))
    return True, ver


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


def _wait_ext_version(port, ext_id, want="", tries=6, gap=1.5, log=None):
    """reload / 商店更新后轮询等版本落定（Chrome 更新是异步的，立刻读常常还是旧值）。"""
    cur = ""
    for i in range(max(1, tries)):
        cur = str(ext_info(port, ext_id, log=log).get("version") or "")
        if cur and (not want or _ver_cmp(cur, want) in (0, 1)):
            return cur
        time.sleep(gap)
    return cur


def prepare_ext_dir(ext_dir, log=print, force=True, timeout=180):
    """启动预检：把「本地解包目录」直接对齐到 GitHub 最新版 —— **不涉及任何浏览器**。

    与 ensure_ext_current 的分工（2026-11-22 起的两段式）：
      · 本函数（第一段，浏览器还没起来）：查线上最新 → 本地目录落后就走加速站
        下载 chrome.zip、就地解包覆盖。/app/extensions/scriptcat 是挂载点，
        覆盖走 _swap_ext_dir（不 rename 目录本身，不会 EXDEV）。
      · _ext_sync_local / ensure_ext_current（第二段，浏览器已起来）：只把「已装版本」
        对齐到这份本地目录，reload 一次即可。

    这样做的原因：以前是「谁先起来谁去 GitHub 查 + 顺手下 5MB」，4 个账号各查一遍、
    下载挤在开跑前后（实测下载 22~65 秒），日志里「提示升级」要等到 100 秒后才出现。

    返回 {ok, changed, before, after, latest, verified, zip, stale, note}
    ok=True 表示「本地目录现在就是线上最新（或比线上更新）」；查不到线上版本时
    ok 只代表「本地目录可用」，verified=False —— 调用方不许据此说「已是最新」。
    """
    res = {"ok": False, "changed": False, "before": "", "after": "", "latest": "",
           "verified": False, "zip": "", "stale": False, "note": ""}
    if not ext_dir:
        res["note"] = "没有解包扩展目录"
        return res
    before = disk_ext_version(ext_dir)
    res["before"] = res["after"] = before

    latest = ext_latest(force=force, log=log) or {}
    lv = str(latest.get("version") or "")
    res["latest"] = lv
    res["zip"] = str(latest.get("zip") or "")
    res["stale"] = bool(latest.get("stale"))
    res["verified"] = bool(lv) and not res["stale"]
    if not lv:
        res["note"] = "线上最新版没取到（网络/发布源不可用）"
        res["ok"] = bool(before)
        return res

    cmp = _ver_cmp(before, lv) if before else -1
    if cmp is not None and cmp >= 0:
        res["ok"] = True
        if cmp == 1:
            res["note"] = "本地 v%s 比线上 v%s 新（本地开发版），保留" % (before, lv)
        return res

    if not res["zip"]:
        res["note"] = "线上最新 v%s 没有 chrome.zip 资产" % lv
        return res
    if not SC_EXT_AUTOINSTALL:
        res["note"] = "SC_EXT_AUTOINSTALL 已关闭，不自动下载"
        return res

    log("    · 本地 v%s → 线上最新 v%s，开始下载并解包（加速站）…"
        % (before or "无扩展", lv))
    good, msg = install_ext_zip(ext_dir, res["zip"], want_ver=lv, log=log, timeout=timeout)
    after = disk_ext_version(ext_dir)
    res["after"] = after or before
    if not good:
        res["note"] = msg
        return res
    res["changed"] = bool(after) and (not before or _ver_cmp(after, before) == 1)
    res["ok"] = bool(after) and _ver_cmp(after, lv) in (0, 1)
    if not res["ok"]:
        res["note"] = "解包后版本 v%s 仍不是 v%s" % (after or "?", lv)
    return res


def ensure_ext_current(port, ext_id, ext_dir=None, allow_store=True, log=print,
                       want_latest=True, auto_install=None, force_latest=False):
    """把已加载的脚本猫扩展对齐到「线上最新版」。只 reload，不重启浏览器。

    ★ 判定基准（这次修的关键）：线上最新版去官方发布源查，**不再拿磁盘里那份当标尺**。
      旧逻辑只比「已装 vs 磁盘解包目录」，而容器镜像自带的解包目录本身就是 1.4.0，
      两份都是 1.4.0 → 永远输出「已是最新 v1.4.0」，哪怕线上早就是 1.5.2。

    流程：
      ① 已装 < 线上最新 → 下载官方 chrome.zip 覆盖解包目录 + reload（同路径同 ID，脚本与授权都在）；
         解包通道不可用时退回商店 autoUpdate，并轮询等版本落定
      ② 已装 ≥ 线上最新 → 才算「最新」；磁盘目录若更新（本地开发版）仍 reload 一次
      ③ 查不到线上版本 → 退回磁盘比对，但 verified=False，调用方**不许**说「已是最新」

    返回 {ok, changed, before, after, latest, verified, source, action, note}
    """
    if auto_install is None:
        auto_install = SC_EXT_AUTOINSTALL
    res = {"ok": False, "changed": False, "before": "", "after": "", "latest": "",
           "verified": False, "source": "", "action": "", "note": ""}

    info = ext_info(port, ext_id, log=log)
    before = str(info.get("version") or "")
    res["before"] = res["after"] = before
    loc = str(info.get("location") or "")
    disk = disk_ext_version(ext_dir)

    latest = ext_latest(force=force_latest, log=log) if want_latest else {}
    lv = str((latest or {}).get("version") or "")
    if lv:
        res["latest"] = lv
        res["verified"] = True

    after = before
    # ── ① 已装落后线上最新 → 升级 ─────────────────────────────
    if before and lv and _ver_cmp(before, lv) == -1:
        res["action"] = "upgrade"
        log("    · 已装 v%s，线上最新 v%s → 落后，开始升级" % (before, lv))
        ok = False
        if auto_install and ext_dir and latest.get("zip") and (loc in ("", "UNPACKED") or disk):
            good, msg = install_ext_zip(ext_dir, latest["zip"], want_ver=lv, log=log)
            if good:
                ok = True
                res["source"] = "github"
                reload_ext(port, ext_id, log=log)
                after = _wait_ext_version(port, ext_id, want=lv, log=log)
                log("    · 覆盖并重载完成：浏览器里 v%s" % (after or "?"))
            else:
                res["note"] = msg
                log("    [!] 解包通道升级失败：%s" % msg)
        # 解包通道走不通（没有目录 / 目录只读 / 是商店 CRX）→ 点商店更新
        if not ok and allow_store:
            if auto_update_ext(port, log=log):
                res["source"] = res["source"] or "store"
                after = _wait_ext_version(port, ext_id, want=lv, tries=10, gap=2.0, log=log)
                if after and _ver_cmp(after, before) == 1:
                    ok = True
                else:
                    res["note"] = res["note"] or "商店更新未在 20 秒内生效"
            else:
                res["note"] = res["note"] or "商店更新未受理（解包扩展没有商店更新源）"
        if not ok and not res["note"]:
            res["note"] = "自动升级失败"
        if ok and after and _ver_cmp(after, lv) not in (0, 1):
            ok = False
            res["note"] = "升级后版本仍是 v%s，未达到 v%s" % (after, lv)
        res["ok"] = ok
        res["after"] = after or before
        res["changed"] = bool(after and before and _ver_cmp(after, before) == 1)
        return res

    # ── ② 已装 ≥ 线上最新（或线上版本未知，退回磁盘比对）─────────
    if res["verified"]:
        res["action"] = "none"
        # 本地解包目录比已装更新（自己换过目录）→ reload 一次让 Chrome 读新文件
        if disk and before and _ver_cmp(disk, before) == 1:
            log("    · 磁盘扩展 v%s 比已装 v%s 新 → 重载让 Chrome 读新文件…" % (disk, before))
            if reload_ext(port, ext_id, log=log):
                after = _wait_ext_version(port, ext_id, log=log)
                res["source"] = "disk"
                res["changed"] = bool(after and before and _ver_cmp(after, before) == 1)
        res["after"] = after or before
        res["ok"] = True
        return res

    # 线上版本查不到：只能跟磁盘比，但如实标注 verified=False
    res["action"] = "disk-only"
    if disk and before and _ver_cmp(disk, before) == 1:
        log("    · 磁盘扩展 v%s 比已装 v%s 新 → 重载…" % (disk, before))
        if reload_ext(port, ext_id, log=log):
            after = _wait_ext_version(port, ext_id, log=log)
            res["source"] = "disk"
            res["changed"] = bool(after and before and _ver_cmp(after, before) == 1)
    elif allow_store and not disk:
        res["source"] = "store"
        if auto_update_ext(port, log=log):
            after = _wait_ext_version(port, ext_id, tries=6, gap=2.0, log=log)
            res["changed"] = bool(after and before and _ver_cmp(after, before) == 1)
    res["note"] = res["note"] or "线上最新版查询失败，本次只做了磁盘比对"
    res["after"] = after or before
    res["ok"] = bool(after or before)
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
    ap.add_argument("--prepare-ext", action="store_true",
                    help="只把本地解包扩展目录刷到 GitHub 最新（不启动浏览器）")

    args = ap.parse_args()
    # 位置参数与 --port 共用同一个含义；argparse 里不能同名（位置参数的默认值
    # 会把 --port 的值覆盖成 None），所以这里合并一次。
    args.port = args.port or args.port_arg
    name_hint = args.name or SCRIPT_NAME_HINT
    hosts = [h.strip() for h in (args.hosts or "").split(",") if h.strip()] or None
    ext_dir = args.ext or None

    if args.self_test:
        return self_test(args)

    if args.prepare_ext:
        # 只刷本地目录：不连 CDP、不 reload、不需要浏览器在跑。
        d = ext_dir or (os.getenv("SC_EXT_DIR", "") or "").strip() or os.path.join(HERE, "scriptcat")
        print("=== 本地解包扩展目录：%s ===" % d)
        r = prepare_ext_dir(d, log=lambda m: print(m))
        print("  → %s  v%s → v%s（线上最新 v%s）%s"
              % ("OK" if r["ok"] else "未完成", r["before"] or "?",
                 r["after"] or "?", r["latest"] or "?",
                 ("；" + r["note"]) if r["note"] else ""))
        return 0 if r["ok"] else 1

    ports = [(args.port, "指定端口")] if args.port else _ports_from_map()
    if not ports:
        print("[!] 读不到 zy.py 发布的端口表（zy-ports.json）："
              "请先运行 zy.py，或用 --port 显式指定 CDP 端口。")
        return 2

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
