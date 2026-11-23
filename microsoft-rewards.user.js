// ==UserScript==
// @name         微软积分（优化版）
// @namespace    https://rewards.bing.com/
// @version      0.86
// @description  每天在后台自动完成 Microsoft Rewards 任务获取积分奖励，✅签入(PC+App静默)、✅阅读、✅活动、✅搜索、✅Quiz、✅拼图、✅热搜API、✅二次扫描、✅积分通知、✅自动领取待领积分、✅连签任务检测、✅每日活动自动上报、✅桌面应用每周专属任务、✅月度计划、✅Edge 浏览连签、✅国际版每日活动、✅出口检测（非大陆 IP 直接停手）；已适配 zy 版逻辑（每日随机排程、中文热搜、llq.py 上报、多账号 CDP 端口）
// @icon         https://bing.com/th?id=OMR.icon-96.png&pid=Rewards
// @license      MIT
// @homepage     https://scriptcat.org/script-show-page/8787
// @homepageURL  https://scriptcat.org/script-show-page/8787
// @website      https://scriptcat.org/script-show-page/8787
// @supportURL   https://scriptcat.org/script-show-page/8787/issue/create
// @source       https://github.com/hidmould/MicrosoftPoints
// @crontab      * 9-23 * * *
// @connect      bing.com
// @connect      login.live.com
// @connect      rewards.bing.com
// @connect      prod.rewardsplatform.microsoft.com
// @connect      uapis.cn
// @connect      hot.baiwumm.com
// @connect      hotapi.nntool.cc
// @connect      cnxiaobai.com
// @connect      disp-qryapi.3g.qq.com
// @connect      www.cloudflare.com
// @connect      ipinfo.io
// @connect      api.ip.sb
// @connect      qyapi.weixin.qq.com
// @connect      oapi.dingtalk.com
// @connect      open.feishu.cn
// @connect      push.i-i.me
// @connect      api.day.app
// @connect      127.0.0.1
// @connect      localhost
// @match        https://login.live.com/oauth20_desktop.srf*
// @match        https://rewards.bing.com/*
// @match        https://www.bing.com/*
// @match        https://cn.bing.com/*
// @run-at       document-start
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_cookie
// @grant        GM_closeTab
// @grant        GM_info
// @grant        GM_log
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_registerMenuCommand
// @storageName  BingRewardsAuto_Shared
// @tips         此脚本为开源免费使用，请勿购买
// ==/UserScript==

/* global GM_cookie, GM_getValue, GM_setValue, GM_xmlhttpRequest, GM_log, GM_info, GM_notification, GM_openInTab, GM_addValueChangeListener, GM_removeValueChangeListener */

/* ==UserConfig==
Config:
    span:
        title: 搜索间隔基准(每次在 基准×0.6 ~ 基准×2.2 之间随机，另有 10% 概率来一次 3~8 倍长停顿)
        type: number
        default: 120
        min: 60
        unit: 秒
    otherSpan:
        title: 其他任务间隔基准(阅读/活动卡片/每日活动/国际版活动/二次扫描，每次在 基准 ±15 秒之间随机)
        type: number
        default: 180
        min: 10
        unit: 秒
    keep:
        title: 持续检测（全部完成后是否继续）
        type: checkbox
        default: true
    lock:
        title: 锁定国区（非大陆IP自动停止）
        type: checkbox
        default: true
    spread:
        title: 搜索分散到全天(本轮次数按剩余轮数上下随机，可能整轮跳过；关掉=每轮满功率搜 20 分钟)
        type: checkbox
        default: false
    nodeGapMin:
        title: 节点间隔最小值(秒)。一轮里的节点=一次 20 分钟窗口，只做一种任务（全搜索/全阅读/其他活动）；节点之间停这么久
        type: number
        default: 60
        min: 0
    nodeGapMax:
        title: 节点间隔最大值(秒)。与最小值之间随机取（默认 1~3 分钟）
        type: number
        default: 180
        min: 0
    winTime:
        title: 运行时段(可留空，跟随 zy.py 计划；仅在没有计划时兜底；00:00-00:00=全天不限)
        type: text
        default: auto
        description: 推荐留空或填 auto。zy.py 在跑时，时段一律取计划里的「开机~收工」，这里填什么都不影响任务。只有读不到计划时（脚本脱离 zy.py 单独跑）它才生效，此时留空按 09:00-23:00 兜底，也可填具体时段，填 00:00-00:00 表示全天不限
    wakeMode:
        title: 唤醒分布(random=每天随机选上午/下午/全天，区间内撒5-6个随机时刻；morning=固定上午9-13；afternoon=固定下午13-18；full=固定全天9-18)
        type: select
        default: random
        values: [random, morning, afternoon, full]
    execPlan:
        title: 跟随 zy.py 计划（开机时刻由 zy.py 随机决定，执行点改成在「开机时刻~收工时刻」之间撒；读不到计划文件时才用上面的唤醒分布）
        type: checkbox
        default: true
    planUrl:
        title: zy.py 计划文件地址（默认 zy.py 自带接口 47831，与 GUI 的 8080 隔离；留空则按内置端口列表逐个尝试）
        type: text
        default: http://127.0.0.1:47831/zy-run-plan.json
    api:
        title: 搜索词来源（auto=uapis热搜→热榜接口→随机词三级自动降级，offline=纯随机词）
        type: select
        default: auto
        values: [auto, offline]
    hotUapisCount:
        title: uapis 每轮随机抽多少个平台聚合（默认16；调大词更多但更易触发限流，范围4~44）
        type: text
        default: 16
    hotMinCount:
        title: 每轮热搜词池最少条数（默认100；不足时自动用内置随机词补足，范围20~1000）
        type: text
        default: 100
    code:
        title: 授权码链接
        type: textarea
        description: 粘贴 login.live.com 跳转后的完整URL
    autoAuth:
        title: 自动检测授权码(手动运行一次，token状态无则手动授权)
        type: checkbox
        default: true
Tasks:
    sign:
        title: 每日签入
        type: checkbox
        default: true
    read:
        title: 新闻阅读
        type: checkbox
        default: true
    promos:
        title: 活动卡片（含打卡）
        type: checkbox
        default: true
    quiz:
        title: Quiz 自动答题
        type: checkbox
        default: true
    search:
        title: PC搜索
        type: checkbox
        default: true
    edge:
        title: Edge 浏览连签
        type: checkbox
        default: true
    desktopWeekly:
        title: 桌面应用每周专属任务
        type: checkbox
        default: true
    monthly:
        title: 月度计划
        type: checkbox
        default: true
    claimPoints:
        title: 自动领取待领积分
        type: checkbox
        default: true
    intlDaily:
        title: 国际版每日活动
        type: checkbox
        default: true
Notice:
    bro:
        title: 浏览器通知（当前脚本）
        type: checkbox
        default: false
    wework:
        title: 企业微信消息推送（群机器人）
        type: text
        password: true
        description: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    dingding:
        title: 钉钉群机器人（不加签，关键词：#）
        type: text
        password: true
        description: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    feishu:
        title: 飞书群机器人（不加签，关键词：#）
        type: text
        password: true
        description: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
    pushme:
        title: PushMe（push.i-i.me）
        type: text
        password: true
        description: xxxxxxxxxxxxxxxxxxxx
    bark:
        title: Bark（bark.day.app）
        type: text
        password: true
        description: xxxxxxxxxxxxxxxxxxxx
==/UserConfig== */

const __scBgKeepAlive = (function() {
    'use strict';

    const IS_OAUTH_CALLBACK = location.hostname === "login.live.com"
        && location.pathname === "/oauth20_desktop.srf";

    const OAUTH_WITNESS = (() => {
        const snapshot = { at: Date.now(), href: "", referrer: "", name: "", urls: [] };
        const seen = new Set();
        const maybeRecord = url => {
            if (!url) return;
            const s = String(url);
            if (!/code=/i.test(s) || seen.has(s)) return;
            seen.add(s);
            snapshot.urls.push(s);
            if (snapshot.urls.length > 12) snapshot.urls.shift();
        };
        try {
            snapshot.href = String(location.href || "");
            maybeRecord(snapshot.href);
        } catch (_) {}
        try {
            snapshot.referrer = String((typeof document !== "undefined" && document && document.referrer) || "");
            maybeRecord(snapshot.referrer);
        } catch (_) {}
        try {
            snapshot.name = String((typeof window !== "undefined" && window && window.name) || "");
            maybeRecord(snapshot.name);
        } catch (_) {}
        try {
            const host = (typeof unsafeWindow !== "undefined" && unsafeWindow)
                ? unsafeWindow
                : (typeof window !== "undefined" ? window : null);
            if (host && host.location && host.location.hostname === "login.live.com" && host.history) {
                ["pushState", "replaceState"].forEach(fnName => {
                    const orig = host.history[fnName];
                    if (typeof orig !== "function" || orig.__mpWitness) return;
                    const wrapped = function (state, title, url) {
                        try {
                            maybeRecord(url ? new URL(String(url), host.location.href).href : host.location.href);
                        } catch (_) {
                            maybeRecord(url);
                        }
                        return orig.apply(this, arguments);
                    };
                    wrapped.__mpWitness = true;
                    try { host.history[fnName] = wrapped; } catch (_) {}
                });
            }
        } catch (_) {}
        return snapshot;
    })();

    /* 热搜词缓存持久化：@crontab 每次唤醒都是新后台上下文，内存缓存必然清零。
       以前 apiConfig.cache / uapis.titles 全是内存，30 分钟 TTL 和失败退避等于没有，
       每搜一次都重打 44+3 个接口。这里启动时从 GM 恢复，更新时写回。 */
    const _hotPersist = (() => {
        const c = GM_getValue("Config.hotWordsCache", null);
        const u = GM_getValue("Config.uapisCache", null);
        return {
            cache: (c && typeof c === "object") ? c : {},
            uapis: (u && typeof u === "object") ? u : {},
        };
    })();

    const RewardsAuto = {
        get ua() { return UA.all(); },

        get desktopAppHeaders() {
            return {
                "user-agent": UA.all().rewardsApp,
                "x-rewards-source": "msrewards-desktop"
            };
        },
        appConfig: {
            rewardsAppId: "SAAndroid/32.6.2110003560",
            channel: "SAAndroid",
            dapiMeUrl: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613",
            offerIds: {
                dailyCheckIn: "Gamification_Sapphire_DailyCheckIn",
                readArticle: "ENUS_readarticle3_30points",
                dailySetPrefix: "Gamification_DailySet_",
                streakCounter: "Gamification_Streak_Counter_Promotion",
            }
        },

        region(fallback = "us") {
            if (GM_getValue("Config.lock", true)) return "cn";
            const r = String(this.state.region || "").toLowerCase().trim();
            return r || fallback;
        },

        searchPool: [
            "what is the weather forecast tomorrow",
            "how do I make sourdough bread at home",
            "where can I find cheap flights to tokyo",
            "why is the sky blue scientific explanation",
            "how to learn rust programming in 2026",
            "what time does the world cup final start",
            "how to fix a leaky kitchen faucet step by step",
            "what are the best vr games of 2026",
            "how to start a vegetable garden in spring",
            "where to watch new movies this week",
            "how to take care of a bonsai tree",
            "what is the difference between python async and threading",
            "how to meditate properly for beginners",
            "what is the origin of halloween traditions",
            "how do solar panels actually work",
            "what is the best mechanical keyboard for typing",
            "how to tie a windsor knot tie",
            "what causes northern lights aurora borealis",
            "how to brew the perfect espresso at home",
            "what are the symptoms of vitamin d deficiency",
            "how to sleep better naturally tonight",
            "why do cats purr when they are happy",
            "best coffee shops in san francisco downtown",
            "italian restaurants near times square",
            "tokyo cherry blossom season 2026 forecast",
            "rtx 5070 ti benchmark vs rtx 4080 super",
            "iphone 17 release date and features",
            "tesla stock price today nasdaq",
            "best noise cancelling headphones under 300",
            "fastest electric cars 0 to 60 mph",
            "vintage camera brands collectors guide",
            "budget gaming laptop with rtx 4070 2026",
            "easy chocolate chip cookies recipe from scratch",
            "30 minute home workout routine no equipment",
            "stretching exercises for lower back pain relief",
            "easy origami crane folding instructions",
            "git rebase vs merge which one to use",
            "markdown cheat sheet with examples",
            "japanese hiragana chart pronunciation",
            "ancient rome history quick overview",
            "pomodoro technique for focus and productivity",
            "healthy breakfast ideas under 10 minutes",
            "天气预报", "今日新闻热点", "美食食谱家常菜", "旅游攻略", "健康养生知识",
            "科技资讯", "电影推荐", "股票行情", "体育赛事", "历史上的今天"
        ],
        apiConfig: {
            /* 老配置值是 "uapis"，语义等于现在的 auto（三级链），统一归一化，
               否则下拉框会显示成空值、用户以为配置丢了。 */
            mode: GM_getValue("Config.api", "auto") === "offline" ? "offline" : "auto",
            /* 中文热搜（与 zy.js / Python generate_hotboard 同接口同逻辑）：
               任务开始时随机抽一批平台并行拉取 → 只保留中文/字母/数字 → 去重 → 打乱，
               本轮后续搜索只从这批词里随机抽，不再请求接口；下轮任务开始再刷新。 */
            uapis: {
                url: "https://uapis.cn/api/v1/misc/hotboard",
                platforms: [
                    "bilibili", "acfun", "weibo", "zhihu", "zhihu-daily", "douyin", "kuaishou",
                    "douban-movie", "douban-group", "tieba", "hupu", "ngabbs",
                    "v2ex", "52pojie", "coolapk", "baidu", "thepaper", "toutiao",
                    "qq-news", "sina", "sina-news", "netease-news", "huxiu", "ifanr", "sspai",
                    "ithome", "ithome-xijiayi", "juejin", "jianshu", "guokr", "36kr", "51cto",
                    "csdn", "nodeseek", "hellogithub", "lol", "genshin", "honkai", "starrail",
                    "weread", "weatheralarm", "earthquake", "history",
                ],
                titles: [],   // 本轮任务开始时由 prefetchHotWords 重新拉，不跨轮复用
                at: Number(_hotPersist.uapis.at) || 0,
                index: 0,
            },
            /* 词源缓存（与 zy.js 同构）：source 标明这批词来自哪个源，
               只有「确认可用」才缓存，失败不写，下一轮继续逐级降级重试。 */
            cache: {
                list: Array.isArray(_hotPersist.cache.list) ? _hotPersist.cache.list : [],
                source: String(_hotPersist.cache.source || ""),      // uapis / api
                apiName: String(_hotPersist.cache.apiName || ""),    // 落到 api 时具体是哪个站点
                at: Number(_hotPersist.cache.at) || 0,
                failAt: Number(_hotPersist.cache.failAt) || 0,       // 三级全挂时间点，3 分钟静默退避
                date: Number(_hotPersist.cache.date) || 0,           // 词池是哪天拉的：当天复用、跨天重拉
            },
            apiIndex: Number(GM_getValue("Config.apiIndex", 0)) || 0,   // 上次可用的热搜接口，下次优先
            /* 降级链第二级：逐个体尝试，全挂才用内置随机词。
               站点清单 nntool / baiwumm / cnxiaobai：上游 375d8d3bd5 移除了 nntool，
               但本机实测它可用（8 平台约 400 条，且 uapis 全线限流），故保留作为词池冗余。 */
            arr: [
                ["hot.nntool.cc", {
                    url: "https://hotapi.nntool.cc/",
                    /* 这个站不带末尾斜杠会 301（而 xhr 拦 301 只回 Location 字符串，
                       会被当成「无法解析」），所以单独补 suffix */
                    suffix: "/",
                    hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"],
                }],
                ["hot.baiwumm.com", {
                    url: "https://hot.baiwumm.com/api/",
                    hot: ["weibo", "juejin", "douyin", "zhihu"],
                }],
                ["hot.cnxiaobai.com", {
                    url: "https://cnxiaobai.com/DailyHotApi/",
                    hot: ["weibo", "douyin", "baidu", "toutiao", "thepaper", "qq-news", "netease-news", "zhihu"],
                }],
            ],
        },
        skipPatterns: [
            "referral", "refer and earn", "sweepstake", "entries",
            "install the", "set bing as your default", "bing wallpaper",
            "punch card", "ancient coin", "sea of thieves", "rewards extension",
            "redemption goal", "order history", "claim your gift", "shop to earn",
            "set goal",
        ],
        skipHrefs: [
            "sweepstakes/", "referandearn", "aka.ms/win", "workinprogress",
            "punchcard", "microsoft-store", "goal/all", "orderhistory",
            "/redeem", "/redeemgoal", "xbox.com/rewards"
        ],
        state: {
            token: false,
            region: "CN",
            host: "www.bing.com",
            dateNowNum: 0,
            dateNowStr: "",
            pcProgress: 0,
            pcMax: 90,
            readProgress: 0,
            readMax: 30,
            sendMSG: "",
            lastSearchProgress: -1,
            restrictedTimes: 0,
            ip: "",
            ipInfo: "",
            startTime: 0,
            lockedCount: 0,
            lockedPoints: 0,
            lockedTitles: [],
            desktopPendingTitles: [],
            /* 「已自动上报搜索、需手动点一次」的卡片名单。
               以前没在这里声明，靠 state.manualCards || [] 惰性兜住，
               初见时其实是 undefined；显式声明后，轮末 releaseRound 清空它
               也不会在下一轮读到 undefined。 */
            manualCards: [],
            weeklyQuestDone: 0,
            weeklyQuestPending: 0,
            weeklyQuestFailed: 0,
            monthlyFound: 0,
            monthlyDone: 0,
            monthlyTotal: 0,
            monthlyPending: 0,
            monthlyComplete: false,
            monthlyUnlocked: 0,
            intlFound: 0,
            intlDone: 0,
            intlPending: 0,
            /* 面板上有、但脚本处理不了的卡（缺 hash 等）。>0 时不能报「全部完成」 */
            intlDropped: 0,
            /* 三个「为什么没有这一行」的标记，互斥：
               intlAbsent = 账号面板里确实没有这组卡（地区/账号不支持）
               intlCached = 今天已封盘，本轮没再拉面板（数值来自缓存）
               都为 false 且 intlFound=0 = 本轮没跑到（出口拦截/被预算挤掉） */
            intlAbsent: false,
            intlCached: false,
            webNoAuth: false,
            webFailStreak: 0,
            /* 活动卡片「数据源不可用，无法判断是否完成」。和 webNoAuth 一样是
               「说不清」而不是「做完了」——汇总里要显示成未知，不能显示 ✅。 */
            promosUnknown: false,
        }
    };

    const CLAIM_ONCE_TIMEOUT = 150 * 1000;
    const NEXT_ACTION_SCAN_MAX = 8;
    const NEXT_ACTION_SCAN_BUDGET = 45 * 1000;
    const WEB_FAIL_LIMIT = 3;
    const ACTION_SCAN_MAX = 24;
    const ACTION_SCAN_BUDGET = 60 * 1000;

    const CardLock = {
        fields(item) {
            if (!item || typeof item !== "object") return {};
            const pick = (...keys) => {
                for (const k of keys) {
                    if (item[k] !== undefined && item[k] !== null) return item[k];
                }
                return undefined;
            };
            const rawUnlock = pick("unlockCriteria", "unlockcriteria");
            return {
                isLocked: pick("isLocked", "islocked"),
                isUnlocked: pick("isUnlocked", "isunlocked"),
                isDisabled: pick("isDisabled", "isdisabled"),
                isHidden: pick("isHidden", "ishidden", "hidden"),
                unlockCriteria: rawUnlock === "$undefined" ? undefined : rawUnlock,
                state: String(pick("state", "State") || ""),
                offerId: String(pick("offerId", "offerid", "name") || ""),
                title: String(pick("title", "name", "description") || "")
            };
        },

        hasExplicitState(item) {
            const f = this.fields(item);
            return f.isLocked !== undefined || f.isUnlocked !== undefined
                || f.isDisabled !== undefined || f.unlockCriteria !== undefined;
        },

        textLocked(text) {
            const s = String(text || "");
            return /offer is locked|available tomorrow|earn -1 points|明天再来|明天可用|已锁定|在必应应用|必应\s*app|仅限.*应用|需在应用/i.test(s);
        },

        probe(item) {
            const f = this.fields(item);
            const appExclusive = /Moreactivities_RewardsApp/i.test(f.offerId)
                || String(f.unlockCriteria || "").toLowerCase() === "rewardsapp";

            const levelGated = /locked_level2|newLevel2/i.test(f.offerId)
                || String(f.unlockCriteria || "").toLowerCase() === "newlevel2";
            const keep = (reason) => ({ locked: false, appExclusive, appOnly: appExclusive, levelGated, reason });
            const skip = (reason) => ({ locked: true, appExclusive, appOnly: false, levelGated, reason });
            const appTry = (reason) => ({ locked: false, appExclusive, appOnly: true, levelGated, reason });

            if (!this.hasExplicitState(item)) {
                const text = `${f.title} ${f.offerId} ${f.state}`;
                if (!this.textLocked(text)) {
                    return keep(levelGated ? "等级门槛卡(无锁态字段,按可尝试处理)" : "");
                }
                if (/在必应应用|必应\s*app|仅限.*应用|需在应用|bing\s*app|mobile\s*app/i.test(text)) {
                    return appTry("文案指向 App 通道");
                }
                return skip("仅有锁态文案");
            }
            if (f.isDisabled === true) return skip("isDisabled=true");
            if (f.isLocked === false) return keep(appExclusive ? "rewardsApp(已解锁)" : "");
            if (f.isUnlocked === true) return keep(appExclusive ? "rewardsApp(已解锁)" : "");
            if (appExclusive) return appTry(f.isLocked === true ? "isLocked=true(App 专属→App UA)" : "rewardsApp");
            if (f.isLocked === true) return skip("isLocked=true");
            if (f.isUnlocked === false) return skip("isUnlocked=false");
            if (f.unlockCriteria !== undefined && f.unlockCriteria !== "") {
                return skip(`unlockCriteria=${f.unlockCriteria}`);
            }
            if (f.state && this.textLocked(f.state)) return skip(`state=${f.state}`);
            return keep("");
        },

        claimable(item) {
            const lock = this.probe(item);
            if (lock.locked) return false;
            const f = this.fields(item);
            if (f.isHidden === true) return false;
            return true;
        }
    };

    const UA = {

        FALLBACK_CHROME: "156.0.0.0",
        FALLBACK_EDGE: "156.0.4314.50",

        REWARDS_APP_VER: "1.13.0",
        DESKTOP: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
        ANDROID: "Mozilla/5.0 (Linux; Android 16; Redmi K20 Pro Build/BP4A.251205.006; ) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/144.0.7559.132 Mobile Safari/537.36",
        _cache: null,
        _cacheAt: 0,

        navigatorUA() {
            try {
                return (typeof navigator !== "undefined" && navigator && navigator.userAgent)
                    ? String(navigator.userAgent) : "";
            } catch (_) {
                return "";
            }
        },

        remember(ua) {
            if (!/Edg\/\d/.test(ua)) return;
            try {
                if (GM_getValue("Config.uaEdge", "") !== ua) GM_setValue("Config.uaEdge", ua);
            } catch (_) { }
        },

        all() {
            const now = Date.now();
            if (this._cache && now - this._cacheAt < 60000) return this._cache;
            const real = this.navigatorUA();
            this.remember(real);
            const saved = String(GM_getValue("Config.uaEdge", "") || "");
            const edgeUA = [real, saved].find(s => /Edg\/\d/.test(s))
                || (() => {
                    const ver = [real, saved]
                        .map(s => (String(s).match(/Chrome\/([\d.]+)/) || [])[1])
                        .find(Boolean);
                    if (ver) return `${this.DESKTOP} Chrome/${ver} Safari/537.36 Edg/${ver}`;
                    return `${this.DESKTOP} Chrome/${this.FALLBACK_CHROME} Safari/537.36 Edg/${this.FALLBACK_EDGE}`;
                })();
            this._cache = {
                pc: /Edg\//.test(real) ? real : edgeUA,
                edge: edgeUA,
                mobile: `${this.ANDROID} EdgA/144.0.0.0`,
                app: `${this.ANDROID} BingSapphire/32.6.2110003560`,
                rewardsApp: (() => {
                    const ver = [real, saved]
                        .map(s => (String(s).match(/Chrome\/([\d.]+)/) || [])[1])
                        .find(Boolean) || this.FALLBACK_CHROME;
                    return `${this.DESKTOP} Chrome/${ver} Safari/537.36 Edg/${ver} MSRewards/Desktop/${this.REWARDS_APP_VER}`;
                })(),
            };
            this._cacheAt = now;
            return this._cache;
        }
    };

    const EDGE = {
        PROMO_NAME: "edge_browsing_streak_flight",
        PROMO_PREFIX: /^edge_browsing_streak/i,
        ACTIVATION_OFFER: "edge_flight_1_ww_treatment_eligible",
        TARGET_MINUTES: 30,
        /* 每次上报记 5 分钟。服务端进度接口不可用时用它按「已上报次数」估算，
           避免汇总一律显示 0/30（见 summary 注释）。 */
        MINUTES_PER_REPORT: 5,
        MAX_EXTRA_ROUNDS: 3,
    };

    /* 月度计划：父任务 ENWW_pcparent_*_punchcard，子项间隔解锁，全完成 +50。
       进度只认回读的「M/N 个任务」——交卷被受理不代表记账。 */
    const MONTHLY = {
        RECHECK_MS: 90 * 60 * 1000,
        DONE_RECHECK_MS: 22 * 60 * 60 * 1000,
        MAX_ATTEMPTS_PER_DAY: 2,
        PAGE_URL: "https://rewards.bing.com/earn/quest/",
    };

    const WEBHOOK_PLATFORMS = [
        { name: "企业微信", url: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=", config: "Notice.wework",
            body: (time, text) => ({ "msgtype": "text", "text": { "content": `> ${time}\n\n ## ${GM_info.script.name}\n ${text}` } }) },
        { name: "钉钉", url: "https://oapi.dingtalk.com/robot/send?access_token=", config: "Notice.dingding",
            body: (time, text) => ({ "msgtype": "markdown", "markdown": { "title": GM_info.script.name, "text": `> ${time}\n ### ${GM_info.script.name}\n ${text}` } }) },
        { name: "飞书", url: "https://open.feishu.cn/open-apis/bot/v2/hook/", config: "Notice.feishu",
            body: (time, text) => ({
                "msg_type": "interactive",
                "card": {
                    "schema": "2.0",
                    "header": { "title": { "tag": "plain_text", "content": GM_info.script.name }, "template": "orange" },
                    "body": { "elements": [{ "tag": "markdown", "text_align": "center", "content": `#### ${time}\n ${text}` }] }
                }
            }) },
        { name: "PushMe", url: "https://push.i-i.me/?push_key=", config: "Notice.pushme",
            body: (time, text) => ({ "type": "markdown", "title": `${GM_info.script.name}[#rewards!https://rewards.bing.com/rewards.png]`, "content": `\n ${text}` }) },
        { name: "Bark", url: "https://api.day.app/", config: "Notice.bark",
            body: (time, text) => ({ "group": "rewards", "icon": "https://rewards.bing.com/rewards.png", "title": GM_info.script.name, "markdown": `\n ${text}` }) },
    ];

    const Webhooks = WEBHOOK_PLATFORMS.map(p => ({
        name: p.name,
        url: p.url,
        key: GM_getValue(p.config, false),
        get msg() { return p.body(new Date().toLocaleString(), RewardsAuto.state.sendMSG); }
    }));

    /* 推送策略（整脚本唯一出口）：平时完全静默，只有「任务真做完」和
       「需要人介入的异常」才推；同类异常 6 小时一次、全局每小时最多 3 条。
       过程状态一律只写日志。 */
    const NOTICE = {
        DONE_TTL: 20 * 60 * 60 * 1000,
        ANOMALY_TTL: 6 * 60 * 60 * 1000,
        ANOMALY_PER_HOUR: 3,
    };

    /* 「没配 CDP」永远不该变成推送：用户明确要求这类环境提示静默。
       作为网关级兜底 —— 任何路径想把 CDP 相关文案推出去都会被压回日志。 */
    const CDP_NOTICE_RE = /CDP|调试端口|remote-debugging|remote-allow-origins|Rewards Edge/;

    const Utils = {
        /* 纯日志，永不推送。第三个参数仅为兼容旧调用点；
           要推送必须显式走 notifyDone() / notifyAnomaly()。 */
        log(icon, msg, push = false) {
            GM_log(`${icon} ${msg}`);
            if (push) GM_log("🔇 该提示属于过程状态，只写日志（不推送）");
        },

        /* 结构化报告（llq.py / 启动浏览器.py 采集后按账号发通知）。
           必须以 [QLREPORT-XXX] 开头，llq.py 靠这个前缀识别，不能走 log()，
           否则会多一条普通日志、也可能被误当成推送。 */
        qlReport(type, data) {
            try {
                GM_log(`[QLREPORT-${String(type).toUpperCase()}]` + JSON.stringify(data || {}));
            } catch (_) {}
        },

        /* 真正发出去（浏览器通知 + webhook）。只允许 notifyDone / notifyAnomaly 调用 */
        deliver(icon, msg) {
            if (GM_getValue("Notice.bro", true)) {
                try {
                    GM_notification({
                        title: GM_info.script.name + ` ${icon}`,
                        text: msg,
                        onclick: () => GM_openInTab("https://rewards.bing.com/dashboard", { active: true })
                    });
                } catch (_) {}
            }
            RewardsAuto.state.sendMSG = `${icon} ${msg}`;
            this.sendWebhook();
        },

        /* 记录一次推送并返回「剩余冷却分钟数」；0 = 现在可以推 */
        _claimNotice(kind, key, ttlMs) {
            const storeKey = `Notice.sent.${kind}.${key}`;
            const now = Date.now();
            let rec = null;
            try { rec = GM_getValue(storeKey, null); } catch (_) {}
            const lastAt = rec ? (Number(rec.at) || 0) : 0;
            if (rec && now - lastAt < ttlMs) return Math.max(1, Math.ceil((ttlMs - (now - lastAt)) / 60000));
            try { GM_setValue(storeKey, { at: now }); } catch (_) {}
            return 0;
        },

        /* 完成类：同一件事（同一 key）在 ttl 内只推一次 */
        notifyDone(icon, msg, key, ttlMs = NOTICE.DONE_TTL) {
            GM_log(`${icon} ${msg}`);
            const left = this._claimNotice("done", key, ttlMs);
            if (left > 0) {
                GM_log(`🔁 「${key}」的完成通知已在 ${left} 分钟内推过，本次静默（只写日志）`);
                return false;
            }
            this.deliver(icon, msg);
            return true;
        },

        /* 异常类：同类 6 小时内只推一次，全局每小时限量，超了只写日志 */
        notifyAnomaly(icon, msg, key, ttlMs = NOTICE.ANOMALY_TTL) {
            GM_log(`${icon} ${msg}`);
            /* 「没配 CDP」不算异常：用户明确要求这类环境提示绝不推送。
               网关级兜底 —— 就算某个异常文案里带了 CDP 字样，也压回日志。 */
            if (CDP_NOTICE_RE.test(String(msg || ""))) {
                GM_log("🔇 这条属于 CDP 环境提示，只写日志（不推送）");
                return false;
            }
            return this._anomaly(icon, msg, key, ttlMs);
        },

        _anomaly(icon, msg, key, ttlMs = NOTICE.ANOMALY_TTL) {
            const hourKey = `Notice.budget.${Math.floor(Date.now() / 3600000)}`;
            let used = 0;
            try { used = Number(GM_getValue(hourKey, 0)) || 0; } catch (_) {}
            if (used >= NOTICE.ANOMALY_PER_HOUR) {
                GM_log(`🔇 本小时异常推送已达上限（${NOTICE.ANOMALY_PER_HOUR} 条），本条只写日志`);
                return false;
            }
            const left = this._claimNotice("anomaly", key, ttlMs);
            if (left > 0) {
                GM_log(`🔁 同类异常已在 ${left} 分钟内推过，本次静默（只写日志）`);
                return false;
            }
            try { GM_setValue(hourKey, used + 1); } catch (_) {}
            this.deliver(icon, msg);
            return true;
        },

        /* 同类通知节流：同一 key + 文案在 ttl 内只推一次。 */

        /* 只写日志的节流版：同 key 在 ttl 内只记一行。
           用于「已知且不影响任务」的噪音（如接口 401、面板暂时不可用、
           请手动点一次、CDP 未连接）—— 这些每轮都会复现，连日志都不必刷屏。 */
        logSilenced(icon, msg, key, ttlMs = 6 * 60 * 60 * 1000) {
            const storeKey = `Log.silent.${key}`;
            const now = Date.now();
            let rec = null;
            try { rec = GM_getValue(storeKey, null); } catch (_) {}
            const lastAt = rec ? (Number(rec.at) || 0) : 0;
            if (rec && now - lastAt < ttlMs) return false;   /* 静默，连日志都不写 */
            try { GM_setValue(storeKey, { at: now }); } catch (_) {}
            GM_log(`${icon} ${msg}`);
            return true;
        },

        /* 所有「开关型」配置的唯一读法（上游 9b144484b2 移植）。
           checkbox 存成什么类型各家管理器不一样：真布尔、字符串 "true"/"false"、
           数字 1/0、甚至空串都见过。以前各处直接写 `!GM_getValue(key, true)`：
             · 存成字符串 "false" 时它是「真值」→ 开关关掉了照样跑；
             · 读取失败/存成空值时又被当成「已关闭」→ 日志写「已关闭」但实际还在跑。
           这里统一翻译成布尔：只有明确表示「关」的值才算关，其余按默认值兜底。 */
        flag(key, def = true) {
            let raw;
            try { raw = GM_getValue(key, def); } catch (_) { return def; }
            if (raw === undefined || raw === null) return def;
            if (typeof raw === "boolean") return raw;
            if (typeof raw === "number") return raw !== 0;
            const s = String(raw).trim().toLowerCase();
            if (!s) return def;
            if (["false", "0", "off", "no", "n", "false;", "关闭", "否"].indexOf(s) >= 0) return false;
            if (["true", "1", "on", "yes", "y", "开启", "是"].indexOf(s) >= 0) return true;
            return def;
        },

        /* 任务开关（Tasks.*）专用别名，语义上更直白，实际走同一个翻译。 */
        taskOn(key, def = true) {
            return this.flag(key, def);
        },

        /* 「这个键有没有值」—— 给 token / 授权码这类**文本型**配置用。
           它们不能用 flag()：一串 M.C5xx… 既不是 "true" 也不是 "false"，
           flag 会按默认值兜底成「没有」，于是整条依赖它的链路被静默掐断。 */
        has(key) {
            let raw;
            try { raw = GM_getValue(key, undefined); } catch (_) { return false; }
            if (raw === undefined || raw === null || raw === false) return false;
            return String(raw).trim().length > 0;
        },

        /* 已废弃：保留 API 只为兼容，永不推送。
           过去它是最好的「节流推送」工具，结果被大量过程状态当成推送入口，
           于是同一件事每轮复现一次就要打扰一次。现在只记日志。 */

        /* 状态恢复正常时重置节流记录，保证下次真出问题时还能提醒一次 */
        resetOnce(key) {
            try { GM_setValue(`Notice.once.${key}`, null); } catch (_) {}
            try { GM_setValue(`Notice.sent.done.${key}`, null); } catch (_) {}
            try { GM_setValue(`Notice.sent.anomaly.${key}`, null); } catch (_) {}
        },

        async sendWebhook() {
            await Promise.all(Webhooks.map(async (i) => {
                if (!i.key) return;
                const safeKey = String(i.key).trim();
                const targetUrl = safeKey.startsWith("http") ? safeKey : i.url + safeKey;
                try {
                    const result = await this.xhr({
                        method: "POST",
                        url: targetUrl,
                        headers: { "content-type": "application/json; charset=UTF-8" },
                        data: JSON.stringify(i.msg),
                    });
                    if (result) GM_log(`🔵 「${i.name}」消息推送完成`);
                } catch (e) {
                    GM_log(`🔴 「${i.name}」消息推送出错: ${e.message}`);
                }
            }));
        },

        hasDOM() {
            return typeof document !== "undefined" && !!document && !!document.documentElement;
        },

        /* 是不是「后台（定时）上下文」。
           ⚠ 不能只用 hasDOM()：ScriptCat 的后台跑在一个扩展页里
           （chrome-extension://<id>/…），那里**有** document，
           于是 hasDOM() 为 true、被误判成页面上下文 —— 任务轮永远不会发起，
           日志只留下一句「页面上下文已加载（扩展ID）」。 */
        isBackground() {
            try {
                const proto = String((typeof location !== "undefined" && location.protocol) || "");
                if (/^(chrome-extension|moz-extension|safari-web-extension|ms-browser-extension):$/.test(proto)) return true;
            } catch (_) {}
            return !this.hasDOM();
        },

        waitForBody(timeoutMs = 8000) {
            return new Promise(resolve => {
                const t0 = Date.now();
                const tick = () => {
                    if (document.body) return resolve(true);
                    if (Date.now() - t0 > timeoutMs) return resolve(false);
                    setTimeout(tick, 100);
                };
                tick();
            });
        },

        uiAlert(msg) {
            const text = String(msg);
            if (this.hasDOM() && typeof alert === "function") {
                try { alert(text); return; } catch (_) {}
            }
            GM_log(text);
            try { GM_notification({ title: GM_info.script.name, text: text.slice(0, 300), timeout: 10000 }); } catch (_) {}
        },

        uiConfirm(msg) {
            if (this.hasDOM() && typeof confirm === "function") {
                try { return confirm(msg); } catch (_) {}
            }
            this.uiAlert(`${msg}\n\n（当前是后台上下文，无法弹出确认框，已按「取消」处理）`);
            return false;
        },

        async uiPrompt(message, defaultValue = "") {
            if (this.hasDOM() && typeof prompt === "function") {
                try { return prompt(message, defaultValue); } catch (_) {}
            }
            if (this.hasDOM()) return this.domPrompt(message, defaultValue);
            GM_setValue("Config.pendingPaste", true);
            Utils.log("🟡", "当前为后台上下文（无输入框），已打开 rewards.bing.com 以便粘贴授权码");
            try {
                GM_notification({ title: "📋 请粘贴授权码", text: "已为你打开 rewards.bing.com，页面加载后会自动弹出输入框", timeout: 8000 });
            } catch (_) {}
            try { GM_openInTab("https://rewards.bing.com/", { active: true }); } catch (_) {}
            return null;
        },

        async domPrompt(message, defaultValue = "") {
            await this.waitForBody();
            return new Promise(resolve => {
                const wrap = document.createElement("div");
                wrap.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;";
                const box = document.createElement("div");
                box.style.cssText = "background:#fff;color:#222;padding:18px;border-radius:10px;width:min(680px,92vw);font:14px/1.6 system-ui,-apple-system,'Microsoft YaHei',sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.4);";
                const label = document.createElement("div");
                label.textContent = message;
                label.style.cssText = "margin-bottom:10px;white-space:pre-wrap;";
                const ta = document.createElement("textarea");
                ta.value = defaultValue;
                ta.spellcheck = false;
                ta.style.cssText = "width:100%;height:130px;box-sizing:border-box;padding:8px;border:1px solid #c8c8c8;border-radius:6px;font:12px/1.5 Consolas,monospace;resize:vertical;";
                const row = document.createElement("div");
                row.style.cssText = "display:flex;gap:10px;justify-content:flex-end;margin-top:12px;";
                const mkBtn = (text, primary) => {
                    const b = document.createElement("button");
                    b.textContent = text;
                    b.style.cssText = `padding:7px 18px;border-radius:6px;cursor:pointer;font:14px system-ui;border:1px solid ${primary ? "#0b6cff" : "#c8c8c8"};background:${primary ? "#0b6cff" : "#fff"};color:${primary ? "#fff" : "#222"};`;
                    return b;
                };
                const okBtn = mkBtn("确定", true);
                const cancelBtn = mkBtn("取消", false);
                const done = v => { try { wrap.remove(); } catch (_) {} resolve(v); };
                okBtn.onclick = () => done(ta.value);
                cancelBtn.onclick = () => done(null);
                ta.addEventListener("keydown", e => {
                    if (e.key === "Escape") done(null);
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) done(ta.value);
                });
                row.appendChild(cancelBtn);
                row.appendChild(okBtn);
                box.appendChild(label);
                box.appendChild(ta);
                box.appendChild(row);
                wrap.appendChild(box);
                (document.body || document.documentElement).appendChild(wrap);
                setTimeout(() => { try { ta.focus(); ta.select(); } catch (_) {} }, 50);
            });
        },

        xhrFull(options) {
            /* options.cookie === false 在本函数里是「别自己拼 cookie 头」的语义：
               GM_xmlhttpRequest 原生就会带浏览器 cookie，这里只需不额外设置。 */
            return new Promise((resolve, reject) => {
                const start = Date.now();
                /* 同 xhr()：后台被冻结时回调不会来，用计时器保证一定会 settle */
                const softMs = (Number(options && options.timeout) || 15000) + 10000;
                let settled = false;
                let guard = null;
                const finish = (fn, arg) => {
                    if (settled) return;
                    settled = true;
                    if (guard) clearTimeout(guard);
                    fn(arg);
                };
                guard = setTimeout(() => {
                    finish(reject, new Error(`请求无响应（${Math.round(softMs / 1000)} 秒未回调），已放弃`));
                }, softMs);
                GM_xmlhttpRequest({
                    ...(({ cookie, ...rest }) => rest)(options || {}),
                    timeout: Number(options && options.timeout) || 15000,
                    /* 只有显式要了 manual 才接管重定向；默认仍由 GM 跟随，保持旧行为。 */
                    ...(options && options.redirect === "manual" ? { redirect: "manual" } : {}),
                    onload: (res) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        /* 3xx 也当「有响应」返回：调用方需要 Location 才能判断是不是被跳去登录页。
                           以前这里直接 reject，302 的原因就被丢掉了。 */
                        if (res.status >= 200 && res.status < 400) {
                            const loc = String(res.responseHeaders || "").match(/location:\s*(\S+)/i);
                            finish(resolve, {
                                text: res.responseText,
                                finalUrl: res.finalUrl || "",
                                status: res.status,
                                location: loc ? loc[1] : ""
                            });
                        } else {
                            finish(reject, new Error(`HTTP ${res.status}，用时 ${cost} 秒`));
                        }
                    },
                    onerror: (err) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        finish(reject, new Error(`${err?.error || "网络错误"}，用时 ${cost} 秒`));
                    },
                    ontimeout: () => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        finish(reject, new Error(`请求超时，用时 ${cost} 秒`));
                    }
                });
            });
        },

        xhr(options) {
            return new Promise((resolve, reject) => {
                const start = Date.now();

                const url = String((options && options.url) || "");
                const hdr = Object.assign({}, (options && options.headers) || {});
                const needCookie = /(^|\.)(bing\.com|live\.com|microsoft\.com|microsoftonline\.com)\//i.test(url);
                const hasCookie = Object.keys(hdr).some(k => k.toLowerCase() === "cookie");
                /* options.cookie === false：不要手工拼 cookie 头，交给 GM 自己带浏览器 cookie。
                   GM_xmlhttpRequest 默认就带 cookie，而手工拼的那份是「部分 cookie」，
                   一旦显式设置就会整体覆盖真实登录态（服务端因此 301 要求重放）。 */
                if (needCookie && !hasCookie && options.cookie !== false && this._ckReady) {
                    const ck = this._ckReady();
                    if (ck) hdr["cookie"] = ck;
                }
                /* GM_xmlhttpRequest 的 timeout 只管网络层。
                   MV3 后台被冻结/回收时，请求就悬在半空，onload/onerror/ontimeout
                   一个都不会来，await 永远不返回 —— 这正是「一直卡着」的根源之一。
                   这里补一个纯计时器的兜底：到点一定 settle，绝不让调用方挂死。 */
                const softMs = (Number(options && options.timeout) || 15000) + 10000;
                let settled = false;
                let guard = null;
                const finish = (fn, arg) => {
                    if (settled) return;
                    settled = true;
                    if (guard) clearTimeout(guard);
                    fn(arg);
                };
                guard = setTimeout(() => {
                    finish(reject, new Error(`请求无响应（${Math.round(softMs / 1000)} 秒未回调），已放弃`));
                }, softMs);
                GM_xmlhttpRequest({
                    ...options,
                    headers: hdr,
                    timeout: Number(options && options.timeout) || 15000,
                    onload: (res) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        if (res.status >= 200 && res.status < 300) {
                            finish(resolve, res.responseText);
                        } else if ([301, 302, 307, 308].includes(res.status)) {
                            const match = res.responseHeaders?.match(/Location:\s*(.*?)\s*\r?\n/i);
                            finish(resolve, match ? match[1] : false);
                        } else {
                            finish(reject, new Error(`HTTP ${res.status}，用时 ${cost} 秒`));
                        }
                    },
                    onerror: (err) => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        finish(reject, new Error(`${err?.error || "网络错误"}，用时 ${cost} 秒`));
                    },
                    ontimeout: () => {
                        const cost = ((Date.now() - start) / 1000).toFixed(2);
                        finish(reject, new Error(`请求超时，用时 ${cost} 秒`));
                    }
                });
            });
        },

        randomRange(min, max) {
            return Math.floor(Math.random() * (max - min + 1) + min);
        },
        getTimestamp() { return Date.now(); },
        getTodayNum() {
            const d = new Date();
            return Number(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`);
        },
        getTodayStr() {
            const d = new Date();
            return `${d.getMonth()+1}/${d.getDate()}/${d.getFullYear()}`;
        },

        routerStateTree(segment = "earn") {
            const refreshFlag = 4096;
            const tree = ["", {
                children: ["(nav)", {
                    children: [segment, { children: ["PAGE", {}, null, null, refreshFlag] }, null, null, refreshFlag]
                }, null, null, refreshFlag]
            }, null, null, refreshFlag + 16];
            return encodeURIComponent(JSON.stringify(tree));
        },
        getRandomUUID() { return crypto.randomUUID().replace(/-/g, "").toUpperCase(); },

        questRouterStateTree(parentOfferId) {
            const tree = ["", {
                children: ["(nav)", {
                    children: ["earn", {
                        children: ["quest", {
                            children: [
                                ["questId", String(parentOfferId), "d", null],
                                { children: ["__PAGE__", {}, null, null, 0] },
                                null, null, 0
                            ]
                        }, null, null, 0]
                    }, null, null, 0]
                }, null, null, 0]
            }, null, "refetch", 16];
            return encodeURIComponent(JSON.stringify(tree));
        },

        async probeCookiePermission() {
            /* 老版本把标记写在 Config.cookieProbed（会被每轮收工清掉）：若那里还是 true，
               直接迁到 Perm. 前缀，避免升级后又白申请一次权限。 */
            if (!GM_getValue("Perm.cookieProbed", false) && GM_getValue("Config.cookieProbed", false)) {
                try { GM_setValue("Perm.cookieProbed", true); } catch (_) {}
            }
            if (!GM_getValue("Perm.cookieDeniedAt", 0) && GM_getValue("Config.cookieDenied", false)) {
                try { GM_setValue("Perm.cookieDeniedAt", Date.now()); } catch (_) {}
            }
            const probed = GM_getValue("Perm.cookieProbed", false);
            if (probed) return;

            if (typeof GM_cookie === "undefined" || !GM_cookie || typeof GM_cookie.list !== "function") {
                GM_setValue("Perm.cookieProbed", true);
                Utils.log("🔑", "当前脚本管理器不支持 GM_cookie（读不到登录态，但不影响任务执行）");
                return;
            }

            Utils.log("🔑", "首次运行：请求 Cookie 读取权限，若弹出授权框请点「允许」");
            const r = await this.loginCookies();
            /* 只有「真的读到了」才记「探测过」。被拒时留着不记，
               这样 6 小时窗口过后会自动再申请一次 —— 用户中途在扩展里放开权限能自愈。
               （旧版无论结果都记 true，再叠加每轮清缓存，就变成「每轮都申请一次」。） */
            if (r) GM_setValue("Perm.cookieProbed", true);

            if (r === null) {
                Utils.log("🟡", "Cookie 读取被拒绝或超时：脚本仍可正常运行，只是读不到登录态诊断。"
                    + "如需放权，去脚本管理器的「脚本详情 → 权限」里允许 Cookie 访问，然后重新运行。");
            } else if (r.hasSession) {
                Utils.log("🔑", "Cookie 权限正常，已登录：" + (r.names || []).slice(0, 6).join(","));
            } else {
                Utils.log("🔑", "Cookie 权限正常，但读出的是未登录状态（请确认已在该浏览器登录 rewards）");
            }
        },

        async loginCookies() {

            /* 拒绝是「软状态」：只记时间，6 小时内不再打扰（避免每轮申请弹窗），
               过了自动再试一次 —— 用户在扩展里手动放开 Cookie 权限后，
               不用等脚本重装/清标记就能恢复诊断能力。 */
            const deniedAt = Number(GM_getValue("Perm.cookieDeniedAt", 0)) || 0;
            if (deniedAt && (Date.now() - deniedAt) < 6 * 3600 * 1000) return null;
            if (typeof GM_cookie === "undefined" || !GM_cookie || typeof GM_cookie.list !== "function") return null;
            const read = (filter) => new Promise(resolve => {
                let settled = false;
                const done = v => { if (!settled) { settled = true; resolve(v); } };
                setTimeout(() => done(null), 2500);
                try {
                    GM_cookie.list(filter, cookies => done(Array.isArray(cookies) ? cookies : []));
                } catch (_) {
                    done(null);
                }
            });
            const [byDomain, byUrl] = await Promise.all([
                read({ domain: "bing.com" }),
                read({ url: "https://rewards.bing.com/" })
            ]);
            if (byDomain === null && byUrl === null) { GM_setValue("Perm.cookieDeniedAt", Date.now()); return null; }
            const all = [...(byDomain || []), ...(byUrl || [])];
            const found = new Set(all.map(c => String((c && c.name) || "")));
            const hasMuid = found.has("MUID") || found.has("MUIDB");
            const bingMarks = ["_EDGE_S", "_EDGE_V", "SRCHHPGUSR", "MSCC", "BID", "USRLOC"];
            const bingReady = bingMarks.some(n => found.has(n));
            const hasSession = hasMuid || bingReady;
            return { hasMuid, hasSession, names: [...found].slice(0, 20) };
        },

        async getCookieHeader(force = false) {
            const now = Date.now();
            if (!force && this._ckCache && now - this._ckAt < 5 * 60 * 1000) return this._ckCache;
            if (typeof GM_cookie === "undefined" || !GM_cookie) return "";
            const read = (filter) => new Promise(resolve => {
                let settled = false;
                const done = v => { if (!settled) { settled = true; resolve(v); } };
                setTimeout(() => done(null), 3000);
                try {
                    if (typeof GM_cookie.list === "function") {
                        GM_cookie.list(filter, cookies => done(Array.isArray(cookies) ? cookies : []));
                    } else done(null);
                } catch (_) { done(null); }
            });

            const groups = await Promise.all([
                read({}),
                read({ domain: "bing.com" }),
                read({ url: "https://rewards.bing.com/" })
            ]);
            const seen = new Map();
            for (const g of groups) {
                for (const c of (g || [])) {
                    const n = String((c && c.name) || "");
                    const dom = String((c && c.domain) || "");
                    if (!n || seen.has(n)) continue;
                    if (!c.value) continue;
                    if (!/bing\.com|live\.com|microsoft\.com/i.test(dom)) continue;
                    seen.set(n, String(c.value));
                }
            }
            const header = [...seen.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
            this._ckCache = header;
            this._ckAt = now;
            Utils._ckReady = () => header;

            const hasSession = ["MSPAuth", "MSPProf", "WLSSC", "NAP"].some(n => seen.has(n));
            if (header) {
                Utils.log(hasSession ? "🔑" : "🟡",
                    `已读取 ${seen.size} 个 cookie${hasSession ? "（含登录会话）" : "（缺少会话 cookie，可能未登录）"}`
                    + `，将用于给后台请求补登录态`);
            } else {
                Utils.log("🟡", "读不到任何 cookie：后台请求将没有登录态（GM_cookie 是否已授权？）");
            }
            return header;
        },

        isJSON(s) {
            try {
                const j = JSON.parse(s);
                return Array.isArray(j) || (typeof j === "object" && j !== null);
            } catch (_) { return false; }
        },

        parseJSON(s) {
            if (typeof s !== "string" || !s) return null;
            try {
                const j = JSON.parse(s);
                return (typeof j === "object" && j !== null) ? j : null;
            } catch { return null; }
        },

        appHeaders(token, { kind = "app", country, extra } = {}) {
            const cc = country || RewardsAuto.region();
            const base = kind === "edge" ? {
                "accept": "*/*",
                "content-type": "application/json; charset=UTF-8",
                "user-agent": RewardsAuto.ua.edge,
                "authorization": `Bearer ${token}`,
                "x-rewards-appid": "EdgeDesktop",
                "x-rewards-partnerid": "EdgeHub",
                "x-rewards-country": cc,
                "x-rewards-language": cc === "cn" ? "zh-CN" : "en-US",
            } : {
                "content-type": "application/json; charset=UTF-8",
                "user-agent": RewardsAuto.ua.app,
                "authorization": `Bearer ${token}`,
                "x-rewards-appid": RewardsAuto.appConfig.rewardsAppId,
                "x-rewards-ismobile": "true",
                "x-rewards-country": cc,
                "x-rewards-language": "zh",
            };
            return extra ? Object.assign(base, extra) : base;
        },
        delay(ms) { return new Promise(r => setTimeout(r, ms)); },
        randomDelay(min = 3000, max = 8000) { return this.delay(this.randomRange(min, max)); },


        lockId() {
            if (!RewardsAuto.state.lockId) RewardsAuto.state.lockId = Utils.getRandomUUID();
            return RewardsAuto.state.lockId;
        },

        acquireLock(key, ttlMs = 20 * 60 * 1000) {
            const now = Date.now();
            const holder = GM_getValue(key, null);
            const mine = Utils.lockId();
            if (holder && typeof holder === "object" && holder.id && holder.id !== mine && now - (holder.ts || 0) < ttlMs) {
                return false;
            }
            GM_setValue(key, { id: mine, ts: now });
            return true;
        },

        refreshLock(key, ttlMs = 20 * 60 * 1000) {
            const now = Date.now();
            const holder = GM_getValue(key, null);
            const mine = Utils.lockId();
            /* 只在「锁是自己的」或「锁已过期」时续期：
               否则一个被冻结的上下文醒来后会把别人正在跑的那一轮锁抢成自己的。 */
            if (holder && typeof holder === "object" && holder.id && holder.id !== mine
                && now - (holder.ts || 0) < ttlMs) {
                return false;
            }
            GM_setValue(key, { id: mine, ts: now });
            return true;
        },

        lockInfo(key) {
            const h = GM_getValue(key, null);
            if (!h || typeof h !== "object" || !h.id) return null;
            return { id: h.id, ts: Number(h.ts) || 0, mine: h.id === Utils.lockId() };
        },

        releaseLock(key) {
            const holder = GM_getValue(key, null);
            if (!holder || holder.id === Utils.lockId()) GM_setValue(key, null);
        }
    };

    class RegionBlockedError extends Error {
        constructor(message) {
            super(message);
            this.name = "RegionBlockedError";
            this.regionBlocked = true;
        }
    }

    const RegionGuard = {
        _cache: null,
        _inflight: null,
        _lastState: "",
        TTL_OK: 120 * 1000,
        TTL_BLOCK: 45 * 1000,
        PROBE_TIMEOUT: 8000,

        enabled() {
            return !!GM_getValue("Config.lock", true);
        },

        HOSTING_RE: /cloudflare|digitalocean|vultr|linode|akamai|fastly|amazon|aws|google\s*cloud|azure|alibaba|aliyun|alicloud|tencent\s*cloud|qcloud|huawei\s*cloud|hetzner|ovh|leaseweb|contabo|hostwinds|hostinger|racknerd|colocrossing|sharktech|psychz|choopa|m247|datacamp|zenlayer|layerstack|gcore|oracle\s*cloud|\bvpn\b|\bproxy\b|tor\s*exit|ipvanish|nordvpn|expressvpn|surfshark|mullvad/i,

        CN_PAGE_RE: /cn\.bing\.com|京ICP备|beian\.miit\.gov\.cn|国内版<\/a>|国内版/,

        PROBES: [
            {
                src: "bing",
                url: () => `https://www.bing.com/?_=${Date.now()}`,
                headers: { "accept-language": "zh-CN,zh;q=0.9", "cache-control": "no-cache" },
                parse: (txt, g) => {
                    const text = String(txt || "");
                    const flat = text.replace(/\s/g, "");
                    const ipcc = flat.match(/RevIpCC:"([A-Za-z]{2})"/);
                    const region = flat.match(/Region:"([A-Za-z]{2})"/);
                    let cc = ipcc ? ipcc[1] : (region ? region[1] : "");
                    if (!cc && g.CN_PAGE_RE.test(text)) cc = "CN";
                    if (!cc) throw new Error("首页未返回地区标记");
                    return { cc: cc.toUpperCase(), ip: "", org: "" };
                }
            },
            {
                src: "cloudflare",
                url: () => `https://www.cloudflare.com/cdn-cgi/trace?_=${Date.now()}`,
                parse: txt => {
                    const kv = {};
                    String(txt || "").split("\n").forEach(line => {
                        const i = line.indexOf("=");
                        if (i > 0) kv[line.slice(0, i).trim()] = line.slice(i + 1).trim();
                    });
                    if (!kv.loc) throw new Error("trace 格式异常");
                    return { cc: String(kv.loc).toUpperCase(), ip: kv.ip || "", org: "", warp: kv.warp === "on" };
                }
            },
            {
                src: "ipinfo",
                url: () => `https://ipinfo.io/json?_=${Date.now()}`,
                parse: txt => {
                    const d = JSON.parse(txt);
                    if (!d || !d.country) throw new Error(String((d && (d.error || d.message)) || "无 country 字段"));
                    return { cc: String(d.country).toUpperCase(), ip: d.ip || "", org: d.org || "" };
                }
            },
            {
                src: "ip.sb",
                url: () => `https://api.ip.sb/geoip?_=${Date.now()}`,
                parse: txt => {
                    const d = JSON.parse(txt);
                    if (!d || !d.country_code) throw new Error("无 country_code 字段");
                    return {
                        cc: String(d.country_code).toUpperCase(),
                        ip: d.ip || "",
                        org: [d.isp, d.organization, d.asn_organization].filter(Boolean).join(" ")
                    };
                }
            },
            {
                src: "tencent",
                url: () => "https://disp-qryapi.3g.qq.com/v1/dispatch",
                headers: { referer: "https://3g.qq.com/" },
                parse: txt => {
                    const d = JSON.parse(txt);
                    if (!d || d.code != 0) throw new Error("dispatch 返回异常");
                    return {
                        cc: "",
                        ip: (d.extra && d.extra.ip) || "",
                        org: "",
                        cnText: String(d.ipInfo || "").replace(/[#*]+/g, " ").trim()
                    };
                }
            },
        ],

        async _probeAll() {
            return await Promise.all(this.PROBES.map(async p => {
                try {
                    const txt = await Utils.xhr({
                        url: p.url(),
                        headers: p.headers,
                        anonymous: p.anonymous !== false,
                        timeout: this.PROBE_TIMEOUT
                    });
                    return Object.assign({ src: p.src, cc: "", ip: "", org: "" }, p.parse(txt, this));
                } catch (e) {
                    return { src: p.src, error: e instanceof Error ? e : new Error(String(e)), cc: "", ip: "", org: "" };
                }
            }));
        },

        _merge(list) {
            const map = new Map();
            for (const r of list) {
                if (!r) continue;
                const score = (r.error ? 0 : 2) + (r.cc ? 1 : 0);
                const cur = map.get(r.src);
                const curScore = cur ? (cur.error ? 0 : 2) + (cur.cc ? 1 : 0) : -1;
                if (score > curScore) map.set(r.src, r);
            }
            return [...map.values()];
        },

        _judge(raw) {
            const probes = this._merge(raw);
            const ok = probes.filter(p => !p.error);
            const coded = ok.filter(p => p.cc);
            const foreign = coded.filter(p => p.cc !== "CN");
            const tencent = ok.find(p => p.src === "tencent");
            const cnText = (tencent && tencent.cnText) || "";
            const tencentCN = /中国/.test(cnText);
            const tencentOverseas = !!(cnText && !tencentCN && !/局域网|内网|本地|保留|未知/.test(cnText));
            const warp = ok.find(p => p.warp);
            const hosting = ok.find(p => p.org && this.HOSTING_RE.test(p.org));

            const reasons = [];
            if (foreign.length > 0) {
                reasons.push(`出口非大陆：${foreign.map(p => `${p.src}=${p.cc}${p.ip ? `(${p.ip})` : ""}`).join("、")}`);
            }
            if (tencentOverseas) {
                reasons.push(`国内服务看到的出口在境外：${cnText}`);
            }
            if (warp) reasons.push("Cloudflare WARP 正在接管流量（代理特征）");
            if (hosting) reasons.push(`出口是机房/代理 IP：${hosting.org}`);

            const signals = probes.map(p => {
                if (p.error) return `${p.src}=✗`;
                if (p.src === "tencent") {
                    return `tencent=${tencentCN ? "CN" : tencentOverseas ? "海外" : "?"}${p.ip ? `(${p.ip})` : ""}`;
                }
                return `${p.src}=${p.cc}${p.ip ? `(${p.ip})` : ""}`;
            });

            const ipHolder = (tencent && tencent.ip) ? tencent : ok.find(p => p.ip);
            return {
                ok: reasons.length === 0,
                reasons,
                signals,
                ip: (ipHolder && ipHolder.ip) || "",
                ipInfo: cnText ? `🌏所在地区：${cnText}` : "",
                coded: coded.length,
                known: coded.length + (cnText ? 1 : 0),
                probes: probes.length,
                failed: probes.filter(p => p.error).map(p => `${p.src}: ${p.error.message}`)
            };
        },

        async check({ fresh = false, quiet = false } = {}) {
            if (!this.enabled()) {
                return { ok: true, skipped: true, reasons: [], signals: [], ip: "", ipInfo: "", coded: 0, known: 0, probes: 0, failed: [] };
            }
            const now = Date.now();
            if (!fresh && this._cache && (now - this._cache.at) < (this._cache.ok ? this.TTL_OK : this.TTL_BLOCK)) {
                return this._cache;
            }
            if (this._inflight) return this._inflight;

            this._inflight = (async () => {
                let raw = await this._probeAll();
                let verdict = this._judge(raw);
                for (const wait of [2000, 5000]) {
                    if (verdict.known > 0) break;
                    if (!quiet) Utils.log("🟡", `出口检测没拿到任何结果，${wait / 1000} 秒后再试一次`);
                    await Utils.delay(wait);
                    raw = raw.concat(await this._probeAll());
                    verdict = this._judge(raw);
                }
                if (verdict.known === 0) {
                    verdict.ok = false;
                    verdict.reasons.unshift("无法确认出口地区（所有探测都失败）");
                }
                verdict.at = Date.now();
                this._cache = verdict;

                if (verdict.ok) {
                    RewardsAuto.state.region = "CN";
                    if (verdict.ip) RewardsAuto.state.ip = verdict.ip;
                    if (this._lastState !== "ok" || fresh) {
                        Utils.log("🟢", `出口检测通过（CN）｜${verdict.signals.join("  ")}`);
                    }
                    this._lastState = "ok";
                } else {
                    if (verdict.ip) RewardsAuto.state.ip = verdict.ip;
                    if (verdict.ipInfo) RewardsAuto.state.ipInfo = verdict.ipInfo;
                    const stateChanged = this._lastState !== "block";
                    /* 出口被拦是「需要人介入」的异常：只在状态刚变成 block
                       的那一次推一条，同一次阻塞期内不再重复（恢复后再拦才算新事件）。 */
                    if (stateChanged || fresh) {
                        const text = `检测到代理/VPN 或非大陆出口，已暂停上报\n${verdict.reasons.join("\n")}\n出口 IP：${verdict.ip || "未知"}\n${verdict.ipInfo || ""}`;
                        if (stateChanged) {
                            Utils.notifyAnomaly("🔴", text, "regionBlock");
                        } else {
                            Utils.log("🟡", text);
                        }
                    }
                    this._lastState = "block";
                }
                return verdict;
            })();

            try {
                return await this._inflight;
            } finally {
                this._inflight = null;
            }
        },

        async guard(where = "任务") {
            const v = await this.check();
            if (!v.ok) throw new RegionBlockedError(`出口异常（${where}）：${v.reasons[0] || "未知原因"}`);
            return v;
        },

        async allow() {
            const v = await this.check();
            return v.ok;
        }
    };

    const CLIENT_ID = "0000000040170455";
    const REDIRECT_URI = "https://login.live.com/oauth20_desktop.srf";
    const TOKEN_SCOPE = "service::prod.rewardsplatform.microsoft.com::MBI_SSL";

    const Auth = {
        authUrl: `https://login.live.com/oauth20_authorize.srf?client_id=${CLIENT_ID}&response_type=code&scope=${TOKEN_SCOPE}&redirect_uri=${REDIRECT_URI}`,

        decode(s) {
            return String(s).replace(/%([0-9a-fA-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
        },

        normalize(code) {
            if (!code) return null;
            const c = String(code)
                .trim()
                .replace(/^[^A-Za-z0-9]+/, "")
                .replace(/[^A-Za-z0-9._*!$%~-]+$/, "");
            return c.length >= 20 ? c : null;
        },

        parseCode(input) {
            if (input == null) return null;
            let s = String(input)
                .replace(/[\u00a0\u3000]/g, " ")
                .replace(/\\u0026/gi, "&")
                .replace(/\\\//g, "/")
                .replace(/&amp;/gi, "&")
                .replace(/[\r\n\t]+/g, " ")
                .trim();
            if (!s) return null;

            const m = s.match(/[?&#;\s]code=([^&\s"'<>\\]+)/i) || s.match(/^code=([^&\s"'<>\\]+)/i);
            if (m) {
                const c = this.normalize(this.decode(m[1]));
                if (c) return c;
            }
            const bare = s.match(/M\.[A-Za-z0-9._*!$%~-]{20,}/);
            if (bare) return this.normalize(this.decode(bare[0]));
            const t = s.replace(/^[\s"'`<\[(]+/, "").replace(/[\s"'`>\])]+$/, "");
            if (/^[A-Za-z0-9._*!$%~-]{40,}$/.test(t)) return this.normalize(this.decode(t));
            return null;
        },

        preview(code) {
            if (!code) return "(空)";
            return `${code.slice(0, 12)}…${code.slice(-6)}（${code.length} 字符）`;
        },

        pick(list) {
            for (const item of list) {
                if (!item || !item.value) continue;
                const code = this.parseCode(item.value);
                if (code) return { code, source: item.source, raw: String(item.value) };
            }
            return null;
        },

        candidates(deep) {
            const list = [];
            const add = (source, value) => { if (value) list.push({ source, value: String(value) }); };
            try { add("地址栏", location.href); } catch (_) {}
            try { add("地址栏参数", `${location.search || ""}${location.hash || ""}`); } catch (_) {}

            try { add("document.referrer", typeof document !== "undefined" && document ? document.referrer : ""); } catch (_) {}
            try {
                const nav = (typeof performance !== "undefined" && performance.getEntriesByType)
                    ? performance.getEntriesByType("navigation") : null;
                if (nav && nav[0] && nav[0].name) add("navigation", nav[0].name);
            } catch (_) {}
            try { add("window.name", typeof window !== "undefined" ? window.name : ""); } catch (_) {}
            if (OAUTH_WITNESS) {
                add("启动快照(地址栏)", OAUTH_WITNESS.href);
                add("启动快照(referrer)", OAUTH_WITNESS.referrer);
                add("启动快照(window.name)", OAUTH_WITNESS.name);
                (OAUTH_WITNESS.urls || []).forEach((u, i) => add(`历史 URL#${i + 1}`, u));
            }
            if (!deep) return list;
            try {
                const html = (typeof document !== "undefined" && document && document.documentElement)
                    ? String(document.documentElement.outerHTML || "") : "";
                const m = html.match(/[^\s"'<>\\]{0,160}code=[A-Za-z0-9._~%*!$-]{20,120}[^\s"'<>\\]{0,32}/i);
                if (m) add("页面内容", m[0]);
            } catch (_) {}
            for (const storeName of ["sessionStorage", "localStorage"]) {
                try {
                    const store = (typeof window !== "undefined" && window) ? window[storeName] : null;
                    if (!store) continue;
                    for (let i = 0; i < store.length && i < 40; i++) {
                        const key = store.key(i);
                        if (key == null) continue;
                        const val = store.getItem(key);
                        if (val && val.length < 4000 && /code=/i.test(val)) add(`${storeName}.${key}`, val);
                    }
                } catch (_) {}
            }
            return list;
        },

        collectCode(deep = false) {
            return this.pick(this.candidates(deep));
        },

        async waitForAnyCode(timeoutMs = 12000, stepMs = 500) {
            const t0 = Date.now();
            for (let tick = 0; Date.now() - t0 < timeoutMs; tick++) {
                const hit = this.collectCode(tick === 0 || tick % 4 === 0);
                if (hit) return hit;
                await Utils.delay(stepMs);
            }
            return this.collectCode(true);
        },

        used(code) {
            if (!GM_getValue("Config.codeUsed", false)) return false;
            const fp = String(GM_getValue("Config.codeFingerprint", ""));
            return !fp || fp === String(code || "").slice(-32);
        },

        stored() {
            const raw = GM_getValue("Config.code", "");
            if (!raw) return null;
            const code = this.parseCode(raw);
            if (!code) {
                if (!this._warned) {
                    this._warned = true;
                    Utils.log("🟡", `已保存的授权码无法解析（长度 ${String(raw).length}），请重新「📋 粘贴授权码」`);
                }
                return null;
            }
            if (this.used(code)) return null;
            return code;
        },

        save(raw) {
            const code = this.parseCode(raw);
            GM_setValue("Config.code", String(raw).trim());
            GM_setValue("Config.codeTime", Utils.getTimestamp());
            GM_setValue("Config.codeUsed", false);
            GM_setValue("Config.codeFingerprint", code ? code.slice(-32) : "");
            GM_setValue("Config.accessToken", "");
            GM_setValue("Config.accessTokenTime", 0);
            RewardsAuto.state.token = null;
            return code;
        },

        clear(reason) {
            GM_setValue("Config.code", "");
            GM_setValue("Config.codeTime", 0);
            GM_setValue("Config.codeUsed", false);
            GM_setValue("Config.codeFingerprint", "");
            if (reason) Utils.log("🟡", `已清除授权码：${reason}`);
        },

        async exchange(code, keep = true) {
            Utils.log("🟡", `正在用授权码换取 Token（${this.preview(code)}）...`);
            const r = await API.tokenRequest({
                client_id: CLIENT_ID,
                code,
                redirect_uri: REDIRECT_URI,
                grant_type: "authorization_code",
            });
            if (r.ok) {
                API.applyToken(r.json);
                if (keep) {
                    GM_setValue("Config.codeUsed", true);
                    GM_setValue("Config.codeFingerprint", String(code).slice(-32));
                    Utils.log("🟢", "授权码换取 Token 成功（授权码已保留）");
                } else {
                    Utils.log("🟢", "授权码换取 Token 成功，已保存");
                    this.clear();
                }
                return true;
            }
            const fatal = ["invalid_grant", "invalid_request", "unauthorized_client", "invalid_client"].includes(r.error);
            Utils.log("🔴", `授权码换取 Token 失败：${r.error}${r.description ? " - " + r.description : ""}`);
            if (fatal) this.clear("授权码已过期或已被使用过");
            return false;
        },

        async fetchViaXhr() {
            let res;
            try {
                res = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "GET",
                        url: this.authUrl,
                        headers: typeof navigator !== "undefined" ? { "User-Agent": navigator.userAgent } : {},
                        timeout: 20000,
                        onload: r => resolve(r),
                        onerror: e => reject(new Error((e && e.error) || "网络错误")),
                        ontimeout: () => reject(new Error("请求超时")),
                    });
                });
            } catch (e) {
                Utils.log("🟡", `静默获取授权码失败：${e.message}`);
                return null;
            }
            const candidates = [];
            if (res.finalUrl) candidates.push(res.finalUrl);
            if (res.responseURL) candidates.push(res.responseURL);
            if (res.status >= 300 && res.status < 400) {
                const loc = (res.responseHeaders || "").match(/location:\s*(\S+)/i);
                if (loc) candidates.push(loc[1]);
            }
            if (res.responseText) {
                const m = res.responseText.match(/oauth20_desktop\.srf\?[^"'\s<>]*code=[^"'\s<>]+/i)
                    || res.responseText.match(/[?&]code=M\.[^"'\s<>&]+/i);
                if (m) candidates.push(m[0]);
            }
            for (const c of candidates) {
                const code = this.parseCode(c);
                if (code) return code;
            }
            const finalUrl = res.finalUrl || res.responseURL || "";
            if (/removed=true/i.test(finalUrl)) {
                Utils.log("🟡", `静默通道被微软跳到了 ?removed=true（code 已被抹掉），改走页面 Referer 通道`);
                return null;
            }
            Utils.log("🟡", `静默通道没拿到授权码（HTTP ${res.status}，最终地址 ${finalUrl || "未知"}）`);
            return null;
        },


        async autoFetch(reason) {
            if (!GM_getValue("Config.autoAuth", true)) {
                Utils.log("🔴", `${reason}，且配置里已关闭「自动检测授权码」：请点菜单「🔑 手动授权」，登录后把跳转地址粘贴到「📋 粘贴授权码」。`);
                return {};
            }
            Utils.log("🟡", `${reason}，后台静默尝试捕获授权码（不打开标签页）...`);
            const viaXhr = await this.fetchViaXhr();
            if (viaXhr) {
                Utils.log("🟢", "自动获取授权码成功（静默通道）");
                return { code: viaXhr };
            }
            Utils.log("🔴", "静默捕获授权码失败，不自动打开授权页。请点菜单「🔑 手动授权」登录：页面跳到 oauth20_desktop.srf 时脚本会自动从 Referer 捕获授权码并换 Token；也可以 F12 → 网络 → oauth20_desktop.srf?removed=true → 标头 → 请求标头 → 复制 Referer，再用「📋 粘贴授权码」粘贴。");
            return {};
        },

        async handleCallback() {
            const params = new URLSearchParams(location.search);
            const err = params.get("error");
            if (err) {
                const desc = params.get("error_description") || "";
                /* 与出口拦截同一套：只走网关，避免「浏览器通知 + 网关」双份 */
                Utils.notifyAnomaly("🔴", `授权页返回错误：${err} - ${desc}`, "authCallback");
                return;
            }
            if (!params.get("code")) {
                Utils.log("🟡", `回调地址里没有 code（${location.search || "无参数"}），改从 Referer / 启动快照里找...`);
            }
            const hit = this.collectCode(false) || await this.waitForAnyCode(12000);
            if (!hit) {
                /* 直接把「怎么办」写进这一条：只推一次，正文就能照着做，
                   不再额外弹第二个浏览器通知（那是重复打扰）。 */
                Utils.notifyAnomaly("🔴",
                    "自动捕获授权码失败：地址栏、document.referrer、启动快照里都没有 code\n"
                    + "F12 → 网络 → 点 oauth20_desktop.srf?removed=true → 标头 → 请求标头 → 复制 Referer 右侧完整链接，再用「📋 粘贴授权码」",
                    "authCapture");
                return;
            }
            const code = hit.code;
            Utils.log("🟢", `已捕获授权码（来源：${hit.source}，${this.preview(code)}），正在换取 Token...`);
            this.save(hit.raw || code);
            const ok = await this.exchange(code);
            if (ok) {
                /* 手动授权流程的即时回执：用户正看着这个页面，弹一条告诉他可以关页 */
                try { GM_notification({ title: "🟢 授权成功", text: "Token 已保存，可以关闭此页了", timeout: 6000 }); } catch (_) {}
                setTimeout(() => { try { window.close(); } catch (_) {} }, 2000);
            } else {
                Utils.notifyAnomaly("🔴", "授权码换取 Token 失败，请查看脚本日志后重新授权", "authCallbackExchange");
            }
        },


        async pasteFlow(input) {
            let raw = input;
            if (raw == null) {
                raw = await Utils.uiPrompt(
                    "粘贴授权页跳转后的完整地址：\n" +
                    "形如 https://login.live.com/oauth20_desktop.srf?code=M.C561_BAY...&lc=2052\n\n" +
                    "如果手速不够快，地址栏发生了变化(没有code=M...=2052):\n" +
                    "方案1：再次点击手动授权(看准时机复制地址栏内容)\n"+
                    "方案2：手动授权 → F12 → 网络(Network) → oauth20_desktop.srf?removed=true → 标头(Headers) → 请求标头(Request headers) → Referer → 复制右侧完整链接\n"

                );
                if (raw == null) return false;
            }
            const code = this.save(raw);
            if (!code) {
                Utils.uiAlert("❌ 没能从粘贴内容里解析出授权码。\n\n请确认复制的是授权页跳转后的完整地址（里面要带 code=），然后重新粘贴。形如:\nhttps://login.live.com/oauth20_desktop.srf?code=M.C561_BAY...&lc=2052");
                Utils.log("🔴", `粘贴的授权码无法解析（长度 ${String(raw).trim().length}）`);
                return false;
            }
            Utils.log("🟢", `授权码已保存（${this.preview(code)}），立即换取 Token...`);
            const ok = await this.exchange(code);
            Utils.uiAlert(ok
                ? "✅ 授权成功，Token 已保存。\n\n授权码也已保留（可在「📊 Token状态」里查看）。授权码本身只能用一次，\n后续使用的是token，无需你再操作。"
                : "⚠️ 授权码已保存，但换取 Token 失败。\n\n最常见原因：授权码已过期或已被使用过。\n请重新点「🔑 手动授权」，登录后立刻复制跳转地址再粘贴。");
            return ok;
        },
    };

    const CDP = {
        _ws: null,
        _id: 0,
        _pending: null,
        _warnedAt: 0,
        WARN_GAP: 30 * 60 * 1000,

        /* 端口不再写死 9222：多账号时由 llq.py 给每个浏览器分配 9222+i，
           启动后通过 CDP 把本浏览器的端口写进 rewards 页面的 localStorage
           （__mp_cdp_port），页面上下文读到后存进 Config.cdpPort。
           读不到时才回退 9222，单账号/手动调试仍然可用。 */
        _portCached: 0,
        get PORT() {
            const saved = Number(GM_getValue("Config.cdpPort", 0)) || 0;
            return saved > 0 ? saved : 9222;
        },
        _portAt: 0,

        base() {
            return "http://127.0.0.1:" + this.PORT;
        },

        launchCommand() {
            const port = this.PORT;
            const profile = String(GM_getValue("Config.cdpProfileDir", "") || "%LOCALAPPDATA%\\Microsoft\\Edge\\CDPUser Data");
            /* --profile-directory 只在真的配置了、且不是 Default 时才加。
               以前这里默认写死 "Profile 2"，而 CDP 配置目录里通常只有 Default：
               照着这条命令启动会开出一个没登录 rewards、也没装脚本的空配置，
               于是又变成「端口能连、页面用不了」。 */
            const profDir = String(GM_getValue("Config.cdpProfileName", "") || "");
            return "& \"C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe\""
                + " --remote-debugging-port=" + port
                + " --remote-allow-origins=* --user-data-dir=\""
                + profile
                + "\""
                + (profDir && profDir !== "Default"
                    ? " --profile-directory=\"" + profDir + "\""
                    : "");
        },

        warn(reason) {
            /* 只写后台日志，不推送（通知/webhook）：CDP 没连上是常态，不该占用推送通道。
               仍然保留 30 分钟节流，避免每一轮都往控制台刷一屏启用方法。 */
            const now = Date.now();
            const first = !this._warnedAt || now - this._warnedAt > this.WARN_GAP;
            if (!first) {
                Utils.log("🟡", "CDP 仍未连接：" + reason + "（30 分钟内不再重复提示）");
                return;
            }
            this._warnedAt = now;
            /* 按运行环境给不同的排查建议：
               原来不分环境地输出「& msedge.exe --remote-debugging-port=...」，
               在本项目的容器/无头环境里纯属噪音 —— 那里跑的是 zy.py 拉起的
               chromium，根本没有 msedge，真正的原因通常是「本账号浏览器已经关了」
               或者「端口没对上，连到了别的账号」。 */
            const ua = (typeof navigator !== "undefined" && navigator.userAgent) || "";
            const headlessHost = /HeadlessChrome|Linux/i.test(ua)
                || !/Windows/i.test((typeof navigator !== "undefined" && navigator.platform) || "");
            let msg;
            if (headlessHost) {
                msg = [
                    "CDP 未连接：" + reason,
                    "应用内搜索型卡片（带锁标识）需要浏览器级真实点击，本轮跳过；",
                    "搜索 / 阅读 / 签到 / 活动卡片走 DAPI 通道，不受影响。",
                    "",
                    "【容器 / 无头模式常见原因】",
                    "· 本账号的浏览器已经被关闭（任务完成、或换轮时被回收）—— 等下一个执行点即可；",
                    "· 端口没对上：多账号应各连 9222/9223/9224/9225。",
                    "  主通道是 zy.py 的端口表 http://127.0.0.1:47831/zy-ports.json",
                    "  （脚本猫按自己的 MUID 认领端口），备用是 rewards 页 localStorage.__mp_cdp_port。",
                    "  若四个账号都显示 9222，就是三条通道全落空了。",
                    "",
                    "【排查】zy.py 日志里搜「端口标记」，应有"
                        + "「🎯 已写入端口标记 __mp_cdp_port=922X」。"
                ].join(String.fromCharCode(10));
            } else {
                msg = [
                    "CDP 未连接：" + reason,
                    "应用内搜索型卡片（带锁标识）需要浏览器级真实点击才能记账。",
                    "页面内 JS 模拟点击无效 —— isTrusted=false 时浏览器直接拒绝导航，这是安全边界。",
                    "",
                    "【最可能的原因】用 --remote-debugging-port 启动时漏了 --remote-allow-origins=*。",
                    "这时端口能连、/json/version 也正常，但脚本（扩展源）发起 WebSocket 会被",
                    "DevTools 直接 403 拒绝，表现就是「能连上端口，但拿不到可用的 rewards 页」。",
                    "",
                    "【启用方法】关掉那个调试窗口，再用带完整参数的快捷方式启动（或粘下面这条命令）：",
                    this.launchCommand(),
                    "",
                    "它会在一个独立小窗口打开（不影响你平时的 Edge）。首次需要在该窗口登录 rewards.bing.com。"
                ].join(String.fromCharCode(10));
            }
            Utils.log("🔴", msg);
        },

        /* 端口以 Config.cdpPort 为准（由页面上下文从 localStorage.__mp_cdp_port 读出），
           读不到才回退 9222；这里只探这一个端口，不做 9222~9225 全段扫描。 */
        async available() {
            if (typeof WebSocket === "undefined") return false;
            const now = Date.now();
            const port = this.PORT;
            /* 成功和失败都缓存 60 秒：每轮会问很多次，不该每次都真去连一遍。
               缓存要跟端口绑定：端口刚被注入/切换时必须重新探测。 */
            if (now - this._portAt < 60 * 1000 && this._portCached === port) {
                /* 60 秒内已探测过：直接复用上次结果 */
                return this._portOk === true;
            }
            this._portCached = port;
            try {
                const r = await Utils.xhr({ url: this.base() + "/json/version", timeout: 1500 });
                this._portOk = !!(r && String(r).indexOf("Browser") >= 0);
            } catch (_) {
                this._portOk = false;
            }
            this._portAt = Date.now();
            return this._portOk;
        },

        async targets() {
            try {
                const txt = await Utils.xhr({ url: this.base() + "/json/list", timeout: 4000 });
                return JSON.parse(txt);
            } catch (_) {
                return null;
            }
        },

        /* 静默标签页：background:true 建页不抢焦点；只关自己开的页（_owned）；
           先 available() 确认 CDP 可用才允许开页。 */
        _bws: null,
        _bid: 0,
        _bpending: null,
        _owned: [],
        _wsUrl: "",

        OWNED_KEY: "Config.cdpOwnedTabs",
        DONE_KEY: "Config.cdpDoneDate",

        /* ---------------- 开页闸门 ----------------
           只有「确实必须用 CDP」的任务才能拿到令牌，其余一律开不出页。
           令牌是一次性的：openSilent() 消费掉它，用完即失效，
           避免某个任务拿到令牌后，后续无关的开页请求也搭车通过。 */
        ALLOW_REASONS: {
            "card-cdp": "带锁卡片 / 应用内搜索卡（必须 CDP 真搜索）",
            "desktop": "桌面应用专属任务（必须切应用 UA）"
        },
        _allowOnce: "",

        /* 由需要 CDP 的任务在开页前显式声明理由；理由不在白名单里就什么也不发生。 */
        grantOnce(reason) {
            const key = String(reason || "");
            if (!Object.prototype.hasOwnProperty.call(this.ALLOW_REASONS, key)) return false;
            this._allowOnce = key;
            return true;
        },

        revokeAllow() { this._allowOnce = ""; },

        /* 这次开页是不是被允许的。消费令牌 → 一次性。 */
        _takeAllow() {
            const key = this._allowOnce;
            this._allowOnce = "";
            return Object.prototype.hasOwnProperty.call(this.ALLOW_REASONS, key) ? key : "";
        },

        todayDone() {
            const d = Number(GM_getValue(this.DONE_KEY, 0)) || 0;
            return !!d && d === Utils.getTodayNum();
        },

        markTodayDone() {
            try { GM_setValue(this.DONE_KEY, Utils.getTodayNum()); } catch (_) {}
        },

        ownedStored() {
            const raw = GM_getValue(this.OWNED_KEY, null);
            return Array.isArray(raw) ? raw.filter(x => x && x.id) : [];
        },

        /* 「哪些标签页是本脚本开的」以持久化登记为准，内存 _owned 只是本上下文的快速视图。
           上下文被重建后内存会清空，但登记还在 —— 否则上一轮开的页就再也认不出来、也关不掉。 */
        isOwned(id) {
            if (!id) return false;
            if (this._owned.includes(id)) return true;
            return this.ownedStored().some(x => x.id === id);
        },


        _rememberOwned(id) {
            if (!id) return;
            if (!this._owned.includes(id)) this._owned.push(id);
            const list = this.ownedStored().filter(x => x.id !== id);
            list.push({ id, at: Date.now() });
            try { GM_setValue(this.OWNED_KEY, list.slice(-8)); } catch (_) {}
        },

        _forgetOwned(ids) {
            const drop = new Set(ids || []);
            const left = this.ownedStored().filter(x => !drop.has(x.id));
            try { GM_setValue(this.OWNED_KEY, left); } catch (_) {}
            this._owned = this._owned.filter(id => !drop.has(id));
        },

        async browserInfo() {
            try {
                const txt = await Utils.xhr({ url: this.base() + "/json/version", timeout: 4000 });
                return JSON.parse(txt);
            } catch (_) {
                return null;
            }
        },

        async browserConnect() {
            if (this._bws && this._bws.readyState === 1) return this._bws;
            if (this._bws) { try { this._bws.close(); } catch (_) {} }
            this._bws = null;
            const info = await this.browserInfo();
            if (!info || !info.webSocketDebuggerUrl) return null;
            this._bpending = new Map();
            this._bid = 0;
            const ws = new WebSocket(info.webSocketDebuggerUrl);
            try {
                await new Promise((resolve, reject) => {
                    const t = setTimeout(() => reject(new Error("browser ws timeout")), 6000);
                    ws.onopen = () => { clearTimeout(t); resolve(); };
                    ws.onerror = () => { clearTimeout(t); reject(new Error("browser ws error")); };
                });
            } catch (e) {
                /* 握手被拒（典型：启动参数缺 --remote-allow-origins=*）时把半成品清干净，
                   否则 _bpending 会一直留着、下次还会复用这个坏连接。 */
                try { ws.close(); } catch (_) {}
                this._bpending = null;
                throw e;
            }
            ws.onmessage = ev => {
                let m;
                try { m = JSON.parse(ev.data); } catch (_) { return; }
                const p = this._bpending && this._bpending.get(m.id);
                if (!p) return;
                this._bpending.delete(m.id);
                if (m.error) p.reject(new Error(JSON.stringify(m.error)));
                else p.resolve(m.result);
            };
            this._bws = ws;
            return ws;
        },

        bsend(method, params) {
            if (!this._bws || this._bws.readyState !== 1) return Promise.reject(new Error("browser ws not connected"));
            const mid = ++this._bid;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    if (this._bpending) this._bpending.delete(mid);
                    reject(new Error("cdp timeout: " + method));
                }, 10000);
                this._bpending.set(mid, {
                    resolve: v => { clearTimeout(timer); resolve(v); },
                    reject: e => { clearTimeout(timer); reject(e); }
                });
                try { this._bws.send(JSON.stringify({ id: mid, method, params: params || {} })); }
                catch (e) { clearTimeout(timer); reject(e); }
            });
        },

        async openSilent(url) {
            /* 最后一道闸：没拿到令牌，任何调用都开不出页。
               这样即使上层逻辑判断出错，也不会凭空多出一个标签页。 */
            const allow = this._takeAllow();
            if (!allow) {
                GM_log("🖱️ 拒绝开页：本次任务不需要 CDP（只有带锁卡/桌面专属任务才允许开标签页）");
                return null;
            }
            if (!(await this.available())) return null;
            const targetUrl = String(url || "https://rewards.bing.com/earn");
            let targetId = "";
            try {
                await this.browserConnect();
                /* background:true —— 关键就是它：后台建页，不切焦点 */
                const r = await this.bsend("Target.createTarget", { url: targetUrl, background: true });
                targetId = (r && r.targetId) || "";
            } catch (e) {
                GM_log("🖱️ 静默开页失败（browser 通道）：" + e.message);
            }
            if (!targetId) {
                GM_log("🖱️ 开不出标签页：browser 通道被拒绝。请确认启动参数含 --remote-allow-origins=*");
                return null;
            }
            this._rememberOwned(targetId);
            return await this.waitPage(targetId, targetUrl);
        },

        async waitPage(targetId, url) {
            const want = String(url || "");
            let probe = "";
            try { probe = new URL(want).host + new URL(want).pathname; } catch (_) { probe = ""; }
            for (let i = 0; i < 40; i++) {
                const list = await this.targets();
                const hit = (list || []).find(t => t.type === "page" && (
                    t.id === targetId
                    || (probe && String(t.url || "").indexOf(probe) === 0)
                ));
                if (hit && hit.webSocketDebuggerUrl) {
                    try {
                        await this.usePage(hit);
                        const st = await this.evaluate("document.readyState");
                        if (st === "complete") return hit;
                    } catch (_) {}
                }
                await Utils.delay(500);
            }
            return null;
        },

        /* 只导航「自己开的那一个」标签页：你的 rewards 页/正在看的页面一律不动。
           create:false —— 只复用已经存在的临时页，绝不新建。
           「每日活动」这类一条 DAPI 请求就能记账的任务用它，才不会偷偷开标签页。 */
        /* create 现在必须配一个 reason：只有带锁卡/桌面任务会传，
           其余调用（例如每日活动）一律 create:false —— 只复用现成页。 */
        async _ownedPage(fallbackUrl, { create = false, reason = "" } = {}) {
            const list = await this.targets();
            const mine = (list || []).find(t => t.type === "page" && this.isOwned(t.id));
            if (mine) {
                if (!this._owned.includes(mine.id)) this._owned.push(mine.id);
                return mine;
            }
            if (!create) return null;
            if (!this.grantOnce(reason)) return null;
            if (!(await this.available())) return null;
            if (this.todayDone()) return null;
            const page = await this.openSilent(fallbackUrl || "https://rewards.bing.com/earn");
            return page;
        },

        async usePage(page) {
            if (!page || !page.webSocketDebuggerUrl) return false;
            if (this._ws && this._ws.readyState === 1 && this._wsUrl === page.webSocketDebuggerUrl) return true;
            await this.connect(page.webSocketDebuggerUrl);
            return true;
        },

        async goto(page, url) {
            if (!(await this.usePage(page))) return false;
            try { await this.send("Page.enable", {}); } catch (_) {}
            try { await this.send("Page.navigate", { url: String(url) }); } catch (_) { return false; }
            for (let i = 0; i < 50; i++) {
                await Utils.delay(400);
                let st = "";
                try { st = String(await this.evaluate("document.readyState") || ""); } catch (_) { st = ""; }
                if (st === "complete") return true;
            }
            return false;
        },

        /* 真实的浏览器级搜索：整页导航 + 真鼠标点击搜索框 + 页面自带的 sj_rra 上报。
           返回 ok 只代表「确实执行了」，是否记账由服务端状态确认（不再拿端口通不通冒充成功）。 */
        async realSearch(href) {
            const url = String(href || "").trim();
            if (!/^https?:\/\//i.test(url)) return { ok: false, reason: "没有搜索地址" };
            if (!(await this.available())) return { ok: false, reason: "CDP 不可连" };
            const page = await this._ownedPage("https://rewards.bing.com/earn",
                { create: true, reason: "card-cdp" });
            if (!page) return { ok: false, reason: "开不出静默标签页" };
            if (!(await this.goto(page, url))) return { ok: false, reason: "搜索页没加载完" };
            let clicked = false;
            try {
                const raw = await this.evaluate([
                    "(function(){",
                    "  var el = document.querySelector('#sb_form_q') || document.querySelector('input[name=q]');",
                    "  if (!el) return '';",
                    "  var r = el.getBoundingClientRect();",
                    "  if (!r || r.width <= 0 || r.height <= 0) return '';",
                    "  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });",
                    "})()"
                ].join("\n"));
                const pt = raw ? JSON.parse(raw) : null;
                if (pt && pt.y > 0) {
                    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y, button: "none" });
                    await Utils.delay(120);
                    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", buttons: 1, clickCount: 1 });
                    await Utils.delay(120);
                    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", buttons: 0, clickCount: 1 });
                    clicked = true;
                }
            } catch (_) {}
            let reported = "";
            try {
                reported = String(await this.evaluate([
                    "(function(){",
                    "  try { if (typeof sj_rra === 'function') { sj_rra(location.href); return 'sj_rra'; } } catch (e) {}",
                    "  return '';",
                    "})()"
                ].join("\n")) || "");
            } catch (_) {}
            return { ok: true, clicked, reported, url };
        },

        /* 收掉自己开过的标签页（包括上一个脚本上下文遗留的）。
           only: 只关这一批 id（不给就关掉所有自己开过的）。 */
        async closeOwned(only) {
            const remembered = this.ownedStored();
            const ids = Array.isArray(only)
                ? [...new Set(only.map(x => (x && x.id) ? x.id : x).filter(Boolean))]
                : [...new Set([].concat(this._owned, remembered.map(x => x.id)))];
            this._owned = this._owned.filter(id => !ids.includes(id));
            if (!ids.length) return 0;
            let closed = 0;
            let bws = null;
            try { bws = await this.browserConnect(); } catch (_) { bws = null; }
            for (const id of ids) {
                let done = false;
                if (bws) {
                    try {
                        await this.bsend("Target.closeTarget", { targetId: id });
                        done = true;
                    } catch (_) {}
                }
                if (!done) {
                    try {
                        await new Promise((resolve, reject) => {
                            GM_xmlhttpRequest({
                                method: "GET",
                                url: this.base() + "/json/close/" + encodeURIComponent(id),
                                onload: r => resolve(r.responseText),
                                onerror: () => reject(new Error("close failed")),
                                ontimeout: () => reject(new Error("timeout")),
                                timeout: 4000
                            });
                        });
                        done = true;
                    } catch (_) {}
                }
                if (done) closed++;
            }
            this._forgetOwned(ids);
            try { if (this._bws) this._bws.close(); } catch (_) {}
            this._bws = null;
            this._bpending = null;
            return closed;
        },

        /* 只清理「很久以前遗留」的标签页，避免上下文重启后越攒越多；新开的一个都不碰。 */
        async reapOwned(maxAgeMs = 3 * 60 * 1000) {
            const now = Date.now();
            const stale = this.ownedStored()
                .filter(x => now - (Number(x.at) || 0) > maxAgeMs)
                .map(x => x.id);
            if (!stale.length) return 0;
            return await this.closeOwned(stale);
        },

        /* 找一个能用的 rewards 页。
           nav:false（默认，只读借用）——页面里只发 fetch，不改地址，用你已开着的 rewards 页也无感；
           nav:true（需要导航/点击）——必须用本脚本自己开的页，绝不把你正在看的标签页导走。 */
        async ensurePage(url, { nav = false, create = false, reason = "" } = {}) {
            const want = String(url || "https://rewards.bing.com/earn");
            if (nav) return await this._ownedPage(want, { create, reason });
            const list = await this.targets();
            if (!list) return null;
            const pages = list.filter(t => t.type === "page" && t.url && /^https:\/\/rewards\.bing\.com\//i.test(t.url));
            if (pages.length) {
                /* 优先用自己开的，其次才是你已经开着的 rewards 页 */
                return pages.find(t => this.isOwned(t.id))
                    || pages.find(t => /\/earn/i.test(t.url))
                    || pages[0];
            }
            if (!create) return null;
            if (!this.grantOnce(reason)) return null;
            if (!(await this.available())) return null;
            if (this.todayDone()) return null;
            Utils.log("🖱️", "CDP 可用，静默打开一个后台标签页（不会切走你当前的页面）…");
            const page = await this.openSilent(want);
            if (page) Utils.log("🖱️", "后台标签页已就绪（本轮用完自动关闭）");
            return page;
        },


        /* 三种失败要分开：/json/version 失败=没 CDP；WS 握手 403=缺
           --remote-allow-origins=*；都通=页面没打开或未登录。 */
        async whyNoPage() {
            const info = await this.browserInfo();
            if (!info) return "本地调试端口 " + this.PORT + " 上没有 CDP 服务";
            try {
                const ws = await this.browserConnect();
                if (!ws) return "能连上端口，但拿不到浏览器级 ws 通道";
                return "能连上端口，但打不开可用的 rewards 页";
            } catch (e) {
                const msg = String((e && e.message) || e);
                if (/ws (error|timeout)/i.test(msg)) {
                    return "端口能连，但 WebSocket 被 DevTools 拒绝：启动参数缺 --remote-allow-origins=*";
                }
                return "端口能连，但建立 ws 失败：" + msg;
            }
        },

        async connect(wsUrl) {
            if (this._ws) {
                try { this._ws.close(); } catch (_) {}
                this._ws = null;
            }
            this._pending = new Map();
            this._id = 0;
            const ws = new WebSocket(wsUrl);
            await new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error("ws timeout")), 6000);
                ws.onopen = () => { clearTimeout(t); resolve(); };
                ws.onerror = () => { clearTimeout(t); reject(new Error("ws error")); };
            });
            ws.onmessage = ev => {
                let m;
                try { m = JSON.parse(ev.data); } catch (_) { return; }
                const p = this._pending && this._pending.get(m.id);
                if (!p) return;
                this._pending.delete(m.id);
                if (m.error) p.reject(new Error(JSON.stringify(m.error)));
                else p.resolve(m.result);
            };
            this._ws = ws;
            return ws;
        },

        send(method, params) {
            if (!this._ws) return Promise.reject(new Error("ws not connected"));
            const mid = ++this._id;
            return new Promise((resolve, reject) => {
                const timer = setTimeout(() => {
                    if (this._pending) this._pending.delete(mid);
                    reject(new Error("cdp timeout: " + method));
                }, 10000);
                this._pending.set(mid, {
                    resolve: v => { clearTimeout(timer); resolve(v); },
                    reject: e => { clearTimeout(timer); reject(e); }
                });
                try { this._ws.send(JSON.stringify({ id: mid, method: method, params: params || {} })); }
                catch (e) { clearTimeout(timer); reject(e); }
            });
        },

        close() {
            try { if (this._ws) this._ws.close(); } catch (_) {}
            this._ws = null;
            this._pending = null;
        },

        async evaluate(expression) {
            const r = await this.send("Runtime.evaluate", { expression: expression, returnByValue: true, userGesture: true });
            return r && r.result ? r.result.value : undefined;
        },

        /* UA 只有 CDP 的 Network.setUserAgentOverride 能真正改：
           GM_xhr / fetch 里设 user-agent 会被浏览器丢弃。
           RewardsApp 专属卡只认桌面应用 UA，普通 Edge UA 会「受理但不记账」。 */
        _uaOverrideAt: 0,

        async setAppUA(on = true) {
            try {
                if (on) {
                    await this.send("Network.enable", {});
                    await this.send("Network.setUserAgentOverride", {
                        userAgent: RewardsAuto.ua.rewardsApp,
                        acceptLanguage: "zh-CN,zh;q=0.9,en;q=0.8",
                        platform: "Win32"
                    });
                    await this.send("Network.setExtraHTTPHeaders", {
                        headers: { "x-rewards-source": "msrewards-desktop" }
                    });
                    this._uaOverrideAt = Date.now();
                } else {
                    /* 恢复成浏览器自己的 UA：传空字符串即清除覆盖 */
                    await this.send("Network.setUserAgentOverride", { userAgent: "" });
                    await this.send("Network.setExtraHTTPHeaders", { headers: {} });
                    this._uaOverrideAt = 0;
                }
                return true;
            } catch (_) {
                return false;
            }
        },

        async fetchPageText(url) {
            const expr = `(async function(){
                try {
                    var r = await fetch(${JSON.stringify(url)}, { credentials: "include", redirect: "follow" });
                    var t = await r.text();
                    return JSON.stringify({ ok: r.ok, status: r.status, text: t.slice(0, 900000) });
                } catch (e) {
                    return JSON.stringify({ ok: false, status: 0, text: String(e && e.message || e) });
                }
            })()`;
            let raw;
            try {
                const r = await this.send("Runtime.evaluate", {
                    expression: expr, awaitPromise: true, returnByValue: true, userGesture: true
                });
                raw = r && r.result ? r.result.value : "";
            } catch (e) {
                return null;
            }
            try {
                const j = JSON.parse(raw || "{}");
                if (!j.ok || !j.text) return null;
                return String(j.text);
            } catch (_) { return null; }
        },

        async claimInPage(pageUrl, headers, body) {
            const expr = `(async function(){
                try {
                    var r = await fetch(${JSON.stringify(pageUrl)}, {
                        method: "POST",
                        credentials: "include",
                        headers: ${JSON.stringify(headers)},
                        body: ${JSON.stringify(body)}
                    });
                    var t = await r.text();
                    return JSON.stringify({ ok: true, status: r.status, text: t.slice(0, 2000) });
                } catch (e) {
                    return JSON.stringify({ ok: false, status: 0, text: String(e && e.message || e) });
                }
            })()`;

            let raw;
            try {
                const r = await this.send("Runtime.evaluate", {
                    expression: expr,
                    awaitPromise: true,
                    returnByValue: true,
                    userGesture: true
                });
                raw = r && r.result ? r.result.value : "";
            } catch (e) {
                return { accepted: false, status: 0, text: `CDP 求值失败：${e.message}` };
            }
            try {
                const j = JSON.parse(raw || "{}");
                return { accepted: j.ok && j.status >= 200 && j.status < 300, status: j.status || 0, text: String(j.text || "") };
            } catch (_) {
                return { accepted: false, status: 0, text: String(raw || "页面无返回") };
            }
        },

        async pendingCards() {
            const expr = [
                "(function(){",
                "  var out = [];",
                "  var sel = 'a[href*=\"PUBL=RewardsDO\"], a[href*=\"form=ML2\"]';",
                "  var nodes = document.querySelectorAll(sel);",
                "  for (var i = 0; i < nodes.length; i++) {",
                "    var a = nodes[i];",
                "    var txt = (a.innerText || '').replace(/\\s+/g, ' ').trim();",
                "    if (/已完成/.test(txt)) continue;",
                "    if (!/bing\\.com\\/search/i.test(a.href)) continue;",
                "    out.push({ title: (txt.split(' ')[0] || txt).slice(0, 20), href: a.href });",
                "  }",
                "  return JSON.stringify(out);",
                "})()"
            ].join("\n");
            const raw = await this.evaluate(expr);
            try { return JSON.parse(raw || "[]"); } catch (_) { return []; }
        },

        async clickCard(href) {
            const h = JSON.stringify(href);
            /* 后台标签页 document.hidden=true，getBoundingClientRect 全是 0×0，
               所以用 element.click() 不用坐标。卡片 <a> 都带 target="_blank"，先摘掉，
               否则每张卡都会另开一个不受管的标签页。 */
            const clickExpr = [
                "(function(){",
                "  var sel = 'a[href*=\"PUBL=RewardsDO\"], a[href*=\"form=ML2\"]';",
                "  var nodes = document.querySelectorAll(sel);",
                "  var target = null;",
                "  for (var i = 0; i < nodes.length; i++) { if (nodes[i].href === " + h + ") { target = nodes[i]; break; } }",
                "  if (!target) return 'nf';",
                "  try {",
                "    target.scrollIntoView({ block: 'center' });",
                "    target.removeAttribute('target');",
                "    target.click();",
                "    return 'clicked';",
                "  } catch (e) { return 'err:' + (e && e.message || e); }",
                "})()"
            ].join("\n");
            let clicked = null;
            try { clicked = await this.evaluate(clickExpr); } catch (_) { clicked = null; }
            if (clicked === "clicked") {
                await Utils.delay(600);
                return true;
            }
            if (clicked === "nf") return false;

            /* 兜底：click() 被页面拦下时再试坐标点击，但必须先确认真实盒子非 0×0，
               否则 (0,0) 的点击毫无意义 —— 宁可报失败，也不谎报成功。 */
            const posExpr = [
                "(function(){",
                "  var sel = 'a[href*=\"PUBL=RewardsDO\"], a[href*=\"form=ML2\"]';",
                "  var nodes = document.querySelectorAll(sel);",
                "  var target = null;",
                "  for (var i = 0; i < nodes.length; i++) { if (nodes[i].href === " + h + ") { target = nodes[i]; break; } }",
                "  if (!target) return 'nf';",
                "  try { target.removeAttribute('target'); } catch (e) {}",
                "  target.scrollIntoView({ block: 'center' });",
                "  var r = target.getBoundingClientRect();",
                "  if (!r || r.width <= 0 || r.height <= 0) return 'nobox';",
                "  return JSON.stringify({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });",
                "})()"
            ].join("\n");
            let pos = await this.evaluate(posExpr);
            if (pos === "nf" || pos === "nobox") {
                /* 后台页没有布局，坐标点击没有意义 —— 明确失败，不再假成功。 */
                return false;
            }
            let pt = null;
            try { pt = JSON.parse(pos); } catch (_) { return false; }
            await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pt.x, y: pt.y, button: "none" });
            await Utils.delay(250);
            await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x: pt.x, y: pt.y, button: "left", buttons: 1, clickCount: 1 });
            await Utils.delay(250);
            await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pt.x, y: pt.y, button: "left", buttons: 0, clickCount: 1 });
            return true;
        },
        async progress() {
            const expr = [
                "(function(){",
                "  var done = 0, total = 0;",
                "  var sel = 'a[href*=\"PUBL=RewardsDO\"], a[href*=\"form=ML2\"]';",
                "  var nodes = document.querySelectorAll(sel);",
                "  for (var i = 0; i < nodes.length; i++) {",
                "    total++;",
                "    if (/已完成/.test(nodes[i].innerText || '')) done++;",
                "  }",
                "  return JSON.stringify({ done: done, total: total });",
                "})()"
            ].join("\n");
            const raw = await this.evaluate(expr);
            try { return JSON.parse(raw || "{}"); } catch (_) { return { done: 0, total: 0 }; }
        },

        async claimAll(maxCards, { create = true } = {}) {
            const cap = Number(maxCards) || 6;
            if (this.todayDone()) {
                Utils.log("🖱️", "今天需要 CDP 的任务都已处理完，本轮不再连接浏览器调试端口");
                return { ok: true, handled: 0, done: 0, total: 0, skipped: true };
            }
            if (!(await this.available())) {
                const reason = "本地调试端口 " + this.PORT + " 上没有 CDP 服务";
                this.warn(reason);
                return { ok: false, reason: reason };
            }
            /* 这里要整页导航（点卡会跳搜索页、之后还得回 earn），必须用自己开的标签页，
               否则会把你正在看的 rewards 页导走。 */
            let page = await this.ensurePage("https://rewards.bing.com/earn",
                { nav: true, create, reason: "card-cdp" });
            if (!page) {
                if (!create) {
                    /* 只复用模式：没有现成临时页不算失败，交给 DAPI / 后台通道。 */
                    Utils.log("🖱️", "无需 CDP 的卡片，跳过静默开页（只有现成页面才做真实点击）");
                    return { ok: true, handled: 0, done: 0, total: 0, skipped: true };
                }
                /* 开不出页时把真正的原因查出来再报，不要笼统说「拿不到 rewards 页」。 */
                const why = await this.whyNoPage();
                this.warn(why);
                return { ok: false, reason: why };
            }
            const result = { ok: true, handled: 0, done: 0, total: 0 };
            try {
                await this.usePage(page);
                const before = await this.progress();
                result.done = before.done || 0;
                result.total = before.total || 0;

                const logged = await this.evaluate("document.cookie.indexOf('MUID') >= 0");
                if (!logged) {
                    this.warn("窗口里没有登录 rewards（该配置目录需要单独登录一次）");
                    return { ok: false, reason: "CDP 窗口未登录" };
                }

                Utils.log("🖱️", "CDP 已连接：当前已完成 " + before.done + "/" + before.total);
                const cards = await this.pendingCards();
                if (cards.length === 0) {
                    Utils.log("✅", "CDP：没有待处理的应用搜索卡");
                    return result;
                }
                Utils.log("🖱️", "CDP：发现 " + cards.length + " 张待处理卡（用真实点击完成）");

                /* 点一张卡会整页跳到搜索页，必须回到 earn 页才能找下一张。
                   以前这里直接复用旧 page 对象，点完第一张后 DOM 里已经没有卡片了。 */
                for (const card of cards.slice(0, cap)) {
                    if (!(await this.usePage(page))) break;
                    if (!(await this.goto(page, "https://rewards.bing.com/earn"))) {
                        Utils.log("🟡", "  回到 earn 页失败，剩余卡片留给下一轮");
                        break;
                    }
                    const ok = await this.clickCard(card.href);
                    if (ok) {
                        result.handled++;
                        Utils.log("🖱️", "  已点击：" + card.title);
                    }
                    await Utils.delay(8000);
                }

                for (let i = 0; i < 12; i++) {
                    await Utils.delay(10000);
                    if (!(await this.goto(page, "https://rewards.bing.com/earn"))) break;
                    const now = await this.progress();
                    result.done = now.done || 0;
                    result.total = now.total || 0;
                    if (result.handled > 0 && result.done >= result.total) break;
                }
                return result;
            } catch (e) {
                return { ok: false, reason: e.message };
            } finally {
                /* 用完就关：以前这里只断开 ws，标签页要等整轮结束才由
                   runAll 里的 closeOwned() 收走 —— 一轮几十分钟，那个临时页就一直挂着。
                   现在这张页一处理完立刻关掉，不留到轮末。 */
                const owned = page && page.id ? [page.id] : [];
                this.close();
                if (owned.length) {
                    try {
                        const closed = await this.closeOwned(owned);
                        if (closed > 0) Utils.log("🖱️", "  临时标签页已用完，立即关闭");
                    } catch (_) {}
                }
            }
        }
    };

    const BrowserEnv = {
        info() {
            if (this._cache) return this._cache;
            let ua = "";
            try {
                ua = (typeof navigator !== "undefined" && navigator && navigator.userAgent) ? String(navigator.userAgent) : "";
            } catch (_) { ua = ""; }
            if (!ua) {
                try {
                    const saved = String(GM_getValue("Config.uaEdge", "") || "");
                    if (saved) ua = saved;
                } catch (_) {}
            }
            let name = "未知";
            if (/Edg\//.test(ua)) name = "Edge";
            else if (/EdgA\//.test(ua)) name = "Edge(App)";
            else if (/OPR\//.test(ua)) name = "Opera";
            else if (/Firefox\/|FxiOS\//.test(ua)) name = "Firefox";
            else if (/Chrome\//.test(ua)) name = "Chrome";
            else if (/Safari\//.test(ua)) name = "Safari";
            const vm = ua.match(/(?:Edg|EdgA|Chrome|Firefox)\/(\d+)/);
            const major = vm ? Number(vm[1]) : 0;
            const extOriginRisky = name === "Edge" && major >= 152;
            this._cache = { ua, name, major, extOriginRisky };
            return this._cache;
        },

        /* 通道优先级：先试不碰浏览器的通道，最后才用 CDP 页面通道。
           以前 "page" 排第一 —— 每张卡交卷前都先想办法拿一个 CDP 页面，
           没有就静默开一个，于是「每日活动」也在开标签页。 */
        channelOrder() {
            return ["proxy", "xhr", "page"];
        },
        summary() {
            const i = this.info();
            return `${i.name}${i.major ? " " + i.major : ""}`;
        }
    };

    const ActionMap = {
        KEY_MAP: "Config.actionMap",
        KEY_BUILD: "Config.actionBuild",
        KEY_DPL: "Config.actionDpl",
        FALLBACK: {
            reportActivity: "707e6eb15bdfdd5fba193f0a77e934f7018faf87ce",
            reportClaimAllPoints: "00491296f1d668ad46b65342c95cb9d72a62c1fa9d"
        },
        REQUIRED: ["reportActivity"],

        _cachedDpl() { return String(GM_getValue("Config.dpl", "") || ""); },

        _readMap() {
            const raw = GM_getValue(this.KEY_MAP, "");
            if (!raw) return {};
            try {
                const j = JSON.parse(raw);
                return (j && typeof j === "object") ? j : {};
            } catch (_) { return {}; }
        },

        clear() {
            GM_setValue(this.KEY_MAP, "");
            GM_setValue(this.KEY_BUILD, "");
            GM_setValue(this.KEY_DPL, "");
        },

        get(name) {
            const map = this._readMap();
            const cached = map[name];
            return cached || this.FALLBACK[name] || "";
        },

        async ensure(pages, opts = {}) {
            const dplNow = this._cachedDpl();
            const cachedMap = this._readMap();
            const cachedDpl = GM_getValue(this.KEY_DPL, "");
            if (this.REQUIRED.every(k => cachedMap[k]) && cachedDpl && (!dplNow || cachedDpl === dplNow)) {
                return { ids: cachedMap, dpl: cachedDpl, fresh: false };
            }
            const budgetMs = Number(opts.budgetMs) || ACTION_SCAN_BUDGET;
            const maxFetch = Number(opts.maxFetch) || ACTION_SCAN_MAX;
            const deadline = Date.now() + budgetMs;

            let combined = (pages || []).filter(Boolean).join("\n");
            if (!combined) {
                try {
                    combined = [(await Utils.xhr({ url: "https://rewards.bing.com/dashboard" })),
                        (await Utils.xhr({ url: "https://rewards.bing.com/earn" }))]
                        .filter(Boolean).join("\n");
                } catch (_) { combined = ""; }
            }
            if (!combined) {
                const ids = Object.assign({}, this.FALLBACK, cachedMap);
                return { ids, dpl: cachedDpl, fresh: false };
            }
            const dpl = dplNow || (combined.match(/[?&](?:amp;)?dpl=([A-Za-z0-9._-]+)/i) || [])[1] || "";

            const queue = [];
            const seen = new Set();
            const push = p => { if (p && !seen.has(p)) { seen.add(p); queue.push(p); } };
            const rel = new Set();
            for (const m of combined.matchAll(/(?:\/_next\/)?(static\/(?:chunks|immutable|media)\/[^\s"'\\]+?\.js)/g)) {
                rel.add("/_next/" + m[1]);
            }
            [...rel].sort((a, b) => ((/(dashboard|earn|page|layout)/i.test(a) ? 0 : 1) - (/(dashboard|earn|page|layout)/i.test(b) ? 0 : 1)))
                .forEach(push);
            const addDynamic = text => {
                for (const m of String(text || "").matchAll(/\b(\d{2,6}):"([a-z0-9_-]{8,})"/g)) {
                    push(`/_next/static/chunks/${m[1]}-${m[2]}.js`);
                    push(`/_next/static/chunks/${m[1]}.${m[2]}.js`);
                }
            };
            addDynamic(combined);

            const hex = "[a-f0-9]{40,64}";

            const q = '\\\\?"';
            const reCreate = new RegExp(`createServerReference\\s*\\)?\\s*\\(\\s*${q}(${hex})${q}([\\s\\S]{0,800}?)\\)`, "g");
            const reRegister = new RegExp(`registerServerReference\\s*\\)?\\s*\\([^,]+,\\s*${q}(${hex})${q}([\\s\\S]{0,800}?)\\)`, "g");
            const SKIP = ["callServer", "findSourceMapURL", "encodeFormAction", "default"];
            const reName = new RegExp(`${q}([A-Za-z_$][\\w$]*)${q}`, "g");
            const scan = (js, map) => {
                for (const re of [reCreate, reRegister]) {
                    re.lastIndex = 0;
                    let m;
                    while ((m = re.exec(js)) !== null) {
                        const names = [...(m[2] || "").matchAll(reName)];
                        const list = names.map(x => x[1]).filter(n => n.length > 3 && !SKIP.includes(n));
                        const name = list[list.length - 1];
                        if (name && !map[name]) map[name] = m[1];
                    }
                }
            };

            const map = Object.assign({}, cachedMap);
            let fetched = 0;
            while (queue.length && fetched < maxFetch && Date.now() < deadline) {
                const path = queue.shift();
                fetched++;
                try {
                    const js = await Utils.xhr({ url: "https://rewards.bing.com" + path, timeout: 8000 });
                    if (!js) continue;
                    scan(js, map);
                    if (!this.REQUIRED.every(k => map[k])) addDynamic(js);
                    if (this.REQUIRED.every(k => map[k]) && map.reportClaimAllPoints) break;
                } catch (_) {}
            }

            const merged = Object.assign({}, this.FALLBACK, map);
            const ok = Object.keys(map).length > 0;
            if (ok) {
                GM_setValue(this.KEY_MAP, JSON.stringify(map));
                GM_setValue(this.KEY_DPL, dpl || dplNow || "");
                GM_setValue(this.KEY_BUILD, dpl || "");
                Utils.log("🧩", `服务端标识表已更新（部署 ${dpl || "未知"}，动作 ${Object.keys(map).length} 个`
                    + `${map.reportClaimAllPoints ? "，含领取" : "，缺领取用兜底"}）`);
                return { ids: merged, dpl: dpl || dplNow, fresh: true };
            }
            Utils.log("🟡", `未能从页面分包中提取服务端标识（扫了 ${fetched} 个），使用缓存/兜底标识`);
            return { ids: merged, dpl: dpl || dplNow, fresh: false };
        }
    };

    const ClaimPoints = {
        KEY_VARIANT: "Config.claimVariant",
        KEY_EMPTY_AT: "Config.claimEmptyAt",
        EMPTY_TTL: 15 * 60 * 1000,

        /* "pointClaim"（待领对象）与 "PointClaim"（i18n 字典）必须严格区分：
           正则带 /i 会先命中字典，读不到金额。 */
        _CLAIM_KEY: /"pointClaim"\s*:\s*(null|\{|\[)/,

        parse(html) {
            const raw = String(html || "");
            if (!raw) return { known: false, has: false, amount: 0 };
            const clean = raw.replace(/\\"/g, '"');
            const m = clean.match(this._CLAIM_KEY);
            if (m) {
                if (m[1] === "null") return { known: true, has: false, amount: 0, source: "pointClaim" };
                const amount = this._amount(clean);
                if (amount > 0) return { known: true, has: true, amount, source: "pointClaim" };
                const badge = this._badge(clean);
                if (badge > 0) return { known: true, has: true, amount: badge, source: "badge" };
                /* 标记在、两处金额都读成 0：这是「读不到」，不是「确实为 0」。
                   uncertain 必须让调用方继续尝试领取，否则页面结构一变就永远领不出来。 */
                return {
                    known: true, has: false, amount: 0, source: "pointClaim-empty", uncertain: true,
                    snippet: this._snippet(clean)
                };
            }
            const badge = this._badge(clean);
            if (badge >= 0) return { known: true, has: badge > 0, amount: badge, source: "badge" };
            return { known: false, has: false, amount: 0 };
        },

        /* 页面徽标上的「可领取 N」数字，仅用于 pointClaim 金额读到 0 时的兜底确认。
           先按元素紧邻匹配，再退化为纯文本匹配，避免把标签属性里的数字当成积分。
           返回 -1 表示页面上根本找不到徽标。 */
        _badge(html) {
            const clean = String(html || "").replace(/\\"/g, '"');
            /* alt 和数字之间普遍隔着一两个标签（<span>/<div>），原来只允许空白，
               真实页面必然漏判 —— 这里放开到 200 字符内任意内容。 */
            const near = clean.match(/alt="(?:可领取|待领取)"[^>]*>[\s\S]{0,200}?(\d[\d,]*)/i);
            if (near) return parseInt(String(near[1]).replace(/,/g, ""), 10) || 0;
            const text = clean.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
            /* 页面文案是「可领取」，原来只认「待领取」 */
            const m1 = text.match(/(?:可领取|待领取|to claim)\s*[:：]?\s*([\d,]+)/i);
            if (m1) return parseInt(String(m1[1]).replace(/,/g, ""), 10) || 0;
            const m2 = text.match(/([\d,]+)\s*(?:可领取|待领取)/i);
            if (m2) return parseInt(String(m2[1]).replace(/,/g, ""), 10) || 0;
            return -1;
        },

        _balance(html) {
            const clean = String(html || "").replace(/\\"/g, '"');
            /* dashboard 有的版本没有 "balance"，只有 availablePoints；读不到余额
               会让「领取后余额差值」恒为 0，误判成没领到。
               金额要容忍千分位（"56,036"）：只写 (\d+) 会被逗号截成 56，
               那样「领取前后余额差」就等于在拿假数字做减法。 */
            const m = clean.match(/"(?:balance|availablePoints)"\s*:\s*"?([\d,]+)"?/i);
            return m ? (parseInt(String(m[1]).replace(/,/g, ""), 10) || 0) : 0;
        },

        /* 从 pointClaim 起点按花括号配平截出这一个对象。
           原来固定截 1200 字符：结构一变（字段增多/嵌套变深）金额就被切在窗口外，
           于是「明明有积分却读成 0」。 */
        _braceWindow(text, from) {
            const open = text.indexOf("{", from);
            const arr = text.indexOf("[", from);
            const start = (open < 0) ? arr : ((arr >= 0 && arr < open) ? arr : open);
            if (start < 0) return text.slice(from, from + 1200);
            const [o, c] = text[start] === "{" ? ["{", "}"] : ["[", "]"];
            let depth = 0;
            for (let i = start; i < text.length && i < start + 6000; i++) {
                if (text[i] === o) depth++;
                else if (text[i] === c) {
                    depth--;
                    if (depth === 0) return text.slice(start, i + 1);
                }
            }
            return text.slice(from, from + 1200);
        },

        _amount(html) {
            const clean = String(html || "").replace(/\\"/g, '"');
            /* 用与小写 key 精确匹配的地址，别用 /i —— 否则会从 PointClaim 文案字典里取数 */
            const at = clean.search(/"pointClaim"\s*:/);
            if (at < 0) return 0;
            const win = this._braceWindow(clean, at);
            /* 只认「待领额」语义的字段，按优先级取第一个命中值。
               这里以前是对 8 个字段（points/claimablePoints/availablePoints/
               pendingPoints/amount/totalPoints/value）**取最大值**，于是把
               availablePoints（当前余额，如 18602）当成待领额，日志就写出
               「已自动领取 9334 积分（当前余额 18602）」——领了 9 分，播报 9334。
               现在强字段全都不命中就返回 0，由调用方按「读不到」处理（uncertain），
               宁可让它再试一次，也不报一个假的数字。 */
            const strong = ["claimablePoints", "claimable", "pendingPoints",
                            "claimableAmount", "pendingAmount"];
            for (const key of strong) {
                const m = win.match(new RegExp('"' + key + '"\\s*:\\s*"?(-?\\d+)"?', "i"));
                if (m) {
                    const v = parseInt(m[1], 10);
                    if (Number.isFinite(v) && v > 0) return v;
                }
            }
            /* 命名变体兜底：只认 claimable* / pending* 开头的字段，同样不取最大值 */
            const re2 = /"(claimable[A-Za-z]*|pending[A-Za-z]*)"\s*:\s*"?(-?\d+)"?/gi;
            let m2;
            while ((m2 = re2.exec(win)) !== null) {
                const v = parseInt(m2[2], 10);
                if (Number.isFinite(v) && v > 0) return v;
            }
            /* 最后才考虑裸字段 points，且必须确认这个对象里没有余额/累计语义的字段 ——
               有那些字段说明 objects 是「账户摘要」，points 极可能是余额而不是待领额。 */
            if (!/"(availablePoints|totalPoints|value|redeemablePoints)"\s*:/.test(win)) {
                const m3 = win.match(/"points"\s*:\s*"?(-?\d+)"?/i);
                if (m3) {
                    const v = parseInt(m3[1], 10);
                    if (Number.isFinite(v) && v > 0) return v;
                }
            }
            return 0;
        },

        /* pointClaim 原文（压成一行），解析失败时写进日志：
           下次再报「金额 0」就能直接看出是字段名变了，还是整页压根没登录。
           同样只认小写 key：抓错了会显示一大段 CategoryNames 文案，反而看不出重点。 */
        _snippet(html) {
            const clean = String(html || "").replace(/\\"/g, '"').replace(/\s+/g, " ");
            const at = clean.search(/"pointClaim"\s*:/);
            return at < 0 ? "" : clean.slice(at, at + 260);
        },

        _request(actionMap) {
            const id = (actionMap && actionMap.reportClaimAllPoints) || ActionMap.FALLBACK.reportClaimAllPoints;
            const dpl = (actionMap && actionMap.dpl) || RewardsAuto._dpl || GM_getValue("Config.dpl", "");
            return {
                url: "https://rewards.bing.com/earn",
                headers: {
                    "content-type": "text/plain;charset=UTF-8",
                    "next-action": id,
                    "next-router-state-tree": Utils.routerStateTree("earn"),
                    "referer": "https://rewards.bing.com/earn",
                    "accept": "text/x-component",
                    "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                    "origin": "https://rewards.bing.com",
                    ...(dpl ? { "x-deployment-id": dpl } : {}),
                    "user-agent": RewardsAuto.ua.pc
                },
                body: "[]"
            };
        },

        async _sendOnce(req) {
            /* stopOnFalse：领取接口对空池回 200+false，这已经是最终答案，
               不必再换通道重问（以前会白打 2~3 发请求）。 */
            return await API.postAction(
                { url: req.url, headers: req.headers, data: req.body },
                { savedKey: this.KEY_VARIANT, stopOnFalse: true }
            );
        },

        async _cdpPage() {
            return await API._anyRewardsPage();
        },

        /* 读 dashboard / earn 页面：领取出问题时靠它回读证据。
           viaCdp 为 true 时优先在 CDP 页面里同源 fetch（拿到的才是登录态页面），
           失败再退回脚本自己的后台 xhr。 */
        async _readPage(url, { viaCdp = false } = {}) {
            if (viaCdp) {
                try {
                    const page = await this._cdpPage();
                    if (page) {
                        if (!CDP._ws || CDP._ws.readyState !== 1) await CDP.connect(page.webSocketDebuggerUrl);
                        const html = await CDP.fetchPageText(url);
                        if (html) return html;
                    }
                } catch (_) {}
            }
            try { return await Utils.xhr({ url }) || ""; } catch (_) { return ""; }
        },

        /* 没领成时的人话原因：把「通道根本没应答」「服务端拒绝」「返回认不出来」分开，
           别再一句话都算成「通道被浏览器拒绝」。 */
        _whyNotAccepted(sent) {
            const tried = (sent && sent.tried) ? sent.tried.join(" ") : "";
            const status = sent ? (Number(sent.status) || 0) : 0;
            if (!sent || !sent.reached) {
                return `领取通道没有应答（${tried || "无可用通道"}）`;
            }
            return `领取通道返回 HTTP ${status}（${tried}）`;
        },

        /* 到账证据按可信度：余额涨了 > 待领池清空 > 待领金额变小。
           2xx + false = 接口明确回答「没有可领」，页面也显示无金额时算成功。 */
        async run({ name = "领取积分" } = {}) {
            const out = {
                claimed: 0, before: 0, after: 0, empty: false, variant: "", reason: "",
                /* claimed 的来源：balance=余额真的涨了（硬证据）/ pool=按页面待领额推算
                   （余额差读不到时的估算，播报不能说成「已入账 N 分」） */
                claimedFrom: "",
                uncertain: false, settled: false, nothingToClaim: false, denied: false,
                verdict: "", reached: false
            };
            let dashHtml = "";
            try {
                if (await CDP.available()) {
                    const page = await this._cdpPage();
                    if (page) {
                        if (!CDP._ws || CDP._ws.readyState !== 1) await CDP.connect(page.webSocketDebuggerUrl);
                        dashHtml = await CDP.fetchPageText("https://rewards.bing.com/dashboard") || "";
                    }
                }
            } catch (_) { dashHtml = ""; }
            if (!dashHtml) {
                try { dashHtml = await Utils.xhr({ url: "https://rewards.bing.com/dashboard" }); } catch (_) { dashHtml = ""; }
            }

            const pool = this.parse(dashHtml);
            out.before = this._balance(dashHtml);
            out.uncertain = !!pool.uncertain;
            if (!pool.known) {
                out.reason = "读不到待领池标记（页面可能是登录页或结构已变）";
                return out;
            }
            /* 待领就是 0：这是成功态（没有待领 = 不需要领 = 已领完），
               不该进「未成功」，也不该每轮都去打一次领取接口。 */
            if (!pool.has && !pool.uncertain) {
                const last = Number(GM_getValue(this.KEY_EMPTY_AT, 0)) || 0;
                out.empty = true;
                out.settled = true;
                out.nothingToClaim = true;
                out.reason = Date.now() - last < this.EMPTY_TTL
                    ? "待领为 0（15 分钟内已确认过）"
                    : "待领为 0，无需领取";
                if (Date.now() - last >= this.EMPTY_TTL) GM_setValue(this.KEY_EMPTY_AT, Date.now());
                return out;
            }
            /* 关键判定：pool.has 只代表「解析器看见了金额」。uncertain（标记在、金额读 0）
               说明的是「读不到」，不是「没有」。领取接口本身幂等，空池调用没有副作用，
               所以读不准时先打一发，再用服务端回答 + 回读页面一起定性。 */
            if (pool.uncertain) {
                Utils.log("🔍", "待领池标记存在但解析不出金额，改为直接发领取请求再回读判定"
                    + `（pointClaim 片段：${pool.snippet || "无"}）`);
            }
            GM_setValue(this.KEY_EMPTY_AT, 0);

            const actionMap = await ActionMap.ensure([dashHtml]);
            const req = this._request(actionMap);
            const sent = await this._sendOnce(req);
            out.reached = !!sent.reached;
            out.verdict = sent.verdict || (sent.ok ? "true" : "unknown");
            /* 服务端 2xx + false：请求确实到了服务端，它明确回答「没有可领的」。
               这不是通道失败（原来就是在这里误报「三种通道都没受理」）。 */
            const denied = !sent.ok && out.reached && out.verdict === "false";
            /* 只有「服务端真的回过话」才记通道名：通道全挂时留空，
               收尾通知才会把它归到「通道被拒」而不是「已受理待复核」。 */
            out.variant = (sent.ok || denied) ? (sent.variant || "") : "";
            if (!sent.ok && !denied) {
                out.reason = this._whyNotAccepted(sent);
                return out;
            }

            /* 回读证据：earn 页看余额，dashboard 看待领池 */
            await Utils.delay(sent.ok ? 1200 : 900);
            const afterHtml = await this._readPage("https://rewards.bing.com/earn", { viaCdp: sent.variant === "page" });
            out.after = this._balance(afterHtml);
            out.claimed = (out.before > 0 && out.after > out.before) ? (out.after - out.before) : 0;
            if (out.claimed > 0) out.claimedFrom = "balance";

            await Utils.delay(2200);
            const again = await this._readPage("https://rewards.bing.com/dashboard", { viaCdp: sent.variant === "page" });
            const later = this._balance(again);
            if (out.before > 0 && later > out.before) {
                out.after = later;
                out.claimed = later - out.before;
                out.claimedFrom = "balance";
            }
            if (out.claimed > 0) {
                out.reason = "";
                return out;
            }

            const poolAgain = this.parse(again);
            /* uncertain 的「没有金额」和「池子清空」长得一样，必须分开：
               池子清空是硬证据，读不准只能算待复核。 */
            const poolNowEmpty = poolAgain.known && !poolAgain.has && !poolAgain.uncertain;
            const poolStillHas = poolAgain.known && poolAgain.has && poolAgain.amount > 0;

            if (poolNowEmpty) {
                out.claimed = Math.max(pool.amount || 0, 0);
                if (out.claimed > 0) out.claimedFrom = "pool";
                out.empty = true;
                out.settled = true;
                /* 只有「服务端回 false 且金额本来就 0」才算「本来就没有待领」；
                   服务端回 true = 它确实领了，金额读不到也按已领取处理。 */
                out.nothingToClaim = out.claimed <= 0 && denied;
                out.reason = out.claimed > 0
                    ? "已受理，待领池已清空（余额差读不到，按页面金额计）"
                    : (denied ? "待领为 0（服务端回 false，回读也是空池）" : "已领取，待领池已清空");
                return out;
            }
            if (pool.amount > 0 && poolStillHas && poolAgain.amount < pool.amount) {
                out.claimed = pool.amount - poolAgain.amount;
                if (out.claimed > 0) out.claimedFrom = "pool";
                out.reason = "已受理，待领金额下降（余额差读不到）";
                return out;
            }
            if (denied) {
                /* 页面一开始就读不出可领金额、回读也没有可领金额 → 两边一致：确实没有待领 */
                if (!(pool.amount > 0) && !poolStillHas) {
                    out.empty = true;
                    out.settled = true;
                    out.nothingToClaim = true;
                    out.reason = "待领为 0（服务端回 false，页面也无可领金额）";
                    return out;
                }
                /* 页面明明白白写着可领取 N，服务端却回 false：这是真的没领成，
                   不能算「待领为 0」，也不能算已受理。 */
                out.denied = true;
                out.reason = `服务端拒绝了领取请求（页面可领取 ${pool.amount}）`;
                return out;
            }
            out.reason = pool.amount > 0
                ? `已受理但余额未变（页面可领取 ${pool.amount}）`
                : "已受理，但金额与余额都读不到，无法确认到账；下一轮再复核";
            return out;
        }
    };

    /* 搜索受限保护（v2）。旧版把「两轮进入时的进度快照没变」直接当成限流证据，
       一旦命中就整天 return：不搜索 → 进度永远不变 → 永远命中，当天彻底锁死；
       而本轮一次都没搜（预算被前面的任务吃掉）也会被算成「没记账」。
       新版只认「本轮真的搜了却没记账」，命中后改为限时冷却 + 到期自动重试。 */
    const SEARCH_GUARD = {
        STREAK_LIMIT: 3,                        // 连续几轮真实搜索全未记账才算限流
        MIN_ATTEMPTS: 3,                        // 少于这么多次搜索的轮次不构成证据
        COOLDOWN_MS: 30 * 60 * 1000,            // 首次冷却 30 分钟
        COOLDOWN_MAX_MS: 4 * 60 * 60 * 1000,    // 连续命中时翻倍递增，上限 4 小时
    };

    const API = {

        async tokenRequest(params) {
            const body = Object.entries(params)
                .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
                .join("&");
            let res;
            try {
                res = await new Promise((resolve, reject) => {
                    GM_xmlhttpRequest({
                        method: "POST",
                        url: "https://login.live.com/oauth20_token.srf",
                        headers: { "Content-Type": "application/x-www-form-urlencoded" },
                        data: body,
                        timeout: 20000,
                        onload: r => resolve(r),
                        onerror: e => reject(new Error((e && e.error) || "网络错误")),
                        ontimeout: () => reject(new Error("请求超时")),
                    });
                });
            } catch (e) {
                return { ok: false, status: 0, error: "network", description: e.message };
            }
            let json = null;
            try { json = JSON.parse(res.responseText || ""); } catch (_) {}
            if (json && json.access_token && json.refresh_token) {
                return { ok: true, status: res.status, json };
            }
            const error = (json && json.error) || `HTTP ${res.status}`;
            const description = (json && (json.error_description || json.error_codes))
                || String(res.responseText || "").slice(0, 200);
            return { ok: false, status: res.status, error: String(error), description: String(description) };
        },

        applyToken(data) {
            GM_setValue("Config.token", data.refresh_token);
            GM_setValue("Config.tokenTime", Utils.getTimestamp());
            GM_setValue("Config.accessToken", data.access_token);
            GM_setValue("Config.accessTokenTime", Date.now());
            RewardsAuto.state.token = data.access_token;
        },

        async refreshWithToken(refreshToken) {
            return await this.tokenRequest({
                client_id: CLIENT_ID,
                refresh_token: refreshToken,
                scope: TOKEN_SCOPE,
                grant_type: "REFRESH_TOKEN",
            });
        },

        async withTokenRetry(requestFn) {
            let token = RewardsAuto.state.token;
            if (!token) return null;
            try {
                return await requestFn(token);
            } catch (e) {
                if (e.message && e.message.includes("401")) {
                    Utils.log("🟡", "access_token 过期，使用 refresh_token 续期...");
                    RewardsAuto.state.token = null;
                    GM_setValue("Config.accessToken", "");
                    GM_setValue("Config.accessTokenTime", 0);
                    const refreshed = await this.renewToken();
                    if (!refreshed) return null;
                    return await requestFn(RewardsAuto.state.token);
                }
                throw e;
            }
        },

        async renewToken() {
            if (!GM_getValue("Tasks.sign", true) && !GM_getValue("Tasks.read", true)) return true;
            const cachedAt = GM_getValue("Config.accessTokenTime", 0);
            const cachedAT = GM_getValue("Config.accessToken", "");
            if (cachedAT && cachedAt && Date.now() - cachedAt < 45 * 60 * 1000) {
                RewardsAuto.state.token = cachedAT;
                return true;
            }
            if (!Utils.acquireLock("Config.tokenLock", 90 * 1000)) {
                Utils.log("⏳", "其它上下文正在刷新 Token，等待复用...");
                for (let i = 0; i < 10; i++) {
                    await Utils.delay(2000);
                    const at = GM_getValue("Config.accessToken", "");
                    const ts = GM_getValue("Config.accessTokenTime", 0);
                    if (at && ts > cachedAt) {
                        RewardsAuto.state.token = at;
                        Utils.log("🟢", "已复用其它上下文刷新的 Token");
                        return true;
                    }
                }
                Utils.log("🟡", "等待 Token 超时，本上下文自行刷新");
            }
            try {
                return await this.renewTokenInner();
            } finally {
                Utils.releaseLock("Config.tokenLock");
            }
        },

        async renewTokenInner() {
            let refreshToken = GM_getValue("Config.token", false);
            const tokenTime = Number(GM_getValue("Config.tokenTime", 0)) || 0;
            if (refreshToken && tokenTime > 0) {
                const days = (Utils.getTimestamp() - tokenTime) / (1000 * 60 * 60 * 24);
                if (days > 7) {
                    Utils.log("🟡", `Token 已 ${Math.floor(days)} 天，提前续期`);
                    refreshToken = false;
                }
            }
            if (refreshToken) {
                const r = await this.refreshWithToken(refreshToken);
                if (r.ok) { this.applyToken(r.json); return true; }
                Utils.log("🔴", `刷新 Token 失败：${r.error}${r.description ? " - " + r.description : ""}`);
                const latest = GM_getValue("Config.token", false);
                if (latest && latest !== refreshToken) {
                    Utils.log("🟡", "检测到其它上下文已更新 refresh_token，改用新值重试");
                    const r2 = await this.refreshWithToken(latest);
                    if (r2.ok) { this.applyToken(r2.json); return true; }
                }
                if (r.error !== "invalid_grant") {
                    return false;
                }
                Utils.log("🟡", "refresh_token 已失效，需要重新授权");
                GM_setValue("Config.token", false);
                GM_setValue("Config.tokenTime", 0);
            }

            const storedCode = Auth.stored();
            if (storedCode) {
                Utils.log("🟡", "发现已保存的授权码，尝试用它换取 Token...");
                if (await Auth.exchange(storedCode)) return true;
            }

            const got = await Auth.autoFetch(refreshToken ? "Token 刷新失败" : "检测到尚未授权");
            if (got.tokenReady) return true;
            if (got.code) {
                if (await Auth.exchange(got.code)) return true;
                Utils.notifyAnomaly("🔴", "授权码换取 Token 失败，请重新「🔑 手动授权」", "authExchange");
            }
            return false;
        },

        async getRewardsInfo(maxRetries = 3) {
            for (let attempt = 1; attempt <= maxRetries; attempt++) {
                try {
                    const html = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                    const clean = html.replace(/\\"/g, '"');
                    let balance = 0;
                    /* pointsCounters.totalPoints 是「今日已赚」，不是账号余额；
                       原来赋给 balance，导致两个数都对不上。null = 没读到，区别于真 0。 */
                    let earnedToday = null;
                    let pcMax = 60, pcCur = 0, mobMax = 0, mobCur = 0;
                    let dailyOffer = 0;
                    let searchQuotaFound = false;
                    const pcIdx = clean.indexOf('"pointsCounters":{');
                    if (pcIdx !== -1) {
                        let start = pcIdx + 17, depth = 0, end = start;
                        for (let i = start; i < clean.length && i < start + 500; i++) {
                            if (clean[i] === '{') depth++;
                            if (clean[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
                        }
                        try {
                            const pts = JSON.parse(clean.substring(start, end));
                            pcMax = pts.pc?.max ?? 60;
                            pcCur = pts.pc?.progress ?? 0;
                            mobMax = pts.mobile?.max ?? 0;
                            mobCur = pts.mobile?.progress ?? 0;
                            dailyOffer = pts.dailyOffer ?? 0;
                            if (pts.totalPoints != null) {
                                const v = Number(pts.totalPoints);
                                if (Number.isFinite(v) && v >= 0) earnedToday = v;
                            }
                        } catch {}
                    }
                    /* 余额只认这两个字段，绝不拿 totalPoints 顶（见上面的说明）。
                       要容忍两种形态：数字 56036、带千分位的字符串 "56,036"。
                       原来只写 (\d+)，遇到 "56,036" 会截成 56 —— 页面一旦改成
                       带引号或带逗号的写法，总积分就会变成两位数的假值。 */
                    const balMatch = clean.match(/"(?:balance|availablePoints)"\s*:\s*"?([\d,]+)"?/);
                    if (balMatch) balance = parseInt(String(balMatch[1]).replace(/,/g, ""), 10) || 0;
                    const todayDetails = [];
                    const acIdx = clean.indexOf('"activityCards":[');
                    if (acIdx !== -1) {
                        let acStart = acIdx + 16, acDepth = 0, acEnd = acStart;
                        for (let i = acStart; i < clean.length && i < acStart + 5000; i++) {
                            if (clean[i] === '[') acDepth++;
                            if (clean[i] === ']') { acDepth--; if (acDepth === 0) { acEnd = i + 1; break; } }
                        }
                        try {
                            const cardsStr = clean.substring(acStart, acEnd);
                            const cardRegex = /"title":"([^"]+)".*?"points":(\d+).*?"isCompleted":(true|false)/g;
                            let cardMatch;
                            while ((cardMatch = cardRegex.exec(cardsStr)) !== null) {
                                const title = cardMatch[1];
                                const points = parseInt(cardMatch[2]);
                                const isCompleted = cardMatch[3] === "true";
                                if (points > 0 && isCompleted) todayDetails.push({ title, points });
                            }
                        } catch {}
                    }
                    const toNum = value => parseInt(String(value).replace(/,/g, ''), 10) || 0;
                    const searchRowMatch = clean.match(/<p>\s*必应搜索\s*<\/p>\s*<\/div>\s*<div(?=[^>]*justify-self-end)[^>]*>([\s\S]{0,500}?)<\/div>/i);
                    const searchHtmlMatch = searchRowMatch
                        ? (searchRowMatch[1].match(/<span[^>]*>([\d,]+)<\/span>\s*<span[^>]*>\s*\/\s*([\d,]+)\s*<\/span>/i)
                            || searchRowMatch[1].match(/([\d,]+)\s*\/\s*([\d,]+)/))
                        : null;
                    if (searchHtmlMatch) {
                        pcCur = toNum(searchHtmlMatch[1]);
                        pcMax = toNum(searchHtmlMatch[2]);
                        searchQuotaFound = pcMax > 0;
                        todayDetails.push({ title: '必应搜索', points: pcCur, max: pcMax });
                        Utils.log("🔍", `页面表格配额: PC ${pcCur}/${pcMax}`);
                    }
                    const searchRscMatch = clean.match(/"combinedSearch":\{[^}]*"progress":(\d+)[^}]*"max":(\d+)/);
                    if (searchRscMatch && !todayDetails.some(d => d.title === '必应搜索')) {
                        pcCur = toNum(searchRscMatch[1]);
                        pcMax = toNum(searchRscMatch[2]);
                        searchQuotaFound = pcMax > 0;
                        todayDetails.push({ title: '必应搜索', points: pcCur, max: pcMax });
                    }
                    if (dailyOffer > 0) todayDetails.push({ title: '优惠', points: dailyOffer });
                    const otherActivityRegex = /<p>([^<]+)<\/p><\/div><div[^>]*>(\d+)<\/div>/g;
                    let otherMatch;
                    while ((otherMatch = otherActivityRegex.exec(clean)) !== null) {
                        const title = otherMatch[1];
                        const points = parseInt(otherMatch[2]);
                        if (points > 0 && !todayDetails.some(d => d.title === title)) {
                            todayDetails.push({ title, points });
                        }
                    }
                    const history = { month: 0, year: 0, lifetime: 0 };
                    const historyRscMatch = clean.match(/"pointsHistory":\{[^}]*"thisMonth":\{"earn":(\d+)[^}]*"thisYear":\{"earn":(\d+)[^}]*"lifetime":\{"earn":(\d+)/);
                    if (historyRscMatch) {
                        history.month = parseInt(historyRscMatch[1]);
                        history.year = parseInt(historyRscMatch[2]);
                        history.lifetime = parseInt(historyRscMatch[3]);
                    } else {
                        const monthHtmlMatch = clean.match(/本月.*?(\d[\d,]*)<\/div>/);
                        const yearHtmlMatch = clean.match(/今年.*?(\d[\d,]*)<\/div>/);
                        const lifetimeHtmlMatch = clean.match(/生存期.*?(\d[\d,]*)<\/div>/);
                        const monthJsonMatch = clean.match(/"monthlyPoints":(\d+)/);
                        const yearJsonMatch = clean.match(/"yearlyPoints":(\d+)/);
                        const lifetimeJsonMatch = clean.match(/"lifetimePoints":(\d+)/);
                        if (monthHtmlMatch) history.month = parseInt(monthHtmlMatch[1].replace(/,/g, ''));
                        else if (monthJsonMatch) history.month = parseInt(monthJsonMatch[1]);
                        if (yearHtmlMatch) history.year = parseInt(yearHtmlMatch[1].replace(/,/g, ''));
                        else if (yearJsonMatch) history.year = parseInt(yearJsonMatch[1]);
                        if (lifetimeHtmlMatch) history.lifetime = parseInt(lifetimeHtmlMatch[1].replace(/,/g, ''));
                        else if (lifetimeJsonMatch) history.lifetime = parseInt(lifetimeJsonMatch[1]);
                    }
                    if (!searchQuotaFound) {
                        /* 面板接口优先：它最近一直比 getuserinfo 稳（后者会回 HTML 错误页），
                           而且直接给 PCSearch 的 pointProgress。 */
                        const panelResult = await this.getSearchQuotaFromPanel(false);
                        if (panelResult) {
                            Utils.log("🟢", "页面未命中搜索配额，使用面板接口兜底");
                            return Object.assign({ todayDetails: [], history: null }, panelResult, {
                                earnedToday, mobile: { progress: mobCur, max: mobMax },
                                dailyOffer, readProgress: RewardsAuto.state.readProgress ?? 0,
                                readMax: RewardsAuto.state.readMax ?? 30
                            });
                        }
                    }
                    if (!searchQuotaFound) {
                        const userInfoResult = await this.getSearchQuotaFromUserInfo();
                        if (userInfoResult) {
                            Utils.log("🟢", "页面未命中搜索配额，使用 getuserinfo 兜底");
                            return userInfoResult;
                        }
                    }
                    if (!searchQuotaFound && RewardsAuto.state.token) {
                        const apiResult = await this.getSearchQuotaFromAPI();
                        if (apiResult) {
                            Utils.log("🟢", "页面未命中搜索配额，使用 DAPI 兜底");
                            return apiResult;
                        }
                    }
                    let readProgress = Number(RewardsAuto.state.readProgress) || 0;
                    let readMax = Number(RewardsAuto.state.readMax) || 30;
                    const readInfo = await this.getReadProgress();
                    if (readInfo) {
                        const p = Number(readInfo.progress);
                        const m = Number(readInfo.max) || 30;
                        /* 服务端读到 0 未必真 0（翻页/抖动/刚写完标记）。
                           已确认完成的那天只升不降。 */
                        const tm = (typeof TaskManager !== "undefined") ? TaskManager : null;
                        const doneToday = !!tm && tm.readDate === RewardsAuto.state.dateNowNum;
                        const cur = Number.isFinite(p) ? p : readProgress;
                        readProgress = doneToday ? Math.max(cur, readProgress) : cur;
                        readMax = m;
                        RewardsAuto.state.readProgress = readProgress;
                        RewardsAuto.state.readMax = readMax;
                    } else {
                        Utils.log("🟡", "阅读进度查询失败，汇总里的阅读进度可能不准");
                    }
                    return {
                        balance, earnedToday,
                        pc: { progress: pcCur, max: pcMax },
                        mobile: { progress: mobCur, max: mobMax },
                        readProgress, readMax, dailyOffer, todayDetails, history
                    };
                } catch (e) {
                    if (attempt < maxRetries) { await Utils.delay(3210); continue; }
                    Utils.log("🔴", `仪表盘获取失败: ${e.message}`);
                    return false;
                }
            }
            return false;
        },

        async signApp() {
            const region = RewardsAuto.region();
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: Utils.appHeaders(token, {
                        country: region,
                        extra: { "x-rewards-partnerid": "startapp", "x-rewards-flights": "rwgobig" }
                    }),
                    data: JSON.stringify({
                        amount: 1, id: Utils.getRandomUUID().replace(/-/g, '') + Utils.getRandomUUID().replace(/-/g, '').slice(0, 24),
                        type: 103, country: region, channel: RewardsAuto.appConfig.channel
                    })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    const response = data.response || {};
                    if (response.activity) return Number(response.activity.p || response.activity.points || 0);
                    if (response.isDuplicate || response.activity === null) return 0;
                    Utils.log("🟡", `App签入响应未确认: ${String(res).slice(0, 120)}`);
                }
            } catch (e) {
                Utils.log("🔴", `App签入失败: ${e.message}`);
            }
            return -1;
        },

        async getRequestVerificationToken(pageUrl = "https://rewards.bing.com/") {
            try {
                const html = await Utils.xhr({
                    url: pageUrl,
                    headers: { "user-agent": RewardsAuto.ua.pc, "referer": "https://rewards.bing.com/" },
                });
                const tokenMatch = html.match(/name=["']__RequestVerificationToken["'][^>]*value=["']([^"']+)["']/i)
                    || html.match(/RequestVerificationToken.*?value=["']([^"']+)["']/i)
                    || html.match(/"verificationToken"\s*:\s*"([^"]+)"/i)
                    || html.match(/"__RequestVerificationToken"\s*:\s*"([^"]+)"/i);
                return tokenMatch ? tokenMatch[1].replace(/&amp;/g, "&") : "";
            } catch (e) {
                Utils.log("🟡", `活动Token获取失败: ${e.message}`);
                return "";
            }
        },

        async reportActivity(offerId, hash, referer = "https://rewards.bing.com/") {
            const token = await this.getRequestVerificationToken(referer);
            const params = new URLSearchParams({ id: offerId, hash: hash || "1", activityAmount: "1" });
            if (token) params.set("__RequestVerificationToken", token);
            const headers = {
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "user-agent": RewardsAuto.ua.pc,
                "referer": referer,
                "origin": "https://rewards.bing.com",
                "x-requested-with": "XMLHttpRequest"
            };
            if (token) headers["RequestVerificationToken"] = token;
            return await Utils.xhr({
                method: "POST",
                url: "https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest",
                headers, data: params.toString()
            });
        },

        async reportDailyActivity(searchUrl) {
            const rawUrl = String(searchUrl || "").trim();
            if (!rawUrl) return false;

            if (!(await CDP.available())) {
                CDP.warn("本地调试端口 " + CDP.PORT + " 上没有 CDP 服务");
                return false;
            }
            /* 这里以前只判断端口通不通就 return true —— 一次搜索都没发出去，
               调用方却当成「CDP 已点击」，于是带锁卡永远不记账。
               现在做真的浏览器级搜索：整页导航 + 真鼠标点搜索框 + sj_rra 上报，
               并且以服务端是否把这张卡标成完成作为成功判据。 */
            let r;
            try {
                r = await CDP.realSearch(rawUrl);
            } catch (e) {
                Utils.log("🟡", `CDP 真实搜索异常：${e.message}`);
                return false;
            }
            if (!r || !r.ok) {
                Utils.log("🟡", `CDP 真实搜索未执行：${(r && r.reason) || "未知原因"}`);
                return false;
            }
            Utils.log("🖱️", `CDP 已真实打开奖励搜索页（点击搜索框=${r.clicked ? "是" : "否"}`
                + `${r.reported ? "，已调用 sj_rra" : ""}）`);
            return true;
        },


        async signPC() {
            try {
                const res = await this.reportActivity("Gamification_DailyCheckIn", "1", "https://rewards.bing.com/");
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    return Number(data.points || data.response?.activity?.p || 0);
                }
            } catch (e) {
                if (e.message?.includes("401")) RewardsAuto.state.pc401 = true;
                Utils.log("🟡", `PC签入失败: ${e.message}`);
            }
            return -1;
        },

        async appActivity(type, offerid) {
            const region = RewardsAuto.region();
            const body = {
                amount: 1, country: region,
                id: Utils.getRandomUUID().replace(/-/g, '') + Utils.getRandomUUID().replace(/-/g, '').slice(0, 24),
                type: type, channel: RewardsAuto.appConfig.channel
            };
            if (offerid) body.attributes = { offerid: offerid };
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: Utils.appHeaders(token, { country: region }),
                    data: JSON.stringify(body)
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    return {
                        points: data.response?.activity?.p || 0,
                        isDuplicate: data.response?.isDuplicate || false,
                        balance: data.response?.balance || 0
                    };
                }
            } catch (e) {
                Utils.log("🔴", `App活动失败(${offerid}): ${e.message}`);
            }
            return null;
        },

        async getReadProgress() {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613",
                    headers: Utils.appHeaders(token, { country: "cn" })
                }));
                if (Utils.isJSON(res)) {
                    const promos = JSON.parse(res).response?.promotions || [];
                    const readOfferId = RewardsAuto.appConfig.offerIds.readArticle;
                    const task = promos.find(x => x.attributes?.offerid === readOfferId);
                    if (task && task.attributes) {
                        const progress = parseInt(task.attributes.progress) || 0;
                        const max = parseInt(task.attributes.max) || 30;
                        Utils.log("📊", `阅读进度查询: ${progress}/${max} (offerid: ${readOfferId})`);
                        return { progress, max };
                    } else {
                        Utils.log("🟡", `阅读任务未找到 (offerid: ${readOfferId})`);
                    }
                } else {
                    Utils.log("🟡", `DAPI 响应不是 JSON: ${String(res).substring(0, 100)}`);
                }
            } catch (e) {
                Utils.log("🔴", `阅读进度获取失败: ${e.message}`);
            }
            return false;
        },

        edgeRegion() {
            return RewardsAuto.region("us");
        },

        _edgeHeaders(region, token) {
            return Utils.appHeaders(token, { kind: "edge", country: region || this.edgeRegion() });
        },

        async getEdgeProfile(region) {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=edge&options=Profile,Promotions",
                    headers: this._edgeHeaders(region, token)
                }));
                if (!res || !Utils.isJSON(res)) {
                    Utils.log("🟡", `Edge 通道返回非 JSON：${String(res).substring(0, 80)}`);
                    return null;
                }
                const data = JSON.parse(res);
                if (data.code !== 0 || !data.response) {
                    Utils.log("🟡", `Edge 通道查询失败：code=${data.code}`);
                    return null;
                }
                return data.response;
            } catch (e) {
                Utils.log("🟡", `Edge 通道查询异常: ${e.message}`);
                return null;
            }
        },

        async reportEdgeActivity({ offerid, type, region }) {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: this._edgeHeaders(region, token),
                    data: JSON.stringify({
                        amount: 1,
                        attributes: { offerid },
                        request_user_info: true,
                        type
                    })
                }));
                return (res && Utils.isJSON(res)) ? JSON.parse(res) : { code: -1, response: null };
            } catch (e) {
                Utils.log("🟡", `Edge 连签上报异常: ${e.message}`);
                return { code: -1, response: null };
            }
        },

        async activateEdgeBrowsing() {
            const earnUrl = "https://rewards.bing.com/earn";
            try {
                let html = "";
                try {
                    html = await Utils.xhr({
                        url: `${earnUrl}?section=streaks`,
                        headers: { "user-agent": RewardsAuto.ua.pc, "referer": earnUrl }
                    });
                } catch (_) { }
                if (!html || !String(html).includes("edge_flight")) {
                    try {
                        html = await Utils.xhr({
                            url: earnUrl,
                            headers: { "user-agent": RewardsAuto.ua.pc, "referer": earnUrl }
                        });
                    } catch (_) { }
                }
                if (!html) return "failed";
                const clean = String(html).replace(/\\"/g, '"');
                const ids = [...clean.matchAll(/"activationOfferId":"(edge_flight[^"]*)"/g)].map(m => m[1]);
                if (ids.length === 0) {
                    return /"partner":"edge"/.test(clean) ? "failed" : "absent";
                }
                const offerId = ids.includes(EDGE.ACTIVATION_OFFER) ? EDGE.ACTIVATION_OFFER : ids[0];
                const idx = clean.indexOf(`"activationOfferId":"${offerId}"`);
                const win = clean.substring(Math.max(0, idx - 600), idx + 500);
                if (/"isEnabled":true/.test(win)) return "already";
                const hashMatch = win.match(/"activationHash":"([^"]+)"/);
                const typeMatch = win.match(/"activationActivityType":(\d+)/);
                const hash = hashMatch ? hashMatch[1] : "";
                const actType = typeMatch ? Number(typeMatch[1]) : 714;
                if (!hash || hash === "$undefined") return "failed";
                const nextAction = await this.getNextActionHash(html);
                await Utils.xhr({
                    method: "POST",
                    url: earnUrl,
                    headers: {
                        "content-type": "text/plain;charset=UTF-8",
                        "next-action": nextAction,
                        "referer": earnUrl,
                        "user-agent": RewardsAuto.ua.pc,
                    },
                    data: JSON.stringify([hash, actType, { offerid: offerId, isPromotional: "$undefined", timezoneOffset: "-480" }])
                });
                return "activated";
            } catch (e) {
                Utils.log("🟡", `Edge 连签激活失败: ${e.message}`);
                return "failed";
            }
        },

        _promoCache: null,

        async getAppPromotions(force = false) {
            const now = Date.now();
            if (!force && this._promoCache && now - this._promoCache.ts < 15000) return this._promoCache.list;
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: RewardsAuto.appConfig.dapiMeUrl,
                    headers: Utils.appHeaders(token, { country: GM_getValue("Config.lock", true) ? "cn" : "us" })
                }));
                if (Utils.isJSON(res)) {
                    const list = JSON.parse(res).response?.promotions || [];
                    this._promoCache = { list, ts: Date.now() };
                    return list;
                }
                Utils.log("🟡", `DAPI 任务列表非 JSON: ${String(res).slice(0, 100)}`);
            } catch (e) {
                Utils.log("🟡", `DAPI 任务列表获取失败: ${e.message}`);
            }
            return null;
        },

        async getPromotionMap(force = false) {
            const list = await this.getAppPromotions(force);
            if (!list) return null;
            const map = new Map();
            for (const p of list) {
                const a = p.attributes || {};
                const offerId = a.offerid || a.offerId || p.name;
                if (!offerId) continue;
                const max = parseInt(a.max ?? a.activitymax ?? 0, 10) || 0;
                const progress = parseInt(a.progress ?? a.activity_progress ?? a.activityprogress ?? 0, 10) || 0;
                map.set(offerId, {
                    offerId,
                    name: p.name || "",
                    max,
                    progress,
                    complete: String(a.complete).toLowerCase() === "true" || (max > 0 && progress >= max),
                    title: a.title || p.name || "",
                    destination: a.destination || "",
                    type: a.type || "",
                    state: a.State || "",
                    dailySetDate: a.daily_set_date || "",
                    isLocked: a.isLocked ?? a.islocked,
                    isUnlocked: a.isUnlocked ?? a.isunlocked,
                    unlockCriteria: a.unlockCriteria ?? a.unlockcriteria,
                    hidden: String(a.hidden).toLowerCase() === "true"
                });
            }
            return map;
        },

        async isOfferComplete(offerId, force = false) {
            if (!offerId) return null;
            const map = await this.getPromotionMap(force);
            if (!map) return null;
            const item = map.get(offerId);
            if (!item) return null;
            return item.complete;
        },

        _webCompleteCache: null,

        async isOfferCompleteWeb(offerId, force = false) {
            if (!offerId) return null;
            const now = Date.now();
            if (!force && this._webCompleteCache && now - this._webCompleteCache.ts < 20000) {
                const cached = this._webCompleteCache.map;
                if (cached.has(offerId)) return cached.get(offerId);
            }
            try {
                const html = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                if (!html) return null;
                const map = new Map();
                for (const item of this._flightItems(this._flightText(html))) {
                    const id = item.offerId || item.offerid;
                    if (!id) continue;
                    const cur = Number(item.pointProgress || 0);
                    const max = Number(item.pointProgressMax || 0);
                    /* 周期性每日卡（*DailyGlobalOffer*、DailySet）不能用
                       progress>=max 判完成：这类卡每天重置，进度会停在满值，
                       于是「满进度 = 今天做过」永远成立，卡片再也不会被处理。
                       这类卡只认明确的完成字段。 */
                    const periodic = /DailyGlobalOffer|DailySet|Encourage_Redemption/i.test(String(id));
                    const explicit = item.isCompleted === true || item.complete === true
                        || String(item.isCompleted).toLowerCase() === "true"
                        || String(item.complete).toLowerCase() === "true";
                    const done = explicit || (!periodic && max > 0 && cur >= max);
                    if (done || !map.has(id)) map.set(id, !!done);
                }
                this._webCompleteCache = { ts: now, map };
                return map.has(offerId) ? map.get(offerId) : null;
            } catch (_) {
                return null;
            }
        },

        async isOfferCompleteAny(offerId, force = false) {
            const viaApp = await this.isOfferComplete(offerId, force);
            if (viaApp !== null) return viaApp;
            return await this.isOfferCompleteWeb(offerId, false);
        },

        _unofferableKey(offerId) {
            return `Config.unofferable.${Utils.getTodayNum()}.${offerId}`;
        },


        isUnoffered(offerId) {
            if (!offerId) return false;
            try { return GM_getValue(this._unofferableKey(offerId), false) === true; } catch (_) { return false; }
        },

        _manualKey(offerId) {
            return `Config.manualCard.${Utils.getTodayNum()}.${offerId}`;
        },


        isManualCard(offerId) {
            if (!offerId) return false;
            try { return GM_getValue(this._manualKey(offerId), false) === true; } catch (_) { return false; }
        },

        async discoverDailySetCards(preMap = null) {
            const todayStr = Utils.getTodayStr();
            const todayNum = String(Utils.getTodayNum());
            const map = preMap || await this.getPromotionMap(true);
            if (!map) return [];
            const cards = [];
            let lockedCount = 0, lockedPoints = 0;
            for (const item of map.values()) {
                const isDailySet = item.offerId.includes(RewardsAuto.appConfig.offerIds.dailySetPrefix)
                    || (item.type === "urlreward" && item.dailySetDate === todayStr);
                if (!isDailySet) continue;
                const scheduledToday = item.dailySetDate === todayStr || item.offerId.includes(todayNum);
                if (!scheduledToday) continue;
                if (item.complete) continue;
                if (item.hidden) continue;
                const lock = CardLock.probe(item);
                if (lock.locked) {
                    lockedCount++;
                    lockedPoints += item.max || 0;
                    try {
                        const t = item.title || item.offerId;
                        if (!RewardsAuto.state.lockedTitles.includes(t)) RewardsAuto.state.lockedTitles.push(t);
                    } catch (_) {}
                    Utils.log("🔒", `锁卡跳过（需在必应 App 完成）：${item.title || item.offerId} +${item.max || 0}p [${lock.reason}]`);
                    continue;
                }
                cards.push({
                    title: item.title || item.offerId,
                    points: item.max || 10,
                    offerId: item.offerId,
                    hash: "",
                    kind: "daily",
                    url: "https://rewards.bing.com/earn",
                    destination: item.destination || "",
                    source: "dapi",
                    ...(lock.appOnly ? { appOnly: true } : {}),
                    ...(lock.levelGated ? { levelGated: true } : {})
                });
            }
            if (lockedCount > 0) {
                RewardsAuto.state.lockedCount = Math.max(RewardsAuto.state.lockedCount, lockedCount);
                RewardsAuto.state.lockedPoints = Math.max(RewardsAuto.state.lockedPoints, lockedPoints);
            }
            return cards;
        },

        async getRewardsToken() {
            try {
                const html = await Utils.xhr({
                    url: "https://rewards.bing.com/",
                    headers: { "user-agent": RewardsAuto.ua.pc, "referer": "https://rewards.bing.com/" }
                });
                if (html) {
                    const match = html.replace(/\s/g, "").match(/RequestVerificationToken(.*?)value="(.*?)"/);
                    if (match) return match[2];
                }
            } catch (e) {
                Utils.log("🟡", `RequestVerificationToken 获取失败: ${e.message}`);
            }
            return false;
        },

        async getSearchQuotaFromUserInfo(light = false) {
            try {
                const res = await Utils.xhr({
                    url: `https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=${Date.now()}`,
                    headers: {
                        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                        "user-agent": RewardsAuto.ua.pc,
                        "referer": "https://rewards.bing.com/",
                        "x-requested-with": "XMLHttpRequest"
                    },
                });
                if (!Utils.isJSON(res)) return false;
                const data = JSON.parse(res);
                const dashboard = data.dashboard || data;
                const userStatus = dashboard.userStatus || {};
                const counters = userStatus.counters || {};
                const sumCounter = items => {
                    if (!Array.isArray(items)) return { progress: 0, max: 0 };
                    return items.reduce((acc, item) => {
                        acc.progress += Number(item.pointProgress || 0);
                        acc.max += Number(item.pointProgressMax || item.pointMax || 0);
                        return acc;
                    }, { progress: 0, max: 0 });
                };
                const pc = sumCounter(counters.pcSearch);
                if (pc.max === 0) return false;
                const balance = Number(userStatus.availablePoints || dashboard.availablePoints || 0);
                let readProgress = RewardsAuto.state.readProgress ?? 0;
                let readMax = RewardsAuto.state.readMax ?? 30;

                if (!light) {
                    try {
                        const readInfo = await API.getReadProgress();
                        if (readInfo) { readProgress = readInfo.progress; readMax = readInfo.max; }
                    } catch (e) {}
                    Utils.log("📊", `getuserinfo查询: PC ${pc.progress}/${pc.max}, 阅读 ${readProgress}/${readMax}, 积分 ${balance}`);
                }
                return {
                    balance, pc, readProgress, readMax, dailyOffer: 0,
                    todayDetails: pc.max > 0 ? [{ title: "必应搜索", points: pc.progress, max: pc.max }] : [],
                    history: null
                };
            } catch (e) {
                if (GM_getValue("Config.debugDAPI", false)) {
                    Utils.log("🟡", `getuserinfo 查询失败: ${e.message}`);
                }
                return false;
            }
        },

        async getSearchQuotaFromAPI(light = false) {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=613",
                    headers: Utils.appHeaders(token, { country: "cn" })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    const response = data.response || {};
                    const promos = response.promotions || [];
                    const counters = response.counters || response.userStatus?.counters;
                    if (!counters) return false;
                    let pcCur = 0, pcMax = 0;
                    if (counters?.pcSearch && counters.pcSearch.length > 0) {
                        pcCur = counters.pcSearch[0].pointProgress || 0;
                        pcMax = counters.pcSearch[0].pointProgressMax || 0;
                    }
                    if (pcMax === 0) return false;
                    const balance = response.balance || response.userStatus?.availablePoints || 0;
                    let readProgress = RewardsAuto.state.readProgress ?? 0;
                    let readMax = RewardsAuto.state.readMax ?? 30;
                    if (!light) {
                        try {
                            const readInfo = await API.getReadProgress();
                            if (readInfo) { readProgress = readInfo.progress; readMax = readInfo.max; }
                        } catch (e) {}
                        Utils.log("📊", `DAPI查询: PC ${pcCur}/${pcMax}, 阅读 ${readProgress}/${readMax}, 积分 ${balance}`);
                    }
                    return { balance, pc: { progress: pcCur, max: pcMax }, readProgress, readMax, dailyOffer: 0, todayDetails: [], history: null };
                }
            } catch (e) {
                if (!light) Utils.log("🟡", `DAPI查询失败: ${e.message}`);
            }
            return false;
        },

        /* 面板接口（Bing 首页浮窗的数据源）。getuserinfo 实测 2026-11 对已登录账号
           也可能返回 HTML 错误页，非 JSON 时 getPcQuota 会拿不到来源；面板接口稳定，
           且直接给 PCSearch 进度。注意字段名：getuserinfo 是 pcSearch，面板是 PCSearch。 */
        async getSearchQuotaFromPanel(light = true) {
            const hosts = [];
            try {
                const h = String(RewardsAuto.state.host || "").trim();
                if (h) hosts.push(h);
            } catch (_) {}
            for (const h of ["cn.bing.com", "www.bing.com"]) {
                if (!hosts.includes(h)) hosts.push(h);
            }
            /* 某个域读到余额但没有 PC 计数器时先记下来：
               继续试下一个域（可能这个域字段缺失），全都拿不到 PC 进度，
               再把余额当兜底线索返回，交给上层用「总积分是否上涨」判定。 */
            let balanceOnly = 0;
            for (const host of hosts) {
                let text = "";
                try {
                    text = await Utils.xhr({
                        url: `https://${host}/rewards/panelflyout/getuserinfo?channel=BingFlyout&partnerId=BingRewards&_=${Date.now()}`,
                        headers: {
                            "accept": "application/json, text/plain, */*",
                            "user-agent": RewardsAuto.ua.pc,
                            "referer": `https://${host}/`,
                            "x-requested-with": "XMLHttpRequest"
                        },
                        timeout: 20000
                    });
                } catch (_) { continue; }
                const data = Utils.parseJSON(text);
                if (!data) continue;
                const us = (data.flyoutResult && data.flyoutResult.userStatus)
                    || (data.dashboard && data.dashboard.userStatus)
                    || data.userStatus || {};
                const counters = us.counters || data.counters || {};
                /* 只认 PC 搜索的计数器，大小写都兼容（面板回 PCSearch，其它通道回 pcSearch）。
                   这里**不能**退到 MobileSearch：手机配额是另一条进度，
                   拿它当 PC 的基准会让「这次搜索有没有加分」完全判错。 */
                const raw = counters.PCSearch || counters.pcSearch || null;
                const balance = Number(
                    us.availablePoints
                    ?? (data.userInfo && data.userInfo.balance)
                    ?? 0
                ) || 0;
                if (!Array.isArray(raw) || raw.length === 0) {
                    if (balance > 0) balanceOnly = Math.max(balanceOnly, balance);
                    continue;
                }
                const sum = raw.reduce((acc, item) => {
                    acc.progress += Number(item.pointProgress || 0);
                    acc.max += Number(item.pointProgressMax || item.pointMax || 0);
                    return acc;
                }, { progress: 0, max: 0 });
                if (sum.max <= 0) {
                    if (balance > 0) balanceOnly = Math.max(balanceOnly, balance);
                    continue;
                }
                if (!light) {
                    Utils.log("📊", `面板查询(${host}): PC ${sum.progress}/${sum.max}, 积分 ${balance}`);
                }
                return { balance, pc: { progress: sum.progress, max: sum.max } };
            }
            /* PC 计数器整个缺失（账号换档 / 字段改名）：绝不冒充 PC 进度，
               但把余额带回去做兜底判据。 */
            return balanceOnly > 0 ? { balance: balanceOnly, pc: null } : false;
        },

        async getPcQuota() {
            /* 三条通道任一成功即可，按实测可靠度排序：面板接口 > getuserinfo > DAPI。
               全废返回 null，如实记一次核对失败，绝不拿手机配额冒充 PC。 */
            try {
                const panel = await this.getSearchQuotaFromPanel(true);
                if (panel && panel.pc && panel.pc.max > 0) {
                    return { progress: panel.pc.progress, max: panel.pc.max };
                }
            } catch (_) {}
            try {
                const ui = await this.getSearchQuotaFromUserInfo(true);
                if (ui && ui.pc && ui.pc.max > 0) return { progress: ui.pc.progress, max: ui.pc.max };
            } catch (_) {}
            try {
                if (RewardsAuto.state.token) {
                    const dapi = await this.getSearchQuotaFromAPI(true);
                    if (dapi && dapi.pc && dapi.pc.max > 0) return { progress: dapi.pc.progress, max: dapi.pc.max };
                }
            } catch (_) {}
            return null;
        },

        async getBalance() {
            try {
                const res = await this.withTokenRetry(token => Utils.xhr({
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me?channel=SAAndroid&options=105",
                    headers: Utils.appHeaders(token, { country: "cn" })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    return data.response?.balance || 0;
                }
            } catch (e) {}
            try {
                const res2 = await Utils.xhr({
                    url: `https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=${Date.now()}`,
                    headers: {
                        "user-agent": RewardsAuto.ua.pc,
                        "referer": "https://rewards.bing.com/",
                        "x-requested-with": "XMLHttpRequest"
                    },
                });
                if (Utils.isJSON(res2)) {
                    const data2 = JSON.parse(res2);
                    return data2.dashboard?.availablePoints || data2.balance || 0;
                }
            } catch (e) {}
            return 0;
        },

        async doRead() {
            const region = RewardsAuto.region();
            try {
                const id = Utils.getRandomUUID().replace(/-/g, '') + Utils.getRandomUUID().replace(/-/g, '').slice(0, 24);
                const res = await this.withTokenRetry(token => Utils.xhr({
                    method: "POST",
                    url: "https://prod.rewardsplatform.microsoft.com/dapi/me/activities",
                    headers: Utils.appHeaders(token, { country: region }),
                    data: JSON.stringify({
                        amount: 1, country: region, id: id, type: 101,
                        attributes: { offerid: RewardsAuto.appConfig.offerIds.readArticle }
                    })
                }));
                if (Utils.isJSON(res)) {
                    const data = JSON.parse(res);
                    return { points: data.response?.activity?.p || 0, isDuplicate: data.response?.isDuplicate || false };
                }
                return null;
            } catch (e) {
                Utils.log("🔴", `阅读请求失败: ${e.message}`);
                return false;
            }
        },

        _flightText(html) {
            const chunks = [];
            const pushRegex = /self\.__next_f\.push\(\[\d+,\s*"(.*?)"\]\)/gs;
            let m;
            while ((m = pushRegex.exec(html)) !== null) {
                try { chunks.push(JSON.parse(`"${m[1]}"`)); } catch (_) {}
            }
            return chunks.length > 0 ? chunks.join("") : String(html).replace(/\\"/g, '"');
        },

        _flightItems(text, idPattern = "[^\"]+") {
            const items = [];
            const re = new RegExp('\\{[^{}]*?"offerId"\\s*:\\s*"' + idPattern + '"[^{}]*?\\}', "g");
            let m;
            while ((m = re.exec(text)) !== null) {
                try {
                    items.push(JSON.parse(m[0].replace(/:\$undefined/g, ":null").replace(/:\$D[^\",}]+/g, ":null")));
                } catch (_) {}
            }
            return items;
        },

        async discoverCards() {
            const cards = [];
            const seenCardKeys = new Set();
            let earnHtml = "";
            const lockStat = { count: 0, points: 0, app: 0 };
            /* 只有「真问过服务端且它答了」才算读到，用来区分「今天没卡」和
               「根本没读到」——以前两者都落到「未发现卡片 → ✅ 完成」。 */
            const sources = { getuserinfo: false, flight: false };
            let sourceAnswered = false;

            const classify = (item, points = 0) => {
                const lock = CardLock.probe(item);
                if (lock.locked) {
                    lockStat.count++;
                    lockStat.points += Number(points) || 0;
                    Utils.log("🔒", `跳过锁卡：${item.title || item.name || item.offerId || "活动卡片"} +${points}p [${lock.reason}]`);
                    return { skip: true, appOnly: false, levelGated: false };
                }
                if (lock.appOnly) {
                    lockStat.app++;
                    Utils.log("🔓", `带锁徽标的 App 卡，改用 Rewards 应用通道：${item.title || item.name || item.offerId} +${points}p [${lock.reason}]`);
                    return { skip: false, appOnly: true, levelGated: !!lock.levelGated };
                }
                if (lock.levelGated) {
                    Utils.log("🔓", `等级门槛卡（已解锁），领取时先走应用内搜索上报：${item.title || item.name || item.offerId} +${points}p [${lock.reason || "已解锁"}]`);
                    return { skip: false, appOnly: false, levelGated: true };
                }
                return { skip: false, appOnly: false, levelGated: false };
            };
            try {
                const html = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                if (!html) { Utils.log("🔴", "earn 页面返回空"); return cards; }
                earnHtml = html;
                const clean = html.replace(/\\"/g, '"');

                const dplMatch = clean.match(/[?&](?:amp;)?dpl=([A-Za-z0-9._-]+)/i);
                if (dplMatch) {
                    RewardsAuto._dpl = dplMatch[1];
                    GM_setValue("Config.dpl", dplMatch[1]);
                }

                const pushCard = (card) => {
                    if (!card || !card.offerId || !card.hash || card.points <= 0) return;
                    const key = `${card.offerId}:${card.hash}`;
                    if (seenCardKeys.has(key)) return;
                    seenCardKeys.add(key);
                    cards.push(card);
                };

                const pushWithLock = (item, card, points) => {
                    if (!card) return false;
                    const verdict = classify(item, points);
                    if (verdict.skip) return false;
                    const marked = {
                        ...card,
                        ...(verdict.appOnly ? { appOnly: true } : {}),
                        ...(verdict.levelGated ? { levelGated: true } : {})
                    };
                    pushCard(marked);
                    return true;
                };

                const inferKind = (offerId, title = "") => {
                    const text = `${offerId} ${title}`.toLowerCase();
                    if (/quiz|trivia|question|测验|答案/.test(text)) return "quiz";
                    if (/puzzle|拼图/.test(text)) return "puzzle";
                    if (/image|图片|设计/.test(text)) return "image_creator";
                    if (/explore|search|浏览|探索/.test(text)) return "explore_search";
                    if (/dailyset|daily|每日/.test(text)) return "daily";
                    if (/streak|打卡|连续/.test(text)) return "streak";
                    return "open_only";
                };

                try {
                    const userInfo = await Utils.xhr({
                        url: `https://rewards.bing.com/api/getuserinfo?type=1&X-Requested-With=XMLHttpRequest&_=${Date.now()}`,
                        headers: { "user-agent": RewardsAuto.ua.pc, "referer": "https://rewards.bing.com/", "x-requested-with": "XMLHttpRequest" },
                    });
                    if (Utils.isJSON(userInfo)) {
                        sources.getuserinfo = true;
                        sourceAnswered = true;
                        const data = JSON.parse(userInfo);
                        const dashboard = data.dashboard || data;
                        const now = new Date();
                        const todayKeys = new Set([
                            `${String(now.getMonth() + 1).padStart(2, "0")}/${String(now.getDate()).padStart(2, "0")}/${now.getFullYear()}`,
                            `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`
                        ]);
                        const normalizeDashboardCard = (item, kind) => {
                            if (!item) return null;
                            const offerId = item.offerId || item.offerid || item.id || item.name;
                            const hash = item.hash || item.activityId;
                            const title = item.title || item.name || item.description || "";
                            const points = Number(item.points ?? item.pointProgressMax ?? item.max ?? 0);
                            const doneMax = Number(item.pointProgressMax || 0);
                            const doneCur = Number(item.pointProgress || 0);
                            const isCompleted = item.isCompleted || item.complete || (doneMax > 0 && doneCur >= doneMax);
                            if (!offerId || !hash || points <= 0 || isCompleted) return null;
                            const skip = RewardsAuto.skipPatterns.some(p => title.toLowerCase().includes(p.toLowerCase()) || offerId.toLowerCase().includes(p.toLowerCase()));
                            if (skip) return null;
                            return { title, points, offerId, hash, kind: kind || inferKind(offerId, title), source: "getuserinfo", url: "https://rewards.bing.com/dashboard", destination: item.destinationUrl || "" };
                        };

                        const dailySetPromotions = dashboard.dailySetPromotions || {};
                        for (const dateKey of todayKeys) {
                            const dailyItems = dailySetPromotions[dateKey];
                            if (Array.isArray(dailyItems)) {
                                for (const item of dailyItems) {
                                    const card = normalizeDashboardCard(item, "daily");
                                    if (card) pushWithLock(item, card, card.points);
                                }
                            }
                        }
                        const morePromotions = dashboard.morePromotions || dashboard.promotions || [];
                        if (Array.isArray(morePromotions)) {
                            for (const item of morePromotions) {
                                const card = normalizeDashboardCard(item);
                                if (card) pushWithLock(item, card, card.points);
                            }
                        }
                    }
                } catch (e) {
                    /* getuserinfo 现在（2026-11）对已登录账号也常年回 401，
                       属于**已知的接口下线**，不是需要每轮提醒的故障。
                       以前这里每轮打一行 🟡，日志里刷得满屏都是，
                       反而掩盖了真正的问题。改成每 12 小时最多提一次。 */
                    const noCookie = /\b(401|403)\b/.test(String(e.message));
                    if (noCookie) {
                        /* 只写日志、**不弹通知**：这是接口下线，不是「任务完成」，
                           用户明确要求通知只在真的做完时出现。
                           用静默节流：12 小时内只记一行，避免每轮刷屏。 */
                        Utils.logSilenced("  ", "getuserinfo 已失效（401）：活动卡片改用 earn 页解析，不影响任务",
                            "getuserinfo401", 12 * 60 * 60 * 1000);
                    } else {
                        Utils.log("🟡", `getuserinfo 活动解析跳过: ${e.message}`);
                    }
                }

                try {
                    const flightItems = this._flightItems(this._flightText(html));
                    /* 必须同时标记 sourceAnswered：判「没卡」还是「没读到」用的是它，
                       而不是 sources.flight。 */
                    if (flightItems.length > 0) {
                        sources.flight = true;
                        sourceAnswered = true;
                    }
                    for (const item of flightItems) {
                        if (!item.offerId || !item.hash) continue;
                        if (item.isCompleted === true || item.hidden === true) continue;
                        const points = Number(item.points || 0);
                        if (points <= 0 && !item.offerId.includes("DailySet")) continue;
                        pushWithLock(item, {
                            title: item.title || item.name || item.offerId,
                            points: points || 10,
                            offerId: item.offerId,
                            hash: item.hash,
                            kind: inferKind(item.offerId, item.title || ""),
                            destination: item.destination || item.destinationUrl || "",
                            url: "https://rewards.bing.com/earn"
                        }, points);
                    }
                } catch (e) {
                    Utils.log("🟡", `Flight 数据解析异常: ${e.message}`);
                }

                if (cards.length === 0) {
                    const dataRegex = /data-offer-id="([^"]+)"[^>]*data-hash="([^"]+)"/gi;
                    let m;
                    while ((m = dataRegex.exec(html)) !== null) {
                        const offerId = m[1];
                        const hash = m[2];
                        const skip = RewardsAuto.skipPatterns.some(p => offerId.toLowerCase().includes(p.toLowerCase()));
                        if (skip) continue;
                        pushCard({ title: "日常任务", points: 10, offerId, hash, kind: "daily" });
                    }
                }

                if (cards.length > 0) {
                    Utils.log("🧩", `成功获取 ${cards.length} 个可执行卡片`);
                } else if (sourceAnswered) {
                    /* 真的问过、服务端也确实答了，只是没有符合条件的卡：
                       这才叫「今天没有待办卡片」。 */
                    Utils.log("🟡", "未发现可执行的活动卡片（服务端已应答，可能均已手动完成或被过滤）");
                } else {
                    /* 一个数据源都没答上来：这是「读不到」，不是「做完了」。
                       不能让上层把它当完成写进 promosDate —— 那会整天不再重试。 */
                    Utils.log("🟠", "活动卡片数据源全部不可用（getuserinfo / earn 页都没返回有效数据）：本轮无法判断是否有待办卡片，不标记为完成");
                }
            } catch (e) {
                Utils.log("🔴", `卡片解析失败: ${e.message}`);
            }

            if (lockStat.count > 0 || lockStat.app > 0) {
                RewardsAuto.state.lockedCount = Math.max(RewardsAuto.state.lockedCount, lockStat.count);
                RewardsAuto.state.lockedPoints = Math.max(RewardsAuto.state.lockedPoints, lockStat.points);
                if (lockStat.count > 0) {
                    Utils.log("🔒", `锁卡汇总：${lockStat.count} 张（${lockStat.points} 分）今天做不了，已跳过`);
                }
                if (lockStat.app > 0) {
                    Utils.log("🔓", `App 卡汇总：${lockStat.app} 张带锁徽标，已改走 Rewards 应用通道交卷`);
                }
            }

            /* 把「数据源是否可用」挂到数组上带出去。
               用属性而不是改返回类型，是为了不动所有既有调用点
               （discoverCards 被 doPromos / doDailySet / 二次扫描共用）。 */
            Object.defineProperty(cards, "sources", {
                value: sources, enumerable: false, configurable: true, writable: true
            });
            return cards;
        },

        async getNextActionHash(html) {
            let cached = RewardsAuto._nextAction || GM_getValue("Config.nextAction", ActionMap.FALLBACK.reportActivity);
            try {
                const fromTable = ActionMap.get("reportActivity");
                if (fromTable && fromTable !== cached) {
                    cached = fromTable;
                    RewardsAuto._nextAction = cached;
                    GM_setValue("Config.nextAction", cached);
                }
            } catch (_) {}
            const lastScan = Number(GM_getValue("Config.nextActionScanAt", 0)) || 0;
            const cooled = Date.now() - lastScan < 10 * 60 * 1000;
            if (html && html.includes("_next/static/chunks/") && !cooled) {
                const scriptSrcs = [...new Set(html.match(/\/_next\/static\/chunks\/[a-z0-9_\-]+\.js\?dpl=[^"]+/g) || [])]
                    .slice(0, NEXT_ACTION_SCAN_MAX);
                const deadline = Date.now() + NEXT_ACTION_SCAN_BUDGET;
                let scanned = 0;
                for (const src of scriptSrcs) {
                    if (Date.now() > deadline) break;
                    scanned++;
                    try {
                        const chunkText = await Utils.xhr({ url: "https://rewards.bing.com" + src, timeout: 8000 });
                        const match = chunkText.match(/createServerReference\)\("([a-f0-9]{40,44})"[^)]*"reportActivity"\)/);
                        if (match && match[1]) {
                            cached = match[1];
                            RewardsAuto._nextAction = cached;
                            GM_setValue("Config.nextAction", cached);
                            return cached;
                        }
                    } catch (_) {}
                }
                GM_setValue("Config.nextActionScanAt", Date.now());
                Utils.log("🟡", `Server Action ID 探测未命中（扫了 ${scanned} 个 chunk），10 分钟内不再探测，先用现有 ID 继续`);
            }
            return cached;
        },

        /* 只有 form=ML2W4J / ML2Y2H 才是应用搜索签名卡；PUBL=RewardsDO 只是通用
           跟踪参数，把它算进来会把普通 quiz 卡拽去走 CDP，反而做不完。 */
        _isAppSearchCard(card) {
            if (!card) return false;
            /* 互动类卡片（quiz/puzzle 等）不是「应用内搜索」，一律不走 CDP 真搜索。 */
            if (/^(quiz|puzzle|image_creator)$/i.test(String(card.kind || ""))) return false;
            const dest = String(card.destination || "");
            if (!dest) return false;
            const q = dest.includes("?") ? dest.slice(dest.indexOf("?") + 1) : "";
            if (!q) return false;
            const isBingSearch = /bing\.com\/search/i.test(dest);
            const hasSign = /(^|&)form=(ML2W4J|ML2Y2H)(&|$)/i.test(q);
            return isBingSearch && hasSign;
        },

        /* 应用内搜索上报。请求头里的 cookie 是**整体覆盖**语义，只发 _Rwho 会把
           MSPAuth / MUID 等登录态顶掉 → 服务端回 200 但 IsAuthenticated=false，
           卡片永不记账。所以 _Rwho 一律拼在真实 cookie 之后。 */
        _rwhoCookie(deviceType = "d") {
            const today = new Date();
            const p2 = n => String(n).padStart(2, "0");
            return `_Rwho=u=${deviceType}&ts=${today.getFullYear()}-${p2(today.getMonth() + 1)}-${p2(today.getDate())}`;
        },

        /* 拼出「真实登录 cookie + _Rwho」的完整取值。
           Utils.xhr 在没显式给 cookie 时会自动补 _ckReady()，那种情况不用我们操心；
           但只要显式设了 cookie，就必须把真实值一起带上。 */
        _cookieWithRwho(deviceType = "d") {
            let real = "";
            try { real = (Utils._ckReady && Utils._ckReady()) || ""; } catch (_) { real = ""; }
            const rwho = this._rwhoCookie(deviceType);
            if (!real) return rwho;
            /* 已有 _Rwho 就替换成目标设备类型，避免 d/m 混用 */
            if (/(?:^|;\s*)_Rwho=/.test(real)) {
                return real.replace(/_Rwho=[^;]*/, this._rwhoCookie(deviceType));
            }
            return real + "; " + rwho;
        },

        /* 在 CDP 后台页里完成「应用内搜索上报」，全程带桌面应用 UA。
           返回 true/false 表示成功与否；返回 null 表示 CDP 不可用，
           调用方回退到后台 GM_xhr（那种方式对应用专属卡不记账，但聊胜于无）。 */
        async _reportAppSearchViaCdp(query, params, origin) {
            if (typeof WebSocket === "undefined") return null;
            if (!GM_getValue("Config.questViaCdp", true)) return null;
            let page = null;
            try {
                if (!(await CDP.available())) return null;
                /* 用带查询串的入口页：需要先拿到 IG */
                page = await CDP._ownedPage(query, { create: true, reason: "card-cdp" });
                if (!page || !page.webSocketDebuggerUrl) return null;
                if (!CDP._ws || CDP._ws.readyState !== 1) {
                    await CDP.connect(page.webSocketDebuggerUrl);
                }
                const uaOk = await CDP.setAppUA(true);
                if (!uaOk) return null;

                /* 先真实导航到搜索页（不只用 fetch）：服务端要看到「真的搜过」 */
                await CDP.goto(page, query);
                await Utils.randomDelay(1500, 2500);

                const expr = `(async function(){
                    try {
                        /* 关键：用页面真实落地的域，而不是 card.destination 里写的那个。
                           www.bing.com 在国内会 302 跳到 cn.bing.com，此时若仍向
                           www.bing.com 发 fetch，就是跨域请求，会被 CORS 直接拦掉
                           （报 Failed to fetch），等于一次都没发出去。 */
                        var origin = location.origin || ${JSON.stringify(origin)};
                        var params = ${JSON.stringify(params)};
                        var flat = (document.documentElement.outerHTML || "").replace(/\\s/g, "");
                        var m = flat.match(/,IG:"([^"]+)"/);
                        var ig = m ? m[1] : (String(Date.now()) + Math.floor(Math.random()*1e6));
                        var href = location.href;
                        var out = { ig: ig, hasIG: !!m, steps: [] };
                        try {
                            var r1 = await fetch(origin + "/rewardsapp/ncheader?ver=88888888&IID=SERP.5047&IG=" + ig + "&ajaxreq=1", {
                                method: "POST", credentials: "include",
                                headers: { "content-type": "application/x-www-form-urlencoded" },
                                body: "wb=1%3bi%3d1%3bv%3d1"
                            });
                            out.steps.push({ s: "ncheader", status: r1.status });
                        } catch (e) { out.steps.push({ s: "ncheader", err: String(e) }); }
                        try {
                            var r2 = await fetch(origin + "/rewardsapp/reportActivity?IG=" + ig + "&IID=SERP.5047&" + params + "&ajaxreq=1", {
                                method: "POST", credentials: "include",
                                headers: { "content-type": "application/x-www-form-urlencoded" },
                                body: "url=" + encodeURIComponent(href) + "&V=web"
                            });
                            var t = await r2.text();
                            out.steps.push({ s: "reportActivity", status: r2.status,
                                authed: (t.match(/"IsAuthenticated":(true|false)/) || [])[1] || null,
                                increment: (t.match(/"RewardsIncrement":(\\\\d+)/) || [])[1] || null });
                        } catch (e) { out.steps.push({ s: "reportActivity", err: String(e) }); }
                        return JSON.stringify(out);
                    } catch (e) {
                        return JSON.stringify({ fatal: String(e && e.message || e) });
                    }
                })()`;

                const raw = await CDP.evaluate(expr);
                let res = null;
                try { res = JSON.parse(raw || "{}"); } catch (_) { res = null; }
                if (!res || res.fatal) return false;
                const ra = (res.steps || []).find(s => s.s === "reportActivity") || {};
                /* 以前只判断 authed === "false"：fetch 被 CORS 拦掉时 ra 里连 authed
                   字段都没有，于是「一次都没发出去」也被算成上报成功，卡片随即被记成
                   「等手动点击」，当天彻底不再重试 —— 这正是带锁卡永远做不完的原因。
                   现在要求真的拿到 2xx 才算发出。 */
                if (ra.err || !ra.status) {
                    Utils.log("🟠", `应用内搜索上报没有真正发出（${ra.err || "无响应"}），本轮不算完成；`
                        + "下一轮会重试（常见原因：搜索页落到了别的域，跨域被拦）");
                    return false;
                }
                if (ra.status < 200 || ra.status >= 300) {
                    Utils.log("🟠", `应用内搜索上报返回 HTTP ${ra.status}，本轮不算完成`);
                    return false;
                }
                if (ra.authed === "false") {
                    Utils.log("🟠", "应用内搜索上报未被识别为登录态（CDP 通道），这张卡可能不记账");
                    return false;
                }
                Utils.log("🖥️", `  应用内搜索已在应用 UA 下上报（IG ${res.hasIG ? "取自页面" : "随机"}`
                    + `${ra.status ? "，HTTP " + ra.status : ""}）`);
                return true;
            } catch (e) {
                Utils.log("🟡", `CDP 应用搜索上报异常：${e.message}`);
                return false;
            } finally {
                try { await CDP.setAppUA(false); } catch (_) {}
            }
        },

        async reportAppSearchForCard(href) {
            const raw = String(href || "").trim();
            if (!/bing\.com\/search/i.test(raw)) return false;
            const { origin, pathname, search } = (() => {
                try { const u = new URL(raw); return { origin: u.origin, pathname: u.pathname, search: u.search }; }
                catch (_) { return {}; }
            })();
            if (!origin) return false;
            const query = origin + pathname + search;
            const params = search.replace(/^\?/, "");

            /* 先把 cookie 读出来 —— 否则 _cookieWithRwho() 拿不到真实登录态 */
            try { await this.getCookieHeader(); } catch (_) {}

            const baseHeaders = {
                "user-agent": RewardsAuto.desktopAppHeaders["user-agent"],
                "cookie": this._cookieWithRwho(),
            };

            /* 地域跳转：www.bing.com 在本机会 302 到 cn.bing.com，
               rewardsapp 端点两个域都存在，但 IG 必须取自**真正落地**的那个域，
               否则跨域取不到 IG、上报也会打错主机。 */
            const host = (() => {
                try { return new URL(origin).host; } catch (_) { return ""; }
            })();

            /* 首选 CDP 页面通道：只有它能真正把 UA 换成桌面应用身份。
               后台 GM_xhr 设的 user-agent 会被浏览器丢弃，服务端因此把这次上报
               当普通网页搜索处理 —— 不报错，但那几张应用专属卡不会记账。 */
            const viaCdp = await this._reportAppSearchViaCdp(query, params, origin);
            if (viaCdp !== null) return viaCdp;

            let ig = "";
            try {
                const serp = await Utils.xhr({ url: query, headers: baseHeaders });
                const flat = String(serp || "").replace(/\s/g, "");
                const m = flat.match(/,IG:"([^"]+)"/);
                if (m) ig = m[1];
            } catch (_) {}
            if (!ig) ig = Utils.getRandomUUID();
            const reportHeaders = { ...baseHeaders, "referer": query };

            let authed = null;
            try {
                await Utils.xhr({
                    method: "POST",
                    url: `${origin}/rewardsapp/ncheader?ver=88888888&IID=SERP.5047&IG=${ig}&ajaxreq=1`,
                    headers: { ...reportHeaders, "content-type": "application/x-www-form-urlencoded" },
                    data: "wb=1%3bi%3d1%3bv%3d1"
                });
            } catch (_) {}

            try {
                const txt = await Utils.xhr({
                    method: "POST",
                    url: `${origin}/rewardsapp/reportActivity?IG=${ig}&IID=SERP.5047&${params}&ajaxreq=1`,
                    headers: { ...reportHeaders, "content-type": "application/x-www-form-urlencoded" },
                    data: `url=${encodeURIComponent(query)}&V=web`
                });
                /* 服务端会回一帧报告模块配置，里面的 IsAuthenticated 是「这次上报有没有算在你头上」
                   的直接证据。以前这里不看它，才会出现「已受理但未记账」还查不出原因。 */
                const m = String(txt || "").match(/"IsAuthenticated":(true|false)/);
                authed = m ? m[1] === "true" : null;
                if (authed === false) {
                    Utils.log("🟠", `应用内搜索上报未被识别为登录态（${host}）：cookie 可能不完整，这张卡大概率不会记账`);
                }
            } catch (_) {}
            return authed !== false;
        },

        async _claimLevelGatedViaAppSearch(card, { diag = [], name = "" } = {}) {
            const label = name || card.title || card.offerId;
            const offerId = card.offerId;
            const href = String(card.destination || "");
            if (!href || !/bing\.com\/search/i.test(href)) {
                diag.push("lev2search(无搜索href)");
                return false;
            }

            /* 真正记账的是 Server Action 交卷（body 带 hash），搜索上报只是陪跑。
               旧代码先上报、上报失败就 return，永远走不到交卷那一步。 */

            /* 第一步：Server Action 交卷（决定成败的那一步，提到最前面） */
            let submitted = false;
            if (card.hash) {
                try {
                    submitted = await this.claimCardWeb(card);
                    diag.push(submitted ? "lev2(已交卷)" : "lev2(交卷未受理)");
                } catch (e) {
                    diag.push(`lev2(交卷 ${e.message})`);
                }
                /* 交卷命中时是同步生效的，立刻复核一次，省掉等待。 */
                if (await this.isOfferCompleteAny(offerId, true) === true) {
                    Utils.log("🟢", `等级门槛卡完成（交卷通道）：${label}`);
                    return true;
                }
            } else {
                diag.push("lev2(无hash跳过交卷)");
            }

            /* 第二步：交卷没拿下，再补一次应用内搜索上报（老路子，偶尔有用） */
            let searched = false;
            try {
                searched = await this.reportAppSearchForCard(href);
                diag.push(searched ? "lev2search(已上报)" : "lev2search(上报失败)");
            } catch (e) {
                diag.push(`lev2search(${e.message})`);
            }
            if (searched) {
                Utils.log("🔎", `等级门槛卡已按应用内搜索签名上报：${label}`);
                await Utils.randomDelay(2000, 4000);
                if (card.hash) {
                    try {
                        const again = await this.claimCardWeb(card);
                        diag.push(again ? "lev2(二次交卷)" : "lev2(二次交卷未受理)");
                    } catch (e) {
                        diag.push(`lev2(二次交卷 ${e.message})`);
                    }
                }
            }

            /* 第三步：给服务端时间复核。实测入账是异步的，25 秒必然误判，给足 3 分钟。 */
            const deadline = Date.now() + 3 * 60 * 1000;
            while (Date.now() < deadline) {
                const st = await this.isOfferCompleteAny(offerId, true);
                if (st === true) {
                    Utils.log("🟢", `等级门槛卡完成（应用内搜索通道）：${label}`);
                    return true;
                }
                await Utils.delay(10000);
            }
            diag.push("lev2(未标记完成)");
            Utils.log("🟡", `等级门槛卡本轮未完成，下一轮继续：${label}`);
            return false;
        },
        /* 每日活动（DailySet）就是那三张普通卡：Gamification_DailySet_*。
           它们的 offerId 直接调 DAPI 的 activities 接口就能记账，
           既不需要网页交卷，也不需要 CDP 真搜索 —— 以前只要 destination
           长得像搜索页就会走 CDP.realSearch，于是每日活动也在开标签页。 */
        _isDailyActivity(card) {
            if (!card) return false;
            if (card.source === "dapi") return true;
            return card.kind === "daily"
                && /Gamification_DailySet_/i.test(String(card.offerId || ""));
        },

        /* 只有「日常任务」里带锁 🔒 的那类才真的需要 CDP：
           应用专属（appOnly）、等级门槛（levelGated）、应用内搜索签名卡。 */
        _needsCdp(card) {
            if (!card) return false;
            if (this._isDailyActivity(card)) return false;
            if (card.appOnly === true || card.levelGated === true) return true;
            return this._isAppSearchCard(card);
        },

        async claimCard(card, opts = {}) {
            const offerId = card.offerId;
            const name = card.title || offerId;
            const attempts = opts.attempts || 3;
            const backoffs = opts.backoffs || [[8000, 12000], [20000, 30000], [45000, 60000]];
            const diag = [];

            if (this.isManualCard(offerId)) {
                Utils.log("🖐️", `已自动上报搜索，完成状态需手动点击确认：${name}`);
                return false;
            }

            if (this.isUnoffered(offerId)) {
                Utils.log("🔒", `今日已确认做不了，跳过：${name}`);
                return false;
            }

            if (await this.isOfferCompleteAny(offerId, true) === true) {
                Utils.log("✅", `服务端已确认完成：${name}`);
                return true;
            }

            for (let i = 0; i < attempts; i++) {
                if (i > 0) {
                    const [lo, hi] = backoffs[Math.min(i - 1, backoffs.length - 1)];
                    Utils.log("⏳", `等待 ${Math.round(lo / 1000)}~${Math.round(hi / 1000)} 秒后重试（第 ${i + 1}/${attempts} 次）：${name}`);
                    await Utils.randomDelay(lo, hi);
                }
                const ok = await this._claimCardOnceWithTimeout(card, { diag, name, attempt: i + 1 });
                if (ok) return true;
            }

            Utils.log("🟡", `卡片领取未确认（已重试 ${attempts} 次）：${name} [${diag.join(" ")}]`);
            return false;
        },

        async _claimCardOnceWithTimeout(card, { diag = [], name = "", attempt = 1 } = {}) {
            const label = name || card.title || card.offerId;
            let timer = null;
            const timeout = new Promise(resolve => {
                timer = setTimeout(() => {
                    diag.push(`timeout(${CLAIM_ONCE_TIMEOUT / 1000}s)`);
                    Utils.log("🔴", `单卡处理超时（第 ${attempt} 次尝试，${CLAIM_ONCE_TIMEOUT / 1000} 秒）：${label}，放弃这次尝试`);
                    resolve(false);
                }, CLAIM_ONCE_TIMEOUT);
            });
            try {
                return await Promise.race([this._claimCardOnce(card, { diag }), timeout]);
            } finally {
                if (timer) clearTimeout(timer);
            }
        },

        async _claimCardOnce(card, { skipWeb = false, diag = [] } = {}) {
            const offerId = card.offerId;
            const name = card.title || offerId;

            /* 每日活动先走 DAPI：跳过整条网页交卷链，也就不会去碰 CDP。 */
            if (this._isDailyActivity(card) && !this._needsCdp(card)) skipWeb = true;

            if (await this.isOfferCompleteAny(offerId, false) === true) {
                Utils.log("✅", `服务端已确认完成：${name}`);
                return true;
            }

            if (card.destination && /^https?:/i.test(card.destination)) {
                try {
                    await Utils.xhr({
                        url: card.destination,
                        headers: { "user-agent": RewardsAuto.ua.pc, "referer": "https://rewards.bing.com/earn" }
                    });
                    diag.push("visit(ok)");
                } catch (e) {
                    diag.push(`visit(${e.message})`);
                }
                await Utils.randomDelay(1500, 3000);
            }

            if (!skipWeb && card.levelGated && !card.appOnly) {
                const viaSearch = await this._claimLevelGatedViaAppSearch(card, { diag, name });
                if (viaSearch) return true;
            }

            if (!skipWeb && this._isAppSearchCard(card) && this._needsCdp(card)) {

                const searchOk = await this.reportDailyActivity(card.destination);
                diag.push(searchOk ? "search(CDP已点击)" : "search(未处理)");
                if (searchOk) {
                    /* 入账是异步的（实测几分钟），窗口给到 3 分钟再判。 */
                    const deadline = Date.now() + 3 * 60 * 1000;
                    while (Date.now() < deadline) {
                        if (await this.isOfferCompleteAny(offerId, true) === true) {
                            Utils.log("🟢", "应用搜索领取成功：" + name);
                            return true;
                        }
                        await Utils.delay(10000);
                    }
                    diag.push("search(已上报待入账)");
                    /* 上报确实发出去了，只是服务端还没记账 —— 这种卡不要封成
                       「需手动点击」，否则当天再也不重试。下一轮开头会先用
                       isOfferCompleteAny 复核，入账了就自动跳过。 */
                    Utils.log("⏳", `搜索上报已发出，等待服务端入账（下一轮复核）：${name}`);
                    return false;
                }
                /* 连上报都没发出去：同样不封卡，交给下一轮重试。 */
                Utils.log("🟡", `搜索上报未发出，下一轮重试：${name}`);
                return false;
            } else if (!skipWeb && !card.hash) {
                diag.push("web(无hash)");
            } else if (!skipWeb && card.appOnly) {
                await this._claimViaAppChannel(card, { diag, name });
                if (await this.isOfferCompleteAny(offerId, true) === true) return true;
            } else if (!skipWeb && RewardsAuto.state.webNoAuth) {
                diag.push("web(未登录跳过)");
            } else if (!skipWeb && RewardsAuto.state.webFailStreak >= WEB_FAIL_LIMIT) {
                diag.push("web(本轮已熔断)");
            } else if (!skipWeb) {
                let webAccepted = false;
                let webErr = null;
                try {
                    webAccepted = await this.claimCardWeb(card);
                } catch (e) {
                    webErr = e;
                    diag.push(`web(${e.message})`);
                    if (/\b(401|403)\b/.test(String(e.message)) && !RewardsAuto.state.webNoAuth) {
                        RewardsAuto.state.webNoAuth = true;
                        Utils.log("🟡", `网页通道未登录或无权限（${e.message}），后续卡片改用 DAPI 通道`);
                    }
                }
                if (webAccepted) {
                    RewardsAuto.state.webFailStreak = 0;
                    await Utils.randomDelay(2000, 4000);
                    if (await this.isOfferCompleteAny(offerId, true) === true) {
                        Utils.log("🟢", `网页通道领取成功：${name}`);
                        return true;
                    }
                    diag.push("web(已发出但服务端未生效)");
                } else {
                    diag.push("web(请求未被接受)");
                    if (!RewardsAuto.state.webNoAuth) {
                        RewardsAuto.state.webFailStreak += 1;
                        Utils.log("🟠", `网页通道未成功（${name}）：${webErr ? webErr.message : "请求未被接受"}`
                            + `（连续 ${RewardsAuto.state.webFailStreak}/${WEB_FAIL_LIMIT} 次，超限后本轮改用 DAPI）`);
                    }
                }
            }

            const appRes = await this.appActivity(101, offerId);
            if (appRes) {
                diag.push(`dapi(p=${appRes.points}${appRes.isDuplicate ? ",dup" : ""})`);
                if (appRes.points > 0) {
                    Utils.log("🟢", `DAPI 领取成功 +${appRes.points} 分：${name}`);
                    return true;
                }
            } else {
                diag.push("dapi(请求失败)");
            }
            await Utils.randomDelay(1500, 3000);
            if (await this.isOfferCompleteAny(offerId, true) === true) {
                Utils.log("🟢", `DAPI 上报已生效：${name}`);
                return true;
            }

            /* 每日活动兜底：极少数日常卡 DAPI 不记账，再用后台网页通道补一次。
               这条路照样不开标签页 —— page 通道只复用现成页面，
               而且上面 _needsCdp 为 false 时不会走 CDP 真实搜索。 */
            if (this._isDailyActivity(card) && card.hash) {
                try {
                    const webOk = await this.claimCardWeb(card);
                    if (webOk) {
                        diag.push("web(兜底已交卷)");
                        await Utils.randomDelay(1500, 3000);
                        if (await this.isOfferCompleteAny(offerId, true) === true) {
                            Utils.log("🟢", `网页通道兜底成功：${name}`);
                            return true;
                        }
                    } else {
                        diag.push("web(兜底未受理)");
                    }
                } catch (e) {
                    diag.push(`web(兜底 ${e.message})`);
                }
            }
            return false;
        },

        PAGE_BOX: {
            req: "Config.pageReq",
            res: "Config.pageRes",
            alive: "Config.pageAlive"
        },

        async pageServeOnce() {
            const req = GM_getValue(this.PAGE_BOX.req, null);
            if (!req || !req.id || req.done) return false;
            GM_setValue(this.PAGE_BOX.req, { id: req.id, url: req.url, headers: req.headers, body: req.body, at: req.at, done: true });
            const out = { id: req.id, at: Date.now(), status: 0, text: "", error: "" };
            try {
                const r = await fetch(req.url, {
                    method: req.method || "POST",
                    headers: req.headers || {},
                    body: req.body,
                    credentials: "include",
                    redirect: "follow"
                });
                out.status = r.status;
                out.text = String(await r.text()).slice(0, 4000);
            } catch (e) {
                out.error = String((e && e.message) || e);
            }
            GM_setValue(this.PAGE_BOX.res, out);
            return true;
        },

        startPageServer() {
            if (typeof GM_getValue !== "function") return;
            if (this._pageServerStarted) return;
            if (GM_getValue("Config.pageServerOff", false)) return;
            this._pageServerStarted = true;
            const tick = async () => {
                try {
                    if (GM_getValue("Config.pageServerOff", false)) { this._pageServerStarted = false; return; }
                    GM_setValue(this.PAGE_BOX.alive, Date.now());
                    await this.pageServeOnce();
                } catch (_) {}
                this._pageServerTimer = setTimeout(tick, 1500);
                if (this._pageServerTimer && typeof this._pageServerTimer.unref === "function") {
                    this._pageServerTimer.unref();
                }
            };
            this._pageServerTimer = setTimeout(tick, 600);
            if (this._pageServerTimer && typeof this._pageServerTimer.unref === "function") {
                this._pageServerTimer.unref();
            }
        },

        _pageChannelAlive() {
            const at = Number(GM_getValue(this.PAGE_BOX.alive, 0)) || 0;
            return at > 0 && (Date.now() - at) < 40 * 1000;
        },

        async _ensurePageChannel() {
            /* 页面代发通道已停用（开出来的页还要手动再跑一次脚本，收益低），
               方法保留，恒定返回 null。 */
            if (!GM_getValue("Config.allowOpenTab", false)) return null;
            Utils.log("🖥️", "已跳过「打开页面代发通道」：只有 CDP 任务才允许开标签页");
            return null;
        },

        async viaPageChannel(url, headers, body, timeoutMs = 15000, method = "POST") {
            const id = Date.now() + "-" + Math.floor(Math.random() * 1e6);
            GM_setValue(this.PAGE_BOX.res, null);
            GM_setValue(this.PAGE_BOX.req, { id, url, method, headers, body, at: Date.now() });

            const pack = (res) => ({
                ok: res.status >= 200 && res.status < 300,
                status: res.status,
                text: res.text || "",
                error: res.error || ""
            });

            let listenerId = null;
            let settled = false;
            let result = null;

            if (typeof GM_addValueChangeListener !== "undefined") {
                try {
                    listenerId = GM_addValueChangeListener(this.PAGE_BOX.res, (name, oldV, newV) => {
                        if (settled || !newV || typeof newV !== "object") return;
                        if (newV.id !== id) return;
                        settled = true;
                        result = pack(newV);
                    });
                } catch (_) { listenerId = null; }
            }

            const deadline = Date.now() + timeoutMs;
            try {
                while (!settled && Date.now() < deadline) {
                    await Utils.delay(600);
                    const res = GM_getValue(this.PAGE_BOX.res, null);
                    if (res && res.id === id) {
                        settled = true;
                        result = pack(res);
                        break;
                    }
                }
            } finally {
                if (listenerId != null && typeof GM_removeValueChangeListener === "function") {
                    try { GM_removeValueChangeListener(listenerId); } catch (_) {}
                }
            }

            GM_setValue(this.PAGE_BOX.req, null);
            return settled ? result : null;
        },

        /* 动作响应三态：true=做成了；false=明确没做成（领取池空也是 false，
           不是通道失败）；unknown=认不出（错误帧/HTML/空响应）。 */
        _actionVerdict(res) {
            const text = String(res || "");
            if (!text) return "unknown";
            if (/(?:^|\n)[0-9a-f]+:E\{/i.test(text) || /"digest"\s*:/.test(text)) return "unknown";
            if (/^\s*<!doctype\s+html/i.test(text) || /<html[\s>]/i.test(text)) return "unknown";

            const verdicts = [...text.matchAll(/\d+:(true|false)(?![\w{])/g)];
            if (verdicts.length > 0) {
                return verdicts[verdicts.length - 1][1];
            }
            return text.includes('"ok":true') ? "true" : "unknown";
        },

        _actionLooksAccepted(res) {
            return this._actionVerdict(res) === "true";
        },

        QUESTS: {
            weeklyPrefix: /WW_pcparent_RewardsApp_weekly_Exclusive/i,
            /* 桌面周任务子项 offerId 里带星期（WW_pcchild2_urlreward_Sunday_...）。
               服务端新一周从周日下午开始（太平洋 0 点 ≈ 北京周日 16:00），当天只放第 0 张。
               非应用 UA 会把子项全渲染成 isLocked=true，所以不能只靠 isLocked 判断。 */
            weekdayTokens: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],

            /* 从 offerId 里取「本周第几天」（周日=0 … 周六=6）；取不到返回 -1。
               weekdayTokens 顺序与服务端一致：周日是第 0 张。
               （旧版换算成「周一优先」，周日算出索引 6，才引出下面的全解锁事故） */
            weekdayIndex(offerId) {
                const m = String(offerId || "").match(/_pcchild\d+_[A-Za-z0-9]*?_(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)_/i);
                const name = m ? m[1] : String(offerId || "").match(/(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)/i)?.[1];
                if (!name) return -1;
                const lower = name.toLowerCase();
                const sundayBased = this.weekdayTokens.findIndex(w => w.toLowerCase() === lower);
                if (sundayBased < 0) return -1;
                return sundayBased;
            },

            /* 今天在本周的位置（周日=0 … 周六=6），与 weekdayIndex 同一套口径。 */
            todayIndex(now = new Date()) {
                return now.getDay();
            }
        },

        _questLinksFromEarn(earnHtml) {

            const raw = String(earnHtml || "");
            const cleanEarn = raw.replace(/\\"/g, '"');
            const found = new Map();
            const add = (id) => {
                let q = String(id || "").split("?")[0].split("#")[0];
                try { q = decodeURIComponent(q); } catch (_) {}
                if (q && /punchcard/i.test(q) && !found.has(q)) found.set(q, q);
            };

            const text = this._flightText(raw);
            const reFlight = /\/earn\/quest\/([A-Za-z0-9_%.\-]+punchcard[A-Za-z0-9_%.\-]*)/g;
            let m;
            while ((m = reFlight.exec(text)) !== null) add(m[1]);

            const reOffer = /"offerId"\s*:\s*"([^"]*punchcard[^"]*)"/g;
            while ((m = reOffer.exec(cleanEarn)) !== null) add(m[1]);

            const reHref = /"href"\s*:\s*"(\/earn\/quest\/[^"]+)"/g;
            while ((m = reHref.exec(cleanEarn)) !== null) add(m[1].split("/").pop());

            const reHrefHtml = /href="(\/earn\/quest\/[^"]+)"/g;
            while ((m = reHrefHtml.exec(cleanEarn)) !== null) add(m[1].split("/").pop());

            const reEscaped = /\\"href\\":\\"(\/earn\/quest\/[^\\"]+)/g;
            while ((m = reEscaped.exec(raw)) !== null) add(m[1].split("/").pop());

            return [...found.keys()];
        },

        async fetchQuestCards(parentId) {
            const url = "https://rewards.bing.com/earn/quest/" + encodeURIComponent(parentId);
            const html = await Utils.xhr({
                url,
                headers: RewardsAuto.desktopAppHeaders
            });
            if (!html) return { parentId, url, html: "", cards: [] };
            const text = this._flightText(html);
            const cards = [];
            for (const item of this._flightItems(text, "[A-Za-z0-9]*_pcchild[^\"]+")) {
                if (!item.offerId || !item.hash) continue;
                cards.push({
                    offerId: item.offerId,
                    hash: item.hash,
                    title: String(item.ariaLabel || item.linkText || item.offerId).replace(/^\s*\d+\s*[分点]?\s*,?\s*/, "").trim() || item.offerId,
                    isCompleted: item.isCompleted === true,
                    isLocked: item.isLocked === true,
                    href: item.href || item.destination || ""
                });
            }
            /* 父任务的「M/N 个任务」文案：只用于日志对照，不参与判定
               （它不说明是哪几张完成，拿它反推会把当天要做的卡误标成已完成） */
            const pm = text.match(/(\d+)\s*\/\s*(\d+)\s*个任务/);
            const progress = pm ? { done: parseInt(pm[1], 10) || 0, total: parseInt(pm[2], 10) || 0 } : null;
            return { parentId, url, html, text, progress, cards: this._reconcileWeeklyLocks(cards) };
        },

        /* 解锁态对账：isLocked 以服务端为准，绝不改写。
           2026-11-15 事故：旧版周日 idx<=today 恒真，一轮把整周 7 张全交卷。
           （原来的「强制解锁」开关已移除：那正是造成上述事故的逻辑，不该留着。） */
        _reconcileWeeklyLocks(cards) {
            const list = (cards || []).slice();
            const today = this.QUESTS.todayIndex();
            const lockedOpen = list.filter(c => !c.isCompleted && c.isLocked);
            const expected = lockedOpen.filter(c => {
                const idx = this.QUESTS.weekdayIndex(c.offerId);
                return idx >= 0 && idx <= today;
            });
            if (expected.length > 0) {
                Utils.log("🖥️", `桌面周任务：服务端仍有 ${lockedOpen.length} 张锁定`
                    + `（按星期推算其中 ${expected.length} 张本该已解锁，以服务端为准，不解锁）`);
            }
            return list;
        },

        /* 月度计划：与桌面任务同一 quest 结构，差别是父 id 不含 RewardsApp、
           子项更多且按天解锁、全完成 +50。进度只认「M/N 个任务」回读。 */

        MONTH_KEY() {
            const d = new Date();
            return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}`;
        },

        monthlyState() {
            const raw = GM_getValue("Config.monthlyState", null);
            const st = (raw && typeof raw === "object") ? raw : {};
            const month = this.MONTH_KEY();
            if (String(st.month || "") !== month) {
                return { month, paused: false, logDate: 0, quests: {} };
            }
            return {
                month,
                paused: !!st.paused,
                pausedAt: Number(st.pausedAt) || 0,
                logDate: Number(st.logDate) || 0,
                quests: (st.quests && typeof st.quests === "object") ? st.quests : {},
            };
        },

        saveMonthlyState(st) {
            GM_setValue("Config.monthlyState", st);
        },

        /* 同一件事每天只写一条日志：cron 每 2 小时一轮，不加节流会刷屏。
           月度计划的进度属于过程状态，**不推送**——完成与否统一由轮末汇总发一条。 */
        monthlyLog(st, icon, msg) {
            const today = Utils.getTodayNum();
            if (Number(st.logDate) === today) {
                Utils.log(icon, msg);
                return false;
            }
            st.logDate = today;
            this.saveMonthlyState(st);
            Utils.log(icon, msg);
            return true;
        },

        /* 子项动作由 href 决定：/redeem/=领取型；含 RewardsDO 搜索参数=先上报再交卷；
           其它=纯交卷。返回 "redeem"|"search"|"plain"。 */
        monthlyChildKind(href) {
            const h = String(href || "");
            if (/\/redeem/i.test(h)) return "redeem";
            const q = h.includes("?") ? h.slice(h.indexOf("?") + 1) : "";
            if (/bing\.com\/search/i.test(h) && /(^|&)(form=ML2Y2H|form=ML2YB\d|PUBL=RewardsDO)/i.test(q)) return "search";
            return "plain";
        },

        /* 拉详情页并解析：进度 + 子项。进度只认「M/N 个任务」，
           没有这个文案时退化为数子项的 isCompleted，避免把「已解锁但没进度文案」当成 0 进度。 */
        /* 用应用 UA 拉详情页（普通 UA 会渲染成 0/N 且子项全锁）；
           应用 UA 解析不出子项时才退普通 PC UA 兜底。identity 用于日志定位。 */
        async fetchMonthlyQuest(parentId) {
            const url = MONTHLY.PAGE_URL + encodeURIComponent(parentId);
            const identities = [
                { name: "应用 UA", headers: RewardsAuto.desktopAppHeaders },
                { name: "普通 UA", headers: { "user-agent": RewardsAuto.ua.pc, "accept-language": "zh-CN,zh;q=0.9,en;q=0.8" } },
            ];
            let lastReason = "";
            for (const idn of identities) {
                let html = "";
                try {
                    html = await Utils.xhr({ url, headers: idn.headers });
                } catch (e) {
                    lastReason = `详情页请求失败：${e.message}`;
                    continue;
                }
                if (!html) { lastReason = "详情页返回空"; continue; }

                const text = this._flightText(html);
                const cards = [];
                const seen = new Set();
                for (const item of this._flightItems(text, "[A-Za-z0-9]*_pcchild[^\"]+")) {
                    if (!item.offerId || !item.hash || seen.has(item.offerId)) continue;
                    seen.add(item.offerId);
                    cards.push({
                        offerId: String(item.offerId),
                        hash: String(item.hash),
                        title: String(item.ariaLabel || item.linkText || item.offerId)
                            .replace(/^\s*\d+\s*[分点]?\s*,?\s*/, "").trim() || item.offerId,
                        isCompleted: item.isCompleted === true,
                        isLocked: item.isLocked === true,
                        isDisabled: item.isDisabled === true,
                        href: String(item.href || item.destination || ""),
                    });
                }
                const m = text.match(/(\d+)\s*\/\s*(\d+)\s*个任务/);
                const doneByText = m ? parseInt(m[1], 10) : 0;
                const totalByText = m ? parseInt(m[2], 10) : 0;
                const completedCards = cards.filter(c => c.isCompleted).length;
                /* 子项和进度文案至少拿到一样才算「解析成功」，否则换下一个身份兜底 */
                if (cards.length === 0 && totalByText === 0) {
                    lastReason = "未解析到子项";
                    continue;
                }
                if (idn.name !== identities[0].name) {
                    Utils.log("📆", `月度计划：${parentId} 应用 UA 没解析出内容，已用${idn.name}兜底`);
                }
                return {
                    parentId, url, ok: true, identity: idn.name,
                    html, text, cards,
                    done: totalByText > 0 ? doneByText : completedCards,
                    total: totalByText > 0 ? totalByText : cards.length,
                    hasProgressText: !!m,
                    unlockedOpen: cards.filter(c => !c.isCompleted && !c.isLocked && !c.isDisabled).length,
                };
            }
            return { parentId, url, ok: false, reason: lastReason || "解析失败", cards: [] };
        },

        /* 交卷：走和桌面专属任务相同的三种形态探测（earn 页 / quest 页 / 普通 UA），
           成功形态会被记住（Config.questVariant），下次直接用命中的那一种。 */
        async submitMonthlyCard(parentId, card) {
            try {
                const r = await this.submitQuestCard(parentId, card);
                return r || { accepted: false, status: 0, raw: "", variant: "" };
            } catch (e) {
                return { accepted: false, status: 0, raw: e.message, variant: "", diag: e.message };
            }
        },

        /* 完成一个子项：按类型执行动作 + 交卷，然后回读进度确认到底有没有记账。
           返回 { credited, done, total, note } —— credited=false 表示「受理了但服务端没动」，
           调用方据此决定是「今天再试一次」还是「等解锁/等复查」。 */
        async completeMonthlyChild(parentId, card, pageUrl, before) {
            const kind = this.monthlyChildKind(card.href);
            const note = [];
            let accepted = false;

            if (kind === "search") {
                /* 应用内搜索型：先用奖励搜索签名把这次搜索上报掉。
                   reportAppSearchForCard 内部已封装 ncheader + reportActivity 两步。 */
                try {
                    const reported = await this.reportAppSearchForCard(card.href);
                    note.push(reported ? "已上报应用内搜索" : "应用内搜索上报失败");
                } catch (e) {
                    note.push(`应用内搜索上报异常：${e.message}`);
                }
                await Utils.randomDelay(2500, 4500);
            }

            if (kind === "redeem") {
                /* 领取型：带上会话 cookie GET 一次兑换链接就等效于在页面上点「领取」。 */
                try {
                    await Utils.xhr({
                        url: card.href,
                        headers: {
                            "user-agent": RewardsAuto.desktopAppHeaders["user-agent"],
                            "referer": pageUrl,
                        },
                    });
                    note.push("已访问兑换链接");
                } catch (e) {
                    note.push(`兑换链接访问失败：${e.message}`);
                }
                await Utils.delay(5000);
            }

            const sub = await this.submitMonthlyCard(parentId, card);
            accepted = !!sub.accepted;
            note.push(accepted
                ? `交卷已受理${sub.variant ? `（${sub.variant}）` : ""}`
                : `交卷未受理${sub.diag ? `：${sub.diag}` : (sub.status ? `（HTTP ${sub.status}）` : "")}`);

            /* 回读确认：交卷被受理不等于记账，尤其应用搜索型和领取型。
               桌面任务那套是 2~4 秒后回读，这里给 4~7 秒（月度子项服务端处理更慢）。 */
            await Utils.randomDelay(4000, 7000);
            let after = null;
            try {
                after = await this.fetchMonthlyQuest(parentId);
            } catch (_) { after = null; }
            const newDone = after && after.ok ? after.done : -1;
            const credited = newDone > before.done;
            if (credited) note.push(`进度 ${before.done}/${before.total} → ${newDone}/${after.total}`);
            else if (newDone >= 0) note.push(`进度未推进（仍 ${newDone}/${after.total}）`);
            else note.push("进度回读失败");

            return {
                credited,
                accepted,
                kind,
                done: credited ? newDone : before.done,
                total: (after && after.ok && after.total) ? after.total : before.total,
                note: note.join("，"),
            };
        },

        async runMonthlyPlan() {
            const st = this.monthlyState();
            const now = Date.now();
            const today = Utils.getTodayNum();

            /* 本月已全部完成：不是永久封存，而是「约一天内不再请求」。
               月度 quest 偶尔会在月中换一批或补发新的子项，永久封存会整月漏掉；
               每天复查一次只花 1 个 earn 页请求，代价可以接受。 */
            if (st.paused && now - (Number(st.pausedAt) || 0) < MONTHLY.DONE_RECHECK_MS) {
                Utils.log("📆", "月度计划：本月已全部完成，本轮不再执行");
                const sumP = k => Object.keys(st.quests)
                    .reduce((s, id) => s + (Number((st.quests[id] || {})[k]) || 0), 0);
                return {
                    found: Object.keys(st.quests).length, done: sumP("done"), total: sumP("total"),
                    pending: 0, complete: true, skipped: true,
                };
            }

            /* 零请求快速跳过：本轮既没有「今天还能再试」的子项，又还没到下一次复查时间。
               没有这一步的话，cron 每 2 小时就会拉一次 earn 页 + quest 详情页，
               一个月下来上百次请求，既浪费也更容易被判异常。 */
            const ids = Object.keys(st.quests);
            const unfinished = ids.filter(id => !(st.quests[id] || {}).complete);
            if (unfinished.length > 0) {
                const attemptsTodayOf = id => {
                    const q = st.quests[id] || {};
                    return Number(q.attemptDate) === today ? Number(q.attempts) || 0 : 0;
                };
                const retryable = unfinished.filter(id => {
                    const tried = attemptsTodayOf(id);
                    return tried > 0 && tried < MONTHLY.MAX_ATTEMPTS_PER_DAY;
                });
                const allCooling = unfinished.every(id =>
                    now - (Number((st.quests[id] || {}).lastCheckAt) || 0) < MONTHLY.RECHECK_MS);
                if (retryable.length === 0 && allCooling) {
                    const hours = Math.max(1, Math.ceil(MONTHLY.RECHECK_MS / 3600000));
                    this.monthlyLog(st, "📆",
                        `月度计划已检查过，约 ${hours} 小时后复查（${unfinished.map(id => {
                            const q = st.quests[id] || {};
                            return `${q.done || 0}/${q.total || 0}`;
                        }).join("，")}）`);
                    const sum = k => ids.reduce((s, id) => s + (Number((st.quests[id] || {})[k]) || 0), 0);
                    return {
                        found: ids.length, done: sum("done"), total: sum("total"),
                        pending: unfinished.length, complete: false, skipped: true,
                    };
                }
            }

            try { await this.getCookieHeader(); } catch (_) {}

            /* 1) 从 earn 页找出所有月度 punchcard 父任务。
               排除桌面奖励应用每周专属任务（RewardsApp 前缀）——那个由 runDesktopWeeklyQuests 负责，
               两边都跑会对同一批子项重复交卷。 */
            let earnHtml = "";
            try {
                earnHtml = await Utils.xhr({ url: "https://rewards.bing.com/earn", headers: RewardsAuto.desktopAppHeaders });
            } catch (e) {
                Utils.log("🔴", `月度计划：拉取 earn 页失败（${e.message}），本轮跳过`);
                return { found: 0, done: 0, total: 0, pending: 0, complete: false, failed: 1 };
            }
            if (!earnHtml) {
                Utils.log("🔴", "月度计划：earn 页返回空，本轮跳过");
                return { found: 0, done: 0, total: 0, pending: 0, complete: false, failed: 1 };
            }
            const parentIds = this._questLinksFromEarn(earnHtml)
                .filter(id => !this.QUESTS.weeklyPrefix.test(id));
            if (parentIds.length === 0) {
                this.monthlyLog(st, "📆", "月度计划：当前没有进行中的月度 punchcard（可能本月未发布或已完成）");
                return { found: 0, done: 0, total: 0, pending: 0, complete: false };
            }
            /* 又发现入口了：解除「已完成」的封存，正常走一遍（可能是月中换批/补发） */
            if (st.paused) {
                st.paused = false;
                st.pausedAt = 0;
                st.logDate = 0;
                Utils.log("📆", "月度计划：重新发现月度任务入口，解除封存");
            }
            this.saveMonthlyState(st);

            let totalDone = 0, totalTotal = 0, pendingCount = 0, anyProgress = false;
            const reports = [];

            for (const parentId of parentIds) {
                const cached = st.quests[parentId] || {};
                if (cached.complete) {
                    totalDone += Number(cached.done) || 0;
                    totalTotal += Number(cached.total) || 0;
                    reports.push(`${cached.done}/${cached.total}`);
                    continue;
                }

                let snap;
                try {
                    snap = await this.fetchMonthlyQuest(parentId);
                } catch (e) {
                    Utils.log("🔴", `月度计划：读取 ${parentId} 失败（${e.message}），本轮跳过这一个`);
                    pendingCount++;
                    continue;
                }
                if (!snap.ok || snap.cards.length === 0) {
                    if (!snap.ok) Utils.log("🟡", `月度计划：${parentId} ${snap.reason}`);
                    else Utils.log("🟡", `月度计划：${parentId} 未解析到子项`);
                    /* 解析不到不等于完成了，但只要没有待办就不该反复拉页面 */
                    const q = {
                        ...cached, done: cached.done || 0, total: cached.total || 0,
                        complete: false, lastCheckAt: now,
                        attemptDate: cached.attemptDate || 0, attempts: cached.attempts || 0,
                    };
                    st.quests[parentId] = q;
                    this.saveMonthlyState(st);
                    pendingCount++;
                    reports.push(`${q.done}/${q.total}`);
                    continue;
                }

                totalDone += snap.done;
                totalTotal += snap.total;
                Utils.log("📆", `月度计划：${parentId} 进度 ${snap.done}/${snap.total}`
                    + `（子项 ${snap.cards.filter(c => c.isCompleted).length} 已完成 / `
                    + `${snap.cards.filter(c => !c.isCompleted && c.isLocked).length} 未解锁）`);

                const q = {
                    done: snap.done,
                    total: snap.total,
                    complete: snap.total > 0 && snap.done >= snap.total,
                    lastCheckAt: now,
                    lastDoneAt: Number(cached.lastDoneAt) || 0,
                    attemptDate: Number(cached.attemptDate) || 0,
                    attempts: Number(cached.attempts) || 0,
                };

                if (q.complete) {
                    q.attemptDate = 0;
                    q.attempts = 0;
                    st.quests[parentId] = q;
                    this.saveMonthlyState(st);
                    reports.push(`${q.done}/${q.total}`);
                    Utils.log("✅", `月度计划：${parentId} 本月已全部完成`);
                    continue;
                }

                /* 2) 挑一个能做的子项：未完成、已解锁、未禁用。
                   服务端一次只解锁一个，所以取第一个即可，一轮只推进一个子项。 */
                const open = snap.cards.filter(c => !c.isCompleted && !c.isLocked && !c.isDisabled);
                if (open.length === 0) {
                    const locked = snap.cards.filter(c => !c.isCompleted);
                    st.quests[parentId] = q;
                    this.saveMonthlyState(st);
                    reports.push(`${q.done}/${q.total}`);
                    Utils.log("📆", `月度计划：${locked.length} 个子项都还没解锁，`
                        + `约 ${Math.round(MONTHLY.RECHECK_MS / 60000)} 分钟后复查（进度 ${q.done}/${q.total}）`);
                    pendingCount++;
                    continue;
                }

                const card = open[0];
                const attemptsToday = Number(q.attemptDate) === today ? Number(q.attempts) || 0 : 0;
                if (attemptsToday >= MONTHLY.MAX_ATTEMPTS_PER_DAY) {
                    st.quests[parentId] = q;
                    this.saveMonthlyState(st);
                    reports.push(`${q.done}/${q.total}`);
                    Utils.log("📆", `月度计划：子项「${card.title}」今天已尝试 ${attemptsToday} 次仍没推进，`
                        + `约 ${Math.round(MONTHLY.RECHECK_MS / 60000)} 分钟后复查服务端进度`);
                    pendingCount++;
                    continue;
                }

                /* 有轮次在跑就确认它还活着：本轮超时/锁被别的上下文接管时必须立刻停手，
                   不能继续往微软发请求。异常要往上抛（runAll 的 withRetry 对 roundAborted 直接透传），
                   所以这里不能 try/catch 吞掉。手动诊断（没有轮次在跑）时跳过这个检查。 */
                if (TaskManager.running) TaskManager.tick();

                Utils.log("📆", `月度计划：正在完成子项「${card.title}」`
                    + `（${this.monthlyChildKind(card.href) === "search" ? "应用内搜索型"
                        : this.monthlyChildKind(card.href) === "redeem" ? "领取型" : "交卷型"}）`);

                const res = await this.completeMonthlyChild(parentId, card, snap.url, {
                    done: snap.done, total: snap.total,
                });
                Utils.log(res.credited ? "🟢" : "🟡", `月度计划：${res.note}`);

                if (res.credited) {
                    anyProgress = true;
                    q.done = res.done;
                    q.total = res.total || q.total;
                    q.complete = q.total > 0 && q.done >= q.total;
                    q.lastDoneAt = Date.now();
                    q.attemptDate = 0;
                    q.attempts = 0;
                    /* totalDone 在循环开头已经按 snap.done 累加过，这里只补差额 */
                    totalDone += Math.max(0, res.done - snap.done);
                } else {
                    q.done = snap.done;
                    if (Number(q.attemptDate) === today) q.attempts = (Number(q.attempts) || 0) + 1;
                    else { q.attemptDate = today; q.attempts = 1; }
                }
                q.lastCheckAt = Date.now();
                st.quests[parentId] = q;
                this.saveMonthlyState(st);
                reports.push(`${q.done}/${q.total}`);
                if (!q.complete) pendingCount++;
            }

            /* 全部父任务都完成 → 一天内不再请求（次日复查一次，防止月中换批/补发） */
            const allComplete = parentIds.length > 0
                && parentIds.every(id => (st.quests[id] || {}).complete);
            if (allComplete) {
                st.paused = true;
                st.pausedAt = Date.now();
                this.saveMonthlyState(st);
                this.monthlyLog(st, "🔵",
                    `月度计划本月全部完成（${reports.join("，")}），${Math.round(MONTHLY.DONE_RECHECK_MS / 3600000)} 小时后再复查一次`);
            } else if (anyProgress) {
                this.monthlyLog(st, "📆",
                    `月度计划已推进：本次完成 1 个子项（${reports.join("，")}）`);
            } else {
                this.monthlyLog(st, "📆", `月度计划进度：${reports.join("，") || "无"}`);
            }

            return {
                found: parentIds.length,
                done: totalDone,
                total: totalTotal,
                pending: allComplete ? 0 : Math.max(pendingCount, 1),
                complete: allComplete,
                unlocked: 0,
            };
        },

        async _rawXhr(options) {
            const start = Date.now();
            return await new Promise((resolve) => {
                try {
                    GM_xmlhttpRequest({

                        ...options,
                        timeout: Number(options && options.timeout) || 15000,
                        onload: (res) => resolve({
                            status: res.status,
                            text: String(res.responseText || ""),
                            headers: res.responseHeaders || "",
                            cost: (Date.now() - start) / 1000
                        }),
                        onerror: (err) => resolve({
                            status: 0,
                            text: String((err && err.error) || "网络错误"),
                            headers: "",
                            cost: (Date.now() - start) / 1000
                        }),
                        ontimeout: () => resolve({
                            status: -1,
                            text: "请求超时",
                            headers: "",
                            cost: (Date.now() - start) / 1000
                        })
                    });
                } catch (e) {
                    resolve({ status: 0, text: String(e.message), headers: "", cost: 0 });
                }
            });
        },

        _questSubmitVariants() {
            const SRC = "https://rewards.bing.com";
            return [
                { name: "earn页+origin", toEarn: true, headers: { origin: SRC } },
                { name: "quest页+origin", toEarn: false, headers: { origin: SRC } },
                { name: "earn页+普通UA", toEarn: true, headers: { origin: SRC }, plainIdentity: true }
            ];
        },

        async _probeQuestVariant(pageUrl, parentId, card) {
            const saved = GM_getValue("Config.questVariant", "");
            const all = this._questSubmitVariants();
            const ordered = saved
                ? [...all.filter(v => v.name === saved), ...all.filter(v => v.name !== saved)]
                : all;
            const tried = [];
            let last = null;
            for (const v of ordered) {
                const r = await this._submitQuestOnce(pageUrl, parentId, card, v);
                last = r;
                tried.push(`${v.name}=${r.status}`);
                if (r.accepted) {
                    if (saved !== v.name) {
                        GM_setValue("Config.questVariant", v.name);
                        if (saved) Utils.log("🖥️", `桌面任务交卷形态已切换：${saved} → ${v.name}`);
                    }
                    return { variant: v, result: r, tried };
                }
                if (r.status === 401 || r.status === 403) break;
            }
            return { variant: null, result: last, tried };
        },

        async _submitQuestOnce(pageUrl, parentId, card, variant) {
            const nextAction = RewardsAuto._nextAction || GM_getValue("Config.nextAction", ActionMap.FALLBACK.reportActivity);
            const dpl = RewardsAuto._dpl || GM_getValue("Config.dpl", "");
            const payload = JSON.stringify([card.hash, 11, {
                offerid: card.offerId,
                isPromotional: "$undefined",
                timezoneOffset: "-480"
            }]);
            const target = variant.toEarn ? "https://rewards.bing.com/earn" : pageUrl;
            const headers = {
                "content-type": "text/plain;charset=UTF-8",
                "next-action": nextAction,
                "next-router-state-tree": variant.toEarn
                    ? Utils.routerStateTree("earn")
                    : Utils.questRouterStateTree(parentId),
                "referer": target,
                "accept": "text/x-component",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                ...(dpl ? { "x-deployment-id": dpl } : {})
            };
            if (!variant.plainIdentity) Object.assign(headers, RewardsAuto.desktopAppHeaders);
            else headers["user-agent"] = RewardsAuto.ua.pc;
            Object.assign(headers, variant.headers);

            const res = await this._rawXhr({ method: "POST", url: target, headers, data: payload });
            return {
                status: res.status,
                accepted: res.status >= 200 && res.status < 300 && this._actionLooksAccepted(res.text),
                text: res.text,
                cost: res.cost,
                variant: variant.name
            };
        },

        _questDiag(res) {
            const t = String((res && res.text) || "");
            const st = res ? res.status : 0;
            if (st === 0) {
                return `请求未发出（${t.slice(0, 80) || "无响应"}）—— 多半是 XHR 层拒绝了禁改头或缺 @connect 权限`;
            }
            if (st === -1) return "请求超时";
            let kind = "未知";
            if (/login\.live\.com|oauth20_authorize|<title>登录<\/title>|Sign in to/i.test(t)) kind = "登录页";
            else if (/<title>Bing<\/title>|sc_error|class="panda"/i.test(t)) kind = "必应风控页";
            else if (/[0-9a-f]+:E\{|"digest"\s*:/.test(t)) kind = "Next.js错误帧";
            else if (/<html/i.test(t)) kind = "HTML页面";
            const body = t.replace(/\s+/g, " ").slice(0, 160);
            return `HTTP ${st}（${kind}，${res ? res.cost.toFixed(2) : "?"}秒）${body ? " body=" + body : ""}`;
        },

        async submitQuestCard(parentId, card) {
            const pageUrl = "https://rewards.bing.com/earn/quest/" + encodeURIComponent(parentId);
            const nextAction = RewardsAuto._nextAction || GM_getValue("Config.nextAction", ActionMap.FALLBACK.reportActivity);
            const dpl = RewardsAuto._dpl || GM_getValue("Config.dpl", "");
            const payload = JSON.stringify([card.hash, 11, {
                offerid: card.offerId,
                isPromotional: "$undefined",
                timezoneOffset: "-480"
            }]);
            const baseHeaders = {
                "content-type": "text/plain;charset=UTF-8",
                "next-action": nextAction,
                "next-router-state-tree": Utils.questRouterStateTree(parentId),
                "referer": pageUrl,
                "accept": "text/x-component",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                ...(dpl ? { "x-deployment-id": dpl } : {}),
                ...RewardsAuto.desktopAppHeaders
            };

            if (GM_getValue("Config.questViaCdp", true) && typeof WebSocket !== "undefined") {
                try {
                    if (await CDP.available()) {
                        const page = await CDP.ensurePage("https://rewards.bing.com/earn",
                            { nav: false, create: true, reason: "desktop" });
                        if (page && page.webSocketDebuggerUrl) {
                            if (!CDP._ws || CDP._ws.readyState !== 1) {
                                await CDP.connect(page.webSocketDebuggerUrl);
                            }
                            /* 关键：先把网络层 UA 切成桌面应用身份。
                               普通 UA 下这个 action 会返回 true 但服务端不记账，
                               所以「请求成功」在这里完全不等于「卡片完成」。 */
                            const uaOk = await CDP.setAppUA(true);
                            if (!uaOk) {
                                Utils.log("🟡", "CDP 无法覆盖 UA，桌面应用专属卡大概率不会被记账");
                            }
                            const r = await CDP.claimInPage(pageUrl, baseHeaders, payload);
                            if (r.accepted && this._actionLooksAccepted(r.text)) {
                                Utils.log("🖥️", `  经由 CDP 页面通道交卷成功${uaOk ? "（已切换桌面应用 UA）" : ""}`);
                                return { accepted: true, raw: r.text, status: r.status, variant: "CDP页面通道" };
                            }
                            Utils.log("🟡", `CDP 页面通道未受理（HTTP ${r.status}）：${String(r.text).replace(/\s+/g, " ").slice(0, 90)}`);
                        }
                    }
                } catch (eCdp) {
                    Utils.log("🟡", `CDP 页面通道异常：${eCdp.message}`);
                } finally {
                    /* 恢复浏览器本来的 UA，别把调试窗口的其它页面也带成应用身份 */
                    try { await CDP.setAppUA(false); } catch (_) {}
                    try { CDP.close(); } catch (_) {}
                }
            }

            if (GM_getValue("Config.usePageChannel", false)) {
                let tabId = null;
                if (!this._pageChannelAlive()) {
                    tabId = await this._ensurePageChannel();
                }
                if (this._pageChannelAlive()) {
                    const viaPage = await this.viaPageChannel(pageUrl, baseHeaders, payload);
                    if (viaPage && !viaPage.error) {
                        const accepted = viaPage.ok && this._actionLooksAccepted(viaPage.text);
                        if (accepted) {
                            this._claimPageTab = true;
                            return { accepted: true, raw: viaPage.text, status: viaPage.status, variant: "页面通道" };
                        }
                        Utils.log("🖥️", `页面通道未受理（HTTP ${viaPage.status}），改试后台直发`);
                    } else {
                        Utils.log("🟡", "页面通道没有返回结果（页面可能未加载完），改试后台直发");
                    }
                }
            }

            const probed = await this._probeQuestVariant(pageUrl, parentId, card);
            if (probed.variant) {
                return {
                    accepted: true,
                    raw: probed.result.text,
                    status: probed.result.status,
                    variant: probed.variant.name
                };
            }
            const last = probed.result;
            return {
                accepted: false,
                raw: last ? last.text : "",
                status: last ? last.status : 0,
                variant: last ? last.variant : "",
                tried: probed.tried,
                diag: last ? this._questDiag(last) : "无响应"
            };
        },

        async runDesktopWeeklyQuests() {
            Utils.log("🖥️", "扫描桌面奖励应用专属任务…");

            try { await this.getCookieHeader(); } catch (_) {}
            let encEarn;
            try {

                encEarn = await Utils.xhr({
                    url: "https://rewards.bing.com/earn",

                    headers: {
                        ...RewardsAuto.desktopAppHeaders
                    }
                });
            } catch (eEarn) {
                Utils.log("🔴", `桌面专属任务：拉取 earn 页失败（${eEarn.message}），本轮跳过`);
                return { found: 0, done: 0, pending: 0 };
            }
            if (!encEarn) {
                Utils.log("🔴", "桌面专属任务：earn 页返回空，本轮跳过");
                return { found: 0, done: 0, pending: 0 };
            }

            const earnLen = String(encEarn).length;
            const looksLogin = /<title>登录<\/title>|Sign in to your account|oauth20_authorize/i.test(String(encEarn));
            if (looksLogin || earnLen < 60000) {
                Utils.log("🟡", `桌面专属任务：earn 页疑似未登录（长度 ${earnLen}，`
                    + `${looksLogin ? "是登录页" : "比正常页小很多"}）——`
                    + `请检查 GM_cookie 是否授权、账号是否已登录`);
            }

            const questIds = this._questLinksFromEarn(encEarn)
                .filter(id => this.QUESTS.weeklyPrefix.test(id));
            if (questIds.length === 0) {
                const allQuests = this._questLinksFromEarn(encEarn);
                Utils.log("🖥️", "本轮没有桌面奖励应用每周专属任务"
                    + `（earn 页 ${earnLen} 字节，识别到 ${allQuests.length} 个 quest 入口`
                    + (allQuests.length ? `：${allQuests.join("、")}` : "")
                    + "）");
                return { found: 0, done: 0, pending: 0 };
            }
            Utils.log("🖥️", `发现 ${questIds.length} 个桌面专属任务入口：`
                + questIds.map(id => id.replace(/^WW_pcparent_RewardsApp_weekly_Exclusive_?/i, "")).join("、"));

            let totalDone = 0, totalFound = 0, totalPending = 0, totalFailed = 0;
            for (const parentId of questIds) {
                let snap;
                try {
                    snap = await this.fetchQuestCards(parentId);
                } catch (eSnap) {
                    Utils.log("🔴", `桌面专属任务：读取 ${parentId} 失败（${eSnap.message}），跳过这一个`);
                    totalFailed++;
                    continue;
                }
                if (snap.cards.length === 0) {
                    Utils.log("✅", `桌面专属任务本周已全部完成：${parentId}`);
                    continue;
                }
                totalFound += snap.cards.length;
                const open = snap.cards.filter(c => !c.isCompleted);
                if (open.length === 0) {
                    Utils.log("✅", `桌面专属任务本周已全部完成：${parentId}`);
                    continue;
                }

                /* 一天一张，未到日子不碰；已经过去且没做成的要补做。
                   判据只用 offerId 里的星期，不看服务端 isLocked ——
                   服务端对过期卡可能保持锁定，靠它会漏掉全部补做机会。 */
                const todayIdx = this.QUESTS.todayIndex();
                const dayOf = (c) => {
                    const i = this.QUESTS.weekdayIndex(c.offerId);
                    return i >= 0 ? "周" + "日一二三四五六".charAt(i) : "";
                };
                /* 补做恒开：漏掉的周几在这里找回来，不再提供开关 */
                const isOverdue = (c) => {
                    const i = this.QUESTS.weekdayIndex(c.offerId);
                    return i >= 0 && i < todayIdx;
                };
                /* 补做记账：同一天、同一张卡只试一次。
                   服务端对「过期但未解锁」的卡有时不再受理，没有这层记账会每轮重试、
                   日志刷屏还白白触发风控。记账只保留当天，跨天自动清零。 */
                const dayStamp = Utils.getTodayStr();
                let attempted = GM_getValue("State.desktopWeekAttempted", null);
                if (!attempted || typeof attempted !== "object" || String(attempted.date || "") !== dayStamp) {
                    attempted = { date: dayStamp, ids: [] };
                }
                if (!Array.isArray(attempted.ids)) attempted.ids = [];
                const triedToday = new Set(attempted.ids);

                const openUnlocked = open.filter(c => !c.isLocked);
                const unlockedIds = new Set(openUnlocked.map(c => c.offerId));
                const catchUpCards = open.filter(c => !unlockedIds.has(c.offerId) && isOverdue(c));
                const catchUpRun = catchUpCards.filter(c => !triedToday.has(c.offerId));
                const futureLocked = open.filter(c => c.isLocked && !isOverdue(c));
                const unlocked = openUnlocked.concat(catchUpRun);
                if (unlocked.length === 0) {
                    Utils.log("🖥️", `桌面专属任务：${open.length} 张待办全部未解锁（未到对应星期），本轮不处理`);
                } else {
                    Utils.log("🖥️", `桌面奖励应用专属任务：${unlocked.length} 张待办`
                        + `（服务端已解锁 ${openUnlocked.length} 张`
                        + (catchUpCards.length ? `，补做错过的 ${catchUpCards.length} 张` : "")
                        + `；另有 ${futureLocked.length} 张未到日期，不处理）（${parentId}）`);
                    if (catchUpCards.length) {
                        Utils.log("🖥️", `  补做：${catchUpCards.map(c => `${dayOf(c)}「${c.title}」`).join("、")}`);
                    }
                    if (catchUpCards.length > catchUpRun.length) {
                        Utils.log("🖥️", `  其中 ${catchUpCards.length - catchUpRun.length} 张今天已经试过，不再重复交卷`);
                    }
                    for (const c of unlocked) {
                        const d = dayOf(c);
                        const tag = c.isLocked ? "补做" : "已解锁";
                        Utils.log("🖥️", `  · [${tag}${d ? " " + d : ""}] ${c.title}`);
                    }
                    /* 未解锁的也列出来并带上星期，方便对照「网站说 6 张、脚本说 7 张」这类偏差 */
                    const pendingDays = futureLocked
                        .map(c => this.QUESTS.weekdayIndex(c.offerId))
                        .filter(i => i >= 0)
                        .sort((a, b) => a - b)
                        .map(i => "周" + "日一二三四五六".charAt(i));
                    if (pendingDays.length) {
                        Utils.log("🖥️", `  未解锁的：${pendingDays.join("、")}（到对应那天自动处理）`);
                    }
                }

                let doneHere = 0, failedHere = 0;
                for (const card of unlocked) {
                    /* 补做卡先记账再交卷：不管受理与否，今天都不再重试这张 */
                    if (isOverdue(card)) {
                        attempted.ids.push(card.offerId);
                        GM_setValue("State.desktopWeekAttempted", attempted);
                    }

                    if (card.href && /^https?:/i.test(card.href)) {
                        try {
                            const reported = await this.reportAppSearchForCard(card.href);
                            if (reported) Utils.log("🖥️", `  已上报应用搜索：${card.title}`);
                        } catch (_) {}
                        await Utils.randomDelay(1500, 2500);
                    }

                    const maxAttempts = 2;
                    let r = null;
                    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                        try {
                            r = await this.submitQuestCard(parentId, card);
                        } catch (eSubmit) {
                            r = { accepted: false, raw: String(eSubmit.message), status: 0 };
                        }
                        if (r.accepted) break;
                        if (attempt < maxAttempts) {
                            Utils.log("🟡", `桌面任务交卷未受理（第 ${attempt} 次）：${card.title}`
                                + ` [已试形态 ${(r.tried || []).join(",") || r.variant || "-"}]，稍后重试`);
                            await Utils.randomDelay(5000, 9000);
                        }
                    }
                    if (!r || !r.accepted) {
                        failedHere++;
                        totalPending++;   /* 交卷没被受理 = 这张卡没记账，算进「未完成」里 */
                        try {
                            if (card.title && !RewardsAuto.state.desktopPendingTitles.includes(card.title)) {
                                RewardsAuto.state.desktopPendingTitles.push(card.title);
                            }
                        } catch (_) {}
                        Utils.log("🟠", `桌面任务交卷失败：${card.title}`
                            + ` → ${r && r.diag ? r.diag : this._questReason(r && r.raw)}`);
                        if (r && r.tried) {
                            Utils.log("🖥️", `  形态尝试结果：${r.tried.join(" / ")}`);
                        }
                        continue;
                    }
                    if (r.variant && r.variant !== "无origin") {
                        Utils.log("🖥️", `  本次用「${r.variant}」形态交卷成功`);
                    }
                    await Utils.randomDelay(2000, 4000);
                    let after;
                    try {
                        after = await this.fetchQuestCards(parentId);
                    } catch (eAfter) {
                        Utils.log("🟡", `桌面任务已受理但复核失败（${eAfter.message}）：${card.title}，按待定处理`);
                        totalPending++;
                        continue;
                    }
                    const stillThere = after.cards.some(c => c.offerId === card.offerId && !c.isCompleted);
                    if (stillThere) {
                        totalPending++;
                        Utils.log("🟡", `桌面任务已受理但未记账（服务端没加分）：${card.title}`);
                    } else {
                        doneHere++;
                        Utils.log("🟢", `桌面专属任务完成：${card.title}`);
                    }
                }
                totalDone += doneHere;
                let verify = null;
                try {
                    verify = await this.fetchQuestCards(parentId);
                } catch (_) {}
                if (verify && verify.cards.every(c => c.isCompleted)) {
                    Utils.log("🔵", `桌面应用每周专属任务全部完成（本次完成 ${doneHere} 张）`);
                } else {

                    const leftUnlocked = verify ? verify.cards.filter(c => !c.isCompleted && !c.isLocked) : [];
                    /* 已过期但仍锁定的，是今天试过补做、服务端没受理的那几张；
                       它们不算「还要等哪一天」，单独归到补做失败里 */
                    const leftLockedCards = verify
                        ? verify.cards.filter(c => !c.isCompleted && c.isLocked && !isOverdue(c))
                        : [];
                    const leftOverdue = verify
                        ? verify.cards.filter(c => !c.isCompleted && c.isLocked && isOverdue(c)).length
                        : 0;
                    const leftLocked = leftLockedCards.length;
                    if (leftUnlocked.length > 0) {
                        /* 记下待记账的标题，供收尾通知点名 */
                        try {
                            for (const c of leftUnlocked) {
                                if (c.title && !RewardsAuto.state.desktopPendingTitles.includes(c.title)) {
                                    RewardsAuto.state.desktopPendingTitles.push(c.title);
                                }
                            }
                        } catch (_) {}
                    }
                    /* 未解锁的按星期列出，避免只给一个数字看不懂「到底还差哪几天」 */
                    const lockedDays = leftLockedCards
                        .map(c => this.QUESTS.weekdayIndex(c.offerId))
                        .filter(i => i >= 0)
                        .sort((a, b) => a - b)
                        .map(i => "周" + "日一二三四五六".charAt(i));
                    Utils.log("🟡", `桌面应用每周专属任务：本次完成 ${doneHere} 张、失败 ${failedHere} 张`
                        + (leftUnlocked.length > 0
                            ? `，仍剩 ${leftUnlocked.length} 张已解锁未完成（${leftUnlocked.map(c => c.title).join("、")}）`
                            : (leftLocked > 0 ? "，今日已解锁的都处理完了" : ""))
                        + (leftLocked > 0
                            ? `（另有 ${leftLocked} 张未解锁${lockedDays.length ? "：" + lockedDays.join("、") : ""}，到对应那天自动处理）`
                            : "")
                        + (leftOverdue > 0
                            ? `（还有 ${leftOverdue} 张补做未成功，服务端没受理，今天不再重试）`
                            : ""));
                }
            }
            if (totalFailed > 0) {
                /* 只写日志：这类失败下一轮会重试，收尾通知里也会点名 */
                Utils.log("🟠", `桌面专属任务本轮有 ${totalFailed} 个入口读取失败，下一轮会再试`);
            }
            return { found: totalFound, done: totalDone, pending: totalPending, failed: totalFailed };
        },

        _questReason(raw) {
            const t = String(raw || "");
            if (!t) return "无响应";
            if (/HTTP 500/.test(t)) return "HTTP 500（必应风控拦截，多半是 Origin/UA 特征）";
            if (/\b(401|403)\b/.test(t)) return "未登录或无权限，请检查 Cookie / 登录态";
            if (/HTTP (404|405)/.test(t)) return "接口/路由不存在（action ID 或 quest 页面可能已变更）";
            if (/请求超时|timeout/i.test(t)) return "请求超时";
            return t.replace(/\s+/g, " ").slice(0, 110);
        },

        async postAction(req, { savedKey = "Config.actionVariant", stopOnFalse = false } = {}) {
            const saved = String(GM_getValue(savedKey, "") || "");
            const order = (saved && BrowserEnv.channelOrder().includes(saved))
                ? [saved, ...BrowserEnv.channelOrder().filter(v => v !== saved)]
                : BrowserEnv.channelOrder();
            const tried = [];
            let accepted = null;
            let last = null;
            /* 「请求到了服务端、但它明确回答 false」要单独记下来：
               领取接口在空池时就是这么回，这既不是通道失败也不是领到，
               调用方（领取积分）需要靠它区分「没什么可领」和「通道被拒」。 */
            let lastReached = null;
            for (const v of order) {
                let r;
                try {
                    r = await this._postVia(v, req);
                } catch (e) {
                    r = { ok: false, status: 0, text: String((e && e.message) || e), variant: v, reached: false };
                }
                tried.push(`${v}=${r.status}${r.ok ? "✓" : (r.reached ? "✗" : "·")}`);
                if (r.status > 0) last = r;
                if (r.reached && r.verdict === "false") lastReached = r;
                if (r.ok) { accepted = r; break; }
                if (r.status === 401 || r.status === 403) break;
                /* 服务端已经明确回答「没有可领的」：再换通道问一遍也是同一个答案，
                   反而让空池场景多打两发请求。 */
                if (stopOnFalse && lastReached) break;
            }
            if (accepted && accepted.variant !== saved) {
                GM_setValue(savedKey, accepted.variant);
                if (saved) Utils.log("🎁", `动作请求通道已切换：${saved} → ${accepted.variant}`);
            }
            if (accepted) return accepted;
            const pick = lastReached || last;
            return {
                ok: false,
                /* 服务端确实回过话（哪怕回答 false）也算 reached，文案与重试策略都靠它 */
                reached: !!(lastReached || (last && last.reached)),
                verdict: lastReached ? "false" : ((last && last.verdict) || "unknown"),
                status: pick ? pick.status : 0,
                text: pick ? pick.text : "",
                variant: pick ? pick.variant : "",
                tried
            };
        },

        /* 一次通道尝试的收尾：把「HTTP 到达」和「服务端怎么回答」拆成两件事。
           delivered = 请求真的到了服务端（2xx），响应可被解读；
           verdict   = true / false / unknown。 */
        _judgeSent(status, text, variant) {
            const delivered = status >= 200 && status < 300;
            const verdict = delivered ? this._actionVerdict(text) : "unknown";
            return {
                ok: delivered && verdict === "true",
                reached: delivered, verdict,
                status, text, variant
            };
        },

        async _postVia(variant, req) {
            if (variant === "page") {
                if (!(await CDP.available())) return { ok: false, status: 0, text: "CDP 不可用", variant, reached: false };
                const page = await this._anyRewardsPage();
                if (!page) return { ok: false, status: 0, text: "没有可用的 rewards 页面", variant, reached: false };
                await CDP.usePage(page);
                const r = await CDP.claimInPage(req.url, req.headers, req.data);
                return this._judgeSent(r.status, r.text, variant);
            }
            if (variant === "proxy") {
                if (!this._pageChannelAlive()) return { ok: false, status: 0, text: "页面代发服务不在线", variant, reached: false };
                const r = await this.viaPageChannel(req.url, req.headers, req.data, 20000);
                if (!r) return { ok: false, status: 0, text: "页面代发超时", variant, reached: false };
                return this._judgeSent(r.status, r.text || r.error || "", variant);
            }
            const r = await this._rawXhr({ method: "POST", url: req.url, headers: req.headers, data: req.data });
            return this._judgeSent(r.status, r.text, variant);
        },

        /* 只读借用：页面里只发 fetch，不改地址，所以用你自己开着的 rewards 页也完全无感。 */
        async _anyRewardsPage() {
            /* 只借用已经开着的 rewards 页，绝不会为了发一条请求去新建标签页。 */
            return await CDP.ensurePage("https://rewards.bing.com/earn", { nav: false, create: false });
        },

        async claimCardWeb(card, { appChannel = false } = {}) {
            const useAppUA = appChannel || card.appOnly === true || card.kind === "desktop_app";
            const isDash = card.kind === "daily" || card.kind === "streak" || card.source === "getuserinfo";
            const pageUrl = card.kind === "desktop_app"
                ? (card.url || "https://rewards.bing.com/earn")
                : (isDash ? "https://rewards.bing.com/dashboard" : "https://rewards.bing.com/earn");
            const referer = card.url || pageUrl;
            const segment = isDash ? "dashboard" : "earn";
            let nextAction = RewardsAuto._nextAction || GM_getValue("Config.nextAction", ActionMap.FALLBACK.reportActivity);

            const extraAppHeaders = card.kind === "desktop_app" ? RewardsAuto.desktopAppHeaders : {};
            const dpl = RewardsAuto._dpl || GM_getValue("Config.dpl", "");
            const buildHeaders = () => ({
                "content-type": "text/plain;charset=UTF-8",
                "next-action": nextAction,
                "referer": referer,

                "next-router-state-tree": Utils.routerStateTree(segment),
                "accept": "text/x-component",
                "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                ...(dpl ? { "x-deployment-id": dpl } : {}),
                ...extraAppHeaders,
                "user-agent": useAppUA ? RewardsAuto.ua.rewardsApp : RewardsAuto.ua.pc
            });
            const payload = JSON.stringify([card.hash, 11, { offerid: card.offerId, isPromotional: "$undefined", timezoneOffset: "-480" }]);

            try {

                const hit = await this.postAction(
                    { url: pageUrl, headers: buildHeaders(), data: payload },
                    { savedKey: "Config.claimActionVariant" }
                );
                const accepted = !!hit.ok;

                if (!accepted || GM_getValue("Config.debugDAPI", false)) {
                    Utils.log("🔬", `交卷响应(${String(card.offerId).slice(0, 36)})：`
                        + `受理=${accepted} 通道=${hit.variant || "无"}${hit.tried ? `(${hit.tried})` : ""} `
                        + `ua=${useAppUA ? "app" : "pc"} dpl=${dpl || "无"} `
                        + `hash=${String(card.hash || "").slice(0, 20)} appOnly=${!!card.appOnly} `
                        + `src=${card.source || "-"} kind=${card.kind || "-"} `
                        + `body=${JSON.stringify(String(hit.text || "").replace(/\s+/g, " ").slice(0, 240))}`);
                }
                if (accepted) {
                    this._webCompleteCache = null;
                    return true;
                }
                if (hit.status === 401 || hit.status === 403) {
                    if (!RewardsAuto.state.webNoAuth) {
                        RewardsAuto.state.webNoAuth = true;
                        Utils.log("🟡", `网页通道未登录或无权限（HTTP ${hit.status}），后续卡片改用 DAPI 通道`);
                    }
                    return false;
                }
                if (hit.status === 503) return false;
                if (String(hit.text || "").includes("404") || hit.status === 404) {
                    Utils.log("🟡", "Server Action ID 可能已更新，尝试动态探测...");
                    try {
                        ActionMap.clear();
                        const earnHtml = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                        nextAction = await this.getNextActionHash(earnHtml);
                        const retry = await this.postAction(
                            { url: pageUrl, headers: buildHeaders(), data: payload },
                            { savedKey: "Config.claimActionVariant" }
                        );
                        if (retry.ok) {
                            this._webCompleteCache = null;
                            return true;
                        }
                    } catch (_) {}
                }
            } catch (e2) {

                Utils.log("🔬", `交卷异常(${String(card.offerId).slice(0, 36)})：`
                    + `ua=${useAppUA ? "app" : "pc"} dpl=${dpl || "无"} kind=${card.kind || "-"} `
                    + `err=${e2.message}`);

                if (/HTTP 503/.test(String(e2.message))) {
                    return false;
                }
                if (/\b(401|403)\b/.test(String(e2.message))) {
                    if (!RewardsAuto.state.webNoAuth) {
                        RewardsAuto.state.webNoAuth = true;
                        Utils.log("🟡", `网页通道未登录或无权限（${e2.message}），后续卡片改用 DAPI 通道`);
                    }
                    return false;
                }
                if (e2.message.includes("404")) {
                    Utils.log("🟡", "Server Action ID 可能已更新，尝试动态探测...");
                    try {
                        ActionMap.clear();
                        const earnHtml = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                        nextAction = await this.getNextActionHash(earnHtml);
                        const retryRes = await Utils.xhr({ method: "POST", url: pageUrl, headers: buildHeaders(), data: payload });
                        if (retryRes) return true;
                    } catch (_) {}
                }
            }

            /* 以前这里无条件调 reportDailyActivity —— 它内部会走 CDP.realSearch
               整页导航，也就是会静默开一个标签页。每日活动只该走 DAPI 记账。 */
            if (this._needsCdp(card) && card.destination && card.destination.startsWith("http")) {
                try {
                    await this.reportDailyActivity(card.destination);
                    return true;
                } catch (_) {}
            }

            try {
                const token = await this.getRewardsToken();
                if (token) {
                    await Utils.xhr({
                        method: "POST",
                        url: "https://rewards.bing.com/api/reportactivity?X-Requested-With=XMLHttpRequest",
                        headers: {
                            "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                            "user-agent": RewardsAuto.ua.pc,
                            "referer": referer,
                            "origin": "https://rewards.bing.com",
                            "x-requested-with": "XMLHttpRequest"
                        },
                        data: new URLSearchParams({
                            id: card.offerId, hash: card.hash, timeZone: 480,
                            activityAmount: 1, dbs: 0, form: "", type: "",
                            __RequestVerificationToken: token
                        }).toString()
                    });
                    return true;
                }
            } catch (_) {}

            Utils.log("🟡", `卡片领取未确认(${card.offerId})`);
            return false;
        },

        async _claimViaAppChannel(card, { diag = [], name = "" } = {}) {
            const label = name || card.title || card.offerId;
            if (!card.hash) {
                diag.push("app(无hash)");
                return false;
            }
            try {
                const accepted = await this.claimCardWeb(card, { appChannel: true });
                if (!accepted) {
                    diag.push("app(请求未被接受)");
                    return false;
                }
                diag.push("app(已交卷)");
                await Utils.randomDelay(2000, 4000);
                if (await this.isOfferCompleteAny(card.offerId, true) === true) {
                    Utils.log("🟢", `应用通道领取成功：${label}`);
                    return true;
                }
                Utils.log("🟡", `应用通道已交卷，等待服务端记账：${label}`);
                return false;
            } catch (e) {
                diag.push(`app(${e.message})`);
                Utils.log("🟡", `应用通道交卷失败（${label}）：${e.message}`);
                return false;
            }
        },

        extractIG(html) {
            if (!html) return "";
            const patterns = [
                /IG:"([0-9A-F]{16,40})"/i,
                /"IG"\s*:\s*"([0-9A-F]{16,40})"/i,
                /[?&]IG=([0-9A-F]{16,40})/i,
            ];
            for (const re of patterns) {
                const m = html.match(re);
                if (m && m[1]) return m[1].toUpperCase();
            }
            return "";
        },

        async getSearchPage(query, isMobile = false) {
            const mkt = GM_getValue("Config.lock", true) ? "&mkt=zh-CN" : "";
            const deviceType = isMobile ? "m" : "d";
            try { await this.getCookieHeader(); } catch (_) {}
            return Utils.xhr({
                url: `https://${RewardsAuto.state.host}/search?q=${encodeURIComponent(query)}&form=QBLH${mkt}`,
                headers: {
                    "user-agent": isMobile ? RewardsAuto.ua.mobile : RewardsAuto.ua.pc,
                    /* 不能只发 _Rwho：请求头 cookie 是整体覆盖，会把登录态顶掉 */
                    "cookie": this._cookieWithRwho(deviceType),
                    "referer": `https://${RewardsAuto.state.host}/?form=QBLH`,
                    "cache-control": "no-cache",
                    "pragma": "no-cache"
                }
            });
        },

        async reportSearch(html, query, isMobile = false) {
            try {
                const ig = this.extractIG(html) || Utils.getRandomUUID();
                const mkt = GM_getValue("Config.lock", true) ? "&mkt=zh-CN" : "";
                const params = `q=${encodeURIComponent(query)}&form=QBLH${mkt}`;
                const deviceType = isMobile ? "m" : "d";
                try { await this.getCookieHeader(); } catch (_) {}
                const headers = {
                    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "user-agent": isMobile ? RewardsAuto.ua.mobile : RewardsAuto.ua.pc,
                    "referer": `https://${RewardsAuto.state.host}/?form=QBLH`,
                    /* 只发 _Rwho 会把登录态整体顶掉 → 服务端 IsAuthenticated=false，
                       上报「成功」却不记账。必须带上真实 cookie。 */
                    "cookie": this._cookieWithRwho(deviceType)
                };
                await Utils.xhr({
                    method: "POST",
                    url: `https://${RewardsAuto.state.host}/rewardsapp/ncheader?ver=88888888&IID=SERP.5047&IG=${ig}&ajaxreq=1`,
                    headers, data: "wb=1%3bi%3d1%3bv%3d1"
                });
                const txt = await Utils.xhr({
                    method: "POST",
                    url: `https://${RewardsAuto.state.host}/rewardsapp/reportActivity?IG=${ig}&IID=SERP.5047&${params}&ajaxreq=1`,
                    headers,
                    data: `url=${encodeURIComponent(`https://${RewardsAuto.state.host}/search?${params}`)}&V=web`
                });
                const authed = String(txt || "").match(/"IsAuthenticated":(true|false)/);
                if (authed && authed[1] === "false") {
                    Utils.log("🟠", "搜索上报未被识别为登录态（IsAuthenticated=false），这次搜索可能不记账");
                    return false;
                }
                /* 上报「被受理」≠「已记账」：同一个 IG 反复打 reportActivity，每次都回
                   200 + IsAuthenticated:true + RewardsIncrement:1，计数器却不涨。
                   这里只表示「请求发出去了」；到没到账由 doSearch 的配额回读判定。 */
                return true;
            } catch (e) {
                Utils.log("🟡", `搜索上报失败: ${e.message}`);
                return false;
            }
        },

        async checkRegion() {
            if (!RegionGuard.enabled()) {
                /* 出口检测关掉时没人设 host，仍要按落地页校正一次，
                   否则会一直拿 www.bing.com 去发搜索上报（见 syncSearchHost）。 */
                await this.syncSearchHost();
                return true;
            }
            const v = await RegionGuard.check({ fresh: true });
            if (v.ok) {
                /* 国内必须把 host 落到 cn.bing.com：www 会 302 到 cn，
                   POST 跟随后请求体丢失，服务端看到空上报，照样回 200 但不计分。 */
                await this.syncSearchHost();
                return true;
            }
            if (!v.ipInfo) await this.getIPInfo();
            return false;
        },

        /* 把 RewardsAuto.state.host 校正成「真实落地」的搜索域。
           只做一次、结果缓存，失败不抛错（保持原来的 www.bing.com）。 */
        async syncSearchHost() {
            if (this._hostSynced) return RewardsAuto.state.host;
            this._hostSynced = true;
            const prev = RewardsAuto.state.host;
            try {
                const res = await Utils.xhrFull({
                    method: "GET",
                    url: `https://${prev}/search?q=bing&form=QBLH`,
                    headers: { "user-agent": RewardsAuto.ua.pc, "cache-control": "no-cache" },
                    timeout: 15000
                });
                let landed = "";
                try { landed = new URL(res.finalUrl || "").host; } catch (_) { landed = ""; }
                if (!landed) {
                    /* finalUrl 拿不到时退回看正文：国内首页会带 cn.bing.com 的痕迹 */
                    const txt = String(res.text || "");
                    if (/cn\.bing\.com|京ICP备|beian\.miit\.gov\.cn/i.test(txt)) landed = "cn.bing.com";
                }
                if (landed && /(^|\.)bing\.com$/i.test(landed) && landed !== prev) {
                    RewardsAuto.state.host = landed;
                    Utils.log("🖥️", `搜索域已按实际落地校正：${prev} → ${landed}`);
                }
            } catch (_) { /* 保持原值 */ }
            return RewardsAuto.state.host;
        },

        async getIPInfo() {
            try {
                const qryResult = await Utils.xhr({
                    url: "https://disp-qryapi.3g.qq.com/v1/dispatch",
                    headers: { "referer": "https://3g.qq.com/" }
                });
                if (qryResult && Utils.isJSON(qryResult)) {
                    const resJSON = JSON.parse(qryResult);
                    RewardsAuto.state.ip = (resJSON.code == 0 && resJSON.extra && resJSON.extra.ip) ? resJSON.extra.ip : "";
                    let rawInfo = (resJSON.code == 0 && resJSON.ipInfo) ? String(resJSON.ipInfo) : "";
                    rawInfo = rawInfo.replace(/[#*]+/g, " ").trim();
                    RewardsAuto.state.ipInfo = rawInfo ? `🌏所在地区：${rawInfo}` : "";
                }
            } catch {
                console.debug("获取附加 IP 信息失败");
            }
        },

        /* ── 词源链（与 zy.js 对齐）：uapis 热搜 → 热榜接口逐个降级 → 内置随机词。
           每一级都留日志：试了哪个站点、为什么退、最后用了谁。以前二级源失败时
           静默返回随机词，日志里一个接口名都看不到，看起来像「没走过接口」。── */

        /* 解析热榜 JSON：兼容 {data:[{title}]}（nntool / baiwumm / cnxiaobai）
           与 {list:[{title}]}（uapis）两种结构，清洗规则与 zy.js 一致。 */
        parseHotWords(text) {
            if (!text || !Utils.isJSON(text)) return null;
            let res = null;
            try { res = JSON.parse(text); } catch (_) { return null; }
            const raw = (res && (res.data || res.list)) || null;
            if (!Array.isArray(raw)) return null;
            const seen = new Set();
            const titles = [];
            for (const item of raw) {
                const t = String((item && (item.title || item.name)) || "").trim();
                if (!t) continue;
                const cleaned = t.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, "");
                if (cleaned.length >= 2 && cleaned.length <= 20 && !seen.has(cleaned)) {
                    seen.add(cleaned);
                    titles.push(cleaned);
                }
            }
            return titles.length > 0 ? titles : null;
        },

        /* 把内存缓存写回 GM，跨 @crontab 后台上下文存活。 */
        saveHotCache() {
            try { GM_setValue("Config.hotWordsCache", RewardsAuto.apiConfig.cache); } catch (_) {}
        },
        saveUapisCache() {
            /* 只存 at 供失败退避用；titles 与 hotWordsCache.list 是同一批词，不重复存 */
            try {
                GM_setValue("Config.uapisCache", { at: RewardsAuto.apiConfig.uapis.at });
            } catch (_) {}
        },

        /* 任务开始时拉一批热搜词：多源累积，凑够 MIN 条（默认 100）。
           顺序：uapis 一批 → 二级源逐站点聚合 → 内置随机词补足到 MIN。
           两级去重：① 词去重（seen）；② 平台去重（usedPlatforms）——
           uapis 取过百度，二级源就不再取百度，改取没用过的平台，避免重复榜单。
           本轮后续搜索只从 cache.list 随机抽，不再碰接口。 */
        async prefetchHotWords() {
            const cache = RewardsAuto.apiConfig.cache;
            const MIN = Math.max(20, Number(GM_getValue("Config.hotMinCount", 100)) || 100);
            if (RewardsAuto.apiConfig.mode === "offline") {
                cache.list = [];
                cache.source = "";
                cache.apiName = "";
                cache.at = 0;
                cache.failAt = 0;
                cache.date = 0;
                return;
            }
            /* 当天复用闸门：一天只在首个执行点真正拉一次热搜词，其余执行点直接复用落盘的词池。
               @crontab 每个执行点都是全新后台上下文、内存必清零，但 cache 由 GM 持久化跨上下文存活。
               旧代码没有这道闸门：每个执行点都 force=true 重打 16+3 个接口，一天 5~8 轮就是上百次请求。
               判定用「日期号」而不是 TTL：热搜一天内变化不大，当天拉过就够用，跨天自然重拉。
               注意：只有「确实从接口拿到词」才会记 date（见本函数末尾），全挂+随机补足的那次不记，
               留给下一轮再试真接口。 */
            const today = Utils.getTodayNum();
            if (cache.date === today && Array.isArray(cache.list) && cache.list.length >= MIN) {
                Utils.log("🔥", `复用今日热搜词：${cache.list.length} 条（当天首轮已拉取，本轮不再请求接口）`);
                return;
            }
            const seen = new Set();
            const usedPlatforms = new Set();   // 平台去重：跨 uapis / 二级源共享，已取的平台不再取
            const pool = [];
            const add = (list, tag) => {
                if (!Array.isArray(list)) return 0;
                let n = 0;
                for (const w of list) {
                    const s = String(w || "").trim();
                    if (s && !seen.has(s)) { seen.add(s); pool.push(s); n++; }
                }
                if (n > 0) srcTags.push(`${tag}+${n}`);
                return n;
            };
            const srcTags = [];

            /* ① 一级源 uapis（force 绕过自身 TTL/退避） */
            try {
                add(await this.getUapisHotWords(true, usedPlatforms), "uapis");
            } catch (e) {
                Utils.log("🟡", `uapis 热搜异常：${e && e.message ? e.message : e}`);
            }

            /* ② 二级源：逐站点聚合，凑够 MIN 就停（站点已在 getApiHotWords 内部全平台聚合） */
            if (pool.length < MIN) {
                try {
                    const apiRes = await this.getApiHotWords(usedPlatforms);
                    if (apiRes) add(apiRes.titles, apiRes.name);
                } catch (e) {
                    Utils.log("🟡", `热榜接口异常：${e && e.message ? e.message : e}`);
                }
            }

            /* ③ 还不够：内置随机词补足到 MIN，保证词池下限 */
            if (pool.length < MIN) {
                const bases = ["天气预报", "今日新闻", "体育赛事", "股票行情", "电影推荐",
                    "科技资讯", "美食食谱", "旅游攻略", "历史上的今天", "健康常识",
                    "周末去哪儿", "数码产品推荐", "穿衣搭配", "居家收纳", "健身计划"];
                while (pool.length < MIN) {
                    const b = bases[Utils.randomRange(0, bases.length - 1)];
                    const w = `${b} ${Math.random().toString(36).slice(2, 6)}`;
                    if (!seen.has(w)) { seen.add(w); pool.push(w); }
                }
                srcTags.push(`随机补足+${pool.length}`);
            }

            cache.list = pool.sort(() => Math.random() - 0.5);
            cache.source = srcTags.length ? "mixed" : "";
            cache.apiName = srcTags.join(" ");
            cache.at = Date.now();
            cache.failAt = 0;
            /* 只有拿到真接口词（uapis / 二级源）才记日期、完成「一天一次」；
               若 srcTags 只有「随机补足」说明所有热搜源全挂，这次不算数 —— 不记 date，
               下一个执行点会再试真接口，避免一整天都用内置随机词。 */
            const gotReal = srcTags.some(t => !t.startsWith("随机补足"));
            cache.date = gotReal ? today : 0;
            this.saveHotCache();
            Utils.log("🔥", `本轮热搜词已加载：${pool.length} 条（${srcTags.join(" / ")}）`
                + (gotReal ? "；今天不再重复拉取" : "；热搜源全挂，用随机词补足，下轮再试真接口"));
        },

        /* 一级源：uapis.cn 多平台聚合。
           从 44 个平台里随机抽一批并发（默认 16，可用 Config.hotUapisCount 调整），
           一次拿够词又避开整批 44 个同时打过去触发的限流；每轮换一批，词池更多样。
           usedPlatforms：本轮已取过的平台，优先从没用过的里抽；选中的登记进去供二级源跳过。
           force 时忽略自身 TTL 与失败退避。 */
        async getUapisHotWords(force = false, usedPlatforms = null) {
            const cfg = RewardsAuto.apiConfig.uapis;
            const now = Date.now();
            const TTL = 30 * 60 * 1000;
            if (!force && cfg.titles.length > 0 && now - cfg.at < TTL) return cfg.titles;
            /* 上次刚失败过：5 分钟内不再重试（prefetch 强制时绕过） */
            if (!force && cfg.titles.length === 0 && cfg.at > 0 && now - cfg.at < 5 * 60 * 1000) return [];
            const pick = Math.max(4, Math.min(cfg.platforms.length,
                Number(GM_getValue("Config.hotUapisCount", 16)) || 16));
            /* 平台去重：先取没用过的平台，不够再回头用已用过的（44 个远大于 pick，一般不会触发） */
            let candidates = cfg.platforms.filter(p => !usedPlatforms || !usedPlatforms.has(p));
            if (candidates.length < pick && usedPlatforms) {
                candidates = candidates.concat(cfg.platforms.filter(p => usedPlatforms.has(p)));
            }
            const platforms = candidates.slice().sort(() => Math.random() - 0.5).slice(0, pick);
            /* 平台只在「确实取到词」时才登记（见下方 then）。这里绝不能预先登记：
               uapis 限流时 16 个请求全失败、一条词没拿到，若预先登记会让二级源
               跳过这些平台，白白缩小词池——去重的前提是「真的取过」，不是「试过」。 */
            const seen = new Set();
            const titles = [];
            let ok = 0;
            const tasks = platforms.map(p => Utils.xhr({
                url: `${cfg.url}?type=${p}`,
                headers: { "user-agent": RewardsAuto.ua.pc },
                timeout: 8000,
            }).then(text => {
                const list = this.parseHotWords(text);
                if (!list) return;
                ok++;
                if (usedPlatforms) usedPlatforms.add(p);   // 取到词才登记，限流失败的平台不占用
                for (const cleaned of list) {
                    if (!seen.has(cleaned)) {
                        seen.add(cleaned);
                        titles.push(cleaned);
                    }
                }
            }).catch(() => null));
            await Promise.all(tasks);
            cfg.at = now;   // 成功失败都记时间（失败据此做 5 分钟退避）
            if (titles.length < 1) {
                this.saveUapisCache();
                Utils.log("🟡", `uapis 热搜无返回（抽了 ${platforms.length} 个平台全失败），5 分钟内不再重试`);
                return [];
            }
            cfg.titles = titles.sort(() => Math.random() - 0.5);
            cfg.index = 0;
            this.saveUapisCache();
            Utils.log("🔥", `中文热搜词已更新：${cfg.titles.length} 条（uapis.cn，抽 ${platforms.length} 平台 / ${ok} 个有返回）`);
            return cfg.titles;
        },

        /* 二级源：热榜接口按站点聚合多平台（nntool → baiwumm → cnxiaobai）。
           旧版每个站点只随机抽 1 个平台，词池太小；现在把单个站点的 hot 平台全部并发，
           合并成一个大词池（不同平台标题不同，去重后往往上百条）。站点间仍是降级：
           上次可用的站点优先，某站点全部平台都失败才试下一个；全挂返回 null。
           usedPlatforms：跳过 uapis 已取过的平台（如百度），只取没用过的，避免榜单重复。 */
        async getApiHotWords(usedPlatforms = null) {
            const arr = RewardsAuto.apiConfig.arr;
            if (!Array.isArray(arr) || arr.length < 1) return null;
            const start = Math.max(0, Number(RewardsAuto.apiConfig.apiIndex) || 0) % arr.length;
            for (let k = 0; k < arr.length; k++) {
                const idx = (start + k) % arr.length;
                const entry = arr[idx] || [];
                const name = entry[0], cfg = entry[1];
                if (!cfg || !cfg.url || !Array.isArray(cfg.hot) || cfg.hot.length < 1) continue;
                /* 平台去重：本站点只取 uapis 及前面站点还没用过的平台 */
                const plats = cfg.hot.filter(p => !usedPlatforms || !usedPlatforms.has(p));
                if (plats.length < 1) {
                    Utils.log("🟡", `热搜接口 ${name} 的平台均已取过，跳过`);
                    continue;
                }
                /* 同样只在各平台取到词后才登记（见下方 then），失败的不占用，
                   保证本站点全挂时后续站点仍能取到完整的同名平台。 */
                const seen = new Set();
                const titles = [];
                let ok = 0;
                const tasks = plats.map(plat => Utils.xhr({
                    url: `${cfg.url}${plat}${cfg.suffix || ""}`,
                    headers: { "user-agent": RewardsAuto.ua.pc },
                    timeout: 8000,
                }).then(text => {
                    const list = this.parseHotWords(text);
                    if (!list) return;
                    ok++;
                    if (usedPlatforms) usedPlatforms.add(plat);   // 取到词才登记
                    for (const t of list) if (!seen.has(t)) { seen.add(t); titles.push(t); }
                }).catch(() => null));
                await Promise.all(tasks);
                if (titles.length > 0) {
                    RewardsAuto.apiConfig.apiIndex = idx;
                    GM_setValue("Config.apiIndex", idx);
                    Utils.log("🟢", `热搜接口 ${name} 可用：${ok}/${plats.length} 平台有返回，聚合 ${titles.length} 条`);
                    return { name, titles: titles.sort(() => Math.random() - 0.5) };
                }
                Utils.log("🟡", `热搜接口 ${name} ${plats.length} 个平台全失败，尝试下一个站点`);
            }
            return null;
        },

        /* 从一批词里随机取一个（不按顺序消费，避免每次都是同几个词） */
        pickHotWord(list) {
            if (!Array.isArray(list) || list.length < 1) return "";
            const word = String(list[Utils.randomRange(0, list.length - 1)] || "");
            return word.substring(0, Utils.randomRange(20, 32));
        },

        /* 搜索词入口：只从本轮任务开始时加载的列表随机抽，绝不发请求、不打接口日志。
           列表为空（offline / 本轮获取失败）时才用内置随机词。 */
        async getHotSearchWord() {
            const picked = this.pickHotWord(RewardsAuto.apiConfig.cache.list);
            if (picked) return picked;
            const keywords = ["天气预报", "今日新闻", "体育赛事", "股票行情", "电影推荐", "科技资讯", "美食食谱", "旅游攻略", "历史上的今天", "健康常识"];
            const baseWord = keywords[Utils.randomRange(0, keywords.length - 1)];
            return `${baseWord} ${Math.random().toString(36).slice(2, 6)}`;
        },

        /* 搜索受限保护（v2）。旧版三处硬伤：只看两轮进度快照（预算耗尽也算没记账）、
           命中后直接 return 导致计数只增不减、计数只在内存里跨上下文各判各的。
           现在：开场只判冷却期不发请求；证据由 doSearch 收尾用真实战果累计；
           连续 STREAK_LIMIT 轮零记账才冷却；状态写 Config.searchGuard 跨上下文共享。 */
        searchGuard() {
            const raw = GM_getValue("Config.searchGuard", null);
            const today = Utils.getTodayNum();
            const st = (raw && typeof raw === "object") ? raw : {};
            if (st.date !== today) {
                return { date: today, streak: 0, cycles: 0, cooldownUntil: 0, reason: "", lastProgress: -1 };
            }
            return {
                date: today,
                streak: Math.max(0, Number(st.streak) || 0),
                cycles: Math.max(0, Number(st.cycles) || 0),
                cooldownUntil: Math.max(0, Number(st.cooldownUntil) || 0),
                reason: String(st.reason || ""),
                lastProgress: Number.isFinite(Number(st.lastProgress)) ? Number(st.lastProgress) : -1,
            };
        },

        saveSearchGuard(st) {
            const src = (st && typeof st === "object") ? st : {};
            const next = {
                date: Utils.getTodayNum(),
                streak: Math.max(0, Number(src.streak) || 0),
                cycles: Math.max(0, Number(src.cycles) || 0),
                cooldownUntil: Math.max(0, Number(src.cooldownUntil) || 0),
                reason: String(src.reason || ""),
                lastProgress: Number.isFinite(Number(src.lastProgress)) ? Number(src.lastProgress) : -1,
            };
            GM_setValue("Config.searchGuard", next);
            /* 同步旧键：诊断面板和老逻辑还在读这两个值，别让它们显示过期数字 */
            RewardsAuto.state.restrictedTimes = next.streak;
            RewardsAuto.state.lastSearchProgress = next.lastProgress;
            GM_setValue("Config.restrictedTimes", next.streak);
            GM_setValue("Config.lastSearchProgress", next.lastProgress);
            return next;
        },

        /* 冷却剩余毫秒；没有冷却返回 0 */
        searchCooldownLeft() {
            const st = this.searchGuard();
            return Math.max(0, st.cooldownUntil - Date.now());
        },

        clearSearchGuard(keepProgress = false) {
            const st = this.searchGuard();
            return this.saveSearchGuard({
                streak: 0,
                cycles: 0,
                cooldownUntil: 0,
                reason: "",
                lastProgress: keepProgress ? st.lastProgress : -1,
            });
        },

        /* doSearch 开场调用：只剩「是不是在冷却期」这一个判断，零网络请求 */
        async checkSearchRestricted() {
            const left = this.searchCooldownLeft();
            const st = this.searchGuard();
            if (left > 0) {
                Utils.log("🟡", `搜索冷却中（${st.reason || "连续多轮未记账"}），约 ${Math.ceil(left / 60000)} 分钟后自动重试`);
                return true;
            }
            if (st.cooldownUntil) {
                this.saveSearchGuard(Object.assign({}, st, { cooldownUntil: 0, reason: "" }));
                Utils.log("🔍", "搜索冷却结束，恢复搜索");
            }
            return false;
        },

        /* doSearch 收尾调用：用本轮真实战果累计证据（搜了几次 / 记账几次） */
        recordSearchRound(attempts, credits, progress, max) {
            const st = this.searchGuard();
            const tried = Math.max(0, Number(attempts) || 0);
            const got = Math.max(0, Number(credits) || 0);
            const cur = Math.max(0, Number(progress) || 0);
            const cap = Math.max(0, Number(max) || 0);
            if (cap > 0 && cur >= cap) {
                this.clearSearchGuard(false);
                return this.searchGuard();
            }
            if (tried >= SEARCH_GUARD.MIN_ATTEMPTS && got === 0) {
                const streak = st.streak + 1;
                if (streak < SEARCH_GUARD.STREAK_LIMIT) {
                    Utils.log("🟡", `本轮 ${tried} 次搜索均未记账（限流计数 ${streak}/${SEARCH_GUARD.STREAK_LIMIT}）`);
                    this.saveSearchGuard({ ...st, streak, cooldownUntil: 0, reason: "", lastProgress: cur });
                    return this.searchGuard();
                }
                /* 冷却时长递增：30 分钟 → 1 小时 → 2 小时 … 上限 4 小时，
                   避免真的被拉黑时每半小时就去撞一次门。 */
                const cycles = st.cycles + 1;
                const span = Math.min(SEARCH_GUARD.COOLDOWN_MS * Math.pow(2, cycles - 1), SEARCH_GUARD.COOLDOWN_MAX_MS);
                const until = Date.now() + span;
                const reason = `连续 ${streak} 轮真实搜索（本轮 ${tried} 次）零记账，PC ${cur}/${cap}`;
                this.saveSearchGuard({ streak: 0, cycles, cooldownUntil: until, reason, lastProgress: cur });
                /* 限流是过程状态，不是「完成」，只写日志不推送 —— 用户只想要完成通知 */
                Utils.log("🟡",
                    `搜索连续 ${streak} 轮没有记账，第 ${cycles} 次冷却 ${Math.round(span / 60000)} 分钟后自动重试`);
                Utils.log("🔍", `PC 搜索进入冷却：${new Date(until).toLocaleString("zh-CN")} 后自动重试`);
                return this.searchGuard();
            }
            /* 命中率判定：旧版「有记账就清零」，半坏通道下永远达不到冷却条件。
               现在 ≥50% 清零，<50% 累计，够 3 轮才冷却。 */
            if (got > 0) {
                const hitRate = tried > 0 ? got / tried : 0;
                if (hitRate >= 0.5) {
                    if (st.streak > 0 || st.cooldownUntil > 0 || st.cycles > 0) {
                        Utils.log("✅", `本轮记账 ${got}/${tried}（${Math.round(hitRate * 100)}%），搜索通道正常，计数清零`);
                    }
                    this.saveSearchGuard({ streak: 0, cycles: 0, cooldownUntil: 0, reason: "", lastProgress: cur });
                    return this.searchGuard();
                }
                Utils.log("🟡", `本轮记账率偏低 ${got}/${tried}（${Math.round(hitRate * 100)}%），计入限流统计`);
                const lowStreak = st.streak + 1;
                if (lowStreak < SEARCH_GUARD.STREAK_LIMIT) {
                    this.saveSearchGuard({ ...st, streak: lowStreak, cooldownUntil: 0, reason: "", lastProgress: cur });
                    return this.searchGuard();
                }
                const lowCycles = st.cycles + 1;
                const lowSpan = Math.min(SEARCH_GUARD.COOLDOWN_MS * Math.pow(2, lowCycles - 1), SEARCH_GUARD.COOLDOWN_MAX_MS);
                const lowUntil = Date.now() + lowSpan;
                const lowReason = `连续 ${lowStreak} 轮记账率偏低（本轮 ${got}/${tried}），PC ${cur}/${cap}`;
                this.saveSearchGuard({ streak: 0, cycles: lowCycles, cooldownUntil: lowUntil, reason: lowReason, lastProgress: cur });
                /* 同上：过程状态只写日志 */
                Utils.log("🟡",
                    `搜索连续 ${lowStreak} 轮记账率过低，第 ${lowCycles} 次冷却 ${Math.round(lowSpan / 60000)} 分钟后自动重试`);
                Utils.log("🔍", `PC 搜索进入冷却：${new Date(lowUntil).toLocaleString("zh-CN")} 后自动重试`);
                return this.searchGuard();
            }
            /* 本轮搜索次数太少（预算被前面的任务吃掉）：样本不足，不做判定，只更新基线 */
            if (tried > 0) Utils.log("🟡", `本轮只发了 ${tried} 次搜索，样本不足，不计入限流判定`);
            this.saveSearchGuard({ ...st, lastProgress: cur });
            return this.searchGuard();
        },
    };

    const IntlDaily = {
        PATH: "/rewards/panelflyout/getuserinfo?channel=BingFlyout&partnerId=BingRewards",
        REPORT_PATH: "/msrewards/api/v1/reportactivity",
        /* offer 前缀随区域变化（ENstar_ 国际版 / ZHstar_ 国内版），还有带锁变体，
           所以不写死前缀，用正则统一识别。 */
        /* offer 形态：<PREFIX>star_Rewards_DailyGlobalOffer_[Evergreen_]<星期|变体名>。
           第三段也可能是变体名（如 VerB_Locked_level2，+10 带锁拼图），
           旧正则要求必须是星期名，导致这张卡永远匹配不到。现在两者都接受。 */
        OFFER_RE: /^[A-Za-z]{2}star_Rewards_DailyGlobalOffer_(Evergreen_)?([A-Za-z0-9_]+)$/,
        /* 星期名本身：从第三段里再认一次，认不出就整段当变体名 */
        DAY_RE: /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i,
        OFFER_PREFIX: "ENstar_Rewards_DailyGlobalOffer_",
        WEEKDAYS: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        /* 面板接口的 Referer 必须是 bing 主页；缺了会被判成外站请求 */
        MAX_ATTEMPTS: 2,

        /* 面板挂在 bing 搜索域下：优先用脚本自己的搜索主机，再退回 cn / www
           （两个域的接口都在，实测都能记账）。 */
        hosts() {
            let configured = "";
            try { configured = String(RewardsAuto.state.host || "").trim(); } catch (_) {}
            const out = [];
            for (const h of [configured, "cn.bing.com", "www.bing.com"]) {
                if (h && /^[a-z0-9.-]+$/i.test(h) && !out.includes(h)) out.push(h);
            }
            return out;
        },


        /* 面板数据一次性取回：拿到卡片列表 + 请求体要用的身份字段。
           返回 null 表示「国际版面板不可用 / 没登录」，调用方要当无事发生。 */
        async fetchPanel(host) {
            const url = `https://${host}${this.PATH}`;
            let text = "";
            try {
                text = await Utils.xhr({
                    url,
                    headers: {
                        "accept": "application/json, text/plain, */*",
                        "user-agent": RewardsAuto.ua.pc,
                        "referer": `https://${host}/`,
                        "x-requested-with": "XMLHttpRequest"
                    },
                    timeout: 20000
                });
            } catch (e) {
                Utils.log("🟡", `国际版面板读取失败（${host}）：${e.message}`);
                return null;
            }
            const data = Utils.parseJSON(text);
            if (!data) {
                Utils.log("🟡", `国际版面板返回的不是 JSON（${host}），本轮跳过`);
                return null;
            }
            if (data.isError === true || data.isRewardsUser === false) {
                Utils.log("🟡", `国际版面板不可用：isError=${data.isError}，isRewardsUser=${data.isRewardsUser}`);
                return null;
            }
            const flyout = data.flyoutResult || {};
            const promos = [];
            const push = (item) => {
                if (!item || typeof item !== "object") return;
                const name = String(item.name || item.offerId || "");
                if (!name) return;
                promos.push(item);
            };
            for (const key of ["morePromotions", "highValueActionPromotions", "dailySetPromotions", "pointClaimCardPromotion"]) {
                const v = flyout[key];
                if (Array.isArray(v)) v.forEach(push);
                else if (v && typeof v === "object") Object.values(v).forEach(x => Array.isArray(x) ? x.forEach(push) : push(x));
            }

            const pickStr = (...vals) => {
                for (const v of vals) {
                    const t = String(v == null ? "" : v).trim();
                    if (t && t !== "undefined" && t !== "null") return t;
                }
                return "";
            };
            const identity = {
                channel: pickStr(data.channel, flyout.channel, "BingFlyout"),
                partnerId: pickStr(data.partnerId, flyout.partnerId, "BingRewards"),
                userId: pickStr(
                    data.userId,
                    data.UserId,
                    data.userInfo && data.userInfo.userId,
                    data.userInfo && data.userInfo.UserId,
                    data.flyoutResult && data.flyoutResult.profile && data.flyoutResult.profile.userId,
                    data.loggingContext && data.loggingContext.userId
                )
            };
            if (!identity.userId) {
                Utils.log("🟡", "国际版面板缺少 UserId：交卷会被服务端当成游客（IsRewardsUser=false），本轮跳过");
                return null;
            }
            const completeById = new Map();
            const rawPromos = (data.userInfo && data.userInfo.promotions) || [];
            for (const p of rawPromos) {
                const a = (p && p.attributes) || {};
                const id = String(a.offerid || a.offerId || p.name || "");
                if (!id) continue;
                completeById.set(id, String(a.complete).toLowerCase() === "true");
            }
            return { host, identity, promos, completeById, balance: Number((data.userInfo || {}).balance) || 0 };
        },

        /* 从面板数据里挑出国际版每日活动的卡片。
           只认 offerId 前缀 —— 面板里还有 Instant Win、Star bonus、兑换广告……
           它们不是每日活动，误报只会白打接口。
           5 张卡每天都能做（offerId 里的星期名只是编号），所以默认不过滤星期。 */
        pickCards(panel, { weekdays = null } = {}) {
            const want = Array.isArray(weekdays) && weekdays.length ? new Set(weekdays) : null;
            const seen = new Map();
            /* 被过滤掉的卡（没 hash / 重复 / 按星期排除）：不能静默丢，
               要能对外说清楚「面板上有这张卡，但脚本没处理」。 */
            const dropped = [];
            for (const p of panel.promos) {
                const name = String(p.name || p.offerId || "");
                const matched = name.match(this.OFFER_RE);
                if (!matched) continue;
                const attr = p.attributes || {};
                const offerId = String(p.offerId || attr.offerid || name);
                /* 星期名从第三段里再认一次：变体卡（VerB_Locked_level2）没有星期名，
                   此时整段当变体名。只有调用方显式按星期过滤时才需要它，
                   默认不过滤星期，所以拿不到星期不影响正常处理。 */
                const dayMatch = String(matched[2] || "").match(this.DAY_RE);
                const day = dayMatch ? dayMatch[1] : String(matched[2] || "");
                if (want && !want.has(day)) continue;

                /* 带锁变体不跳过：锁只代表要换通道（App / 真拼图），
                   全部通道失败才记为「受限」并如实汇报。 */
                const lock = CardLock.probe({ ...attr, name, State: p.State || attr.State });
                const needApp = !!lock.appExclusive || lock.appOnly === true;
                /* 不能静默丢弃：丢掉的卡要记进 dropped，否则面板还有卡、
                   汇总却显示「4/4 全部完成」。 */
                if (!p.hash) {
                    dropped.push({ offerId, title: attr.title || p.title || offerId, why: "面板未下发 hash（无法交卷）" });
                    continue;
                }
                if (seen.has(offerId)) {
                    dropped.push({ offerId, title: attr.title || p.title || offerId, why: "重复 offerId" });
                    continue;
                }
                /* complete 有三种形态都要认：p.complete（布尔）、
                   attr.complete（字符串 "True"）、completeById（权威值）。 */
                const done = p.complete === true
                    || String(p.complete).toLowerCase() === "true"
                    || String(attr.complete).toLowerCase() === "true"
                    || panel.completeById.get(offerId) === true;
                const destination = String(attr.destination || "");
                /* 「Do you know the answer?」这类是**交互式 Quiz**，不是普通 redirect：
                   落地页里有个真题目，必须点掉答案，页面才会带着
                   WQOskey/WQId/WQQI 这些参数去打 rewardsapp/reportActivity 记账。
                   实测：只调面板的 msrewards/reportactivity 对它是无效的。 */
                const isQuiz = /Homepage%20quiz|BingQA_Quiz|form=ML2BF1/i.test(destination)
                    || /do you know the answer/i.test(String(attr.title || p.title || ""));
                /* 拼图卡：落地页是 spotlight/imagepuzzle。
                   普通 +5 版走面板接口就够，但带锁 +10 版必须真拼 —— 由 report() 按需分流。 */
                const isPuzzle = /spotlight\/imagepuzzle/i.test(destination)
                    || /puzzle|拼图/i.test(String(attr.title || p.title || ""));
                seen.set(offerId, {
                    offerId,
                    name,
                    day,
                    title: attr.title || p.title || day,
                    activityType: p.activityType || "bingredirect",
                    hash: p.hash,
                    points: Number(p.pointProgressMax || attr.max || 5) || 5,
                    complete: done,
                    destination,
                    isQuiz,
                    isPuzzle,
                    /* 锁态只作参考：带锁卡照样尝试，失败后单独汇报 */
                    locked: lock.locked === true,
                    lockReason: lock.reason || "",
                    needApp
                });
            }
            const out = [...seen.values()];
            /* 把被过滤掉的卡挂上去，让调用方能如实汇报「面板上还有几张没处理」。
               用属性而不是改返回类型，避免动所有调用点。 */
            Object.defineProperty(out, "dropped", {
                value: dropped, enumerable: false, configurable: true, writable: true
            });
            return out;
        },

        /* 交互式 Quiz 通道：拼图 / 每日一句调面板 reportactivity 就记账；
           Quiz 需要打开落地页点掉题目，页面才会带 WQOskey / WQId / WQQI 上报。
           这里复刻「取题 → 作答 → 用同样参数上报」。 */

        /* 拼图通道：普通 +5 走面板接口；带锁 +10 必须在落地页真拼。
           落地页结构：#tiles > div.tile[x][y]，每格 <img id="imgN">，N 是目标位置。
           这里用 BFS 求最短解再模拟点击。 */

        /* 从落地页 HTML 解出拼图布局（row/col 与每格对应的图块编号） */

        /* 通过 CDP 打开拼图页并把它真拼完。
           返回 {ok, moves, reason}。只有 CDP 可用时才有戏；不可用就如实返回原因。 */
        async solvePuzzleViaCdp(destination) {
            if (typeof WebSocket === "undefined") return { ok: false, reason: "当前环境没有 WebSocket" };
            if (!(await CDP.available())) return { ok: false, reason: `CDP 未连接（端口 ${CDP.PORT}）` };
            const url = String(destination || "").trim();
            if (!url) return { ok: false, reason: "缺少拼图落地页" };
            let page = null;
            try {
                page = await CDP._ownedPage(url, { create: true, reason: "card-cdp" });
                if (!page || !page.webSocketDebuggerUrl) return { ok: false, reason: "拿不到 CDP 页面" };
                if (!CDP._ws || CDP._ws.readyState !== 1) await CDP.connect(page.webSocketDebuggerUrl);
                await CDP.goto(page, url);
                /* 等图块生成：页面会先拉图片再切块，给足时间 */
                for (let i = 0; i < 20; i++) {
                    const n = await CDP.evaluate("document.querySelectorAll('#tiles > .tile').length");
                    if (Number(n) >= 4) break;
                    await Utils.delay(500);
                }
                /* 在页面里跑 BFS + 模拟点击：一次求值里做完，避免来回几十次 CDP 调用 */
                const script = `(async () => {
                  const tiles = [...document.querySelectorAll('#tiles > .tile')];
                  if (!tiles.length) return { ok:false, reason:'没有图块' };
                  const xs = tiles.map(t=>Number(t.getAttribute('x'))), ys = tiles.map(t=>Number(t.getAttribute('y')));
                  const rows = Math.max(...xs)+1, cols = Math.max(...ys)+1, BLANK = rows*cols-1;
                  const read = () => {
                    const g = []; for (let x=0;x<rows;x++){ g[x]=[]; for(let y=0;y<cols;y++) g[x][y]=BLANK; }
                    for (const t of tiles) {
                      const img = t.querySelector('img');
                      if (!img) continue;
                      const n = Number(String(img.id||'').replace('img',''));
                      if (!Number.isNaN(n)) g[Number(t.getAttribute('x'))][Number(t.getAttribute('y'))] = n;
                    }
                    return g;
                  };
                  const goal = []; for (let x=0;x<rows;x++){ goal[x]=[]; for(let y=0;y<cols;y++) goal[x][y]=x*cols+y; }
                  const key = g => g.flat().join(',');
                  const goalKey = key(goal);
                  const start = read();
                  if (key(start) === goalKey) return { ok:true, moves:0, already:true };
                  const q = [{ g:start, m:[] }], seen = new Set([key(start)]);
                  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
                  let found = null, head = 0;
                  while (head < q.length && !found) {
                    const cur = q[head++];
                    let bx=-1, by=-1;
                    for (let x=0;x<rows;x++) for (let y=0;y<cols;y++) if (cur.g[x][y]===BLANK) { bx=x; by=y; }
                    for (const [dx,dy] of dirs) {
                      const nx=bx+dx, ny=by+dy;
                      if (nx<0||nx>=rows||ny<0||ny>=cols) continue;
                      const ng = cur.g.map(r=>r.slice());
                      const t = ng[bx][by]; ng[bx][by]=ng[nx][ny]; ng[nx][ny]=t;
                      const k = key(ng);
                      if (seen.has(k)) continue;
                      seen.add(k);
                      const nm = cur.m.concat([[nx,ny]]);
                      if (k === goalKey) { found = nm; break; }
                      q.push({ g:ng, m:nm });
                    }
                  }
                  if (!found) return { ok:false, reason:'拼图无解', states:seen.size };
                  // 按解的顺序真实点击
                  for (const [x,y] of found) {
                    const cell = document.getElementById(String(x)+String(y));
                    const img = cell && cell.querySelector('img');
                    if (!img) { await new Promise(r=>setTimeout(r,40)); continue; }
                    img.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
                    await new Promise(r=>setTimeout(r,45));
                  }
                  await new Promise(r=>setTimeout(r,300));
                  const done = !document.getElementById('congrats').classList.contains('b_hide');
                  return { ok:done, moves:found.length, states:seen.size, done };
                })()`;
                const r = await CDP.evaluate(script);
                if (!r || typeof r !== "object") return { ok: false, reason: "页面求值没有返回结果" };
                if (r.ok) return { ok: true, moves: r.moves || 0 };
                return { ok: false, reason: r.reason || "拼图未完成" };
            } catch (e) {
                return { ok: false, reason: `CDP 拼图异常：${e.message}` };
            }
        },

        /* BFS 求最短解：返回点击顺序 [{x,y}...]（点的是空格旁边的块） */

        /* 把落地页 URL 里的 filters 参数解析成键值（面板下发的是转义过的串） */
        _parseQuizFilters(destination) {
            const out = {};
            try {
                const u = new URL(destination);
                const raw = u.searchParams.get("filters") || "";
                const decoded = decodeURIComponent(raw.replace(/\+/g, " "));
                for (const m of decoded.matchAll(/([A-Za-z_]+)\s*:\s*"([^"]*)"/g)) out[m[1]] = m[2];
                if (out.WQOskey) out.__q = u.searchParams.get("q") || "";
            } catch (_) {}
            return out;
        },

        /* 打开落地页，取出题目与正确选项（页面内联 JS 里直接带 isCorrect） */
        async _fetchQuizPuzzle(host, destination) {
            const url = String(destination || "").replace(/^https?:\/\/www\.bing\.com/i, `https://${host}`);
            let html = "";
            try {
                html = await Utils.xhr({
                    url,
                    headers: {
                        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
                        "user-agent": RewardsAuto.ua.pc,
                        "referer": `https://${host}/`
                    },
                    timeout: 20000
                });
            } catch (e) {
                return { ok: false, reason: `落地页打开失败：${e.message}` };
            }
            const text = String(html || "");
            /* QuizQuestionPane.init( answerId, questionId, 题干, choices, recordUrl )
               注意：选项数组是**变量**（var choices = [...]），写在 init 之前，
               所以要取 init 之前的一段来找 isCorrect。 */
            const initIdx = text.indexOf("QuizQuestionPane.init(");
            if (initIdx < 0) return { ok: false, reason: "落地页里没有找到 Quiz 题组" };
            const seg = text.slice(Math.max(0, initIdx - 3000), initIdx + 1200);
            /* 正确选项：isCorrect: "true" 那一项的 id */
            const choices = [...seg.matchAll(/\{\s*id:\s*"([^"]*)",\s*isCorrect:\s*"([^"]*)",\s*text:\s*"([^"]*)"\s*\}/g)]
                .map(m => ({ id: m[1], correct: m[2] === "true", text: m[3] }));
            const correct = choices.find(c => c.correct);
            /* QuizQuestionPane.init(答案id, 题目id, …)：第二个参数才是 questionId，
               与 filters 里的 WQId 不是一回事；旧代码取 ids[2] 恒为 undefined。 */
            const initSeg = text.slice(initIdx, initIdx + 1200);
            const ids = initSeg.match(/init\(\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,/);
            const recordUrl = (initSeg.match(/"(https:[^"]*funapi\/api\/quiz\/record[^"]*)"/) || [])[1] || "";
            const questionText = (initSeg.match(/init\(\s*"[^"]*"\s*,\s*"[^"]*"\s*,\s*"([^"]*)"/) || [])[1] || "";
            if (!correct) return { ok: false, reason: "没有找到正确选项" };
            /* quizId：卡片自身的 destination 里没有 filters，得从落地页 HTML 里抽
               （形如 HPQuiz_20261112_NorthWindow）。取第一个即可 —— 那正是本页的题组。 */
            const quizId = (text.match(/HPQuiz_\d+_[A-Za-z0-9]+/) || [])[0] || "";
            return {
                ok: true,
                url,
                answerId: correct.id,
                /* 真实点击时 q 传的是答案文本（去掉 "B. " 前缀，形如 "Alberta"）。
                   浏览器实际发的是 q=Alberta，这里照着还原。 */
                answerText: String(correct.text || "").replace(/^\s*[A-Za-z][.)]\s*/, "").trim(),
                /* 第一个参数是 answerId、第二个是 questionId；
                   旧代码取 ids[2] 拿不到值，现在显式取 ids[2] 但兜底 "0"。 */
                questionId: (ids && ids[2]) ? ids[2] : (ids && ids[1]) || "0",
                questionText,
                recordUrl,
                quizId,
                choiceCount: choices.length
            };
        },

        /* 作答：先调 quiz/record 记录，再带 quiz 参数打 rewardsapp/reportActivity */
        async _solveQuiz(host, destination) {
            const puzzle = await this._fetchQuizPuzzle(host, destination);
            if (!puzzle.ok) return { ok: false, reason: puzzle.reason };

            /* destination 本身不带 filters，所以这里自己拼一份「点击选项后」的 filters：
               面板/页面点击时发的就是这个结构，WQOskey 是题组 ID。 */
            const own = this._parseQuizFilters(puzzle.url);
            const quizId = puzzle.quizId || own.WQOskey || "";
            /* 实测真人点选项后发出的是：q=答案文本（不是题目标题）、WQCI="1"
               （"0" 表示未答完，那一发永不记账），并带 FORM=CWQHYL /
               rnoreward=1 / skipopalnative=true。旧代码这三点全错。 */
            const q = puzzle.answerText || own.__q || "";
            const filtersDecoded = [
                'mgzv3configlist:"BingQA_Quiz_layout"',
                'dw_answerstobesuppressed:"ConversationalSearch"',
                'IsConversation:"True"',
                quizId ? `WQOskey:"${quizId}"` : "",
                'WQId:"1"',
                'WQQI:"0"',
                /* 作答完成标记：真实点击后是 "1" */
                'WQCI:"1"',
                'ShowTimesTaskPaneTrigger:"false"',
                'WQSCORE:"1"'
            ].filter(Boolean).join(" ");

            /* ① 记录这次作答（页面点击选项时发的就是它） */
            if (puzzle.recordUrl) {
                try {
                    await Utils.xhr({
                        method: "POST",
                        url: puzzle.recordUrl,
                        headers: {
                            "content-type": "application/json; charset=utf-8",
                            "accept": "*/*",
                            "user-agent": RewardsAuto.ua.pc,
                            "referer": puzzle.url
                        },
                        data: JSON.stringify({
                            q,
                            filters: filtersDecoded,
                            answerId: puzzle.answerId,
                            questionId: puzzle.questionId,
                            quizId,
                            correctAnswer: puzzle.answerId
                        }),
                        timeout: 20000
                    });
                } catch (_) { /* 记录失败不致命，下面还有 reportActivity */ }
            }

            /* ② 带 quiz 参数打 reportActivity —— 这才是记账那一步。
               参数必须和真人点击后的那一发逐项对齐（见上面的说明），
               少一个 rnoreward/skipopalnative/FORM 都可能被当成普通搜索上报。 */
            const params = new URLSearchParams();
            params.set("q", q);
            params.set("filters", filtersDecoded);
            params.set("FORM", "CWQHYL");
            params.set("rnoreward", "1");
            params.set("skipopalnative", "true");
            const reportUrl = `https://${host}/rewardsapp/reportActivity?${params.toString()}`;
            let text = "";
            try {
                text = await Utils.xhr({
                    method: "POST",
                    url: reportUrl,
                    headers: {
                        "content-type": "application/x-www-form-urlencoded",
                        "user-agent": RewardsAuto.ua.pc,
                        "referer": puzzle.url
                    },
                    data: `url=${encodeURIComponent(puzzle.url)}&V=web`,
                    timeout: 20000
                });
            } catch (e) {
                return { ok: false, reason: `reportActivity 失败：${e.message}` };
            }
            const authed = /"IsAuthenticated":true/.test(String(text || ""));
            const increment = (String(text || "").match(/"RewardsIncrement":(\d+)/) || [])[1];
            /* ⚠️ IsAuthenticated 与 RewardsIncrement 是页面模块的配置值，不是本次得分：
               已完成的卡、没答对的请求照样回这两个值。这里只报「请求发出去了」，
               到没到账交给面板回读。 */
            return {
                ok: authed,
                isAuthenticated: authed,
                increment: Number(increment) || 0,
                /* verified 明确表示「这是服务端确认到账」，quiz 通道自己做不到 */
                verified: false,
                reason: authed ? "" : "reportActivity 未识别登录态"
            };
        },

        /* 从任意响应读「余额 / 是否有错」：正常记账 / 这次没算上 / HTML 被拒三种。
           「响应不是 JSON」不能当失败判据 —— 服务端可能已经记账。 */
        _readReport(text) {
            const data = Utils.parseJSON(text);
            if (!data) return { json: false, text: String(text || "").slice(0, 200) };
            const bal = (() => {
                const b = data.Balance;
                if (typeof b === "number") return b;
                if (b && typeof b === "object") return Number(b.Available) || 0;
                return 0;
            })();
            const detail = data.ErrorDetail || {};
            const code = Number(detail.ErrorCode ?? data.ErrorCode ?? 0) || 0;
            const message = String(detail.Message || data.ErrorMessage || "").trim();
            /* OfferComplete 不能当加分判据：成功响应可能是
               {"OfferComplete":false,"EarnedCredits":5,"ActivityComplete":true}。
               旧代码把两字段 || 成一个布尔，把成功卡算成失败。
               判据是 EarnedCredits，另两个字段原样保留作参考。 */
            const earned = Number(data.EarnedCredits ?? data.PointsEarned ?? 0) || 0;
            return {
                json: true,
                balance: bal,
                earned,
                errorCode: code,
                message,
                retryable: detail.Retryable === true,
                /* 两个字段分开保留，别再揉在一起 */
                offerComplete: data.OfferComplete === true,
                activityComplete: data.ActivityComplete === true,
                isRewardsUser: data.IsRewardsUser !== false
            };
        },

        /* 交卷通道顺序：text/plain → JSON 头 → 页面代发；
           都失败由调用方用面板回读定胜负。 */
        /* 单发一次面板交卷：只用「实测最可靠」的那一种形态
           （text/plain + Origin，与面板自己的 XHR 一致），不穷举变体、不开 CDP。
           给 quiz 卡做「先试一次」用 —— 穷举交给主通道，这里要的是快。 */
        async _reportOnce(panel, card) {
            const body = {
                ActivityType: card.activityType,
                ActivitySubType: "",
                OfferId: card.offerId,
                Channel: panel.identity.channel,
                PartnerId: panel.identity.partnerId,
                UserId: panel.identity.userId,
                AuthKey: card.hash,
                ActivityCount: 1
            };
            const url = `https://${panel.host}${this.REPORT_PATH}`;
            try {
                const res = await Utils.xhrFull({
                    method: "POST",
                    url,
                    headers: {
                        "accept": "application/json, text/plain, */*",
                        "user-agent": RewardsAuto.ua.pc,
                        "referer": `https://${panel.host}/`,
                        "content-type": "text/plain;charset=UTF-8",
                        "origin": `https://${panel.host}`
                    },
                    data: JSON.stringify(body),
                    timeout: 15000,
                    redirect: "manual"
                });
                const status = Number(res && res.status) || 0;
                if (status < 200 || status >= 300) {
                    return { ok: false, reason: `HTTP ${status}` };
                }
                const r = this._readReport(String((res && res.text) || ""));
                if (!r.json) return { ok: false, reason: "响应不是 JSON" };
                if (r.errorCode) return { ok: false, reason: `ErrorCode=${r.errorCode}` };
                if (r.isRewardsUser === false) return { ok: false, reason: "未识别登录态" };
                /* 判据与主通道一致：EarnedCredits / ActivityComplete 才算真加分 */
                if (r.earned > 0 || r.activityComplete === true || r.offerComplete === true) {
                    return { ok: true, points: r.earned, balance: r.balance };
                }
                return { ok: false, reason: "已受理但未新增记账" };
            } catch (e) {
                return { ok: false, reason: e.message };
            }
        },

        async report(panel, card) {
            /* Quiz 卡先走面板通道：实测带 hash 直接 reportactivity 就能拿满 5 分，
               不需要真去答题（只答题不交卷反而拿不到分）。
               答题流程只作面板通道失败后的兜底。 */
            if (card.isQuiz && card.destination) {
                /* 只发一次标准请求，不做多通道穷举：穷举会让单张卡打十几条路径，
                   一轮 4 张就吃掉十几分钟，把后面的任务全挤出时间窗。 */
                const quick = await this._reportOnce(panel, card);
                if (quick && quick.ok) {
                    return Object.assign({}, quick, { via: "quiz-panel" });
                }
                const r = await this._solveQuiz(panel.host, card.destination);
                if (r.ok) {
                    return { ok: true, via: "quiz", points: card.points, balance: 0, verified: false };
                }
                return { ok: false, outcome: "unknown", reason: `quiz: ${r.reason}` };
            }

            /* 说明：拼图卡**不**在这里无条件走 CDP ——
               普通 +5 拼图用面板接口就能记账（已实测），只有带锁的 +10 变体
               才必须真拼。所以这里仍走下面的面板通道，失败后在函数末尾回退到 CDP。 */
            const body = {
                ActivityType: card.activityType,
                ActivitySubType: "",
                OfferId: card.offerId,
                Channel: panel.identity.channel,
                PartnerId: panel.identity.partnerId,
                UserId: panel.identity.userId,
                AuthKey: card.hash,
                ActivityCount: 1
            };
            const payload = JSON.stringify(body);
            const url = `https://${panel.host}${this.REPORT_PATH}`;
            const base = {
                "accept": "application/json, text/plain, */*",
                "user-agent": RewardsAuto.ua.pc,
                "referer": `https://${panel.host}/`
            };
            /* 面板自己用的是 XHR，且没显式设 content-type（默认 text/plain）。
               扩展后台发出的请求和页面同源请求特征不一样，这里把「带不带 Origin」
               也作为一维来试 —— 有些网关看到扩展源的 Origin 就直接 302 到登录页。 */
            /* 通道排序按「实测成功率」：
               ① native：不手工拼 cookie，用浏览器自己的 cookie jar —— 登录态最完整
               ② plain+origin：实测能过（Origin/Referer 与面板一致）
               余下几条是兜底。 */
            const origin = `https://${panel.host}`;
            const variants = [
                { name: "native", cookie: false, headers: { ...base, "content-type": "text/plain;charset=UTF-8", "origin": origin } },
                { name: "plain+origin", headers: { ...base, "content-type": "text/plain;charset=UTF-8", "origin": origin } },
                { name: "native+json", cookie: false, headers: { ...base, "content-type": "application/json", "origin": origin } },
                { name: "json+origin", headers: { ...base, "content-type": "application/json", "origin": origin } },
                { name: "form", headers: { ...base, "content-type": "application/x-www-form-urlencoded", "origin": origin }, data: new URLSearchParams(body).toString() }
            ];

            const reasons = [];
            /* 三种结局，必须分清楚：
                 accepted  服务端明确回了 ErrorCode=0 且没被跳走 —— 可以去复核
                 rejected  服务端明确报错（ErrorCode≠0）
                 unknown   通道层失败（HTML/301/网络），该换通道 */
            let outcome = "unknown";
            /* 同一 URL 的 301 是服务端在下发 Cookie 后让你重放一次（面板自己也会这样
               被浏览器自动跟随）。GM 层跟随不了，就手动重放一次，别把它当失败换形态。 */
            const isSelfRedirect = (loc) => {
                if (!loc) return false;
                try {
                    const a = new URL(loc);
                    const b = new URL(url);
                    return a.host === b.host && a.pathname === b.pathname;
                } catch (_) { return false; }
            };
            for (const v of variants) {
                let res = null;
                try {
                    /* redirect:"manual"：不跟随 302。被跳走时 status=3xx 且带 Location，
                       这样日志能直接说出「被带去登录页」，而不是只报一句
                       「响应不是 JSON」——那正是这次要修的可观测性问题。 */
                    res = await Utils.xhrFull({
                        method: "POST",
                        url,
                        headers: v.headers,
                        data: v.data || payload,
                        timeout: 20000,
                        redirect: "manual",
                        ...(v.cookie === false ? { cookie: false } : {})
                    });
                } catch (e) {
                    reasons.push(`${v.name}: ${e.message}`);
                    continue;
                }
                let status = Number(res && res.status) || 0;
                let text = String((res && res.text) || "");
                let location = String((res && res.location) || "");
                /* 同址 301：重放一次（这次 Cookie 已经在了） */
                if (status >= 300 && status < 400 && isSelfRedirect(location)) {
                    try {
                        const again = await Utils.xhrFull({
                            method: "POST",
                            url,
                            headers: v.headers,
                            data: v.data || payload,
                            timeout: 20000,
                            redirect: "manual",
                            ...(v.cookie === false ? { cookie: false } : {})
                        });
                        status = Number(again && again.status) || 0;
                        text = String((again && again.text) || "");
                        location = String((again && again.location) || "");
                    } catch (e) {
                        reasons.push(`${v.name}: 重放失败 ${e.message}`);
                        continue;
                    }
                }
                if (status >= 300 && status < 400) {
                    reasons.push(`${v.name}: HTTP ${status} 被重定向${location ? `→${location.slice(0, 70)}` : ""}`);
                    continue;
                }
                const r = this._readReport(text);
                if (!r.json) {
                    reasons.push(`${v.name}: HTTP ${status} 非 JSON（${text.slice(0, 60).replace(/\s+/g, " ")}）`);
                    continue;
                }
                if (r.errorCode) {
                    reasons.push(`${v.name}: ErrorCode=${r.errorCode} ${r.message}`);
                    outcome = "rejected";
                    continue;
                }
                /* ErrorCode=0 但 IsRewardsUser=false：服务端压根没认出登录态，
                   回的是「游客」那份模板（Balance 全 0）。这不是「已做过」，
                   而是「这次没带上登录态」—— 必须判失败并换通道重试。 */
                if (r.isRewardsUser === false) {
                    reasons.push(`${v.name}: 服务端未识别登录态（游客响应）`);
                    continue;
                }
                /* 判成功的唯一依据：EarnedCredits > 0 或 ActivityComplete=true。
                   OfferComplete 在成功响应里也可能是 false，不能当判据。
                   两者都没有 = 已受理待复核，交给面板回读。 */
                if (r.earned > 0 || r.activityComplete === true) {
                    return { ok: true, via: v.name, points: r.earned, balance: r.balance };
                }
                if (r.offerComplete === true) {
                    return { ok: true, via: v.name, points: r.earned, balance: r.balance };
                }
                reasons.push(`${v.name}: 已受理但未新增记账（${r.message || "no message"}）`);
                outcome = "accepted";
                continue;
            }

            /* 兜底：页面代发通道（仅在 bing 页面上跑脚本时可用）。
               同源发出的请求 Origin/Referer 与面板完全一致，是最可靠的一条。 */
            if (typeof API !== "undefined" && API._pageChannelAlive && API._pageChannelAlive()) {
                try {
                    const out = await API.viaPageChannel(url, { ...base, "content-type": "text/plain;charset=UTF-8" }, payload, 20000, "POST");
                    const r = this._readReport((out && out.text) || "");
                    /* 判据同上：认 EarnedCredits / ActivityComplete，不认 OfferComplete */
                    if (r.json && !r.errorCode && r.isRewardsUser !== false
                        && (r.earned > 0 || r.activityComplete === true || r.offerComplete === true)) {
                        return { ok: true, via: "page", points: r.earned, balance: r.balance };
                    }
                    if (r.json && !r.errorCode && r.isRewardsUser !== false) {
                        outcome = "accepted";
                        reasons.push("page: 已受理但未新增记账");
                    } else {
                        reasons.push(`page: HTTP ${(out && out.status) || 0} ${r.json ? `ErrorCode=${r.errorCode}` : "返回非 JSON"}`);
                    }
                } catch (e) {
                    reasons.push(`page: ${e.message}`);
                }
            }
            /* 拼图卡最后的兜底：面板接口没受理时，才真去落地页把它拼完。
               带锁的 +10 变体就是这种情况 —— 面板接口对它永远不记账，
               页面里拼好才会由页面自己上报。普通 +5 卡在上面就已经成功了，
               不会走到这里，所以不会平白无故开 CDP 标签页。 */
            if (card.isPuzzle && card.destination) {
                const solved = await this.solvePuzzleViaCdp(card.destination);
                if (solved.ok) {
                    return { ok: true, via: "puzzle", points: card.points, balance: 0 };
                }
                reasons.push(`puzzle: ${solved.reason}`);
            }
            return { ok: false, outcome, reason: reasons.join("；") || "全部通道失败" };
        },

        /* 主流程：取面板 → 挑卡 → 逐张交卷 → 复核。
           返回 {found, done, pending, points}；面板里没有这组活动时 found=0。 */
        /* gap / deadline 由调用方传入，复用 SEARCH_PACER 的「其他任务节拍」
           （Config.otherSpan）：国际版卡片也是打微软的接口，打太快同样有风控风险，
           所以不给自己留「1.5~3 秒连打 5 张」这种口子。 */
        async run({ reason = "国际版每日活动", gap = 0, deadline = 0 } = {}) {
            if (!GM_getValue("Tasks.intlDaily", true)) return null;
            /* 这里不校验 Token：面板走的是 bing.com 的登录 Cookie，
               而不是 prod.rewardsplatform 的 OAuth Token，没有 Token 也能做。 */

            /* 逐主机试，直到「面板可用且里面有这组卡」；只看第一个能返回 JSON
               的主机会漏掉只在 www.bing.com 下发的卡。 */
            let panel = null;
            let lastPanel = null;
            let cards = [];
            for (const host of this.hosts()) {
                const p = await this.fetchPanel(host);
                if (!p) continue;
                if (!lastPanel) lastPanel = p;
                const picked = this.pickCards(p);
                if (picked.length > 0) {
                    panel = p;
                    cards = picked;
                    break;
                }
            }
            if (!panel) {
                /* 所有主机都没卡：面板本身可用就按「这个账号没有这组活动」返回，
                   面板全都不可用才返回 null（区分「没有活动」和「读不到」）。 */
                if (!lastPanel) return null;
                panel = lastPanel;
                cards = this.pickCards(panel);
            }
            /* 被 pickCards 过滤掉的卡必须说出来：以前直接 `continue` 丢掉，
               面板上还有卡、汇总却是「4/4 全部完成」，等于骗人。
               这些卡不参与 pending 判定（缺 hash 确实交不了卷），
               但要在日志里点名，让人知道「为什么显示全完成却还有卡亮着」。 */
            const droppedCards = (cards && cards.dropped) || [];
            if (droppedCards.length > 0) {
                Utils.log("🟠", `国际版面板里有 ${droppedCards.length} 张卡无法处理：`
                    + droppedCards.map(c => `${c.title}（${c.why}）`).join("、"));
            }
            if (cards.length === 0) {
                Utils.log("🟡", "国际版面板里没有找到每日活动卡片（该账号可能没有这组活动）");
                return { found: 0, done: 0, pending: 0, points: 0, dropped: droppedCards.length };
            }

            const doneIds = new Set(cards.filter(c => c.complete).map(c => c.offerId));
            const todo = cards.filter(c => !c.complete);
            if (todo.length === 0) {
                Utils.log("✅", `国际版每日活动已完成（${cards.length} 张）`);
                return { found: cards.length, done: cards.length, pending: 0, points: 0 };
            }
            Utils.log("🌍", `${reason}：发现 ${todo.length} 张待完成（共 ${cards.length} 张）`);

            const balanceBefore = panel.balance;
            let ok = 0;
            let lastReason = "";
            /* 日志口径：一张卡只打最终结论一行。
               中间的重试原因全部攒起来，只在「最终真的没成」时合并成一行 ——
               之前一张卡失败能刷 6 行（每种形态各一行），完全没法看。 */
            const failed = [];
            const pacer = (typeof SEARCH_PACER !== "undefined") ? SEARCH_PACER : null;
            /* 节拍基准：没传就按 Config.otherSpan（默认 60 秒）走，绝不定死成几秒 */
            let beatGap = Number(gap) > 0 ? Number(gap) : (pacer ? pacer.startGap("other") : 60 * 1000);
            let outOfTime = false;
            let idx = 0;
            for (const card of todo) {
                const name = card.title || card.offerId;
                /* 到点就交班：剩下的卡片留给下一轮，不在同一轮里硬挤。
                   用 idx 直接数「还剩几张」，别用 ok/failed 反推 ——
                   accepted 那张既不算成功也不算失败，反推会算错。 */
                if (pacer && deadline > 0 && !pacer.fits(deadline, beatGap)) {
                    outOfTime = true;
                    Utils.log("🟡", `国际版每日活动到点交班，剩余 ${todo.length - idx} 张留给下一轮`);
                    break;
                }
                idx++;
                let last = null;
                for (let attempt = 1; attempt <= this.MAX_ATTEMPTS; attempt++) {
                    last = await this.report(panel, card);
                    if (last.ok) break;
                    lastReason = last.reason || "未知原因";
                    /* 同一张卡的内部重试也拉开间隔，避免连续打同一张 */
                    if (attempt < this.MAX_ATTEMPTS) {
                        await Utils.randomDelay(Math.min(5000, Math.round(beatGap / 12) + 2000),
                            Math.min(12000, Math.round(beatGap / 6) + 3000));
                    }
                }
                if (last && last.ok) {
                    ok++;
                    doneIds.add(card.offerId);
                    /* ok 只代表「服务端受理了这一发」，记账与否等面板回读。
                       以前直接打「已完成」，用户看到 6 行完成实际只加了 20 分。 */
                    Utils.log("📮", `国际版卡片已交卷（待服务端确认）：${name} 名义 +${card.points}p`);
                } else if (last && last.outcome === "accepted") {
                    /* 服务端收了但没新增记账：通常这张卡今天已经做过，不吵 */
                    Utils.log("  ", `国际版卡片已受理（未新增记账）：${name}`);
                } else {
                    failed.push({ name, reason: lastReason });
                }
                /* 卡片间隔 = 与阅读/卡片共用「其他任务节拍」（Config.otherSpan）。
                   原来这里是 1.5~3 秒 —— 5 张卡十几秒内打完，属于明显的机器行为。 */
                const isLast = idx >= todo.length;
                if (pacer) {
                    beatGap = pacer.nextGap(beatGap, !!last && last.ok, "other");
                    if (!isLast) {
                        if (deadline > 0 && !pacer.fits(deadline, beatGap)) {
                            outOfTime = true;
                            Utils.log("🟡", `国际版每日活动到点交班，剩余 ${todo.length - idx} 张留给下一轮`);
                            break;
                        }
                        Utils.log("  ", `国际版卡片间隔 ${Math.round(pacer.otherSpanMs() / 1000)} 秒（其他任务节拍）`);
                        await pacer.beat(beatGap);
                    }
                } else if (!isLast) {
                    await Utils.randomDelay(1500, 3000);
                }
            }
            if (failed.length > 0) {
                Utils.log("🟠", `国际版卡片交卷未受理 ${failed.length} 张：`
                    + failed.map(f => f.name).join("、")
                    + `（${String(failed[0].reason).split("；")[0]}）`);
            }

            /* 最终判据只认面板回读的 complete：服务端入账是异步的，响应非 JSON 时
               也可能已记账，所以要「复核 → 补做 → 再复核」。 */
            let gained = 0;
            let confirmed = 0;
            /* doneIds=本轮发送状态（补做去重用）；confirmedIds=回读 complete=true。
               对外结论一律以 confirmedIds 为准。 */
            const confirmedIds = new Set();
            const readBack = async () => {
                let after = await this.fetchPanel(panel.host);
                if (!after) {
                    await Utils.delay(4000);
                    after = await this.fetchPanel(panel.host);
                }
                if (!after) return null;
                const nowCards = this.pickCards(after);
                for (const c of nowCards) {
                    if (c.complete) {
                        doneIds.add(c.offerId);
                        confirmedIds.add(c.offerId);
                    }
                }
                gained = Math.max(gained, after.balance - balanceBefore);
                return { cards: nowCards, confirmed: nowCards.filter(c => c.complete).length, balance: after.balance };
            };

            try {
                await Utils.delay(2500);
                const first = await readBack();
                if (first) {
                    confirmed = first.confirmed;
                    const newlyAcked = first.cards.filter(c => c.complete
                        && todo.some(t => t.offerId === c.offerId)).length;
                    if (newlyAcked > 0) ok = Math.max(ok, newlyAcked);
                    /* 逐张说清三种情况：确认到账 / 受理但未记账 / 本轮没轮到。 */
                    const acked = [];
                    const notAcked = [];
                    for (const card of todo) {
                        const nm = card.title || card.offerId;
                        const now = first.cards.find(c => c.offerId === card.offerId);
                        if (now && now.complete) acked.push(`${nm} +${card.points}p`);
                        else notAcked.push(nm);
                    }
                    if (acked.length > 0) {
                        Utils.log("✅", `服务端已确认到账 ${acked.length} 张：${acked.join("、")}`);
                    }
                    if (notAcked.length > 0) {
                        Utils.log("🟡", `服务端未确认到账 ${notAcked.length} 张：${notAcked.join("、")}（回读仍为未完成，下一轮继续）`);
                    }
                } else {
                    /* 回读不到 = 无法确认。既不能报完成，也不能报失败。 */
                    Utils.log("🟠", "国际版卡片回读失败：本轮无法确认真实到账情况（不报完成，下一轮重新核对）");
                }

                /* 补做轮：还有没记账的，隔一个节拍再来一次。
                   最多再补 2 轮，且必须在一轮的截止时间之内 —— 不硬挤、不无限重试。 */
                const MAX_EXTRA_PASSES = 2;
                for (let pass = 1; pass <= MAX_EXTRA_PASSES; pass++) {
                    let still = cards.filter(c => !doneIds.has(c.offerId));
                    if (still.length === 0) break;
                    if (pacer && deadline > 0 && !pacer.fits(deadline, beatGap)) {
                        Utils.log("🟡", `国际版每日活动到点：还剩 ${still.length} 张，交给下一轮`);
                        break;
                    }
                    Utils.log("  ", `国际版补做第 ${pass} 轮：${still.length} 张未记账，${Math.round(pacer ? pacer.otherSpanMs() / 1000 : 60)} 秒后重试`);
                    if (pacer) await pacer.beat(beatGap);
                    else await Utils.randomDelay(30000, 45000);
                    /* 补做轮自己的预算：最多再花 3 分钟 / 5 次交卷，
                       免得把本轮的「领取积分 / 二次扫描」挤掉。 */
                    const passDeadline = Date.now() + 3 * 60 * 1000;
                    let sent = 0;
                    for (const card of still) {
                        if (Date.now() > passDeadline || sent >= 5) {
                            Utils.log("  ", "国际版补做轮预算用完，剩余交给下一轮");
                            break;
                        }
                        if (pacer && deadline > 0 && !pacer.fits(deadline, beatGap)) break;
                        const name = card.title || card.offerId;
                        sent++;
                        const last = await this.report(panel, card);
                        if (last && last.ok) {
                            ok++;
                            doneIds.add(card.offerId);
                            /* 同上：交卷≠到账，等回读 */
                            Utils.log("📮", `国际版卡片补做已交卷（待确认）：${name} 名义 +${card.points}p`);
                        }
                        if (pacer) await pacer.beat(beatGap);
                    }
                    await Utils.delay(2500);
                    const again = await readBack();
                    if (again) confirmed = again.confirmed;
                }
            } catch (_) {}

            /* pending 只认回读到的 complete=true。以前拿 doneIds 算，
               于是「受理即完成」，日志永远打「全部完成」。 */
            const pending = cards.filter(c => !confirmedIds.has(c.offerId)).length;
            const confirmedCount = cards.length - pending;
            /* 被 pickCards 过滤掉的卡（没 hash 等）也算「没做完」：
               它们交不了卷，但如果瞒着不报，用户就会看到「4/4 全部完成」
               而面板上还亮着卡 —— 那正是这次被指出的「提示已完成却没完成」。 */
            const droppedNote = droppedCards.length > 0
                ? `；另有 ${droppedCards.length} 张无法处理（${droppedCards.map(c => c.title).join("、")}）`
                : "";
            if (pending === 0 && droppedCards.length === 0) {
                Utils.log("✅", `国际版每日活动全部完成（${cards.length} 张）`
                    + (gained > 0 ? `（余额 +${gained}）` : "（服务端已确认）"));
            } else if (pending === 0 && droppedCards.length > 0) {
                /* 脚本能做的都做完了，但还有卡因「没 hash」做不了 —— 不能说全完成 */
                Utils.log("🟡", `国际版每日活动：可处理的 ${cards.length} 张已全部确认到账`
                    + `${droppedNote}（面板未下发 hash，脚本无法交卷）`);
            } else if (confirmedCount === 0) {
                /* 一张都没确认：别说「还差几张」，要说清「一张都没到账」。
                   ⚠️ 这里**不推送**（第二个参数 false）：未完成只是过程状态，
                   通知只该在真的做完时出现，否则等于每轮都来骚扰一次。 */
                Utils.log("🟠", `国际版每日活动：${cards.length} 张均未确认到账`
                    + `（交卷已发，但服务端回读仍是未完成；余额 +${gained}）`
                    + `${lastReason ? `：${String(lastReason).split("；")[0]}` : ""}`
                    + droppedNote);
            } else {
                const names = cards.filter(c => !confirmedIds.has(c.offerId)).map(c => c.title || c.day).join("、");
                Utils.log("🟡", `国际版每日活动：确认到账 ${confirmedCount}/${cards.length} 张`
                    + `（余额 +${gained}），还差 ${pending} 张：${names}`
                    + `${lastReason ? `（${String(lastReason).split("；")[0]}）` : ""}，下一轮继续`
                    + droppedNote);
            }
            return {
                found: cards.length,
                done: confirmedCount,
                pending,
                /* 把握不了（没 hash 等）的卡数，上层用它决定能否封盘 */
                dropped: droppedCards.length,
                /* 分数只报**实测余额增量**，不拿「名义分值 × 交卷次数」估算 ——
                   那正是以前虚报 +35 而实际只有 +20 的原因。 */
                points: gained > 0 ? gained : 0,
                /* 汇总里要能说清「为什么还差」：只取第一句原因，别把 5 条通道全塞进去 */
                reason: pending === 0 ? "" : (outOfTime
                    ? "本轮时间不够，剩下的下一轮继续"
                    : String(lastReason || "").split("；")[0].slice(0, 60))
            };
        }
    };

    const EdgeStreak = {
        _running: false,

        /* 开关的唯一判定口（上游 9b144484b2 移植）：日志、诊断、汇总、执行都走这里，
           免得一处读成「开」、另一处读成「关」，自相矛盾。 */
        enabled() {
            return Utils.taskOn("Tasks.edge");
        },

        state() {
            const raw = GM_getValue("Config.edge", null);
            const st = (raw && typeof raw === "object") ? raw : {};
            const today = Utils.getTodayNum();
            const base = {
                date: today, count: 0, last: 0, complete: false, activated: false,
                notified: false, extra: 0, total: 0, intervalMin: 5, offerid: "", type: "714", sync: 0,
                giveUp: false, startAt: 0,
                /* 服务端最近一次回读到的进度（分钟）。汇总只认它和 complete，
                   不再拿本地的「已上报次数」冒充进度 —— 那是脚本内部计数，
                   跟页面上「分钟: 30/30」根本不是一回事。 */
                serverMin: 0, serverMax: 0
            };
            if (st.date !== today) return base;
            const intervalMin = Number(st.intervalMin) || 5;
            const count = Number(st.count) || 0;
            const last = Number(st.last) || 0;
            /* 老状态升级：旧版本没有 startAt，但有 count/last。
               用 last 反推一个等效锚点，别让已累计的进度被当成「全新一天」重来。
               放在 state() 里做，任何读状态的地方（含诊断面板）都能看到同一个值。 */
            let startAt = Number(st.startAt) || 0;
            if (!startAt && count > 0 && last) {
                startAt = last - (count - 1) * Math.max(1, intervalMin) * 60 * 1000;
            }
            return {
                ...base,
                count,
                last,
                complete: !!st.complete,
                activated: !!st.activated,
                notified: !!st.notified,
                extra: Number(st.extra) || 0,
                total: Number(st.total) || 0,
                intervalMin,
                offerid: String(st.offerid || ""),
                type: String(st.type || "714"),
                sync: Number(st.sync) || 0,
                giveUp: !!st.giveUp,
                serverMin: Number(st.serverMin) || 0,
                serverMax: Number(st.serverMax) || 0,
                /* 本轮「开始累计」的锚点。服务端记的是「你实际浏览了多久」，
                   所以第 1 次上报也必须先真的过去一个计费窗口，
                   不能脚本一启动就立刻拍一次「已浏览 5 分钟」。 */
                startAt,
            };
        },

        save(st) {
            GM_setValue("Config.edge", st);
        },

        intervalOf(attr) {
            const n = Number(attr && attr.report_per_minutes);
            return (Number.isFinite(n) && n >= 1 && n <= 30) ? n : 5;
        },

        typeOf(attr) {
            const t = String((attr && attr.report_offer_type) || "").trim();
            return /^\d+$/.test(t) ? t : "714";
        },

        /* 把服务端 promo 的「是否完成 / 已浏览分钟」抄进本地，汇总只认它。
           ⚠ attr.max/value 是积分不是分钟（常见 120），分钟字段只认名字带 minute 的。 */
        syncFromPromo(st, promo) {
            if (!promo) return st;
            const attr = promo.attributes || {};
            const done = String(attr.complete).toLowerCase() === "true";
            st.complete = done;
            const pickNum = (...vals) => {
                for (const v of vals) {
                    const n = Number(v);
                    if (Number.isFinite(n) && n >= 0) return n;
                }
                return null;
            };
            /* 只认「分钟语义」的键名。pointProgress/Max 在别的活动里是分钟口径，
               但本活动里可能是积分，所以还要再过一道合理性检查（见下）。 */
            const cur = pickNum(attr.minutesProgress, attr.minuteProgress,
                attr.browsingMinutes, attr.browsedMinutes, attr.progressMinutes);
            const max = pickNum(attr.minutesMax, attr.minuteMax,
                attr.targetMinutes, attr.totalMinutes);
            const sane = (v, limit) => (v != null && v >= 0 && v <= limit);
            if (sane(cur, 24 * 60)) st.serverMin = cur;
            if (sane(max, 24 * 60) && max > 0) st.serverMax = max;
            /* 服务端没给可信分钟数时，目标时长就是活动规定的 30 分钟。
               绝不让积分值（120）混进来当分母。 */
            if (!(Number(st.serverMax) > 0)) st.serverMax = EDGE.TARGET_MINUTES;
            if (Number(st.serverMax) > 24 * 60) st.serverMax = EDGE.TARGET_MINUTES;
            if (Number(st.serverMin) > Number(st.serverMax)) st.serverMin = 0;
            if (done) {
                /* 已完成以目标时长为准，别显示 28/30 这种半截数字 */
                st.serverMax = EDGE.TARGET_MINUTES;
                st.serverMin = EDGE.TARGET_MINUTES;
            }
            st.sync = Date.now();
            return st;
        },

        findPromotion(profile) {
            const list = (profile && Array.isArray(profile.promotions)) ? profile.promotions : [];
            if (list.length === 0) return null;
            const exact = list.find(p => p && p.name === EDGE.PROMO_NAME);
            if (exact) return exact;
            const variant = list.find(p => p && EDGE.PROMO_PREFIX.test(String(p.name || "")));
            if (variant) return variant;
            return list.find(p => p && p.attributes
                && /edge/i.test(String(p.name || ""))
                && !!(p.attributes.offerid && p.attributes.report_offer_type)) || null;
        },

        notifyDone(st) {
            if (st.notified) return;
            st.notified = true;
            this.save(st);
            Utils.log("🌐", `Edge 浏览连签任务已完成！（今日 ${EDGE.TARGET_MINUTES} 分钟浏览已记账）`);
        },

        async step() {
            const st = this.state();
            const totalOf = () => st.total || Math.ceil(EDGE.TARGET_MINUTES / Math.max(1, st.intervalMin));

            if (st.giveUp) {
                return { done: false, skipped: true, count: st.count, total: totalOf(), waitMs: 6 * 60 * 60 * 1000 };
            }
            if (st.complete && Date.now() - st.sync < 2 * 60 * 60 * 1000) {
                return { done: true, count: st.count || totalOf(), total: totalOf(), waitMs: 30 * 60 * 1000 };
            }
            /* 第 N 次上报必须等「锚点 + N 个窗口」过去。旧条件 count > 0 &&
               让每天第一次直接失效，启动就拍上第 1 个 5 分钟。 */
            {
                const winMs = Math.max(1, st.intervalMin) * 60 * 1000;
                const anchor = st.startAt || st.last;
                if (anchor && st.count < totalOf()) {
                    const byAnchor = anchor + (st.count + 1) * winMs;
                    const byLast = st.last ? st.last + winMs : 0;
                    const dueAt = Math.max(byAnchor, byLast);
                    if (Date.now() < dueAt - 5000) {
                        return {
                            done: false, count: st.count, total: totalOf(),
                            waitMs: dueAt - Date.now()
                        };
                    }
                }
            }
            /* 已有真实窗口才落锚点；窗口未知就先等 profile，免得按默认 5 分钟早报。
               count 已满但服务端没确认 = 等复核，不是重新开始。 */
            if (!st.startAt && st.total > 0 && st.count < st.total) {
                st.startAt = Date.now();
                this.save(st);
                const win = Math.max(1, st.intervalMin);
                Utils.log("🌐", `Edge 浏览连签：开始累计，${st.total} 次 × 每次 ${win} 分钟`
                    + `（第 1 次将在约 ${win} 分钟后上报）`);
                return { done: false, count: 0, total: st.total, waitMs: win * 60 * 1000 };
            }
            if (!RewardsAuto.state.token) {
                const ok = await API.renewToken();
                if (!ok || !RewardsAuto.state.token) {
                    Utils.log("🟡", "Edge 浏览连签：暂无可用 Token，跳过（先完成授权）");
                    return { done: false, count: st.count, total: totalOf(), waitMs: 5 * 60 * 1000 };
                }
            }
            const region = API.edgeRegion();
            let profile = await API.getEdgeProfile(region);
            if (!profile) return { done: false, count: st.count, total: totalOf(), waitMs: 5 * 60 * 1000 };
            let promo = this.findPromotion(profile);

            if (!promo && !st.activated) {
                st.activated = true;
                this.save(st);
                const res = await API.activateEdgeBrowsing();
                if (res === "absent") {
                    st.giveUp = true;
                    this.save(st);
                    Utils.log("🟡", "Edge 浏览连签：当前账号没有这个活动（地区/账号不支持），今日跳过");
                    return { done: false, skipped: true, count: st.count, total: totalOf(), waitMs: 6 * 60 * 60 * 1000 };
                }
                Utils.log(res === "already" ? "🟢" : "🟡",
                    `Edge 浏览连签：活动${res === "activated" ? "已激活" : res === "already" ? "此前已激活" : "激活失败"}（${res}）`);
                await Utils.delay(Utils.randomRange(3000, 6000));
                profile = await API.getEdgeProfile(region);
                promo = profile ? this.findPromotion(profile) : null;
            }
            if (!promo) {
                Utils.log("🟡", "Edge 浏览连签：暂未找到活动项，可先在 Edge 里打开 rewards.bing.com/earn?section=streaks 手动开启");
                return { done: false, count: st.count, total: totalOf(), waitMs: 60 * 60 * 1000 };
            }

            const attr = promo.attributes || {};
            st.intervalMin = this.intervalOf(attr);
            st.total = Math.ceil(EDGE.TARGET_MINUTES / st.intervalMin);
            st.offerid = String(attr.offerid || "").trim();
            st.type = this.typeOf(attr);
            const total = st.total;
            /* 先把服务端的真实进度抄下来：汇总读的是这一份，不是本地 count */
            this.syncFromPromo(st, promo);

            if (String(attr.complete).toLowerCase() === "true") {
                st.complete = true;
                st.sync = Date.now();
                st.count = total;
                this.save(st);
                this.notifyDone(st);
                return { done: true, count: total, total, waitMs: 30 * 60 * 1000 };
            }
            if (st.complete) {
                Utils.log("🟡", "Edge 浏览连签：本地标记已完成但服务端未确认，重新累计");
                st.complete = false; st.count = 0; st.last = 0; st.extra = 0; st.notified = false;
                /* 重来一轮 = 重新计时，第 1 次上报照样要等满一个窗口 */
                st.startAt = 0;
                this.save(st);
            }
            /* 走到这儿说明服务端还没做完，且（按已知窗口）已经到点。
               如果上面是用默认 5 分钟判的，而真实窗口更大，这里用服务端的
               intervalMin 再判一次，避免按小窗口提前上报。 */
            if (!st.startAt) {
                st.startAt = Date.now();
                this.save(st);
                const win = Math.max(1, st.intervalMin);
                Utils.log("🌐", `Edge 浏览连签：开始累计，${total} 次 × 每次 ${win} 分钟`
                    + `（第 1 次将在约 ${win} 分钟后上报）`);
                return { done: false, count: 0, total, waitMs: win * 60 * 1000 };
            }
            {
                const winMs = Math.max(1, st.intervalMin) * 60 * 1000;
                const byAnchor = st.startAt + (st.count + 1) * winMs;
                const byLast = st.last ? st.last + winMs : 0;
                const dueAt = Math.max(byAnchor, byLast);
                if (st.count < total && Date.now() < dueAt) {
                    return { done: false, count: st.count, total, waitMs: dueAt - Date.now() };
                }
            }
            if (!st.offerid) {
                st.giveUp = true;
                this.save(st);
                Utils.log("🟡", "Edge 浏览连签：活动项缺少 offerid，无法上报，今日跳过");
                return { done: false, skipped: true, count: st.count, total, waitMs: 6 * 60 * 60 * 1000 };
            }
            if (st.count >= total) {
                if (Date.now() - st.last < 10 * 60 * 1000) {
                    return { done: false, count: st.count, total, waitMs: 10 * 60 * 1000 };
                }
                if (st.extra >= EDGE.MAX_EXTRA_ROUNDS) {
                    st.giveUp = true;
                    this.save(st);
                    Utils.log("🟡", `Edge 浏览连签：已上报 ${st.count}/${total} 次仍未确认完成，今日暂停（明日自动重试）`);
                    return { done: false, skipped: true, count: st.count, total, waitMs: 6 * 60 * 60 * 1000 };
                }
                st.extra++;
                st.count = 0;
                st.last = 0;
                /* 整轮重来 = 重新计时：锚点必须换成「现在」，
                   否则 state() 会拿旧的 last 反推出一个过去的锚点，
                   下一轮就以为窗口早就过了，于是立刻上报。 */
                st.startAt = Date.now();
                this.save(st);
                Utils.log("🟡", `Edge 浏览连签：服务端未确认完成，第 ${st.extra}/${EDGE.MAX_EXTRA_ROUNDS} 轮重新累计`);
                return { done: false, count: 0, total, waitMs: 0 };
            }

            const res = await API.reportEdgeActivity({ offerid: st.offerid, type: st.type, region });
            const code = (res && typeof res.code === "number") ? res.code : -1;
            if (code !== 0) {
                Utils.log("🟡", `Edge 浏览连签：第 ${Math.min(st.count + 1, total)}/${total} 次上报失败（code=${code}），稍后重试`);
                return { done: false, count: st.count, total, waitMs: 5 * 60 * 1000 };
            }
            const dup = !!(res.response && res.response.isDuplicate === true);
            st.last = Date.now();
            st.sync = Date.now();
            if (!dup) st.count = Math.min(st.count + 1, total);
            this.save(st);
            Utils.log(dup ? "🟡" : "🟢",
                `Edge 浏览连签：第 ${st.count}/${total} 次上报${dup ? "（被判重，未记账）" : "已记账"}`);

            await Utils.delay(Utils.randomRange(2000, 4000));
            const after = await API.getEdgeProfile(region);
            const afterPromo = after ? this.findPromotion(after) : null;
            if (afterPromo) this.syncFromPromo(st, afterPromo);
            if (afterPromo && String((afterPromo.attributes || {}).complete).toLowerCase() === "true") {
                st.complete = true;
                st.sync = Date.now();
                st.count = total;
                this.save(st);
                this.notifyDone(st);
                return { done: true, count: total, total, waitMs: 30 * 60 * 1000 };
            }
            this.save(st);
            return {
                done: false, count: st.count, total,
                waitMs: dup ? Math.max(60 * 1000, st.intervalMin * 60 * 1000) : st.intervalMin * 60 * 1000
            };
        },

        /* 只读刷新一次 profile，不上报不激活。EdgePacer 有节流，
           不刷新汇总会显示很早以前的陈旧进度。 */
        async refreshFromServer() {
            if (!this.enabled()) return null;
            if (!Utils.has("Config.token")) return null;
            try {
                const region = API.edgeRegion();
                const profile = await API.getEdgeProfile(region);
                const promo = profile ? this.findPromotion(profile) : null;
                if (!promo) return null;
                const st = this.state();
                const attr = promo.attributes || {};
                st.intervalMin = this.intervalOf(attr);
                st.total = Math.ceil(EDGE.TARGET_MINUTES / st.intervalMin);
                this.syncFromPromo(st, promo);
                if (st.complete) st.count = st.total;
                this.save(st);
                return st;
            } catch (_) {
                return null;
            }
        },

        async run() {
            if (!this.enabled()) return null;
            /* 判的是「有没有 refresh_token」——token 是一串 M.C5xx… 的文本，
               用布尔读法或 flag() 都会误判，导致上报链第一步就被静默掐断。 */
            if (!Utils.has("Config.token")) {
                Utils.logSilenced("🟡", "Edge 浏览连签：还没有授权（缺 refresh_token），跳过；请先完成一次授权",
                    "edgeNoToken", 6 * 60 * 60 * 1000);
                return null;
            }
            if (this._running) return null;
            if (!Utils.acquireLock("Config.edgeLock", 3 * 60 * 1000)) {
                Utils.logSilenced("🟡", "Edge 浏览连签：另一个上下文正在累计，本次跳过",
                    "edgeLocked", 10 * 60 * 1000);
                return null;
            }
            this._running = true;
            try {
                return await this.step();
            } catch (e) {
                Utils.log("🟡", `Edge 浏览连签异常: ${e.message}`);
                return null;
            } finally {
                this._running = false;
                Utils.releaseLock("Config.edgeLock");
            }
        },

        /* 汇总口径：服务端「有没有完成」说了算，分钟数也取服务端回读值。
           本地 count 只是「我发了几次上报」——它可能因为判重、跨设备浏览、
           服务端延迟记账而和真实进度差很远。以前拿它当进度显示，
           于是出现「页面 30/30 已完成，推送却说 0/6 ⏳」这种自相矛盾。 */
        summary() {
            if (!this.enabled()) return null;
            const st = this.state();
            const done = !!st.complete;
            /* 分母只能是「活动要求的分钟数」。服务端若给出可信值才采用，
               但必须同时满足：> 0 且 <= 24 小时 且 不是明显的积分值。
               实际遇到的脏数据是 120（这张卡给的积分），所以「比目标大一倍以上」
               一律视为误读 —— 分母退回 EDGE.TARGET_MINUTES（30）。 */
            const rawMax = Number(st.serverMax) || 0;
            const maxMin = (rawMax > 0 && rawMax <= EDGE.TARGET_MINUTES * 2) ? rawMax : EDGE.TARGET_MINUTES;
            let curMin = Number(st.serverMin) || 0;
            if (done) curMin = maxMin;
            if (!(curMin >= 0) || curMin > maxMin) curMin = 0;
            const count = Math.min(st.count, st.total || 0);
            /* 服务端读数可信 = 读到过 serverMax（进度接口正常应答）或已明确完成。
               不可信时不能直接显示 0：2026-11-20 的 joe 就是这种情况 ——
               6/6 次上报全部「已记账」，但进度查询连续 HTTP 500，
               汇总写成「🌐 Edge 浏览连签 · ⏳ 0/30 分钟」，看起来像一整天没做。
               改为按「已上报次数 × 每次 5 分钟」估算，并在文案里标明是本地计数，
               不与服务端口径混为一谈。 */
            const serverKnown = Number(st.serverMax) > 0 || done;
            const estimated = !serverKnown && !done;
            if (estimated) curMin = Math.min(maxMin, count * EDGE.MINUTES_PER_REPORT);
            return {
                done,
                skipped: st.giveUp && !done,
                count,
                total: st.total || 0,
                /* 分钟口径：与服务端面板一致；读不到服务端值时才退回「已完成/未完成」 */
                minutes: { cur: curMin, max: maxMin, known: serverKnown },
                text: `${curMin}/${maxMin} 分钟` + (estimated ? "（本地计数，服务端未确认）" : "")
            };
        }
    };

    const EDGE_PACE_TICK = 30 * 1000;

    const EdgePacer = {
        busy: false,
        nextAt: 0,

        async maybeReport() {
            if (this.busy) return null;
            if (Date.now() < this.nextAt) return null;
            if (!(await RegionGuard.allow())) {
                this.nextAt = Date.now() + 5 * 60 * 1000;
                return null;
            }
            this.busy = true;
            try {
                const r = await EdgeStreak.run();
                if (!r) {
                    this.nextAt = Date.now() + 5 * 60 * 1000;
                } else {
                    const wait = r.done ? 30 * 60 * 1000 : (r.waitMs || 0);
                    this.nextAt = Date.now() + Math.max(EDGE_PACE_TICK, wait);
                }
                return r;
            } catch (_) {
                this.nextAt = Date.now() + 5 * 60 * 1000;
                return null;
            } finally {
                this.busy = false;
            }
        }
    };

    const ROUND_BUDGET_MS = 20 * 60 * 1000;
    /* 收工前最后一轮的预算上限：末轮塞不下欠的搜索，收工一到浏览器就被关闭，
       没做完的搜索只能丢到明天（跨天清零）。所以最后一个执行点允许把预算放宽到
       「离收工还剩多久」，最多这么多。
       v0.79：改成 60 分钟 = 一串节点（3 × 20）+ 两次节点间隔，与 runNodes 的总上限一致；
       以前 45 分钟是针对「一轮只干 20 分钟」的补偿。 */
    const ROUND_LAST_BUDGET_MS = 60 * 60 * 1000;

    /* ══ 节点式执行（v0.79）═════════════════════════════════════════════
       用户要求（2026-11-22）：
         ① 轮询节奏还是 20 分钟 —— 一个节点就是一个 20 分钟窗口（ROUND_BUDGET_MS）；
         ② 任务一直做别停 —— 节点做完立刻接下一个节点，中间只停「节点间隔」；
         ③ 每个节点开头先盘点还剩什么任务，已完成的直接跳过，不重复做；
         ④ 搜索 / 阅读不混在同一个节点：要么整节点全搜索，要么整节点全阅读；
         ⑤ 其他活动（桌面周任务 / 月度 / 活动卡 / 连签 / 每日活动 / 国际版 /
            领奖 / 二次扫描 / Edge）在一次节点里全部做完。
       节点间隔默认 60~180 秒随机（Config.nodeGapMin / nodeGapMax）。 */
    const NODE_GAP_FALLBACK = [60 * 1000, 180 * 1000];
    /* 一轮总时长上限：节点会一直串下去，这里只防「卡在某个不会返回的请求上」时
       把上下文永远占住。取运行窗口剩余时间的上限，最少 60 分钟。 */
    const ROUND_TOTAL_MAX = 6 * 60 * 60 * 1000;

    const SEARCH_PACER = {
        /* ── 两套间隔基准，都在脚本顶部的 UserConfig 里配，不用改代码 ──
           Config.span      = 搜索间隔基准（默认 60 秒，最低 60 秒）
                              → cycle() 每次独立抽样，落在 基准×0.6 ~ ×2.2
           Config.otherSpan = 其他任务间隔基准（阅读/活动卡片/每日活动/
                              国际版活动/二次扫描，默认 60 秒，最低 10 秒）
                              → jitter() 固定 ±15 秒对称浮动
           FLOOR_MS=5 秒只防负数；限流保护靠两条刹车：
           NO_CREDIT_LIMIT（连续 10 分钟零记账收手）、MAX_ATTEMPTS。 */
        SPAN_MIN_MS: 60 * 1000,
        /* 其他任务（阅读/活动卡片/每日活动/国际版活动/二次扫描）的独立基准，
           由 Config.otherSpan 配置，默认 60 秒。下限 10 秒只用来挡 0/负数，
           真实节奏完全交给配置 —— 想让阅读更慢就把它调大，不必动搜索。 */
        OTHER_SPAN_MIN_MS: 10 * 1000,
        JITTER_MS: 15 * 1000,
        /* ── 搜索间隔：每次重新抽一个随机值，不是「基准 ±15 秒」的固定节拍 ──
           正常落在 [基准×0.6, 基准×2.2]；另有 LONG_PAUSE_P 的概率来一次
           基准×3~8 的长停顿（像人离开一会儿），让节奏看不出规律。 */
        CYCLE_MIN_RATIO: 0.6,
        CYCLE_MAX_RATIO: 2.2,
        LONG_PAUSE_P: 0.10,
        LONG_PAUSE_MIN: 3,
        LONG_PAUSE_MAX: 8,
        /* ── 本轮份额：围绕「还差 ÷ 剩余轮数」随机摆动，不做等分 ──
           factor 偏小（多数轮次少搜几次、偶尔一轮猛搜），剩余 3 轮以上时
           还有 SKIP_P 的概率整轮跳过，把份额挪到别的时间点。 */
        SHARE_MIN: 0.4,
        SHARE_MAX: 1.9,
        SKIP_P: 0.15,
        /* 浮动后的绝对下限：只用来挡住负数/0，不是「最慢不能低于 1 分钟」 */
        FLOOR_MS: 5 * 1000,
        OBSERVE_MIN: 5 * 1000,
        OBSERVE_MAX: 10 * 1000,
        VERIFY_MIN: 5 * 1000,
        VERIFY_MAX: 9 * 1000,
        MAX_ATTEMPTS: 60,
        NO_CREDIT_LIMIT: 10 * 60 * 1000,
        MIN_ATTEMPTS_BEFORE_GIVEUP: 8,
        /* 连续这么多次搜索都没记账，就提前收手（比 NO_CREDIT_LIMIT 的时间判据更快） */
        STREAK_STOP: 10,
        RETRY_GAP: 5 * 60 * 1000,

        /* 用户配置的间隔基准：只保证不低于 SPAN_MIN_MS（60 秒），
           上限完全交给用户 —— 想设 10 分钟、1 小时都行。 */
        spanMs() {
            const span = Number(GM_getValue("Config.span", 60)) || 60;
            const ms = Math.round(span * 1000);
            return Math.max(this.SPAN_MIN_MS, ms);
        },

        minMs() { return this.spanMs(); },

        /* 其他任务的间隔基准：Config.otherSpan（默认 60 秒）。
           这一类不抽 cycle()，只做 ±JITTER_MS 的对称浮动，节奏比搜索稳。 */
        otherSpanMs() {
            const span = Number(GM_getValue("Config.otherSpan", 60)) || 60;
            return Math.max(this.OTHER_SPAN_MIN_MS, Math.round(span * 1000));
        },

        /* scope="other" 取其他任务基准，其余（含不传）都取搜索基准。 */
        startGap(scope) { return scope === "other" ? this.otherSpanMs() : this.minMs(); },

        /* 兼容旧调用点：现在没有退让，上限就等于基准值。 */
        maxMs() { return this.spanMs(); },

        /* 对称浮动：base ± JITTER_MS，两侧等概率，不再向上单向。
           地板只取 FLOOR_MS（5 秒，防负数），不设上限；配 60 时实际 45~75 秒，
           向下浮动真的会生效 —— 这正是「取消下限」的效果。 */
        jitter(ms) {
            const base = Number(ms) || this.minMs();
            const delta = (Math.random() * 2 - 1) * this.JITTER_MS;
            const out = Math.round((base + delta) / 1000) * 1000;
            return Math.max(this.FLOOR_MS, out);
        },

        /* 不再退让：无论上一轮是否记账，下一次都用同一个基准间隔。
           保留 (gap, progressed) 形参是为了不改所有调用点；
           scope="other" 时返回其他任务的基准，别把搜索的基准串到阅读/卡片上。 */
        nextGap(gap, progressed, scope) {
            return this.startGap(scope);
        },

        /* 搜索用的间隔：每次独立抽样，两次之间没有任何连续性 —— 不比上一轮长，
           也不比上一轮短，纯粹重抽。基准由 Config.span 决定。 */
        cycle() {
            const base = this.spanMs();
            const ms = Math.random() < this.LONG_PAUSE_P
                ? base * (this.LONG_PAUSE_MIN + Math.random() * (this.LONG_PAUSE_MAX - this.LONG_PAUSE_MIN))
                : base * (this.CYCLE_MIN_RATIO + Math.random() * (this.CYCLE_MAX_RATIO - this.CYCLE_MIN_RATIO));
            return Math.max(this.FLOOR_MS, Math.round(ms / 1000) * 1000);
        },
        cycleMin() { return Math.round(this.spanMs() * this.CYCLE_MIN_RATIO); },
        cycleMax() { return Math.round(this.spanMs() * this.CYCLE_MAX_RATIO); },
        pauseMax() { return Math.round(this.spanMs() * this.LONG_PAUSE_MAX); },

        /* 本轮该搜几次：随机分配，但不低于「平均值向上取整」，且至少 1 次。
           ⚠ 下限是硬要求：以前允许整轮跳过（返回 0）和只搜 1 次，一旦某轮被
           「上下文销毁 / 到点交班 / 冷却」吃掉，剩余配额就再也追不回来 ——
           日志里 Dean 还剩 30 分、只剩 5 个执行点，每轮却只分到 1 次，
           到 18:00 最多再做 5 次（15 分），剩下 15 分必然跨天丢掉。
           现在每轮至少 ceil(平均)；配额快满（平均 < 1）时也给 1 次，让收尾提前，
           不再出现「随机跳过整轮」把时间空着。 */
        pickShare(needed, roundsLeft) {
            const n = Math.max(0, Math.round(Number(needed) || 0));
            const left = Math.max(1, Math.round(Number(roundsLeft) || 1));
            if (n <= 0) return 0;
            /* 最后一轮 / 只剩一两次：不随机，做完收工 */
            if (left <= 1 || n <= 2) return n;
            const avg = n / left;
            const floorShare = Math.max(1, Math.ceil(avg));
            const factor = this.SHARE_MIN + Math.pow(Math.random(), 1.4) * (this.SHARE_MAX - this.SHARE_MIN);
            const share = Math.round(avg * factor);
            const cap = Math.max(2, Math.min(n, Math.ceil(avg * 3)));
            return Math.max(floorShare, Math.min(share, cap));
        },

        async beat(gap) {
            await Utils.delay(this.jitter(gap));
        },

        fits(deadline, gap) {
            const d = Number(deadline) || 0;
            if (d <= 0) return true;
            /* 预留「最大抖动 + 5 秒余量」：抖动改成正负绝对值后，
               不能再按百分比（gap × 1.35）估，否则小间隔时预留不足。 */
            return Date.now() + Math.round((Number(gap) || 0) + this.JITTER_MS + 5000) <= d;
        },
        saveGap(ms) {
            GM_setValue("Config.searchGap", { date: Utils.getTodayNum(), ms: Math.round(ms) });
        },
        loadGapPeak() {
            const saved = GM_getValue("Config.searchGap", null);
            if (!saved || typeof saved !== "object" || saved.date !== Utils.getTodayNum()) return 0;
            const ms = Number(saved.ms) || 0;
            return (ms <= 0 || ms > this.pauseMax()) ? 0 : ms;
        },
        setLast(stat) {
            GM_setValue("Config.searchLast", stat ? { date: Utils.getTodayNum(), ...stat } : null);
        },
        getLast() {
            const l = GM_getValue("Config.searchLast", null);
            if (!l || typeof l !== "object" || l.date !== Utils.getTodayNum()) return null;
            return { attempts: Number(l.attempts) || 0, credits: Number(l.credits) || 0, peak: Number(l.peak) || 0, at: Number(l.at) || 0 };
        },

        summary() {
            const min = Math.round(this.minMs() / 1000);
            const other = Math.round(this.otherSpanMs() / 1000);
            return {
                gap: min, min, other,
                peak: Math.round(this.loadGapPeak() / 1000),
                pending: false,
                last: this.getLast()
            };
        }
    };

    try {
        /* 代发服务在两个域上都启动：
             · rewards.bing.com —— 老用途（待领积分 / Server Action 交卷）
             · bing.com         —— 国际版每日活动面板接口就在这个域下，
                                   只有同源页面 fetch 才能带对 Origin/Referer */
        if (Utils.hasDOM() && typeof location !== "undefined"
            && /(^|\.)(rewards\.)?bing\.com$/i.test(String(location.hostname || ""))) {
            API.startPageServer();
            Utils.log("🖥️", `代发服务已启动（页面上下文：${location.hostname}）`);
        }
    } catch (_) {}

    const TaskManager = {
        signDate: 0, readDate: 0, promosDate: 0, searchDate: 0, streakDays: 0,
        signPoint: -1, signTimes: 0, readTimes: 0, promosTimes: 0,
        claimSummary: "",
        claimReason: "",
        running: false, runningSince: 0, roundBudget: 0,
        abortRound: false, hbTimer: null, roundSeq: 0, roundId: 0, lastRunStarted: false,

        /* 心跳：证明「这个上下文还活着」，同时给运行锁续期。
           注意只写 aliveAt（存活时间），不写 at（最后进展时间）——
           at 由真正的任务推进刷新，两个时间分开才能区分
           「活着但卡在某个请求上」和「已经彻底断开」。 */
        heartbeat() {
            if (!this.running) return false;
            /* 只允许「当前这一轮」动状态：被强制收尾后，旧轮的 promise 链
               还可能继续往下走，它的心跳不能把新一轮的标记覆盖掉。 */
            if (this.roundId !== this.roundSeq) return false;
            const now = Date.now();
            /* 硬上限：v0.79 起一轮由多个节点串起来（每节点 20 分钟 + 节点间隔），
               总时长不再等于 ROUND_BUDGET_MS。这里用「一轮总上限 + 10 分钟余量」，
               卡死由下面的 ROUND_STALL（15 分钟没进展）负责兜底，不会拖一整天。 */
            const hardLimit = ROUND_TOTAL_MAX + 10 * 60 * 1000;
            if (now - (this.runningSince || now) > hardLimit) {
                const msg = this.abortRound
                    ? ""
                    : `本轮已超过硬上限 ${Math.round(hardLimit / 60000)} 分钟没有收尾，强制释放运行标记（下一轮重新开始）`;
                this.forceCleanupOwnRound(msg);
                return false;
            }
            /* 上下文还活着但任务长时间没有推进：同样要收尾。
               MV3 后台被冻结时 setInterval 会跟着停，这种情况心跳本身就是死的；
               而「心跳活着、at 不动」是卡在永不 settle 的 await 上，必须主动打断。 */
            const st = Sched.getState() || {};
            const lastProgress = Math.max(Number(st.at) || 0, Number(st.since) || 0, this.runningSince || 0);
            if (now - lastProgress > ROUND_STALL) {
                if (!this.abortRound) {
                    Utils.log("🔴", `本轮已经 ${Math.round((now - lastProgress) / 60000)} 分钟没有任何进展（多半卡在一个不会返回的请求上），强制收尾并交给下一轮`);
                }
                this.forceCleanupOwnRound("");
                return false;
            }
            /* runAlive 是「第几次心跳」的序号：别的上下文只有靠它变化才能证明
               这一轮真的还活着 —— aliveAt 可能被一个已经死掉的上下文留在过去。 */
            const runAlive = (Number(st.runAlive) || 0) + 1;
            GM_setValue("Config.runState", Object.assign({}, st, {
                phase: "running",
                aliveAt: now,
                runAlive,
                ctx: Sched.ctxName(),
                since: this.runningSince
            }));
            Utils.refreshLock("Config.runLock", RUN_LOCK_TTL);
            return true;
        },

        startHeartbeat() {
            this.stopHeartbeat();
            this.heartbeat();
            this.hbTimer = setInterval(() => {
                try { this.heartbeat(); } catch (_) {}
                /* Edge 连签挂在轮内心跳上：只在「本轮执行」期间上报，
                   EdgePacer 自按 intervalMin 节流，一轮 20 分钟推进 3~4 次。
                   开关关着就别再空转这条链（心跳每 30 秒一次，白跑很吵）。 */
                if (EdgeStreak.enabled()) {
                    try { EdgePacer.maybeReport().catch(() => {}); } catch (_) {}
                }
            }, RUN_HEARTBEAT_GAP);
        },

        stopHeartbeat() {
            if (this.hbTimer) {
                clearInterval(this.hbTimer);
                this.hbTimer = null;
            }
        },

        /* 强制收尾：只放掉「确实是自己」的锁。
           如果锁已经被别的上下文接手，那这里清掉会把别人正在跑的一轮搞坏。
           释放的动作全部走 releaseRound/finishRound，不再各写一份。 */
        forceCleanupOwnRound(reason) {
            this.abortRound = true;
            this.stopHeartbeat();
            this.running = false;
            this.runningSince = 0;
            /* 换一代，旧轮后续的心跳/收尾都不再被认为属于当前这一轮 */
            this.roundSeq++;
            this.roundId = this.roundSeq;
            const lock = Utils.lockInfo("Config.runLock");
            if (!lock || lock.mine) GM_setValue("Config.runLock", null);
            try { Sched.state("done"); } catch (_) {}
            try { Sched.clearClaim(); } catch (_) {}
            /* 被强制收尾时更要清干净：卡住的缓存/闸门正是「一直卡着」的元凶 */
            try { this.releaseRound({ force: false }); } catch (_) {}
            if (reason) Utils.log("🔴", reason);
        },

        /* 到点或被强制收尾后，长循环要尽快退出，别再往微软发请求 */
        aborted() { return !!this.abortRound; },

        releaseRound(opts = {}) {
            const done = [];
            const soft = (name, fn) => {
                try { fn(); done.push(name); } catch (_) {}
            };

            /* ① 本轮计数 / 汇总文本 / 一次性提示（纯内存） */
            soft("计数", () => {
                this.signTimes = 0;
                this.readTimes = 0;
                this.promosTimes = 0;
                this.claimSummary = "";
                this.claimReason = "";
            });

            /* ② 本轮业务状态（RewardsAuto.state 里只对本轮有意义的字段）。
               注意保留 host / region / dateNowNum：它们是「环境事实」，
               重新探测既慢又可能探测失败，留着是对的。 */
            soft("业务状态", () => {
                const s = RewardsAuto.state;
                s.lockedCount = 0;
                s.lockedPoints = 0;
                s.lockedTitles = [];
                s.desktopPendingTitles = [];
                s.manualCards = [];
                s.weeklyQuestDone = 0;
                s.weeklyQuestPending = 0;
                s.weeklyQuestFailed = 0;
                s.monthlyFound = 0;
                s.monthlyDone = 0;
                s.monthlyTotal = 0;
                s.monthlyPending = 0;
                s.monthlyComplete = false;
                s.monthlyUnlocked = 0;
                s.intlFound = 0;
                s.intlDone = 0;
                s.intlPending = 0;
                s.intlAbsent = false;
                s.intlCached = false;
                s.webNoAuth = false;
                s.webFailStreak = 0;
                s.sendMSG = "";
                s.startTime = 0;
            });

            /* ③ 各模块的短命缓存：有效期都远小于一轮，留着只会让下一轮读到旧值 */
            soft("接口缓存", () => {
                API._promoCache = null;
                API._webCompleteCache = null;
                /* 只失效 cookie 缓存、不把快照清空：很多请求依赖 Utils.xhr
                   自动补的那份 cookie，清空会退化成「未登录」而静默不记账。 */
                API._ckCache = "";
                API._ckAt = 0;
            });

            /* ④ CDP 的一次性令牌与封盘标记。
               _promosClean 表示「本轮活动卡是否全清」，是**本轮**结论，
               跨轮沿用会让下一轮误以为可以直接封盘。 */
            soft("CDP令牌", () => {
                CDP.revokeAllow();
                CDP._promosClean = false;
                CDP._uaOverrideAt = 0;
                CDP._warnedAt = 0;
            });

            /* ⑤ 并发闸门：理论上一轮结束时都为 false，但 await 抛错时可能卡住，
               卡住就等于下一轮永远不跑（这正是「死循环」的另一半成因）。 */
            soft("并发闸门", () => {
                EdgePacer.busy = false;
            });

            /* ⑥ 出口检测的内存结论：保留「上次是好的」会掩盖线路已切换的事实。
               只清内存，不动它的 TTL 缓存语义。 */
            soft("出口检测", () => {
                RegionGuard._inflight = null;
            });

            /* ⑦ 强制收尾时才动的东西：把当前轮次标记换代，
               让旧 promise 链后续的 tick/heartbeat 彻底失效。 */
            if (opts.force) {
                soft("轮次换代", () => {
                    this.abortRound = true;
                    this.roundSeq++;
                    this.roundId = this.roundSeq;
                });
            }

            return done;
        },

        /* 轮末收尾的唯一入口：释放 → 写调度状态 → 记日志。
           runAll 的 finally 与 forceCleanupOwnRound 都走这里，
           避免两条路径各清一半、漏掉对方清的东西。 */
        finishRound(reason = "", opts = {}) {
            const released = this.releaseRound(opts);
            this.stopHeartbeat();
            this.running = false;
            this.runningSince = 0;
            this.abortRound = false;
            try { Utils.releaseLock("Config.runLock"); } catch (_) {}
            try { Sched.state("done"); } catch (_) {}
            /* 18 点后的 20 分钟节拍从「这一轮结束」起算（见 hitWakePoint 的 continuous 分支）。 */
            try { GM_setValue(ROUND_END_KEY, Date.now()); } catch (_) {}
            if (reason) Utils.log("🔴", reason);
            if (released.length > 0) {
                Utils.log("🧹", `本轮已释放 ${released.length} 组状态：${released.join("、")}（下一轮从干净状态开始）`);
            }
            return released;
        },
        ensureAlive() {
            const err = msg => {
                const e = new Error(msg);
                e.roundAborted = true;
                return e;
            };
            if (this.abortRound) throw err("本轮已超时收尾");
            /* 已经换代 = 这一轮被强制收尾过，旧链不该再往下跑 */
            if (this.roundId !== this.roundSeq) throw err("本轮已被新的轮次取代");
            /* 锁被别人拿走了（另一个上下文接手）也要停手，避免并发重复上报 */
            const info = Utils.lockInfo("Config.runLock");
            if (info && !info.mine) throw err("运行锁已被其它上下文接管");
            Utils.refreshLock("Config.runLock", RUN_LOCK_TTL);
        },

        /* 长循环里的进度打点：既证明「还活着」，也证明「还在动」。
           每处理完一张卡/一篇文章调一次，卡死检测就不会误伤正常的长任务。 */
        tick() {
            this.ensureAlive();
            try { Sched.progress(); } catch (_) {}
        },

        init() {
            RewardsAuto.state.dateNowNum = Utils.getTodayNum();
            RewardsAuto.state.dateNowStr = Utils.getTodayStr();
            /* 注意：软重置会把 Config.tasks 显式写成 null，此时 GM_getValue 的默认值
               （{}）不会生效（只有键不存在时才回退），直接读 tasks.sign 会抛
               「Cannot read properties of null」。所以这里必须先判定成对象。 */
            const rawTasks = GM_getValue("Config.tasks", null);
            const tasks = (rawTasks && typeof rawTasks === "object") ? rawTasks : {};
            this.signDate = tasks.sign || 0;
            this.readDate = tasks.read || 0;
            this.promosDate = tasks.promos || 0;
            this.searchDate = tasks.search || 0;
            this.streakDays = tasks.streakDays || 0;
            this.signPoint = GM_getValue("Config.signPoint", -1);
            this.claimSummary = "";
            this.claimReason = "";
        },

        save() {
            GM_setValue("Config.tasks", {
                sign: this.signDate, read: this.readDate,
                promos: this.promosDate, search: this.searchDate,
                streakDays: this.streakDays
            });
        },

        async doSign() {
            if (!GM_getValue("Tasks.sign", true) || this.signTimes > 2) return;
            if (this.signPoint >= 0 && this.signDate === RewardsAuto.state.dateNowNum) {
                Utils.log("✅", `签入已完成(${this.signPoint}积分)`);
                return;
            }
            await RegionGuard.guard("签入");
            await Utils.randomDelay();
            let totalPoint = 0;
            let signOk = false;
            const appPoint = await API.signApp();
            if (appPoint >= 0) {
                signOk = true;
                if (appPoint > 0) {
                    GM_log(`📱 App签入静默成功 +${appPoint}积分`);
                    totalPoint += appPoint;
                } else {
                    GM_log("📱 App签入已确认，无新增积分");
                }
            }
            await Utils.randomDelay(3000, 8000);
            const pcPoint = await API.signPC();
            if (pcPoint >= 0) {
                signOk = true;
                Utils.log("💻", `PC签入成功！+${pcPoint}积分`);
                totalPoint += pcPoint;
            }
            if (signOk) {
                this.signPoint = totalPoint;
                this.signDate = RewardsAuto.state.dateNowNum;
                GM_setValue("Config.signPoint", totalPoint);
                this.save();
                Utils.log("🔵", `签入任务完成！总积分 +${totalPoint}`);
            } else {
                this.signTimes++;
                Utils.log("🟡", `签入失败，稍后重试`);
            }
        },

        async doRead(roundDeadline) {
            /* 次数上限放到 6：节点模式下阅读会连续占多个节点（「要么全阅读」），
               原来 >2 就在第二轮直接 return，会被节点循环误判成「没进展」。 */
            if (!GM_getValue("Tasks.read", true) || this.readTimes > 6) return;
            if (this.readDate === RewardsAuto.state.dateNowNum) {
                const verifyProgress = await API.getReadProgress();
                if (verifyProgress && verifyProgress.progress >= verifyProgress.max) {
                    Utils.log("✅", `阅读任务已完成（已验证 ${verifyProgress.progress}/${verifyProgress.max}）`);
                    return;
                } else if (verifyProgress) {
                    Utils.log("🟡", `阅读标记有误（${verifyProgress.progress}/${verifyProgress.max}），重置并继续`);
                    this.readDate = 0;
                    this.save();
                } else {
                    Utils.log("🟡", "无法验证阅读进度，跳过");
                    return;
                }
            }
            const progress = await this.readProgressWithRetry();
            if (!progress) {
                this.readTimes++;
                Utils.log("🟡", "无法获取阅读进度，稍后重试");
                return;
            }
            let cur = progress.progress;
            let max = progress.max;
            Utils.log("📖", `阅读进度: ${cur}/${max}`);
            if (cur >= max) {
                this.readDate = RewardsAuto.state.dateNowNum;
                /* 把服务端读到的进度写回 state：汇总里的「📋 阅读 x/y」读的是
                   state.readProgress，早先这里只写了 readDate，于是出现
                   「阅读已完成、也打了 30/30 的日志，但摘要显示 0/30」——
                   汇总那次查询一旦失败/没覆盖到，就会退回 state 里那个 0。 */
                RewardsAuto.state.readProgress = cur;
                RewardsAuto.state.readMax = max;
                this.save();
                Utils.log("✅", "阅读任务已完成");
                return;
            }
            const pointsPerArticle = 3;
            const maxPerDay = 10;
            const target = Math.min(Math.max(Math.ceil((max - cur) / pointsPerArticle), 1), maxPerDay);
            Utils.log("📖", `今日还可阅读 ${target} 篇（上限 ${maxPerDay} 篇/天，每篇约 ${pointsPerArticle} 分）`);
            let gap = SEARCH_PACER.startGap("other");
            /* v0.79：阅读节点独占整个 20 分钟窗口。
               以前这里还叠了个 8 分钟上限，10 篇（每篇一个 otherSpan 节拍）根本读不完，
               每次都「到点交班，还剩 N 篇」—— 一天下来阅读永远差几篇。 */
            const readCap = Date.now() + ROUND_BUDGET_MS;
            const readDeadline = (Number(roundDeadline) || 0) > 0 ? Math.min(Number(roundDeadline), readCap) : readCap;
            let successCount = 0;
            let stagnant = 0;
            for (let i = 0; i < target; i++) {
                this.tick();
                if (!SEARCH_PACER.fits(readDeadline, gap)) {
                    Utils.log("🟡", `阅读节点到点，还剩 ${target - i} 篇交给下一个阅读节点继续（当前节拍 ${Math.round(gap / 1000)} 秒）`);
                    break;
                }
                await SEARCH_PACER.beat(gap);
                await RegionGuard.guard("阅读");
                const result = await API.doRead();
                await Utils.randomDelay(3000, 8000);
                const after = await API.getReadProgress();
                let advanced = false;
                if (after) {
                    const gained = after.progress - cur;
                    max = after.max;
                    if (gained > 0) {
                        advanced = true;
                        successCount++;
                        stagnant = 0;
                        cur = after.progress;
                        Utils.log("📖", `阅读文章 ${i + 1}/${target} +${gained}积分（${cur}/${max}）`);
                    } else {
                        stagnant++;
                        Utils.log("🟡", `阅读文章 ${i + 1}/${target} 未计入进度（${after.progress}/${after.max}）`);
                    }
                } else if (result && result.points > 0) {
                    advanced = true;
                    successCount++;
                    stagnant = 0;
                    cur += result.points;
                    Utils.log("📖", `阅读文章 ${i + 1}/${target} +${result.points}积分（进度查询失败，按返回值统计）`);
                } else {
                    stagnant++;
                    if (!result) {
                        Utils.log("🟡", `阅读第 ${i + 1} 篇请求失败`);
                    } else {
                        Utils.log("🟡", `阅读第 ${i + 1} 篇无新增积分（返回 p:${result.points}，isDuplicate:${result.isDuplicate}）`);
                    }
                }
                gap = SEARCH_PACER.nextGap(gap, advanced, "other");
                if (cur >= max) {
                    Utils.log("📖", `阅读进度已满（${cur}/${max}），提前结束`);
                    break;
                }
                if (stagnant >= 3) {
                    Utils.log("🟡", "连续 3 篇未计入进度，停止本轮阅读上报");
                    break;
                }
            }
            if (successCount === 0) {
                this.readTimes++;
                Utils.log("🟡", "本轮阅读未产生积分，稍后重试");
                return;
            }
            const verify = await API.getReadProgress();
            if (verify && verify.progress >= verify.max) {
                this.readDate = RewardsAuto.state.dateNowNum;
                /* 同上：完成时把服务端进度落到 state，避免摘要退回旧的 0 */
                RewardsAuto.state.readProgress = verify.progress;
                RewardsAuto.state.readMax = verify.max;
                this.save();
                Utils.log("🔵", `阅读任务完成！共 ${successCount} 篇`);
            } else {
                this.readTimes++;
                Utils.log("🟡", `阅读已执行但未完成（${verify ? `${verify.progress}/${verify.max}` : "进度未知"}），下次继续`);
            }
        },

        async readProgressWithRetry(attempts = 3) {
            for (let i = 1; i <= attempts; i++) {
                const p = await API.getReadProgress();
                if (p) return p;
                if (i < attempts) {
                    Utils.log("🟡", `阅读进度读取失败，${i}/${attempts} 次重试`);
                    await Utils.delay(3210);
                }
            }
            return false;
        },

        async doDesktopWeekly() {
            if (!GM_getValue("Tasks.desktopWeekly", true)) return true;
            /* 今天已经确认「没有待办 + 没有读失败的入口」：跳过。
               周任务是按天解锁的（每天一张），所以标记按天存，明天自动重查。 */
            if ((Number(GM_getValue("Config.desktopWeekDoneDate", 0)) || 0) === Utils.getTodayNum()) {
                Utils.log("✅", "桌面专属任务今日已完成，跳过（不重复提交）");
                return true;
            }
            try {
                const weekly = await API.runDesktopWeeklyQuests();
                RewardsAuto.state.weeklyQuestDone = weekly.done || 0;
                RewardsAuto.state.weeklyQuestPending = weekly.pending || 0;
                RewardsAuto.state.weeklyQuestFailed = weekly.failed || 0;
                if (!weekly.pending && !weekly.failed) {
                    GM_setValue("Config.desktopWeekDoneDate", Utils.getTodayNum());
                    Utils.log("✅", "桌面专属任务今日全部完成，今天不再重复提交");
                }
                return true;
            } catch (e) {
                Utils.log("🟡", `桌面专属任务异常：${e && e.message ? e.message : e}`);
                return true;
            }
        },

        async doMonthlyPlan() {
            if (!GM_getValue("Tasks.monthly", true)) {
                RewardsAuto.state.monthlyComplete = false;
                RewardsAuto.state.monthlyFound = 0;
                RewardsAuto.state.monthlyPending = 0;
                return true;
            }
            /* 今日已确认全部完成：不再重复请求（用户要求「做完的不要重复做」）。
               标记只在 complete=true 那一刻写，失败/读不到一律不写，避免整天被跳过。 */
            const today = Utils.getTodayNum();
            if ((Number(GM_getValue("Config.monthlyDoneDate", 0)) || 0) === today) {
                RewardsAuto.state.monthlyComplete = true;
                RewardsAuto.state.monthlyPending = 0;
                Utils.log("✅", "月度计划今日已完成，跳过（不重复请求）");
                return true;
            }
            try {
                const res = await API.runMonthlyPlan();
                RewardsAuto.state.monthlyFound = res.found || 0;
                RewardsAuto.state.monthlyDone = res.done || 0;
                RewardsAuto.state.monthlyTotal = res.total || 0;
                RewardsAuto.state.monthlyPending = res.pending || 0;
                RewardsAuto.state.monthlyComplete = !!res.complete;
                if (res.complete) GM_setValue("Config.monthlyDoneDate", today);
                return true;
            } catch (e) {
                Utils.log("🟡", `月度计划异常：${e && e.message ? e.message : e}`);
                return true;
            }
        },

        async doPromos(roundDeadline) {
            /* 同 doRead：节点模式下其他活动节点可能连进两次，放宽到 6 次；
               真正的幂等靠 promosDate（今日已完成直接跳过）。 */
            if (!GM_getValue("Tasks.promos", true) || this.promosTimes > 6) return true;
            if (this.promosDate === RewardsAuto.state.dateNowNum) {
                Utils.log("✅", "活动卡片已完成");
                return true;
            }
            Utils.log("🧩", "扫描活动卡片...");
            try { await Utils.getCookieHeader(); } catch (_) {}
            const cards = await API.discoverCards();

            try {
                const ck = await Utils.loginCookies();
                if (ck === null) {
                } else if (!ck.hasSession) {
                    Utils.log("🟡", "Cookie 里没有 Bing 登录标识（MUID=" + ck.hasMuid + "）："
                        + (ck.names.slice(0, 6).join(",") || "空") + "；网页通道可能不记账");
                }
            } catch (_) {}
            if (cards.length === 0) {
                /* 关键：区分「问过了、确实没有待办」和「根本没读到」。
                   以前这里无条件标 ✅ + 写 promosDate + 封盘，于是
                   getuserinfo 一挂（现在它常年 401），活动卡片就永远显示完成。
                   读不到时必须如实报「未知」并保留重试机会。 */
                const src = cards.sources || {};
                const answered = !!(src.getuserinfo || src.flight);
                if (!answered) {
                    /* 同一类噪音：数据源都不可用时如实说「无法确认」，
                       但不弹通知、也不每轮刷（6 小时最多一行）。 */
                    Utils.logSilenced("🟠", "活动卡片：数据源不可用，本轮无法确认是否已完成（不标记完成，下一轮会重试）",
                        "promosSourceDown", 6 * 60 * 60 * 1000);
                    RewardsAuto.state.promosUnknown = true;
                    return false;
                }
                RewardsAuto.state.promosUnknown = false;
                Utils.log("✅", "未发现待处理活动卡片");
                this.promosDate = RewardsAuto.state.dateNowNum;
                CDP._promosClean = true;   /* 没有卡片 = 今天不需要 CDP，收尾时直接封盘 */
                this.save();
                return true;
            }
            RewardsAuto.state.promosUnknown = false;
            Utils.log("🧩", `发现 ${cards.length} 个卡片`);

            try {
                /* 只有确实存在「带锁 🔒 / 应用内搜索」这类必须 CDP 的卡，才允许开标签页；
                   其余情况 CDP 只复用你已经开着的 rewards 页，一张新页都不开。 */
                const needsCdp = cards.some(c => API._needsCdp(c));
                if (!needsCdp) Utils.log("🖱️", "本批卡片用 DAPI/后台通道就能完成，不打开 CDP 标签页");
                const cdp = await CDP.claimAll(6, { create: needsCdp });
                if (cdp.ok && cdp.handled > 0) {
                    Utils.log("🖱️", "CDP 真实点击完成 " + cdp.handled + " 张（当前 " + cdp.done + "/" + cdp.total + " 已完成）");
                } else if (cdp.ok) {
                    Utils.log("🖱️", "CDP 已连接，但没有待处理的应用搜索卡（" + cdp.done + "/" + cdp.total + "）");
                } else {
                    Utils.log("🔴", "CDP 不可用（" + cdp.reason + "）：应用内搜索型卡本轮跳过，详见上方提示");
                }
            } catch (e) {
                Utils.log("🔴", "CDP 异常：" + e.message);
            }

            const shouldSkip = (card) => card.kind === "quiz" && !GM_getValue("Tasks.quiz", true);
            let ok = 0, fail = 0;
            let gap = SEARCH_PACER.startGap("other");
            let outOfTime = false;
            for (const card of cards) {
                await RegionGuard.guard("活动卡片");
                this.tick();
                Utils.log("  ", `[${card.kind}] ${card.title} +${card.points}p`);
                if (shouldSkip(card)) continue;
                if (!SEARCH_PACER.fits(roundDeadline, gap)) {
                    Utils.log("🟡", `卡片到点交班，剩下的 ${cards.length} 张里有未处理的留给下一轮（当前节拍 ${Math.round(gap / 1000)} 秒）`);
                    outOfTime = true;
                    break;
                }
                await SEARCH_PACER.beat(gap);
                const result = await API.claimCard(card, { attempts: 2 });
                result ? ok++ : fail++;
                gap = SEARCH_PACER.nextGap(gap, !!result, "other");
            }
            let pending = 0;
            let lockedNow = 0;
            try {
                const map = await API.getPromotionMap(true);
                if (map) {
                    for (const c of cards) {
                        if (shouldSkip(c) || !map.has(c.offerId)) continue;
                        const item = map.get(c.offerId);
                        if (item.complete) continue;
                        if (CardLock.claimable(item) && !API.isUnoffered(c.offerId) && !API.isManualCard(c.offerId)) pending++;
                        else lockedNow++;
                    }
                }
            } catch (_) {}
            if (pending === 0) {
                this.promosDate = RewardsAuto.state.dateNowNum;
                this.save();
            }
            /* 本轮的 CDP 结果先记着，收标签页与封盘放到整轮末尾做。
               还有 lockedNow / outOfTime 就不能封盘。 */
            const stillNeedsCdp = outOfTime || lockedNow > 0 || pending > 0;
            CDP._promosClean = !stillNeedsCdp;
            if (stillNeedsCdp) {
                try { GM_setValue(CDP.DONE_KEY, 0); } catch (_) {}
            }
            const manualCards = (RewardsAuto.state.manualCards || []);
            if (manualCards.length > 0) {
                /* 过程状态：每轮都会重现同一批卡，推送只会变成噪音 */
                Utils.logSilenced("🖐️", "以下 " + manualCards.length + " 张卡已自动上报搜索，请在 earn 页手动点一次："
                    + manualCards.map(m => m.name).join("、"), "manualCards", 12 * 60 * 60 * 1000);
            }
            if (lockedNow > 0) {
                Utils.log("🔒", `另有 ${lockedNow} 张卡片处于锁定状态，不计入剩余量（满足条件后会自动重试）`);
            }
            /* 活动卡片做完 ≠ 今天全部做完：这里必须只写日志。
               以前第三个参数是 `pending === 0 && ok > 0`，等于「每轮卡片清空就推一条」，
               一天最多推 3 次（promosTimes 上限就是 2），正是用户说的「每次检测都通知」。
               完成通知统一由轮末汇总发一条。 */
            Utils.log(pending === 0 ? "🔵" : "🟡",
                `活动完成: ${ok}成功/${fail}失败${pending > 0 ? `，仍剩 ${pending} 张未完成` : ""}（服务端已确认）${outOfTime ? "；本轮到点，剩余卡片下一轮继续" : ""}`);
            return pending === 0;
        },

        async doSearch(roundDeadline) {
            if (!GM_getValue("Tasks.search", true)) return;
            /* 开跑前用 getPcQuota（面板优先）校正一次进度：earn 页 pointsCounters
               可能没刷新，拿偏低基数会让每次回读都误判成「刚涨了」。 */
            let progress = 0, max = 0;
            const info = await API.getRewardsInfo();
            if (info) {
                progress = info.pc.progress;
                max = info.pc.max;
            }
            try {
                const auth = await API.getPcQuota();
                if (auth && auth.max > 0) {
                    if (auth.progress !== progress || auth.max !== max) {
                        Utils.log("🟢", `搜索配额以面板为准校正：${progress}/${max} → ${auth.progress}/${auth.max}`);
                    }
                    progress = auth.progress;
                    max = auth.max;
                } else if (!max) {
                    /* 面板没给 PC 计数器、页面也没解析出来：这时候没有任何可信的
                       PC 进度可用。不猜、不拿手机配额顶替，直接说清楚并收手 ——
                       盲目搜索只会重复「发了但不加分」的老问题。 */
                    Utils.log("🟡", "PC 搜索计数器读不到（面板/页面/DAPI 都没有），本轮不搜索，避免空转；下一轮自动重试");
                    return;
                }
            } catch (_) {}
            if (!max) { Utils.log("🔴", "无法获取积分信息"); return; }
            RewardsAuto.state.pcProgress = progress;
            RewardsAuto.state.pcMax = max;
            Utils.log("🔍", `搜索配额: PC ${progress}/${max}`);

            const markDone = () => {
                this.searchDate = RewardsAuto.state.dateNowNum;
                this.save();
                API.clearSearchGuard(false);
            };

            if (progress >= max) {
                markDone();
                Utils.log("✅", `搜索配额已满 PC: ${progress}/${max}`);
                return;
            }
            if (this.searchDate === RewardsAuto.state.dateNowNum) {
                Utils.log("🟡", "搜索配额未满，继续执行搜索任务");
                this.searchDate = 0;
            }
            /* 冷却中直接跳过：连配额请求都不发，到期由调度自动重试。
               这里不能写 searchDate —— 那等于把「今天还要搜的」标记成已完成。 */
            if (await API.checkSearchRestricted()) return;

            const budgetMin = 20;
            const startedAt = Date.now();
            const roundLimit = Number(roundDeadline) || 0;
            /* 平时单轮搜索 20 分钟；最后一轮调度会把 roundDeadline 放宽到收工前，
               这里跟着放宽（上限 45 分钟），否则搜索仍被 20 分钟掐断，收工前做不完。 */
            const capMin = ROUND_LAST_BUDGET_MS / 60000;
            const gapMin = roundLimit > 0 ? Math.floor((roundLimit - startedAt) / 60000) : 0;
            const budgetMinEff = Math.max(budgetMin, Math.min(capMin, gapMin));
            const budgetDeadline = startedAt + budgetMinEff * 60 * 1000;
            const softDeadline = roundLimit > 0 ? Math.min(budgetDeadline, roundLimit) : budgetDeadline;
            const hardDeadline = softDeadline;
            const deadlineMin = Math.max(0, Math.round((softDeadline - startedAt) / 60000));
            let gap = SEARCH_PACER.startGap();
            /* 间隔不再固定：每次由 SEARCH_PACER.cycle() 重新抽样，这里只记录实测最大值。 */
            let peakGap = 0;
            let lastStart = 0;
            const needed = Math.max(1, Math.ceil((max - progress) / 3));
            /* v0.79：节点化之后不再「分散到全天」。
               用户要求「任务一直做别停、一个节点要么全搜索要么全阅读」——
               搜索节点会把整个 20 分钟窗口都用来搜索，直到配额满或节点到点；
               再按「剩余轮数随机分摊 / 可能整轮跳过」就等于自己给自己刹车。
               Config.spread 保留在面板上只为兼容老配置，节点模式下不生效。 */
            const spreadOn = false;
            const roundsLeft = spreadOn ? Sched.roundsLeftToday() : 1;
            const roundTarget = spreadOn ? SEARCH_PACER.pickShare(needed, roundsLeft) : needed;
            if (spreadOn && roundTarget <= 0) {
                Utils.log("⏭️", `本轮随机跳过搜索（还差 ${Math.max(0, max - progress)} 分，今天还剩 ${roundsLeft} 轮唤醒，`
                    + `这一轮的份额让给后面几个时间点）`);
                return;
            }
            const attemptCap = Math.min(
                SEARCH_PACER.MAX_ATTEMPTS,
                Math.max(8, needed * 2),
                spreadOn ? Math.max(4, roundTarget * 2 + 2) : Infinity
            );
            let attempts = 0, credits = 0, sinceCredit = 0, verifyFails = 0, streakNoCredit = 0;
            let lastCreditAt = startedAt;
            /* 总积分基线：只在「PC 计数器读不到」时用作第二判据（见下面的兜底分支）。
               读不到就是 0，此时不做余额判断，不虚报任何进展。 */
            let lastBalance = 0;
            try {
                const b = await API.getBalance();
                if (b > 0) lastBalance = b;
            } catch (_) {}
            const usedQueries = new Set();
            const pickPoolWord = () => RewardsAuto.searchPool[Utils.randomRange(0, RewardsAuto.searchPool.length - 1)];

            Utils.log("🔍", `搜索节点 ${deadlineMin} 分钟（到点交给下一个搜索节点继续，配额不会丢），`
                + `间隔每次随机 ${Math.round(SEARCH_PACER.cycleMin() / 1000)}~${Math.round(SEARCH_PACER.cycleMax() / 1000)} 秒`
                + `（基准 ${Math.round(gap / 1000)} 秒，偶尔来一次长停顿），还差 ${Math.max(0, max - progress)} 分（约 ${needed} 次搜索）`
                + (spreadOn ? `；今天还剩 ${roundsLeft} 轮唤醒，本轮随机分到 ${roundTarget} 次` : ""));

            while (attempts < attemptCap && Date.now() < hardDeadline) {
                /* 每轮搜索前确认这一轮还活着（超时就抛错退出，锁被接管也退出） */
                this.tick();
                await RegionGuard.guard("PC 搜索");

                attempts++;
                const iterStart = Date.now();
                let query;
                try {
                    query = RewardsAuto.apiConfig.mode !== "offline"
                        ? await API.getHotSearchWord()
                        : "";
                } catch (_) {
                    query = "";
                }
                if (!query) query = pickPoolWord();
                for (let i = 0; i < 5 && query && usedQueries.has(query); i++) query = pickPoolWord();
                if (query) usedQueries.add(query);
                Utils.log("🔍", `[PC] 第 ${attempts} 次搜索（记账 ${progress}/${max}，本轮 ${credits}/${roundTarget}）：${query}`);

                try {
                    const html = await API.getSearchPage(query, false);
                    if (html) await API.reportSearch(html, query, false);
                } catch (e) {
                    if (e && e.regionBlocked) throw e;
                    Utils.log("🟡", `搜索失败: ${e.message}`);
                }
                await Utils.delay(Utils.randomRange(SEARCH_PACER.OBSERVE_MIN, SEARCH_PACER.OBSERVE_MAX));

                /* 只认「服务端计数器真的涨了」。读不到配额就如实算核对失败，
                   绝不 progress += 3 做乐观估计。 */
                const before = progress;
                let quota = await API.getPcQuota();
                if (quota && quota.progress <= before) {
                    await Utils.delay(Utils.randomRange(SEARCH_PACER.VERIFY_MIN, SEARCH_PACER.VERIFY_MAX));
                    const again = await API.getPcQuota();
                    if (again) quota = again;
                }
                if (quota) {
                    verifyFails = 0;
                    if (quota.max > 0) max = quota.max;
                    if (quota.progress > before) {
                        progress = quota.progress;
                        credits++;
                        sinceCredit = 0;
                        streakNoCredit = 0;
                        lastCreditAt = Date.now();
                        Utils.log("✅", `记账成功 +${progress - before}（${progress}/${max}）`);
                        /* 本轮随机份额够了就收手：剩下的留给后面几个唤醒轮，
                           不把一天的量挤在一次里做完。 */
                        if (spreadOn && credits >= roundTarget && progress < max) {
                            Utils.log("⏸️", `本轮随机份额已达成（记账 ${credits}/${roundTarget} 次，PC ${progress}/${max}），`
                                + `剩余 ${Math.max(0, max - progress)} 分留到下几轮唤醒`);
                            break;
                        }
                    } else {
                        progress = Math.max(progress, quota.progress);
                        sinceCredit++;
                        streakNoCredit++;
                        const left = Math.round((SEARCH_PACER.NO_CREDIT_LIMIT - (Date.now() - lastCreditAt)) / 60000);
                        Utils.log("🟡", `本次未记账（${progress}/${max}，连续 ${sinceCredit} 次；再 ${Math.max(0, left)} 分钟没进展就本轮收手）`);
                    }
                } else {
                    /* 兜底判据：不碰手机配额（会把 PC 没加分误判成加了）。
                       只用「总积分有没有涨」证明这次不是纯空转，不用它推 PC 进度 ——
                       progress 不动，等下一轮真配额校正。 */
                    const balNow = await API.getBalance();
                    const gained = (balNow > 0 && lastBalance > 0) ? (balNow - lastBalance) : 0;
                    if (balNow > 0) lastBalance = balNow;
                    verifyFails++;
                    if (gained > 0) {
                        /* 账号确实加分了 → 不是空转，清零「连续未记账」但不动 progress */
                        sinceCredit = 0;
                        streakNoCredit = 0;
                        lastCreditAt = Date.now();
                        Utils.log("🟢", `配额读不到，但总积分 +${gained}（${progress}/${max} 以服务端计数器为准，下一轮校正）`);
                    } else {
                        sinceCredit++;
                        Utils.log("🟡", `配额查询失败（连续 ${verifyFails} 次，总积分未变），不做乐观推算`);
                    }
                }
                RewardsAuto.state.pcProgress = progress;

                if (progress >= max) break;

                const noCreditMs = Date.now() - lastCreditAt;

                /* 刹车一：连续 STREAK_STOP 次零记账就停，不必等满 10 分钟。 */
                if (streakNoCredit >= SEARCH_PACER.STREAK_STOP && attempts >= SEARCH_PACER.MIN_ATTEMPTS_BEFORE_GIVEUP) {
                    Utils.log("🟡", `连续 ${streakNoCredit} 次搜索都没有记账（本轮 ${attempts} 次，${progress}/${max}），`
                        + `判定当前通道不记账，本轮提前收手，交给冷却后重试`);
                    break;
                }

                if (noCreditMs >= SEARCH_PACER.NO_CREDIT_LIMIT && attempts >= SEARCH_PACER.MIN_ATTEMPTS_BEFORE_GIVEUP) {
                    Utils.log("🟡", `连续 ${Math.round(noCreditMs / 60000)} 分钟没有任何记账（本轮 ${attempts} 次搜索），判定被限流，本轮收手（已记 ${progress}/${max}）`);
                    break;
                }
                if (verifyFails >= 6) {
                    Utils.log("🟡", `记账核对连续失败 ${verifyFails} 次，本轮结束（已记 ${progress}/${max}），下一轮用真实进度校正`);
                    break;
                }
                /* 间隔：每次独立抽样（多数落在 基准×0.6~2.2，10% 概率来一次
                   3~8 倍长停顿），抽完不知道下一次多长。观察/复核已经花掉 spent，
                   wait = cycle - spent，所以日志里「等待」比「本次间隔」小是正常的。
                   若抽到的间隔会越过交班点，就直接收手，不睡过点。 */
                const cycle = SEARCH_PACER.cycle();
                const now = Date.now();
                if (lastStart > 0) peakGap = Math.max(peakGap, now - lastStart);
                lastStart = now;
                const spent = now - iterStart;
                if (now + cycle > hardDeadline) {
                    Utils.log("🟡", `下一次间隔 ${Math.round(cycle / 1000)} 秒会越过交班时间，本轮收手（已记 ${progress}/${max}）`);
                    break;
                }
                const isPause = cycle > SEARCH_PACER.cycleMax();
                const wait = Math.max(3000, cycle - spent);
                /* 网络慢到 spent 本身超过 cycle 时，下限 3 秒兜底，此时间隔 = spent + 3，
                   日志里如实报出来，不假装还在随机区间内。 */
                const actual = Math.round((spent + wait) / 1000);
                Utils.log("⏳", `等待 ${(wait / 1000).toFixed(0)} 秒${isPause ? "（随机长停顿）" : ""}`
                    + `（本次间隔 ${Math.round(cycle / 1000)} 秒，已用 ${(spent / 1000).toFixed(0)} 秒，实测 ${actual} 秒）`);
                await Utils.delay(wait);
            }

            SEARCH_PACER.setLast({ attempts, credits, peak: Math.round(peakGap / 1000), at: Date.now() });
            SEARCH_PACER.saveGap(peakGap);
            const elapsed = Math.round((Date.now() - startedAt) / 1000);
            const finalInfo = await API.getRewardsInfo();
            if (finalInfo) {
                progress = finalInfo.pc.progress;
                max = finalInfo.pc.max || max;
                RewardsAuto.state.pcProgress = progress;
                RewardsAuto.state.pcMax = max;
            }
            const hitRate = attempts > 0 ? Math.round((credits / attempts) * 100) : 0;
            if (finalInfo && progress >= max) {
                markDone();
                /* 单个任务做完 ≠ 今天全做完：这里只写日志，
                   真正的完成通知由轮末汇总（notifyDone）统一发一条。 */
                Utils.log("🔵",
                    `🔍 搜索任务完成！PC: ${progress}/${max}（本轮 ${attempts} 次搜索、记账 ${credits} 次，用时 ${elapsed}s，最大间隔 ${Math.round(peakGap / 1000)}s）`);
            } else {
                API.recordSearchRound(attempts, credits, progress, max);
                Utils.log("🟡",
                    `搜索未满 PC: ${progress}/${max}，本轮 ${attempts} 次搜索、记账 ${credits} 次（${hitRate}%），用时 ${elapsed}s，最大间隔 ${Math.round(peakGap / 1000)}s`
                    + (spreadOn ? `（本轮随机分到 ${roundTarget} 次，剩余配额继续随机摊到后面几次唤醒）` : "（剩余配额留到下一次定时唤醒）"));
                this.save();
            }
        },

        async doDailySet(roundDeadline) {
            const today = Utils.getTodayNum();
            /* 今日已确认无未完成日常卡：直接跳过（用户要求「做完的不要重复做」）。
               这个标记只在 remain === 0（服务端确认）时写；有锁定卡或未完成卡时
               写的是 0，所以这里不会把「还有锁定卡」误判成完成。 */
            if ((Number(GM_getValue("Config.dailySetDoneDate", 0)) || 0) === today) {
                Utils.log("✅", "每日活动今日已完成，跳过（不重复发现/领取）");
                RewardsAuto.state.dailySetSkipped = true;
                return true;
            }
            const todayStr = Utils.getTodayStr();
            const processedKey = "Config.dailySetProcessed";
            let processed = GM_getValue(processedKey, []);
            if (!Array.isArray(processed) || processed[0]?.date !== today) processed = [];
            const doneIds = new Set(processed.filter(p => p && p.ok).map(p => p.offerId));

            const maxRounds = 3;
            let totalOk = 0, totalFail = 0, remain = -1;
            let gap = SEARCH_PACER.startGap("other");
            let outOfTime = false;

            for (let round = 1; round <= maxRounds; round++) {
                if (!SEARCH_PACER.fits(roundDeadline, gap)) {
                    Utils.log("🟡", `每日活动到点交班，剩下的卡片留给下一轮（当前节拍 ${Math.round(gap / 1000)} 秒）`);
                    outOfTime = true;
                    break;
                }
                await RegionGuard.guard("每日活动");
                Utils.log("📅", `第 ${round}/${maxRounds} 轮每日活动（服务端已确认 ${doneIds.size} 张，走 DAPI 不开标签页）...`);
                await Utils.randomDelay(2000, 5000);

                let cards = [];
                let dapiOk = false;
                try {
                    const map = await API.getPromotionMap(true);
                    dapiOk = !!map;
                    cards = await API.discoverDailySetCards(map);
                    Utils.log("📅", `DAPI 发现 ${cards.length} 张未完成的日常活动卡片`);
                } catch (e) {
                    Utils.log("🟡", `DAPI 发现失败，回退网页解析: ${e.message}`);
                }
                if (cards.length === 0 && !dapiOk) {
                    try {
                        const allCards = await API.discoverCards();
                        cards = allCards.filter(c => (c.kind === "daily" || c.offerId.includes("DailySet")) && !doneIds.has(c.offerId));
                    } catch (e) {
                        Utils.log("🟡", `网页卡片解析失败: ${e.message}`);
                    }
                }

                if (round === 1 && cards.length > 0 && cards.some(c => !c.hash)) {
                    try {
                        const webCards = (await API.discoverCards()).filter(c => c.hash && (c.kind === "daily" || c.offerId.includes("DailySet")));
                        if (webCards.length > 0) {
                            const byId = new Map(webCards.map(c => [c.offerId, c]));
                            cards = cards.map(c => {
                                const w = byId.get(c.offerId);
                                if (!w) return c;
                                return {
                                    ...c,
                                    hash: w.hash,
                                    url: w.url || c.url,
                                    destination: c.destination || w.destination || "",
                                    ...(w.appOnly || c.appOnly ? { appOnly: true } : {}),
                                    ...(w.levelGated || c.levelGated ? { levelGated: true } : {})
                                };
                            });
                            const enriched = cards.filter(c => c.hash).length;
                            if (enriched > 0) Utils.log("🧩", `已为 ${enriched} 张日常卡补上网页交卷标识（hash）`);
                        }
                    } catch (e) {
                        Utils.log("🟡", `网页日常卡解析跳过: ${e.message}`);
                    }
                }

                let roundOutOfTime = false;
                for (const card of cards) {
                    if (doneIds.has(card.offerId)) continue;
                    await RegionGuard.guard("每日活动领取");
                    this.tick();
                    Utils.log("📅", `领取每日活动: ${card.title} +${card.points}p`);
                    if (!SEARCH_PACER.fits(roundDeadline, gap)) {
                        Utils.log("🟡", `每日活动到点交班，剩余卡片留给下一轮（当前节拍 ${Math.round(gap / 1000)} 秒）`);
                        roundOutOfTime = true;
                        break;
                    }
                    await SEARCH_PACER.beat(gap);
                    const res = await API.claimCard(card, round === 1 ? { attempts: 2 } : {});
                    if (res) { totalOk++; doneIds.add(card.offerId); } else { totalFail++; }
                    gap = SEARCH_PACER.nextGap(gap, !!res, "other");
                }
                if (roundOutOfTime) {
                    outOfTime = true;
                    break;
                }

                remain = -1;
                try {
                    const map = await API.getPromotionMap(true);
                    if (map) {
                        const todays = [...map.values()].filter(i =>
                            (i.offerId.includes(RewardsAuto.appConfig.offerIds.dailySetPrefix) || i.dailySetDate === todayStr)
                            && (i.dailySetDate === todayStr || i.offerId.includes(String(today))));
                        const openable = todays.filter(i => CardLock.claimable(i));
                        const lockedNow = todays.length - openable.length;
                        remain = openable.filter(i => !i.complete).length;
                        if (lockedNow > 0) {
                            Utils.log("🔒", `${lockedNow} 张日常活动卡处于锁定状态，不计入剩余量`);
                        }
                        for (const i of todays) {
                            if (i.complete) doneIds.add(i.offerId);
                            else doneIds.delete(i.offerId);
                        }
                    }
                } catch (_) {}
                GM_setValue(processedKey, [...doneIds].map(id => ({ date: today, offerId: id, ok: true })));

                if (remain === 0) break;
                if (cards.length === 0) break;
                if (round < maxRounds) {
                    const wait = Utils.randomRange(20000, 35000);
                    Utils.log("⏳", `仍有 ${remain < 0 ? "未知数量" : remain} 张未完成，${Math.round(wait / 1000)} 秒后进入下一轮`);
                    await Utils.randomDelay(wait, wait);
                }
            }

            if (remain === 0) GM_setValue("Config.dailySetDoneDate", today);
            else if (remain > 0) GM_setValue("Config.dailySetDoneDate", 0);

            if (totalOk > 0 || totalFail > 0 || remain > 0) {
                /* 每日活动做完 ≠ 今天全部做完：只写日志。
                   以前这里是 `remaining === 0`，于是每轮跑完日常活动就推一条。 */
                Utils.log(remain === 0 ? "🔵" : "🟡",
                    `每日活动完成: ${totalOk}成功/${totalFail}失败${remain > 0 ? `，仍剩 ${remain} 张未完成` : ""}（服务端已确认）${outOfTime ? "；本轮到点，剩余卡片下一轮继续" : ""}`);
            } else if (remain === 0) {
                Utils.log("✅", "每日活动已全部完成（服务端已确认）");
            }
            this.dailySetSummary = remain >= 0
                ? `${doneIds.size} 张已完成${remain > 0 ? `，剩 ${remain} 张` : ""}`
                : `${doneIds.size} 张已完成 · 服务端状态未知`;
            if (remain < 0) return true;
            return remain === 0;
        },

        async doClaimPoints() {
            await RegionGuard.guard("领取积分");
            if (!GM_getValue("Tasks.claimPoints", true)) {
                this.claimSummary = "⏭️ 已关闭";
                Utils.log("✅", "自动领取待领积分已关闭（Config：Tasks.claimPoints）");
                return;
            }
            /* 刚确认过「待领为 0」就别再打一次（节点模式下 other 节点会连续进，
               每次领奖都要走 dashboard + 通道探测，30 分钟内重复没有意义）。
               只有「确认清空」才写标记 —— 未成功/待复核不写，避免把失败的当成做完。 */
            const claimToday = Utils.getTodayNum();
            const markClean = () => {
                try { GM_setValue("Config.claimCleanAt", { date: claimToday, at: Date.now() }); } catch (_) {}
            };
            const clean = GM_getValue("Config.claimCleanAt", null);
            if (clean && Number(clean.date) === claimToday && (Date.now() - (Number(clean.at) || 0)) < 30 * 60 * 1000) {
                this.claimSummary = "✅ 待领为 0";
                this.claimReason = "";
                Utils.log("✅", `待领积分 ${Math.round((Date.now() - Number(clean.at)) / 60000)} 分钟前刚确认清空，跳过`);
                return;
            }
            try {
                try { await Utils.getCookieHeader(); } catch (_) {}
                const res = await ClaimPoints.run();

                if (res.claimed > 0) {
                    if (res.empty) markClean();
                    /* 播报口径：只有「余额真的涨了」才敢说已领取多少分。
                       余额差读不到时，res.claimed 是按页面待领额估算的，
                       以前会写成「已自动领取 9334 积分（当前余额 18602）」——
                       领了 9 分却播报 9334，自相矛盾。 */
                    if (res.claimedFrom === "balance") {
                        this.claimSummary = res.empty
                            ? `✅ +${res.claimed} · 池已清空`
                            : `✅ +${res.claimed} · 余额 ${res.after}`;
                        this.claimReason = "";
                        Utils.log("🎁", res.empty
                            ? `已自动领取 ${res.claimed} 积分（余额 ${res.before} → ${res.after}，待领池已清空）`
                            : `已自动领取 ${res.claimed} 积分（余额 ${res.before} → ${res.after}）`);
                    } else {
                        this.claimSummary = `⏳ 待入账 ${res.claimed}` + (res.empty ? " · 池已清空" : "");
                        this.claimReason = "";
                        Utils.log("🎁", `领取已提交：页面待领 ${res.claimed} 分`
                            + (res.empty ? "（待领池已清空）" : "")
                            + `，余额差读不到（${res.before || "?"} → ${res.after || "?"}），待服务端入账；`
                            + "数额为页面估值，不作已到账凭据");
                    }
                    return;
                }
                if (res.nothingToClaim) {
                    markClean();
                    this.claimSummary = "✅ 待领为 0";
                    this.claimReason = "";
                    Utils.log("✅", res.reason || "待领为 0，无需领取");
                    return;
                }
                if (res.settled) {
                    markClean();
                    this.claimSummary = "✅ 已领取 · 池已清空";
                    this.claimReason = "";
                    Utils.log("🎁", res.reason || "已领取，待领池已清空");
                    return;
                }
                if (res.variant && !res.denied) {
                    /* 服务端确实收下了（回了 true），只是余额/池子读不出证据：
                       这才是「待复核」。 */
                    this.claimSummary = "⏳ 已受理待复核";
                    this.claimReason = res.reason || "";
                    Utils.log("🟡", `积分领取请求已受理，但没能确认到账（${res.reason}）；下一轮再复核`);
                } else {
                    this.claimSummary = "⏳ 未成功";
                    this.claimReason = res.reason || "";
                    /* 不单独推送：收尾通知的「受限制未完成」里会点名 */
                    Utils.log("🟡", `待领积分自动领取未成功：${res.reason}`);
                    this._explainClaimChannels();
                }
            } catch (e) {
                this.claimSummary = "⏳ 异常";
                this.claimReason = e.message || "";
                Utils.log("🟡", `领取积分执行异常: ${e.message}`);
            }
        },

        _explainClaimChannels() {
            const env = BrowserEnv.info();
            const lines = [`当前浏览器：${BrowserEnv.summary()}；后台直发请求的 Origin 是扩展源`];
            if (env.extOriginRisky) {
                lines.push(`Edge ${env.major} 对扩展源 origin 的 server action 会回 500 —— 这不是脚本参数错了，是浏览器强制的头。`);
            }
            lines.push(`① CDP 同源通道：用桌面「Rewards Edge」快捷方式启动（端口 ${CDP.PORT}）。`
                + `连上后脚本会自己在后台开一个临时标签页（不抢焦点），用完自动关闭；`);
            lines.push(`② 页面代发通道：在 rewards.bing.com 页面里跑过一次脚本后自动可用（Config.usePageChannel 打开）；`);
            lines.push(`③ 后台直发：Chrome / 旧版 Edge 上通常能过，新版 Edge 上常被拒。`);
            Utils.log("🟡", lines.join("\n"));
        },


        async doIntlDaily(roundDeadline) {
            /* 这里用 allow() 不用 guard()：国际版只是额外 25 分，
               出口探测抖动不该把整轮任务打断（guard 会抛 RegionBlockedError）。 */
            if (!(await RegionGuard.allow())) {
                Utils.log("🟡", "出口探测未通过，国际版每日活动本轮跳过");
                return false;
            }
            /* 节拍走「其他任务」的 Config.otherSpan（默认 60 秒，最低 10 秒）：
               5 张卡之间各隔一个节拍，而不是十几秒内连着打完。 */
            const gap = SEARCH_PACER.startGap("other");
            const today = Utils.getTodayNum();
            const key = "Config.intlDailyDate";
            const st = GM_getValue(key, null);

            /* found=0 的记录不能走这里：那只是「这一轮面板没卡」，不是「今天做完了」，
               交给下面的重新检查分支处理 */
            if (st && Number(st.date) === today && Number(st.pending) === 0 && Number(st.found) > 0) {
                RewardsAuto.state.intlFound = Number(st.found) || 0;
                RewardsAuto.state.intlDone = Number(st.done) || 0;
                RewardsAuto.state.intlPending = 0;
                RewardsAuto.state.intlReason = "";
                RewardsAuto.state.intlCached = true;
                Utils.log("  ", `国际版每日活动今日已完成（${st.done}/${st.found}），跳过`);
                return true;
            }
            /* 「本轮面板没卡」≠「今天没有这组活动」：推广位是陆续下发的。
               found=0 只当短时结论，过一会儿重新拉面板。 */
            if (st && Number(st.date) === today && Number(st.found) === 0) {
                const stamped = Number(st.at) || 0;
                const waited = Date.now() - stamped;
                const RELOOK = 30 * 60 * 1000;
                if (stamped > 0 && waited < RELOOK) {
                    RewardsAuto.state.intlFound = 0;
                    RewardsAuto.state.intlDone = 0;
                    RewardsAuto.state.intlPending = 0;
                    RewardsAuto.state.intlAbsent = true;
                    RewardsAuto.state.intlCached = true;
                    Utils.log("  ", `国际版每日活动：本轮面板里没有这组卡片`
                        + `（${Math.max(1, Math.round((RELOOK - waited) / 60000))} 分钟后重新检查）`);
                    return true;
                }
                Utils.log("  ", "国际版每日活动：上次没看到卡片，这次重新拉一次面板");
            }
            let res = null;
            try {
                res = await IntlDaily.run({ reason: "国际版每日活动", gap, deadline: roundDeadline });
            } catch (e) {
                Utils.log("🟡", `国际版每日活动异常：${e.message}（不影响其它任务）`);
                return false;
            }
            if (!res) return false;
            if (res.found === 0) {
                /* 面板里一张都没有：这账号本来就没有这组活动（地区/账号不支持）。
                   和「代码没跑到」是两回事，日志里要能一眼区分，否则下次又得回来查。 */
                GM_setValue(key, { date: today, found: 0, done: 0, pending: 0, at: Date.now() });
                RewardsAuto.state.intlFound = 0;
                RewardsAuto.state.intlDone = 0;
                RewardsAuto.state.intlPending = 0;
                RewardsAuto.state.intlAbsent = true;
                Utils.log("  ", "国际版每日活动：此账号面板里没有这组卡片（地区/账号不支持），跳过");
                return true;
            }
            RewardsAuto.state.intlAbsent = false;
            RewardsAuto.state.intlCached = false;
            /* 把 dropped 也存进去：只有「没有待办 + 没有把握不了的卡」才允许封盘。
               否则那些没 hash 的卡会被永久跳过（封盘后当天不再重试）。 */
            const droppedN = Number(res.dropped) || 0;
            GM_setValue(key, { date: today, found: res.found, done: res.done, pending: res.pending, dropped: droppedN, at: Date.now() });
            RewardsAuto.state.intlFound = res.found;
            RewardsAuto.state.intlDone = res.done;
            RewardsAuto.state.intlPending = res.pending;
            RewardsAuto.state.intlDropped = droppedN;
            RewardsAuto.state.intlReason = res.reason || "";
            return res.pending === 0 && droppedN === 0;
        },

        async doStreak() {
            /* 今日连签已确认全部完成：直接跳过（不重复拉推广表 / earn 页）。
               标记只在「确实看到所有连签项都 done」时写；读不到就照常检查。 */
            const streakToday = Utils.getTodayNum();
            if ((Number(GM_getValue("Config.streakDoneDate", 0)) || 0) === streakToday) {
                Utils.log("✅", "连签今日已完成，跳过（不重复检查）");
                return;
            }
            await RegionGuard.guard("连签检测");
            Utils.log("📅", "开始检测连签任务...");
            /* 所有连签项都完成才写标记。默认 false：只要看到一项没完成就不写，
               什么都没检测到（页面结构变了）也不写 —— 宁可下一轮再查一次，
               也不能因为一次误判把一整天跳过。 */
            let allStreakDone = true;
            let sawAny = false;
            try {
                const map = await API.getPromotionMap(true);
                if (map) {
                    const streak = map.get(RewardsAuto.appConfig.offerIds.streakCounter);
                    if (streak && streak.progress > 0) {
                        this.streakDays = streak.progress;
                        Utils.log("📅", `每日连续打卡：${this.streakDays} 天（DAPI 权威值）`);
                    }
                    const todayStr = Utils.getTodayStr();
                    const children = [...map.values()].filter(i =>
                        i.offerId.includes(RewardsAuto.appConfig.offerIds.dailySetPrefix) && i.dailySetDate === todayStr);
                    if (children.length > 0) {
                        sawAny = true;
                        const done = children.filter(i => i.complete).length;
                        if (done < children.length) allStreakDone = false;
                        Utils.log(done >= children.length ? "✅" : "📅", `每日连续打卡活动：${done}/${children.length} 张已完成`);
                    }
                }
            } catch (_) {}
            try {
                const earnHtml = await Utils.xhr({ url: "https://rewards.bing.com/earn" });
                if (!earnHtml) { Utils.log("🟡", "无法获取 earn 页面"); return; }
                const text = earnHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
                const streakDaysMatch = text.match(/每日连续打卡\s*(\d+)/);
                if (streakDaysMatch) {
                    this.streakDays = parseInt(streakDaysMatch[1]) || 0;
                    Utils.log("📅", `每日连续打卡：${this.streakDays} 天`);
                }
                const taskPatterns = [
                    { name: "必应搜索连续打卡", pattern: /必应搜索连续打卡[\s\S]*?搜索:\s*(\d+)\/(\d+)/ },
                    { name: "每日连续打卡活动", pattern: /每日连续打卡活动[\s\S]*?活动:\s*(\d+)\/(\d+)/ },
                    { name: "必应应用连续打卡", pattern: /必应应用连续打卡[\s\S]*?签到:\s*(\d+)\/(\d+)/ },
                    { name: "视觉搜索连续打卡", pattern: /视觉搜索连续打卡[\s\S]*?活动:\s*(\d+)\/(\d+)/ },
                ];
                let visualSearchDone = true;
                for (const { name, pattern } of taskPatterns) {
                    const m = text.match(pattern);
                    if (m) {
                        sawAny = true;
                        const cur = parseInt(m[1]), max = parseInt(m[2]);
                        const done = cur >= max;
                        if (!done) allStreakDone = false;
                        Utils.log(done ? "✅" : "📅", `${name}: ${cur}/${max}${done ? " 已完成" : ""}`);
                        if (name === "视觉搜索连续打卡" && !done) visualSearchDone = false;
                    }
                }
                if (!visualSearchDone) {
                    Utils.log("📅", "视觉搜索未完成，尝试后台打卡...");
                    try {
                        await Utils.xhr({
                            url: "https://www.bing.com/?features=vsstreak,vstooltip&form=ML2XES",
                            headers: {
                                "user-agent": RewardsAuto.ua.pc,
                                "referer": "https://www.bing.com/"
                            }
                        });
                        Utils.log("✅", "视觉搜索打卡请求已发送（后台）");
                        await Utils.randomDelay(3000, 5000);
                    } catch (e) {
                        Utils.log("🟡", `视觉搜索打卡失败: ${e.message}`);
                    }
                }
                const stampMatch = text.match(/(\d+)\s*个印章/) || text.match(/印章\s*(\d+)/);
                if (stampMatch) {
                    Utils.log("📅", `连签奖励印章进度: ${stampMatch[1]}/12`);
                }
                Utils.log("📅", "连签任务检测完成，未完成任务将由活动卡片模块处理");
                /* 全部完成才落盘：下一轮（可能 20 分钟后）直接跳过，不再重复拉页面 */
                if (sawAny && allStreakDone) {
                    GM_setValue("Config.streakDoneDate", streakToday);
                    Utils.log("✅", "连签全部完成，今日不再重复检查（明天自动恢复）");
                }
            } catch (e) {
                Utils.log("🔴", `连签任务异常: ${e.message}`);
            }
        },

        /* ══ 节点间隔：默认 1~3 分钟随机 ══════════════════════════════════
           用户要求「延迟 1~3 分钟随机」。放在节点之间而不是每个动作之间：
           动作之间的节拍由 SEARCH_PACER（Config.span / otherSpan）管，
           两者叠加起来会变得非常慢。 */
        nodeGapMs() {
            let lo = Number(GM_getValue("Config.nodeGapMin", null));
            let hi = Number(GM_getValue("Config.nodeGapMax", null));
            if (!Number.isFinite(lo) || lo < 0) lo = NODE_GAP_FALLBACK[0] / 1000;
            if (!Number.isFinite(hi) || hi < 0) hi = NODE_GAP_FALLBACK[1] / 1000;
            lo *= 1000;
            hi *= 1000;
            if (hi < lo) { const t = lo; lo = hi; hi = t; }
            if (hi <= 0) return 0;
            return Utils.randomRange(lo, hi);
        },

        /* 分段等：每 5 秒确认一次「这一轮还活着」，被强制收尾/锁被接管就立刻抛错退出。
           一次性 await 3 分钟的话，心跳虽然还在跳，但这段完全没有进度打点，
           会被「15 分钟没进展」判定误伤。 */
        async waitNodeGap(label) {
            const ms = this.nodeGapMs();
            if (ms <= 0) return;
            Utils.log("⏳", `${label ? label + "：" : ""}节点间隔 ${(ms / 60000).toFixed(1)} 分钟（${Math.round(ms / 1000)} 秒，1~3 分钟随机）`);
            const t0 = Date.now();
            while (Date.now() - t0 < ms) {
                this.tick();
                await Utils.delay(Math.min(5000, ms - (Date.now() - t0)));
            }
        },

        /* ══ 任务盘点：这一轮还剩什么没做 ════════════════════════════════
           用户要求「轮询开始先查询还有什么任务没做，做完的不要再重复做」。
           这里只读接口 + 今天的完成标记，不发任何「做任务」的请求：
             · 搜索：面板配额（getPcQuota）优先，读不到退回 earn 页
             · 阅读：earn 页的阅读进度
             · 其他：全部看本地当天标记，零请求
           返回值里 search / read 是布尔，other 是待做项的名字数组。 */
        async surveyTasks() {
            const today = RewardsAuto.state.dateNowNum || Utils.getTodayNum();
            const on = (k, d = true) => GM_getValue(k, d) !== false;
            const out = {
                search: false, read: false, other: [],
                pc: null, readP: null, text: "", planText: ""
            };

            let info = null;
            try { info = await API.getRewardsInfo(1); } catch (_) { info = null; }

            /* ── 搜索：配额满了就不排搜索节点 ── */
            let pcTxt = "已关闭";
            if (on("Tasks.search")) {
                let cur = NaN, max = NaN;
                try {
                    const q = await API.getPcQuota();
                    if (q && Number(q.max) > 0) { cur = Number(q.progress); max = Number(q.max); }
                } catch (_) {}
                if (!Number.isFinite(cur) && info && info.pc) {
                    cur = Number(info.pc.progress); max = Number(info.pc.max);
                }
                out.pc = { progress: cur, max: max };
                if (Number.isFinite(cur) && Number.isFinite(max) && max > 0) {
                    out.search = cur < max;
                    pcTxt = `${cur}/${max}` + (out.search ? `（还差 ${Math.max(0, max - cur)} 分）` : " ✅ 已完成");
                } else {
                    /* 读不到配额时不当作完成：交给搜索节点自己再判一次（它会打「读不到就不搜」） */
                    out.search = true;
                    out.pc = null;
                    pcTxt = "配额读不到（交给搜索节点复核）";
                }
            }

            /* ── 阅读：进度满了就不排阅读节点 ── */
            let readTxt = "已关闭";
            if (on("Tasks.read")) {
                let rp = NaN, rm = NaN;
                /* 先问 DAPI：`API.getReadProgress()` 是最权威的（日志里那行
                   「📊 阅读进度查询: 30/30」就是它）。`getRewardsInfo()` 里的
                   readProgress 大半是本地缓存，新上下文里还是 0 ——
                   线上 22:46:36 marvin 盘点报「阅读 0/30」，一秒钟后真查却是 30/30，
                   于是每轮都被排进一个空的阅读节点，白等 2 分钟。
                   原来的判断只在「读不到数值」时才补查，0 是合法数值所以永远不补查。 */
                try {
                    const p = await API.getReadProgress();
                    if (p) { rp = Number(p.progress); rm = Number(p.max); }
                } catch (_) {}
                if (!Number.isFinite(rp) || !(rm > 0)) {
                    if (info) { rp = Number(info.readProgress); rm = Number(info.readMax); }
                }
                out.readP = { progress: rp, max: rm };
                if (Number.isFinite(rp) && rm > 0) {
                    out.read = rp < rm;
                    readTxt = `${rp}/${rm}` + (out.read ? `（还差 ${Math.max(0, rm - rp)} 分）` : " ✅ 已完成");
                } else {
                    out.read = true;
                    out.readP = null;
                    readTxt = "进度读不到（交给阅读节点复核）";
                }
            }

            /* ── 其他活动：只看当天标记 ── */
            if (on("Tasks.desktopWeekly")
                && (Number(GM_getValue("Config.desktopWeekDoneDate", 0)) || 0) !== today) out.other.push("桌面专属任务");
            if (on("Tasks.monthly") && (Number(GM_getValue("Config.monthlyDoneDate", 0)) || 0) !== today) out.other.push("月度计划");
            if (on("Tasks.promos") && this.promosDate !== today) out.other.push("活动卡片");
            if ((Number(GM_getValue("Config.streakDoneDate", 0)) || 0) !== today) out.other.push("连签");
            if ((Number(GM_getValue("Config.dailySetDoneDate", 0)) || 0) !== today) out.other.push("每日活动");
            if (on("Tasks.intlDaily")) {
                const st = GM_getValue("Config.intlDailyDate", null);
                const done = st && Number(st.date) === today && Number(st.found) > 0 && Number(st.pending) === 0;
                if (!done) out.other.push("国际版活动");
            }
            if (on("Tasks.claimPoints")) {
                /* 30 分钟内刚确认「待领为 0」就不算待做，否则 other 节点永远清不空 */
                const cl = GM_getValue("Config.claimCleanAt", null);
                const fresh = cl && Number(cl.date) === today && (Date.now() - (Number(cl.at) || 0)) < 30 * 60 * 1000;
                if (!fresh) out.other.push("待领积分");
            }
            if (EdgeStreak.enabled()) {
                const es = (() => { try { return EdgeStreak.summary(); } catch (_) { return null; } })();
                /* 只放固定名字、不放进度文本：进度每轮都在变，会把「待做项没减少」
                   误判成「有变化」，防空转的刹车就失效了。 */
                if (es && !es.done && !es.skipped) out.other.push("Edge 连签");
            }

            out.text = `搜索 ${pcTxt} · 阅读 ${readTxt}`
                + (out.other.length ? ` · 待做：${out.other.join(" / ")}` : " · 其他活动 ✅ 全部完成");
            const plan = [];
            if (out.search) plan.push("搜索");
            if (out.read) plan.push("阅读");
            if (out.other.length) plan.push("其他活动");
            out.planText = plan.length ? plan.join(" → ") : "无（今天已全部完成）";
            return out;
        },

        /* ══ 其他活动节点：一次把这个节点的事全做完 ══════════════════════
           用户要求「其他活动可以放在一轮直接做完」。
           每一项内部都自带当天/当周的完成标记：
             · 活动卡片 → promosDate
             · 每日活动 → Config.dailySetDoneDate
             · 国际版   → Config.intlDailyDate
             · 月度计划 → Config.monthlyDoneDate
             · 连签     → Config.streakDoneDate
             · 桌面周任务 → State.desktopWeekAttempted（同一张卡当天只交一次）
           所以重复进入这个节点也不会重复交卷，只是各项会先打一行「已完成，跳过」。 */
        async runOtherNode(deadline, wr) {
            const on = (k, d = true) => GM_getValue(k, d) !== false;
            const roundExpired = () => Date.now() > deadline;

            if (on("Tasks.desktopWeekly")) {
                await this.doDesktopWeekly();
                await Utils.randomDelay(2000, 5000);
            }
            if (on("Tasks.monthly")) {
                if (!roundExpired()) await wr(() => this.doMonthlyPlan(), "月度计划");
                await Utils.randomDelay(2000, 5000);
            }
            if (on("Tasks.promos")) {
                if (!roundExpired()) {
                    await wr(() => this.doPromos(deadline), "活动卡片");
                    await Utils.randomDelay();
                }
            }
            if (!roundExpired()) await this.doStreak();
            await Utils.randomDelay();

            /* 每日活动 */
            if (roundExpired()) {
                Utils.log("🟡", "其他活动节点已到 20 分钟上限，每日活动交给下一个节点");
            } else {
                Utils.log("📅", "开始执行每日活动任务...");
                await Utils.randomDelay();
                this._dailySetRes = await wr(() => this.doDailySet(deadline), "每日活动");
            }
            /* 国际版每日活动：纯接口完成，不占 CDP 也不开标签页 */
            if (!on("Tasks.intlDaily")) {
                Utils.log("  ", "国际版每日活动已关闭（任务开关）");
                this._intlDailyRes = null;
            } else if (roundExpired()) {
                Utils.log("🟡", "其他活动节点已到 20 分钟上限，国际版每日活动交给下一个节点");
            } else {
                await Utils.randomDelay();
                this._intlDailyRes = await this.doIntlDaily(deadline);
            }
            try {
                await this.doClaimPoints();
            } catch (e) {
                if (e && e.regionBlocked) throw e;
                Utils.log("🟡", `领取积分执行异常: ${e.message}`);
            }
            /* 二次扫描：活动卡已经全部完成时没必要再扫（用户要求「做完的不要重复做」） */
            if (roundExpired()) {
                Utils.log("🟡", "其他活动节点已到 20 分钟上限，二次扫描交给下一个节点");
            } else if (this.promosDate === (RewardsAuto.state.dateNowNum || Utils.getTodayNum())) {
                Utils.log("✅", "活动卡片今日已完成，二次扫描跳过（不重复扫描）");
            } else {
                Utils.log("🔄", "二次扫描：检查是否有新解锁的卡片...");
                await Utils.randomDelay(3000, 8000);
                const newCards = await API.discoverCards();
                if (newCards.length > 0) {
                    Utils.log("🧩", `二次扫描发现 ${newCards.length} 个新卡片`);
                    let ok = 0, fail = 0;
                    let rescanGap = SEARCH_PACER.startGap("other");
                    for (const card of newCards) {
                        await RegionGuard.guard("二次扫描");
                        this.tick();
                        Utils.log("  ", `[${card.kind}] ${card.title} +${card.points}p`);
                        if (card.kind === "quiz" && !GM_getValue("Tasks.quiz", true)) continue;
                        if (!SEARCH_PACER.fits(deadline, rescanGap)) {
                            Utils.log("🟡", `二次扫描到点交班，剩余卡片留给下一个节点（当前节拍 ${Math.round(rescanGap / 1000)} 秒）`);
                            break;
                        }
                        await SEARCH_PACER.beat(rescanGap);
                        const result = await API.claimCard(card);
                        result ? ok++ : fail++;
                        rescanGap = SEARCH_PACER.nextGap(rescanGap, !!result, "other");
                    }
                    Utils.log("🔵", `二次扫描完成: ${ok}成功/${fail}失败`);
                } else {
                    Utils.log("✅", "二次扫描：无新卡片");
                }
            }
            /* 关掉时连「检查」这一步都不做，也别打日志 */
            if (EdgeStreak.enabled()) {
                Utils.log("🌐", "检查 Edge 浏览连签进度...");
                const edgeRes = await EdgePacer.maybeReport();
                if (!edgeRes) {
                    Utils.log("  ", "Edge 浏览连签：本轮没有推进（间隔未到 / 未授权 / 出口未通过）");
                } else if (edgeRes.done) {
                    Utils.log("  ", "Edge 浏览连签：今日已达标");
                } else if (edgeRes.skipped) {
                    Utils.log("  ", "Edge 浏览连签：今日已跳过（账号无此活动或已暂停）");
                } else {
                    Utils.log("  ", `Edge 浏览连签：已上报 ${edgeRes.count}/${edgeRes.total} 次，`
                        + `下次约 ${Math.max(1, Math.round((edgeRes.waitMs || 0) / 60000))} 分钟后`);
                }
            }
        },

        /* ══ 节点循环 ═══════════════════════════════════════════════════
           一个节点 = 一个 20 分钟窗口，只做一种任务：
             search → 整节点全搜索（doSearch 内部会一直搜到配额满/节点到点）
             read   → 整节点全阅读
             other  → 其他活动一次全做完
           节点之间停 1~3 分钟。只要盘点还有待做项就继续接下一个节点，
           直到「盘点为空」或「总时长上限」或「连续两个节点都没进展」。 */
        async runNodes(ctx) {
            const wr = ctx.withRetry;
            const startedAt = Date.now();
            const planDeadline = Number(ctx.roundDeadline) || (startedAt + ROUND_BUDGET_MS);
            let totalLimit = Math.max(60 * 60 * 1000, Math.min(ROUND_TOTAL_MAX, planDeadline - startedAt));
            /* 但不能越过收工线：zy.py 到 untilMin 会直接关浏览器，正在进行的
               「阅读文章 3/4」「第 N 次搜索」会被腰斩 —— 那一条正好白丢。
               v0.78 靠「末点 17:40 + 20 分钟 = 18:00」自然对齐；v0.79 一轮拉到
               60 分钟后，17:20 命中就会跑到 18:20，所以这里夹一次。
               18 点后同样要夹：zy.py 顺延到 23:59 时，23:30 开跑 60 分钟就会被强杀。
               untilMin 若已是过去的时刻（如 18:00 而现在 22:00），条件不成立，不夹。 */
            try {
                const d0 = new Date(startedAt);
                const curMin0 = d0.getHours() * 60 + d0.getMinutes();
                const hint = this.planRaw();
                const untilMin = hint ? Number(hint.untilMin) : NaN;
                if (Number.isFinite(untilMin) && untilMin > curMin0) {
                    const leftMs = (untilMin - curMin0) * 60 * 1000;
                    if (leftMs < totalLimit) {
                        totalLimit = Math.max(ROUND_BUDGET_MS, leftMs);
                        Utils.log("⏳", `离收工（${this.fmtHM(untilMin)}）还有 ${Math.round(leftMs / 60000)} 分钟，`
                            + `本轮节点循环按这个长度收缩，不再套 60 分钟（避免收工那一刻被强杀）`);
                    }
                }
            } catch (_) {}
            const totalDeadline = startedAt + totalLimit;

            let surv = await this.surveyTasks();
            Utils.log("🧾", `任务盘点：${surv.text}`);
            Utils.log("🧭", `本轮节点计划：${surv.planText}`
                + `（每个节点最多 ${Math.round(ROUND_BUDGET_MS / 60000)} 分钟，节点之间停 1~3 分钟）`);

            const stuck = { search: 0, read: 0, other: 0 };
            const off = { search: false, read: false, other: false };
            let prevPc = surv.pc ? surv.pc.progress : null;
            let prevRead = surv.readP ? surv.readP.progress : null;
            let prevOther = surv.other.join("|");
            let nodeIdx = 0;
            /* 本轮「有没有真的推进」的基准：只有推进过才允许写续跑标记，
               否则锁定卡/风控会让「还有待做项」一直成立，变成无意义的空转连跑。 */
            const firstPc = prevPc;
            const firstRead = prevRead;
            const firstOther = surv.other.length;

            while (true) {
                this.tick();
                if (Date.now() >= totalDeadline) {
                    Utils.log("🟡", `本轮已到总时长上限 ${Math.round(totalLimit / 60000)} 分钟，剩余任务交给下一轮`);
                    break;
                }
                const pendingSearch = surv.search && !off.search;
                const pendingRead = surv.read && !off.read;
                const pendingOther = surv.other.length > 0 && !off.other;
                if (!pendingSearch && !pendingRead && !pendingOther) {
                    if (surv.search || surv.read || surv.other.length) {
                        Utils.log("🟡", "剩余项本轮无法推进（已在节点里判过），交给下一轮重新盘点");
                    } else {
                        Utils.log("✅", "盘点结果：今日任务已全部完成，本轮不再重复执行任何节点");
                    }
                    break;
                }

                const type = pendingSearch ? "search" : (pendingRead ? "read" : "other");
                if (nodeIdx > 0) await this.waitNodeGap(type === "search" ? "搜索" : (type === "read" ? "阅读" : "其他活动"));
                const nodeDeadline = Math.min(Date.now() + ROUND_BUDGET_MS, totalDeadline);
                nodeIdx++;
                Utils.log("🚦", `进入${type === "search" ? "搜索" : (type === "read" ? "阅读" : "其他活动")}节点`
                    + `（第 ${nodeIdx} 个，最多 ${Math.round((nodeDeadline - Date.now()) / 60000)} 分钟）`);

                if (type === "search") {
                    await wr(() => this.doSearch(nodeDeadline), "搜索");
                } else if (type === "read") {
                    await wr(() => this.doRead(nodeDeadline), "阅读");
                } else {
                    await this.runOtherNode(nodeDeadline, wr);
                }

                /* 节点后重新盘点：这是「轮询开始先查询」的另一半 ——
                   做完的项立刻从计划里消失，下一节点不会再碰它。 */
                this.tick();
                surv = await this.surveyTasks();
                Utils.log("🧾", `节点后盘点：${surv.text}`);

                if (type === "search") {
                    const now = surv.pc ? surv.pc.progress : null;
                    const moved = prevPc != null && now != null && Number(now) > Number(prevPc);
                    stuck.search = moved ? 0 : stuck.search + 1;
                    prevPc = now;
                    if (stuck.search >= 2) {
                        off.search = true;
                        Utils.log("🟡", "连续两个搜索节点配额都没涨（可能在冷却/限流），搜索交给下一轮，先做别的");
                    }
                } else if (type === "read") {
                    const now = surv.readP ? surv.readP.progress : null;
                    const moved = prevRead != null && now != null && Number(now) > Number(prevRead);
                    stuck.read = moved ? 0 : stuck.read + 1;
                    prevRead = now;
                    if (stuck.read >= 2) {
                        off.read = true;
                        Utils.log("🟡", "连续两个阅读节点进度都没涨，阅读交给下一轮，先做别的");
                    }
                } else {
                    const key = surv.other.join("|");
                    stuck.other = (key !== prevOther) ? 0 : stuck.other + 1;
                    prevOther = key;
                    if (stuck.other >= 2) {
                        off.other = true;
                        Utils.log("🟡", "连续两个其他活动节点都没有减少待做项（多为锁定卡/风控），本轮不再重复跑");
                    }
                }
            }

            /* ── 本轮收尾：18 点前还有没做完的，就留一个「续跑」标记 ──
               18 点前执行点之间隔着 70 分钟、一轮 60 分钟，只空 10 分钟；
               留标记让下一声敲门直接接着做，不用干等。
               18 点后不走这里：那边统一按 20 分钟节拍（见 hitWakePoint 的 continuous 分支），
               每分钟续跑就是「胡跑」的来源。 */
            const stillPending = surv.search || surv.read || surv.other.length > 0;
            const after18Now = (() => {
                const d = new Date();
                return d.getHours() * 60 + d.getMinutes() >= PLAN_CUTOFF_MIN;
            })();
            let progressed = false;
            try {
                const nowPc = surv.pc ? Number(surv.pc.progress) : null;
                const nowRead = surv.readP ? Number(surv.readP.progress) : null;
                progressed = (firstPc != null && nowPc != null && nowPc > firstPc)
                    || (firstRead != null && nowRead != null && nowRead > firstRead)
                    || (surv.other.length < firstOther);
            } catch (_) {}
            try {
                if (stillPending && progressed && !after18Now) {
                    GM_setValue("Config.needMore", { date: Utils.getTodayNum(), at: Date.now() });
                    Utils.log("🔁", `本轮结束时仍有待做（${surv.other.join(" / ") || (surv.search ? "搜索" : "阅读")}），`
                        + `已留下续跑标记：下一声敲门直接接着做（不占执行点）`);
                } else if (stillPending && after18Now) {
                    GM_setValue("Config.needMore", null);
                    Utils.log("🟡", `18 点后仍有待做（${surv.other.join(" / ") || (surv.search ? "搜索" : "阅读")}），`
                        + `按 20 分钟节拍继续（下一轮在 ${Math.round(AFTER18_IDLE_MS / 60000)} 分钟后）`);
                } else if (!stillPending) {
                    GM_setValue("Config.needMore", null);
                } else {
                    GM_setValue("Config.needMore", null);
                    Utils.log("🟡", "本轮没有实际推进（配额/进度都没动），不写续跑标记，等下一次定时唤醒");
                }
            } catch (_) {}
        },

        async runAll(opts) {
            const force = !!(opts && opts.force);
            this.lastRunStarted = false;
            if (this.running) {
                /* 本上下文内存标记还立着：只有心跳/进展都停了才算残留。
                   以前这里只看 runningSince + 40 分钟，卡住的轮次会一直拦着自己。 */
                const st = Sched.getState() || {};
                const lastAct = Math.max(Number(st.at) || 0, Number(st.aliveAt) || 0, this.runningSince || 0);
                if (Date.now() - lastAct < RUN_STALE) {
                    Utils.log("🟡", "任务正在运行中，请勿重复触发");
                    return;
                }
                Utils.log("🟡", "上一轮的运行标记是残留的（上下文被冻结过），清理后继续");
                this.forceCleanupOwnRound("");
            }
            /* 先回收已经死掉的轮次（条目不新鲜就清掉），再看是否真的有人在跑。
               顺序不能反：反了的话一条死记录会永远拦住新的一轮。 */
            Sched.reap();
            if (Sched.isBusy()) {
                const st = Sched.getState() || {};
                const lastAct = Math.max(Number(st.at) || 0, Number(st.aliveAt) || 0);
                /* 手动触发（force）：先实测那一轮是不是还活着。
                   死掉的上下文会留下「看起来还新」的时间戳，只看时间戳会让手动运行永远点不动。 */
                const alive = force ? await Sched.probeOwnerAlive().catch(() => true) : true;
                if (alive) {
                    Utils.log("🟡", `上一轮（${st.ctx || "未知"}）还在执行中（最后活动 ${Math.round((Date.now() - lastAct) / 1000)} 秒前），本次触发跳过`);
                    return;
                }
                Utils.log("♻️", "上一轮的上下文已经不在（心跳没再涨），清理残留后继续");
                Sched.resetRoundState("");
            }
            Utils.log("▶️", `本轮进入执行流程（${Utils.isBackground() ? "后台" : "页面"}上下文）`);
            this.abortRound = false;
            /* 「今日已完成 + 持续检测关闭」：只拦定时唤醒，不拦手动。
               手动「🚀 立即运行」是用户的明确意图 —— force=true 表示「我知道今天做完了，
               现在就是要再跑一轮」，所以这里必须让开，否则点了没反应。
               要立刻重跑就点它；定时唤醒仍然会被这条挡住。 */
            if (!force && !GM_getValue("Config.keep", true)
                && (Number(GM_getValue("Config.doneDate", 0)) || 0) === Utils.getTodayNum()) {
                Utils.log("💤", "今日所选任务已全部完成，继续保持休眠（本次定时唤醒不执行，明天自动恢复）");
                Sched.state("done");
                return;
            }
            if (!force && !Sched.inWindow(Date.now())) {
                Utils.log("🌙", `当前不在运行时段（${Sched.winSpan()}），本轮不发请求；要强行跑请用菜单「🚀 立即运行」`);
                Sched.saveNext(Sched.alignToWindow(Date.now()));
                Sched.clearClaim();
                Sched.state("waiting", { runAt: Sched.alignToWindow(Date.now()), inWindow: false });
                return;
            }
            if (!Utils.acquireLock("Config.runLock", RUN_LOCK_TTL)) {
                const hold = Utils.lockInfo("Config.runLock");
                Utils.log("⏳", `另一个上下文正在运行任务（锁 ${hold ? Math.round((Date.now() - hold.ts) / 1000) + " 秒前更新" : "未知"}），本次跳过（避免并发重复上报）`);
                return;
            }
            this.running = true;
            this.runningSince = Date.now();
            this.lastRunStarted = true;
            /* 每轮把「面板填的时段 / 实际解析出的时段 / 此刻在不在窗口」打一行，
               排查时段问题不用再翻代码。 */
            try {
                const rawWin = GM_getValue("Config.winTime", null);
                const cw = Sched.winCfg();
                const cfgTxt = cw.planUsed
                    ? `计划优先，配置值 ${rawWin == null ? "未设置" : JSON.stringify(rawWin)} 不参与`
                    : `配置值 ${rawWin == null ? "未设置(→09:00-23:00 兜底)" : JSON.stringify(rawWin)}`;
                Utils.log("🕘", `本轮生效时段：${Sched.winSpan()}（${cfgTxt}，当前${Sched.inWindow(Date.now()) ? "在" : "不在"}时段内）`);
            } catch (_) {}
            this.roundSeq++;
            this.roundId = this.roundSeq;
            const myRound = this.roundId;
            Sched.state("running");
            this.startHeartbeat();
            /* 本轮预算：平时 20 分钟；今天是最后一个执行点时放宽到「离收工还剩多久」
               （最多 45 分钟），保证欠的搜索能在收工前做完，而不是被 18:00 直接截断。 */
            const roundBudget = Sched.roundBudgetMs();
            this.roundBudget = roundBudget;
            const roundDeadline = this.runningSince + roundBudget;
            {
                const d0 = new Date(this.runningSince);
                const curMin0 = d0.getHours() * 60 + d0.getMinutes();
                if (curMin0 >= PLAN_CUTOFF_MIN) {
                    /* 18 点后没有执行点这个概念了，别再打「今天最后一个执行点」——
                       22:06~22:14 那份日志里每 2 分钟就冒一句，看着像排程出了问题。 */
                    Utils.log("🕒", `18 点后连续模式：本轮预算 ${Math.round(roundBudget / 60000)} 分钟`
                        + `（${Math.round(AFTER18_IDLE_MS / 60000)} 分钟节拍；盘点为空就直接收尾，没做完按节拍继续）`);
                } else if (roundBudget > ROUND_BUDGET_MS) {
                    Utils.log("🕒", `今天最后一个执行点：本轮预算放宽到 ${Math.round(roundBudget / 60000)} 分钟`
                        + `（平时 ${ROUND_BUDGET_MS / 60000} 分钟），把欠的搜索在收工前做完`);
                }
            }
            try {
                this.signTimes = 0;
                this.readTimes = 0;
                this.promosTimes = 0;
                RewardsAuto.state.lockedCount = 0;
                RewardsAuto.state.lockedPoints = 0;
                RewardsAuto.state.lockedTitles = [];
                RewardsAuto.state.desktopPendingTitles = [];
                RewardsAuto.state.weeklyQuestDone = 0;
                RewardsAuto.state.weeklyQuestPending = 0;
                RewardsAuto.state.weeklyQuestFailed = 0;
                RewardsAuto.state.monthlyFound = 0;
                RewardsAuto.state.monthlyDone = 0;
                RewardsAuto.state.monthlyTotal = 0;
                RewardsAuto.state.monthlyPending = 0;
                RewardsAuto.state.monthlyComplete = false;
                RewardsAuto.state.webNoAuth = false;
                RewardsAuto.state.webFailStreak = 0;
                RewardsAuto.state.startTime = Utils.getTimestamp();
                Utils.log("🚀", "启动全能自动化任务...");
                this.init();
                /* 热搜词只在任务开始时拉一批，本轮后续搜索只从列表随机抽，不再碰接口 */
                await API.prefetchHotWords();
                if (!(await API.checkRegion())) {
                    Utils.log("🛑", "出口检测未通过：本轮不发任何微软请求，关掉 VPN/梯子（或恢复直连）后会自动恢复");
                    return;
                }
                let isTokenOK = await API.renewToken();
                if (!isTokenOK) {
                    /* Token 失效 = 需要人重新授权，属于异常：6 小时内只提醒一次 */
                    Utils.notifyAnomaly("🟡", "Token失败，跳过签入/阅读", "tokenFail");
                } else {
                    Utils.resetOnce("tokenFail");
                }
                /* ══ 轻量闸门（v0.80）══════════════════════════════════════
                   「胡跑」的另一半：18 点后每 20 分钟一轮，每轮照旧做签入 → 读余额 →
                   扫桌面任务 → 月度 → 连签 → 每日活动 → 国际版 → 领奖 → 二次扫描 → Edge，
                   哪怕这些任务几小时前就全做完了。一轮 25~40 秒、十几次接口，纯空转。
                   这里先盘点（只读 2~3 个接口）：全空就直接收尾，连签入、读余额、CDP 都不碰。 */
                let preSurv = null;
                if (isTokenOK) {
                    try { preSurv = await this.surveyTasks(); } catch (_) { preSurv = null; }
                }
                if (preSurv && !preSurv.search && !preSurv.read && preSurv.other.length === 0) {
                    Utils.log("✅", `盘点：${preSurv.text}`);
                    Utils.log("💤", "今日任务已全部完成，本轮不执行任何节点"
                        + "（签入/领奖/CDP 也不再重跑，等下一个节拍复查）");
                    return;
                }
                /* 必须排在 renewToken 之后：换 Token 前打 DAPI 一律 401，
                   余额只会读出 0 —— 「初始积分: 0」既误导人，也让本轮「今日获取」算不出来。 */
                const startBalance = await API.getBalance();
                Utils.log("📊", `初始积分: ${startBalance}`);
                const retryDelay = 60000;
                const maxRetries = 2;
                const withRetry = async (taskFn, taskName, retries = 0) => {
                    /* 进每个阶段都先确认这一轮还活着，并标记一次真实进展 */
                    this.ensureAlive();
                    Sched.progress();
                    try {
                        const result = await taskFn();
                        if (result === false && retries < maxRetries) {
                            if (this.aborted()) return result;
                            Utils.log("🟡", `${taskName} 失败，${retryDelay/1000}秒后重试 (${retries + 1}/${maxRetries})`);
                            await Utils.delay(retryDelay);
                            return withRetry(taskFn, taskName, retries + 1);
                        }
                        return result;
                    } catch (e) {
                        if (e && e.regionBlocked) throw e;
                        if (e && e.roundAborted) throw e;
                        if (retries < maxRetries) {
                            if (this.aborted()) return false;
                            Utils.log("🟡", `${taskName} 异常: ${e.message}，${retryDelay/1000}秒后重试`);
                            await Utils.delay(retryDelay);
                            return withRetry(taskFn, taskName, retries + 1);
                        }
                        Utils.log("🔴", `${taskName} 失败: ${e.message}`);
                        return false;
                    }
                };
                /* 开跑前先清掉上一轮遗留在窗口里的临时标签页（只清自己开过、且已经放很久的）。 */
                try {
                    const reapedTabs = await CDP.reapOwned(3 * 60 * 1000);
                    if (reapedTabs > 0) Utils.log("🖱️", `已清理上一轮遗留的 ${reapedTabs} 个临时标签页`);
                } catch (_) {}
                await withRetry(() => this.doSign(), "签到");
                await Utils.randomDelay();
                /* ══ 节点式执行（v0.79）══════════════════════════════════════
                   用户要求（2026-11-22）：
                     · 轮询还是 20 分钟：一个节点就是一个 20 分钟窗口；
                     · 任务一直做别停：节点做完立刻接下一个，只停 1~3 分钟；
                     · 每个节点开头先盘点，做完的项直接跳过、不重复做；
                     · 搜索 / 阅读不混在同一个节点：整节点全搜索，或整节点全阅读；
                     · 其他活动（桌面周任务/月度/活动卡/连签/每日活动/国际版/
                       领奖/二次扫描/Edge）在一次节点里全部做完。
                   签到留在节点循环之前：它一天只有一次且很快，不该占一个节点。 */
                this._dailySetRes = null;
                this._intlDailyRes = null;
                if (isTokenOK) {
                    await this.runNodes({ withRetry, roundDeadline });
                } else {
                    Utils.log("🟡", "Token 不可用：只做不依赖 Token 的其他活动（每日活动/签入之外的项）");
                    await this.runOtherNode(Math.min(Date.now() + ROUND_BUDGET_MS, roundDeadline), withRetry);
                }
                const dailySetRes = this._dailySetRes;
                const intlDailyRes = this._intlDailyRes;
                /* CDP 收尾（整轮唯一出口）：把本轮自己开的临时标签页全部关掉。
                   只有「活动卡全清 + 首页待领取也过」才封盘到今天结束；
                   否则下一轮（可能 20 分钟后）还允许再开一次。 */
                try {
                    const closed = await CDP.closeOwned();
                    if (closed > 0) Utils.log("🖱️", `已关闭 ${closed} 个本轮临时标签页`);
                    const claimBad = /未成功|异常|待复核/.test(this.claimSummary || "");
                    if (CDP._promosClean && !claimBad) {
                        CDP.markTodayDone();
                        Utils.log("🖱️", "今天所有需要 CDP 的任务都处理完了，之后不再打开标签页（明天自动恢复）");
                    } else {
                        CDP._promosClean = false;
                        Utils.log("🖱️", "还有需要 CDP 的项未完成，下一轮需要时再静默开页");
                    }
                } catch (_) {}
                const endTime = Utils.getTimestamp();
                const totalTime = ((endTime - RewardsAuto.state.startTime) / 1000).toFixed(1);
                const endBalance = await API.getBalance();
                const earned = (startBalance > 0 && endBalance > 0) ? (endBalance - startBalance) : 0;
                /* 汇总前补一次 Edge 连签的服务端回读：
                   EdgePacer 有节流，本轮可能没轮到 step()，本地状态会是老值。
                   这一步只读不写（不上报、不激活），失败也不影响汇总。 */
                try { await EdgeStreak.refreshFromServer(); } catch (_) {}
                const info = await API.getRewardsInfo();
                /* 汇总块里判断出的「今天真的全做完了」。
                   要和 isDayComplete() 共用同一个结论：
                   后者看的是本地标记位（searchDate / edge.complete），
                   而面板可能已经 60/60、Edge 已经 30/30 —— 两套判据不一致，
                   就会出现「日志说全部完成，却每 2 小时继续跑」。 */
                let dayVerified = false;
                if (info) {
                    const today = RewardsAuto.state.dateNowNum;
                    /* 0 不是 nullish：回读到 0 会盖掉已确认的 30/30。
                       本轮已确认完成就以满进度为准。 */
                    const readDone = this.readDate === today;
                    let readProg = Number(info.readProgress);
                    if (!Number.isFinite(readProg)) readProg = 0;
                    /* 服务端读数可能退回 0（接口降级 / 缓存没刷新），而本轮其实已经读了 20 多篇：
                       取本地实测值兜底，否则汇总里「📋 阅读 · 0/30」会让人以为一篇都没读
                       （日志里同一时刻明明在打「阅读文章 2/4 +3积分（24/30）」）。 */
                    readProg = Math.max(readProg, Number(RewardsAuto.state.readProgress) || 0);
                    let readMaxProg = Number(info.readMax) || Number(RewardsAuto.state.readMax) || 30;
                    if (readMaxProg <= 0) readMaxProg = 30;
                    if (readDone && readProg < readMaxProg) {
                        const known = Number(RewardsAuto.state.readProgress) || 0;
                        readProg = Math.max(readProg, known, readMaxProg);
                    }
                    const signOk = this.signDate === today;
                    /* 进度已满也算达标：标记位可能因刷新/跨实例丢失，服务端进度才是事实 */
                    const readOk = readDone || (readMaxProg > 0 && readProg >= readMaxProg);
                    const searchOk = info.pc.progress >= info.pc.max;
                    const promosOk = this.promosDate === today;
                    const promosUnknown = !!RewardsAuto.state.promosUnknown && !promosOk;
                    /* 每日活动：本轮没进 other 节点（盘点已判定完成）也算达标 ——
                       否则「今天早就做完了」会因为 dailySetRes=null 被算成差一项，
                       每轮都重复跑一遍其他活动节点。 */
                    const dailyOk = !!dailySetRes
                        || (Number(GM_getValue("Config.dailySetDoneDate", 0)) || 0) === today;
                    /* 国际版每日活动是额外 25 分，不参与「全部完成」判定，只做展示。
                       intlDailyRes 为 false 表示本轮交卷有失败；null 表示没跑（封盘/关闭）。 */
                    const intlOk = !GM_getValue("Tasks.intlDaily", true) || intlDailyRes !== false;
                    const edge = EdgeStreak.summary();
                    const edgeOk = !edge || edge.done || edge.skipped;
                    const mob = info.mobile || {};
                    const mobOk = !mob.max || mob.progress >= mob.max;
                    const tick = ok => (ok ? '✅' : '⏳');

                    /* 只把「开启的任务」计入达标分母，关掉的项不该被算成差一项 */
                    const on = key => GM_getValue(key, true);
                    const signOn = on("Tasks.sign"), readOn = on("Tasks.read");
                    const searchOn = on("Tasks.search"), promosOn = on("Tasks.promos");
                    const desktopOn = on("Tasks.desktopWeekly");
                    const monthlyOn = on("Tasks.monthly");
                    const goals = [];
                    if (signOn) goals.push(signOk);
                    if (readOn) goals.push(readOk);
                    if (searchOn) goals.push(searchOk);
                    if (promosOn) goals.push(promosOk);
                    goals.push(dailyOk);
                    if (edge) goals.push(edgeOk);
                    const doneCount = goals.filter(Boolean).length;
                    const allDone = goals.length > 0 && doneCount === goals.length;
                    const desktopPending = Number(RewardsAuto.state.weeklyQuestPending) || 0;
                    const desktopFailed = Number(RewardsAuto.state.weeklyQuestFailed) || 0;
                    /* 具体卡片名只在后台日志里保留（state 里仍记录），通知只报数量 */
                    const claimPending = /未成功|异常|待复核/.test(this.claimSummary || "");
                    const blocked = [];
                    if (desktopOn && (desktopPending > 0 || desktopFailed > 0)) {
                        const parts = [];
                        if (desktopPending > 0) {
                            parts.push(`${desktopPending} 张未记账`);
                        }
                        if (desktopFailed > 0) parts.push(`${desktopFailed} 个入口读取失败`);
                        blocked.push("🖥️ 桌面专属任务 " + parts.join("，"));
                    }
                    if (RewardsAuto.state.lockedCount > 0) {
                        blocked.push(`🔒 带锁卡片 ${RewardsAuto.state.lockedCount} 张 / ${RewardsAuto.state.lockedPoints} 分`);
                    }
                    if (claimPending) {
                        /* 把技术原话换成一句人话；其它原因照抄（去掉括号里的诊断细节） */
                        const rawReason = String(this.claimReason || "");
                        const claimText = (/没有应答/.test(rawReason)
                            ? "领取通道没打通"
                            : (/返回 HTTP/.test(rawReason)
                                ? "领取请求被服务端拒绝"
                                : (rawReason || String(this.claimSummary).replace("⏳ ", ""))))
                            .replace(/（[^）]*）/g, "").replace(/\([^)]*\)/g, "").trim();
                        blocked.push("🎁 首页待领取" + String(this.claimSummary).replace("⏳ ", "")
                            + (claimText ? `：${claimText}` : ""));
                    }

                    /* 关掉的项要写「已关闭」：显示 ⏳ 0/90 会让人误以为没做完 */
                    const rows = [];
                    const row = (label, enabled, ok, detail) => rows.push(
                        label + " · " + (!enabled ? "⏭️ 已关闭" : tick(ok) + (detail ? " " + detail : "")));

                    rows.push("🌐 Edge 浏览连签 · " + (edge
                        ? (edge.done ? "✅" : edge.skipped ? "⏭️" : "⏳") + " " + edge.text
                        : "⏭️ 已关闭"));
                    /* 数据源不可用时明确指出「没读到」，不要用 ✅ 掩盖 */
                    if (promosUnknown) {
                        rows.push("🧩 活动卡片 · " + (promosOn ? "❓读取失败，未确认（不当作完成）" : "⏭️ 已关闭"));
                    } else {
                        row("🧩 活动卡片", promosOn, promosOk, "");
                    }
                    row("✨ 每日活动", true, dailyOk, this.dailySetSummary || "");
                    const intlOn = GM_getValue("Tasks.intlDaily", true);
                    const intlFound = Number(RewardsAuto.state.intlFound) || 0;
                    if (!intlOn) {
                        row("🌍 国际版每日活动", false, true, "");
                    } else if (intlFound > 0) {
                        const intlDone = Number(RewardsAuto.state.intlDone) || 0;
                        const intlPending = Number(RewardsAuto.state.intlPending) || 0;
                        const nothingConfirmed = intlDone === 0 && intlPending > 0;
                        if (nothingConfirmed) {
                            rows.push("🌍 国际版每日活动 · ❌ 0/" + intlFound
                                + " 未确认到账（已交卷，服务端回读仍未完成）");
                        } else {
                            row("🌍 国际版每日活动", intlOn, intlDone >= intlFound,
                                intlDone + "/" + intlFound
                                + (RewardsAuto.state.intlCached ? "（今日已封盘）" : ""));
                        }
                    } else if (RewardsAuto.state.intlAbsent) {
                        /* 面板没有这组卡不再是「今天彻底没有」：可能是服务端还没下发，
                           也可能只是这台主机这次没给，稍后会自动重查 */
                        rows.push(RewardsAuto.state.intlCached
                            ? "🌍 国际版每日活动 · ⏳ 面板暂未下发这组卡（稍后自动重查）"
                            : "🌍 国际版每日活动 · ⏭️ 本次面板里没有这组卡（稍后自动重查）");
                    } else {
                        rows.push("🌍 国际版每日活动 · ⏳ 本轮未检查（下一轮再试）");
                    }
                    row("🖥️ 桌面专属任务", desktopOn, desktopPending === 0 && desktopFailed === 0,
                        desktopPending > 0 ? `${desktopPending} 张未记账`
                            : (desktopFailed > 0 ? `${desktopFailed} 个入口读取失败` : ""));
                    /* 月度计划是「按月」的，子项按天解锁，不属于当天的达标口径：
                       只报进度，不参与 allDone 判定，也不进「受限制未完成」。 */
                    if (monthlyOn && RewardsAuto.state.monthlyFound > 0) {
                        const mDone = Number(RewardsAuto.state.monthlyDone) || 0;
                        const mTotal = Number(RewardsAuto.state.monthlyTotal) || 0;
                        rows.push("📆 月度计划 · " + (RewardsAuto.state.monthlyComplete ? "✅" : "⏳")
                            + ` ${mDone}/${mTotal}`
                            + (RewardsAuto.state.monthlyPending > 0 && !RewardsAuto.state.monthlyComplete
                                ? "，子项按天解锁" : ""));
                    } else if (monthlyOn) {
                        rows.push("📆 月度计划 · ⏭️ 本月无进行中任务");
                    }
                    row("📅 签到", signOn, signOk, this.streakDays > 0 ? "连签 " + this.streakDays + " 天" : "");
                    row("📋 阅读", readOn, readOk, readProg + "/" + readMaxProg);
                    row("🔍 PC 搜索", searchOn, searchOk, info.pc.progress + "/" + info.pc.max);
                    if (mob.max > 0) rows.push("📱 手机搜索 · " + tick(mobOk) + " " + mob.progress + "/" + mob.max);
                    if (RewardsAuto.state.lockedCount > 0) {
                        rows.push("🔒 锁卡 · " + RewardsAuto.state.lockedCount + " 张 / " + RewardsAuto.state.lockedPoints + " 分");
                    }
                    if (this.claimSummary) rows.push("🎁 领取积分 · " + this.claimSummary);
                    const dayEarnedKnown = info.earnedToday != null && Number.isFinite(Number(info.earnedToday));
                    const dayEarned = dayEarnedKnown ? Number(info.earnedToday) : earned;
                    const totalPoints = info.balance || endBalance || 0;
                    rows.push("💰 今日获取 +" + dayEarned
                        + (dayEarnedKnown ? "" : "（本轮）")
                        + " · 总积分 " + totalPoints);

                    const intlShort = intlOn && intlFound > 0
                        && ((Number(RewardsAuto.state.intlDone) || 0) < intlFound
                            || (Number(RewardsAuto.state.intlDropped) || 0) > 0);
                    if (intlShort) {
                        const why = String(RewardsAuto.state.intlReason || "").trim();
                        const droppedN = Number(RewardsAuto.state.intlDropped) || 0;
                        blocked.push(`🌍 国际版每日活动 ${Number(RewardsAuto.state.intlDone) || 0}/${intlFound} 张`
                            + (droppedN > 0 ? `（另有 ${droppedN} 张面板未下发 hash，脚本无法交卷）` : "")
                            + (!droppedN ? (why ? `（${why}）` : "（下一轮继续）") : ""));
                    }


                    /* intlDropped > 0 = 面板上还有卡脚本处理不了（如没下发 hash）。
                       这种不算「全部完成」，否则就是骗人：面板亮着卡、却说全完了。 */
                    const intlDroppedN = Number(RewardsAuto.state.intlDropped) || 0;
                    const intlComplete = !intlOn || intlFound === 0
                        || ((Number(RewardsAuto.state.intlDone) || 0) >= intlFound && intlDroppedN === 0);
                    const canNotify = allDone && blocked.length === 0 && intlComplete;
                    const head = allDone
                        ? (canNotify ? "今日任务已全部完成！" : "今日主要任务已完成")
                        : "本轮结果 · 还差 " + (goals.length - doneCount) + " 项";
                    let logMsg = head + "\n\n" + rows.join("\n")
                        + "\n\n✅ 达标 " + doneCount + "/" + goals.length + " · ⏱️ 用时 " + totalTime + " 秒";
                    if (blocked.length > 0) {
                        logMsg += "\n\n⏳ 受限制未完成：\n"
                            + blocked.map(s => "· " + s).join("\n");
                        /* 只有「通道没打通」这类才值得提浏览器；服务端明确拒绝
                           （HTTP 5xx/403 已到达）与「已受理待复核」都不该甩给 CDP。 */
                        const channelDown = /没有应答/.test(String(this.claimReason || ""));
                        const needChrome = (desktopOn && (desktopPending > 0 || desktopFailed > 0))
                            || (claimPending && channelDown);
                        if (needChrome) {
                            logMsg += "\n💡 「桌面专属任务 / 首页待领取」需要 Chrome，或按第三节配好 CDP";
                        }
                    }

                    /* allDone = 各任务在服务端口径上全部达标（见上面的 goals 汇总）。
                       这就是「今天还该不该继续跑」的权威结论。 */
                    dayVerified = allDone;

                    /* ── 收官补跑（最后一波没做完就连续来几轮）──
                       触发条件全部满足才请求：① 今天所有执行点都跑完了（nextWakeAt=0，
                       即这一轮是最后一个点）；② 服务端口径仍有任务没完成（!allDone）；
                       ③ 离收工还有余量（够再跑一轮，避免刚开跑就被关浏览器）；
                       ④ 今日收官补跑轮数没用满 FINALE_CATCHUP_MAX。
                       只写 GM 标记，真正开跑由下一声敲门（每分钟）识别，见 runOnce ⑥a''。 */
                    try {
                        const finalRound = Sched.nextWakeAt(Date.now()) === 0;
                        const untilMin = (() => {
                            const h = Sched.planRaw();
                            return h ? Number(h.untilMin) : NaN;
                        })();
                        const remainMin = Number.isFinite(untilMin)
                            ? untilMin - (new Date().getHours() * 60 + new Date().getMinutes()) : -1;
                        const fDay = Number(GM_getValue("Config.finaleDay", 0)) || 0;
                        const fUsed = fDay === today ? (Number(GM_getValue("Config.finaleCount", 0)) || 0) : 0;
                        if (finalRound && !allDone && remainMin >= 8 && fUsed < FINALE_CATCHUP_MAX) {
                            GM_setValue("Config.finaleCatchup", {
                                date: today, at: Date.now(), remainMin
                            });
                            Utils.log("🔔", `最后一波仍有任务未完成（达标 ${doneCount}/${goals.length}、离收工 ${remainMin} 分钟），`
                                + `请求收官补跑（今日 ${fUsed}/${FINALE_CATCHUP_MAX}）`);
                        }
                    } catch (_) {}
                    /* 🫀 每轮结束心跳：让面板能看到「这个账号的脚本确实跑完了一轮」
                       并带上本轮进展（达标数/各任务进度/积分）。走 QLREPORT-MSG，
                       zy.py 会按账号名加前缀发通知，且不节流，每轮一条。 */
                    try {
                        Utils.qlReport("msg", {
                            title: `第 ${this.roundSeq} 轮结束 · 达标 ${doneCount}/${goals.length}`,
                            text: logMsg.split("\n\n⏳ 受限制未完成")[0]
                        });
                    } catch (_) {}
                    if (canNotify) {
                        /* 全天达标：一天只推一条，key 按日期固定 */
                        Utils.notifyDone("🎉", logMsg, `roundDone:${today}`);
                        /* llq.py：结构化结束报告（每天一次）→ 触发「账号完成」，可关闭浏览器 */
                        try {
                            if ((Number(GM_getValue("Config.qlEndDate", 0)) || 0) !== today) {
                                GM_setValue("Config.qlEndDate", today);
                                Utils.qlReport("end", {
                                    search: {
                                        pc: `${info.pc.progress}/${info.pc.max}`,
                                        m: mob.max > 0 ? `${mob.progress}/${mob.max}` : "-",
                                    },
                                    read: `${readProg}/${readMaxProg}`,
                                    promos: promosOk ? "已完成" : "未完成",
                                    sign: signOk ? "已完成" : "未完成",
                                    todayPoints: dayEarned,
                                    availablePoints: totalPoints,
                                });
                            }
                        } catch (_) {}
                    } else {
                        /* 没全做完：一律只写日志，不弹通知、不推 webhook */
                        Utils.log("📊", logMsg);
                    }
                } else {
                    Utils.log("📊", ("本轮执行完成 · ⏱️ 用时 " + totalTime + " 秒 · 服务端状态读取失败，明细见日志"));
                }
                /* 「持续检测」关掉后，用 dayVerified（服务端口径）或 isDayComplete()（本地标记）
                   任一成立就封盘 —— 两个判据取并集，避免一个没写标记就停不下来。 */
                if (!GM_getValue("Config.keep", true) && (dayVerified || isDayComplete())) {
                    markDayComplete();
                }
            } catch (e) {
                if (e && e.regionBlocked) {
                    /* 出口被拦 = 需要人介入：推一条，但 6 小时内同类只推一次 */
                    Utils.notifyAnomaly("🛑", `本轮已中止：${e.message}`, "regionBlocked");
                } else if (this.aborted()) {
                    Utils.log("🛑", "本轮已超时收尾，剩余任务交给下一轮");
                } else {
                    Utils.notifyAnomaly("🔴", `本轮任务异常终止: ${e.message}`, "roundCrash");
                }
            } finally {
                /* 被强制收尾后可能已经有新的一轮接上来了：
                   旧轮的 finally 不能把新一轮的 running/锁/阶段清掉。 */
                if (myRound === this.roundId) {
                    this.finishRound("");
                } else {
                    Utils.log("🟡", "上一轮的收尾被跳过（已经由更新的那一轮接管）");
                }
            }
        }
    };

    GM_registerMenuCommand("🔑 手动授权", () => {
        try {
            GM_openInTab(Auth.authUrl, { active: true });
            Utils.log("🟡", "已打开微软授权页：登录后会自动捕获授权码并换取 Token（无需手动复制）");
        } catch (e) {
            Utils.uiAlert(`❌ 无法打开授权页：${e.message}\n\n请手动访问：\n${Auth.authUrl}`);
        }
    });

    GM_registerMenuCommand("📋 粘贴授权码", () => { Auth.pasteFlow().catch(e => Utils.log("🔴", `粘贴授权码失败：${e.message}`)); });

    GM_registerMenuCommand("📊 Token状态", () => {
        const token = GM_getValue("Config.token", false);
        const time = Number(GM_getValue("Config.tokenTime", 0)) || 0;
        let ageStr = "未知";
        if (time > 0) {
            const diff = Utils.getTimestamp() - time;
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            const minutes = Math.floor((diff % 3600000) / 60000);
            const parts = [];
            if (days > 0) parts.push(`${days}天`);
            if (hours > 0) parts.push(`${hours}小时`);
            parts.push(`${minutes}分钟`);
            ageStr = parts.join("");
        }
        const tokenDate = time > 0 ? new Date(time).toLocaleString("zh-CN") : "未知";
        /* 这里只报「有没有、兑没兑换」，不打印授权码片段：
           授权码是等价的登录凭据，弹窗里露出来没有意义。 */
        const rawCode = GM_getValue("Config.code", "");
        const parsed = rawCode ? Auth.parseCode(rawCode) : null;
        const codeUsed = !!(parsed && Auth.used(parsed));
        const codeStr = !rawCode
            ? "无"
            : (!parsed
                ? "有（格式无法解析）"
                : (codeUsed ? "有（已兑换为 Token，保留中）" : "有（尚未兑换）"));
        Utils.uiAlert(
            `Token: ${token ? "已保存" : "无"}\n` +
            `获取时间: ${tokenDate}\n` +
            `已过: ${ageStr}\n` +
            `授权码: ${codeStr}`
        );
    });

    const diagClaim = async () => {
        const env = BrowserEnv.info();
        const saved = String(GM_getValue("Config.claimVariant", "") || "");
        let text = "🎁 待领积分 / 领取通道诊断\n\n";
        text += `任务开关：${GM_getValue("Tasks.claimPoints", true) ? "开启" : "关闭"}\n`;
        text += `当前浏览器：${BrowserEnv.summary()}${env.extOriginRisky ? "（新版本，后台直发大概率被拒）" : ""}\n`;
        text += `已记住通道：${saved || "未记录（会按 page → proxy → xhr 逐个试）"}\n`;
        const cdpOk = await CDP.available();
        text += `CDP 调试端口 ${CDP.PORT}：${cdpOk ? `✅ 可连（${CDP.base()}）` : "❌ 不可连"}\n`;
        text += `临时标签页：${CDP.todayDone() ? "今日已封盘（CDP 任务都做完了，不再开页）" : "按需静默打开，用完自动关闭"}\n`;
        text += `页面代发服务：${API._pageChannelAlive() ? "✅ 在线" : "❌ 不在线"}\n`;
        const table = ActionMap._readMap();
        text += `标识表：${Object.keys(table).length ? `已缓存 ${Object.keys(table).length} 个（部署 ${GM_getValue("Config.actionDpl", "未知")}）` : "空（用已知兜底标识）"}\n`;
        text += `领取标识：${ActionMap.get("reportClaimAllPoints").slice(0, 12)}…\n\n`;
        /* 先把原始解析结果打出来：金额读到 0 时，这一段能直接看出是字段名变了、
           还是 dashboard 根本不是登录态（这时 pointClaim 片段是空的）。 */
        let dashHtml = "";
        try { dashHtml = await Utils.xhr({ url: "https://rewards.bing.com/dashboard" }); } catch (_) { dashHtml = ""; }
        const raw = ClaimPoints.parse(dashHtml);
        text += `dashboard 抓取：${dashHtml ? `${dashHtml.length} 字节` : "❌ 失败（请求没回来 / 未登录）"}\n`;
        text += `原始解析：known=${raw.known} has=${raw.has} amount=${raw.amount} source=${raw.source || "-"}`
            + `${raw.uncertain ? "（金额读不准）" : ""}\n`;
        if (raw.snippet) text += `pointClaim 片段：${raw.snippet}\n`;
        text += `余额：${ClaimPoints._balance(dashHtml) || "读不到"}\n\n`;
        const pool = await ClaimPoints.run();
        text += `服务端回答：${pool.reached ? (pool.verdict === "false" ? "已到达，回答「没有可领的」(false)" : "已到达") : "未应答（通道没打通）"}`
            + `${pool.variant ? `，通道 ${pool.variant}` : ""}\n`;
        text += `待领状态：${pool.nothingToClaim
            ? "✅ 待领为 0（无需领取）"
            : (pool.empty || pool.settled
                ? (pool.settled ? "已领取，池已清空" : "空池")
                : (pool.claimed > 0 ? "已领取" : (pool.reason ? "未能确认" : "未知")))}\n`;
        text += `本次结果：${pool.claimed > 0
            ? (pool.claimedFrom === "balance"
                ? `+${pool.claimed} 分（余额 ${pool.before} → ${pool.after}，已确认入账）`
                : `页面待领 ${pool.claimed} 分（余额差读不到，待服务端入账，不作已到账凭据）`)
            : (pool.reason || "—")}\n`;
        if (!pool.variant && !pool.empty && !pool.nothingToClaim) {
            text += `\n提示：新版 Edge 请用桌面「Rewards Edge」快捷方式启动（端口 ${CDP.PORT}），`
                + "脚本检测到 CDP 会自己在后台开一个临时标签页做同源请求，用完自动关闭"
                + "（不抢焦点、不切走你正在看的页面）；Chrome 上后台直发通常也能过。";
        }
        text += "\n判定口径：余额上涨 > 待领池清空 > 待领金额下降；"
            + "页面/服务端任一侧表示「没有待领」即为成功；真拿不到证据才记「无法确认」。";
        if (pool.claimed > 0) Utils.log("🎁", pool.claimedFrom === "balance"
            ? `诊断中已自动领取 ${pool.claimed} 积分`
            : `诊断中领取已提交：页面待领 ${pool.claimed} 分（余额差读不到，待入账）`);
        return text;
    };

    /* 诊断专用：把原始值按「人能看懂」的方式打出来，读失败也不要抛。 */
    const safeRaw = (key) => {
        try { const v = GM_getValue(key, "(未设置)"); return JSON.stringify(v); } catch (_) { return "(读取失败)"; }
    };
    const safeType = (key) => {
        try { return typeof GM_getValue(key, undefined); } catch (_) { return "unknown"; }
    };

    const diagEdgeStreak = () => {
        const enabled = Utils.taskOn("Tasks.edge");
        const st = EdgeStreak.state();
        const total = st.total || Math.ceil(EDGE.TARGET_MINUTES / Math.max(1, st.intervalMin));
        /* 等待时间与上报逻辑同一口径：锚点 + 第 N 个窗口，且不早于上次上报 + 一个窗口。
           原来这里也写着 `st.count > 0`，于是刚启动时面板不显示「下次上报」。 */
        const winMs = Math.max(1, st.intervalMin) * 60 * 1000;
        const waitMs = (!st.complete && st.count < total && (st.startAt || st.last))
            ? Math.max(0, Math.max(
                (st.startAt || st.last) + (st.count + 1) * winMs,
                st.last ? st.last + winMs : 0
            ) - Date.now())
            : 0;
        let text = "🌐 Edge 浏览连签\n\n";
        /* 把「存了什么、什么类型、翻译成什么」一起打出来：
           开关行为和设置页对不上时，这一行能直接看出是管理器存成了字符串，
           还是根本没读到（以前只能靠猜）。 */
        text += `任务开关：${enabled ? "开启" : "关闭"}`
            + `（Tasks.edge 原始值=${safeRaw("Tasks.edge")}，类型=${safeType("Tasks.edge")}）\n`;
        /* 汇总口径（服务端为准）放在最前面，和推送里那一行保持一致 */
        {
            const sum = EdgeStreak.summary();
            text += `服务端进度：${st.complete ? "✅" : "⏳"} ${sum ? sum.text : "—"}`
                + `（${EDGE.TARGET_MINUTES} 分钟为达标）\n`;
        }
        text += `上报次数（本地计数，仅供排查）：${Math.min(st.count, total)}/${total} 次`
            + `（每次覆盖 ${st.intervalMin} 分钟）\n`;
        text += `服务端状态：${st.complete ? "✅ 已完成" : (st.giveUp ? "⏭️ 今日已跳过" : "⏳ 未完成")}\n`;
        text += `本轮计时起点：${st.startAt ? new Date(st.startAt).toLocaleString("zh-CN") : "尚未开始（今天还没进入累计）"}\n`;
        text += `上次上报：${st.last ? new Date(st.last).toLocaleString("zh-CN") : "无"}\n`;
        if (waitMs > 0) {
            text += `下次上报：约 ${Math.max(1, Math.ceil(waitMs / 60000))} 分钟后`;
            if (st.count === 0) text += "（第 1 次会等满一个计费窗口，不会一启动就报）";
            text += "\n";
        }
        text += `活动激活：${st.activated ? "已尝试" : "未尝试"}${st.extra ? `（已重来 ${st.extra}/${EDGE.MAX_EXTRA_ROUNDS} 轮）` : ""}\n`;
        text += `客户端：${RewardsAuto.ua.edge}\n\n`;
        /* 开关关着就别「顺手推进一次」：诊断面板不该变成绕过开关的后门。 */
        if (enabled) {
            text += "现在立刻推进一次（不足一个计费窗口会自动跳过，不刷接口）。";
            EdgePacer.nextAt = 0;
            EdgePacer.maybeReport().catch(e => Utils.log("🟡", `Edge 连签手动推进失败：${e.message}`));
        } else {
            text += "任务开关已关闭：不会上报、不会激活、也不会打开任何页面。\n"
                + "要恢复请到脚本设置里勾选「Edge 浏览连签」。";
        }
        return text;
    };

    const diagPcSearch = async () => {
        const pacer = SEARCH_PACER.summary();
        const guard = API.searchGuard();
        const coolLeft = API.searchCooldownLeft();
        let text = "🔍 PC 搜索诊断\n\n";
        text += `任务开关：${GM_getValue("Tasks.search", true) ? "开启" : "关闭"}\n`;
        text += `搜索间隔：每次随机 ${SEARCH_PACER.cycleMin() / 1000} ~ ${SEARCH_PACER.cycleMax() / 1000} 秒（基准 ${pacer.min} 秒，独立抽样，与上一次无关）`
            + `；另有 ${Math.round(SEARCH_PACER.LONG_PAUSE_P * 100)}% 概率来一次 ${SEARCH_PACER.LONG_PAUSE_MIN}~${SEARCH_PACER.LONG_PAUSE_MAX} 倍长停顿\n`;
        text += `间隔来源：Config.span = ${pacer.min} 秒（搜索用；最低 ${SEARCH_PACER.SPAN_MIN_MS / 1000} 秒，配更小会夹到 ${SEARCH_PACER.SPAN_MIN_MS / 1000} 秒）\n`;
        text += `间隔自证：日志里的「本次间隔 N 秒」才是间隔；「等待 N 秒」是扣掉观察/复核后的剩余，比间隔小是正常的\n`;
        text += `限流刹车：连续 ${SEARCH_PACER.NO_CREDIT_LIMIT / 60000} 分钟没记账则本轮收手（间隔本身不再拖慢）\n`;
        text += `其他任务节拍：Config.otherSpan = ${pacer.other} 秒 ± ${SEARCH_PACER.JITTER_MS / 1000} 秒（阅读/活动卡片/每日活动/国际版活动/二次扫描；最低 ${SEARCH_PACER.OTHER_SPAN_MIN_MS / 1000} 秒）\n`;
        {
            const hc = RewardsAuto.apiConfig.cache;
            const srcName = hc.source === "uapis" ? "uapis.cn 热搜"
                : (hc.apiName || "热榜接口");
            text += `搜索词来源：${RewardsAuto.apiConfig.mode === "offline" ? "offline（内置随机词）"
                : (hc.list.length > 0 ? `${srcName}，本轮已加载 ${hc.list.length} 条（仅任务开始时获取）`
                    : "本轮未加载 —— 搜索用内置随机词，下个任务开始时重试")}\n`;
        }
        if (pacer.last) {
            text += `上一轮：${pacer.last.attempts} 次搜索 / 记账 ${pacer.last.credits} 次（实测最大间隔 ${pacer.last.peak} 秒）\n`;
        } else {
            text += `上一轮：还没有记录\n`;
        }
        text += `搜索节点上限：20 分钟（节点到点就换下一个搜索节点继续，剩余配额不会丢）\n`;
        {
            const left = Sched.roundsLeftToday();
            text += `分配方式：节点模式（不再按剩余轮数 ${left} 分摊、不会整轮跳过；搜索节点就是把 20 分钟全用来搜）\n`;
        }
        text += `一轮结构：搜索 → 阅读 → 其他活动（每类一个节点，互不混），节点之间 1~3 分钟随机，一轮总上限 60 分钟\n`;
        text += `执行点间隔：约 70 分钟（一轮 60 分钟 + 收尾余量）。命中一个点就连着做下去，`
            + `循环期间撞到的后续执行点会直接让路（不浪费，只是合并进这一轮）\n`;
        text += `限流计数：${guard.streak}/${SEARCH_GUARD.STREAK_LIMIT}`
            + (coolLeft > 0 ? `（冷却中，约 ${Math.ceil(coolLeft / 60000)} 分钟后自动重试）` : "") + "\n";
        text += `任务标记：${TaskManager.searchDate === RewardsAuto.state.dateNowNum ? "今日已完成" : "今日未完成"}\n\n`;
        const info = await API.getRewardsInfo();
        if (info) text += `服务端配额：PC ${info.pc.progress}/${info.pc.max}\n`;
        else text += "服务端配额：读取失败\n";
        text += "\n调用后会立刻单独跑一次 PC 搜索（日志里能看到每次是否真的记账）。";
        if (!Utils.acquireLock("Config.runLock", 45 * 60 * 1000)) {
            Utils.log("🟡", "已有一轮任务在跑，搜索诊断跳过");
            return;
        }
        /* 手动诊断要能强制跑一次：拿到锁之后才清冷却与计数，否则冷却期内点了没反应。
           拿不到锁就不清，避免白白放掉一个还生效的冷却。 */
        API.clearSearchGuard(true);
        Promise.resolve()
            .then(() => TaskManager.doSearch())
            .catch(e => Utils.log("🔴", `搜索异常：${e && e.message ? e.message : e}`))
            .finally(() => Utils.releaseLock("Config.runLock"));
        return text;
    };

    /* 手动运行：**不受运行时段限制**，也不要求正好在 cron 唤醒点上。
       它唯一该被挡住的情况是「真的有一轮在跑」，否则会和那一轮并发上报。
       所以这里不能只看 isBusy() 的时间戳 —— 时间戳可能是死掉的上下文留下的，
       必须实测一次（probeOwnerAlive）再决定。 */
    GM_registerMenuCommand("🚀 立即运行", async () => {
        const now = Date.now();
        /* 手动运行是强制的：既不看运行时段，也不看今日是否已完成。
           今天已封盘时多说一句，免得用户以为是 bug。 */
        const dayDone = (Number(GM_getValue("Config.doneDate", 0)) || 0) === Utils.getTodayNum();
        Utils.log("🚀", dayDone
            ? "手动触发：今日任务已完成，仍按你的要求强制跑一轮"
            : "手动触发：立即运行一轮（忽略运行时段与 cron 节拍）");
        try { Sched.reapDeadRound(now); } catch (_) {}

        /* ① 记录里说有一轮在跑 → 实测它的心跳还在不在 */
        if (Sched.isBusy(now)) {
            const st = Sched.getState() || {};
            const lastAct = Math.max(Number(st.at) || 0, Number(st.aliveAt) || 0);
            const alive = await Sched.probeOwnerAlive().catch(() => false);
            if (alive) {
                Utils.log("🟡", `上一轮确实还在执行中（${st.ctx || "未知"}，最后活动 ${Math.max(0, Math.round((now - lastAct) / 60000))} 分钟前），等它跑完再点`);
                return;
            }
            Utils.log("♻️", "上一轮的上下文已经不在了（心跳没再涨），清掉残留状态后开始");
            Sched.resetRoundState("");
        }

        /* ② 同一上下文里还有一轮在跑（极少见）：只看它是不是卡死 */
        if (TaskManager.running) {
            if (now - (TaskManager.runningSince || now) < RUN_STALE) {
                Utils.log("🟡", "当前上下文已有一轮在跑，本次手动触发跳过");
                return;
            }
            Utils.log("♻️", "当前上下文的运行标记已过期，清理后继续");
            try { TaskManager.forceCleanupOwnRound(""); } catch (_) {}
        }

        /* ③ 清掉可能残留的运行锁与认领，别让手动触发被它挡回去 */
        try { Sched.clearClaim(); } catch (_) {}
        const lock = Utils.lockInfo("Config.runLock");
        if (lock && !lock.mine) {
            try { GM_setValue("Config.runLock", null); } catch (_) {}
            Utils.log("♻️", `已清理残留的运行锁（${Sched.fmt(lock.ts)}），手动运行继续`);
        }

        Promise.resolve()
            .then(() => TaskManager.runAll({ force: true }))
            .catch(e => Utils.log("🔴", `本轮任务异常：${e && e.message ? e.message : e}`))
            /* runAll 因为拿不到锁而直接返回时 lastRunStarted 仍是 false：
               用它区分「真的跑了一轮」和「没跑起来」。 */
            .finally(() => Sched.finish(true, TaskManager.lastRunStarted));
    });

    /* ── 运行痕迹 vs 今日进度，必须分开清 ──
       运行痕迹（锁、认领、排期、变体缓存、节流计数）：跨轮没有保留价值，
       定时模式下一轮的唤醒本来就该从干净状态开始，所以运行时段结束后自动清掉。
       今日进度（tasks / doneDate / edge / monthly / intl）：必须留到下一天，
       清了会让脚本把已经做完的任务再做一遍。
       ⚠️ Cookie 授权结果（Perm.cookieProbed / Perm.cookieDeniedAt）不属于运行痕迹：
       它们是「用户已授权」这个事实，一整天（以及以后每天都）都该保留。
       以前放在这里，每轮收工被清一次，于是每轮都重新打一遍
       「🔑 首次运行：请求 Cookie 读取权限」、并在浏览器里重新申请一次权限 —— 日志里
       14:58 / 15:01 / 15:09 反复出现就是它。现在改用 Perm. 前缀，不进清理名单。 */
    const RUNTIME_KEYS = [
        "Config.runState", "Config.runLock", "Config.cronClaim",
        "Config.heartbeatAt", "Config.idleWakeLogAt", "Config.windowOpenAt",
        "Config.searchGap", "Config.searchLast",
        "Config.restrictedTimes", "Config.lastSearchProgress", "Config.searchAutoReset",
        "Config.dpl", "Config.actionDpl", "Config.nextAction", "Config.nextActionScanAt",
        "Config.claimVariant", "Config.questVariant", "Config.uaEdge",
        "Config.rewardSearchSeenAt", "Config.apiIndex",
        "Config.tokenLock", "Config.edgeLock",
    ];

    /* 只记账、不代表「跑过一轮」的键：每轮唤醒都会写，不能拿来判断有没有残留，
       否则「睡了一觉什么都没跑」也会被当成脏状态，白清一次还多打一行日志。 */
    const ROUND_MARKER_KEYS = [
        "Config.heartbeatAt", "Config.idleWakeLogAt", "Config.windowOpenAt",
        "Config.runLock", "Config.runState",
    ];
    /* 真的跑过一轮才会写的缓存：这些还在，说明上一段会话留下了痕迹 */
    const ROUND_CACHE_KEYS = RUNTIME_KEYS.filter(k => ROUND_MARKER_KEYS.indexOf(k) < 0);

    /* 冷却自动恢复时才清：它要连今日进度一起重置，否则当天不会重新尝试 */
    const DAILY_KEYS = [
        "Config.tasks", "Config.signPoint",
        "Config.dailySetProcessed", "Config.dailySetDoneDate", "Config.doneDate",
        "Config.edge", "Config.monthlyState", "Config.intlDailyDate",
        "Config.searchGuard",
    ];

    const clearKeys = (keys) => {
        const cleared = keys.filter(k => GM_getValue(k, null) !== null);
        /* 用 delete 而不是写 null：写 null 会让「键存在但值为空」，
           GM_getValue 的默认值只在键不存在时才生效。 */
        keys.forEach(k => {
            try { GM_deleteValue(k); } catch (_) { try { GM_setValue(k, undefined); } catch (_) {} }
        });
        return cleared;
    };

    const resetMemoryState = () => {
        try {
            TaskManager.init();
            TaskManager.running = false;
            TaskManager.runningSince = 0;
            TaskManager.abortRound = false;
            TaskManager.lastRunStarted = false;
            TaskManager.stopHeartbeat();
        } catch (_) {}
        try {
            RewardsAuto.state.restrictedTimes = 0;
            RewardsAuto.state.lastSearchProgress = -1;
            RewardsAuto.state.sendMSG = "";
            RewardsAuto.state.pcProgress = 0;
        } catch (_) {}
        try { Sched.clearClaim(); } catch (_) {}
    };

    /* 只清运行痕迹：运行时段结束时自动调用，不动今日进度 */
    const clearRuntimeCaches = (reason) => {
        const cleared = clearKeys(RUNTIME_KEYS);
        resetMemoryState();
        if (cleared.length > 0) {
            Utils.log("🧹", `${reason || "运行结束"}：已清理 ${cleared.length} 项运行缓存（今日进度保留）`);
        }
        return cleared;
    };

    /* 连今日进度一起清：只在搜索冷却到期的自动恢复里用 */
    const doSoftReset = () => {
        const cleared = clearKeys(RUNTIME_KEYS).concat(clearKeys(DAILY_KEYS));
        resetMemoryState();
        Utils.log("🧹", `重置完成：清理 ${cleared.length} 项运行状态与今日进度`);
        return { cleared };
    };

    GM_registerMenuCommand("🔔 配置通知接口", async () => {
        const configNames = [
            { key: "Notice.wework", name: "企业微信 Webhook", hint: "群机器人webhook key" },
            { key: "Notice.dingding", name: "钉钉机器人 Access Token", hint: "不加签，关键词需包含 #" },
            { key: "Notice.feishu", name: "飞书机器人 Webhook", hint: "不加签，关键词需包含 #" },
            { key: "Notice.pushme", name: "PushMe Key", hint: "push.i-i.me 推送key" },
            { key: "Notice.bark", name: "Bark Key", hint: "bark.day.app 推送key" }
        ];
        let configStr = "🔔 通知接口配置\n==================\n\n";
        configNames.forEach((item, index) => {
            const saved = GM_getValue(item.key, "");
            configStr += `${index + 1}. ${item.name}\n   状态: ${saved ? "✅ 已配置" : "❌ 未配置"}\n   说明: ${item.hint}\n\n`;
        });
        configStr += "请输入要配置的编号 (1-5)，或输入 0 清除所有配置：";
        const choice = await Utils.uiPrompt(configStr);
        if (!choice) return;
        const num = parseInt(choice);
        if (num === 0) {
            if (Utils.uiConfirm("确定要清除所有通知接口配置吗？")) {
                configNames.forEach(item => GM_setValue(item.key, ""));
                Utils.uiAlert("所有通知接口配置已清除！");
            }
            return;
        }
        if (num >= 1 && num <= 5) {
            const selected = configNames[num - 1];
            const current = GM_getValue(selected.key, "");
            const newValue = await Utils.uiPrompt(`配置 ${selected.name}\n\n当前值: ${current || "(空)"}\n\n请输入新的值：`, current);
            if (newValue !== null) {
                GM_setValue(selected.key, newValue.trim());
                Utils.uiAlert(`${selected.name} 已${newValue.trim() ? "配置" : "清除"}！`);
            }
        } else {
            Utils.uiAlert("无效的编号！");
        }
    });

    GM_registerMenuCommand("📢 测试通知", () => {
        /* 手动测试不看节流，直接走 deliver，确保能验证通道通不通 */
        Utils.log("📢", "测试通知已发送");
        Utils.deliver("🧪", "这是一条测试消息\n如果你收到这条消息，说明通知接口配置成功");
        Utils.uiAlert("测试消息已发送，请检查各通知渠道！");
    });

    const updateBroMenu = () => {
        const enabled = GM_getValue("Notice.bro", true);
        return enabled ? "🔕 关闭浏览器通知" : "🔔 开启浏览器通知";
    };
    GM_registerMenuCommand(updateBroMenu(), () => {
        const current = GM_getValue("Notice.bro", true);
        GM_setValue("Notice.bro", !current);
        Utils.uiAlert(`浏览器通知已${!current ? "开启" : "关闭"}`);
        try { if (Utils.hasDOM()) location.reload(); } catch (_) {}
    });

    GM_registerMenuCommand("📋 查看通知状态", () => {
        const wework = GM_getValue("Notice.wework", "");
        const dingding = GM_getValue("Notice.dingding", "");
        const feishu = GM_getValue("Notice.feishu", "");
        const pushme = GM_getValue("Notice.pushme", "");
        const bark = GM_getValue("Notice.bark", "");
        let status = "📊 通知接口配置状态：\n\n";
        status += `企业微信: ${wework ? "✅ 已配置" : "❌ 未配置"}\n`;
        status += `钉钉: ${dingding ? "✅ 已配置" : "❌ 未配置"}\n`;
        status += `飞书: ${feishu ? "✅ 已配置" : "❌ 未配置"}\n`;
        status += `PushMe: ${pushme ? "✅ 已配置" : "❌ 未配置"}\n`;
        status += `Bark: ${bark ? "✅ 已配置" : "❌ 未配置"}\n`;
        status += "\n📌 推送策略（平时静默）：\n";
        status += "· 完成：当天全部达标只推 1 条（20 小时内不重复）\n";
        status += `· 异常：需人工介入才推，同类 ${NOTICE.ANOMALY_TTL / 3600000} 小时内只推 1 次\n`;
        status += `· 限流：每小时最多 ${NOTICE.ANOMALY_PER_HOUR} 条异常推送，超出只写日志\n`;
        status += "· 过程状态（进度/下一轮继续/接口 401 等）只写日志\n";
        Utils.uiAlert(status);
    });

    const diagRegion = async () => {
        const v = await RegionGuard.check({ fresh: true });
        let text = "🌍 网络出口检测\n\n";
        if (v.skipped) {
            text += "「锁定国区」已关闭：不做出口限制，也不拦代理。\n\n";
        } else {
            text += `结论：${v.ok ? "✅ 出口在大陆，可以继续" : "⛔ 已拦截，任务不会上报"}\n`;
            if (v.reasons.length) text += `原因：${v.reasons.join("；")}\n`;
        }
        text += `出口 IP：${v.ip || "未知"}\n`;
        if (v.ipInfo) text += `${v.ipInfo}\n`;
        const msSignals = v.signals.filter(s => /^bing=/.test(s));
        const otherSignals = v.signals.filter(s => !/^bing=/.test(s));
        text += `\n各路信号：\n`;
        text += `  微软侧（bing.com）：${msSignals.length ? msSignals.join(" ") : "（无）"}\n`;
        text += `  第三方/国内视角：${otherSignals.length ? otherSignals.join(" ") : "（无）"}\n`;
        if (v.failed && v.failed.length) text += `\n探测失败：\n${v.failed.map(s => `  ${s}`).join("\n")}\n`;
        text += "\n探测源：bing.com（不带 Cookie）/ cloudflare / ipinfo.io / api.ip.sb / 腾讯 IP 库\n";
        text += `结论缓存：通过 ${RegionGuard.TTL_OK / 1000} 秒、拦截 ${RegionGuard.TTL_BLOCK / 1000} 秒\n`;
        text += `「锁定国区」：${RegionGuard.enabled() ? "开启（非大陆出口、机房/代理 IP、WARP 都会停）" : "关闭"}`;
        if (!v.skipped && v.ok) {
            text += "\n\n规则模式提示：只有「微软侧」才是风控依据。bing.com 判定为 CN 就代表微软把你看成大陆；"
                + "若第三方也全 CN，说明梯子的规则没接管微软域名 —— 这正是最安全的用法。"
                + "想确认业务域名有没有漏走代理，去客户端「连接/日志」里搜 "
                + "rewards.bing.com、prod.rewardsplatform.microsoft.com、login.live.com，应显示 DIRECT。";
        }
        return text;
    };

    /* ══ 定时（cron）模式：每分钟敲门 + 每日随机排程 ══
       @crontab 设为每分钟「敲门」一次（9-23 点 = 9:00~23:59 每分钟），但敲门 ≠ 开跑。
       为什么恰好是 9-23：zy.py 的 RUN_WINDOW 默认 09:00-15:00（开机最早 9 点），
       收工又硬顶在 23:59，所以 9~23 这一段已经完整覆盖计划能落到的范围。
       ⚠ 不要把这里再放宽成 `* * * * *`：凌晨的唤醒一个都跑不到任务，只会让脚本猫
       引擎的空转退避（本环境实测会退避到 20 分钟一次）积累得更狠，反过来拖累白天
       的准点敲门。反过来，如果把 zy.py 的 RUN_WINDOW 改到 9 点之前，这里要跟着放
       （例如 07:00-15:00 → `* 7-23 * * *`），否则开机后前两个小时脚本不会醒。
       真正开跑由当天的随机排程决定：在区间内撒若干个「精确到分钟」的执行点
       （如 14:21 / 16:22），哪一分钟是执行点，那一分钟就叫醒并立即开跑，
       不需要「等下一个 10 分钟刻度」，也不需要先认领再干等。
       为什么必须每分钟敲：crontab 的粒度就是唤醒粒度。10 分钟一次的话，
       16:22 的点只能等 16:30 才被执行，日志上就成了「计划 22 分、30 分才跑」。
       代价是脚本猫每天多出约 500 次「空敲门」（静默退出，不跑任务、不打日志）。
       排程种子 = 日期 + 本账号的随机盐，四账号区间一致、执行点各不相同
       （不会四个账号同一分钟一起打接口）。
       运行时段以 zy.py 计划为准（读不到才用 Config.winTime 兜底，默认 09:00~23:00）。
       浏览器关闭时不会触发。 */
    const CRON_WAKE_MS = 60 * 1000;           // 敲门周期（与 @crontab 每分钟对齐）
    const CRON_PERIOD = 60 * 1000;
    /* 命中窗口：@crontab 每分钟叫醒一次，所以执行点是哪一分钟，那一分钟就会开跑，
       不需要先认领再干等。这里只留一个很短的「提前量」容忍定时器提前几秒触发
       （比如 15:52:58 就醒了，等 2 秒进 15:53 再跑），代价可以忽略。
       ⚠ 必须远小于 @crontab 的敲击周期（60 秒）。曾设成 90 秒，结果每分钟的敲门
       把「下一分钟」的执行点提前 60 秒认领掉（14:09 认领 14:10、14:19 认领 14:20…），
       然后 await delay(60s) 干等整一分钟；等不到整分，下一声敲门就把这个后台上下文
       顶掉/结束，任务从未真正开跑（日志只有「定时器早到 60 秒」+「静默跳过」，
       永远没有「开始本轮任务」），执行点却被标记成已跑，整天一个任务都不做。
       取 5 秒：只容忍几秒的定时器抖动，绝不跨分钟提前认领。 */
    const WAKE_HIT_WINDOW = 5 * 1000;
    /* 过点后多久内仍补跑：某声敲门被系统休眠/脚本停用错过了，
       醒来的第一声敲门把刚错过的那个点补上，避免整天少一轮；超过就作废，不连跑。 */
    const WAKE_LATE_WINDOW = 10 * 60 * 1000;
    /* 开跑抖动上限（秒）：抖动只在「计划那一分钟」内，保证计划时刻 = 实际开跑分钟 */
    const JITTER_IN_MINUTE_SEC = 55;
    /* 开跑前的抖动秒数：默认 5~95 秒随机，用来错开多账号的「起跑那一秒」。
       注意这跟「并行」不冲突：四个账号各自独立浏览器 / profile / CDP，同一分钟命中执行点后
       全部并行开跑，只是等的这几十秒不同，免得 4 个浏览器同一秒打同一批接口被风控。
       实际会被 JITTER_IN_MINUTE_SEC（55 秒）夹住 —— 抖动只在「计划那一分钟」内，
       不会把 14:21 拖到 14:22，计划时刻仍然等于实际开跑分钟。
       把 Config.startJitter 设成 0 = 关闭错峰，四账号同一时刻一起开跑。 */
    const CRON_JITTER_MIN = 5 * 1000;
    const CRON_JITTER_MAX = 95 * 1000;
    const CRON_JITTER_DEFAULT = 95;   // 秒；未配置时的默认上限
    const CRON_FIRST_DELAY = 5 * 1000;
    /* 执行点对齐的网格（分钟）——决定执行点能落在哪些分钟，是「间隔随机性」的关键：
       旧版设 10，执行点只能落在 :00/:10/:20/… 整 10 分钟，相邻间隔因此只能是
       30/40/50… 这种 10 的整数倍，随机空间被锁死（看着有多个点，其实间隔很规整）。
       老注释说「crontab 被退避成 20 分钟、只有整 10 分钟准点」——那是早期环境的观测；
       2026-11-21 17:23 那份日志证明新环境每分钟都准点敲门（17:31/17:32/17:33…
       每分钟都有 exec script complete），引擎已能真正做到每分钟唤醒。
       故改为 1：执行点精确到任意分钟（17:31、18:07…），配合 MIN_GAP 的撒点算法，
       间隔变成各种非规整值（下限 MIN_GAP，区间够长时随机分桶会把间隔拉开），
       四账号各用各的盐 → 排程天然不同。
       命中逻辑按分钟判定（hitWakePoint 的 curMin），与网格无关，改这里不影响命中。 */
    const SCHED_GRID = 1;

    /* 随机排程参数：区间固定 9-18（上午 9-13 / 下午 13-18 / 全天 9-18），
       与 Config.winTime 无关，确保 18 点后不再安排任何执行点。 */
    const RANDOM_WAKE = {
        morning:   { lo: 9 * 60,  hi: 13 * 60, name: "上午" },
        afternoon: { lo: 13 * 60, hi: 18 * 60, name: "下午" },
        full:      { lo: 9 * 60,  hi: 18 * 60, name: "全天" },
        /* 2026-11-21：轮数加密 + 单轮摊薄。
           原因：MV3 后台长 await（阅读 45~75s、搜索 72~264s）期间 setInterval 心跳会被冻结，
           一轮跑到一半被下一声敲门判「上下文已死」，补跑额度一天只有 2 次，
           用完就丢配额（long 22:41 那轮就是最后一个执行点被打断，没有下一轮可补）。
           冻结本身改不了，改为摊薄风险：轮数翻倍 → 每轮分到的搜索/阅读次数减半 →
           单轮里的长等待更短 → 撞上冻结窗口的概率降低；即便某轮被打断，
           丢的也只是这一轮的一两次，后面还有十几轮能补回来。
           pickShare 按剩余轮数摊派，轮数一多每轮份额自动变少，无需改分配代码。
           ⚠ v0.79 起 spread 已关（节点内满功率跑），这段「摊薄」逻辑只剩历史意义。 */

        /* ══ 2026-11-22（v0.79）：撒点改成跟着「一轮」走 ══
           节点式执行后，一轮不再是 20 分钟，而是最长 60 分钟：
             3 个 20 分钟节点 + 2 次 1~3 分钟节点间隔 + 1~3 分钟收尾汇总
           旧参数（间隔 15 分钟、点 10~20 个）是「一点跑一轮 20 分钟」时代的产物。
           按旧参数撒点，命中一个点后接下来 3~4 个点都会在节点循环里被让路
           （日志刷「上一轮还在执行中…本分钟静默让路」），看起来像「排了 15 个点只跑 4 轮」，
           实际覆盖时长没变，但排程信息全是噪音，也失去了「点到就开工」的意义。
           现在：间隔 ≈ 一轮长度 + 收尾余量（70 分钟），点数由区间长度和间隔自动算
           （9:00~18:00 约 7~8 个，13:00 才开机约 4~5 个），点与点基本首尾相接。
           想做更多就调节点间隔（Config.nodeGapMin/Max），加执行点没用。 */
        MIN_POINTS: 3,
        MAX_POINTS: 9,
        MIN_GAP: 70,     // 相邻执行点最小间隔（分钟）= 一轮 60 分钟 + 收尾余量

        /* 区间末尾留的余量：EDGE_PAD 防贴边，ROUND_TAIL 给最后一个执行点留出
           一整个 20 分钟的搜索预算。以前只留 10 分钟，末点落在 17:50，
           18:00 一关浏览器，最后一轮没做完的搜索就直接跨天丢了。 */
        EDGE_PAD: 10,
        ROUND_TAIL: 20
        /* SCHED_GRID=1（见上）：执行点精确到分钟（14:21 就是 14:21），
           靠「每分钟敲门、到点即跑」对齐 @crontab 的节拍；间隔长短由
           MIN_GAP + 随机分桶决定，落在 70 分钟以上的连续随机值，不再是固定刻度。 */
    };

    /* ══ 与 zy.py 的计划联动（第二层随机）══
       zy.py 负责「几点把浏览器起来」：朱雀面板每天 9:00 只拉起它一次（Cron `0 0 9 * * *`），
       它在 RUN_WINDOW（默认 09:00-15:00）内随机挑一个开机时刻，到点才真正启动浏览器，
       然后由 zy.py 自己挂一个只读接口把计划吐出来 —— 默认 47831（RUN_PLAN_PORTS 可配），
       与 GUI 的 noVNC 端口 8080 隔离，两边互不抢端口。该接口同时吐 zy-run-plan.json
       和 zy-ports.json。为兼容旧版本，仍保留 8080/8081/8082 作为兜底。
       本脚本读到计划后，执行点改撒在「开机时刻+PLAN_HEAD_PAD ~ 收工时刻-EDGE_PAD」之间，
       于是：zy.py 决定开机，脚本猫在这段区间里再随机决定真正开工的时刻。
       读不到（zy.py 接口未起 / 文件未生成）时，自动回退到上面的唤醒分布。 */
    const PLAN_DEFAULT_URLS = [
        "http://127.0.0.1:47831/zy-run-plan.json",
        "http://127.0.0.1:47832/zy-run-plan.json",
        "http://127.0.0.1:47833/zy-run-plan.json",
        "http://127.0.0.1:8080/zy-run-plan.json",
        "http://127.0.0.1:8081/zy-run-plan.json",
        "http://127.0.0.1:8082/zy-run-plan.json"
    ];
    const PLAN_DEFAULT_URL = PLAN_DEFAULT_URLS[0];
    const PLAN_CACHE_KEY = "Config.runPlan";
    /* 开机后再等几分钟才允许第一个执行点：浏览器要建 profile、装脚本猫、注入脚本。
       默认 5 分钟；想「开机那一分钟就开跑」可把 Config.planHeadPad 设成 0（不建议，
       浏览器刚起来脚本猫可能还没注入完）。 */
    const PLAN_HEAD_PAD = (() => {
        const v = GM_getValue("Config.planHeadPad", null);
        const n = Number(v);
        return (v === null || v === undefined || v === "" || !Number.isFinite(n) || n < 0) ? 5 : Math.min(30, n);
    })();
    /* 计划的有效期：只认「今天」的计划，昨天的文件一律忽略
       （每天开机时刻都不同，沿用旧值会把执行点撒到已经过去的时刻上） */
    const PLAN_MAX_AGE_MS = 20 * 60 * 60 * 1000;
    /* 计划执行点的上界：18:00。用户要求（2026-11-22）——计划不排 18 点后；
       过了 18 点就直接按默认一轮接一轮做，做到今天做完为止（见 todayPlan 的 continuous 分支）。 */
    const PLAN_CUTOFF_MIN = 18 * 60;
    /* 18 点后的节拍：两轮之间至少空这么久（从上一轮结束算）。
       用户要求（2026-11-22，对照本地 yh.js）：yh.js 的 @crontab 是每 20 分钟一次，
       天然每 20 分钟一轮、一轮 1~2 分钟；本脚本是每分钟敲门，18 点后又「每次敲门都放行」，
       结果变成每 2 分钟一轮、轮轮把签入/面板/桌面/月度/连签/每日活动/国际版/领奖/二次扫描/Edge
       全重打一遍 —— 22:06~22:14 那份日志里四个账号各刷了 4~5 轮，全是空转。
       现在按 20 分钟节拍走：上一轮结束满 20 分钟才允许下一轮。 */
    const AFTER18_IDLE_MS = 20 * 60 * 1000;
    /* 上一轮结束时刻（落盘）。18 点后的节拍、诊断面板都读它。 */
    const ROUND_END_KEY = "Config.lastRoundEndAt";
    /* 拉计划失败后的重试间隔。浏览器刚起来的那一次敲门，8080 可能刚好没响应、
       或计划文件正在写 —— 不能因为这一次失败就一整天回退到唤醒分布。
       敲门周期本身就是 10 分钟，所以这里取 3 分钟不会造成额外请求压力。 */
    const PLAN_RETRY_MS = 3 * 60 * 1000;
    /* 上一次「尝试拉计划」的时刻：必须落盘。放内存变量等于没有 —— 脚本猫的后台执行
       上下文每次敲门都是新建的（日志里每次都是先 exec script complete 再来一轮），
       内存状态一律清零，节流也就永远不生效。 */
    const PLAN_TRY_KEY = "Config.planTryAt";
    /* 「迟到补救」记录：浏览器比区间起点晚很久才起来时，把起点抬到当时并落盘。
       必须落盘而不是每次按 now 重算 —— 否则每次敲门算出的区间都不同（rangeKey 变），
       当天已跑过的执行点进度会被反复重置。 */
    const LATE_START_KEY = "Config.lateStart";
    /* 确定性伪随机（mulberry32）：同一个种子 → 同一串数。
       种子 = 日期 XOR 本账号的随机盐（Config.schedSalt）。
       **不能只按日期取种**：四个账号各跑在各自己的浏览器里、GM 存储互不相通，
       但种子一样就会算出完全相同的执行点（实测四个账号都是 14:21/14:45/15:09…），
       等于四个账号同一分钟一起打同一批接口 —— 这正是要避免的。
       加盐之后：区间（开机/收工，来自 zy.py）仍然一致，各账号的执行点各不相同，
       同一天内本账号自己依然稳定可复现（不会每次敲门重算就换一批点）。 */
    function seededRnd(seed) {
        let a = seed >>> 0;
        return function () {
            a = (a + 0x6D2B79F5) | 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }
    /* 「脚本没在跑」的判据：每轮唤醒开头都会写 Config.heartbeatAt。
       两次唤醒间隔超过 3 小时，说明中间至少漏了一次（脚本被停用 / 浏览器关过 /
       系统休眠），这时清运行痕迹，从头开始。跨夜 14 小时同理。 */
    const RESUME_GAP = 180 * 60 * 1000;
    /* ⚠ 以前这里有个 WAKE_OFFGRID_SEC（按秒数判断「是不是 cron 叫醒的」）。
       已删除：本环境里 crontab 会漂到 :42 秒，按秒数判会把正常的 20 分钟敲门
       当成「脚本刚启用」，进而清掉正在跑那一轮的锁。改由 wakeIsOffGrid()
       用「距上次敲门间隔」判断（<3 秒才算停用后立刻启用）。 */
    /* 「上次敲门刚过去多少秒」。heartbeatAt 在每次敲门开头无条件写一次，
       所以正常情况下它的间隔 ≈ @crontab 周期（60 秒）。间隔明显小于周期，
       只可能是「脚本被停用后又启用」时立刻执行了一次。
       ⚠ 这个判据只能用 heartbeatAt，绝不能用 lastRun()：lastRun 是一轮「结束」的时刻，
       一轮跑完的下一声敲门会离它只有几秒，于是每轮都被误判成「脚本刚被重新启用」、
       白清一次缓存（日志里那行 ♻️ 新会话 已清理 11 项 就是这么来的）。 */
    const FRESH_STAMP_MS = 30 * 1000;
    /* 判定「上一轮的执行上下文已经死了」的**粗筛**阈值：它每 20 秒刷一次 aliveAt。
       ⚠ 90 秒太紧了。MV3 后台上下文会被 Chrome 冻结，冻结期间 setInterval 跟着停，
       于是「活着但静默 2 分钟」和「真被回收」长得一模一样。实跑日志（2026-11-22 18:20）
       里 long 开跑后 18:23 就被判「上下文被销毁」，可它 18:24:39 还在打日志 —— 纯误判，
       代价是清锁清缓存 + 白扔一次补跑额度，还会让新旧两轮抢同一把锁。
       粗筛放宽到 4 分钟；粗筛命中后还会实测两个心跳周期（runAlive 涨 = 还活着）。 */
    const RUN_HEARTBEAT_STALE = 4 * 60 * 1000;
    const CRON_STALL = 3 * 60 * 1000;
    /* 「跑到一半被打断」的补跑上限：上下文被 CDP 导航顶掉 / 标签页回收时，
       那一轮剩下的任务（活动卡片、连签、阅读、搜索）全部停住，而 tasks 的日期标记
       只在成功后写 —— 不补跑就等于整天少 1/9 的工作量。
       每次打断当场补一次，但每天最多这么多次，避免上下文反复崩时变成死循环。
       从 2 提到 4：4 个账号一轮跑 2~5 分钟，误判 + 真空闲各来一次就用光了，
       而补跑本身不占执行点，放宽的代价只是多跑几轮。 */
    const RECOVER_MAX_PER_DAY = 4;
    /* 收官补跑：最后一波（没有下一个执行点了）跑完仍有任务没完成时，
       连续补跑几轮把欠的（多是阅读/搜索配额）在关浏览器前做完。
       与 RECOVER_MAX_PER_DAY 分开计数：那是「上下文被打断」的被动补救，
       这是「任务确实没做完」的主动加跑，两者互不挤占额度。
       写完 GM 标记后由下一声敲门识别并连跑，做完即撤销，避免无限跑。 */
    const FINALE_CATCHUP_MAX = 3;
    /* 「心跳」判据：真正在跑的上下文每 20 秒刷一次 aliveAt。
       超过 RUN_STALE 两个时间都没动，就判定它已经死了。
       以前只按「开始时间」算且窗口是 40 分钟，于是一轮卡住后
       每次触发都只打印「上一轮任务还在执行中」，看起来就是永久卡进程。 */
    const RUN_STALE = 5 * 60 * 1000;
    /* 孤儿轮次的宽限期：浏览器重启回来时，上一个上下文的 aliveAt 可能只过去几秒，
       等 3 个心跳周期还不刷新，就说明那是残留而不是真的在跑。 */
    const ORPHAN_GRACE = 45 * 1000;
    /* 运行锁租期：心跳每 20 秒续期一次，正常跑永不过期；
       中断后最多这么久就会被下一个上下文抢走，不再永久占位。 */
    const RUN_LOCK_TTL = 6 * 60 * 1000;
    const RUN_HEARTBEAT_GAP = 20 * 1000;
    /* 「活着但不动」判据：15 分钟没进展就强制收尾
       （单张卡最长约 8 分钟，不会误伤正常长任务）。 */
    const ROUND_STALL = 15 * 60 * 1000;
    /* 单轮硬上限：预算 20 分钟 + 收尾阶段（连签/领奖/Edge），
       留 20 分钟余量，到点无论卡在哪都由心跳强制收尾。 */
    const ROUND_HARD_LIMIT = ROUND_BUDGET_MS + 20 * 60 * 1000;

    /* ══ 每日运行窗口 ══
       默认 auto：直接采用 zy.py 计划里的「开机 ~ 收工」，窗口外只保留定时唤醒、
       不开新的一轮；计划读不到时退回出厂 09:00~23:00（脚本单独跑也不会半夜乱开）。
       开始时刻不做随机推后（同一天恒等，计划才不漂移）。 */
    const WINDOW = {
        TIME_DEFAULT: "09:00-23:00",
        START_DEFAULT: 9,     // 仅用于兼容旧版 Config.winStart
        END_DEFAULT: 23,      // 仅用于兼容旧版 Config.winEnd
    };

    const Sched = {
        timer: null,
        started: false,
        startedAt: 0,
        /* 定时模式没有心跳日志节流了，字段保留以兼容旧诊断代码 */
        lastHbLog: 0,
        task: null,

        fmt(ts) {
            if (!ts) return "未知";
            const d = new Date(ts);
            const p = n => String(n).padStart(2, "0");
            return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
        },

        lastRun() { return Number(GM_getValue("Config.cronLastRun", 0)) || 0; },

        plan(now = Date.now()) {
            const next = Number(GM_getValue("Config.cronNextRun", 0)) || 0;
            let ts;
            if (next) ts = next;
            else {
                const last = this.lastRun();
                ts = last ? last + CRON_PERIOD : now + CRON_FIRST_DELAY;
            }
            /* plan() 只读不写：返回 finish() 写下的「参考排期」，仅供诊断面板对照。
               真正的唤醒时刻由 @crontab 决定，用 nextWakeAt() 算。 */
            return this.alignToWindow(ts);
        },

        /* ── 每日运行窗口 ── */
        midnightOf(ts) {
            const d = new Date(ts);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
        },

        /* 解析 "开始-结束" 时段，宽容全角/连接符/省略分钟；解析不了返回 null。
           24:00 表示当天末尾。 */
        parseWinTime(raw) {
            const s = String(raw == null ? "" : raw)
                .replace(/[：]/g, ":")            // 全角冒号
                .replace(/[—–－~～至到]/g, "-")   // 各种连接符
                .replace(/\s+/g, "");
            if (!s) return null;
            const m = s.match(/^(\d{1,2})(?::(\d{1,2}))?-(\d{1,2})(?::(\d{1,2}))?$/);
            if (!m) return null;
            const sh = Number(m[1]), sm = m[2] == null ? 0 : Number(m[2]);
            const eh = Number(m[3]), em = m[4] == null ? 0 : Number(m[4]);
            if (![sh, sm, eh, em].every(Number.isFinite)) return null;
            if (sm > 59 || em > 59) return null;
            if (sh > 24 || eh > 24) return null;
            if (sh === 24 && sm > 0) return null;   // 24:30 不存在
            if (eh === 24 && em > 0) return null;
            /* 24:00 作为开始等于次日 0 点，统一按 0 点处理 */
            const startMin = sh === 24 ? 0 : sh * 60 + sm;
            return { startMin, endMin: eh * 60 + em };
        },

        /* 分钟数 → "HH:MM"，用于日志和诊断面板 */
        fmtHM(min) {
            const m = Math.max(0, Math.round(Number(min) || 0));
            return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
        },

        /* 旧版的 Config.winStart / winEnd（只有小时）是否还在用：
           只有当用户此前改动过它们（不等于出厂 9/23）时才算数，
           否则按新配置的默认值走，避免老默认值盖掉新设置的 winTime。 */
        legacyWin() {
            const s = GM_getValue("Config.winStart", null);
            const e = GM_getValue("Config.winEnd", null);
            if (s == null && e == null) return null;
            const sH = Number(s), eH = Number(e);
            if (!Number.isFinite(sH) || !Number.isFinite(eH)) return null;
            if (sH === WINDOW.START_DEFAULT && eH === WINDOW.END_DEFAULT) return null;
            return {
                startMin: Math.min(23, Math.max(0, Math.round(sH))) * 60,
                endMin: Math.min(24, Math.max(0, Math.round(eH))) * 60
            };
        },

        /* zy.py 计划里的「开机 ~ 收工」区间（分钟），只认今天的计划。
           用 planRaw（不卡「区间够不够撒点」）：短计划（23:27~23:59）也要能当运行时段。 */
        planWin() {
            const r = this.planRaw();
            return r ? { startMin: r.startMin, endMin: r.untilMin } : null;
        },

        winCfg() {
            /* 运行时段只有一条规则：**有今天的计划就照计划，没有才用配置兜底**。
               zy.py 管着浏览器生命周期（几点拉起、任务全做完才关进程），脚本再按
               出厂 09:00-23:00 自己关一次门就是第二道闸门。线上 23:12 那次就是这么
               白跑的：zy.py 把收工顺延到 23:59、浏览器开着，脚本却判定「不在
               09:00~23:00」，一个任务没做、空转到 23:59 被关进程。
               优先级（从高到低）：
                 ① 配置里显式写成全天（开始=结束，或 00:00-24:00）→ 全天不限。
                    这是「不管计划、现在就放开跑」的逃生口，专供手动排查；
                 ② 今天的计划在（date 对得上）→ 时段 = 计划的开机 ~ 收工，精确跟随，
                    配置项**不参与**（所以面板里那一项可以整项留空）；
                 ③ 计划读不到（没有 zy.py / 文件过期 / 不是今天）→ 用配置兜底，
                    留空按 09:00-23:00，保证脚本脱离 zy.py 单独跑也不会半夜乱开。 */
            const raw = GM_getValue("Config.winTime", null);
            const rs = String(raw == null ? "" : raw).trim().toLowerCase();
            const autoMode = rs === "" || rs === "auto" || rs === "plan" || rs === "跟随计划";
            let parsed = this.parseWinTime(raw);
            if (!parsed) parsed = this.legacyWin();
            const rawFull = !!parsed && ((parsed.endMin - parsed.startMin + 1440) % 1440 === 0);
            if (rawFull) {
                return { startMin: parsed.startMin, endMin: parsed.endMin,
                         allDay: true, planUsed: false, auto: autoMode };
            }
            const pw = this.planWin();
            if (pw && pw.endMin !== pw.startMin) {
                return { startMin: pw.startMin, endMin: pw.endMin,
                         allDay: false, planUsed: true, auto: true };
            }
            if (!parsed) parsed = this.parseWinTime(WINDOW.TIME_DEFAULT);
            if (!parsed) parsed = { startMin: 9 * 60, endMin: 23 * 60 };
            return { startMin: parsed.startMin, endMin: parsed.endMin,
                     allDay: false, planUsed: false, auto: autoMode };
        },

        /* 时段的人话描述（日志/诊断面板统一用它，避免五处各拼一遍） */
        winSpan() {
            const c = this.winCfg();
            if (c.allDay) return "全天不限";
            const base = `${this.fmtHM(c.startMin)}~${this.fmtHM(c.endMin)}`;
            return c.planUsed ? `${base}（zy.py 计划）` : `${base}（兜底：未读到 zy.py 计划）`;
        },

        /* 某个「日历日」的运行窗口 [start, end)，精确到分钟。
           返回 null 表示不限时段。end <= start 时按跨零点处理（如 22:30~次日 6:00）。 */
        windowOfDay(dayTs) {
            const cfg = this.winCfg();
            if (cfg.allDay) return null;
            const midnight = this.midnightOf(dayTs);
            const lenMin = cfg.endMin > cfg.startMin
                ? cfg.endMin - cfg.startMin
                : cfg.endMin + 1440 - cfg.startMin;
            if (lenMin <= 0) return null;
            return { start: midnight + cfg.startMin * 60000, end: midnight + cfg.startMin * 60000 + lenMin * 60000 };
        },

        inWindow(ts) {
            const t = Number(ts) || Date.now();
            if (this.winCfg().allDay) return true;
            /* 看昨天/今天/明天三个窗口，跨零点的时段也能正确判断 */
            for (const d of [-1, 0, 1]) {
                const w = this.windowOfDay(t + d * 86400000);
                if (w && t >= w.start && t < w.end) return true;
            }
            return false;
        },

        /* 把时刻对齐进运行窗口：窗口内原样返回，窗口外推到下一段窗口的起点 */
        alignToWindow(ts) {
            const t = Number(ts) || Date.now();
            if (this.winCfg().allDay) return t;
            if (this.inWindow(t)) return t;
            for (let d = 0; d <= 2; d++) {
                const w = this.windowOfDay(t + d * 86400000);
                if (w && w.start > t) return w.start;
            }
            return t;
        },


        saveNext(ts) { GM_setValue("Config.cronNextRun", ts); },

        /* ══ 每日随机排程（区间一致，执行点各账号独立）══
           区间来自 zy.py 的计划（开机 / 收工），四个账号相同 —— 这是必须一致的。
           执行点则由「日期 + 本账号随机盐」确定性算出：同一账号当天稳定不变，
           不同账号互不相同，避免四个账号同一分钟一起打同一批接口。
           GM 里只存本账号自己的 used（哪些点已跑过），按日期存、跨天自动重置。
           存储结构：{ v, date, mode, name, points:[分钟...], used:[bool...] } */
        PLAN_KEY() { return "Config.randomPlan"; },
        /* v8：执行点不再吸附 10 分钟网格，改为「精确到分钟 + 提前认领等整分钟」；
           v10：轮数加密（点数 5~10 → 10~20、MIN_GAP 30 → 15），旧排程必须重建
           v11：节点式执行配套（点数 3~9、MIN_GAP 15 → 70），旧排程必须重建 */
        PLAN_VER: 11,

        /* ── zy.py 计划文件 ──────────────────────────────────────────
           计划内容（zy.py 写出）：
             { date:"2026-11-19", window:"09:00-15:00",
               startAt:"2026-11-19T11:23:00", runUntil:"2026-11-19T18:00:00",
               runSeconds:23820, ts:1763... }
           startAt  = 浏览器开机时刻（zy.py 在 RUN_WINDOW 内随机挑的）
           runUntil = 收工时刻（zy.py 到点会关浏览器）
           本脚本只关心这两个时刻，把执行点撒在它们之间。 */

        /* 本账号的排程盐：首次运行随机生成、落盘长期固定。
           用途只有一个 —— 让四个账号的执行点互不相同（见 seededRnd 注释）。
           各账号的 GM 存储本来就隔离，所以各自生成的盐也不同。
           老用户第一次升级到本版时自动生成，之后不再变动（当天已缓存的计划
           会因 PLAN_VER 变化重建一次）。 */
        salt() {
            let s = Number(GM_getValue("Config.schedSalt", 0)) || 0;
            if (!s) {
                s = Math.floor(Math.random() * 0x7FFFFFFF) + 1;
                try { GM_setValue("Config.schedSalt", s); } catch (_) {}
            }
            return s >>> 0;
        },

        /* "2026-11-19T11:23:00" / "11:23" → 当天的分钟数；解析不了返回 -1。
           手工解析，不走 new Date(str)：后者对无时区串的解释依赖浏览器实现。 */
        parsePlanMin(s) {
            const str = String(s || "");
            const m = str.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*$/);
            if (!m) return -1;
            const h = Number(m[1]), mi = Number(m[2]);
            if (!(h >= 0 && h <= 24) || !(mi >= 0 && mi < 60)) return -1;
            return Math.min(24 * 60, h * 60 + mi);
        },
        /* 计划里的日期串 → 今天的 YYYYMMDD 数字；只认当天 */
        planDateNum(s) {
            const str = String(s || "");
            const m = str.match(/(\d{4})-(\d{2})-(\d{2})/);
            if (m) return Number(`${m[1]}${m[2]}${m[3]}`);
            const iso = str.match(/^(\d{4})(\d{2})(\d{2})$/);
            if (iso) return Number(str);
            return 0;
        },

        /* 本账号缓存里「今天」的计划（同步读，供 todayPlan / 诊断面板用）。
           返回 { lo, hi, name, startAt, runUntil } 或 null。 */
        planRange(now = Date.now()) {
            let c = null;
            try { c = GM_getValue(PLAN_CACHE_KEY, null); } catch (_) { return null; }
            if (!c || typeof c !== "object") return null;
            if (c.date !== Utils.getTodayNum()) return null;
            const lo = Number(c.lo), hi = Number(c.hi);
            if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < RANDOM_WAKE.MIN_GAP) return null;
            return {
                lo, hi,
                name: String(c.name || "计划"),
                startMin: Number(c.startMin),
                untilMin: Number(c.untilMin),
                startAt: String(c.startAt || ""),
                runUntil: String(c.runUntil || ""),
                crossDay: !!c.crossDay,
                boot: Number(c.boot) || 0
            };
        },

        /* 原始计划缓存：只校验「是不是今天的」，**不校验区间宽度**。
           为什么需要它：planRange() 有一条 `hi - lo < MIN_GAP(70 分钟)` 的校验
           （那是给「撒执行点」用的，区间太窄确实撒不出点）。但像 zy.py 23:27 启动、
           收工 23:59 这种只有 32 分钟的计划，收工时刻**照样有效** ——
           只想要 untilMin 的地方（节点循环夹紧、收官补跑判断、运行时段 auto）
           不能因为「不够撒点」就把收工线也丢了，否则 23:30 开一轮 60 分钟
           会被 zy.py 23:59 关浏览器腰斩。 */
        planRaw() {
            try {
                const c = GM_getValue(PLAN_CACHE_KEY, null);
                if (!c || typeof c !== "object") return null;
                if (Number(c.date) !== Utils.getTodayNum()) return null;
                const startMin = Number(c.startMin), untilMin = Number(c.untilMin);
                if (!Number.isFinite(startMin) || !Number.isFinite(untilMin)) return null;
                if (startMin < 0 || untilMin <= 0) return null;
                return { startMin, untilMin, crossDay: !!c.crossDay };
            } catch (_) {
                return null;
            }
        },

        /* 拉一次计划文件并落缓存。execPlan 关掉时不拉。
           成功返回 planRange()；失败返回 null（调用方回退到唤醒分布）。 */
        async fetchRunPlan() {
            this._planErr = "";
            if (!GM_getValue("Config.execPlan", true)) {
                this._planErr = "Config.execPlan 已关闭";
                return null;
            }
            /* 自定义地址优先；没配就按 47831/32/33（zy.py 独立接口）→ 8080/81/82
               （旧版 websockify 静态目录兜底）逐个试。zy.py 的 RUN_PLAN_PORTS 可改端口，
               所以必须多端口兜底；47831 是默认，与 GUI 的 8080 不冲突。 */
            let custom = String(GM_getValue("Config.planUrl", "") || "").trim();
            /* 作废 GM 里残留的旧地址：18080/81/82 是换端口前的旧独立接口（已不再监听），
               8080/81/82 是 GUI/noVNC 端口（无头模式根本不提供计划文件）。
               旧代码「只试 custom 一个地址」，这类存量值会堵死新的 47831 独立接口。
               这里主动作废两类旧地址、回退默认列表（47831 优先），无需手动清 GM、无需重装脚本。 */
            if (custom && /:(1808[0-9]|808[0-9])\//.test(custom)) custom = "";
            const urls = custom ? [custom] : PLAN_DEFAULT_URLS;
            let raw = "", hitUrl = "";
            const errs = [];
            for (const url of urls) {
                try {
                    const res = await Utils.xhrFull({ url, timeout: 5000, cookie: false });
                    raw = String((res && res.text) || "");
                    hitUrl = url;
                    break;
                } catch (e) {
                    /* 把真实原因留下来：HTTP 404 / 连接被拒 / 超时，三种处理方式完全不同 */
                    const port = (String(url).match(/:(\d+)\//) || [])[1] || "?";
                    errs.push(`${port}→${String((e && e.message) || e || "失败").replace(/，用时.*$/, "")}`);
                }
            }
            if (!hitUrl) {
                this._planErr = `所有端口都读不到（${errs.join("；")}）`;
                return null;
            }
            this._planUrl = hitUrl;
            let data = null;
            try { data = JSON.parse(raw); } catch (_) {
                this._planErr = raw
                    ? `内容不是 JSON（开头：${raw.replace(/\s+/g, " ").slice(0, 60)}）`
                    : "响应是空的（8080 可能只是页面服务、没有这个文件）";
                return null;
            }
            if (!data || typeof data !== "object") {
                this._planErr = "响应不是计划对象";
                return null;
            }

            /* 日期必须对得上：昨天的计划会让执行点落到已经过去的时刻上 */
            const pdate = this.planDateNum(data.date);
            if (pdate !== Utils.getTodayNum()) {
                this._planErr = `文件是 ${data.date || "无日期"} 的计划（今天 ${Utils.getTodayNum()}）`;
                if (pdate) {
                    Utils.log("📋", `zy.py 计划是 ${data.date} 的（今天 ${Utils.getTodayNum()}），已忽略`);
                }
                return null;
            }
            const ts = Number(data.ts) || 0;
            if (ts > 0 && Date.now() - ts > PLAN_MAX_AGE_MS) {
                this._planErr = `计划太旧（写入于 ${new Date(ts).toLocaleString()}）`;
                return null;
            }
            /* 计划比本次浏览器启动还早 5 分钟以上 → 上一次会话留下的 leftovers。
               zy.py 正常是「先写计划、几秒后起浏览器」，差值只有几秒，不会被误杀；
               但 47831 若被上一轮的旧实例占着（新进程 bind 失败换到 47832），
               或浏览器重启后没及时重写计划，这里就会读到上一轮的旧开机时刻
               （线上 20:59 那次的 20:09 就是这种形态）。 */
            const origin = Number((typeof performance !== "undefined" && performance.timeOrigin) || 0);
            if (ts > 0 && origin > 0 && ts < origin - 5 * 60 * 1000) {
                this._planErr = `计划写入于 ${new Date(ts).toLocaleTimeString()}，`
                    + `早于本次浏览器启动 ${new Date(origin).toLocaleTimeString()} → 上一次会话的旧计划`;
                return null;
            }

            const startMin = this.parsePlanMin(data.startAt);
            let untilMin = this.parsePlanMin(data.runUntil);
            const untilDay = this.planDateNum(data.runUntil);   // 收工日期（可能是次日）
            if (startMin < 0 || untilMin < 0) {
                this._planErr = `计划字段解析失败（startAt=${data.startAt} runUntil=${data.runUntil}）`;
                return null;
            }
            /* 收工跨天：zy.py「启动偏晚 → 收工顺延一整轮」时，收工常落在次日 00:00
               （线上 20:58 那次就是「收工顺延到 00:00」）。"00:00" 解析成 0 分钟，
               比开机 20:58（1258）还小 → 区间反转 → 旧逻辑判「计划区间太窄
               （20:58~00:00，已过收工？）」把整份计划丢掉，只能沿用上一次会话的
               旧计划（开机 20:09）。后果不只是区间错：读不到计划 = 读不到 hold 标记，
               脚本 21:00:10 照常开跑，zy.py 21:00:22 才开始校准 —— 校准掐断正在跑的
               那一轮的老问题又回来了。
               本脚本只在这一天内撒点，所以「次日收工」一律按今天 23:59 收工处理。 */
            let crossDay = false;
            if (untilMin <= startMin) {
                crossDay = true;
                untilMin = 24 * 60 - 1;
            }

            /* 首点 = 开机后 PLAN_HEAD_PAD 分钟；末点 = 收工前 EDGE_PAD + 一轮搜索预算，
               保证最后一个执行点整轮跑完时还没到收工时刻。18:00 是硬上界：计划不排 18 点后。 */
            let lo = startMin + PLAN_HEAD_PAD;
            let hi = Math.min(untilMin - RANDOM_WAKE.EDGE_PAD - RANDOM_WAKE.ROUND_TAIL,
                              PLAN_CUTOFF_MIN);
            /* 浏览器起得晚 / 收工早：区间不够就退让到「还能塞几个点」的最小可用范围。
               ⚠ 退让后的上界仍要卡在 18:00 —— 否则 17:50 这种「只剩个尾巴」的开机，
               退让会把 hi 顶回收工时刻（23:59），又把执行点排到 18 点以后。 */
            if (hi - lo < RANDOM_WAKE.MIN_GAP) {
                lo = Math.min(startMin, untilMin);
                hi = Math.min(untilMin, PLAN_CUTOFF_MIN);
            }
            /* 18 点后才开机（或此刻已过 18 点）：计划不再撒执行点（18 点后由
               todayPlan 走 continuous，每分钟都可能开跑），但「开机 ~ 收工」这两根线
               必须落盘。以前这里直接 return null 把整份计划丢掉，后果有三个：
                 · winTime=auto 拿不到 startMin/untilMin → 退回 09:00~23:00（或旧计划的
                   09:00~15:00）当时段 → 晚上一律判「不在运行时段」→ 整晚空转；
                 · 节点循环拿不到 untilMin → 23:30 开一轮 60 分钟被 23:59 关浏览器腰斩；
                 · 连 zy.py 的「暂缓开跑」hold 都读不到 → 校准期间照样开跑。
               （线上 23:27 启动、23:30 还只有每分钟一条 exec script complete，就是这个。） */
            const nowMinNow = (() => {
                const d = new Date();
                return d.getHours() * 60 + d.getMinutes();
            })();
            const after18Start = startMin >= PLAN_CUTOFF_MIN || nowMinNow >= PLAN_CUTOFF_MIN;
            let noPoints = false;
            if (hi - lo < 1) {
                if (!after18Start) {
                    this._planErr = `18:00 前已没有可用区间（开机 ${this.fmtHM(startMin)}，`
                        + `收工 ${this.fmtHM(untilMin)}）；计划不排 18 点后`;
                    return null;
                }
                noPoints = true;
                lo = startMin;
                hi = Math.max(startMin, untilMin);
            }

            const name = noPoints ? "计划（18 点后连续）" : "计划";
            const rec = {
                date: Utils.getTodayNum(),
                lo, hi, name,
                startMin, untilMin,
                startAt: String(data.startAt || ""),
                runUntil: String(data.runUntil || ""),
                crossDay,
                /* 记下是哪次浏览器会话读到的：换会话（浏览器重启）后要重新读，
                   因为 zy.py 重启会重新决定开机时刻，旧的区间已经作废。 */
                boot: this.bootId(),
                fetchedAt: Date.now()
            };
            /* zy.py 的「暂缓开跑」标记：它在装扩展 / 校准版本期间置上，做完立刻解除。
               读到就先别开跑 —— 校准（reload 扩展 / 更新脚本）会重建后台上下文，
               此时已经开跑的那一轮会被当场掐断（线上 20:45 long 就是这么丢的）。
               holdUntil 是兜底有效期：zy.py 崩了也不会把脚本永久卡住。 */
            let holdUntil = Number(data.holdUntil) || 0;
            if (holdUntil > 0 && holdUntil < 1e12) holdUntil *= 1000;   // 兼容秒级写法
            try {
                GM_setValue("Config.planHoldUntil", (data.hold && holdUntil > Date.now()) ? holdUntil : 0);
            } catch (_) {}
            GM_setValue(PLAN_CACHE_KEY, rec);
            /* 直接返回 rec，不走 planRange()：planRange 有一条「区间至少 70 分钟」的
               校验（那是给撒点用的），18 点后启动的短计划（23:27~23:59）会被它过滤成
               null，调用方就会以为「没读到计划」。rec 本身字段齐全，够调用方用。 */
            return rec;
        },

        /* runOnce 里调用。拿到一次就锁定（本会话后续不再重复拉）；
           失败**不永久放弃**——按 PLAN_RETRY_MS 限流重试，否则浏览器刚起来那一次
           拉不到（8080 未就绪 / 计划文件正在写）就会一整天用回退分布。 */
        async ensureRunPlan() {
            if (!GM_getValue("Config.execPlan", true)) {
                this._planOff = true;
                return null;
            }
            /* 18 点后不排点，但仍要读一次计划拿 untilMin（收工时刻）：
               zy.py 顺延到 23:59 时，节点循环必须知道几点必须收手，否则 23:30 开一轮
               60 分钟会被关浏览器腰斩。原来这里直接 return，18 点后开机根本读不到收工时刻。
               读不到也不影响开跑（todayPlan 走连续模式）。 */
            const d18 = new Date();
            const nowMin18 = d18.getHours() * 60 + d18.getMinutes();
            if (nowMin18 >= PLAN_CUTOFF_MIN) {
                /* ★ 判断「缓存还新不新」不能只看有没有：早上那次会话读到的计划
                   （如 09:12~15:00）到今天 18 点后依然算「今天的」，可它的收工时刻早过去了。
                   winTime=auto 直接拿这个区间当时段，就会算出 09:00~15:00 →
                   晚上一律判「不在运行时段」→ 整晚空转（线上 23:30 那次：0.82 已经装好，
                   日志里却还是每分钟一条 exec script complete，一条任务都没有）。
                   所以按「收工时刻是否已过」判新鲜度：过了就必须重拉一次。 */
                const raw = this.planRaw();
                const stale = !raw || Number(raw.untilMin) <= nowMin18;
                if (stale) {
                    const triedAt = Number(GM_getValue(PLAN_TRY_KEY, 0)) || 0;
                    if (!(Date.now() - triedAt < PLAN_RETRY_MS)) {
                        try { GM_setValue(PLAN_TRY_KEY, Date.now()); } catch (_) {}
                        try { await this.fetchRunPlan(); } catch (_) {}
                    }
                }
                return this.todayPlan();
            }
            /* 同一次浏览器启动内读到过今天的计划 → 直接复用，不再依赖 47831 是否还活着。
               跨上下文（bootId 不同）时**不能**无条件重拉 —— bootId 是
               performance.timeOrigin，脚本猫每次敲门都新建后台执行上下文，这个值每次
               都会变（线上 20:59:06 与 21:00:00 连刷两条「读不到」就是这么来的：缓存明明
               在，却因为 boot 不等又去拉一遍）。改成每 PLAN_RETRY_MS 允许复核一次开机
               时刻（zy.py 真重启过才需要换区间），复核记录落盘，跨上下文才有效。 */
            const cached = this.planRange();
            const boot = this.bootId();
            const now = Date.now();
            if (cached) {
                if (boot === 0 || cached.boot === boot) return cached;
                const triedAt = Number(GM_getValue(PLAN_TRY_KEY, 0)) || 0;
                if (now - triedAt < PLAN_RETRY_MS) return cached;
                try { GM_setValue(PLAN_TRY_KEY, now); } catch (_) {}
            } else if (this._planTryAt && now - this._planTryAt < PLAN_RETRY_MS) {
                return null;
            }
            this._planTryAt = now;

            const got = await this.fetchRunPlan();
            if (got) {
                Utils.log("📋", `已读取 zy.py 计划（${this._planUrl || PLAN_DEFAULT_URL}）：`
                    + `开机 ${this.fmtHM(got.startMin)} → 收工 ${this.fmtHM(got.untilMin)}`
                    + (got.crossDay ? "（收工在次日，按今日 23:59 收工）" : "")
                    + `，执行点撒在 ${this.fmtHM(got.lo)}~${this.fmtHM(got.hi)}（本账号内随机）`);
                return got;
            }
            /* 拉不到就退回上一次读到的计划（比完全无计划更接近真实开机时刻）。
               必须把失败原因一起打出来：只说「读不到」时根本无从判断是端口没起、
               超时、还是内容不对（20:58 那次就是「收工跨天」被判成「区间太窄」，
               日志里完全看不出来）。这里 10 分钟节流，避免每次敲门刷一条。 */
            if (cached) {
                const lastStale = Number(GM_getValue("Config.planStaleLogAt", 0)) || 0;
                if (now - lastStale >= 10 * 60 * 1000) {
                    try { GM_setValue("Config.planStaleLogAt", now); } catch (_) {}
                    Utils.log("📋", `本次读不到 zy.py 计划（${this._planErr || "原因未知"}），`
                        + `沿用上次读到的计划：开机 ${this.fmtHM(cached.startMin)} → `
                        + `收工 ${this.fmtHM(cached.untilMin)}`
                        + (cached.crossDay ? "（次日）" : "")
                        + `；${Math.round(PLAN_RETRY_MS / 60000)} 分钟后自动重试`);
                }
                return cached;
            }
            /* 完全没有计划：说清楚「今天用的是回退分布」，否则日志里只看到「下午」看不出原因。
               这里节流 30 分钟，避免每分钟敲门就刷一条。 */
            const lastWarn = Number(GM_getValue("Config.planMissLogAt", 0)) || 0;
            if (now - lastWarn >= 30 * 60 * 1000) {
                GM_setValue("Config.planMissLogAt", now);
                let custom = String(GM_getValue("Config.planUrl", "") || "").trim();
                if (custom && /:(1808[0-9]|808[0-9])\//.test(custom)) custom = "";   // 同读取处：旧 18080/8080 地址视为未配置
                const where = custom || PLAN_DEFAULT_URLS.map(u => (u.match(/:(\d+)\//) || [])[1]).join("/");
                const why = this._planErr ? `原因：${this._planErr}` : "原因未知（请求没报错但内容不可用）";
                Utils.log("⚠️", `读不到 zy.py 计划（${where}）→ ${why}；`
                    + `今日执行点先按「唤醒分布」撒点，${Math.round(PLAN_RETRY_MS / 60000)} 分钟后自动重试`);
            }
            return null;
        },

        /* 只读计划里的「暂缓开跑」标记（hold / holdUntil），不看区间、不写排程缓存。
           为什么单独抽出来：18 点后 todayPlan 直接返回 continuous，fetchRunPlan 的
           区间会被 clamp 掉，于是 hold 压根读不到 —— 18 点后 hold 等于不存在。
           后果是 zy.py 装扩展/校准脚本时没有任何保护：
             18:40 拉起的浏览器，18:41 脚本就开跑了（日志实测），
             zy.py 只能等「轮次空窗」——连续模式下一轮接一轮，等不到，
             于是要么 90 秒后硬升把正在跑的那一轮掐断，要么干脆永远不升。
           这里只取两个字段，跟排程逻辑完全解耦，18 点后照样能读。 */
        async fetchPlanHold() {
            let custom = String(GM_getValue("Config.planUrl", "") || "").trim();
            if (custom && /:(1808[0-9]|808[0-9])\//.test(custom)) custom = "";
            const urls = custom ? [custom] : PLAN_DEFAULT_URLS;
            for (const url of urls) {
                let raw = "";
                try {
                    const res = await Utils.xhrFull({ url, timeout: 5000, cookie: false });
                    raw = String((res && res.text) || "");
                } catch (_) { continue; }
                let data = null;
                try { data = JSON.parse(raw); } catch (_) { continue; }
                if (!data || typeof data !== "object") continue;
                let holdUntil = Number(data.holdUntil) || 0;
                if (holdUntil > 0 && holdUntil < 1e12) holdUntil *= 1000;   // 兼容秒级写法
                try {
                    GM_setValue("Config.planHoldUntil",
                        (data.hold && holdUntil > Date.now()) ? holdUntil : 0);
                } catch (_) {}
                return true;
            }
            /* 全都读不到就保持原值（不清零）：zy.py 只是短暂重启时，
               旧的 holdUntil 会自己到期失效，不需要这里主动抹掉。 */
            return false;
        },

        /* 主动重读一次计划里的 hold 标记（绕过 planRange 缓存）。
           hold 只在「确实要开跑」时才查，所以这点额外请求可以忽略；
           30 秒节流，避免同一分钟内重复拉。 */
        async refreshPlanHold() {
            const now = Date.now();
            /* 节流必须落盘：放内存里时每次上下文重建都失效，
               一个执行点可能连拉好几次；30 秒足够覆盖「同一分钟内多次敲门」。 */
            const last = Number(GM_getValue("Config.holdTryAt", 0)) || 0;
            if (last && now - last < 30000) return;
            /* 读不到就退避 5 分钟：18 点后每分钟都会走到这里，zy.py 一挂，
               三个端口 × 5 秒超时 = 每次敲门白等 15 秒，比不做还糟。
               退避期间只信已有的 planHoldUntil（它会自己到期失效）。 */
            const failAt = Number(GM_getValue("Config.holdFailAt", 0)) || 0;
            if (failAt && now - failAt < 5 * 60 * 1000) return;
            try { GM_setValue("Config.holdTryAt", now); } catch (_) {}
            this._holdTryAt = now;
            let ok = false;
            try { ok = await this.fetchPlanHold(); } catch (_) { ok = false; }
            try { GM_setValue("Config.holdFailAt", ok ? 0 : now); } catch (_) {}
        },

        planHoldLeft() {
            const hu = Number(GM_getValue("Config.planHoldUntil", 0)) || 0;
            return hu > Date.now() ? Math.ceil((hu - Date.now()) / 1000) : 0;
        },

        todayPlan(now = Date.now()) {
            const date = Utils.getTodayNum();
            const key = this.PLAN_KEY();

            /* ══ 18:00 之后：不再用计划排点，直接连续做 ══
               用户要求（2026-11-22）：任务只要到了 18 点后，就按默认一直做，做到今天做完
               为止；计划不排 18 点后。
               这里直接返回一个空排程（不撒点、不写缓存、不打「今日排程」日志 ——
               18 点后每分钟敲一次门，再打日志就是刷屏）。真正的开跑由 hitWakePoint 的
               「18 点后连续」分支放行；上一轮还在跑时由 ⑦ 让路，不会并行。 */
            const d18 = new Date(now);
            if (d18.getHours() * 60 + d18.getMinutes() >= PLAN_CUTOFF_MIN) {
                return {
                    v: this.PLAN_VER, date, mode: "continuous", name: "18 点后连续",
                    points: [], used: [], rangeKey: `continuous|${date}`
                };
            }

            /* 排程本体：日期 + 本账号的盐作种子的确定性伪随机。
               同一账号当天结果稳定（敲门重算不会换点），不同账号则互不相同。 */
            const rnd = seededRnd((date ^ this.salt()) >>> 0);

            /* ① 优先用 zy.py 的计划：开机时刻 ~ 收工时刻 之间撒点（第二层随机）。
                  拿不到时才退回「唤醒分布」（上午/下午/全天 的固定区间）。 */
            let plan = (!this._planOff) ? this.planRange(now) : null;
            /* 计划不排 18 点后（用户要求 2026-11-22）：18:00 之后不再等执行点，
               脚本改成「一轮接一轮一直做，做到今天做完为止」。所以先把计划区间上界
               压到 18:00；压完不够一个最小间隔（开机本身就在 18 点后，或只剩个尾巴），
               就当没有计划 —— 反正 18 点后不看点。 */
            if (plan) {
                const hiPlan = Math.min(plan.hi, PLAN_CUTOFF_MIN);
                if (hiPlan - plan.lo < RANDOM_WAKE.MIN_GAP) {
                    plan = null;
                } else {
                    plan = Object.assign({}, plan, { hi: hiPlan });
                }
            }
            let mode, name, lo, hi;
            if (plan) {
                mode = "plan";
                name = plan.name;
                lo = plan.lo;
                hi = plan.hi;
            } else {
                /* 读不到 zy.py 计划：直接以「本账号实际启动时刻」为起点铺排，
                   不再用上午/下午/全天那种固定区间。
                   旧逻辑用固定区间（上午 9-13 等）+ 迟到补救，但补救条件
                   `nowMin < hi - GAP` 在「启动时刻晚于整个区间」时不成立 —— 例如
                   2026-11-22 long 分到上午(9:10~12:30)、浏览器 13:10 才起，
                   起点抬不上去，所有点全落在已过去的上午，整下午空转。
                   现在回退一律从启动时刻起排；起点落盘固定（见 ②），保证当天
                   每次敲门算出的区间一致、进度不重置。 */
                const cfgMode = String(GM_getValue("Config.wakeMode", "random") || "random");
                const modes = ["morning", "afternoon", "full"];
                mode = modes.indexOf(cfgMode) >= 0
                    ? cfgMode : modes[Math.floor(rnd() * modes.length)];
                const range = RANDOM_WAKE[mode];
                name = range.name;
                /* 起点用「现在」，收工线用该模式原本的 hi（上午 13:00 / 下午·全天 18:00）。
                   lo 会在 ② 里被落盘的启动时刻覆盖；hi 在启动过晚时于 ② 顺延。 */
                const nowD = new Date(now);
                lo = nowD.getHours() * 60 + nowD.getMinutes() + 1;
                hi = range.hi - RANDOM_WAKE.EDGE_PAD - RANDOM_WAKE.ROUND_TAIL;
            }

            /* ② 起点落盘 + 迟到补救：
                 · 回退模式（无计划）：起点 = 本账号首次敲门的启动时刻，落盘固定。
                   这样从启动那一刻起就把剩余时间铺满，哪怕晚启动也有得跑。
                 · 有计划的迟到补救：浏览器比计划开机时刻晚很久才起来时（如计划 9:10、
                   14:00 才开），把起点抬到「现在」重新铺满；原条件保留。
                 两者都只写一次并落盘，区间当天稳定，进度不会因每次敲门重置。 */
            const lateNow = new Date(now);
            const nowMin = lateNow.getHours() * 60 + lateNow.getMinutes();
            let lateStart = 0;
            const lateRec = GM_getValue(LATE_START_KEY, null);
            /* 「当天已经开过工」：cached 里已经有执行点被打过勾（used=true）。
               这时绝不能再走迟到补救 —— 否则第一个执行点过点之后（实跑日志里 14:46
               开机、15:07 那次敲门）会误判成「浏览器迟到」，把起点抬到 15:08 重新撒点：
               rangeKey 一变，used 全被重置，14:51/15:06 这两个已过点的执行点凭空消失、
               后面的点整体错位，进度也跟着回退一轮。 */
            const startedToday = (() => {
                try {
                    const c = GM_getValue(key, null);
                    return !!(c && c.date === date && Array.isArray(c.used) && c.used.some(Boolean));
                } catch (_) { return false; }
            })();
            if (lateRec && lateRec.date === date && Number(lateRec.at) > 0) {
                const atMin = Number(lateRec.at);
                /* 只认「落在本次计划区间内」的迟到记录。
                   这条记录是「当天第一次运行」写的，会一直留到当天结束：实跑日志里
                   18:15 这次开机，排程却打印「15:07 才起来，已把之后的时间重新铺满」——
                   那是下午那次运行留下的记录。虽然下面 `if (lateStart > lo)` 会取 max
                   兜住（不至于把晚上这轮排错），但日志会误导人，也容易让后面的区间判断看错。
                   zy.py 每次开机都会给新的 lo，早于 lo 的旧记录一律作废。 */
                if (!plan || atMin >= plan.lo) lateStart = atMin;
            } else if (!plan) {
                /* 读不到计划：无条件以启动时刻为起点（连「> lo+GAP」都不用等，
                   因为回退分支的 lo 本来就是 now+1） */
                lateStart = nowMin + 1;
                try { GM_setValue(LATE_START_KEY, { date, at: lateStart }); } catch (_) {}
            } else if (!startedToday && nowMin > lo + RANDOM_WAKE.MIN_GAP
                       && nowMin < hi - RANDOM_WAKE.MIN_GAP) {
                lateStart = nowMin + 1;
                try { GM_setValue(LATE_START_KEY, { date, at: lateStart }); } catch (_) {}
            }
            if (lateStart > lo) lo = lateStart;
            /* 回退且启动已晚于原模式收工线（如 13:10 才起、却分到上午 hi=12:30）：
               把收工线顺延，保证区间不反转、仍有一段可铺。上限 18:00 —— 18 点之后
               不再排执行点（todayPlan 开头已整段接管成「连续跑」）。 */
            if (!plan && lo >= hi) {
                hi = Math.max(lo, Math.min(PLAN_CUTOFF_MIN,
                    lo + RANDOM_WAKE.MIN_POINTS * RANDOM_WAKE.MIN_GAP + RANDOM_WAKE.ROUND_TAIL));
            }

            /* ③ 撒点：对齐引擎真正可信的唤醒节拍（SCHED_GRID 分钟）。
                  这一条是从实跑日志反推出来的：@crontab 在本环境里被退避到 20 分钟一次
                  （14:40:42 → 15:00:42），真正准点叫醒的只有「定时执行」的整 10 分钟
                  （14:20 / 14:30 / … / 15:30 一次不落）。所以把执行点放在 14:21 / 16:22
                  这种任意分钟，实际只能等下一声整 10 分钟的敲门 —— 日志上就成了
                  「计划 14:45、14:50 才跑」「计划 16:22、16:30 才跑」。
                  现在点直接落在网格上：计划时刻 = 实际开跑时刻，只剩几十秒抖动。

                  撒法（网格索引上做加权分配，不再「等分段 + 段内取格」）：
                  把可用网格编号 0..L-1，先给每个间隔留够 step 格，剩下的 spare 格
                  随机丢进 n+1 个桶（首留白 / n-1 个间隔 / 尾留白）。
                  这样相邻点必然 ≥ GAP（不会像段内取格那样挤成 10 分钟），
                  同时首尾都有留白、间隔长短不一 —— 四账号各用各的盐，排程天然不同。 */
            const GAP = RANDOM_WAKE.MIN_GAP;      /* 相邻点最小间隔（分钟），须为网格整数倍 */
            const GRID = SCHED_GRID;

            let points;
            const slots = [];
            for (let m = Math.ceil(lo / GRID) * GRID; m <= Math.floor(hi / GRID) * GRID; m += GRID) slots.push(m);
            if (!slots.length) slots.push(Math.round(lo / GRID) * GRID);   /* 区间窄到塞不进一格 */
            const step = Math.max(1, Math.round(GAP / GRID));              /* 相邻点至少隔几格 */
            const L = slots.length;
            const spanIdx = L - 1;
            const nMax = Math.floor(spanIdx / step) + 1;
            let n = Math.max(1, Math.min(RANDOM_WAKE.MAX_POINTS, nMax));
            /* 余量太少时降点数：余量 0 意味着所有点被钉死，四账号会排出同一套排程 */
            const keepN = Math.min(RANDOM_WAKE.MIN_POINTS, nMax);
            while (n > keepN && (spanIdx - step * (n - 1)) < 4) n--;
            if (n <= 1) {
                points = [slots[Math.floor(rnd() * L)]];
            } else {
                const spare = Math.max(0, spanIdx - step * (n - 1));
                /* spare 个「空格」随机分进 n+1 个桶：0=首留白，1..n-1=各间隔加量，n=尾留白 */
                const buckets = new Array(n + 1).fill(0);
                for (let i = 0; i < spare; i++) buckets[Math.floor(rnd() * (n + 1))] += 1;
                let idx = buckets[0];
                points = [slots[Math.min(L - 1, idx)]];
                for (let i = 0; i < n - 1; i++) {
                    idx += step + buckets[i + 1];
                    points.push(slots[Math.min(L - 1, idx)]);
                }
            }
            /* 去重/兜底：新撒法本身已保证严格递增且间隔 ≥GAP，这里只防极端区间 */
            points = points.filter((x, i, arr) => i === 0 || x > arr[i - 1]);
            for (let i = 1; i < points.length; i++) {
                if (points[i] - points[i - 1] < GAP) points[i] = points[i - 1] + GAP;
            }
            if (points.length && points[points.length - 1] > hi) {
                points[points.length - 1] = Math.floor(hi / GRID) * GRID;
            }
            if (!points.length) points = [Math.floor(hi / GRID) * GRID];

            /* ④ used 是本账号自己的进度：日期/版本/区间/点数都对得上才沿用，否则重置。
                  区间也要比对：zy.py 每天的开机时刻不同，区间变了就得重新撒点。 */
            const rangeKey = `${mode}|${lo}-${hi}`;
            const cached = GM_getValue(key, null);
            const fresh = !cached || cached.date !== date || cached.v !== this.PLAN_VER
                || cached.rangeKey !== rangeKey;
            const used = (!fresh && Array.isArray(cached.used)
                && cached.used.length === points.length)
                ? cached.used.slice() : points.map(() => false);

            const p = { v: this.PLAN_VER, date, mode, name, points, used, rangeKey };
            if (fresh) {
                GM_setValue(key, p);
                const lateNote = lateStart > 0
                    ? `；${this.fmtHM(lateStart - 1)} 才起来，已把之后的时间重新铺满` : "";
                const label = plan
                    ? `计划 ${this.fmtHM(lo)}~${this.fmtHM(hi)}（zy.py 开机 ${this.fmtHM(plan.startMin)}、收工 ${this.fmtHM(plan.untilMin)}${plan.crossDay ? "（次日）" : ""}${lateNote}）`
                    : `${this.fmtHM(lo)}~${this.fmtHM(hi)} ← 未读到 zy.py 计划，按本账号启动时刻起排（不排到已过去的时间）`;
                Utils.log("🎲", `本账号今日排程（${label}，执行点各账号独立、互不相同）：`
                    + points.map(x => this.fmtHM(x)).join(" / "));
            }
            return p;
        },

        /* 本次敲门是否命中一个「还没跑过」的执行点。
           apply=false 时只查不改（peek）：每分钟都敲门，绝大多数敲门在窗口外，
           这一步要尽量便宜，不能因为「顺手标记」把还没跑的点吃掉。
           命中条件（执行点精确到分钟）：
             · 已到点、且过点没超过 WAKE_LATE_WINDOW → 立即开跑；
             · 还差不到 WAKE_HIT_WINDOW（5 秒，只容忍定时器提前几秒）→ 也认。
           命中即把该点标记为已用并落盘，保证同一个点只触发一次。 */
        hitWakePoint(now = Date.now(), apply = true) {
            const d = new Date(now);
            const curMin = d.getHours() * 60 + d.getMinutes();
            const p = this.todayPlan(now);
            /* 18 点后不看执行点：每次敲门都算命中（上一轮还在跑时由 ⑦ 让路），
               于是一轮接一轮做到今天做完为止。这就是「18 点后按默认连续做」。
               但 18 点后的**头 3 分钟**先不跑：计划只排到 18:00，脚本读不到 hold 标记
               （zy.py 装扩展/校准期间置的那个），如果浏览器正好 18 点后才起来，
               此刻直接开跑会被校准掐断（v0.75 修过的老问题）。这里用「今天第一次
               18 点后敲门」当锚点等 3 分钟，之后一直连续跑。 */
            if (curMin >= PLAN_CUTOFF_MIN) {
                const t18 = Date.now();
                let first18 = 0;
                try {
                    if (Number(GM_getValue("Config.after18Date", 0)) !== Utils.getTodayNum()) {
                        GM_setValue("Config.after18Date", Utils.getTodayNum());
                        GM_setValue("Config.after18At", t18);
                        first18 = t18;
                    } else {
                        first18 = Number(GM_getValue("Config.after18At", 0)) || t18;
                    }
                } catch (_) { first18 = t18; }
                if (t18 - first18 < 3 * 60 * 1000) {
                    const once = Number(GM_getValue("Config.after18LogAt", 0)) || 0;
                    if (t18 - once >= 30 * 60 * 1000) {
                        try { GM_setValue("Config.after18LogAt", t18); } catch (_) {}
                        Utils.log("⏸️", "18 点后第一轮先等 3 分钟：给 zy.py 留出装扩展/校准的时间"
                            + "（计划不排 18 点后，读不到暂缓标记），之后一轮接一轮连续跑");
                    }
                    return { hit: false, plan: p, waitCalib: true };
                }
                /* 18 点后按 20 分钟节拍（对齐 yh.js 的 20 分钟定时）：
                   上一轮结束不满 20 分钟就静默等，不再「每次敲门都开一轮」。
                   以前没有这道闸门，一轮跑完 1~2 分钟、下一分钟又开一轮，
                   22:06~22:14 那份日志里四个账号各刷了 4~5 轮空转。 */
                const lastEnd = Number(GM_getValue(ROUND_END_KEY, 0)) || 0;
                if (lastEnd > 0 && t18 >= lastEnd && (t18 - lastEnd) < AFTER18_IDLE_MS) {
                    return {
                        hit: false, plan: p, waitIdle: true,
                        idleLeftMs: AFTER18_IDLE_MS - (t18 - lastEnd)
                    };
                }
                return { hit: true, point: curMin, index: -1, plan: p, leadMs: 0, continuous: true };
            }
            const secInMin = d.getSeconds() + d.getMilliseconds() / 1000;
            for (let i = 0; i < p.points.length; i++) {
                if (p.used[i]) continue;
                const at = p.points[i];
                /* 距该点的毫秒数：>0 还没到，<0 已经过了 */
                const leadMs = (at - curMin) * 60000 - secInMin * 1000;
                if (leadMs > WAKE_HIT_WINDOW) return { hit: false, plan: p };   // 还没到点
                if (leadMs < -WAKE_LATE_WINDOW) continue;                        // 过点太久，作废，看下一个
                if (apply) {
                    p.used[i] = true;
                    GM_setValue(this.PLAN_KEY(), p);
                }
                return { hit: true, point: at, index: i, plan: p, leadMs: Math.max(0, leadMs) };
            }
            return { hit: false, plan: p };
        },

        /* 下一个「还没跑过」的执行点时间戳；今天全部跑完返回 0（今天不再开跑）。 */
        nextWakeAt(now = Date.now()) {
            const p = this.todayPlan(now);
            const d = new Date(now);
            for (let i = 0; i < p.points.length; i++) {
                if (p.used[i]) continue;
                const at = p.points[i];
                const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(),
                    Math.floor(at / 60), at % 60, 0, 0).getTime();
                if (t > now) return t;
            }
            return 0;
        },

        /* 今天还剩几个执行点没跑（含当前）——搜索份数按它摊派。
           全跑完返回 1，让最后一轮把剩余配额做完。 */
        roundsLeftToday(now = Date.now()) {
            const p = this.todayPlan(now);
            return Math.max(1, p.used.filter(x => !x).length);
        },

        /* 本轮该给多少预算（毫秒）。平时 ROUND_BUDGET_MS（20 分钟）；
           命中「今天最后一个执行点」时放宽到「离收工还剩多久」（最多 45 分钟）——
           搜索一次要 1~2 分钟，20 分钟只够十来次，最后一轮塞不下就会带到明天。
           注意调用时机：必须在 hitWakePoint 把当前点标记为已用之后，
           这样 nextWakeAt() === 0 才能确认「这就是最后一个点」。 */
        roundBudgetMs(now = Date.now()) {
            try {
                if (this.nextWakeAt(now) !== 0) return ROUND_BUDGET_MS;
                const hint = this.planRange(now);
                const untilMin = hint ? hint.untilMin : WINDOW.END_DEFAULT * 60;
                const d = new Date(now);
                const cur = d.getHours() * 60 + d.getMinutes();
                const remainMs = Math.max(0, untilMin - cur) * 60 * 1000;
                if (remainMs <= ROUND_BUDGET_MS) return ROUND_BUDGET_MS;
                return Math.min(ROUND_LAST_BUDGET_MS, remainMs);
            } catch (_) {
                return ROUND_BUDGET_MS;
            }
        },


        ctxName() { return Utils.isBackground() ? "后台" : "页面"; },

        getClaim() {
            const c = GM_getValue("Config.cronClaim", null);
            return c && typeof c === "object" ? c : null;
        },
        claim() { GM_setValue("Config.cronClaim", { at: Date.now(), ctx: this.ctxName(), id: Utils.lockId() }); },
        clearClaim() { GM_setValue("Config.cronClaim", null); },

        state(phase, extra) {
            const now = Date.now();
            const base = { phase, at: now, ctx: this.ctxName() };
            /* running 阶段一定要带上 aliveAt：它是「这个上下文还活着」的唯一凭据，
               下一轮/下一个上下文靠它区分「真的在跑」和「早就断了」。 */
            if (phase === "running") base.aliveAt = now;
            GM_setValue("Config.runState", Object.assign(base, extra || {}));
        },
        getState() {
            const s = GM_getValue("Config.runState", null);
            return s && typeof s === "object" ? s : null;
        },

        /* 任务真的有推进时调一次：只更新 at（最后进展），不碰 aliveAt */
        progress(extra) {
            const st = this.getState() || {};
            GM_setValue("Config.runState", Object.assign({}, st, { phase: "running", at: Date.now() }, extra || {}));
        },

        isBusy(now = Date.now()) {
            const s = this.getState();
            if (!s || s.phase !== "running") return false;
            /* 存活判据取 max(at, aliveAt)：两个都停了才算死。 */
            const last = Math.max(Number(s.at) || 0, Number(s.aliveAt) || 0);
            return now - last < RUN_STALE;
        },

        /* 收掉一条已经死掉的 running 记录：清阶段 + 清认领 + 放掉那个上下文留下的锁。
           返回被回收的记录（没什么可收就返回 null）。
           能走到这里说明心跳和进展都停了 = 持有锁的那个上下文已经不在了，
           所以连锁一起收掉，否则下一轮会卡在「另一个上下文正在运行」上。 */
        reap(now = Date.now()) {
            const s = this.getState();
            if (!s || s.phase !== "running") return null;
            if (this.isBusy(now)) return null;
            this.state("done");
            if (this.getClaim()) this.clearClaim();
            const lock = Utils.lockInfo("Config.runLock");
            if (lock && !lock.mine) GM_setValue("Config.runLock", null);
            return s;
        },

        /* 一轮结束：清认领、记时间、写「参考排期」供诊断面板显示。
           下一次真跑由当天随机排程的下一个执行点决定（crontab 中间的空敲门不算）。 */
        finish(ok, ran = true) {
            const now = Date.now();
            const claim = this.getClaim();
            if (claim && claim.id && claim.id !== Utils.lockId()) return;
            /* 用时基准取「本轮真正开跑的时刻」，而不是认领时刻：
               上下文在跑到一半被销毁重建时，认领会重新写一次，
               于是出现「本轮结束（用时 0 分钟）」而实际上跑了 9 分钟。
               12 小时以上的记录视为跨天残留，不采用。 */
            const rsAt = Number(GM_getValue("Config.roundStartAt", 0)) || 0;
            const base = (rsAt > 0 && now - rsAt < 12 * 3600 * 1000)
                ? rsAt
                : ((claim && claim.at) || now);
            this.clearClaim();
            GM_setValue("Config.cronLastRun", now);
            const nextAt = this.nextWakeAt(now);
            this.saveNext(nextAt);
            this.state(ok ? "done" : "idle");
            if (ran) {
                const pl = this.todayPlan(now);
                const left = pl.used.filter(x => !x).length;
                /* 有续跑标记时下一个执行点不是真正的开跑时刻 —— 下一声敲门就会接着做，
                   这里必须说清楚，否则日志会让人以为要等几十分钟。 */
                const nm = (() => { try { return GM_getValue("Config.needMore", null); } catch (_) { return null; } })();
                const moreTail = (nm && Number(nm.date) === Utils.getTodayNum())
                    ? "；已留续跑标记，下一声敲门（1 分钟内）接着做，不占执行点"
                    : "";
                const tail = nextAt
                    ? `下一个执行点 ${this.fmt(nextAt)}（约 ${Math.max(0, Math.round((nextAt - now) / 60000))} 分钟后）`
                    : `今日 ${pl.points.length} 个执行点已全部跑完`;
                Utils.log("🕒", `本轮结束（用时 ${Math.max(0, Math.round((now - base) / 60000))} 分钟），`
                    + `${tail}；今日排程 ${this.planSummary(pl)}，剩余 ${left} 点${moreTail}`);
            }
        },

        /* 排程摘要，供日志与诊断面板复用 */
        planSummary(pl) {
            if (!pl) return "未生成";
            return `${pl.name} ` + pl.points.map((x, i) =>
                (pl.used[i] ? "✓" : "·") + this.fmtHM(x)).join(" ");
        },

        /* 这次唤醒是不是「脚本刚被启用/重新加载」那种非正常敲门。
           ⚠ 这条以前看的是「秒数是否贴近整分」（@crontab 每分钟一次 → 秒数≈0）。
           但当前引擎里 crontab 会被退避成 20 分钟一次，而且秒数漂到 :42 这类位置，
           于是每 20 分钟就有一次敲门被判成「脚本刚启用」→ 清掉运行锁与运行缓存。
           后果不是日志难看，而是**正在跑的那一轮被当场打断**：
           它下一次 tick() 发现锁没了直接抛错退出，那一轮的搜索配额就白丢了
           （日志里 Dean 14:51 那轮 15:19 还在搜、15:20:42 突然「记录作废」就是这个）。
           改用间隔判据：只抓「同一时刻被重复执行」（引擎重载时的典型表现）。
           真实环境里 @crontab 被退避成 20 分钟一次、且秒数固定在 :42，
           所以任何靠「秒数是否贴近整分」的判断都会误伤（0.50 就是这么把在跑的轮次清掉的）。
           「停用一阵再启用」由 justLoaded（30 秒内）+ offlineLong（>3 小时）+ ownerDead 三条覆盖，
           不靠这条。 */
        wakeIsOffGrid(now = Date.now()) {
            const hb = Number(GM_getValue("Config.heartbeatAt", 0)) || 0;
            if (!hb) return false;                // 从没敲过门 = 首次运行，没有痕迹要清
            return (now - hb) < 3000;
        },

        /* 上一次的 running 记录还挂着，但它的心跳早就停了 → 上下文已死 */
        deadOwner(now = Date.now()) {
            const s = this.getState();
            if (!s || s.phase !== "running") return false;
            const last = Math.max(Number(s.at) || 0, Number(s.aliveAt) || 0);
            return last > 0 && (now - last) > RUN_HEARTBEAT_STALE;
        },

        /* 实测一次「记录里那一轮还活着吗」：等两个心跳周期，看 runAlive 有没有涨。
           活着 → 让路；没涨 → 那个上下文已经没了（停用脚本 / 标签页被回收），
           记录作废，本次直接开跑。比只看时间戳可靠：时间戳可能是几秒前刚写的。 */
        async probeOwnerAlive() {
            const before = Number((this.getState() || {}).runAlive) || 0;
            await Utils.delay(RUN_HEARTBEAT_GAP * 2 + 2000);
            const after = Number((this.getState() || {}).runAlive) || 0;
            return after > before;
        },

        /* 本次浏览器会话的标识：后台上下文每次唤醒都会重新执行脚本，
           但同一次浏览器启动内 performance.timeOrigin 固定，重启后才会变。 */
        bootId() {
            try {
                const origin = (typeof performance !== "undefined" && Number(performance.timeOrigin)) || 0;
                if (origin > 0) return Math.round(origin);
            } catch (_) {}
            return 0;
        },

        /* 上一段会话是否真的留下了要清的东西：锁 / 认领 / 未收尾的轮次记录 /
           跑过一轮才会写的缓存。三样全空 = 「浏览器一直开着，只是几小时没醒」，
           这时清了也是空清，没必要刷一行「检测到新的会话」吓人。 */
        hasRoundResidue() {
            try { if (Utils.lockInfo("Config.runLock")) return true; } catch (_) {}
            const st = this.getState();
            if (st && (st.phase === "running" || st.phase === "claimed" || st.phase === "waiting")) return true;
            try { if (this.getClaim()) return true; } catch (_) {}
            return ROUND_CACHE_KEYS.some(k => {
                try { return GM_getValue(k, null) !== null; } catch (_) { return false; }
            });
        },

        /* 新的浏览器会话（重启 / 脚本被停用后又启用 / 长时间关机）：
           把上一段会话的全部运行痕迹清掉 —— 锁、认领、running 标记、旧排期、
           变体缓存、节流计数。不清的话新一轮会被「上一轮还在执行中」挡住（抢轮次）。
           ⚠ 脚本被「停用」的那一刻没有任何代码会执行，所以清不掉；
           清理一定发生在下一次唤醒的最开始，效果等价于「启用后从干净状态开始」。
           今日进度（tasks / doneDate / edge / monthly / intl）不清，清了会重复做任务。 */
        resetRoundState(reason) {
            /* heartbeatAt 是「上次敲门时刻」，属于跨轮次的元信息，不是本轮运行痕迹。
               以前它也在 RUNTIME_KEYS 里被一并清成 0，连锁反应很难看出来：
                 hb=0 → 下一轮 prevAt 退化成 lastRun()（上一轮没走到 finish() 就还是昨天的值）
                 → 打出「距上次唤醒 1278 分钟（上次 11-19 17:32）」这种假日志
                 → 又被 offlineLong(>3 小时) 判成「睡了很久」→ 再 reset 一次 → 循环。
               日志里 14:50 那三条「距上次唤醒 1271/1278/2741 分钟」就是这么来的：
               14:40:42 探活误判清了 hb 且没写回，14:50 读到 0 就去拿昨天的 lastRun()。
               所以清理前后必须保住它。 */
            const hbKeep = Number(GM_getValue("Config.heartbeatAt", 0)) || 0;
            let cleared = [];
            try { cleared = clearKeys(RUNTIME_KEYS).filter(k => k !== "Config.heartbeatAt"); } catch (_) {}
            try { this.clearClaim(); } catch (_) {}
            try { GM_setValue("Config.runLock", null); } catch (_) {}
            try { GM_setValue("Config.runState", null); } catch (_) {}
            try { GM_setValue("Config.cronNextRun", 0); } catch (_) {}
            /* 写回（RUNTIME_KEYS 里含 heartbeatAt，clearKeys 已把它清掉） */
            if (hbKeep > 0) { try { GM_setValue("Config.heartbeatAt", hbKeep); } catch (_) {} }
            if (reason) {
                Utils.log("♻️", reason + (cleared.length ? `（已清理 ${cleared.length} 项运行缓存）` : ""));
            }
        },

        /* ══ 定时模式唯一入口 ══════════════════════════════════════════
           一次 @crontab 敲门 = 一次检查；命中当天随机排程的未跑执行点才真跑一轮。
           没有常驻循环，空敲门静默退出。 */
        async runOnce(task) {
            this.started = true;
            this.startedAt = Date.now();
            this.task = task;
            let now = this.startedAt;

            /* ① 判断「上一段会话是不是还在」：浏览器重启 / 脚本停用过 / 睡了很久
               都会在这里被认出来，然后把运行痕迹全部清掉，本轮从头开始。
               ⚠ 脚本被停用的那一刻不会有任何代码执行（环境直接销毁），
               所以清理只能发生在下一次唤醒的最开头 —— 效果是「启用后第一次跑就是干净的」。 */
            const boot = this.bootId();
            const prevBoot = Number(GM_getValue("Config.bootId", 0)) || 0;
            const hbAt = Number(GM_getValue("Config.heartbeatAt", 0)) || 0;
            const prevAt = Math.max(hbAt, this.lastRun());
            const gapMs = prevAt > 0 ? (now - prevAt) : 0;
            const offlineLong = gapMs > RESUME_GAP;
            const bootChanged = boot > 0 && prevBoot > 0 && boot !== prevBoot;
            /* 不是 cron 叫醒的：脚本刚被启用、或被重新加载，等价于新会话 */
            const offGrid = this.wakeIsOffGrid(now);
            /* 上一轮还挂着 running，但它的心跳早就不刷了：可能真的没了，也可能只是
               被 Chrome 冻结了（冻结时 setInterval 一起停）。
               ⚠ 这里只做**粗筛**，不探活、不清锁：这段代码在「每分钟一次的空敲门」
               里也会走到，而探活要干等两个心跳周期（~42 秒）。之前正是在这里
               探活 + resetRoundState，把还在跑的那一轮锁清掉、缓存清空，接着报
               「补跑已用满，等下一个执行点」——那一轮的工作就白丢了。
               真死没死，留到确实要用的时候再确认（⑥a' 的补跑判定 / ⑦ 的让路判断）。 */
            let ownerProbedAlive = null;      // null=没测 / true=实测还活着
            let ownerDead = this.deadOwner(now);   // 粗筛结果，尚未验证
            /* 粗筛那一刻「上一轮最后一次动弹」的时刻：后面 ② 的 reapDeadRound 可能先把
               记录回收掉，等到 ⑥a' 再读就只剩 null，日志会变成「已安静 0 分钟」。 */
            const ownerSnap = this.getState() || {};
            const ownerLastAct = Math.max(Number(ownerSnap.at) || 0, Number(ownerSnap.aliveAt) || 0);
            /* 距上次「敲门」不到 FRESH_STAMP_MS：正常敲门间隔 = cron 周期（60 秒），
               短到这份上只能是停用→启用时的立即执行。只看 hbAt，不看 lastRun。 */
            const justLoaded = hbAt > 0 && (now - hbAt) < FRESH_STAMP_MS;
            if (bootChanged || offlineLong || offGrid || justLoaded) {
                let why = "";
                if (bootChanged) why = "浏览器重启过";
                else if (offGrid) why = "脚本刚启用或重新加载（非定时唤醒）";
                else if (justLoaded) why = `脚本刚被重新启用（距上次敲门 ${Math.round((now - hbAt) / 1000)} 秒）`;
                else why = `距上次唤醒 ${Math.round(gapMs / 60000)} 分钟（上次 ${this.fmt(prevAt)}）`;
                /* 只有真留下痕迹才清、才打那行「新会话」日志：
                   浏览器开着、机器睡了几小时再醒，残留通常是空的，
                   清了也没意义，提示成「检测到新的会话 / 从头开始」只会让人以为进度被清了。 */
                if (this.hasRoundResidue()) {
                    this.resetRoundState(`新会话（${why}）：运行锁与缓存已重置，今日进度与排程保留`);
                } else {
                    Utils.log("💤", `${why}，无残留可清，本轮照常继续（今日进度与排程保留）`);
                }
            }
            /* 上面只要认出「换会话了」（重启 / 脚本重新启用 / 睡了很久），本轮就从干净状态开跑，
               上一轮即使真被打断也不必再补跑一次 —— 补跑是给「同一次会话里的意外中断」准备的，
               两种情况都算补反而会白烧额度、还多打一条自相矛盾的日志。 */
            if (bootChanged || offlineLong || offGrid || justLoaded) ownerDead = false;
            if (boot > 0) GM_setValue("Config.bootId", boot);
            GM_setValue("Config.heartbeatAt", now);

            /* ①b 跨天：昨天留下的运行痕迹同样作废（今日进度有各自的 date 字段，不受影响） */
            const prevDay = Number(GM_getValue("Config.lastSeenDay", 0)) || 0;
            const todayNum = Utils.getTodayNum();
            if (prevDay > 0 && prevDay !== todayNum) {
                this.resetRoundState(`跨天（${prevDay} → ${todayNum}），已清除昨天的运行锁与缓存`);
                try { GM_setValue("Config.stoppedLogAt", 0); } catch (_) {}
            }
            GM_setValue("Config.lastSeenDay", todayNum);

            /* ② 回收确实死掉的轮次，清掉超时未开始的认领与孤儿锁 */
            try { this.reapDeadRound(now); } catch (_) {}
            const staleClaim = this.getClaim();
            if (staleClaim && staleClaim.at && !this.isBusy(now) && now - staleClaim.at > CRON_STALL) {
                this.clearClaim();
                Utils.log("♻️", `清理超时未开始的认领（${this.fmt(staleClaim.at)}）`);
            }
            /* 孤儿锁：锁记录还在，但没有任何 holding 的轮次记录（phase 不是 running）——
               典型是「停用脚本时那一轮正好死在释放锁之前」。锁不释放，下一轮会被
               runAll 的 acquireLock 直接挡回去，所以这里按 TTL 兜底清掉。
               注意只在「确实没有谁在跑」时清，避免把正在跑的锁抢走。 */
            const orphanLock = Utils.lockInfo("Config.runLock");
            const curPhase = (this.getState() || {}).phase;
            if (orphanLock && curPhase !== "running"
                && (now - Number(orphanLock.ts || 0)) > RUN_LOCK_TTL) {
                try { GM_setValue("Config.runLock", null); } catch (_) {}
                Utils.log("♻️", `清理孤儿运行锁（${this.fmt(orphanLock.ts)} 残留，已超过 ${Math.round(RUN_LOCK_TTL / 60000)} 分钟）`);
            }

            /* ②b 先读一次 zy.py 的计划（开机 → 收工）。
               为什么必须排在时段判定之前：winCfg 现在是「有计划就用计划」，
               计划没读进来时只能拿 09:00~23:00 兜底。如果先判时段再读计划，
               就会出现死锁 —— 23:12 这种「计划说到 23:59、兜底时段 09~23 已过」的情况，
               第一次判「不在时段」直接 return，永远走不到读计划那一步，
               然后就整晚都不跑（线上 23:12 那次就是这样：4 个账号每分钟空唤醒）。
               计划已经读过/正在限流重试时，这一步几乎无开销。 */
            try { await this.ensureRunPlan(); } catch (_) {}

            /* ③ 运行时段以 Config.winTime（默认 auto = 跟随 zy.py 计划）为准：
               cron 全天唤醒，这里才是闸门。
               时段一结束就把运行痕迹（锁、认领、排期、变体缓存、节流计数）清干净，
               下一次开窗从全新状态开始 —— 定时模式下没有「卡住需要人手动重置」这回事了。
               今日进度（tasks / doneDate / edge / monthly / intl）不清，清了会重复做任务。 */
            if (!this.inWindow(now)) {
                const wasInWindow = Number(GM_getValue("Config.windowOpenAt", 0)) > 0;
                const next = this.alignToWindow(now);
                this.saveNext(next);
                if (wasInWindow) {
                    GM_setValue("Config.windowOpenAt", 0);
                    try { clearRuntimeCaches("运行时段结束"); } catch (_) {}
                }
                this.clearClaim();
                this.state("waiting", { runAt: next, inWindow: false });
                const span = this.winSpan();
                const lastLog = Number(GM_getValue("Config.idleWakeLogAt", 0)) || 0;
                if (now - lastLog >= 2 * 60 * 60 * 1000) {
                    GM_setValue("Config.idleWakeLogAt", now);
                    Utils.log("🌙", `当前不在运行时段（${span}），本次唤醒不跑任务`);
                }
                return { ran: false, reason: "window" };
            }

            /* 时段内：记一个「窗口开着」的标记，供窗口结束那一刻判断是否要做清理 */
            if (!Number(GM_getValue("Config.windowOpenAt", 0))) GM_setValue("Config.windowOpenAt", now);

            /* ④ 关了「持续检测」且今天已封盘（doneDate 是 today）：醒来什么都不做。
               doneDate 由 markDayComplete() 写，而它现在看的是「服务端结论 ∪ 本地标记」，
               所以面板显示全部完成时这里一定也能停下来。 */
            const stopped = !GM_getValue("Config.keep", true)
                && (Number(GM_getValue("Config.doneDate", 0)) || 0) === Utils.getTodayNum();
            if (stopped) {
                this.state("done");
                if (!Number(GM_getValue("Config.stoppedLogAt", 0))) {
                    GM_setValue("Config.stoppedLogAt", now);
                    Utils.log("💤", "「持续检测」已关闭且今日任务已完成，之后不再跑（明天自动恢复）");
                }
                return { ran: false, reason: "done" };
            }

            /* ⑤ 搜索冷却到期就自动重置并立刻恢复 */
            try { this.autoRecoverFromCooldown(now); } catch (_) {}

            /* ⑥a 读取 zy.py 的计划（开机时刻 → 收工时刻）：拿得到就把执行点撒在这段区间里，
               拿不到就用唤醒分布的固定区间。每个上下文只拉一次，失败留给下一次敲门重试。 */
            try { await this.ensureRunPlan(); } catch (_) {}

            /* ⑥b 排程门控（放在最前面，因为它最便宜）：
               @crontab 每分钟叫醒一次，但只有「当前这一分钟正好是某个执行点」才真跑，
               其余 99% 的敲门在这里微秒级返回 —— 不碰运行锁、不打日志。
               （唯一例外：上一轮心跳超时，此时会探活一次确认死没死，见 ⑥a'。）
               peek（apply=false）只看不占：万一后面发现上一轮还在跑，这个点还能留到下一分钟。 */
            let peek = this.hitWakePoint(now, false);

            /* ⑥a0 zy.py 正在装扩展 / 校准脚本：计划里带「暂缓开跑」就先别跑。
               校准会重建脚本猫的后台上下文，已经开跑的那一轮会被当场掐断
               （线上 20:45 long 那轮跑到一半、20:46 install success 之后就没了）。
               放行通常只要几十秒；holdUntil 到期自动失效，zy.py 崩了也不会永久卡住。 */
            if (peek.hit || ownerDead) {
                await this.refreshPlanHold();
                const holdLeft = this.planHoldLeft();
                if (holdLeft > 0) {
                    const once = Number(GM_getValue("Config.planHoldLogAt", 0)) || 0;
                    if (Date.now() - once >= 5 * 60 * 1000) {
                        GM_setValue("Config.planHoldLogAt", Date.now());
                        Utils.log("⏸️", `zy.py 正在安装/校准脚本猫（还有 ${holdLeft} 秒失效）：`
                            + `本次暂不开跑，放行后下一个执行点立刻补上`);
                    }
                    return { ran: false, reason: "hold" };
                }
            }

            /* ⑥a0' 18 点后第一轮还在 3 分钟等待窗内：直接结束这次敲门。
               必须在这里拦 —— 下面「补跑」分支只认 `!peek.hit && ownerDead`，
               若让它走到那里，会把这 3 分钟当成「上一轮被打断」当场开跑，
               正好撞上 zy.py 的装扩展/校准。 */
            if (peek.waitCalib) return { ran: false, reason: "waitCalib" };

            /* ⑥a0'' 18 点后节拍未到（距上一轮结束不满 20 分钟）：静默等。
               不能再往下面的分支走 —— 那里是 18 点前「未命中执行点」的话术，
               18 点后没有执行点，打出来会是「下一执行点 今日已跑完」，误导人。 */
            if (peek.waitIdle) {
                const leftMs = Math.max(0, Number(peek.idleLeftMs) || 0);
                if (!this.isBusy(now)) this.state("waiting", { runAt: now + leftMs, byPlan: true });
                const quietAt = Number(GM_getValue("Config.after18IdleLogAt", 0)) || 0;
                if (now - quietAt >= 10 * 60 * 1000) {
                    GM_setValue("Config.after18IdleLogAt", now);
                    Utils.log("💤", `18 点后节拍未到：上一轮结束才 `
                        + `${Math.max(0, Math.round((AFTER18_IDLE_MS - leftMs) / 60000))} 分钟，`
                        + `${Math.max(1, Math.ceil(leftMs / 60000))} 分钟后再开一轮（20 分钟一次）`);
                }
                return { ran: false, reason: "idle" };
            }

            /* ⑥a' 上一轮跑到一半被打断（CDP 导航顶掉页面 / 标签页被回收 / 后台 SW 被回收）：
               那一轮停在哪就是哪，剩下的任务全都还没做，而 tasks 的日期标记只写成功的
               —— 干等下一个执行点等于白丢 1/9 的配额。这里允许当场补跑，
               每天限 RECOVER_MAX_PER_DAY 次，防止上下文反复崩时变成不停重跑。

               ⚠ 只在「非执行点的空档」才做，原因有三：
                 1) 探活要干等两个心跳周期（~42 秒），执行点命中时 ⑦ 本来就会探一次，
                    没必要每分钟付一次这个钱；
                 2) 空敲门的结论不该改动运行状态 —— 之前就是在空敲门里判死 + 清锁，
                    把还在跑的那一轮锁清掉，然后报「补跑已用满」；
                 3) 执行点命中时，⑦「上一轮还在跑就让路」的语义才是对的。 */
            if (!peek.hit && ownerDead) {
                /* 粗筛只是「4 分钟没心跳」，MV3 后台被冻结时同样成立（冻结连
                   setInterval 一起停），所以必须实测：runAlive 在涨 = 它还活着。 */
                try { ownerProbedAlive = await this.probeOwnerAlive(); } catch (_) { ownerProbedAlive = false; }
                if (ownerProbedAlive) {
                    ownerDead = false;
                } else {
                    /* 探活没回应 ≠ 死了（上下文之间 runAlive 的传递有延迟）：
                       1 分钟内还有活动就按「仍在跑」处理，与 ⑦ 同一口径。 */
                    const s1 = this.getState() || {};
                    const lastAct1 = Math.max(Number(s1.at) || 0, Number(s1.aliveAt) || 0);
                    if (lastAct1 > 0 && (Date.now() - lastAct1) < 60 * 1000) ownerDead = false;
                }
                /* 探活花掉 ~42 秒：后面所有「现在几点」的判断都要用最新时刻，
                   否则刚过点的执行点会被漏掉、排程也会算错一档。 */
                now = Date.now();
                this.startedAt = now;
                peek = this.hitWakePoint(now, false);
            }
            let recover = false;
            if (!peek.hit && ownerDead) {
                const quietMin = ownerLastAct > 0 ? Math.max(1, Math.round((Date.now() - ownerLastAct) / 60000)) : 0;
                /* ② 的 reapDeadRound 可能已经把这条死记录回收了，那就只剩补跑；
                   还有残留才需要清一遍，避免打出「已安静 0 分钟」这种假日志。 */
                if (this.getState() || Utils.lockInfo("Config.runLock")) {
                    this.resetRoundState(`上一轮跑到一半上下文被销毁（已安静 ${quietMin} 分钟）：`
                        + `运行锁与缓存已重置，今日进度与排程保留`);
                }
                const rDay = Number(GM_getValue("Config.recoverDay", 0)) || 0;
                const rUsed = rDay === todayNum ? (Number(GM_getValue("Config.recoverCount", 0)) || 0) : 0;
                if (rUsed < RECOVER_MAX_PER_DAY) {
                    GM_setValue("Config.recoverDay", todayNum);
                    GM_setValue("Config.recoverCount", rUsed + 1);
                    recover = true;
                    Utils.log("🩹", `上一轮跑到一半被打断，当场补跑（今日第 ${rUsed + 1}/${RECOVER_MAX_PER_DAY} 次，不占执行点）`);
                } else {
                    Utils.log("🟡", `上一轮跑到一半被打断，但今日补跑已用满 ${RECOVER_MAX_PER_DAY} 次，等下一个执行点`);
                }
            }

            /* ⑥a'' 收官补跑标记：最后一波没做完时由轮末写入。
               每分钟敲门都会到这里，识别到就再跑一轮（不占执行点），把欠的配额补完；
               任务做完后轮末不再写新标记，链自然停。只认当天 + 有效期内，防隔夜残留。 */
            let finaleCatchup = false;
            if (!recover && !ownerDead) {
                try {
                    const fc = GM_getValue("Config.finaleCatchup", null);
                    if (fc && fc.date === todayNum && Date.now() - (Number(fc.at) || 0) < 30 * 60 * 1000) {
                        const fDay = Number(GM_getValue("Config.finaleDay", 0)) || 0;
                        const fUsed = fDay === todayNum ? (Number(GM_getValue("Config.finaleCount", 0)) || 0) : 0;
                        if (fUsed < FINALE_CATCHUP_MAX) {
                            GM_setValue("Config.finaleDay", todayNum);
                            GM_setValue("Config.finaleCount", fUsed + 1);
                            finaleCatchup = true;
                            /* 立刻消费标记：这一声敲门已接手，下一声别再抢跑同一轮 */
                            GM_setValue("Config.finaleCatchup", null);
                            Utils.log("🔔", `收官补跑：接手上一波未完成任务，连续第 ${fUsed + 1}/${FINALE_CATCHUP_MAX} 轮（不占执行点）`);
                        } else {
                            GM_setValue("Config.finaleCatchup", null);
                            Utils.log("🟡", `收官补跑已用满 ${FINALE_CATCHUP_MAX} 轮，不再加跑`);
                        }
                    }
                } catch (_) {}
            }

            /* ⑥a''' 续跑标记：上一轮结束时「还有任务没做完，且确实推进过」（由 runNodes 写）。
               18 点后本来就是每次敲门都命中；这一条主要解决 18 点前「执行点之间空等」
               —— 用户要求「任务一直做别停」，不能做完一个节点就干等几十分钟。
               30 分钟有效期 + 本轮结束会重写/清掉，不会变成隔夜残留。 */
            let needMore = false;
            if (!recover && !finaleCatchup && !ownerDead && !this.isBusy(now)) {
                /* 18 点后一律走 20 分钟节拍，不认续跑标记 —— 否则 18 点前留下的标记
                   （30 分钟有效）会让 18 点后的头几轮绕过节拍，又变成每分钟一轮。 */
                const dn = new Date(now);
                const after18Now = dn.getHours() * 60 + dn.getMinutes() >= PLAN_CUTOFF_MIN;
                if (!after18Now) {
                    try {
                        const nm = GM_getValue("Config.needMore", null);
                        if (nm && Number(nm.date) === todayNum && (Date.now() - (Number(nm.at) || 0)) < 30 * 60 * 1000) {
                            GM_setValue("Config.needMore", null);
                            needMore = true;
                            Utils.log("🔁", "续跑：上一轮结束时还有任务没做完，本次敲门直接接着做（不占执行点）");
                        }
                    } catch (_) {}
                }
            }

            if (!peek.hit && !peek.waitCalib && !recover && !finaleCatchup && !needMore) {
                const nx = this.nextWakeAt(now);
                /* ⚠ 只有「当下没有一轮在跑」时才写 waiting。
                   以前无条件写，等于每一次空敲门都把正在跑那一轮的 running 状态覆盖掉：
                   下一声敲门 isBusy() 立刻变 false → 判定「上下文已死」→ 放开锁，
                   于是同一账号可能两轮并行，或者正在跑的那轮被当成孤儿收掉。 */
                if (!this.isBusy(now)) this.state("waiting", { runAt: nx, byPlan: true });
                const quietAt = Number(GM_getValue("Config.planSkipLogAt", 0)) || 0;
                if (now - quietAt >= 30 * 60 * 1000) {   // 30 分钟最多打一条，避免刷屏
                    GM_setValue("Config.planSkipLogAt", now);
                    const pl = peek.plan;
                    Utils.log("⏭️", `随机排程：当前时刻未命中执行点（今日 ${pl.name} `
                        + pl.points.map(x => this.fmtHM(x)).join("/")
                        + `，下一执行点 ${nx ? this.fmt(nx) : "今日已跑完"}），本次敲门静默跳过`);
                }
                return { ran: false, reason: "plan" };
            }

            /* ⑦ 上一轮还没收尾 → 先实测它死没死。
               每分钟都敲门，所以这里只在「真的有到点的执行点」时才付出探活成本；
               探活要等两个心跳周期，绝不能每分钟做一次。
               停用脚本再马上启用时，上一轮的 running 记录会留在存储里，
               而那个上下文已经不在了；只看时间戳会误判成「还在跑」，然后跳过一整轮。 */
            if (!recover && !finaleCatchup && this.isBusy(now)) {
                const s = this.getState() || {};
                let lastAct = Math.max(Number(s.at) || 0, Number(s.aliveAt) || 0);
                /* ⓪ 快速让路（v0.79）：心跳每 20 秒一次，90 秒内还有活动就一定在跑，
                   不必付 42 秒探活的代价。节点式执行让一轮变成最长 60 分钟，
                   18 点后又是每分钟敲门 —— 不拦这一层，同一轮要被探活十几次，
                   后台 CPU 全耗在「证明自己还活着」上。日志 10 分钟一条，不刷屏。 */
                if (lastAct > 0 && (now - lastAct) < 90 * 1000) {
                    const lastLog = Number(GM_getValue("Config.busyLogAt", 0)) || 0;
                    if (now - lastLog >= 10 * 60 * 1000) {
                        GM_setValue("Config.busyLogAt", now);
                        Utils.log("🟡", `定时唤醒：上一轮还在执行中（${s.ctx || "未知"}，`
                            + `${Math.round((now - lastAct) / 1000)} 秒前还有心跳），本分钟静默让路`);
                    }
                    return { ran: false, reason: "busy" };
                }
                /* ① 已经实测过「还活着」的话不用再等 42 秒探一次 */
                const alive = ownerProbedAlive === true
                    ? true
                    : await this.probeOwnerAlive().catch(() => false);
                /* 探活等了两轮心跳，now 必须跟上：否则下面「X 分钟前」会算大，
                   让掉执行点时也会按旧分钟去标记。 */
                now = Date.now();
                if (alive) {
                    /* 上一轮还活着：把这个执行点让掉（标记已用），
                       否则每分钟都会走到这里再探活一次。 */
                    this.hitWakePoint(now);
                    const atTxt = (peek && peek.hit && peek.point != null)
                        ? `${this.fmtHM(peek.point)} 这个执行点跳过`
                        : "本次补跑跳过";
                    Utils.log("🟡", `定时唤醒：上一轮确实还在执行中（${s.ctx || "未知"}，最后活动 `
                        + `${Math.max(0, Math.round((now - lastAct) / 60000))} 分钟前），${atTxt}`);
                    return { ran: false, reason: "busy" };
                }
                /* 探活没回应 ≠ 已经死了。后台上下文之间的 runAlive 传递有延迟，
                   实测会误判：日志里 Dean 14:51 那轮 15:19 还在搜，15:20:42 就被判
                   「上下文已经不在了」清掉，那一轮的份额直接白丢。
                   所以再拿时间戳复核一次：一分钟内还有活动就按「仍在跑」让路。 */
                const s2 = this.getState() || {};
                lastAct = Math.max(lastAct, Number(s2.at) || 0, Number(s2.aliveAt) || 0);
                const quietMs = Date.now() - lastAct;
                if (quietMs < 60 * 1000) {
                    this.hitWakePoint(now);
                    Utils.log("🟡", `定时唤醒：探活没回应，但它 ${Math.round(quietMs / 1000)} 秒前还在活动，`
                        + `按「仍在跑」让路，这个执行点跳过`);
                    return { ran: false, reason: "busy" };
                }
                Utils.log("♻️", `上一轮（${s.ctx || "未知"}）确实停了（已安静 ${Math.round(quietMs / 60000)} 分钟），记录作废，本轮直接开始`);
                this.resetRoundState("");
            }

            /* ⑧ 正式把这个执行点标记为已跑（落盘）：从这一刻起，同一分钟再来敲门也不会重复开跑。
               补跑不走执行点（index=-1），排程里那个被中断的点仍然算「跑过」——
               它的活儿这一轮接手续做，不该再被算成一次新的执行点。 */
            let wakeHit;
            if (recover || finaleCatchup || needMore) {
                const d0 = new Date(now);
                wakeHit = {
                    hit: true, point: d0.getHours() * 60 + d0.getMinutes(),
                    index: -1, plan: peek.plan, leadMs: 0,
                    recovered: !!recover, finale: !!finaleCatchup, needMore: !!needMore
                };
            } else {
                wakeHit = this.hitWakePoint(now);
                if (!wakeHit.hit) return { ran: false, reason: "plan" };
            }

            /* ⑨ 定时器提前几秒触发时（15:52:58 就叫醒了），等到 15:53 整分再开跑。
               正常情况下不会有这一步 —— @crontab 每分钟一次，到点那一分钟就执行，
               不需要「先认领再干等下一个 10 分钟刻度」。 */
            const leadMs = Math.max(0, Number(wakeHit.leadMs) || 0);
            if (leadMs > 1200) {
                Utils.log("⏳", `定时唤醒：定时器早到 ${Math.round(leadMs / 1000)} 秒，等到 `
                    + `${this.fmtHM(wakeHit.point)} 整分再开跑`);
                await Utils.delay(leadMs);
            }

            /* ⑩ 开跑抖动：四账号并行跑，但起跑那一秒错开，避免几个浏览器同一秒打同一批接口。
               现在执行点都在 10 分钟网格上（四账号必然有部分分钟重合），所以抖动不再是
               全区间随机，而是按账号盐切成 4 个专属秒段（0-13 / 13-26 / 26-39 / 39-52 秒）：
               同一分钟命中时，四个浏览器分别落在不同秒段，不会撞在同一秒。
               抖动仍被夹在「计划那一分钟」内（最多等到第 55 秒），不会把 16:20 拖成 16:21。
               Config.startJitter 设 0 = 完全同步开跑。 */
            const jitterCfg = GM_getValue("Config.startJitter", null);
            const jitterSec = (jitterCfg === null || jitterCfg === undefined || jitterCfg === "")
                ? CRON_JITTER_DEFAULT
                : Math.max(0, Math.min(CRON_JITTER_MAX / 1000, Number(jitterCfg) || 0));
            const nowD = new Date();
            const secInMin = nowD.getSeconds() + nowD.getMilliseconds() / 1000;
            /* 还能在这一分钟内等多久：最多到第 JITTER_IN_MINUTE_SEC 秒 */
            const roomMs = Math.max(0, (JITTER_IN_MINUTE_SEC - secInMin) * 1000);
            let waitMs = 0;
            if (jitterSec > 0 && roomMs > 0) {
                const cap = Math.min(Math.round(jitterSec * 1000), roomMs);
                /* 账号专属秒段：4 段各 13 秒，段内再随机，保证同分钟不同秒 */
                const phase = Math.abs(Number(this.salt()) || 0) % 4;
                const bandLo = Math.min(phase * 13000, Math.max(0, cap));
                const bandHi = Math.min(bandLo + 12000, Math.max(0, cap));
                waitMs = bandHi > bandLo
                    ? Utils.randomRange(bandLo, bandHi)
                    : (cap <= CRON_JITTER_MIN ? Utils.randomRange(0, cap) : Utils.randomRange(CRON_JITTER_MIN, cap));
            }
            if (waitMs > 0) {
                Utils.log("⏳", `定时唤醒：错开 ${Math.round(waitMs / 1000)} 秒后开跑（多账号起跑错峰，各账号仍并行执行）`);
                await Utils.delay(waitMs);
            }
            if (waitMs > 0 || leadMs > 1200) {
                if (!this.inWindow(Date.now())) {
                    /* 等待期间跨出时段：把这个执行点退回，明天/下一窗口可再用 */
                    try {
                        const pp = GM_getValue(this.PLAN_KEY(), null);
                        if (pp && pp.date === Utils.getTodayNum()
                            && wakeHit.index >= 0 && wakeHit.index < pp.used.length) {
                            pp.used[wakeHit.index] = false;
                            GM_setValue(this.PLAN_KEY(), pp);
                        }
                    } catch (_) {}
                    this.clearClaim();
                    return { ran: false, reason: "window" };
                }
            }

            /* ⑪ 正式开跑：认领 → 交给 init() → 等它跑完再退出上下文 */
            this.claim();
            this.state("claimed");
            /* 记下本轮真正开始时刻：收尾时用它算用时（认领时刻会被重建覆盖，不能用） */
            GM_setValue("Config.roundStartAt", Date.now());
            Utils.log("⏰", `定时唤醒：开始本轮任务（${this.ctxName()}上下文${wakeHit.recovered ? "，接手续做上一轮被中断的活儿" : ""}${wakeHit.finale ? "，收官补跑把没做完的补完" : ""}）`);
            try {
                await this.task({ force: false });
            } catch (e) {
                Utils.log("🔴", `本轮任务启动失败：${e && e.message ? e.message : e}`);
                this.clearClaim();
                return { ran: false, reason: "error" };
            }
            return { ran: true, reason: "run" };
        },

        autoRecoverFromCooldown(now) {
            let guard;
            try { guard = API.searchGuard(); } catch (_) { return false; }
            if (!guard || !guard.cooldownUntil) return false;
            /* 还没到期就什么都不做 */
            if (now < guard.cooldownUntil) return false;

            /* 同一次冷却只处理一次：把 cooldownUntil 的值当作这次冷却的身份，
               处理过就记下来，避免心跳反复重跑重置。 */
            const stampKey = "Config.searchAutoReset";
            const done = Number(GM_getValue(stampKey, 0)) || 0;
            if (done === guard.cooldownUntil) return false;
            GM_setValue(stampKey, guard.cooldownUntil);

            const span = Math.round((now - guard.cooldownUntil) / 60000);
            Utils.log("🔄", `搜索冷却已到期（${guard.reason || "连续多轮未记账"}${span > 0 ? `，迟到 ${span} 分钟` : ""}），`
                + "开始自动重置运行状态并立即恢复任务");

            /* 冷却到期 = 上一轮的节流结论作废：清运行痕迹 + 今日进度，让这一轮重新尝试 */
            try {
                doSoftReset();
            } catch (e) {
                Utils.log("🟡", `自动重置异常：${e && e.message ? e.message : e}，改为只解除冷却`);
                try { API.clearSearchGuard(true); } catch (_) {}
            }
            /* 清完把认领与排期归位：当前就在本轮里，直接往下跑即可 */
            this.clearClaim();
            GM_setValue("Config.runState", null);
            return true;
        },


        reapDeadRound(now = Date.now()) {
            const dead = this.reap(now);
            if (!dead) return false;
            Utils.log("♻️", `上一轮（${dead.ctx || "未知"}）已经 ${Math.max(0, Math.round((now - (dead.at || now)) / 60000))} 分钟没有动静，判定为卡死，已回收运行标记`);
            return true;
        },

        /* fire() 已删除：定时模式下 runOnce() 自己负责认领与开跑，
           不存在「一个常驻上下文反复触发」的场景。 */
    };

    let bootstrapped = false;
    const bootstrap = () => {
        if (bootstrapped) return;
        bootstrapped = true;
        TaskManager.init();

        Utils.probeCookiePermission().catch(() => {});

        const consumePendingPaste = () => {
            if (!GM_getValue("Config.pendingPaste", false) || !Utils.hasDOM()) return false;
            GM_setValue("Config.pendingPaste", false);
            Utils.waitForBody().then(ok => {
                if (!ok) return;
                setTimeout(() => {
                    Auth.pasteFlow().catch(e => Utils.log("🔴", `粘贴授权码失败：${e.message}`));
                }, 500);
            });
            return true;
        };
        if (!consumePendingPaste() && Utils.hasDOM()) {
            window.addEventListener("focus", () => {
                setTimeout(() => consumePendingPaste(), 300);
            }, { once: false });
        }
    };

    const isDayComplete = () => {
        TaskManager.init();
        const today = RewardsAuto.state.dateNowNum;
        const checkDone = (enabled, date) => !enabled || date === today;
        const processed = GM_getValue("Config.dailySetProcessed", []);
        const dailySetDone = (Array.isArray(processed) && processed.length > 0 && processed[0]?.date === today)
            || (Number(GM_getValue("Config.dailySetDoneDate", 0)) || 0) === today;
        const edgeDone = !EdgeStreak.enabled()
            || !Utils.has("Config.token")
            || (() => { const st = EdgeStreak.state(); return st.complete || st.giveUp; })();
        return checkDone(GM_getValue("Tasks.sign"), TaskManager.signDate) &&
            checkDone(GM_getValue("Tasks.read"), TaskManager.readDate) &&
            checkDone(GM_getValue("Tasks.promos"), TaskManager.promosDate) &&
            checkDone(GM_getValue("Tasks.search"), TaskManager.searchDate) &&
            dailySetDone &&
            edgeDone;
    };

    const markDayComplete = () => {
        const today = RewardsAuto.state.dateNowNum;
        const prev = Number(GM_getValue("Config.doneDate", 0)) || 0;
        GM_setValue("Config.doneDate", today);
        /* llq.py 靠这句判断「这个账号今天已经没事了」，会立刻关闭浏览器省资源。
           文案必须保留「今日所选任务已全部完成」+「休眠」两个关键词，别改。 */
        if (prev !== today) Utils.log("💤", "今日所选任务已全部完成，继续保持休眠...");
    };

    /* llq.py：今日任务数量报告（[QLREPORT-START]，每天每账号 llq 侧只取第一条） */
    const emitStartReport = async () => {
        try {
            let info = null;
            try { info = await API.getRewardsInfo(); } catch (_) {}
            let promoCount = 0;
            try {
                const map = await API.getPromotionMap();
                if (map) promoCount = map.size;
            } catch (_) {}
            const pcMax = Number(info && info.pc && info.pc.max) || Number(RewardsAuto.state.pcMax) || 0;
            const mobMax = Number(info && info.mobile && info.mobile.max) || 0;
            const readMax = Number(info && info.readMax) || Number(RewardsAuto.state.readMax) || 30;
            const readPro = Number(info && info.readProgress) || 0;
            Utils.qlReport("start", {
                search: { pc: pcMax, m: mobMax },
                read: { max: readMax, articles: Math.ceil(Math.max(0, readMax - readPro) / 3) },
                promos: { count: promoCount },
                sign: { count: 1 },
            });
        } catch (_) {}
    };

    /* 定时模式下 init 必须 await：runOnce() 要等这一轮真的结束才返回，
       上下文随后正常退出。以前用 setTimeout 甩出去就不管了，常驻上下文里没问题，
       定时上下文里会「任务还没跑完，执行体已经结束」。 */
    /* force=true 表示「用户手动点了立即运行」：跳过运行时段与「今日已完成」两道闸门。
       定时唤醒传 false，仍然受时段限制。 */
    const init = async (opts = {}) => {
        const force = !!(opts && opts.force);
        bootstrap();

        const isKeep = GM_getValue("Config.keep", true);
        if (!force && !isKeep && isDayComplete()) {
            markDayComplete();
            Sched.finish(false);
            return;
        }

        if (!force && !Sched.inWindow(Date.now())) {
            const next = Sched.alignToWindow(Date.now());
            const span = Sched.winSpan();
            Utils.log("🌙", `当前不在运行时段（${span}），已排到 ${Sched.fmt(next)} 开始，窗口外不会跑任务`);
            Sched.saveNext(next);
            Sched.clearClaim();
            Sched.state("waiting", { runAt: next, inWindow: false });
            return;
        }

        /* 起跑前的第二层随机延时。原来是固定 3~12 秒，跟 runOnce ⑩ 的 5~95 秒
           错峰叠加 —— 实测 14:30:00 敲门、14:31:33 才进执行流程，白等 93 秒，
           一天 9 轮就是十几分钟从任务时间里漏掉。错峰交给 ⑩ 一处做就够了，
           这里默认 0；确实想再加延时用 Config.startupDelay（毫秒）。 */
        const startupMax = Math.max(0, Number(GM_getValue("Config.startupDelay", 0)) || 0);
        const delay = startupMax > 0 ? Utils.randomRange(0, startupMax) : 0;
        if (delay > 0) {
            Utils.log("⏳", `${(delay / 1000).toFixed(1)} 秒后启动...`);
            Sched.state("waiting", { runAt: Date.now() + delay });
            await Utils.delay(delay);
        }
        /* llq.py：今日任务数量报告（异步发，不阻塞主流程） */
        emitStartReport();
        try {
            await TaskManager.runAll({ force });
        } catch (e) {
            Utils.log("🔴", `本轮任务异常：${e && e.message ? e.message : e}`);
        } finally {
            Sched.finish(true, TaskManager.lastRunStarted);
        }
    };

    const isBingSearchPage = typeof location !== "undefined"
        && location.hostname
        && (location.hostname === "www.bing.com" || location.hostname === "cn.bing.com");

    if (IS_OAUTH_CALLBACK) {
        Auth.handleCallback().catch(e => Utils.log("🔴", `授权回调处理失败：${e.message}`));
        return;
    }

    if (isBingSearchPage) {

        const sp = (() => { try { return new URLSearchParams(location.search); } catch (_) { return new URLSearchParams(); } })();
        const isRewardSearch = /^(ML2W4J|ML2Y2H)$/i.test(sp.get("form") || "")
            || (sp.get("PUBL") || "").toUpperCase() === "REWARDSDO";

        if (isRewardSearch) {
            Promise.resolve().then(async () => {
                try {
                    const host = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : window;
                    let ready = false;
                    for (let i = 0; i < 24; i++) {
                        await Utils.delay(500);
                        if (typeof host.sj_rra === "function" && typeof host.sj_gx === "function") { ready = true; break; }
                    }
                    if (!ready) {
                        GM_log("🎯 奖励搜索页：页面未提供 sj_rra（非 Bing 奖励页或模块未加载）");
                        return;
                    }
                    const href = String(location.href || "");
                    const rdrig = sp.get("rdrig") || "";
                    const ig = String((host._G && host._G.IG) || "");
                    host.sj_rra(href);
                    GM_log(`🎯 奖励搜索页：已调用 sj_rra（IG=${ig.slice(0,12)||"无"} rdrig=${rdrig ? rdrig.slice(0,8) : "无"}）`);
                    GM_setValue("Config.rewardSearchSeenAt", Date.now());

                    GM_log("🎯 注意：sj_rra 已尽力上报；若卡片仍显示未完成，需在 earn 页手动点一次该卡");
                } catch (e) {
                    GM_log(`🎯 奖励搜索页处理异常：${e.message}`);
                }
            });
        }
        GM_log("⏭️ 当前为 Bing 搜索页，跳过脚本初始化（防止重复执行/打开多余页面）");
        return;
    }

    bootstrap();

    /* ── 认领本账号的 CDP 端口 ─────────────────────────────────────────────
       通道优先级：
         ① zy.py 端口表（/zy-ports.json，按 MUID 匹配）—— 后台可用，最稳
         ② rewards 页 localStorage.__mp_cdp_port —— 需要页面上下文注入
         ③ 手工配置 Config.cdpPort
         ④ 回退 9222（单账号/手动调试）
       为什么 ① 是主通道：这套脚本是 @crontab 后台脚本，容器里页面上下文并不
       一定注入（2026-11-20 四小时四账号日志里「🖥️ 页面上下文已加载」出现 0 次），
       所以 localStorage 那条路随时可能是死的。而后台一定能读自己的 cookie，
       每个 profile 的 MUID 不同 → 拿 MUID 去端口表里查，就能确定性认领。 */
    const PORT_TABLE_URLS = [
        "http://127.0.0.1:47831/zy-ports.json",
        "http://127.0.0.1:47832/zy-ports.json",
        "http://127.0.0.1:47833/zy-ports.json",
        "http://127.0.0.1:8080/zy-ports.json",
        "http://127.0.0.1:8081/zy-ports.json",
        "http://127.0.0.1:8082/zy-ports.json"
    ];

    const PortResolver = {
        _tries: 0,
        _fromTable: false,
        /* 认领日志节流：端口映射稳定后就别每分钟刷屏，只在「首次 / 映射变化」时打一条。
           失败类日志按天去重，避免异常时同样刷屏。存 GM 而不是内存，因为 @crontab
           每次唤醒都是新后台上下文，对象状态留不下来。 */
        _today() {
            const d = new Date();
            return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
        },
        _claimLog(signature, emoji, text) {
            try {
                const key = "Config.portClaimLogSig";
                if (GM_getValue(key, "") === signature) return;
                GM_setValue(key, signature);
            } catch (_) { /* 存储不可用时退化为照常打印 */ }
            Utils.log(emoji, text);
        },
        /* 读本机 MUID：ScriptCat 的 GM_cookie 是回调式，包成 Promise */
        async _ownMuid() {
            try {
                if (typeof GM_cookie === "undefined" || !GM_cookie || !GM_cookie.list) return "";
                const list = await new Promise((res) => {
                    try {
                        GM_cookie.list({ domain: "bing.com" }, (c, e) => {
                            if (e) return res([]);
                            res(Array.isArray(c) ? c : (c ? [c] : []));
                        });
                    } catch (_) { res([]); }
                });
                const hit = (list || []).find(c => c && c.name === "MUID" && c.value);
                return hit ? String(hit.value) : "";
            } catch (_) { return ""; }
        },
        async resolve() {
            if (this._fromTable) return Number(GM_getValue("Config.cdpPort", 0)) || 0;
            /* 允许重试：浏览器可能先起来、zy.py 的登录检查还没把端口表发布出来，
               一次失败就永久放弃的话等于没做，所以给 3 次机会（外层隔 60 秒再踢）。 */
            if (this._tries >= 3) return 0;
            this._tries++;
            const muid = await this._ownMuid();
            if (!muid) {
                this._claimLog("no-muid:" + this._today(), "🟡",
                    "认领端口：读不到本机 MUID（GM_cookie 不可用），走兜底通道");
                return 0;
            }
            let table = null, hitUrl = "";
            for (const url of PORT_TABLE_URLS) {
                try {
                    const r = await Utils.xhrFull({ url, timeout: 4000, cookie: false });
                    const txt = String((r && r.text) || "");
                    if (!txt.trim()) continue;
                    table = JSON.parse(txt);
                    hitUrl = url;
                    break;
                } catch (_) { /* 换下一个端口 */ }
            }
            if (!table || !table.accounts) {
                this._claimLog("no-table:" + this._today(), "🟡",
                    "认领端口：读不到 zy.py 端口表（47831/32/33、8080/81/82 都不通），走兜底通道");
                return 0;
            }
            let mine = null;
            for (const name of Object.keys(table.accounts)) {
                const info = table.accounts[name] || {};
                if (String(info.muid || "").toLowerCase() === muid.toLowerCase()) {
                    mine = { name: name, port: Number(info.port) || 0 };
                    break;
                }
            }
            if (!mine) {
                this._claimLog("no-match:" + muid.slice(0, 8) + ":" + this._today(), "🔴",
                    `认领端口：端口表里没有本机 MUID（${muid.slice(0, 8)}…）`
                    + "→ zy.py 还没发布这台浏览器，本轮用兜底端口");
                return 0;
            }
            if (!mine.port) return 0;
            const saved = Number(GM_getValue("Config.cdpPort", 0)) || 0;
            if (saved !== mine.port) {
                GM_setValue("Config.cdpPort", mine.port);
                CDP._portAt = 0;      /* 端口变了，旧探测结果作废 */
                CDP._portCached = 0;
            }
            this._fromTable = true;
            this._claimLog("ok:" + muid + "|" + mine.name + "|" + mine.port + "|" + hitUrl, "🎯",
                `认领端口：MUID ${muid.slice(0, 8)}… → 账号 ${mine.name} → CDP ${mine.port}（${hitUrl}）`);
            return mine.port;
        },
        /* 三条通道全落空时每天只报一次：这是排查「为什么四个账号都连 9222」的锚点 */
        warnMissingOnce() {
            try {
                const d = new Date();
                const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
                if (GM_getValue("Config.portWarnDay", "") === key) return;
                GM_setValue("Config.portWarnDay", key);
                Utils.log("🔴", `端口认领失败：端口表 / localStorage 标记都没拿到，回退 `
                    + `Config.cdpPort=${Number(GM_getValue("Config.cdpPort", 0)) || "未设（→9222）"}`
                    + "。多账号下会串到第一个账号的浏览器，需检查 zy.py 端口表接口。");
            } catch (_) {}
        }
    };

    /* 最多踢 3 次：zy.py 的登录检查要导航+读页面，端口表可能晚于浏览器就绪，
       一次拿不到就放弃等于白做，所以隔 60 秒重试，2 分钟内还没拿到才认输。 */
    const kickPortResolve = (left) => {
        PortResolver.resolve().then(p => {
            if (p) return;
            if (left > 1 && !PortResolver._fromTable) {
                setTimeout(() => kickPortResolve(left - 1), 60000);
                return;
            }
            const cur = Number(GM_getValue("Config.cdpPort", 0)) || 0;
            Utils.log("🟡", `本轮使用兜底端口：${cur || 9222}`
                + (cur ? "（Config.cdpPort）" : "（默认值，多账号会串号）"));
        }).catch(() => {});
    };
    try { kickPortResolve(3); } catch (_) {}

    const inBgCtx = Utils.isBackground();
    /* @run-at document-start 时 <html> 可能还没创建（document.documentElement 为 null），
       hasDOM() 因此返回 false，isBackground() 会把「页面」误判成「后台」，
       整段页面启动逻辑（含下面的调试端口识别）就被静默跳过了。
       所以只要当前确实在 rewards 页，就按页面上下文处理。 */
    const onRewardsPage = (typeof location !== "undefined" && location.hostname === "rewards.bing.com");
    if (!inBgCtx || onRewardsPage) {
        Utils.log("🖥️", `页面上下文已加载（${location.hostname}），任务轮交给定时唤醒`);
        /* llq.py 启动浏览器后，会用 CDP 把「这个浏览器自己的调试端口」写进
           rewards 页面的 localStorage。这里轮询读到就存进脚本存储，
           后台轮次据此连自己这个浏览器，多账号才不会串端口。
           读不到就保持默认 9222（单账号/手动调试仍然可用）。 */
        try {
            let tries = 0;
            const pickPort = () => {
                tries++;
                /* 端口表已经认领成功 → localStorage 只是补充证据，不许覆盖 */
                if (PortResolver._fromTable) { clearInterval(timer); return; }
                let port = 0;
                try { port = Number(localStorage.getItem("__mp_cdp_port") || 0); } catch (_) {}
                if (port > 0) {
                    const saved = Number(GM_getValue("Config.cdpPort", 0)) || 0;
                    if (saved !== port) {
                        GM_setValue("Config.cdpPort", port);
                        CDP._portAt = 0;
                        CDP._portCached = 0;
                        GM_log(`🎯 已识别本浏览器调试端口：${port}（来源 localStorage 标记）`);
                    }
                }
                if (port > 0 || tries >= 30) {
                    clearInterval(timer);
                    /* 连兜底都没拿到：这条日志是排查「为什么串到 9222」的唯一线索，
                       每天只报一次，别每轮刷屏。 */
                    if (port <= 0) PortResolver.warnMissingOnce();
                }
            };
            const timer = setInterval(pickPort, 2000);
            pickPort();
        } catch (_) {}
    }

    const diagSchedStatus = () => {
        const now = Date.now();
        const next = Sched.nextWakeAt(now);
        const last = Sched.lastRun();
        const st = Sched.getState();
        const claim = Sched.getClaim();
        const lock = Utils.lockInfo("Config.runLock");
        const phaseText = { claimed: "已触发，等待执行", waiting: "等待延时结束", running: "正在执行", done: "上一轮已完成", idle: "空闲" };
        const lastAct = st ? Math.max(Number(st.at) || 0, Number(st.aliveAt) || 0) : 0;
        let text = "🕒 定时调度状态\n\n";
        const wcfg = Sched.winCfg();
        text += `运行时段：${wcfg.allDay
            ? "全天不限（开始=结束，已关闭时段限制）"
            : `${Sched.fmtHM(wcfg.startMin)}~${Sched.fmtHM(wcfg.endMin)}`
              + (wcfg.planUsed
                  ? "（就是 zy.py 计划的开机~收工，配置项不参与）"
                  : "（未读到 zy.py 计划，用的是配置兜底）")}\n`;
        text += `当前状态：${Sched.inWindow(now) ? "✅ 在运行时段内" : "🌙 时段外，窗口内不会开新的一轮"}\n`;
        text += `敲门节拍：@crontab 理论 ${CRON_WAKE_MS / 60000} 分钟一次，实测引擎会退避到约 20 分钟；`
            + `真正准点的是「定时执行」的整 ${SCHED_GRID} 分钟。敲门 ≠ 开跑\n`;
        const jitterCfgNow = GM_getValue("Config.startJitter", null);
        const jitterNow = (jitterCfgNow === null || jitterCfgNow === undefined || jitterCfgNow === "")
            ? CRON_JITTER_DEFAULT
            : Math.max(0, Math.min(CRON_JITTER_MAX / 1000, Number(jitterCfgNow) || 0));
        text += `执行点：对齐 ${SCHED_GRID} 分钟网格（计划时刻 = 实际开跑时刻，四账号各选不同格子）\n`;
        text += `开跑偏移：${jitterNow > 0
            ? `随机 ${jitterNow * 1000 > CRON_JITTER_MIN ? Math.round(CRON_JITTER_MIN / 1000) + "~" : "0~"}${jitterNow} 秒错峰（实际夹在 ${JITTER_IN_MINUTE_SEC} 秒内，不会跨到下一分钟）`
            : "0 秒（四账号同一时刻一起开跑）"}\n`;
        const rDayNow = Number(GM_getValue("Config.recoverDay", 0)) || 0;
        const rUsedNow = rDayNow === Utils.getTodayNum()
            ? (Number(GM_getValue("Config.recoverCount", 0)) || 0) : 0;
        text += `中断补跑：今日 ${rUsedNow}/${RECOVER_MAX_PER_DAY} 次`
            + `（上一轮跑到一半被 CDP 导航/标签页回收打断时当场补跑，不占执行点）\n`;
        const feDay = Number(GM_getValue("Config.finaleDay", 0)) || 0;
        const feUsed = feDay === Utils.getTodayNum() ? (Number(GM_getValue("Config.finaleCount", 0)) || 0) : 0;
        const fePending = GM_getValue("Config.finaleCatchup", null);
        text += `收官补跑：今日 ${feUsed}/${FINALE_CATCHUP_MAX} 次`
            + `（最后一波没做完就连续加跑，不占执行点）${fePending ? " · 当前有补跑请求待下一声敲门接手" : ""}\n`;
        const tplan = Sched.todayPlan(now);
        const hint = Sched.planRange(now);
        text += `排程来源：${hint
            ? `📋 zy.py 计划（开机 ${Sched.fmtHM(hint.startMin)} → 收工 ${Sched.fmtHM(hint.untilMin)}，执行点撒在 ${Sched.fmtHM(hint.lo)}~${Sched.fmtHM(hint.hi)}）`
            : "🎲 启动起排（没读到 zy.py 计划，从本账号实际启动时刻开始撒点）"}\n`;
        text += `今日随机排程：${Sched.planSummary(tplan)}\n`;
        text += `最近结束：${Sched.fmt(last)}\n`;
        text += `下一个执行点：${next ? Sched.fmt(next) + `（约 ${Math.max(0, Math.ceil((next - now) / 60000))} 分钟后）` : "今日已全部跑完"}\n`;
        text += `上次结束：${last ? Sched.fmt(last) : "无"}（排期记录 ${Sched.fmt(Sched.plan(now))}）\n`;
        text += `运行阶段：${st ? (phaseText[st.phase] || st.phase) : "未知"}${st && st.ctx ? `（${st.ctx}）` : ""}\n`;
        if (st) {
            text += `  最后进展：${Sched.fmt(st.at)}（${Math.max(0, Math.round((now - (Number(st.at) || 0)) / 60000))} 分钟前）\n`;
            text += `  最后心跳：${Sched.fmt(st.aliveAt)}${st.aliveAt ? `（${Math.max(0, Math.round((now - Number(st.aliveAt)) / 1000))} 秒前）` : "（未记录）"}\n`;
        }
        if (lock) text += `运行锁：${lock.mine ? "✅ 本上下文持有" : "🔒 其它上下文持有"}（${Sched.fmt(lock.ts)} 更新）\n`;
        else text += "运行锁：空闲\n";
        if (claim) text += `当前认领：${claim.ctx || "未知"}，${Sched.fmt(claim.at)}\n`;
        text += `本次上下文：${Sched.ctxName()}（已运行 ${Math.round((now - Sched.startedAt) / 60000)} 分钟）\n`;
        text += `卡死阈值：无动静 ${RUN_STALE / 60000} 分钟 / 无进展 ${ROUND_STALL / 60000} 分钟 / 单轮硬上限 ${ROUND_HARD_LIMIT / 60000} 分钟\n\n`;
        if (st && st.phase === "running" && !Sched.isBusy(now)) {
            text += `⚠️ 有一条 running 记录已经 ${Math.max(0, Math.round((now - lastAct) / 60000))} 分钟没动静，下一次调度会自动回收它。\n\n`;
        }
        text += "定时模式：@crontab 每分钟敲门一次（9~23 点，与 zy.py 的 RUN_WINDOW 对齐），但敲门 ≠ 开跑；能不能跑只看 zy.py 计划。\n"
            + "两层随机：朱雀面板的「随机时间启动任务」在 9:00-15:00 内随机拉起 zy.py，"
            + "zy.py 把开机时刻写进计划文件，本脚本再把执行点撒在「开机时刻~收工时刻」之间；"
            + "读不到计划文件（无头模式 / GM 里残留旧地址 8080 / 未生成）时，不再用固定的上午/下午区间，"
            + "而是从本账号实际启动那一刻起排（落盘固定、当天稳定），把剩余时间铺满 —— \n"
            + "启动起排：从启动时刻到收工线之间，按「一轮 ≈ 60 分钟」的间距撒 3~9 个精确到分钟的随机执行点"
            + "（间隔约 70 分钟，点与点首尾相接）；命中一个点就连续做到盘点为空，"
            + "循环期间撞到的后续执行点直接让路并合并进这一轮，"
            + "启动再晚也不会把点全排到已过去的时间导致空转；只有当前这一分钟正好是某个未跑过的执行点才真跑，其余敲门静默跳过。\n"
            + "执行点由「日期 + 本账号随机盐」确定性生成：区间四账号一致，执行点各账号互不相同"
            + "（不会同一分钟一起打接口）；到点那一分钟就叫醒并立即开跑，不用等下一个整点刻度；"
            + "同一天稳定、跨天自动重建。运行时段默认 auto（跟随 zy.py 计划的开机~收工），18 点后不再安排执行点。\n"
            + "浏览器关闭期间不会唤醒。\n"
            + "「运行阶段」长期停在「正在执行」而最后进展很久没动，说明那一轮卡住了，下一轮会回收它。\n"
            + "想立刻跑一轮：脚本菜单「🚀 立即运行」。";
        return text;
    };


    try {
        const host = (typeof unsafeWindow !== "undefined" && unsafeWindow) ? unsafeWindow : globalThis;
        host.__MPDiagnostics = {
            edgeStreak: diagEdgeStreak,
            pcSearch: diagPcSearch,
            region: diagRegion,
            schedule: diagSchedStatus,
            claim: diagClaim
        };
    } catch (_) {}

    if (typeof __MP_TEST_HOOK__ === "function") {
        try {
            __MP_TEST_HOOK__({ Utils, API, RewardsAuto, RegionGuard, Webhooks, Sched, TaskManager, Auth,
                CardLock, SEARCH_PACER, EdgeStreak, EdgePacer, UA, EDGE, CDP,
                BrowserEnv, ActionMap, ClaimPoints, MONTHLY });
        } catch (_) {}
    }

    /* 定时模式入口：只有后台（@crontab 唤醒）上下文才发起任务轮。
       页面上下文只承担页面代发 / 菜单 / 授权，不再自己跑一轮。
       runOnce 返回的是「这一轮跑完」的 Promise，跑完上下文就正常结束 ——
       不再用「永不 resolve 的 Promise」挂住后台，避免每次唤醒都堆一个实例。 */
    if (inBgCtx) {
        return Sched.runOnce(init);
    }
})();

if (__scBgKeepAlive && typeof __scBgKeepAlive.then === "function") {
    return __scBgKeepAlive;
}
