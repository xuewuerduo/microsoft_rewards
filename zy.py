#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
朱雀面板任务：启动 Chromium 浏览器，配合「脚本猫-微软积分商城签到脚本」自动完成微软积分签到
（朱雀镜像环境：labwc + wayvnc + websockify(noVNC) 按需桌面，默认无头浏览器省资源）

【配置方式】
面板环境变量（朱雀「环境变量」页面添加，任务执行时自动注入任务进程）:
  必填 BING_ACCOUNTS   JSON 数组，每个账号的 name 即用户目录名，路径为
                       ${ZHUQUE_CHROME_USER_DATA:-/data/profiles}/user-<name>；
                       email 用于登录比对
                        例: [{"name":"long","email":"xuewuerduo@hotmail.com"},
                             {"name":"marvin","email":"ldhscu@outlook.com"}]
可选 BING_RUN_SECONDS  保持运行秒数，供「脚本猫-微软积分商城签到脚本」完成任务
                          （默认 900=15分钟；0=常驻不自动关闭）
可选 RUN_WINDOW        运行时段（默认 09:00-15:00；没进时段就不启动浏览器，
                          避免浏览器空等白占资源）。取值：
                            08:00-11:00            具体时段
                            morning / afternoon / evening / night / allday
                                                  预设（上午/下午/晚上/夜间/全天）
                            morning,evening        多段，逗号分隔
                          留空=不限制（一直可跑）
                        分工：朱雀面板的 Cron 表达式写 `0 0 9 * * *`（每天 9:00 拉起一次），
                          开机时刻由本脚本在 RUN_WINDOW 内随机挑（到点才启动浏览器，
                          等待期间只占一个空闲进程）。真正的签到执行时刻由「脚本猫」
                          读计划文件后在 [开机时刻, RUN_DEADLINE] 之间二次随机。
可选 RUN_DEADLINE      收工时间（默认 18:00）：正常时段内所有任务到此为止，浏览器运行时长由它决定
                          （配了它就不再按 BING_RUN_SECONDS 计时）；
                          ★ 启动偏晚时不再死守这条线，见 RUN_LATE_EXTEND
可选 RUN_START_RANDOM  是否由本脚本在 RUN_WINDOW 内摇开机时刻（默认 1=摇；0=开窗即跑）
可选 RUN_WINDOW_MISSED 不在时段内时：auto（默认）只要离收工还够 RUN_MIN_SECONDS 就启动
                          （窗口过完也跑，绝不跨天死等）；wait 等到下一段（含跨天）；skip 直接结束
可选 RUN_LATE_EXTEND   启动偏晚时是否「跑完再结束」（默认 1=开启）：
                          若现在距收工不足一轮 RUN_MIN_SECONDS，不再像以前那样直接放弃启动，
                          而是把收工时刻从现在起顺延一整轮，让脚本猫有足够时间把任务跑完；
                          全部账号报「已完成」会提前结束，不必等满顺延后的时长。
                          设 0 = 恢复旧行为（来不及就不启动）
可选 RUN_MIN_SECONDS   最短可用运行时长（默认 10800=180 分钟），决定「值不值得开机 / 偏晚时顺延多长」：
                          ① 摇号上限收紧到「收工 - 最短时长」，不会摇到窗口末尾；
                          ② 窗口已过但还够时间也照样启动；
                          ③ 不够时间且 RUN_LATE_EXTEND=1：照常启动，收工从现在顺延一整轮；
                             设 0 才是不启动（旧行为）；
                          ④ 开机确实晚了也照跑，RUN_LATE_EXTEND=1 时收工会顺延，不再硬卡 18:00；
                          ⑤ 等手动登录的时间也不会吃掉这段时间（至少留 60 秒扫码）
                          设 0 = 不设门槛（多晚都开机，到点就关）
可选 RUN_GRACE_SECONDS 到收工时间若「脚本猫」还没报全部完成，再宽限多少秒收尾（默认 0=准点收工）
可选 RUN_WAIT_LOG_SECONDS 等待开机期间「距开机还有多久」日志的间隔秒数（默认 3600=1 小时
                          一条；到点前 10 分钟会再单独提示一条）。设 0 无效（最小 60）
可选 LAUNCH_ATTEMPTS 浏览器启动重试次数（默认 3，每次观察 LAUNCH_CHECK_SECONDS=6 秒）
可选 ZHUQUE_CHROME_USER_DATA  浏览器用户目录根路径（默认 /data/profiles）
可选 CHROME_BIN               Chromium 可执行文件路径（默认自动探测）
 可选 HEADLESS_MODE            浏览器显示模式：
                                  auto   （默认）无头启动；检测到未登录时，若 DESKTOP_ENABLE=1
                                          则自动拉起 noVNC 桌面让你通过网页登录，登录后自动回无头
                                  always 永远无头（未登录仅发通知，不拉桌面）
                                  gui    始终带界面（桌面 + GUI 浏览器，测试/调试用）
 可选 DESKTOP_ENABLE           是否允许脚本拉起桌面（默认 1；0=禁用，等价 always）
 可选 GUI_READY_TIMEOUT        等 GUI 窗口 CDP 就绪的总秒数（默认 45）
 可选 GUI_AUTOSTART_WAIT       先留几秒让桌面自己拉窗口（autostart / start-windows）。
                                 到点还没起来，就不再依赖桌面脚本，由脚本直接执行
                                 /tmp/gui-browser-cmds/<账号>.sh（默认 12）
 可选 GUI_X11_RETRY_TIMEOUT    Wayland 下始终没有窗口、但环境里有 DISPLAY 时，
                                 换 --ozone-platform=x11 重试的秒数（默认 20）
 可选 LUMEN_URL                桌面查看地址提示（默认 http://<主机>:8080/vnc.html）
 可选 DESKTOP_LOGIN_WAIT       等待手动登录的最长秒数（默认 0=不设超时，
                                 GUI 桌面一直保持到登录成功为止）

   脚本猫扩展 + 签到脚本自动部署（同目录 sc_deploy.py，新加用户不用再手工点）
 可选 SC_AUTO_DEPLOY           浏览器起来后自动装「脚本猫扩展 + 商店脚本 + Cookie 授权」
                                （默认 1；0=关闭，回到纯手工/模板方式）
 可选 SC_SCRIPT_ID             scriptcat 商店脚本 ID（默认 6006 微软积分（优化版））
 可选 SC_SCRIPT_NAME           已装脚本名片段（默认「微软积分」）
 可选 SC_EXT_DIR               脚本猫解包扩展目录（默认从 /app/extensions、/data/extensions 找）
 可选 SC_AUTO_UPDATE           任务开跑前校准「已装脚本 vs 商店最新」，落后就更新
                                （默认 1；0=只在 --update-script 时手动更新）
 可选 SC_EXT_UPDATE            同上，顺带校准脚本猫扩展插件本身的版本
                                （默认 1；0=不检查扩展，只校准脚本）
 可选 SC_CALIB_WAIT_SEC        等「脚本猫首轮心跳」再校准的最长秒数（默认 180）
                                校准时机：启动阶段只确保可用，等脚本加载好、任务还没
                                开跑时统一做一次，避免刚启动就 reload 打断初始化

   命令行维护参数（面板正常运行时不带参数，行为完全不变）
     python3 zy.py --update-script    手动把签到脚本更新到商店最新版
                                      （浏览器没在跑会临时拉起，完成后自动关闭）
     python3 zy.py --update-ext       手动把脚本猫扩展插件更新到最新（磁盘新版/商店）
     python3 zy.py --install-script   重新安装/修复扩展 + 脚本 + Cookie 授权
     python3 zy.py --script-status    查看各账号已装脚本版本

   ⚠️ 自动部署/更新依赖同目录的 sc_deploy.py（上传 zy.py 时请一并上传）。
      缺这个文件时会退回旧行为（只靠 --load-extension + 模板），不会中断任务。

   脚本猫日志采集开关 SC_LOG_CAPTURE / SC_LOG_POLL / SC_LOG_BASELINE
                          （默认开启、30 秒轮询、now=仅本次任务新日志；
                          改 all=连接后先倾倒历史日志）在脚本顶部常量中修改。

搜索/签到相关参数（关键词、搜索次数、搜索延迟、浏览时长、前台/后台模式等）
请在脚本的 /* ==UserConfig== */ 中配置，脚本猫页面上可直接修改。
Python 脚本负责：启动前获取热搜词 → 启动浏览器 → 登录检查 → 采集脚本猫日志
（读取脚本猫 IndexedDB「logger」日志表 GM_log + 后台 console，按账号前缀精简
输出到朱雀任务日志；error 级别日志额外发送通知提醒）
→ 保持运行供脚本猫执行 → 到期关闭。

【登录判断】
1) 先从该账号 profile 的浏览器数据（Default/Cookies）直接判断：存在微软 Rewards
   登录会话 cookie `_RwBf`（.bing.com）→ 已登录该账号。
2) 再打开 rewards.bing.com/dashboard 确认：
   未跳转到登录页且（cookie 会话或页面检出会员等级/账号信息） → 已登录，继续下一步任务
   跳转到登录页（会话已失效）或均无任何登录证据           → 未登录：
                      HEADLESS_MODE=auto 且 DESKTOP_ENABLE=1 → 自动拉起 noVNC 桌面，
                      以 GUI 模式启动该账号浏览器，让你经 noVNC 网页手动登录，
                      登录完成后自动关闭桌面回到无头模式继续任务
                      否则仅发送「未登录」通知，继续任务（不阻塞）

【执行流程】
按 BING_ACCOUNTS 逐个账号启动浏览器（各自独立用户目录；默认无头）
→ dashboard 登录判断（未登录按上述规则处理）
→ 全部处理完后保持运行，让「脚本猫-微软积分商城签到脚本」按 UserConfig 配置自动执行
  （签到 / 前台+后台搜索 / 点击任务）
→ 到期全部关闭，通知汇总登录状态

首次使用请在浏览器中手动完成（经 noVNC http://<主机>:8080/vnc.html 实时查看桌面）：
  1. 登录 Microsoft 账号（会话保存在各自用户目录）

脚本猫扩展经 --load-extension 自动加载（账号 profile 已引用脚本猫解压扩展时跳过）；
「脚本猫-微软积分商城签到脚本」不再依赖模板手工预装 —— 新加的用户第一次跑任务时，
本脚本会调用同目录 sc_deploy.py，通过 CDP 自动完成：装扩展 → 开「允许用户脚本」
→ 装商店最新脚本并启用 → 开「静默更新」→ 写 Cookie 永久授权（全程无 GUI 点击）。
旧账号（模板 _template 克隆出来的）已经自带脚本时，这一步只做「确保启用 + 补授权」，不会重复安装。
"""

import os
import re
import json
import sys
import time
import random
import shutil
import glob
import signal
import socket
import struct
import base64
import threading
import concurrent.futures
import urllib.request
import http.server
import subprocess
import shlex
import sqlite3
import logging
from pathlib import Path
from urllib.parse import urlparse
from datetime import datetime, timedelta

# ==============================
# 🔧 图形界面显示（朱雀镜像 = 原生 Wayland / sway + wayvnc + noVNC）
#    镜像已在 entrypoint 中设置 WAYLAND_DISPLAY / XDG_RUNTIME_DIR，
#    浏览器通过 --ozone-platform=wayland 原生渲染，无需 X11 DISPLAY。
# ==============================

# 朱雀通知兼容（朱雀在执行任务时注入 PYTHONPATH，自动生成 helpers/notify.py，
# 故 `from notify import send` 可直接使用；未注入时主动探测 helpers 路径，
# 实在找不到则降级为仅打印）
try:
    from notify import send
except ImportError:
    try:
        for _p in ("/app/data/helpers", "/data/helpers"):
            if _p not in sys.path and os.path.isdir(_p):
                sys.path.append(_p)
        from notify import send
    except ImportError:
        def send(title, content):
            print(f"[通知] {title}\n{content}")

# 通知通道异常（如外部 notify 命令缺失）绝不能拖垮签到任务 → 统一容错包装
_send_impl = send


def send(title, content):
    try:
        _send_impl(title, content)
    except Exception as e:
        print(f"[通知] {title}（通知通道异常: {e}）")

# 日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s | %(levelname)s | %(message)s')
logger = logging.getLogger()

# 脚本内部参数（一般无需修改；可用朱雀任务级环境变量覆盖）
CHROME_USER_DATA_BASE = os.getenv("ZHUQUE_CHROME_USER_DATA", "/data/profiles")
STATE_FILE = os.getenv("ZHUQUE_STATE_FILE", "/app/data/chrome-browser-state.json")
CLOSE_AFTER = True          # 到期后是否关闭浏览器
RANDOM_DELAY = 0            # 任务开始时随机延迟上限秒数（0=不延迟）

# ⏰ 运行时段（把「脚本猫」里的时间段配置搬到这里，没进时段就不启动浏览器，省资源）
# 取值：具体时段 "08:00-11:00"；预设 morning/afternoon/evening/night/allday；
#       可逗号分隔多段，如 "morning,evening" 或 "08:00-11:00,14:00-17:00"；留空=不限制（一直可跑）
RUN_WINDOW = os.getenv("RUN_WINDOW", "09:00-15:00").strip()
# 不在时段内时怎么办：
#   auto（默认）今天还没到窗口 → 等到窗口开始；今天的窗口已经过完 → 直接结束，绝不越过窗口末点
#   wait        不在窗口内就等到下一段（含跨天），旧行为
#   skip        不在窗口内就直接结束
RUN_WINDOW_MISSED = os.getenv("RUN_WINDOW_MISSED", "auto").strip().lower()
# 收工时间：所有任务到这个点必须结束（关浏览器）。zy.py 按「开机 → 收工」算运行时长。
RUN_DEADLINE = os.getenv("RUN_DEADLINE", "18:00").strip()
# 最短可用运行时长（默认 10800=180 分钟）：开机后至少要给「脚本猫」留这么久，才值得开机。
# 设为 3 小时而不是 1.5 小时：搜索是每日硬配额（PC 约 50 次、一次 1~2 分钟，合计 1~1.5 小时），
# 加上阅读/活动卡片，1.5 小时根本压不进去，会在 18:00 被直接截断。
# 它是「开不开机」的门槛，不是「跑多久」的承诺 —— 收工时间永远不动：
#   ① 摇号上限收紧到「收工 - 最短时长」，正常不会摇到窗口末尾；
#   ② 不在窗口内但距收工还够，照样启动（能跑多少算多少）；
#   ③ 距收工不够这个数就不启动（跑了也完不成）；
#   ④ 真的开机太晚，跑到收工就关，绝不顺延 —— 宁可少跑，也不越过收工时间。
# 设 0 = 不设门槛（多晚都开机，到点就关）。
RUN_MIN_SECONDS = int(os.getenv("RUN_MIN_SECONDS", "10800"))
# 启动偏晚（现在距收工不足一轮 RUN_MIN_SECONDS）时怎么办：
#   1（默认）不再直接放弃启动，也不再死守收工时刻；把收工从「现在」顺延一整轮
#     （now + RUN_MIN_SECONDS），让脚本猫有足够时间把今天该跑的跑完，跑完再结束。
#   0 旧行为：来不及跑完就不启动浏览器（下午才起来时会整天一个任务都不跑）。
RUN_LATE_EXTEND = os.getenv("RUN_LATE_EXTEND", "1").strip().lower() not in ("0", "false", "no", "off")
# 到收工时间时，若「脚本猫」还没报「全部完成」，再宽限多少秒收尾。
# 默认 0 = 准点收工：到 18:00 立刻关浏览器，不为「差几分钟」往后拖。
RUN_GRACE_SECONDS = int(os.getenv("RUN_GRACE_SECONDS", "0"))
# 等待开机期间「距开机还有多久」的心跳日志间隔（秒）。默认 3600=1 小时一条。
# 原来是固定 600 秒，9:00 拉起、14:50 开机的话一天要刷 30 多条，把真正有用的日志顶掉了。
# 想更安静可设 7200，想看细一点可设 600。
RUN_WAIT_LOG_SECONDS = max(60, int(os.getenv("RUN_WAIT_LOG_SECONDS", "3600")))
# 浏览器启动重试：拉起后观察 LAUNCH_CHECK_SECONDS 秒，秒退则重试，最多 LAUNCH_ATTEMPTS 次
LAUNCH_ATTEMPTS = int(os.getenv("LAUNCH_ATTEMPTS", "3"))
LAUNCH_CHECK_SECONDS = float(os.getenv("LAUNCH_CHECK_SECONDS", "6"))
# 开机时刻是否在 RUN_WINDOW 内随机。
# 默认 1：面板每天 9:00 只拉起一次，由本脚本在 RUN_WINDOW（09:00-15:00）内随机挑开机时刻，
# 到点才真正启动浏览器（等待期间只占一个空闲进程）。设 0 = 一起来就开浏览器、不随机。
RUN_START_RANDOM = os.getenv("RUN_START_RANDOM", "1").strip().lower() not in ("0", "false", "no", "off")
# 随机开机时刻落盘（同一天只摇一次，面板重启任务不会重新摇号）
RUN_START_STATE = os.getenv("RUN_START_STATE", "/app/data/zy-run-start.json")
# 任务计划文件（供「脚本猫」读取：开机时刻 + 收工时刻，它在区间内二次随机执行）
RUN_PLAN_FILES = ["/app/data/zy-run-plan.json", "/usr/share/novnc/zy-run-plan.json"]
# 计划读取接口的候选端口：用与 noVNC/GUI 不同的独立端口，彻底避开 8080 上的
# websockify。这样自建接口永远不会抢 GUI 的页面端口，「让位给 websockify」那套
# 逻辑也就不再触发（仍保留作兜底）。改这里时要同步改 zy.js 的 PLAN_DEFAULT_URLS /
# PORT_TABLE_URLS 和 Config.planUrl 默认值。
PLAN_HTTP_PORTS = [int(x) for x in os.getenv("RUN_PLAN_PORTS", "47831,47832,47833").split(",") if x.strip()]
_PLAN_HTTP_TEXT = ""      # 接口当前返回的计划内容（write_run_plan 时刷新）
_PLAN_HTTP_PORT = 0       # 已经起来的端口（0=没起）
# 自建接口的 server 对象：拉起 noVNC 桌面时若它正占着 noVNC 端口（8080），
# 必须主动关掉让位给 websockify，否则 /vnc.html 404 → GUI 打不开。
_PLAN_HTTP_SERVER = None
# 是否曾为桌面让出过 noVNC 端口：桌面停止（websockify 关闭）后要把自建接口挂回去，
# 否则 8080 空着，脚本猫读不到端口映射/计划。
_PLAN_HTTP_YIELDED = False
# gui 模式「复用桌面」分支里修复 noVNC（stop→start）最多尝试一次，
# 否则四个账号依次进分支会把刚拉起的窗口反复杀掉。
_NOVNC_REPAIR_DONE = False

# ── 账号 → CDP 端口 映射（让脚本猫「认领自己那台浏览器」）─────────────────
# 为什么不靠 localStorage：脚本猫这套脚本是 @crontab 后台脚本，容器里没有注入
# 页面上下文（2026-11-20 四小时日志里「🖥️ 页面上下文已加载」出现 0 次），
# 于是 zy.py 写进去的 __mp_cdp_port 没人读。
# 后台脚本唯一拿得到的自身身份是「自己的 cookie」：每个 profile 的 MUID 不同，
# 所以这里把「MUID → 端口」吐出去，脚本猫按自己的 MUID 认领端口，不依赖页面注入。
# 端口表落盘位置：无头模式靠本进程的只读接口读 /app/data 这份；
# GUI 模式没有自建接口，靠 websockify 静态目录（/usr/share/novnc）那份。
PORT_MAP_FILES = [p for p in (
    os.getenv("PORT_MAP_FILE", "/app/data/zy-ports.json"),
    "/usr/share/novnc/zy-ports.json",
) if p]
_PORT_MAP = {}
_PORT_MAP_TEXT = ""
_PORT_MAP_LOCK = threading.Lock()


class _PlanHandler(http.server.BaseHTTPRequestHandler):
    """极小只读接口：只认 /zy-run-plan.json 和 /zy-ports.json，其它一律 404。

    脚本猫没有文件权限，只能走 HTTP；这个接口挂在独立端口（默认 47831），
    与 GUI 的 8080 隔离，不依赖桌面是否启动。"""

    def _serve(self, with_body: bool):
        path = (self.path or "").split("?")[0].rstrip("/")
        if path in ("/zy-run-plan.json", "/zy-run-plan"):
            body = (_PLAN_HTTP_TEXT or "").encode("utf-8")
        elif path in ("/zy-ports.json", "/zy-ports"):
            body = (_PORT_MAP_TEXT or "").encode("utf-8")
        else:
            self.send_error(404, "Not Found")
            return
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if with_body:
            try:
                self.wfile.write(body)
            except Exception:
                pass

    def do_GET(self):
        self._serve(True)

    def do_HEAD(self):
        self._serve(False)

    def log_message(self, *args):
        pass            # 每 10 分钟一次敲门，不刷日志

CDP_BASE_PORT = 9222        # CDP 调试起始端口（每个账号依次 +1；设 0 关闭 CDP，跳过登录检查）
CHROME_BIN = os.getenv("CHROME_BIN", "")  # Chromium 可执行文件路径（留空自动探测）

# 🧩 脚本猫扩展 + 签到脚本的自动部署（同目录 sc_deploy.py）
HERE = os.path.dirname(os.path.abspath(__file__))        # 本脚本所在目录（sc_deploy.py 也在这里）
# 新加账号（profile 里还没有脚本猫/脚本）时，浏览器起来后自动装扩展、装商店最新脚本、
# 开「允许用户脚本」「静默更新」并写 Cookie 永久授权，不需要再手工点。
SC_AUTO_DEPLOY = os.getenv("SC_AUTO_DEPLOY", "1").strip().lower() not in ("0", "false", "no", "off")
SC_SCRIPT_ID = os.getenv("SC_SCRIPT_ID", "6006")        # scriptcat 商店脚本 ID（微软积分（优化版））
SC_SCRIPT_NAME = os.getenv("SC_SCRIPT_NAME", "微软积分")  # 已装脚本名片段
SC_EXT_DIR = os.getenv("SC_EXT_DIR", "")                # 脚本猫解包扩展目录（留空自动探测）
# 任务开跑前校准版本（默认开）。注意时机：浏览器刚起来时**不**做，等脚本猫首轮心跳
# 到了（脚本已加载、任务还没开跑）再统一做一次，避免刚启动就 reload 打断初始化。
SC_AUTO_UPDATE = os.getenv("SC_AUTO_UPDATE", "1").strip().lower() not in ("0", "false", "no", "off")
# 同上，顺带校准脚本猫扩展插件本身（磁盘解包目录有新版本就 reload；商店版点一次更新）
SC_EXT_UPDATE = os.getenv("SC_EXT_UPDATE", "1").strip().lower() not in ("0", "false", "no", "off")
# 等「脚本猫首轮心跳」的上限秒数：等到就校准，等不到也按这个时间兜底校准一次
SC_CALIB_WAIT_SEC = int(os.getenv("SC_CALIB_WAIT_SEC", "180") or 180)

# 🖥️ 显示模式（默认无头浏览器省资源；检测未登录时按需拉起 noVNC 桌面让用户登录）
# HEADLESS_MODE: auto(默认) / always(永远无头) / gui(始终带界面)
HEADLESS_MODE = os.getenv("HEADLESS_MODE", "auto").lower()
DESKTOP_ENABLE = os.getenv("DESKTOP_ENABLE", "1") in ("1", "true", "yes", "on")
DESKTOP_SCRIPT = os.getenv("DESKTOP_SCRIPT", "/usr/local/bin/desktop.sh")  # 桌面启停脚本
LUMEN_URL = os.getenv("LUMEN_URL", "http://<主机>:8080/vnc.html")  # noVNC 桌面访问地址提示
DESKTOP_SETTLE = 8              # 拉起桌面后等待秒数（等 labwc + chromium 就绪）
GUI_READY_TIMEOUT = int(os.getenv("GUI_READY_TIMEOUT", "45"))  # 等待 GUI 浏览器 CDP 就绪的最长秒数（首次启动 profile 较慢）
# GUI 窗口兜底：桌面脚本（desktop.sh 的 autostart / start-windows）是黑盒，它没执行
# /tmp/gui-browser-cmds/*.sh 时，脚本只能干等到超时再静默回退无头。这里改成：
# 先留 GUI_AUTOSTART_WAIT 秒让桌面自己拉，没起来就自己 sh 执行窗口命令，再不行换 X11 重试。
GUI_AUTOSTART_WAIT = int(os.getenv("GUI_AUTOSTART_WAIT", "12"))        # 留给桌面 autostart 自己拉窗口的秒数
GUI_X11_RETRY_TIMEOUT = int(os.getenv("GUI_X11_RETRY_TIMEOUT", "20"))  # Wayland 无窗口且存在 DISPLAY 时换 X11 重试的秒数
_TERMINATED = False             # 收到 SIGTERM（面板停止任务）置 True，强制走 finally 清理浏览器
DESKTOP_LOGIN_WAIT = int(os.getenv("DESKTOP_LOGIN_WAIT", "0"))  # 等待用户手动登录的最长秒数；0=不设超时，一直等到登录成功
DESKTOP_LOGIN_POLL = 5          # 登录状态轮询间隔（秒）

# GUI 浏览器由桌面（labwc autostart）启动时用到的文件
GUI_CMD_FILE = "/tmp/gui-browser-cmd"   # 兼容单窗口旧写法（仍支持）
GUI_CMD_DIR = "/tmp/gui-browser-cmds"   # 多窗口：目录下每个 .sh 启动一个账号的 GUI 浏览器
GUI_LOG_FILE = "/tmp/gui-browser.log"   # GUI 浏览器启动日志
LUMEN_HOSTNAME_FILE = "/tmp/lumen-hostname"  # desktop.sh 读取后作为 lumen --hostname，网页标题显示待登录账号

# 🐱 脚本猫日志采集（读取脚本猫 IndexedDB「ScriptCat」库「logger」表 = 脚本猫「运行日志」同一数据源）
SC_LOG_CAPTURE = True       # 是否采集脚本猫日志（GM_log + 后台脚本 console）
SC_LOG_POLL = 30            # 轮询间隔（秒）；设置过小会导致刷新太快
# now(默认)=只输出本次任务期间的新日志；all=连接后先倾倒「脚本运行开始时刻」以来的日志
# （朱雀面板「环境变量」页添加 SC_LOG_BASELINE=now / all 可覆盖）
SC_LOG_BASELINE = os.getenv("SC_LOG_BASELINE", "now").lower()
_SCRIPT_START_TS = int(time.time() * 1000)   # 脚本运行开始时刻（baseline=all 时作为日志游标起点）

# 🚨 账号脚本「完全没跑」告警：浏览器已启动、但宽限期内一条用户脚本日志都没有 → 单独告警
# 心跳本身由 xf.js 每轮结束发 [QLREPORT-MSG]（zy.py 按账号名发通知）；这里是它的兜底——
# 脚本根本没运行时连心跳都发不出，只能由日志采集侧发现「零脚印」。
ALERT_NO_RUN = os.getenv("ALERT_NO_RUN", "1") in ("1", "true", "yes", "on")
NO_RUN_GRACE_MIN = int(os.getenv("NO_RUN_GRACE_MIN", "40"))  # 宽限期（分钟）：浏览器启动后多久还没任何脚本日志就告警
SC_EXT_ID = "ndcooeababalnlpkfedmmbbbgkljhpjf"  # 脚本猫扩展 ID（Chrome 商店安装版）。仅为额外线索，
#   识别主要靠探测 IndexedDB（不依赖扩展名/ID，扩展猫/改名版同样适用）

# 热搜词生成：已由「脚本猫-微软积分商城签到脚本」（zy.js）直接调用 uapis.cn 接口获取，
# 本地不再生成热搜词文件（如仍需保留可设 True）
GENERATE_HOTBOARD = False   # 是否在启动前生成热搜词文件
HOTBOARD_OUTPUT = os.getenv("ZHUQUE_HOTBOARD_OUTPUT", "/opt/novnc/hotboard_all.json")  # 输出文件（noVNC 静态目录）
HOTBOARD_API = "https://uapis.cn/api/v1/misc/hotboard"
HOTBOARD_PLATFORMS = [
    "bilibili", "acfun", "weibo", "zhihu", "zhihu-daily", "douyin", "kuaishou",
    "douban-movie", "douban-group", "tieba", "hupu", "ngabbs",
    "v2ex", "52pojie", "coolapk", "baidu", "thepaper", "toutiao",
    "qq-news", "sina", "sina-news", "netease-news", "huxiu", "ifanr", "sspai",
    "ithome", "ithome-xijiayi", "juejin", "jianshu", "guokr", "36kr", "51cto",
    "csdn", "nodeseek", "hellogithub", "lol", "genshin", "honkai", "starrail",
    "weread", "weatheralarm", "earthquake", "history"
]
HOTBOARD_CLEAN_PATTERN = re.compile(r'[^\u4e00-\u9fa5a-zA-Z0-9]')


def get_env(name: str, default):
    """读取朱雀面板环境变量（面板变量已注入任务进程环境）"""
    return os.getenv(name, default)


def load_accounts():
    """读取面板环境变量 BING_ACCOUNTS，name 即用户目录名，email 用于登录比对"""
    raw = os.getenv("BING_ACCOUNTS")
    if not raw:
        raise ValueError("❌ 面板环境变量 BING_ACCOUNTS 未设置！")
    try:
        accounts = json.loads(raw)
        if not isinstance(accounts, list):
            raise ValueError("BING_ACCOUNTS 必须是 JSON 数组")
        for acc in accounts:
            if "name" not in acc or "email" not in acc:
                raise ValueError(f"账号缺少 name 或 email 字段: {acc}")
        return accounts
    except Exception as e:
        raise ValueError(f"BING_ACCOUNTS 格式错误: {e}")


def generate_hotboard():
    """启动前先获取热搜词写入文件（供「脚本猫-微软积分商城签到脚本」读取；失败不影响任务）"""
    if not GENERATE_HOTBOARD:
        return
    logger.info("🔥 正在获取热搜词...")
    try:
        import requests
    except ImportError:
        logger.warning("⚠️ 未安装 requests 库，跳过热搜词获取")
        return
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"}
    seen = set()
    entries = []
    for platform in HOTBOARD_PLATFORMS:
        try:
            resp = requests.get(f"{HOTBOARD_API}?type={platform}", headers=headers, timeout=10)
            resp.raise_for_status()
            hot_list = resp.json().get("list", [])
            if not isinstance(hot_list, list):
                continue
            for item in hot_list:
                raw = str(item.get("title", "")).strip()
                if not raw:
                    continue
                cleaned = HOTBOARD_CLEAN_PATTERN.sub('', raw)
                if 2 <= len(cleaned) <= 20 and cleaned not in seen:
                    seen.add(cleaned)
                    entries.append({"title": cleaned})
        except Exception as e:
            logger.warning(f"  ⚠️ 跳过 {platform}: {e}")
            continue
    random.shuffle(entries)
    output = {
        "msg": "请求成功",
        "code": 200,
        "data": entries,
        "timestamp": int(time.time() * 1000),
    }
    # noVNC 的 websockify 以 --web=/usr/share/novnc 提供静态文件，
    # 浏览器脚本只能经 http://<主机>:8080/hotboard_all.json 拉到（写 /opt/novnc 不对外可见），
    # 故双写：保留原配置路径 + 写到实际 web 根。
    served = "/usr/share/novnc/hotboard_all.json"
    paths = [HOTBOARD_OUTPUT]
    if served not in paths:
        paths.append(served)
    for p in paths:
        try:
            Path(p).parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                json.dump(output, f, ensure_ascii=False, indent=2)
            logger.info(f"✅ 热搜词生成完成：{len(entries)} 条 → {p}")
        except Exception as e:
            logger.warning(f"⚠️ 写入热搜词文件失败 {p}: {e}")


# ==============================
# 📡 脚本猫日志监听（CDP 直连，按浏览器用户输出到朱雀任务日志）
# ==============================

def _ws_connect(url):
    """极简 WebSocket 握手（无第三方依赖），返回已连接的 socket"""
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
    """发送一个（客户端必须掩码的）数据帧"""
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
    """读取一个帧，返回 (fin, opcode, payload)"""
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
    """接收一条完整文本消息；处理 ping/pong 与分片；连接关闭返回 None"""
    payload = b""
    fin = True
    while True:
        fin, opcode, chunk = _ws_recv_frame(sock)
        if opcode == 0x9:  # ping → pong
            _ws_send(sock, chunk, opcode=0xA)
            continue
        if opcode == 0x8:  # close
            return None
        payload += chunk
        if fin:
            if opcode == 0x1:
                return payload.decode("utf-8", "replace")
            return None


# 只输出脚本猫（用户脚本 GM_log）日志：不再监听/打印浏览器控制台、页面异常与浏览器层日志。


# ==============================
# 🐱 脚本猫日志采集（GM_log 存于脚本猫 IndexedDB「ScriptCat」库「logger」表）
# ==============================
_CDP_ID_LOCK = threading.Lock()
_CDP_ID = [0]


def _cdp_send(sock, method, params=None):
    """发送一条带 id 的 CDP 命令，返回命令 id（用于请求/响应匹配）"""
    with _CDP_ID_LOCK:
        _CDP_ID[0] += 1
        mid = _CDP_ID[0]
    _ws_send(sock, json.dumps({"id": mid, "method": method, "params": params or {}}).encode())
    return mid


# 在扩展后台执行，读取其 IndexedDB 日志表（__DB__=库名，__LT__=上次时间戳，均为运行期替换）
_SC_IDB_TEMPLATE = """(async () => {
  const LT = __LT__;
  const DB = __DB__;
  try {
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open(DB);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error("blocked"));
    });
    if (!db.objectStoreNames.contains("logger")) { db.close(); return []; }
    const tx = db.transaction("logger", "readonly");
    const idx = tx.objectStore("logger").index("createtime");
    const out = [];
    await new Promise((res, rej) => {
      const q = idx.openCursor(IDBKeyRange.lowerBound(LT), "next");
      q.onsuccess = () => {
        const c = q.result;
        if (!c) { res(); return; }
        const v = c.value;
        if (v && typeof v.createtime === "number" && v.createtime > LT) {
          out.push({
            l: v.level || "info",
            m: String(v.message || "").slice(0, 2000),
            n: (v.label && v.label.name) || "",
            c: (v.label && v.label.component) || "",
            t: v.createtime
          });
        }
        c.continue();
      };
      q.onerror = () => rej(q.error);
    });
    db.close();
    return out;
  } catch (e) {
    return [{ l: "error", m: "读取脚本猫日志失败: " + (e && e.message || e), n: "", c: "", t: 0 }];
  }
})()"""

# 探测表达式：枚举扩展自身的所有 IndexedDB，返回含「logger」日志表的库名（用于识别脚本猫/扩展猫）
_SC_PROBE_JS = """(async () => {
  try {
    const dbs = await indexedDB.databases();
    const out = [];
    for (const d of (dbs || [])) {
      const name = d.name;
      const r = await new Promise((res, rej) => {
        const req = indexedDB.open(name);
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
        req.onblocked = () => rej(new Error("blocked"));
      });
      let hasLogger = false;
      try {
        for (const n of r.objectStoreNames) {
          if (n === "logger") { hasLogger = true; break; }
        }
      } catch (e) {}
      r.close();
      out.push({ name: name, logger: hasLogger });
    }
    return out;
  } catch (e) {
    return { err: String(e && e.message || e) };
  }
})()"""


def _sc_find_candidates(port):
    """返回所有候选 CDP 目标 ws：扩展 service worker / 扩展页面（不依赖扩展名与 ID）"""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=3) as r:
            targets = json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return []
    candidates = []
    for t in targets:
        ws = t.get("webSocketDebuggerUrl")
        if not ws:
            continue
        url = (t.get("url") or "").lower()
        ttype = t.get("type")
        if ttype == "service_worker" and url.startswith("chrome-extension://"):
            candidates.append(ws)
        elif ttype == "page" and url.startswith("chrome-extension://"):
            candidates.append(ws)
        elif SC_EXT_ID and SC_EXT_ID in url:
            candidates.append(ws)
    seen, out = set(), []
    for c in candidates:
        if c not in seen:
            seen.add(c)
            out.append(c)
    return out


def _sc_probe_dbname(ws):
    """连接候选目标并探测其 IndexedDB，返回拥有「logger」日志表的库名（识别脚本猫/扩展猫）；
    非脚本猫或失败返回 None"""
    try:
        sess = _CdpSession(ws)
        try:
            res = sess.evaluate(_SC_PROBE_JS, timeout=15)
        finally:
            sess.close()
        if isinstance(res, list):
            for d in res:
                if d.get("logger"):
                    return d.get("name")
    except Exception:
        pass
    return None


# ==============================================
# 📋 朱雀通知：解析「脚本猫-微软积分商城签到脚本」输出的 QLREPORT 结构化日志，按账号发送通知
# ==============================================
_QL_START_PREFIX = "[QLREPORT-START]"
_QL_END_PREFIX = "[QLREPORT-END]"
_QL_MSG_PREFIX = "[QLREPORT-MSG]"
_QL_START_SENT = {}      # (name, date) -> True，启动通知每日每账号仅发一次
_QL_SENT_LOCK = threading.Lock()


def _fmt_start_report(data):
    """格式化启动报告：今日任务数量"""
    lines = ["🛠️ 今日任务数量："]
    sc = data.get("search") or {}
    lines.append(f"  🔍 搜索：电脑 {sc.get('pc', 0)} 积分 + 手机 {sc.get('m', 0)} 积分")
    rd = data.get("read") or {}
    lines.append(f"  📖 阅读：约 {rd.get('articles', 0)} 篇（上限 {rd.get('max', 30)} 积分）")
    pm = data.get("promos") or {}
    lines.append(f"  🧩 活动：{pm.get('count', 0)} 个")
    sg = data.get("sign") or {}
    lines.append(f"  📅 签入：{sg.get('count', 1)} 次")
    return "\n".join(lines)


def _fmt_end_report(data):
    """格式化结束报告：任务进度 + 积分汇总"""
    lines = ["🏁 任务结束，进度汇总："]
    sc = data.get("search")
    if sc:
        lines.append(f"  🔍 搜索：{sc.get('pc', '-')}（电脑） / {sc.get('m', '-')}（手机）")
    rd = data.get("read")
    if rd:
        lines.append(f"  📖 阅读：{rd}")
    pm = data.get("promos")
    if pm:
        lines.append(f"  🧩 活动：{pm}")
    sg = data.get("sign")
    if sg:
        lines.append(f"  📅 签入：{sg}")
    if data.get("todayPoints") is not None:
        lines.append(f"✨ 今日获得积分：{data['todayPoints']}")
    if data.get("availablePoints") is not None:
        lines.append(f"💰 当前总积分：{data['availablePoints']}")
    return "\n".join(lines)


def _handle_ql_report(name, line):
    """处理一条 QLREPORT 日志：启动报告每日每账号发一次，结束报告直接发。
    返回是否需要在任务日志中打印（START 不打印，END/MSG 打印结果）。"""
    try:
        end = line.index("]")
        prefix = line[:end + 1]
        data = json.loads(line[end + 1:])
    except Exception:
        return False
    if prefix == _QL_START_PREFIX:
        today = time.strftime("%Y-%m-%d")
        with _QL_SENT_LOCK:
            key = (name, today)
            if key in _QL_START_SENT:
                return False
            _QL_START_SENT[key] = True
        send(f"【{name}】今日任务开始", _fmt_start_report(data))
        return False
    elif prefix == _QL_END_PREFIX:
        send(f"【{name}】任务结束", _fmt_end_report(data))
        _on_account_done(name, data)
        return True
    elif prefix == _QL_MSG_PREFIX:
        send(f"【{name}】{data.get('title', '')}", data.get('text', ''))
        return True
    return False


# ==============================================
# ✅ 账号任务完成跟踪：单账号完成即关浏览器，全部完成即通知并停止任务
# ==============================================
_ACCOUNT_BROWSERS = {}    # name -> {"pid":.., "port":..}
_ACCOUNT_END_DATA = {}    # name -> 结束报告数据
_ACCOUNT_DONE = {}        # name -> True
_ACCOUNT_LOCK = threading.Lock()
_ALL_DONE = threading.Event()

# 「脚本在跑」脚印：任一该账号的用户脚本日志（含 QLREPORT）都算数。
# 只要有一条，就说明脚本确实运行了，不再触发「完全没跑」告警。
_WATCH_START = {}          # name -> 开始监视时刻（浏览器启动完成时登记）
_SCRIPT_FOOTPRINT = {}     # name -> True（采集到该账号任意用户脚本日志）
_LAST_LOG_TS = {}          # name -> 最近一条用户脚本日志的时刻（用于「跑到一半停摆」判断）
_FIRST_LOG_TS = {}         # name -> 首条用户脚本日志的时刻（脚本已加载好的信号，用于校准时机）
_CALIBRATED = threading.Event()   # 本次运行是否已做过「开跑前版本校准」
_NORUN_ALERTED = set()     # 已告警过的账号，避免每轮检查都重复弹
_STALL_ALERTED = {}        # name -> 上次「停摆」告警时刻（隔一段时间才重复告警/重试修复）
_STALL_TRIES = {}          # name -> 已经尝试过几次自动修复（第 2 次起改成 reload 扩展）
_NORUN_LOCK = threading.Lock()

# 脚本「跑到一半彻底停摆」判定：某账号最近一条脚本日志已经过去多少分钟
STALL_ALERT_MIN = int(os.getenv("STALL_ALERT_MIN", "25"))
# 停摆后是否尝试自动修复（重新确认脚本已启用 → 必要时 reload 扩展），默认开
SC_STALL_REPAIR = os.getenv("SC_STALL_REPAIR", "1") in ("1", "true", "yes", "on")
# 同一账号两次停摆告警/修复之间的最小间隔（分钟），避免把 CDP 打爆
STALL_ALERT_EVERY_MIN = int(os.getenv("STALL_ALERT_EVERY_MIN", "60"))


def mark_script_footprint(name):
    """采集到该账号任意用户脚本日志时调用：记下脚本确实在跑"""
    with _NORUN_LOCK:
        _SCRIPT_FOOTPRINT[name] = True
        _FIRST_LOG_TS.setdefault(name, time.time())
        _LAST_LOG_TS[name] = time.time()


def _on_account_done(name, data):
    """账号任务全部完成：保存进度 → 关闭该浏览器 → 全部完成则汇总通知并停止"""
    with _ACCOUNT_LOCK:
        if _ACCOUNT_DONE.get(name):
            return
        _ACCOUNT_DONE[name] = True
        _ACCOUNT_END_DATA[name] = data
        info = _ACCOUNT_BROWSERS.get(name)
    if info and (info.get("port") or info.get("pid")):
        logger.info(f"✅ 账号 {name} 任务全部完成，关闭浏览器")
        close_browser(info.get("user_dir"), info.get("port"))
    if data is None:
        # 休眠场景（任务早已完成、本次只是复检）→ 关闭浏览器并通知，节省资源
        send("【账号完成】", f"✅ 账号 {name} 今日任务已完成，浏览器已关闭（休眠节省资源）。")
    with _ACCOUNT_LOCK:
        remaining = [n for n, _ in _ACCOUNT_BROWSERS.items() if not _ACCOUNT_DONE.get(n)]
        all_names = list(_ACCOUNT_BROWSERS.keys())
    if not remaining and all_names:
        parts = []
        for n in all_names:
            d = _ACCOUNT_END_DATA.get(n)
            parts.append(f"【{n}】\n" + (_fmt_end_report(d) if d else "已完成"))
        send("【任务完成】全部账号已完成", "✅ 全部账号任务已完成！\n\n" + "\n\n".join(parts))
        _ALL_DONE.set()


def _sc_reader(name, port):
    """轮询读取脚本猫/扩展猫 IndexedDB 日志（=扩展「运行日志」同一数据源），
    仅打印日志内容（精简），错误日志额外发送通知"""
    baseline = SC_LOG_BASELINE
    while True:
        dbname, ws = None, None
        for cand in _sc_find_candidates(port):
            dn = _sc_probe_dbname(cand)
            if dn:
                dbname, ws = dn, cand
                break
        if not ws:
            time.sleep(5)
            continue
        try:
            sock = _ws_connect(ws)
        except Exception:
            time.sleep(5)
            continue
        sock.settimeout(1)
        if baseline == "all":
            # 首次倾倒：从「脚本运行开始时刻」起拉日志，识别「今日已完成」的账号并关闭浏览器
            #（不拉脚本运行前的历史日志，避免跨天残留/手动复跑的历史日志误触发关闭）
            last_ts = _SCRIPT_START_TS
            baseline = "now"
        else:
            last_ts = int(time.time() * 1000)   # 只采集本次任务期间的新日志
        next_poll = time.time() + SC_LOG_POLL
        pending = {}   # 命令 id -> "poll"
        try:
            while True:
                try:
                    msg = _ws_recv_message(sock)
                except socket.timeout:
                    msg = None
                if msg is not None:
                    try:
                        ev = json.loads(msg)
                    except Exception:
                        ev = None
                    if ev is not None:
                        if ev.get("id") is not None:
                            kind = pending.pop(ev["id"], None)
                            if kind == "poll":
                                res = ((ev.get("result") or {}).get("result") or {})
                                if not res.get("exceptionDetails"):
                                    max_ts = last_ts
                                    errs = []
                                    for lg in (res.get("value") or []):
                                        t = int(lg.get("t") or 0)
                                        if t > max_ts:
                                            max_ts = t
                                        if t and t <= last_ts:
                                            continue
                                        lvl = lg.get("l") or "info"
                                        comp = lg.get("c") or ""
                                        sname = (lg.get("n") or "").strip()
                                        # 完全忽略脚本猫插件自身日志：只采集能识别出用户脚本（有脚本名）的日志
                                        if not sname:
                                            continue
                                        # 脚印：有用户脚本日志 = 脚本确实在跑（用于「完全没跑」告警兜底）
                                        mark_script_footprint(name)
                                        if comp and comp != "GM_log":
                                            tag = f"内部[{comp}]"
                                        else:
                                            tag = sname[:40]
                                        line = (lg.get("m") or "").replace("\n", " ↵ ")
                                        if line.startswith("[QLREPORT-"):
                                            # QLREPORT 结构化报告：不打印，仅走通知
                                            _handle_ql_report(name, line)
                                            continue
                                        # 休眠日志 = 该账号今日任务早已完成、本次只是复检 → 直接关闭浏览器节省资源
                                        if "今日所选任务已全部完成" in line and "休眠" in line:
                                            _on_account_done(name, None)
                                        ts = lg.get("t") or 0
                                        tt = time.strftime("%H:%M:%S", time.localtime(ts / 1000)) if ts else "--:--:--"
                                        print(f"[{tt}] [{name}] [{lvl}] {line}", flush=True)
                                        if lvl == "error":
                                            errs.append(f"{tag}: {line}")
                                    if max_ts > last_ts:
                                        last_ts = max_ts
                                    if errs:
                                        send("【脚本猫错误日志】",
                                             f"账号 {name}:\n" + "\n".join(errs[:10]))
                if time.time() >= next_poll:
                    pid = _cdp_send(sock, "Runtime.evaluate", {
                        "expression": _SC_IDB_TEMPLATE
                                      .replace("__DB__", json.dumps(dbname))
                                      .replace("__LT__", str(last_ts)),
                        "awaitPromise": True,
                        "returnByValue": True,
                    })
                    pending[pid] = "poll"
                    next_poll = time.time() + SC_LOG_POLL
        except Exception:
            pass
        finally:
            try:
                sock.close()
            except Exception:
                pass
        time.sleep(3)


def _sc_watch(name, port):
    """周期确保脚本猫日志读取线程存活（扩展 service worker 重启/挂起后自动重连）"""
    while True:
        if not any(th.name == f"sc-{name}" for th in threading.enumerate()):
            th = threading.Thread(target=_sc_reader, args=(name, port), name=f"sc-{name}", daemon=True)
            th.start()
        time.sleep(15)


def _stall_repair(name, port, attempt):
    """账号跑到一半停摆时的自动修复（只碰扩展/脚本启用状态，不关浏览器）。

    attempt=1：确认「脚本还在、还启用」——静默更新后脚本可能被更新成关闭状态，
               cron 就再也不敲门了（实跑日志里 marvin 15:04 更新成功后彻底静默）。
    attempt=2：上面没用就 reload 一次扩展，让后台 SW 重建、cron 重新挂上。

    返回 (ok, detail)。任何异常都只记日志，绝不影响主任务。
    """
    sd = _load_sc_deploy()
    if not sd:
        return False, "sc_deploy.py 不可用"
    try:
        log = lambda m: logger.info("    " + str(m).strip())
        res = sd.ensure_browser(port, ext_dir=_scriptcat_ext_dir(None), user_dir=None,
                                script_id=SC_SCRIPT_ID, name_hint=SC_SCRIPT_NAME,
                                grant=False, run=False, log=log)
        if not res.get("ok"):
            return False, str(res.get("detail") or "ensure_browser 未成功")
        ext_id = res.get("ext_id")
        if attempt >= 2 and ext_id:
            ok = sd.reload_ext(port, ext_id, log=log)
            return bool(ok), ("已 reload 扩展 %s" % ext_id) if ok else "reload 扩展失败"
        return True, "脚本已确认存在且启用（v%s）" % (res.get("version") or "?")
    except Exception as e:
        return False, "%s: %s" % (type(e).__name__, e)


def _no_run_watch():
    """🚨 脚本运行守护：两种异常各查一次。

    ① 完全没跑：浏览器已启动、过了宽限期，但从头到尾一条用户脚本日志都没有
       （连心跳都没有）→ 告警。一旦采集到任意脚印就永久跳过该账号（本次任务内）。
    ② 跑到一半停摆：本来有日志，但最近一条已经过去 STALL_ALERT_MIN 分钟，
       而账号还没报「全部完成」→ 告警 + 自动修复（见 _stall_repair）。

    ② 是实跑日志里那台 marvin 的写照：15:04 静默更新成功之后，它的浏览器一直开着，
    却再也不敲门 —— 三个多小时里 4 个账号只有 3 个在干活，光看「有没有脚印」的
    ① 号检查是发现不了的（它早就有脚印了）。"""
    check_every = 120    # 每 2 分钟检查一次
    while True:
        time.sleep(check_every)
        now = time.time()
        with _ACCOUNT_LOCK:
            names = list(_ACCOUNT_BROWSERS.keys())
            ports = {n: (_ACCOUNT_BROWSERS.get(n) or {}).get("port") for n in names}
            done = set(_ACCOUNT_DONE.keys())
        with _NORUN_LOCK:
            starts = dict(_WATCH_START)
            feet = set(_SCRIPT_FOOTPRINT)
            alerted = set(_NORUN_ALERTED)
            last_ts = dict(_LAST_LOG_TS)
            stall_alerted = dict(_STALL_ALERTED)

        # ── ① 完全没跑 ──
        for n in names:
            if n in done or n in feet or n in alerted:
                continue
            started_at = starts.get(n)
            if not started_at or (now - started_at) < NO_RUN_GRACE_MIN * 60:
                continue
            # 宽限期已过仍零脚印 → 判定脚本未运行，单独告警
            with _NORUN_LOCK:
                _NORUN_ALERTED.add(n)
            msg = (f"账号 {n} 的浏览器已启动，但 {NO_RUN_GRACE_MIN} 分钟内"
                   f"没有收到任何脚本运行日志（连一轮结束心跳都没有）。\n"
                   f"脚本可能没有运行：请检查脚本猫扩展是否启用、脚本是否已打开、"
                   f"或该账号 Cookie 是否失效。")
            send(f"【告警】账号 {n} 脚本未运行", msg)
            logger.warning(f"🚨 账号 {n} 脚本未运行（{NO_RUN_GRACE_MIN} 分钟内零脚印）")

        # ── ② 跑到一半停摆 ──
        if STALL_ALERT_MIN <= 0:
            continue
        for n in names:
            if n in done or n not in feet:
                continue
            ts = last_ts.get(n)
            if not ts or (now - ts) < STALL_ALERT_MIN * 60:
                # 已经恢复敲门：修复计数清零，下次停摆从「轻修复」重新开始
                if _STALL_TRIES.get(n):
                    with _NORUN_LOCK:
                        _STALL_TRIES[n] = 0
                        _STALL_ALERTED.pop(n, None)
                continue
            prev = stall_alerted.get(n) or 0
            if prev and (now - prev) < STALL_ALERT_EVERY_MIN * 60:
                continue
            with _NORUN_LOCK:
                _STALL_ALERTED[n] = now
                # 第几次修：1=只确认脚本启用，≥2=reload 扩展
                attempt = int(_STALL_TRIES.get(n) or 0) + 1
                _STALL_TRIES[n] = attempt
            silent_min = int((now - ts) / 60)
            logger.warning(f"🚨 账号 {n} 脚本已静默 {silent_min} 分钟"
                           f"（阈值 {STALL_ALERT_MIN} 分钟）→ 第 {attempt} 次自动修复尝试")
            ok, detail = (False, "已关闭自动修复（SC_STALL_REPAIR=0）")
            if SC_STALL_REPAIR and ports.get(n):
                ok, detail = _stall_repair(n, ports[n], attempt)
            if ok:
                logger.info(f"  ✅ 账号 {n} 修复完成：{detail}")
                send(f"【告警】账号 {n} 脚本停摆已尝试修复",
                     f"账号 {n} 最近 {silent_min} 分钟没有脚本日志，已自动处理：\n{detail}\n"
                     f"请留意后续是否恢复敲门（每分钟一行 exec script complete）。")
            else:
                logger.warning(f"  ⚠️ 账号 {n} 自动修复未成功：{detail}")
                send(f"【告警】账号 {n} 脚本停摆",
                     f"账号 {n} 最近 {silent_min} 分钟没有任何脚本日志，自动修复失败：\n{detail}\n"
                     f"建议手动打开该账号浏览器，在脚本猫里确认脚本处于「启用」状态。")


def find_chrome():
    """查找 Chromium 可执行文件路径"""
    if CHROME_BIN and os.path.isfile(CHROME_BIN):
        return CHROME_BIN
    for name in ["ungoogled-chromium", "chromium", "chromium-browser",
                  "google-chrome", "google-chrome-stable", "chrome"]:
        p = shutil.which(name)
        if p:
            return p
    for p in ["/usr/bin/ungoogled-chromium", "/usr/bin/chromium",
              "/usr/bin/chromium-browser", "/opt/google/chrome/chrome"]:
        if os.path.isfile(p):
            return p
    raise FileNotFoundError("❌ 未找到 Chromium 可执行文件，请设置环境变量 CHROME_BIN")


def get_running_pid(user_dir: str):
    """返回使用该用户目录的浏览器主进程 PID，无则返回 None"""
    try:
        ret = subprocess.run(
            ["pgrep", "-f", f"user-data-dir={user_dir}"],
            capture_output=True, text=True
        )
        if ret.returncode == 0 and ret.stdout.strip():
            return int(ret.stdout.strip().split()[0])
    except Exception:
        pass
    return None


def _browser_argv(pid: int) -> list:
    """读进程 /proc/<pid>/cmdline（浏览器真实启动参数）"""
    try:
        with open(f"/proc/{pid}/cmdline", "rb") as f:
            raw = f.read()
        return [a.decode("utf-8", "replace") for a in raw.split(b"\0") if a]
    except Exception:
        return []


def _browser_launch_mode(user_dir: str):
    """该 profile 正在运行的浏览器是「带界面」还是「无头」。

    为什么需要：GUI 模式最阴的一个坑是——上一轮残留的无头实例还在跑，
    `get_running_pid` 一看就「本次沿用」，于是永远不会有窗口，noVNC 桌面
    一片空白，日志却显示一切正常（浏览器确实在运行）。只有读 cmdline 里的
    --headless 才能区分。
    返回 ("headless"|"gui"|"unknown"|None, pid)。"""
    pid = get_running_pid(user_dir)
    if not pid:
        return None, None
    argv = _browser_argv(pid)
    if not argv:
        return "unknown", pid
    if any(a.startswith("--headless") for a in argv):
        return "headless", pid
    if any(a.startswith("--ozone-platform") or a == "--start-maximized" for a in argv):
        return "gui", pid
    return "unknown", pid


def _mode_label(mode) -> str:
    return {"headless": "无头（无窗口）", "gui": "带界面", "unknown": "未知"}.get(mode, "未运行")


def kill_all_for_profile(user_dir: str):
    """强制结束所有使用该用户目录的浏览器进程（含子进程树）。
    用于切换到 GUI 模式前彻底清理残留 headless 实例，避免与 GUI 抢 profile。"""
    try:
        ret = subprocess.run(
            ["pgrep", "-f", f"user-data-dir={user_dir}"],
            capture_output=True, text=True
        )
        pids = [int(x) for x in ret.stdout.strip().split()] if ret.returncode == 0 and ret.stdout.strip() else []
        for pid in pids:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                continue
        for _ in range(10):
            alive = []
            for pid in pids:
                try:
                    os.kill(pid, 0)
                    alive.append(pid)
                except ProcessLookupError:
                    pass
            if not alive:
                break
            time.sleep(1)
        for pid in pids:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        if pids:
            logger.info(f"  🧹 已清理 profile 残留浏览器进程: {pids}")
    except Exception:
        pass


def _force_chinese_ui(user_dir: str):
    """强制浏览器 UI 语言为中文：修改 profile 的 Default/Preferences 中
    intl.selected_languages 与 intl.app_locale（chromium UI 语言在首次创建
    profile 时由 selected_languages 决定，--lang 参数只影响网页 Accept-Language，
    不改变已初始化 profile 的 UI 语言）。
    关键：若 Preferences 尚不存在（首次启动），必须提前创建并写入中文 intl 配置，
    否则浏览器会按默认英文创建 profile 导致 UI 固化为英文。"""
    try:
        prefs_path = os.path.join(user_dir, "Default", "Preferences")
        if os.path.exists(prefs_path):
            with open(prefs_path, "r", encoding="utf-8") as f:
                prefs = json.load(f)
        else:
            # 首次启动：预先创建中文 UI 配置，避免英文 profile 固化
            os.makedirs(os.path.dirname(prefs_path), exist_ok=True)
            prefs = {}
        intl = prefs.setdefault("intl", {})
        if (intl.get("selected_languages") != "zh-CN,zh,en-US,en"
                or intl.get("app_locale") != "zh-CN"):
            intl["selected_languages"] = "zh-CN,zh,en-US,en"
            intl["app_locale"] = "zh-CN"
            prefs["intl"] = intl
            with open(prefs_path, "w", encoding="utf-8") as f:
                json.dump(prefs, f, ensure_ascii=False)
            logger.info("  🌐 已强制设置浏览器 UI 语言为中文")
    except Exception as e:
        logger.warning(f"  ⚠️ 设置浏览器 UI 语言失败: {e}")


def _prep_profile(user_dir: str, kill_existing: bool = True):
    """启动浏览器前清理 profile：杀掉同目录旧实例并删除残留锁文件。
    避免旧 chromium 进程/残留 Singleton 锁导致新实例无法启动或多实例抢占窗口。
    用户脚本由模板 _template 预装（ScriptCat 扩展经 --load-extension 加载；账号 profile
    已引用脚本猫解压扩展时自动跳过，避免重复加载——模板手动安装后新账号克隆自模板即自带），
    无需每次安装。"""
    if kill_existing:
        kill_all_for_profile(user_dir)
        time.sleep(1)
    _force_chinese_ui(user_dir)
    for f in ("SingletonLock", "SingletonCookie", "SingletonSocket"):
        try:
            p = os.path.join(user_dir, f)
            if os.path.lexists(p):
                os.remove(p)
        except Exception:
            pass


# 浏览器扩展自动加载目录（放入含 manifest.json 的解压扩展目录即自动加载）
EXTENSION_DIRS = ("/app/extensions", "/data/extensions")


def _profile_has_scriptcat(user_dir: str) -> bool:
    """profile 的 Preferences 是否已引用脚本猫解压扩展（path 指向 scriptcat 目录）。
    模板 _template 手动安装脚本猫后，新账号克隆自模板即自带该引用，无需再 --load-extension。"""
    try:
        prefs = os.path.join(user_dir, "Default", "Preferences")
        if not os.path.exists(prefs):
            return False
        with open(prefs, "r", encoding="utf-8") as f:
            d = json.load(f)
        settings = d.get("extensions", {}).get("settings", {})
        return any(
            isinstance(v, dict) and str(v.get("path", "")).rstrip("/").endswith("scriptcat")
            for v in settings.values()
        )
    except Exception:
        return False


def _extension_load_arg(user_dir: str = None):
    """返回 --load-extension 参数（逗号分隔的已解包扩展目录）。
    通用机制：把含 manifest.json 的解压扩展目录放入 EXTENSION_DIRS 中任一目录即自动加载，
    例如 /app/extensions/scriptcat（已打包脚本猫 ScriptCat）。
    若 profile 已引用脚本猫解压扩展（模板手动安装/账号克隆自模板自带），则返回 None 跳过，
    避免与已加载扩展重复加载冲突。无可用扩展时返回 None。"""
    if user_dir and _profile_has_scriptcat(user_dir):
        return None
    dirs = []
    # zy.py 同目录下的 scriptcat/ 也允许被 --load-extension 直接加载
    sib = _scriptcat_ext_dir(user_dir)
    if sib and os.path.dirname(os.path.abspath(sib)) in (
            HERE, os.path.join(HERE, "extensions")):
        dirs.append(sib)
    for base in EXTENSION_DIRS:
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            ext_dir = os.path.join(base, name)
            if os.path.isdir(ext_dir) and os.path.exists(os.path.join(ext_dir, "manifest.json")):
                dirs.append(ext_dir)
    if not dirs:
        return None
    return "--load-extension=" + ",".join(dirs)


def _scriptcat_ext_dir(user_dir: str = None):
    """脚本猫解包扩展目录：优先 SC_EXT_DIR，其次 zy.py 同目录，再 /app|/data/extensions。

    支持把这几种东西放在 zy.py 旁边（面板只上传一个目录时最省事）：
      ./scriptcat/            （含 manifest.json 的解包扩展）
      ./sc-ext/               （本地测试用的目录名）
      ./extensions/*/         （任意解包扩展）
    """
    if SC_EXT_DIR and os.path.exists(os.path.join(SC_EXT_DIR, "manifest.json")):
        return SC_EXT_DIR
    bases = [HERE, os.path.join(HERE, "extensions")] + list(EXTENSION_DIRS)
    # 先按名字找 scriptcat
    for base in bases:
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            p = os.path.join(base, name)
            if (os.path.isdir(p) and os.path.exists(os.path.join(p, "manifest.json"))
                    and re.search(r"scriptcat|sc-ext", name, re.I)):
                return p
    # 兜底：任意一个可加载的解包扩展目录（老镜像里目录名可能不叫 scriptcat）
    for base in bases:
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            p = os.path.join(base, name)
            if os.path.isdir(p) and os.path.exists(os.path.join(p, "manifest.json")):
                return p
    return None


def _load_sc_deploy():
    """加载同目录的 sc_deploy.py（缺失/导入失败时返回 None，不影响主任务）。"""
    try:
        if HERE not in sys.path:
            sys.path.insert(0, HERE)
        import sc_deploy
        return sc_deploy
    except Exception as e:
        logger.warning(f"⚠️ 未能加载 sc_deploy.py（脚本猫自动部署不可用）: {e}")
        return None


def _ensure_script_deploy(name: str, user_dir: str, port: int, run: bool = False) -> bool:
    """给某个账号的浏览器把「脚本猫扩展 + 商店脚本」准备到可用状态（幂等）。

    新加的用户第一次跑任务时，profile 是空的：没有扩展、没有脚本、没有 Cookie 授权，
    这里统一用同目录 sc_deploy.py 通过 CDP 装好，不需要人工在浏览器里点。
    已装过的账号只会做「确保启用 + 补授权」这类轻量检查，几秒内返回。
    """
    if not SC_AUTO_DEPLOY or not port:
        return False
    sd = _load_sc_deploy()
    if not sd:
        return False
    ext_dir = _scriptcat_ext_dir(user_dir)
    logger.info(f"🧩 检查账号 {name} 的脚本猫扩展/脚本（CDP {port}）...")
    try:
        res = sd.ensure_browser(
            port,
            ext_dir=ext_dir,
            user_dir=user_dir,
            script_id=SC_SCRIPT_ID,
            name_hint=SC_SCRIPT_NAME,
            grant=True,
            run=run,
            log=lambda m: logger.info("   " + str(m).strip()),
        )
    except Exception as e:
        logger.warning(f"  ⚠️ 账号 {name} 脚本猫部署异常（不影响任务继续）: {e}")
        return False

    if res.get("ok"):
        if res.get("installed"):
            logger.info(f"  ✅ 账号 {name} 已装好脚本猫扩展 + 商店脚本 v{res.get('version')}")
        else:
            logger.info(f"  ✅ 账号 {name} 脚本已就绪 v{res.get('version')}"
                        f"（{'新装' if res.get('installed') else '沿用已装'}）")
        if res.get("cookie_ok"):
            logger.info(f"  🔑 账号 {name} Cookie 授权已就绪（下次运行不再弹窗）")
        return True
    logger.warning(f"  ⚠️ 账号 {name} 脚本猫部署未完成：{res.get('detail') or '见上方日志'}")
    return False


# ── 启动前校准脚本版本：落后于商店就更新 ────────────────────────────────────
# 商店版本只在进程内取一次（10 分钟缓存）：4 个账号串行启动时不该打 4 次商店接口。
_STORE_VER = {"ver": None, "ts": 0.0}
_STORE_LOCK = threading.Lock()


def _ver_tuple(v):
    """把 "0.72" / "v1.2.3" 解析成可比较的元组；解析不出来返回 None。"""
    nums = re.findall(r"\d+", str(v or ""))
    return tuple(int(x) for x in nums) if nums else None


def _store_script_version(sd):
    """商店里脚本的最新版本号（带 10 分钟进程内缓存）。取不到返回 None。"""
    now = time.time()
    with _STORE_LOCK:
        if _STORE_VER["ver"] and (now - _STORE_VER["ts"]) < 600:
            return _STORE_VER["ver"]
    try:
        _code, ver, _meta = sd.fetch_store_script(SC_SCRIPT_ID)
    except Exception as e:
        logger.info(f"   [!] 取商店版本失败，本次跳过版本校准: {e}")
        return None
    with _STORE_LOCK:
        _STORE_VER["ver"] = ver
        _STORE_VER["ts"] = now
    return ver


def _ensure_script_latest(name: str, port: int, user_dir: str = None,
                          ext_id: str = None) -> bool:
    """校准签到脚本版本：比商店旧就更新到最新（幂等，失败不影响任务）。

    调用时机由调用方决定：正常任务里只在「脚本猫首轮心跳到了、任务还没开跑」时
    统一做一次（见 _pre_task_calibrate），不在浏览器刚拉起时做。
    ext_id 已由调用方认好时直接传进来，省一次 chrome://extensions 探测。
    返回 True = 已是最新（或已成功更新）；False = 检查/更新没成功（只记日志）。
    """
    if not SC_AUTO_UPDATE or not port:
        return False
    sd = _load_sc_deploy()
    if not sd:
        return False
    log = lambda m: logger.info("   " + str(m).strip())
    try:
        # 扩展 ID 只认一次：读版本、更新都要它，重复去 chrome://extensions 认太慢。
        # guess=False：路径哈希只是猜的，猜错会让后面误判「扩展没加载」。
        eid = ext_id or sd.resolve_ext_id(port, ext_dir=_scriptcat_ext_dir(user_dir),
                                          user_dir=user_dir, guess=False) or None
        st = sd.get_status(port, name_hint=SC_SCRIPT_NAME, ext_id=eid)
        if not st.get("ok"):
            logger.warning(f"  ⚠️ 账号 {name} 读不到已装脚本版本：{st.get('detail') or '未知'}")
            return False
        cur = st.get("version")
        store = _store_script_version(sd)
        if not store:
            return False
        cur_t, store_t = _ver_tuple(cur), _ver_tuple(store)
        if cur_t is not None and store_t is not None:
            if cur_t > store_t:
                logger.info(f"  🔎 账号 {name} 脚本 v{cur} 比商店 v{store} 新（本地开发版），保留不降级")
                return True
            if cur_t == store_t:
                logger.info(f"  🔎 账号 {name} 脚本已是最新 v{cur}"
                            f"{'（已启用）' if st.get('status') == 1 else '（注意：当前未启用）'}")
                return True

        logger.info(f"  ⬆️  账号 {name} 脚本 v{cur} 落后于商店 v{store}，开始更新…")
        r = sd.update_script(port, script_id=SC_SCRIPT_ID, name_hint=SC_SCRIPT_NAME,
                             ext_id=eid, log=log)
        if r.get("ok"):
            logger.info(f"  ✅ 账号 {name} 脚本已更新：v{r.get('before')} → v{r.get('after')}"
                        f"（商店 v{r.get('store')}）")
            return True
        logger.warning(f"  ⚠️ 账号 {name} 脚本更新未完成：{r.get('detail') or '见上方日志'}"
                       f"（当前 v{r.get('before')} / 商店 v{r.get('store')}）")
        return False
    except Exception as e:
        logger.warning(f"  ⚠️ 账号 {name} 脚本版本检查异常（不影响任务继续）: {e}")
        return False


# ── 开跑前一次性校准（脚本 + 扩展插件）────────────────────────────────────
def _ensure_ext_latest(name: str, port: int, user_dir: str = None,
                       ext_id: str = None) -> dict:
    """校准脚本猫扩展插件本身：磁盘上有更新版本就 reload，商店版就点一次更新。

    只 reload 扩展，**绝不重启浏览器**：同一路径的扩展 ID 不变，脚本与
    Cookie 授权都保留，代价只是后台 SW 重建一次。
    返回 {ok, changed, before, after}；changed=True 时调用方应等几秒再读脚本。
    """
    out = {"ok": False, "changed": False, "before": "", "after": ""}
    if not SC_EXT_UPDATE or not port:
        return out
    sd = _load_sc_deploy()
    if not sd:
        return out
    ext_dir = _scriptcat_ext_dir(user_dir)
    eid = ext_id or sd.resolve_ext_id(port, ext_dir=ext_dir, user_dir=user_dir,
                                      guess=False) or None
    if not eid:
        logger.info(f"  🔎 账号 {name} 认不到脚本猫扩展 ID，跳过扩展版本校准")
        return out
    try:
        r = sd.ensure_ext_current(port, eid, ext_dir=ext_dir, allow_store=True,
                                  log=lambda m: logger.info("   " + str(m).strip()))
    except Exception as e:
        logger.warning(f"  ⚠️ 账号 {name} 扩展版本检查异常（不影响任务继续）: {e}")
        return out
    out.update(ok=bool(r.get("ok")), changed=bool(r.get("changed")),
               before=r.get("before") or "", after=r.get("after") or "")
    if r.get("changed"):
        logger.info(f"  ⬆️  账号 {name} 脚本猫扩展已更新：v{r.get('before')} → v{r.get('after')}"
                    f"（来源：{'磁盘解包目录' if r.get('source') == 'disk' else '商店'}）")
        return out
    ver = r.get("after") or r.get("before") or "?"
    if r.get("ok"):
        logger.info(f"  🔎 账号 {name} 脚本猫扩展已是最新 v{ver}")
        return out
    logger.info(f"  🔎 账号 {name} 扩展版本未确认（v{ver}），继续执行任务")
    return out


def _calibrate_one(name: str, port: int, user_dir: str):
    """单个账号的开跑前校准：先扩展插件，再签到脚本（共用一次扩展 ID 探测）。"""
    sd = _load_sc_deploy()
    if not sd:
        return
    eid = None
    try:
        eid = sd.resolve_ext_id(port, ext_dir=_scriptcat_ext_dir(user_dir),
                                user_dir=user_dir, guess=False) or None
    except Exception:
        eid = None
    ext = {"changed": False}
    if SC_EXT_UPDATE:
        ext = _ensure_ext_latest(name, port, user_dir, ext_id=eid)
    if SC_AUTO_UPDATE:
        if ext.get("changed"):
            # 扩展刚 reload 过，后台 SW 还在重建，脚本列表可能一时读不到 → 等一会儿再读
            logger.info(f"   · 账号 {name} 扩展刚重载，等 4 秒让脚本猫重新注册脚本…")
            time.sleep(4)
        for attempt in range(3):
            try:
                # 扩展 ID 已认好，传进去省一次 chrome://extensions 探测
                if _ensure_script_latest(name, port, user_dir, ext_id=eid):
                    return
            except Exception as e:
                logger.warning(f"  ⚠️ 账号 {name} 脚本版本校准异常: {e}")
                return
            if attempt < 2:
                logger.info(f"   · 账号 {name} 脚本版本暂未读到，5 秒后重试（{attempt + 1}/2）")
                time.sleep(5)


def _pre_task_calibrate(browsers, plan=None, max_wait=None):
    """任务正式开跑前的一次性版本校准（脚本 + 扩展插件）。

    时机设计（用户要求）：
      · 启动阶段只把扩展/脚本「装好、启用、授权」，不做版本比对、不 reload；
      · 等脚本猫首轮心跳出现（说明扩展加载完、脚本读完计划，任务还没开跑），
        这时统一校准一次 —— 既不会漏掉落后版本，也不会在启动初始化期间
        把后台上下文打断；
      · 心跳等不到（脚本没跑起来）就按 max_wait 兜底校准，只做一次。
    全程只对已经在跑的浏览器操作，不重启浏览器，也不重复打开。
    """
    targets = [(n, p, u) for n, u, _pid, p, _r in browsers
               if p and not _ACCOUNT_DONE.get(n)]
    if not targets:
        return
    if _CALIBRATED.is_set():
        return
    limit = SC_CALIB_WAIT_SEC if max_wait is None else int(max_wait)
    deadline_ts = time.time() + max(0, limit)
    why = ""
    while True:
        now = time.time()
        with _NORUN_LOCK:
            ready = [n for n, _, _ in targets if n in _FIRST_LOG_TS]
        if len(ready) >= len(targets):
            why = "脚本猫首轮心跳已到"
            break
        if now >= deadline_ts:
            why = f"等了 {limit} 秒仍未见首轮心跳"
            break
        if _TERMINATED or _ALL_DONE.is_set():
            return
        dl = (plan or {}).get("deadline")
        if dl is not None:
            try:
                if datetime.now() >= dl:
                    return          # 已到收工时间，没必要再折腾版本
            except Exception:
                pass
        # 用 Event.wait 而不是 sleep：全部账号提前完成时能立刻退出
        if _ALL_DONE.wait(5) or _TERMINATED:
            return

    logger.info(f"🧩 开跑前版本校准（{why}）：只对已运行的浏览器操作，扩展只 reload、不重启浏览器")
    ths = []
    for n, p, u in targets:
        t = threading.Thread(target=_calibrate_one, args=(n, p, u),
                             name=f"calib-{n}", daemon=True)
        t.start()
        ths.append(t)
    for t in ths:
        t.join(timeout=240)
    _CALIBRATED.set()
    logger.info("🧩 开跑前版本校准结束（本次运行不再重复检查）")


def launch_chrome(user_dir: str, port: int = 0, headless: bool = True):
    """后台启动 Chromium（不阻塞，浏览器常驻）。
    headless=True  → --headless=new 无头模式（默认，省资源，CDP 自动化）；
    headless=False → 带界面（需 Wayland 桌面已运行，用于手动登录）。"""
    chrome = find_chrome()
    cmd = [
        chrome,
        "--no-sandbox",
        f"--user-data-dir={user_dir}",
        # 新用户首次运行要经 CDP 装「脚本猫」未打包扩展（Chrome 137+ 必须开这个开关；
        # 老版 Chromium 不认识该参数会忽略，不影响 --load-extension）
        "--enable-unsafe-extension-debugging",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080",
        "--accept-lang=zh-CN,zh,en-US,en",
        "https://rewards.bing.com",
    ]
    if headless:
        cmd.insert(3, "--headless=new")
        cmd.insert(4, "--disable-gpu")
    else:
        # 带界面：原生 Wayland（labwc 桌面），可经 noVNC 网页实时查看
        cmd.insert(3, "--ozone-platform=wayland")
        cmd.insert(4, "--start-maximized")
    # 注意：不要加 --disable-extensions，否则「脚本猫-微软积分商城签到脚本」无法运行
    if port:
        cmd.insert(3, f"--remote-debugging-port={port}")
        cmd.insert(4, "--remote-allow-origins=*")

    _ext = _extension_load_arg(user_dir)
    if _ext:
        cmd.insert(-1, _ext)  # 插在 URL 之前

    logger.info(f"🖥️  正在启动 Chromium（用户目录: {user_dir}, 无头={headless}）...")
    _prep_profile(user_dir)
    # ungoogled-chromium 忽略 --lang 参数，需靠环境变量 LANGUAGE/LANG 让 UI 与网页为中文。
    # 注意必须强制覆盖（而非 setdefault）：宿主/面板若已设置 LANG=en_US 等，
    # setdefault 不会覆盖，浏览器 UI 会退化为英文。
    env = dict(os.environ)
    env["LANG"] = "zh_CN.UTF-8"
    env["LANGUAGE"] = "zh_CN:zh"

    # 起不来就重试：profile 锁残留、上一次的 SingletonLock、磁盘/内存瞬时压力都会让
    # chromium 秒退。以前这里是「拉起就算成功」，秒退也当成功，结果一次运行白开一趟。
    last_err = ""
    for attempt in range(1, LAUNCH_ATTEMPTS + 1):
        _prep_profile(user_dir)
        proc = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                env=env, start_new_session=True)
        # 观察几秒：还在跑就认为起来了（chromium 崩溃基本都在 1~2 秒内）
        alive = True
        waited = 0.0
        while waited < LAUNCH_CHECK_SECONDS:
            if proc.poll() is not None:
                alive = False
                break
            time.sleep(0.5)
            waited += 0.5
        if alive:
            return proc
        last_err = f"exit={proc.returncode}"
        logger.warning(f"⚠️ Chromium 启动后立即退出（{last_err}，{user_dir}）"
                       f"→ 第 {attempt}/{LAUNCH_ATTEMPTS} 次尝试失败")
        try:
            close_browser(user_dir, port)      # 清掉这棵残留进程树，避免下次抢 profile 锁
        except Exception:
            pass
        if attempt < LAUNCH_ATTEMPTS:
            time.sleep(3)
    raise RuntimeError(f"Chromium 连续 {LAUNCH_ATTEMPTS} 次启动失败（{last_err}，{user_dir}）")


def _launch_fail(name: str, email: str, err: Exception):
    """单个账号启动失败：记日志 + 通知，但**不中断其它账号**（一个账号烂掉不该毁掉整轮）"""
    logger.error(f"❌ 账号 {name} 浏览器启动失败，跳过该账号继续其它账号：{err}")
    try:
        send("【账号启动失败】",
             f"账号 {name} ({email})\n{err}\n已跳过该账号，其余账号继续执行")
    except Exception:
        pass


def prelaunch_accounts(accounts) -> dict:
    """并发拉起所有账号的浏览器，让四账号几乎同时上线。

    以前是「启动 A → 等就绪 → 查登录 → 再启动 B…」的串行流程，四个账号前后差几分钟；
    而执行点是四账号共用的（同一分钟命中、同时开跑），后启动的账号容易错过第一个
    执行点、整天少跑一轮，搜索就做不完。
    这里只负责同时把进程拉起来；就绪等待、登录检查仍由主循环做（那时
    get_running_pid 已经命中，直接沿用，不会重复启动）。GUI 模式不走这里：
    桌面 autostart 本来就是一次把四个窗口全写好、一起打开的。
    """
    items = []
    for i, acc in enumerate(accounts):
        user_dir = os.path.join(CHROME_USER_DATA_BASE, f"user-{acc['name']}")
        Path(user_dir).mkdir(parents=True, exist_ok=True)
        items.append((acc["name"], user_dir, CDP_BASE_PORT + i if CDP_BASE_PORT else 0))
    if len(items) <= 1:
        return {}
    logger.info(f"🚀 并发拉起 {len(items)} 个账号的浏览器（同时上线，不再一个个排队）...")

    def _one(item):
        name, user_dir, port = item
        try:
            if get_running_pid(user_dir):
                return name, "kept", None
            proc = launch_chrome(user_dir, port, headless=True)
            return name, "ok", proc.pid
        except Exception as e:
            return name, "fail", e

    out = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(items)) as ex:
        for name, state, info in ex.map(_one, items):
            out[name] = state
            if state == "ok":
                logger.info(f"  🟢 {name} 浏览器已拉起（PID={info}）")
            elif state == "kept":
                logger.info(f"  🟡 {name} 浏览器已在运行，沿用")
            else:
                logger.warning(f"  🔴 {name} 拉起失败（{info}），主循环会再试一次")
    return out


LOGIN_HOSTS = ("login.live.com", "login.microsoftonline.com", "signin.live.com")
LOGIN_CHECK_WAIT = 8        # 打开 rewards dashboard 后等待「跳转到登录页」的秒数（过几秒未跳转即视为已登录）


class _CdpSession:
    """阻塞式 CDP 会话（不依赖 selenium/chromedriver）：发命令 → 等待对应 id 响应"""

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

    def call(self, method, params=None, timeout=15):
        with threading.Lock():
            self._mid += 1
            mid = self._mid
        _ws_send(self.sock, json.dumps(
            {"id": mid, "method": method, "params": params or {}}).encode())
        resp = self._recv_until(mid, timeout)
        if resp.get("error"):
            raise RuntimeError(f"CDP {method} 错误: {resp['error']}")
        return resp.get("result", {})

    def evaluate(self, expr, timeout=20):
        """在页面主世界执行表达式并返回值（awaitPromise/returnByValue）"""
        res = self.call("Runtime.evaluate", {
            "expression": expr,
            "returnByValue": True,
            "awaitPromise": True,
        }, timeout)
        inner = res.get("result") or {}
        if inner.get("exceptionDetails"):
            raise RuntimeError("页面脚本异常")
        return inner.get("value")

    def close(self):
        try:
            self.sock.close()
        except Exception:
            pass


def _find_page_target(port):
    """返回浏览器第一个可用的 page 类型 CDP target，无则返回 None"""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/json/list", timeout=5) as r:
            targets = json.loads(r.read().decode("utf-8", "replace"))
    except Exception:
        return None
    for t in targets:
        if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
            return t
    return None


def wait_browser_ready(user_dir: str, port: int, timeout: int = 30) -> bool:
    """等待浏览器就绪：OS 进程存活，且 CDP 开启时页面 target 可查。
    只等 OS 进程会在启动瞬间放行，紧随其后的登录检查会因
    「未找到页面 target」误判为未登录（GUI 路径已有同样等待，此处补齐）。"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if get_running_pid(user_dir) and (not port or _find_page_target(port)):
            return True
        time.sleep(1)
    return bool(get_running_pid(user_dir))


# 页面状态表达式：在页面内提取 host/加载状态/邮箱/账号入口（避免回传整页 HTML）
# 邮箱从文本节点提取（TreeWalker，参照参考脚本），避免正则匹配到脚本/属性里的邮箱
_PAGE_STATE_JS = r"""(() => {
  const emails = [];
  const re = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  if (document.body) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = walker.nextNode()) !== null) {
      let m; const s = n.nodeValue;
      while ((m = re.exec(s)) !== null) emails.push(m[0]);
    }
  }
const ids = ["#me_name", "#me_email", "#id_l", "#mectrl_headerPicture", "[class*=me-]"];
  let profileText = "";
  for (const sel of ids) {
    const el = document.querySelector(sel);
    if (el) { const tx = (el.innerText || "").trim(); if (tx) { profileText = tx; break; } }
  }
  // 正向登录证据：已登录的 rewards dashboard 会显示会员等级徽章（金牌会员等）、
  // 账号头像/账号控件；未登录只有登录/加入引导，无这些元素。
  const bodyText = (document.body ? document.body.innerText : "").slice(0, 4000);
  const memberLevel = /金牌会员|银牌会员|铜牌会员|钻石会员|gold member|silver member|bronze member/i.test(bodyText);
  const hasAvatar = !!document.querySelector("#mectrl_headerPicture, img[class*=meavatar], img[src*=\"account.microsoft.com\"]");
  const signInCTA = !!document.querySelector("a[href*=\"login.live.com\"], a[href*=\"login.microsoftonline.com\"], #id_signin");
  return {
    host: location.hostname,
    ready: document.readyState,
    emails: emails.map(function (e) { return e.toLowerCase(); })
                .filter(function (v, i, a) { return a.indexOf(v) === i; })
                .slice(0, 20),
    profileText: profileText,
    hasIdL: !!document.querySelector("a#id_l, button#id_l, div#id_l, #me_name, #me_email"),
    memberLevel: memberLevel,
    hasAvatar: hasAvatar,
    signInCTA: signInCTA,
    loggedIn: !!(profileText || hasAvatar || memberLevel)
  };
})()"""


def _cookie_login_state(user_dir):
    """从 profile 浏览器数据（Default/Cookies 数据库）直接判断微软 Rewards 登录会话。

    _RwBf cookie（.bing.com 域）是微软 Rewards 的登录会话 cookie：存在 = 已登录该账号；
    不存在 = 未登录（会话不存在/已过期/从未登录）。
    无需启动浏览器或加载页面即可判断。

    返回 True/False；读取失败返回 None（调用方回退到页面判断）。"""
    cdb = os.path.join(user_dir, "Default", "Cookies")
    if not os.path.exists(cdb):
        return None
    tmp = cdb + ".logincheck"
    try:
        for ext in ("", "-wal", "-shm"):
            src = cdb + ext
            if os.path.exists(src):
                shutil.copy2(src, tmp + ext)
        con = sqlite3.connect(f"file:{tmp}?mode=ro", uri=True, timeout=3)
        try:
            row = con.execute(
                "select count(*) from cookies where name in ('_RwBf','RwBf') "
                "and (host_key like '%bing.com' or host_key like '%microsoft.com')"
            ).fetchone()
            return bool(row and row[0])
        finally:
            con.close()
    except Exception:
        return None
    finally:
        for ext in ("", "-wal", "-shm"):
            try:
                os.remove(tmp + ext)
            except Exception:
                pass


def _read_page_state(sess):
    """读取页面状态 {host, ready, emails, profileText, hasIdL}，失败返回 None"""
    try:
        st = sess.evaluate(_PAGE_STATE_JS)
        if isinstance(st, dict):
            st.setdefault("host", "")
            st.setdefault("ready", "")
            st.setdefault("emails", [])
            st.setdefault("profileText", "")
            st.setdefault("hasIdL", False)
            st.setdefault("memberLevel", False)
            st.setdefault("hasAvatar", False)
            st.setdefault("signInCTA", False)
            st.setdefault("loggedIn", False)
            return st
    except Exception:
        pass
    return None


def _goto(sess, url):
    """导航到指定页面（失败忽略，靠轮询兜底）"""
    try:
        sess.call("Page.navigate", {"url": url}, timeout=15)
    except Exception:
        pass


def _write_port_marker(sess, port):
    """把本浏览器的调试端口写进 rewards 页的 localStorage（键 __mp_cdp_port）。

    为什么必须由 zy.py 写：
      zy.js 的多账号端口识别**完全依赖这个键**（读不到就回退 9222），
      而 9222 永远是第一个账号的浏览器。以前注释里写「llq.py 会用 CDP 写入」，
      但 zy.py 里从来没有这段代码 —— 于是四个账号的 CDP 全部连到 9222（第一个账号）。

    实测后果（2026-11-20 日志）：
      · 14:38 起 long / marvin / joe 都打印「CDP 已连接：当前已完成 0/8」，
        三个账号看到的是同一个浏览器（long 的）；
      · 16:55 long 任务完成被关闭，17:12 joe 立刻报
        「CDP 未连接：本地调试端口 9222 上没有 CDP 服务」，
        那轮的「应用内搜索型卡片」直接跳过。

    localStorage 按 origin 隔离，所以只在 bing.com 页面上写；
    页面还没导航到 bing 时返回 SKIP，交给下一轮/下一次检查再写。
    失败不影响登录判断，只记一行日志。
    """
    try:
        got = sess.evaluate(
            "(()=>{"
            "const h=location.hostname||'';"
            "if(!/(^|\\.)bing\\.com$/.test(h))return 'SKIP:'+h;"
            "try{localStorage.setItem('__mp_cdp_port','%d');}"
            "catch(e){return 'ERR:'+(e&&e.message||e);}"
            "return String(localStorage.getItem('__mp_cdp_port')||'');"
            "})()" % int(port), timeout=8)
        ok = str(got) == str(port)
        if ok:
            logger.info(f"  🎯 已写入端口标记 __mp_cdp_port={port}（脚本猫据此连本账号浏览器，不再串号）")
        elif got:
            logger.warning(f"  端口标记写入未生效（返回 {got}），脚本猫可能回退默认端口")
        return ok
    except Exception as e:
        logger.warning(f"  端口标记写入失败: {e}（不影响本轮登录判断）")
        return False


def _read_bing_muid(sess):
    """读这台浏览器的 MUID（bing 域）。

    不能用 sqlite 从 profile 里读：Chrome 的 cookie value 是加密的，
    虽然本地能解（Linux 固定 key），但没必要 —— 浏览器自己经 CDP 给的是明文。
    MUID 每个 profile 独立，正好当「这台浏览器是哪个账号」的指纹。"""
    for url in ("https://rewards.bing.com/", "https://www.bing.com/", "https://cn.bing.com/"):
        try:
            res = sess.call("Network.getCookies", {"urls": [url]}, timeout=8)
        except Exception:
            continue
        for c in (res.get("cookies") or []):
            if c.get("name") == "MUID" and c.get("value"):
                return str(c["value"])
    return ""


def _publish_port_map(account, port, muid="", email=""):
    """把「账号 → 端口 → MUID」写进端口表，由本进程的只读接口吐给脚本猫。

    脚本猫在后台用 GM_cookie 读自己的 MUID，比对端口表就能认领自己的端口，
    完全不需要页面上下文注入 —— 这是当前最稳的一条通道。"""
    global _PORT_MAP_TEXT
    if not account:
        return
    now = int(time.time() * 1000)
    with _PORT_MAP_LOCK:
        _PORT_MAP[account] = {
            "port": int(port), "muid": muid or "",
            "email": email or "", "at": now,
        }
        _PORT_MAP_TEXT = json.dumps({"ts": now, "accounts": _PORT_MAP}, ensure_ascii=False)
        text = _PORT_MAP_TEXT
    try:
        for path in PORT_MAP_FILES:
            d = os.path.dirname(path)
            if d:
                os.makedirs(d, exist_ok=True)
            tmp = path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                f.write(text)
            os.replace(tmp, path)
    except Exception as e:
        logger.debug(f"  端口表写盘失败: {e}")
    short = (muid[:8] + "…") if muid else "未取到"
    logger.info(f"  🗺️ 端口表已发布：{account} → CDP {port}（MUID {short}）")


def check_login(port: int, expected_email: str, navigate: bool = True,
                user_dir: str = None) -> dict:
    """登录判断（浏览器数据 + CDP 页面双信号）：
    1) 先从 profile 的浏览器数据（Default/Cookies）判断：存在微软 Rewards 登录会话
       cookie `_RwBf` → 已登录该账号（无需加载页面）；
    2) 再打开 rewards.bing.com/dashboard 确认——
        跳转到登录页（login.live.com / login.microsoftonline.com） → 未登录（会话已失效）
        停留 dashboard 且出现正向登录证据（会员等级徽章/账号头像/账号控件） → 已登录，
                       再从页面 DOM 提取邮箱/显示名，与 expected_email 比对。
        停留 dashboard 且 cookie 与会话均无任何登录证据 → 未登录。
    返回: {ok, matched, current_email, profile_text, reason}
      ok       = 已登录（cookie 会话存在，或 dashboard 检出登录态证据）
      matched  = 已登录且页面邮箱与 expected_email 一致（邮箱未找到时 None）
      current_email = 页面提取到的邮箱（可能多个，取第一个）

    navigate=True  → 先导航到 dashboard 再判断（一次性检查，如启动时/任务结束）
    navigate=False → 不导航，只读取当前页面状态判断（用于等待用户手动登录的
                     轮询，避免反复导航打断用户正在操作的登录页）"""
    result = {"ok": False, "matched": False, "current_email": None,
              "profile_text": "", "reason": "检查失败"}
    sess = None
    try:
        cookie_login = _cookie_login_state(user_dir) if user_dir else None
        target = _find_page_target(port)
        if not target:
            raise ConnectionError("未找到页面 target（浏览器可能未就绪）")
        sess = _CdpSession(target["webSocketDebuggerUrl"])
        if navigate:
            _goto(sess, "https://rewards.bing.com/dashboard")
        host = ""
        emails = []
        profile_text = ""
        logged_in = False
        marker_done = False
        map_done = False
        acc_name = os.path.basename((user_dir or "").rstrip("/")) or (expected_email or "")
        deadline = time.time() + LOGIN_CHECK_WAIT
        while time.time() < deadline:
            time.sleep(2)
            st = _read_page_state(sess)
            if st:
                host = st["host"]
                if any(k in host for k in LOGIN_HOSTS):
                    break
                emails = st.get("emails") or []
                profile_text = st.get("profileText") or ""
                logged_in = bool(st.get("loggedIn"))
                # 页面已在 bing 域：顺手把本浏览器的端口写进 localStorage，
                # 让脚本猫知道该连哪个端口（否则多账号全串到 9222）。
                if not marker_done and "bing.com" in (host or ""):
                    marker_done = _write_port_marker(sess, port)
                # 端口表：页面一到 bing 域就把「账号 → 端口 → MUID」发布出去。
                # 主通道（脚本猫按 MUID 认领端口）靠它，比 localStorage 稳。
                if not map_done and "bing.com" in (host or ""):
                    map_done = True
                    _publish_port_map(acc_name, port, _read_bing_muid(sess),
                                      emails[0] if emails else "")
        if any(k in host for k in LOGIN_HOSTS):
            result["reason"] = "未登录（rewards.bing.com/dashboard 跳转到登录页）"
        elif cookie_login is True or logged_in:
            result["ok"] = True
            # 已登录：与预期账号邮箱比对
            result["current_email"] = emails[0] if emails else None
            result["profile_text"] = profile_text
            exp = (expected_email or "").strip().lower()
            if emails:
                if exp and exp in emails:
                    result["matched"] = True
                    result["reason"] = f"已登录，账号匹配（{emails[0]}）"
                else:
                    result["matched"] = False
                    result["reason"] = (f"⚠️ 已登录但账号不匹配！期望 {expected_email}，"
                                        f"页面显示 {emails[0]}，请确认登录的是否为对应账号")
            else:
                result["matched"] = None
                result["reason"] = ("已登录，但页面未显示邮箱，无法核对账号"
                                    "（若显示名含账号信息：" + (profile_text.splitlines()[0] if profile_text else "") + "）")
    except Exception as e:
        result["reason"] = f"登录检查异常: {e}"
        logger.warning(f"  登录检查失败: {e}")
    finally:
        if sess:
            sess.close()
    return result


def close_chrome(pid):
    """优雅关闭浏览器，超时后强制结束"""
    try:
        os.kill(pid, signal.SIGTERM)
        for _ in range(10):
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                logger.info(f"  ✅ PID={pid} 浏览器已退出")
                return
            time.sleep(1)
        os.kill(pid, signal.SIGKILL)
        logger.info(f"  ✅ PID={pid} 已强制结束")
    except ProcessLookupError:
        logger.info(f"  ℹ️  PID={pid} 浏览器进程已不存在")
    except Exception as e:
        logger.warning(f"  ⚠️ 关闭 PID={pid} 失败: {e}")


def close_browser(user_dir: str, port: int = 0):
    """像用户点关闭按钮一样关闭浏览器（按 profile）：
    优先通过 CDP 的 Browser.close 让浏览器自己保存会话并退出整棵进程树；
    CDP 不可用时回退到 SIGTERM（优雅）→ 超时 SIGKILL。
    用于 GUI/无头切换前，确保同一 profile 不会被两个实例并发占用
    （并发占用会导致 Chromium 报「Profile error occurred」）。"""
    closed = False
    if port:
        try:
            target = _find_page_target(port)
            if target:
                sess = _CdpSession(target["webSocketDebuggerUrl"])
                try:
                    sess.call("Browser.close", {}, timeout=10)
                    closed = True
                except Exception:
                    pass
                finally:
                    sess.close()
        except Exception:
            pass
    if closed:
        # CDP 关闭成功：等待整棵进程树退出
        for _ in range(20):
            if not get_running_pid(user_dir):
                break
            time.sleep(0.5)
        # 若仍有残留（某些子进程不随 Browser.close 退出），再补杀
        kill_all_for_profile(user_dir)
        logger.info("  🛑 已通过 CDP Browser.close 让浏览器保存并退出")
    else:
        # CDP 不可用（浏览器未就绪）：SIGTERM 优雅关闭整棵进程树
        kill_all_for_profile(user_dir)
        logger.info("  🛑 CDP 不可用，改用信号优雅关闭浏览器")


# ==============================================
# 🖥️ 按需桌面（labwc + wayvnc + websockify noVNC）：默认无头，检测到未登录时临时拉起桌面让用户手动登录
# ==============================================

def _ensure_xdg_runtime() -> str:
    """确保 XDG_RUNTIME_DIR 存在、是绝对路径、权限 0700。

    容器里最常见的坑：面板注入的 XDG_RUNTIME_DIR 指向一个**不存在的目录**
    （如 /tmp/runtime-zhuque 在容器重启后没了）。后果是连锁的：
      · chromium 直接报 `XDG_RUNTIME_DIR is invalid or not set` 并退出；
      · labwc/wayvnc 同样依赖它，起不来 → 根本没有 wayland socket；
      · websockify 却能照常起来（它只用 TCP）→ noVNC 页面打得开，
        但它转发到 localhost:5900 时无人应答 → **页面一片空白**。
    这正是「日志说桌面已启动、窗口一个没有、noVNC 空白」的完整链条。
    """
    d = (os.environ.get("XDG_RUNTIME_DIR") or "").strip()
    if not d or not os.path.isabs(d):
        d = f"/tmp/runtime-{os.getuid()}"
        os.environ["XDG_RUNTIME_DIR"] = d
    try:
        existed = os.path.isdir(d)
        os.makedirs(d, mode=0o700, exist_ok=True)
        os.chmod(d, 0o700)
        if not existed:
            logger.info(f"  🧰 已创建 XDG_RUNTIME_DIR: {d}（容器重启后常见缺失，"
                        f"缺了 labwc/wayvnc/chromium 都起不来）")
    except Exception as e:
        logger.warning(f"⚠️ 准备 XDG_RUNTIME_DIR 失败（{d}）: {e}")
    return d


def _run_desktop(*args):
    """调用桌面启停脚本（desktop.sh），返回 (ok, output)"""
    try:
        ret = subprocess.run([DESKTOP_SCRIPT] + list(args),
                             capture_output=True, text=True, timeout=60)
        return ret.returncode == 0, ret.stdout.strip() or ret.stderr.strip()
    except Exception as e:
        return False, str(e)


_NOVNC_LAST_CHECK = 0.0     # desktop_healthcheck 上次自检时间（60 秒内不重复查）


def _novnc_port() -> int:
    """noVNC(websockify) 端口：优先从 LUMEN_URL 里取，取不到按 8080"""
    try:
        m = re.search(r"https?://[^/\s]*?:(\d{2,5})", LUMEN_URL or "")
        if m:
            return int(m.group(1))
    except Exception:
        pass
    return 8080


def _release_plan_http_for_desktop():
    """拉起 noVNC 桌面前，若自建计划接口占着 noVNC 端口就主动关掉让位。

    冲突链条（实测 2026-11-21 16:39）：
      无头启动 → write_run_plan → ensure_plan_http 在 8080 起迷你接口
      → 检测未登录 → desktop.sh start 想让 websockify 绑 8080，端口被占
      → websockify 起不来 → 8080 上只有迷你接口（/vnc.html 返回 404）
      → 用户打不开 GUI 页面。
    此时 labwc/wayvnc/chromium 都在，唯独没有 websockify 进程 —— 与现场一致。
    计划/端口映射文件已由 write_run_plan / _publish_port_map 写进 websockify 的
    静态目录（/usr/share/novnc），关掉自建接口后脚本猫仍能经 websockify 读到。
    """
    global _PLAN_HTTP_PORT, _PLAN_HTTP_SERVER, _PLAN_HTTP_YIELDED
    novnc_port = _novnc_port()
    # 只关「本进程自己起的、且正好占着 noVNC 端口」的接口；
    # 若 _PLAN_HTTP_PORT == novnc_port 但 server 对象是 None，说明是复用了
    # 别的服务（websockify 本身），不能误关。
    if _PLAN_HTTP_PORT != novnc_port or _PLAN_HTTP_SERVER is None:
        return
    try:
        _PLAN_HTTP_SERVER.shutdown()      # 停 serve_forever
        _PLAN_HTTP_SERVER.server_close()  # 释放 8080 监听
        logger.info(f"  🧹 已关闭占用 noVNC 端口 {novnc_port} 的自建计划接口，"
                    f"让位给 websockify（计划文件已在静态目录，脚本猫照常可读）")
    except Exception as e:
        logger.warning(f"  ⚠️ 关闭自建计划接口失败（{novnc_port}）: {e}")
    _PLAN_HTTP_SERVER = None
    _PLAN_HTTP_PORT = 0
    _PLAN_HTTP_YIELDED = True


def desktop_healthcheck(force: bool = False):
    """桌面拉起后自检 noVNC 到底能不能用，把结论写进日志。

    为什么需要：desktop.sh 打印的「桌面已启动（labwc+wayvnc+websockify）」只是它
    自己的说辞。实测（容器内）出现过这样一种形态：
        websockify 起来了（0.0.0.0:8080）→ noVNC 页面打得开
        labwc / wayvnc 没起来           → localhost:5900 没人应答 → **页面空白**
        chromium 报 XDG_RUNTIME_DIR is invalid or not set → 窗口也没有
    也就是说「页面能访问」和「能看到桌面」是两件事，必须分别验证：
      ① 8080（websockify，提供页面）② 5900（wayvnc，提供画面）
      ③ compositor（labwc/sway/weston 任一）+ wayvnc + websockify 进程
      ④ /vnc.html 真的能返回内容
    60 秒内只查一次；force=True 强制重查。"""
    global _NOVNC_LAST_CHECK
    if not force and time.time() - _NOVNC_LAST_CHECK < 60:
        return True
    _NOVNC_LAST_CHECK = time.time()
    port = _novnc_port()
    problems = []

    def _conn(p):
        try:
            s = socket.create_connection(("127.0.0.1", p), timeout=2)
            s.close()
            return True
        except Exception:
            return False

    # ① 页面端口（websockify）
    listening = _conn(port)
    if not listening:
        problems.append(f"端口 {port}（websockify）无法连接")
    # ② VNC 端口（wayvnc）：websockify 只是转发，5900 没人听 → 页面空白
    vnc_ok = _conn(5900)
    if not vnc_ok:
        problems.append("端口 5900（wayvnc）无人监听 —— noVNC 页面会是空白")

    # ③ 关键进程：compositor 不限 labwc（镜像里也可能是 sway/weston）
    compositors = [n for n in ("labwc", "sway", "weston") if _pids_by_comm((n,))]
    missing = []
    if not compositors:
        missing.append("labwc/sway（合成器）")
    if not _pids_by_comm(("wayvnc",)):
        missing.append("wayvnc")
    # websockify 的进程名是 python3（ps 里显示 python3 /usr/bin/websockify），
    # 按 comm 匹配不到很正常 → 上面用「8080 能否连上」判断它是否活着
    if missing:
        problems.append(f"进程缺失: {', '.join(missing)}")

    # ④ 页面内容
    code, size = None, 0
    if listening:
        try:
            req = urllib.request.Request(f"http://127.0.0.1:{port}/vnc.html", method="GET")
            with urllib.request.urlopen(req, timeout=3) as r:
                code, size = r.status, len(r.read() or b"")
        except Exception as e:
            problems.append(f"/vnc.html 请求失败（{e}）")

    if problems:
        logger.warning(f"  🩺 noVNC 自检未通过：{'；'.join(problems)}")
        try:
            ret = subprocess.run(["ss", "-lntp"], capture_output=True, text=True, timeout=5)
            for p in (port, 5900):
                hit = [ln.strip() for ln in ret.stdout.splitlines() if f":{p} " in ln + " "]
                logger.warning(f"     :{p} → {hit[0][:160] if hit else '无人监听'}")
        except Exception:
            pass
        try:
            ret = subprocess.run(["ps", "-eo", "pid,args"], capture_output=True,
                                 text=True, timeout=5)
            alive = [ln.strip()[:140] for ln in ret.stdout.splitlines()
                     if any(k in ln for k in ("labwc", "sway", "weston", "wayvnc",
                                              "websockify"))]
            for ln in alive[:8]:
                logger.warning(f"     进程: {ln}")
            if not alive:
                logger.warning("     进程: 没有找到任何 labwc/sway/wayvnc/websockify")
        except Exception:
            pass
    else:
        logger.info(f"  🩺 noVNC 自检通过：{port} 可连、5900 有 wayvnc、"
                    f"/vnc.html {code}（{size} 字节），合成器 {compositors[0]} 在运行")
    return not problems


def desktop_status() -> bool:
    """桌面（labwc）是否在运行"""
    ok, out = _run_desktop("status")
    return ok and "running" in out


def _desktop_running() -> bool:
    """桌面到底起没起：desktop.sh status 说 running，或有真的能连上的 wayland socket。

    为什么要加后半句：desktop.sh status 会误报（实测桌面明明起着、长账号的窗口都
    已经显示了，status 仍返回非 running）。此时若按 status 判断就会再调一次
    `desktop.sh start`，可能重建 rc.xml、干扰已经在显示的多账号窗口。
    有活的 wayland socket = 合成器在跑，这个判据比 status 可靠。"""
    if desktop_status():
        return True
    return bool(_wayland_socket_target()[1])


def _build_gui_cmd(user_dir: str, port: int, platform: str = "wayland", prep: bool = True):
    """构造 GUI chromium 启动命令列表（带界面，供 labwc 桌面显示）。
    platform=wayland（默认）走 --ozone-platform=wayland；x11 为兜底重试用。
    不使用 --start-maximized：窗口以普通大小映射，由 labwc rc.xml 的 windowRule
    按标题【账号名】平铺到各自位置，多账号窗口同时在桌面显示。
    起始页为本地 HTML（title 即【账号名】，立即跳转 rewards），确保窗口映射时
    labwc 就能按标题匹配到平铺规则。"""
    chrome = find_chrome()
    if prep:
        # 清 profile（杀旧实例 + 删 Singleton 锁）比较贵（每个账号约 1 秒），
        # 只在真正要拉起窗口前做一次；单纯重写命令文本时传 prep=False。
        _prep_profile(user_dir)
    # 账号名取自 user 目录后缀 user-<name>
    name = os.path.basename(user_dir).replace("user-", "")
    start_page = write_login_start_page(name)
    cmd = [
        chrome,
        "--no-sandbox",
        f"--user-data-dir={user_dir}",
        # 新用户首次运行要经 CDP 装「脚本猫」未打包扩展（Chrome 137+ 必须开这个开关；
        # 老版 Chromium 不认识该参数会忽略，不影响 --load-extension）
        "--enable-unsafe-extension-debugging",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        f"--ozone-platform={platform}",
        "--window-size=900,700",
        "--accept-lang=zh-CN,zh,en-US,en",
        f"--remote-debugging-port={port}",
        "--remote-allow-origins=*",
        start_page,
    ]
    _ext = _extension_load_arg(user_dir)
    if _ext:
        cmd.insert(-1, _ext)  # 插在起始页之前
    return cmd


def write_login_start_page(name: str) -> str:
    """生成账号登录起始页（本地 HTML）：title=【账号名】 登录，页面自动跳转 rewards。
    返回文件路径；用于让 labwc 窗口映射时即可按标题平铺。"""
    path = f"/tmp/login-{name}.html"
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>【{name}】 登录</title>
<style>body{{font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f3f6fc;}}
a{{font-size:22px;color:#0067b8;}}</style>
<script>location.replace("https://rewards.bing.com");</script>
</head>
<body><a href="https://rewards.bing.com">正在进入 Microsoft Rewards...</a></body>
</html>"""
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(html)
    except Exception as e:
        logger.warning(f"⚠️ 生成起始页失败: {e}")
    return path


def _proc_environ(pid: int) -> dict:
    """读 /proc/<pid>/environ（进程启动时的真实环境）"""
    try:
        with open(f"/proc/{pid}/environ", "rb") as f:
            raw = f.read()
    except Exception:
        return {}
    env = {}
    for item in raw.split(b"\0"):
        if b"=" in item:
            k, v = item.split(b"=", 1)
            env[k.decode("utf-8", "replace")] = v.decode("utf-8", "replace")
    return env


def _pids_by_comm(names) -> list:
    """按 /proc/<pid>/comm（进程名）找 PID"""
    wanted = set(names)
    pids = []
    try:
        for entry in os.listdir("/proc"):
            if not entry.isdigit():
                continue
            try:
                with open(f"/proc/{entry}/comm", "r") as f:
                    comm = f.read().strip()
            except Exception:
                continue
            if comm in wanted:
                pids.append(int(entry))
    except Exception:
        pass
    return pids


def _unix_alive(path: str) -> bool:
    """Unix socket 是否真的能连上（只有文件残留、没人监听的会被排除）"""
    try:
        s = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        s.settimeout(1.0)
        try:
            s.connect(path)
        finally:
            s.close()
        return True
    except Exception:
        return False


def _unix_sockets_from_proc(path: str = "/proc/net/unix") -> list:
    """从 /proc/net/unix 读出所有 wayland socket 的文件路径。

    这是最可靠的来源：内核直接告诉你「哪些 socket 真的被 bind 了」，
    不依赖进程环境变量、不依赖目录猜测（面板进程和 labwc 的
    XDG_RUNTIME_DIR 不同、甚至 connect 被权限挡住时都还能看到路径）。

    注意 socket 名：标准的 `$XDG_RUNTIME_DIR/wayland-0` **不带 .sock 后缀**
    （labwc/sway 都是这种），有的合成器（如 niri）才叫 `wayland-1.xxx.sock`。
    所以这里只按 `wayland-` 前缀匹配，不要求后缀。"""
    out = []
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            next(f, None)          # 跳过表头
            for line in f:
                parts = line.split()
                if len(parts) < 8:
                    continue
                p = parts[-1]
                if p.startswith("/") and os.path.basename(p).startswith("wayland-"):
                    out.append(p)
    except Exception:
        pass
    return out


def _list_wayland_socks(d: str) -> list:
    """目录下的 wayland socket 名（标准命名 `wayland-0` 不带 .sock 后缀，也要认
    `wayland-1.xxx.sock` 这种 niri 风格）；wayland-0 排最前，其余按名字排序。"""
    try:
        names = [n for n in os.listdir(d) if n.startswith("wayland-")]
    except Exception:
        return []
    names.sort(key=lambda n: (n != "wayland-0", n))
    return names


def _compositor_runtime_dirs() -> list:
    """从 compositor 进程（labwc/wayvnc/sway/weston）的 /proc/<pid>/environ 取
    XDG_RUNTIME_DIR。这是「窗口该连哪个 socket」的唯一权威来源：panel 进程自己的
    XDG_RUNTIME_DIR 可能和 compositor 完全不同（实测就是这个坑）。"""
    dirs = []
    for pid in _pids_by_comm(("labwc", "wayvnc", "sway", "weston", "Xwayland")):
        d = _proc_environ(pid).get("XDG_RUNTIME_DIR")
        if d and d not in dirs:
            dirs.append(d)
    return dirs


def _wayland_socket_target():
    """返回真实可用的 (XDG_RUNTIME_DIR, WAYLAND_DISPLAY)；找不到返回 (None, None)。

    为什么不能用 os.environ 里的值：面板进程的 XDG_RUNTIME_DIR 和 desktop.sh 起的
    compositor（labwc）不一定在同一个目录。旧实现把面板的 XDG_RUNTIME_DIR 硬写进
    窗口命令，desktop.sh 的 autostart 执行它时反而覆盖掉了 labwc 的真实环境，于是
    chromium 报「Failed to connect to Wayland display: No such file or directory」
    当场退出——桌面明明起着，窗口一个都不出来。

    探测顺序（越靠前越可信）：
    ① compositor 进程环境目录里的 socket（最权威，能排除系统里别的 wayland 会话）；
    ② /proc/net/unix 里真的 bind 了、并且能连上的 wayland socket；
    ③ 面板 env + 常见 runtime 目录 + socket 所在目录里的 wayland-*（都要 connect 成功）；
    ④ 仍没有可连的，但 /proc/net/unix 有记录（可能只是权限连不上）→ 用它。"""
    comp_dirs = _compositor_runtime_dirs()
    net_paths = _unix_sockets_from_proc()

    # ① compositor 自己的 runtime 目录
    for p in net_paths:
        d, n = os.path.split(p)
        if d in comp_dirs and _unix_alive(p):
            return d, n
    for d in comp_dirs:
        for n in _list_wayland_socks(d):
            if _unix_alive(os.path.join(d, n)):
                return d, n

    # ② 任意可连的 wayland socket
    for p in net_paths:
        if _unix_alive(p):
            d, n = os.path.split(p)
            return d, n

    # ③ 面板 env / 常见目录
    dirs = list(comp_dirs)
    for d in (os.environ.get("XDG_RUNTIME_DIR"), "/tmp/runtime-zhuque",
              f"/run/user/{os.getuid()}"):
        if d and d not in dirs:
            dirs.append(d)
    for d in glob.glob("/tmp/runtime-*"):
        if d not in dirs:
            dirs.append(d)
    for p in net_paths:                      # socket 所在目录也加进来（不必猜）
        d = os.path.dirname(p)
        if d and d not in dirs:
            dirs.append(d)
    for d in dirs:
        for n in _list_wayland_socks(d):
            if _unix_alive(os.path.join(d, n)):
                return d, n

    # ④ 有监听记录但连不上（权限）→ 仍用它
    if net_paths:
        d, n = os.path.split(net_paths[0])
        return d, n
    return None, None


def _wait_wayland_socket(timeout: float = 5.0):
    """等 Wayland socket 出现（桌面刚拉起时可能晚几十毫秒~几秒）"""
    deadline = time.time() + max(0, timeout)
    while True:
        xdg, disp = _wayland_socket_target()
        if disp:
            return xdg, disp
        if time.time() >= deadline:
            return None, None
        time.sleep(0.5)


def _x11_target():
    """可用的 X11 DISPLAY（Xwayland/Xvfb）；没有返回 None"""
    d = (os.environ.get("DISPLAY") or "").strip()
    if d:
        return d
    socks = sorted(glob.glob("/tmp/.X11-unix/X*"))
    if socks:
        return ":" + os.path.basename(socks[0])[1:]
    return None


def _gui_wayland_display():
    """当前真实可用的 WAYLAND_DISPLAY 名；探测不到返回 None（不再瞎猜 wayland-0）"""
    return _wayland_socket_target()[1]


def _gui_log_path(name: str) -> str:
    """每个账号 GUI 浏览器（窗口命令）的输出日志路径"""
    return f"/tmp/gui-browser-{name}.log"


def write_gui_cmds(entries, platform: str = "wayland", prep: bool = True):
    """写入待登录账号的 GUI 浏览器启动命令文件到 /tmp/gui-browser-cmds/。
    entries: [(name, user_dir, port), ...]
    只覆盖本次 entries 对应的账号文件，保留目录中其它账号（支持多次调用累积窗口）。
    labwc autostart / desktop.sh launch_windows 会遍历执行目录下每个 .sh；
    脚本自己也会直接执行它们（见 launch_gui_window），不把成败全押在桌面脚本上。
    WAYLAND_DISPLAY/XDG_RUNTIME_DIR 只在「真的能连上」时才写死，探测不到就留空
    让桌面 autostart 继承 labwc 自己的环境（写错必然 100% 起不来）。
    命令行的 stdout/stderr 重定向到 /tmp/gui-browser-<账号>.log：浏览器起不来时
    能直接看到它为什么退出（以前输出被丢弃，只能看到「未检测到」这一句）。"""
    try:
        os.makedirs(GUI_CMD_DIR, exist_ok=True)
    except Exception as e:
        logger.warning(f"⚠️ 初始化 GUI 命令目录失败: {e}")
        return False
    ok = True
    xdg, display = _wayland_socket_target()
    x11_display = _x11_target() or ":0"
    if platform != "x11" and not display:
        # 桌面还没起来时探测不到 socket 属正常（命令交给 autostart 继承环境）；
        # 桌面已经在跑还找不到，才是真问题。
        if desktop_status():
            logger.warning("  ⚠️ 桌面在跑但未探测到可连接的 Wayland socket：窗口命令不覆盖 "
                           "WAYLAND_DISPLAY/XDG_RUNTIME_DIR")
        else:
            logger.info("  🖥️ 桌面尚未启动：窗口命令不写死 WAYLAND_DISPLAY/XDG_RUNTIME_DIR"
                        "（由桌面 autostart 继承 compositor 环境）")
    for name, user_dir, port in entries:
        cmd = _build_gui_cmd(user_dir, port, platform=platform, prep=prep)
        # 转义为 shell 单行命令（labwc autostart / desktop.sh 用 sh 执行）。
        # 显式指定 WAYLAND_DISPLAY/XDG_RUNTIME_DIR：复用桌面时经 docker exec
        # 启动窗口命令会继承面板进程的 wayland-0（正确，与 labwc socket 一致）。
        # 此 chromium 忽略 --lang 参数，必须同时给 LANG/LANGUAGE 环境变量 UI 才是中文。
        if platform == "x11":
            env_prefix = f"LANG=zh_CN.UTF-8 LANGUAGE=zh_CN:zh DISPLAY={x11_display}"
        elif display:
            env_prefix = (f"LANG=zh_CN.UTF-8 LANGUAGE=zh_CN:zh "
                          f"WAYLAND_DISPLAY={display} XDG_RUNTIME_DIR={xdg}")
        else:
            env_prefix = "LANG=zh_CN.UTF-8 LANGUAGE=zh_CN:zh"
        log = _gui_log_path(name)
        line = (f"{env_prefix} " + " ".join(shlex.quote(c) for c in cmd)
                + f" >> {shlex.quote(log)} 2>&1")
        path = os.path.join(GUI_CMD_DIR, f"{name}.sh")
        try:
            with open(path, "w", encoding="utf-8") as f:
                # 第二行写日志分隔与启动时刻，便于区分多轮启动
                f.write(f"echo \"===== $(date '+%F %T') GUI 浏览器启动（{platform}）=====\""
                        f" >> {shlex.quote(log)}\n")
                f.write(line + "\n")
            logger.info(f"  📝 已写入 GUI 窗口命令: {path}（日志 {log}）")
        except Exception as e:
            logger.warning(f"⚠️ 写入 {name} 的 GUI 命令失败: {e}")
            ok = False
    return ok


def launch_gui_window(name: str, platform: str = "wayland"):
    """直接执行自己写的窗口命令（不依赖 labwc autostart / desktop.sh start-windows）。

    桌面起来了但一个浏览器都没有，最常见的两种情形是「autostart 没执行这些 .sh」
    和「desktop.sh 没有 start-windows / 它执行失败」——这两种在脚本这边都是黑盒，
    原实现只能干等 GUI_READY_TIMEOUT 秒然后静默回退无头。命令是我们自己写的、
    环境变量也是我们自己算的，直接交给 sh 跑，成败立刻可见（输出已重定向到
    /tmp/gui-browser-<账号>.log）。
    返回 Popen 对象（用于判断进程是否已经退出退出）；命令文件缺失返回 None。"""
    sh = os.path.join(GUI_CMD_DIR, f"{name}.sh")
    if not os.path.exists(sh):
        logger.warning(f"  ⚠️ 窗口命令缺失（{sh}），无法直接拉起 {name}")
        return None
    try:
        # 面板进程自身的 XDG_RUNTIME_DIR 可能和 compositor 不同：这里显式喂
        # 探测到的真实值；.sh 里若已写死则以后者为准（两者现在一致）。
        env = dict(os.environ)
        display = None
        if platform != "x11":
            xdg, display = _wayland_socket_target()
            if xdg and display:
                env["XDG_RUNTIME_DIR"] = xdg
                env["WAYLAND_DISPLAY"] = display
        proc = subprocess.Popen(["sh", sh], stdin=subprocess.DEVNULL,
                                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                                env=env, start_new_session=True)
        logger.info(f"  ▶️  已直接执行窗口命令 {sh}（PID={proc.pid}，"
                    f"{'X11' if platform == 'x11' else 'WAYLAND_DISPLAY=' + (display or '继承')}）")
        return proc
    except Exception as e:
        logger.warning(f"  ⚠️ 直接执行窗口命令失败（{e}）")
        return None


def _wait_gui_cdp(port: int, timeout: float, proc=None) -> bool:
    """在 timeout 秒内轮询该端口的 CDP 页面是否就绪。
    传了 proc 时顺带盯着拉起的 sh 进程：chromium 一报错退出就立刻返回，
    不用干等满超时（用 poll() 而不是 /proc：子进程退出后是僵尸，/proc 还在）。"""
    deadline = time.time() + max(1, timeout)
    while time.time() < deadline:
        if port and _find_page_target(port):
            return True
        if proc is not None and proc.poll() is not None:
            return False     # 进程已退出（chromium 直接报错退出），别等了
        time.sleep(0.5)
    return False


def dump_gui_log(name: str, tail: int = 15):
    """GUI 浏览器起不来时，把它自己的报错打出来（不用再靠猜）"""
    path = _gui_log_path(name)
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as f:
            lines = f.read().splitlines()[-tail:]
    except FileNotFoundError:
        logger.warning(f"  📄 GUI 日志不存在（{path}）：窗口命令根本没被执行过")
        return
    except Exception as e:
        logger.warning(f"  📄 读取 GUI 日志失败（{path}）: {e}")
        return
    if not lines:
        logger.warning(f"  📄 GUI 日志为空（{path}）：.sh 被执行了但没有任何输出")
        return
    logger.warning(f"  📄 GUI 浏览器日志尾部（{path}）：")
    for ln in lines:
        logger.warning(f"     {ln}")


def ensure_gui_window(name: str, user_dir: str, port: int, autostart: bool = True) -> bool:
    """确保单个账号的 GUI 浏览器真的起来（先等桌面自动拉，再自己拉，最后换 X11）。
    autostart=False 表示桌面本来就在跑（autostart 只在合成器启动那一刻执行过一次，
    不会因为新写一个 .sh 就自动拉起）——此时不必干等，直接自己拉起窗口。
    返回 CDP 是否就绪。"""
    if not port:
        # CDP 已关闭（CDP_BASE_PORT=0）：只能靠进程判断，没有端口可等
        if get_running_pid(user_dir):
            return True
        spawn = launch_gui_window(name)
        deadline = time.time() + max(5, GUI_AUTOSTART_WAIT)
        while time.time() < deadline:
            if get_running_pid(user_dir):
                return True
            if spawn is not None and spawn.poll() is not None:
                break
            time.sleep(0.5)
        dump_gui_log(name)
        return False

    if autostart and _wait_gui_cdp(port, GUI_AUTOSTART_WAIT):
        return True
    if get_running_pid(user_dir):
        # 进程已经在了，只是 CDP 还没起来 → 继续等，别重复启动抢同一个 profile
        logger.info(f"  ⏳ {name} 的 GUI 浏览器进程已存在，继续等待 CDP 就绪...")
        return _wait_gui_cdp(port, max(10, GUI_READY_TIMEOUT - GUI_AUTOSTART_WAIT))

    # 自己拉起前重新写一次窗口命令：此刻桌面已起来，能探测到真实可连的 socket。
    # 探测不到 Wayland、但有 X（Xwayland/Xvfb）→ 直接按 X11 拉起，省一轮白等。
    platform = "wayland"
    xdg, wl_display = _wait_wayland_socket(10)
    if not wl_display and not _x11_target():
        # 没有任何可用的显示后端（合成器没起来 / XDG_RUNTIME_DIR 不对）。
        # 此时再自己执行窗口命令只会让 chromium 当场报错退出、把日志刷满，
        # 对结果毫无帮助 —— 保持 old 的行为：继续等桌面 autostart，等到超时为止。
        logger.warning("  ⚠️ 既无 Wayland socket 也无 X11 DISPLAY（合成器可能没起来），"
                       "不再自己拉窗口，继续等桌面 autostart")
        if _wait_gui_cdp(port, max(10, GUI_READY_TIMEOUT - GUI_AUTOSTART_WAIT)):
            return True
        dump_gui_log(name)
        return False
    if not wl_display:
        platform = "x11"
        logger.warning(f"  ⚠️ 没有可连接的 Wayland socket（{xdg or '未找到'}），改用 X11 拉起窗口")
    if autostart:
        logger.info(f"  🖥️ 桌面未在 {GUI_AUTOSTART_WAIT} 秒内拉起 {name} 的窗口，改为自己执行窗口命令")
    else:
        logger.info(f"  🖥️ 桌面已在运行，直接执行 {name} 的窗口命令")
    write_gui_cmds([(name, user_dir, port)], platform=platform, prep=False)
    spawn = launch_gui_window(name, platform=platform)
    if _wait_gui_cdp(port, max(10, GUI_READY_TIMEOUT - GUI_AUTOSTART_WAIT), proc=spawn):
        return True

    if platform != "x11" and _x11_target():
        logger.warning("  ⚠️ Wayland 下始终没有窗口，改用 X11 重试一次")
        write_gui_cmds([(name, user_dir, port)], platform="x11", prep=False)
        spawn = launch_gui_window(name, platform="x11")
        if _wait_gui_cdp(port, GUI_X11_RETRY_TIMEOUT, proc=spawn):
            return True

    dump_gui_log(name)
    return False


def ensure_gui_windows(entries, autostart: bool = True) -> set:
    """多账号：并行等桌面自动拉窗口 → 对没起来的自己执行窗口命令 → 仍不行换 X11。
    autostart=False（桌面本来就在跑）时跳过等待，直接自己拉窗口。
    entries: [(name, user_dir, port), ...]；返回已就绪的账号名集合。"""
    ready = set()

    def _await(entries_left, timeout):
        deadline = time.time() + max(1, timeout)
        while True:
            for n, u, p in entries_left:
                if n in ready:
                    continue
                if p and _find_page_target(p):
                    ready.add(n)
                elif not p and get_running_pid(u):   # CDP 关闭：只能看进程
                    ready.add(n)
            if len(ready) >= len(entries) or time.time() >= deadline:
                return
            time.sleep(0.5)

    if not entries:
        return ready
    if autostart:
        _await(entries, GUI_AUTOSTART_WAIT)
    todo = [e for e in entries if e[0] not in ready]
    if todo:
        # 桌面已起来：重新探测真实 socket 并重写窗口命令，再自己拉起
        platform = "wayland"
        _xdg, wl_display = _wait_wayland_socket(5)
        if not wl_display:
            if _x11_target():
                platform = "x11"
                logger.warning("  ⚠️ 没有可连接的 Wayland socket，改用 X11 拉起窗口")
            else:
                logger.warning("  ⚠️ 既无 Wayland socket 也无 X11 DISPLAY，GUI 窗口多半起不来")
        write_gui_cmds(todo, platform=platform, prep=False)
        for n, u, _p in todo:
            if get_running_pid(u):
                continue          # 进程在，只是 CDP 慢，不要重复启动
            if autostart:
                logger.info(f"  🖥️ 桌面未自动拉起 {n} 的窗口，改为自己执行窗口命令")
            else:
                logger.info(f"  🖥️ 桌面已在运行，直接执行 {n} 的窗口命令")
            launch_gui_window(n, platform=platform)
        _await(todo, max(10, GUI_READY_TIMEOUT - GUI_AUTOSTART_WAIT))
        todo = [e for e in todo if e[0] not in ready]
        if todo and platform != "x11" and _x11_target():
            logger.warning(f"  ⚠️ Wayland 下仍无窗口：{[e[0] for e in todo]}，改用 X11 重试一次")
            write_gui_cmds(todo, platform="x11", prep=False)
            for n, u, _p in todo:
                if not get_running_pid(u):
                    launch_gui_window(n, platform="x11")
            _await(todo, GUI_X11_RETRY_TIMEOUT)
    for n, _u, _p in todo:
        if n not in ready:
            dump_gui_log(n)
    return ready


def cleanup_gui_cmd_dir(valid_names):
    """清理 GUI 命令目录中不属于 valid_names 的窗口命令文件；
    valid_names 为空 = 全部删除（任务启动时用：上一轮的 .sh 可能带着失效的
    WAYLAND_DISPLAY/XDG_RUNTIME_DIR，被执行就会直接失败）。
    desktop.sh 的 generate_rcxml 按目录下每个 .sh 生成一条平铺规则；残留文件
    （模板测试遗留的 _template.sh、旧账号 legacy.sh）会让规则数多于账号数，
    第 5 个窗口被平铺到 y=1080 屏幕外，导致进程在跑但窗口不可见。"""
    try:
        if not os.path.isdir(GUI_CMD_DIR):
            return
        valid = {f"{n}.sh" for n in valid_names}
        for f in os.listdir(GUI_CMD_DIR):
            if not f.endswith(".sh") or f in valid:
                continue
            try:
                os.remove(os.path.join(GUI_CMD_DIR, f))
                logger.info(f"  🧹 已清理残留窗口命令: {f}")
            except Exception:
                pass
    except Exception as e:
        logger.warning(f"⚠️ 清理 GUI 窗口命令残留失败: {e}")


def start_multi_desktop_for_login(entries) -> bool:
    """拉起 noVNC 桌面（labwc+wayvnc+websockify）并让多个待登录账号的 GUI 浏览器窗口同时显示。
    entries: [(name, user_dir, port), ...]（全部为未登录账号）
    桌面已在运行 → 复用（不新开）；否则拉起。
    返回是否成功拉起（GUI 窗口就绪）。"""
    if not DESKTOP_ENABLE:
        logger.warning("⚠️ DESKTOP_ENABLE=0，跳过拉起桌面")
        return False
    if not entries:
        return False
    # 关键：无头启动阶段自建的计划接口可能正占着 noVNC 端口（8080），
    # 不先让位，desktop.sh 里的 websockify 就绑不上 → /vnc.html 404 → GUI 打不开。
    _release_plan_http_for_desktop()
    # 记录待登录账号列表（供桌面提示显示）
    try:
        names = "、".join(n for n, _, _ in entries)
        with open(LUMEN_HOSTNAME_FILE, "w", encoding="utf-8") as f:
            f.write(f"待登录: {names}\n")
    except Exception:
        pass
    if not write_gui_cmds(entries):
        return False
    if _desktop_running():
        logger.info("🖥️  桌面已在运行，复用当前桌面并启动 GUI 窗口")
        # 不调 start-windows（会重复拉起目录下所有 .sh，包括已登录账号的窗口），
        # autostart 也只在合成器启动时跑过一次 → 直接自己拉窗口，不等 autostart
        autostart = False
        # 复用桌面时也体检一次：labwc 还活着但 websockify 挂了，页面同样是空白
        if not desktop_healthcheck():
            logger.warning("  ⚠️ 桌面在跑但 noVNC 不可用，尝试重启桌面（stop → start）")
            _run_desktop("stop")
            time.sleep(2)
            ok, out = _run_desktop("start")
            logger.info(f"  {out or '（无输出）'}")
            desktop_healthcheck(force=True)
    else:
        logger.info(f"🖥️  正在拉起 noVNC 桌面（{len(entries)} 个账号待手动登录）...")
        ok, out = _run_desktop("start")
        if not ok:
            logger.warning(f"⚠️ 桌面启动失败: {out}")
            return False
        logger.info(f"  {out}")
        autostart = True
        desktop_healthcheck()
    # 等所有账号 GUI 浏览器就绪（CDP 端口可连）。首次启动 profile 较慢，
    # 超时给足（默认 45 秒），避免误判未就绪而回退无头与 GUI 实例抢同一 profile。
    # 桌面脚本（autostart）没真正执行 .sh 时，这里会自己补执行，
    # 不再「桌面起来了但没有窗口」。
    ready = ensure_gui_windows(entries, autostart=autostart)
    logger.info(f"🖥️  GUI 浏览器就绪 {len(ready)}/{len(entries)} 个，请打开 {LUMEN_URL} 手动登录（窗口标题带账号名）")
    return True


def stop_desktop():
    """停止 noVNC 桌面（登录完成后调用，回到无头省资源）"""
    global _PLAN_HTTP_YIELDED
    # 用 _desktop_running 而不是 desktop_status：status 会误报「没在跑」，
    # 那样桌面就永远停不掉，白占 CPU/内存。
    if not _desktop_running():
        return
    logger.info("🖥️  登录完成，停止桌面...")
    _run_desktop("stop")
    # websockify 随桌面一起停掉后 8080 会空出来：把之前让位的自建接口挂回去，
    # 否则脚本猫在这之后的每分钟敲门就读不到端口映射/计划。
    if _PLAN_HTTP_YIELDED:
        time.sleep(1)   # 等 websockify 释放 8080
        ensure_plan_http(_PLAN_HTTP_TEXT)
        _verify_plan_http(_PLAN_HTTP_PORT)
        _PLAN_HTTP_YIELDED = False


def wait_login_done(port: int, expected_email: str, timeout: int = None,
                    user_dir: str = None) -> dict:
    """等待用户通过 GUI 手动登录完成（轮询登录状态直到成功或超时）。
    登录成功 = 已登录 且 页面邮箱与 expected_email 一致（matched 不为 False；
    页面无邮箱时 matched=None 视为完成）。若已登录但邮箱不匹配（登错账号），
    继续等待并提示，不当作登录完成。

    注意：只在开始时导航一次到 dashboard（触发登录页），之后轮询时
    不导航，避免反复导航打断用户正在操作的登录页（会表现为页面不断刷新）。
    返回最终 check_login 结果。"""
    timeout = timeout if timeout is not None else DESKTOP_LOGIN_WAIT
    # 开始时导航一次，让页面进入登录流程（用户开始在登录页操作）
    try:
        target = _find_page_target(port)
        if target:
            sess = _CdpSession(target["webSocketDebuggerUrl"])
            _goto(sess, "https://rewards.bing.com/dashboard")
            sess.close()
    except Exception:
        pass
    if timeout <= 0:
        logger.info(f"⏳ 等待账号 {expected_email} 手动登录（不设超时），请打开 {LUMEN_URL} 完成登录...")
        while True:
            res = check_login(port, expected_email, navigate=False, user_dir=user_dir)
            if res.get("ok") and res.get("matched") is not False:
                logger.info(f"  ✅ {res['reason']}")
                return res
            if res.get("ok") and res.get("matched") is False:
                logger.warning(f"  🔄 {res['reason']} —— 请登出并登录正确账号，继续等待...")
            time.sleep(DESKTOP_LOGIN_POLL)
    logger.info(f"⏳ 等待账号 {expected_email} 手动登录（最长 {timeout} 秒），请打开 {LUMEN_URL} 完成登录...")
    deadline = time.time() + timeout
    last_reason = ""
    while time.time() < deadline:
        res = check_login(port, expected_email, navigate=False, user_dir=user_dir)
        if res.get("ok") and res.get("matched") is not False:
            logger.info(f"  ✅ {res['reason']}")
            return res
        if res.get("ok") and res.get("matched") is False:
            logger.warning(f"  🔄 {res['reason']} —— 请登出并登录正确账号，继续等待...")
        last_reason = res.get("reason", "")
        time.sleep(DESKTOP_LOGIN_POLL)
    logger.warning(f"⚠️ 等待手动登录超时（{last_reason}），继续无头模式执行")
    return {"ok": False, "reason": last_reason}


def _gui_title_watch(name: str, port: int):
    """守护线程：持续把 GUI 浏览器窗口标题标注为「【账号名】 + 网页标题」。
    登录页/页面标题变化时会自动重建前缀，方便桌面多窗口区分账号。"""
    logger.info(f"🏷️  启动账号 {name} 的窗口标题守护（端口 {port}）")
    prefix = f"【{name}】 "
    last_page_id = None
    while True:
        try:
            target = _find_page_target(port)
            if not target:
                time.sleep(2)
                continue
            page_id = target.get("id")
            if page_id != last_page_id:
                last_page_id = page_id
            sess = _CdpSession(target["webSocketDebuggerUrl"])
            try:
                # 读取当前标题并加前缀（避免重复前缀）
                title = sess.evaluate("document.title || location.hostname")
                if isinstance(title, str) and title and not title.startswith(prefix):
                    new_title = prefix + title
                    sess.call("Runtime.evaluate", {
                        "expression": f"document.title = {json.dumps(new_title)};"
                    }, timeout=8)
                    logger.info(f"🏷️  账号 {name} 窗口标题 → {new_title}")
            except Exception:
                pass
            finally:
                sess.close()
        except Exception:
            pass
        time.sleep(3)


def _is_task_running_elsewhere() -> bool:
    """单实例保护：检查是否有另一个「微软积分任务」实例已在运行。
    通过匹配当前脚本的绝对路径对应的 python 进程实现（面板注入的进程名
    因编码显示为 ????，故按命令行中的脚本路径 + 'python' 关键词匹配）。
    返回 True 表示存在其它实例（本实例应退出）。"""
    try:
        me = os.path.abspath(__file__)
        ret = subprocess.run(
            ["pgrep", "-f", me],
            capture_output=True, text=True, timeout=10
        )
        if ret.returncode == 0 and ret.stdout.strip():
            pids = [int(x) for x in ret.stdout.strip().split()]
            # 过滤掉自身进程
            mine = set()
            try:
                mine.add(os.getpid())
                mine.add(os.getppid())
            except Exception:
                pass
            others = [p for p in pids if p not in mine]
            if others:
                # 再确认其它实例是存活（非僵尸）的 python 进程（而非残留的
                # pgrep/shell 匹配）。僵尸进程已被 kill 但未回收，命令行仍在
                # /proc 里，若不排除会误判为重复实例导致任务永远无法启动。
                alive = []
                for p in others:
                    try:
                        stat = open(f"/proc/{p}/stat", "r").read()
                        # 格式: pid (comm) state ...，state 是第三个字段
                        state = stat.split(") ", 1)[1].split()[0] if ") " in stat else "?"
                        if state == "Z":
                            continue
                        with open(f"/proc/{p}/comm", "r") as f:
                            if "python" in (f.read().strip() or "").lower():
                                alive.append(p)
                    except Exception:
                        continue
                if alive:
                    logger.info(f"ℹ️  检测到任务实例已在运行: PIDs={alive}")
                    return True
    except Exception as e:
        logger.warning(f"⚠️ 单实例检查异常（忽略，继续执行）: {e}")
    return False


# ── 运行时段（把「脚本猫」里的时间段配置搬到这里）──────────────────────────────
# 为什么搬过来：脚本猫里的时间段是「浏览器已经跑起来之后」才判断要不要干活，
# 空转几十分钟到几小时白占内存/CPU。放到 zy.py 启动阶段判断，
# 没进时段就压根不启动浏览器（也不拉 noVNC 桌面），到点再启动。
_RUN_WINDOW_PRESETS = {
    "morning":   ("06:00", "12:00"),
    "forenoon":  ("06:00", "12:00"),
    "afternoon": ("12:00", "18:00"),
    "evening":   ("18:00", "23:59"),
    "night":     ("23:00", "06:00"),
    "allday":    ("00:00", "24:00"),
    "all":       ("00:00", "24:00"),
    "全天":      ("00:00", "24:00"),
    "上午":      ("06:00", "12:00"),
    "下午":      ("12:00", "18:00"),
    "晚上":      ("18:00", "23:59"),
    "夜间":      ("23:00", "06:00"),
}


def _hhmm_to_min(s: str):
    """'08:30' → 510；'24:00' → 1440；非法返回 None"""
    m = re.match(r"^\s*(\d{1,2}):(\d{2})\s*$", s or "")
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if not (0 <= h <= 24 and 0 <= mi < 60):
        return None
    if h == 24 and mi != 0:
        return None
    return h * 60 + mi


def parse_run_windows(spec: str):
    """把 RUN_WINDOW 解析成 [(start_min, end_min), ...]（跨零点时 end<start）；解析不了返回 []"""
    out = []
    for part in re.split(r"[,，;；、\s]+", (spec or "").strip()):
        if not part:
            continue
        p = part.lower()
        s = e = None
        if p in _RUN_WINDOW_PRESETS:
            a, b = _RUN_WINDOW_PRESETS[p]
            s, e = _hhmm_to_min(a), _hhmm_to_min(b)
        elif re.search(r"[-~至]", part):
            seg = re.split(r"[-~至]", part)
            if len(seg) == 2:
                s, e = _hhmm_to_min(seg[0]), _hhmm_to_min(seg[1])
        else:
            logger.warning(f"⚠️ RUN_WINDOW 里无法识别的段：{part!r}"
                           f"（支持 08:00-11:00，或 morning/afternoon/evening/night/allday）")
            continue
        if s is None or e is None:
            logger.warning(f"⚠️ RUN_WINDOW 时间段格式不对：{part!r}（应形如 08:00-11:00）")
            continue
        if s == e:
            logger.warning(f"⚠️ RUN_WINDOW 起止相同（{part!r}），按全天处理")
            s, e = 0, 1440
        out.append((s, e))
    return out


def _window_contains(now_min: int, s: int, e: int) -> bool:
    if e > s:
        return s <= now_min < e
    return now_min >= s or now_min < e        # 跨零点，如 23:00-06:00


def _fmt_dur(sec) -> str:
    sec = int(max(0, sec))
    d, rem = divmod(sec, 86400)
    h, rem = divmod(rem, 3600)
    m, s2 = divmod(rem, 60)
    if d:
        return f"{d}天{h}小时{m}分"
    if h:
        return f"{h}小时{m}分"
    if m:
        return f"{m}分{s2}秒" if s2 else f"{m}分"
    return f"{s2}秒"


def _window_label(wins) -> str:
    return "、".join(f"{s // 60:02d}:{s % 60:02d}-{e // 60:02d}:{e % 60:02d}" for s, e in wins)


def _window_bounds(now: datetime, s: int, e: int):
    """包含 now 或紧随 now 的那一段窗口 (start, end)"""
    base = now.replace(hour=0, minute=0, second=0, microsecond=0)
    start = base + timedelta(minutes=s)
    end = base + timedelta(minutes=e)
    if e <= s:                       # 跨零点
        end += timedelta(days=1)
    if end <= now:                   # 今天的已经过完 → 明天这一段
        start += timedelta(days=1)
        end += timedelta(days=1)
    return start, end


def _run_deadline(now: datetime):
    """今天的收工时刻 RUN_DEADLINE（如 18:00）；没配或格式不对返回 None"""
    mins = _hhmm_to_min(RUN_DEADLINE)
    if mins is None:
        if RUN_DEADLINE:
            logger.warning(f"⚠️ RUN_DEADLINE={RUN_DEADLINE!r} 格式不对（应形如 18:00），忽略")
        return None
    base = now.replace(hour=0, minute=0, second=0, microsecond=0)
    dl = base + timedelta(minutes=mins)
    while dl <= now:
        dl += timedelta(days=1)
    return dl


def _load_start_state() -> dict:
    try:
        with open(RUN_START_STATE, encoding="utf-8") as f:
            st = json.load(f)
        return st if isinstance(st, dict) else {}
    except Exception:
        return {}


def _save_start_state(st: dict):
    try:
        Path(RUN_START_STATE).parent.mkdir(parents=True, exist_ok=True)
        # 只留最近 7 天
        for k in sorted(st.keys())[:-7]:
            st.pop(k, None)
        with open(RUN_START_STATE, "w", encoding="utf-8") as f:
            json.dump(st, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"  ⚠️ 写入随机开机时刻失败（{RUN_START_STATE}）: {e}")


def _pick_start_at(lo: datetime, hi: datetime) -> datetime:
    """在 [lo, hi] 里随机挑开机时刻；同一天摇过就沿用落盘的那个"""
    dkey = f"{lo:%Y-%m-%d}"
    st = _load_start_state()
    rec = st.get(dkey)
    if isinstance(rec, dict) and rec.get("startAt"):
        try:
            t = datetime.fromisoformat(rec["startAt"])
            if lo <= t <= hi:                     # 仍在今天的可用区间内
                logger.info(f"⏰ 沿用今天已摇出的开机时刻 {t:%H:%M}（面板重启不会重新摇号）")
                return t
        except Exception:
            pass
    span = max(0, int((hi - lo).total_seconds()))
    t = lo + timedelta(seconds=random.randint(0, span))
    st[dkey] = {"startAt": t.isoformat(timespec="seconds"),
                "picked": f"{datetime.now():%Y-%m-%d %H:%M:%S}"}
    _save_start_state(st)
    return t


def wait_for_run_window(run_seconds: int = 0):
    """确认「可以开机」，返回计划 dict；不该跑时返回 None。

    两层随机的分工（面板 + 脚本猫）：
      ① 朱雀面板每天 9:00 只拉起本脚本一次（Cron `0 0 9 * * *`），开机时刻由这里在
         RUN_WINDOW（09:00-15:00）内随机挑，到点才启动浏览器；等待期间只占一个空闲进程。
         RUN_START_RANDOM=0 时进程一起来就开浏览器（不随机）。
      ② 计划文件写出去后，脚本猫在 [开机时刻, RUN_DEADLINE] 之间再随机决定执行时刻。

    时段语义（RUN_WINDOW_MISSED）：
      auto（默认）只要「现在 → 收工」还够最短运行时长（RUN_MIN_SECONDS）就启动——
                  窗口内照常在窗口内摇号；窗口已过/未开窗也直接跑，绝不跨天死等
      wait        不在窗口内就等到下一段（含跨天），旧行为
      skip        不在窗口内就直接结束

    返回 {"window": 标签, "start_at": datetime, "deadline": datetime|None}
    RUN_WINDOW 留空 = 不限制，立刻开始（等价于原来的行为）。"""
    now = datetime.now()
    deadline = _run_deadline(now)
    min_secs = max(0, RUN_MIN_SECONDS)

    def _finish(start_at: datetime, label: str):
        """统一收尾：等到开机时刻；再保证「开机 → 收工」不少于最短运行时长。

        这一步是「任务启动后能跑完」的关键：不管因为什么原因（面板起晚了、
        手动重启、摇号摇到窗口末尾）导致开机时刻很晚，都不会出现
        「浏览器刚起来就到收工、脚本猫还没跑就关掉」。
        """
        log_gap = RUN_WAIT_LOG_SECONDS
        last_log = 0.0        # 0 = 立刻打第一条，让面板上马上能看到「在等、等多久」
        # 等待本来就很短（≤10 分钟）时不必再补「就开机」那条，首条心跳已经说清楚了
        near_logged = (start_at - datetime.now()).total_seconds() <= 600
        while True:
            remain = (start_at - datetime.now()).total_seconds()
            if remain <= 0:
                break
            now_ts = time.time()
            if now_ts - last_log >= log_gap:
                logger.info(f"  ⏳ 距开机时刻还有 {_fmt_dur(remain)}"
                            f"（{start_at:%H:%M} 开机，浏览器未启动）")
                last_log = now_ts
            elif not near_logged and remain <= 600:
                # 快到点了单独提示一条，避免「最后一次心跳是一小时前」看着像卡死
                near_logged = True
                logger.info(f"  ⏳ 还有 {_fmt_dur(remain)} 就开机（{start_at:%H:%M}）")
            time.sleep(min(remain, 30))     # 分段睡，面板发 SIGTERM 能及时响应
        dl = deadline
        if dl and min_secs:
            left = (dl - datetime.now()).total_seconds()
            if left < min_secs:
                # 收工时间是硬的：到点就关浏览器，绝不为「凑够最短时长」往后拖。
                # 能走到这里说明开机被拖晚了（面板起晚 / 中途重启 / 窗口特别窄），
                # 那就跑多少算多少，剩下的明天继续 —— 但 18:00 这条线不动。
                logger.warning(f"⏰ 距收工 {deadline:%H:%M} 只剩 {_fmt_dur(left)}，"
                               f"不足期望的 {_fmt_dur(min_secs)}；按「{deadline:%H:%M} 准点收工」"
                               f"不做顺延，能跑多少算多少")
        return {"window": label, "start_at": start_at, "deadline": dl}

    wins = parse_run_windows(RUN_WINDOW)
    if not wins:
        if RUN_WINDOW:
            logger.warning(f"⚠️ RUN_WINDOW={RUN_WINDOW!r} 解析不出有效时段，按「不限制」处理")
        return _finish(now, "")

    label = _window_label(wins)
    now_min = now.hour * 60 + now.minute
    missed = (RUN_WINDOW_MISSED or "auto").lower()

    # ① 当前就在某个窗口段里 → 用这一段（不开随机时立刻开机）
    cur = None
    for s, e in wins:
        if _window_contains(now_min, s, e):
            cur = _window_bounds(now, s, e)
            break

    if cur is None:
        # ② 不在窗口内：先看「今天还有没有没开始的窗口」
        today = now.replace(hour=0, minute=0, second=0, microsecond=0)
        later_today = []
        for s, e in wins:
            start_today = today + timedelta(minutes=s)
            if start_today > now:
                end_today = today + timedelta(minutes=e)
                if e <= s:
                    end_today += timedelta(days=1)
                later_today.append((start_today, end_today))

        if missed in ("skip", "exit", "none", "no", "0"):
            logger.warning(f"⏰ 当前 {now:%H:%M} 不在运行时段 {label} 内，"
                           f"RUN_WINDOW_MISSED=skip → 本次不启动浏览器，直接结束")
            return None

        if missed in ("auto", "smart") and not later_today:
            # 今天的窗口过完了：关键是「还能不能跑完」——够最短运行时长就立刻开工。
            # ⚠️ _run_deadline() 在今天收工点已过时，会把 deadline 顶到「次日」同一时刻
            # （如 18:41 启动时 deadline=次日18:00）。此时 left 会算出 ~23 小时的假象，
            # 绕过下面的「偏晚顺延」判断，把运行时长写成到次日收工（浏览器一开 23 小时）。
            # 「跨天 deadline」等价于「今天收工点已过」，强制按偏晚启动走顺延一整轮。
            deadline_rolled = bool(deadline and deadline.date() > now.date())
            left = (deadline - now).total_seconds() if deadline else 0
            if deadline_rolled:
                left = 0
            if min_secs and left < min_secs:
                # 启动偏晚，距原收工不足一整轮。默认（RUN_LATE_EXTEND=1）不再放弃启动，
                # 而是把收工时刻从「现在」顺延一整轮：脚本猫按计划文件的 runUntil
                # 铺排执行点，这样它有足够时间把今天该跑的跑完；全部账号完成后会提前
                # 结束，不必真等满顺延时长。只有显式设 0 才恢复「来不及就不启动」。
                if RUN_LATE_EXTEND:
                    # 顺延一整轮，再多留 2 分钟收尾余量：既避开 _finish() 里
                    # 「距收工不足最短时长」的误报，也给脚本猫末轮搜索留出收尾时间。
                    old_deadline = deadline
                    deadline = now + timedelta(seconds=min_secs + 120)
                    if deadline_rolled:
                        logger.warning(f"⏰ 当前 {now:%H:%M} 启动偏晚，今天收工点 {old_deadline:%H:%M} 已过，"
                                       f"不足一轮最短运行时长 {_fmt_dur(min_secs)}。"
                                       f"按「跑完再结束」处理：不再死守原收工时间，"
                                       f"收工顺延到 {deadline:%H:%M}（现在起算一整轮），立即启动浏览器")
                    else:
                        logger.warning(f"⏰ 当前 {now:%H:%M} 启动偏晚，距原收工只剩 {_fmt_dur(left)}，"
                                       f"不足一轮最短运行时长 {_fmt_dur(min_secs)}。"
                                       f"按「跑完再结束」处理：不再死守原收工时间，"
                                       f"收工顺延到 {deadline:%H:%M}（现在起算一整轮），立即启动浏览器")
                else:
                    logger.warning(f"⏰ 当前 {now:%H:%M} 不在运行时段 {label} 内，且距收工 "
                                   f"{deadline:%H:%M} 只剩 {_fmt_dur(left)}"
                                   f"（< 最短运行时长 {_fmt_dur(min_secs)}）→ 今天来不及跑完，"
                                   f"本次不启动浏览器（RUN_LATE_EXTEND=0）")
                    return None
            if deadline:
                logger.info(f"⏰ 当前 {now:%H:%M} 已过运行时段 {label}，收工时刻 {deadline:%H:%M} "
                            f"→ 立即启动浏览器，把今天该跑的跑完")
            else:
                logger.info(f"⏰ 当前 {now:%H:%M} 不在运行时段 {label} 内，未配收工时间"
                            f"→ 立即启动浏览器")
            return _finish(now, label)

        pool = later_today if (missed in ("auto", "smart") and later_today) \
            else [_window_bounds(now, s, e) for s, e in wins]
        cur = min(pool, key=lambda b: b[0])
    win_start, win_end = cur

    # 开机时刻的可用区间：窗口内，给任务留至少 10 分钟，且必须给「开机 → 收工」
    # 留够最短运行时长（否则摇到窗口末尾就等于自己砍掉运行时间）。
    lo = max(win_start, now)
    hi = win_end - timedelta(minutes=10)
    if deadline and min_secs:
        hi = min(hi, deadline - timedelta(seconds=min_secs))
    if deadline and hi > deadline:
        hi = deadline
    if not RUN_START_RANDOM or hi <= lo:
        start_at = lo
        if start_at > now:
            logger.info(f"⏰ 未到运行时段 {label}，等 {start_at:%m-%d %H:%M} 再启动浏览器")
        else:
            logger.info(f"⏰ 当前 {now:%H:%M} 在运行时段 {label} 内，立即启动浏览器")
    else:
        start_at = _pick_start_at(lo, hi)
        if start_at > now:
            # 实际可用时长按「这次摇到的开机时刻 → 收工」算并打印出来，
            # 避免把「最短保证」误读成「今天只有这么久」。
            real_left = int((deadline - start_at).total_seconds()) if deadline else 0
            logger.info(f"⏰ 运行时段 {label}，随机开机时刻 {start_at:%m-%d %H:%M}"
                        f"（可选区间 {lo:%H:%M}~{hi:%H:%M}；"
                        + (f"本次实际可用 {_fmt_dur(real_left)}，最短保证 {_fmt_dur(min_secs)}"
                           if real_left > 0 else f"已给任务留出 {_fmt_dur(min_secs)} 运行时长")
                        + "），浏览器暂不启动")
        else:
            logger.info(f"⏰ 运行时段 {label}，今日已摇出的开机时刻 {start_at:%H:%M} 已过，立即启动浏览器")
    return _finish(start_at, label)


def _clamp_run_seconds(run_seconds: int, plan: dict) -> int:
    """运行时长：配了 RUN_DEADLINE 就以「到收工时间」为准；返回 -1 表示已过收工时间"""
    dl = plan.get("deadline")
    if not dl:
        return run_seconds
    left = int((dl - datetime.now()).total_seconds())
    if left <= 0:
        logger.warning(f"⏰ 已过收工时间 {dl:%H:%M}，本次不启动浏览器")
        return -1
    if run_seconds != left:
        logger.info(f"⏰ 运行时长改由收工时间 {dl:%H:%M} 决定：{_fmt_dur(left)}"
                    f"（原 BING_RUN_SECONDS={run_seconds}）")
    return left


def _websockify_web_dirs():
    """找出 websockify 实际以 --web 提供的目录。

    计划文件只有落在 websockify 的 web 根下，脚本猫才能经 8080 读到。
    镜像里默认 --web=/usr/share/novnc，但换过启动方式/换过镜像时可能不同，
    所以这里从进程参数里读，读到就多写一份，避免「文件写了但读不到」。"""
    dirs = []
    try:
        out = subprocess.run(["ps", "-eo", "args"], capture_output=True, text=True,
                             timeout=5).stdout
    except Exception:
        return dirs
    for line in out.splitlines():
        if "websockify" not in line:
            continue
        for m in re.finditer(r"--web(?:=|\s+)(\S+)", line):
            d = m.group(1).strip().strip("'\"")
            if d and os.path.isdir(d) and d not in dirs:
                dirs.append(d)
    return dirs


def _probe_plan(port: int, timeout: float = 2.0) -> bool:
    """某个端口上能不能读到今日计划（内容里得有 startAt）"""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{port}/zy-run-plan.json",
                                    timeout=timeout) as r:
            return '"startAt"' in r.read(500).decode("utf-8", "replace")
    except Exception:
        return False


def ensure_plan_http(text: str) -> int:
    """保证「脚本猫能经 127.0.0.1 读到计划」，返回可用端口（0=全都不可用）。

    为什么必须自己起服务：脚本猫没有读文件的权限，只能走 HTTP。而计划文件
    平时是靠 noVNC 的 websockify（--web=/usr/share/novnc）提供的 ——
    **无头模式（HEADLESS_MODE != gui）根本不启动桌面，8080 上没有 websockify，
    文件写得再对也读不到**，脚本猫于是整天回退成「全天唤醒分布」，
    执行点撒在已经过去的时刻上（实测就是这么丢掉大半天任务的）。

    所以这里挂一个只读迷你接口：只回 /zy-run-plan.json 和 /zy-ports.json，
    其它路径一律 404，不暴露目录。接口固定在独立端口（默认 47831），与 GUI 的
    noVNC 端口（8080）彻底隔离 —— 既不会抢 websockify 的页面端口（GUI 打不开的
    老根因），也不依赖桌面是否启动。独立端口全不可用时才回退复用 websockify
    静态目录（GUI 模式）那份。"""
    global _PLAN_HTTP_TEXT, _PLAN_HTTP_PORT, _PLAN_HTTP_SERVER
    _PLAN_HTTP_TEXT = text

    # 已有自建接口在独立端口跑着 → 复用（内容由 _PLAN_HTTP_TEXT 每次刷新）
    if _PLAN_HTTP_PORT and _PLAN_HTTP_PORT != _novnc_port() and _probe_plan(_PLAN_HTTP_PORT):
        return _PLAN_HTTP_PORT

    # 在独立端口列表里起自建接口，显式跳过 noVNC 端口，绝不和 websockify 抢
    novnc_port = _novnc_port()
    for port in PLAN_HTTP_PORTS:
        if port == novnc_port:
            continue
        try:
            srv = http.server.ThreadingHTTPServer(("127.0.0.1", port), _PlanHandler)
        except OSError:
            continue                      # 端口被占，试下一个
        srv.daemon_threads = True
        threading.Thread(target=srv.serve_forever,
                         name=f"plan-http-{port}", daemon=True).start()
        _PLAN_HTTP_PORT = port
        _PLAN_HTTP_SERVER = srv   # 保存引用（让位逻辑兜底用；正常独立端口不会触发）
        logger.info(f"🌐 已自建计划读取接口：http://127.0.0.1:{port}/zy-run-plan.json"
                    f"（独立端口，不与 GUI 的 {novnc_port} 冲突，脚本猫从这里取计划）")
        return port
    # 兜底：独立端口全失败时，若 websockify 已在 noVNC 端口提供计划就复用它
    if _probe_plan(novnc_port):
        _PLAN_HTTP_PORT = novnc_port
        return novnc_port
    logger.warning(f"⚠️ 计划接口启动失败：独立端口 {PLAN_HTTP_PORTS} 全被占用，"
                   f"且 noVNC 端口 {novnc_port} 也读不到计划 → 脚本猫会回退成全天唤醒分布")
    return 0


def _verify_plan_http(port: int = 0):
    """写完计划后自检「脚本猫到底能不能读到」，把结论写进日志。

    以前的形态：文件写成功、日志一切正常，但无头模式下没有任何进程提供它，
    脚本猫整天读不到 → 回退成全天唤醒分布 → 执行点撒在已经过去的时刻上。
    这种失败必须当场喊出来，不能等用户去看日志猜。"""
    port = port or _PLAN_HTTP_PORT or _novnc_port()
    url = f"http://127.0.0.1:{port}/zy-run-plan.json"
    if _probe_plan(port):
        logger.info(f"✅ 计划自检通过：脚本猫可从 {url} 读取")
        return True
    logger.warning(f"⚠️ 计划自检失败：{url} 读不到")
    tried = "、".join(f"{p}" for p in PLAN_HTTP_PORTS)
    logger.warning(f"   → 已尝试端口 {tried}，脚本猫会退回「全天唤醒分布」，"
                   f"执行点可能撒在已过去的时刻")
    return False


def write_run_plan(plan: dict, run_seconds: int):
    """写出本次计划，供「脚本猫」在 [开机时刻, 收工时刻] 之间二次随机执行"""
    dl = plan.get("deadline")
    data = {
        "date": f"{datetime.now():%Y-%m-%d}",
        "window": plan.get("window") or "",
        "startAt": plan["start_at"].isoformat(timespec="seconds"),
        "runUntil": dl.isoformat(timespec="seconds") if dl else None,
        "runSeconds": run_seconds,
        "ts": int(time.time() * 1000),
    }
    text = json.dumps(data, ensure_ascii=False, indent=2)
    dests = list(RUN_PLAN_FILES)
    for d in _websockify_web_dirs():
        p = os.path.join(d, "zy-run-plan.json")
        if p not in dests:
            dests.append(p)
    ok = []
    for p in dests:
        try:
            Path(p).parent.mkdir(parents=True, exist_ok=True)
            with open(p, "w", encoding="utf-8") as f:
                f.write(text)
            ok.append(p)
        except Exception as e:
            logger.warning(f"  ⚠️ 计划文件写入失败 {p}: {e}")
    logger.info(f"📋 任务计划：开机 {plan['start_at']:%H:%M}"
                + (f"，收工 {dl:%H:%M}" if dl else "")
                + f"；已写入 {len(ok)} 处（{('、'.join(ok)) or '无'}）")
    # 关键一步：自己挂独立端口的只读接口（不占 GUI 的 8080），脚本猫从这里读
    port = ensure_plan_http(text)
    _verify_plan_http(port)


def main():
    run_seconds = int(get_env("BING_RUN_SECONDS", "900"))

    # 面板停止任务时向进程发送 SIGTERM；若不处理，python 直接退出导致 finally
    # 不执行、浏览器残留。转为 KeyboardInterrupt 走 finally 统一清理。
    global _TERMINATED
    _TERMINATED = False

    def _on_terminate(sig, frame):
        global _TERMINATED
        _TERMINATED = True
        logger.warning(f"⚠️ 收到终止信号 SIGTERM({sig})，正在关闭浏览器...")
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, _on_terminate)

    logger.info("⚙️  任务配置:")
    logger.info(f"  BING_RUN_SECONDS = {run_seconds}（面板环境变量）")
    logger.info(f"  CLOSE_AFTER = {CLOSE_AFTER}")
    logger.info(f"  CDP_BASE_PORT = {CDP_BASE_PORT}")
    logger.info(f"  HEADLESS_MODE = {HEADLESS_MODE}  DESKTOP_ENABLE = {DESKTOP_ENABLE}")
    logger.info(f"  搜索参数请查看「脚本猫-微软积分商城签到脚本」的 UserConfig 页面配置")

    # 容器重启后 XDG_RUNTIME_DIR 常常不存在：labwc/wayvnc 起不来、chromium 报
    # 「XDG_RUNTIME_DIR is invalid or not set」，最终 noVNC 页面空白。先补上。
    if DESKTOP_ENABLE:
        _ensure_xdg_runtime()

    # 单实例保护：若已有同脚本的任务实例在运行，直接退出，避免两个任务
    # 并发启动同一批 profile → Chromium 报「Profile error occurred」/互相抢占。
    if _is_task_running_elsewhere():
        logger.warning("⚠️ 检测到已有「微软积分任务」在运行，本实例直接退出（避免多任务抢占浏览器 profile）")
        sys.exit(0)

    accounts = load_accounts()
    logger.info(f"👥 共 {len(accounts)} 个账号")
    for acc in accounts:
        logger.info(f"  - {acc['name']} ({acc['email']})  → 用户目录: {CHROME_USER_DATA_BASE}/user-{acc['name']}")

    # 清理 GUI 窗口命令目录里所有 .sh。上一轮留下的文件可能带着已经失效的
    # WAYLAND_DISPLAY/XDG_RUNTIME_DIR，被 desktop.sh 的 autostart 执行会直接
    # 报「Failed to connect to Wayland display」退出；也可能带来多余的平铺规则。
    # 本轮会按当前真实 socket 重新写（gui 模式下面一次性写全部账号）。
    cleanup_gui_cmd_dir([])

    # GUI 模式：桌面一起来就该让所有账号窗口同时显示，先把所有账号的窗口命令
    # 写好，避免「只写了第一个账号、其余还是上一轮的坏文件」。
    if HEADLESS_MODE == "gui" and DESKTOP_ENABLE:
        gui_entries = []
        for i, acc in enumerate(accounts):
            u = os.path.join(CHROME_USER_DATA_BASE, f"user-{acc['name']}")
            Path(u).mkdir(parents=True, exist_ok=True)
            gui_entries.append((acc["name"], u, CDP_BASE_PORT + i if CDP_BASE_PORT else 0))
        write_gui_cmds(gui_entries)

    # 开工判定：面板每天 9:00 只拉起本脚本一次，开机时刻由这里在 RUN_WINDOW
    # （默认 09:00-15:00）内随机挑；没到点就等，等待期间只占一个空闲进程，
    # 浏览器不启动。真正的签到执行时刻由「脚本猫」读计划文件后二次随机。
    plan = wait_for_run_window(run_seconds)
    if plan is None:
        logger.info("本次不启动浏览器（原因见上方 ⏰ 日志），任务结束")
        return

    run_seconds = _clamp_run_seconds(run_seconds, plan)
    if run_seconds < 0:
        return
    write_run_plan(plan, run_seconds)

    # 启动浏览器前先获取热搜词写入文件（供「脚本猫-微软积分商城签到脚本」读取）
    generate_hotboard()

    # 可选随机延迟，避免多个任务同时触发（已配 RUN_WINDOW 时一般用不到）
    if RANDOM_DELAY > 0:
        delay = random.randint(0, RANDOM_DELAY)
        logger.info(f"【随机延迟】等待 {delay} 秒后开始执行...")
        time.sleep(delay)

    # —— 四账号同时上线 ——
    # 先并发把所有账号的浏览器拉起来（几秒内全部就绪），再逐个做登录检查。
    # 串行「启动→就绪→查登录→下一个」会让后面的账号晚几分钟才上线，
    # 而执行点是四账号共用的，晚到的账号会错过第一个执行点、整天少跑一轮。
    if HEADLESS_MODE != "gui":
        try:
            prelaunch_accounts(accounts)
        except Exception as e:
            logger.warning(f"⚠️ 并发预启动失败（主循环会逐个再试）：{e}")

    # 逐个账号：启动浏览器（已预启动则沿用） → 登录检查
    browsers = []  # (name, user_dir, pid, port, login_result)
    need_login = []  # (name, user_dir, port, email) 未登录、需桌面手动登录的账号
    for i, acc in enumerate(accounts):
        name = acc["name"]
        user_dir = os.path.join(CHROME_USER_DATA_BASE, f"user-{name}")
        port = CDP_BASE_PORT + i if CDP_BASE_PORT else 0
        Path(user_dir).mkdir(parents=True, exist_ok=True)

        pid = get_running_pid(user_dir)
        if pid and HEADLESS_MODE == "gui":
            # GUI 模式下沿用了一个无头实例 → 永远不会有窗口，桌面一片空白。
            # 上一轮被 KILL / 崩溃留下的无头浏览器很常见，这里必须切回带界面。
            mode, _ = _browser_launch_mode(user_dir)
            if mode == "headless":
                logger.warning(f"⚠️ 账号 {name} 已有无头实例（PID={pid}），GUI 模式看不到窗口 → 关闭后以带界面重启")
                close_browser(user_dir, port)
                time.sleep(2)
                pid = None
        if pid:
            logger.info(f"ℹ️  账号 {name} 的浏览器已在运行（PID={pid}，{_mode_label(_browser_launch_mode(user_dir)[0])}），本次沿用")
            # 沿用的浏览器也可能是刚被拉起的，等 CDP 页面就绪再查登录（就绪时秒回）
            wait_browser_ready(user_dir, port)
        else:
            if HEADLESS_MODE == "gui":
                global _NOVNC_REPAIR_DONE
                # GUI 模式：先拉起桌面，再 GUI 启动浏览器（供测试/调试）
                logger.info(f"🖥️  HEADLESS_MODE=gui，使用带界面浏览器（需桌面）")
                # 无头计划接口若占着 8080，先让位给 websockify，否则 /vnc.html 打不开。
                # 必须放在 if/else 之前：「复用桌面」这条路同样需要让位（上一版漏了）。
                _release_plan_http_for_desktop()
                if not _desktop_running():
                    write_gui_cmds([(name, user_dir, port)], prep=False)
                    ok, out = _run_desktop("start")
                    if not ok:
                        logger.warning(f"⚠️ 桌面启动失败: {out}")
                        try:
                            proc = launch_chrome(user_dir, port, headless=True)
                            pid = proc.pid
                        except Exception as e:
                            _launch_fail(name, acc["email"], e)
                            continue
                    else:
                        logger.info(f"  {out}")
                        desktop_healthcheck()
                    # 桌面刚起：它的 autostart 会执行刚写好的 .sh，先给它一点时间
                    autostart = True
                else:
                    logger.info("🖥️  桌面已在运行，复用当前桌面")
                    # 复用 ≠ noVNC 可用：labwc/wayvnc 还在，但 websockify 可能没绑上 8080
                    # （比如之前被自建接口占过、或上次异常退出）。force 体检一次，
                    # 不行就 stop→start 让 websockify 重新绑定，GUI 页面才打得开。
                    if not _NOVNC_REPAIR_DONE and not desktop_healthcheck(force=True):
                        logger.warning("  ⚠️ 桌面在跑但 noVNC 不可用，重启桌面让 websockify 重绑 8080")
                        _NOVNC_REPAIR_DONE = True
                        _run_desktop("stop")
                        time.sleep(2)
                        _run_desktop("start")
                        desktop_healthcheck(force=True)
                    # 不再调 desktop.sh start-windows：那会遍历执行目录下所有 .sh，
                    # 把前几个账号已经登录好的窗口再拉起一遍（多出重复窗口）。
                    # autostart 也早已执行过（只在合成器启动时跑一次），直接自己拉。
                    write_gui_cmds([(name, user_dir, port)], prep=False)
                    autostart = False
                if not pid:
                    # 等 GUI 浏览器就绪：桌面刚起就先等 autostart，没起来再自己执行
                    # 窗口命令（不依赖 desktop.sh），仍不行换 X11 重试；
                    # 失败时打印 chromium 自己的报错。
                    if ensure_gui_window(name, user_dir, port, autostart=autostart):
                        pid = get_running_pid(user_dir) or 0
                        if not pid:
                            logger.warning(f"  ⚠️ 账号 {name} CDP 已就绪，但未取到进程 PID（关闭时可能残留）")
                    else:
                        logger.warning("⚠️ GUI 浏览器未检测到，改用无头启动兜底")
                        try:
                            proc = launch_chrome(user_dir, port, headless=True)
                            pid = proc.pid
                        except Exception as e:
                            _launch_fail(name, acc["email"], e)
                            continue
            else:
                # 默认：无头启动（省资源，CDP 自动化）
                try:
                    proc = launch_chrome(user_dir, port, headless=True)
                    pid = proc.pid
                except Exception as e:
                    _launch_fail(name, acc["email"], e)
                    continue
            if pid:
                # 等待该浏览器就绪（最多 30 秒）：不仅等 OS 进程，还要等 CDP 页面 target，
                # 否则紧随其后的登录检查会因「未找到页面 target」在启动瞬间误判为未登录
                wait_browser_ready(user_dir, port)
                mode, _ = _browser_launch_mode(user_dir)
                logger.info(f"✅ 账号 {name} 浏览器启动成功！PID={pid}（{_mode_label(mode)}）")
                if HEADLESS_MODE == "gui" and mode == "headless":
                    logger.warning(f"  ⚠️ 期望带界面却跑成了无头：noVNC 桌面会是空白。"
                                   f"请看上方 GUI 启动失败的日志（{_gui_log_path(name)}）")

        # 🧩 新用户首次运行：用同目录 sc_deploy.py 装脚本猫扩展 + 商店脚本 + Cookie 授权
        #    已装过的账号这一步只做「确保启用/补授权」的轻量检查，不会重复安装。
        #    版本校准**不在这里**做：挪到任务正式开跑前统一做一次（_pre_task_calibrate），
        #    免得刚启动就 reload 打断脚本猫初始化，也免得每个账号各查一遍。
        if pid and port:
            try:
                _ensure_script_deploy(name, user_dir, port)
            except Exception as e:
                logger.warning(f"⚠️ 账号 {name} 脚本猫部署失败（不影响任务继续）: {e}")

        # 登录判断：rewards.bing.com + email 比对
        result = {"ok": None, "matched": False, "reason": "CDP 未开启，跳过登录检查", "current_email": None}
        if port:
            logger.info(f"🔐 正在检查账号 {name} ({acc['email']}) 的登录状态...")
            result = check_login(port, acc["email"], user_dir=user_dir)
            if result["ok"]:
                logger.info(f"  ✅ {result['reason']}")
                if result.get("matched") is False:
                    # 已登录但账号不匹配：明显异常，通知用户
                    send("【账号不符】",
                         f"账号 {name} 期望 {acc['email']}\n"
                         f"{result['reason']}\n"
                         f"请登出并登录正确账号后重跑任务")
            else:
                logger.warning(f"  ⚠️ {result['reason']}")
                if HEADLESS_MODE == "auto" and DESKTOP_ENABLE:
                    # 未登录 → 记入 need_login，主循环结束后统一拉起多账号桌面
                    need_login.append((name, user_dir, port, acc["email"]))
                    logger.info(f"🖥️  账号 {name} 未登录，待桌面手动登录（将与其他未登录账号一并显示）")
                else:
                    send("【账号未登录】",
                         f"账号 {name} ({acc['email']})\n"
                         f"{result['reason']}\n"
                         f"已继续执行任务；如需登录请设置 HEADLESS_MODE=auto")
        else:
            logger.warning(f"  ℹ️  CDP 已关闭，跳过账号 {name} 的登录检查")

        # 挂载该账号浏览器的脚本猫日志采集（GM_log → 朱雀任务日志，按用户输出）
        if port and SC_LOG_CAPTURE:
            threading.Thread(target=_sc_watch, args=(name, port), name=f"sc-watch-{name}", daemon=True).start()
            logger.info(f"🐱 已挂载账号 {name} 的脚本猫日志采集（端口 {port}）")

        browsers.append((name, user_dir, pid, port, result))
        # 登记账号 → 浏览器（供任务完成后关闭对应浏览器）
        with _ACCOUNT_LOCK:
            _ACCOUNT_BROWSERS[name] = {"pid": pid, "port": port}
        # 「脚本没跑」告警的计时起点（浏览器就绪时开始算宽限期）
        with _NORUN_LOCK:
            _WATCH_START[name] = time.time()

    # —— 多账号桌面：所有未登录账号一次拉起（复用已有桌面），并行等待手动登录 ——
    if need_login:
        if HEADLESS_MODE == "auto" and DESKTOP_ENABLE:
            # 关闭这些账号的无头浏览器（像点关闭按钮一样优雅退出整棵进程树），
            # 释放 CDP 端口与 profile 锁，准备切 GUI 复用同一 profile。
            # 必须确保该 profile 的所有实例全部退出，否则残留子进程与 GUI
            # 实例并发打开同一 profile → Chromium 报「Profile error occurred」。
            for n, d, p, _ in need_login:
                close_browser(d, p)
                time.sleep(2)
            # 记录 GUI 前的 pid 供后续替换
            gui_entries = [(n, d, p) for n, d, p, _ in need_login]
            names_login = "、".join(n for n, _, _, _ in need_login)
            logger.info(f"🖥️  共 {len(need_login)} 个账号未登录，拉起多账号桌面等待手动登录: {names_login}")
            gui_ok = start_multi_desktop_for_login(gui_entries)
            if gui_ok:
                # 每个账号窗口启动标题守护线程（窗口标题标注账号名）
                for n, _, p, _ in need_login:
                    threading.Thread(target=_gui_title_watch, args=(n, p),
                                     name=f"title-{n}", daemon=True).start()
                # 并行等待所有账号登录。每个账号登录成功后：
                #   除非 HEADLESS_MODE=gui（保留桌面窗口），否则立即关闭该账号的
                #   GUI 窗口并转无头后台运行；桌面继续保留给其它未登录账号。
                login_results = {}
                def _wait_one(n, d, p, em):
                    try:
                        # 等手动登录不能把「到收工」的时间全吃掉：留够最短运行时长，
                        # 否则人一直不扫码，浏览器起来了却一直等到收工，任务等于没跑。
                        caps = []
                        if DESKTOP_LOGIN_WAIT > 0:
                            caps.append(DESKTOP_LOGIN_WAIT)
                        if RUN_MIN_SECONDS > 0 and plan.get("deadline"):
                            room = int((plan["deadline"] - datetime.now()).total_seconds()) \
                                - RUN_MIN_SECONDS
                            caps.append(max(60, room))     # 至少给 60 秒扫码
                        budget = min(caps) if caps else None
                        if budget is not None:
                            logger.info(f"  ⏳ 账号 {n} 的登录等待上限 {_fmt_dur(budget)}"
                                        f"（保证收工前至少留 {_fmt_dur(RUN_MIN_SECONDS)} 跑任务）")
                        lr = wait_login_done(p, em, timeout=budget, user_dir=d)
                        if lr.get("ok") and HEADLESS_MODE != "gui":
                            # 登录成功 → 立即关闭该账号 GUI 窗口，转无头后台运行
                            logger.info(f"🖥️  账号 {n} 已登录，关闭 GUI 窗口并转无头后台运行")
                            close_browser(d, p)
                            time.sleep(2)
                            proc = launch_chrome(d, p, headless=True)
                            pid = proc.pid
                            for _ in range(15):
                                if get_running_pid(d):
                                    break
                                time.sleep(2)
                            lr["pid"] = pid
                            # 更新该账号在 browsers / _ACCOUNT_BROWSERS 中的信息
                            for bi in range(len(browsers)):
                                if browsers[bi][0] == n:
                                    browsers[bi] = (n, d, pid, p, lr)
                                    break
                            with _ACCOUNT_LOCK:
                                _ACCOUNT_BROWSERS[n] = {"pid": pid, "port": p}
                        else:
                            lr["pid"] = get_running_pid(d)
                        login_results[n] = lr
                    except Exception as e:
                        login_results[n] = {"ok": False, "reason": f"等待异常: {e}"}
                threads = []
                for n, d, p, em in need_login:
                    t = threading.Thread(target=_wait_one, args=(n, d, p, em), name=f"wait-{n}")
                    t.start()
                    threads.append(t)
                for t in threads:
                    t.join()
                # 所有账号等待结束：停止桌面（仅清理 GUI 浏览器，不影响已转无头的后台浏览器）
                stop_desktop()
                # 登录完成后回到无头模式继续任务（已转无头的账号不再重复启动）
                for idx, (n, d, p, em) in enumerate(need_login):
                    lr = login_results.get(n, {"ok": False, "reason": "未知"})
                    pid = lr.get("pid")
                    if lr.get("ok"):
                        if pid:
                            logger.info(f"✅ 账号 {n} 已登录，已在后台无头模式继续任务")
                        else:
                            logger.info(f"✅ 账号 {n} 已登录，自动回到无头模式继续任务")
                    else:
                        logger.warning(f"  ⚠️ 账号 {n} 登录未完成（{lr.get('reason')}），继续无头执行")
                        lr["reason"] = "等待手动登录超时/未完成，继续无头执行"
                    if not pid:
                        # 尚未有无头实例（未登录，或登录后未切换）→ 启动无头
                        try:
                            proc = launch_chrome(d, p, headless=True)
                            pid = proc.pid
                        except Exception as e:
                            _launch_fail(n, em, e)
                            continue
                        for _ in range(15):
                            if get_running_pid(d):
                                break
                            time.sleep(2)
                        # 更新 browsers 与 _ACCOUNT_BROWSERS 中该账号的 pid/result
                        for bi in range(len(browsers)):
                            if browsers[bi][0] == n:
                                browsers[bi] = (n, d, pid, p, lr)
                                break
                        with _ACCOUNT_LOCK:
                            _ACCOUNT_BROWSERS[n] = {"pid": pid, "port": p}
                    # 通知该账号登录结果
                    if lr.get("ok"):
                        lr_reason = lr.get("reason", "")
                        send("【登录成功】", f"账号 {n} ({em}) 已登录\n{lr_reason}\n已回到无头模式继续任务")
                    else:
                        send("【账号未登录】", f"账号 {n} ({em})\n未能在桌面完成手动登录，已继续无头执行任务")
            else:
                for n, d, _, em in need_login:
                    send("【账号未登录】",
                         f"账号 {n} ({em})\n{result.get('reason', '登录检查失败')}\n（桌面启动失败，无法手动登录）")
        else:
            # 未登录但不允许/不启用桌面 → 通知（已在循环内发送，这里兜底）
            pass

    # 保存状态，便于查错/复用
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump({
                "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                "browsers": [
                    {"name": n, "user_dir": d, "pid": p, "port": pt,
                     "logged_in": r.get("ok"), "login_reason": r.get("reason")}
                    for n, d, p, pt, r in browsers
                ],
            }, f, ensure_ascii=False, indent=2)
    except Exception as e:
        logger.warning(f"保存状态文件失败: {e}")

    # 通知：启动结果 + 登录状态汇总
    names = ", ".join(n for n, _, _, _, _ in browsers)
    logged = [f"{n}（{r['reason']}）" for n, _, _, _, r in browsers if r.get("ok")]
    not_logged = [f"{n}（{r['reason']}）" for n, _, _, _, r in browsers if not r.get("ok")]
    summary = f"Chromium 已启动 {len(browsers)} 个账号: {names}\n"
    if logged:
        summary += f"✅ 已登录: {'、'.join(logged)}\n"
    if not_logged:
        summary += f"ℹ️ 浏览器会话未登录（脚本依赖脚本猫 Cookie 运行，不影响执行）: {'、'.join(not_logged)}\n"
    summary += "「脚本猫-微软积分商城签到脚本」正在按 UserConfig 配置自动执行签到/搜索/点击任务..."
    send("【浏览器启动】", summary)

    # 🚨 启动「脚本完全没跑」守护：浏览器起来了但某账号零脚本日志时单独告警
    if ALERT_NO_RUN and SC_LOG_CAPTURE:
        threading.Thread(target=_no_run_watch, name="no-run-watch", daemon=True).start()

    # 🧩 开跑前一次性版本校准（脚本 + 扩展插件）：等脚本猫首轮心跳到了再动手，
    #    启动阶段不 reload，避免刚起来就把后台上下文打断；只做一次。
    if (SC_AUTO_UPDATE or SC_EXT_UPDATE) and browsers:
        max_wait = SC_CALIB_WAIT_SEC if SC_LOG_CAPTURE else min(30, max(5, SC_CALIB_WAIT_SEC))
        if not SC_LOG_CAPTURE:
            logger.info(f"ℹ️  未开启脚本猫日志采集（等不到首轮心跳）→ {max_wait} 秒后直接校准版本")
        threading.Thread(target=_pre_task_calibrate, args=(browsers, plan, max_wait),
                         name="pre-task-calibrate", daemon=True).start()

    try:
        # 保持运行，等待「脚本猫-微软积分商城签到脚本」完成（心跳每 1 小时汇报一次；全部账号完成后提前退出）
        HEARTBEAT = 3600
        if run_seconds <= 0:
            logger.info("⏳ 常驻模式，等待「脚本猫-微软积分商城签到脚本」执行（面板停止任务时自动退出）...")
            while not _ALL_DONE.wait(HEARTBEAT):
                logger.info("  💤 浏览器运行中，「脚本猫-微软积分商城签到脚本」持续执行...")
        else:
            logger.info(f"⏳ 保持浏览器运行 {run_seconds} 秒，等待「脚本猫-微软积分商城签到脚本」完成任务...")
            elapsed = 0
            while elapsed < run_seconds:
                step = min(HEARTBEAT, run_seconds - elapsed)
                if _ALL_DONE.wait(step):
                    logger.info("  🎉 全部账号任务已完成，提前结束")
                    break
                elapsed += step
                logger.info(f"  ⏱️  已运行 {elapsed}/{run_seconds} 秒")

        # 到收工时间但任务还没跑完：默认准点关（RUN_GRACE_SECONDS=0），
        # 需要「差几分钟也让它跑完」时把 RUN_GRACE_SECONDS 设成秒数。
        if run_seconds > 0 and browsers and not _ALL_DONE.is_set():
            if RUN_GRACE_SECONDS > 0:
                logger.info(f"⏰ 到收工时间，仍有账号未报「全部完成」→ 最多再宽限 "
                            f"{_fmt_dur(RUN_GRACE_SECONDS)} 收尾...")
                if _ALL_DONE.wait(RUN_GRACE_SECONDS):
                    logger.info("  🎉 宽限期内全部账号已完成")
                else:
                    logger.warning("  ⏰ 宽限期结束仍未报全部完成，按计划收工关闭浏览器")
            else:
                logger.warning("⏰ 已到收工时间，仍有账号未报「全部完成」→ 准点关闭浏览器"
                               "（RUN_GRACE_SECONDS=0；设成秒数可宽限收尾）")

    except KeyboardInterrupt:
        logger.warning("⚠️ 收到中断信号，准备关闭浏览器...")
    except Exception as e:
        logger.error(f"❌ 任务出错: {e}", exc_info=True)
    finally:
        if CLOSE_AFTER or _TERMINATED:
            logger.info("🚪 任务结束，正在关闭全部浏览器...")
            for name, user_dir, pid, port, result in browsers:
                close_browser(user_dir, port)
        # 任务结束，确保桌面（labwc/wayvnc/websockify）被拆除，回到无头默认态
        try:
            stop_desktop()
        except Exception:
            pass
        if os.path.isfile(STATE_FILE):
            try:
                os.remove(STATE_FILE)
            except Exception:
                pass
        logger.info("🎉 任务结束")
        send("【浏览器任务】", f"任务结束，{len(browsers)} 个账号浏览器已处理")


# ==============================
# 🛠️ 命令行维护：手动更新 / 重装 / 查看签到脚本
#    面板正常运行 zy.py 时不带参数，下面这些分支完全不会触发。
# ==============================
def _cli_script_status() -> int:
    """打印各账号当前脚本版本（浏览器没在跑就标明）。"""
    sd = _load_sc_deploy()
    if not sd:
        return 1
    rc = 0
    for i, acc in enumerate(load_accounts()):
        name = acc["name"]
        user_dir = os.path.join(CHROME_USER_DATA_BASE, f"user-{name}")
        port = CDP_BASE_PORT + i if CDP_BASE_PORT else 0
        if not port or not get_running_pid(user_dir):
            print(f"  {name:<8} 浏览器未运行（CDP {port or '-'}）")
            continue
        r = sd.get_status(port, name_hint=SC_SCRIPT_NAME,
                          ext_id=sd.resolve_ext_id(port, ext_dir=_scriptcat_ext_dir(user_dir),
                                                   user_dir=user_dir))
        if r["ok"]:
            print(f"  {name:<8} CDP {port}  {r['name']} v{r['version']}  status={r['status']}")
        else:
            print(f"  {name:<8} CDP {port}  ❌ {r['detail']}")
            rc = 1
    return rc


def _cli_update_scripts(install: bool = False) -> int:
    """命令行手动更新（install=False）或重装（install=True）签到脚本。

    - 浏览器已在运行：直接对现有实例操作，不动它的生命周期；
    - 浏览器没在运行：临时以无头 + CDP 拉起，处理完立即关掉，不留窗口。
    """
    sd = _load_sc_deploy()
    if not sd:
        logger.error("❌ 找不到同目录 sc_deploy.py，无法执行脚本维护")
        return 1
    accounts = load_accounts()
    action = "安装/修复" if install else "更新"
    logger.info(f"🔧 手动{action}「{SC_SCRIPT_NAME}」脚本（商店 #{SC_SCRIPT_ID}），共 {len(accounts)} 个账号")
    rc = 0
    for i, acc in enumerate(accounts):
        name = acc["name"]
        user_dir = os.path.join(CHROME_USER_DATA_BASE, f"user-{name}")
        Path(user_dir).mkdir(parents=True, exist_ok=True)
        port = CDP_BASE_PORT + i if CDP_BASE_PORT else 0
        if not port:
            logger.warning(f"⚠️ CDP_BASE_PORT=0（CDP 关闭），无法维护账号 {name}")
            rc = 1
            continue

        started = False
        if not get_running_pid(user_dir):
            logger.info(f"🌐 账号 {name} 浏览器未运行，临时拉起（CDP {port}），完成后自动关闭")
            try:
                launch_chrome(user_dir, port, headless=True)
            except Exception as e:
                logger.error(f"❌ 账号 {name} 启动浏览器失败: {e}")
                rc = 1
                continue
            wait_browser_ready(user_dir, port, timeout=40)
            started = True

        try:
            ext_dir = _scriptcat_ext_dir(user_dir)
            log = lambda m: logger.info("   " + str(m).strip())
            if install:
                r = sd.ensure_browser(port, ext_dir=ext_dir, user_dir=user_dir,
                                      script_id=SC_SCRIPT_ID, name_hint=SC_SCRIPT_NAME,
                                      grant=True, run=False, log=log)
                if r.get("ok"):
                    logger.info(f"✅ 账号 {name}：扩展 {r.get('ext_id')}，脚本 v{r.get('version')}")
                else:
                    logger.error(f"❌ 账号 {name}：{r.get('detail') or '安装未完成'}")
                    rc = 1
            else:
                r = sd.update_script(port, script_id=SC_SCRIPT_ID,
                                     name_hint=SC_SCRIPT_NAME, log=log)
                if r.get("ok"):
                    logger.info(f"✅ 账号 {name}：v{r['before']} → v{r['after']}"
                                f"（商店 v{r['store']}）{'已更新' if r['changed'] else '已是最新'}")
                else:
                    logger.error(f"❌ 账号 {name}：{r.get('detail')}"
                                 f"（v{r.get('before')} / 商店 v{r.get('store')}）")
                    rc = 1
        finally:
            if started:
                logger.info(f"🧹 关闭为维护临时拉起的 {name} 浏览器")
                close_browser(user_dir, port)
    logger.info(f"🔧 手动{action}结束{'（全部成功）' if rc == 0 else '（有失败项，见上）'}")
    return rc


def _cli_update_ext() -> int:
    """命令行手动更新脚本猫扩展插件（磁盘解包目录有新版本 / 商店有新版本时）。

    和 --update-script 一样：浏览器在跑就直接操作，没跑就临时拉起、完事关掉。
    """
    sd = _load_sc_deploy()
    if not sd:
        logger.error("❌ 找不到同目录 sc_deploy.py，无法执行扩展维护")
        return 1
    accounts = load_accounts()
    logger.info(f"🔧 手动更新「脚本猫」扩展插件，共 {len(accounts)} 个账号")
    rc = 0
    for i, acc in enumerate(accounts):
        name = acc["name"]
        user_dir = os.path.join(CHROME_USER_DATA_BASE, f"user-{name}")
        Path(user_dir).mkdir(parents=True, exist_ok=True)
        port = CDP_BASE_PORT + i if CDP_BASE_PORT else 0
        if not port:
            logger.warning(f"⚠️ CDP_BASE_PORT=0（CDP 关闭），无法维护账号 {name}")
            rc = 1
            continue
        started = False
        if not get_running_pid(user_dir):
            logger.info(f"🌐 账号 {name} 浏览器未运行，临时拉起（CDP {port}），完成后自动关闭")
            try:
                launch_chrome(user_dir, port, headless=True)
            except Exception as e:
                logger.error(f"❌ 账号 {name} 启动浏览器失败: {e}")
                rc = 1
                continue
            wait_browser_ready(user_dir, port, timeout=40)
            started = True
        try:
            ext_dir = _scriptcat_ext_dir(user_dir)
            disk = sd.disk_ext_version(ext_dir)
            eid = sd.resolve_ext_id(port, ext_dir=ext_dir, user_dir=user_dir) or None
            if not eid:
                logger.error(f"❌ 账号 {name}：认不到脚本猫扩展")
                rc = 1
                continue
            r = sd.ensure_ext_current(port, eid, ext_dir=ext_dir, allow_store=True,
                                      log=lambda m: logger.info("   " + str(m).strip()))
            if r.get("changed"):
                logger.info(f"✅ 账号 {name}：扩展 v{r.get('before')} → v{r.get('after')}"
                            f"（{'磁盘 v%s' % disk if r.get('source') == 'disk' else '商店'}）")
            elif r.get("ok"):
                logger.info(f"✅ 账号 {name}：扩展已是最新 v{r.get('after') or r.get('before')}"
                            f"（磁盘 v{disk or '未提供'}）")
            else:
                logger.error(f"❌ 账号 {name}：扩展版本未确认（v{r.get('before')}）")
                rc = 1
        except Exception as e:
            logger.error(f"❌ 账号 {name}：扩展更新异常 {e}")
            rc = 1
        finally:
            if started:
                logger.info(f"🧹 关闭为维护临时拉起的 {name} 浏览器")
                close_browser(user_dir, port)
    logger.info(f"🔧 手动更新扩展结束{'（全部成功）' if rc == 0 else '（有失败项，见上）'}")
    return rc


if __name__ == "__main__":
    # 命令行维护参数（面板正常运行时不带参数，行为不变）：
    #   python3 zy.py --update-script    手动把签到脚本更新到商店最新版
    #   python3 zy.py --update-ext       手动更新脚本猫扩展插件
    #   python3 zy.py --install-script   给所有账号重新安装/修复扩展 + 脚本
    #   python3 zy.py --script-status    只看各账号脚本版本
    _argv = sys.argv[1:]
    if any(a in ("-h", "--help") for a in _argv):
        print("用法: python3 zy.py [--update-script | --update-ext | --install-script | --script-status]\n"
              "  不带参数            正常执行面板任务（启动浏览器→登录检查→运行脚本→收工）\n"
              "  --update-script     手动把签到脚本更新到商店最新版（浏览器没在跑会临时拉起）\n"
              "  --update-ext        手动把脚本猫扩展插件更新到最新（磁盘新版/商店）\n"
              "  --install-script    重新安装/修复脚本猫扩展 + 脚本 + Cookie 授权\n"
              "  --script-status     查看各账号已装脚本版本")
        sys.exit(0)
    if any(a in ("--update-script", "--update-scripts") for a in _argv):
        sys.exit(_cli_update_scripts(install=False))
    if any(a in ("--update-ext", "--update-extension") for a in _argv):
        sys.exit(_cli_update_ext())
    if "--install-script" in _argv:
        sys.exit(_cli_update_scripts(install=True))
    if "--script-status" in _argv:
        sys.exit(_cli_script_status())

    # 面板停止任务时发 SIGTERM：转成 KeyboardInterrupt 触发 finally 清理（关浏览器+拆桌面），
    # 停止后立即恢复脚本启动前的状态；SIGKILL/崩溃则由容器看门狗（gui-watchdog.sh）兜底。
    signal.signal(signal.SIGTERM, lambda sig, frm: (_ for _ in ()).throw(KeyboardInterrupt))
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as e:
        logger.error(f"❌ 未捕获异常: {e}", exc_info=True)
    finally:
        # 兜底：无论任务正常/异常/SIGTERM 退出，都清理所有残留 profile 浏览器，
        # 避免面板停止任务后 chromium 进程残留
        logger.info("🧹 兜底清理残留浏览器进程...")
        for d in glob.glob(os.path.join(CHROME_USER_DATA_BASE, "user-*")):
            try:
                if get_running_pid(d):
                    close_browser(d, 0)
            except Exception:
                pass
        # 确保桌面（labwc/wayvnc/websockify）也被拆除，避免显示服务残留
        try:
            stop_desktop()
        except Exception:
            pass
        if os.path.isfile(STATE_FILE):
            try:
                os.remove(STATE_FILE)
            except Exception:
                pass
        logger.info("🎉 进程已清理完毕")