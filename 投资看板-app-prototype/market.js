/* =========================================================
   投资看板 APP 1.0 · 市场服务（腾讯行情直连）
   完全移植 src/services/marketService.ts 的核心算法。
   数据源：https://qt.gtimg.cn （已实测浏览器 CORS 允许 *）
   支持 A股(沪深) / 港股 / 美股 四市场，自动检测。
   ========================================================= */
(function (global) {
  'use strict';

  /* ---- 代码 → 腾讯 symbol 前缀 ---- */
  function symbolToTencent(code, market) {
    var c = String(code).trim().toUpperCase();
    // 统一走 detectMarket：它会先剥离 SH/SZ/HK/US/BJ 之类前缀，再判断市场，
    // 避免「SH600519」「HK00700」这类带前缀代码被误判成美股。
    var m = market || detectMarket(c);
    if (m === 'sh') return 'sh' + c;
    if (m === 'sz') return 'sz' + c;
    if (m === 'hk') return 'hk' + c;
    if (m === 'bj') return 'bj' + c;
    if (m === 'us') return 'us' + c;
    return 'us' + c; // fallback
  }

  /* ---- 根据代码模式判断市场（含前缀剥离 + 北交所/沪B） ---- */
  var MARKET_WHITELIST = { sh: 1, sz: 1, hk: 1, us: 1, bj: 1 };
  function detectMarket(code) {
    var c = String(code || '').trim().toUpperCase();
    // 先剥离可能存在的市场前缀：SH/SZ/HK/US/BJ（含可选点号），如 SH600519 / hk00700
    var pref = c.match(/^(SH|SZ|HK|US|BJ|SS)\.?(\d+)$/);
    if (pref) {
      var pre = pref[1], num = pref[2];
      if (pre === 'SH' || pre === 'SS') return 'sh';
      if (pre === 'SZ') return 'sz';
      if (pre === 'HK') return 'hk';
      if (pre === 'US') return 'us';
      if (pre === 'BJ') return 'bj';
    }
    // 纯数字
    if (/^\d{6}$/.test(c)) {
      var first = c.charAt(0);
      if (first === '6') return 'sh';            // 沪市主板 + 科创板(688)
      if (first === '9') return 'sh';            // 沪B（900xxx）
      if (first === '0' || first === '3') return 'sz'; // 深市主板 + 创业板(300)
      if (first === '8') return c.charAt(1) === '8' ? 'sh' : 'bj'; // 68x 科创板；其余 8xxxxx 北交所
      if (first === '4') return 'bj';            // 新三板/北交所基础层
      return 'sz';
    }
    if (/^\d{4,5}$/.test(c) && parseInt(c, 10) < 10000) return 'hk'; // 港股 4-5 位
    if (/^[A-Z]{1,5}$/.test(c)) return 'us';
    return 'us';
  }

  /* =========================================================
   * 汇率：外币 → 人民币（CNY）
   *   沪/深 = CNY，港股 = HKD，美股 = USD
   *   实时来源：open.er-api.com（免费、CORS 友好），本地缓存，离线兜底。
   *   对外只暴露「1 单位外币 = X 人民币」的折率，所有聚合在显示时折算。
   * ======================================================= */
  var CURRENCY_OF_MARKET = { sh: 'CNY', sz: 'CNY', hk: 'HKD', us: 'USD', bj: 'CNY' };
  var FX_CACHE_KEY = 'app_fx_rates';
  var FX_FALLBACK = { USD: 7.1, HKD: 0.91, updatedAt: 0, fallback: true, provider: 'fallback' };
  var FX_STALE_MS = 6 * 3600 * 1000; // 缓存 6 小时视为过期

  function currencyOfMarket(m) { return CURRENCY_OF_MARKET[m] || 'CNY'; }
  // 兼容市场码（us/hk/sh/sz）与货币码（USD/HKD/CNY）两种入参
  function normalizeCur(x) {
    var s = String(x || '').toLowerCase();
    if (s === 'us' || s === 'usd') return 'USD';
    if (s === 'hk' || s === 'hkd') return 'HKD';
    return 'CNY';
  }
  function currencySymbol(currencyOrMarket) {
    var c = normalizeCur(currencyOrMarket);
    if (c === 'USD') return '$';
    if (c === 'HKD') return 'HK$';
    return '¥';
  }
  function readFxCache() {
    try {
      var raw = localStorage.getItem(FX_CACHE_KEY);
      if (raw) {
        var o = JSON.parse(raw);
        if (o && typeof o.USD === 'number' && typeof o.HKD === 'number') return o;
      }
    } catch (e) {}
    return null;
  }
  function writeFxCache(o) {
    try { localStorage.setItem(FX_CACHE_KEY, JSON.stringify(o)); } catch (e) {}
  }
  // 同步返回：缓存优先；若缓存过期则后台刷新；无缓存用兜底并触发刷新。
  // 返回对象额外带 stale / ageMs，供 UI 提示「汇率已过期、人民币金额可能偏差」。
  function getFxRates() {
    var cached = readFxCache();
    var obj;
    if (cached) {
      if (Date.now() - (cached.updatedAt || 0) > FX_STALE_MS) refreshFxRates();
      obj = cached;
    } else {
      refreshFxRates();
      obj = FX_FALLBACK;
    }
    var ageMs = Date.now() - (obj.updatedAt || 0);
    return {
      USD: obj.USD, HKD: obj.HKD, updatedAt: obj.updatedAt || 0,
      fallback: !!obj.fallback, provider: obj.provider || '',
      stale: ageMs > FX_STALE_MS, ageMs: ageMs,
    };
  }
  // 实时拉取并写缓存（Promise）
  function refreshFxRates() {
    return fetch('https://open.er-api.com/v6/latest/USD')
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        var rates = data.rates || data.conversion_rates || null;
        if (!rates || typeof rates.CNY !== 'number' || typeof rates.HKD !== 'number') {
          throw new Error('bad rates payload');
        }
        var o = {
          USD: rates.CNY,                       // 1 美元 = X 人民币
          HKD: rates.CNY / rates.HKD,           // 1 港币 = X 人民币
          updatedAt: Date.now(),
          fallback: false,
          provider: data.provider || '',
        };
        writeFxCache(o);
        return o;
      })
      .catch(function (err) {
        console.warn('[market] fx fetch failed:', err && err.message);
        var c = readFxCache();
        return c || FX_FALLBACK;
      });
  }
  // 外币金额 → 人民币（入参兼容市场码/货币码）
  function fxToCny(amount, currencyOrMarket) {
    var rates = getFxRates();
    var c = normalizeCur(currencyOrMarket);
    var rate = c === 'USD' ? rates.USD : c === 'HKD' ? rates.HKD : 1;
    return (Number(amount) || 0) * rate;
  }

  /* ---- GB18030 buffer → UTF-8 字符串 ---- */
  function gbkToUtf8(buffer) {
    try { return new TextDecoder('gb18030').decode(buffer); } catch (_) {}
    try { return new TextDecoder('gbk').decode(buffer); } catch (_) {}
    try { return new TextDecoder('latin1').decode(buffer); } catch (_) {}
    return '';
  }

  /* ---- 腾讯单行解析 ----
     原始行: v_sh600519="1~贵州茅台~600519~1297.40~1292.30~..."
  */
  function parseTencentLine(line) {
    var eqIdx = line.indexOf('=');
    if (eqIdx < 0) return null;
    var body = line.substring(eqIdx + 1).replace(/"/g, '').trim();
    // 腾讯返回格式：1~名称~代码~当前价~昨收~今开~...
    var firstTilde = body.indexOf('~');
    var dataPart = firstTilde >= 0 ? body.substring(firstTilde + 1) : body;
    var parts = dataPart.split('~');
    // 港/美股字段数远少于 A 股，原 `parts.length < 50` 硬门槛会让整批拉不到行情、
    // 浮盈恒为 0。改为只校验必需下标且价格可解析即可。
    if (parts.length < 4) return null;
    var name = parts[0] || '';
    var price = parseFloat(parts[2]) || 0;
    var yesterdayClose = parseFloat(parts[3]) || 0;
    if (!(price > 0)) return null;
    var change = price - yesterdayClose;
    var changePercent = yesterdayClose ? (change / yesterdayClose) * 100 : 0;
    // 成交量等纯数字字段也可能长得像 YYYYMMDD，必须校验真实日历日期。
    // 优先取带时分秒的行情时间，避免先扫描到数字字段时误认作交易日。
    function validDate(m) {
      if (!m) return '';
      var year = Number(m[1]), month = Number(m[2]), day = Number(m[3]);
      if (year < 2000 || year > new Date().getUTCFullYear() + 1) return '';
      var check = new Date(Date.UTC(year, month - 1, day));
      if (check.getUTCFullYear() !== year || check.getUTCMonth() + 1 !== month || check.getUTCDate() !== day) return '';
      return m[1] + '-' + m[2] + '-' + m[3];
    }
    var quoteDate = '';
    parts.forEach(function (part) {
      if (quoteDate) return;
      quoteDate = validDate(String(part).match(/^(20\d{2})[-\/]?(\d{2})[-\/]?(\d{2})[ T]?(\d{2}):?(\d{2}):?(\d{2})$/));
    });
    if (!quoteDate) parts.forEach(function (part) {
      if (quoteDate) return;
      quoteDate = validDate(String(part).match(/^(20\d{2})[-\/]?(\d{2})[-\/]?(\d{2})$/));
    });
    return { name: name, price: price, change: change, changePercent: changePercent, quoteDate: quoteDate };
  }

  // 从腾讯单行 `v_sh600519="..."` 提取 symbol（等号前、去掉 v_ 前缀）
  function symbolOfLine(line) {
    var eq = line.indexOf('=');
    if (eq < 0) return '';
    return line.substring(0, eq).replace(/^v_/i, '').toUpperCase();
  }

  /* ---- 批量请求（腾讯支持一次多 symbol） ----
     健壮性：URL encodeURIComponent 编码；8s AbortController 超时；失败自动重试 1 次；
     关键：按每行 `v_<symbol>=` 前缀回填 Map，退市/非法代码整行不返回时后续不会错位
     （避免「A 股价格写到 B 股上」）。 */
  var QUOTE_TIMEOUT_MS = 8000;
  function getQuotes(codes, market, signal) {
    return new Promise(function (resolve) {
      if (!codes || codes.length === 0) { resolve(new Map()); return; }
      var symbols = codes.map(function (c) { return symbolToTencent(c, market); });
      // symbol → 用户 code（大写），用于把行情正确对应回请求标的
      var symToCode = {};
      codes.forEach(function (code, i) {
        symToCode[String(symbols[i]).toUpperCase()] = String(code).toUpperCase();
      });
      var url = 'https://qt.gtimg.cn/q=' + encodeURIComponent(symbols.join(','));

      function attempt() {
        var ctrl = null, timer = null;
        var useSignal = signal;
        if (!useSignal && typeof AbortController !== 'undefined') {
          ctrl = new AbortController();
          useSignal = ctrl.signal;
          timer = setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, QUOTE_TIMEOUT_MS);
        }
        fetch(url, { signal: useSignal })
          .then(function (resp) {
            if (timer) clearTimeout(timer);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            return resp.arrayBuffer();
          })
          .then(function (buf) {
            var text = gbkToUtf8(buf);
            var lines = text.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
            var results = new Map();
            lines.forEach(function (line) {
              var sym = symbolOfLine(line);
              var code = symToCode[sym];
              if (!code) return; // 不是本次请求的标的，跳过（也防错位）
              var parsed = parseTencentLine(line);
              if (parsed && parsed.price > 0) {
                var m = market || detectMarket(code);
                results.set(code, {
                  symbol: code,
                  name: parsed.name || '',
                  price: parsed.price,
                  change: parsed.change,
                  changePercent: parsed.changePercent,
                  quoteDate: parsed.quoteDate,
                  currency: (m === 'sh' || m === 'sz' || m === 'bj') ? 'CNY' : (m === 'hk' ? 'HKD' : 'USD'),
                  market: m,
                  fetchedAt: Date.now(),
                });
              }
            });
            resolve(results);
          })
          .catch(function (err) {
            if (timer) clearTimeout(timer);
            // 外部信号已中断（或本批超时）：不再重试，直接返回空
            if (signal && signal.aborted) { resolve(new Map()); return; }
            if (ctrl && ctrl.signal && ctrl.signal.aborted) { resolve(new Map()); return; }
            // 首次失败：重试 1 次
            if (!attempt._retried) {
              attempt._retried = true;
              attempt();
              return;
            }
            console.warn('[market] getQuotes failed:', err && err.message);
            resolve(new Map());
          });
      }
      attempt();
    });
  }

  /* ---- 单只行情 ---- */
  function getQuote(code, market, signal) {
    return getQuotes([code], market, signal).then(function (m) {
      return m.get(String(code).toUpperCase()) || null;
    });
  }

  /* ---- 指数（大盘 bench） ---- */
  var INDEX_SYMBOLS = {
    '上证指数': 'sh000001',
    '深证成指': 'sz399001',
    '创业板指': 'sz399006',
    '恒生指数': 'hkHSI',
    '道琼斯': 'usDJI',
    '纳斯达克': 'usIXIC',
    '标普500': 'usSPX',
  };
  function getIndexes(names) {
    return new Promise(function (resolve) {
      var arr = (names && names.length) ? names : ['上证指数', '恒生指数'];
      var symbols = arr.map(function (n) { return INDEX_SYMBOLS[n]; }).filter(Boolean);
      if (symbols.length === 0) { resolve([]); return; }
      // symbol(大写) → 指数名，按 symbol 对齐回填，避免某指数整行缺失导致错位
      var symToName = {};
      arr.forEach(function (n) {
        var s = INDEX_SYMBOLS[n];
        if (s) symToName[String(s).toUpperCase()] = n;
      });
      var url = 'https://qt.gtimg.cn/q=' + encodeURIComponent(symbols.join(','));
      fetch(url)
        .then(function (resp) { if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.arrayBuffer(); })
        .then(function (buf) {
          var text = gbkToUtf8(buf);
          var lines = text.split(';').map(function (s) { return s.trim(); }).filter(Boolean);
          var out = [];
          lines.forEach(function (line) {
            var sym = symbolOfLine(line);
            var name = symToName[sym];
            if (!name) return;
            var parsed = parseTencentLine(line);
            if (parsed && parsed.price > 0) {
              out.push({ name: name, price: parsed.price, pct: parsed.changePercent, up: parsed.change >= 0 });
            }
          });
          resolve(out);
        })
        .catch(function (err) {
          console.warn('[market] getIndexes failed:', err.message);
          resolve([]);
        });
    });
  }

  /* ---- 批量刷新股票池现价（按市场分组，每组分批 10 只，组间 250ms） ---- */
  function refreshStockPrices(stocks) {
    return new Promise(function (resolve) {
      if (!stocks || stocks.length === 0) { resolve(stocks || []); return; }
      var results = stocks.map(function (s) {
        var copy = Object.assign({}, s);
        delete copy.quoteFetchedAt; // 本轮失败时不能把上次缓存误报为新行情
        delete copy.quoteDate;
        return copy;
      });
      var byMarket = {};
      stocks.forEach(function (s) {
        var m = s.market || detectMarket(s.code);
        if (!byMarket[m]) byMarket[m] = [];
        byMarket[m].push(s);
      });
      var markets = Object.keys(byMarket);
      var marketIdx = 0;
      var batchSize = 10;

      function nextMarket() {
        if (marketIdx >= markets.length) { resolve(results); return; }
        var m = markets[marketIdx];
        var group = byMarket[m];
        var batchIdx = 0;

        function nextBatch() {
          if (batchIdx >= group.length) {
            marketIdx++;
            setTimeout(nextMarket, 250);
            return;
          }
          var batch = group.slice(batchIdx, batchIdx + batchSize);
          var codes = batch.map(function (s) { return s.code; });
          getQuotes(codes, m).then(function (map) {
            batch.forEach(function (s) {
              var quote = map.get(String(s.code).toUpperCase());
              if (quote) {
                var realIdx = results.findIndex(function (r) { return r.id === s.id; });
                if (realIdx >= 0) {
                  results[realIdx].price = quote.price;
                  results[realIdx].change = quote.change;
                  results[realIdx].changePercent = quote.changePercent;
                  results[realIdx].market = quote.market;
                  results[realIdx].quoteFetchedAt = quote.fetchedAt;
                  results[realIdx].quoteDate = quote.quoteDate;
                }
              }
            });
            batchIdx += batchSize;
            setTimeout(nextBatch, 250);
          }).catch(function () {
            batchIdx += batchSize;
            setTimeout(nextBatch, 250);
          });
        }
        nextBatch();
      }
      nextMarket();
    });
  }

  global.AppMarket = {
    detectMarket: detectMarket,
    currencyOfMarket: currencyOfMarket,
    currencySymbol: currencySymbol,
    getFxRates: getFxRates,
    refreshFxRates: refreshFxRates,
    fxToCny: fxToCny,
    getQuote: getQuote,
    getQuotes: getQuotes,
    getIndexes: getIndexes,
    refreshStockPrices: refreshStockPrices,
    INDEX_SYMBOLS: INDEX_SYMBOLS,
  };
})(window);
