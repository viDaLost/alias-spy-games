package com.vidalost.psalmbook

import android.webkit.JavascriptInterface

/** Методы, доступные веб-части как `window.PsalmsNative`. */
class NativeBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun share(title: String, text: String) = activity.shareText(title, text)

    @JavascriptInterface
    fun copy(text: String) = activity.copyText(text)

    @JavascriptInterface
    fun vibrate(milliseconds: Int) = activity.buzz(milliseconds.toLong())

    @JavascriptInterface
    fun keepAwake(on: Boolean) = activity.setKeepAwake(on)

    @JavascriptInterface
    fun setTheme(dark: Boolean) = activity.setBarsLight(!dark)
}
