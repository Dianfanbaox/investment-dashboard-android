/* =========================================================
   投资看板 APP 1.0 · 纪律规则引擎
   完全移植 src/hooks/useDisciplineCheck.ts 的 5 种条件，
   并新增 positionRatio / positionLossRatio / weeklyTradeCount /
   intradayChangePct 四种行情/持仓相关条件。
   
   触发时机：
     - 单笔交易 → checkTrade()
     - 全持仓扫描 → scanPositions() （每次现价刷新后调）
     - 周交易频率 → scanWeekly()
   ========================================================= */
(function (global) {
  'use strict';

  /* ---- 单票人民币市值：优先用 FIFO 输出的 marketValue（已按最新汇率折 CNY） ----
     兜底才退回 currentPrice*shares（无行情 / 老结构），保证任何情况下都能算出一个值。 */
  function posValueCny(p) {
    if (!p) return 0;
    if (p.marketValue != null && isFinite(Number(p.marketValue))) return Number(p.marketValue);
    return (Number(p.currentPrice) || 0) * (Number(p.shares) || 0);
  }

  /* ---- 金额折人民币（日盈亏/占比跨币种混算修复用，#26） ---- */
  function toCny(amt, market) {
    if (typeof AppMarket !== 'undefined' && AppMarket.fxToCny) return AppMarket.fxToCny(amt, market);
    return Number(amt) || 0;
  }
  // 取某只标的的市场（优先持仓，其次股票池），用于把单笔盈亏按原币折人民币
  function marketOf(stockCode, positions) {
    var up = String(stockCode || '').toUpperCase();
    if (positions) {
      for (var i = 0; i < positions.length; i++) {
        if (String(positions[i].stockCode).toUpperCase() === up && positions[i].market) return positions[i].market;
      }
    }
    if (typeof global.AppData !== 'undefined' && global.AppData.getStockPool) {
      var pool = global.AppData.getStockPool();
      for (var j = 0; j < pool.length; j++) {
        if (String(pool[j].code).toUpperCase() === up && pool[j].market) return pool[j].market;
      }
    }
    return undefined; // 未识别 → toCny 按 CNY 处理
  }

  /* ---- 条件求值核心 ---- */
  function checkCondition(cond, trade, allTrades, positions, quotes) {
    var type = cond.type;
    var op = cond.operator;
    var value = Number(cond.value);
    var param = cond.parameter || '';

    function cmp(a, b) {
      if (op === 'greater') return a > b;
      if (op === 'less') return a < b;
      if (op === 'equal') return a === b;
      if (op === 'greater_equal') return a >= b;
      if (op === 'less_equal') return a <= b;
      return false;
    }

    // 1. 价格条件：单笔成交价
    if (type === 'price') {
      if (param === 'intradayChangePct') {
        // 日内涨跌幅 — 需要行情
        var q = quotes && quotes.get ? quotes.get(String(trade.stockCode).toUpperCase()) : null;
        if (!q) return false;
        return cmp(q.changePercent, value);
      }
      // 默认：成交价
      return cmp(trade.price, value);
    }

    // 2. 数量条件（先检查 param 特殊场景）
    if (type === 'volume') {
      if (param === 'positionRatio') {
        // 单票仓位占比 — 需要 positions
        // 注意：必须用 fifo 输出的 marketValue（已折人民币）。
        // 原实现用 currentPrice*shares 直接相加，等于把 HKD/USD/CNY 混在一起算，
        // 港股腾讯与 A 股茅台会被当成同一币种，占比严重失真 → 「单票>20%」每次扫描必误报。
        if (!positions) return false;
        var total = positions.reduce(function (s, p) { return s + posValueCny(p); }, 0);
        if (total <= 0) return false;
        var maxRatio = Math.max.apply(null, positions.map(function (p) {
          return posValueCny(p) / total;
        }));
        return cmp(maxRatio, value);
      }
      if (param === 'weeklyTradeCount') {
        // 周交易笔数
        var now = new Date();
        var weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        weekStart.setHours(0, 0, 0, 0);
        var cnt = (allTrades || []).filter(function (t) {
          return new Date(t.timestamp) >= weekStart;
        }).length;
        return cmp(cnt, value);
      }
      // 默认：交易数量
      return cmp(trade.quantity, value);
    }

    // 3. 时间条件（按 小时 + 分钟/60 比较，支持「14:50」精确到分）
    if (type === 'time') {
      var dt = new Date(trade.timestamp);
      var tval = dt.getHours() + dt.getMinutes() / 60;
      return cmp(tval, value);
    }

    // 4. 单票浮亏率 — 需要 positions（FIFO 结果）
    if (type === 'loss' && param === 'positionLossRatio') {
      if (!positions) return false;
      return positions.some(function (p) {
        return p.floatingPnLPct < -value * 100; // value 存 0.08 这样的小数
      });
    }

    // 5. 日亏损（已实现）
    if (type === 'loss' && param === 'dailyLossRatio') {
      if (!positions || positions.length === 0) return false;
      var totalAssetsDlr = positions.reduce(function (s, p) { return s + posValueCny(p); }, 0);
      if (totalAssetsDlr <= 0) return false;
      var todayDlr = new Date();
      todayDlr.setHours(0, 0, 0, 0);
      var todaySellsDlr = (allTrades || []).filter(function (t) {
        return t.type === 'sell' && new Date(t.timestamp) >= todayDlr;
      });
      if (todaySellsDlr.length === 0) return false;
      var lossDlr = 0;
      todaySellsDlr.forEach(function (sell) {
        var buys = (allTrades || []).filter(function (b) {
          return b.stockCode === sell.stockCode && b.type === 'buy' && new Date(b.timestamp) < new Date(sell.timestamp);
        });
        if (buys.length > 0) {
          var avg = buys.reduce(function (s, b) { return s + b.price * b.quantity; }, 0) /
                    buys.reduce(function (s, b) { return s + b.quantity; }, 0);
          // 折人民币后再汇总（#26：原实现三个市场金额直接相加无意义）
          lossDlr += toCny((sell.price - avg) * sell.quantity - (sell.fee || 0), (sell.market || marketOf(sell.stockCode, positions)));
        }
      });
      return cmp(-lossDlr / totalAssetsDlr, value); // lossDlr 为负表示亏损，取反后比较
    }

    // 6. 日亏损（已实现，绝对金额）—— 跨币种统一折人民币，operator 生效（#26）
    if (type === 'loss') {
      var today = new Date();
      today.setHours(0, 0, 0, 0);
      var todaySells = (allTrades || []).filter(function (t) {
        return t.type === 'sell' && new Date(t.timestamp) >= today;
      });
      if (todaySells.length === 0) return false;
      var totalLossCny = 0;
      todaySells.forEach(function (sell) {
        var buys = (allTrades || []).filter(function (b) {
          return b.stockCode === sell.stockCode && b.type === 'buy' && new Date(b.timestamp) < new Date(sell.timestamp);
        });
        if (buys.length > 0) {
          var avg = buys.reduce(function (s, b) { return s + b.price * b.quantity; }, 0) /
                    buys.reduce(function (s, b) { return s + b.quantity; }, 0);
          // 按原币算盈亏后折人民币，避免美股/港股直接相加成无意义数字
          var pnl = (sell.price - avg) * sell.quantity - (sell.fee || 0);
          totalLossCny += toCny(pnl, (sell.market || marketOf(sell.stockCode, positions)));
        }
      });
      return cmp(-totalLossCny, value); // 亏损用 -totalLoss 与阈值比较，operator 生效
    }

    // 7. 日盈利 —— 同跨币种折人民币 + operator（#26）
    if (type === 'profit') {
      var todayP = new Date();
      todayP.setHours(0, 0, 0, 0);
      var todaySellsP = (allTrades || []).filter(function (t) {
        return t.type === 'sell' && new Date(t.timestamp) >= todayP;
      });
      if (todaySellsP.length === 0) return false;
      var totalProfitCny = 0;
      todaySellsP.forEach(function (sell) {
        var buys = (allTrades || []).filter(function (b) {
          return b.stockCode === sell.stockCode && b.type === 'buy' && new Date(b.timestamp) < new Date(sell.timestamp);
        });
        if (buys.length > 0) {
          var avgP = buys.reduce(function (s, b) { return s + b.price * b.quantity; }, 0) /
                     buys.reduce(function (s, b) { return s + b.quantity; }, 0);
          var pnlP = (sell.price - avgP) * sell.quantity - (sell.fee || 0);
          totalProfitCny += toCny(pnlP, (sell.market || marketOf(sell.stockCode, positions)));
        }
      });
      return cmp(totalProfitCny, value);
    }

    return false;
  }

  /* ---- severity 映射 rule.severity → violation.severity ---- */
  function mapSeverity(s) {
    if (s === 'high') return 'error';
    if (s === 'medium') return 'warning';
    return 'info';
  }

  /* ---- 条件作用域（第一性原理：规则必须绑定触发事件） ----
     trade   ：单笔交易事件可判定（成交价/数量/时间/周频次）
     account ：需要账户状态或行情（仓位占比/浮亏率/日盈亏/日内涨跌幅），
               只在行情刷新后的持仓扫描中判定，与单笔交易无关
  */
  function conditionScope(c) {
    if (c.parameter === 'intradayChangePct') return 'account';
    if (c.parameter === 'positionRatio') return 'account';
    if (c.parameter === 'positionLossRatio') return 'account';
    if (c.parameter === 'dailyLossRatio') return 'account';
    if (c.type === 'loss' || c.type === 'profit') return 'account'; // 日盈亏按当天全部卖出汇总，与单笔无关
    return 'trade';
  }

  /* ---- 扫描所有规则（支持传 trades/positions/quotes，也支持不传自动读 AppData） ---- */
  function scanRules(context) {
    var ctx = context || {};
    var event = ctx.trade ? 'trade' : 'account'; // 当前触发事件类型
    var rules = (ctx.rules || (global.AppData && global.AppData.getRules ? global.AppData.getRules() : [])).filter(function (r) { return r.enabled; });
    var allTrades = ctx.trades || (global.AppData && global.AppData.getTrades ? global.AppData.getTrades() : []);
    var positions = ctx.positions || (typeof AppFifo !== 'undefined' && global.AppData
      ? global.AppFifo.fifoPositions(allTrades, global.AppData.getStockPool ? global.AppData.getStockPool() : [])
      : null);
    var quotes = ctx.quotes || null;
    // fifoPositions 返回 {positions:[...], total...}，这里统一取出数组
    var posList = (positions && positions.positions) ? positions.positions : positions;

    // 如果 ctx.trade 传了，只针对单笔交易扫描
    var target = ctx.trade;
    var violations = [];
    // 24h 冷却：同一规则短期内不重复记违规（防反复刷台账）
    var existing = ctx.violations || (global.AppData && global.AppData.getViolations ? global.AppData.getViolations() : []);
    var lastTsByRule = {};
    existing.forEach(function (v) {
      var ts = new Date(v.timestamp || 0).getTime() || 0;
      if (!lastTsByRule[v.ruleId] || ts > lastTsByRule[v.ruleId]) lastTsByRule[v.ruleId] = ts;
    });

    rules.forEach(function (rule) {
      if (!rule.conditions || rule.conditions.length === 0) return;
      // 只评估属于当前事件作用域的条件（规则内混合作用域时按子集判断）
      var scoped = rule.conditions.filter(function (c) { return conditionScope(c) === event; });
      if (scoped.length === 0) return;
      var triggered = scoped.some(function (c) {
        // 日内涨跌幅是「按票」判定的账户级条件。账户扫描时没有单笔交易，
        // 原实现传 {} → stockCode 变 'UNDEFINED' → 行情恒取不到 → 规则永不触发。
        // 改为遍历持仓逐票取行情，任一只命中即算触发。
        if (c.parameter === 'intradayChangePct' && !ctx.trade) {
          if (!posList || !posList.length) return false;
          return posList.some(function (p) {
            return checkCondition(c, { stockCode: p.stockCode, market: p.market }, allTrades, posList, quotes);
          });
        }
        return checkCondition(c, target || {}, allTrades, posList, quotes);
      });
      if (!triggered) return;
      // 冷却检查：同规则 24h 内已记过则跳过
      if (lastTsByRule[rule.id] && Date.now() - lastTsByRule[rule.id] < 24 * 3600 * 1000) return;

      var v = {
        id: 'V' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6).toUpperCase(),
        ruleId: rule.id,
        ruleName: rule.name,
        description: rule.description || ('触发规则：' + rule.name),
        severity: mapSeverity(rule.severity),
        status: 'pending',
        timestamp: new Date().toISOString(),
      };
      // 记录触发该违规的交易（仅单笔交易事件有），供合规率按 tradeId 排除（#27）
      if (ctx.trade && ctx.trade.id) v.tradeId = ctx.trade.id;
      violations.push(v);

      // 自动写入 AppData（如果可用）
      if (global.AppData && typeof global.AppData.addViolation === 'function') {
        try { global.AppData.addViolation(v); } catch (_) {}
      }
    });

    return violations;
  }

  /* ---- 单笔交易后扫描（只判 trade 作用域条件：价格/数量/时间/周频次） ---- */
  function checkTrade(trade) {
    return scanRules({ trade: trade });
  }

  /* ---- 持仓级扫描（仓位占比/浮亏率/日盈亏/日内涨跌幅，行情刷新后调用） ---- */
  function scanPositions(ctx) {
    return scanRules(ctx || {});
  }

  /* ---- 违规统计（给 BarChart） ---- */
  function violationStats(violations, trades) {
    var now = new Date();
    var months = {};
    for (var i = 5; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      var key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
      // key 为 YYYY-MM（供调用方精确匹配月份），month 为展示用「09月」
      months[key] = { key: key, month: key.slice(5) + '月', compliant: 0, violated: 0 };
    }
    // 被违规关联的交易（按 tradeId）不再计入「合规」，否则合规率虚高（#27）
    var violatedTradeIds = {};
    (violations || []).forEach(function (v) {
      if (v.tradeId) violatedTradeIds[v.tradeId] = true;
      var m = String(v.timestamp || '').slice(0, 7);
      if (months[m]) months[m].violated++;
    });
    (trades || []).forEach(function (t) {
      var m = String(t.timestamp || '').slice(0, 7);
      if (months[m]) {
        if (!violatedTradeIds[t.id]) months[m].compliant++;
      }
    });
    return Object.values(months);
  }

  global.AppDiscipline = {
    checkCondition: checkCondition,
    checkTrade: checkTrade,
    scanPositions: scanPositions,
    scanRules: scanRules,
    conditionScope: conditionScope,
    violationStats: violationStats,
    mapSeverity: mapSeverity,
  };
})(window);
