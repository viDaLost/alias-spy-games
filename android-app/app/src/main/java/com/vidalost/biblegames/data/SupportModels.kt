package com.vidalost.biblegames.data

data class SupportMessage(
    val sender: String,
    val body: String,
    val createdAt: Long,
)

data class SupportTicket(
    val id: String,
    val userId: String,
    val source: String,
    val subject: String,
    val status: String,
    val createdAt: Long,
    val updatedAt: Long,
    val messages: List<SupportMessage>,
)
