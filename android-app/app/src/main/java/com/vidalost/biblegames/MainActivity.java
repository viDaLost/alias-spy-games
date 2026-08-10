package com.vidalost.biblegames;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.JavascriptInterface;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.net.http.SslError;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import java.util.regex.Pattern;

public class MainActivity extends Activity {
    private static final String APP_URL = "https://vidalost.github.io/alias-spy-games/?android=1";
    private static final String BOT_URL = "https://t.me/username_to_id_bot";
    private static final String PREFS = "bible_games_android";
    private static final String PREF_TELEGRAM_ID = "telegram_id";
    private static final String ADMIN_ID = "1288379477";
    private static final Pattern TELEGRAM_ID_PATTERN = Pattern.compile("^[0-9]{5,20}$");

    private SharedPreferences preferences;
    private WebView webView;
    private ProgressBar progressBar;
    private String telegramId = "";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView.setWebContentsDebuggingEnabled(false);
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        telegramId = preferences.getString(PREF_TELEGRAM_ID, "");

        getWindow().setStatusBarColor(Color.parseColor("#FDFBF8"));
        getWindow().setNavigationBarColor(Color.parseColor("#E6F6FF"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        }

        if (isValidUserId(telegramId)) {
            showWebApp();
        } else {
            showLogin();
        }
    }

    private boolean isValidUserId(String value) {
        return value != null && TELEGRAM_ID_PATTERN.matcher(value.trim()).matches() && !ADMIN_ID.equals(value.trim());
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private GradientDrawable rounded(int color, float radiusDp) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(dp((int) radiusDp));
        return drawable;
    }

    private TextView text(String value, float sizeSp, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(sizeSp);
        view.setTextColor(color);
        view.setLineSpacing(0f, 1.12f);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private void showLogin() {
        destroyWebView();

        ScrollView scroll = new ScrollView(this);
        GradientDrawable background = new GradientDrawable(
                GradientDrawable.Orientation.TL_BR,
                new int[]{Color.parseColor("#FDFBF8"), Color.parseColor("#EEF3FF"), Color.parseColor("#DDF6FF")}
        );
        scroll.setBackground(background);
        scroll.setFillViewport(true);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setGravity(Gravity.CENTER_HORIZONTAL);
        root.setPadding(dp(22), dp(38), dp(22), dp(34));
        scroll.addView(root, new ScrollView.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        ImageView icon = new ImageView(this);
        icon.setImageResource(com.vidalost.biblegames.R.drawable.ic_launcher);
        LinearLayout.LayoutParams iconLp = new LinearLayout.LayoutParams(dp(88), dp(88));
        iconLp.bottomMargin = dp(18);
        root.addView(icon, iconLp);

        TextView title = text("Библейские игры", 31, Color.parseColor("#25236E"), true);
        title.setGravity(Gravity.CENTER);
        root.addView(title, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        TextView subtitle = text("Вход в Android-приложение", 17, Color.parseColor("#667085"), true);
        subtitle.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams subtitleLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subtitleLp.topMargin = dp(7);
        subtitleLp.bottomMargin = dp(24);
        root.addView(subtitle, subtitleLp);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(dp(20), dp(20), dp(20), dp(20));
        card.setBackground(rounded(Color.argb(235, 255, 255, 255), 26));
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        cardLp.bottomMargin = dp(14);
        root.addView(card, cardLp);

        TextView howTitle = text("Как узнать свой Telegram ID", 20, Color.parseColor("#312E81"), true);
        card.addView(howTitle);

        TextView steps = text(
                "1. Откройте Telegram и перейдите к боту @username_to_id_bot.\n" +
                "2. Нажмите Start / Запустить.\n" +
                "3. Бот покажет ваш числовой Telegram ID.\n" +
                "4. Скопируйте его и вставьте ниже.",
                15, Color.parseColor("#475467"), false
        );
        LinearLayout.LayoutParams stepsLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        stepsLp.topMargin = dp(12);
        card.addView(steps, stepsLp);

        Button botButton = new Button(this);
        botButton.setText("Открыть @username_to_id_bot");
        botButton.setTextSize(16);
        botButton.setAllCaps(false);
        botButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        botButton.setTextColor(Color.parseColor("#2563EB"));
        botButton.setBackground(rounded(Color.parseColor("#EEF4FF"), 18));
        botButton.setOnClickListener(v -> openExternal(BOT_URL));
        LinearLayout.LayoutParams botLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(54));
        botLp.topMargin = dp(16);
        card.addView(botButton, botLp);

        EditText input = new EditText(this);
        input.setHint("Например: 123456789");
        input.setTextSize(18);
        input.setSingleLine(true);
        input.setInputType(InputType.TYPE_CLASS_NUMBER);
        input.setPadding(dp(16), 0, dp(16), 0);
        input.setTextColor(Color.parseColor("#101828"));
        input.setHintTextColor(Color.parseColor("#98A2B3"));
        input.setBackground(rounded(Color.WHITE, 18));
        LinearLayout.LayoutParams inputLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58));
        inputLp.topMargin = dp(20);
        card.addView(input, inputLp);

        TextView error = text("", 14, Color.parseColor("#B42318"), true);
        error.setVisibility(View.GONE);
        LinearLayout.LayoutParams errorLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        errorLp.topMargin = dp(8);
        card.addView(error, errorLp);

        Button loginButton = new Button(this);
        loginButton.setText("Войти");
        loginButton.setTextSize(18);
        loginButton.setAllCaps(false);
        loginButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        loginButton.setTextColor(Color.WHITE);
        GradientDrawable loginBg = new GradientDrawable(
                GradientDrawable.Orientation.LEFT_RIGHT,
                new int[]{Color.parseColor("#4F46E5"), Color.parseColor("#2563EB"), Color.parseColor("#06B6D4")}
        );
        loginBg.setCornerRadius(dp(19));
        loginButton.setBackground(loginBg);
        LinearLayout.LayoutParams loginLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(58));
        loginLp.topMargin = dp(14);
        card.addView(loginButton, loginLp);

        loginButton.setOnClickListener(v -> {
            String value = input.getText().toString().trim();
            if (!TELEGRAM_ID_PATTERN.matcher(value).matches()) {
                error.setText("Введите числовой Telegram ID.");
                error.setVisibility(View.VISIBLE);
                return;
            }
            if (ADMIN_ID.equals(value)) {
                error.setText("Админ-профиль нельзя открыть через вход только по ID. Используйте Telegram Mini App.");
                error.setVisibility(View.VISIBLE);
                return;
            }
            telegramId = value;
            preferences.edit().putString(PREF_TELEGRAM_ID, telegramId).apply();
            showWebApp();
        });

        TextView note = text(
                "ID сохраняется только на этом устройстве. Такой вход не подтверждает владение Telegram-аккаунтом, поэтому административные функции в APK отключены.",
                13, Color.parseColor("#667085"), false
        );
        note.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams noteLp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        noteLp.topMargin = dp(8);
        root.addView(note, noteLp);

        setContentView(scroll);
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    private void showWebApp() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#FDFBF8"));

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#FDFBF8"));
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setTextZoom(100);
        settings.setUserAgentString(settings.getUserAgentString() + " BibleGamesAndroid/1.0");

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.addJavascriptInterface(new AndroidBridge(), "AndroidApp");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new AppWebViewClient());

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(true);
        progressBar.setVisibility(View.VISIBLE);

        root.addView(webView, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        FrameLayout.LayoutParams progressLp = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(3), Gravity.TOP);
        root.addView(progressBar, progressLp);

        setContentView(root);
        webView.loadUrl(APP_URL);
    }

    private class AppWebViewClient extends WebViewClient {
        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            return handleNavigation(request.getUrl());
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, String url) {
            return handleNavigation(Uri.parse(url));
        }

        @Override
        public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
            if (progressBar != null) progressBar.setVisibility(View.VISIBLE);
            if (!isAllowedAppPage(Uri.parse(url))) {
                view.stopLoading();
                openExternal(url);
            }
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            if (progressBar != null) progressBar.setVisibility(View.GONE);
        }

        @Override
        public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
            if (request.isForMainFrame()) {
                Toast.makeText(MainActivity.this, "Не удалось открыть приложение. Проверьте интернет.", Toast.LENGTH_LONG).show();
            }
        }

        @Override
        public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
            handler.cancel();
            Toast.makeText(MainActivity.this, "Безопасное соединение не установлено.", Toast.LENGTH_LONG).show();
        }
    }

    private boolean handleNavigation(Uri uri) {
        if (isAllowedAppPage(uri)) return false;
        openExternal(uri.toString());
        return true;
    }

    private boolean isAllowedAppPage(Uri uri) {
        if (uri == null) return false;
        String scheme = uri.getScheme() == null ? "" : uri.getScheme();
        String host = uri.getHost() == null ? "" : uri.getHost();
        String path = uri.getPath() == null ? "" : uri.getPath();
        return "https".equalsIgnoreCase(scheme)
                && "vidalost.github.io".equalsIgnoreCase(host)
                && path.startsWith("/alias-spy-games");
    }

    private void openExternal(String url) {
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            startActivity(intent);
        } catch (Exception ignored) {
            Toast.makeText(this, "Не удалось открыть ссылку.", Toast.LENGTH_SHORT).show();
        }
    }

    public class AndroidBridge {
        @JavascriptInterface
        public String getTelegramId() {
            return telegramId == null ? "" : telegramId;
        }

        @JavascriptInterface
        public boolean isAndroidApp() {
            return true;
        }

        @JavascriptInterface
        public String getAppVersion() {
            return "1.0.0";
        }

        @JavascriptInterface
        public void openTelegramIdBot() {
            runOnUiThread(() -> openExternal(BOT_URL));
        }

        @JavascriptInterface
        public void logout() {
            runOnUiThread(MainActivity.this::switchTelegramId);
        }
    }

    private void switchTelegramId() {
        preferences.edit().remove(PREF_TELEGRAM_ID).apply();
        telegramId = "";
        destroyWebView();
        showLogin();
    }

    private void destroyWebView() {
        if (webView != null) {
            try {
                webView.stopLoading();
                webView.loadUrl("about:blank");
                webView.removeJavascriptInterface("AndroidApp");
                webView.destroy();
            } catch (Exception ignored) {}
            webView = null;
        }
    }

    private void showExitDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Библейские игры")
                .setItems(new String[]{"Закрыть приложение", "Сменить Telegram ID", "Отмена"}, (dialog, which) -> {
                    if (which == 0) finish();
                    else if (which == 1) switchTelegramId();
                    else dialog.dismiss();
                })
                .show();
    }

    @Override
    public void onBackPressed() {
        if (webView == null) {
            super.onBackPressed();
            return;
        }

        String script = "(function(){try{" +
                "if(document.getElementById('support-modal-overlay')){document.getElementById('support-modal-overlay').click();return 'handled';}" +
                "if(document.body && (document.body.dataset.mode==='game'||document.body.dataset.mode==='admin')){" +
                "if(typeof window.goToMainMenu==='function'){window.goToMainMenu();return 'handled';}}" +
                "}catch(e){}return 'home';})()";

        webView.evaluateJavascript(script, result -> {
            if (result != null && result.contains("handled")) return;
            showExitDialog();
        });
    }

    @Override
    protected void onDestroy() {
        destroyWebView();
        super.onDestroy();
    }
}
