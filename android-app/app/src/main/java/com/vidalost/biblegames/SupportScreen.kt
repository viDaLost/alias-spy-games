package com.vidalost.biblegames

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.vidalost.biblegames.data.CloudRepository
import com.vidalost.biblegames.data.SupportTicket
import com.vidalost.biblegames.ui.AppBackground
import com.vidalost.biblegames.ui.GlassCard
import com.vidalost.biblegames.ui.Indigo
import com.vidalost.biblegames.ui.Ink
import com.vidalost.biblegames.ui.InkSoft
import com.vidalost.biblegames.ui.PrimaryButton
import com.vidalost.biblegames.ui.SecondaryButton
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@Composable
fun SupportScreen(
    cloud: CloudRepository,
    initialUserId: String,
    onBack: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var supportUserId by rememberSaveable(initialUserId) { mutableStateOf(initialUserId) }
    var subject by rememberSaveable { mutableStateOf("Техническая проблема") }
    var message by rememberSaveable { mutableStateOf("") }
    var tickets by remember { mutableStateOf<List<SupportTicket>>(emptyList()) }
    var loading by remember { mutableStateOf(false) }
    var sending by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }
    var error by remember { mutableStateOf<String?>(null) }

    fun validId(): String? = supportUserId.trim().takeIf { it.matches(Regex("^[0-9]{5,20}$")) }

    fun reload() {
        val id = validId() ?: return
        scope.launch {
            loading = true
            cloud.listSupportTickets(id)
                .onSuccess { tickets = it }
                .onFailure { error = it.message ?: "Не удалось загрузить обращения" }
            loading = false
        }
    }

    LaunchedEffect(supportUserId) {
        if (validId() != null) reload()
    }

    AppBackground {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp, 20.dp, 16.dp, 36.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    SecondaryButton("← Назад", onBack, Modifier.weight(1f))
                }
                Spacer(Modifier.height(16.dp))
                Text("Техническая поддержка", color = Color(0xFF25236E), fontSize = 28.sp, fontWeight = FontWeight.Black)
                Text(
                    "Опишите проблему. Ответ появится здесь, а администратор получит уведомление.",
                    color = InkSoft,
                    fontSize = 14.sp,
                )
            }

            item {
                GlassCard(Modifier.fillMaxWidth()) {
                    if (initialUserId.isBlank()) {
                        OutlinedTextField(
                            value = supportUserId,
                            onValueChange = { supportUserId = it.filter(Char::isDigit).take(20); error = null },
                            modifier = Modifier.fillMaxWidth(),
                            label = { Text("Ваш Telegram ID") },
                            singleLine = true,
                            shape = RoundedCornerShape(18.dp),
                            colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Indigo),
                        )
                        Spacer(Modifier.height(12.dp))
                    } else {
                        Text("Telegram ID: $supportUserId", color = InkSoft, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        Spacer(Modifier.height(10.dp))
                    }

                    OutlinedTextField(
                        value = subject,
                        onValueChange = { subject = it.take(80); error = null },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Тема") },
                        singleLine = true,
                        shape = RoundedCornerShape(18.dp),
                        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Indigo),
                    )
                    Spacer(Modifier.height(12.dp))
                    OutlinedTextField(
                        value = message,
                        onValueChange = { message = it.take(2000); error = null },
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Опишите проблему") },
                        placeholder = { Text("Что произошло? Что вы ожидали увидеть?") },
                        minLines = 5,
                        maxLines = 9,
                        shape = RoundedCornerShape(18.dp),
                        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = Indigo),
                    )
                    error?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, color = Color(0xFFB91C1C), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    feedback?.let {
                        Spacer(Modifier.height(8.dp))
                        Text(it, color = Color(0xFF047857), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    }
                    Spacer(Modifier.height(14.dp))
                    PrimaryButton(
                        if (sending) "Отправляем…" else "Отправить обращение",
                        {
                            val id = validId()
                            when {
                                id == null -> error = "Введите корректный Telegram ID"
                                subject.trim().length < 3 -> error = "Укажите тему обращения"
                                message.trim().length < 10 -> error = "Опишите проблему подробнее"
                                sending -> Unit
                                else -> scope.launch {
                                    sending = true
                                    error = null
                                    feedback = null
                                    cloud.createSupportTicket(id, subject.trim(), message.trim())
                                        .onSuccess { ticket ->
                                            feedback = "Обращение ${ticket.id} отправлено"
                                            message = ""
                                            reload()
                                        }
                                        .onFailure { error = it.message ?: "Не удалось отправить обращение" }
                                    sending = false
                                }
                            }
                        },
                        Modifier.fillMaxWidth(),
                        icon = "→",
                    )
                }
            }

            item {
                Text("Мои обращения", color = Ink, fontSize = 18.sp, fontWeight = FontWeight.ExtraBold)
                if (loading) Text("Загружаем…", color = InkSoft, fontSize = 13.sp)
                if (!loading && tickets.isEmpty()) Text("Обращений пока нет.", color = InkSoft, fontSize = 13.sp)
            }

            items(tickets, key = { it.id }) { ticket ->
                SupportTicketCard(ticket)
            }
        }
    }
}

@Composable
private fun SupportTicketCard(ticket: SupportTicket) {
    val status = when (ticket.status) {
        "in_progress" -> "В работе"
        "answered" -> "Есть ответ"
        "closed" -> "Закрыто"
        else -> "Новое"
    }
    GlassCard(Modifier.fillMaxWidth()) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.Top) {
            Column(Modifier.weight(1f)) {
                Text(ticket.subject, color = Ink, fontSize = 16.sp, fontWeight = FontWeight.ExtraBold)
                Text("№ ${ticket.id}", color = InkSoft, fontSize = 10.sp)
            }
            Text(status, color = Indigo, fontSize = 11.sp, fontWeight = FontWeight.Black, textAlign = TextAlign.End)
        }
        Spacer(Modifier.height(10.dp))
        ticket.messages.forEach { item ->
            val isAdmin = item.sender == "admin"
            Text(
                if (isAdmin) "Техподдержка" else "Вы",
                color = if (isAdmin) Indigo else InkSoft,
                fontSize = 10.sp,
                fontWeight = FontWeight.Black,
            )
            Text(item.body, color = Ink, fontSize = 13.sp, lineHeight = 18.sp)
            Text(formatSupportTime(item.createdAt), color = InkSoft, fontSize = 9.sp)
            Spacer(Modifier.height(8.dp))
        }
    }
}

private fun formatSupportTime(timestamp: Long): String {
    if (timestamp <= 0L) return ""
    return SimpleDateFormat("dd.MM HH:mm", Locale("ru", "RU")).format(Date(timestamp))
}
