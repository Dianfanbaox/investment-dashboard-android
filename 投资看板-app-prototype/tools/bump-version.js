/* 版本戳一键升级（G 批次）
 * ---------------------------------------------------------------
 * 用法：
 *   node tools/bump-version.js          → 当前版本 +1
 *   node tools/bump-version.js 250      → 指定版本
 *
 * 会同步改 5 处（漏任何一处都会让「发版」变成假发版）：
 *   1) index.html  所有 ?v=N（含 lib/ 资源，缺戳的自动补上）
 *   2) sw.js       CACHE = 'acid-app-vN' + 预缓存清单里的 ?v=N
 *   3) app.js      APP_VERSION = 'N'
 *   4) android/app/build.gradle  versionCode / versionName
 * 改完自动跑一次 check-version 校验。
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const p = f => path.join(ROOT, f);
const read = f => fs.readFileSync(p(f), 'utf8');
const write = (f, s) => fs.writeFileSync(p(f), s);

// 1. 读当前版本（以 app.js 的 APP_VERSION 为准；取不到再从 index.html 兜底）
const appJs = read('app.js');
let cur = (appJs.match(/APP_VERSION\s*=\s*'(\d+)'/) || [])[1];
if (!cur) cur = (read('index.html').match(/\?v=(\d+)/) || [])[1];
if (!cur) { console.error('无法识别当前版本号'); process.exit(1); }

const next = (process.argv[2] && /^\d+$/.test(process.argv[2]))
  ? process.argv[2]
  : String(Number(cur) + 1);

if (next === cur) { console.error('目标版本与当前相同（v' + cur + '），无需升级'); process.exit(1); }

// 2. index.html：已带 ?v= 的替换；lib/ 资源缺戳的补 ?v=next
//    注意：lib URL 的匹配必须"吃到可选的旧 ?v=N 一起替换"。
//    旧写法用 (?!\?v=) 负向前瞻 + 回溯，会在已带戳的 URL 上把扩展名截断
//    （all.min.css → all.min.cs?v=249s?v=249），图标/图表/插件全部 404。
let idx = read('index.html');
idx = idx.replace(/\?v=\d+/g, '?v=' + next);
idx = idx.replace(/(lib\/[^"')\s?]+)(\?v=\d+)?/g, function (m0, url) {
  return url + '?v=' + next;
});
write('index.html', idx);

// 3. sw.js：缓存名 + 预缓存清单里的 ?v=N
//    只改 CACHE 不改清单 → 预缓存的 key 与页面请求的 app.js?v=N 对不上，
//    离线时一个文件都取不到（SW 白缓存一堆取不出来的东西）。
let sw = read('sw.js');
sw = sw.replace(/CACHE\s*=\s*'acid-app-v\d+'/, "CACHE = 'acid-app-v" + next + "'");
sw = sw.replace(/\?v=\d+/g, '?v=' + next);
write('sw.js', sw);

// 4. app.js
let app = read('app.js');
app = app.replace(/APP_VERSION\s*=\s*'\d+'/, "APP_VERSION = '" + next + "'");
write('app.js', app);

// 5. 安卓版本号（versionCode 恒为 1 曾导致覆盖安装时系统认为版本没变）
const gradlePath = 'android/app/build.gradle';
if (fs.existsSync(p(gradlePath))) {
  let g = read(gradlePath);
  g = g.replace(/versionCode\s+\d+/, 'versionCode ' + next);
  g = g.replace(/versionName\s+"[\d.]+"/, 'versionName "1.0.' + next + '"');
  write(gradlePath, g);
} else {
  console.warn('  未找到 ' + gradlePath + '，跳过安卓版本号同步');
}

console.log('版本戳 v' + cur + ' → v' + next);
console.log('  index.html / sw.js / app.js / build.gradle 已同步');

try {
  execFileSync(process.execPath, [p('tools/check-version.js')], { stdio: 'inherit' });
} catch (e) {
  console.error('校验未通过，请手工检查三处版本戳');
  process.exit(1);
}
