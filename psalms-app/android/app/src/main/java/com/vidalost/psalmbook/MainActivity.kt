package com.vidalost.psalmbook

import android.annotation.SuppressLint
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.webkit.WebSettingsCompat
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import androidx.webkit.WebViewFeature

/**
 * Оболочка приложения: полноэкранный WebView с офлайн-сборниками из assets.
 * Вся логика интерфейса живёт в веб-части, здесь — системная интеграция.
 */
class MainActivity : ComponentActivity() {

    private lateinit var web: WebView
    private var insetTop = 0f
    private var insetBottom = 0f
    private var pageReady = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        web = WebView(this).apply {
            setBackgroundColor(resources.getColor(R.color.window_bg, theme))
            overScrollMode = View.OVER_SCROLL_NEVER
            isVerticalScrollBarEnabled = false

            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.textZoom = 100
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.mediaPlaybackRequiresUserGesture = true
            settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT

            if (WebViewFeature.isFeatureSupported(WebViewFeature.ALGORITHMIC_DARKENING)) {
                // Тёмную тему рисует сама веб-часть, системное затемнение только мешает.
                WebSettingsCompat.setAlgorithmicDarkeningAllowed(settings, false)
            }

            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest,
                ): WebResourceResponse? = loader.shouldInterceptRequest(request.url)

                override fun onPageFinished(view: WebView, url: String) {
                    // Отступы приходят раньше, чем документ, — повторяем после загрузки.
                    pageReady = true
                    pushInsets()
                }
            }

            addJavascriptInterface(NativeBridge(this@MainActivity), "PsalmsNative")
        }

        setContentView(web)
        applyInsets()

        if (savedInstanceState != null) {
            web.restoreState(savedInstanceState)
        } else {
            web.loadUrl("https://appassets.androidplatform.net/assets/index.html")
        }

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.__psalmsBack ? window.__psalmsBack() : false") { answer ->
                    if (answer == "true") return@evaluateJavascript
                    if (web.canGoBack()) web.goBack() else finish()
                }
            }
        })
    }

    /** Передаёт системные отступы в CSS-переменные, чтобы контент не лез под панели. */
    private fun applyInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(web) { view, insets ->
            val bars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            val keyboard = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom
            val density = resources.displayMetrics.density
            view.setPadding(0, 0, 0, if (keyboard > bars.bottom) keyboard else 0)
            insetTop = bars.top / density
            insetBottom = if (keyboard > bars.bottom) 0f else bars.bottom / density
            pushInsets()
            insets
        }
        ViewCompat.requestApplyInsets(web)
    }

    private fun pushInsets() {
        if (!pageReady) return
        web.evaluateJavascript(
            """
            (function () {
              var root = document.documentElement;
              if (!root) return;
              root.style.setProperty('--sat', '${insetTop}px');
              root.style.setProperty('--sab', '${insetBottom}px');
            })();
            """.trimIndent(),
            null,
        )
    }

    override fun onConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.onConfigurationChanged(newConfig)
        web.setBackgroundColor(resources.getColor(R.color.window_bg, theme))
        ViewCompat.requestApplyInsets(web)
    }

    fun setBarsLight(light: Boolean) {
        runOnUiThread {
            val controller = WindowInsetsControllerCompat(window, web)
            controller.isAppearanceLightStatusBars = light
            controller.isAppearanceLightNavigationBars = light
        }
    }

    fun setKeepAwake(on: Boolean) {
        runOnUiThread {
            if (on) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }

    fun shareText(title: String, text: String) {
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title)
            putExtra(Intent.EXTRA_TEXT, text)
        }
        startActivity(Intent.createChooser(intent, title))
    }

    fun copyText(text: String) {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("Псалом", text))
    }

    fun buzz(milliseconds: Long) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE)
                as android.os.VibratorManager
            manager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as android.os.Vibrator
        }
        if (!vibrator.hasVibrator()) return
        vibrator.vibrate(
            android.os.VibrationEffect.createOneShot(
                milliseconds.coerceIn(4L, 40L),
                android.os.VibrationEffect.DEFAULT_AMPLITUDE,
            ),
        )
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }
}
