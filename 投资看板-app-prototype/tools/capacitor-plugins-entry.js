/* Capacitor 插件 JS 侧桥接（无打包器方案）
 *
 * 背景：Capacitor 3+ 不再把 npm 插件自动暴露到 window.Capacitor.Plugins，
 * 官方插件必须经 JS 侧 registerPlugin 才能调用；而本工程是无打包静态页面，
 * 之前 Plugins.App/Haptics/LocalNotifications/StatusBar 全部不可用
 * （返回键接管、触感、通知其实从未生效过）。
 *
 * 本文件用 esbuild 把 @capacitor/core + 各官方插件打包成 IIFE，
 * 挂回 window.Capacitor.Plugins.<Name>，app.js 既有代码零改动。
 * 源 entry：tools/capacitor-plugins-entry.js（根目录 tools/ 下）。
 * 重新生成：node tools/build-capacitor-plugins.js
 */
import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import { Haptics } from '@capacitor/haptics';
import { LocalNotifications } from '@capacitor/local-notifications';
import { StatusBar } from '@capacitor/status-bar';
import { Share } from '@capacitor/share';
import { Filesystem } from '@capacitor/filesystem';
import { Directory, Encoding } from '@capacitor/filesystem';

window.Capacitor = window.Capacitor || {};
window.Capacitor.Plugins = window.Capacitor.Plugins || {};

// 各插件 npm 包在 import 时已 registerPlugin(name)，这里把 proxy 挂回全局，
// 与旧代码 window.Capacitor.Plugins.App 的访问方式保持兼容。
window.Capacitor.Plugins.App = App;
window.Capacitor.Plugins.Haptics = Haptics;
window.Capacitor.Plugins.LocalNotifications = LocalNotifications;
window.Capacitor.Plugins.StatusBar = StatusBar;
window.Capacitor.Plugins.Share = Share;
window.Capacitor.Plugins.Filesystem = Filesystem;
window.Capacitor.Plugins.CapacitorHttp = CapacitorHttp;

// 目录/编码枚举：无打包时拿不到 import 的枚举，挂出来给 exportContent 用
window.Capacitor.Plugins._Directory = Directory;
window.Capacitor.Plugins._Encoding = Encoding;
