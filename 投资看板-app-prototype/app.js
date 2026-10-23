/* =========================================================
 * 投资看板 APP 1.0 · 应用层（路由 + 渲染 + 交互）
 * Acid Y2K Pixel · 红涨绿跌 · localStorage 持久化
 * ========================================================= */
(function (global) {
  'use strict';

  /* ---------------- 全局错误浮层（真机诊断保险丝） ----------------
   * 教训：v244 在老 WebView 上 mock.js 因 `?.` 语法解析失败 → AppData 未定义
   * → boot() 崩死 → 页面空白 + 开屏遮罩挡触摸，用户侧完全无反馈、无法排查。
   * 这里兜住一切未捕获错误：错误摘要落盘 localStorage('app_last_error')
   * 并在屏幕顶部显示可关闭的红色横幅。桌面开发时依然走 console。 */
  function _installErrorTrap() {
    function show(msg) {
      try {
        var el = document.getElementById('appErrorTrap');
        if (!el) {
          el = document.createElement('div');
          el.id = 'appErrorTrap';
          el.setAttribute('style',
            'position:fixed;top:0;left:0;right:0;z-index:2147483647;' +
            'background:#F03342;color:#fff;font:12px/1.5 -apple-system,sans-serif;' +
            'padding:8px 34px 8px 12px;word-break:break-all;max-height:40%;overflow:auto;');
          var x = document.createElement('span');
          x.setAttribute('style', 'position:absolute;top:6px;right:10px;font-size:16px;cursor:pointer;');
          x.textContent = '×';
          x.onclick = function () { if (el.parentNode) el.parentNode.removeChild(el); };
          el.appendChild(x);
          (document.body || document.documentElement).appendChild(el);
        }
        var line = document.createElement('div');
        line.textContent = msg;
        el.appendChild(line);
      } catch (_e) { /* 显示失败就只剩落盘，不再连锁崩溃 */ }
    }
    function record(msg) {
      try {
        var prev = '';
        try { prev = localStorage.getItem('app_last_error') || ''; } catch (_e) {}
        localStorage.setItem('app_last_error', (prev ? prev + '\n' : '') + msg);
      } catch (_e) {}
    }
    window.addEventListener('error', function (e) {
      var m = '[error] ' + (e.message || 'unknown') +
        (e.filename ? ' @' + String(e.filename).split('/').pop() + ':' + (e.lineno || '?') : '');
      record(m); show(m);
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e.reason;
      var m = '[promise] ' + (r && r.message ? r.message : String(r || 'unknown'));
      record(m); show(m);
    });
  }
  _installErrorTrap();

  const $main = () => document.getElementById('main');
  const $bn = () => document.getElementById('bn');
  const $modalBackdrop = () => document.getElementById('modalBackdrop');
  const $modalBox = () => document.getElementById('modalBox');
  const $toast = () => document.getElementById('toast');
  const $toastText = () => document.getElementById('toastText');

  /* APP 内选择面板：原表单字段继续提供 value 和 change 事件。 */
  const PickerUI = (function () {
    var overlay = null, source = null, trigger = null, kind = '', selectedDate = '';
    var viewYear = 0, viewMonth = 0;
    function pad(n) { return String(n).padStart(2, '0'); }
    function dateString(y, m, d) { return y + '-' + pad(m + 1) + '-' + pad(d); }
    function today() { return AppData.beijingYmd(new Date()); }
    function close() {
      if (!overlay || !overlay.classList.contains('show')) return false;
      overlay.classList.remove('show');
      overlay.setAttribute('aria-hidden', 'true');
      if (trigger && trigger.isConnected) trigger.focus();
      source = null; trigger = null; kind = '';
      return true;
    }
    function ensure() {
      if (overlay) return;
      overlay = document.createElement('div');
      overlay.id = 'pickerBackdrop';
      overlay.className = 'picker-backdrop';
      overlay.setAttribute('aria-hidden', 'true');
      overlay.innerHTML = '<div class="picker-panel" role="dialog" aria-modal="true"></div>';
      document.body.appendChild(overlay);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay || e.target.closest('[data-picker-cancel]')) { close(); return; }
        var option = e.target.closest('[data-picker-option]');
        if (option && kind === 'select' && source) {
          source.selectedIndex = Number(option.getAttribute('data-picker-option'));
          source.dispatchEvent(new Event('input', { bubbles: true }));
          source.dispatchEvent(new Event('change', { bubbles: true }));
          close();
          return;
        }
        var nav = e.target.closest('[data-picker-nav]');
        if (nav && kind === 'date') {
          var next = new Date(viewYear, viewMonth + Number(nav.getAttribute('data-picker-nav')), 1);
          viewYear = next.getFullYear(); viewMonth = next.getMonth();
          renderDate();
          return;
        }
        var day = e.target.closest('[data-picker-day]');
        if (day && kind === 'date') {
          selectedDate = dateString(viewYear, viewMonth, Number(day.getAttribute('data-picker-day')));
          renderDate();
          return;
        }
        if (e.target.closest('[data-picker-today]') && kind === 'date') {
          selectedDate = today();
          viewYear = Number(selectedDate.slice(0, 4)); viewMonth = Number(selectedDate.slice(5, 7)) - 1;
          renderDate();
          return;
        }
        if (e.target.closest('[data-picker-done]') && kind === 'date' && source) {
          source.value = selectedDate;
          source.dispatchEvent(new Event('input', { bubbles: true }));
          source.dispatchEvent(new Event('change', { bubbles: true }));
          close();
        }
      });
    }
    function show(html) {
      ensure();
      overlay.querySelector('.picker-panel').innerHTML = html;
      overlay.classList.add('show');
      overlay.setAttribute('aria-hidden', 'false');
    }
    function fieldLabel(el) {
      var row = el.closest('.f-row, .form-row, .re-cond');
      var label = row && row.querySelector('label, .re-p');
      return label ? label.textContent.trim().replace(/\s*\*$/, '') : '请选择';
    }
    function renderSelect() {
      var options = Array.prototype.map.call(source.options, function (opt, i) {
        return '<button type="button" class="picker-option' + (i === source.selectedIndex ? ' selected' : '') +
          '" data-picker-option="' + i + '"' + (opt.disabled ? ' disabled' : '') + '><span>' +
          escapeHtml(opt.textContent.trim()) + '</span><i class="fa-solid fa-check" aria-hidden="true"></i></button>';
      }).join('');
      show('<div class="picker-grab"></div><div class="picker-head"><h3 class="picker-title">' + escapeHtml(fieldLabel(source)) +
        '</h3><button type="button" class="picker-close" data-picker-cancel aria-label="关闭">×</button></div>' +
        '<div class="picker-options">' + options + '</div>');
    }
    function renderDate() {
      var first = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
      var count = new Date(viewYear, viewMonth + 1, 0).getDate();
      var cells = '';
      for (var blank = 0; blank < first; blank++) cells += '<span class="picker-day-blank"></span>';
      for (var day = 1; day <= count; day++) {
        var value = dateString(viewYear, viewMonth, day);
        cells += '<button type="button" class="picker-day' + (value === selectedDate ? ' selected' : '') +
          (value === today() ? ' today' : '') + '" data-picker-day="' + day + '" aria-label="' +
          value + '">' + day + '</button>';
      }
      show('<div class="picker-grab"></div><div class="picker-head"><div><small>交易日期</small><h3 class="picker-title">选择日期</h3></div>' +
        '<button type="button" class="picker-close" data-picker-cancel aria-label="关闭">×</button></div>' +
        '<div class="picker-date-nav"><button type="button" data-picker-nav="-12" aria-label="上一年">«</button>' +
        '<button type="button" data-picker-nav="-1" aria-label="上个月">‹</button><strong>' + viewYear + ' 年 ' + pad(viewMonth + 1) + ' 月</strong>' +
        '<button type="button" data-picker-nav="1" aria-label="下个月">›</button>' +
        '<button type="button" data-picker-nav="12" aria-label="下一年">»</button></div>' +
        '<div class="picker-weekdays"><span>一</span><span>二</span><span>三</span><span>四</span><span>五</span><span>六</span><span>日</span></div>' +
        '<div class="picker-days">' + cells + '</div>' +
        '<div class="picker-date-foot"><button type="button" data-picker-today>回到今天</button>' +
        '<button type="button" data-picker-done>确定 · ' + selectedDate.replace(/-/g, '.') + '</button></div>');
    }
    function enhance(root) {
      if (!root) return;
      root.querySelectorAll('select:not([data-picker-ready]), input[type="date"]:not([data-picker-ready])').forEach(function (el) {
        var date = el.tagName === 'INPUT';
        el.setAttribute('data-picker-ready', '1');
        if (date) el.type = 'hidden';
        else el.hidden = true;
        el.tabIndex = -1;
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'picker-trigger' + (date ? ' picker-date-trigger' : '') + (el.classList.contains('re-op') ? ' picker-compact' : '');
        button.setAttribute('aria-haspopup', 'dialog');
        button.setAttribute('aria-label', fieldLabel(el));
        button.innerHTML = '<span class="picker-trigger-text"></span><i class="fa-solid ' + (date ? 'fa-calendar-days' : 'fa-chevron-down') + '" aria-hidden="true"></i>';
        if (el.id) {
          button.id = el.id + 'Picker';
          var label = root.querySelector('label[for="' + el.id + '"]');
          if (label) label.htmlFor = button.id;
        }
        el.insertAdjacentElement('afterend', button);
        function sync() {
          button.querySelector('.picker-trigger-text').textContent = date
            ? (el.value ? el.value.replace(/-/g, '.') : '选择日期')
            : (el.selectedOptions[0] ? el.selectedOptions[0].textContent.trim() : '请选择');
        }
        el.addEventListener('change', sync);
        sync();
        button.addEventListener('click', function () {
          source = el; trigger = button; kind = date ? 'date' : 'select';
          if (date) {
            selectedDate = /^\d{4}-\d{2}-\d{2}$/.test(el.value) ? el.value : today();
            viewYear = Number(selectedDate.slice(0, 4)); viewMonth = Number(selectedDate.slice(5, 7)) - 1;
            renderDate();
          } else renderSelect();
        });
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlay && overlay.classList.contains('show')) {
        e.preventDefault(); e.stopImmediatePropagation(); close();
      }
    }, true);
    return { enhance: enhance, close: close, isOpen: function () { return !!overlay && overlay.classList.contains('show'); } };
  })();

  const ROUTES = ['home', 'trades', 'pool', 'ai', 'settings', 'insights', 'discipline', 'notices'];
  const TAB_ROUTES = ['home', 'trades', 'pool', 'ai', 'settings']; // 底部 5 Tab

  /* APP 版本戳（单一来源）：必须与 index.html 的 `?v=NNN` 与 sw.js 的 `acid-app-vNNN` 三处一致。
     改版时三处一起升；冒烟测试会校验同步，只升一处会被拦下（避免「关于页写着 1.0、实际跑的是 v247」）。 */
  var APP_VERSION = '271';
  var _autoQuotePromise = null;
  var _lastAutoQuoteAt = 0;

  function refreshQuotes(targets) {
    if (typeof AppMarket === 'undefined' || !AppMarket.refreshStockPrices) return Promise.resolve(0);
    return AppMarket.refreshStockPrices(targets).then(function (updated) {
      var updates = updated.filter(function (s) { return Number(s.quoteFetchedAt) > 0; }).map(function (s) {
        return { code: s.code, price: s.price, change: s.change,
          changePercent: s.changePercent, market: s.market, quoteFetchedAt: s.quoteFetchedAt,
          quoteDate: s.quoteDate };
      });
      var n = AppData.updateStockPrices(updates);
      if (currentRoute() === 'home' || currentRoute() === 'pool') render();
      if ($modalBackdrop().classList.contains('show') && $modalBox().querySelector('[data-pnl-detail]')) showTodayPnlDetail();
      return n;
    });
  }

  function refreshHeldQuotes() {
    if (_autoQuotePromise) return _autoQuotePromise;
    var minutes = AppData.getConfig().quoteRefreshMinutes || 5;
    if (_lastAutoQuoteAt && Date.now() - _lastAutoQuoteAt < minutes * 60000) return Promise.resolve(0);
    var targets = AppData.getQuoteTargets();
    if (!targets.length) return Promise.resolve(0);
    _lastAutoQuoteAt = Date.now();
    _autoQuotePromise = refreshQuotes(targets).catch(function () { return 0; }).then(function (n) {
      _autoQuotePromise = null;
      return n;
    });
    return _autoQuotePromise;
  }

  // 设置页接受方舟 Agent Plan 的 Base URL；原生请求需要完整的 Chat API 地址。
  function resolveAiUrl(url) {
    return String(url || '').trim().replace(/^(https:\/\/ark\.cn-beijing\.volces\.com\/api\/plan\/v3)\/?$/i, '$1/chat/completions');
  }

  // Android WebView 的跨域 fetch 可能在预检阶段被拦截；AI 请求在原生 APP 中走 Capacitor HTTP。
  function aiFetch(url, options) {
    var target = resolveAiUrl(url);
    var cap = window.Capacitor;
    var native = cap && cap.isNativePlatform && cap.isNativePlatform();
    if (!native) {
      var webOptions = Object.assign({}, options);
      delete webOptions.readTimeout;
      return fetch(target, webOptions);
    }
    var http = cap.Plugins && cap.Plugins.CapacitorHttp;
    if (!http) return Promise.reject(new Error('AI 网络组件未就绪，请安装新版 APP'));
    var data = JSON.parse(options.body);
    var request = http.request({
      url: target, method: options.method || 'POST', headers: options.headers,
      data: data, connectTimeout: 15000, readTimeout: options.readTimeout || 30000,
    }).then(function (r) {
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json: function () {
          try { return Promise.resolve(typeof r.data === 'string' ? JSON.parse(r.data) : r.data); }
          catch (e) { return Promise.reject(e); }
        },
      };
    });
    var signal = options.signal;
    if (!signal) return request;
    if (signal.aborted) return Promise.reject(new Error('请求已取消'));
    return new Promise(function (resolve, reject) {
      function onAbort() { reject(new Error('请求已取消')); }
      signal.addEventListener('abort', onAbort, { once: true });
      request.then(function (r) { signal.removeEventListener('abort', onAbort); resolve(r); },
        function (e) { signal.removeEventListener('abort', onAbort); reject(e); });
    });
  }

  /* ---------------- 小工具 ---------------- */
  const fmtMoney = (n) => (Number(n) || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const fmtMoney0 = (n) => Math.round(Number(n) || 0).toLocaleString('zh-CN');
  // ---- 多币种辅助：单价按市场币种显示（$ / HK$ / ¥），汇总一律人民币 ----
  const curSym = (m) => (typeof AppMarket !== 'undefined' && AppMarket.currencySymbol)
    ? AppMarket.currencySymbol(m)
    : (String(m).toLowerCase() === 'us' ? '$' : String(m).toLowerCase() === 'hk' ? 'HK$' : '¥');
  const toCny = (amt, m) => (typeof AppMarket !== 'undefined' && AppMarket.fxToCny)
    ? AppMarket.fxToCny(amt, m)
    : (Number(amt) || 0) * (String(m).toLowerCase() === 'us' ? 7.1 : String(m).toLowerCase() === 'hk' ? 0.91 : 1);
  // 金额紧凑格式（移动端窄卡用）：|n|≥1万 → xx.x万，否则千分位整数。返回绝对值，符号由调用方处理
  const fmtAmt = (n) => {
    const v = Math.abs(Number(n) || 0);
    if (v >= 10000) {
      const w = v / 10000;
      return (w >= 100 ? Math.round(w) : Math.round(w * 10) / 10) + '万';
    }
    return Math.round(v).toLocaleString('zh-CN');
  };
  /* 负数金额口径统一（F 批次）：符号永远在货币符前面，数字恒为绝对值。
     历史遗留两种混用（Hero/持仓行 `¥-1,234` vs KPI 卡 `-¥1,234`），全站统一为 `-¥1,234`；
     0 不加正负号，避免出现「+¥0.00」这种误读。
     int=true 走整数紧凑格式，否则走两位小数。 */
  const yuanAbs = (n, int) => (int ? fmtMoney0 : fmtMoney)(Math.abs(Number(n) || 0));
  const yuanDelta = (n, int) => {
    const v = Number(n) || 0;
    return (v > 0 ? '+' : v < 0 ? '-' : '') + '¥' + yuanAbs(v, int);
  };
  const cls = (name) => document.getElementsByClassName(name);

  /* 设计令牌单一来源：JS 绘制（图表/环形图）直接读 CSS 变量，避免与样式脱节 */
  const tk = (name, fallback) => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      return v || fallback;
    } catch (e) { return fallback; }
  };
  const C = () => ({
    up: tk('--up', '#E02B36'),
    down: tk('--down', '#0C8652'),
    blue: tk('--blue', '#0066CC'),
    line: tk('--line', '#E2E2E8'),
    ink: tk('--ink', '#1D1D1F'),
    ink2: tk('--ink2', '#66666B'),
  });
  const hexToRgb = (h) => {
    const s = String(h || '').replace('#', '');
    if (s.length !== 6) return '0,0,0';
    return parseInt(s.slice(0, 2), 16) + ',' + parseInt(s.slice(2, 4), 16) + ',' + parseInt(s.slice(4, 6), 16);
  };

  /* 图表配色统一取自设计令牌（模块加载时读取一次） */
  const CH = C();

  /* ------------------------------------------------------
   * 触感反馈（Android）
   * Capacitor Haptics 在 Android 上走的是振动马达，不是 iOS 的 Taptic Engine，
   * 手感偏硬，所以用得很克制：只在状态切换 / 操作结果 / 破坏性操作上给一下，
   * 普通导航和输入一律不震，免得变成噪音。用户可在设置里整体关掉。
   * 坑：Android 端 ImpactStyle 是精确匹配，传错字符串会 fallback 成 HEAVY（最强振动），
   * 所以必须严格用全大写 'LIGHT'/'MEDIUM'、'SUCCESS'。WARNING 在 Android 上是
   * 6 段全幅振动，太强烈，删除确认这里改用 MEDIUM。
   * ------------------------------------------------------ */
  function haptic(kind) {
    try {
      var cfg = (typeof AppData !== 'undefined' && AppData.getConfig) ? AppData.getConfig() : null;
      if (cfg && cfg.haptic === false) return;
      var H = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics;
      if (!H) return;  // 浏览器预览或未注入插件时静默跳过
      var p = null;
      if (kind === 'select') p = H.selectionChanged();
      else if (kind === 'light') p = H.impact({ style: 'LIGHT' });
      else if (kind === 'medium') p = H.impact({ style: 'MEDIUM' });
      else if (kind === 'success') p = H.notification({ type: 'SUCCESS' });
      if (p && typeof p.catch === 'function') p.catch(function () {});
    } catch (e) { /* 触感不影响主流程，失败当没发生 */ }
  }
  /* ---------------- 删除 + 撤销 ----------------
     破坏性操作给一次反悔机会：删除前存快照，删完在提示条里挂「撤销」，
     撤销时把快照原样塞回（AppData.restore，保留原 id 且不触发纪律扫描）。
     比"再弹一次确认框"轻，也符合移动端惯例。 */
  var UNDO_GET = {
    trade:     function (id) { return AppData.getTrades().find(function (t) { return t.id === id; }) || null; },
    pool:      function (id) { return AppData.getStockPool().find(function (s) { return s.id === id; }) || null; },
    insight:   function (id) { return AppData.getInsights().find(function (i) { return i.id === id; }) || null; },
    violation: function (id) { return AppData.getViolations().find(function (v) { return v.id === id; }) || null; },
    report:    function (id) { return AppData.getAiReports().find(function (r) { return r.id === id; }) || null; },
    rule:      function (id) { return AppData.getRules().find(function (r) { return r.id === id; }) || null; },
  };
  var UNDO_DEL = {
    trade:     function (id) { return AppData.deleteTrade(id); },
    pool:      function (id) { return AppData.deleteStockPool(id); },
    insight:   function (id) { return AppData.deleteInsight(id); },
    violation: function (id) { AppData.deleteViolation(id); return true; },
    report:    function (id) { return AppData.deleteAiReport(id); },
    rule:      function (id) { return AppData.deleteRule(id); },
  };
  function removeWithUndo(kind, id, label, confirmMsg) {
    var snap = UNDO_GET[kind] ? UNDO_GET[kind](id) : null;
    uiConfirm(confirmMsg, function () {
      var ok = UNDO_DEL[kind] ? UNDO_DEL[kind](id) : false;
      if (!ok) { toast('删除失败', 'err'); return; }
      render();
      toast(label + '已删除', 'ok', {
        label: '撤销',
        onClick: function () {
          var done = (typeof AppData.restore === 'function' && snap) ? AppData.restore(kind, snap) : false;
          toast(done ? label + '已恢复' : '恢复失败', done ? 'ok' : 'err');
          haptic(done ? 'success' : 'light');
          if (done) render();
        }
      });
    });
  }

  /* Hero 大数字进场滚动：0 → 目标值，600ms easeOutCubic。
     尊重系统「减弱动态效果」设置；开了就直接显示终值。 */
  function countUpNumber(el, target, sign, dur) {
    if (!el) return;
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    } catch (e) { /* 老内核不支持 matchMedia，照常播动画 */ }
    dur = dur || 600;
    var t0 = null;
    function frame(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      // 数字恒取绝对值：负号由 sign 提供，否则会出现「-¥-1,234」/「¥-1,234」
      el.textContent = sign + '¥' + fmtMoney(Math.abs(target * eased));
      if (p < 1) requestAnimationFrame(frame);
      else el.textContent = sign + '¥' + fmtMoney(Math.abs(target));
    }
    el.textContent = sign + '¥' + fmtMoney(0);
    requestAnimationFrame(frame);
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  /* ---- HTML 白名单清洗（G 批次：存储型 XSS 防护）----
     报告 html 直接进 innerHTML。自家生成的还好，但「导入备份」可以把任意 HTML
     写进 app_aiReports → 下次打开报告详情即执行（存储型 XSS，能偷 localStorage 里的
     交易数据与 AI Key）。这里统一过一遍白名单：只留排版标签与 class 属性。 */
  var HTML_ALLOWED = {
    B: 1, STRONG: 1, I: 1, EM: 1, U: 1, S: 1, BR: 1, HR: 1,
    P: 1, DIV: 1, SPAN: 1, SMALL: 1, CODE: 1, PRE: 1, BLOCKQUOTE: 1,
    UL: 1, OL: 1, LI: 1, H1: 1, H2: 1, H3: 1, H4: 1, H5: 1, H6: 1,
    TABLE: 1, THEAD: 1, TBODY: 1, TR: 1, TD: 1, TH: 1,
  };
  function sanitizeHtml(raw) {
    var src = String(raw == null ? '' : raw);
    if (!src) return '';
    // 老 WebView 没有 DOMParser 时降级：先整段剥掉危险标签，再去掉事件属性与 js: 协议
    if (typeof DOMParser === 'undefined') {
      return src
        .replace(/<\s*(script|iframe|object|embed|link|meta|style|form|svg|math)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|iframe|object|embed|link|meta|style|form|svg|math)\b[^>]*>/gi, '')
        .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/(href|src|xlink:href)\s*=\s*("?)\s*javascript:[^"'\s>]*/gi, '');
    }
    var doc = new DOMParser().parseFromString('<div id="__rt">' + src + '</div>', 'text/html');
    var root = doc.getElementById('__rt');
    if (!root) return '';
    (function clean(node) {
      var kids = Array.prototype.slice.call(node.childNodes || []);
      kids.forEach(function (ch) {
        if (ch.nodeType === 3 || ch.nodeType === 4) return; // 文本节点保留（DOM 自动转义）
        if (ch.nodeType !== 1) { node.removeChild(ch); return; }
        var tag = String(ch.tagName || '').toUpperCase();
        if (!HTML_ALLOWED[tag]) {
          // 不在白名单：保留里面的文字，只把标签本身剥掉
          var frag = doc.createDocumentFragment();
          while (ch.firstChild) frag.appendChild(ch.firstChild);
          node.replaceChild(frag, ch);
          return;
        }
        Array.prototype.slice.call(ch.attributes || []).forEach(function (a) {
          if (String(a.name).toLowerCase() !== 'class') ch.removeAttribute(a.name);
        });
        clean(ch);
      });
    })(root);
    return root.innerHTML;
  }

  function svgUse(id, size) {
    return `<svg class="ico-s" width="${size||24}" height="${size||24}" viewBox="0 0 64 64" aria-hidden="true"><use href="#${id}"></use></svg>`;
  }

  /* 股票图标：index.html 里手搓了 8 个像素 symbol（腾讯/苹果/茅台/小米/特斯拉/
     NVDA/宁德/平安），但一直没有任何调用点，持仓列表全用一个通用折线图图标，
     辨识度为零。这里按代码或名称匹配接上；匹配不到就退化成首字母色块，
     颜色由代码哈希决定，保证同一只股票每次渲染都是同一个颜色。 */
  var STOCK_GLYPHS = [
    { id: 'ico-tencent', keys: ['00700', '0700', '腾讯'] },
    { id: 'ico-apple',   keys: ['AAPL', '苹果'] },
    { id: 'ico-moutai',  keys: ['600519', '茅台'] },
    { id: 'ico-xiaomi',  keys: ['01810', '1810', '小米'] },
    { id: 'ico-tesla',   keys: ['TSLA', '特斯拉'] },
    { id: 'ico-nvda',    keys: ['NVDA', '英伟达'] },
    { id: 'ico-catl',    keys: ['300750', '宁德'] },
    { id: 'ico-pingan',  keys: ['601318', '2318', '平安'] },
  ];
  var GLYPH_BG = ['#E3EEF9', '#FDEDEF', '#E8F7F1', '#FDF0E0', '#F0E6FF'];
  var GLYPH_FG = ['#0066CC', '#E02B36', '#0C8652', '#B25E09', '#7C3AED'];
  function stockGlyph(code, name) {
    var key = String(code || '') + '|' + String(name || '');
    var upper = key.toUpperCase();
    var hit = '';
    STOCK_GLYPHS.forEach(function (g) {
      if (hit) return;
      g.keys.forEach(function (k) { if (!hit && upper.indexOf(k.toUpperCase()) >= 0) hit = g.id; });
    });
    if (hit) return '<svg class="ico-s" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><use href="#' + hit + '"></use></svg>';
    var ch = String(name || code || '?').trim().charAt(0);
    var h = 0;
    for (var i = 0; i < upper.length; i++) h = (h * 31 + upper.charCodeAt(i)) % 997;
    var idx = h % GLYPH_BG.length;
    return '<span class="pos-glyph" style="background:' + GLYPH_BG[idx] + ';color:' + GLYPH_FG[idx] + '">' + escapeHtml(ch) + '</span>';
  }
  /* Toast。第三个参数 action = { label, onClick } 时在右侧挂一个可点按钮，
     用于「删除后撤销」——破坏性操作给一次反悔机会，比再弹一次确认框轻。
     带 action 的 toast 停留 5s（给足反应时间），普通 toast 1.8s。 */
  function toast(msg, type, action, ms) {
    const el = $toast();
    $toastText().textContent = msg || '操作成功';
    el.classList.remove('ok', 'warn', 'err');
    el.classList.add(type || 'ok');
    const act = document.getElementById('toastAct');
    if (act) {
      if (action && action.label && typeof action.onClick === 'function') {
        act.hidden = false;
        act.textContent = action.label;
        act.onclick = function () {
          clearTimeout(toast._t);
          el.classList.remove('show');
          action.onClick();
        };
      } else {
        act.hidden = true;
        act.onclick = null;
      }
    }
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () {
      el.classList.remove('show');
      if (act) { act.hidden = true; act.onclick = null; }
    }, ms || (action ? 5000 : 1800));
  }
  // 交易账本统一以北京时间记录；不依赖设备时区（模拟器可能设为 UTC）。
  function nowIsoLocal() {
    var d = new Date();
    var time = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).format(d);
    return AppData.beijingYmd(d) + 'T' + time + '+08:00';
  }

  /* ---------------- 模态 ----------------
     关闭时不立刻清空内容：先播 240ms 退场动画，动画结束后再清空。
     原来的写法是「清空 + 淡出」，用户看到的其实是一个空壳在淡出，很廉价。 */
  function openModal(html) {
    PickerUI.close();
    clearTimeout(closeModal._t);      // 打断上一次关闭的延迟清空，否则会把新内容清掉
    const box = $modalBox();
    box.innerHTML = html;
    PickerUI.enhance(box);
    box.classList.remove('modal-report');  // 清掉上一次大弹窗（报告/心得）留下的布局类，否则表单弹窗会被 overflow:hidden 卡住滚动
    box.style.transform = '';         // 清掉上次手势残留的内联位移
    box.style.transition = '';
    $modalBackdrop().style.background = '';
    $modalBackdrop().setAttribute('aria-hidden', 'false');
    $modalBackdrop().classList.add('show');
  }
  function closeModal() {
    PickerUI.close();
    const bd = $modalBackdrop();
    bd.classList.remove('show');
    bd.setAttribute('aria-hidden', 'true');
    clearTimeout(closeModal._t);
    closeModal._t = setTimeout(function () { $modalBox().innerHTML = ''; }, 240);
  }
  function showTodayPnlDetail() {
    var d = AppData.dashboardSummary();
    var fx = typeof AppMarket !== 'undefined' && AppMarket.getFxRates ? AppMarket.getFxRates() : { USD: 7.1, HKD: 0.91, fallback: true };
    function signedCurrency(n, symbol) {
      var v = Number(n) || 0;
      return (v > 0 ? '+' : v < 0 ? '-' : '') + symbol + fmtMoney(Math.abs(v));
    }
    function marketEquivalent(cny, market) {
      if (market === 'hk') return '≈ ' + (Number(fx.HKD) > 0 ? signedCurrency(cny / fx.HKD, 'HK$') : 'HK$—');
      if (market === 'us') return '≈ ' + (Number(fx.USD) > 0 ? signedCurrency(cny / fx.USD, 'US$') : 'US$—');
      return '';
    }
    var markets = [
      { key: 'cn', name: 'A 股', mark: 'A', note: '北京时间交易日' },
      { key: 'hk', name: '港股', mark: 'H', note: '北京时间交易日' },
      { key: 'us', name: '美股', mark: 'U', note: '沿用最近一场交易' },
    ];
    var rows = markets.map(function (market) {
      var item = d.todayMarketPnl[market.key];
      var amount = item.ready ? yuanDelta(item.pnl) : '—';
      var signal = item.ready ? (item.pnl > 0 ? 'u' : item.pnl < 0 ? 'd' : '') : '';
      var detail = item.ready
        ? '持仓变动 ' + yuanDelta(item.floating) + ' · 今日卖出 ' + yuanDelta(item.realized)
        : '行情待更新 ' + (item.holdingCount - item.pendingCount) + '/' + item.holdingCount;
      return '<div class="pnl-market-row" data-pnl-market="' + market.key + '">' +
        '<div class="pnl-market-top"><span class="pnl-market-mark">' + market.mark + '</span>' +
        '<div class="pnl-market-name"><strong>' + market.name + '</strong><small>' + (item.closedToday ? '今日休市' : market.note) + (item.quoteDate ? ' · 最近行情 ' + escapeHtml(item.quoteDate.slice(5)) : '') + '</small></div>' +
        '<strong class="pnl-market-amount ' + signal + '">' + amount + '</strong></div>' +
        (item.ready && market.key !== 'cn' ? '<div class="pnl-market-fx">' + marketEquivalent(item.pnl, market.key) + '</div>' : '') +
        '<div class="pnl-market-detail">' + detail + '</div></div>';
    }).join('');
    openModal('<div class="m-head" data-pnl-detail><h3>盈亏明细</h3><button type="button" data-close-modal class="m-x" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="pnl-detail-total"><span>三市场合计 · 人民币</span><strong class="' + (d.todayPnlReady ? (d.todayPnl > 0 ? 'u' : d.todayPnl < 0 ? 'd' : '') : '') + '">' +
      (d.todayPnlReady ? yuanDelta(d.todayPnl) : '—') + '</strong>' +
      (d.todayPnlReady ? '' : '<small>部分行情待更新，暂不显示合计</small>') + '</div>' +
      '<div class="pnl-market-list">' + rows + '</div>' +
      '<p class="pnl-detail-note">A 股与港股按北京时间当天计算；美股保留最近一场交易的涨跌，拿到新交易日行情后更新。外币金额按' + (fx.fallback || fx.stale ? '参考' : '缓存') + '汇率换算，仅供对照。</p>');
  }
  var _kpiYear = 0;
  var _kpiMonth = '';
  function kpiSheet(title, body) {
    openModal('<div class="m-head" data-kpi-detail><h3>' + title + '</h3><button type="button" data-close-modal class="m-x" aria-label="关闭"><i class="fa-solid fa-xmark"></i></button></div><div class="kpi-sheet">' + body + '</div>');
  }
  function kpiHero(label, amount, note, tone) {
    return '<div class="kpi-detail-hero"><span>' + label + '</span><strong class="' + (tone || '') + '">' + amount + '</strong><small>' + note + '</small></div>';
  }
  function showKpiDetail(kind) {
    var d = AppData.dashboardSummary();
    var snapshots = AppData.getAccountSnapshots ? AppData.getAccountSnapshots() : [];
    var body = '';
    if (kind === 'assets') {
      body = kpiHero('当前持仓市值 · 人民币', '¥' + fmtMoney(d.totalAssets), '不含未记录的现金余额', '');
      if (snapshots.length) {
        var recent = snapshots.slice(-30);
        if (recent.length > 1) {
          var values = recent.map(function (s) { return Number(s.last.totalAssets) || 0; });
          var min = Math.min.apply(null, values), max = Math.max.apply(null, values), span = max - min || 1;
          var points = values.map(function (v, i) { return (8 + i * 224 / (values.length - 1)).toFixed(1) + ',' + (72 - (v - min) * 56 / span).toFixed(1); }).join(' ');
          body += '<div class="kpi-spark"><svg viewBox="0 0 240 80" role="img" aria-label="近 30 条持仓市值变化"><polyline points="' + points + '" fill="none" stroke="#0066CC" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg><div><span>' + recent[0].day.slice(5) + '</span><span>' + recent[recent.length - 1].day.slice(5) + '</span></div></div>';
        }
        body += '<div class="kpi-section-title">资产变化记录</div>' + snapshots.slice().reverse().map(function (s, i, reversed) {
          var previous = reversed[i + 1];
          var diff = previous ? Number(s.last.totalAssets) - Number(previous.last.totalAssets) : null;
          return '<div class="kpi-detail-row"><div><strong>' + escapeHtml(s.day) + '</strong><small>' + (previous ? '较上次记录 ' + yuanDelta(diff) : '记录起点') + '</small></div><b>¥' + fmtMoney(s.last.totalAssets) + '</b></div>';
        }).join('');
      } else body += '<div class="kpi-empty">行情齐备后开始记录资产变化。过去没有保存的日期不会补造。</div>';
      body += '<p class="kpi-footnote">金额变化可能来自股价、汇率或买卖交易；这里只记录持仓市值，不把买入、卖出直接当作投资收益。</p>';
      kpiSheet('总资产明细', body);
      return;
    }
    if (kind === 'floating') {
      var positions = d.positions || [];
      var winners = positions.filter(function (p) { return p.floatingPnL > 0; });
      var losers = positions.filter(function (p) { return p.floatingPnL < 0; });
      body = kpiHero('当前持仓浮动盈亏', yuanDelta(d.floatingPnl), '持仓成本 ¥' + fmtMoney(d.totalCost) + ' · ' + (d.floatingPnlPct > 0 ? '+' : '') + d.floatingPnlPct.toFixed(2) + '%', d.floatingPnl > 0 ? 'u' : d.floatingPnl < 0 ? 'd' : '');
      body += '<div class="kpi-mini-stats"><span>盈利 <b class="u">' + winners.length + ' 只</b></span><span>亏损 <b class="d">' + losers.length + ' 只</b></span></div>';
      body += positions.length ? '<div class="kpi-section-title">逐只持仓</div>' + positions.map(function (p) {
        return '<div class="kpi-detail-row"><div><strong>' + escapeHtml(p.stockName) + '</strong><small>成本 ¥' + fmtMoney(p.cost) + ' · 市值 ¥' + fmtMoney(p.marketValue) + '</small></div><b class="' + (p.floatingPnL > 0 ? 'u' : p.floatingPnL < 0 ? 'd' : '') + '">' + yuanDelta(p.floatingPnL) + '</b></div>';
      }).join('') : '<div class="kpi-empty">当前没有持仓。</div>';
      body += '<p class="kpi-footnote">这里是当前未卖出股票相对持仓成本的累计盈亏，卖出后的收益进入“已兑现盈亏”。</p>';
      kpiSheet('浮动盈亏明细', body);
      return;
    }
    if (kind === 'month') {
      var currentMonth = AppData.beijingYmd(new Date()).slice(0, 7);
      if (!_kpiYear) _kpiYear = Number(currentMonth.slice(0, 4));
      if (!_kpiMonth || _kpiMonth.slice(0, 4) !== String(_kpiYear)) _kpiMonth = String(_kpiYear) + '-' + (currentMonth.slice(0, 4) === String(_kpiYear) ? currentMonth.slice(5) : '12');
      var currentLive = { ready: d.todayPnlReady, at: Date.now(), floatingPnL: d.floatingPnl, totalAssets: d.totalAssets, monthRealized: d.monthRealized };
      function performance(ym) { return AppData.monthlyPerformance(ym, ym === currentMonth ? currentLive : null); }
      var selected = performance(_kpiMonth);
      body = '<div class="kpi-month-nav"><button type="button" data-kpi-year="-1" aria-label="上一年">‹</button><strong>' + _kpiYear + ' 年</strong><button type="button" data-kpi-year="1" aria-label="下一年"' + (_kpiYear >= Number(currentMonth.slice(0, 4)) ? ' disabled' : '') + '>›</button></div>';
      body += '<div class="kpi-month-grid">' + Array.from({ length: 12 }, function (_, i) {
        var ym = String(_kpiYear) + '-' + String(i + 1).padStart(2, '0');
        var p = performance(ym);
        return '<button type="button" data-kpi-month="' + ym + '" class="' + (ym === _kpiMonth ? 'selected ' : '') + (p ? p.pnl > 0 ? 'up' : p.pnl < 0 ? 'down' : '' : 'empty') + '"><span>' + (i + 1) + ' 月</span><b>' + (p ? yuanDelta(p.pnl, true) : '—') + '</b></button>';
      }).join('') + '</div>';
      body += '<div class="kpi-section-title">' + _kpiMonth + ' 月度明细</div>';
      if (selected) {
        body += kpiHero(selected.full ? '本月盈亏' : '自 ' + selected.from.slice(5) + ' 记录起', yuanDelta(selected.pnl), '截至 ' + selected.through + (selected.full ? '' : ' · 非完整月份'), selected.pnl > 0 ? 'u' : selected.pnl < 0 ? 'd' : '');
        body += '<div class="kpi-detail-row"><div><strong>本月已兑现</strong><small>' + selected.saleCount + ' 笔卖出</small></div><b>' + yuanDelta(selected.realized) + '</b></div>';
        body += '<div class="kpi-detail-row"><div><strong>持仓盈亏变化</strong><small>与月初或记录起点比较</small></div><b>' + yuanDelta(selected.floating) + '</b></div>';
      } else body += '<div class="kpi-empty">这个月没有可靠的持仓快照，或旧交易已修改，暂不能核实月收益。</div>';
      body += '<p class="kpi-footnote">月盈亏＝本月已兑现＋持仓浮盈相对月初的变化。历史行情未保存的月份显示空白；首次启用的月份只计算记录开始后的变化。</p>';
      kpiSheet('本月盈亏 · 月视图', body);
      return;
    }
    if (kind === 'realized') {
      var fx = typeof AppMarket !== 'undefined' && AppMarket.getFxRates ? AppMarket.getFxRates() : null;
      var sales = typeof AppFifo !== 'undefined' ? AppFifo.allSellRealized(AppData.getTrades(), fx, AppData.getStockPool()) : [];
      var wins = sales.filter(function (s) { return s.realizedPnL > 0; }).length;
      var losses = sales.filter(function (s) { return s.realizedPnL < 0; }).length;
      body = kpiHero('累计已兑现盈亏', yuanDelta(d.realizedPnl), '卖出股票后按先进先出成本计算', d.realizedPnl > 0 ? 'u' : d.realizedPnl < 0 ? 'd' : '');
      body += '<div class="kpi-mini-stats"><span>盈利 <b class="u">' + wins + ' 笔</b></span><span>亏损 <b class="d">' + losses + ' 笔</b></span></div>';
      body += sales.length ? '<div class="kpi-section-title">逐笔卖出</div>' + sales.map(function (s) {
        return '<div class="kpi-detail-row"><div><strong>' + escapeHtml(s.stockName) + '</strong><small>' + escapeHtml(String(s.sellTimestamp || '').slice(0, 10)) + ' · 卖出 ' + fmtMoney0(s.sellQty) + ' 股</small></div><b class="' + (s.realizedPnL > 0 ? 'u' : s.realizedPnL < 0 ? 'd' : '') + '">' + yuanDelta(s.realizedPnL) + '</b></div>';
      }).join('') : '<div class="kpi-empty">还没有卖出记录，暂时没有已兑现盈亏。</div>';
      kpiSheet('已兑现盈亏明细', body);
    }
  }
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'quoteRefreshMinutes') {
      var minutes = Number(e.target.value) === 10 ? 10 : 5;
      AppData.setConfig({ quoteRefreshMinutes: minutes });
      toast('已设为每 ' + minutes + ' 分钟自动刷新', 'ok');
      refreshHeldQuotes();
    }
  });
  document.addEventListener('click', (e) => {
    const bd = $modalBackdrop();
    if (e.target === bd) closeModal();
    if (e.target.closest('[data-close-modal]')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-kpi]')) {
      e.preventDefault();
      showKpiDetail(e.target.closest('[data-kpi]').getAttribute('data-kpi'));
      return;
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('[data-open-pnl]')) {
      e.preventDefault();
      showTodayPnlDetail();
      return;
    }
    if (e.key === 'Escape') closeModal();
  });

  /* ======================================================
   * 物理返回键（Android）
   * 真机上 Escape 永远不会触发，返回键是唯一的返回入口。不接管的话：
   * 弹窗打开时按返回 → 直接退出 APP；连续切过 Tab 后要按很多次才能退出。
   * 优先级：弹窗 → AI 子 tab → 非首页路由 → 首页双击退出。
   * ====================================================== */
  (function setupBackButton() {
    var lastBackAt = 0;
    function exitApp() {
      var App = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
      if (App && App.exitApp) App.exitApp();
    }
    function onBack() {
      try {
        if (PickerUI.close()) return;
        // 1) 弹窗打开 → 只关弹窗
        if ($modalBackdrop().classList.contains('show')) { closeModal(); return; }
        // 2) AI 页的子 tab（对话/报告库）→ 退回诊断页
        if (currentRoute() === 'ai' && _aiTab !== 'diag') { _aiTab = 'diag'; render(); return; }
        // 3) 非首页 → 回首页
        if (currentRoute() !== 'home') { location.hash = '#/home'; return; }
        // 4) 已在首页 → 2 秒内再按一次才退出，避免误触
        var now = Date.now();
        if (now - lastBackAt < 2000) exitApp();
        else { lastBackAt = now; toast('再按一次退出', 'warn'); }
      } catch (e) {
        console.warn('[返回键] 处理失败，已降级为直接退出：', e);
        exitApp();
      }
    }
    var App = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
    if (App && typeof App.addListener === 'function') {
      // 防御：老 WebView / 原生桥不完整时 addListener 可能返回 undefined 或非 Promise，
      // 直接链 .catch 会抛 TypeError 且中断顶层执行 → 整个 app 白屏（v245 真机事故）。
      // 返回键属于增强功能，任何失败都静默降级，绝不拖垮启动。
      try {
        var r = App.addListener('backButton', onBack);
        if (r && typeof r.catch === 'function') r.catch(function () {});
        else if (r && typeof r.then === 'function') r.then(function () {}, function () {});
      } catch (e) { console.warn('[返回键] 注册失败（不影响其他功能）：', e); }
    }
  })();

  /* ---------------- 底部抽屉手势：跟手拖拽 + 阻尼橡皮筋 + 速度吸附锚点 ----------------
     - 顶部抓手区（grabber + 标题行）任意方向可拖；内容区仅「滚动到顶 + 下拉」时接管
     - 向上拖过展开位 → iOS 橡皮筋阻尼（位移越大阻力越大）
     - 松手按「当前位移 + 速度投射」自动吸附锚点：展开(0) / 关闭(整高)
     - 快速下甩（velocity > 阈值）直接关闭，慢拖未过 1/3 高度则弹回 */
  (function sheetGesture() {
    const sheet = document.getElementById('modalBox');
    const bdEl = document.getElementById('modalBackdrop');
    const GRAB_H = 96;        // 顶部抓手区高度（grabber + 标题行）
    const FLING_V = 0.45;     // 甩动关闭速度阈值 px/ms
    const PROJECT_MS = 100;   // 松手速度投射时长
    let g = null;

    // 橡皮筋阻尼曲线：f(x) = (1 - 1/(x·c/d + 1))·d，位移越大越难拉
    function rubber(dist) {
      const d = 150, c = 0.55;
      return (1 - 1 / (Math.abs(dist) * c / d + 1)) * d * (dist < 0 ? -1 : 1);
    }

    function applyOffset(y) {
      g.offset = y;
      sheet.style.transform = 'translateY(' + y + 'px)';
      const p = Math.max(0, 1 - Math.max(0, y) / (g.H * 0.85)); // 遮罩跟随手淡出
      bdEl.style.background = 'rgba(0,0,0,' + (0.45 * p).toFixed(3) + ')';
    }

    sheet.addEventListener('pointerdown', (e) => {
      if (!bdEl.classList.contains('show') || g) return;
      if (e.target.closest('input,select,textarea,button,a,label,.sw,.seg')) return;
      const rect = sheet.getBoundingClientRect();
      g = {
        id: e.pointerId, y0: e.clientY, lastY: e.clientY, lastT: performance.now(),
        v: 0, H: sheet.offsetHeight, offset: 0, mode: null,
        fromHead: (e.clientY - rect.top) < GRAB_H,
      };
      try { sheet.setPointerCapture(e.pointerId); } catch (err) {}
    });

    sheet.addEventListener('pointermove', (e) => {
      if (!g || e.pointerId !== g.id) return;
      const dy = e.clientY - g.y0;
      if (!g.mode) {
        if (g.fromHead) { g.mode = 'drag'; sheet.classList.add('dragging'); }
        else if (Math.abs(dy) < 6) return;
        else if (dy > 0 && sheet.scrollTop <= 0) { g.mode = 'drag'; sheet.classList.add('dragging'); }
        else { g = null; return; }   // 内容区未到顶 → 交还内部滚动
      }
      let raw = dy;
      if (raw < 0) raw = rubber(raw);          // 向上越界 → 橡皮筋
      applyOffset(raw);
      const now = performance.now();
      const dt = now - g.lastT;
      if (dt > 0) {
        const inst = (e.clientY - g.lastY) / dt;
        g.v = g.v * 0.7 + inst * 0.3;          // 指数平滑速度
        g.lastY = e.clientY; g.lastT = now;
      }
      if (e.cancelable) e.preventDefault();
    });

    // 触屏兜底：已接管拖拽时阻止浏览器滚动（pointer events 不拦滚动）
    sheet.addEventListener('touchmove', (e) => {
      if (g && g.mode === 'drag' && e.cancelable) e.preventDefault();
    }, { passive: false });

    function release(e) {
      if (!g || (e.pointerId !== undefined && e.pointerId !== g.id)) return;
      const wasDrag = g.mode === 'drag';
      const v = g.v, H = g.H, off = g.offset;
      sheet.classList.remove('dragging');
      g = null;
      if (!wasDrag) return;
      // 吸附决策：位移 + 速度投射 → 展开锚点(0) / 关闭锚点(整高)
      const projected = off + v * PROJECT_MS;
      if (projected > H * 0.33 || v > FLING_V) {
        sheet.style.transition = 'transform 0.3s cubic-bezier(0.4, 0, 1, 1)';
        sheet.style.transform = 'translateY(' + (H + 60) + 'px)';
        bdEl.style.background = '';
        setTimeout(() => { sheet.style.transition = ''; closeModal(); }, 220);
      } else {
        // 弹回展开锚点：过冲弹簧曲线模拟橡皮筋回弹
        sheet.style.transition = 'transform 0.5s cubic-bezier(0.22, 1.35, 0.36, 1)';
        sheet.style.transform = 'translateY(0px)';
        bdEl.style.background = '';
        setTimeout(() => { sheet.style.transition = ''; sheet.style.transform = ''; }, 510);
      }
    }
    sheet.addEventListener('pointerup', release);
    sheet.addEventListener('pointercancel', release);
  })();

  /* ---------------- 确认弹窗（原生 confirm 在 Capacitor WebView 里不弹窗，必须自绘） ---------------- */
  function uiConfirm(msg, onOk) {
    openModal(`
      <div class="m-head">
        <h3>请确认</h3>
        <button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="m-msg">${escapeHtml(msg)}</div>
      <div class="m-foot">
        <button type="button" class="btn-pix btn-ghost" data-close-modal>取消</button>
        <button type="button" class="btn-pix btn-brand" id="uiConfirmOk">确认</button>
      </div>`);
    document.getElementById('uiConfirmOk').addEventListener('click', function () {
      closeModal();
      haptic('medium');  // 破坏性操作确认：中等强度，区别于平时的轻反馈
      if (typeof onOk === 'function') onOk();
    });
  }

  /* ======================================================
   * 行内操作：左滑 / 长按（取代常驻的「编辑 + 删除」双图标）
   * ------------------------------------------------------
   * 原来每行右上角常驻两个小图标：破坏性操作（删除）和浏览行为平权，
   * 既吵又危险，列表的「可读性面积」还被操作面积吃掉。改法（iOS 惯例）：
   *   左滑   → 行内滑出操作块（编辑 / 删除），跟手、可回弹
   *   长按   → 底部操作菜单（Action Sheet），同时是桌面鼠标与无障碍的兜底入口
   *   轻点行 → 该行的主操作（交易/自选=编辑，违规=打开菜单）
   * 删除永远排在最后且用朱红，编辑用中性石墨色（不是品牌行为，不配品牌色）。
   * ====================================================== */

  /* iOS 风格操作菜单：白底圆角分组 + 独立「取消」 */
  function uiActionSheet(title, items) {
    var html = '' +
      '<div class="m-head"><h3>' + escapeHtml(title) + '</h3>' +
        '<button type="button" data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button></div>' +
      '<div class="as">' +
        items.map(function (it, i) {
          return '<button type="button" class="as-item' + (it.danger ? ' danger' : '') + '" data-as="' + i + '">' +
            '<i class="' + (it.icon || 'fa-regular fa-circle') + '"></i>' +
            '<span>' + escapeHtml(it.label) + '</span>' +
            (it.hint ? '<em class="as-hint">' + escapeHtml(it.hint) + '</em>' : '') +
          '</button>';
        }).join('') +
      '</div>' +
      '<button type="button" class="as-cancel" data-close-modal>取消</button>';
    openModal(html);
    var box = $modalBox();
    var btns = box.querySelectorAll('[data-as]');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          var it = items[parseInt(btn.getAttribute('data-as'), 10)];
          closeModal();
          if (it && typeof it.onClick === 'function') it.onClick();
        });
      })(btns[i]);
    }
  }

  // 行内编辑的两个入口（滑出按钮 + 轻点行）走同一条路径，避免逻辑分叉
  function editTradeById(id) {
    var trec = AppData.getTrades().filter(function (x) { return x.id === id; })[0];
    if (!trec) { toast('未找到该交易', 'err'); return; }
    Modals.addTrade(trec);
  }
  function editPoolById(id) {
    var srec = AppData.getStockPool().filter(function (x) { return x.id === id; })[0];
    if (!srec) { toast('未找到该自选', 'err'); return; }
    Modals.addPool(srec);
  }

  var RowAct = (function () {
    var openRow = null;        // 当前滑开的行（同时只允许一行处于滑开态）
    var st = null;             // 滑动手势状态
    var press = null;          // 长按状态
    var pressTimer = 0;
    var suppressClick = false; // 滑动/长按结束后浏览器补发的 click 要吞掉

    function actsEl(row) { return row.querySelector('.sw-acts'); }
    function innerEl(row) { return row.querySelector('.sw-in'); }
    function width(row) {
      var a = actsEl(row);
      var w = a ? a.offsetWidth : 0;          // jsdom 无布局 → 0，兜底用固定值
      return w > 0 ? w : 152;
    }
    function offset(row, x) {
      var inn = innerEl(row);
      if (inn) inn.style.transform = x ? 'translateX(' + x + 'px)' : '';
    }
    function close(row) {
      if (!row) return;
      row.classList.remove('sw-open');
      offset(row, 0);
      // 收起动画（260ms）期间保持操作块可见，播完再隐藏，否则按钮会"啪"地闪没
      row.classList.add('sw-closing');
      setTimeout(function () { if (document.body.contains(row)) row.classList.remove('sw-closing'); }, 280);
      if (openRow === row) openRow = null;
    }
    function open(row) {
      if (openRow && openRow !== row) close(openRow);
      row.classList.add('sw-open');
      offset(row, -width(row));
      openRow = row;
      markLearned();          // 用户真的左滑过 → 以后不再演示教学动画
      haptic('select');
    }
    function closeAll() { if (openRow) close(openRow); }

    /* ---- 手势教学：全展开演示（用户拍板版）----
       不弹文字 toast：让第一行把整个操作块完整滑出来，停足 2.5 秒再收回。
       一年就这么一次，要做就做足——露出 34px 的一角反而让人看不明白。
       规则：用户做过一次手势 → 永久关闭；每个进程最多演示一次；跨进程最多 3 次。 */
    var PEEK_HOLD = 2500;     // 保持 2.5s（用户要求不超过 3 秒）
    var PEEK_DELAY = 1100;    // 进页后先看 1 秒钟页面，再开始演示
    var PEEK_CAP = 3;
    var peekedThisRun = false;
    var peekTimer = 0;
    var peekRow = null;
    var peekCancelTouch = null;
    function markLearned() {
      try { AppData.setConfig({ rowActLearned: true }); } catch (e) {}
    }
    function peekClose() {
      clearTimeout(peekTimer); peekTimer = 0;
      if (peekCancelTouch) { document.removeEventListener('touchstart', peekCancelTouch); peekCancelTouch = null; }
      if (peekRow) {
        if (document.body.contains(peekRow)) {
          peekRow.classList.remove('sw-peek');   // 撤掉演示标记（顺带隐藏操作块）
          if (!peekRow.classList.contains('sw-open')) offset(peekRow, 0);
        }
        peekRow = null;
      }
    }
    function peekOnce(row) {
      if (!row || !document.body.contains(row)) return;
      var inn = innerEl(row);
      if (!inn) return;
      if (row.classList.contains('sw-open')) return;
      row.classList.remove('sw-dragging');   // 保证 transform 过渡是开着的
      peekRow = row;
      row.classList.add('sw-peek');          // 演示期间操作块可见（visibility 修复配套）
      offset(row, -width(row));              // 整个操作块全露出来
      // 用户一碰屏幕就立刻收场，别跟真手势打架
      peekCancelTouch = function () { peekClose(); };
      document.addEventListener('touchstart', peekCancelTouch, { once: true, passive: true });
      peekTimer = setTimeout(peekClose, PEEK_HOLD);
    }
    function peekMaybe(route) {
      if (['trades', 'pool', 'discipline'].indexOf(route) < 0) return;
      if (peekedThisRun) return;
      var cfg = {};
      try { cfg = AppData.getConfig() || {}; } catch (e) { return; }
      if (cfg.rowActLearned) return;                        // 已经会了，别再教
      var n = Number(cfg.rowActHintCount) || 0;
      if (n >= PEEK_CAP) return;
      try { AppData.setConfig({ rowActHintCount: n + 1 }); } catch (e) {}
      peekedThisRun = true;
      var row = document.querySelector('#main [data-sw-row]');
      if (!row) { peekedThisRun = false; return; }          // 空列表没得演示，不算次数
      // 行元素必须在"动画真正要播的那一刻"再取：列表页 render 之后行情刷新会再重绘一次，
      // 提前存下来的引用会变成游离节点，动画播在看不见的地方。
      setTimeout(function () { peekOnce(document.querySelector('#main [data-sw-row]')); }, PEEK_DELAY);
    }

    /* 长按 / 鼠标长按 → 操作菜单 */
    function menu(row) {
      var kind = row.getAttribute('data-sw-row');
      var id = row.getAttribute('data-row-id');
      if (!kind || !id) return;
      markLearned();          // 长按也是"学会了"的证据
      if (kind === 'trade') {
        uiActionSheet('这笔交易', [
          { label: '编辑', icon: 'fa-regular fa-pen-to-square', onClick: function () { editTradeById(id); } },
          { label: '删除', icon: 'fa-regular fa-trash-can', danger: true, onClick: function () { removeWithUndo('trade', id, '交易', '确认删除这笔交易？'); } },
        ]);
      } else if (kind === 'pool') {
        uiActionSheet('这只自选', [
          { label: '编辑', icon: 'fa-regular fa-pen-to-square', onClick: function () { editPoolById(id); } },
          { label: '从股票池移除', icon: 'fa-regular fa-trash-can', danger: true, onClick: function () { removeWithUndo('pool', id, '自选', '确认从股票池移除？'); } },
        ]);
      } else if (kind === 'vio') {
        var v = AppData.getViolations().filter(function (x) { return x.id === id; })[0];
        var list = [];
        if (v && v.status !== 'resolved') {
          list.push({
            label: '标记已处理', icon: 'fa-solid fa-check',
            onClick: function () { AppData.resolveViolation(id); haptic('select'); toast('已标记为已处理', 'ok'); render(); },
          });
        }
        list.push({
          label: '删除这条记录', icon: 'fa-regular fa-trash-can', danger: true,
          onClick: function () { removeWithUndo('violation', id, '违规记录', '确认删除这条违规记录？'); },
        });
        uiActionSheet(v ? (v.ruleName || '违规记录') : '违规记录', list);
      }
    }

    /* ---- 左滑手势 ---- */
    document.addEventListener('touchstart', function (e) {
      if (!e.touches || e.touches.length !== 1) { st = null; return; }
      var el = e.target;
      if (!el || !el.closest) { st = null; return; }
      var row = el.closest('[data-sw-row]');
      if (!row || el.closest('.sw-acts')) { st = null; return; }
      if (openRow && openRow !== row) close(openRow);
      var t = e.touches[0];
      st = {
        row: row, x0: t.clientX, y0: t.clientY,
        base: (row === openRow ? -width(row) : 0), w: width(row),
        dx: 0, v: 0, lastX: t.clientX, lastT: Date.now(), mode: null,
      };
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
      if (!st || !e.touches || e.touches.length !== 1) return;
      var t = e.touches[0];
      var dx = t.clientX - st.x0, dy = t.clientY - st.y0;
      if (!st.mode) {
        // 竖向意图 → 交还页面滚动，绝不吃掉上下滑
        if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) { st = null; return; }
        if (Math.abs(dx) < 8) return;
        if (dx > 0 && st.base === 0) { st = null; return; }   // 闭态右滑没有对应动作
        st.mode = 'swipe';
        st.row.classList.add('sw-dragging');
      }
      var x = st.base + dx;
      if (x > 0) x = 0;
      if (x < -st.w) x = -st.w - Math.min(28, (-st.w - x) * 0.3);   // 越界橡皮筋
      st.dx = x - st.base;
      offset(st.row, x);
      var now = Date.now(), dt = now - st.lastT;
      if (dt > 0) { st.v = (t.clientX - st.lastX) / dt; st.lastX = t.clientX; st.lastT = now; }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });

    function endTouch() {
      if (!st) return;
      var s = st; st = null;
      if (s.mode !== 'swipe') return;
      s.row.classList.remove('sw-dragging');
      var cur = s.base + s.dx;
      var shouldOpen = (cur <= -s.w * 0.45) || (s.v < -0.35 && s.dx < -8);
      if (shouldOpen) open(s.row); else close(s.row);
      // 手势结束后浏览器常补一个 click，吞掉它，否则会顺带触发「轻点行=编辑」
      suppressClick = true;
      setTimeout(function () { suppressClick = false; }, 350);
    }
    document.addEventListener('touchend', endTouch, { passive: true });
    document.addEventListener('touchcancel', endTouch, { passive: true });

    /* ---- 长按（触屏与鼠标通用；桌面没有滑动，这是唯一的菜单入口） ---- */
    function clearPress() { clearTimeout(pressTimer); press = null; }
    document.addEventListener('pointerdown', function (e) {
      var el = e.target;
      if (!el || !el.closest) return;
      if (el.closest('.sw-acts') || el.closest('#modalBox')) return;
      var row = el.closest('[data-sw-row]');
      if (!row) return;
      press = { row: row, x: e.clientX, y: e.clientY };
      clearTimeout(pressTimer);
      pressTimer = setTimeout(function () {
        var p = press; press = null;
        if (!p) return;
        haptic('medium');
        suppressClick = true;
        setTimeout(function () { suppressClick = false; }, 350);
        menu(p.row);
      }, 480);
    }, { passive: true });
    document.addEventListener('pointermove', function (e) {
      if (!press) return;
      if (Math.abs(e.clientX - press.x) > 8 || Math.abs(e.clientY - press.y) > 8) clearPress();
    }, { passive: true });
    document.addEventListener('pointerup', clearPress, { passive: true });
    document.addEventListener('pointercancel', clearPress, { passive: true });

    /* ---- 点击收口：滑开态下第一次点击只收起，不误触发行内主操作 ---- */
    document.addEventListener('click', function (e) {
      var el = e.target;
      if (suppressClick) {
        suppressClick = false;
        e.stopPropagation();
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (!el || !el.closest) return;
      if (openRow) {
        var cur = openRow;
        var inActs = !!el.closest('.sw-acts');
        close(cur);
        if (!inActs && el.closest('[data-sw-row]')) { e.stopPropagation(); e.preventDefault(); }
      }
    }, true);

    return { open: open, close: close, closeAll: closeAll, menu: menu, peekMaybe: peekMaybe, markLearned: markLearned };
  })();

  /* ---------------- 本地通知（Capacitor 原生插件；浏览器预览降级提示） ---------------- */
  const NotifApp = {
    _ln: function () {
      return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;
    },
    // 老 WebView / 原生桥不完整时插件方法可能返回 undefined 或非 Promise，
    // 直接链 .then/.catch 会同步抛 TypeError。统一包装：非 Promise 视为桥不可用，
    // 走 rejection 交给各调用点的 .catch 兜底。
    _p: function (p) {
      return (p && typeof p.then === 'function')
        ? p
        : Promise.reject(new Error('plugin bridge unavailable'));
    },
    _webWarn: function () {
      toast('浏览器预览不支持原生通知，请用 APP 体验', 'warn');
    },
    checkPermission: function () {
      var ln = this._ln();
      if (!ln) { this._webWarn(); return; }
      try {
        this._p(ln.requestPermissions()).then(function (r) {
          var ok = r && (r.display === 'granted' || r.display === 'prompt');
          toast(ok ? '通知权限已开启' : '权限被拒，请到系统设置 → 应用 → 投资看板 → 开启通知', ok ? 'ok' : 'err');
        }).catch(function () { toast('无法请求通知权限', 'err'); });
      } catch (e) { toast('无法请求通知权限', 'err'); }
    },
    testNotification: function () {
      var ln = this._ln();
      if (!ln) { this._webWarn(); return; }
      try {
        this._p(ln.schedule({
          notifications: [{
            title: '投资看板 · 测试通知',
            body: '看到这条说明通知通道正常 ✓',
            id: 99999,
            schedule: { at: new Date(Date.now() + 2000) }
          }]
        })).then(function () { toast('测试通知已排期，2 秒后送达', 'ok'); })
          .catch(function () { toast('通知排期失败', 'err'); });
      } catch (e) { toast('通知排期失败', 'err'); }
    },
    // 即时推送（纪律违规等事件触发）
    pushNow: function (title, body) {
      var ln = this._ln();
      if (!ln) return;
      try {
        this._p(ln.schedule({
          notifications: [{
            title: title, body: body,
            id: Math.floor(Math.random() * 89000) + 10000,
            schedule: { at: new Date(Date.now() + 500) }
          }]
        })).catch(function () {});
      } catch (e) { /* 推送失败静默 */ }
    },
    // 按设置页开关重建日程（盘前 09:15 / 复盘 15:15 / 周日 20:00）
    applySchedules: function () {
      var self = this;
      var ln = this._ln();
      if (!ln) return;
      var cfg = AppData.getConfig();
      var notif = cfg.notif || {};
      var jobs = [];
      if (notif.prefMkt !== false) jobs.push({ id: 10001, t: '盘前提醒', b: '开盘在即，看一眼今天关注池的股票', on: { hour: 9, minute: 15 } });
      if (notif.postMkt !== false) jobs.push({ id: 10002, t: '复盘提醒', b: '收市了，记一笔并看看今日盈亏', on: { hour: 15, minute: 15 } });
      if (notif.weekRv !== false) {
        // 下一个周日 20:00 起每周期一次
        var at = new Date();
        at.setHours(20, 0, 0, 0);
        var diff = (7 - at.getDay()) % 7;
        if (diff === 0 && at <= new Date()) diff = 7;
        at.setDate(at.getDate() + diff);
        jobs.push({ id: 10003, t: '周检视提醒', b: '本周回顾 + 下周计划', at: at, every: 'week' });
      }
      try {
        this._p(ln.getPending()).then(function (pending) {
          var old = (pending && pending.notifications) || [];
          if (old.length) {
            return self._p(ln.cancel({ notifications: old.map(function (n) { return { id: n.id }; }) }));
          }
        }).then(function () {
          if (!jobs.length) return;
          return self._p(ln.schedule({
            notifications: jobs.map(function (j) {
              var n = { title: '投资看板 · ' + j.t, body: j.b, id: j.id, schedule: {} };
              if (j.on) n.schedule.on = j.on;
              if (j.at) { n.schedule.at = j.at; n.schedule.every = j.every; }
              return n;
            })
          }));
        }).catch(function () { /* 排期失败静默，不打断 UI */ });
      } catch (e) { /* 排期失败静默，不打断 UI */ }
    },
    // 纪律违规即时推送（由 mock.js 的 app:violations 事件触发）
    initViolationListener: function () {
      var self = this;
      window.addEventListener('app:violations', function (e) {
        var cfg = AppData.getConfig();
        if (!cfg.notif || cfg.notif.violPush === false) return;
        var vios = e.detail || [];
        if (!vios.length) return;
        var names = vios.map(function (v) { return v.ruleName || v.name || '规则'; }).join('、');
        self.pushNow('纪律警报', '触发规则：' + names);
      });
    }
  };


  /* ---------------- 路由 ---------------- */
  function currentRoute() {
    const h = (location.hash || '#/home').replace(/^#\/?/, '').split('/')[0];
    return ROUTES.includes(h) ? h : 'home';
  }
  function navigate(route, sub) {
    const target = '#/' + route + (sub ? '/' + sub : '');
    if (location.hash !== target) location.hash = target;
    else render();
  }
  window.addEventListener('hashchange', render);

  function updateTabActive(route) {
    const items = $bn().querySelectorAll('.bn-item');
    items.forEach(b => {
      const r = b.getAttribute('data-route');
      b.classList.toggle('on', r === route);
    });
  }

  /* ======================================================
   * 页面渲染器
   * ====================================================== */
  const Pages = {};

  /* ----------- 1. 仪表盘 Home ----------- */
  Pages.home = function () {
    let d = AppData.dashboardSummary();
    if (d.todayPnlReady && AppData.recordAccountSnapshot && AppData.recordAccountSnapshot()) d = AppData.dashboardSummary();
    const positions = d.positions;
    const todayUp = d.todayPnl > 0;
    const deltaUp = d.todayDeltaAmt > 0;
    const todayTone = !d.todayPnlReady || d.todayPnl === 0 ? 'flat' : (todayUp ? 'up' : 'dn');
    const fUp = d.floatingPnl >= 0;
    const mUp = d.monthPnl == null || d.monthPnl >= 0;

    // ===== 数据健壮性提示横幅（#13 卖出超持仓 / #24 汇率过期 / 写盘失败） =====
    // 每条都能跳去对应页面处理：提示从「通知」变成「入口」，比\"请到记录页核对\"这种
    // 写在文案里的指引更符合手机操作习惯。视觉上降成一条列表行的重量，不抢 Hero 的戏。
    var warnItems = [];
    if (d.dataWarnings && d.dataWarnings.length) {
      warnItems.push({
        icon: 'fa-scale-unbalanced',
        text: d.dataWarnings.length + ' 只标的卖出量超过持仓，盈亏可能少算',
        act: '去核对',
        go: 'trades'
      });
    }
    if (d.fxStale) {
      var fxAgeH = d.fxUpdatedAt ? Math.round((Date.now() - d.fxUpdatedAt) / 3600000) : 0;
      warnItems.push({
        icon: 'fa-money-bill-transfer',
        text: '汇率已 ' + (fxAgeH > 1 ? fxAgeH + ' 小时' : '较久') + '未更新，人民币金额可能有偏差',
        act: '去检查',
        go: 'settings'
      });
    }
    if (AppData.getWriteError && AppData.getWriteError()) {
      warnItems.push({
        icon: 'fa-circle-exclamation',
        text: '本地存储写入失败，部分数据可能没保存上',
        act: '去处理',
        go: 'settings'
      });
    }
    var warnHtml = warnItems.length ? (
      '<div class="data-warn">' + warnItems.map(function (w) {
        return '<button type="button" class="dw-row" data-goto="' + w.go + '">' +
          '<span class="dw-ic"><i class="fa-solid ' + w.icon + '"></i></span>' +
          '<span class="dw-t">' + escapeHtml(w.text) + '</span>' +
          '<span class="dw-a">' + w.act + '<i class="fa-solid fa-chevron-right"></i></span>' +
        '</button>';
      }).join('') + '</div>'
    ) : '';

    // ===== 1. Hero：今日盈亏（方向性渐变背景） =====
    const heroHtml = `
      <div class="hero hero-${todayTone}" data-open-pnl role="button" tabindex="0" aria-label="查看今日盈亏的三市场明细">
        <div class="hero-glow"></div>
        <div class="hero-head"><div class="hero-lbl"><i class="fa-regular fa-calendar-check"></i> 今日盈亏</div><span class="hero-open">三市场明细 <i class="fa-solid fa-chevron-right"></i></span></div>
        <div class="hero-num ${d.todayPnlReady ? (d.todayPnl > 0 ? 'u' : d.todayPnl < 0 ? 'd' : '') : ''}" ${d.todayPnlReady ? 'data-val="' + d.todayPnl + '" data-sign="' + (todayUp ? '+' : '') + '"' : ''}>${d.todayPnlReady ? yuanDelta(d.todayPnl) : '—'}</div>
        <div class="hero-sub">
          <span class="hero-badge ${d.todayPnlReady && d.todayPnl !== 0 ? (deltaUp ? 'up' : 'dn') : ''}">
            ${d.todayPnlReady && d.todayPnl !== 0 ? '<i class="fa-solid fa-caret-' + (deltaUp ? 'up' : 'down') + '"></i>' : ''}
            ${d.todayPnlReady ? '组合 ' + (deltaUp ? '+' : '') + d.todayDeltaPct.toFixed(2) + '%' : '行情待更新 ' + d.todayQuoteCount + '/' + d.todayHoldingCount + (d.todayPendingQuoteCodes.length ? ' · ' + escapeHtml(d.todayPendingQuoteCodes.slice(0, 2).join('、')) : '')}
          </span>
          <span class="hero-dt">${d.todayPnlReady && d.todayQuoteUpdatedAt ? '更新 ' + new Date(d.todayQuoteUpdatedAt).toLocaleTimeString('zh-CN', { timeZone: 'Asia/Shanghai', hour: '2-digit', minute: '2-digit', hour12: false }) + (d.todayMarketPnl.hk.closedToday && d.todayMarketPnl.hk.holdingCount ? ' · 港股休市' : '') + (d.todayUsPreviousSessionCount ? ' · 美股沿用上场' : '') : (d.latestQuoteDate ? '最近行情 ' + d.latestQuoteDate.slice(5) : new Date().toLocaleDateString('sv-SE'))}</span>
        </div>
      </div>`;

    // ===== 2. 大盘指数条（涨跌色块背景） =====
    // 指数条：先只渲染指数名 + 占位，真实数值由 refreshHomeBench() 异步填入。
    // 注意：这里不再直接渲染 dashboardSummary 里的静态值——那是写死的假数据，
    // 行情接口失败时会一直显示，容易让人误判大盘。取不到就显示 --（见 renderBenchFallback）。
    const tickerHtml = `<div class="bench-row is-loading">` +
      d.bench.map(b => `
        <div class="bench-item">
          <span class="bench-n">${b.name}</span>
          <span class="bench-p"><i class="sk sk-pct"></i></span>
        </div>`).join('') + `</div>`;

    // ===== 3. 核心 4 指标 2×2（带图标与强调色） =====
    const kpiHtml = `
      <div class="kpi-grid">
        <div class="kpi kpi-blue" data-kpi="assets" role="button" tabindex="0" aria-label="查看总资产变化记录">
          <div class="k-top"><div class="k-ic"><i class="fa-solid fa-wallet"></i></div><span class="k-k">总资产</span></div>
          <div class="k-v">¥${fmtAmt(d.totalAssets)}</div>
          <div class="k-s">成本 ¥${fmtAmt(d.totalCost)}</div>
        </div>
        <div class="kpi kpi-${fUp ? 'up' : 'dn'}" data-kpi="floating" role="button" tabindex="0" aria-label="查看浮动盈亏明细">
          <div class="k-top"><div class="k-ic"><i class="fa-solid fa-chart-pie"></i></div><span class="k-k">浮动盈亏</span></div>
          <div class="k-v ${fUp ? 'u' : 'd'}">${d.floatingPnl > 0 ? '+' : d.floatingPnl < 0 ? '-' : ''}¥${fmtAmt(d.floatingPnl)}</div>
          <div class="k-s ${fUp ? 'u' : 'd'}">${d.floatingPnl > 0 ? '+' : ''}${d.floatingPnlPct.toFixed(2)}%</div>
        </div>
        <div class="kpi kpi-${mUp ? 'up' : 'dn'}" data-kpi="month" role="button" tabindex="0" aria-label="查看每月盈亏">
          <div class="k-top"><div class="k-ic"><i class="fa-solid fa-calendar-day"></i></div><span class="k-k">本月盈亏</span></div>
          <div class="k-v ${d.monthPnl == null ? '' : mUp ? 'u' : 'd'}">${d.monthPnl == null ? '—' : (d.monthPnl > 0 ? '+' : d.monthPnl < 0 ? '-' : '') + '¥' + fmtAmt(d.monthPnl)}</div>
          <div class="k-s">${d.monthPnlDetail ? (!d.todayPnlReady ? '截至 ' + d.monthPnlDetail.through.slice(5) + ' 的记录' : d.monthPnlDetail.full ? '已兑现＋持仓变化' : '自 ' + d.monthPnlDetail.from.slice(5) + ' 起记录') : '等待有效行情记录'}</div>
        </div>
        <div class="kpi kpi-${d.realizedPnl >= 0 ? 'up' : 'dn'}" data-kpi="realized" role="button" tabindex="0" aria-label="查看已兑现盈亏明细">
          <div class="k-top"><div class="k-ic"><i class="fa-solid fa-sack-dollar"></i></div><span class="k-k">已兑现盈亏</span></div>
          <div class="k-v ${d.realizedPnl >= 0 ? 'u' : 'd'}">${d.realizedPnl > 0 ? '+' : d.realizedPnl < 0 ? '-' : ''}¥${fmtAmt(d.realizedPnl)}</div>
          <div class="k-s">纪律评分 ${d.disciplineScore}</div>
        </div>
      </div>`;

    // ===== 4. 当前持仓列表（涨跌行高亮） =====
    // I3：一行里只保留「名称 / 现价 / 涨跌%」三个主角，
    // 代码、股数、成本、盈亏金额全部降到 11px 次级灰——报表感正是来自"什么都想说"。
    const posHtml = positions.length > 0 ? positions.map(p => {
      const up = p.floatingPnLPct >= 0;
      return `
      <div class="row pos-row ${up ? 'up' : 'dn'}" data-pos="${escapeHtml(p.stockCode)}" tabindex="0" role="button">
        <div class="pos-ic ${up ? 'up' : ''}">${stockGlyph(p.stockCode, p.stockName)}</div>
        <div class="pos-m">
          <div class="pos-nm"><span class="pos-nm-t">${escapeHtml(p.stockName)}</span><span class="pos-cd">${escapeHtml(p.stockCode)}</span></div>
          <div class="pos-sm">${p.shares.toLocaleString()} 股 · 本 ${curSym(p.market)}${fmtMoney(p.avgCost)}</div>
        </div>
        <div class="pos-r">
          <div class="pos-p">${curSym(p.market)}${fmtMoney(p.currentPrice)}</div>
          <div class="pos-pc ${up ? 'u' : 'd'}">${up ? '+' : ''}${p.floatingPnLPct.toFixed(2)}%<span class="pos-am">${yuanDelta(p.floatingPnL, true)}</span></div>
        </div>
      </div>`;
    }).join('') : `<div class="empty es"><div class="es-ic"><i class="fa-regular fa-chart-bar"></i></div>
        <div class="es-t">还没有持仓</div>
        <div class="es-s">记下第一笔买入，这里就会出现你的持仓、现价和浮动盈亏。</div>
        <button class="btn-pix btn-brand btn-sm es-act" data-open-add-trade><i class="fa-solid fa-plus"></i> 记一笔买入</button>
      </div>`;

    return `
    <section class="pg pg-home">

      ${heroHtml}
      ${tickerHtml}
      ${warnHtml}

      <!-- 当前持仓：提到指数条之后。
           大盘是市场参照系（要保留），但打开 APP 第一屏最该看到的是"我的钱"，
           所以持仓紧跟指数条，核心指标与走势图下沉。 -->
      <div class="sec-head gap-m">
        <h3>当前持仓</h3>
        <span class="sec-sub">${positions.length} 只</span>
      </div>
      <div class="card list-card home-list">
        ${posHtml}
      </div>

      ${kpiHtml}

      <!-- 收益走势 -->
      <div class="card chart-card chart-home">
        <div class="chart-head">
          <div>
            <span class="chart-title">已兑现收益走势</span>
            <div class="perf-l">累计已实现盈亏</div>
          </div>
          <span class="chart-note">近 6 个月</span>
        </div>
        <div class="perf-v ${d.realizedPnl >= 0 ? 'u' : 'd'}">${yuanDelta(d.realizedPnl, true)}</div>
        <div class="chart-box"><canvas id="perfChart"></canvas></div>
      </div>

      <!-- 快捷入口：一行四个图标钮。
           它是次级功能，原来占了两行 2×2 白卡（和上面的数据卡同权重），
           把首页拉成没有段落感的流水账。收成一行后，首页节奏变成
           主角区（Hero+指数）→ 数据区（持仓/KPI/走势）→ 行动区，三个章节。 -->
      <div class="sec-head gap-l">
        <h3>快捷入口</h3>
        <span class="sec-sub">本周 ${d.tradesThisWeek} 笔 · 自选 ${AppData.getStockPool().length} 只</span>
      </div>
      <div class="quick-row">
        <button class="qk-i qk-blue" data-open-add-trade aria-label="记一笔">
          <span class="qk-ic"><i class="fa-solid fa-plus"></i></span>
          <span class="qk-t">记一笔</span>
        </button>
        <button class="qk-i qk-purple" data-open-add-pool aria-label="加自选">
          <span class="qk-ic"><i class="fa-regular fa-star"></i></span>
          <span class="qk-t">加自选</span>
        </button>
        <button class="qk-i qk-orange" data-goto="discipline" aria-label="纪律系统">
          <span class="qk-ic"><i class="fa-solid fa-shield-halved"></i></span>
          <span class="qk-t">纪律</span>
        </button>
        <button class="qk-i qk-teal" data-goto="insights" aria-label="交易心得">
          <span class="qk-ic"><i class="fa-regular fa-lightbulb"></i></span>
          <span class="qk-t">心得</span>
        </button>
      </div>

    </section>`;
  };

  /* ----------- 2. 交易记录 ----------- */
  Pages.trades = function () {
    const all = AppData.getTrades();
    const buys = all.filter(t => t.type === 'buy').length;
    const sells = all.filter(t => t.type === 'sell').length;
    const buyAmt = all.filter(t=>t.type==='buy').reduce((s,t)=>s+toCny(t.quantity*t.price, t.market),0);
    const sellAmt = all.filter(t=>t.type==='sell').reduce((s,t)=>s+toCny(t.quantity*t.price, t.market),0);
    const monthly = typeof AppData.monthlyTradeStats === 'function' ? AppData.monthlyTradeStats() : [];
    const totalPnL = monthly.reduce((s, m) => s + (m.realizedPnL || 0), 0);

    const list = all.map(t => {
      const isBuy = t.type === 'buy';
      const sym = curSym(t.market);
      const amtCny = toCny(t.quantity * t.price, t.market);
      return `
      <div class="tr-row row-sw" data-sw-row="trade" data-row-id="${t.id}">
        <div class="sw-in">
          <div class="tr-badge ${isBuy?'buy':'sell'}">
            <i class="fa-solid fa-arrow-${isBuy?'down':'up'}"></i>${isBuy?'买':'卖'}
          </div>
          <div class="tr-m">
            <div class="tr-n"><span class="tr-nm">${escapeHtml(t.stockName)}</span><span class="tr-c">${escapeHtml(t.stockCode)}</span></div>
            <div class="tr-d"><i class="fa-regular fa-calendar"></i> ${AppData.isoDate(t.timestamp)}</div>
            <div class="tr-e">${t.quantity}股 × ${sym}${fmtMoney(t.price)}<span class="tr-f">费 ${sym}${fmtMoney(t.fee||0)}</span></div>
          </div>
          <div class="tr-r">
            <div class="tr-am">${isBuy?'-':'+'}¥${fmtMoney0(amtCny)}</div>
          </div>
        </div>
        <div class="sw-acts">
          <button class="sw-a sw-edit" data-edit-trade="${t.id}" aria-label="编辑这笔交易"><i class="fa-regular fa-pen-to-square"></i><span>编辑</span></button>
          <button class="sw-a sw-del" data-del-trade="${t.id}" aria-label="删除这笔交易"><i class="fa-regular fa-trash-can"></i><span>删除</span></button>
        </div>
      </div>`;
    }).join('') || '<div class="empty es"><div class="es-ic"><i class="fa-regular fa-face-smile"></i></div>' +
        '<div class="es-t">还没有交易记录</div>' +
        '<div class="es-s">记下第一笔买入，盈亏、胜率和纪律分都从这里开始算。</div>' +
        '<button class="btn-pix btn-brand btn-sm es-act" data-open-add-trade><i class="fa-solid fa-plus"></i> 记一笔</button>' +
      '</div>';

    return `
    <section class="pg">
      <div class="pg-head">
        <h1>交易记录</h1>
        <div class="pg-actions">
          <button class="btn-pix btn-ghost btn-sm" data-trade-export><i class="fa-solid fa-arrow-up-from-bracket"></i> 导出</button>
          <button class="btn-pix btn-ghost btn-sm" data-trade-import><i class="fa-solid fa-arrow-down"></i> 导入</button>
          <button class="btn-pix btn-brand btn-sm" data-open-add-trade><i class="fa-solid fa-plus"></i> 记一笔</button>
          <input type="file" id="tradeCsvInput" accept=".csv,text/csv" hidden>
        </div>
      </div>

      <div class="sum-row">
        <div class="sum-box">
          <div class="sb-k">买入 · ${buys} 笔</div>
          <div class="sb-v">-¥${fmtAmt(buyAmt)}</div>
          <div class="sb-s">资金流出</div>
        </div>
        <div class="sum-box">
          <div class="sb-k">卖出 · ${sells} 笔</div>
          <div class="sb-v">+¥${fmtAmt(sellAmt)}</div>
          <div class="sb-s">资金回流</div>
        </div>
        <div class="sum-box">
          <div class="sb-k">净额</div>
          <div class="sb-v ${sellAmt-buyAmt>=0?'u':'d'}">${sellAmt-buyAmt>=0?'+':'-'}¥${fmtAmt(sellAmt-buyAmt)}</div>
          <div class="sb-s">现金方向</div>
        </div>
      </div>

      <div class="card chart-card">
        <div class="chart-head">
          <span class="chart-title">月度已兑现盈亏趋势</span>
          <span class="chart-note">柱：当月已兑现（左轴）· 线：累计已兑现（右轴）</span>
        </div>
        <div class="chart-kpis">
          <div class="ckpi"><small>总买入</small><b>¥${fmtAmt(buyAmt)}</b></div>
          <div class="ckpi"><small>总卖出</small><b>¥${fmtAmt(sellAmt)}</b></div>
          <div class="ckpi"><small>已实现盈亏</small><b class="${totalPnL>=0?'u':'d'}">${totalPnL>0?'+':totalPnL<0?'-':''}¥${fmtAmt(totalPnL)}</b></div>
          <div class="ckpi"><small>交易月数</small><b>${monthly.length} 个月</b></div>
        </div>
        <div class="chart-box tall"><canvas id="tradesBarChart"></canvas></div>
      </div>

      <div class="sec-head"><h3>全部流水</h3><span class="sec-sub">${all.length} 条</span></div>
      <div class="card list-card">${list}</div>
    </section>`;
  }

  /* ----------- 3. 股票池 ----------- */
  var _poolTab = 'all';    // all | 1(核心) | 2(关注)
  var _poolSector = '';    // 行业标签过滤；空串 = 不过滤，点已选中的标签可取消

  Pages.pool = function () {
    const all = AppData.getStockPool();
    const core = all.filter(function (s) { return s.poolId === '1'; });
    const watch = all.filter(function (s) { return s.poolId === '2'; });
    const watching = all.filter(function (s) { return s.researchStatus === 'watching'; });
    const sectors = [...new Set(all.flatMap(function (s) { return s.tags || []; }))];

    // Tab 过滤 + 行业标签过滤
    const poolRows = (_poolTab === '1' ? core : _poolTab === '2' ? watch : all)
      .filter(function (s) { return !_poolSector || (s.tags || []).indexOf(_poolSector) >= 0; });
    const tags = AppData.getTags ? AppData.getTags() : [];

    const chipSectors = sectors.map(s => `<span class="chip chip-sec ${_poolSector === s ? 'on' : ''}" data-sector="${escapeHtml(s)}">${escapeHtml(s)}</span>`).join('') || '<span class="empty sm">暂无行业标签</span>';

    // 3 池 Tab
    const tabsHtml = [
      { k: 'all', n: '全部', c: all.length },
      { k: '1', n: '核心池', c: core.length },
      { k: '2', n: '关注池', c: watch.length },
    ].map(t => `<button class="seg-o ${_poolTab===t.k?'on':''}" data-pool-tab="${t.k}">${t.n} <b>${t.c}</b></button>`).join('');

    const statusLabel = { ready:'可买', researching:'研究中', watching:'观察中', paused:'搁置', new:'待研究' };

    // 整卡可点开编辑：目标价/止损/逻辑录入后原来只能删不能改，等于数据只进不出。
    // 编辑/删除图标不再常驻右上角，改由左滑或长按呼出（见 RowAct 模块）。
    const rowHtml = poolRows.map(s => {
      const st = s.researchStatus || 'new';
      const sl = statusLabel[st] || st;
      const poolLabel = s.poolId === '1' ? '核心池' : '关注池';
      const chg = s.changePercent;
      const hasLive = typeof chg === 'number';
      const chgClass = hasLive ? (chg >= 0 ? 'u' : 'd') : '';
      const chgText = hasLive ? (chg >= 0 ? '+' : '') + chg.toFixed(2) + '%' : '';
      const priceText = s.price > 0 ? curSym(s.market) + fmtMoney(s.price) : '—';
      return `
      <div class="pool-card row-sw" data-sw-row="pool" data-row-id="${s.id}" role="button" tabindex="0">
        <div class="sw-in">
          <div class="pool-top">
            <div class="pool-name"><span class="pool-nm-t">${escapeHtml(s.name)}</span><span class="pool-code">${escapeHtml(s.code)}${s.market ? ' · ' + s.market.toUpperCase() : ''} · ${poolLabel}</span></div>
          </div>
          <div class="pool-price">
            <span class="pp-now">${priceText}</span>
            ${hasLive ? `<span class="pp-chg ${chgClass}">${chgText}</span>` : ''}
            <span class="pool-badge st-${st}">${escapeHtml(sl)}</span>
          </div>
          ${(s.targetPrice > 0 || s.stopLossPrice > 0) ? `<div class="pool-meta">${s.targetPrice > 0 ? `<span>目标 ${curSym(s.market)}${fmtMoney(s.targetPrice)}</span>` : ''}${s.stopLossPrice > 0 ? `<span>止损 ${curSym(s.market)}${fmtMoney(s.stopLossPrice)}</span>` : ''}</div>` : ''}
          <div class="pool-thesis">${escapeHtml(s.thesis || s.notes || '') || '—'}</div>
        </div>
        <div class="sw-acts">
          <button class="sw-a sw-edit" data-edit-pool="${s.id}" aria-label="编辑这只自选"><i class="fa-regular fa-pen-to-square"></i><span>编辑</span></button>
          <button class="sw-a sw-del" data-del-pool="${s.id}" aria-label="移除这只自选"><i class="fa-regular fa-trash-can"></i><span>删除</span></button>
        </div>
      </div>`;
    }).join('') || `<div class="card"><div class="empty es"><div class="es-ic"><i class="fa-regular fa-star"></i></div>${
        _poolSector
          ? '<div class="es-t">「' + escapeHtml(_poolSector) + '」下暂无标的</div><div class="es-s">再点一次这个标签就能取消筛选。</div>'
          : '<div class="es-t">自选池是空的</div><div class="es-s">把看中的票先放进来，写下目标和止损，等价格到了再动手。</div><button class="btn-pix btn-brand btn-sm es-act" data-open-add-pool><i class="fa-solid fa-plus"></i> 加自选</button>'
      }</div></div>`;

    return `
    <section class="pg">
      <div class="pg-head">
        <h1>股票池</h1>
        <div class="pg-actions">
          <button class="icon-btn" data-refresh-prices title="刷新行情"><i class="fa-solid fa-arrows-rotate"></i></button>
          <button class="btn-pix btn-ghost btn-sm" data-open-batch-pool>批量</button>
          <button class="btn-pix btn-brand btn-sm" data-open-add-pool><i class="fa-solid fa-plus"></i> 加自选</button>
        </div>
      </div>

      <div class="sum-row">
        <div class="sum-box">
          <div class="sb-k">观察中</div>
          <div class="sb-v">${watching.length}</div>
          <div class="sb-s">重点跟踪</div>
        </div>
        <div class="sum-box">
          <div class="sb-k">全部标的</div>
          <div class="sb-v">${all.length}</div>
          <div class="sb-s">入库标的</div>
        </div>
        <div class="sum-box">
          <div class="sb-k">覆盖行业</div>
          <div class="sb-v">${sectors.length}</div>
          <div class="sb-s">多元分散</div>
        </div>
      </div>

      <div class="chip-row">${chipSectors}</div>

      <div class="seg">${tabsHtml}</div>
      <div>${rowHtml}</div>
    </section>`;
  };

  /* ----------- 4. AI 分析（3 Tab：诊断 / 对话 / 报告） ----------- */
  var _aiTab = 'diag';
  var _aiChat = [];
  var _aiChatSeq = 0; // 每条消息的稳定 id，用于重试按钮定位

  Pages.ai = function () {
    const d = AppData.dashboardSummary();
    const pos = (d.positions || []).slice().sort((a,b)=>b.floatingPnLPct - a.floatingPnLPct);
    const best = pos[0], worst = pos[pos.length-1];
    const cfg = AppData.getConfig();
    const hasKey = !!(cfg.aiApiKey && cfg.aiApiKey.trim());

    const tabs = [
      { k: 'diag', n: '智能诊断' },
      { k: 'chat', n: 'AI 对话' },
      { k: 'history', n: '报告库' },
    ];
    const tabsHtml = tabs.map(t =>
      '<button class="seg-o ' + (_aiTab===t.k?'on':'') + '" data-ai-tab="' + t.k + '">' + t.n + '</button>'
    ).join('');

    function tabDiag() {
      const fUp = d.floatingPnl >= 0;
      const mUp = d.monthPnl >= 0;
      const violationsN = AppData.getViolations().filter(function (v) { return v.status === 'pending'; }).length;
      const rulesN = AppData.getRules().filter(function(r){return r.enabled}).length;
      const cfgModel = (cfg.aiModel || '默认').split('/').pop();

      const aiKpiHtml = `
        <div class="kpi-grid">
          <div class="kpi">
            <div class="k-k">组合盈亏</div>
            <div class="k-v ${fUp?'u':'d'}">${d.floatingPnl>0?'+':d.floatingPnl<0?'-':''}¥${fmtAmt(d.floatingPnl)}</div>
            <div class="k-s">收益率 ${fUp?'+':''}${d.floatingPnlPct.toFixed(2)}%</div>
          </div>
          <div class="kpi">
            <div class="k-k">持仓概览</div>
            <div class="k-v">${pos.length} 只</div>
            <div class="k-s">${pos.length>0 ? ('最强 '+(best.stockName)+' +'+best.floatingPnLPct.toFixed(2)+'%') : '暂无持仓'}</div>
          </div>
          <div class="kpi">
            <div class="k-k">本月盈亏</div>
            <div class="k-v ${d.monthPnl == null ? '' : mUp?'u':(d.monthPnl===0?'':'d')}">${d.monthPnl == null ? '—' : (d.monthPnl>0?'+':d.monthPnl<0?'-':'') + '¥' + fmtAmt(d.monthPnl)}</div>
            <div class="k-s">${d.monthPnlDetail ? (d.monthPnlDetail.full ? '已兑现＋持仓变化' : '自 ' + d.monthPnlDetail.from.slice(5) + ' 起记录') : '等待有效行情记录'}</div>
          </div>
          <div class="kpi">
            <div class="k-k">纪律 · AI</div>
            <div class="k-v ${violationsN>0?'u':'ok'}">${violationsN>0? violationsN+' 待处理':'纪律 OK'}</div>
            <div class="k-s">${rulesN} 规则 · ${hasKey?cfgModel:'本地模式'}</div>
          </div>
        </div>`;

      // 分析维度 四宫格（配色与首页快捷入口同源，避免 AI 页图标灰扑扑的断层感）
      const dims = [
        { k:'portfolio', icon:'fa-chart-pie',     cls:'qk-blue',   t:'持仓整体体检', s: pos.length + ' 持仓 · 强弱对比' },
        { k:'discipline',icon:'fa-shield-halved', cls:'qk-orange', t:'纪律系统扫描', s: violationsN ? violationsN + ' 条违规待处理' : rulesN + ' 条规则运行中' },
        { k:'trend',     icon:'fa-chart-column',  cls:'qk-purple', t:'近期趋势推演', s:'月度盈亏 · 持仓结构' },
        { k:'risk',      icon:'fa-triangle-exclamation', cls:'qk-red', t:'风险预警雷达', s:'纪律分 ' + d.disciplineScore },
      ];
      const dimsHtml = dims.map(function(c){
        return (
          '<button class="qk ' + c.cls + '" data-ai="' + c.k + '">' +
            '<div class="qk-ic"><i class="fa-solid ' + c.icon + '"></i></div>' +
            '<div class="qk-t">' + c.t + '</div>' +
            '<div class="qk-s">' + c.s + '</div>' +
          '</button>'
        );
      }).join('');

      // 最近心得（最新 3 条，点击直接打开全文）
      const insHtml = AppData.getInsights().slice().sort(function(a,b){
        return String(b.timestamp||'').localeCompare(String(a.timestamp||''));
      }).slice(0,3).map(function(i){
        var moodCls = i.mood==='win' ? 'm-win' : i.mood==='angry' ? 'm-angry' : '';
        return '<div class="ins-mini" data-open-ins="' + i.id + '">' +
          '<div class="ins-mood-ic ' + moodCls + '"><i class="fa-solid ' + (i.mood==='win'?'fa-trophy':i.mood==='angry'?'fa-face-angry':'fa-face-smile') + '"></i></div>' +
          '<div class="ins-mn"><div class="ins-mt">' + escapeHtml(i.title) + '</div>' +
          '<div class="ins-md">' + escapeHtml(String(i.timestamp||'').slice(0,10)) + ' · ' + (i.tags||[]).map(function(t){return '#'+escapeHtml(t);}).join(' ') + '</div></div>' +
          '<i class="fa-solid fa-chevron-right ins-mini-arw"></i>' +
        '</div>';
      }).join('');

      return '' +
      aiKpiHtml +
      '<div class="sec-head"><h3>分析维度</h3><span class="sec-sub">点击运行 · 存报告库</span></div>' +
      '<div class="quick-grid">' + dimsHtml + '</div>' +
      '<div class="sec-head"><h3>最近心得</h3><button class="lnk" data-goto="insights">全部</button></div>' +
      '<div class="card list-card">' + (insHtml || '<div class="empty sm"><i class="fa-regular fa-lightbulb"></i> 还没有心得，写一篇沉淀一下。</div>') + '</div>';
    }

    function tabChat() {
      var msgHtml = _aiChat.map(function(m) {
        // 等待期占位气泡：AI 要几秒才回，原来这段时间整段空白、毫无反馈
        if (m.typing) {
          return '<div class="chat-msg">' +
            '<div class="chat-av"><i class="fa-solid fa-robot"></i></div>' +
            '<div class="chat-bub chat-typing" aria-label="AI 正在思考"><i></i><i></i><i></i></div>' +
          '</div>';
        }
        var isUser = m.role === 'user';
        var body;
        if (isUser) {
          body = escapeHtml(m.content || '').replace(/\n/g, '<br>');
        } else if (m.error) {
          // 错误/超时气泡是纯文本，直接转义，不走 markdown（避免把 ⚠ 等当语法）
          body = escapeHtml(m.content || '').replace(/\n/g, '<br>');
        } else {
          body = simpleMarkdownToHtml(postProcessAiText(m.content || ''));
        }
        // 失败气泡带「重试」按钮，点击复用原槽位重发（解决弱网无法重发的问题）
        var retryBtn = (!isUser && m.error && m.mid)
          ? '<button class="btn-pix btn-ghost btn-sm chat-retry" type="button" data-ai-retry="' + m.mid + '"><i class="fa-solid fa-rotate"></i> 重试</button>'
          : '';
        return '<div class="chat-msg ' + (isUser ? 'user' : '') + '">' +
          '<div class="chat-av"><i class="fa-solid ' + (isUser ? 'fa-user' : 'fa-robot') + '"></i></div>' +
          '<div class="chat-bub">' + body + (retryBtn ? '<div class="chat-retry-wrap">' + retryBtn + '</div>' : '') + '</div>' +
        '</div>';
      }).join('');
      if (!msgHtml) msgHtml = '<div class="chat-empty"><i class="fa-regular fa-comments"></i><p>输入问题开始对话</p><small>AI 会结合你的持仓和交易数据回答</small></div>';

      return '' +
      '<div class="chat-area">' + msgHtml + '</div>' +
      // 未配置 Key 时原来只有一个 disabled 的输入框，用户被卡在这里没有任何出口。
      // 这里给出明确引导按钮：一键跳到设置页的 AI 配置。
      (hasKey ? '' :
        '<div class="chat-nokey">' +
          '<i class="fa-solid fa-key"></i>' +
          '<div class="cnk-t">配置 API Key 后启用对话</div>' +
          '<div class="cnk-s">未配置时，AI 分析会自动降级为本地统计模式</div>' +
          '<button class="btn-pix btn-brand btn-sm" type="button" data-goto-ai-config><i class="fa-solid fa-gear"></i> 去设置配置 Key</button>' +
        '</div>') +
      '<div class="chat-input-row">' +
        '<input type="text" id="chatInput" placeholder="' + (hasKey ? '问 AI 任何问题...' : '配置 API Key 后启用（当前本地模式）') + '"' + (hasKey?'':' disabled') + '>' +
        '<button class="btn-pix btn-brand" data-ai-send' + (hasKey?'':' disabled') + '><i class="fa-solid fa-paper-plane"></i></button>' +
      '</div>';
    }

    function tabHistory() {
      var reports = AppData.getAiReports();
      if (!reports.length) return '<div class="card"><div class="empty"><i class="fa-regular fa-folder-open"></i>还没有 AI 报告，运行诊断后自动保存。</div></div>';
      return '<div class="rpt-list">' + reports.map(function(r) {
        var fullText = stripHtmlToText(r.html);
        var summary = escapeHtml(fullText.slice(0, 120));
        if (fullText.length > 120) summary += '…';
        return '<div class="report-card" data-open-report="' + r.id + '">' +
          '<div class="rpt-head">' +
            '<span class="rpt-type">' + escapeHtml(r.title) + (r.source === 'local' ? ' · 本地统计' : r.source === 'ai' ? ' · AI 生成' : ' · 来源未标记') + '</span>' +
            '<span class="rpt-date">' + AppData.isoDate(r.timestamp) + '</span>' +
          '</div>' +
          '<div class="rpt-body">' + (summary || '暂无摘要') + '</div>' +
          '<div class="rpt-foot">' +
            '<button class="btn-pix btn-ghost btn-sm" data-del-report="' + r.id + '"><i class="fa-regular fa-trash-can"></i> 删除</button>' +
          '</div>' +
        '</div>';
      }).join('') + '</div>';
    }

    var content = _aiTab === 'chat' ? tabChat() : _aiTab === 'history' ? tabHistory() : tabDiag();
    var isChat = _aiTab === 'chat';
    return '' +
    '<section class="pg ' + (isChat ? 'pg-chat' : '') + '">' +
      '<div class="pg-head">' +
        '<h1>AI 分析</h1>' +
        '<span class="pg-mode">' + (hasKey ? (cfg.aiModel || '').split('/').pop() : '本地模式') + '</span>' +
      '</div>' +
      '<div class="seg">' + tabsHtml + '</div>' +
      '<div class="' + (isChat ? 'chat-wrap-outer' : '') + '">' + content + '</div>' +
    '</section>';
  };
  /* ----------- 5. 设置（4 Tab：资料 / AI / 数据 / 关于） ----------- */
  var _settingsTab = 'profile';
  Pages.settings = function () {
    var active = _settingsTab;
    var cfg = AppData.getConfig();
    var nickname = cfg.nickname || '交易者';
    var aiKey = cfg.aiApiKey ? cfg.aiApiKey.slice(0, 6) + '••••••••' : '未配置';
    var aiUrl = cfg.aiApiUrl || '';
    var aiModel = cfg.aiModel || '';

    function tab(id, label) {
      return '<button class="seg-o ' + (active === id ? 'on' : '') + '" data-sw-tab="settings" data-tab="' + id + '">' + label + '</button>';
    }

    // ---- Tab 1: 个人资料 ----
    function tabProfile() {
      var pendingVioN = AppData.getViolations().filter(function (v) { return v.status === 'pending'; }).length;
      return '' +
      '<div class="card me-card">' +
        '<div class="me-top">' +
          '<div class="me-ava">' +
            '<i class="fa-solid fa-user"></i>' +
          '</div>' +
          '<div class="me-m">' +
            '<div class="me-name-line">' +
              '<span class="me-name">默认用户</span>' +
              '<button class="me-profile-btn" data-goto="profile" disabled title="账号系统上线后可用">个人资料</button>' +
            '</div>' +
            '<div class="me-hint">账号系统上线后可编辑详细资料</div>' +
          '</div>' +
        '</div>' +
        '<div class="me-stats">' +
          '<button type="button" data-goto="trades"><b>' + AppData.getTrades().length + '</b><small>交易</small></button>' +
          '<button type="button" data-goto="pool"><b>' + AppData.getStockPool().length + '</b><small>自选</small></button>' +
          '<button type="button" data-goto="insights"><b>' + AppData.getInsights().length + '</b><small>心得</small></button>' +
        '</div>' +
      '</div>' +

      // 账号与安全：1.0 里这 4 项全是 disabled 灰按钮，占了大半屏，
      // 用户读出来的是"这 APP 一半功能是坏的"。收成一行说明 + 版本角标。
      '<div class="sec-head"><h3>账号与安全</h3><span class="sec-sub">1.1 上线</span></div>' +
      '<div class="card list-card">' +
        '<div class="set-row">' +
          '<div class="set-ic"><i class="fa-solid fa-user-shield"></i></div>' +
          '<div class="set-m"><div class="set-t">账号系统</div><div class="set-s">手机号 · 邮箱 · 密码 · 登录设备，随 1.1 一并开放</div></div>' +
          '<span class="ver-tag">1.1</span>' +
        '</div>' +
      '</div>' +

      '<div class="sec-head"><h3>快捷入口</h3></div>' +
      '<div class="card list-card">' +
        '<button class="set-row" data-goto="discipline">' +
          '<div class="set-ic"><i class="fa-solid fa-shield-halved"></i></div>' +
          '<div class="set-m"><div class="set-t">纪律系统</div><div class="set-s">' + pendingVioN + ' 违规待处理 · ' + AppData.getRules().filter(function(r){return r.enabled;}).length + ' 规则启用</div></div>' +
          '<i class="fa-solid fa-chevron-right chev"></i></button>' +
        '<button class="set-row" data-goto="insights">' +
          '<div class="set-ic"><i class="fa-regular fa-lightbulb"></i></div>' +
          '<div class="set-m"><div class="set-t">交易心得</div><div class="set-s">共 ' + AppData.getInsights().length + ' 篇</div></div>' +
          '<i class="fa-solid fa-chevron-right chev"></i></button>' +
        '<button class="set-row" data-goto="notices">' +
          '<div class="set-ic"><i class="fa-regular fa-bell"></i></div>' +
          '<div class="set-m"><div class="set-t">消息中心</div><div class="set-s">' + (pendingVioN > 0 ? pendingVioN + ' 条待处理' : '全部已读') + '</div></div>' +
          '<i class="fa-solid fa-chevron-right chev"></i></button>' +
      '</div>' +

      '<div class="sec-head"><h3>交互偏好</h3></div>' +
      '<div class="card list-card">' +
        '<div class="set-row">' +
          '<div class="set-ic"><i class="fa-solid fa-wave-square"></i></div>' +
          '<div class="set-m"><div class="set-t">触感反馈</div><div class="set-s">切换开关、确认操作时轻微振动</div></div>' +
          '<label class="sw ' + (cfg.haptic !== false ? 'on' : '') + '" data-sw-haptic><i></i></label>' +
        '</div>' +
      '</div>';
    }


    // ---- Tab 2: 通知 ----
    function tabNotif() {
      var notif = (cfg.notif || {});
      var items = [
        { k:'prefMkt',  i:'fa-sun',           t:'盘前提醒 09:15',          sub:'交易日推送当日关注股票池', v: notif.prefMkt !== false },
        { k:'postMkt',  i:'fa-moon',          t:'复盘提醒 15:15',          sub:'收市后推送今日盈亏摘要',   v: notif.postMkt !== false },
        { k:'weekRv',   i:'fa-calendar-week', t:'每周日 20:00 周检视',     sub:'本周回顾 + 下周计划',      v: notif.weekRv !== false },
        { k:'violPush', i:'fa-shield-halved', t:'纪律违规即时推送',        sub:'交易触发规则时立即提醒',   v: notif.violPush !== false },
      ];
      var rows = items.map(function(it) {
        return '<div class="set-row">' +
          '<div class="set-ic"><i class="fa-solid ' + it.i + '"></i></div>' +
          '<div class="set-m"><div class="set-t">' + it.t + '</div><div class="set-s">' + it.sub + '</div></div>' +
          '<label class="sw ' + (it.v?'on':'') + '" data-sw-notif="' + it.k + '"><i></i></label>' +
        '</div>';
      }).join('');
      return '' +
      '<div class="card">' +
        '<div class="notif-hero">' +
          '<div class="notif-ico"><i class="fa-solid fa-bell"></i></div>' +
          '<div><b>本地通知</b><small>无需服务器，离线也能到点响</small></div>' +
        '</div>' +
        '<div class="notif-btns">' +
          '<button class="btn-pix btn-brand btn-sm" data-notif-perm>检查权限</button>' +
          '<button class="btn-pix btn-ghost btn-sm" data-notif-test>测试通知</button>' +
          '<button class="btn-pix btn-ghost btn-sm" data-notif-schedule>应用日程</button>' +
        '</div>' +
      '</div>' +
      '<div class="sec-head"><h3>日程配置</h3></div>' +
      '<div class="card list-card">' + rows + '</div>' +
      '<div class="empty sm"><i class="fa-solid fa-circle-info"></i> 手机首次打开时允许通知，建议把本 APP 加入「电池/省电白名单」，防止被杀后台。</div>';
    }

    // ---- Tab 3: AI 配置 ----
    function tabAi() {
      var hasKey = !!cfg.aiApiKey;
      return '' +
      '<div class="card">' +
        // Key 回显必须 escapeHtml：原实现把原始 Key 拼进属性，值里带引号会截断属性、带标签会注入。
        '<div class="form-row"><label>API KEY</label>' +
          '<div class="key-wrap">' +
            '<input type="password" id="aiKeyInput" placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx" value="' + escapeHtml(cfg.aiApiKey || '') + '">' +
            '<button class="key-eye" type="button" data-toggle-key aria-label="显示/隐藏 Key"><i class="fa-regular fa-eye"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="empty sm"><i class="fa-solid fa-shield-halved"></i> Key 明文保存在本机 localStorage（纯前端 APP 无法安全存储）。导出备份时不会包含 Key，请勿把备份文件发给他人。</div>' +
        '<div class="form-row"><label>API URL</label>' +
          '<input type="text" id="aiUrlInput" value="' + escapeHtml(aiUrl) + '" placeholder="https://api.minimax.cn/v1/chat/completions">' +
        '</div>' +
        '<div class="form-row"><label for="aiModelInput">模型 ID</label>' +
          '<input type="text" id="aiModelInput" value="' + escapeHtml(aiModel) + '" placeholder="填写服务商提供的模型 ID" autocomplete="off" autocapitalize="none" spellcheck="false">' +
        '</div>' +
        '<div class="form-row"><button class="btn-pix btn-brand full" data-set-ai>保存 AI 配置</button></div>' +
        '<div class="form-row tight"><button class="btn-pix btn-ghost full" data-test-ai>测试连接</button></div>' +
      '</div>' +
      '<div class="foot-txt">连接状态：' + (hasKey ? '<span class="st-ok">● 已配置</span>' : '○ 未配置') + ' · 密钥仅存在本机</div>';
    }

    // ---- Tab 4: 数据管理 ----
    function tabData() {
      var fx = (typeof AppMarket !== 'undefined' && AppMarket.getFxRates) ? AppMarket.getFxRates() : null;
      var fxTime = fx && fx.updatedAt ? new Date(fx.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '';
      var fxLine = fx
        ? '1 美元 = ¥' + fx.USD.toFixed(4) + ' · 1 港币 = ¥' + fx.HKD.toFixed(4) +
          (fx.fallback ? '<br>⚠ 当前为离线兜底汇率，联网后自动更新' : '<br>更新于 ' + fxTime)
        : '汇率模块不可用';
      return '' +
      '<div class="sec-head"><h3>行情刷新</h3></div>' +
      '<div class="card"><div class="form-row"><label for="quoteRefreshMinutes">自动刷新间隔</label>' +
        '<select id="quoteRefreshMinutes"><option value="5"' + (AppData.getConfig().quoteRefreshMinutes === 5 ? ' selected' : '') + '>5 分钟</option><option value="10"' + (AppData.getConfig().quoteRefreshMinutes === 10 ? ' selected' : '') + '>10 分钟</option></select></div>' +
        '<div class="foot-txt">打开 APP 时立即刷新；保持打开或回到前台后，按此间隔刷新持仓与自选。</div></div>' +
      '<div class="sec-head"><h3>汇率（人民币折算）</h3></div>' +
      '<div class="card">' +
        '<div class="form-row"><label>最新汇率</label><div class="form-val" id="fxLine">' + fxLine + '</div></div>' +
        '<div class="form-row"><button class="btn-pix btn-ghost full" data-refresh-fx><i class="fa-solid fa-rotate"></i> 刷新汇率</button></div>' +
        '<div class="foot-txt">来源 open.er-api.com · 本地缓存 6 小时 · 首页/记录/持仓汇总均按此折算为人民币</div>' +
      '</div>' +

      '<div class="sec-head"><h3>数据备份</h3></div>' +
      '<div class="card">' +
        '<div class="form-row"><label>全量导出</label>' +
          '<div class="foot-txt">导出 trades / pool / rules / violations / insights 到一个 JSON 文件，可跨设备导入。</div>' +
        '</div>' +
        '<div class="form-row"><button class="btn-pix btn-brand full" data-export-all><i class="fa-solid fa-download"></i> 导出全部数据（JSON）</button></div>' +
        '<div class="form-row"><label>CSV · 交易记录</label>' +
          '<div class="foot-txt">只导出 trades 为 CSV，Excel 可直接打开。</div>' +
        '</div>' +
        '<div class="form-row"><button class="btn-pix btn-ghost full" data-export-csv><i class="fa-solid fa-file-csv"></i> 导出交易记录（CSV）</button></div>' +
      '</div>' +

      '<div class="sec-head"><h3>数据恢复</h3></div>' +
      '<div class="card">' +
        '<div class="form-row"><label>从 JSON 全量导入</label>' +
          '<div class="foot-txt">覆盖当前所有数据。导入前建议先「导出全部」备份。</div>' +
        '</div>' +
        '<div class="form-row"><button class="btn-pix btn-ghost full" data-import-json><i class="fa-solid fa-upload"></i> 从 JSON 文件导入</button></div>' +
        '<input type="file" id="importJsonFile" accept="application/json" class="file-hidden">' +
        '<div class="form-row"><label>从 CSV 导入交易</label>' +
          '<div class="foot-txt">CSV 表头：stockCode,stockName,market,type,quantity,price,timestamp（market 可省略，自动按代码识别）</div>' +
        '</div>' +
        '<div class="form-row"><button class="btn-pix btn-ghost full" data-import-csv><i class="fa-solid fa-table"></i> 从 CSV 文件导入交易</button></div>' +
        '<input type="file" id="importCsvFile" accept=".csv,text/csv" class="file-hidden">' +
      '</div>' +

      '<div class="sec-head"><h3>危险操作</h3></div>' +
      '<div class="card">' +
        '<div class="form-row"><label>一键重置</label>' +
          '<div class="foot-txt">清空所有自定义数据并恢复 seed。AI API Key 会保留。</div>' +
        '</div>' +
        '<div class="form-row"><button class="btn-pix danger full" data-reset-all>一键重置</button></div>' +
      '</div>' +

      '<div class="foot-txt">数据均存在浏览器 localStorage · app_ 前缀</div>';
    }

    // ---- Tab 5: 关于 ----
    function tabAbout() {
      return '' +
      '<div class="sec-head"><h3>版本信息</h3></div>' +
      '<div class="card">' +
        '<div class="form-row"><label>APP 版本</label><div><span class="ver-tag">v' + APP_VERSION + ' · iOS Style</span></div></div>' +
        '<div class="form-row"><label>构建日期</label><div class="form-val">' + new Date().toISOString().slice(0, 10) + '</div></div>' +
        '<div class="form-row"><label>配色体系</label><div class="form-val">涨 ' + CH.up + ' · 跌 ' + CH.down + ' · 主蓝 ' + CH.blue + '</div></div>' +
        '<div class="form-row nobd"><label>技术栈</label><div class="form-val">纯静态 HTML/CSS/JS · 零构建</div></div>' +
      '</div>' +

      '<div class="sec-head"><h3>隐私说明</h3></div>' +
      '<div class="card">' +
        '<div class="foot-txt left">账本数据保存在本机。使用 AI 对话、诊断或规则解析时，本次分析所需的持仓、交易、规则和心得会发送到你配置的 AI 服务；连接测试也会向该服务发送 API Key。导出备份不包含 API Key。</div>' +
      '</div>' +

      '<div class="sec-head"><h3>项目架构</h3></div>' +
      '<div class="card">' +
        '<div class="foot-txt left">双形态项目：Web 版（React 18 + TS + Vite） + APP 原型（本目录，独立工程，与 Web 物理隔离）。Web 版用无前缀 localStorage key，APP 原型用 app_ 前缀，互不干扰。</div>' +
      '</div>' +

      '<div class="foot-txt">投资看板 · 2026</div>';
    }

    var tabBody = active === 'notif' ? tabNotif() :
                  active === 'ai' ? tabAi() :
                  active === 'data' ? tabData() :
                  active === 'about' ? tabAbout() :
                  tabProfile();

    return '' +
    '<section class="pg">' +
      '<div class="pg-head"><h1>设置</h1></div>' +
      '<div class="seg">' +
        tab('profile', '资料') +
        tab('notif', '通知') +
        tab('ai', 'AI') +
        tab('data', '数据') +
        tab('about', '关于') +
      '</div>' +
      '<div>' + tabBody + '</div>' +
    '</section>';
  };

  /* ----------- 6. 交易心得 ----------- */
  /* ----------- 6. 交易心得（标签云 + 搜索 + 排序） ----------- */
  var _insSearch = '';
  var _insTagFilter = '';
  var _insSort = 'new';

  /* 心得列表：标签筛选 + 关键词搜索 + 排序。
     抽成独立函数是为了搜索时能「只重绘列表容器」——原来搜索后走整页 render()，
     会把输入框本身一起重建，中文输入法打到一半被中断、光标丢失。 */
  function insightListHtml() {
    const all = AppData.getInsights();
    const moodMap = {
      win:   { i: 'fa-trophy',     t: 'WIN',  cls: 'm-win' },
      calm:  { i: 'fa-face-smile', t: 'CALM', cls: 'm-calm' },
      angry: { i: 'fa-face-angry', t: 'BAD',  cls: 'm-angry' },
    };
    var filtered = all.filter(function(i) {
      if (_insTagFilter && (i.tags||[]).indexOf(_insTagFilter) < 0) return false;
      if (_insSearch) {
        var q = _insSearch.toLowerCase();
        var title = String(i.title||'').toLowerCase();
        var content = String(i.content||'').toLowerCase();
        var tags = (i.tags||[]).join(' ').toLowerCase();
        if (title.indexOf(q) < 0 && content.indexOf(q) < 0 && tags.indexOf(q) < 0) return false;
      }
      return true;
    });
    if (_insSort === 'old') {
      filtered.sort(function(a,b) { return String(a.timestamp||'').localeCompare(String(b.timestamp||'')); });
    } else {
      filtered.sort(function(a,b) { return String(b.timestamp||'').localeCompare(String(a.timestamp||'')); });
    }
    var rows = filtered.map(function(i) {
      var m = moodMap[i.mood] || moodMap.calm;
      var tags = (i.tags||[]).map(function(t) { return '<span class="tg">#' + escapeHtml(t) + '</span>'; }).join('');
      var content = String(i.content||'');
      var isLong = content.length > 60 || content.indexOf('\n') >= 0;
      return '' +
      '<div class="ins-card" data-open-ins="' + i.id + '">' +
        '<div class="ins-top">' +
          '<span class="ins-mood ' + m.cls + '"><i class="fa-solid ' + m.i + '"></i> ' + m.t + '</span>' +
          '<span class="ins-date"><i class="fa-regular fa-calendar"></i> ' + AppData.isoDate(i.timestamp) + '</span>' +
          '<button class="ins-del" data-del-ins="' + i.id + '"><i class="fa-regular fa-trash-can"></i></button>' +
        '</div>' +
        '<div class="ins-title">' + escapeHtml(i.title||'') + '</div>' +
        '<div class="ins-content ins-clamp">' + escapeHtml(content) + '</div>' +
        (isLong ? '<div class="ins-more">展开全文 <i class="fa-solid fa-chevron-right"></i></div>' : '') +
        (tags ? '<div class="ins-tags">' + tags + '</div>' : '') +
      '</div>';
    }).join('') || '<div class="empty"><i class="fa-regular fa-pen-to-square"></i>' + (all.length ? '没有匹配的心得，换个关键词试试。' : '还没写心得，记录一次错误 = 下一次盈利。') + '</div>';
    return { html: rows, count: filtered.length, total: all.length };
  }

  Pages.insights = function () {
    const all = AppData.getInsights();
    const moodMap = {
      win:   { i: 'fa-trophy',     t: 'WIN',  cls: 'm-win' },
      calm:  { i: 'fa-face-smile', t: 'CALM', cls: 'm-calm' },
      angry: { i: 'fa-face-angry', t: 'BAD',  cls: 'm-angry' },
    };

    // 收集所有标签 + 计数
    var tagMap = {};
    all.forEach(function(i) { (i.tags||[]).forEach(function(t) { tagMap[t] = (tagMap[t]||0)+1; }); });
    var tagCloud = Object.keys(tagMap).sort(function(a,b){ return tagMap[b]-tagMap[a]; }).map(function(t) {
      var active = _insTagFilter === t;
      return '<button class="tag-cloud' + (active?' on':'') + '" data-tag-filter="' + escapeHtml(t) + '">#' + escapeHtml(t) + ' <b>' + tagMap[t] + '</b></button>';
    }).join('') || '<span class="empty sm">暂无标签</span>';

    // 过滤 + 排序（见 insightListHtml）
    var list = insightListHtml();

    var sortBtns = [
      { k: 'new', n: '最新' },
      { k: 'old', n: '最早' },
    ].map(function(s) {
      return '<button class="seg-o ' + (_insSort===s.k?'on':'') + '" data-ins-sort="' + s.k + '">' + s.n + '</button>';
    }).join('');

    return '' +
    '<section class="pg">' +
      '<div class="pg-head">' +
        '<h1>心得</h1>' +
        '<div class="pg-actions">' +
          '<button class="btn-pix btn-brand btn-sm" data-open-add-ins><i class="fa-solid fa-plus"></i> 写心得</button>' +
        '</div>' +
      '</div>' +

      '<div class="sum-row">' +
        '<div class="sum-box"><div class="sb-k">总篇数</div><div class="sb-v">' + all.length + '</div><div class="sb-s">持续沉淀</div></div>' +
        '<div class="sum-box"><div class="sb-k">当前筛选</div><div class="sb-v" id="insCount">' + list.count + '</div><div class="sb-s">' + (_insTagFilter || _insSearch ? '已过滤' : '全部') + '</div></div>' +
        '<div class="sum-box"><div class="sb-k">标签数</div><div class="sb-v">' + Object.keys(tagMap).length + '</div><div class="sb-s">分类覆盖</div></div>' +
      '</div>' +

      '<div class="sec-head"><h3>标签云</h3>' +
        (_insTagFilter ? '<button class="lnk" data-tag-clear>清除筛选 ×</button>' : '') +
      '</div>' +
      '<div class="tag-row">' + tagCloud + '</div>' +

      '<div class="search-row">' +
        '<div class="search-box">' +
          '<i class="fa-solid fa-magnifying-glass"></i>' +
          '<input type="text" id="insSearchInput" placeholder="搜索标题、内容、标签..." value="' + escapeHtml(_insSearch) + '">' +
          (_insSearch ? '<button class="search-clear" data-search-clear><i class="fa-solid fa-xmark"></i></button>' : '') +
        '</div>' +
        '<div class="seg search-sort">' + sortBtns + '</div>' +
      '</div>' +

      '<div id="insList">' + list.html + '</div>' +
    '</section>';
  };
  /* ----------- 7. 纪律系统 ----------- */
  Pages.discipline = function () {
    const rules = AppData.getRules();
    const vios = AppData.getViolations();
    const enabledN = rules.filter(function(r){return r.enabled;}).length;
    const errN = vios.filter(function(v){return v.severity==='error';}).length;
    const warnN = vios.filter(function(v){return v.severity==='warning';}).length;
    // 纪律健康度 = 真实守规率：近 30 天 违规次数 ÷ 交易笔数（零交易视为 100%）
    const NOW30 = Date.now() - 30 * 24 * 3600 * 1000;
    const ts = (x) => new Date(x || 0).getTime() || 0;
    const trades30 = AppData.getTrades().filter(function(t){ return ts(t.timestamp) >= NOW30; }).length;
    const vios30 = vios.filter(function(v){ return ts(v.timestamp) >= NOW30; }).length;
    const pct = trades30 > 0 ? Math.max(0, Math.round((1 - vios30 / trades30) * 100)) : 100;

    // 违规 BarChart 数据
    var vioData = (typeof AppDiscipline !== 'undefined')
      ? AppDiscipline.violationStats(vios, AppData.getTrades())
      : [];
    // 无数据时（新装 / 清空后）柱状图会渲染成 6 根 0 柱，和「零违规」长得一样，
    // 用户无法区分「我很守纪律」还是「压根没数据」。这里直接给空状态。
    var vioHasData = vioData.some(function (s) { return (Number(s.compliant) || 0) + (Number(s.violated) || 0) > 0; });
    // 近 30 天无交易时，合规率 100% 是「没有样本」而不是「全部合规」，显示 — 更诚实
    var pctText = trades30 > 0 ? pct + '%' : '—';
    var pctRing = trades30 > 0 ? pct : 0;

    const sevLabel = { high: '高危', medium: '常规', low: '提示' };

    const ruleHtml = rules.map(function(r) {
      return '' +
      '<div class="rule-row" data-edit-rule="' + r.id + '">' +
        '<span class="lv lv-' + r.severity + '">' + (sevLabel[r.severity] || r.severity) + '</span>' +
        '<div class="rule-m">' +
          '<div class="rule-name">' + escapeHtml(r.name) + '</div>' +
          '<div class="rule-desc">' + escapeHtml(r.description || '') + '</div>' +
        '</div>' +
        '<label class="sw ' + (r.enabled?'on':'') + '" data-sw-rule="' + r.id + '"><i></i></label>' +
      '</div>';
    }).join('') || '<div class="empty es"><div class="es-ic"><i class="fa-regular fa-shield-halved"></i></div>' +
        '<div class="es-t">还没有纪律规则</div>' +
        '<div class="es-s">纪律规则是「提前写好的刹车」，写下来才会在你上头时拦住你。</div>' +
        '<button class="btn-pix btn-brand btn-sm es-act" data-open-template-rule><i class="fa-solid fa-box-archive"></i> 从模板库挑一条</button>' +
      '</div>';

    const pendingVioN = vios.filter(function(v){ return v.status !== 'resolved'; }).length;
    const vioHtml = vios.map(function(v) {
      var isErr = v.severity === 'error';
      var isPending = v.status !== 'resolved';
      var stLabel = v.status === 'resolved' ? '已处理' : v.status === 'pending' ? '待处理' : v.status;
      var stCls = v.status === 'pending' ? ' pending' : '';
      return '' +
      '<div class="vio-row row-sw" data-sw-row="vio" data-row-id="' + v.id + '">' +
        '<div class="sw-in">' +
          '<div class="vio-ic' + (isErr ? '' : ' warn') + '"><i class="fa-solid fa-triangle-exclamation"></i></div>' +
          '<div class="vio-m">' +
            '<div class="vio-t">' + escapeHtml(v.ruleName || '规则已删除') + '</div>' +
            '<div class="vio-d">' + AppData.isoDate(v.timestamp) + ' · ' + escapeHtml(v.description || '') + '</div>' +
          '</div>' +
          '<span class="vio-st' + stCls + '">' + stLabel + '</span>' +
        '</div>' +
        '<div class="sw-acts">' +
          (isPending ? '<button class="sw-a sw-done" data-resolve-violation="' + v.id + '" aria-label="标记已处理"><i class="fa-solid fa-check"></i><span>标为已处理</span></button>' : '') +
          '<button class="sw-a sw-del" data-del-violation="' + v.id + '" aria-label="删除这条违规记录"><i class="fa-regular fa-trash-can"></i><span>删除</span></button>' +
        '</div>' +
      '</div>';
    }).join('') || '<div class="empty sm"><i class="fa-solid fa-circle-check"></i> 零违规 —— 纪律正在生效，保持住。</div>';

    return '' +
    '<section class="pg">' +
      '<div class="pg-head">' +
        '<h1>纪律</h1>' +
        '<div class="pg-actions">' +
          '<button class="btn-pix btn-ghost btn-sm" data-open-template-rule><i class="fa-solid fa-box-archive"></i> 模板库</button>' +
          '<button class="btn-pix btn-brand btn-sm" data-open-add-rule><i class="fa-solid fa-plus"></i> 加规则</button>' +
        '</div>' +
      '</div>' +

      '<div class="card dhero">' +
        '<div class="dh-ring' + (trades30 === 0 ? ' is-empty' : '') + '">' +
          '<svg viewBox="0 0 92 92" width="92" height="92">' +
            '<circle cx="46" cy="46" r="40" stroke="#F0F0F3" stroke-width="8" fill="none"/>' +
            '<circle cx="46" cy="46" r="40" stroke="' + (trades30 === 0 ? '#E5E5EA' : CH.blue) + '" stroke-width="8" fill="none"' +
              ' stroke-dasharray="' + (pctRing / 100 * 251.3).toFixed(1) + ' 251.3"' +
              ' stroke-linecap="round"/>' +
          '</svg>' +
          '<div class="dh-pct">' + pctText + '</div>' +
        '</div>' +
        // I4：近 30 天没有任何交易时，环是空的、百分号是「—」，
        // 光靠它用户分不清「我很守纪律」还是「压根没数据」。直接换成引导态。
        (trades30 === 0
          ? '<div class="dh-m">' +
              '<div class="dh-t">还没有纪律分</div>' +
              '<div class="dh-line">记下第一笔交易，系统就会按你的规则自动打分。</div>' +
              '<button class="btn-pix btn-brand btn-sm dh-act" data-open-add-trade><i class="fa-solid fa-plus"></i> 记第一笔</button>' +
            '</div>'
          : '<div class="dh-m">' +
              '<div class="dh-t">纪律健康度</div>' +
              '<div class="dh-line">近30天 交易 <b>' + trades30 + '</b> 笔 · 违规 <b>' + vios30 + '</b> 次</div>' +
              '<div class="dh-line">启用规则 <b>' + enabledN + '/' + rules.length + '</b> · 累计严重 <b class="c-up">' + errN + '</b> / 警告 <b class="c-warn">' + warnN + '</b></div>' +
            '</div>') +
      '</div>' +

      '<div class="sec-head"><h3>6 个月合规概览</h3><span class="sec-sub">蓝:笔数 · 红:违规</span></div>' +
      (vioHasData
        ? '<div class="card chart-card">' +
            '<div class="chart-box tall"><canvas id="vioBarChart"></canvas></div>' +
          '</div>'
        : '<div class="card"><div class="empty"><i class="fa-regular fa-chart-bar"></i>近 6 个月还没有交易记录，暂无合规数据。</div></div>') +

      '<div class="sec-head"><h3>规则库</h3><span class="sec-sub">' + rules.length + ' 条</span></div>' +
      '<div class="card list-card">' + ruleHtml + '</div>' +

      '<div class="sec-head"><h3>违规台账</h3>' +
        (pendingVioN > 0
          ? '<button class="btn-pix btn-ghost btn-sm" data-resolve-all-violations>全部处理 ' + pendingVioN + '</button>'
          : '<span class="sec-sub">' + vios.length + ' 条</span>') +
      '</div>' +
      '<div class="card list-card">' + vioHtml + '</div>' +
    '</section>';
  };

  /* ----------- 8. 消息中心（违规消息收件箱：只读列表 + 跳纪律页处理） ----------- */
  Pages.notices = function () {
    function fmtTs(ts) {
      var d = new Date(ts);
      if (isNaN(d)) return '';
      function p(n) { return (n < 10 ? '0' : '') + n; }
      return (d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
    }
    var vios = AppData.getViolations().slice().sort(function (a, b) {
      return new Date(b.timestamp) - new Date(a.timestamp);
    });
    var pendingN = vios.filter(function (v) { return v.status === 'pending'; }).length;

    var rows = vios.map(function (v) {
      var isErr = v.severity === 'error';
      var isInfo = v.severity === 'info';
      var stLabel = v.status === 'resolved' ? '已处理' : v.status === 'pending' ? '待处理' : (v.status || '—');
      var stCls = v.status === 'pending' ? ' pending' : '';
      return '' +
      '<div class="vio-row">' +
        '<div class="vio-ic' + (isErr ? '' : isInfo ? ' info' : ' warn') + '"><i class="fa-solid ' + (isInfo ? 'fa-circle-info' : 'fa-triangle-exclamation') + '"></i></div>' +
        '<div class="vio-m">' +
          '<div class="vio-t">' + escapeHtml(v.ruleName || '系统消息') + '</div>' +
          '<div class="vio-d">' + fmtTs(v.timestamp) + ' · ' + escapeHtml(v.description || '') + '</div>' +
        '</div>' +
        '<span class="vio-st' + stCls + '">' + stLabel + '</span>' +
      '</div>';
    }).join('') || '<div class="empty"><i class="fa-regular fa-bell"></i>暂无消息。纪律违规触发、警报提醒会汇总到这里。</div>';

    return '' +
    '<section class="pg">' +
      '<div class="pg-head">' +
        '<h1>消息</h1>' +
        (pendingN > 0
          ? '<div class="pg-actions"><button class="btn-pix btn-brand btn-sm" data-goto="discipline">去处理 ' + pendingN + ' 条</button></div>'
          : '') +
      '</div>' +
      '<div class="card list-card">' + rows + '</div>' +
      '<div class="foot-txt">消息来自纪律违规触发记录，处理状态与「纪律」页实时同步</div>' +
    '</section>';
  };

  /* ---- 纪律规则模板库 ---- */
  var RULE_TEMPLATES = [
    { name: '单票仓位上限 30%', description: '单只股票仓位不超过总资产 30%，防止过度集中。',
      type: 'volume', parameter: 'positionRatio', operator: 'greater', value: 0.3, severity: 'high' },
    { name: '单票浮亏硬止损 8%', description: '持仓浮亏达 -8% 无条件减仓或清仓。',
      type: 'loss', parameter: 'positionLossRatio', operator: 'greater', value: 0.08, severity: 'high' },
    { name: '日亏损上限 ¥5000', description: '当日已实现亏损超过 5000 元停止交易。',
      type: 'loss', operator: 'greater', value: 5000, severity: 'high' },
    { name: '日盈利止盈 ¥10000', description: '当日盈利超过 10000 元不再开新仓。',
      type: 'profit', operator: 'greater', value: 10000, severity: 'medium' },
    { name: '周交易不超 5 笔', description: '每周交易超过 5 笔必须写检讨心得。',
      type: 'volume', parameter: 'weeklyTradeCount', operator: 'greater', value: 5, severity: 'medium' },
    { name: '尾盘禁开仓 14:50', description: '14:50 后不开新仓，避免尾盘冲动。',
      type: 'time', operator: 'greater_equal', value: 14, severity: 'medium' },
    { name: '单笔金额上限 ¥10万', description: '单笔交易金额不超过 10 万元。',
      type: 'price', operator: 'greater', value: 100000, severity: 'medium' },
    { name: '日内涨跌 5% 不追', description: '日内涨跌幅超过 5% 禁止追涨杀跌。',
      type: 'price', parameter: 'intradayChangePct', operator: 'greater', value: 5, severity: 'medium' },
  ];

  /* ======================================================
   * 自然语言规则解析辅助函数
   * ====================================================== */
  function stripMarkdownJson(s) {
    s = String(s || '').trim();
    // 过滤推理模型输出的思考过程（<think>...</think>，含未闭合兜底）
    s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
    s = s.replace(/<think\b[^>]*>[\s\S]*/gi, '');
    if (s.indexOf('```') === 0) {
      s = s.replace(/^```[^\n]*\n?/, '').replace(/\n?```$/, '').trim();
    }
    return s;
  }
  // 从混杂文本中提取第一个完整 JSON 对象（括号配对，容忍字符串内花括号）
  function extractFirstJson(s) {
    s = String(s || '');
    var start = s.indexOf('{');
    if (start < 0) return null;
    var depth = 0, inStr = false, esc = false;
    for (var i = start; i < s.length; i++) {
      var ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return s.slice(start, i + 1); }
      }
    }
    return null;
  }
  // 修复被 max_tokens 截断的 JSON：去掉残缺片段，补齐未闭合的引号和 { [ 括号
  function repairTruncatedJson(s) {
    s = String(s || '').trim();
    if (!s) return null;
    var inStr = false, esc = false, stack = [], strStart = -1, i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') { inStr = false; strStart = -1; }
      } else {
        if (ch === '"') { inStr = true; strStart = i; }
        else if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') stack.pop();
      }
    }
    if (inStr && strStart > 0) {
      // 未闭合字符串：前面是冒号 → 是被截断的 value，补引号；否则是残缺 key，连同前面的逗号删掉
      var before = s.slice(0, strStart).replace(/\s+$/, '');
      if (before.charAt(before.length - 1) === ':') s = s + '"';
      else s = before.replace(/,\s*$/, '');
    }
    s = s.replace(/[\s,:]+$/, '');
    // 重新扫描未闭合括号并补齐
    stack = []; inStr = false; esc = false;
    for (i = 0; i < s.length; i++) {
      ch = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else {
        if (ch === '"') inStr = true;
        else if (ch === '{' || ch === '[') stack.push(ch);
        else if (ch === '}' || ch === ']') stack.pop();
      }
    }
    var out = s + (inStr ? '"' : '');
    for (var k = stack.length - 1; k >= 0; k--) out += stack[k] === '{' ? '}' : ']';
    return out;
  }
  // 多级兜底解析：直接 parse → 提取第一个 {...} → 修复截断后 parse
  function tryParseJsonLoose(content) {
    var txt = stripMarkdownJson(content);
    var cands = [];
    var j1 = extractFirstJson(txt); if (j1) cands.push(j1);
    if (txt) cands.push(txt);
    // think 未闭合被剥空时，回退到原始返回里提取（思考过程里可能已有完整 JSON）
    var raw = extractFirstJson(String(content || ''));
    if (raw && cands.indexOf(raw) === -1) cands.push(raw);
    for (var i = 0; i < cands.length; i++) {
      try { var o1 = JSON.parse(cands[i]); if (o1 && typeof o1 === 'object') return o1; } catch (e) {}
      var rep = repairTruncatedJson(cands[i]);
      if (rep && rep !== cands[i]) {
        try { var o2 = JSON.parse(rep); if (o2 && typeof o2 === 'object') return o2; } catch (e2) {}
      }
    }
    return null;
  }
  function humanizeOperator(op) {
    var map = { greater: '大于', less: '小于', equal: '等于', greater_equal: '大于等于', less_equal: '小于等于' };
    return map[op] || op;
  }
  function humanizeParameter(param, type) {
    var map = {
      positionRatio: '单票仓位占比',
      weeklyTradeCount: '本周交易笔数',
      intradayChangePct: '日内涨跌幅',
      positionLossRatio: '单票浮亏率',
      dailyLossRatio: '日亏损占总资产比例'
    };
    if (map[param]) return map[param];
    if (type === 'price') return '成交价';
    if (type === 'volume') return '交易数量';
    if (type === 'time') return '交易小时';
    if (type === 'loss') return '日亏损金额';
    if (type === 'profit') return '日盈利金额';
    return param || '数值';
  }
  function humanizeCondition(cond) {
    var param = humanizeParameter(cond.parameter, cond.type);
    var op = humanizeOperator(cond.operator);
    var val = cond.value;
    var suffix = '';
    if (cond.parameter === 'positionRatio' || cond.parameter === 'positionLossRatio' || cond.parameter === 'dailyLossRatio') {
      val = (Number(val) * 100).toFixed(1) + '%';
    } else if (cond.parameter === 'intradayChangePct') {
      // value 存百分数值（涨 10% 存 10，与行情 changePercent 单位一致）
      val = Number(val) + '%';
    } else if (cond.parameter === 'weeklyTradeCount') {
      suffix = ' 笔';
    } else if (cond.type === 'time') {
      var tv = Number(val);
      if (tv % 1 === 0) { val = String(tv); suffix = ' 点'; }
      else {
        var th = Math.floor(tv);
        var tmi = Math.round((tv - th) * 60);
        val = (th < 10 ? '0' + th : String(th)) + ':' + (tmi < 10 ? '0' + tmi : String(tmi));
        suffix = '';
      }
    } else if (cond.type === 'loss' || cond.type === 'profit') {
      suffix = ' 元';
    }
    return param + ' ' + op + ' ' + val + suffix;
  }
  function humanizeAction(action) {
    var map = { block: '拦截交易', alert: '弹窗提醒', log: '记录违规' };
    return map[action.type] || action.type;
  }
  function validateParsedRule(parsed) {
    var types = ['price', 'volume', 'time', 'loss', 'profit'];
    var ops = ['greater', 'less', 'equal', 'greater_equal', 'less_equal'];
    // 合法的 (类型 → 参数) 组合白名单：模型输出未知参数会静默落到默认比较（如成交价），
    // 导致「每笔成交价>X 元就误报违规」。这里显式拦截未知参数。
    var PARAM_BY_TYPE = {
      price: ['', 'intradayChangePct'],
      volume: ['', 'positionRatio', 'weeklyTradeCount'],
      time: [''],
      loss: ['', 'positionLossRatio', 'dailyLossRatio'],
      profit: [''],
    };
    if (!parsed || typeof parsed !== 'object') return { ok: false, msg: '解析结果为空' };
    if (!parsed.name || !String(parsed.name).trim()) return { ok: false, msg: '规则名称为空' };
    if (!Array.isArray(parsed.conditions) || parsed.conditions.length === 0) return { ok: false, msg: '未识别到有效条件' };
    for (var i = 0; i < parsed.conditions.length; i++) {
      var c = parsed.conditions[i];
      if (types.indexOf(c.type) === -1) return { ok: false, msg: '不支持的条件类型：' + c.type };
      if (ops.indexOf(c.operator) === -1) return { ok: false, msg: '不支持的比较运算符：' + c.operator };
      if (!isFinite(Number(c.value))) return { ok: false, msg: '条件数值无效' };
      var allowed = PARAM_BY_TYPE[c.type] || [''];
      if (allowed.indexOf(c.parameter || '') === -1) {
        return { ok: false, msg: '不支持的参数「' + (c.parameter || '(空)') + '」，可能是模型识别有误。请修改规则描述后重试，或改用规则模板库。' };
      }
    }
    var warn = '';
    for (var j = 0; j < parsed.conditions.length; j++) {
      var cc = parsed.conditions[j];
      if ((cc.parameter === 'positionRatio' || cc.parameter === 'positionLossRatio' || cc.parameter === 'dailyLossRatio') && (cc.value < 0 || cc.value > 1)) {
        return { ok: false, msg: '比例类阈值应在 0%–100% 之间' };
      }
      // intradayChangePct 阈值：模型若输出 <1（如 0.5），可能是把「0.5%」写成 0.5（小数百分比），
      // 也可能是 0.005（小数比例）。旧代码静默 ×100 把 0.5 放大成 50% 导致规则永不触发——
      // 不再静默换算，改为提示用户确认阈值显示是否正确。
      if (cc.parameter === 'intradayChangePct' && Math.abs(Number(cc.value)) < 1 && Number(cc.value) !== 0) {
        warn = '日内涨跌幅阈值为 ' + Number(cc.value) + '%，请确认是否正确（若你指的是 50%，请改写描述为「涨 50%」）';
      }
      if (cc.type === 'time' && (cc.value < 0 || cc.value > 23)) return { ok: false, msg: '时间应在 0–23 点之间' };
    }
    return { ok: true, rule: parsed, warn: warn || '' };
  }
  function callAiParseRule(text) {
    return new Promise(function (resolve, reject) {
      var cfg = AppData.getConfig();
      if (!cfg.aiApiKey || !cfg.aiApiKey.trim()) { reject(new Error('未配置 AI API Key')); return; }
      // 极简 prompt：只要求 4 个字段，降低模型出错概率、缩短输出时间
      var systemPrompt = '你是投资纪律规则解析器。把自然语言转成一条可执行规则，只输出 JSON，不要任何其他文字。\n\n' +
        '格式：{"name":"规则名10字内","description":"一句话描述","severity":"high|medium|low","conditions":[{"type":"price|volume|time|loss|profit","operator":"greater|less|equal|greater_equal|less_equal","value":数值,"parameter":"intradayChangePct|positionRatio|weeklyTradeCount|positionLossRatio|dailyLossRatio|空字符串"}]}\n\n' +
        '约束：\n' +
        '1. 单位：intradayChangePct 存百分数值（10% → 10）；positionRatio/positionLossRatio/dailyLossRatio 存小数（10% → 0.1）；金额/笔数/小时直接存数值。\n' +
        '2. 阈值=违规线：「仓位不超过20%」写 operator:"greater", value:0.2（超过即违规）。\n' +
        '3. 无法识别输出 {"name":"","description":"","severity":"medium","conditions":[]}。\n' +
        '4. 句中的动作（卖出一半/清仓/减仓等）写进 description 保留原意，conditions 只放阈值判定。';
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var timer = ctrl ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, 25000) : null;
      aiFetch(cfg.aiApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.aiApiKey },
        body: JSON.stringify({
          model: cfg.aiModel,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: String(text || '').trim() }
          ],
          max_tokens: 600,
          temperature: 0.1,
        }),
        signal: ctrl ? ctrl.signal : undefined,
      }).then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      }).then(function (data) {
        if (timer) clearTimeout(timer);
        var content = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        var parsed = tryParseJsonLoose(content);
        if (!parsed) {
          var frag = String(content || '(空返回)').replace(/\s+/g, ' ').slice(0, 80);
          throw new Error('AI 返回格式异常：' + frag);
        }
        resolve(parsed);
      }).catch(function (err) {
        if (timer) clearTimeout(timer);
        if (ctrl && ctrl.signal && ctrl.signal.aborted) { reject(new Error('解析超时（25秒），请重试或换更快的模型')); return; }
        reject(err);
      });
    });
  }

  /* ---- 本地正则兜底解析：仅在未配置 AI Key 或 AI 调用失败时使用 ----
     覆盖：涨跌幅阈值 / 仓位上限 / 浮动止损 / 日亏金额 / 尾盘时间 / 周频次
     返回 null = 本地无法识别，走 AI
  */
  function localParseRule(text) {
    var t = String(text || '').trim();
    if (!t || t.length > 80) return null; // 过长句子交给 AI
    var conds = [];
    var kind = '';
    var m;
    function pctStr(s) { return parseFloat(s) / 100; }
    // 1) 涨跌幅阈值：「上涨10%减仓」「跌破8%清仓」「涨X%止盈」
    var upM = t.match(/(?:上涨|涨|升)\s*(?:幅)?\s*(?:超过|大于|到|过|破)?\s*(\d+(?:\.\d+)?)\s*%/);
    var dnM = t.match(/(?:下跌|跌破|跌|降)\s*(?:幅)?\s*(?:超过|大于|到)?\s*(\d+(?:\.\d+)?)\s*%/);
    // 复杂句式本地表达不了，交给 AI：
    //   a. 涨跌双分支（条件是 AND 关系，>10% 和 <-10% 放一条规则永远不触发）
    //   b. 涨跌幅句式里带动作（卖出一半/清仓等），需要拆成动作+阈值
    if ((upM && dnM) || ((upM || dnM) && /(卖出|卖掉|清仓|减仓|加仓|买入)/.test(t))) return null;
    if (upM) { conds.push({ type: 'price', parameter: 'intradayChangePct', operator: 'greater', value: parseFloat(upM[1]) }); kind = '涨跌幅纪律'; }
    if (dnM) { conds.push({ type: 'price', parameter: 'intradayChangePct', operator: 'less', value: -parseFloat(dnM[1]) }); kind = '涨跌幅纪律'; }
    // 2) 仓位上限：「单笔仓位不要超过20%」「仓位上限30%」（要求有限定词，避免误匹配「减仓50%」）
    // 限定词补全「不要/不得/不可/禁止/要」，原来「不要超过」因中间多出「要」字无法匹配
    if (conds.length === 0 && (m = t.match(/(?:仓位|持仓|单[笔票])[^。]{0,12}?(?:不(?:要|得|可|能再)?(?:超过|得超|大于|高于)|不要|不得|不可|禁止|超过|大于|高于|至多|上限)[^0-9。]{0,10}(\d+(?:\.\d+)?)\s*%/))) {
      conds.push({ type: 'volume', parameter: 'positionRatio', operator: 'greater', value: pctStr(m[1]) });
      kind = '仓位上限';
    }
    // 3) 浮动止损：「浮亏超过8%止损」「单票亏损10%」（术语与 KPI「浮动盈亏」统一）
    if (conds.length === 0 && (m = t.match(/(?:浮亏|单票[^。]{0,4}亏损|个股[^。]{0,4}亏损)[^0-9。]{0,4}(\d+(?:\.\d+)?)\s*%/))) {
      conds.push({ type: 'loss', parameter: 'positionLossRatio', operator: 'greater', value: pctStr(m[1]) });
      kind = '浮动止损';
    }
    // 4) 日亏金额：「每天亏损超过1000块」
    if (conds.length === 0 && (m = t.match(/(?:每天|当日|日内|日)亏损[^0-9。]{0,4}(\d+(?:\.\d+)?)(?!\s*%)/))) {
      conds.push({ type: 'loss', operator: 'greater', value: parseFloat(m[1]) });
      kind = '日亏上限';
    }
    // 5) 尾盘时间：「14点之后禁止开新仓」「14:30后不交易」「14:50之后禁止开仓」
    // 捕获分钟，按小数存（14:50 → 14.833），配合纪律引擎按「小时+分钟/60」比较，避免提前 50 分钟误报
    if (conds.length === 0 && (m = t.match(/(\d{1,2})\s*[点时:：]\s*(\d{1,2})?/)) && /(之后|以后|后|禁止|不(?:得|能|再)?交易|开新仓)/.test(t) && parseInt(m[1], 10) <= 23) {
      var hh = parseInt(m[1], 10);
      var mm = (m[2] != null) ? parseInt(m[2], 10) : 0;
      conds.push({ type: 'time', operator: 'greater_equal', value: hh + mm / 60 });
      kind = '交易时段纪律';
    }
    // 6) 周频次：「每周交易不超过10笔」
    if (conds.length === 0 && (m = t.match(/每周[^0-9。]{0,8}(\d+)\s*笔/))) {
      conds.push({ type: 'volume', parameter: 'weeklyTradeCount', operator: 'greater', value: parseInt(m[1], 10) });
      kind = '周频次纪律';
    }
    if (conds.length === 0) return null;
    return { name: kind, description: t, severity: 'medium', conditions: conds };
  }

  /* ======================================================
   * 模态表单（新增交易 / 加自选 / 写心得 / 加规则 / AI 结果）
   * ====================================================== */
  const Modals = {};

  /* 记一笔 / 编辑交易：传入带 id 的 trade 即为编辑模式（预填原值，保存走 updateTrade）。
     传不带 id 的对象 = 只做预填的「新增」（如持仓明细里的记一笔卖出）。
     原来交易流水只能删除，录错一笔要删了重记，撤销窗口只有 5 秒。 */
  Modals.addTrade = function (trade) {
    const isEdit = !!(trade && trade.id);
    const v = trade || {};
    const vType = v.type || 'buy';
    // 编辑时保留原始时间，只换日期部分（交易时间本身用户不关心，但当日归属必须保持）
    const vDate = v.timestamp ? String(v.timestamp).slice(0, 10) : AppData.beijingYmd(new Date());
    openModal(`
      <div class="m-head">
        <h3>${isEdit ? '编辑交易' : '记一笔'}</h3>
        <button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="tradeForm" class="m-form">
        <div class="f-row">
          <label>方向</label>
          <div class="seg">
            <label class="seg-o seg-buy ${vType==='buy'?'on':''}"><input type="radio" name="side" value="buy" ${vType==='buy'?'checked':''}><span>买入</span></label>
            <label class="seg-o seg-sell ${vType==='sell'?'on':''}"><input type="radio" name="side" value="sell" ${vType==='sell'?'checked':''}><span>卖出</span></label>
          </div>
        </div>
        <div class="f-row2">
          <div class="f-row rel"><label>代码</label><input name="code" id="tradeCode" value="${escapeHtml(v.stockCode||'')}" placeholder="如 00700" required autocomplete="off"><span id="tradeCodeLoading" class="f-loading" style="display:none">查询中…</span></div>
          <div class="f-row"><label>名称</label><input name="name" id="tradeName" value="${escapeHtml(v.stockName||'')}" placeholder="如 腾讯控股" required></div>
        </div>
        <div class="f-row2">
          <div class="f-row"><label>日期</label><input type="date" name="date" required value="${vDate}"></div>
          <div class="f-row"><label>数量（股）</label><input type="number" name="qty" min="1" step="1" placeholder="200" required value="${v.quantity||''}"></div>
        </div>
        <div class="f-row2">
          <div class="f-row"><label><span id="tradeCur">¥</span> 价格</label><input type="number" name="price" id="tradePrice" min="0" step="any" placeholder="342.00" required value="${v.price||''}"></div>
          <div class="f-row"><label><span id="tradeCurFee">¥</span> 手续费</label><input type="number" name="fee" min="0" step="any" placeholder="0.00" value="${v.fee||0}"></div>
        </div>
        <div class="f-row"><label>折算人民币（按最新汇率）</label><div class="form-val" id="tradeCnyPreview">≈ ¥0.00</div></div>
        <div class="f-row"><label>备注</label><textarea name="note" rows="2" placeholder="交易理由 / 计划仓位">${escapeHtml(v.notes||'')}</textarea></div>
        <div class="m-foot">
          <button type="submit" class="btn-pix btn-brand full">${isEdit ? '保存修改' : '保存交易'}</button>
        </div>
      </form>`);
    bindSeg();
    var tradeCodeInput = document.getElementById('tradeCode');
    var tradeNameInput = document.getElementById('tradeName');
    var tradePriceInput = document.getElementById('tradePrice');
    var tradeLoading = document.getElementById('tradeCodeLoading');
    var tradeCurEl = document.getElementById('tradeCur');
    var tradeCurFeeEl = document.getElementById('tradeCurFee');
    var tradeCnyEl = document.getElementById('tradeCnyPreview');
    var tradeFetchTimer = null;
    var tradeAbort = null;
    // 当前表单的市场/币种（代码驱动，实时更新标签与折算）
    function tradeMarket() {
      return (typeof AppMarket !== 'undefined' && AppMarket.detectMarket)
        ? AppMarket.detectMarket(tradeCodeInput.value)
        : 'us';
    }
    function updateTradeCurrencyUi() {
      var m = tradeMarket();
      var sym = curSym(m);
      if (tradeCurEl) tradeCurEl.textContent = sym;
      if (tradeCurFeeEl) tradeCurFeeEl.textContent = sym;
      if (tradeCnyEl) {
        var qty = Number((document.querySelector('#tradeForm [name=qty]') || {}).value) || 0;
        var price = Number(tradePriceInput.value) || 0;
        var fee = Number((document.querySelector('#tradeForm [name=fee]') || {}).value) || 0;
        var total = toCny(qty * price + fee, m);
        tradeCnyEl.textContent = '≈ ¥' + fmtMoney(total) + (m === 'us' ? '（美元 × 汇率）' : m === 'hk' ? '（港币 × 汇率）' : '');
      }
    }
    tradeCodeInput.addEventListener('input', updateTradeCurrencyUi);
    tradePriceInput.addEventListener('input', updateTradeCurrencyUi);
    ['qty', 'fee'].forEach(function (n) {
      var el = document.querySelector('#tradeForm [name=' + n + ']');
      if (el) el.addEventListener('input', updateTradeCurrencyUi);
    });
    updateTradeCurrencyUi();
    tradeCodeInput.addEventListener('input', function () {
      if (tradeFetchTimer) clearTimeout(tradeFetchTimer);
      if (tradeAbort) { try { tradeAbort.abort(); } catch (_) {} tradeAbort = null; }
      tradeFetchTimer = setTimeout(function () {
        var code = String(tradeCodeInput.value || '').trim();
        if (!code || typeof AppMarket === 'undefined') return;
        if (tradeNameInput.value && tradePriceInput.value) return; // 用户已手动填写就不再覆盖
        var market = AppMarket.detectMarket(code);
        tradeLoading.style.display = '';
        var ctrl = new AbortController();
        tradeAbort = ctrl;
        AppMarket.getQuote(code, market, ctrl.signal).then(function (q) {
          tradeAbort = null;
          tradeLoading.style.display = 'none';
          if (!q) return;
          // 输入过程中间请求可能晚于最终请求返回，必须校验当前输入框还是同一个代码
          if (String(tradeCodeInput.value || '').trim().toUpperCase() !== code.toUpperCase()) return;
          if (!tradeNameInput.value) tradeNameInput.value = q.name || '';
          if (!tradePriceInput.value) tradePriceInput.value = q.price || '';
          updateTradeCurrencyUi();
        }).catch(function (err) {
          if (ctrl && ctrl.signal && ctrl.signal.aborted) return;
          tradeAbort = null;
          tradeLoading.style.display = 'none';
        });
      }, 450);
    });
    document.getElementById('tradeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const dateStr = String(fd.get('date')||'').trim();
      const rec = {
        type: fd.get('side'),                       // buy / sell
        stockCode: String(fd.get('code')||'').trim(),
        stockName: String(fd.get('name')||'').trim(),
        market: tradeMarket(),                      // 币种归属：价格/手续费按该市场币种记录
        quantity:  Number(fd.get('qty')||0),
        price:     Number(fd.get('price')||0),
        fee:       Number(fd.get('fee')||0),
        notes:     String(fd.get('note')||'').trim(),
        tags:       [],
        timestamp: dateStr ? (dateStr + nowIsoLocal().slice(10)) : nowIsoLocal(),
      };
      const r = isEdit
        ? (function () {
            var updated = AppData.updateTrade(trade.id, rec);
            return updated ? { ok: true } : { ok: false, msg: '未找到该交易，可能已被删除' };
          })()
        : AppData.addTrade(rec);
      if (!r.ok) { toast(r.msg, 'err'); return; }
      toast(isEdit ? '交易已更新' : '交易已保存');
      haptic('success');
      closeModal(); render();
    });
  };

  /* 加入自选 / 编辑自选：传入 stock 即为编辑模式（预填原值，保存走 updateStock）。
     原来目标价、止损、投资逻辑录入后只能删不能改。 */
  Modals.addPool = function (stock) {
    const isEdit = !!(stock && stock.id);
    const pv = stock || {};
    const pvSector = (pv.tags && pv.tags[0]) || '';
    const sectors = ['互联网','科技','消费','硬件制造','新能源车','半导体','新能源','金融保险','医药','其他'];
    openModal(`
      <div class="m-head">
        <h3>${isEdit ? '编辑自选' : '加入股票池'}</h3>
        <button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="poolForm" class="m-form">
        <div class="f-row2">
          <div class="f-row rel"><label>代码 *</label><input name="code" id="poolCode" value="${escapeHtml(pv.code||'')}" placeholder="如 NVDA" required autocomplete="off"><span id="poolCodeLoading" class="f-loading" style="display:none">查询中…</span></div>
          <div class="f-row"><label>名称 *</label><input name="name" id="poolName" value="${escapeHtml(pv.name||'')}" placeholder="如 NVIDIA" required></div>
        </div>
        <div class="f-row2">
          <div class="f-row"><label>市场</label>
            <select name="market" id="poolMarket">${['us','hk','sh','sz'].map(function(m){
              var lb = m === 'us' ? '美股 US' : m === 'hk' ? '港股 HK' : m === 'sh' ? '沪股 SH' : '深股 SZ';
              return '<option value="' + m + '"' + ((pv.market||'us') === m ? ' selected' : '') + '>' + lb + '</option>';
            }).join('')}</select>
          </div>
          <div class="f-row"><label>入池 *</label>
            <select name="poolId" id="poolPoolId">${['2','1'].map(function(id){
              return '<option value="' + id + '"' + ((pv.poolId||'2') === id ? ' selected' : '') + '>' + (id === '1' ? '核心池' : '关注池') + '</option>';
            }).join('')}</select>
          </div>
        </div>
        <div class="f-row2">
          <div class="f-row"><label>状态</label>
            <select name="researchStatus" id="poolStatus">${[['new','待研究'],['researching','研究中'],['watching','观察中'],['ready','可买'],['paused','搁置']].map(function(o){
              return '<option value="' + o[0] + '"' + ((pv.researchStatus||'researching') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
            }).join('')}</select>
          </div>
          <div class="f-row"><label>行业标签</label>
            <select name="sector" id="poolSector">${sectors.map(s=>'<option'+(pvSector===s?' selected':'')+'>'+s+'</option>').join('')}</select>
          </div>
        </div>
        <div class="f-row2">
          <div class="f-row"><label>目标价</label><input name="targetPrice" id="poolTarget" type="number" step="0.01" placeholder="0" value="${pv.targetPrice||''}"></div>
          <div class="f-row"><label>止损价</label><input name="stopLossPrice" id="poolStop" type="number" step="0.01" placeholder="0" value="${pv.stopLossPrice||''}"></div>
        </div>
        <div class="f-row"><label>入池理由 / 投资逻辑</label><textarea name="reason" rows="3" placeholder="核心逻辑 / 催化剂 / 风险点">${escapeHtml(pv.thesis || pv.notes || '')}</textarea></div>
        <div class="m-foot">
          <button type="submit" class="btn-pix btn-brand full">${isEdit ? '保存修改' : '加入股票池'}</button>
        </div>
      </form>`);
    var poolCodeInput = document.getElementById('poolCode');
    var poolNameInput = document.getElementById('poolName');
    var poolMarketSel = document.getElementById('poolMarket');
    var poolLoading = document.getElementById('poolCodeLoading');
    var poolFetchTimer = null;
    var poolAbort = null;
    poolCodeInput.addEventListener('input', function () {
      if (poolFetchTimer) clearTimeout(poolFetchTimer);
      if (poolAbort) { try { poolAbort.abort(); } catch (_) {} poolAbort = null; }
      poolFetchTimer = setTimeout(function () {
        var code = String(poolCodeInput.value || '').trim();
        if (!code || typeof AppMarket === 'undefined') return;
        if (poolNameInput.value) return; // 用户已手动填写名称就不再覆盖
        var market = AppMarket.detectMarket(code);
        if (poolMarketSel) {
          poolMarketSel.value = market;
          poolMarketSel.dispatchEvent(new Event('change', { bubbles: true }));
        }
        poolLoading.style.display = '';
        var ctrl = new AbortController();
        poolAbort = ctrl;
        AppMarket.getQuote(code, market, ctrl.signal).then(function (q) {
          poolAbort = null;
          poolLoading.style.display = 'none';
          if (!q) return;
          // 输入过程中间请求可能晚于最终请求返回，必须校验当前输入框还是同一个代码
          if (String(poolCodeInput.value || '').trim().toUpperCase() !== code.toUpperCase()) return;
          if (!poolNameInput.value) poolNameInput.value = q.name || '';
        }).catch(function (err) {
          if (ctrl && ctrl.signal && ctrl.signal.aborted) return;
          poolAbort = null;
          poolLoading.style.display = 'none';
        });
      }, 450);
    });
    document.getElementById('poolForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var code = String(fd.get('code') || '').trim().toUpperCase();
      var name = String(fd.get('name') || '').trim();
      var market = String(fd.get('market') || '').trim();
      var poolId = String(fd.get('poolId') || '2');
      var researchStatus = String(fd.get('researchStatus') || 'new');
      var sector = String(fd.get('sector') || '').trim();
      var targetPrice = parseFloat(fd.get('targetPrice')) || 0;
      var stopLossPrice = parseFloat(fd.get('stopLossPrice')) || 0;
      var thesis = String(fd.get('reason') || '').trim();
      if (!code || !name) { toast('代码和名称必填', 'err'); return; }
      if (!market && typeof AppMarket !== 'undefined') market = AppMarket.detectMarket(code);
      if (!market) market = 'us';

      function doSave(price) {
        var payload = {
          code: code,
          name: name,
          market: market,
          poolId: poolId,
          researchStatus: researchStatus,
          tags: sector ? [sector] : [],
          targetPrice: targetPrice,
          stopLossPrice: stopLossPrice,
          thesis: thesis,
        };
        if (isEdit) {
          // 编辑不改现价（现价由行情刷新负责），保留 watch/addedAt 等原字段
          var updated = AppData.updateStock(stock.id, payload);
          if (!updated) { toast('未找到该自选，可能已被删除', 'err'); return; }
          toast('自选已更新');
          haptic('success');
          closeModal(); render();
          return;
        }
        payload.price = price || 0;
        var r = AppData.addStockPool(payload);
        if (!r.ok) { toast(r.msg, 'err'); return; }
        var poolName = poolId === '1' ? '核心池' : '关注池';
        toast('已加入' + poolName);
        haptic('success');
        closeModal(); render();
      }

      if (typeof AppMarket !== 'undefined') {
        poolLoading.style.display = '';
        AppMarket.getQuote(code, market).then(function (q) {
          poolLoading.style.display = 'none';
          if (q) {
            if (!name && q.name) name = q.name;
            doSave(q.price);
          } else {
            doSave(0);
          }
        }).catch(function () {
          poolLoading.style.display = 'none';
          doSave(0);
        });
      } else {
        doSave(0);
      }
    });
  };

  Modals.batchAddPool = function () {
    openModal(`
      <div class="m-head">
        <h3>批量添加股票</h3>
        <button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="batchPoolForm" class="m-form">
        <div class="f-row"><label>粘贴股票代码（每行一个，或逗号分隔）*</label>
          <textarea name="codes" rows="6" placeholder="600519&#10;00700&#10;AAPL&#10;TSLA" required></textarea>
        </div>
        <div class="f-row2">
          <div class="f-row"><label>入池</label>
            <select name="poolId"><option value="2">关注池</option><option value="1">核心池</option></select>
          </div>
          <div class="f-row"><label>状态</label>
            <select name="status"><option value="new">待研究</option><option value="researching">研究中</option><option value="watching">观察中</option></select>
          </div>
        </div>
        <div class="f-row space">
          <label>自动拉取名称（腾讯接口）</label>
          <label class="sw on" id="autoFetchSw"><i></i></label>
          <input type="hidden" name="autoFetch" id="autoFetchVal" value="1">
        </div>
        <div class="m-foot">
          <button type="submit" class="btn-pix btn-brand full">批量加入</button>
        </div>
      </form>`);
    var afSw = document.getElementById('autoFetchSw');
    afSw.addEventListener('click', function () {
      afSw.classList.toggle('on');
      document.getElementById('autoFetchVal').value = afSw.classList.contains('on') ? '1' : '';
    });
    document.getElementById('batchPoolForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var fd = new FormData(e.target);
      var raw = String(fd.get('codes') || '').trim();
      if (!raw) { toast('请输入至少一个代码', 'err'); return; }
      var codes = raw.split(/[\n,，\s]+/).map(function (s) { return s.trim(); }).filter(Boolean);
      if (codes.length === 0) { toast('未解析到有效代码', 'err'); return; }
      var poolId = String(fd.get('poolId') || '2');
      var status = String(fd.get('status') || 'new');
      var autoFetch = fd.get('autoFetch');

      // 原来 loading 弹窗没有任何出口：50 只 × 250ms 期间页面完全锁死，只能杀进程。
      // 这里给 loading 加上取消/关闭按钮，并用 cancelled 标志真正中止后续写入。
      var cancelled = false;
      openModal(`
        <div class="m-head">
          <h3>正在拉取行情...</h3>
          <button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="ai-result ai-loading"><div class="ai-r-html">⏳ 正在获取 ${codes.length} 只股票的信息...</div></div>
        <div class="m-foot">
          <button type="button" class="btn-pix btn-ghost full" id="batchCancelBtn" data-close-modal>取消</button>
        </div>`);
      var cancelBtn = document.getElementById('batchCancelBtn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          cancelled = true;
          toast('已取消批量添加', 'warn');
        });
      }

      function doAdd(items) {
        if (cancelled) return;
        var r = AppData.batchAddStocks(items.map(function (it) {
          return { code: it.code, name: it.name || it.code, poolId: poolId, researchStatus: status, market: it.market };
        }));
        toast('批量添加：成功 ' + r.ok + ' 条' + (r.fail ? '，失败 ' + r.fail + ' 条' : ''), r.ok > 0 ? 'ok' : 'err');
        haptic('success');
        if (r.errors && r.errors.length) console.warn('[batch]', r.errors);
        closeModal(); render();
      }

      if (autoFetch && typeof AppMarket !== 'undefined') {
        var byMarket = {};
        codes.forEach(function (code) {
          var m = AppMarket.detectMarket(code);
          if (!byMarket[m]) byMarket[m] = [];
          byMarket[m].push(code);
        });
        var allItems = [];
        var pending = Object.keys(byMarket).length;
        if (pending === 0) { doAdd(codes.map(function (c) { return { code: c }; })); return; }
        Object.keys(byMarket).forEach(function (m) {
          var group = byMarket[m];
          AppMarket.getQuotes(group, m).then(function (map) {
            if (cancelled) return;   // 用户已取消：丢弃结果，不再写库
            group.forEach(function (code) {
              var q = map.get(code.toUpperCase());
              allItems.push({ code: code, name: q ? q.name : code, market: m, price: q ? q.price : 0 });
            });
            pending--;
            if (pending === 0) doAdd(allItems);
          });
        });
      } else {
        doAdd(codes.map(function (c) { return { code: c }; }));
      }
    });
  };

  Modals.addIns = function () {
    openModal(`
      <div class="m-head">
        <h3>写心得</h3>
        <button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <form id="insForm" class="m-form">
        <div class="f-row">
          <label>心情</label>
          <div class="seg">
            <label class="seg-o on"><input type="radio" name="mood" value="win" checked><span><i class="fa-solid fa-trophy"></i> WIN</span></label>
            <label class="seg-o"><input type="radio" name="mood" value="calm"><span><i class="fa-solid fa-face-smile"></i> CALM</span></label>
            <label class="seg-o"><input type="radio" name="mood" value="angry"><span><i class="fa-solid fa-face-angry"></i> BAD</span></label>
          </div>
        </div>
        <div class="f-row"><label>标题 *</label><input name="title" placeholder="给这次复盘起个标题" required></div>
        <div class="f-row"><label>内容 *</label><textarea name="content" rows="5" placeholder="发生了什么 → 哪里做对/错 → 下次怎么做" required></textarea></div>
        <div class="f-row"><label>标签（用空格或逗号分隔）</label><input name="tags" placeholder="持仓 腾讯 止盈"></div>
        <div class="m-foot">
          <button type="submit" class="btn-pix btn-brand full">保存心得</button>
        </div>
      </form>`);
    bindSeg();
    document.getElementById('insForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const tags = String(fd.get('tags')||'').split(/[\s,，、]+/).filter(Boolean);
      const r = AppData.addInsight({
        mood: fd.get('mood') || 'calm',
        title: String(fd.get('title')||'').trim(),
        content: String(fd.get('content')||'').trim(),
        tags,
      });
      if (!r.ok) { toast(r.msg, 'err'); return; }
      toast('心得已沉淀');
      haptic('success');
      closeModal(); render();
    });
  };

  Modals.addRule = function () {
    var currentParsed = null;
    openModal(`
      <div class="m-head">
        <h3>新增纪律规则</h3>
        <button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="m-form" id="ruleForm">
        <div class="f-row"><label>用自然语言描述规则 *</label>
          <textarea id="ruleDesc" rows="3" placeholder="例如：单笔交易仓位不要超过总资金的 20%\n每天亏损超过 1000 块就暂停交易\n14:50 之后禁止开新仓"></textarea>
        </div>
        <div class="f-row"><button type="button" id="aiParseBtn" class="btn-pix btn-brand full"><i class="fa-solid fa-wand-magic-sparkles"></i> AI 解析并预览</button></div>
        <div id="rulePreviewBox" class="rp-box"><div class="rp-empty">输入描述后点击「AI 解析并预览」</div></div>
        <div class="f-row"><label>规则标题</label><input id="ruleTitle" placeholder="解析后自动填充，也可手动修改"></div>
        <div class="f-row">
          <label>严重级别</label>
          <div class="seg">
            <label class="seg-o on"><input type="radio" name="ruleLevel" value="ok" checked><span>常规</span></label>
            <label class="seg-o"><input type="radio" name="ruleLevel" value="danger"><span>高危</span></label>
          </div>
        </div>
        <div class="m-foot" id="ruleSubmitArea" style="display:none">
          <button type="button" id="ruleSubmitBtn" class="btn-pix btn-brand full">确认启用</button>
        </div>
        <div class="m-foot gap">
          <button type="button" id="ruleRetryBtn" class="btn-pix btn-ghost full">重新描述 / 使用模板库</button>
        </div>
      </div>`);
    bindSeg();
    var parseBtn = document.getElementById('aiParseBtn');
    var previewBox = document.getElementById('rulePreviewBox');
    var submitArea = document.getElementById('ruleSubmitArea');
    var submitBtn = document.getElementById('ruleSubmitBtn');
    var retryBtn = document.getElementById('ruleRetryBtn');
    var descInput = document.getElementById('ruleDesc');
    var titleInput = document.getElementById('ruleTitle');
    function setLoading(on) {
      parseBtn.disabled = on;
      parseBtn.innerHTML = on ? '<i class="fa-solid fa-circle-notch fa-spin"></i> 解析中…' : '<i class="fa-solid fa-wand-magic-sparkles"></i> AI 解析并预览';
    }
    function showError(msg, isConfig) {
      previewBox.innerHTML = '<div class="rp-err"><i class="fa-solid fa-circle-exclamation"></i> ' + escapeHtml(msg) + '</div>' +
        (isConfig ? '<div class="rp-hint">去「设置」页配置硅基流动 API Key、URL 和模型后即可使用。</div>' : '');
      submitArea.style.display = 'none';
      currentParsed = null;
    }
    function renderPreview(parsed) {
      var v = validateParsedRule(parsed);
      if (!v.ok) {
        previewBox.innerHTML = '<div class="rp-warn"><i class="fa-solid fa-triangle-exclamation"></i> ' + escapeHtml(v.msg) + '</div>' +
          '<div class="rp-hint">AI 猜测的原始结果如下，你可以修改描述后重试，或改用规则模板库。</div>' +
          '<div class="rp-raw"><pre>' + escapeHtml(JSON.stringify(parsed, null, 2)) + '</pre></div>';
        submitArea.style.display = 'none';
        currentParsed = null;
        return;
      }
      var rule = v.rule;
      currentParsed = rule;
      var condsHtml = (rule.conditions || []).map(function (c) {
        return '<div class="rule-cond-row"><i class="fa-solid fa-filter"></i><span>' + escapeHtml(humanizeCondition(c)) + '</span></div>';
      }).join('');
      var sevLabel = { high: '高危', medium: '常规', low: '提示' };
      var actionsHtml = (rule.actions && rule.actions.length)
        ? '<div class="rp-section">执行动作</div>' + rule.actions.map(function (a) {
            return '<div class="rule-cond-row"><i class="fa-solid fa-bolt"></i><span>' + escapeHtml(humanizeAction(a)) + '：' + escapeHtml(a.message || '') + '</span></div>';
          }).join('')
        : '';
      previewBox.innerHTML = '' +
        '<div class="rp-card">' +
          '<div class="rp-title">' + escapeHtml(rule.name) + '<span class="rp-sev rp-sev-' + rule.severity + '">' + escapeHtml(sevLabel[rule.severity] || rule.severity) + '</span></div>' +
          '<div class="rp-desc">' + escapeHtml(rule.description || '') + '</div>' +
          '<div class="rp-section">触发条件</div>' + condsHtml +
          actionsHtml +
        '</div>' +
        (v.warn ? '<div class="rp-hint rp-warn-inline"><i class="fa-solid fa-circle-question"></i> ' + escapeHtml(v.warn) + '</div>' : '');
      titleInput.value = rule.name || '';
      submitArea.style.display = '';
    }
    parseBtn.addEventListener('click', function () {
      var text = String(descInput.value || '').trim();
      if (!text) { toast('请先输入规则描述', 'warn'); return; }
      var cfg = AppData.getConfig();
      var hasKey = !!(cfg.aiApiKey && cfg.aiApiKey.trim());
      // 未配置 Key：本地正则兜底（简单句式仍可解析）
      if (!hasKey) {
        var local = localParseRule(text);
        if (local) {
          var lv = validateParsedRule(local);
          if (lv.ok) { renderPreview(local); toast('本地解析成功（未配置 AI，复杂句式可到设置页配置 Key）', 'ok'); return; }
        }
        showError('未配置 AI API Key，无法解析这条规则描述。', true);
        return;
      }
      // 配置了 Key：AI 优先
      setLoading(true);
      callAiParseRule(text).then(function (parsed) {
        setLoading(false);
        renderPreview(parsed);
      }).catch(function (err) {
        setLoading(false);
        // AI 失败：本地正则兜底
        var local2 = localParseRule(text);
        if (local2) {
          var lv2 = validateParsedRule(local2);
          if (lv2.ok) { renderPreview(local2); toast('AI 调用失败，已用本地解析兜底', 'warn'); return; }
        }
        var msg = err.message || String(err);
        if (msg.indexOf('未配置 AI API Key') !== -1) showError('未配置 AI API Key，无法解析自然语言规则。', true);
        else showError('AI 解析失败：' + msg);
      });
    });
    retryBtn.addEventListener('click', function () {
      var hasPreview = previewBox.querySelector('.rp-card, .rp-err, .rp-warn');
      if (hasPreview) {
        previewBox.innerHTML = '<div class="rp-empty">输入描述后点击「AI 解析并预览」</div>';
        submitArea.style.display = 'none';
        currentParsed = null;
        descInput.focus();
      } else {
        closeModal();
        Modals.addRuleFromTemplate();
      }
    });
    submitBtn.addEventListener('click', function () {
      if (!currentParsed) { toast('请先解析规则', 'warn'); return; }
      var levelEl = document.querySelector('input[name="ruleLevel"]:checked');
      var level = levelEl ? levelEl.value : 'ok';
      var r = AppData.addRule({
        name: String(titleInput.value || currentParsed.name || '').trim(),
        description: String(descInput.value || currentParsed.description || '').trim(),
        severity: currentParsed.severity || (level === 'danger' ? 'high' : 'medium'),
        conditions: currentParsed.conditions || [],
        actions: currentParsed.actions || [],
        level: level
      });
      if (!r.ok) { toast(r.msg, 'err'); return; }
      toast('新规则已启用');
      closeModal(); render();
    });
  };

  Modals.positionDetail = function (p) {
    var up = (p.floatingPnLPct || 0) >= 0;
    var sym = curSym(p.market);                 // 单价按市场币种
    var mv = (p.marketValue != null) ? p.marketValue : toCny((p.shares || 0) * (p.currentPrice || 0), p.market);      // 人民币
    var cost = (p.cost != null) ? p.cost : toCny((p.shares || 0) * (p.avgCost || 0), p.market);                        // 人民币
    var pnl = (p.floatingPnL != null) ? p.floatingPnL : mv - cost;                                                     // 人民币
    var signAmt = function (n) { return (n > 0 ? '+' : n < 0 ? '-' : '') + '¥' + fmtAmt(n); };
    haptic('light');
    openModal(`
      <div class="m-head">
        <h3>${escapeHtml(p.stockName)}</h3>
        <button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="pos-detail">
        <div class="pd-hero ${up ? 'u' : 'd'}">
          ${up ? '+' : ''}${(p.floatingPnLPct || 0).toFixed(2)}%
          <small>${signAmt(pnl)}</small>
        </div>
        <div class="pd-grid">
          <div><small>持股数量</small><b>${(p.shares || 0).toLocaleString()} 股</b></div>
          <div><small>摊薄成本</small><b>${sym}${fmtMoney(p.avgCost)}</b></div>
          <div><small>当前价</small><b>${sym}${fmtMoney(p.currentPrice)}</b></div>
          <div><small>持仓市值</small><b>¥${fmtAmt(mv)}</b></div>
          <div><small>投入成本</small><b>¥${fmtAmt(cost)}</b></div>
          <div><small>浮动盈亏</small><b class="${up ? 'u' : 'd'}">${signAmt(pnl)}</b></div>
        </div>
        <div class="foot-txt left">单价为${p.market === 'us' ? '美元' : p.market === 'hk' ? '港币' : '人民币'}原币种 · 市值/盈亏已按最新汇率折算人民币</div>
      </div>
      <div class="m-foot">
        <button class="btn-pix btn-ghost" data-close-modal>关闭</button>
        <button class="btn-pix btn-brand" data-pos-sell="${escapeHtml(p.stockCode)}">记一笔卖出</button>
      </div>`);
  };

  Modals.aiReportDetail = function (id) {
    var reports = AppData.getAiReports();
    var r = reports.find(function (x) { return x.id === id; });
    if (!r) return;
    haptic('light');
    openModal(
      '<div class="m-head sticky">' +
        '<h3>' + escapeHtml(r.title) + '</h3>' +
        '<button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>' +
      '<div class="rpt-meta">生成于 ' + AppData.isoDate(r.timestamp) + ' · ' + (r.source === 'local' ? '本地统计' : r.source === 'ai' ? 'AI 生成' : '来源未标记') + '</div>' +
      '<div class="m-body">' + sanitizeHtml(r.html || '') + '</div>'
    );
    var box = $modalBox();
    if (box) box.classList.add('modal-report');
  };

  /* ---------- 心得全文详情（大弹窗：sticky 头部 + m-body 独立滚动） ---------- */
  Modals.insightDetail = function (id) {
    var i = AppData.getInsights().find(function (x) { return x.id === id; });
    if (!i) return;
    var moodMap = {
      win:   { i: 'fa-trophy',     t: 'WIN',  cls: 'm-win' },
      calm:  { i: 'fa-face-smile', t: 'CALM', cls: 'm-calm' },
      angry: { i: 'fa-face-angry', t: 'BAD',  cls: 'm-angry' },
    };
    var m = moodMap[i.mood] || moodMap.calm;
    var tags = (i.tags||[]).map(function(t) { return '<span class="tg">#' + escapeHtml(t) + '</span>'; }).join('');
    haptic('light');
    openModal(
      '<div class="m-head sticky">' +
        '<h3>' + escapeHtml(i.title || '心得') + '</h3>' +
        '<button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>' +
      '<div class="rpt-meta"><span class="ins-mood ' + m.cls + '"><i class="fa-solid ' + m.i + '"></i> ' + m.t + '</span>' +
        '<span style="margin-left:8px"><i class="fa-regular fa-calendar"></i> ' + AppData.isoDate(i.timestamp) + '</span></div>' +
      '<div class="m-body"><div class="ins-full">' + escapeHtml(i.content || '') + '</div>' +
        (tags ? '<div class="ins-tags">' + tags + '</div>' : '') + '</div>' +
      '<div class="m-foot"><button class="btn-pix btn-ghost full" data-close-modal>关闭</button></div>'
    );
    var box = $modalBox();
    if (box) box.classList.add('modal-report');
  };

  Modals.addRuleFromTemplate = function () {
    var tpls = RULE_TEMPLATES.map(function(t, i) {
      var sevLabel = { high: '高危', medium: '常规', low: '提示' };
      return '' +
      '<button class="tpl-card" data-tpl="' + i + '">' +
        '<div class="tpl-top">' +
          '<span class="lv lv-' + t.severity + '">' + (sevLabel[t.severity] || t.severity) + '</span>' +
          '<i class="fa-solid fa-plus tpl-add"></i>' +
        '</div>' +
        '<div class="tpl-name">' + t.name + '</div>' +
        '<div class="tpl-desc">' + t.description + '</div>' +
        '<div class="tpl-edit-hint"><i class="fa-solid fa-pen"></i> 可修改阈值后添加</div>' +
      '</button>';
    }).join('');

    openModal(
      '<div class="m-head">' +
        '<h3>规则模板库</h3>' +
        '<button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>' +
      '<div class="tpl-grid">' + tpls + '</div>' +
      '<div class="m-foot"><button class="btn-pix btn-ghost full" data-close-modal>关闭</button></div>'
    );
  };

  /* ---------- 规则编辑器 ----------
     两用：编辑现有规则（isEdit=true，保存走 updateRule，带删除）/
           模板参数化添加（isEdit=false，阈值可改后确认启用）。
     条件阈值逐项可编辑；percentage 类参数输入按 % 显示、存储转小数。 */
  var RE_PCT_PARAMS = ['positionRatio', 'positionLossRatio', 'dailyLossRatio']; // 存小数
  var RE_OP_LABEL = { greater: '大于', greater_equal: '大于等于', less: '小于', less_equal: '小于等于', equal: '等于' };
  function reUnitOf(c) {
    if (c.parameter === 'intradayChangePct' || RE_PCT_PARAMS.indexOf(c.parameter) >= 0) return '%';
    if (c.parameter === 'weeklyTradeCount') return '笔';
    if (c.type === 'time') return '点';
    return '元';
  }
  function reInputValOf(c) {
    if (RE_PCT_PARAMS.indexOf(c.parameter) >= 0) return Math.round(Number(c.value) * 10000) / 100; // 小数 → 百分显示
    return Number(c.value);
  }
  Modals.ruleEditor = function (rule, isEdit) {
    isEdit = !!isEdit;
    var opOptions = function (cur) {
      return Object.keys(RE_OP_LABEL).map(function (op) {
        return '<option value="' + op + '"' + (op === cur ? ' selected' : '') + '>' + RE_OP_LABEL[op] + '</option>';
      }).join('');
    };
    var condsHtml = (rule.conditions || []).map(function (c, i) {
      return '' +
      '<div class="re-cond" data-ci="' + i + '">' +
        '<span class="re-p">' + escapeHtml(humanizeParameter(c.parameter, c.type)) + '</span>' +
        '<select class="re-op">' + opOptions(c.operator || 'greater') + '</select>' +
        '<input type="number" class="re-val" step="any" value="' + reInputValOf(c) + '">' +
        '<span class="re-u">' + reUnitOf(c) + '</span>' +
      '</div>';
    }).join('') || '<div class="rp-empty">该规则没有可编辑的条件</div>';
    var isHigh = rule.severity === 'high';

    openModal(
      '<div class="m-head">' +
        '<h3>' + (isEdit ? '编辑规则' : '从模板添加') + '</h3>' +
        '<button data-close-modal class="m-x"><i class="fa-solid fa-xmark"></i></button>' +
      '</div>' +
      '<div class="m-form" id="ruleEditForm">' +
        '<div class="f-row"><label>规则名称</label><input id="reName" value="' + escapeHtml(rule.name || '') + '" placeholder="规则名称"></div>' +
        (rule.description ? '<div class="f-row"><label>描述</label><div class="form-val">' + escapeHtml(rule.description) + '</div></div>' : '') +
        '<div class="f-row"><label>触发条件（阈值可直接修改）</label><div id="reConds">' + condsHtml + '</div></div>' +
        '<div class="f-row"><label>严重级别</label>' +
          '<div class="seg">' +
            '<label class="seg-o' + (!isHigh ? ' on' : '') + '"><input type="radio" name="reLevel" value="medium"' + (!isHigh ? ' checked' : '') + '><span>常规</span></label>' +
            '<label class="seg-o' + (isHigh ? ' on' : '') + '"><input type="radio" name="reLevel" value="high"' + (isHigh ? ' checked' : '') + '><span>高危</span></label>' +
          '</div>' +
        '</div>' +
        '<div class="m-foot">' +
          '<button type="button" id="reSave" class="btn-pix btn-brand full">' + (isEdit ? '保存修改' : '确认启用') + '</button>' +
        '</div>' +
        (isEdit
          ? '<div class="m-foot gap"><button type="button" id="reDel" class="btn-pix btn-ghost full" style="color:var(--up)">删除规则</button></div>'
          : '') +
      '</div>'
    );
    bindSeg();

    document.getElementById('reSave').addEventListener('click', function () {
      var name = String(document.getElementById('reName').value || '').trim();
      if (!name) { toast('规则名称必填', 'warn'); return; }
      var newConds = [];
      var rows = document.querySelectorAll('#reConds .re-cond');
      for (var i = 0; i < rows.length; i++) {
        var row = rows[i];
        var src = rule.conditions[parseInt(row.getAttribute('data-ci'), 10)] || {};
        var op = row.querySelector('.re-op').value;
        var val = Number(row.querySelector('.re-val').value);
        if (!isFinite(val)) { toast('条件数值无效，请检查', 'warn'); return; }
        if (RE_PCT_PARAMS.indexOf(src.parameter) >= 0) {
          if (val < 0 || val > 100) { toast('比例类阈值应在 0%–100% 之间', 'warn'); return; }
          val = val / 100;
        }
        if (src.type === 'time' && (val < 0 || val > 23)) { toast('时间应在 0–23 点之间', 'warn'); return; }
        newConds.push(Object.assign({}, src, { operator: op, value: val }));
      }
      if (newConds.length === 0) { toast('该规则没有有效条件', 'warn'); return; }
      var levelEl = document.querySelector('input[name="reLevel"]:checked');
      var severity = levelEl ? levelEl.value : rule.severity || 'medium';
      if (isEdit) {
        AppData.updateRule(rule.id, { name: name, severity: severity, conditions: newConds });
        toast('规则已更新', 'ok');
      } else {
        var r = AppData.addRule({
          name: name,
          description: rule.description || name,
          severity: severity,
          conditions: newConds,
          actions: rule.actions || [{ id: 'A' + Date.now(), type: 'alert', message: name, severity: severity === 'high' ? 'error' : 'warning' }],
        });
        if (!r.ok) { toast(r.msg, 'err'); return; }
        toast('规则已启用', 'ok');
      }
      haptic('success');
      closeModal(); render();
    });

    var delBtn = document.getElementById('reDel');
    if (delBtn) {
      delBtn.addEventListener('click', function () {
        // 注意：removeWithUndo 内部会同步弹出确认框（uiConfirm → openModal），
        // 这里不能再调 closeModal()，否则确认框刚开就被关掉、删除永远不生效。
        removeWithUndo('rule', rule.id, '规则', '确认删除规则「' + (rule.name || '') + '」？删除后可撤销。');
      });
    }
  };

  /* ---------- AI 提示词与后处理 ---------- */
  function aiSystemPrompt() {
    return '你是投资账本分析助手。用中文直接回答，股票名称、代码和币种保留原样。\n' +
      '只把提供的账本和行情缓存当作事实；区分已实现盈亏、浮动盈亏与推测，不编造价格、日期或规则阈值。\n' +
      '先回答问题，再引用最关键的数字。建议应写明依据和触发条件；资料不足就指出缺口。\n' +
      '不要寒暄、空话、重复列表或输出思考过程。';
  }
  // 报告模式专用 system prompt：在通用约束上再压精炼度（报告库会被反复查阅）
  function aiReportSystemPrompt() {
    return aiSystemPrompt() +
      '\n\n【报告格式】第一段用 1-2 句写结论；接着列 2-3 个影响最大的发现，每项引用具体数字；最后给最多 3 条行动，每条写清条件。' +
      '通常写 300-500 个汉字，数据少时更短。不要逐项复述所有持仓；没有的数据明确写“未提供”，不要硬凑结论。';
  }
  // 过滤模型偶尔泄露的思考前缀与无意义套话
  function postProcessAiText(text) {
    if (!text) return '';
    var s = String(text).trim();
    // 过滤显式推理标签（DeepSeek 等模型可能输出 <think>...</think> / <thinking>...</thinking>）
    s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
    s = s.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');
    // 兜底：未闭合的推理标签，清理到末尾
    s = s.replace(/<think\b[^>]*>[\s\S]*/gi, '');
    s = s.replace(/<thinking\b[^>]*>[\s\S]*/gi, '');
    // 去掉常见的英文思考前缀
    var prefixes = [
      /^(Let me analyze[\s\S]{0,200}?)(?=\n\n|\n\*\*|\n##|\n1\.)/i,
      /^(I'll analyze[\s\S]{0,200}?)(?=\n\n|\n\*\*|\n##|\n1\.)/i,
      /^(Let me first[\s\S]{0,200}?)(?=\n\n|\n\*\*|\n##|\n1\.)/i,
      /^(I need to[\s\S]{0,200}?)(?=\n\n|\n\*\*|\n##|\n1\.)/i,
      /^(The user wants me to[\s\S]{0,300}?)(?=\n\n|\n\*\*|\n##|\n1\.)/i,
    ];
    prefixes.forEach(function (re) {
      s = s.replace(re, '');
    });
    return s.trim();
  }
  // 把 HTML 片段转成纯文本（用于报告卡片摘要）
  function stripHtmlToText(html) {
    if (!html) return '';
    var tmp = document.createElement('div');
    tmp.innerHTML = String(html);
    return (tmp.textContent || tmp.innerText || '').trim();
  }
  // 把 Markdown 简单解析成 HTML（加粗、列表、标题、换行）
  function simpleMarkdownToHtml(md) {
    if (!md) return '';
    var html = escapeHtml(String(md));
    // 标题
    html = html.replace(/^### (.*$)/gim, '<h4>$1</h4>');
    html = html.replace(/^## (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^# (.*$)/gim, '<h2>$1</h2>');
    // 加粗
    html = html.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    // 有序列表
    html = html.replace(/^(\d+)\.\s+(.*$)/gim, '<li><span class="li-num">$1.</span> $2</li>');
    // 无序列表
    html = html.replace(/^[-•]\s+(.*$)/gim, '<li>$1</li>');
    // 把连续的 li 包进 ul
    html = html.replace(/(<li[\s\S]*?<\/li>)(?:\s*<li)/g, '$1__LI_SPLIT__<li');
    var parts = html.split('__LI_SPLIT__');
    var out = '';
    var inList = false;
    parts.forEach(function (part) {
      if (/<li/.test(part)) {
        if (!inList) { out += '<ul>'; inList = true; }
        out += part;
      } else {
        if (inList) { out += '</ul>'; inList = false; }
        out += part;
      }
    });
    if (inList) out += '</ul>';
    // 换行
    out = out.replace(/\n/g, '<br>');
    return out;
  }

  Modals.aiResult = function (type) {
    var nameMap = { portfolio: '持仓整体体检', discipline: '纪律系统扫描', trend: '近期趋势推演', risk: '风险预警雷达' };
    var title = nameMap[type] || 'AI 分析';
    // 不阻塞界面：点完即转入后台，结果自动存入「报告库」并通知
    toast('「' + title + '」已转入后台分析，完成后在「AI分析 → 报告库」查看', 'ok');
    haptic('light');   // haptic 只识别小写 kind，传 'LIGHT' 会静默失效
    runAiReportInBackground(type, title);
  };

  // 后台跑分析：发起请求即返回，结束才落库 + 通知，不占用界面
  var _reportCooldown = {}; // type 级 60s 冷却，防连点重复付费 / 重复入库
  function runAiReportInBackground(type, title) {
    // 同维度 60 秒内已生成过 → 直接拦截（连点 N 次 = N 份付费报告是本批次要解决的核心问题）
    var nowTs = Date.now();
    if (_reportCooldown[type] && nowTs - _reportCooldown[type] < 60000) {
      var wait = Math.ceil((60000 - (nowTs - _reportCooldown[type])) / 1000);
      toast('「' + title + '」' + wait + ' 秒内刚生成过，请稍后再点', 'warn');
      return;
    }
    _reportCooldown[type] = nowTs;
    var cfg = AppData.getConfig();
    var hasKey = !!(cfg.aiApiKey && cfg.aiApiKey.trim());
    // 本地结论要在发起请求前算好（作为降级素材）。它依赖 dashboardSummary，
    // 在零持仓等边界下可能抛错——一旦抛出，整个后台分析会被打断：报告不落库、
    // 也没有任何失败提示。这里必须兜住，保证至少有一份报告产出。
    var localR = null;
    try { localR = AppData.aiAnalyze(type); }
    catch (e) { console.warn('[AI报告] 本地分析失败：', e); }
    var fallbackHtml = (localR && localR.html) || '分析未能完成，且本地兜底结论也不可用。请检查数据后重试。';
    function done(html, ok, source, reason) {
      try { AppData.saveAiReport(type, title, html, source === 'local' ? 'local' : 'ai'); }
      catch (e) { console.warn('[AI报告] 落库失败：', e); toast('报告保存失败（可能存储空间不足）', 'err'); return; }
      // 本地兜底要以「本地」身份提示，不能伪装成 AI 成功（避免误导用户）
      if (source === 'local') {
        toast('⚠ ' + title + '：' + (reason || 'AI 请求失败') + '；已用本地统计', 'warn');
      } else {
        toast((ok ? '✅ 新报告已生成：' : '⚠ ' + title + ' 请求失败，已用本地分析兜底：') + title, ok ? 'ok' : 'warn');
      }
      // 若用户正停在报告库，立即刷新列表
      if (currentRoute() === 'ai' && _aiTab === 'history') render();
    }
    if (!hasKey) {
      done(fallbackHtml, true, 'local', '未配置 API Key');
      return;
    }
    var ctx = AppData.buildAiContext(type);
    // 注入真实大盘快照（异步；失败不阻塞，prompt 退化为无大盘段，绝不用假数据）
    var idxPromise = (typeof AppMarket !== 'undefined' && AppMarket.getIndexes)
      ? AppMarket.getIndexes(['上证', '深证', '创业板', '恒生', '纳指', '标普']).then(function (idx) {
          if (idx && idx.length) {
            ctx.indexes = idx.map(function (x) { return { name: x.name, pct: Math.round((x.pct || 0) * 100) / 100, up: x.up }; });
            ctx.prompt = AppData._formatAiPrompt(ctx, type); // 重新生成含大盘的 prompt
          }
        }).catch(function () {})
      : Promise.resolve();
    idxPromise.then(function () {
      return aiFetch(cfg.aiApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg.aiApiKey },
        body: JSON.stringify({
          model: cfg.aiModel,
          messages: [
            { role: 'system', content: aiReportSystemPrompt() },
            { role: 'user', content: ctx.prompt },
          ],
          max_tokens: 1200,
          temperature: 0.3,
        }),
        // 长报告需要完整推理与生成；短请求的 30 秒阈值会误判为失败。
        readTimeout: 120000,
      });
    }).then(function (r) {
      if (!r || !r.ok) {
        if (!r) throw new Error('未收到响应');
        return r.json().then(function (body) {
          var detail = body && body.error && (body.error.message || body.error.code) || body && body.message || '';
          throw new Error('HTTP ' + r.status + (detail ? '：' + String(detail).slice(0, 100) : ''));
        }, function () { throw new Error('HTTP ' + r.status); });
      }
      return r.json();
    }).then(function (data) {
      var choice = data.choices && data.choices[0];
      var text = (choice && choice.message && choice.message.content) || '';
      var cleaned = postProcessAiText(text);
      if (!cleaned) {
        done(fallbackHtml, false, 'local', choice && choice.finish_reason === 'length' ? '模型输出达到长度上限' : '模型返回空正文');
        return;
      }
      done(simpleMarkdownToHtml(cleaned), true, 'ai');
    }).catch(function (err) {
      console.warn('[AI报告] 后台分析失败：', err);
      var reason = String(err && err.message || err || '未知错误');
      if (/timeout|timed out|超时/i.test(reason)) reason = '报告生成超时（已等待约 120 秒）';
      done(fallbackHtml, false, 'local', reason.slice(0, 120));
    });
  }

  /* ======================================================
   * 软键盘遮挡兜底
   * Manifest 已声明 adjustResize，但在全屏（setDecorFitsSystemWindows=false）
   * + 部分机型上它并不生效，聚焦的输入框会停在键盘后面看不见。
   * 这里在键盘弹起动画结束后把输入框滚到可视区中央。
   * ====================================================== */
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (!el || !el.closest || !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (el.type === 'file' || el.type === 'checkbox' || el.type === 'radio') return;
    setTimeout(function () {
      try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (err) { /* 老浏览器无该参数 */ }
    }, 320);
  });

  /* ======================================================
   * 渲染入口
   * ====================================================== */
  function render() {
    const route = currentRoute();
    // 整页重绘会把滑开的行连同状态一起换掉，先收起，避免残留的 openRow 吞掉下一次点击
    RowAct.closeAll();
    const renderFn = Pages[route] || Pages.home;
    // 页面渲染必须隔离：任何一个页面内部抛错（数据脏、字段缺失、行情异常…）
    // 都会让 main.innerHTML 得不到赋值，表现为「整页空白且点什么都没反应」，
    // 排查成本极高。这里兜住并给出可读的错误页，至少用户能反馈到底是什么坏了。
    let html;
    try {
      html = renderFn();
    } catch (e) {
      console.error('[render] 页面「' + route + '」渲染失败：', e);
      html = '' +
        '<div class="empty" style="padding:40px 20px;text-align:center">' +
          '<i class="fa-solid fa-triangle-exclamation" style="font-size:28px;color:#F03342;margin-bottom:12px"></i>' +
          '<div style="font-size:15px;font-weight:600;margin-bottom:6px">页面渲染失败</div>' +
          '<div style="font-size:12px;color:#86868B;line-height:1.6">' +
            '页面「' + escapeHtml(route) + '」出错了：' + escapeHtml(String(e && e.message || e)) + '<br>可尝试下拉刷新，或到设置页导出数据后清空重试。' +
          '</div>' +
        '</div>';
    }
    const main = $main();
    main.classList.remove('fade-in');
    main.classList.toggle('ai-chat-mode', route === 'ai' && _aiTab === 'chat');
    // 强制重绘以触发动画
    void main.offsetWidth;
    main.innerHTML = html;
    PickerUI.enhance(main);
    main.classList.add('fade-in');
    updateTabActive(route);
    // 顶部 Header 只在首页显示（设计稿：子页为大标题，无胶囊 Header）
    var hd = document.getElementById('hd');
    if (hd) hd.classList.toggle('hide', route !== 'home');
    // 铃铛红点：有待处理违规才显示（处理后自动熄灭）
    var bellDot = document.querySelector('#bellBtn .dot');
    if (bellDot) {
      var pdN = AppData.getViolations().filter(function (v) { return v.status === 'pending'; }).length;
      bellDot.style.display = pdN > 0 ? '' : 'none';
    }
    // 回到顶部。滚动容器是 .main 不是 window —— 原来的 window.scrollTo 对 .main
    // 根本无效；而且切 Tab 是换内容，平滑滚几百毫秒反而显得迟钝，直接置顶。
    main.scrollTop = 0;
    // 二级页补返回入口：纪律 / 心得 / 消息中心 / 通知不在底部 Tab 里，
    // 没有可见返回就变成单向陷阱（只能靠系统返回键退出）。
    // Android 物理返回走 hash 回退，这里再给一个显式出口。
    if (TAB_ROUTES.indexOf(route) < 0) {
      var bar = document.createElement('div');
      bar.className = 'pg-back';
      bar.innerHTML = '<button class="back-btn" type="button" aria-label="返回"><i class="fa-solid fa-chevron-left"></i><span>返回</span></button>';
      bar.querySelector('.back-btn').addEventListener('click', function () {
        if (history.length > 1) history.back(); else navigate('home');
      });
      main.insertBefore(bar, main.firstChild);
    }
    // 行内操作教学：图标撤掉后没人知道能左滑/长按，但**不弹文字 toast**——
    // 让第一行自己滑出一角再回弹（RowAct.peekMaybe），看一遍动画就懂，也不挡导航。
    // 频率控制：做过手势即永久关闭，每进程最多一次，跨进程最多 3 次。
    RowAct.peekMaybe(route);
    // 首页 Hero 大数字滚动进场
    if (route === 'home') {
      var hn = main.querySelector('.hero-num');
      if (hn && hn.hasAttribute('data-val')) countUpNumber(hn, Number(hn.getAttribute('data-val')) || 0, hn.getAttribute('data-sign') || '');
    }
    // AI 对话：新消息进来后自动滚到底部（否则新回复在视口外，看起来像没回答）
    if (route === 'ai') {
      var ca = main.querySelector('.chat-area');
      if (ca) ca.scrollTop = ca.scrollHeight;
    }
    // AI 对话：回车发送（软键盘的「发送/回车」键同样触发）
    // 必须判断 composing：中文输入法选词阶段也会发 keydown，
    // 不判断的话打完拼音按回车上屏时会把半成品内容直接发出去。
    if (route === 'ai' && _aiTab === 'chat') {
      setTimeout(function () {
        var ci = document.getElementById('chatInput');
        if (!ci || ci._bound) return;
        ci._bound = true;
        ci.addEventListener('keydown', function (ev) {
          if (ev.key !== 'Enter' && ev.keyCode !== 13) return;
          if (ev.isComposing || ev.keyCode === 229) return;
          ev.preventDefault();
          var q = String(ci.value || '').trim();
          if (!q) { toast('说点什么吧', 'warn'); return; }
          sendAiChatMessage(q);
        });
      }, 50);
    }
    // 图表初始化（home 页有 perfChart canvas）
    // 必须隔离：Chart.js 缺失 / canvas 不可用时 renderCharts 会抛错，
    // 而它位于 render() 尾部——一旦抛出，前面已注入的页面 HTML 虽已生效，
    // 但后续绑定（CSV input、页面级事件等）会全部中断，表现为「页面点了没反应」。
    if (typeof renderCharts === 'function') {
      try { renderCharts(); }
      catch (e) { console.warn('[render] 图表初始化失败，已跳过：', e); }
    }
    // 首页：异步拉真实指数 bench 替换硬编码骨架
    if (route === 'home' && typeof refreshHomeBench === 'function') refreshHomeBench();
    // 交易记录页：绑定 CSV file input（input 是 render 动态生成的）
    if (route === 'trades') {
      setTimeout(function () {
        const fi = document.getElementById('tradeCsvInput');
        if (fi && !fi._bound) {
          fi._bound = true;
          fi.addEventListener('change', function (ev) {
            const f = (ev.target.files && ev.target.files[0]);
            if (!f) return;
            const reader = new FileReader();
            reader.onload = function () {
              try {
                const text = reader.result;
                const r = AppData.csvImportTrades(text);
                toast('导入完成：成功 ' + r.ok + ' 条' + (r.fail ? '，失败 ' + r.fail + ' 条' : ''), r.ok > 0 ? 'ok' : 'err');
                if (r.ok > 0) render();
              } catch (e) {
                toast('CSV 解析失败：' + (e.message || e), 'err');
              }
            };
            reader.readAsText(f, 'UTF-8');
          });
        }
      }, 50);
    }
    // 心得页：搜索只重绘列表容器，不动输入框本身
    // （整页 render() 会把 input 一起重建，中文输入法打到一半被中断、光标丢失）
    if (route === 'insights') {
      setTimeout(function () {
        var si = document.getElementById('insSearchInput');
        if (si && !si._bound) {
          si._bound = true;
          var timer;
          si.addEventListener('input', function (ev) {
            clearTimeout(timer);
            var v = ev.target.value;
            timer = setTimeout(function () {
              _insSearch = v;
              var l = insightListHtml();
              var box = document.getElementById('insList');
              if (box) box.innerHTML = l.html;
              var cnt = document.getElementById('insCount');
              if (cnt) cnt.textContent = l.count;
              // 有输入才出现清除按钮
              var clr = si.parentNode.querySelector('.search-clear');
              if (v && !clr) {
                var b = document.createElement('button');
                b.className = 'search-clear';
                b.setAttribute('data-search-clear', '');
                b.innerHTML = '<i class="fa-solid fa-xmark"></i>';
                si.parentNode.appendChild(b);
              } else if (!v && clr) {
                clr.parentNode.removeChild(clr);
              }
            }, 300);
          });
        }
      }, 50);
    }
  }

  /* ======================================================
   * 导出统一通道
   * 原来三处导出各自用 <a download> + Blob：桌面能下载，但 Capacitor WebView
   * 不触发下载 → 真机点了毫无反应（且三处实现还不一致）。
   * 现在统一走：原生 Share（可存到文件/发微信） → 浏览器下载 → 复制到剪贴板
   * ====================================================== */
  function exportContent(filename, mimeType, text) {
    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (isNative) {
      var FS = window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem;
      var SH = window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
      if (FS && SH && FS.writeFile && SH.share) {
        toast('正在准备文件…', 'warn');
        var dir = (window.CapacitorJSFilesystemDirectory && window.CapacitorJSFilesystemDirectory.Cache) || 'CACHE';
        var p = FS.writeFile({ path: filename, data: text, directory: dir, encoding: 'utf8' });
        return NotifApp._p(p).then(function (res) {
          var uri = res && res.uri;
          if (!uri) throw new Error('写入失败');
          return NotifApp._p(SH.share({
            title: filename,
            files: [uri],
            dialogTitle: '导出：' + filename,
          }));
        }).then(function () {
          toast('已调起系统分享', 'ok');
        }).catch(function () {
          // 分享被取消或插件不可用：退到剪贴板，至少数据拿得出来
          exportFallbackCopy(filename, text, '分享未完成');
        });
      }
      toast('原生导出不可用，已复制到剪贴板', 'warn');
      return exportFallbackCopy(filename, text, '');
    }
    // Web 预览：维持原来的浏览器下载
    try {
      var blob = new Blob([text], { type: mimeType });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast('已导出 ' + filename, 'ok');
    } catch (err) {
      exportFallbackCopy(filename, text, '导出失败');
    }
  }

  // 兜底：复制到剪贴板（老 WebView 上 execCommand 通常还能用）
  function exportFallbackCopy(filename, text, prefix) {
    var done = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, text.length);
      done = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { done = false; }
    toast(done ? ((prefix ? prefix + '，' : '') + '内容已复制，可粘贴到备忘录' )
               : ((prefix ? prefix + '，' : '') + '无法导出，请在浏览器中打开'), done ? 'warn' : 'err');
  }

  /* ======================================================
   * 首页指数 bench 异步刷新（腾讯接口，失败则保持骨架）
   * ====================================================== */
  function refreshHomeBench() {
    var el = document.querySelector('.bench-row');
    if (!el) return;
    var names = ['上证指数', '恒生指数', '纳斯达克'];
    var ok = typeof AppMarket !== 'undefined' && typeof AppMarket.getIndexes === 'function';
    if (!ok) { renderBenchFallback(el, names); return; }
    AppMarket.getIndexes(names).then(function (real) {
      if (!real || real.length === 0) { renderBenchFallback(el, names); return; }
      el.classList.remove('is-loading');
      el.innerHTML = real.map(function (b) {
        return '<div class="bench-item ' + (b.up ? 'up' : 'dn') + '">' +
          '<span class="bench-n">' + b.name + '</span>' +
          '<span class="bench-p ' + (b.up ? 'u' : 'd') + '">' + (b.up ? '▲' : '▼') + ' ' +
          (b.up ? '+' : '') + b.pct.toFixed(2) + '%</span>' +
        '</div>';
      }).join('');
    }).catch(function () {
      // 失败/超时：收尾成 --。既不无限转占位，也不回落成假数字
      renderBenchFallback(el, names);
    });
  }

  /* 行情拿不到时的收尾：显示 -- */
  function renderBenchFallback(el, names) {
    if (!el) return;
    el.classList.remove('is-loading');
    el.innerHTML = names.map(function (n) {
      return '<div class="bench-item">' +
        '<span class="bench-n">' + n + '</span>' +
        '<span class="bench-p na">--</span>' +
      '</div>';
    }).join('');
  }

  /* ======================================================
   * Chart.js 渲染（酸性配色 · 红涨绿跌）
   * ====================================================== */
  var _chartInstances = {};

  /* 首页走势图「少数据态」（I4）
     数据点不足 3 个时，Chart.js 折线会得到一条直插对角线：看着像演示假数据，
     而且读不出任何信息。这里改用「大数字 + 迷你 sparkline + 一句状态说明」，
     既保留走势的暗示，也明确告诉用户是样本不够而不是没赚钱。 */
  function renderPerfFewState(canvas, points, totalPnl) {
    var box = canvas.parentNode;
    var n = points.length || 0;
    var vals = points.map(function (p) { return Number(p.value) || 0; });
    var min = Math.min.apply(null, vals.concat([0]));
    var max = Math.max.apply(null, vals.concat([0]));
    var span = (max - min) || 1;
    var W = 120, H = 34, pad = 4;
    var stroke = totalPnl >= 0 ? CH.up : CH.down;
    var svgMid = '';
    if (n >= 2) {
      var pts = vals.map(function (v, i) {
        var x = (i / (n - 1)) * (W - pad * 2) + pad;
        var y = H - pad - ((v - min) / span) * (H - pad * 2);
        return x.toFixed(1) + ',' + y.toFixed(1);
      });
      svgMid = '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + stroke +
        '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.85"/>' +
        '<circle cx="' + pts[n - 1].split(',')[0] + '" cy="' + pts[n - 1].split(',')[1] +
        '" r="2.6" fill="' + stroke + '"/>';
    } else {
      // 0 个点：画一条虚基准线，表示"轨道已就位，等数据"
      svgMid = '<line x1="' + pad + '" y1="' + (H / 2) + '" x2="' + (W - pad) + '" y2="' + (H / 2) +
        '" stroke="#E2E2E8" stroke-width="2" stroke-dasharray="3 4" stroke-linecap="round"/>';
    }
    box.classList.add('pf-box');
    box.innerHTML =
      '<div class="perf-few">' +
        // 大数字不再重复渲染：卡片头部已有 perf-v（累计已实现盈亏），
        // 这里只补 sparkline 和状态说明，避免两个一样的大数字打架。
        '<svg class="pf-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">' + svgMid + '</svg>' +
        '<div class="pf-note">' + (n === 0
          ? '还没有月度数据，记完第一笔就开始积累曲线'
          : '数据积累中 · 已有 ' + n + ' 个月记录，满 3 个月自动出走势图') + '</div>' +
      '</div>';
  }

  function renderCharts() {
    if (typeof Chart === 'undefined') return;

    // 先销毁旧实例
    Object.keys(_chartInstances).forEach(function (k) {
      try { _chartInstances[k].destroy(); } catch (e) {}
    });
    _chartInstances = {};

    // --- Home: 收益走势 AreaChart ---
    var perfCanvas = document.getElementById('perfChart');
    if (perfCanvas) {
      var d = AppData.dashboardSummary();
      var rawPerf = d.perfData || [];
      // I4 少数据态：只有 1-2 个点时，折线图会画成一条直插的对角线——
      // 既像假数据演示，也读不出任何信息。点数 < 3 就不画 Chart.js，
      // 改渲染「大数字 + 迷你 sparkline + 状态说明」，顺带诚实说明
      // 「不是你没赚到钱，是样本还不够」。
      if (rawPerf.length < 3) {
        renderPerfFewState(perfCanvas, rawPerf, d.realizedPnl);
      } else {
      var data = rawPerf;
      // 如果只有一个点，至少补一个起点
      if (data.length === 1) {
        var first = data[0];
        data = [{ month: '起点', value: 0 }, first];
      }

      var allNeg = data.every(function (p) { return p.value <= 0; });
      var strokeColor = allNeg ? CH.down : CH.up;
      var fillColor = 'rgba(' + hexToRgb(allNeg ? CH.down : CH.up) + ',';

      _chartInstances.perf = new Chart(perfCanvas, {
        type: 'line',
        data: {
          labels: data.map(function (p) { return p.month; }),
          datasets: [{
            label: '累计盈亏',
            data: data.map(function (p) { return p.value; }),
            borderColor: strokeColor,
            borderWidth: 2,
            fill: true,
            backgroundColor: function (ctx) {
              var area = ctx.chart.chartArea;
              if (!area) return fillColor + '0.06)';
              var g = ctx.chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
              g.addColorStop(0, fillColor + '0.20)');
              g.addColorStop(1, fillColor + '0.01)');
              return g;
            },
            tension: 0.35,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointBackgroundColor: strokeColor,
            pointBorderColor: '#FFF',
            pointBorderWidth: 2,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: '#FFF',
              borderColor: CH.line,
              borderWidth: 1,
              titleColor: CH.ink,
              bodyColor: CH.ink,
              padding: 10,
              cornerRadius: 10,
              callbacks: {
                label: function (ctx) {
                  var v = ctx.parsed.y;
                  return yuanDelta(v, true);
                }
              }
            }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: CH.ink2, font: { size: 10 } }
            },
            y: {
              grid: { color: 'rgba(0,0,0,0.05)' },
              border: { display: false },
              ticks: {
                color: CH.ink2,
                font: { size: 10 },
                callback: function (v) { return (v > 0 ? '+' : v < 0 ? '-' : '') + '¥' + Math.abs(v / 1000).toFixed(0) + 'k'; }
              }
            }
          },
          interaction: { intersect: false, mode: 'index' },
          animation: { duration: 500, easing: 'easeOutQuart' },
        }
      });
      }
    }

    // --- Trades: 月度盈亏趋势（盈亏柱状图 + 累计盈亏面积图） ---
    var tradesCanvas = document.getElementById('tradesBarChart');
    if (tradesCanvas) {
      if (typeof AppData.monthlyTradeStats !== 'function') return;
      var monthly = AppData.monthlyTradeStats();
      if (monthly.length === 0) {
        tradesCanvas.parentElement.innerHTML = '<div class="empty"><i class="fa-regular fa-chart-bar"></i> 暂无月度数据</div>';
        return;
      }
      var ctx = tradesCanvas.getContext('2d');
      var labels = monthly.map(function (m) { return m.month.slice(5) + '月'; });
      var pnlData = monthly.map(function (m) { return Math.round(m.realizedPnL || 0); });
      var cumulative = [];
      monthly.reduce(function (acc, m) {
        var next = acc + (m.realizedPnL || 0);
        cumulative.push(Math.round(next));
        return next;
      }, 0);
      var barGradPos = ctx.createLinearGradient(0, 0, 0, tradesCanvas.height || 220);
      barGradPos.addColorStop(0, 'rgba(' + hexToRgb(CH.up) + ',' + '0.85)');
      barGradPos.addColorStop(1, 'rgba(' + hexToRgb(CH.up) + ',' + '0.45)');
      var barGradNeg = ctx.createLinearGradient(0, 0, 0, tradesCanvas.height || 220);
      barGradNeg.addColorStop(0, 'rgba(' + hexToRgb(CH.down) + ',' + '0.85)');
      barGradNeg.addColorStop(1, 'rgba(' + hexToRgb(CH.down) + ',' + '0.45)');
      var areaGrad = ctx.createLinearGradient(0, 0, 0, tradesCanvas.height || 220);
      areaGrad.addColorStop(0, 'rgba(' + hexToRgb(CH.blue) + ',' + '0.22)');
      areaGrad.addColorStop(1, 'rgba(' + hexToRgb(CH.blue) + ',' + '0.02)');

      _chartInstances.tradesBar = new Chart(tradesCanvas, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: '月度盈亏',
              data: pnlData,
              backgroundColor: pnlData.map(function (v) { return v >= 0 ? barGradPos : barGradNeg; }),
              borderRadius: 6,
              borderSkipped: false,
              maxBarThickness: 22,
              categoryPercentage: 0.65,
              barPercentage: 0.85,
              order: 2,
            },
            {
              label: '累计盈亏',
              data: cumulative,
              type: 'line',
              yAxisID: 'y1',
              borderColor: CH.blue,
              backgroundColor: areaGrad,
              borderWidth: 2.5,
              tension: 0.4,
              fill: true,
              pointRadius: 4,
              pointBackgroundColor: '#FFF',
              pointBorderColor: CH.blue,
              pointBorderWidth: 2,
              pointHoverRadius: 6,
              order: 1,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { mode: 'index', intersect: false },
          plugins: {
            legend: {
              labels: { color: CH.ink2, font: { size: 10 }, boxWidth: 10, padding: 12, usePointStyle: true },
              position: 'top',
            },
            tooltip: {
              backgroundColor: '#FFF',
              titleColor: CH.ink,
              bodyColor: CH.ink,
              borderColor: CH.line,
              borderWidth: 1,
              cornerRadius: 12,
              padding: 12,
              displayColors: true,
              callbacks: {
                label: function (ctx) {
                  var idx = ctx.dataIndex;
                  var m = monthly[idx];
                  if (ctx.dataset.label === '月度盈亏') {
                    return '月度盈亏: ' + yuanDelta(ctx.raw, true);
                  }
                  if (ctx.dataset.label === '累计盈亏') {
                    return '累计盈亏: ' + yuanDelta(ctx.raw, true);
                  }
                  return ctx.dataset.label + ': ¥' + ctx.raw.toLocaleString();
                },
                afterBody: function (ctx) {
                  var idx = ctx[0].dataIndex;
                  var m = monthly[idx];
                  return [
                    '买入: ¥' + Math.round(m.buyAmt || 0).toLocaleString(),
                    '卖出: ¥' + Math.round(m.sellAmt || 0).toLocaleString(),
                    '笔数: ' + (m.tradeCount || 0) + ' 笔'
                  ];
                }
              },
            },
          },
          scales: {
            x: {
              ticks: { color: CH.ink2, font: { size: 10 } },
              grid: { display: false },
            },
            y: {
              position: 'left',
              border: { display: false },
              ticks: { color: CH.ink2, font: { size: 10 }, callback: function (v) { return (v / 1000).toFixed(0) + 'k'; } },
              grid: { color: 'rgba(0,0,0,0.05)' },
              title: { display: true, text: '月度盈亏', color: CH.ink2, font: { size: 9 } },
            },
            // 累计盈亏走右轴：它和月度盈亏差一个量级，共用一根轴会把柱子压扁到看不见
            y1: {
              position: 'right',
              border: { display: false },
              grid: { display: false },
              ticks: { color: CH.ink2, font: { size: 10 }, callback: function (v) { return (v / 1000).toFixed(0) + 'k'; } },
              title: { display: true, text: '累计盈亏', color: CH.ink2, font: { size: 9 } },
            },
          },
          animation: { duration: 500, easing: 'easeOutQuart' },
        },
      });
    }

    // --- Discipline: 6 月违规 BarChart ---
    var vioCanvas = document.getElementById('vioBarChart');
    if (vioCanvas) {
      if (typeof AppDiscipline === 'undefined') return;
      var vioData = AppDiscipline.violationStats(AppData.getViolations(), AppData.getTrades());
      _chartInstances.vioBar = new Chart(vioCanvas, {
        type: 'bar',
        data: {
          labels: vioData.map(function (m) { return m.month; }),
          datasets: [
            {
              label: '交易笔数',
              data: vioData.map(function (m) { return m.compliant; }),
              backgroundColor: CH.blue,
              borderWidth: 0,
              borderRadius: 4,
              maxBarThickness: 14,
              categoryPercentage: 0.55,
              barPercentage: 0.85,
            },
            {
              label: '违规次数',
              data: vioData.map(function (m) { return m.violated; }),
              backgroundColor: CH.up,
              borderWidth: 0,
              borderRadius: 4,
              maxBarThickness: 14,
              categoryPercentage: 0.55,
              barPercentage: 0.85,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: CH.ink2, font: { size: 10 }, boxWidth: 10, padding: 12 }, position: 'top' },
            tooltip: { backgroundColor: '#FFF', titleColor: CH.ink, bodyColor: CH.ink, borderColor: CH.line, borderWidth: 1, cornerRadius: 10, padding: 10 },
          },
          scales: {
            x: { ticks: { color: CH.ink2, font: { size: 10 } }, grid: { display: false } },
            y: { beginAtZero: true, border: { display: false }, ticks: { color: CH.ink2, font: { size: 10 }, stepSize: 1 }, grid: { color: 'rgba(0,0,0,0.05)' } },
          },
          animation: { duration: 500, easing: 'easeOutQuart' },
        },
      });
    }
  }

  /* ======================================================
   * 事件委托（全局）
   * ====================================================== */
  function bindSeg() {
    document.querySelectorAll('.seg').forEach(g => {
      g.querySelectorAll('input').forEach(inp => {
        inp.addEventListener('change', () => {
          g.querySelectorAll('.seg-o').forEach(o => o.classList.remove('on'));
          if (inp.checked) inp.closest('.seg-o').classList.add('on');
        });
      });
    });
  }

  document.addEventListener('click', (e) => {
    const yearStep = e.target.closest('[data-kpi-year]');
    if (yearStep) {
      _kpiYear += Number(yearStep.getAttribute('data-kpi-year'));
      _kpiMonth = '';
      showKpiDetail('month');
      return;
    }
    const monthCell = e.target.closest('[data-kpi-month]');
    if (monthCell) {
      _kpiMonth = monthCell.getAttribute('data-kpi-month');
      showKpiDetail('month');
      return;
    }
    const kpiCard = e.target.closest('[data-kpi]');
    if (kpiCard) {
      haptic('light');
      showKpiDetail(kpiCard.getAttribute('data-kpi'));
      return;
    }
    if (e.target.closest('[data-open-pnl]')) {
      haptic('light');
      showTodayPnlDetail();
      return;
    }
    // 路由跳转
    const goto = e.target.closest('[data-goto]');
    if (goto) {
      const r = goto.getAttribute('data-goto');
      if (r && ROUTES.includes(r)) { navigate(r); return; }
    }
    // 底部 Tab
    const bnItem = e.target.closest('.bn-item');
    if (bnItem) {
      const r = bnItem.getAttribute('data-route');
      if (r) { haptic('select'); navigate(r); }
      return;
    }
    // 顶部胶囊
    const tag = e.target.closest('.hd-tag');
    if (tag) { navigate('home'); return; }
    // 通知铃铛 → 消息中心页
    const bell = e.target.closest('#bellBtn');
    if (bell) { navigate('notices'); return; }

    // --- 首页持仓：点开看明细 ---
    // 持仓行在视觉上一直是"可点"的（有选中态背景），但点了没反应，属于假的交互承诺。
    // 这里给它一个真行为：弹出这只票的持仓明细。
    const posRow = e.target.closest('[data-pos]');
    if (posRow) {
      var pcode = posRow.getAttribute('data-pos');
      var dsum = AppData.dashboardSummary();
      var prow = (dsum.positions || []).filter(function (x) { return x.stockCode === pcode; })[0];
      if (prow) Modals.positionDetail(prow);
      return;
    }

    // --- 持仓明细 → 记一笔卖出（预填代码/名称/现价/持股数，链路不断裂） ---
    const posSell = e.target.closest('[data-pos-sell]');
    if (posSell) {
      var scode = posSell.getAttribute('data-pos-sell');
      var dsum2 = AppData.dashboardSummary();
      var prow2 = (dsum2.positions || []).filter(function (x) { return x.stockCode === scode; })[0];
      closeModal();
      Modals.addTrade({
        type: 'sell',
        stockCode: scode,
        stockName: prow2 ? prow2.stockName : '',
        quantity: prow2 ? prow2.shares : '',
        price: prow2 ? prow2.currentPrice : '',
      });
      return;
    }

    // --- 交易记录 ---
    if (e.target.closest('[data-open-add-trade]')) Modals.addTrade();
    const delT = e.target.closest('[data-del-trade]');
    if (delT) {
      removeWithUndo('trade', delT.getAttribute('data-del-trade'), '交易', '确认删除这笔交易？');
      return;
    }
    // 编辑交易：预填原记录。录错只能删+5秒撤销，窗口一过就永久丢失
    const editT = e.target.closest('[data-edit-trade]');
    if (editT) {
      editTradeById(editT.getAttribute('data-edit-trade'));
      return;
    }
    // CSV 导出
    if (e.target.closest('[data-trade-export]')) {
      if (typeof AppData.csvExportTrades !== 'function') { toast('导出函数未就绪', 'err'); return; }
      const csv = AppData.csvExportTrades();
      const fn = 'trades_' + new Date().toISOString().slice(0, 10) + '.csv';
      exportContent(fn, 'text/csv;charset=utf-8', '\ufeff' + csv);
      return;
    }
    // CSV 导入（触发隐藏 file input）
    if (e.target.closest('[data-trade-import]')) {
      const input = document.getElementById('tradeCsvInput');
      if (input) { input.value = ''; input.click(); }
      return;
    }

    // --- 股票池 ---
    if (e.target.closest('[data-open-add-pool]')) Modals.addPool();
    if (e.target.closest('[data-open-batch-pool]')) Modals.batchAddPool();
    // Tab 切换
    const poolTab = e.target.closest('[data-pool-tab]');
    if (poolTab) {
      _poolTab = poolTab.getAttribute('data-pool-tab');
      haptic('select');
      render();
      return;
    }
    // 刷新行情
    const refreshBtn = e.target.closest('[data-refresh-prices]');
    if (refreshBtn) {
      var poolStocks = AppData.getStockPool();
      if (poolStocks.length === 0) { toast('股票池为空', 'warn'); return; }
      if (typeof AppMarket === 'undefined') { toast('市场服务未加载', 'err'); return; }
      // 进入 loading：按钮转圈 + 价格就地占位。
      // Android 上连点会打出多次网络请求，必须把按钮锁住
      var clearLoading = function () {
        refreshBtn.classList.remove('is-loading');
        refreshBtn.disabled = false;
        var sk = document.querySelectorAll('.pool-price .sk');
        for (var i = 0; i < sk.length; i++) sk[i].classList.remove('sk');
      };
      refreshBtn.classList.add('is-loading');
      refreshBtn.disabled = true;
      var pe = document.querySelectorAll('.pool-price .pp-now, .pool-price .pp-chg');
      for (var j = 0; j < pe.length; j++) pe[j].classList.add('sk');
      refreshQuotes(AppData.getQuoteTargets()).then(function (n) {
        toast('已更新 ' + n + ' 只股票现价', n > 0 ? 'ok' : 'warn');
        // 持仓级纪律扫描（仓位占比/浮亏率/日盈亏/日内涨跌幅）——只在拿到最新行情后评估
        if (n > 0 && typeof AppDiscipline !== 'undefined' && AppDiscipline.scanPositions) {
          try {
            var qmap = new Map();
            AppData.getQuoteTargets().forEach(function (u) { qmap.set(String(u.code).toUpperCase(), { changePercent: u.changePercent }); });
            var acctVios = AppDiscipline.scanPositions({ quotes: qmap });
            if (acctVios.length > 0) toast('纪律提醒：' + acctVios.length + ' 条账户级规则触发，见违规台账', 'warn');
          } catch (_) {}
        }
        // render() 会整页重绘，loading 态随之消失；没有变更时才需要手动收尾
        if (n > 0) render(); else clearLoading();
        haptic('light');
      }).catch(function (err) {
        toast('行情拉取失败：' + ((err && err.message) || '网络异常'), 'err');
        clearLoading();
      });
      return;
    }
    const delP = e.target.closest('[data-del-pool]');
    if (delP) {
      removeWithUndo('pool', delP.getAttribute('data-del-pool'), '自选', '确认从股票池移除？');
      return;
    }
    // 编辑自选（整卡点击或铅笔按钮）
    const editP = e.target.closest('[data-edit-pool]');
    if (editP) {
      editPoolById(editP.getAttribute('data-edit-pool'));
      return;
    }
    // 行业标签：真过滤（原来只弹一句"后续加过滤"，点了没反应等于半成品外露）
    const secChip = e.target.closest('[data-sector]');
    if (secChip) {
      const s = secChip.getAttribute('data-sector');
      _poolSector = (_poolSector === s) ? '' : s;
      haptic('select');
      render();
      return;
    }

    // --- 心得 ---
    if (e.target.closest('[data-open-add-ins]')) Modals.addIns();
    const delI = e.target.closest('[data-del-ins]');
    if (delI) {
      removeWithUndo('insight', delI.getAttribute('data-del-ins'), '心得', '确认删除这篇心得？');
      return;
    }
    // 点击心得卡 → 全文详情弹窗
    const openIns = e.target.closest('[data-open-ins]');
    if (openIns) {
      Modals.insightDetail(openIns.getAttribute('data-open-ins'));
      return;
    }
    // 标签云筛选
    const tagF = e.target.closest('[data-tag-filter]');
    if (tagF) {
      _insTagFilter = (_insTagFilter === tagF.getAttribute('data-tag-filter')) ? '' : tagF.getAttribute('data-tag-filter');
      render();
      return;
    }
    if (e.target.closest('[data-tag-clear]')) {
      _insTagFilter = '';
      render();
      return;
    }
    // 排序切换
    const sortBtn = e.target.closest('[data-ins-sort]');
    if (sortBtn) {
      _insSort = sortBtn.getAttribute('data-ins-sort');
      render();
      return;
    }
    // 清除搜索
    if (e.target.closest('[data-search-clear]')) {
      _insSearch = '';
      render();
      return;
    }

    // --- 纪律系统 ---
    if (e.target.closest('[data-open-add-rule]')) Modals.addRule();
    if (e.target.closest('[data-open-template-rule]')) Modals.addRuleFromTemplate();
    // 从模板添加规则 → 先进入编辑器改阈值，确认后才入库
    const tplBtn = e.target.closest('[data-tpl]');
    if (tplBtn) {
      var tplIdx = parseInt(tplBtn.getAttribute('data-tpl'));
      if (!isNaN(tplIdx) && RULE_TEMPLATES[tplIdx]) {
        var t = RULE_TEMPLATES[tplIdx];
        Modals.ruleEditor({
          name: t.name,
          description: t.description,
          severity: t.severity,
          conditions: [{ type: t.type, operator: t.operator, value: t.value, parameter: t.parameter || '' }],
        }, false);
      }
      return;
    }
    // 规则行内的启用开关：必须先于「点击规则行编辑」判断，否则开关点击会被整行编辑吞掉
    const swRule = e.target.closest('[data-sw-rule]');
    if (swRule) {
      const id = swRule.getAttribute('data-sw-rule');
      AppData.toggleRule(id);
      haptic('select');
      toast('规则状态已切换');
      render();
      return;
    }
    // 点击规则行 → 编辑规则
    const editRule = e.target.closest('[data-edit-rule]');
    if (editRule) {
      var ruleId = editRule.getAttribute('data-edit-rule');
      var ruleObj = AppData.getRules().find(function (r) { return r.id === ruleId; });
      if (ruleObj) Modals.ruleEditor(ruleObj, true);
      return;
    }
    // 删除违规记录
    const delVio = e.target.closest('[data-del-violation]');
    if (delVio) {
      removeWithUndo('violation', delVio.getAttribute('data-del-violation'), '违规记录', '确认删除这条违规记录？');
      return;
    }
    // 标记单条违规已处理
    const resVio = e.target.closest('[data-resolve-violation]');
    if (resVio) {
      AppData.resolveViolation(resVio.getAttribute('data-resolve-violation'));
      haptic('select');
      toast('已标记为已处理', 'ok');
      render();
      return;
    }
    // 全部标记已处理
    const resAllVio = e.target.closest('[data-resolve-all-violations]');
    if (resAllVio) {
      var pendList = AppData.getViolations().filter(function (v) { return v.status !== 'resolved'; });
      pendList.forEach(function (v) { AppData.resolveViolation(v.id); });
      haptic('select');
      toast('已处理 ' + pendList.length + ' 条违规', 'ok');
      render();
      return;
    }

    // --- AI ---
    const ai = e.target.closest('[data-ai]');
    if (ai) { Modals.aiResult(ai.getAttribute('data-ai')); return; }

    // --- AI 对话：未配置 Key 时的「去设置配置 Key」出口 ---
    if (e.target.closest('[data-goto-ai-config]')) {
      _settingsTab = 'ai';          // 直接落到设置页的 AI 配置 Tab，别让用户再找一遍
      navigate('settings');
      return;
    }
    // --- AI Tab 切换 ---
    const aiTab = e.target.closest('[data-ai-tab]');    if (aiTab) {
      _aiTab = aiTab.getAttribute('data-ai-tab');
      render();
      return;
    }
    // --- AI 对话发送 ---
    const sendBtn = e.target.closest('[data-ai-send]');
    if (sendBtn) {
      var input = document.getElementById('chatInput');
      if (!input) return;
      sendAiChatMessage(String(input.value || '').trim());
      return;
    }
    // --- AI 对话重试（失败气泡上的按钮） ---
    const retryEl = e.target.closest('[data-ai-retry]');
    if (retryEl) {
      retryAiChat(Number(retryEl.getAttribute('data-ai-retry')));
      return;
    }
  /* 发送一条 AI 对话消息（按钮点击与回车发送共用同一条路径，避免两处逻辑分叉）。
     发送前先固定本轮回复要回填的下标：原来用 length-1 定位，连发两条时
     两条响应都写到最后一条上，先到的答案会被后到的覆盖丢失。
     retryIdx 用于「重试」：复用同一助手气泡槽位，不再新建对话。 */
  function sendAiChatMessage(q, retryIdx) {
    if (!q) return;
    var replyIdx;
    if (retryIdx != null) {
      // 重试：清空该助手气泡为「思考中」，复用原槽位
      replyIdx = retryIdx;
      _aiChat[replyIdx] = { role: 'assistant', content: '', typing: true, mid: (_aiChat[replyIdx] && _aiChat[replyIdx].mid) || (++_aiChatSeq) };
    } else {
      var input = document.getElementById('chatInput');
      replyIdx = _aiChat.length + 1;
      _aiChat.push({ role: 'user', content: q, mid: ++_aiChatSeq });
      _aiChat.push({ role: 'assistant', content: '', typing: true, mid: ++_aiChatSeq });
      if (input) input.value = '';
    }
    render();
    // render() 会重建输入框，重新聚焦，省得每问一句都要再点一次输入框
    var input2 = document.getElementById('chatInput');
    if (input2) input2.focus();
    // 异步请求 AI
    var cfg2 = AppData.getConfig();
    // 每轮读取当前账本，保证追问也知道真实持仓；交易、规则和心得按问题补充。
    // 只截取本轮回复之前的消息，避免并发提问时把后续问题混入较早请求。
    var allHistory = _aiChat.slice(0, replyIdx).filter(function (m) { return !m.typing && m.content; })
      .map(function (m) { return { role: m.role, content: m.content }; });
    var userTurns = allHistory.filter(function (m) { return m.role === 'user'; });
    var previousQ = userTurns.length > 1 ? userTurns[userTurns.length - 2].content : '';
    var accountContext = AppData.buildAiChatContext(q, previousQ);
    var history = allHistory.slice(-16); // 最多保留最近约 8 轮原文
    function historyChars(items) { return items.reduce(function (n, m) { return n + m.content.length; }, 0); }
    var historyBudget = Math.max(2000, 12000 - accountContext.length);
    while (history.length > 1 && historyChars(history) > historyBudget) history.shift();
    var older = allHistory.slice(0, allHistory.length - history.length);
    var olderSummaries = [];
    for (var hi = 0; hi < older.length; hi++) {
      if (older[hi].role !== 'user') continue;
      var oldAnswer = older[hi + 1] && older[hi + 1].role === 'assistant' ? older[hi + 1].content : '';
      olderSummaries.push('问：' + older[hi].content.replace(/\s+/g, ' ').slice(0, 60) +
        (oldAnswer ? '；答：' + oldAnswer.replace(/\s+/g, ' ').slice(0, 120) : ''));
    }
    olderSummaries = olderSummaries.slice(-4);
    var sysPrompt = aiSystemPrompt() + '\n\n' + accountContext;
    if (olderSummaries.length) sysPrompt += '\n较早对话摘要（节选，最新账本数据以上方快照为准）：' + olderSummaries.join('\n');
    // 持仓分析比 ping 慢得多；给模型完整生成时间，同时保留可中止的总时限。
    var chatTimeoutMs = 90000;
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = (ctrl && setTimeout) ? setTimeout(function () { try { ctrl.abort(); } catch (_) {} }, chatTimeoutMs) : null;
    _aiChat[replyIdx].ctrl = ctrl;
    var mid = _aiChat[replyIdx].mid;
    aiFetch(cfg2.aiApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfg2.aiApiKey },
      signal: ctrl ? ctrl.signal : undefined,
      body: JSON.stringify({
        model: cfg2.aiModel,
        messages: [
          { role: 'system', content: sysPrompt },
        ].concat(history),
        max_tokens: 900,
        temperature: 0.4,
      }),
      readTimeout: chatTimeoutMs,
    }).then(function(r) {
      if (timer) clearTimeout(timer);
      if (!r.ok) return r.json().then(function (body) {
        var detail = body && body.error && (body.error.message || body.error.code) || body && body.message || '';
        throw new Error('HTTP ' + r.status + (detail ? '：' + String(detail).slice(0, 100) : ''));
      }, function () { throw new Error('HTTP ' + r.status); });
      return r.json();
    }).then(function(data) {
      var choice = data.choices && data.choices[0];
      var text = choice && choice.message && choice.message.content || '';
      var cleaned = postProcessAiText(text);
      if (!cleaned) throw new Error(choice && choice.finish_reason === 'length' ? '模型输出达到长度上限' : '模型返回空正文');
      _aiChat[replyIdx] = { role: 'assistant', content: cleaned, mid: mid };
      render();
    }).catch(function(err) {
      if (timer) clearTimeout(timer);
      var aborted = ctrl && ctrl.signal && ctrl.signal.aborted;
      _aiChat[replyIdx] = {
        role: 'assistant',
        content: (aborted ? '⏱ 请求超时（90 秒），模型尚未完成回答。' : '⚠ 请求失败：' + (err.message || String(err))),
        error: true,
        origQ: q,
        mid: mid,
      };
      render();
    });
  }
  // 重试某条失败的助手消息（按消息 id 定位槽位）
  function retryAiChat(mid) {
    for (var i = 0; i < _aiChat.length; i++) {
      var m = _aiChat[i];
      if (m && m.mid === mid && m.error && m.origQ) { sendAiChatMessage(m.origQ, i); return; }
    }
  }
    // --- 打开 AI 报告详情 ---
    const openRpt = e.target.closest('[data-open-report]');
    if (openRpt && !e.target.closest('[data-del-report]')) {
      Modals.aiReportDetail(openRpt.getAttribute('data-open-report'));
      return;
    }
    // --- 删除 AI 报告 ---
    const delRpt = e.target.closest('[data-del-report]');
    if (delRpt) {
      removeWithUndo('report', delRpt.getAttribute('data-del-report'), '报告', '确认删除这份报告？');
      return;
    }

    // --- 设置 Tab 切换 ---
    const tabSw = e.target.closest('[data-sw-tab]');
    if (tabSw) {
      var tab = tabSw.getAttribute('data-tab');
      if (tab) { _settingsTab = tab; haptic('select'); render(); return; }
    }


    // --- 本地通知：设置页按钮 ---
    if (e.target.closest('[data-notif-perm]')) { NotifApp.checkPermission(); return; }
    if (e.target.closest('[data-notif-test]')) { NotifApp.testNotification(); return; }
    if (e.target.closest('[data-notif-schedule]')) { NotifApp.applySchedules(); toast('日程已刷新', 'ok'); return; }
    const swN = e.target.closest('[data-sw-notif]');
    if (swN) {
      var nk = swN.getAttribute('data-sw-notif');
      var cfg0 = AppData.getConfig();
      var next = Object.assign({}, cfg0.notif || {});
      // 渲染口径是 notif.X !== false 视为「开」；首次点击时 next[nk] 为 undefined，
      // 旧逻辑 !undefined = true 仍是「开」，视觉上像没反应。改为与渲染口径对齐：
      // 当前开（!==false）则关（false），当前关（===false）则开（true）。
      next[nk] = (next[nk] !== false) ? false : true;
      AppData.setConfig(Object.assign({}, cfg0, { notif: next }));
      swN.classList.toggle('on', next[nk] !== false);
      haptic('select');
      // 取同一行的中文标题，别把 prefMkt 这种内部键名直接抛给用户
      var rowEl = swN.closest('.set-row');
      var titleEl = rowEl && rowEl.querySelector('.set-t');
      toast((next[nk] ? '已开启' : '已关闭') + '：' + (titleEl ? titleEl.textContent : nk), 'ok');
      NotifApp.applySchedules();
      return;
    }

    // --- 设置页：汇率刷新 ---
    const fxBtn = e.target.closest('[data-refresh-fx]');
    if (fxBtn) {
      if (typeof AppMarket === 'undefined' || !AppMarket.refreshFxRates) { toast('汇率模块不可用', 'err'); return; }
      toast('正在刷新汇率…');
      AppMarket.refreshFxRates().then(function (fx) {
        if (fx && !fx.fallback) {
          toast('汇率已更新：1美元=¥' + fx.USD.toFixed(2) + ' · 1港币=¥' + fx.HKD.toFixed(2), 'ok');
        } else {
          toast('汇率刷新失败，请检查网络', 'err');
        }
        haptic('light');
        render();
      });
      return;
    }

    // --- 设置页：触感反馈开关 ---
    const swH = e.target.closest('[data-sw-haptic]');
    if (swH) {
      var cfgH = AppData.getConfig();
      var nextH = !(cfgH.haptic !== false);
      AppData.setConfig(Object.assign({}, cfgH, { haptic: nextH }));
      swH.classList.toggle('on', nextH);
      // 开启时立刻给一下，让用户知道打开的是什么（关闭时当然不该再震）
      if (nextH) haptic('light');
      toast(nextH ? '已开启触感反馈' : '已关闭触感反馈', 'ok');
      return;
    }

    // --- 设置页：显示/隐藏 API Key ---
    if (e.target.closest('[data-toggle-key]')) {
      var kInp = document.getElementById('aiKeyInput');
      if (kInp) {
        kInp.type = (kInp.type === 'password') ? 'text' : 'password';
        var kIc = e.target.closest('[data-toggle-key]').querySelector('i');
        if (kIc) kIc.className = (kInp.type === 'password') ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
      }
      return;
    }

    // --- 设置页：AI 配置 ---
    if (e.target.closest('[data-set-ai]')) {
      var k = (document.getElementById('aiKeyInput') || {}).value || '';
      var u = resolveAiUrl((document.getElementById('aiUrlInput') || {}).value || '');
      var m = String((document.getElementById('aiModelInput') || {}).value || '').trim();
      if (!m) { toast('请填写模型 ID', 'err'); return; }
      // URL 必须由用户填写且无校验：填成 http 或陌生域名会把 Key 与全部持仓交易数据
      // 明文发过去，且报错莫名其妙（空 URL 会 fetch 当前页）。这里强制 https。
      if (u && !/^https:\/\/[^\s]+/i.test(u)) {
        toast('API URL 必须是以 https:// 开头的完整地址，已拒绝保存', 'err');
        return;
      }
      AppData.setAiConfig(k, u, m);
      toast('AI 配置已保存', 'ok');
      render();
      return;
    }
    if (e.target.closest('[data-test-ai]')) {
      var cfgTest = AppData.getConfig();
      if (!cfgTest.aiApiKey) { toast('请先填写 API Key', 'err'); return; }
      toast('⏳ 正在连接 ' + cfgTest.aiModel + ' ...', 'warn');
      aiFetch(cfgTest.aiApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + cfgTest.aiApiKey },
        body: JSON.stringify({
          model: cfgTest.aiModel,
          messages: [{ role: 'user', content: 'ping, 回复 OK 即可' }],
          max_tokens: 10,
        }),
      }).then(function (r) {
        if (r.ok) return r.json();
        return r.json().then(function (body) {
          var detail = body && body.error && body.error.message || body && body.message || '';
          throw new Error('HTTP ' + r.status + (detail ? '：' + String(detail).slice(0, 120) : ''));
        }, function () { throw new Error('HTTP ' + r.status); });
      }).then(function () { toast('接口连通（短请求测试成功）', 'ok'); })
        .catch(function (err) { toast('AI 连接失败：' + err.message, 'err'); });
      return;
    }

    // --- 设置页：导出全部 JSON ---
    if (e.target.closest('[data-export-all]')) {
      try {
        var json = AppData.exportAll();
        var ts = new Date().toISOString().slice(0, 10);
        exportContent('投资看板-backup-' + ts + '.json', 'application/json', json);
      } catch (err) { toast('导出失败：' + err.message, 'err'); }
      return;
    }
    // --- 设置页：导出交易 CSV ---
    if (e.target.closest('[data-export-csv]')) {
      try {
        var trades = AppData.getTrades();
        var csv = trades.map(function (t) {
          return [
            t.id, t.stockCode, t.stockName, t.type, t.quantity, t.price, t.fee,
            (t.tags || []).join('|'), t.timestamp || '', (t.notes || '').replace(/,/g, '，').replace(/\n/g, ' ')
          ].map(function (v) { var s = String(v == null ? '' : v); return s.indexOf(',') >= 0 || s.indexOf('"') >= 0 ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',');
        });
        csv.unshift('id,stockCode,stockName,type,quantity,price,fee,tags,timestamp,notes');
        var ts2 = new Date().toISOString().slice(0, 10);
        exportContent('投资看板-trades-' + ts2 + '.csv', 'text/csv;charset=utf-8', '\ufeff' + csv.join('\n'));
      } catch (err) { toast('CSV 导出失败：' + err.message, 'err'); }
      return;
    }

    // --- 设置页：导入 JSON ---
    if (e.target.closest('[data-import-json]')) {
      var fj = document.getElementById('importJsonFile');
      if (!fj) return;
      fj.value = '';
      fj.onchange = function () {
        var f = fj.files && fj.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          try {
            var cnt = AppData.importAll(String(r.result));
            toast('已导入 ' + cnt + ' 类数据', 'ok');
            render();
          } catch (err) { toast('导入失败：' + err.message, 'err'); }
        };
        r.readAsText(f, 'utf-8');
      };
      fj.click();
      return;
    }
    // --- 设置页：导入 CSV ---
    if (e.target.closest('[data-import-csv]')) {
      var fc = document.getElementById('importCsvFile');
      if (!fc) return;
      fc.value = '';
      fc.onchange = function () {
        var f = fc.files && fc.files[0];
        if (!f) return;
        var r = new FileReader();
        r.onload = function () {
          try {
            // Papaparse 是全局 CDN
            var rows = (typeof Papa !== 'undefined') ? Papa.parse(String(r.result), { header: true, skipEmptyLines: true }).data
              : String(r.result).split('\n').slice(1).map(function (l) { return l.split(','); }).map(function (a) {
                  return { id: a[0], stockCode: a[1], stockName: a[2], type: a[3], quantity: parseFloat(a[4]), price: parseFloat(a[5]), fee: parseFloat(a[6]), timestamp: a[8], notes: a[9] };
                });
            var added = 0;
            rows.forEach(function (row) {
              if (!row.stockCode || !row.stockName || !row.quantity || !row.price) return;
              AppData.addTrade({
                stockCode: row.stockCode,
                stockName: row.stockName,
                type: (row.type || 'buy').toLowerCase() === 'sell' ? 'sell' : 'buy',
                quantity: Number(row.quantity) || 0,
                price: Number(row.price) || 0,
                fee: Number(row.fee) || 0,
                notes: row.notes || '',
                timestamp: row.timestamp || '',
              });
              added++;
            });
            toast('已导入 ' + added + ' 条交易', 'ok');
            render();
          } catch (err) { toast('❌ CSV 导入失败：' + err.message, 'err'); }
        };
        r.readAsText(f, 'utf-8');
      };
      fc.click();
      return;
    }

    // --- 设置页：一键重置 ---
    if (e.target.closest('[data-reset-all]')) {
      uiConfirm('⚠️ 将清空所有自定义数据并恢复 seed，AI API Key 会保留。\n\n确定？此操作不可撤销！', function () {
        AppData.clearAll();
        toast('已重置为 seed 数据', 'warn');
        _settingsTab = 'profile';
        render();
      });
      return;
    }

    // --- 旧 data-set-act 兼容（纪律系统/交易心得入口已换成 data-goto） ---
    const setAct = e.target.closest('[data-set-act]');
    if (setAct) {
      var t = setAct.getAttribute('data-set-act');
      if (t === '纪律系统') navigate('discipline');
      else if (t === '交易心得') navigate('insights');
      else toast('[' + t + '] 已迁移到设置 Tab 3「数据」', 'warn');
      return;
    }

    // --- 列表行：轻点行 = 该行主操作（行内已无常驻图标，编辑/删除靠左滑或长按） ---
    const tapRow = e.target.closest('[data-sw-row]');
    if (tapRow && !e.target.closest('.sw-acts')) {
      var rk = tapRow.getAttribute('data-sw-row');
      var rid = tapRow.getAttribute('data-row-id');
      if (rk === 'trade') { editTradeById(rid); return; }
      if (rk === 'pool') { editPoolById(rid); return; }
      if (rk === 'vio') { RowAct.menu(tapRow); return; }
    }
  });

  /* 开屏：原来 3.6s 且不可跳过，等得久又逃不掉。
     压到 2.0s（CSS）+ 允许点击/触摸提前跳过，结束后从 DOM 移除，
     不留一层透明遮罩挡住页面交互。 */
  function setupSplash() {
    var sp = document.getElementById('app-splash');
    if (!sp) return;
    var removed = false;
    var remove = function () {
      if (removed) return;
      removed = true;
      if (sp.parentNode) sp.parentNode.removeChild(sp);
    };
    var dismiss = function () {
      if (sp.dataset.skip) return;
      sp.dataset.skip = '1';
      sp.style.animation = 'splash-bg-out 0.28s ease forwards';
      setTimeout(remove, 320);
    };
    sp.addEventListener('click', dismiss);
    sp.addEventListener('touchstart', dismiss, { passive: true });
    setTimeout(remove, 2600);
  }

  /* ======================================================
   * 起步
   * ====================================================== */
  /* ---- Service Worker 新版本提示条 ----
     没有它，发版后用户会一直停在旧缓存页面（SW 对静态资源是 cache-first）。 */
  function showSwUpdateBar() {
    if (document.getElementById('swUpdateBar')) return;
    var bar = document.createElement('div');
    bar.id = 'swUpdateBar';
    bar.className = 'sw-update';
    bar.innerHTML = '<i class="fa-solid fa-rotate"></i><span>已发布新版本</span>' +
      '<button type="button" id="swUpdateBtn">刷新</button>' +
      '<button type="button" class="sw-update-x" id="swUpdateClose" aria-label="稍后再说"><i class="fa-solid fa-xmark"></i></button>';
    document.body.appendChild(bar);
    var btn = document.getElementById('swUpdateBtn');
    if (btn) btn.addEventListener('click', function () {
      // 让等待中的 SW 立刻接管，否则刷新后可能还是旧页面
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
          navigator.serviceWorker.getRegistration().then(function (reg) {
            if (reg && reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }).catch(function () {});
        }
      } catch (e) {}
      setTimeout(function () { try { location.reload(); } catch (e) {} }, 300);
    });
    var x = document.getElementById('swUpdateClose');
    if (x) x.addEventListener('click', function () {
      if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
    });
  }

  function boot() {
    // 兜底：若 head 内检测时 Capacitor 桥未就绪，这里再补一次 native 类
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) {
      document.documentElement.classList.add('native');
    }
    // file:// 双击守卫（v257）：浏览器在 file:// 协议下禁用 localStorage
    // （"document is sandboxed and lacks the allow-same-origin flag"），
    // 首页靠 try/catch 勉强能看，AI/设置页一读数据就崩。与其让用户对着
    // 技术报错猜"是不是缓存"，不如开门见山告诉他正确的打开方式。
    // 注意：这里是**纯浏览器/预览**场景的兜底，与 APP 无关。
    // 原生端由 Capacitor 用 https://localhost 加载本地页面（见 capacitor.config.ts
    // androidScheme），永远不会是 file: —— 这里也显式跳过原生平台，双保险。
    var isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    if (location.protocol === 'file:' && !isNative) {
      var mf = document.getElementById('main');
      if (mf) mf.innerHTML = '<div class="empty" style="padding:48px 24px;text-align:center">' +
        '<i class="fa-solid fa-hand-pointer" style="font-size:30px;color:#0066CC;margin-bottom:14px"></i>' +
        '<div style="font-size:16px;font-weight:600;margin-bottom:8px">不能直接双击打开哦</div>' +
        '<div style="font-size:13px;color:#86868B;line-height:1.7">浏览器禁止本地文件使用数据存储，' +
        '所以页面跑不起来。<br>请在浏览器里通过网址（http://…）打开，<br>或安装 APP 使用。</div></div>';
      setupSplash();
      return;
    }
    // 数据层保险丝：mock.js 解析失败（老 WebView 语法不兼容）时 AppData 不存在，
    // 后面每一步都会崩。直接给出可读报错，而不是静默白屏。
    // Service Worker 更新提示：新版本就绪后给一条可点击横幅，否则用户长期停在旧页面
    try {
      window.addEventListener('sw-updated', showSwUpdateBar);
    } catch (e) { /* 老内核不支持 CustomEvent/addEventListener 组合，忽略即可 */ }
    if (typeof AppData === 'undefined') {
      var msg = '数据层加载失败（AppData 未定义）——通常是 JS 语法与 WebView 版本不兼容，请反馈此提示';
      console.error('[boot] ' + msg);
      var m0 = document.getElementById('main');
      if (m0) m0.innerHTML = '<div class="empty" style="padding:40px 20px;text-align:center">' +
        '<i class="fa-solid fa-triangle-exclamation" style="font-size:28px;color:#F03342;margin-bottom:12px"></i>' +
        '<div style="font-size:15px;font-weight:600;margin-bottom:6px">应用初始化失败</div>' +
        '<div style="font-size:12px;color:#86868B;line-height:1.6">' + msg + '</div></div>';
      setupSplash();
      return;
    }
    // 本地通知：监听违规事件 + 按配置重建日程（失败不得拖垮首屏渲染）
    try {
      NotifApp.initViolationListener();
      NotifApp.applySchedules();
    } catch (e) { console.warn('[boot] 通知模块初始化失败（不影响主功能）：', e); }
    try {
      if (!location.hash) location.hash = '#/home';
      render();
      setupSplash();
    } catch (e) {
      console.error('[boot] 首屏渲染失败：', e);
      var m1 = document.getElementById('main');
      if (m1) m1.innerHTML = '<div class="empty" style="padding:40px 20px;text-align:center">' +
        '<i class="fa-solid fa-triangle-exclamation" style="font-size:28px;color:#F03342;margin-bottom:12px"></i>' +
        '<div style="font-size:15px;font-weight:600;margin-bottom:6px">首屏渲染失败</div>' +
        '<div style="font-size:12px;color:#86868B;line-height:1.6">' + escapeHtml(String(e && e.message || e)) + '</div></div>';
      setupSplash();
    }
    // 汇率：启动即拉最新值，成功后重渲染（首页/持仓/记录汇总统一人民币）
    if (typeof AppMarket !== 'undefined' && AppMarket.refreshFxRates) {
      AppMarket.refreshFxRates().then(function (fx) {
        if (fx && !fx.fallback) render();
      }).catch(function () {});
    }
    refreshHeldQuotes();
    // 保持在前台时也按用户设置继续刷新；每分钟检查一次，避免切换间隔后重建定时器。
    global.setInterval(function () {
      if (!document.hidden) refreshHeldQuotes();
    }, 60000);
    // Android 从后台返回前台时重取持仓；浏览器预览用 visibilitychange 兜底。
    var nativeApp = global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.App;
    if (nativeApp && typeof nativeApp.addListener === 'function') {
      try {
        var listener = nativeApp.addListener('appStateChange', function (s) {
          if (s && s.isActive) refreshHeldQuotes();
        });
        if (listener && typeof listener.catch === 'function') listener.catch(function () {});
      } catch (_) {}
    } else {
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) refreshHeldQuotes();
      });
    }
  }

  // 规则解析工具暴露给调试 / 冒烟测试（不影响业务 API 形态）
  window.AppRuleUtil = {
    localParseRule: localParseRule,
    validateParsedRule: validateParsedRule,
    sanitizeHtml: sanitizeHtml,
  };
  // 版本戳对外暴露：冒烟测试用它校验与 index.html / sw.js 三处一致
  window.APP_VERSION = APP_VERSION;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})(window);
