# 投资看板 · Android APP

投资看板是一款以持仓和交易记录为核心的 Android APP。打开首页，可以查看最新行情下的持仓、今日盈亏，以及资产和收益明细。涨跌采用红涨绿跌的显示方式。

## 主要功能

- **今日盈亏**：刷新持仓行情后计算当日盈亏；点击卡片可查看 A 股、港股、美股的人民币明细，并在港股、美股下分别显示港币、美元等额。
- **资产与收益**：查看持仓市值变化、逐只股票浮动盈亏、月度盈亏和逐笔已兑现盈亏。本月盈亏按「本月已兑现盈亏＋持仓浮盈相对月初的变化」计算。
- **交易账本**：记录买卖、计算持仓成本及已兑现盈亏，支持编辑、删除撤销和 CSV 导入导出。
- **股池与纪律**：管理关注的股票、目标价和止损价，记录交易心得，查看纪律规则与提醒。
- **AI 分析**：自行填写 API URL、Key 和模型 ID，使用持仓相关数据进行对话或生成诊断报告；未配置 Key 或请求失败时，诊断会明确标注本地统计结果。
- **本地数据管理**：账本数据主要保存在设备上，支持备份和恢复。

## 计算口径

A 股和港股按北京时间的当日交易计算，收盘后保留结果。美股显示最近一场交易的涨跌，直到行情源返回下一交易日的数据。部分持仓行情尚未更新时，今日盈亏会标明待更新，避免展示无法核实的合计。

首页的“总资产”当前指**已记录持仓的市值**，不包含未录入的现金。月度收益依赖已保存的资产快照；缺少月初记录的月份会标明统计起点，不补造历史收益。

## 数据与 AI

账本数据保存在本机。API Key 保存在设备的 `localStorage` 中，**未加密**，导出备份不包含 Key。使用 AI 对话或诊断时，本次分析所需的持仓、交易、规则及心得会发送至用户自行配置的 AI 服务。

## 技术与版本

项目使用 Capacitor 6 构建 Android APP，界面和业务逻辑使用 HTML、CSS、JavaScript。当前版本为 **v271**，对应 Android 版本号 **1.0.271**。

## 目录

- 投资看板-app-prototype/：唯一 APP 工程。
- 投资看板-app-prototype/assets/ 与 lib/：运行所需图标和本地库。
- 投资看板-app-prototype/tests/ 与 tools/：冒烟测试和构建辅助工具。
- 投资看板-app-prototype/android/：Android 原生工程。
- AGENTS.md 与 CLAUDE.md：项目规则，两份内容须一致。

独立 UI 探索副本、`www/` 同步产物、Android 构建目录、本机 SDK 与旧版 APK 不纳入源码仓库。

## 浏览器预览

从项目根目录运行 python -m http.server 8767，然后访问 http://localhost:8767/投资看板-app-prototype/index.html。不要直接双击 HTML 文件，file:// 环境可能无法使用 localStorage。

## 测试与打包

进入 投资看板-app-prototype/ 后：

1. 首次运行 npm ci 安装 APP 自己的依赖，再运行 npm run version:check 和 npm run smoke。
2. 修改源码后，将根目录的九个 WebView 文件及 assets/、lib/ 同步到 www/；插件变更后先运行 npm run build:plugins。
3. 运行 npx cap sync android。
4. 首次构建时，在 `android/` 生成自己的调试签名文件（该文件不提交）：`keytool -genkeypair -keystore debug.keystore -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 -storepass android -keypass android -dname "CN=Android Debug,O=Android,C=US"`。
5. 进入 android/，运行 gradlew.bat assembleDebug。
6. 检查 android/app/build/outputs/apk/debug/app-debug.apk 的版本和资源，并在手机上验证。

发版前可用 node tools/bump-version.js 升级版本。v271 包含四张指标卡弹窗、行情日期解析修复，以及交易日期和各处下拉的浅色 APP 内选择面板。新交易日期按北京时间默认和保存；文件导入仍调用 Android 系统文件选择器。

开发细则、目录命名与清理规则见 AGENTS.md。
