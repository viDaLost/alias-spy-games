package com.vidalost.biblegames

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.webkit.WebViewClientCompat
import com.vidalost.biblegames.data.AndroidSessionStore
import com.vidalost.biblegames.data.AssetRepository
import com.vidalost.biblegames.data.CloudRepository
import com.vidalost.biblegames.data.StoredAndroidSession
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import kotlinx.coroutines.delay

private const val WEB_APP_ORIGIN = "appassets.androidplatform.net"
private const val WEB_APP_URL = "https://$WEB_APP_ORIGIN/assets/index.html"
private const val SESSION_POLL_MS = 120L
private const val CAMERA_REQUEST_CODE = 7301
private const val WEB_CACHE_PREFS = "android_web_parity_runtime"
private const val WEB_CACHE_VERSION = "cache_version"
private const val WEB_REVEAL_WATCHDOG_MS = 2_500L
private const val WEB_LOAD_TIMEOUT_MS = 10_000L

/**
 * Android keeps the existing Telegram-code login as the trusted identity gate,
 * then renders the same production Web UI from APK-bundled assets through
 * WebViewAssetLoader. The UI no longer depends on GitHub Pages being reachable
 * at startup, while cloud APIs and multiplayer continue to use HTTPS normally.
 */
@Composable
fun AndroidParityApp(
    assets: AssetRepository,
    cloud: CloudRepository,
    sessionStore: AndroidSessionStore,
) {
    var session by remember { mutableStateOf(sessionStore.load()) }
    var nativeFallback by rememberSaveable { mutableStateOf(false) }

    LaunchedEffect(session?.token) {
        cloud.setSessionToken(session?.token.orEmpty())
    }

    // BibleGamesApp owns the audited OTP flow. As soon as it stores the
    // encrypted session, switch to the shared Web UI without reopening the APK.
    LaunchedEffect(session == null, nativeFallback) {
        if (session != null || nativeFallback) return@LaunchedEffect
        while (true) {
            delay(SESSION_POLL_MS)
            val restored = sessionStore.load()
            if (restored != null) {
                session = restored
                return@LaunchedEffect
            }
        }
    }

    if (nativeFallback) {
        BibleGamesApp(assets = assets, cloud = cloud)
        return
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
        onNativeFallback = { nativeFallback = true },
    )
}

@SuppressLint("SetJavaScriptEnabled")
@Composable
private fun AndroidWebExperience(
    session: StoredAndroidSession,
    onLogout: () -> Unit,
    onNativeFallback: () -> Unit,
) {
    val context = LocalContext.current
    val appContext = context.applicationContext
    val activity = context as? Activity
    val assetLoader = remember(appContext) {
        WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(appContext))
            .build()
    }

    var webView by remember { mutableStateOf<WebView?>(null) }
    var loadFailed by remember(session.userId) { mutableStateOf(false) }
    var committed by remember(session.userId) { mutableStateOf(false) }
    var reloadKey by remember { mutableIntStateOf(0) }

    // A few vendor WebViews can omit onPageCommitVisible. Since the main HTML is
    // local now, a bounded watchdog is enough to avoid a permanent startup veil.
    LaunchedEffect(webView, reloadKey, session.userId) {
        val view = webView ?: return@LaunchedEffect

        delay(WEB_REVEAL_WATCHDOG_MS)
        if (!committed && !loadFailed) {
            val hasDocument = !view.url.isNullOrBlank() && view.url != "about:blank"
            if (hasDocument && view.progress >= 60) committed = true
        }

        delay(WEB_LOAD_TIMEOUT_MS - WEB_REVEAL_WATCHDOG_MS)
        if (!committed && !loadFailed) loadFailed = true
    }

    BackHandler(enabled = true) {
        val view = webView
        if (view == null) {
            activity?.finish()
        } else {
            view.evaluateJavascript(JS_BACK_TO_MENU) { result ->
                if (result != "\"handled\"") {
                    if (view.canGoBack()) view.goBack() else activity?.finish()
                }
            }
        }
    }

    // Important: this effect must NOT be keyed by webView. Keying it by the
    // instance destroys the freshly-created WebView when state changes null ->
    // instance during the first composition. Cleanup belongs to screen disposal.
    DisposableEffect(Unit) {
        onDispose {
            webView?.apply {
                stopLoading()
                removeJavascriptInterface("AndroidApp")
                loadUrl("about:blank")
                destroy()
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
        AndroidView(
            modifier = Modifier.fillMaxSize(),
            factory = { viewContext ->
                WebView(viewContext).apply {
                    val appWebView = this
                    setBackgroundColor(AndroidColor.rgb(224, 242, 254))
                    setLayerType(View.LAYER_TYPE_HARDWARE, null)
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
                        userAgentString = "$userAgentString BibleGamesAndroid/${BuildConfig.VERSION_NAME} WebParity"
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
                            onLogout = onLogout,
                        ),
                        "AndroidApp",
                    )

                    webChromeClient = AndroidParityChromeClient(activity)
                    webViewClient = object : WebViewClientCompat() {
                        override fun shouldInterceptRequest(
                            view: WebView,
                            request: WebResourceRequest,
                        ): WebResourceResponse? {
                            return assetLoader.shouldInterceptRequest(request.url)
                                ?: super.shouldInterceptRequest(view, request)
                        }

                        override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                            committed = false
                            loadFailed = false
                        }

                        override fun onPageCommitVisible(view: WebView?, url: String?) {
                            committed = true
                        }

                        override fun onPageFinished(view: WebView?, url: String?) {
                            if (!loadFailed) committed = true
                        }

                        override fun onReceivedError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            error: WebResourceError?,
                        ) {
                            if (request?.isForMainFrame == true) loadFailed = true
                        }

                        override fun onReceivedHttpError(
                            view: WebView?,
                            request: WebResourceRequest?,
                            errorResponse: WebResourceResponse?,
                        ) {
                            if (request?.isForMainFrame == true && (errorResponse?.statusCode ?: 0) >= 400) {
                                loadFailed = true
                            }
                        }

                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            val uri = request?.url ?: return false
                            val sameApp = uri.scheme == "https" && uri.host.equals(WEB_APP_ORIGIN, ignoreCase = true)
                            if (sameApp) return false
                            return openExternal(activity, uri)
                        }
                    }

                    webView = this
                    loadUrl(webUrl(reloadKey))
                }
            },
            update = { view ->
                if (view.url.isNullOrBlank() || view.url == "about:blank") {
                    view.loadUrl(webUrl(reloadKey))
                }
            },
        )

        if (!committed && !loadFailed) {
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

        if (loadFailed) {
            Box(
                Modifier.fillMaxSize().background(Color(0xE6E0F2FE)).padding(22.dp),
                contentAlignment = Alignment.Center,
            ) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        "Не удалось запустить интерфейс",
                        color = Ink,
                        fontSize = 23.sp,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Интерфейс уже встроен в приложение и не зависит от GitHub Pages. Повторите запуск; если проблема сохранится, можно открыть автономный режим.",
                        color = InkSoft,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(16.dp))
                    PrimaryButton(
                        text = "Повторить запуск",
                        onClick = {
                            loadFailed = false
                            committed = false
                            reloadKey += 1
                            webView?.loadUrl(webUrl(reloadKey))
                        },
                        modifier = Modifier.fillMaxWidth(),
                        icon = "↻",
                    )
                    Spacer(Modifier.height(9.dp))
                    SecondaryButton(
                        text = "Открыть автономную версию",
                        onClick = onNativeFallback,
                        modifier = Modifier.fillMaxWidth(),
                        accent = Indigo,
                        icon = "◆",
                    )
                }
            }
        }
    }
}

private class AndroidParityChromeClient(private val activity: Activity?) : WebChromeClient() {
    override fun onPermissionRequest(request: PermissionRequest?) {
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
    private val onLogout: () -> Unit,
) {
    @JavascriptInterface
    fun getTelegramId(): String = userId

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
