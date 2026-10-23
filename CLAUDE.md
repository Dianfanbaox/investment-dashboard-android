# 投资看板 · 移动端项目规范

本项目只保留 Android 移动端 APP。APP 是 Capacitor 6 混合应用，前端使用原生 HTML、CSS、JavaScript；不使用根目录的 Web 工程。

## 目录约定

- 投资看板-app-prototype/ 是唯一的 APP 工程。
- 投资看板-app-ui-v2/ 是独立的 UI 探索副本。原工程不因视觉探索而修改；副本保留相同业务功能与数据接口。副本中的 design-preview/ 仅放静态界面示意稿，命名为页面名（如 home.html、home.png），定稿后清理过时草稿前先取得用户同意。
- 该目录根部的 index.html、styles.css、app.js、mock.js、market.js、fifo.js、discipline.js、sw.js、manifest.webmanifest 是 WebView 源码。修改这些文件后才同步产物。
- capacitor.config.ts、package.json、package-lock.json 是 APP 配置与依赖清单。APP 自己的开发依赖包含 TypeScript，供 Capacitor 读取配置文件。
- assets/icons/ 保存应用图标与开屏资源；lib/ 保存 APP 使用的本地第三方资源。
- tools/ 保存版本校验、版本升级和 Capacitor 插件桥构建脚本；tests/ 保存冒烟测试。插件变更后运行 npm run build:plugins，同时更新 lib/ 与 www/lib/ 的桥接包。
- www/ 是 Capacitor 的 webDir 构建输入，由源码和资源同步得到。不要直接修改其中的业务代码。
- android/ 是 Android 原生工程。原生配置和资源可以在这里修改；android/app/src/main/assets/public/ 与各 build/ 目录是生成内容，不要手改。
- 根目录的 AGENTS.md 与 CLAUDE.md 必须保持完全一致；README.md 记录给人看的运行和构建说明。
- 新增目录前先在本文件登记用途、命名和清理规则。临时验证文件只放临时目录，用完清理，不留在源码根部。
- .android-sdk/、.jdk21/、.gradle_home/ 是本机离线构建环境；.trae/、.workbuddy/ 是辅助工作资料；.git/ 是版本历史。不得作为 APP 垃圾清理。

## 当前架构

- 当前版本戳 v271。版本号同时出现在 index.html 的资源 URL、sw.js 的缓存名、app.js 的 APP_VERSION 和 Android versionCode/versionName。
- 今日盈亏明细的主金额和三市场合计使用人民币；A 股不显示外币折算，港股只显示港币等额，美股只显示美元等额；各市场保留“持仓变动”和“今日卖出”明细。
- 首页四张指标卡可点开明细。总资产沿用现有“持仓市值”口径，不包含未记录的现金；资产历史以行情齐备时的北京时间每日首末快照为准，旧日期不伪造。月盈亏按本月已兑现盈亏加持仓浮盈相对月初的变化计算，缺少月初基线时标记“自记录日起”，不能称为完整月收益。每日快照使用独立的 app_account_snapshots 本地键，纳入全量备份；不改动旧交易记录。已兑现明细以 FIFO 卖出记录为准。
- 快照保存当时的月度已兑现值和交易摘要；修改旧交易后若快照与账本不匹配，该月份不显示无法核实的盈亏，不自动删除历史快照。
- Hash 路由共 8 条：底部 5 Tab 为 home、trades、pool、ai、settings；二级页为 insights、discipline、notices。
- index.html 是应用壳；styles.css 是 iOS 浅色视觉系统。品牌蓝 #0066CC，涨红 #E02B36，跌绿 #0C8652。旧 Acid Y2K 设计已废弃。
- 交易日期与 APP 内的下拉项使用统一的浅色选择面板，原表单字段继续承载 value 和 change 事件；新交易默认日期与保存时间按北京时间生成，不随设备时区变化；文件导入继续使用 Android 系统文件选择器。
- app.js 负责路由、页面渲染、模态、手势、通知、AI 交互、图表和导入导出。
- mock.js 暴露 AppData，负责本地数据、CRUD、配置和 AI 上下文。所有业务数据增删改必须走 AppData API。
- market.js 暴露 AppMarket，负责腾讯行情和外汇汇率；fifo.js 暴露 AppFifo，负责先进先出持仓及盈亏；discipline.js 暴露 AppDiscipline，负责交易和账户级规则扫描。
- 本地数据使用 app_ 前缀的 localStorage 键。未入股票池的持仓报价缓存使用 app_position_quotes。启动时刷新全部自选与持仓行情；前台持续运行和回到前台时按设置的 5/10 分钟间隔刷新。A 股、港股在北京时间当天开盘后计入本交易日涨跌，收盘后维持；周末和已登记的港股休市日按 0 计算持仓价格变动，不将上一交易日涨跌误报为今日涨跌，也不把成功取得的上场行情标记为请求失败。港股休市日清单按香港交易所官方证券市场假期表维护，当前覆盖 2026、2027 年；新年份发布时更新清单与对应测试。美股沿用最近一场交易的涨跌，直到行情源返回下一交易日的新行情，不在北京时间中午清零。今日盈亏卡片可点开三市场明细，主金额为人民币，各市场外币折算按上方约定显示；卖出已实现盈亏按北京时间当天归属市场。AI 配置默认使用 MiniMax 兼容接口；API Key 仅保存在本机配置，不写入源码、日志或提交。
- AI 诊断报告原生读取超时为 120 秒，对话总超时为 90 秒。连接测试仅验证短请求；报告和对话失败时应显示可判断的错误原因。
- 删除交互提供 5 秒撤销，恢复数据必须走 AppData.restore。Android 原生能力包括通知、触感、返回键、文件系统和分享。

## 修改与验证

1. 先改本文件中的约定，再改目录结构；同步修改 CLAUDE.md。
2. 首次进入 APP 工程先运行 npm ci。只在 APP 源码位置修改业务代码；修改后运行 npm run version:check 与 npm run smoke。
3. 发版时使用 tools/bump-version.js 统一升级版本戳，核对 index.html、sw.js、app.js 和 android/app/build.gradle。
4. 将九个 WebView 源文件与 assets/、lib/ 同步到 www/；运行 npx cap sync android。
5. 在 android/ 运行 gradlew.bat assembleDebug；核对 APK 中的资源版本戳，再做真机检查。
6. 构建输出、截图和临时测试脚本不得留在源码根部；保留一份明确版本号的可安装 APK 即可。

## 工程边界

- 不修改 .env、密钥、token、CI/CD 配置，不做数据库迁移、git push/rebase/reset、全局依赖安装或公开发布，除非用户明确批准。
- 删除文件、目录或 git 历史前必须取得用户确认。
- 大改动先提供具体方案并等待确认。
- 不通过注释错误或绕过检查来让构建通过；改完主动验证。
