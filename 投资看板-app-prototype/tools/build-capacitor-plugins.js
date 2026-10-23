/* 重新生成 lib/capacitor-plugins.js，并同步到 www/lib/。
 * 用法：npm 装好插件后运行 node tools/build-capacitor-plugins.js
 * esbuild 是本工程的开发依赖，不依赖项目外的工作目录。 */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..');
/* 优先用 esbuild 的 JS API（比 CLI 稳：CLI 在不同 esbuild 版本间存在 flag 差异，
   实测出现过 "Invalid build flag: --outfile" 导致打包中断）；
   API 不可用时才退回 CLI。 */
const esbuildDirs = [
  path.join(ROOT, 'node_modules/esbuild'),
];
let api = null;
for (const d of esbuildDirs) {
  try { api = require(d); break; } catch (e) { /* 换下一个候选 */ }
}
if (!api) { try { api = require('esbuild'); } catch (e) {} }

async function build() {
  const output = path.join(ROOT, 'lib/capacitor-plugins.js');
  const webOutput = path.join(ROOT, 'www/lib/capacitor-plugins.js');
  fs.mkdirSync(path.dirname(webOutput), { recursive: true });
  if (api && typeof api.build === 'function') {
    await api.build({
      entryPoints: [path.join(__dirname, 'capacitor-plugins-entry.js')],
      bundle: true,
      format: 'iife',
      minify: true,
      outfile: output,
      logLevel: 'warning',
    });
    fs.copyFileSync(output, webOutput);
    console.log('✓ lib/ 与 www/lib/ 的 Capacitor 插件桥已更新');
    return;
  }
  const cli = path.join(ROOT, 'node_modules/esbuild/bin/esbuild');
  if (!fs.existsSync(cli)) { console.error('未找到 esbuild，请先安装'); process.exit(1); }
  execFileSync(process.execPath, [
    cli,
    path.join(__dirname, 'capacitor-plugins-entry.js'),
    '--bundle', '--format=iife', '--minify',
    '--outfile=' + output,
    '--log-level=warning',
  ], { stdio: 'inherit' });
  fs.copyFileSync(output, webOutput);
  console.log('✓ lib/ 与 www/lib/ 的 Capacitor 插件桥已更新');
}

build().catch(function (err) {
  console.error('✗ 插件桥接包构建失败：', err && err.message);
  process.exit(1);
});
