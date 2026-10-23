/* 版本戳统一校验（G 批次）
 * ---------------------------------------------------------------
 * 背景：发版要同时改 3 处——index.html 的 ?v=N（×N 个资源）、sw.js 的
 * CACHE='acid-app-vN'、app.js 的 APP_VERSION='N'。手工改容易漏一处：
 * 漏了 index.html → 用户拿到旧 JS；漏了 sw.js → 静态资源永远走旧缓存；
 * 漏了 app.js → 关于页写着旧版本，反馈问题时对不上号。
 *
 * 用法：npm run version:check   （冒烟测试里也会跑同一套断言）
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function collect(re, file, label) {
  const src = read(file);
  const set = new Set();
  let m;
  const rx = new RegExp(re, 'g');
  while ((m = rx.exec(src))) set.add(m[1]);
  return { file, label, versions: Array.from(set) };
}

const checks = [
  collect('\\?v=(\\d+)', 'index.html', 'index.html 资源版本戳'),
  collect("CACHE\\s*=\\s*'acid-app-v(\\d+)'", 'sw.js', 'sw.js 缓存名'),
  collect("APP_VERSION\\s*=\\s*'(\\d+)'", 'app.js', 'app.js APP_VERSION'),
];

let fail = 0;
const all = new Set();
checks.forEach(c => {
  if (c.versions.length === 0) {
    console.log('  ✗ ' + c.label + '（' + c.file + '）：未找到版本号');
    fail++;
    return;
  }
  if (c.versions.length > 1) {
    console.log('  ✗ ' + c.label + '（' + c.file + '）：出现多个版本号 ' + c.versions.join('/'));
    fail++;
    return;
  }
  all.add(c.versions[0]);
  console.log('  ✓ ' + c.label + ' = v' + c.versions[0]);
});

if (all.size > 1) {
  console.log('\n✗ 版本戳不一致：' + Array.from(all).map(v => 'v' + v).join(' / '));
  fail++;
} else if (all.size === 1) {
  console.log('\n版本戳一致：v' + Array.from(all)[0]);
}

// lib/ 静态资源（Chart.js 205KB 等）没有版本戳却走 cache-first → 永久陈旧
const idx = read('index.html');
const libNoStamp = (idx.match(/lib\/[^"')\s]+/g) || []).filter(u => !/\?v=/.test(u));
if (libNoStamp.length) {
  console.log('✗ lib/ 资源缺少版本戳（会被 SW 永久缓存）：' + libNoStamp.join(', '));
  fail++;
} else {
  console.log('✓ lib/ 资源均已带版本戳');
}

process.exit(fail ? 1 : 0);
