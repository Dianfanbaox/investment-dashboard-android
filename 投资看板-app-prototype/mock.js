/* =========================================================
   投资看板 APP 1.0 · Mock + 持久化 API
   localStorage 命名空间统一加 `app_` 前缀，避免和网页版冲突。
   Schema 完全对齐 src/types/index.ts。
   ========================================================= */
(function (global) {
  'use strict';

  // schema v1→v2 迁移：旧版用 side/code/qty/date，新版用 type/stockCode/quantity/timestamp
  // 检测到旧 schema 自动清掉，让下面 seed 重新写入
  try {
    var _sv = localStorage.getItem('app_schema_version');
    if (_sv !== '5') {
      // 先写版本号：确保即便后续清库失败，也不会每次冷启动都重复迁移清库（#20）。
      // 若写入版本号本身失败（配额超限等），则放弃清库，避免静默丢数据。
      var _migrated = false;
      try { localStorage.setItem('app_schema_version', '5'); _migrated = true; }
      catch (e) { console.warn('[mock] 无法写入 schema 版本，跳过迁移清库以免丢数据', e); }
      if (_migrated) {
        var _sample = JSON.parse(localStorage.getItem('app_trades') || 'null');
        if (_sample && _sample.length > 0 && !_sample[0].stockCode) {
          ['app_trades','app_stockPoolStocks','app_disciplineRules','app_violationRecords','app_tradingInsights'].forEach(function(k){
            try { localStorage.removeItem(k); } catch(e) {}
          });
          console.warn('[mock] schema v1 -> v2 migrated (old local storage cleared)');
        } else {
          // v2/v3/v4：price 字段补全，清 stockPool 重 seed
          try { localStorage.removeItem('app_stockPoolStocks'); } catch(e) {}
        }
        // v5：清掉历史遗留的 "undefined" 脏键。
        // 早前 writeList(KEYS.stockPool,...) 的键名笔误会往 localStorage 写键为 "undefined" 的数据，
        // 导致刷新行情/批量添加的结果不落盘。改对键名后，老设备上这堆垃圾数据要一并清掉。
        try { localStorage.removeItem('undefined'); } catch (_e2) {}
      }
    }
  } catch (_e) {}

  const KEYS = {
    trades: 'app_trades',
    stockPoolStocks: 'app_stockPoolStocks',
    positionQuotes: 'app_position_quotes',
    accountSnapshots: 'app_account_snapshots',
    disciplineRules: 'app_disciplineRules',
    violationRecords: 'app_violationRecords',
    tradingInsights: 'app_tradingInsights',
    aiReports: 'app_aiReports',
    // APP 自己的配置键（Web 版无前缀）
    userNickname: 'app_user_nickname',
    userAvatar: 'app_user_avatar',
    userOccupation: 'app_user_occupation',
    userInvestingStyles: 'app_user_investing_styles',
    userBio: 'app_user_bio',
    userPhone: 'app_user_phone',
    userEmail: 'app_user_email',
    aiApiKey: 'app_ai_api_key',
    aiApiUrl: 'app_ai_api_url',
    aiModel: 'app_ai_model',
  };

  /* ---------------- 种子数据（按 Web 版 schema） ---------------- */

  const seedTrades = [
    { id: 'T000', stockCode: '600519',stockName: '贵州茅台',    type: 'buy',  quantity: 30,  price: 1188.00, fee: 32.40, notes: '首次建仓茅台核心仓位',       tags: ['建仓','消费'], timestamp: '2026-02-15T10:00:00+08:00' },
    { id: 'T001', stockCode: '00700', stockName: '腾讯控股',   type: 'buy',  quantity: 200, price: 342.00, fee: 18.20, notes: '加仓核心资产，分批买入',     tags: ['加仓','核心'], timestamp: '2026-08-12T10:30:00+08:00' },
    { id: 'T002', stockCode: 'AAPL',  stockName: 'Apple Inc.',  type: 'buy',  quantity: 80,  price: 178.50, fee: 8.60,  notes: '苹果发布会前建仓',           tags: ['科技','事件驱动'], timestamp: '2026-08-18T14:10:00+08:00' },
    { id: 'T003', stockCode: '600519',stockName: '贵州茅台',    type: 'sell', quantity: 20,  price: 1538.0, fee: 28.50, notes: '到达止盈位卖出部分',         tags: ['止盈','消费'], timestamp: '2026-08-20T09:35:00+08:00' },
    { id: 'T004', stockCode: '01810', stockName: '小米集团-W',  type: 'buy',  quantity: 2000,price: 22.40, fee: 16.40, notes: 'SU7 销量继续超预期',         tags: ['汽车','硬件'], timestamp: '2026-08-22T11:00:00+08:00' },
    { id: 'T005', stockCode: 'TSLA',  stockName: 'Tesla Inc.',  type: 'buy',  quantity: 30,  price: 242.70, fee: 12.60, notes: '机器人预期+自动驾驶',        tags: ['新能源'], timestamp: '2026-08-25T16:20:00+08:00' },
    { id: 'T006', stockCode: 'NVDA',  stockName: 'NVIDIA',      type: 'buy',  quantity: 40,  price: 128.50, fee: 10.20, notes: 'AI算力龙头，回调建仓',       tags: ['AI','半导体'], timestamp: '2026-08-28T09:45:00+08:00' },
  ];

  const seedStockPool = [
    { id: 'S001', code: '00700', name: '腾讯控股',    market: 'hk',  poolId: '1', researchStatus: 'ready',     thesis: '社交+AI双轮驱动，视频号商业化提速，广告收入拐点已至。', targetPrice: 480,  stopLossPrice: 320, nextReviewDate: '2026-09-15', notes: '核心资产，长期持有',         price: 441.54, watch: true, tags: ['互联网','AI'],  addedAt: '2026-01-18T09:00:00+08:00' },
    { id: 'S002', code: 'AAPL',  name: 'Apple Inc.', market: 'us',  poolId: '1', researchStatus: 'researching', thesis: '生态+服务收入稳定，AI手机落地将开启新一轮换机周期。',   targetPrice: 250,  stopLossPrice: 160, nextReviewDate: '2026-09-10', notes: '',                            price: 228.40, watch: true, tags: ['科技'],        addedAt: '2026-02-02T09:00:00+08:00' },
    { id: 'S003', code: '600519',name: '贵州茅台',    market: 'sh',  poolId: '1', researchStatus: 'watching',   thesis: '高端白酒龙头，品牌价值护城河深，但估值仍在消化中。',    targetPrice: 1800, stopLossPrice: 1200,nextReviewDate: '2026-09-20', notes: '已止盈 20 股，剩余观察',     price: 1631.60, watch: true, tags: ['消费'],        addedAt: '2026-03-15T09:00:00+08:00' },
    { id: 'S004', code: '01810', name: '小米集团-W',  market: 'hk',  poolId: '1', researchStatus: 'ready',     thesis: '汽车业务爆发，手机海外拓展+AIoT协同效应开始显现。',    targetPrice: 38,   stopLossPrice: 20,  nextReviewDate: '2026-09-05', notes: 'SU7 周度销量跟踪',           price: 33.08,  watch: true, tags: ['汽车','硬件'], addedAt: '2026-04-10T09:00:00+08:00' },
    { id: 'S005', code: 'TSLA',  name: 'Tesla Inc.', market: 'us',  poolId: '2', researchStatus: 'watching',   thesis: '机器人预期+FSD进展，但估值波动大，等待更安全边际。',    targetPrice: 260,  stopLossPrice: 160, nextReviewDate: '2026-09-12', notes: '接近纪律止损线，盯紧',       price: 207.40, watch: true, tags: ['新能源'],      addedAt: '2026-05-20T09:00:00+08:00' },
    { id: 'S006', code: 'NVDA',  name: 'NVIDIA',      market: 'us',  poolId: '1', researchStatus: 'ready',     thesis: 'AI算力龙头，H100/H200供不应求，Blackwell 周期开启。',   targetPrice: 180,  stopLossPrice: 110, nextReviewDate: '2026-09-08', notes: '持仓 40 股，今日加仓',       price: 142.30, watch: true, tags: ['AI','半导体'], addedAt: '2026-06-01T09:00:00+08:00' },
    { id: 'S007', code: '300750',name: '宁德时代',    market: 'sz',  poolId: '2', researchStatus: 'researching', thesis: '全球动力电池市占率第一，海外扩张进行中。',               targetPrice: 280,  stopLossPrice: 180, nextReviewDate: '2026-09-25', notes: '',                            price: 235.00, watch: false, tags: ['新能源'],      addedAt: '2026-07-06T09:00:00+08:00' },
    { id: 'S008', code: '601318',name: '中国平安',    market: 'sh',  poolId: '2', researchStatus: 'paused',     thesis: '寿险改革仍在观察，等待拐点确认再行动。',                 targetPrice: 55,   stopLossPrice: 42,  nextReviewDate: '2026-10-01', notes: '',                            price: 48.50,  watch: false, tags: ['金融'],        addedAt: '2026-07-22T09:00:00+08:00' },
  ];

  const seedRules = [
    { id: 'R001', name: '单笔最大仓位不超过 20%', description: '任何一只股票买入时占总资金不超过 20%，禁止单票 All in。',
      severity: 'high', enabled: true, createdAt: '2026-07-01T09:00:00+08:00', updatedAt: '2026-08-10T14:00:00+08:00',
      conditions: [{ id: 'C1', type: 'volume', operator: 'greater', value: 0.2, parameter: 'positionRatio' }],
      actions: [{ id: 'A1', type: 'block', message: '单票仓位超 20%', severity: 'error' }] },
    { id: 'R002', name: '日亏损不超过总资金 2%', description: '当日任何时段总浮动亏损触及 2% 必须停止新开仓，冷静复盘。',
      severity: 'high', enabled: true, createdAt: '2026-07-01T09:00:00+08:00', updatedAt: '2026-08-15T10:00:00+08:00',
      conditions: [{ id: 'C2', type: 'loss', operator: 'greater', value: 0.02, parameter: 'dailyLossRatio' }],
      actions: [{ id: 'A2', type: 'alert', message: '日亏损触及 2% 红线', severity: 'error' }] },
    { id: 'R003', name: '不追高开仓：涨幅超 5%', description: '日内涨幅已超过 5% 的标的，禁止因 FOMO 追建仓位。',
      severity: 'medium', enabled: true, createdAt: '2026-07-05T09:00:00+08:00', updatedAt: '2026-08-23T11:00:00+08:00',
      conditions: [{ id: 'C3', type: 'price', operator: 'greater', value: 5, parameter: 'intradayChangePct' }],
      actions: [{ id: 'A3', type: 'block', message: '涨幅超 5% 禁止追入', severity: 'warning' }] },
    { id: 'R004', name: '每周交易不超 5 笔', description: '频繁交易=给券商打工，超过 5 笔的周必须写检讨心得。',
      severity: 'low', enabled: false, createdAt: '2026-07-10T09:00:00+08:00', updatedAt: '2026-07-10T09:00:00+08:00',
      conditions: [{ id: 'C4', type: 'volume', operator: 'greater', value: 5, parameter: 'weeklyTradeCount' }],
      actions: [{ id: 'A4', type: 'log', message: '周交易超 5 笔', severity: 'info' }] },
    { id: 'R005', name: '浮亏 -8% 必须硬止损', description: '持仓浮亏达到 -8% 无条件减仓或清仓，绝不让亏损拖成长线。',
      severity: 'high', enabled: true, createdAt: '2026-07-15T09:00:00+08:00', updatedAt: '2026-08-01T09:00:00+08:00',
      conditions: [{ id: 'C5', type: 'loss', operator: 'greater', value: 0.08, parameter: 'positionLossRatio' }],
      actions: [{ id: 'A5', type: 'alert', message: '触发硬止损 -8%', severity: 'error' }] },
    { id: 'R006', name: '每周一次 AI 复盘', description: '周日下午用 AI 分析模块跑一次全持仓+纪律复盘。',
      severity: 'low', enabled: true, createdAt: '2026-07-20T09:00:00+08:00', updatedAt: '2026-08-25T09:00:00+08:00',
      conditions: [],
      actions: [{ id: 'A6', type: 'notify', message: '周日 AI 复盘提醒', severity: 'info' }] },
  ];

  const seedViolations = [
    { id: 'V001', ruleId: 'R002', ruleName: '日亏损不超过总资金 2%', description: '当日恒指大跌 + 腾讯财报前浮亏集中，触及 2.1%', severity: 'error',   status: 'resolved', timestamp: '2026-08-15T15:00:00+08:00' },
    { id: 'V002', ruleId: 'R003', ruleName: '不追高开仓：涨幅超 5%', description: '小米日内涨幅 7.2% 时仍加仓 500 股', severity: 'warning', status: 'pending',  timestamp: '2026-08-23T10:30:00+08:00' },
  ];

  const seedInsights = [
    { id: 'I001', title: '腾讯加仓后的冷思考', content: '加仓后一度很兴奋，但要注意视频号虽然增速快，广告主预算恢复还需要时间。短期不期待暴涨，按 6 个月维度拿。',
      timestamp: '2026-08-14T20:00:00+08:00', tags: ['持仓','腾讯','心态'], relatedTradeIds: ['T001'], attachments: [] },
    { id: 'I002', title: '茅台止盈那笔的复盘', content: '严格遵守了 8% 分批止盈的计划，卖出虽然只卖了一半，但心理压力骤减。以后可以保持：到达第一止盈位卖 1/3，第二卖 1/3。',
      timestamp: '2026-08-20T18:00:00+08:00', tags: ['止盈','纪律'], relatedTradeIds: ['T003'], attachments: [] },
    { id: 'I003', title: '小米追高的错误', content: '看到 SU7 销量新闻 + 日内已经涨 7%，冲动加仓 500 股。违反了「涨幅超 5% 不追」规则 R003，已记录到违规台账。',
      timestamp: '2026-08-25T22:00:00+08:00', tags: ['错误','纪律','小米'], relatedTradeIds: [], attachments: [] },
    { id: 'I004', title: '8 月收官策略', content: '整体跑赢大盘 3.2%，但胜率还有提升空间。下周重点：① 减持 TSLA 观察仓位 ② 观察 NVDA 回调后是否加仓。',
      timestamp: '2026-08-28T21:00:00+08:00', tags: ['月度','策略'], relatedTradeIds: [], attachments: [] },
  ];

  /* ---------------- 本地读写工具 ---------------- */
  function readList(key, seed) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        localStorage.setItem(key, JSON.stringify(seed));
        return seed.slice();
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        localStorage.setItem(key, JSON.stringify(seed));
        return seed.slice();
      }
      return parsed;
    } catch (err) {
      console.warn('[mock] readList fallback', key, err);
      return seed.slice();
    }
  }
  // 最近一次写盘失败（配额超限等）。写失败时内存有、磁盘无，重启会丢数据，
  // 必须能被 UI 感知到并提示用户，否则「静默丢数据」。
  var _writeErr = null;
  function writeList(key, arr) {
    try {
      localStorage.setItem(key, JSON.stringify(arr));
      return true;
    } catch (err) {
      _writeErr = { key: key, at: Date.now(), message: (err && err.message) || String(err) };
      console.warn('[mock] writeList 失败（可能配额超限）：', key, err);
      return false;
    }
  }
  function getWriteError() { return _writeErr; }
  function clearWriteError() { _writeErr = null; }
  function uid(prefix) {
    return prefix + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5).toUpperCase();
  }
  function nowIso() {
    return new Date().toISOString();
  }
  // ISO 日期 → 显示用 YYYY-MM-DD
  function isoDate(d) {
    if (!d) return '';
    return String(d).slice(0, 10);
  }
  // 本地时区的 YYYY-MM-DD 与 YYYY-MM。
  // 注意：toISOString() 是 UTC 时间，北京时区 00:00–08:00 会算成前一天，
  // 与「按本地日切分」的交易记录口径不一致（当日盈亏会漏计一整天），故统一走本地时间。
  function localYmd(d) {
    var t = (d instanceof Date) ? d : new Date(d);
    if (isNaN(t.getTime())) return '';
    return String(t.getFullYear()) + '-' +
      String(t.getMonth() + 1).padStart(2, '0') + '-' +
      String(t.getDate()).padStart(2, '0');
  }
  function localYm(d) {
    return String(localYmd(d)).slice(0, 7);
  }
  function marketYmd(market, now) {
    if (String(market).toLowerCase() !== 'us') return beijingYmd(now);
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(now);
      var fields = {};
      parts.forEach(function (p) { fields[p.type] = p.value; });
      return fields.year + '-' + fields.month + '-' + fields.day;
    } catch (_) { return localYmd(now); }
  }
  function beijingYmd(now) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(now);
      var fields = {};
      parts.forEach(function (p) { fields[p.type] = p.value; });
      return fields.year + '-' + fields.month + '-' + fields.day;
    } catch (_) { return localYmd(now); }
  }
  // 香港交易所证券市场官方休市表：
  // 2026 https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2025/ce_SEHK_CT_075_2025.pdf
  // 2027 https://www.hkex.com.hk/-/media/HKEX-Market/Services/Circulars-and-Notices/Participant-and-Members-Circulars/SEHK/2026/MO_DT_133_26_e1.pdf
  var HK_CLOSED_DAYS = {
    '2026': ['01-01','02-17','02-18','02-19','04-03','04-06','04-07','05-01','05-25','06-19','07-01','10-01','10-19','12-25'],
    '2027': ['01-01','02-08','02-09','03-26','03-29','04-05','05-13','06-09','07-01','09-16','10-01','10-08','12-27'],
  };
  function marketClosedAllDay(market, now) {
    try {
      var weekday = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', weekday: 'short' }).format(now);
      if (weekday === 'Sat' || weekday === 'Sun') return true;
    } catch (_) { if (now.getDay() === 0 || now.getDay() === 6) return true; }
    if (String(market).toLowerCase() !== 'hk') return false;
    var day = beijingYmd(now);
    var year = day.slice(0, 4);
    return !!HK_CLOSED_DAYS[year] && HK_CLOSED_DAYS[year].indexOf(day.slice(5)) >= 0;
  }
  function marketHasOpenedToday(market, now) {
    if (marketClosedAllDay(market, now)) return false;
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai',
        weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(now);
      var fields = {};
      parts.forEach(function (p) { fields[p.type] = p.value; });
      if (fields.weekday === 'Sat' || fields.weekday === 'Sun') return false;
      var hhmm = Number(fields.hour) * 100 + Number(fields.minute);
      return hhmm >= 930;
    } catch (_) { return true; }
  }
  function marketHasClosedToday(market, now) {
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(now);
      var fields = {};
      parts.forEach(function (p) { fields[p.type] = p.value; });
      return Number(fields.hour) * 100 + Number(fields.minute) >= (String(market).toLowerCase() === 'hk' ? 1600 : 1500);
    } catch (_) { return false; }
  }
  function pnlMarket(market) {
    var m = String(market || '').toLowerCase();
    return m === 'us' ? 'us' : m === 'hk' ? 'hk' : 'cn';
  }

  // 代码 → 市场（沪/深/港/美）本地兜底探测，用于补全旧交易缺失的 market 字段
  function _detectMarket(code) {
    var c = String(code || '').trim().toUpperCase();
    if (/^(60|68)\d{4}$/.test(c)) return 'sh';
    if (/^(00|30)\d{4}$/.test(c)) return 'sz';
    if (/^[A-Z]{1,5}$/.test(c)) return 'us';
    if (/^\d{4,5}$/.test(c) && parseInt(c, 10) < 10000) return 'hk';
    if (/^\d{6}$/.test(c)) return c.startsWith('6') || c.startsWith('68') ? 'sh' : 'sz';
    return 'us';
  }

  /* ---------------- 内存状态 + API ---------------- */
  const state = {
    trades: readList(KEYS.trades, seedTrades),
    stockPoolStocks: readList(KEYS.stockPoolStocks, seedStockPool),
    disciplineRules: readList(KEYS.disciplineRules, seedRules),
    violationRecords: readList(KEYS.violationRecords, seedViolations),
    tradingInsights: readList(KEYS.tradingInsights, seedInsights),
    aiReports: readList(KEYS.aiReports, []),
    accountSnapshots: readList(KEYS.accountSnapshots, []),
  };
  // 未进入股票池的持仓也需要行情；报价单独缓存，不擅自改动用户的股票池。
  var positionQuotes = {};
  try { positionQuotes = JSON.parse(localStorage.getItem(KEYS.positionQuotes) || '{}') || {}; } catch (_) {}
  function quoteStocks() {
    var pool = state.stockPoolStocks.slice();
    var known = {};
    pool.forEach(function (s) { known[String(s.code).toUpperCase()] = true; });
    Object.keys(positionQuotes).forEach(function (code) {
      if (!known[code]) pool.push(positionQuotes[code]);
    });
    return pool;
  }
  function tradeDigest(at) {
    var rows = state.trades.filter(function (t) { return new Date(t.timestamp).getTime() <= at; })
      .map(function (t) { return [t.id, t.stockCode, t.market, t.type, t.quantity, t.price, t.fee || 0, t.timestamp].join('|'); })
      .sort().join('\n');
    var hash = 2166136261;
    for (var i = 0; i < rows.length; i++) hash = Math.imul(hash ^ rows.charCodeAt(i), 16777619);
    return (hash >>> 0).toString(16);
  }

  // 迁移：补全交易记录的 market 字段（早期版本未存市场 → 跨币种错乱）。
  // 仅当存在缺失 market 的交易时才回写，避免无谓写盘。
  (function migrateTradeMarket() {
    try {
      var needWrite = false;
      state.trades.forEach(function (t) {
        if (!t.market) { t.market = _detectMarket(t.stockCode); needWrite = true; }
      });
      if (needWrite) writeList(KEYS.trades, state.trades);
    } catch (e) {}
  })();

  // 迁移：intradayChangePct 阈值统一为「百分数值」（涨 10% 存 10，与行情 changePercent 一致）。
  // 旧版本本地解析/AI 存的是小数（0.1），引擎按百分数比较会提前触发，|v|<1 的小数一律 ×100。
  (function migrateIntradayPct() {
    try {
      var needWrite = false;
      state.disciplineRules.forEach(function (r) {
        (r.conditions || []).forEach(function (c) {
          if (c.parameter === 'intradayChangePct' && isFinite(Number(c.value)) && Math.abs(Number(c.value)) < 1 && Number(c.value) !== 0) {
            c.value = Math.round(Number(c.value) * 1000) / 10; // 0.1 → 10
            needWrite = true;
          }
        });
      });
      if (needWrite) writeList(KEYS.disciplineRules, state.disciplineRules);
    } catch (e) {}
  })();

  /* ---- 仪表盘合成：当前持仓（Step 4 会被 FIFO 替换，这里先用静态近似） ---- */
  const positionsSeed = [
    { stockCode: '00700', stockName: '腾讯控股',    shares: 200,  avgCost: 342.00, currentPrice: 441.54,  floatingPnL: 19908, floatingPnLPct: 29.10, realizedPnL: 0,    market: 'hk' },
    { stockCode: 'AAPL',  stockName: 'Apple Inc.',  shares: 80,   avgCost: 178.50, currentPrice: 228.40,  floatingPnL: 3992,  floatingPnLPct: 28.00, realizedPnL: 0,    market: 'us' },
    { stockCode: '600519',stockName: '贵州茅台',    shares: 10,   avgCost: 1720.0, currentPrice: 1631.60, floatingPnL: -884,  floatingPnLPct: -5.14, realizedPnL: 7000, market: 'sh' },
    { stockCode: '01810', stockName: '小米集团-W',  shares: 2000, avgCost: 22.40,  currentPrice: 33.08,   floatingPnL: 21360, floatingPnLPct: 47.68, realizedPnL: 0,    market: 'hk' },
    { stockCode: 'TSLA',  stockName: 'Tesla Inc.',  shares: 30,   avgCost: 242.70, currentPrice: 207.40,  floatingPnL: -1059, floatingPnLPct: -14.55,realizedPnL: 0,    market: 'us' },
    { stockCode: 'NVDA',  stockName: 'NVIDIA',      shares: 40,   avgCost: 128.50, currentPrice: 142.30,  floatingPnL: 552,   floatingPnLPct: 10.74, realizedPnL: 0,    market: 'us' },
  ];

  const api = {
    KEYS,
    state,
    positions: positionsSeed, // [DEPRECATED] 静态占位，用 getPositions() 拿真实 FIFO 结果

    /* ---------- FIFO 动态持仓（每次调用实时计算，统一人民币计价） ---------- */
    getPositions() {
      var fxRates = (typeof AppMarket !== 'undefined' && AppMarket.getFxRates) ? AppMarket.getFxRates() : null;
      if (typeof AppFifo !== 'undefined') {
        return AppFifo.fifoPositions(state.trades, quoteStocks(), fxRates);
      }
      // fallback：返回静态 positionsSeed 包装（按市场折算人民币）
      var ps = positionsSeed.slice();
      var rates = fxRates || { USD: 7.1, HKD: 0.91, CNY: 1 };
      function toCny(amt, market) { var r = market === 'us' ? rates.USD : market === 'hk' ? rates.HKD : 1; return (Number(amt) || 0) * r; }
      return {
        totalValue: ps.reduce(function (s, p) { return s + toCny(p.shares * p.currentPrice, p.market); }, 0),
        totalCost: ps.reduce(function (s, p) { return s + toCny(p.shares * p.avgCost, p.market); }, 0),
        totalFloatingPnL: ps.reduce(function (s, p) { return s + toCny(p.floatingPnL, p.market); }, 0),
        totalFloatingPnLPct: 0,
        totalRealizedPnL: ps.reduce(function (s, p) { return s + toCny(p.realizedPnL || 0, p.market); }, 0),
        positions: ps.map(function (p) {
          return Object.assign({}, p, {
            currency: p.market === 'us' ? 'USD' : p.market === 'hk' ? 'HKD' : 'CNY',
            marketValue: toCny(p.shares * p.currentPrice, p.market),
            cost: toCny(p.shares * p.avgCost, p.market),
            floatingPnL: toCny(p.floatingPnL, p.market),
          });
        }),
      };
    },

    /* ---------- 交易记录 ---------- */
    getTrades(filter) {
      let arr = state.trades.slice().sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      if (filter) {
        if (filter.type) arr = arr.filter(t => t.type === filter.type);
        if (filter.q) {
          const q = String(filter.q).trim().toLowerCase();
          if (q) arr = arr.filter(t => (t.stockName || '').toLowerCase().includes(q) || (t.stockCode || '').toLowerCase().includes(q));
        }
      }
      return arr;
    },
    addTrade(trade) {
      const rec = Object.assign({
        id: uid('T'),
        type: 'buy', quantity: 0, price: 0, fee: 0,
        notes: '', tags: [],
        timestamp: nowIso(),
      }, trade);
      if (!rec.stockCode || !rec.stockName || !rec.quantity || !rec.price) {
        return { ok: false, msg: '缺少必要字段（代码/名称/数量/价格）' };
      }
      // 补全市场字段（记录表单传入优先，否则按代码探测），用于币种归属
      if (!rec.market) {
        rec.market = (typeof AppMarket !== 'undefined' && AppMarket.detectMarket)
          ? AppMarket.detectMarket(rec.stockCode)
          : _detectMarket(rec.stockCode);
      }
      if (!rec.timestamp) rec.timestamp = nowIso();
      state.trades.push(rec);
      writeList(KEYS.trades, state.trades);

      // === 纪律引擎自动扫描 ===
      if (typeof AppDiscipline !== 'undefined') {
        try {
          const vios = AppDiscipline.checkTrade(rec);
          if (vios && vios.length > 0) {
            console.warn('[discipline] addTrade triggered violations:', vios.map(v => v.ruleName));
            // 派发事件 → app.js NotifApp 监听后做即时本地推送
            try { window.dispatchEvent(new CustomEvent('app:violations', { detail: vios })); } catch (_) {}
          }
        } catch (_) { /* fail-silent */ }
      }

      return { ok: true, data: rec };
    },
    deleteTrade(id) {
      const before = state.trades.length;
      state.trades = state.trades.filter(t => t.id !== id);
      const ok = state.trades.length < before;
      if (ok) writeList(KEYS.trades, state.trades);
      return ok;
    },
    updateTrade(id, patch) {
      const t = state.trades.find(x => x.id === id);
      if (!t) return null;
      Object.assign(t, patch);
      writeList(KEYS.trades, state.trades);
      return t;
    },

    /* ---------- 股票池 ---------- */
    getStockPool(filter) {
      let arr = state.stockPoolStocks.slice();
      if (filter) {
        if (filter.poolId) arr = arr.filter(s => s.poolId === filter.poolId);
        if (filter.researchStatus) arr = arr.filter(s => s.researchStatus === filter.researchStatus);
        if (filter.market) arr = arr.filter(s => s.market === filter.market);
        if (filter.watch === true) arr = arr.filter(s => s.watch === true);
        if (filter.watch === false) arr = arr.filter(s => s.watch !== true);
        if (filter.q) {
          const q = String(filter.q).trim().toLowerCase();
          if (q) arr = arr.filter(s =>
            (s.name || '').toLowerCase().includes(q) ||
            (s.code || '').toLowerCase().includes(q) ||
            (s.tags || []).join(',').toLowerCase().includes(q)
          );
        }
      }
      return arr;
    },
    getQuoteTargets() {
      var targets = state.stockPoolStocks.slice();
      var known = {};
      targets.forEach(function (s) { known[String(s.code).toUpperCase()] = true; });
      this.getPositions().positions.forEach(function (p) {
        var code = String(p.stockCode).toUpperCase();
        if (!known[code]) {
          targets.push(Object.assign({ id: 'holding-' + code, code: code, market: p.market }, positionQuotes[code] || {}));
          known[code] = true;
        }
      });
      return targets;
    },
    getStockById(id) {
      return state.stockPoolStocks.find(s => s.id === id) || null;
    },
    addStockPool(s) {
      const rec = Object.assign({
        id: uid('S'),
        market: 'us', poolId: '2', researchStatus: 'new',
        targetPrice: 0, stopLossPrice: 0,
        notes: '', thesis: '', tags: [],
        addedAt: nowIso(),
      }, s);
      if (!rec.code || !rec.name) return { ok: false, msg: '代码和名称必填' };
      if (!rec.addedAt) rec.addedAt = nowIso();
      if (rec.watch === undefined) {
        rec.watch = (rec.researchStatus === 'ready' || rec.researchStatus === 'researching' || rec.researchStatus === 'watching');
      }
      state.stockPoolStocks.push(rec);
      writeList(KEYS.stockPoolStocks, state.stockPoolStocks);
      return { ok: true, data: rec };
    },
    updateStock(id, patch) {
      const s = state.stockPoolStocks.find(x => x.id === id);
      if (!s) return null;
      Object.assign(s, patch);
      writeList(KEYS.stockPoolStocks, state.stockPoolStocks);
      return s;
    },
    deleteStockPool(id) {
      const before = state.stockPoolStocks.length;
      state.stockPoolStocks = state.stockPoolStocks.filter(s => s.id !== id);
      const ok = state.stockPoolStocks.length < before;
      if (ok) writeList(KEYS.stockPoolStocks, state.stockPoolStocks);
      return ok;
    },
    getTags() {
      const set = new Set();
      state.stockPoolStocks.forEach(s => (s.tags || []).forEach(t => set.add(t)));
      return Array.from(set);
    },

    /* ---------- 纪律系统 ---------- */
    getRules() { return state.disciplineRules.slice(); },
    getEnabledRules() { return state.disciplineRules.filter(r => r.enabled); },
    toggleRule(id) {
      const r = state.disciplineRules.find(x => x.id === id);
      if (!r) return false;
      r.enabled = !r.enabled;
      r.updatedAt = nowIso();
      writeList(KEYS.disciplineRules, state.disciplineRules);
      return true;
    },
    addRule(r) {
      var rule = Object.assign({}, r);
      // 兼容旧版表单字段
      if (!rule.name && rule.title) rule.name = rule.title;
      if (!rule.description && rule.desc) rule.description = rule.desc;
      if (!rule.description && rule.descr) rule.description = rule.descr;
      if (rule.level && !rule.severity) {
        rule.severity = rule.level === 'danger' ? 'high' : 'medium';
      }
      const rec = Object.assign({
        id: uid('R'), enabled: true, severity: 'medium',
        conditions: [], actions: [],
        createdAt: nowIso(), updatedAt: nowIso(),
      }, rule);
      if (!rec.name) return { ok: false, msg: '规则名称必填' };
      state.disciplineRules.push(rec);
      writeList(KEYS.disciplineRules, state.disciplineRules);
      return { ok: true, data: rec };
    },
    updateRule(id, patch) {
      const r = state.disciplineRules.find(x => x.id === id);
      if (!r) return null;
      Object.assign(r, patch, { updatedAt: nowIso() });
      writeList(KEYS.disciplineRules, state.disciplineRules);
      return r;
    },
    deleteRule(id) {
      const before = state.disciplineRules.length;
      state.disciplineRules = state.disciplineRules.filter(r => r.id !== id);
      const ok = state.disciplineRules.length < before;
      if (ok) writeList(KEYS.disciplineRules, state.disciplineRules);
      return ok;
    },
    getViolations(filter) {
      let arr = state.violationRecords.slice().sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      if (filter) {
        if (filter.status) arr = arr.filter(v => v.status === filter.status);
        if (filter.severity) arr = arr.filter(v => v.severity === filter.severity);
      }
      return arr;
    },
    addViolation(v) {
      const rec = Object.assign({
        id: uid('V'), severity: 'warning', status: 'pending',
        timestamp: nowIso(),
      }, v);
      if (!rec.ruleId || !rec.description) return { ok: false, msg: '关联规则和说明必填' };
      // 自动补 ruleName
      if (!rec.ruleName) {
        const rule = state.disciplineRules.find(r => r.id === rec.ruleId);
        if (rule) rec.ruleName = rule.name;
      }
      state.violationRecords.push(rec);
      writeList(KEYS.violationRecords, state.violationRecords);
      return { ok: true, data: rec };
    },
    resolveViolation(id) {
      const v = state.violationRecords.find(x => x.id === id);
      if (!v) return false;
      v.status = 'resolved';
      writeList(KEYS.violationRecords, state.violationRecords);
      return true;
    },
    deleteViolation(id) {
      const before = state.violationRecords.length;
      state.violationRecords = state.violationRecords.filter(v => v.id !== id);
      const ok = state.violationRecords.length < before;
      if (ok) writeList(KEYS.violationRecords, state.violationRecords);
      return ok;
    },

    /* ---------- 交易心得 ---------- */
    getInsights(filter) {
      let arr = state.tradingInsights.slice().sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
      if (filter) {
        if (filter.q) {
          const q = String(filter.q).trim().toLowerCase();
          if (q) arr = arr.filter(x => (x.title||'').toLowerCase().includes(q) || (x.content||'').toLowerCase().includes(q));
        }
        if (filter.tag) {
          arr = arr.filter(x => (x.tags || []).includes(filter.tag));
        }
      }
      return arr;
    },
    getAllInsightTags() {
      const map = {};
      state.tradingInsights.forEach(i => (i.tags || []).forEach(t => map[t] = (map[t] || 0) + 1));
      return Object.entries(map).sort((a,b)=>b[1]-a[1]).map(([tag,count])=>({tag,count}));
    },
    addInsight(ins) {
      const rec = Object.assign({
        id: uid('I'), tags: [], relatedTradeIds: [], attachments: [],
        timestamp: nowIso(),
      }, ins);
      if (!rec.title) return { ok: false, msg: '标题必填' };
      state.tradingInsights.unshift(rec);
      writeList(KEYS.tradingInsights, state.tradingInsights);
      return { ok: true, data: rec };
    },
    updateInsight(id, patch) {
      const i = state.tradingInsights.find(x => x.id === id);
      if (!i) return null;
      Object.assign(i, patch);
      writeList(KEYS.tradingInsights, state.tradingInsights);
      return i;
    },
    deleteInsight(id) {
      const before = state.tradingInsights.length;
      state.tradingInsights = state.tradingInsights.filter(x => x.id !== id);
      const ok = state.tradingInsights.length < before;
      if (ok) writeList(KEYS.tradingInsights, state.tradingInsights);
      return ok;
    },

    /* ---------- 账户历史：只记录真实取到行情后的当日首末值 ---------- */
    getAccountSnapshots() {
      return state.accountSnapshots.map(function (s) { return Object.assign({}, s, { first: Object.assign({}, s.first), last: Object.assign({}, s.last) }); });
    },
    recordAccountSnapshot() {
      var summary = this.dashboardSummary();
      if (!summary.todayPnlReady || !Number.isFinite(summary.totalAssets) || !Number.isFinite(summary.floatingPnl)) return false;
      var day = beijingYmd(new Date());
      var point = { capturedAt: Date.now(), totalAssets: summary.totalAssets, floatingPnL: summary.floatingPnl, monthRealized: summary.monthRealized, tradeDigest: tradeDigest(Date.now()) };
      var old = state.accountSnapshots.find(function (s) { return s.day === day; });
      if (old && old.last && old.last.totalAssets === point.totalAssets && old.last.floatingPnL === point.floatingPnL && old.last.monthRealized === point.monthRealized && old.last.tradeDigest === point.tradeDigest) return false;
      if (old) old.last = point;
      else state.accountSnapshots.push({ day: day, first: point, last: point });
      state.accountSnapshots.sort(function (a, b) { return a.day.localeCompare(b.day); });
      return writeList(KEYS.accountSnapshots, state.accountSnapshots);
    },
    monthlyPerformance(month, live) {
      var ym = String(month || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(ym)) return null;
      var nowMonth = beijingYmd(new Date()).slice(0, 7);
      var rows = state.accountSnapshots.filter(function (s) { return s.day && s.day.slice(0, 7) === ym && s.first && s.last; });
      if (!rows.length) return null;
      rows.sort(function (a, b) { return a.day.localeCompare(b.day); });
      var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5));
      var previousDay = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
      var monthLastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
      var previous = state.accountSnapshots.find(function (s) { return s.day === previousDay && s.last; });
      var base = previous ? previous.last : rows[0].first;
      var lastRow = rows[rows.length - 1];
      var close = ym === nowMonth && live && live.ready
        ? { capturedAt: live.at, floatingPnL: live.floatingPnL, totalAssets: live.totalAssets, monthRealized: live.monthRealized }
        : lastRow.last;
      if ((base.tradeDigest && base.tradeDigest !== tradeDigest(Number(base.capturedAt))) ||
          (close.tradeDigest && close.tradeDigest !== tradeDigest(Number(close.capturedAt)))) return null;
      var baseTime = previous ? Date.parse(ym + '-01T00:00:00+08:00') : Number(base.capturedAt);
      var closeTime = Number(close.capturedAt);
      var fxRates = (typeof AppMarket !== 'undefined' && AppMarket.getFxRates) ? AppMarket.getFxRates() : null;
      var sales = typeof AppFifo !== 'undefined' ? AppFifo.allSellRealized(state.trades, fxRates, state.stockPoolStocks) : [];
      sales = sales.filter(function (s) {
        var t = new Date(s.sellTimestamp).getTime();
        return Number.isFinite(t) && beijingYmd(new Date(t)).slice(0, 7) === ym &&
          (previous ? t >= baseTime : t > baseTime) && t <= closeTime;
      });
      var realized = sales.reduce(function (sum, s) { return sum + s.realizedPnL; }, 0);
      if (close.monthRealized != null && Number.isFinite(Number(close.monthRealized))) {
        realized = Number(close.monthRealized) - (previous ? 0 : Number(base.monthRealized) || 0);
      }
      var floating = Number(close.floatingPnL) - Number(base.floatingPnL);
      var full = !!previous && (ym === nowMonth || lastRow.day === monthLastDay);
      return {
        month: ym, pnl: Math.round((realized + floating) * 100) / 100,
        realized: Math.round(realized * 100) / 100, floating: Math.round(floating * 100) / 100,
        full: full, from: previous ? ym + '-01' : rows[0].day, through: ym === nowMonth && live && live.ready ? beijingYmd(new Date()) : lastRow.day,
        saleCount: sales.length, sales: sales,
      };
    },

    /* ----------仪表盘合成（近似，Step 4 换 FIFO） ---------- */
    dashboardSummary() {
      var fxRates = (typeof AppMarket !== 'undefined' && AppMarket.getFxRates) ? AppMarket.getFxRates() : null;
      // 优先用 AppFifo 真实 FIFO 结果（统一人民币计价）
      let fifo;
      if (typeof AppFifo !== 'undefined') {
        fifo = AppFifo.fifoPositions(state.trades, quoteStocks(), fxRates);
      } else {
        // fallback：静态种子
        fifo = {
          totalValue: api.positions.reduce(function (a, b) { return a + b.currentPrice * b.shares; }, 0),
          totalCost: api.positions.reduce(function (a, b) { return a + b.avgCost * b.shares; }, 0),
          totalFloatingPnL: api.positions.reduce(function (a, b) { return a + b.floatingPnL; }, 0),
          totalFloatingPnLPct: 0,
          totalRealizedPnL: api.positions.reduce(function (a, b) { return a + (b.realizedPnL || 0); }, 0),
          positions: api.positions.slice(),
        };
      }

      const positions = fifo.positions;
      const totalAssets = fifo.totalValue;
      const totalCost = fifo.totalCost;
      const floatingPnl = fifo.totalFloatingPnL;
      const realizedPnl = fifo.totalRealizedPnL;
      const floatingPnlPct = fifo.totalFloatingPnLPct;
      const totalTrades = state.trades.length;

      // 本周交易数（近 7 天）
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000);
      const tradesThisWeek = state.trades.filter(function (t) {
        const ts = new Date(t.timestamp);
        return ts >= weekAgo;
      }).length;

      // 交易月度统计仍供“已兑现”图表使用；完整月收益单独以月初浮盈快照为基线。
      const ym = beijingYmd(now).slice(0, 7);
      const monthly = typeof AppFifo !== 'undefined' ? AppFifo.monthlyStats(state.trades, fxRates) : [];
      const thisMonthStat = monthly.find(function (m) { return m.month === ym; });
      const monthRealized = thisMonthStat ? thisMonthStat.realizedPnL : 0;

      // 胜率：基于已平仓卖出交易
      let winRate = 0, winRateN = '0/0';
      if (typeof AppFifo !== 'undefined') {
        const sells = AppFifo.allSellRealized(state.trades, fxRates, state.stockPoolStocks);
        const wins = sells.filter(function (s) { return s.realizedPnL > 0; }).length;
        const totalSells = sells.length;
        winRate = totalSells > 0 ? Math.round((wins / totalSells) * 100) : 0;
        winRateN = wins + '/' + totalSells;
      }

      // 今日盈亏 = 持仓当日市值变动 + 今日已实现盈亏
      // 原实现用「全部累计浮盈」当今日变动：2 月建仓的浮盈每天都算进今日，
      // 首页核心 KPI 长期虚高数十倍。这里改为按行情涨跌额算当日真实变动。
      var todayMarketPnl = {
        cn: { floating: 0, realized: 0, pendingCount: 0, holdingCount: 0, quoteDate: '', closedToday: marketClosedAllDay('sh', now) },
        hk: { floating: 0, realized: 0, pendingCount: 0, holdingCount: 0, quoteDate: '', closedToday: marketClosedAllDay('hk', now) },
        us: { floating: 0, realized: 0, pendingCount: 0, holdingCount: 0, quoteDate: '' },
      };
      const todayStr = beijingYmd(now);
      if (typeof AppFifo !== 'undefined') {
        const sells = AppFifo.allSellRealized(state.trades, fxRates, state.stockPoolStocks);
        var sellTrades = {};
        state.trades.forEach(function (t) { if (t.id) sellTrades[t.id] = t; });
        sells.forEach(function (s) {
          if (beijingYmd(new Date(s.sellTimestamp)) !== todayStr) return;
          var trade = sellTrades[s.tradeId];
          var sellMarket = trade && trade.market || _detectMarket(s.stockCode);
          todayMarketPnl[pnlMarket(sellMarket)].realized += s.realizedPnL;
        });
      }
      // 当日市值变动：优先用行情的涨跌额 change，没有就用涨跌幅从现价反推昨收
      var freshQuoteCount = 0;
      var closedQuoteCount = 0;
      var usPreviousSessionCount = 0;
      var pendingQuoteCodes = [];
      var oldestQuoteFetchedAt = 0;
      var latestQuoteDate = '';
      var quotes = quoteStocks();
      var quoteAgeLimit = Math.max(15, (api.getConfig().quoteRefreshMinutes || 5) * 2) * 60000;
      positions.forEach(function (p) {
        var bucket = todayMarketPnl[pnlMarket(p.market)];
        bucket.holdingCount++;
        var sp = null;
        for (var i = 0; i < quotes.length; i++) {
          if (String(quotes[i].code).toUpperCase() === String(p.stockCode).toUpperCase()) { sp = quotes[i]; break; }
        }
        if (sp && sp.quoteDate && sp.quoteDate > latestQuoteDate) latestQuoteDate = sp.quoteDate;
        var fetchedAt = sp && Number(sp.quoteFetchedAt);
        var age = now.getTime() - fetchedAt;
        var currentMarketDay = marketYmd(p.market, now);
        var sameMarketDay = sp && sp.quoteDate === currentMarketDay;
        var beforeMarketOpen = pnlMarket(p.market) !== 'us' && !marketHasOpenedToday(p.market, now);
        var closedPreviousSession = sp && sp.quoteDate && sp.quoteDate < currentMarketDay && beforeMarketOpen;
        var usPreviousSession = pnlMarket(p.market) === 'us' && sp && sp.quoteDate && sp.quoteDate < currentMarketDay;
        // 美股的最近一场交易结果持续展示到下一场有新报价；短时断网不应让昨夜收益消失。
        // 最多沿用七天，避免长期离线时把数周前的报价误认为当前市场结果。
        var usRetainedQuote = pnlMarket(p.market) === 'us' && sp && sp.quoteDate && sp.quoteDate <= currentMarketDay && age <= 7 * 86400000;
        var closedDayRetainedQuote = pnlMarket(p.market) !== 'us' && marketClosedAllDay(p.market, now) &&
          sp && sp.quoteDate && sp.quoteDate < currentMarketDay && age <= 7 * 86400000;
        var closedMarketSnapshot = pnlMarket(p.market) !== 'us' && sameMarketDay &&
          marketHasClosedToday(p.market, now) && marketHasClosedToday(p.market, new Date(fetchedAt)) && age <= 86400000;
        if (!sp || !fetchedAt || !sp.quoteDate || age < 0 || (age > quoteAgeLimit && !usRetainedQuote && !closedDayRetainedQuote && !closedMarketSnapshot) || (!sameMarketDay && !closedPreviousSession && !usPreviousSession)) {
          pendingQuoteCodes.push(p.stockCode);
          bucket.pendingCount++;
          return;
        }
        freshQuoteCount++;
        if (!oldestQuoteFetchedAt || sp.quoteFetchedAt < oldestQuoteFetchedAt) oldestQuoteFetchedAt = sp.quoteFetchedAt;
        if (sp.quoteDate > bucket.quoteDate) bucket.quoteDate = sp.quoteDate;
        if (usPreviousSession || (usRetainedQuote && age > quoteAgeLimit)) usPreviousSessionCount++;
        if (beforeMarketOpen) { closedQuoteCount++; return; }
        var chg = 0;
        if (sp.change != null && Number(sp.change) === Number(sp.change)) {
          chg = Number(sp.change) || 0;
        } else if (sp.changePercent != null && sp.price != null) {
          var pctv = Number(sp.changePercent) || 0;
          var pv = Number(sp.price) || 0;
          chg = pctv !== 0 ? pv - pv / (1 + pctv / 100) : 0;
        }
        if (!chg) return;
        var cny = (typeof AppMarket !== 'undefined' && AppMarket.fxToCny)
          ? AppMarket.fxToCny(chg * p.shares, p.market || p.currency)
          : chg * p.shares;
        bucket.floating += cny;
      });
      Object.keys(todayMarketPnl).forEach(function (key) {
        var item = todayMarketPnl[key];
        item.pnl = Math.round((item.floating + item.realized) * 100) / 100;
        item.ready = item.pendingCount === 0;
      });
      // 首页与弹窗均以分市场展示的两位小数为准，避免三个市场相加与总额差一分钱。
      const todayPnl = Object.keys(todayMarketPnl).reduce(function (sum, key) {
        return sum + todayMarketPnl[key].pnl;
      }, 0);
      const monthPerformance = this.monthlyPerformance(ym, {
        ready: freshQuoteCount === positions.length,
        floatingPnL: floatingPnl, totalAssets: totalAssets, monthRealized: monthRealized, at: now.getTime(),
      });
      // 当日涨跌幅基准 = 今日开盘时的资产（当前市值 - 今日变动），避免用成本当分母
      const todayBase = totalAssets - todayPnl;
      const todayDeltaAmt = todayPnl;
      const todayDeltaPct = todayBase > 0 ? (todayPnl / todayBase) * 100 : 0;

      // 纪律评分
      let disciplineScore = 0;
      if (typeof AppFifo !== 'undefined') {
        disciplineScore = AppFifo.disciplineScore(positions, api.getRules());
      }

      // 指数基准（先用静态，Step 8 接 AppMarket 异步刷新）
      const bench = [
        { name: '上证指数', pct: 0.82, up: true, symbol: 'sh000001' },
        { name: '恒生指数', pct: 1.24, up: true, symbol: 'hkHSI' },
        { name: '纳斯达克', pct: -0.35, up: false, symbol: 'usIXIC' },
      ];

      // 收益走势数据（给 AreaChart）
      const perfData = monthly.length > 0
        ? monthly.map(function (m, i, arr) {
            let cum = 0;
            for (let k = 0; k <= i; k++) cum += arr[k].realizedPnL;
            return { month: m.month.slice(5) + '月', value: Math.round(cum) };
          })
        : [{ month: '8月', value: Math.round(realizedPnl) }];

      return {
        todayPnl: Math.round(todayPnl * 100) / 100,
        todayPnlReady: freshQuoteCount === positions.length,
        todayQuoteCount: freshQuoteCount,
        todayClosedQuoteCount: closedQuoteCount,
        todayUsPreviousSessionCount: usPreviousSessionCount,
        todayMarketPnl: todayMarketPnl,
        todayPendingQuoteCodes: pendingQuoteCodes,
        todayHoldingCount: positions.length,
        todayQuoteUpdatedAt: oldestQuoteFetchedAt,
        latestQuoteDate: latestQuoteDate,
        todayDeltaPct: Math.round(todayDeltaPct * 100) / 100,
        todayDeltaAmt: Math.round(todayDeltaAmt * 100) / 100,
        bench,
        positions,
        totalAssets: Math.round(totalAssets),
        totalCost: Math.round(totalCost),
        floatingPnl: Math.round(floatingPnl * 100) / 100,
        floatingPnlPct: Math.round(floatingPnlPct * 100) / 100,
        realizedPnl: Math.round(realizedPnl * 100) / 100,
        monthPnl: monthPerformance ? monthPerformance.pnl : null,
        monthPnlDetail: monthPerformance,
        monthRealized: Math.round(monthRealized * 100) / 100,
        winRate, winRateN, tradesThisWeek, totalTrades,
        disciplineScore,
        perfData,
        // 数据健壮性提示（#13 卖出超持仓 / #24 汇率过期）—— 交给首页横幅展示
        dataWarnings: (fifo && fifo.warnings) ? fifo.warnings : [],
        fxStale: !!(fxRates && fxRates.stale),
        fxUpdatedAt: (fxRates && fxRates.updatedAt) || 0,
      };
    },

    /* ---------- AI 上下文构建（给 SiliconFlow / OpenAI 兼容接口用） ----------
     * 返回结构化数据对象，由 app.js 根据分析维度组装最终 prompt。
     * 目标：让大模型基于真实持仓、交易、纪律数据做分析，不编造、不输出思考过程。
     */
    buildAiContext(type) {
      const d = this.dashboardSummary();
      const pos = (d.positions || []).slice().sort(function (a, b) { return b.floatingPnLPct - a.floatingPnLPct; });
      const totalValue = d.totalAssets || pos.reduce(function (s, p) { return s + (p.currentPrice || 0) * (p.shares || 0); }, 0);

      // 持仓：市值/盈亏已是人民币（fifo 输出），单价保留原币种并带 currency 标注
      const sym = (typeof AppMarket !== 'undefined' && AppMarket.currencySymbol) ? AppMarket.currencySymbol : function (m) { return m === 'us' ? '$' : m === 'hk' ? 'HK$' : '¥'; };
      const allQuotes = quoteStocks();
      const holdings = pos.map(function (p) {
        var mv = (p.marketValue != null) ? p.marketValue : (p.currentPrice || 0) * (p.shares || 0);
        // 当日涨跌幅：行情刷新后已落库到 stockPoolStocks.changePercent，AI 趋势/风险分析需要它
        var sp = null;
        for (var kk = 0; kk < allQuotes.length; kk++) {
          if (String(allQuotes[kk].code).toUpperCase() === String(p.stockCode).toUpperCase()) { sp = allQuotes[kk]; break; }
        }
        return {
          name: p.stockName || '',
          code: p.stockCode || '',
          market: p.market || '',
          currency: p.currency || 'CNY',
          shares: p.shares || 0,
          avgCost: p.avgCost || 0,
          avgCostText: sym(p.market) + (p.avgCost || 0),
          curPrice: p.currentPrice || 0,
          curPriceText: sym(p.market) + (p.currentPrice || 0),
          marketValue: Math.round(mv),
          ratio: totalValue > 0 ? Math.round((mv / totalValue) * 1000) / 10 : 0,
          floatPnl: Math.round(p.floatingPnL || 0),
          floatPct: p.floatingPnLPct || 0,
          dayChangePct: (sp && sp.quoteDate === marketYmd(p.market, new Date()) && sp.changePercent != null)
            ? Math.round((Number(sp.changePercent) || 0) * 100) / 100 : null,
        };
      });

      // 最近 20 笔交易
      const trades = state.trades.slice().sort(function (a, b) {
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
      }).slice(0, 20).map(function (t) {
        return {
          stock: t.stockName || t.stockCode || '',
          code: t.stockCode || '',
          type: t.type || '',
          qty: t.quantity || 0,
          price: t.price || 0,
          priceText: sym(t.market) + (t.price || 0),
          market: t.market || '',
          date: isoDate(t.timestamp),
        };
      });

      // 规则阈值序列化：规则实际以 conditions[] 存储，旧代码读 r.type/r.threshold 永远为空，
      // 导致 AI 看到的规则名后面没有阈值。这里把每个条件的参数+运算符+阈值读成人类可读串。
      const PARAM_LABEL = {
        intradayChangePct: '日内涨跌幅', positionRatio: '仓位占比', weeklyTradeCount: '周交易笔数',
        positionLossRatio: '单票浮亏率', dailyLossRatio: '日亏损占比'
      };
      const OP_LABEL = { greater: '大于', less: '小于', equal: '等于', greater_equal: '大于等于', less_equal: '小于等于' };
      function condToText(c) {
        if (!c) return '';
        var pLabel = PARAM_LABEL[c.parameter] ||
          (c.type === 'price' ? '成交价' : c.type === 'volume' ? '交易数量' : c.type === 'loss' ? '日亏损额' : c.type === 'profit' ? '日盈利额' : c.type === 'time' ? '交易时点' : '');
        var val = c.value;
        if (c.parameter === 'positionRatio' || c.parameter === 'positionLossRatio' || c.parameter === 'dailyLossRatio') val = (Math.round(Number(val) * 1000) / 10) + '%';
        else if (c.parameter === 'intradayChangePct') val = (Math.round(Number(val) * 100) / 100) + '%';
        else if (c.type === 'time') val = Number(val) + '点';
        else if (c.type === 'loss' || c.type === 'profit') val = '¥' + (Math.round(Number(val) * 100) / 100);
        else if (c.type === 'volume' && c.parameter === 'weeklyTradeCount') val = Number(val) + '笔';
        return pLabel + (OP_LABEL[c.operator] ? (' ' + OP_LABEL[c.operator] + ' ' + val) : (' ' + (c.operator || '') + ' ' + val));
      }
      const rules = this.getRules().filter(function (r) { return r.enabled; }).map(function (r) {
        var conds = (r.conditions || []).map(condToText).join('； ');
        return { name: r.name || '', enabled: true, conditions: conds || '(无具体阈值)', desc: r.description || '' };
      });

      const viols = this.getViolations().slice().sort(function (a, b) {
        return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
      }).slice(0, 10).map(function (v) {
        return { date: isoDate(v.timestamp), desc: v.description || '', rule: v.ruleName || '', status: v.status || 'pending' };
      });

      const pool = state.stockPoolStocks || [];
      // 近期交易心得：诊断页能展示，但 AI 上下文里一直缺它 → 趋势/风险分析看不到用户沉淀
      const insights = (state.tradingInsights || []).slice().sort(function (a, b) { return new Date(b.timestamp || 0) - new Date(a.timestamp || 0); }).slice(0, 5).map(function (it) {
        return { date: isoDate(it.timestamp), title: it.title || '', content: String(it.content || it.text || '').slice(0, 120) };
      });
      const watchList = pool.filter(function (s) { return s.watch; }).map(function (s) {
        return { name: s.name || '', code: s.code || '', market: s.market || '', price: s.price || 0, priceText: sym(s.market) + (s.price || 0), target: s.targetPrice || 0, targetText: sym(s.market) + (s.targetPrice || 0), stop: s.stopLossPrice || 0, stopText: sym(s.market) + (s.stopLossPrice || 0) };
      });
      const positionLevels = pool.filter(function (s) {
        return holdings.some(function (h) { return String(h.code).toUpperCase() === String(s.code).toUpperCase(); });
      }).map(function (s) {
        return { name: s.name || '', code: s.code || '', target: s.targetPrice || 0, targetText: sym(s.market) + (s.targetPrice || 0), stop: s.stopLossPrice || 0, stopText: sym(s.market) + (s.stopLossPrice || 0) };
      });

      const monthly = (typeof AppFifo !== 'undefined' && AppFifo.monthlyStats)
        ? AppFifo.monthlyStats(state.trades)
        : [];

      const cfg = this.getConfig();

      const ctx = {
        type: type || 'portfolio',
        nameMap: { portfolio: '持仓整体体检', discipline: '纪律系统扫描', trend: '近期趋势推演', risk: '风险预警雷达' },
        profile: {
          nickname: cfg.nickname || '交易者',
          styles: (cfg.investingStyles || []).join('、') || '未设置',
        },
        account: {
          totalAssets: Math.round(d.totalAssets || totalValue),
          totalCost: Math.round(d.totalCost || 0),
          floatingPnl: Math.round(d.floatingPnl || 0),
          floatingPnlPct: d.floatingPnlPct || 0,
          realizedPnl: Math.round(d.realizedPnl || 0),
          todayPnl: d.todayPnlReady ? Math.round(d.todayPnl || 0) : null,
          todayPnlReady: d.todayPnlReady,
          winRate: d.winRate || 0,
          winRateN: d.winRateN || '0/0',
          totalTrades: d.totalTrades || 0,
          tradesThisWeek: d.tradesThisWeek || 0,
          disciplineScore: d.disciplineScore || 0,
          holdingCount: holdings.length,
        },
        holdings: holdings,
        trades: trades,
        rules: rules,
        violations: viols,
        watchList: watchList,
        positionLevels: positionLevels,
        insights: insights,
        monthly: monthly,
      };

      // 同时保留一个可直接喂给模型的文本版 prompt（兼容旧调用点）
      ctx.prompt = this._formatAiPrompt(ctx, type);
      return ctx;
    },

    _formatAiPrompt(ctx, type) {
      type = type || ctx.type || 'portfolio';
      var name = (ctx.nameMap && ctx.nameMap[type]) || '投资分析';
      var a = ctx.account || {};
      var h = (ctx.holdings || []).map(function (p) {
        return p.name + '(' + p.code + ') ' + p.shares + '股 成本' + (p.avgCostText || p.avgCost) + ' 现价' + (p.curPriceText || p.curPrice) +
          ' 市值¥' + p.marketValue.toLocaleString() + ' 占比' + p.ratio + '% 浮盈¥' + p.floatPnl.toLocaleString() +
          '(' + (p.floatPct > 0 ? '+' : '') + p.floatPct.toFixed(2) + '%)' +
          (p.dayChangePct == null ? '' : ' 当日涨跌' + (p.dayChangePct > 0 ? '+' : '') + p.dayChangePct + '%');
      }).join('\n') || '无持仓';

      var base = '【' + name + '】\n' +
        '用户：' + (ctx.profile && ctx.profile.nickname || '交易者') + '（投资风格：' + (ctx.profile && ctx.profile.styles || '未设置') + '）\n' +
        '账户概览：总资产 ¥' + (a.totalAssets || 0).toLocaleString() +
        ' | 总浮盈 ¥' + (a.floatingPnl || 0).toLocaleString() + '（' + (a.floatingPnlPct > 0 ? '+' : '') + (a.floatingPnlPct || 0).toFixed(2) + '%）' +
        ' | 已实现盈亏 ¥' + (a.realizedPnl || 0).toLocaleString() +
        ' | 今日盈亏 ' + (a.todayPnlReady ? '¥' + a.todayPnl.toLocaleString() : '行情待更新，暂不可计算') +
        ' | 胜率 ' + (a.winRate || 0) + '%（' + (a.winRateN || '0/0') + '）' +
        ' | 本周交易 ' + (a.tradesThisWeek || 0) + ' 笔' +
        ' | 纪律分 ' + (a.disciplineScore || 0) + '\n' +
        '持仓明细（按浮盈排序）：\n' + h;

      // 补充近期心得（让 AI 结合用户沉淀做诊断）
      if (ctx.insights && ctx.insights.length) {
        base += '\n\n近期交易心得（最近 ' + ctx.insights.length + ' 条）：\n' +
          ctx.insights.map(function (it) { return '- ' + it.date + ' ' + it.title + '：' + it.content; }).join('\n');
      }
      // 补充大盘快照（runAiReportInBackground 异步拉取真实指数后注入；缺失则不写，避免假数据）
      if (ctx.indexes && ctx.indexes.length) {
        base += '\n\n大盘参考：' + ctx.indexes.map(function (ix) {
          return ix.name + ' ' + (ix.pct > 0 ? '+' : '') + ix.pct + '%' + (ix.up ? ' ↑' : ' ↓');
        }).join('、');
      }

      if (type === 'portfolio') {
        return base + '\n\n请做持仓整体体检：优先找出对组合盈亏或集中度影响最大的 2-3 个头寸，不机械罗列最强和最弱。说明其市值占比、浮盈亏与需要关注的原因；只在数据足够时给出带条件的持有、减仓或观察建议。';
      }
      if (type === 'discipline') {
        return base + '\n启用规则：\n' + (ctx.rules || []).map(function (r) { return '- ' + r.name + '：' + r.conditions + (r.desc ? '；' + r.desc : ''); }).join('\n') + '\n' +
          '最近违规：' + (ctx.violations || []).map(function (v) { return v.date + ' [' + v.rule + '，' + (v.status === 'resolved' ? '已处理' : '待处理') + '] ' + v.desc; }).join('；') + '\n' +
          '近20笔交易：' + (ctx.trades || []).map(function (t) { return t.date + ' ' + t.stock + ' ' + t.type + t.qty + '股@' + (t.priceText || t.price); }).join('；') + '\n\n' +
          '请扫描纪律执行：指出最重要的 1-2 个问题，逐项引用规则阈值和对应交易或违规证据。没有证据时明确说无法判断，不把历史违规说成当前违规。';
      }
      if (type === 'trend') {
        return base + '\n月度已实现盈亏：' + (ctx.monthly || []).slice(-6).map(function (m) { return m.month + ' ¥' + m.realizedPnL; }).join('；') + '\n' +
          '观察池：' + (ctx.watchList || []).slice(0, 12).map(function (s) { return s.name + '(' + s.code + ') 现价' + (s.priceText || s.price) + (s.target ? ' 目标' + s.targetText : '') + (s.stop ? ' 止损' + s.stopText : ''); }).join('、') + ((ctx.watchList || []).length > 12 ? '（其余观察标的未列入）' : '') + '\n\n' +
          '请分析近期已实现盈亏和当前持仓结构，指出值得继续观察的 1-2 项变化。这里没有完整净值曲线或未来行情，不要声称看到了 30 日曲线，也不要预测下周涨跌。';
      }
      if (type === 'risk') {
        return base + '\n启用规则：\n' + (ctx.rules || []).map(function (r) { return '- ' + r.name + '：' + r.conditions; }).join('\n') + '\n' +
          '持仓相关止损价：' + (ctx.positionLevels || []).filter(function (s) { return s.stop; }).map(function (s) { return s.name + '(' + s.code + ') ' + s.stopText; }).join('、') + '\n' +
          '最近违规：' + (ctx.violations || []).map(function (v) { return v.date + ' [' + (v.status === 'resolved' ? '已处理' : '待处理') + '] ' + v.desc; }).join('；') + '\n\n' +
          '请按可能影响账户的金额与仓位，列出最多 3 项风险及依据。只有存在对应规则阈值或止损价时才计算距离；没有就标注未设置。给出可观察的触发条件，不凭空设红线。';
      }
      return base;
    },

    /* 对话每轮使用当前账本快照；持仓全量给出，交易、规则和心得按问题补充。 */
    buildAiChatContext(question, previousQuestion) {
      const ctx = this.buildAiContext('portfolio');
      const q = String(question || '');
      const followUp = /^(那|它|这只|这个|继续|接着|刚才|如果)/.test(q) || q.length <= 8;
      const topic = (q + ' ' + (followUp ? String(previousQuestion || '') : '')).toUpperCase();
      const related = ctx.holdings.filter(function (h) {
        const name = String(h.name || '').toUpperCase();
        const parts = name.match(/[\u4E00-\u9FFF]{2,}/g) || [];
        const aliases = parts.reduce(function (arr, p) {
          if (p.length >= 2) { arr.push(p.slice(0, 2)); arr.push(p.slice(-2)); }
          return arr;
        }, []).filter(function (p) { return ['集团', '控股', '股份', '中国', '公司'].indexOf(p) < 0; });
        return (h.code && topic.indexOf(String(h.code).toUpperCase()) >= 0) ||
          (name && topic.indexOf(name) >= 0) || aliases.some(function (p) { return topic.indexOf(p) >= 0; });
      });
      const codes = related.map(function (h) { return String(h.code).toUpperCase(); });
      const a = ctx.account;
      const lines = ctx.holdings.map(function (h) {
        return h.name + '(' + h.code + ') ' + h.shares + '股 成本' + h.avgCostText +
          ' 现价' + h.curPriceText + ' 市值¥' + h.marketValue + ' 占比' + h.ratio +
          '% 浮盈¥' + h.floatPnl + '(' + h.floatPct.toFixed(2) + '%)' +
          (h.dayChangePct == null ? '' : ' 当日涨跌' + h.dayChangePct + '%');
      });
      let out = '【当前账户快照】总资产¥' + a.totalAssets + '；今日盈亏' + (a.todayPnlReady ? '¥' + a.todayPnl : '行情待更新') +
        '；累计浮盈¥' + a.floatingPnl + '；已实现盈亏¥' + a.realizedPnl + '\n' +
        '【全部当前持仓】\n' + (lines.join('\n') || '无持仓') + '\n' +
        '现价来自 APP 最近一次行情缓存，未提供报价时间时不得说成实时价格。';
      const broad = /我的|账户|组合|整体|全部|复盘|诊断/.test(q);
      const needTrades = broad || related.length || /交易|买入|卖出|加仓|减仓|成本|止盈|止损/.test(q);
      const needRules = broad || related.length || /纪律|规则|违规|风险|止损|仓位/.test(q);
      const needInsights = broad || related.length || /心得|复盘|反思|情绪|原因|经验/.test(q);
      if (needTrades) {
        const trades = (codes.length ? ctx.trades.filter(function (t) { return codes.indexOf(String(t.code).toUpperCase()) >= 0; }) : ctx.trades).slice(0, 8);
        out += '\n【相关近期交易，最多 8 笔】\n' + (trades.map(function (t) {
          return t.date + ' ' + t.stock + ' ' + t.type + t.qty + '股@' + t.priceText;
        }).join('\n') || '无相关近期交易');
      }
      if (needRules) {
        out += '\n【启用的纪律规则】\n' + (ctx.rules.map(function (r) {
          return r.name + '：' + r.conditions;
        }).join('\n') || '无') + '\n【最近违规，最多 5 条】\n' +
          (ctx.violations.slice(0, 5).map(function (v) { return v.date + ' [' + (v.status === 'resolved' ? '已处理' : '待处理') + '] ' + v.desc; }).join('\n') || '无');
      }
      if (related.length) {
        const watch = ctx.positionLevels.filter(function (s) { return codes.indexOf(String(s.code).toUpperCase()) >= 0; });
        if (watch.length) out += '\n【相关观察价位】\n' + watch.map(function (s) {
          return s.name + '(' + s.code + ')' + (s.target ? ' 目标价' + s.targetText : '') + (s.stop ? ' 止损价' + s.stopText : ' 未设置止损价');
        }).join('\n');
      }
      if (needInsights) {
        let notes = this.getInsights().slice().sort(function (x, y) {
          return String(y.timestamp || '').localeCompare(String(x.timestamp || ''));
        });
        if (codes.length) {
          const matched = notes.filter(function (n) {
            const body = (n.title || '') + ' ' + (n.content || '') + ' ' + (n.tags || []).join(' ');
            return related.some(function (h) { return body.indexOf(h.name) >= 0 || body.toUpperCase().indexOf(String(h.code).toUpperCase()) >= 0; });
          });
          if (matched.length) notes = matched;
        }
        out += '\n【相关交易心得，最多 3 条】\n' + (notes.slice(0, 3).map(function (n) {
          return isoDate(n.timestamp) + ' ' + (n.title || '') + '：' + String(n.content || n.text || '').slice(0, 300);
        }).join('\n') || '无');
      }
      return out;
    },

    /* ---------- AI 报告 CRUD ---------- */
    getAiReports() { return state.aiReports.slice(); },
    saveAiReport(type, title, html, source) {
      var r = {
        // 同毫秒 ID 会被一并删除 → 加随机后缀避免冲突
        id: 'AR' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7).toUpperCase(),
        type: type || 'custom',
        title: title || 'AI 分析报告',
        html: html || '',
        source: source === 'local' ? 'local' : 'ai',
        timestamp: new Date().toISOString(),
      };
      state.aiReports.unshift(r);
      if (state.aiReports.length > 50) state.aiReports = state.aiReports.slice(0, 50);
      writeList(KEYS.aiReports, state.aiReports);
      return r;
    },
    deleteAiReport(id) {
      var before = state.aiReports.length;
      state.aiReports = state.aiReports.filter(function (r) { return r.id !== id; });
      if (state.aiReports.length < before) { writeList(KEYS.aiReports, state.aiReports); return true; }
      return false;
    },

    /* ---------- 撤销删除（restore） ----------
     * 配合 UI 的「删除后在提示条内撤销」：删除前把完整对象快照下来，
     * 撤销时原样塞回去。与 add* 的区别：
     *   1) 不做字段校验（快照本来就是合法数据）
     *   2) 保留原 id / timestamp，不重新生成
     *   3) 不触发纪律引擎扫描 —— 撤销是「撤销上一次操作」，不该再产生新违规
     * kind: trade | pool | insight | violation | report
     */
    restore(kind, obj) {
      if (!obj) return false;
      try {
        if (kind === 'trade') {
          if (state.trades.some(function (t) { return t.id === obj.id; })) return false;
          state.trades.push(obj);
          writeList(KEYS.trades, state.trades);
        } else if (kind === 'pool') {
          if (state.stockPoolStocks.some(function (s) { return s.id === obj.id; })) return false;
          state.stockPoolStocks.push(obj);
          writeList(KEYS.stockPoolStocks, state.stockPoolStocks);
        } else if (kind === 'insight') {
          if (state.tradingInsights.some(function (i) { return i.id === obj.id; })) return false;
          state.tradingInsights.unshift(obj);
          writeList(KEYS.tradingInsights, state.tradingInsights);
        } else if (kind === 'violation') {
          if (state.violationRecords.some(function (v) { return v.id === obj.id; })) return false;
          state.violationRecords.push(obj);
          writeList(KEYS.violationRecords, state.violationRecords);
        } else if (kind === 'report') {
          if (state.aiReports.some(function (r) { return r.id === obj.id; })) return false;
          state.aiReports.unshift(obj);
          writeList(KEYS.aiReports, state.aiReports);
        } else if (kind === 'rule') {
          if (state.disciplineRules.some(function (r) { return r.id === obj.id; })) return false;
          state.disciplineRules.push(obj);
          writeList(KEYS.disciplineRules, state.disciplineRules);
        } else {
          return false;
        }
        return true;
      } catch (e) { return false; }
    },

    aiAnalyze(type) {
      const d = this.dashboardSummary();
      const pos = d.positions.slice().sort((a,b) => b.floatingPnLPct - a.floatingPnLPct);
      const best = pos[0] || null;
      const worst = pos[pos.length - 1] || null;
      const winners = pos.filter(p => p.floatingPnL > 0).length;
      const losers = pos.filter(p => p.floatingPnL <= 0).length;
      const enabledRules = api.getRules().filter(r => r.enabled).length;
      const violCount = api.getViolations().length;
      const watchCount = (state.stockPoolStocks || []).filter(s => s.watch).length;
      const totalValue = d.totalAssets || 0;
      // 用户实际设置的单票浮亏止损线（从规则里读），避免硬编码 -8% 红线
      const lossRule = api.getRules().filter(function (r) {
        return r.enabled && (r.conditions || []).some(function (c) { return c.parameter === 'positionLossRatio'; });
      })[0];
      const lossThPct = lossRule ? (Math.round(Number(lossRule.conditions[0].value) * 1000) / 10) : null;
      const localTag = '<br><small class="dim">* 以上为本地统计，未使用大模型生成。</small>';
      // 零持仓时 best/worst 为 undefined，下面模板直接取 .stockName 会抛 TypeError
      // （清空数据后点任一分析维度都会静默失败）。这里统一给一份客观的空态结论。
      if (!pos.length && type !== 'discipline') {
        const t = type === 'trend' ? '趋势推演' : type === 'risk' ? '风险预警' : '持仓体检';
        return { title: '暂无持仓', source: 'local', html: `
          当前没有持仓，<b>${t}</b>需要至少一只标的才能计算。<br>
          · 先到「记录」页记一笔买入，或到「自选池」加入关注标的。<br>
          · 已有交易记录：${api.getTrades().length} 笔 · 已启用规则：${enabledRules} 条 · 违规记录：${violCount} 条。
        ` };
      }
      switch (type) {
        case 'portfolio': {
          return { title: '持仓整体体检', source: 'local', html: `
            你的组合共 <b>${pos.length}</b> 只标的，盈利 <span class="u">${winners}</span> 只，亏损 <span class="d">${losers}</span> 只。<br>
            · 最强头寸：<b>${best.stockName}</b> <span class="u">${best.floatingPnLPct.toFixed(2)}%</span>，浮动盈亏 <span class="u">¥ ${best.floatingPnL.toLocaleString()}</span>。<br>
            · 最弱头寸：<b>${worst.stockName}</b> <span class="d">${worst.floatingPnLPct.toFixed(2)}%</span>，浮动盈亏 <span class="d">¥ ${worst.floatingPnL.toLocaleString()}</span>。<br>
            · 今日盈亏 <b>${d.todayPnlReady ? '¥ ' + d.todayPnl.toLocaleString() + '（占净值 ' + d.todayDeltaPct.toFixed(2) + '%）' : '行情待更新，暂不可计算'}</b>，组合总浮盈 <b>¥ ${d.floatingPnl.toLocaleString()}</b>（${d.floatingPnlPct.toFixed(2)}%）。
            ${localTag}
          `};
        }
        case 'discipline': {
          return { title: '纪律系统扫描', source: 'local', html: `
            已启用 <b>${enabledRules}</b> 条硬规则，累计违规记录 <b>${violCount}</b> 次。<br>
            · 最近一次违规：<span class="u">${isoDate((api.getViolations()[0] || {}).timestamp) || '无'}</span> · ${(api.getViolations()[0] || {}).description || '—'}<br>
            · 单票浮亏止损线：${lossThPct != null ? ('<b>' + lossThPct + '%</b>') : '未设置（建议配置一条浮亏规则）'}。
            ${localTag}
          `};
        }
        case 'trend': {
          const monthsTxt = (typeof AppFifo !== 'undefined' ? AppFifo.monthlyStats(state.trades) : []).slice(-6)
            .map(function (m) { return m.month + '月 已实现¥' + m.realizedPnL.toLocaleString(); }).join('； ') || '暂无月度数据';
          return { title: '近期趋势推演', source: 'local', html: `
            近 6 个月已实现盈亏：${monthsTxt}。<br>
            · 当前组合浮动盈亏 <b>¥ ${d.floatingPnl.toLocaleString()}</b>（${d.floatingPnlPct.toFixed(2)}%），盈利 ${winners} 只 / 亏损 ${losers} 只。<br>
            · 观察池中关注标的 <b>${watchCount}</b> 只（可到自选池查看目标价 / 止损）。<br>
            · 本周交易 <b>${d.tradesThisWeek}</b> 笔。
            ${localTag}
          `};
        }
        case 'risk':
        default: {
          const maxPos = pos.reduce(function (a, b) { return (b.marketValue || 0) > (a.marketValue || 0) ? b : a; }, pos[0]);
          const maxRatio = totalValue > 0 ? Math.round((maxPos.marketValue / totalValue) * 1000) / 10 : 0;
          const gap = (lossThPct != null && worst) ? Math.max(0, lossThPct - Math.abs(worst.floatingPnLPct)) : null;
          return { title: '风险预警雷达', source: 'local', html: `
            最大单一标的：<b>${maxPos.stockName}</b> 占组合市值 <b>${maxRatio}%</b>（${maxRatio > 30 ? '<span class="d">偏集中</span>' : '分布较均衡'}）。<br>
            · 最弱头寸：<b>${worst.stockName}</b> 浮亏 <span class="d">${worst.floatingPnLPct.toFixed(2)}%</span>。<br>
            · 单票浮亏止损线：${lossThPct != null ? ('<b>' + lossThPct + '%</b>（距该线约 <b>' + gap.toFixed(2) + '%</b>）') : '未设置'}。<br>
            · 本周交易 <b>${d.tradesThisWeek}</b> 笔，已启用规则 <b>${enabledRules}</b> 条。
            ${localTag}
          `};
        }
      }
    },

    /* ---------- 配置读写 ---------- */
    /* 扩展配置（通知开关、触感反馈等开关类设置）单独存一个 JSON 键。
       昵称/AI 等仍沿用上面那些平铺的历史键，getConfig 时合并返回。 */
    _readExtraCfg() {
      try {
        var o = JSON.parse(localStorage.getItem('app_config_extra') || '{}');
        return (o && typeof o === 'object') ? o : {};
      } catch (e) { return {}; }
    },
    _writeExtraCfg(obj) {
      try { localStorage.setItem('app_config_extra', JSON.stringify(obj || {})); } catch (e) {}
    },
    getConfig() {
      var stylesRaw = localStorage.getItem(KEYS.userInvestingStyles);
      var styles = [];
      try { styles = JSON.parse(stylesRaw || '[]'); } catch(e) {}
      if (!Array.isArray(styles)) styles = [];
      var extra = this._readExtraCfg();
      return {
        nickname: localStorage.getItem(KEYS.userNickname) || '交易者',
        avatar: localStorage.getItem(KEYS.userAvatar) || '',
        occupation: localStorage.getItem(KEYS.userOccupation) || '',
        investingStyles: styles,
        bio: localStorage.getItem(KEYS.userBio) || '',
        phone: localStorage.getItem(KEYS.userPhone) || '',
        email: localStorage.getItem(KEYS.userEmail) || '',
        aiApiKey: localStorage.getItem(KEYS.aiApiKey) || '',
        aiApiUrl: localStorage.getItem(KEYS.aiApiUrl) || 'https://api.minimax.cn/v1/chat/completions',
        aiModel: localStorage.getItem(KEYS.aiModel) || 'MiniMax-M3',
        /* 开关类扩展配置：notif 为空对象时各开关按默认开启处理（调用方用 !== false 判断）。
           haptic 默认开启 */
        notif: extra.notif || {},
        haptic: extra.haptic !== false,
        quoteRefreshMinutes: extra.quoteRefreshMinutes === 10 ? 10 : 5,
        /* 行内手势（左滑 / 长按）教学状态：
           rowActLearned  = 用户真的做过一次手势 → 永久不再演示
           rowActHintCount = 已演示次数（跨进程封顶，避免一直演） */
        rowActLearned: extra.rowActLearned === true,
        rowActHintCount: Number(extra.rowActHintCount) || 0,
      };
    },
    /* 合并写入配置。patch 支持 notif / haptic，以及昵称等平铺字段 */
    setConfig(patch) {
      patch = patch || {};
      var extra = this._readExtraCfg();
      if (patch.notif !== undefined) extra.notif = patch.notif;
      if (patch.haptic !== undefined) extra.haptic = !!patch.haptic;
      if (patch.quoteRefreshMinutes !== undefined) extra.quoteRefreshMinutes = Number(patch.quoteRefreshMinutes) === 10 ? 10 : 5;
      /* 白名单之外的扩展字段必须显式登记，否则会被静默丢弃
         （rowActHinted 就是这么丢的：写入看着成功了，重开又弹一遍） */
      if (patch.rowActLearned !== undefined) extra.rowActLearned = !!patch.rowActLearned;
      if (patch.rowActHintCount !== undefined) extra.rowActHintCount = Number(patch.rowActHintCount) || 0;
      this._writeExtraCfg(extra);
      // 平铺字段与 setProfile / setAiConfig 共用同一份存储，避免两处各写一套
      var flat = {
        nickname: KEYS.userNickname, avatar: KEYS.userAvatar, occupation: KEYS.userOccupation,
        bio: KEYS.userBio, phone: KEYS.userPhone, email: KEYS.userEmail,
      };
      Object.keys(flat).forEach(function (k) {
        if (patch[k] !== undefined) localStorage.setItem(flat[k], patch[k] || '');
      });
      if (patch.investingStyles !== undefined) {
        localStorage.setItem(KEYS.userInvestingStyles, JSON.stringify(patch.investingStyles || []));
      }
      if (patch.aiApiKey !== undefined || patch.aiApiUrl !== undefined || patch.aiModel !== undefined) {
        this.setAiConfig(patch.aiApiKey, patch.aiApiUrl, patch.aiModel);
      }
      return this.getConfig();
    },
    setNickname(name) {
      localStorage.setItem(KEYS.userNickname, name || '交易者');
    },
    setProfile(data) {
      if (data.nickname !== undefined) localStorage.setItem(KEYS.userNickname, data.nickname || '交易者');
      if (data.avatar !== undefined) localStorage.setItem(KEYS.userAvatar, data.avatar || '');
      if (data.occupation !== undefined) localStorage.setItem(KEYS.userOccupation, data.occupation || '');
      if (data.investingStyles !== undefined) localStorage.setItem(KEYS.userInvestingStyles, JSON.stringify(data.investingStyles || []));
      if (data.bio !== undefined) localStorage.setItem(KEYS.userBio, data.bio || '');
      if (data.phone !== undefined) localStorage.setItem(KEYS.userPhone, data.phone || '');
      if (data.email !== undefined) localStorage.setItem(KEYS.userEmail, data.email || '');
    },
    setAiConfig(key, url, model) {
      localStorage.setItem(KEYS.aiApiKey, key || '');
      localStorage.setItem(KEYS.aiApiUrl, url || 'https://api.minimax.cn/v1/chat/completions');
      localStorage.setItem(KEYS.aiModel, model || 'MiniMax-M3');
    },

    /* ---------- 全量导入导出 ---------- */
    exportAll() {
      const data = {
        version: '2.0',
        exportedAt: nowIso(),
        trades: state.trades,
        stockPoolStocks: state.stockPoolStocks,
        disciplineRules: state.disciplineRules,
        violationRecords: state.violationRecords,
        tradingInsights: state.tradingInsights,
        aiReports: state.aiReports,
        accountSnapshots: state.accountSnapshots,
        // 个人配置（昵称/头像/简介/联系方式/投资风格/通知开关等），"全量导出"应名副其实
        nickname: localStorage.getItem(KEYS.userNickname) || '',
        userAvatar: localStorage.getItem(KEYS.userAvatar) || '',
        userOccupation: localStorage.getItem(KEYS.userOccupation) || '',
        userBio: localStorage.getItem(KEYS.userBio) || '',
        userPhone: localStorage.getItem(KEYS.userPhone) || '',
        userEmail: localStorage.getItem(KEYS.userEmail) || '',
        userInvestingStyles: (function () { try { return JSON.parse(localStorage.getItem(KEYS.userInvestingStyles) || '[]'); } catch (e) { return []; } })(),
        aiApiUrl: localStorage.getItem(KEYS.aiApiUrl) || '',
        aiModel: localStorage.getItem(KEYS.aiModel) || '',
        extraConfig: this._readExtraCfg(),
      };
      return JSON.stringify(data, null, 2);
    },
    importAll(jsonStr) {
      let data;
      try { data = (typeof jsonStr === 'string') ? JSON.parse(jsonStr) : jsonStr; }
      catch (e) { console.warn('[mock] importAll JSON 解析失败', e); return 0; }
      if (!data || typeof data !== 'object') return 0;
      let count = 0;
      var MARKETS = { sh: 1, sz: 1, hk: 1, us: 1, bj: 1 };
      function normMarket(m, code) {
        m = (typeof m === 'string') ? m.toLowerCase() : '';
        if (MARKETS[m]) return m;
        if (typeof AppMarket !== 'undefined' && AppMarket.detectMarket) return AppMarket.detectMarket(code || '');
        return 'us';
      }
      // 交易逐条归一化 + 必填校验：非法/缺失字段直接丢弃，避免 NaN 进 FIFO 后整页数字崩溃（#22）
      if (Array.isArray(data.trades)) {
        var normTrades = [];
        data.trades.forEach(function (t) {
          if (!t || typeof t !== 'object') return;
          var q = Number(t.quantity), p = Number(t.price);
          if (!t.stockCode || !t.stockName || !(q > 0) || !(p > 0)) return;
          if (t.type !== 'buy' && t.type !== 'sell') return;
          normTrades.push({
            id: t.id || ('IMP' + Date.now() + '_' + normTrades.length),
            stockCode: String(t.stockCode),
            stockName: String(t.stockName),
            type: t.type,
            quantity: q,
            price: p,
            fee: Number(t.fee) || 0,
            market: normMarket(t.market, t.stockCode),
            timestamp: (t.timestamp && !isNaN(new Date(t.timestamp).getTime())) ? t.timestamp : new Date().toISOString(),
            notes: String(t.notes || ''),
            tags: Array.isArray(t.tags) ? t.tags : [],
          });
        });
        state.trades = normTrades; writeList(KEYS.trades, state.trades); count++;
      }
      // 其余数组：确保为真数组且元素为对象，过滤脏数据
      function normArr(key, arr) {
        if (!Array.isArray(arr)) return false;
        var ok = arr.filter(function (x) { return x && typeof x === 'object'; });
        state[key] = ok; writeList(KEYS[key], state[key]); return true;
      }
      if (normArr('stockPoolStocks', data.stockPoolStocks)) count++;
      if (normArr('disciplineRules', data.disciplineRules)) count++;
      if (normArr('violationRecords', data.violationRecords)) count++;
      if (normArr('tradingInsights', data.tradingInsights)) count++;
      if (normArr('aiReports', data.aiReports)) count++;
      if (Array.isArray(data.accountSnapshots)) {
        state.accountSnapshots = data.accountSnapshots.filter(function (s) {
          return s && /^\d{4}-\d{2}-\d{2}$/.test(String(s.day || '')) && s.first && s.last &&
            Number.isFinite(Number(s.first.capturedAt)) && Number.isFinite(Number(s.last.capturedAt)) &&
            Number.isFinite(Number(s.first.floatingPnL)) && Number.isFinite(Number(s.last.floatingPnL)) &&
            Number.isFinite(Number(s.first.totalAssets)) && Number.isFinite(Number(s.last.totalAssets));
        }).sort(function (a, b) { return a.day.localeCompare(b.day); });
        writeList(KEYS.accountSnapshots, state.accountSnapshots);
        count++;
      }
      if (data.nickname) localStorage.setItem(KEYS.userNickname, data.nickname);
      if (data.userAvatar) localStorage.setItem(KEYS.userAvatar, data.userAvatar);
      if (data.userOccupation) localStorage.setItem(KEYS.userOccupation, data.userOccupation);
      if (data.userBio) localStorage.setItem(KEYS.userBio, data.userBio);
      if (data.userPhone) localStorage.setItem(KEYS.userPhone, data.userPhone);
      if (data.userEmail) localStorage.setItem(KEYS.userEmail, data.userEmail);
      if (Array.isArray(data.userInvestingStyles)) localStorage.setItem(KEYS.userInvestingStyles, JSON.stringify(data.userInvestingStyles));
      if (data.aiApiUrl) localStorage.setItem(KEYS.aiApiUrl, data.aiApiUrl);
      if (data.aiModel) localStorage.setItem(KEYS.aiModel, data.aiModel);
      // 额外配置（通知开关等）合并写入
      if (data.extraConfig && typeof data.extraConfig === 'object') {
        var ex = this._readExtraCfg();
        Object.keys(data.extraConfig).forEach(function (k) { ex[k] = data.extraConfig[k]; });
        this._writeExtraCfg(ex);
      }
      return count;
    },
    clearAll() {
      Object.values(KEYS).forEach(k => {
        if (k === 'app_ai_api_key') return; // API Key 保留不删
        localStorage.removeItem(k);
      });
      // 删所有 position_price_ 缓存
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith('position_price_')) localStorage.removeItem(k);
      }
      // 内存状态也重置为种子
      state.trades = seedTrades.slice();
      state.stockPoolStocks = seedStockPool.slice();
      state.disciplineRules = seedRules.slice();
      state.violationRecords = seedViolations.slice();
      state.tradingInsights = seedInsights.slice();
      state.aiReports = [];
      positionQuotes = {};
    },

    /* ---------- 批量更新股票池现价 ---------- */
    updateStockPrices(updates) {
      if (!updates || !updates.length) return 0;
      var map = {};
      updates.forEach(function (u) {
        if (u && u.price > 0 && Number(u.quoteFetchedAt) > 0) map[String(u.code).toUpperCase()] = u;
      });
      var changed = 0;
      state.stockPoolStocks.forEach(function (s) {
        var u = map[String(s.code).toUpperCase()];
        if (u && Number(u.quoteFetchedAt) >= Number(s.quoteFetchedAt || 0)) {
          s.price = u.price;
          if (u.changePercent !== undefined) s.changePercent = u.changePercent;
          if (u.change !== undefined) s.change = u.change;   // 当日涨跌额（今日盈亏用）
          if (u.market) s.market = u.market;
          s.quoteFetchedAt = u.quoteFetchedAt;
          s.quoteDate = u.quoteDate || '';
          changed++;
        }
      });
      var held = {};
      this.getPositions().positions.forEach(function (p) { held[String(p.stockCode).toUpperCase()] = true; });
      var inPool = {};
      state.stockPoolStocks.forEach(function (s) { inPool[String(s.code).toUpperCase()] = true; });
      Object.keys(map).forEach(function (code) {
        if (held[code] && !inPool[code] && Number(map[code].quoteFetchedAt) >= Number((positionQuotes[code] || {}).quoteFetchedAt || 0)) {
          positionQuotes[code] = Object.assign({ code: code }, map[code]);
          changed++;
        }
      });
      if (changed > 0) writeList(KEYS.stockPoolStocks, state.stockPoolStocks);
      if (Object.keys(positionQuotes).length > 0) {
        try { localStorage.setItem(KEYS.positionQuotes, JSON.stringify(positionQuotes)); }
        catch (err) { _writeErr = { key: KEYS.positionQuotes, at: Date.now(), message: String(err && err.message || err) }; }
      }
      return changed;
    },

    /* ---------- 批量添加股票到池 ---------- */
    batchAddStocks(items) {
      var ok = 0, fail = 0, errors = [];
      items.forEach(function (item, i) {
        var code = String(item.code || '').trim();
        if (!code) { fail++; errors.push('第' + (i + 1) + '行：代码为空'); return; }
        if (state.stockPoolStocks.some(function (s) { return s.code.toUpperCase() === code.toUpperCase(); })) {
          fail++; errors.push(code + ' 已在池中');
          return;
        }
        var market = item.market || (typeof AppMarket !== 'undefined' ? AppMarket.detectMarket(code) : 'us');
        var stock = {
          id: 'S' + String(Date.now()).slice(-6) + i,
          code: code,
          name: item.name || code,
          market: market,
          poolId: item.poolId || '2',
          researchStatus: item.researchStatus || 'new',
          thesis: item.thesis || '',
          targetPrice: item.targetPrice || 0,
          stopLossPrice: item.stopLossPrice || 0,
          price: item.price || 0,
          watch: item.watch !== undefined ? item.watch : (item.researchStatus === 'ready' || item.researchStatus === 'researching' || item.researchStatus === 'watching' ? true : false),
          tags: item.tags || [],
          addedAt: new Date().toISOString(),
        };
        state.stockPoolStocks.push(stock);
        ok++;
      });
      if (ok > 0) writeList(KEYS.stockPoolStocks, state.stockPoolStocks);
      return { ok: ok, fail: fail, errors: errors.slice(0, 5) };
    },

    /* ---------- CSV 导出（交易记录） ---------- */
    csvExportTrades() {
      const header = ['id', 'timestamp', 'type', 'stockCode', 'stockName', 'market', 'quantity', 'price', 'fee', 'amount', 'notes', 'tags'];
      const rows = state.trades.map(function (t) {
        const amt = (t.quantity || 0) * (t.price || 0);
        return [
          t.id || '',
          t.timestamp || '',
          t.type || '',
          t.stockCode || '',
          (t.stockName || '').replace(/"/g, '""'),
          t.market || _detectMarket(t.stockCode),
          t.quantity || 0,
          t.price || 0,
          t.fee || 0,
          Math.round(amt * 100) / 100,
          (t.notes || '').replace(/"/g, '""'),
          (t.tags || []).join('|'),
        ];
      });
      const csv = '\ufeff' + [header].concat(rows).map(function (r) {
        return r.map(function (c) {
          var s = String(c);
          return (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) ? '"' + s + '"' : s;
        }).join(',');
      }).join('\n');
      return csv;
    },

    /* ---------- CSV 导入 ---------- */
    csvImportTrades(csvText) {
      if (!csvText) return { ok: 0, fail: 0, errors: ['空文件'] };
      // 去 BOM
      csvText = csvText.replace(/^\uFEFF/, '');
      const lines = csvText.split(/\r?\n/).filter(function (l) { return l.trim(); });
      if (lines.length < 2) return { ok: 0, fail: 0, errors: ['只有表头'] };

      // 简单 CSV 解析（支持双引号包裹）
      function parseCsvLine(line) {
        const out = []; let cur = ''; let inQ = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === ',' && !inQ) { out.push(cur); cur = ''; continue; }
          cur += ch;
        }
        out.push(cur);
        return out;
      }

      const header = parseCsvLine(lines[0]).map(function (h) { return h.trim(); });
      const idx = {};
      header.forEach(function (h, i) { idx[h.toLowerCase()] = i; });

      // 映射 CSV 列 → Trade schema（容忍多种命名）
      const fieldMap = {
        id: idx.id,
        timestamp: idx.timestamp !== undefined ? idx.timestamp : (idx.date !== undefined ? idx.date : idx.time),
        type: idx.type,
        stockCode: idx.stockcode !== undefined ? idx.stockcode : (idx.code !== undefined ? idx.code : idx.symbol),
        stockName: idx.stockname !== undefined ? idx.stockname : (idx.name !== undefined ? idx.name : idx.stock),
        market: idx.market,
        quantity: idx.quantity !== undefined ? idx.quantity : (idx.qty !== undefined ? idx.qty : idx.shares),
        price: idx.price !== undefined ? idx.price : idx.cost,
        fee: idx.fee !== undefined ? idx.fee : idx.commission,
        notes: idx.notes !== undefined ? idx.notes : (idx.note !== undefined ? idx.note : idx.comment),
        tags: idx.tags !== undefined ? idx.tags : idx.tag,
      };

      let ok = 0, fail = 0, errors = [];
      const now = new Date().toISOString();
      var MARKETS = { sh: 1, sz: 1, hk: 1, us: 1, bj: 1 };

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const typeRaw = (cols[fieldMap.type] || '').trim().toLowerCase();
        let type = null;
        if (['buy', '买入', '多', 'long'].indexOf(typeRaw) >= 0) type = 'buy';
        else if (['sell', '卖出', '空', 'short'].indexOf(typeRaw) >= 0) type = 'sell';

        const stockCode = (cols[fieldMap.stockCode] || '').trim();
        const stockName = (cols[fieldMap.stockName] || '').trim();
        const quantity = parseFloat(cols[fieldMap.quantity]);
        const price = parseFloat(cols[fieldMap.price]);
        const mktRaw = (cols[fieldMap.market] || '').trim().toLowerCase();
        const tsRaw = cols[fieldMap.timestamp];

        // —— 行级校验（#21）：方向无法识别 / 市场非白名单 / 时间戳非法 / 必要字段缺失，
        //     一律计为失败行并提示，绝不静默用默认值（否则美元按 CNY 少算 7 倍、
        //     卖出误当买入使盈亏符号反转、月度图出现垃圾条目）。
        if (!type) { fail++; errors.push('第' + (i + 1) + '行：交易方向无法识别（需 buy/sell 或 买入/卖出）'); continue; }
        if (mktRaw && !MARKETS[mktRaw]) { fail++; errors.push('第' + (i + 1) + '行：市场「' + mktRaw + '」不在白名单（sh/sz/hk/us/bj）'); continue; }
        if (!tsRaw || isNaN(new Date(tsRaw).getTime())) { fail++; errors.push('第' + (i + 1) + '行：时间戳无效'); continue; }
        if (!stockCode || !stockName || !(quantity > 0) || !(price > 0)) { fail++; errors.push('第' + (i + 1) + '行：缺少必要字段（stockCode/stockName/quantity/price）'); continue; }

        // 市场字段缺失时按代码探测（保证币种归属正确）
        const market = mktRaw || ((typeof AppMarket !== 'undefined' && AppMarket.detectMarket)
          ? AppMarket.detectMarket(stockCode)
          : _detectMarket(stockCode));
        const t = {
          id: cols[fieldMap.id] || ('IMP' + Date.now() + '_' + i),
          timestamp: tsRaw,
          type: type,
          stockCode: stockCode,
          stockName: stockName,
          quantity: quantity,
          price: price,
          fee: parseFloat(cols[fieldMap.fee]) || 0,
          notes: (cols[fieldMap.notes] || '').trim(),
          market: market,
          tags: String(cols[fieldMap.tags] || '').split(/[|;\s]+/).filter(Boolean),
        };
        state.trades.push(t);
        ok++;
      }

      if (ok > 0) writeList(KEYS.trades, state.trades);
      return { ok: ok, fail: fail, errors: errors.slice(0, 5) };
    },

    /* ---------- 月度 BarChart 数据（买卖金额已折算人民币） ---------- */
    monthlyTradeStats() {
      const trades = state.trades;
      if (!trades.length) return [];
      var fxRates = (typeof AppMarket !== 'undefined' && AppMarket.getFxRates) ? AppMarket.getFxRates() : { USD: 7.1, HKD: 0.91, CNY: 1 };
      function toCny(amt, market) {
        if (typeof AppMarket !== 'undefined' && AppMarket.fxToCny) return AppMarket.fxToCny(amt, market, fxRates);
        var r = market === 'us' ? fxRates.USD : market === 'hk' ? fxRates.HKD : 1;
        return (Number(amt) || 0) * r;
      }
      const map = {};
      trades.forEach(function (t) {
        var m = String(t.timestamp || '').slice(0, 7);
        if (!m) return;
        if (!map[m]) map[m] = { month: m, buyAmt: 0, sellAmt: 0, tradeCount: 0 };
        var amt = toCny((t.quantity || 0) * (t.price || 0), t.market);
        if (t.type === 'buy') map[m].buyAmt += amt;
        else if (t.type === 'sell') map[m].sellAmt += amt;
        map[m].tradeCount++;
      });
      // 加 realizedPnL（有 FIFO 才加，已折算人民币）
      if (typeof AppFifo !== 'undefined') {
        const monthly = AppFifo.monthlyStats(trades, fxRates);
        monthly.forEach(function (ms) {
          if (map[ms.month]) map[ms.month].realizedPnL = ms.realizedPnL;
        });
      }
      return Object.values(map).sort(function (a, b) { return a.month.localeCompare(b.month); });
    },

    /* ---------- 辅助 ---------- */
    isoDate: isoDate,
    beijingYmd: beijingYmd,
    getWriteError: getWriteError,
    clearWriteError: clearWriteError,
  };

  global.AppData = api;
})(window);
