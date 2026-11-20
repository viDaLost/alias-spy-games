package com.vidalost.biblegames

import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.os.SystemClock
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidalost.biblegames.data.AndroidAuthChallenge
import com.vidalost.biblegames.data.AuthBotStartRequired
import com.vidalost.biblegames.data.CloudRepository
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val TELEGRAM_BOT_USERNAME = "bibleiskie_bot"
private const val TELEGRAM_ID_HELP_BOT_USERNAME = "userinfobot"
private const val RESEND_COOLDOWN_MS = 15_000L

private val loginChallengeSaver = listSaver<AndroidAuthChallenge?, Any>(
    save = { challenge ->
        if (challenge == null) emptyList()
        else listOf(challenge.telegramId, challenge.challengeId, challenge.expiresInSeconds, challenge.deliveryConfirmed)
    },
    restore = { values ->
        if (values.isEmpty()) null
        else AndroidAuthChallenge(values[0] as String, values[1] as String, values[2] as Int, values[3] as Boolean)
    },
)

@Composable
internal fun LoginScreen(
    cloud: CloudRepository,
    onLogin: (String, String, Long) -> Unit,
) {
    val context = LocalContext.current
    val focus = LocalFocusManager.current
    val scope = rememberCoroutineScope()
    val scroll = rememberScrollState()
    var id by rememberSaveable { mutableStateOf("") }
    var challenge by rememberSaveable(stateSaver = loginChallengeSaver) { mutableStateOf<AndroidAuthChallenge?>(null) }
    var resendAt by rememberSaveable { mutableLongStateOf(0L) }
    var secondsUntilResend by remember { mutableIntStateOf(0) }
    var code by remember { mutableStateOf("") }
    var error by rememberSaveable { mutableStateOf<String?>(null) }
    var needsBotStart by rememberSaveable { mutableStateOf(false) }
    var requesting by remember { mutableStateOf(false) }
    var verifying by remember { mutableStateOf(false) }
    val busy = requesting || verifying
    val current = challenge

    LaunchedEffect(current != null) { scroll.scrollTo(0) }
    LaunchedEffect(resendAt) {
        do {
            val remaining = (resendAt - SystemClock.elapsedRealtime()).coerceAtLeast(0L)
            secondsUntilResend = ((remaining + 999) / 1000).toInt()
            if (remaining == 0L) break
            delay(minOf(remaining, 1000L))
        } while (true)
    }

    fun openTelegram(username: String, startBot: Boolean = false) {
        val url = "https://t.me/$username" + if (startBot) "?start=android_login" else ""
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
        } catch (_: ActivityNotFoundException) {
            error = "Откройте @$username в Telegram."
        }
    }

    fun changeId() {
        focus.clearFocus()
        challenge = null
        code = ""
        error = null
        needsBotStart = false
        resendAt = 0L
    }

    fun requestCode() {
        if (busy || SystemClock.elapsedRealtime() < resendAt) return
        if (!id.matches(Regex("^[0-9]{5,20}$"))) {
            error = "Введите Telegram ID из 5–20 цифр."
            return
        }

        focus.clearFocus()
        requesting = true
        error = null
        needsBotStart = false
        scope.launch {
            try {
                cloud.requestLoginCode(id).onSuccess { result ->
                    challenge = result
                    code = ""
                    if (result.deliveryConfirmed) {
                        secondsUntilResend = (RESEND_COOLDOWN_MS / 1000).toInt()
                        resendAt = SystemClock.elapsedRealtime() + RESEND_COOLDOWN_MS
                    }
                }.onFailure { cause ->
                    needsBotStart = cause is AuthBotStartRequired
                    error = cause.message ?: "Не удалось отправить код. Попробуйте ещё раз."
                }
            } finally {
                requesting = false
            }
        }
    }

    fun verifyCode() {
        if (busy || code.length != 6) return
        val current = challenge ?: return
        focus.clearFocus()
        verifying = true
        error = null
        scope.launch {
            try {
                cloud.verifyLoginCode(current, code).onSuccess { session ->
                    runCatching { onLogin(session.userId, session.token, session.expiresAt) }
                        .onFailure { error = "Не удалось сохранить вход на устройстве. Попробуйте ещё раз." }
                }.onFailure { cause ->
                    error = cause.message ?: "Не удалось подтвердить код. Попробуйте ещё раз."
                }
            } finally {
                verifying = false
            }
        }
    }

    BackHandler(enabled = current != null) {
        if (!busy) changeId()
    }

    Box(
        Modifier.fillMaxSize().background(
            Brush.linearGradient(listOf(Color(0xFFE3E7FF), Color(0xFFF5F7FF), Color(0xFFDDF5FE))),
        ),
        contentAlignment = Alignment.TopCenter,
    ) {
        Column(
            Modifier.safeDrawingPadding().imePadding().widthIn(max = 472.dp)
                .fillMaxWidth().verticalScroll(scroll).padding(horizontal = 20.dp, vertical = 28.dp),
            verticalArrangement = Arrangement.spacedBy(22.dp),
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Image(
                    painterResource(R.drawable.ic_launcher_art),
                    contentDescription = null,
                    modifier = Modifier.size(48.dp).clip(RoundedCornerShape(14.dp)),
                )
                Text("Библейские игры", color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            }

            Surface(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(28.dp),
                color = Color.White,
                shadowElevation = 7.dp,
            ) {
                Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
                    Text(
                        if (current == null) "Войти через Telegram" else "Введите код",
                        color = Ink,
                        fontSize = 28.sp,
                        lineHeight = 32.sp,
                        fontWeight = FontWeight.ExtraBold,
                    )
                    if (current == null) {
                        Text(
                            "Введите свой Telegram ID. Бот пришлёт код для входа в ваш профиль.",
                            color = InkSoft,
                            lineHeight = 21.sp,
                        )
                    } else {
                        Row(
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp))
                                .background(Color(0xFFF1F4FF)).padding(start = 12.dp, end = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Text("ID $id", Modifier.weight(1f), color = Ink, fontWeight = FontWeight.SemiBold)
                            TextButton(onClick = ::changeId, enabled = !busy) { Text("Изменить") }
                        }
                        Text(
                            if (current.deliveryConfirmed) "Код отправлен в @$TELEGRAM_BOT_USERNAME. Он действует 10 минут."
                            else "Доставку кода подтвердить не удалось. Проверьте чат с ботом или запросите код ещё раз.",
                            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                            color = if (current.deliveryConfirmed) InkSoft else Color(0xFF92400E),
                            lineHeight = 21.sp,
                        )
                    }

                    val enteringCode = current != null
                    OutlinedTextField(
                        value = if (enteringCode) code else id,
                        onValueChange = { value ->
                            val digits = value.filter { it in '0'..'9' }
                            if (enteringCode) code = digits.take(6) else {
                                id = digits.take(20)
                                needsBotStart = false
                            }
                            error = null
                        },
                        modifier = Modifier.fillMaxWidth(),
                        enabled = !busy,
                        label = { Text(if (enteringCode) "Код из Telegram" else "Telegram ID") },
                        placeholder = { Text(if (enteringCode) "000000" else "123456789") },
                        textStyle = if (enteringCode) {
                            TextStyle(
                                color = Ink,
                                fontSize = 24.sp,
                                letterSpacing = 5.sp,
                                textAlign = TextAlign.Center,
                            )
                        } else TextStyle(color = Ink, fontSize = 18.sp),
                        singleLine = true,
                        isError = error != null && !needsBotStart,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number, imeAction = ImeAction.Done),
                        keyboardActions = KeyboardActions(onDone = { if (enteringCode) verifyCode() else requestCode() }),
                        shape = RoundedCornerShape(14.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = Indigo,
                            unfocusedBorderColor = Color(0xFFCAD4EF),
                        ),
                    )

                    error?.let { message ->
                        Text(
                            message,
                            Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp))
                                .background(if (needsBotStart) Color(0xFFF1F4FF) else Color(0xFFFFF1F2))
                                .padding(12.dp).semantics { liveRegion = LiveRegionMode.Polite },
                            color = if (needsBotStart) Ink else Color(0xFF9F1239),
                            fontSize = 14.sp,
                            lineHeight = 20.sp,
                        )
                    }

                    if (enteringCode) {
                        PrimaryButton(
                            if (verifying) "Проверяем код…" else "Подтвердить и войти",
                            ::verifyCode,
                            Modifier.fillMaxWidth(),
                            enabled = !busy && code.length == 6,
                        )
                        SecondaryButton(
                            "Открыть чат с ботом",
                            { openTelegram(TELEGRAM_BOT_USERNAME, startBot = needsBotStart) },
                            Modifier.fillMaxWidth(),
                            enabled = !busy,
                        )
                        TextButton(
                            onClick = ::requestCode,
                            modifier = Modifier.align(Alignment.CenterHorizontally),
                            enabled = !busy && secondsUntilResend == 0,
                            colors = ButtonDefaults.textButtonColors(contentColor = Indigo),
                        ) {
                            Text(
                                when {
                                    requesting -> "Отправляем код…"
                                    secondsUntilResend > 0 -> "Новый код через ${secondsUntilResend} с"
                                    else -> "Запросить новый код"
                                },
                                textAlign = TextAlign.Center,
                            )
                        }
                    } else {
                        PrimaryButton(
                            if (requesting) "Отправляем код…" else "Получить код",
                            ::requestCode,
                            Modifier.fillMaxWidth(),
                            enabled = !busy,
                        )
                        if (needsBotStart) {
                            SecondaryButton(
                                "Открыть бота и нажать «Старт»",
                                { openTelegram(TELEGRAM_BOT_USERNAME, startBot = true) },
                                Modifier.fillMaxWidth(),
                                enabled = !busy,
                            )
                        }
                        TextButton(
                            onClick = { openTelegram(TELEGRAM_ID_HELP_BOT_USERNAME) },
                            modifier = Modifier.align(Alignment.CenterHorizontally),
                            enabled = !busy,
                            colors = ButtonDefaults.textButtonColors(contentColor = Indigo),
                        ) { Text("Где найти Telegram ID?", textAlign = TextAlign.Center) }
                    }
                }
            }
        }
    }
}
