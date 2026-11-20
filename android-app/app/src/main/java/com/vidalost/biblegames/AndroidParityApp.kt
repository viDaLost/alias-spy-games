package com.vidalost.biblegames

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.app.AlertDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.JsResult
import android.webkit.PermissionRequest
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.webkit.WebViewAssetLoader
import com.vidalost.biblegames.data.AndroidSessionStore
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.data.CloudRepository
import com.vidalost.biblegames.data.StoredAndroidSession
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.PrimaryButton
import kotlinx.coroutines.delay

private const val WEB_APP_ORIGIN = "appassets.androidplatform.net"
private const val WEB_APP_PATH_PREFIX = "/assets/"
private const val WEB_APP_URL = "https://$WEB_APP_ORIGIN${WEB_APP_PATH_PREFIX}index.html"
private const val SESSION_POLL_MS = 120L
private const val CAMERA_REQUEST_CODE = 7301
private const val WEB_CACHE_PREFS = "android_web_parity_runtime"
private const val WEB_CACHE_VERSION = "cache_version"
private const val WEB_REVEAL_WATCHDOG_MS = 1_500L
private const val WEB_LOAD_TIMEOUT_MS = 8_000L

private enum class WebScreen(val failed: Boolean = false) {
    Loading,
    Ready,
    LoadError(true),
    RendererGone(true),
}

/**
 * The native screen owns the verified Android login. After a valid session
 * exists the APK renders its bundled Web UI from WebViewAssetLoader under the
 * private Android appassets HTTPS origin. The interface and all game assets are
 * therefore loaded from the APK itself and never from GitHub Pages. Only the
 * application API/Worker endpoints are contacted for online data and rooms.
 */
@Composable
fun AndroidParityApp(
    assets: AssetRepository,
    cloud: CloudRepository,
    sessionStore: AndroidSessionStore,
) {
    var session by remember { mutableStateOf(sessionStore.load()) }

    LaunchedEffect(session?.token) {
        cloud.setSessionToken(session?.token.orEmpty())
    }

    LaunchedEffect(session == null) {
        if (session != null) return@LaunchedEffect
        while (true) {
            delay(SESSION_POLL_MS)
            val restored = sessionStore.load()
            if (restored != null) {
                session = restored
                return@LaunchedEffect
            }
        }
    }

    val activeSession = session
    if (activeSession == null) {
        BibleGamesApp(assets = assets, cloud = cloud)
        return
    }

    LaunchedEffect(activeSession.expiresAt) {
        val remaining = activeSession.expiresAt - System.currentTimeMillis()
        if (remaining > 0) delay(remaining)
        sessionStore.clear()
        cloud.setSessionToken("")
        session = null
    }

    AndroidWebExperience(
        session = activeSession,
        onLogout = {
            sessionStore.clear()
            cloud.setSessionToken("")
            session = null
        },
    )
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun AndroidWebExperience(
    session: StoredAndroidSession,
    onLogout: () -> Unit,
) {
    val context = LocalContext.current
    val appContext = context.applicationContext
    val activity = context as? Activity
    val assetLoader = remember(appContext) {
        WebViewAssetLoader.Builder()
            .setDomain(WEB_APP_ORIGIN)
            .setHttpAllowed(false)
            .addPathHandler(WEB_APP_PATH_PREFIX, WebViewAssetLoader.AssetsPathHandler(appContext))
            .build()
    }

    var webView by remember { mutableStateOf<WebView?>(null) }
    var screen by remember(session.userId) { mutableStateOf(WebScreen.Loading) }
    var reloadKey by remember { mutableIntStateOf(0) }

    fun isLive(view: WebView?): Boolean = view != null && webView === view && !screen.failed

    LaunchedEffect(webView, screen) {
        val view = webView ?: return@LaunchedEffect
        if (screen != WebScreen.Loading) return@LaunchedEffect

        delay(WEB_REVEAL_WATCHDOG_MS)
        if (webView !== view || screen != WebScreen.Loading) return@LaunchedEffect
        val url = view.url
        if (!url.isNullOrBlank() && url != "about:blank" && view.progress >= 60) {
            screen = WebScreen.Ready
            return@LaunchedEffect
        }

        delay(WEB_LOAD_TIMEOUT_MS - WEB_REVEAL_WATCHDOG_MS)
        if (webView === view && screen == WebScreen.Loading) screen = WebScreen.LoadError
    }

    BackHandler(enabled = true) {
        val view = webView
        if (view == null || screen.failed) {
            activity?.finish()
        } else {
            view.evaluateJavascript(JS_BACK_TO_MENU) { result ->
                if (isLive(view) && result != "\"handled\"") {
                    if (view.canGoBack()) view.goBack() else activity?.finish()
                }
            }
        }
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(
                Brush.radialGradient(
                    colors = listOf(Color(0xFFE0F2FE), Color(0xFFDBEAFE), Color(0xFF6366F1)),
                    center = Offset(540f, 420f),
                    radius = 1700f,
                ),
            ),
    ) {
        if (screen.failed) {
            Box(
                Modifier.fillMaxSize().background(Color(0xE6E0F2FE)).padding(22.dp),
                contentAlignment = Alignment.Center,
            ) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        if (screen == WebScreen.RendererGone) "Игровой экран закрылся" else "Не удалось открыть игры",
                        color = Ink,
                        fontSize = 23.sp,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Откройте игры снова, чтобы вернуться в главное меню.",
                        color = InkSoft,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(16.dp))
                    PrimaryButton(
                        text = "Открыть игры снова",
                        onClick = {
                            reloadKey += 1
                            screen = WebScreen.Loading
                        },
                        modifier = Modifier.fillMaxWidth(),
                        icon = "↻",
                    )
                }
            }
            return@Box
        }

        val chromeClient = remember(activity) { AndroidParityChromeClient(activity) }
        // Own the WebView as a child so renderer loss can detach it immediately.
        fun releaseWebView(container: FrameLayout) {
            val view = container.getChildAt(0) as? WebView ?: return
            if (webView === view) webView = null
            chromeClient.release()
            container.removeView(view)
            view.destroy()
        }

        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                val container = FrameLayout(viewContext)
                val view = WebView(viewContext).apply {
                    val appWebView = this
                    setBackgroundColor(AndroidColor.rgb(224, 242, 254))
                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        databaseEnabled = true
                        cacheMode = WebSettings.LOAD_DEFAULT
                        mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                        allowFileAccess = false
                        allowContentAccess = false
                        builtInZoomControls = false
                        displayZoomControls = false
                        setSupportZoom(false)
                        mediaPlaybackRequiresUserGesture = false
                        offscreenPreRaster = false
                        userAgentString = "$userAgentString BibleGamesAndroid/${BuildConfig.VERSION_NAME} Standalone"
                    }

                    val cachePrefs = viewContext.getSharedPreferences(WEB_CACHE_PREFS, 0)
                    if (cachePrefs.getInt(WEB_CACHE_VERSION, 0) != BuildConfig.VERSION_CODE) {
                        clearCache(true)
                        cachePrefs.edit().putInt(WEB_CACHE_VERSION, BuildConfig.VERSION_CODE).apply()
                    }

                    CookieManager.getInstance().apply {
                        setAcceptCookie(true)
                        setAcceptThirdPartyCookies(appWebView, false)
                    }

                    addJavascriptInterface(
                        AndroidWebBridge(
                            activity = activity,
                            userId = session.userId,
                            sessionToken = session.token,
                            onLogout = {
                                if (isLive(appWebView)) onLogout()
                            },
                        ),
                        "AndroidApp",
                    )

                    webChromeClient = chromeClient
                    webViewClient = object : android.webkit.WebViewClient() {
                        override fun shouldInterceptRequest(
                            view: WebView,
                            request: WebResourceRequest,
                        ): WebResourceResponse? {
                            return assetLoader.shouldInterceptRequest(request.url)
                                ?: super.shouldInterceptRequest(view, request)
                        }

                        override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                            if (isLive(view)) screen = WebScreen.Loading
                        }

                        override fun onPageCommitVisible(view: WebView?, url: String?) {
                            if (isLive(view)) screen = WebScreen.Ready
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            if (isLive(view)) screen = WebScreen.Ready
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?,
                        ) {
                            if (isLive(view) && request?.isForMainFrame == true) {
                                screen = WebScreen.LoadError
                            }
                        }

                        override fun onReceivedHttpError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            errorResponse: WebResourceResponse?,
                        ) {
                            if (isLive(view) && request?.isForMainFrame == true && (errorResponse?.statusCode ?: 0) >= 400) {
                                screen = WebScreen.LoadError
                            }
                        }

                        override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                            if (view.parent === container) {
                                if (webView === view) screen = WebScreen.RendererGone
                                releaseWebView(container)
                            }
                            return true
                        }

                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            val uri = request?.url ?: return false
                            val sameBundledApp = uri.scheme == "https" &&
                                uri.host.equals(WEB_APP_ORIGIN, ignoreCase = true) &&
                                (uri.path ?: "").startsWith(WEB_APP_PATH_PREFIX)
                            if (sameBundledApp) return false
                            return openExternal(activity, uri)
                        }
                    }
                }
                container.addView(
                    view,
                    FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT),
                )
                webView = view
                view.loadUrl(webUrl(reloadKey))
                container
            },
            onRelease = ::releaseWebView,
        )

        if (screen == WebScreen.Loading) {
            Box(
                Modifier
                    .fillMaxSize()
                    .background(
                        Brush.radialGradient(
                            colors = listOf(Color(0xFFE0F2FE), Color(0xFFDBEAFE), Color(0xFF6366F1)),
                            radius = 1700f,
                        ),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    "Запускаем игры…",
                    color = InkSoft,
                    fontSize = 16.sp,
                    fontWeight = FontWeight.SemiBold,
                )
            }
        }
    }
}

private class AndroidParityChromeClient(
    private val activity: Activity?,
) : WebChromeClient() {
    private var released = false
    private var confirmDialog: AlertDialog? = null

    fun release() {
        released = true
        confirmDialog?.dismiss()
        confirmDialog = null
    }

    override fun onPermissionRequest(request: PermissionRequest?) {
        if (released) return
        val permissionRequest = request ?: return
        val wantsCamera = permissionRequest.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE)
        if (!wantsCamera || activity == null) {
            permissionRequest.deny()
            return
        }

        if (activity.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            permissionRequest.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
            return
        }

        activity.requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_REQUEST_CODE)
        permissionRequest.deny()
    }

    override fun onJsConfirm(view: WebView?, url: String?, message: String?, result: JsResult?): Boolean {
        if (released) return true
        val jsResult = result ?: return false
        val hostActivity = activity
        if (hostActivity == null) {
            jsResult.cancel()
            return true
        }

        hostActivity.runOnUiThread {
            if (released) return@runOnUiThread
            if (hostActivity.isFinishing || hostActivity.isDestroyed) {
                jsResult.cancel()
                return@runOnUiThread
            }
            val dialog = AlertDialog.Builder(hostActivity)
                .setTitle("Библейские игры")
                .setMessage(message.orEmpty())
                .setNegativeButton("Отмена") { _, _ -> if (!released) jsResult.cancel() }
                .setPositiveButton("OK") { _, _ -> if (!released) jsResult.confirm() }
                .setOnCancelListener { if (!released) jsResult.cancel() }
                .create()
            dialog.setOnDismissListener {
                if (confirmDialog === dialog) confirmDialog = null
            }
            confirmDialog = dialog
            dialog.show()
        }
        return true
    }
}

private fun webUrl(reloadKey: Int): String =
    "$WEB_APP_URL?android=1&apk=${BuildConfig.VERSION_CODE}&native=bundled-web&r=$reloadKey"

private fun openExternal(activity: Activity?, uri: Uri): Boolean {
    if (activity == null) return false
    return runCatching {
        activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
        true
    }.getOrDefault(false)
}

private class AndroidWebBridge(
    private val activity: Activity?,
    private val userId: String,
    private val sessionToken: String,
    private val onLogout: () -> Unit,
) {
    @JavascriptInterface
    fun getTelegramId(): String = userId

    @JavascriptInterface
    fun getSessionToken(): String = sessionToken

    @JavascriptInterface
    fun isAndroidApp(): Boolean = true

    @JavascriptInterface
    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun logout() {
        activity?.runOnUiThread(onLogout)
    }
}

private const val JS_BACK_TO_MENU = """
(() => {
  const root = document.getElementById('game-container');
  const inGame = document.body?.dataset?.mode === 'game' ||
    Boolean(document.body?.dataset?.currentGame) ||
    Boolean(root && root.childElementCount > 0);
  if (!inGame) return 'menu';

  const controls = root ? [...root.querySelectorAll('button,[role="button"],a')] : [];
  const back = controls.find((node) => {
    const text = String(node.textContent || '').trim();
    const aria = String(node.getAttribute?.('aria-label') || '').toLowerCase();
    return text === '←' || text === '‹' || /^назад$/i.test(text) || /^в меню$/i.test(text) ||
      aria.includes('назад') || aria.includes('back') || aria.includes('в меню');
  });
  if (back) {
    back.click();
    return 'handled';
  }

  try { window.__biblicalMatchThreeCleanup?.(); } catch (_) {}
  if (typeof window.renderMainMenu === 'function') {
    try {
      if (root) root.innerHTML = '';
      document.getElementById('menu-container')?.classList.remove('hidden');
      document.body.dataset.mode = 'menu';
      delete document.body.dataset.currentGame;
      window.renderMainMenu();
      window.scrollTo({ top: 0, behavior: 'auto' });
      return 'handled';
    } catch (_) {}
  }
  return 'menu';
})()
"""
