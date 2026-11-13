import { BroadcastUserStore } from './broadcast-user-store.js';
import {
  MAX_TICKETS_PER_WINDOW, RATE_WINDOW_MS, openTicketFor, rateLimitMessage,
} from './support-rules.js';

export class SupportUserStore extends BroadcastUserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS support_tickets (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'web',
        subject TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'new',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_support_tickets_user
        ON support_tickets(user_id, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_support_tickets_status
        ON support_tickets(status, updated_at DESC);

      CREATE TABLE IF NOT EXISTS support_messages (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL,
        sender TEXT NOT NULL,
        body TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
        ON support_messages(ticket_id, created_at ASC);
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/support/')) {
      const body = await request.json().catch(() => ({}));
      if (url.pathname === '/support/create') return response(await this.createTicket(body));
      if (url.pathname === '/support/user-list') return response(await this.userTickets(body.userId));
      if (url.pathname === '/support/admin-list') return response(await this.adminTickets());
      if (url.pathname === '/support/reply') return response(await this.replyTicket(body));
      if (url.pathname === '/support/append') return response(await this.appendUserMessage(body));
      if (url.pathname === '/support/status') return response(await this.setTicketStatus(body));
    }
    return super.fetch(request);
  }

  async createTicket(raw = {}) {
    await this.ensureMigrated();
    const userId = sanitizeUserId(raw.userId);
    const source = ['android', 'web'].includes(String(raw.source)) ? String(raw.source) : 'web';
    const subject = cleanText(raw.subject, 80);
    const message = cleanText(raw.message, 2000);
    if (!userId) return fail('Некорректный Telegram ID');
    if (subject.length < 3) return fail('Укажите тему обращения');
    if (message.length < 10) return fail('Опишите проблему подробнее');

    const now0 = Date.now();

    // Разговор продолжается: дописываем в открытое обращение вместо нового тикета.
    if (raw.continueOpen === true) {
      const open = openTicketFor(this.sql.exec(
        'SELECT id, status, updated_at FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 5',
        userId,
      ).toArray(), now0);
      if (open) {
        const appended = await this.appendUserMessage({ userId, ticketId: open.id, message });
        if (appended.ticket) return Object.assign(appended, { appended: true });
      }
    }

    const cutoff = now0 - RATE_WINDOW_MS;
    const recent = this.sql.exec(
      'SELECT COUNT(*) AS count, MIN(created_at) AS oldest FROM support_tickets'
      + ' WHERE user_id = ? AND created_at >= ?',
      userId,
      cutoff,
    ).toArray()[0];
    if (Number(recent?.count || 0) >= MAX_TICKETS_PER_WINDOW) {
      return fail(rateLimitMessage(recent?.oldest, now0));
    }

    const now = Date.now();
    const id = `sup_${now.toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const messageId = `msg_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO support_tickets (id, user_id, source, subject, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'new', ?, ?)`,
        id, userId, source, subject, now, now,
      );
      this.sql.exec(
        `INSERT INTO support_messages (id, ticket_id, sender, body, created_at)
         VALUES (?, ?, 'user', ?, ?)`,
        messageId, id, message, now,
      );
    });
    return { ok: true, success: true, ticket: this.ticketById(id) };
  }

  async userTickets(rawUserId) {
    await this.ensureMigrated();
    const userId = sanitizeUserId(rawUserId);
    if (!userId) return fail('Некорректный Telegram ID');
    const rows = this.sql.exec(
      `SELECT * FROM support_tickets WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30`,
      userId,
    ).toArray();
    return { ok: true, success: true, tickets: rows.map((row) => this.publicTicket(row)) };
  }

  async adminTickets() {
    await this.ensureMigrated();
    const rows = this.sql.exec(
      `SELECT * FROM support_tickets ORDER BY
        CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'answered' THEN 2 ELSE 3 END,
        updated_at DESC LIMIT 100`,
    ).toArray();
    return { ok: true, success: true, tickets: rows.map((row) => this.publicTicket(row)) };
  }

  async replyTicket(raw = {}) {
    await this.ensureMigrated();
    const ticketId = cleanId(raw.ticketId);
    const message = cleanText(raw.message, 2000);
    if (!ticketId) return fail('Обращение не найдено');
    if (message.length < 2) return fail('Введите ответ');
    const row = this.sql.exec('SELECT * FROM support_tickets WHERE id = ?', ticketId).toArray()[0];
    if (!row) return fail('Обращение не найдено');
    const now = Date.now();
    const messageId = `msg_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO support_messages (id, ticket_id, sender, body, created_at)
         VALUES (?, ?, 'admin', ?, ?)`,
        messageId, ticketId, message, now,
      );
      this.sql.exec(
        `UPDATE support_tickets SET status = 'answered', updated_at = ? WHERE id = ?`,
        now, ticketId,
      );
    });
    return { ok: true, success: true, ticket: this.ticketById(ticketId) };
  }

  /** Сообщение пользователя в уже открытое обращение. */
  async appendUserMessage(raw = {}) {
    await this.ensureMigrated();
    const userId = sanitizeUserId(raw.userId);
    const ticketId = cleanId(raw.ticketId);
    const message = cleanText(raw.message, 2000);
    if (!userId) return fail('Некорректный Telegram ID');
    if (!ticketId) return fail('Обращение не найдено');
    if (message.length < 2) return fail('Опишите вопрос подробнее');
    const row = this.sql.exec(
      'SELECT * FROM support_tickets WHERE id = ? AND user_id = ?',
      ticketId, userId,
    ).toArray()[0];
    if (!row) return fail('Обращение не найдено');
    if (String(row.status || '') === 'closed') return fail('Обращение закрыто');

    const now = Date.now();
    const messageId = `msg_${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`;
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(
        `INSERT INTO support_messages (id, ticket_id, sender, body, created_at)
         VALUES (?, ?, 'user', ?, ?)`,
        messageId, ticketId, message, now,
      );
      this.sql.exec(
        `UPDATE support_tickets SET status = 'new', updated_at = ? WHERE id = ?`,
        now, ticketId,
      );
    });
    return { ok: true, success: true, ticket: this.ticketById(ticketId) };
  }

  async setTicketStatus(raw = {}) {
    await this.ensureMigrated();
    const ticketId = cleanId(raw.ticketId);
    const status = ['new', 'in_progress', 'answered', 'closed'].includes(String(raw.status))
      ? String(raw.status)
      : '';
    if (!ticketId || !status) return fail('Некорректный статус обращения');
    const found = this.sql.exec('SELECT id FROM support_tickets WHERE id = ?', ticketId).toArray()[0];
    if (!found) return fail('Обращение не найдено');
    this.sql.exec('UPDATE support_tickets SET status = ?, updated_at = ? WHERE id = ?', status, Date.now(), ticketId);
    return { ok: true, success: true, ticket: this.ticketById(ticketId) };
  }

  ticketById(id) {
    const row = this.sql.exec('SELECT * FROM support_tickets WHERE id = ?', id).toArray()[0];
    return row ? this.publicTicket(row) : null;
  }

  publicTicket(row = {}) {
    const messages = this.sql.exec(
      'SELECT sender, body, created_at FROM support_messages WHERE ticket_id = ? ORDER BY created_at ASC',
      String(row.id || ''),
    ).toArray().map((item) => ({
      sender: item.sender === 'admin' ? 'admin' : 'user',
      body: String(item.body || ''),
      createdAt: Number(item.created_at || 0),
    }));
    return {
      id: String(row.id || ''),
      userId: String(row.user_id || ''),
      source: String(row.source || 'web'),
      subject: String(row.subject || ''),
      status: String(row.status || 'new'),
      createdAt: Number(row.created_at || 0),
      updatedAt: Number(row.updated_at || 0),
      messages,
    };
  }
}

function sanitizeUserId(value) {
  const text = String(value || '').replace(/\D/g, '').slice(0, 20);
  return /^\d{5,20}$/.test(text) ? text : '';
}

function cleanId(value) {
  const text = String(value || '').trim();
  return /^sup_[a-z0-9_]{6,80}$/i.test(text) ? text : '';
}

function cleanText(value, max) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

function fail(error) {
  return { ok: false, success: false, error };
}

function response(value, status = 200) {
  const code = value?.ok === false ? 400 : status;
  return new Response(JSON.stringify(value), {
    status: code,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
