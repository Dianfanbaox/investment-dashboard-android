import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.acidinvert.investdash',
  appName: '投资看板',
  webDir: 'www',
  bundledWebRuntime: false,
  loggingBehavior: 'none',
  server: {
    androidScheme: 'https',
    allowNavigation: [
      'qt.gtimg.cn',        // 腾讯行情接口
      'api.siliconflow.cn',  // SiliconFlow AI
      'siliconflow.cn',
    ],
    cleartext: false,
  },
  android: {
    buildOptions: {
      signingType: 'apikey',
      // 使用 debug keystore，仅个人使用够用
    },
    allowMixedContent: true, // 允许行情接口混合内容
  },
  plugins: {
    LocalNotifications: {
      smallIcon: 'ic_stat_name',
      // 通知强调色：跟随 iOS 风格改为品牌蓝（原为 Y2K 荧光黄 #F7FF00）
      iconColor: '#0066CC',
      // 原来的 sound 配置指向一个并不存在的音频资源（工程里没有 res/raw），
      // 属于僵尸配置；去掉后走系统默认提示音。
    },
    StatusBar: {
      // 注意 Capacitor 语义是反的：源码为 setAppearanceLightStatusBars(!style.equals("DARK"))
      // → 'DARK' = 浅色图标(配深背景)；'LIGHT' = 深色图标(配浅背景)
      // 当前 UI 为浅色，必须设为 'light'，否则白色图标在 #F5F5F7 上几乎不可见
      style: 'light',
      backgroundColor: '#F5F5F7',
      overlaysWebView: true,
    },
    // SplashScreen 配置块已删除：本工程未安装 @capacitor/splash-screen 插件，
    // 这块配置从来不会生效（僵尸配置）。开屏统一由 WebView 内的 HTML 动效接管。
  },
};

export default config;
