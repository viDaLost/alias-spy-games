package com.vidalost.biblegames

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.view.View
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
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

private const val WEB_APP_URL = "https://vidalost.github.io/alias-spy-games/"
private const val SESSION_POLL_MS = 120L

/**
 * Android keeps the existing Telegram-code login as the trusted identity gate,
 * then renders the exact production Web UI inside a hardened WebView. This
 * removes the permanent visual/feature drift that existed between Compose and
 * the Telegram/GitHub Pages client while preserving encrypted native sessions.
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

    // BibleGamesApp owns the already audited OTP flow. As soon as it stores the
    // encrypted session, switch to the production Web UI without requiring the
    // user to reopen the APK.
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
        // Reuse the current secure native login screen. It will only be visible
        // until verifyLoginCode saves the encrypted bearer session.
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
    val activity = context as? Activity
    var webView by remember { mutableStateOf<WebView?>(null) }
    var loadFailed by remember(session.userId) { mutableStateOf(false) }
    var committed by remember(session.userId) { mutableStateOf(false) }
    var reloadKey by remember { mutableIntStateOf(0) }

    BackHandler(enabled = webView?.canGoBack() == true) {
        webView?.goBack()
    }

    DisposableEffect(webView) {
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

                    webChromeClient = WebChromeClient()
                    webViewClient = object : WebViewClient() {
                        override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                            committed = false
                            loadFailed = false
                        }

                        override fun onPageCommitVisible(view: WebView?, url: String?) {
                            committed = true
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
                            if (request?.isForMainFrame == true && (errorResponse?.statusCode ?: 0) >= 500) {
                                loadFailed = true
                            }
                        }

                        override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                            val uri = request?.url ?: return false
                            val sameApp = uri.scheme == "https" && uri.host.equals("vidalost.github.io", ignoreCase = true)
                            if (sameApp) return false
                            return openExternal(activity, uri)
                        }
                    }

                    webView = this
                    loadUrl(webUrl(reloadKey))
                }
            },
            update = { view ->
                if (view.url.isNullOrBlank() || view.url == "about:blank") view.loadUrl(webUrl(reloadKey))
            },
        )

        // Prevent the white WebView first-frame flash. As soon as the HTML is
        // committed, the web startup portal takes over and this veil disappears.
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
            )
        }

        if (loadFailed) {
            Box(
                Modifier.fillMaxSize().background(Color(0xE6E0F2FE)).padding(22.dp),
                contentAlignment = Alignment.Center,
            ) {
                GlassCard(Modifier.fillMaxWidth()) {
                    Text(
                        "Не удалось открыть игровую версию",
                        color = Ink,
                        fontSize = 23.sp,
                        fontWeight = FontWeight.Black,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "Проверьте интернет или VPN. APK использует тот же интерфейс и те же игры, что и веб-версия.",
                        color = InkSoft,
                        textAlign = TextAlign.Center,
                    )
                    Spacer(Modifier.height(16.dp))
                    PrimaryButton(
                        text = "Повторить загрузку",
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

private fun webUrl(reloadKey: Int): String =
    "$WEB_APP_URL?android=1&apk=${BuildConfig.VERSION_CODE}&native=web-parity&r=$reloadKey"

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
