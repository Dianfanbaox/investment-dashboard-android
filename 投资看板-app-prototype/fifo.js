/* =========================================================
   投资看板 APP 1.0 · FIFO 持仓 / 盈亏计算引擎
   完全移植 src/hooks/usePositions.ts 的算法。
   输入 trades[] + 可选 stockPoolPrices Map，输出持仓汇总。
   纯函数：每次调用都返回新对象，不依赖全局状态。
   ========================================================= */
(function (global) {
  'use strict';

  /* ---- 汇率折率获取（默认从 AppMarket 缓存取，未接入时退化为 1:1） ---- */
  function fifoRates(fxRates) {
    if (fxRates) return fxRates;
    if (typeof AppMarket !== 'undefined' && AppMarket.getFxRates) return AppMarket.getFxRates();
    return { USD: 1, HKD: 1, CNY: 1, fallback: true };
  }
  function fifoCur(market) { return market === 'us' ? 'USD' : market === 'hk' ? 'HKD' : 'CNY'; }
  /* ---- 统一市场解析：两处引擎（fifoPositions / allSellRealized）共用，
     避免「未知市场一个按 USD 一个按 CNY」给出相差 7 倍的结果（#14）。
     优先级：交易自带 market → 股票池匹配 → 未识别则按 CNY（fifoCur 兜底）。 */
  function fifoResolveMarket(stockCode, sorted, stockPool) {
    for (var i = 0; i < (sorted || []).length; i++) {
      if (sorted[i].market) return sorted[i].market;
    }
    if (stockPool) {
      for (var j = 0; j < stockPool.length; j++) {
        if (String(stockPool[j].code).toUpperCase() === String(stockCode).toUpperCase() && stockPool[j].market) {
          return stockPool[j].market;
        }
      }
    }
    return undefined;
  }
  function fifoToCny(amt, market, rates) {
    var r = market === 'us' ? rates.USD : market === 'hk' ? rates.HKD : 1;
    return (Number(amt) || 0) * r;
  }

  /* ---- 核心：FIFO 匹配买卖 lot ---- */
  function fifoPositions(trades, stockPool, fxRates) {
    if (!trades || trades.length === 0) {
      return {
        totalValue: 0, totalCost: 0,
        totalFloatingPnL: 0, totalFloatingPnLPct: 0,
        totalRealizedPnL: 0,
        positions: [],
      };
    }

    // 现价优先读 stockPool 里的 price（如果 market.js 刷新过）
    var priceMap = new Map();
    (stockPool || []).forEach(function (s) {
      if (s.price && s.price > 0) priceMap.set(String(s.code).toUpperCase(), s.price);
    });

    // 按 stockCode 分组
    var groups = new Map();
    trades.forEach(function (t) {
      var key = String(t.stockCode).toUpperCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });

    var positions = [];
    var totalValue = 0, totalCost = 0, totalFloatingPnL = 0, totalRealizedPnL = 0;
    var rates = fifoRates(fxRates);
    var warnings = []; // 数据异常（如卖出量超过持仓），交给上层提示

    groups.forEach(function (stockTrades, stockCode) {
      // 按 timestamp 时间升序
      var sorted = stockTrades.slice().sort(function (a, b) {
        return (a.timestamp || '').localeCompare(b.timestamp || '');
      });

      var lots = [];         // FIFO lot 队列
      var realizedPnL = 0;   // 该 stock 累计已实现
      var buyCount = 0, sellCount = 0;
      var stockName = stockCode;
      var market;

      sorted.forEach(function (t) {
        stockName = t.stockName || stockCode;
        if (t.type === 'buy') {
          buyCount++;
          // 手续费口径：买入手续费摊进每股成本（成本含费），
          // 否则持仓成本偏低、浮盈与已实现盈亏都虚高。
          var feePerShare = (Number(t.fee) || 0) / (Number(t.quantity) || 1);
          lots.push({ price: (Number(t.price) || 0) + feePerShare, quantity: t.quantity, timestamp: t.timestamp });
        } else if (t.type === 'sell') {
          sellCount++;
          var remaining = t.quantity;
          var sellFeeTotal = Number(t.fee) || 0;
          var sellQtyTotal = Number(t.quantity) || 0;
          while (remaining > 0 && lots.length > 0) {
            var lot = lots[0];
            var sellQty = Math.min(lot.quantity, remaining);
            realizedPnL += (t.price - lot.price) * sellQty;
            // 卖出手续费按这一段成交量占比摊入
            if (sellFeeTotal && sellQtyTotal > 0) {
              realizedPnL -= sellFeeTotal * (sellQty / sellQtyTotal);
            }
            lot.quantity -= sellQty;
            remaining -= sellQty;
            if (lot.quantity <= 0) lots.shift();
          }
          // 卖出量超过持仓：多卖的部分被静默丢弃，已实现盈亏会被少算（#13）。
          // 标记数据异常，交给上层提示用户核对交易记录。
          if (remaining > 0) {
            warnings.push({ stockCode: stockCode, stockName: stockName, oversoldQty: remaining, type: 'oversold' });
          }
        }
      });

      // 市场解析统一走 fifoResolveMarket（见文件顶部），fifoPositions / allSellRealized 共用
      market = fifoResolveMarket(stockCode, sorted, stockPool);

      // 当前持仓
      var shares = lots.reduce(function (s, l) { return s + l.quantity; }, 0);
      var costSum = lots.reduce(function (s, l) { return s + l.price * l.quantity; }, 0);
      var avgCost = shares > 0 ? costSum / shares : 0;
      var currentPrice = priceMap.get(stockCode) || avgCost; // fallback 成本价
      var floatingPnL = shares > 0 ? (currentPrice - avgCost) * shares : 0;
      var floatingPnLPct = avgCost > 0 ? ((currentPrice - avgCost) / avgCost) * 100 : 0;

      // 折人民币：单价/成本/市值/盈亏统一按最新汇率折算（原币 avgCost/currentPrice 保留用于展示）
      var cur = fifoCur(market);
      var marketValueCny = fifoToCny(shares * currentPrice, market, rates);
      var costCny = fifoToCny(shares * avgCost, market, rates);
      var floatingPnLCny = marketValueCny - costCny;

      totalValue += marketValueCny;
      totalCost += costCny;
      totalFloatingPnL += floatingPnLCny;
      totalRealizedPnL += fifoToCny(realizedPnL, market, rates);

      if (shares > 0) {
        positions.push({
          stockCode: stockCode, stockName: stockName, market: market, currency: cur,
          shares: shares, avgCost: avgCost, currentPrice: currentPrice,
          marketValue: marketValueCny, cost: costCny,
          floatingPnL: floatingPnLCny, floatingPnLPct: floatingPnLPct,
          realizedPnL: fifoToCny(realizedPnL, market, rates),
          buyCount: buyCount, sellCount: sellCount,
        });
      }
    });

    // 按浮动盈亏从高到低排
    positions.sort(function (a, b) { return b.floatingPnL - a.floatingPnL; });
    var totalFloatingPnLPct = totalCost > 0 ? ((totalValue - totalCost) / totalCost) * 100 : 0;

    return {
      totalValue: totalValue, totalCost: totalCost,
      totalFloatingPnL: totalFloatingPnL,
      totalFloatingPnLPct: totalFloatingPnLPct,
      totalRealizedPnL: totalRealizedPnL,
      positions: positions,
      warnings: warnings,
    };
  }

  /* ---- 所有卖出交易的已实现盈亏明细（FIFO 逐笔） ----
     返回 [{ tradeId, stockCode, stockName, sellQty, sellPrice, realizedPnL, sellTimestamp }]
     给 AI 分析胜率/持有周期用
  */
  function allSellRealized(trades, fxRates, stockPool) {
    if (!trades || trades.length === 0) return [];
    var rates = fifoRates(fxRates);
    var groups = new Map();
    trades.forEach(function (t) {
      var key = String(t.stockCode).toUpperCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(t);
    });

    var result = [];
    groups.forEach(function (stockTrades, stockCode) {
      // 市场解析与 fifoPositions 共用 fifoResolveMarket（#14）：未知市场按 CNY 兜底，
      // 不再像旧实现默认 'us'（USD），否则两引擎对同一批数据给出相差 7 倍的结果。
      var market = fifoResolveMarket(stockCode, stockTrades, stockPool);
      var sorted = stockTrades.slice().sort(function (a, b) {
        return (a.timestamp || '').localeCompare(b.timestamp || '');
      });
      var lots = [];
      sorted.forEach(function (t) {
        if (t.type === 'buy') {
          // 与 fifoPositions 同口径：买入手续费摊进每股成本
          var feePerShare2 = (Number(t.fee) || 0) / (Number(t.quantity) || 1);
          lots.push({ price: (Number(t.price) || 0) + feePerShare2, quantity: t.quantity, timestamp: t.timestamp });
        } else if (t.type === 'sell') {
          var remaining = t.quantity;
          var sellPnL = 0;
          var totalSellQty = 0;
          var feeTotal2 = Number(t.fee) || 0;
          var qtyTotal2 = Number(t.quantity) || 0;
          while (remaining > 0 && lots.length > 0) {
            var lot = lots[0];
            var sellQty = Math.min(lot.quantity, remaining);
            sellPnL += (t.price - lot.price) * sellQty;
            if (feeTotal2 && qtyTotal2 > 0) sellPnL -= feeTotal2 * (sellQty / qtyTotal2);
            totalSellQty += sellQty;
            lot.quantity -= sellQty;
            remaining -= sellQty;
            if (lot.quantity <= 0) lots.shift();
          }
          result.push({
            tradeId: t.id, stockCode: stockCode, stockName: t.stockName || stockCode,
            sellQty: totalSellQty, sellPrice: t.price,
            realizedPnL: fifoToCny(sellPnL, market, rates),
            sellTimestamp: t.timestamp,
          });
        }
      });
    });
    return result.sort(function (a, b) { return (b.sellTimestamp || '').localeCompare(a.sellTimestamp || ''); });
  }

  /* ---- 月度盈亏聚合（给 Step 8 月度 BarChart） ----
     已实现盈亏按卖出 timestamp 月份归档（已折算人民币）
     返回 [{ month: '2026-08', realizedPnL, tradeCount, sells, buys }]
  */
  function monthlyStats(trades, fxRates) {
    if (!trades || trades.length === 0) return [];
    var sells = allSellRealized(trades, fxRates);
    var map = {};
    trades.forEach(function (t) {
      var m = String(t.timestamp || '').slice(0, 7); // YYYY-MM
      if (!m) return;
      if (!map[m]) map[m] = { month: m, realizedPnL: 0, tradeCount: 0, sells: 0, buys: 0 };
      map[m].tradeCount++;
      if (t.type === 'buy') map[m].buys++; else map[m].sells++;
    });
    sells.forEach(function (s) {
      var m = String(s.sellTimestamp || '').slice(0, 7);
      if (!m) return;
      if (map[m]) map[m].realizedPnL += s.realizedPnL;
    });
    return Object.values(map).sort(function (a, b) { return a.month.localeCompare(b.month); });
  }

  /* ---- 纪律评分（和 Web 版 Home 一致的近似算法） ----
     纯前端估算：风险控制 / 仓位管理 / 规则遵守 三维
  */
  function disciplineScore(positions, rules) {
    var score = 0, dims = 0;

    // 维度 1：风险控制（是否有 loss 类型规则启用）
    var hasLossRule = (rules || []).some(function (r) {
      return r.enabled && (r.conditions || []).some(function (c) { return c.type === 'loss'; });
    });
    score += hasLossRule ? 85 : 60; dims++;

    // 维度 2：仓位管理（单股最大占比，统一用人民币市值避免跨币种错配）
    var total = (positions || []).reduce(function (s, p) {
      return s + (p.marketValue != null ? p.marketValue : p.currentPrice * p.shares);
    }, 0);
    var maxRatio = total > 0 ? Math.max.apply(null, (positions || []).map(function (p) {
      return (p.marketValue != null ? p.marketValue : p.currentPrice * p.shares) / total;
    })) : 0;
    score += maxRatio > 0.3 ? 60 : (maxRatio > 0.2 ? 80 : 95); dims++;

    // 维度 3：规则遵守（启用数 > 0 得分）
    var enabledCount = (rules || []).filter(function (r) { return r.enabled; }).length;
    score += enabledCount > 0 ? 80 : 50; dims++;

    return Math.round(score / dims);
  }

  global.AppFifo = {
    fifoPositions: fifoPositions,
    allSellRealized: allSellRealized,
    monthlyStats: monthlyStats,
    disciplineScore: disciplineScore,
  };
})(window);
