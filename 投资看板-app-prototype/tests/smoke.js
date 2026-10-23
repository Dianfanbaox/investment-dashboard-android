/* =========================================================
 * 投资看板 APP · 冒烟回归测试
 * ---------------------------------------------------------
 * 背景：A 批次修复曾因「只做语法检查、不做运行时验证」而交付了
 *       首页空白 + AI 页点不开的版本。语法检查只能证明代码能解析，
 *       证明不了页面能渲染、数据能算对。故固化本套件。
 *
 * 约定：**任何改动源码后，必须先跑通本套件，再交付/打包。**
 *   npm run smoke
 *
 * 覆盖范围：
 *   1. 五个主页面渲染（非空、内容互不相同、无 undefined/NaN 脏值）
 *   2. AI 四个分析维度点击后报告是否真的落库（曾出现「点了没反应」）
 *   3. 报告库 / 报告详情弹窗 / 对话页
 *   4. 零持仓零交易冷启动（曾出现崩溃）
 *   5. 容错：图表崩溃、页面渲染抛错时不得白屏
 *   6. 数据层核心指标口径（今日/本月盈亏、跨币种折算）
 * ========================================================= */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const SRC = ['mock.js', 'market.js', 'fifo.js', 'discipline.js', 'app.js'];

let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ✓ ' + label + (extra ? '  ' + extra : '')); }
  else { fail++; failures.push(label + (extra ? ' — ' + extra : '')); console.log('  ✗ ' + label + (extra ? '  ' + extra : '')); }
}
function section(t) { console.log('\n' + t); }

/* ---------- 构造一个可运行的 APP 实例 ---------- */
function boot(opts) {
  opts = opts || {};
  const dom = new JSDOM(HTML, { runScripts: 'outside-only', pretendToBeVisual: true, url: 'http://localhost/' });
  const { window } = dom;
  const errs = [];
  window.addEventListener('error', e => errs.push('onerror: ' + (e.error && e.error.message || e.message)));
  // 测试噪音静音：APP 内部 console.warn/error 的堆栈会淹没结果，只保留首行摘要。
  // 网络类（fetch stub 必然失败）完全静音，属预期。
  const compact = real => (...a) => {
    const s = String(a[0] || '');
    if (/\[market\]/.test(s)) return;
    real.call(window.console, s.slice(0, 120));
  };
  window.console.warn = compact(window.console.warn.bind(window.console));
  window.console.error = compact(window.console.error.bind(window.console));

  // 零数据模式：必须在 eval mock.js 之前把存储置空，否则会载入种子数据。
  // 同时要写死 schema 版本号 —— mock.js 的迁移分支会无条件 removeItem('app_stockPoolStocks')
  // 再 seed，不写版本号的话「零数据」里会莫名冒出 2 只自选，空态断言永远测不到。
  if (opts.empty) {
    window.localStorage.setItem('app_schema_version', '5');
    ['app_trades', 'app_stockPoolStocks', 'app_disciplineRules', 'app_violationRecords', 'app_tradingInsights', 'app_aiReports']
      .forEach(k => window.localStorage.setItem(k, '[]'));
  }

  // jsdom 没有 canvas，桩掉 2d context，避免环境噪音掩盖真实错误
  const ctx = new Proxy({}, { get: (t, k) => {
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop() {} });
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'getImageData') return () => ({ data: [] });
    return () => {};
  }});
  window.HTMLCanvasElement.prototype.getContext = () => ctx;
  window.Chart = class { constructor() { this.data = {}; this.options = {}; } update() {} destroy() {} resize() {} };
  window.fetch = opts.fetch || (() => Promise.reject(new Error('stub fetch')));
  if (opts.now) {
    const RealDate = window.Date;
    window.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [opts.now()])); }
      static now() { return new RealDate(opts.now()).getTime(); }
    };
  }
  if (opts.onInterval) window.setInterval = (cb, ms) => { opts.onInterval(cb, ms); return 1; };
  window.requestAnimationFrame = cb => setTimeout(cb, 0);
  window.cancelAnimationFrame = () => {};
  if (!window.navigator.vibrate) window.navigator.vibrate = () => true;

  const loadErrs = [];
  for (const s of SRC) {
    try { window.eval(fs.readFileSync(path.join(ROOT, s), 'utf8')); }
    catch (e) { loadErrs.push('[加载 ' + s + '] ' + e.message); }
  }
  // jsdom 下 readyState 恒为 loading，boot 挂在 DOMContentLoaded 上，需手动派发
  window.document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

  const doc = window.document;
  return {
    window, doc, errs: errs.concat(loadErrs),
    main: doc.getElementById('main'),
    modal: doc.getElementById('modalBox'),
    nav: r => doc.querySelector('.bn-item[data-route="' + r + '"]'),
    click: el => el.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true })),
    tick: (ms = 30) => new Promise(r => setTimeout(r, ms)),
  };
}

(async () => {

  /* ============ 1. 语法 ============ */
  section('[1] 语法检查');
  // 用 vm.Script 编译校验，比 spawn `node --check` 可靠（不受中文路径 / PATH 影响）
  const vm = require('vm');
  for (const s of SRC) {
    let msg = '';
    try { new vm.Script(fs.readFileSync(path.join(ROOT, s), 'utf8'), { filename: s }); }
    catch (e) { msg = e.message; }
    ok(s, !msg, msg);
  }

  /* ============ 1b. 老 WebView 语法兼容（ES2019） ============ */
  section('[1b] ES2019 兼容（国产手机 WebView 常年不更新，必须按 Chrome 80 基线写）');
  // 事故：mock.js 一处 `?.` 让整个文件在老 WebView 上解析失败 → AppData 未定义
  // → 启动崩死 → 白屏 + 开屏遮罩挡触摸「导航点不动」。vm.Script 用当前 Node 语法，
  // 查不出这类问题，必须用 acorn 按 ecmaVersion 2019 再编译一遍。
  {
    let acorn = null;
    try { acorn = require('acorn'); } catch (e) { /* 未安装则跳过，不阻塞其余测试 */ }
    if (!acorn) {
      console.log('  - acorn 未安装（npm i -D acorn），本节跳过');
    } else {
      for (const s of SRC) {
        let msg = '';
        try { acorn.parse(fs.readFileSync(path.join(ROOT, s), 'utf8'), { ecmaVersion: 2019 }); }
        catch (e) {
          const ln = e.loc ? ' (行 ' + e.loc.line + ':' + e.loc.column + ')' : '';
          msg = '用了 ES2019 不支持的语法' + ln + '：' + e.message;
        }
        ok(s, !msg, msg);
      }
    }
  }

  /* ============ 2. 正常数据：主页面渲染 ============ */
  section('[2] 五个主页面渲染（正常数据）');
  {
    const app = boot();
    const fps = {};
    for (const route of ['home', 'trades', 'pool', 'ai', 'settings']) {
      app.click(app.nav(route)); await app.tick();
      const h = app.main.innerHTML;
      const dirty = (h.match(/undefined|NaN|\[object Object\]/g) || []).length;
      // 注释泄漏：JS 注释误写进模板字符串会被当 HTML 渲染出来（真机事故）
      const commentLeak = /^\s*(\/\/|\/\*)/m.test(h);
      ok('页面 ' + route, h.length > 400 && !/页面渲染失败/.test(h) && !commentLeak,
         '长度 ' + h.length + (dirty ? ' ⚠脏值×' + dirty : '') + (commentLeak ? ' ⚠注释泄漏' : ''));
      if (dirty) console.log('     样例: ' + (h.match(/.{0,70}(undefined|NaN|\[object Object\]).{0,25}/) || [])[0]);
      fps[route] = require('crypto').createHash('md5').update(h).digest('hex').slice(0, 8);
    }
    ok('五个页面内容互不相同（路由确实生效）', new Set(Object.values(fps)).size === 5,
       '唯一指纹 ' + new Set(Object.values(fps)).size + '/5');
    ok('无运行时错误', app.errs.length === 0, app.errs.slice(0, 2).join(' | '));
  }

  /* ============ 3. AI 分析落库（核心回归） ============ */
  section('[3] AI 四个分析维度 → 报告必须落库');
  {
    const app = boot();
    app.click(app.nav('ai')); await app.tick();
    const btns = Array.from(app.doc.querySelectorAll('[data-ai]'));
    ok('AI 分析入口存在', btns.length >= 4, btns.length + ' 个: ' + btns.map(b => b.getAttribute('data-ai')).join(','));
    const before = app.window.AppData.getAiReports().length;
    for (const b of btns) { app.click(b); await app.tick(80); }
    const after = app.window.AppData.getAiReports().length;
    ok('点击后报告全部落库', after - before === btns.length, '新增 ' + (after - before) + '/' + btns.length);

    app.click(app.doc.querySelector('[data-ai-tab="history"]')); await app.tick(60);
    ok('报告库能看到报告', /report-card/.test(app.main.innerHTML));
    const rc = app.doc.querySelector('[data-open-report]');
    if (rc) { app.click(rc); await app.tick(); ok('报告详情弹窗可打开', app.modal.innerHTML.length > 100); }
    else ok('报告详情弹窗可打开', false, '未找到报告卡片');

    app.click(app.doc.querySelector('[data-ai-tab="chat"]')); await app.tick();
    ok('AI 对话页有输入框', !!app.doc.querySelector('#chatInput, .chat-input, textarea, input[type="text"]'));
    ok('无运行时错误', app.errs.length === 0, app.errs.slice(0, 2).join(' | '));
  }

  /* ============ 4. 零持仓零交易冷启动 ============ */
  section('[4] 零持仓 / 零交易冷启动');
  {
    const app = boot({ empty: true });
    ok('确认零交易', app.window.AppData.getTrades().length === 0);
    for (const route of ['home', 'trades', 'pool', 'ai', 'settings']) {
      app.click(app.nav(route)); await app.tick();
      const h = app.main.innerHTML;
      ok('零数据 · ' + route, h.length > 200 && !/页面渲染失败/.test(h), '长度 ' + h.length);
    }
    app.click(app.nav('ai')); await app.tick();
    const btns = Array.from(app.doc.querySelectorAll('[data-ai]'));
    const before = app.window.AppData.getAiReports().length;
    for (const b of btns) { app.click(b); await app.tick(60); }
    ok('零数据 · AI 分析仍能出报告', app.window.AppData.getAiReports().length - before === btns.length,
       '新增 ' + (app.window.AppData.getAiReports().length - before) + '/' + btns.length);
    ok('无运行时错误', app.errs.length === 0, app.errs.slice(0, 2).join(' | '));
  }

  /* ============ 5. 容错：不得白屏 ============ */
  section('[5] 容错（曾经的白屏故障模式）');
  {
    const app = boot();
    app.window.Chart = class { constructor() { throw new Error('模拟 Chart.js 失败'); } };
    app.click(app.nav('home')); await app.tick();
    ok('图表崩溃时首页仍有内容', app.main.innerHTML.length > 1000 && !/页面渲染失败/.test(app.main.innerHTML),
       '长度 ' + app.main.innerHTML.length);

    const orig = app.window.AppData.dashboardSummary;
    app.window.AppData.dashboardSummary = () => { throw new Error('模拟脏数据'); };
    app.click(app.nav('pool')); await app.tick();
    app.click(app.nav('home')); await app.tick();
    ok('页面渲染抛错 → 显示可读错误页而非白屏', /页面渲染失败/.test(app.main.innerHTML));
    app.window.AppData.dashboardSummary = orig;
  }

  /* ============ 6. 数据层口径 ============ */
  section('[6] 数据层核心指标');
  {
    const app = boot();
    const D = app.window.AppData;
    let s;
    try { s = D.dashboardSummary(); ok('dashboardSummary 可调用', true, '资产 ' + Math.round(s.totalAssets)); }
    catch (e) { ok('dashboardSummary 可调用', false, e.message); }
    if (s) {
      ok('今日盈亏为有限数', Number.isFinite(s.todayPnl), String(s.todayPnl));
      ok('缺少月初基线时不伪造本月盈亏', s.monthPnl === null && s.monthPnlDetail === null, String(s.monthPnl));
      // 今日盈亏不应等于全部累计浮盈（这是 v243 之前的核心 bug）
      ok('今日盈亏 ≠ 累计浮盈（口径已修正）', Math.abs(s.todayPnl - s.floatingPnl) > 0.01 || s.floatingPnl === 0,
         'today=' + Math.round(s.todayPnl) + ' floating=' + Math.round(s.floatingPnl));
    }
    for (const t of ['portfolio', 'discipline', 'trend', 'risk']) {
      let r = null;
      try { r = D.aiAnalyze(t); } catch (e) {}
      ok('aiAnalyze(' + t + ')', !!r && !!r.html);
    }
  }

  /* ============ 5. C 批次：交互闭环 8 项 ============ */
  section('[5] 交互闭环（C 批次 #41-#48）');
  {
    const app = boot();
    const D = app.window.AppData;

    // #41 未配置 Key 时 AI 对话页必须有出口按钮（原来是死页面）
    app.click(app.nav('ai')); await app.tick();
    app.click(app.doc.querySelector('[data-ai-tab="chat"]')); await app.tick();
    ok('AI 对话无 Key 时有「去设置配置」出口', !!app.doc.querySelector('[data-goto-ai-config]'));
    app.click(app.doc.querySelector('[data-goto-ai-config]')); await app.tick();
    ok('点击出口跳到设置页 AI 配置', app.window.location.hash === '#/settings' && !!app.doc.querySelector('[data-set-ai]'));

    // #44 交易流水可编辑（原来只有删除）
    app.click(app.nav('trades')); await app.tick();
    const editTradeBtn = app.doc.querySelector('[data-edit-trade]');
    ok('交易流水有编辑入口', !!editTradeBtn);
    const beforeQty = D.getTrades()[0].quantity;
    if (editTradeBtn) {
      app.click(editTradeBtn); await app.tick();
      const form = app.doc.getElementById('tradeForm');
      ok('编辑弹窗预填了原数据', !!form && form.querySelector('[name=qty]').value === String(beforeQty),
         form ? 'qty=' + form.querySelector('[name=qty]').value : '无表单');
      // 改数量并提交，验证真的走 update 而不是新增
      const beforeLen = D.getTrades().length;
      form.querySelector('[name=qty]').value = String(beforeQty + 1);
      form.dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
      await app.tick();
      ok('编辑保存后原地更新（条数不变、数量变化）',
         D.getTrades().length === beforeLen && D.getTrades()[0].quantity === beforeQty + 1,
         '条数 ' + D.getTrades().length + ' qty ' + D.getTrades()[0].quantity);
    }

    // #43 股票池整卡可点编辑
    app.click(app.nav('pool')); await app.tick();
    const editPoolBtn = app.doc.querySelector('[data-edit-pool]');
    ok('股票池卡片可点编辑', !!editPoolBtn);
    if (editPoolBtn) {
      app.click(editPoolBtn); await app.tick();
      const pf = app.doc.getElementById('poolForm');
      ok('自选编辑弹窗预填了原数据', !!pf && !!pf.querySelector('[name=code]').value,
         pf ? 'code=' + pf.querySelector('[name=code]').value : '无表单');
      const poolLenBefore = D.getStockPool().length;
      pf.querySelector('[name=targetPrice]').value = '999';
      pf.dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
      await app.tick(120);
      const edited = D.getStockPool().filter(x => Number(x.targetPrice) === 999)[0];
      ok('自选编辑保存生效（条数不变、目标价更新）',
         !!edited && D.getStockPool().length === poolLenBefore);
    }

    // #45 持仓明细有「记一笔卖出」
    app.click(app.nav('home')); await app.tick();
    const posRow = app.doc.querySelector('[data-pos]');
    if (posRow) {
      app.click(posRow); await app.tick();
      ok('持仓明细有「记一笔卖出」', !!app.doc.querySelector('[data-pos-sell]'));
      app.click(app.doc.querySelector('[data-pos-sell]')); await app.tick();
      const sf = app.doc.getElementById('tradeForm');
      ok('卖出弹窗预填代码且方向为卖',
         !!sf && !!sf.querySelector('[name=code]').value && sf.querySelector('[name=side][value=sell]').checked,
         sf ? 'code=' + sf.querySelector('[name=code]').value : '无表单');
    } else ok('持仓明细有「记一笔卖出」', false, '未找到持仓行');

    // #48 首页头像可点击（原来是装饰 div）
    app.click(app.doc.getElementById('hdAva')); await app.tick();
    ok('首页头像可跳转设置', app.window.location.hash === '#/settings');

    ok('交互闭环流程无运行时错误', app.errs.length === 0, app.errs.slice(0, 2).join(' | '));
  }

  /* ============ 7. D 批次：AI 链路（#28-#40） ============ */
  section('[7] AI 链路（D 批次 #28-#40）');
  {
    const app = boot();
    const D = app.window.AppData;
    const RU = app.window.AppRuleUtil;
    const DIS = app.window.AppDiscipline;

    // #28 规则阈值进入 AI 上下文：旧代码读 r.type/r.threshold（永远空），AI 看不到阈值
    const ctx = D.buildAiContext('portfolio');
    ok('上下文含规则阈值文本', !!ctx.rules && ctx.rules.length > 0 &&
       ctx.rules.every(r => typeof r.conditions === 'string' && r.conditions.length > 0),
       '规则数 ' + (ctx.rules || []).length);
    ok('规则阈值文本含运算符', /大于|小于|等于|大于等于|小于等于/.test((ctx.rules[0] || {}).conditions || ''),
       (ctx.rules[0] || {}).conditions);

    // #29 上下文补「当日涨跌」与「交易心得」
    ok('持仓上下文含当日涨跌幅字段', (ctx.holdings || []).every(h => 'dayChangePct' in h));
    ok('上下文含近期心得', Array.isArray(ctx.insights));
    const disciplinePrompt = D.buildAiContext('discipline').prompt;
    const riskPrompt = D.buildAiContext('risk').prompt;
    ok('纪律与风险报告实际发送规则阈值', ctx.rules.every(r => disciplinePrompt.includes(r.conditions) && riskPrompt.includes(r.conditions)));
    ctx.holdings[0].dayChangePct = 1.25;
    ok('报告实际发送持仓当日涨跌幅', D._formatAiPrompt(ctx, 'portfolio').includes('当日涨跌+1.25%'));
    const chatContext = D.buildAiChatContext('那腾讯的止损呢？', '我的腾讯控股持仓怎么样');
    ok('对话快照含当前持仓、成本、规则与相关心得', chatContext.includes('全部当前持仓') &&
      chatContext.includes('成本') && chatContext.includes('启用的纪律规则') && chatContext.includes('交易心得'));

    // #33 本地兜底报告去硬编码假数据，并标注 source:'local'
    const fakeHits = ['跑赢大盘', '腾讯 + 小米', '科技+新能源', '约 ¥4 万', '腾讯+小米', '-8% 硬止损红线'];
    for (const t of ['portfolio', 'discipline', 'trend', 'risk']) {
      const r = D.aiAnalyze(t);
      const hasFake = fakeHits.some(f => (r.html || '').indexOf(f) !== -1);
      ok('aiAnalyze(' + t + ') 客观无假数据且标注 local',
         r && r.source === 'local' && !hasFake,
         'source=' + (r && r.source) + (hasFake ? ' ⚠含假数据' : ''));
    }

    // #34 报告 ID 加随机后缀，同毫秒不冲突 + 带 source 字段
    const a = D.saveAiReport('portfolio', 't1', '<p>1</p>');
    const b = D.saveAiReport('portfolio', 't2', '<p>2</p>');
    ok('报告 ID 不重复（含随机后缀）', a.id !== b.id && /^AR/.test(a.id), a.id + ' / ' + b.id);
    ok('报告带 source 字段', a.source === 'ai' && b.source === 'ai');

    // #35 未知 parameter 白名单拦截（曾经静默变成交价比较 → 误报）
    const badParam = RU.validateParsedRule({ name: 'x', conditions: [{ type: 'price', parameter: 'weirdParam', operator: 'greater', value: 5 }] });
    ok('未知 parameter 被拦截', badParam.ok === false && /不支持的参数/.test(badParam.msg || ''), badParam.msg);
    const goodParam = RU.validateParsedRule({ name: 'x', conditions: [{ type: 'price', parameter: 'intradayChangePct', operator: 'greater', value: 5 }] });
    ok('合法 parameter 通过', goodParam.ok === true);

    // #36 日内涨跌幅 <1 不再静默放大，改为提示确认（原 0.5 → 50% 导致永不触发）
    const tiny = RU.validateParsedRule({ name: 'x', conditions: [{ type: 'price', parameter: 'intradayChangePct', operator: 'greater', value: 0.5 }] });
    ok('阈值 <1 不静默放大（值保持 0.5）', tiny.ok === true && tiny.rule.conditions[0].value === 0.5, '值=' + (tiny.rule && tiny.rule.conditions[0].value));
    ok('阈值 <1 给出确认提示', !!tiny.warn && /%|确认/.test(tiny.warn), tiny.warn);

    // #37 时间规则含分钟（14:50 → 14.833），纪律引擎按 小时+分钟/60 比较
    const tRule = RU.localParseRule('14:50之后禁止开新仓');
    ok('尾盘时间解析出分钟', !!tRule && Math.abs(tRule.conditions[0].value - (14 + 50 / 60)) < 0.01,
       tRule ? 'value=' + tRule.conditions[0].value : 'null');
    const at1440 = DIS.checkCondition({ type: 'time', operator: 'greater_equal', value: 14 + 50 / 60 }, { timestamp: new Date(2026, 0, 1, 14, 40).toISOString() }, null, null, null);
    const at1500 = DIS.checkCondition({ type: 'time', operator: 'greater_equal', value: 14 + 50 / 60 }, { timestamp: new Date(2026, 0, 1, 15, 0).toISOString() }, null, null, null);
    ok('时间规则 14:40 不触发 / 15:00 触发', at1440 === false && at1500 === true, '14:40=' + at1440 + ' 15:00=' + at1500);

    // #38 仓位正则补全「不要/不得/不可/禁止」
    const posRule = RU.localParseRule('单笔仓位不要超过总资金的 20%');
    ok('「不要超过」能解析为仓位占比', !!posRule && posRule.conditions[0].parameter === 'positionRatio',
       posRule ? posRule.conditions[0].parameter : 'null');
    const posRule2 = RU.localParseRule('单笔交易仓位不超过20%');
    ok('「不超过」仍兼容', !!posRule2 && posRule2.conditions[0].parameter === 'positionRatio');

    // #40 通知开关渲染口径：notif.X !== false 视为开（首次点击要与渲染对齐）
    const cfgOpen = D.getConfig();
    ok('默认通知开关渲染为开（!== false）', (cfgOpen.notif.prefMkt !== false) === true);
    const cfgClosed = JSON.parse(JSON.stringify(cfgOpen)); cfgClosed.notif = { prefMkt: false };
    ok('显式 false 渲染为关', (cfgClosed.notif.prefMkt !== false) === false);

    ok('AI 链路 D 批次无运行时错误', app.errs.length === 0, app.errs.slice(0, 2).join(' | '));
  }

  /* ============ 8. 数据健壮性（E 批次 #13-#27） ============ */
  section('[8] 数据健壮性（E 批次 #13-#27）');

  /* 测试桩说明（踩过的坑）：
     1) 构造行情 ArrayBuffer 不能用 Buffer.from(s).buffer —— Node 的 Buffer 走内存池，
        .buffer 可能含额外字节/偏移，解码后首行被污染，导致第一条行情永远匹配不上。
     2) jsdom 的 localStorage 是 Proxy，直接 `ls.setItem = fn` 会被当成「存一个名为 setItem 的键」，
        不会真的替换方法。必须改 Storage.prototype。 */
  const bufOf = s => new TextEncoder().encode(s).buffer;
  function patchSetItem(win, fn) {
    const proto = win.Storage.prototype;
    const orig = proto.setItem;
    Object.defineProperty(proto, 'setItem', { value: fn, configurable: true, writable: true });
    return () => Object.defineProperty(proto, 'setItem', { value: orig, configurable: true, writable: true });
  }

  // #13 卖出量超过持仓：FIFO 应标记数据异常
  {
    const app = boot();
    const FIFO = app.window.AppFifo;
    const trades = [
      { id: 'E13A', stockCode: '600000', stockName: '浦发银行', type: 'buy', quantity: 10, price: 10, fee: 1, market: 'sh', timestamp: '2026-09-01T10:00:00+08:00' },
      { id: 'E13B', stockCode: '600000', stockName: '浦发银行', type: 'sell', quantity: 15, price: 12, fee: 1, market: 'sh', timestamp: '2026-09-02T10:00:00+08:00' },
    ];
    const res = FIFO.fifoPositions(trades, [], null);
    ok('#13 卖出超持仓被标记警告', res.warnings && res.warnings.length >= 1 && res.warnings[0].oversoldQty === 5, JSON.stringify(res.warnings));
    ok('#13 仪表盘暴露 dataWarnings 数组', Array.isArray(app.window.AppData.dashboardSummary().dataWarnings));
  }

  // #14 市场解析统一：未知市场两引擎都按 CNY，不再差 7 倍
  {
    const app = boot();
    const FIFO = app.window.AppFifo;
    const trades = [
      { id: 'E14A', stockCode: 'ZZZZ', stockName: '测试股', type: 'buy', quantity: 10, price: 10, fee: 0, timestamp: '2026-09-01T10:00:00+08:00' },
      { id: 'E14B', stockCode: 'ZZZZ', stockName: '测试股', type: 'sell', quantity: 10, price: 20, fee: 0, timestamp: '2026-09-02T10:00:00+08:00' },
    ];
    const pos = FIFO.fifoPositions(trades, [], null);
    const sells = FIFO.allSellRealized(trades, null, []);
    ok('#14 fifoPositions 未知市场按 CNY', Math.round(pos.totalRealizedPnL) === 100, 'realized=' + pos.totalRealizedPnL);
    ok('#14 allSellRealized 与 fifo 一致(均 CNY)', sells[0] && Math.round(sells[0].realizedPnL) === 100, 'realized=' + (sells[0] && sells[0].realizedPnL));
  }

  // #15 行情按 symbol 对齐：缺失行不串价
  {
    const app = boot();
    const AM = app.window.AppMarket;
    const fakeText = 'v_sh600519="1~TESTA~600519~100.5~99.0~100.5";' +
      'v_hk00700="1~TESTH~00700~50.0~49.0~50.0";';
    const fakeBuf = bufOf(fakeText);
    const origFetch = app.window.fetch;
    app.window.fetch = (url, opts) => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(fakeBuf) });
    const map = await AM.getQuotes(['600519', '000001', '00700']);
    app.window.fetch = origFetch;
    ok('#15 对齐：600519 命中', !!map.get('600519') && map.get('600519').price === 100.5);
    ok('#15 对齐：缺失的 000001 不串价', !map.get('000001'), map.get('000001') ? 'price=' + map.get('000001').price : '缺失(正确)');
    ok('#15 对齐：00700 正确', !!map.get('00700') && map.get('00700').price === 50.0);
  }

  // #16 行情：首失败自动重试 1 次 + 已中断信号返回空
  {
    const app = boot();
    const AM = app.window.AppMarket;
    const fakeText = 'v_usAAPL="1~AAPL~AAPL~200.0~190.0~200.0";';
    const fakeBuf = bufOf(fakeText);
    const origFetch = app.window.fetch;
    // 只统计本次请求的 URL（boot 后台的行情刷新也会打同一个域名，会污染计数）
    let calls = 0;
    app.window.fetch = (url, opts) => {
      if (String(url).toLowerCase().indexOf('usaapl') < 0) return origFetch(url, opts);
      calls++;
      if (calls === 1) return Promise.reject(new Error('net blip'));
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(fakeBuf) });
    };
    const map = await AM.getQuotes(['AAPL']);
    app.window.fetch = origFetch;
    ok('#16 首失败自动重试 1 次', calls === 2, 'calls=' + calls);
    ok('#16 重试后成功取数', !!map.get('AAPL') && map.get('AAPL').price === 200.0);

    // 已中断信号：fetch 应被拒，getQuotes 返回空 Map 不崩溃
    const AC = app.window.AbortController || (typeof AbortController !== 'undefined' ? AbortController : null);
    if (AC) {
      const origFetch2 = app.window.fetch;
      app.window.fetch = (url, opts) => {
        if (String(url).toLowerCase().indexOf('usaapl') >= 0 && opts && opts.signal && opts.signal.aborted) return Promise.reject(new Error('AbortError'));
        return origFetch2(url, opts);
      };
      const ctrl = new AC(); ctrl.abort();
      const m2 = await AM.getQuotes(['AAPL'], null, ctrl.signal);
      app.window.fetch = origFetch2;
      // 注意：跨 realm 的 Map 不能用 instanceof 判断（jsdom 的 Map ≠ Node 的 Map）
      ok('#16 已中断信号返回空 Map', !!(m2 && typeof m2.get === 'function') && m2.size === 0);
    } else {
      console.log('  - (jsdom 无 AbortController，跳过中断信号用例)');
    }
  }

  // #17 港美股短字段行情可解析（旧 parts.length<50 门槛会放弃）
  {
    const app = boot();
    const AM = app.window.AppMarket;
    const fakeText = 'v_usAAPL="1~AAPL~AAPL~200.0~190.0~200.0";';
    const fakeBuf = bufOf(fakeText);
    const origFetch = app.window.fetch;
    app.window.fetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(fakeBuf) });
    const map = await AM.getQuotes(['AAPL']);
    app.window.fetch = origFetch;
    ok('#17 短字段行情可解析', !!map.get('AAPL') && map.get('AAPL').price === 200.0, map.get('AAPL') ? 'price=' + map.get('AAPL').price : '未解析');
  }

  // 成交量字段形似日期时，仍须取行情自身的真实时间。
  {
    const app = boot();
    const AM = app.window.AppMarket;
    const fakeText = 'v_usTSLA="1~Tesla~TSLA~450.0~440.0~445.0~20933930~x~2026-10-19 12:18:19";';
    const fakeBuf = bufOf(fakeText);
    const origFetch = app.window.fetch;
    app.window.fetch = () => Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(fakeBuf) });
    const quote = (await AM.getQuotes(['TSLA'], 'us')).get('TSLA');
    app.window.fetch = origFetch;
    ok('成交量伪日期不再挡住 TSLA 今日盈亏', quote && quote.quoteDate === '2026-10-19', quote ? quote.quoteDate : '无行情');
  }

  // #23 市场识别补全（前缀 / 北交所 / 沪B）
  {
    const app = boot();
    const AM = app.window.AppMarket;
    ok('#23 SH600519 → sh', AM.detectMarket('SH600519') === 'sh');
    ok('#23 hk00700 → hk', AM.detectMarket('hk00700') === 'hk');
    ok('#23 北交所 830799 → bj', AM.detectMarket('830799') === 'bj');
    ok('#23 科创板 688001 → sh', AM.detectMarket('688001') === 'sh');
    ok('#23 沪B 900901 → sh', AM.detectMarket('900901') === 'sh');
    ok('#23 普通沪市 600519 → sh', AM.detectMarket('600519') === 'sh');
    ok('#23 深市 000001 → sz', AM.detectMarket('000001') === 'sz');
    ok('#23 港股 00700 → hk', AM.detectMarket('00700') === 'hk');
    ok('#23 美股 AAPL → us', AM.detectMarket('AAPL') === 'us');
  }

  // #24 汇率过期标记
  {
    const app = boot();
    const AM = app.window.AppMarket;
    app.window.localStorage.setItem('app_fx_rates', JSON.stringify({ USD: 7.1, HKD: 0.91, updatedAt: Date.now() - 100 * 3600 * 1000, fallback: false, provider: 't' }));
    ok('#24 过期汇率被标记 stale', AM.getFxRates().stale === true);
    app.window.localStorage.setItem('app_fx_rates', JSON.stringify({ USD: 7.2, HKD: 0.92, updatedAt: Date.now(), fallback: false, provider: 't' }));
    ok('#24 新鲜汇率不 stale', AM.getFxRates().stale === false);
    ok('#24 仪表盘暴露 fxStale 标记', typeof app.window.AppData.dashboardSummary().fxStale === 'boolean');
  }

  // #25 自选筛选用 watch 字段
  {
    const app = boot();
    const AD = app.window.AppData;
    const watchList = AD.getStockPool({ watch: true });
    const noWatch = AD.getStockPool({ watch: false });
    ok('#25 观察池只含 watch===true', watchList.length > 0 && watchList.every(s => s.watch === true));
    ok('#25 非观察池只含 watch!==true', noWatch.every(s => s.watch !== true));
    ok('#25 观察池数量正确(6)', watchList.length === 6, 'len=' + watchList.length);
  }

  // #26 日盈亏跨币种折人民币 + operator 生效
  {
    const app = boot();
    const DIS = app.window.AppDiscipline;
    // 买入必须严格早于卖出，否则「当日卖出配对成本」取不到买入单（口径如此）
    const nowIso = new Date().toISOString();
    const buyIso = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const trades = [
      { id: 'E26B', stockCode: 'TESTUS', stockName: '测试美股', type: 'buy', quantity: 1, price: 100, fee: 0, market: 'us', timestamp: buyIso },
      { id: 'E26S', stockCode: 'TESTUS', stockName: '测试美股', type: 'sell', quantity: 1, price: 90, fee: 0, market: 'us', timestamp: nowIso },
    ];
    const r1 = { id: 'R26', name: '日亏测试', enabled: true, conditions: [{ id: 'C26', type: 'loss', operator: 'greater_equal', value: 50 }] };
    ok('#26 日亏损按人民币折算且 operator 触发(≈70>50)', DIS.scanRules({ rules: [r1], trades: trades, positions: [] }).length === 1);
    const r2 = { id: 'R262', name: '日亏测试2', enabled: true, conditions: [{ id: 'C262', type: 'loss', operator: 'greater_equal', value: 100 }] };
    ok('#26 日亏损 < 阈值不触发(≈70<100)', DIS.scanRules({ rules: [r2], trades: trades, positions: [] }).length === 0);
  }

  // #27 合规率排除已违规交易
  {
    const app = boot();
    const DIS = app.window.AppDiscipline;
    const trades = [
      { id: 'T27OK', stockCode: 'A', stockName: 'A', type: 'buy', quantity: 10, price: 10, market: 'sh', timestamp: '2026-09-01T10:00:00+08:00' },
      { id: 'T27BAD', stockCode: 'B', stockName: 'B', type: 'buy', quantity: 10, price: 10, market: 'sh', timestamp: '2026-09-02T10:00:00+08:00' },
    ];
    const violations = [{ id: 'V27', ruleId: 'R1', tradeId: 'T27BAD', timestamp: '2026-09-02T11:00:00+08:00' }];
    const sep = DIS.violationStats(violations, trades).find(s => s.key === '2026-09');
    ok('#27 合规率排除已违规交易(compliant=1,violated=1)', sep && sep.compliant === 1 && sep.violated === 1, sep ? ('compliant=' + sep.compliant + ' violated=' + sep.violated) : '无9月');
  }

  // #19 写盘异常保护：失败被捕获并暴露错误标记
  {
    const app = boot();
    const AD = app.window.AppData;
    const restore = patchSetItem(app.window, () => { throw new Error('QuotaExceeded'); });
    AD.deleteTrade('T000'); // 内部 writeList 会失败
    const we = AD.getWriteError();
    restore();
    ok('#19 写盘失败被捕获并返回错误标记', !!(we && we.key === 'app_trades'), JSON.stringify(we));
  }

  // #20 迁移：版本号写入失败时不清理数据
  {
    const dom = new JSDOM(HTML, { runScripts: 'outside-only', url: 'http://localhost/' });
    const w = dom.window;
    w.fetch = () => Promise.reject(new Error('stub fetch')); // 补桩：否则 boot 里的 fx 拉取会抛 ReferenceError 噪音
    w.requestAnimationFrame = cb => setTimeout(cb, 0);       // 同上：首屏渲染要用
    w.cancelAnimationFrame = () => {};
    w.localStorage.setItem('app_trades', JSON.stringify([{ id: 'X', side: 'buy', code: '600519', qty: 1, date: '2026-01-01' }]));
    w.localStorage.setItem('app_stockPoolStocks', JSON.stringify([{ id: 'SX', code: '600519', name: '茅台', market: 'sh' }]));
    const realSet = w.Storage.prototype.setItem;
    patchSetItem(w, (k, v) => {
      if (k === 'app_schema_version') throw new Error('QuotaExceeded on version');
      return realSet.call(w.localStorage, k, v);
    });
    for (const s of SRC) w.eval(fs.readFileSync(path.join(ROOT, s), 'utf8'));
    const poolAfter = JSON.parse(w.localStorage.getItem('app_stockPoolStocks') || '[]');
    ok('#20 版本号写入失败时迁移清库被跳过(自选股保留)', poolAfter.length === 1, 'len=' + poolAfter.length);
    ok('#20 版本号未落库', w.localStorage.getItem('app_schema_version') !== '5');
  }

  // #21 CSV 导入校验
  {
    const app = boot();
    const AD = app.window.AppData;
    const csv = [
      'id,timestamp,type,stockCode,stockName,market,quantity,price,fee',
      '1,2026-09-01T10:00:00+08:00,buy,600519,茅台,sh,10,1000,1',
      '2,2026-09-01T10:00:00+08:00,未知方向,000001,平安,sh,10,50,0',
      '3,2026-09-01T10:00:00+08:00,buy,00700,腾讯,火星,10,50,0',
      '4,不是时间,buy,600518,五粮液,sh,10,200,0',
      '5,,buy,,,,,',
    ].join('\n');
    const r = AD.csvImportTrades(csv);
    ok('#21 合法行导入、非法行计失败(ok=1,fail=4)', r.ok === 1 && r.fail === 4, 'ok=' + r.ok + ' fail=' + r.fail);
  }

  // #22 导出完整 + 导入归一化
  {
    const app = boot();
    const AD = app.window.AppData;
    AD.state.aiReports = [{ id: 'AR1', title: 't', html: '<p>x</p>' }];
    const exp = JSON.parse(AD.exportAll());
    ok('#22 导出含 AI 报告', Array.isArray(exp.aiReports) && exp.aiReports.length === 1);
    ok('#22 导出含个人配置版本 v2.0', exp.version === '2.0');
    ok('#22 导出含 extraConfig', exp.extraConfig && typeof exp.extraConfig === 'object');
    const dirty = {
      version: '2.0',
      trades: [
        { id: 'G1', stockCode: '600519', stockName: '茅台', type: 'buy', quantity: 10, price: 1000, market: 'sh', timestamp: '2026-09-01T10:00:00+08:00' },
        { stockCode: '600518', stockName: '五粮液', type: 'buy', quantity: NaN, price: 200 },
        { id: 'G3', stockCode: '000001', stockName: '平安', type: 'weird', quantity: 5, price: 50 },
      ],
      aiReports: 'not an array',
    };
    const cnt = AD.importAll(JSON.stringify(dirty));
    ok('#22 导入逐条归一化(脏交易丢弃,合法保留)', AD.getTrades().some(t => t.id === 'G1') && !AD.getTrades().some(t => t.id === 'G3'));
    ok('#22 导入不崩溃(脏数组被忽略)', cnt >= 1, 'count=' + cnt);
  }

  /* ============ 9. UI 一致性（F 批次） ============ */
  section('[9] UI 一致性（F 批次）');

  // F1 负金额符号统一：全站一律 -¥1,234（符号在货币符前、数字恒为绝对值）
  {
    const app = boot();
    const AD = app.window.AppData;
    const real = AD.dashboardSummary;
    AD.dashboardSummary = function () {
      return Object.assign({}, real.call(AD), {
        todayPnl: -1234.5, todayDeltaAmt: -300.25,
        floatingPnl: -8000, monthPnl: -200, realizedPnl: -50,
      });
    };
    app.click(app.nav('home'));
    await app.tick(30);
    const html = app.main.innerHTML;
    AD.dashboardSummary = real;
    ok('F1 全站无「¥-1,234」写法', html.indexOf('¥-') < 0);
    ok('F1 负号统一在货币符前（-¥）', /-¥/.test(html));
    ok('F1 零值不显示 +¥0', !/\+¥0\b/.test(html));
  }

  // F2 AI 页四维度图标配色
  {
    const app = boot();
    app.click(app.nav('ai'));
    await app.tick(20);
    const html = app.main.innerHTML;
    ok('F2 AI 分析维度带配色类', ['qk-blue', 'qk-orange', 'qk-purple', 'qk-red'].every(c => html.indexOf(c) >= 0));
  }

  // F3 聊天页底部避让：原生侧不得叠加 104px（css 里必须显式压掉）
  {
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    ok('F3 原生下聊天页 padding 被显式压 0', /html\.native \.main\.ai-chat-mode\s*\{[^}]*padding-bottom:\s*0/.test(css));
    ok('F3 聊天滚动区保留安全区避让', /ai-chat-mode .*chat-wrap-outer[\s\S]{0,200}padding-bottom:\s*calc\(100px \+ env/.test(css));
  }

  // F4/F5 窄屏降级（2 列）
  {
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    ok('F4 窄屏 .chart-kpis 降为 2 列', /@media \(max-width: 360px\)\s*\{\s*\.chart-kpis\s*\{\s*grid-template-columns:\s*repeat\(2/.test(css));
    ok('F5 窄屏 .pd-grid 降为 2 列', /@media \(max-width: 360px\)\s*\{\s*\.pd-grid\s*\{\s*grid-template-columns:\s*repeat\(2/.test(css));
  }

  // F6 长股票名可截断（有专门的截断容器 + min-width:0）
  {
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    ok('F6 列表/持仓/自选名均有截断类', /\.tr-nm, \.pos-nm-t, \.pool-nm-t[\s\S]{0,200}text-overflow:\s*ellipsis/.test(css));
  }

  // F7 术语统一
  {
    const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    ok('F7 无错别字「浮盈亏」', src.indexOf('浮盈亏') < 0);
    ok('F7 止损术语统一为「浮动止损」', src.indexOf("kind = '浮动止损'") >= 0);
  }

  // F8 关于页版本与实际版本戳一致
  {
    const app = boot();
    const idxHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const m = idxHtml.match(/\?v=(\d+)/);
    const swJs = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const swM = swJs.match(/acid-app-v(\d+)/);
    ok('F8 APP_VERSION 与 index.html 版本戳一致', !!m && app.window.APP_VERSION === m[1],
      'APP_VERSION=' + app.window.APP_VERSION + ' index=' + (m && m[1]));
    ok('F8 APP_VERSION 与 sw.js 缓存版本一致', !!swM && app.window.APP_VERSION === swM[1],
      'sw=' + (swM && swM[1]));
    app.click(app.nav('settings'));
    await app.tick(20);
    const aboutBtn = app.doc.querySelector('[data-sw-tab="settings"][data-tab="about"]');
    if (aboutBtn) app.click(aboutBtn);
    await app.tick(20);
    ok('F8 关于页显示真实版本号', app.main.innerHTML.indexOf('v' + app.window.APP_VERSION) >= 0);
  }

  // F9 买卖徽章不再复用涨跌色
  {
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    ok('F9 买入徽章改品牌蓝', /\.tr-badge\.buy\s*\{[^}]*var\(--blue/.test(css));
    ok('F9 卖出徽章改中性橙', /\.tr-badge\.sell\s*\{[^}]*#EA580C/.test(css));
  }

  // F10 二级页返回条有下间距
  {
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    ok('F10 返回条下方留白', /\.pg-back\s*\{[^}]*margin-bottom/.test(css));
  }

  // F11 纪律页无数据时不渲染空柱状图
  {
    const app = boot({ empty: true });
    app.window.location.hash = '#/discipline';
    app.window.dispatchEvent(new app.window.Event('hashchange'));
    await app.tick(30);
    const html = app.main.innerHTML;
    ok('F11 无数据不渲染合规柱状图', !/id="vioBarChart"/.test(html));
    ok('F11 给出「暂无合规数据」空状态', html.indexOf('暂无合规数据') >= 0);
    ok('F11 合规率无样本显示 — 而非 100%', html.indexOf('>—</span>') >= 0 || html.indexOf('>—</div>') >= 0 || /dh-pct">—/.test(html));
  }

  /* ============ 10. 工程治理（G 批次） ============ */
  section('[10] 工程治理（G 批次）');

  // G1 版本戳脚本化：三处一致 + lib 资源带戳
  {
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const app = boot();
    const v = app.window.APP_VERSION;
    const idxVs = Array.from(new Set((idx.match(/\?v=(\d+)/g) || []).map(s => s.slice(3))));
    const swV = (sw.match(/acid-app-v(\d+)/) || [])[1];
    const cacheV = (sw.match(/CACHE\s*=\s*'acid-app-v(\d+)'/) || [])[1];
    ok('G1 index.html 版本戳唯一且一致', idxVs.length === 1 && idxVs[0] === v, 'index=' + idxVs.join('/') + ' app=' + v);
    ok('G1 sw.js 缓存名与版本戳一致', swV === v && cacheV === v, 'sw=' + swV + '/' + cacheV);
    const libNoStamp = (idx.match(/lib\/[^"')\s]+/g) || []).filter(u => !/\?v=/.test(u));
    ok('G1 lib/ 静态资源全部带版本戳（防 SW 永久陈旧）', libNoStamp.length === 0, libNoStamp.join(','));
    // bump 脚本曾把已带戳的 lib URL 截断（all.min.css → all.min.cs?v=249s?v=249），
    // 图标/图表/插件桥全部 404 且 UI 上只表现为"图标全没了"，必须锁死扩展名完整性
    const idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const libUrls = (idxSrc.match(/lib\/[^"'\s>]+/g) || []).map(u => u.split('?')[0]);
    const badExt = libUrls.filter(u => !/\.(css|js|mjs|json|png|woff2?|ttf)$/.test(u));
    ok('G1 lib/ URL 扩展名完整（bump 补戳不再截断文件名）', badExt.length === 0, badExt.join(','));
    ok('G1 lib/ URL 无重复版本戳', (idxSrc.match(/\?v=\d+s\?v=/g) || []).length === 0);
    ok('G1 sw.js 预缓存清单与版本戳一致', /'\.\/app\.js\?v=/.test(sw) && sw.indexOf("app.js?v=" + v) >= 0);
  }

  // G2 SW 更新检测：updatefound + SKIP_WAITING
  {
    const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
    const src = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    ok('G2 注册处监听 updatefound', /addEventListener\('updatefound'/.test(idx));
    ok('G2 新版本就绪派发 sw-updated', /'sw-updated'/.test(idx));
    ok('G2 页面侧有更新提示条', /function showSwUpdateBar/.test(src));
    ok('G2 SW 支持 SKIP_WAITING（点了刷新才真换版）', /SKIP_WAITING/.test(sw));
  }

  // G3 API Key 安全：回显转义 + URL 强制 https
  {
    const app = boot();
    const AD = app.window.AppData;
    AD.setAiConfig('sk-<img src=x onerror=alert(1)>', 'https://api.example.com/v1/chat', 'MiniMax-M3');
    app.click(app.nav('settings'));
    await app.tick(20);
    const aiTab = app.doc.querySelector('[data-sw-tab="settings"][data-tab="ai"]');
    if (aiTab) app.click(aiTab);
    await app.tick(20);
    const html = app.main.innerHTML;
    // 注意：innerHTML 序列化不会转回 &lt;，属性里合法的转义看起来仍是 <img ...>，
    // 所以要看 DOM 里有没有真的被解析成一个 img 元素，而不是搜字符串。
    ok('G3 Key 回显已转义（未解析出 img 元素）', !app.doc.querySelector('img[src="x"]'), 'img 元素数=' + app.doc.querySelectorAll('img[src="x"]').length);
    ok('G3 Key 原样可取回（用户能继续编辑）', (app.doc.getElementById('aiKeyInput') || {}).value === 'sk-<img src=x onerror=alert(1)>');
    ok('G3 Key 输入框为 password 类型', /id="aiKeyInput"[^>]*type="password"|type="password"[^>]*id="aiKeyInput"/.test(html));
    // 非 https 的 URL 必须被拒绝
    AD.setAiConfig('sk-x', 'http://evil.example.com', 'MiniMax-M3');
    const btn = app.doc.querySelector('[data-set-ai]');
    if (btn) app.click(btn);
    await app.tick(20);
    const kInp = app.doc.getElementById('aiKeyInput');
    const uInp = app.doc.getElementById('aiUrlInput');
    if (uInp) uInp.value = 'http://evil.example.com';
    if (kInp) kInp.value = 'sk-y';
    if (btn) app.click(btn);
    await app.tick(20);
    ok('G3 非 https 的 API URL 被拒绝保存', (app.window.AppData.getConfig().aiApiUrl || '').indexOf('http://') < 0,
      'url=' + app.window.AppData.getConfig().aiApiUrl);
  }

  // G3b 模型 ID 可自定义，保存后用于实际连接请求
  {
    const app = boot();
    app.click(app.nav('settings'));
    await app.tick(20);
    app.click(app.doc.querySelector('[data-sw-tab="settings"][data-tab="ai"]'));
    await app.tick(20);
    const modelInput = app.doc.getElementById('aiModelInput');
    ok('G3b 模型改为自由输入，无预设下拉框', !!modelInput && !app.doc.getElementById('aiModelSelect'));
    const model = 'vendor/custom-model:v2';
    modelInput.value = '  ' + model + '  ';
    app.doc.getElementById('aiKeyInput').value = 'sk-test';
    app.doc.getElementById('aiUrlInput').value = 'https://ark.cn-beijing.volces.com/api/plan/v3';
    app.click(app.doc.querySelector('[data-set-ai]'));
    await app.tick(20);
    ok('G3b 自定义模型 ID 被保存并回显', app.window.AppData.getConfig().aiModel === model &&
      (app.doc.getElementById('aiModelInput') || {}).value === model);
    const chatUrl = 'https://ark.cn-beijing.volces.com/api/plan/v3/chat/completions';
    ok('G3b 方舟 Base URL 补齐 Chat API 路径', app.window.AppData.getConfig().aiApiUrl === chatUrl);
    let requestModel = '';
    app.window.fetch = (url, opts) => {
      if (url === chatUrl) requestModel = JSON.parse(opts.body).model;
      return Promise.resolve({ ok: true, json: () => Promise.resolve({}) });
    };
    app.click(app.doc.querySelector('[data-test-ai]'));
    await app.tick(20);
    ok('G3b 连接测试使用自定义模型 ID', requestModel === model);
    let nativeRequest = null;
    app.window.Capacitor = {
      isNativePlatform: () => true,
      Plugins: { CapacitorHttp: { request: opts => {
        nativeRequest = opts;
        return Promise.resolve({ status: 200, data: { choices: [] } });
      } } },
    };
    app.window.fetch = () => Promise.reject(new Error('WebView fetch 不应被调用'));
    app.click(app.doc.querySelector('[data-test-ai]'));
    await app.tick(20);
    ok('G3b 原生 APP 的 AI 测试走 Capacitor HTTP', !!nativeRequest &&
      nativeRequest.url === chatUrl && nativeRequest.data.model === model);
    app.doc.getElementById('aiModelInput').value = '   ';
    app.click(app.doc.querySelector('[data-set-ai]'));
    ok('G3b 空模型 ID 不覆盖已保存的配置', app.window.AppData.getConfig().aiModel === model);
  }

  // G3c 对话真实请求携带当前账本，并限制历史；空 AI 报告不得冒充模型结果
  {
    const app = boot();
    app.window.AppData.setAiConfig('sk-test', 'https://api.example.com/v1/chat/completions', 'test-model');
    app.window.AppMarket.getIndexes = () => Promise.resolve([]);
    let request = null;
    app.window.Capacitor = { isNativePlatform: () => true, Plugins: { CapacitorHttp: { request: opts => {
      request = opts;
      return Promise.resolve({ status: 200, data: { choices: [{ message: { content: '报告正文' } }] } });
    } } } };
    app.click(app.nav('ai')); await app.tick(20);
    app.click(app.doc.querySelector('[data-ai="portfolio"]')); await app.tick(40);
    ok('G3c 原生诊断报告允许 120 秒读取时间', !!request && request.readTimeout === 120000);
    ok('G3c 原生报告成功后标记 AI 来源', (app.window.AppData.getAiReports()[0] || {}).source === 'ai');
    app.window.Capacitor.Plugins.CapacitorHttp.request = () => Promise.resolve({ status: 400, data: { error: { message: 'context_length_exceeded' } } });
    app.click(app.doc.querySelector('[data-ai="risk"]')); await app.tick(40);
    ok('G3c 诊断失败显示具体 HTTP 原因', /HTTP 400.*context_length_exceeded/.test(app.doc.getElementById('toastText').textContent));
    app.window.Capacitor.Plugins.CapacitorHttp.request = opts => {
      request = opts;
      return Promise.resolve({ status: 200, data: { choices: [{ message: { content: '已收到' } }] } });
    };
    app.click(app.doc.querySelector('[data-ai-tab="chat"]')); await app.tick(20);
    app.doc.getElementById('chatInput').value = '给我点调仓建议';
    app.click(app.doc.querySelector('[data-ai-send]')); await app.tick(40);
    ok('G3c 原生持仓对话允许 90 秒读取时间', !!request && request.readTimeout === 90000);
    ok('G3c 持仓对话仍正常展示模型正文', app.main.textContent.includes('已收到'));
  }

  {
    const app = boot();
    app.window.AppData.setAiConfig('sk-test', 'https://api.example.com/v1/chat/completions', 'test-model');
    const requests = [];
    app.window.fetch = (url, opts) => {
      if (url === 'https://api.example.com/v1/chat/completions') {
        requests.push(JSON.parse(opts.body));
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '已收到' } }] }) });
      }
      return Promise.reject(new Error('stub market fetch'));
    };
    app.click(app.nav('ai'));
    await app.tick(20);
    app.click(app.doc.querySelector('[data-ai-tab="chat"]'));
    await app.tick(20);
    for (let i = 0; i < 10; i++) {
      app.doc.getElementById('chatInput').value = i === 0 ? '我的腾讯持仓如何' : '继续说第' + i + '点';
      app.click(app.doc.querySelector('[data-ai-send]'));
      await app.tick(15);
    }
    const last = requests[requests.length - 1];
    ok('G3c 每轮对话携带当前持仓和成本', requests.length === 10 &&
      last.messages[0].content.includes('全部当前持仓') && last.messages[0].content.includes('成本'));
    ok('G3c 对话历史限制为最近 16 条并保留早期问答摘要', last.messages.length <= 17 &&
      last.messages[0].content.includes('较早对话摘要'));

    app.click(app.doc.querySelector('[data-ai-tab="diag"]'));
    await app.tick(20);
    app.window.fetch = (url) => {
      if (url === 'https://api.example.com/v1/chat/completions')
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: '' } }] }) });
      return Promise.reject(new Error('stub market fetch'));
    };
    app.click(app.doc.querySelector('[data-ai="portfolio"]'));
    await app.tick(60);
    ok('G3c 模型空回复落为本地报告', (app.window.AppData.getAiReports()[0] || {}).source === 'local');
    app.click(app.doc.querySelector('[data-ai-tab="history"]'));
    await app.tick(20);
    ok('G3c 报告库明确标注本地统计来源', app.main.textContent.includes('本地统计'));
  }

  // G4 报告 html XSS 清洗（导入第三方备份不得执行脚本）
  {
    const app = boot();
    const S = app.window.AppRuleUtil.sanitizeHtml;
    const dirty = '<img src=x onerror="alert(1)"><script>alert(2)<\/script><b>正文</b><span class="u">+1%</span><a href="javascript:alert(3)">链</a>';
    const out = S(dirty);
    const box = app.doc.createElement('div'); box.innerHTML = out;
    ok('G4 剥离 script 标签', out.indexOf('<script') < 0 && box.querySelectorAll('script').length === 0);
    ok('G4 剥离 img 等危险标签（只留文字）', box.querySelectorAll('img').length === 0);
    ok('G4 剥离 onerror 等事件属性', !/onerror/i.test(out));
    ok('G4 剥离 javascript: 协议链接属性', !/javascript:/i.test(out));
    ok('G4 保留正文文本', out.indexOf('正文') >= 0);
    ok('G4 保留排版标签与 class（涨跌色不丢）', /<b>/.test(out) && /class="u"/.test(out));
  }

  // G5 Capacitor 版本对齐（gradle vs package.json）
  {
    const vars = fs.readFileSync(path.join(ROOT, 'android/variables.gradle'), 'utf8');
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    const gradleV = (vars.match(/capacitorVersion\s*=\s*'([\d.]+)'/) || [])[1];
    const npmV = (pkg.dependencies && pkg.dependencies['@capacitor/core']) || (pkg.devDependencies && pkg.devDependencies['@capacitor/core']);
    ok('G5 gradle capacitorVersion 与 npm 版本一致', !!gradleV && gradleV === npmV, 'gradle=' + gradleV + ' npm=' + npmV);
    const bg = fs.readFileSync(path.join(ROOT, 'android/app/build.gradle'), 'utf8');
    const vc = (bg.match(/versionCode\s+(\d+)/) || [])[1];
    const app2 = boot();
    ok('G5 versionCode 随版本戳递增（不再是恒为 1）', Number(vc) > 1 && vc === app2.window.APP_VERSION, 'versionCode=' + vc);
  }

  // G6 僵尸资源：不存在的提示音 / 未安装插件的配置块 / 遗留主题色
  {
    const cfg = fs.readFileSync(path.join(ROOT, 'capacitor.config.ts'), 'utf8');
    ok('G6 移除指向不存在音频的 sound 配置', cfg.indexOf('notification') < 0 && !/sound\s*:/.test(cfg));
    ok('G6 移除未安装插件的 SplashScreen 配置块', !/SplashScreen\s*:/.test(cfg));
    const native = ['android/app/src/main/res/values/styles.xml', 'android/app/src/main/java/com/acidinvert/investdash/MainActivity.java']
      .map(f => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
    ok('G6 主题色统一（无遗留 #F2F5F9 / #98CEF4）', native.indexOf('F2F5F9') < 0 && native.indexOf('98CEF4') < 0);
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    ok('G6 样式里无遗留天蓝 #98CEF4', css.indexOf('98CEF4') < 0);
  }

  /* ============ 11. 行内操作：左滑 / 长按（I1） ============ */
  section('[11] 行内操作改为左滑 / 长按（I1：撤掉常驻双图标）');
  {
    const app = boot();
    const D = app.window.AppData;

    // I1-a 三处列表都不再有常驻的操作图标
    app.click(app.nav('trades')); await app.tick();
    ok('交易流水无常驻编辑/删除图标', !app.doc.querySelector('.tr-act') && !app.doc.querySelector('.tr-del'));
    const tRow = app.doc.querySelector('.tr-row.row-sw');
    ok('交易行带滑动容器与行内操作区', !!tRow && !!tRow.querySelector('.sw-in') && !!tRow.querySelector('.sw-acts'));
    ok('行内操作区含编辑 + 删除两个动作',
       !!tRow.querySelector('.sw-acts [data-edit-trade]') && !!tRow.querySelector('.sw-acts [data-del-trade]'));

    app.click(app.nav('pool')); await app.tick();
    ok('股票池无常驻图标组', !app.doc.querySelector('.pool-acts'));
    const pRow = app.doc.querySelector('.pool-card.row-sw');
    ok('自选卡带滑动容器与行内操作区', !!pRow && !!pRow.querySelector('.sw-in') && !!pRow.querySelector('.sw-acts'));

    app.window.location.hash = '#/discipline'; await app.tick();
    ok('违规台账无常驻删除图标', !app.doc.querySelector('.vio-del'));
    ok('违规台账无遗留圆形处理按钮', !app.doc.querySelector('.vio-resolve'));
    const vRow = app.doc.querySelector('.vio-row.row-sw');
    ok('违规行带滑动容器与行内操作区', !!vRow && !!vRow.querySelector('.sw-in') && !!vRow.querySelector('.sw-acts'));

    // I1-b 左滑手势：构造 touch 事件（jsdom 无 TouchEvent，用 Event + touches）
    app.click(app.nav('trades')); await app.tick();
    const row = app.doc.querySelector('.tr-row.row-sw');
    function touchEvt(type, x, y) {
      const ev = new app.window.Event(type, { bubbles: true, cancelable: true });
      ev.touches = [{ clientX: x, clientY: y }];
      ev.targetTouches = ev.touches;
      return ev;
    }
    row.dispatchEvent(touchEvt('touchstart', 300, 200));
    row.dispatchEvent(touchEvt('touchmove', 240, 201));
    row.dispatchEvent(touchEvt('touchmove', 120, 202));
    row.dispatchEvent(touchEvt('touchend', 120, 202));
    await app.tick();
    ok('左滑后行进入滑开态', row.classList.contains('sw-open'));
    ok('左滑后内容层发生位移', /translateX\(-\d/.test(row.querySelector('.sw-in').style.transform || ''),
       row.querySelector('.sw-in').style.transform);

    // 滑开态下首次点击只收起，不误触发「轻点=编辑」
    // （滑动结束后 350ms 内的补发 click 会被吞掉，等窗口过去再点才是真正的收起动作）
    await app.tick(400);
    app.click(row.querySelector('.tr-nm'));
    await app.tick();
    ok('滑开态下点击行只收起、不打开编辑弹窗',
       !row.classList.contains('sw-open') && !app.doc.getElementById('tradeForm'));

    // I1-c 纵向滑动必须交还页面滚动，不能被手势吃掉
    row.dispatchEvent(touchEvt('touchstart', 300, 200));
    row.dispatchEvent(touchEvt('touchmove', 298, 260));
    row.dispatchEvent(touchEvt('touchmove', 297, 320));
    row.dispatchEvent(touchEvt('touchend', 297, 320));
    await app.tick();
    ok('纵向滑动不触发行内操作', !row.classList.contains('sw-open'));

    // I1-d 长按弹操作菜单（桌面鼠标 / 无障碍兜底入口）
    app.click(app.nav('pool')); await app.tick();
    const poolAppRow = app.doc.querySelector('.pool-card.row-sw');
    const pd = new app.window.Event('pointerdown', { bubbles: true, cancelable: true });
    pd.clientX = 100; pd.clientY = 100;
    poolAppRow.dispatchEvent(pd);
    await app.tick(600);
    ok('长按弹出 iOS 风格操作菜单', !!app.doc.querySelector('.as') && app.doc.querySelectorAll('.as-item').length >= 2);
    ok('菜单里删除项用 danger 样式（朱红）', !!app.doc.querySelector('.as-item.danger'));
    const cancel = app.doc.querySelector('.as-cancel');
    ok('菜单有独立「取消」', !!cancel);
    if (cancel) { app.click(cancel); await app.tick(300); }

    // I1-e 轻点行 = 该行主操作（交易/自选=编辑）
    app.click(app.nav('trades')); await app.tick();
    const row3 = app.doc.querySelector('.tr-row.row-sw');
    app.click(row3.querySelector('.tr-nm'));
    await app.tick();
    const f3 = app.doc.getElementById('tradeForm');
    ok('轻点交易行打开编辑弹窗', !!f3);

    ok('行内操作改造无运行时错误', app.errs.length === 0, app.errs.slice(0, 2).join(' | '));
  }

  /* ============ 12. 首页节奏 / 持仓层级 / 空状态（I2 / I3 / I4） ============ */
  section('[12] 首页节奏 / 持仓信息层级 / 空状态与少数据态（I2 / I3 / I4）');
  {
    const app = boot();
    app.click(app.nav('home')); await app.tick();

    // I2 快捷入口：次级功能收成一行四图标钮
    const qrow = app.doc.querySelector('.pg-home .quick-row');
    ok('首页快捷入口是一行四图标钮', !!qrow && qrow.querySelectorAll('.qk-i').length === 4,
       qrow ? '按钮数 ' + qrow.querySelectorAll('.qk-i').length : '未找到 .quick-row');
    ok('首页不再有 2×2 快捷白卡', !app.doc.querySelector('.pg-home .quick-grid'));
    ok('首页存在节奏分级（章节起始 / 大分段）',
       !!app.doc.querySelector('.pg-home .sec-head.gap-m') && !!app.doc.querySelector('.pg-home .sec-head.gap-l'));

    // I3 持仓行：三个主角 + 次级降级（结构层）
    const pos = app.doc.querySelector('.pos-row');
    ok('持仓行保留三个主角：名称 / 现价 / 涨跌%',
       !!pos && !!pos.querySelector('.pos-nm') && !!pos.querySelector('.pos-p') && !!pos.querySelector('.pos-pc'));
    ok('代码 / 股数 / 成本降到次级行', !!pos && !!pos.querySelector('.pos-cd') && !!pos.querySelector('.pos-sm') && !!pos.querySelector('.pos-am'));

    // 字号层级属于 CSS，jsdom 不加载 styles.css，直接查样式源
    const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
    ok('现价提到 17px（主角）', /\.pos-p \{[^}]*font-size: 17px/.test(css));
    ok('股数/成本/金额降到 11px（次级）',
       /\.pos-sm \{[^}]*font-size: 11px/.test(css) && /\.pos-am \{[^}]*font-size: 11px/.test(css));
    ok('页面节奏三档 14 / 22 / 30 已定义',
       /\.pg > \* \{ margin-top: 14px/.test(css) &&
       /\.sec-head\.gap-m \{ margin-top: 22px/.test(css) &&
       /\.sec-head\.gap-l \{ margin-top: 30px/.test(css));

    // 数据提醒条（A 方案行内胶囊）：jsdom 无网络 → 汇率走 fallback（updatedAt=0）→ 必然 stale
    const dwRow = app.doc.querySelector('.dw-row');
    ok('首页数据提醒是行内胶囊条（.dw-row）', !!dwRow, dwRow ? '' : '未找到 .dw-row');
    ok('提醒条可点击跳转（data-goto 指向处理页）',
       !!dwRow && ['trades', 'settings'].indexOf(dwRow.getAttribute('data-goto')) >= 0,
       dwRow ? ('goto=' + dwRow.getAttribute('data-goto')) : '');
    ok('旧版黄底 alert 块结构已移除', !app.doc.querySelector('.data-warn-i'));

    ok('首页改造无运行时错误', app.errs.length === 0, app.errs.slice(0, 2).join(' | '));
  }

  {
    // I4：零数据模式下的空状态与少数据态
    const app2 = boot({ empty: true });
    app2.click(app2.nav('home')); await app2.tick();
    ok('首页持仓空态 = 标题 + 说明 + 行动按钮',
       !!app2.doc.querySelector('.pg-home .empty.es .es-t') &&
       !!app2.doc.querySelector('.pg-home .empty.es .es-s') &&
       !!app2.doc.querySelector('.pg-home .empty.es .es-act'));
    ok('走势图进入少数据态（不画两点直线）',
       !!app2.doc.querySelector('.pf-box .perf-few') && !!app2.doc.querySelector('.pf-note'));

    app2.click(app2.nav('trades')); await app2.tick();
    ok('交易记录空态带「记一笔」按钮', !!app2.doc.querySelector('.es-act[data-open-add-trade]'));
    app2.click(app2.nav('pool')); await app2.tick();
    ok('股票池空态带「加自选」按钮', !!app2.doc.querySelector('.es-act[data-open-add-pool]'));

    app2.window.location.hash = '#/discipline'; await app2.tick();
    ok('纪律健康度无样本时进引导态（环置灰 + 记一笔）',
       !!app2.doc.querySelector('.dh-ring.is-empty') && !!app2.doc.querySelector('.dh-act'));
    ok('规则库空态带模板库入口', !!app2.doc.querySelector('.es-act[data-open-template-rule]'));
    ok('零数据模式无运行时错误', app2.errs.length === 0, app2.errs.slice(0, 2).join(' | '));
  }

  /* ============ 13. 行内操作教学：peek 动画，不弹文字条 ============ */
  section('[13] 手势教学 = peek 动画（Material hint motion，替掉文字 toast）');
  {
    const app = boot();
    app.click(app.nav('trades')); await app.tick(1600);   // 演示延迟 1.1s，等它真正开始
    const inn0 = app.doc.querySelector('#main .tr-row.row-sw .sw-in');
    ok('首次进列表：第一行把操作块完整滑出（全露，不是露一角）',
       !!inn0 && /translateX\(-\d{2,}px\)/.test(inn0.style.transform || ''),
       inn0 ? ('transform=' + inn0.style.transform) : 'no .sw-in');
    const tEl = app.doc.getElementById('toast');
    const tText = app.doc.getElementById('toastText');
    const tShown = !!(tEl && tEl.classList.contains('show'));
    ok('不再弹「左滑或长按」文字条', !tShown || !/左滑/.test(tText.textContent || ''),
       tShown ? ('toast=' + tText.textContent) : 'toast 未显示');
    await app.tick(2900);
    ok('保持约 2.5 秒后自动收回归位',
       !!inn0 && !/translateX\(-[1-9]/.test(inn0.style.transform || ''),
       inn0 ? ('transform=' + inn0.style.transform) : '');
    const ex1 = JSON.parse(app.window.localStorage.getItem('app_config_extra') || '{}');
    ok('演示次数真的落盘（修复前 setConfig 会静默丢字段）', ex1.rowActHintCount === 1, JSON.stringify(ex1));

    // 长按 = 已经学会 → 之后任何列表都不再演示
    const row1 = app.doc.querySelector('#main .tr-row.row-sw');
    row1.dispatchEvent(new app.window.MouseEvent('pointerdown', { bubbles: true, clientX: 120, clientY: 200 }));
    await app.tick(600);
    const ex2 = JSON.parse(app.window.localStorage.getItem('app_config_extra') || '{}');
    ok('做过一次手势 → 标记 rowActLearned', ex2.rowActLearned === true, JSON.stringify(ex2));
    app.click(app.nav('pool')); await app.tick(900);
    const pInn = app.doc.querySelector('#main .pool-card.row-sw .sw-in');
    ok('学会之后切到其他列表不再演示 peek',
       !pInn || !/translateX\(-[1-9]/.test(pInn.style.transform || ''),
       pInn ? ('transform=' + pInn.style.transform) : 'n/a');
    ok('无运行时错误', app.errs.length === 0, app.errs.slice(0, 2).join(' | '));
  }
  {
    // 跨进程封顶：演示满 3 次仍未学会，也不再演示（不能变成每次进页都抖一下）
    const app = boot();
    app.window.localStorage.setItem('app_config_extra', JSON.stringify({ rowActHintCount: 3 }));
    app.click(app.nav('trades')); await app.tick(900);
    const inn = app.doc.querySelector('#main .tr-row.row-sw .sw-in');
    ok('演示次数封顶后不再 peek',
       !inn || !/translateX\(-[1-9]/.test(inn.style.transform || ''),
       inn ? ('transform=' + inn.style.transform) : 'n/a');
  }

  /* ============ 行情自动刷新与跨日口径 ============ */
  section('[11] 启动行情与今日盈亏日期');
  {
    const localDate = new Date();
    const localYmd = [localDate.getFullYear(), String(localDate.getMonth() + 1).padStart(2, '0'), String(localDate.getDate()).padStart(2, '0')].join('-');
    const nyParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(localDate);
    const nyFields = Object.fromEntries(nyParts.map(p => [p.type, p.value]));
    const nyYmd = nyFields.year + '-' + nyFields.month + '-' + nyFields.day;
    let quoteRequests = 0;
    const app = boot({ fetch: url => {
      if (!String(url).includes('qt.gtimg.cn/q=')) return Promise.reject(new Error('stub other fetch'));
      quoteRequests++;
      const symbols = decodeURIComponent(String(url).split('q=')[1]).split(',');
      const text = symbols.map(symbol => {
        const date = symbol.startsWith('us') ? nyYmd : localYmd;
        return 'v_' + symbol + '="1~TEST~' + symbol + '~100~99~100~' + date.replace(/-/g, '') + '120000"';
      }).join(';') + ';';
      const buf = Buffer.from(text, 'utf8');
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) });
    }});
    ok('冷启动先隐藏未核实的今日盈亏', /行情待更新/.test(app.main.textContent));
    await app.tick(50);
    ok('行情未齐时主金额保持横线，不误写成 ¥0.00', app.main.querySelector('.hero-num').textContent.trim() === '—');
    await app.tick(2100);
    const D = app.window.AppData;
    const summary = D.dashboardSummary();
    ok('冷启动自动请求持仓行情', quoteRequests >= 3, '请求 ' + quoteRequests + ' 次');
    ok('所有持仓行情到齐后显示今日盈亏', summary.todayPnlReady && summary.todayQuoteCount === summary.todayHoldingCount && !/行情待更新/.test(app.main.querySelector('.hero').textContent),
      '覆盖 ' + summary.todayQuoteCount + '/' + summary.todayHoldingCount);
    const first = D.getPositions().positions[0];
    const staleDate = '2000-01-01';
    D.updateStockPrices([{ code: first.stockCode, price: 101, change: 99, changePercent: 99,
      market: first.market, quoteFetchedAt: Date.now() + 1000, quoteDate: staleDate }]);
    ok('上一交易日涨跌额不会混进今日盈亏', !D.dashboardSummary().todayPnlReady);
  }
  {
    const app = boot({ empty: true });
    const D = app.window.AppData;
    D.addTrade({ stockCode: 'MSFT', stockName: 'Microsoft', type: 'buy', quantity: 2, price: 50, market: 'us' });
    ok('未进股票池的持仓仍被列入刷新目标', D.getQuoteTargets().some(s => s.code === 'MSFT'));
    D.updateStockPrices([{ code: 'MSFT', price: 75, change: 1, changePercent: 1.35, market: 'us',
      quoteFetchedAt: Date.now(), quoteDate: '2000-01-01' }]);
    ok('持仓报价不擅自添加到股票池', D.getStockPool().length === 0 && D.getPositions().positions[0].currentPrice === 75);
  }
  {
    // 中国周一上午，美股尚未开新交易日：保留上周五那场交易的收盘涨跌。
    const now = '2026-10-19T02:00:00Z';
    const app = boot({ empty: true, now: () => now });
    const D = app.window.AppData;
    D.addTrade({ stockCode: '600519', stockName: '茅台', type: 'buy', quantity: 1, price: 90, market: 'sh' });
    D.addTrade({ stockCode: 'AAPL', stockName: 'Apple', type: 'buy', quantity: 1, price: 90, market: 'us' });
    const fetchedAt = app.window.Date.now();
    D.updateStockPrices([
      { code: '600519', market: 'sh', price: 100, change: 2, quoteDate: '2026-10-19', quoteFetchedAt: fetchedAt },
      { code: 'AAPL', market: 'us', price: 100, change: 10, quoteDate: '2026-10-16', quoteFetchedAt: fetchedAt },
    ]);
    const s = D.dashboardSummary();
    ok('美股未开盘时上一场收益计入覆盖', s.todayPnlReady && s.todayQuoteCount === 2 && s.todayUsPreviousSessionCount === 1);
    ok('美股上场收益与 A 股当日收益相加', Math.abs(s.todayPnl - 73) < 0.01, '合计=' + s.todayPnl);
    D.updateStockPrices([{ code: '600519', market: 'sh', price: 101, change: 3, quoteDate: '2026-10-16', quoteFetchedAt: fetchedAt }]);
    ok('A股交易时段的旧行情仍显示待更新', !D.dashboardSummary().todayPnlReady);
    D.setConfig({ quoteRefreshMinutes: 10 });
    ok('10 分钟间隔写入并能重新读取', D.getConfig().quoteRefreshMinutes === 10 && JSON.parse(app.window.localStorage.getItem('app_config_extra')).quoteRefreshMinutes === 10);
    app.click(app.nav('settings'));
    await app.tick(40);
    app.click(app.doc.querySelector('[data-sw-tab="settings"][data-tab="data"]'));
    const select = app.doc.getElementById('quoteRefreshMinutes');
    ok('设置页显示已保存的 10 分钟间隔', !!select && select.value === '10');
    select.value = '5';
    select.dispatchEvent(new app.window.Event('change', { bubbles: true }));
    ok('设置页切回 5 分钟后立即保存', D.getConfig().quoteRefreshMinutes === 5);
  }
  {
    let clock = Date.parse('2026-10-20T03:59:00Z'); // 北京周二 11:59，纽约周一 23:59
    const app = boot({ empty: true, now: () => clock });
    const D = app.window.AppData;
    D.addTrade({ stockCode: '600519', stockName: '茅台', type: 'buy', quantity: 1, price: 90, market: 'sh' });
    D.addTrade({ stockCode: '00700', stockName: '腾讯', type: 'buy', quantity: 1, price: 90, market: 'hk' });
    D.addTrade({ stockCode: 'AAPL', stockName: 'Apple', type: 'buy', quantity: 1, price: 90, market: 'us' });
    const quoteAt = app.window.Date.now();
    D.updateStockPrices([
      { code: '600519', market: 'sh', price: 100, change: 2, quoteDate: '2026-10-20', quoteFetchedAt: quoteAt },
      { code: '00700', market: 'hk', price: 100, change: -1, quoteDate: '2026-10-20', quoteFetchedAt: quoteAt },
      { code: 'AAPL', market: 'us', price: 100, change: 10, quoteDate: '2026-10-19', quoteFetchedAt: quoteAt },
    ]);
    const beforeNoon = D.dashboardSummary();
    clock += 2 * 60000; // 北京 12:01，纽约日期翻到周二；美股报价尚未换场
    const afterNoon = D.dashboardSummary();
    ok('纽约午夜不会让美股上场收益在北京时间中午归零', beforeNoon.todayPnlReady && afterNoon.todayPnlReady && beforeNoon.todayPnl === afterNoon.todayPnl && Math.abs(afterNoon.todayMarketPnl.us.pnl - 71) < 0.01);
    ok('三市场人民币明细之和等于首页总额', Math.abs(afterNoon.todayPnl - Object.values(afterNoon.todayMarketPnl).reduce((sum, item) => sum + item.pnl, 0)) < 0.01);
    app.click(app.main.querySelector('[data-open-pnl]'));
    const popup = app.modal;
    ok('点击盈亏卡片打开三市场弹窗', app.doc.getElementById('modalBackdrop').classList.contains('show') && popup.querySelectorAll('[data-pnl-market]').length === 3);
    const cnRow = popup.querySelector('[data-pnl-market="cn"]');
    const hkRow = popup.querySelector('[data-pnl-market="hk"]');
    const usRow = popup.querySelector('[data-pnl-market="us"]');
    ok('三市场主金额和合计均为人民币', [cnRow, hkRow, usRow].every(row => /¥/.test(row.querySelector('.pnl-market-amount').textContent)) && /¥/.test(popup.querySelector('.pnl-detail-total strong').textContent) && !popup.querySelector('.pnl-detail-total small'));
    ok('A 股不显示外币折算', !cnRow.querySelector('.pnl-market-fx'));
    ok('港股只显示港币等额', /HK\$/.test(hkRow.querySelector('.pnl-market-fx').textContent) && !/US\$/.test(hkRow.querySelector('.pnl-market-fx').textContent));
    ok('美股只显示美元等额', /US\$/.test(usRow.querySelector('.pnl-market-fx').textContent) && !/HK\$/.test(usRow.querySelector('.pnl-market-fx').textContent));
    ok('三市场保留持仓变动和今日卖出', [cnRow, hkRow, usRow].every(row => /持仓变动/.test(row.querySelector('.pnl-market-detail').textContent) && /今日卖出/.test(row.querySelector('.pnl-market-detail').textContent)));
    app.click(popup.querySelector('[data-close-modal]'));
    app.main.querySelector('[data-open-pnl]').dispatchEvent(new app.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    ok('键盘回车也能打开盈亏明细', app.doc.getElementById('modalBackdrop').classList.contains('show'));
    clock += 60 * 60000; // 美股旧报价已有一小时；其他市场重新取到行情
    D.updateStockPrices([
      { code: '600519', market: 'sh', price: 100, change: 2, quoteDate: '2026-10-20', quoteFetchedAt: clock },
      { code: '00700', market: 'hk', price: 100, change: -1, quoteDate: '2026-10-20', quoteFetchedAt: clock },
    ]);
    ok('美股短时断网仍保留上一场收益', D.dashboardSummary().todayPnlReady && Math.abs(D.dashboardSummary().todayMarketPnl.us.pnl - 71) < 0.01);
    clock = Date.parse('2026-10-20T14:00:00Z'); // 北京 22:00，美股周二已开盘
    D.updateStockPrices([
      { code: '600519', market: 'sh', price: 100, change: 2, quoteDate: '2026-10-20', quoteFetchedAt: clock },
      { code: '00700', market: 'hk', price: 100, change: -1, quoteDate: '2026-10-20', quoteFetchedAt: clock },
      { code: 'AAPL', market: 'us', price: 98, change: -2, quoteDate: '2026-10-20', quoteFetchedAt: clock },
    ]);
    const newSession = D.dashboardSummary();
    ok('美股新交易日行情到达后切换为新收益', newSession.todayPnlReady && Math.abs(newSession.todayMarketPnl.us.pnl + 14.2) < 0.01 && newSession.todayUsPreviousSessionCount === 0);
  }
  {
    const app = boot({ empty: true, now: () => '2026-10-20T03:00:00Z' });
    const D = app.window.AppData;
    D.addTrade({ stockCode: '600519', stockName: '茅台', type: 'buy', quantity: 1, price: 100, market: 'sh', timestamp: '2026-10-20T09:30:00+08:00' });
    D.addTrade({ stockCode: '600519', stockName: '茅台', type: 'sell', quantity: 1, price: 110, market: 'sh', timestamp: '2026-10-20T10:30:00+08:00' });
    const s = D.dashboardSummary();
    ok('卖出后无持仓的已实现盈亏仍归入原市场', s.todayPnlReady && Math.abs(s.todayPnl - 10) < 0.01 && Math.abs(s.todayMarketPnl.cn.realized - 10) < 0.01);
  }
  {
    let clock = Date.parse('2026-10-20T01:00:00Z'); // 北京 9:00，A 股尚未开盘
    const app = boot({ empty: true, now: () => clock });
    const D = app.window.AppData;
    D.addTrade({ stockCode: '600519', stockName: '茅台', type: 'buy', quantity: 1, price: 90, market: 'sh' });
    D.updateStockPrices([{ code: '600519', market: 'sh', price: 100, change: 3, quoteDate: '2026-10-20', quoteFetchedAt: clock }]);
    ok('A 股开盘前不计入价格涨跌', D.dashboardSummary().todayPnlReady && D.dashboardSummary().todayMarketPnl.cn.pnl === 0);
    clock = Date.parse('2026-10-20T04:00:00Z'); // 北京 12:00，午休不是开盘前
    D.updateStockPrices([{ code: '600519', market: 'sh', price: 100, change: 3, quoteDate: '2026-10-19', quoteFetchedAt: clock }]);
    ok('A 股午休仍取当天行情，旧报价提示待更新', !D.dashboardSummary().todayPnlReady);
    clock = Date.parse('2026-10-20T07:05:00Z'); // 北京 15:05，拿到收盘报价
    D.updateStockPrices([{ code: '600519', market: 'sh', price: 102, change: 5, quoteDate: '2026-10-20', quoteFetchedAt: clock }]);
    clock = Date.parse('2026-10-20T11:00:00Z'); // 北京 19:00，数小时未刷新
    ok('A 股收盘报价晚间固定保留', D.dashboardSummary().todayPnlReady && D.dashboardSummary().todayMarketPnl.cn.pnl === 5);
  }
  {
    let clock = Date.parse('2026-10-19T15:10:00Z'); // 北京 10 月 19 日 23:10，港交所休市
    const app = boot({ empty: true, now: () => clock });
    const D = app.window.AppData;
    [['600519','sh'],['00700','hk'],['01810','hk'],['AAPL','us'],['TSLA','us']].forEach(([stockCode, market]) => {
      D.addTrade({ stockCode, stockName: stockCode, type: 'buy', quantity: 1, price: 90, market });
    });
    D.updateStockPrices([
      { code: '600519', market: 'sh', price: 100, change: -1, quoteDate: '2026-10-19', quoteFetchedAt: clock },
      { code: '00700', market: 'hk', price: 100, change: 5, quoteDate: '2026-10-16', quoteFetchedAt: clock - 2 * 3600000 },
      { code: '01810', market: 'hk', price: 100, change: 4, quoteDate: '2026-10-16', quoteFetchedAt: clock - 2 * 3600000 },
      { code: 'AAPL', market: 'us', price: 100, change: 2, quoteDate: '2026-10-19', quoteFetchedAt: clock },
      { code: 'TSLA', market: 'us', price: 100, change: 3, quoteDate: '2026-10-19', quoteFetchedAt: clock },
    ]);
    const holiday = D.dashboardSummary();
    ok('港股官方休市日不再卡在 3/5', holiday.todayPnlReady && holiday.todayQuoteCount === 5 && holiday.todayMarketPnl.hk.ready && holiday.todayMarketPnl.hk.pnl === 0);
    ok('港股休市只计 A 股与美股收益', Math.abs(holiday.todayPnl - 34.5) < 0.01, '合计=' + holiday.todayPnl);
    app.click(app.main.querySelector('[data-open-pnl]'));
    ok('休市明细标明港股休市和最近行情日期', /今日休市/.test(app.modal.querySelector('[data-pnl-market="hk"]').textContent) && /10-16/.test(app.modal.querySelector('[data-pnl-market="hk"]').textContent));
    clock = Date.parse('2026-10-20T15:10:00Z'); // 次日恢复交易，旧报价不能继续冒充今日价格
    D.updateStockPrices([{ code: '00700', market: 'hk', price: 100, change: 5, quoteDate: '2026-10-16', quoteFetchedAt: clock }]);
    ok('港股恢复交易后旧日期仍须待更新', !D.dashboardSummary().todayMarketPnl.hk.ready);
  }
  {
    let clock = Date.parse('2026-10-19T02:00:00Z');
    let interval = null, quoteRequests = 0;
    const app = boot({ now: () => clock, onInterval: cb => { interval = cb; }, fetch: url => {
      if (!String(url).includes('qt.gtimg.cn/q=')) return Promise.reject(new Error('stub other fetch'));
      quoteRequests++;
      const symbols = decodeURIComponent(String(url).split('q=')[1]).split(',');
      const text = symbols.map(symbol => 'v_' + symbol + '="1~TEST~' + symbol + '~100~99~100~20261019120000"').join(';') + ';';
      const buf = Buffer.from(text, 'utf8');
      return Promise.resolve({ ok: true, arrayBuffer: () => Promise.resolve(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)) });
    }});
    await app.tick(2800);
    const firstRequests = quoteRequests;
    clock += 4 * 60000;
    interval();
    await app.tick(20);
    ok('5 分钟冷却内不重复请求', quoteRequests === firstRequests);
    clock += 2 * 60000;
    interval();
    await app.tick(2100);
    ok('APP 持续打开超过 5 分钟自动再次刷新', quoteRequests > firstRequests, '请求 ' + firstRequests + ' → ' + quoteRequests);
  }

  section('[14] 四张指标卡与跨月盈亏');
  {
    let clock = Date.parse('2026-10-20T00:00:00Z');
    const app = boot({ empty: true, now: () => clock });
    const D = app.window.AppData;
    ok('首次有效行情创建真实快照', D.getAccountSnapshots().length === 1 && Number.isFinite(D.getAccountSnapshots()[0].first.floatingPnL));
    clock += 60000;
    D.addTrade({ stockCode: '600519', stockName: '茅台', market: 'sh', type: 'buy', quantity: 1, price: 100, timestamp: '2026-10-20T08:01:00+08:00' });
    D.updateStockPrices([{ code: '600519', market: 'sh', price: 110, change: 0, quoteDate: '2026-10-20', quoteFetchedAt: clock }]);
    ok('行情齐备后更新当日快照', D.recordAccountSnapshot() && D.getAccountSnapshots()[0].last.floatingPnL === 10);
    ok('真实快照驱动本月持仓盈亏变化', D.dashboardSummary().monthPnl === 10);
    clock += 60000;
    D.updateStockPrices([{ code: '600519', market: 'sh', price: 90, change: 0, quoteDate: '2026-10-20', quoteFetchedAt: clock }]);
    D.recordAccountSnapshot();
    ok('持仓从盈转亏时月盈亏同步转负', D.dashboardSummary().monthPnl === -10 && D.getAccountSnapshots()[0].first.floatingPnL === 0);
  }
  {
    const app = boot();
    const labels = { assets: '总资产明细', floating: '浮动盈亏明细', month: '本月盈亏 · 月视图', realized: '已兑现盈亏明细' };
    for (const kind of Object.keys(labels)) {
      const card = app.main.querySelector('[data-kpi="' + kind + '"]');
      app.click(card);
      ok('点击' + kind + '卡片打开对应明细', app.modal.textContent.includes(labels[kind]));
      if (kind === 'month') {
        ok('月视图有 12 个月入口', app.modal.querySelectorAll('[data-kpi-month]').length === 12);
        app.click(app.modal.querySelector('[data-kpi-year="-1"]'));
        ok('月视图能切换年份', app.modal.querySelectorAll('[data-kpi-month]').length === 12);
      }
      app.click(app.modal.querySelector('[data-close-modal]'));
    }
  }
  {
    const clock = Date.parse('2026-10-19T08:00:00Z');
    const app = boot({ empty: true, now: () => clock });
    const D = app.window.AppData;
    const p = (date, floating) => ({ capturedAt: Date.parse(date), totalAssets: 100000 + floating, floatingPnL: floating });
    const previous = { day: '2026-09-30', first: p('2026-09-30T08:00:00Z', 0), last: p('2026-09-30T08:00:00Z', 0) };
    const sale = [
      { id: 'B1', stockCode: '600519', stockName: '茅台', market: 'sh', type: 'buy', quantity: 100, price: 100, timestamp: '2026-09-20T10:00:00+08:00' },
      { id: 'S1', stockCode: '600519', stockName: '茅台', market: 'sh', type: 'sell', quantity: 100, price: 110, timestamp: '2026-10-05T10:00:00+08:00' },
    ];
    const snapshots = (floating) => [previous, { day: '2026-10-19', first: p('2026-10-19T07:00:00Z', 0), last: p('2026-10-19T08:00:00Z', floating) }];
    D.importAll({ trades: sale, accountSnapshots: snapshots(1000) });
    let m = D.monthlyPerformance('2026-10');
    ok('本月卖出盈利 1000 加持仓增加 1000 等于 2000', m && m.pnl === 2000 && m.realized === 1000 && m.floating === 1000 && m.full);
    D.importAll({ accountSnapshots: snapshots(-500) });
    m = D.monthlyPerformance('2026-10');
    ok('持仓随后回落 1500，本月盈亏剩 500', m && m.pnl === 500);
    D.importAll({ accountSnapshots: snapshots(-1500) });
    m = D.monthlyPerformance('2026-10');
    ok('持仓随后回落 2500，本月盈亏为负 500', m && m.pnl === -500);
    ok('资产快照进入全量备份', JSON.parse(D.exportAll()).accountSnapshots.length === 2);
    D.importAll({ accountSnapshots: [{ day: '2026-10-19', first: p('2026-10-19T07:00:00Z', 0), last: p('2026-10-19T08:00:00Z', -1500) }] });
    ok('没有月初记录时明确标为非完整月份', D.monthlyPerformance('2026-10').full === false);
  }

  section('[15] 统一浅色选择面板');
  {
    const app = boot({ now: () => '2026-10-19T16:30:00Z' });
    app.click(app.nav('trades')); await app.tick();
    app.click(app.doc.querySelector('[data-open-add-trade]')); await app.tick();
    const form = app.doc.getElementById('tradeForm');
    ok('设备时区不是北京时间时，新交易仍默认北京时间日期', form.querySelector('[name="date"]').value === '2026-10-20');
    form.querySelector('[name="code"]').value = 'TEST';
    form.querySelector('[name="name"]').value = '测试标的';
    form.querySelector('[name="qty"]').value = '1';
    form.querySelector('[name="price"]').value = '100';
    form.dispatchEvent(new app.window.Event('submit', { bubbles: true, cancelable: true }));
    const saved = app.window.AppData.getTrades().find(t => t.stockCode === 'TEST');
    ok('保存交易使用北京时间和 +08:00 时区', saved && saved.timestamp === '2026-10-20T00:30:00+08:00');
  }
  {
    const app = boot();
    app.click(app.nav('trades')); await app.tick();
    app.click(app.doc.querySelector('[data-edit-trade]')); await app.tick();
    const form = app.doc.getElementById('tradeForm');
    const dateInput = form && form.querySelector('[name="date"]');
    const dateTrigger = form && form.querySelector('.picker-date-trigger');
    ok('交易日期改为 APP 内入口，原字段保留', dateInput && dateInput.type === 'hidden' && dateTrigger && !!dateInput.value);
    app.click(dateTrigger);
    ok('交易日期打开浅色日历面板', !!app.doc.querySelector('#pickerBackdrop.show .picker-days'));
    app.click(app.doc.querySelector('[data-picker-nav="-1"]'));
    const monthLabel = app.doc.querySelector('.picker-date-nav strong').textContent;
    app.click(app.doc.querySelector('[data-picker-day="15"]'));
    app.click(app.doc.querySelector('[data-picker-done]'));
    ok('换月选日后 FormData 得到所选日期', /\d{4} 年 \d{2} 月/.test(monthLabel) && dateInput.value.endsWith('-15') && new app.window.FormData(form).get('date') === dateInput.value);
    ok('选完日期关闭选择面板，交易表单仍在', !app.doc.querySelector('#pickerBackdrop.show') && !!app.doc.getElementById('tradeForm'));
    app.click(app.modal.querySelector('[data-close-modal]'));

    app.click(app.nav('pool')); await app.tick();
    app.click(app.doc.querySelector('[data-edit-pool]')); await app.tick();
    const poolForm = app.doc.getElementById('poolForm');
    ok('股票池四个下拉均用 APP 内入口', poolForm.querySelectorAll('select[hidden]').length === 4 && poolForm.querySelectorAll('.picker-trigger').length === 4);
    app.click(poolForm.querySelector('#poolMarketPicker'));
    app.click(app.doc.querySelector('[data-picker-option="1"]'));
    ok('股票池选择结果仍提交原字段', poolForm.querySelector('#poolMarket').value === 'hk' && new app.window.FormData(poolForm).get('market') === 'hk');
    app.click(app.modal.querySelector('[data-close-modal]'));
    app.click(app.doc.querySelector('[data-open-batch-pool]')); await app.tick();
    const batchForm = app.doc.getElementById('batchPoolForm');
    ok('批量入池两个下拉也使用统一面板', batchForm.querySelectorAll('select[hidden]').length === 2 && batchForm.querySelectorAll('.picker-trigger').length === 2);
    app.click(app.modal.querySelector('[data-close-modal]'));

    app.click(app.nav('settings')); await app.tick();
    app.click(app.doc.querySelector('[data-sw-tab="settings"][data-tab="data"]')); await app.tick();
    const refresh = app.doc.getElementById('quoteRefreshMinutes');
    app.click(app.doc.getElementById('quoteRefreshMinutesPicker'));
    app.click(app.doc.querySelector('[data-picker-option="1"]'));
    ok('刷新间隔选择仍触发设置保存', refresh.value === '10' && app.window.AppData.getConfig().quoteRefreshMinutes === 10);
    app.window.location.hash = '#/discipline'; await app.tick();
    const ruleRow = app.doc.querySelector('[data-edit-rule]');
    if (ruleRow) {
      app.click(ruleRow); await app.tick();
      const op = app.modal.querySelector('.re-op');
      const opButton = app.modal.querySelector('.picker-compact');
      ok('规则运算符也使用统一面板', op && op.hidden && opButton);
      app.click(opButton);
      app.click(app.doc.querySelector('[data-picker-option="2"]'));
      ok('规则运算符选择仍更新原字段', op.value === 'less');
    } else ok('规则运算符也使用统一面板', false, '规则页没有规则行');
    ok('统一选择面板无运行时错误', app.errs.length === 0, app.errs.slice(0, 2).join(' | '));
  }

  /* ============ 汇总 ============ */
  console.log('\n' + '='.repeat(52));
  console.log(pass + ' passed, ' + fail + ' failed');
  if (fail) { console.log('\n失败项：'); failures.forEach(f => console.log('  - ' + f)); }
  console.log('='.repeat(52));
  process.exit(fail ? 1 : 0);
})();
