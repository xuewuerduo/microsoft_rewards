#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
sc_diag.py — 一次性「账号排程」诊断工具（在容器里跑）

用途：从脚本猫 IndexedDB 的 logger 表里拉出每个账号的关键日志行——
认领端口 / 已读取计划 / 本账号今日排程 / 下一执行点 / 定时唤醒开跑 /
空敲门跳过。用来判断某个账号到底有没有生成执行点、排在哪、到点有没有真跑。

账号和端口不写死：一律从 zy.py 发布的 zy-ports.json 读取（zy.py 从
BING_ACCOUNTS 派生）。新增账号只要进了 zy.py，本工具自动就能诊断到。

这些日志是脚本自己写进 IndexedDB 的，即使当时没被 zy.py 的前台采集器抓到，
数据也还在，所以比看日志流更可靠。

自包含，不依赖 zy.py，传这一个文件到容器即可运行（需 zy.py 已发布端口表）：

    python3 tools/sc_diag.py

可选参数：
    python3 tools/sc_diag.py --ports 9222,9223        # 手动覆盖端口（账号名退化为 port-N）
    python3 tools/sc_diag.py --self-test              # 本机自检，用假数据验证工具本身

读不到 zy-ports.json 时会明确提示先运行 zy.py，绝不用写死的账号猜测。
"""

import os
import re
import sys
import json
import time
import base64
import socket
import struct
import argparse
import urllib.request
from urllib.parse import urlparse

# 端口表由 zy.py 从 BING_ACCOUNTS 派生后发布，是本工具唯一的账号真相源；
# 本工具不维护账号表——有哪些账号、各在哪个端口，一律从端口表读。
PORT_MAP_FILES = [p for p in (
    os.getenv("PORT_MAP_FILE", "/app/data/zy-ports.json"),
    "/usr/share/novnc/zy-ports.json",
) if p]


def _ports_from_map():
    """从 zy.py 发布的 zy-ports.json 读 (端口, 账号名) 列表；读不到返回空。"""
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

# 只挑这些关键行，避免刷屏
KEYWORDS = [
    "认领端口",
    "已读取 zy.py 计划",
    "本次读不到 zy.py 计划",
    "本账号今日排程",
    "下一执行点",
    "当前时刻未命中执行点",
    "定时唤醒：开始本轮任务",
    "定时唤醒：错开",
    "定时唤醒：上一轮还在执行中",
    "上一轮跑到一半",
    "收官补跑",
]

# ---------------------------------------------------------------------------
# 极简 WebSocket CDP 客户端（无第三方依赖，移植自 zy.py）
# ---------------------------------------------------------------------------


def _ws_connect(url):
    parsed = urlparse(url)
    host, port = parsed.hostname, parsed.port or 80
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    sock = socket.create_connection((host, port), timeout=5)
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
        raise ConnectionError("ws 握手被拒绝")
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
        if opcode == 0x9:  # ping -> pong
            _ws_send(sock, chunk, opcode=0xA)
            continue
        if opcode == 0x8:
            return None
        payload += chunk
        if fin:
            return payload.decode("utf-8", "replace") if opcode == 0x1 else None


def _cdp_evaluate(sock, expr, timeout=20):
    mid = 1
    _ws_send(sock, json.dumps({
        "id": mid,
        "method": "Runtime.evaluate",
        "params": {"expression": expr, "returnByValue": True, "awaitPromise": True},
    }).encode())
    deadline = time.time() + timeout
    while time.time() < deadline:
        sock.settimeout(max(1, deadline - time.time()))
        msg = _ws_recv_message(sock)
        if not msg:
            raise ConnectionError("CDP 连接关闭")
        try:
            ev = json.loads(msg)
        except Exception:
            continue
        if ev.get("id") == mid:
            inner = (ev.get("result") or {}).get("result") or {}
            if inner.get("exceptionDetails"):
                raise RuntimeError("页面脚本异常")
            return inner.get("value")
    raise TimeoutError("CDP 响应超时")


def _find_ws(port):
    """找到脚本猫扩展的 CDP target（service_worker / extension page），返回 ws url 列表"""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=3) as r:
            targets = json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return []
    out = []
    for t in targets:
        ws = t.get("webSocketDebuggerUrl")
        if not ws:
            continue
        url = (t.get("url") or "").lower()
        ttype = t.get("type")
        if ttype == "service_worker" and url.startswith("chrome-extension://"):
            out.append(ws)
        elif ttype == "page" and url.startswith("chrome-extension://"):
            out.append(ws)
    seen, uniq = set(), []
    for w in out:
        if w not in seen:
            seen.add(w)
            uniq.append(w)
    return uniq


# 读 IndexedDB logger 表里今天 0 点之后、命中关键词的日志
_READ_JS = """(async () => {
  const TODAY0 = __TODAY0__;
  const KW = __KW__;
  try {
    const dbs = await indexedDB.databases();
    for (const d of (dbs || [])) {
      if (!d.name) continue;
      let db;
      try {
        db = await new Promise((res, rej) => {
          const r = indexedDB.open(d.name);
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
          r.onblocked = () => rej(new Error("blocked"));
        });
      } catch (e) { continue; }
      if (!db.objectStoreNames.contains("logger")) { db.close(); continue; }
      const tx = db.transaction("logger", "readonly");
      const idx = tx.objectStore("logger").index("createtime");
      const out = [];
      await new Promise((res, rej) => {
        const q = idx.openCursor(IDBKeyRange.lowerBound(TODAY0), "next");
        q.onsuccess = () => {
          const c = q.result;
          if (!c) { res(); return; }
          const v = c.value;
          const m = String(v.message || "");
          if (KW.some(k => m.indexOf(k) >= 0)) {
            out.push({
              t: Number(v.createtime) || 0,
              m: m.slice(0, 1000),
              n: (v.label && v.label.name) || ""
            });
          }
          c.continue();
        };
        q.onerror = () => rej(q.error);
      });
      db.close();
      return out;
    }
    return [];
  } catch (e) {
    return [{ t: 0, m: "读取 IndexedDB 失败: " + (e && e.message || e), n: "" }];
  }
})()"""


def _read_account_logs(port, today0):
    for ws in _find_ws(port):
        try:
            sock = _ws_connect(ws)
        except Exception:
            continue
        try:
            expr = _READ_JS.replace("__TODAY0__", str(today0))
            expr = expr.replace("__KW__", json.dumps(KEYWORDS, ensure_ascii=False))
            res = _cdp_evaluate(sock, expr, timeout=25)
            if isinstance(res, list):
                return res, None
        except Exception as e:
            last = e
        finally:
            try:
                sock.close()
            except Exception:
                pass
    return [], "找不到脚本猫扩展 target 或读取失败"


def _fmt_time(ts):
    if not ts:
        return "--:--:--"
    return time.strftime("%H:%M:%S", time.localtime(ts / 1000))


def _guess_name(logs, fallback):
    """从『认领端口』行里提取真实账号名与端口"""
    for lg in logs:
        m = re.search(r"账号\s+(\S+)\s*→\s*CDP\s+(\d+)", lg.get("m", ""))
        if m:
            return m.group(1), m.group(2)
    return fallback, None


def _render(title, logs):
    lines = [f"[{title}]"]
    if not logs:
        lines.append("  （无匹配日志——脚本可能没在跑，或日志表为空）")
        return "\n".join(lines)
    ordered = sorted(logs, key=lambda x: x.get("t", 0))
    for lg in ordered:
        lines.append(f"  {_fmt_time(lg.get('t'))}  {lg.get('m', '')}")
    return "\n".join(lines)


def _self_test():
    fake = [
        {"t": 0, "m": "🎯 认领端口：MUID 24ACA324… → 账号 joe → CDP 9224（http://127.0.0.1:47831/zy-ports.json）", "n": ""},
        {"t": 0, "m": "📋 已读取 zy.py 计划（http://127.0.0.1:47831/zy-run-plan.json）：开机 13:59 → 收工 18:00，执行点撒在 14:04~17:30（本账号内随机）", "n": ""},
        {"t": 0, "m": "🎲 本账号今日排程（计划 14:04~17:30，执行点各账号独立、互不相同）：14:26 / 15:47 / 17:12", "n": ""},
        {"t": 0, "m": "⏭️ 随机排程：当前时刻未命中执行点（今日 计划，下一执行点 2026-11-23 14:26:00），本次敲门静默跳过", "n": ""},
    ]
    print("【自检】过滤与渲染逻辑：")
    name, port = _guess_name(fake, "joe")
    print(f"  识别账号: {name} / 端口 {port}")
    print(_render(f"CDP {port} {name}", [x for x in fake if any(k in x['m'] for k in KEYWORDS)]))
    print("\n自检完成：工具逻辑正常。到容器里跑 python3 tools/sc_diag.py 即可拉真实数据。")


def main():
    ap = argparse.ArgumentParser(description="账号排程诊断（读脚本猫 IndexedDB 日志）")
    ap.add_argument("--ports", default=None, help="CDP 端口列表，逗号分隔（默认从 zy.py 端口表读取）")
    ap.add_argument("--self-test", action="store_true", help="本机自检（假数据），不连容器")
    args = ap.parse_args()

    if args.self_test:
        _self_test()
        return

    # 账号和端口一律来自 zy.py 端口表；--ports 只是手动覆盖端口（名字退化为 port-N）
    mapped = _ports_from_map()
    if args.ports:
        name_by_port = {p: n for n, p in mapped}
        ports = [(p, name_by_port.get(p, f"port-{p}"))
                 for p in (int(x) for x in args.ports.split(","))]
    elif mapped:
        ports = mapped
    else:
        print("[!] 读不到 zy.py 发布的端口表（zy-ports.json）："
              "请先运行 zy.py，或用 --ports 显式指定端口。")
        return 2

    # mktime 需要 9 元素时间元组 (年,月,日,时,分,秒,周,年积日,夏令时)
    _tm = time.localtime()
    today0 = int(time.mktime((_tm.tm_year, _tm.tm_mon, _tm.tm_mday,
                              0, 0, 0, 0, 0, -1))) * 1000
    print("=" * 68)
    print(f"账号排程诊断  {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 68)

    for port, fallback in ports:
        logs, err = _read_account_logs(port, today0)
        if err and not logs:
            print(f"\n[{fallback} @ CDP {port}]  {err}")
            continue
        name, real_port = _guess_name(logs, fallback)
        label = f"CDP {real_port or port}  {name}"
        print("\n" + _render(label, logs))

    print("\n" + "-" * 68)
    print("说明：")
    print("  · 🎲 本账号今日排程 = 该账号今天的执行点（各账号不同）")
    print("  · ⏭️ 当前时刻未命中 = 空敲门，正常等待；看『下一执行点』")
    print("  · ⏰ 定时唤醒：开始本轮任务 = 真正开跑")
    print("  · 若某账号有『已读取计划/排程』但执行点已过仍只有空敲门 → 真异常")
    print("  · 若某账号完全没有排程行 → 脚本没走到排程逻辑，需进一步查该账号扩展")


if __name__ == "__main__":
    sys.exit(main())
