package com.acidinvert.investdash;

import android.os.Bundle;
import android.os.Build;
import android.view.View;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.graphics.Color;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.Plugin;
import com.capacitorjs.plugins.localnotifications.LocalNotificationsPlugin;
import com.capacitorjs.plugins.statusbar.StatusBarPlugin;
import com.capacitorjs.plugins.haptics.HapticsPlugin;
import com.capacitorjs.plugins.app.AppPlugin;
import com.capacitorjs.plugins.share.SharePlugin;
import com.capacitorjs.plugins.filesystem.FilesystemPlugin;

import java.util.ArrayList;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        // 系统栏配色：必须与 styles.xml 的浅色主题一致（#F5F5F7 状态栏 / #F5F5F7 导航栏），
        // 且图标要切成深色（LIGHT_STATUS_BARS 的含义是「浅色背景 → 用深色图标」）。
        //
        // 原实现硬编码 Color.BLACK 并强制清掉 LIGHT 标志（Y2K 深色时代遗留）：
        // 浅色 UI 顶上压一条纯黑状态栏，且黑底配白图标、浅色导航栏配浅色图标 ——
        // 状态栏文字和导航键基本看不见。styles.xml 里配的浅色值也被这里覆盖掉了。
        if (getWindow() != null) {
            getWindow().setStatusBarColor(Color.parseColor("#F5F5F7"));
            getWindow().setNavigationBarColor(Color.parseColor("#F5F5F7"));
            // 内容延伸到系统栏下方（顶部/底部留白由 CSS 的 env(safe-area-inset-*) 处理）
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            WindowInsetsController controller = null;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                controller = getWindow().getInsetsController();
                if (controller != null) {
                    int light = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                              | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    controller.setSystemBarsAppearance(light, light);
                }
            } else {
                View decor = getWindow().getDecorView();
                int vis = decor.getSystemUiVisibility();
                vis |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                // API 26+ 才支持导航栏图标反色
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vis |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
                }
                decor.setSystemUiVisibility(vis);
            }
        }

        // 注册本地插件（避免依赖自动搜索）
        registerPlugin(LocalNotificationsPlugin.class);
        registerPlugin(StatusBarPlugin.class);
        registerPlugin(HapticsPlugin.class);
        // App 插件：提供 backButton 监听（返回键接管）与 exitApp。
        // 缺了它，弹窗打开时按返回键会直接退出 APP。
        registerPlugin(AppPlugin.class);
        // Share / Filesystem：真机导出（写缓存文件 + 系统分享面板）
        registerPlugin(SharePlugin.class);
        registerPlugin(FilesystemPlugin.class);
    }
}
