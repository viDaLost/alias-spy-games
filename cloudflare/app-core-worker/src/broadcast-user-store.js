import { SqlUserStore } from './sql-user-store.js';

const ACTIVE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const BATCH_SIZE = 12;
const MAX_ATTEMPTS = 3;
const MAX_BUTTONS = 2;

export class BroadcastUserStore extends SqlUserStore {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS broadcast_jobs (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        text TEXT NOT NULL DEFAULT '',
        media_file_id TEXT NOT NULL DEFAULT '',
        media_name TEXT NOT NULL DEFAULT '',
        audience TEXT NOT NULL DEFAULT 'all',
        selected_ids TEXT NOT NULL DEFAULT '[]',
        silent INTEGER NOT NULL DEFAULT 0,
        html INTEGER NOT NULL DEFAULT 0,
        button_text TEXT NOT NULL DEFAULT '',
        button_url TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'queued',
        total INTEGER NOT NULL DEFAULT 0,
        sent INTEGER NOT NULL DEFAULT 0,
        failed INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        started_at INTEGER NOT NULL DEFAULT 0,
        finished_at INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT ''
      );
      CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_created ON broadcast_jobs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_broadcast_jobs_status ON broadcast_jobs(status, created_at);

      CREATE TABLE IF NOT EXISTS broadcast_recipients (
        job_id TEXT NOT NULL,
        telegram_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at INTEGER NOT NULL DEFAULT 0,
        error TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (job_id, telegram_id)
      );
      CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_queue
        ON broadcast_recipients(job_id, status, next_attempt_at);
    `);
    try {
      this.sql.exec("ALTER TABLE broadcast_jobs ADD COLUMN buttons TEXT NOT NULL DEFAULT '[]'");
    } catch {
      // Колонка уже есть — это обычный путь на всех запусках после первого.
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname.startsWith('/broadcast/')) {
      const body = await request.json().catch(() => ({}));
      if (url.pathname === '/broadcast/create') return response(await this.createBroadcast(body.config));
      if (url.pathname === '/broadcast/status') return response(await this.broadcastStatus(body.jobId));
      if (url.pathname === '/broadcast/history') return response(await this.broadcastHistory());
      if (url.pathname === '/broadcast/cancel') return response(await this.cancelBroadcast(body.jobId));
      if (url.pathname === '/broadcast/repeat') return response(await this.repeatBroadcast(body.jobId));
    }
    return super.fetch(request);
  }

  async createBroadcast(rawConfig = {}) {
    await this.ensureMigrated();
    const config = normalizeConfig(rawConfig);
    if (!config.ok) return config;

    const allUsers = this.sql.exec(`
      SELECT telegram_id, is_banned, last_seen_at
      FROM users
      WHERE is_banned = 0
    `).toArray();

    const selected = new Set(config.selectedIds);
    const cutoff = Date.now() - ACTIVE_WINDOW_MS;
    const recipients = allUsers
      .filter((row) => /^\d{5,20}$/.test(String(row.telegram_id || '')))
      .filter((row) => {
        if (config.audience === 'active') return Number(row.last_seen_at || 0) >= cutoff;
        if (config.audience === 'selected') return selected.has(String(row.telegram_id));
        return true;
      })
      .map((row) => String(row.telegram_id));

    if (!recipients.length) return { ok: false, success: false, error: 'Нет получателей для этой рассылки' };

    const id = `bc_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
    const now = Date.now();

    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`
        INSERT INTO broadcast_jobs (
          id, kind, text, media_file_id, media_name, audience, selected_ids,
          silent, html, button_text, button_url, buttons, status, total, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)
      `,
        id,
        config.kind,
        config.text,
        config.mediaFileId,
        config.mediaName,
        config.audience,
        JSON.stringify(config.selectedIds),
        config.silent ? 1 : 0,
        config.html ? 1 : 0,
        config.buttonText,
        config.buttonUrl,
        JSON.stringify({ layout: config.buttonsLayout, items: config.buttons }),
        recipients.length,
        now,
      );
      for (const telegramId of recipients) {
        this.sql.exec(`
          INSERT OR REPLACE INTO broadcast_recipients
            (job_id, telegram_id, status, attempts, next_attempt_at, error, updated_at)
          VALUES (?, ?, 'pending', 0, 0, '', ?)
        `, id, telegramId, now);
      }
    });

    await this.ctx.storage.setAlarm(Date.now() + 100);
    return { ok: true, success: true, job: this.getJob(id) };
  }

  async broadcastStatus(jobId) {
    await this.ensureMigrated();
    const id = String(jobId || '').trim();
    const job = id ? this.getJob(id) : this.getLatestJob();
    return job
      ? { ok: true, success: true, job }
      : { ok: false, success: false, error: 'Рассылка не найдена' };
  }

  async broadcastHistory() {
    await this.ensureMigrated();
    const rows = this.sql.exec(`
      SELECT * FROM broadcast_jobs
      ORDER BY created_at DESC
      LIMIT 20
    `).toArray();
    return { ok: true, success: true, jobs: rows.map(toPublicJob) };
  }

  async cancelBroadcast(jobId) {
    await this.ensureMigrated();
    const id = String(jobId || '').trim();
    const job = this.getJob(id);
    if (!job) return { ok: false, success: false, error: 'Рассылка не найдена' };
    if (job.status === 'done' || job.status === 'cancelled') return { ok: true, success: true, job };

    const now = Date.now();
    this.ctx.storage.transactionSync(() => {
      this.sql.exec(`UPDATE broadcast_jobs SET status = 'cancelled', finished_at = ? WHERE id = ?`, now, id);
      this.sql.exec(`UPDATE broadcast_recipients SET status = 'cancelled', updated_at = ? WHERE job_id = ? AND status = 'pending'`, now, id);
    });
    return { ok: true, success: true, job: this.getJob(id) };
  }

  async repeatBroadcast(jobId) {
    await this.ensureMigrated();
    const row = this.sql.exec('SELECT * FROM broadcast_jobs WHERE id = ?', String(jobId || '')).toArray()[0];
    if (!row) return { ok: false, success: false, error: 'Рассылка не найдена' };
    return this.createBroadcast({
      kind: row.kind,
      text: row.text,
      mediaFileId: row.media_file_id,
      mediaName: row.media_name,
      audience: row.audience,
      selectedIds: parseJsonArray(row.selected_ids),
      silent: Boolean(row.silent),
      html: Boolean(row.html),
      buttonText: row.button_text,
      buttonUrl: row.button_url,
    });
  }

  async alarm() {
    await this.ensureMigrated();
    const row = this.sql.exec(`
      SELECT * FROM broadcast_jobs
      WHERE status IN ('queued', 'sending')
      ORDER BY created_at ASC
      LIMIT 1
    `).toArray()[0];
    if (!row) return;

    const now = Date.now();
    if (row.status === 'queued') {
      this.sql.exec(`UPDATE broadcast_jobs SET status = 'sending', started_at = ? WHERE id = ?`, now, row.id);
      row.status = 'sending';
      row.started_at = now;
    }

    const batch = this.sql.exec(`
      SELECT telegram_id, attempts
      FROM broadcast_recipients
      WHERE job_id = ? AND status = 'pending' AND next_attempt_at <= ?
      ORDER BY updated_at ASC, telegram_id ASC
      LIMIT ?
    `, row.id, now, BATCH_SIZE).toArray();

    if (!batch.length) {
      await this.finishOrReschedule(row.id);
      return;
    }

    for (const recipient of batch) {
      await this.deliver(row, recipient);
      await delay(45);
    }

    this.refreshJobCounters(row.id);
    await this.finishOrReschedule(row.id);
  }

  async deliver(job, recipient) {
    const telegramId = String(recipient.telegram_id);
    const attempts = Number(recipient.attempts || 0) + 1;
    const now = Date.now();

    try {
      const result = await sendTelegram(this.env.TELEGRAM_BOT_TOKEN, telegramId, job);
      if (result.ok) {
        this.sql.exec(`
          UPDATE broadcast_recipients
          SET status = 'sent', attempts = ?, error = '', updated_at = ?
          WHERE job_id = ? AND telegram_id = ?
        `, attempts, now, job.id, telegramId);
        return;
      }

      const retryAfter = Number(result.retryAfter || 0);
      const retriable = result.status === 429 || result.status >= 500;
      if (retriable && attempts < MAX_ATTEMPTS) {
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 1500 * (2 ** (attempts - 1)));
        this.sql.exec(`
          UPDATE broadcast_recipients
          SET attempts = ?, next_attempt_at = ?, error = ?, updated_at = ?
          WHERE job_id = ? AND telegram_id = ?
        `, attempts, now + waitMs, cleanError(result.error), now, job.id, telegramId);
      } else {
        this.sql.exec(`
          UPDATE broadcast_recipients
          SET status = 'failed', attempts = ?, error = ?, updated_at = ?
          WHERE job_id = ? AND telegram_id = ?
        `, attempts, cleanError(result.error), now, job.id, telegramId);
      }
    } catch (error) {
      if (attempts < MAX_ATTEMPTS) {
        this.sql.exec(`
          UPDATE broadcast_recipients
          SET attempts = ?, next_attempt_at = ?, error = ?, updated_at = ?
          WHERE job_id = ? AND telegram_id = ?
        `, attempts, now + 2500 * attempts, cleanError(error?.message), now, job.id, telegramId);
      } else {
        this.sql.exec(`
          UPDATE broadcast_recipients
          SET status = 'failed', attempts = ?, error = ?, updated_at = ?
          WHERE job_id = ? AND telegram_id = ?
        `, attempts, cleanError(error?.message), now, job.id, telegramId);
      }
    }
  }

  refreshJobCounters(jobId) {
    const counts = this.sql.exec(`
      SELECT
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
      FROM broadcast_recipients
      WHERE job_id = ?
    `, jobId).toArray()[0] || {};
    const latestError = this.sql.exec(`
      SELECT error FROM broadcast_recipients
      WHERE job_id = ? AND error <> ''
      ORDER BY updated_at DESC LIMIT 1
    `, jobId).toArray()[0];
    this.sql.exec(`
      UPDATE broadcast_jobs SET sent = ?, failed = ?, last_error = ? WHERE id = ?
    `, Number(counts.sent || 0), Number(counts.failed || 0), cleanError(latestError?.error), jobId);
  }

  async finishOrReschedule(jobId) {
    this.refreshJobCounters(jobId);
    const pending = this.sql.exec(`
      SELECT COUNT(*) AS count, MIN(next_attempt_at) AS next_at
      FROM broadcast_recipients
      WHERE job_id = ? AND status = 'pending'
    `, jobId).toArray()[0] || {};

    if (Number(pending.count || 0) <= 0) {
      this.sql.exec(`UPDATE broadcast_jobs SET status = 'done', finished_at = ? WHERE id = ? AND status <> 'cancelled'`, Date.now(), jobId);
      const next = this.sql.exec(`SELECT id FROM broadcast_jobs WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1`).toArray()[0];
      if (next) await this.ctx.storage.setAlarm(Date.now() + 150);
      return;
    }

    const nextAt = Math.max(Date.now() + 250, Number(pending.next_at || 0));
    await this.ctx.storage.setAlarm(nextAt);
  }

  getLatestJob() {
    const row = this.sql.exec('SELECT * FROM broadcast_jobs ORDER BY created_at DESC LIMIT 1').toArray()[0];
    return row ? toPublicJob(row) : null;
  }

  getJob(id) {
    const row = this.sql.exec('SELECT * FROM broadcast_jobs WHERE id = ?', String(id || '')).toArray()[0];
    return row ? toPublicJob(row) : null;
  }
}

function normalizeConfig(raw = {}) {
  const kind = ['text', 'photo', 'document'].includes(String(raw.kind)) ? String(raw.kind) : 'text';
  const maxText = kind === 'text' ? 4096 : 1024;
  const text = String(raw.text || '').trim().slice(0, maxText);
  const mediaFileId = String(raw.mediaFileId || '').trim().slice(0, 256);
  const mediaName = String(raw.mediaName || '').replace(/[\r\n<>]/g, '').trim().slice(0, 180);
  const audience = ['all', 'active', 'selected'].includes(String(raw.audience)) ? String(raw.audience) : 'all';
  const selectedIds = [...new Set((Array.isArray(raw.selectedIds) ? raw.selectedIds : [])
    .map((id) => String(id || '').trim())
    .filter((id) => /^\d{5,20}$/.test(id)))].slice(0, 5000);
  const buttonText = String(raw.buttonText || '').replace(/[\r\n<>]/g, '').trim().slice(0, 64);
  const buttonUrl = String(raw.buttonUrl || '').trim().slice(0, 512);
  // Панель присылает список кнопок; одиночные buttonText/buttonUrl остаются для
  // совместимости со старым клиентом и повторами прежних рассылок.
  const rawButtons = Array.isArray(raw.buttons) && raw.buttons.length
    ? raw.buttons
    : (buttonText || buttonUrl ? [{ text: buttonText, url: buttonUrl }] : []);
  const buttons = [];
  for (const item of rawButtons.slice(0, MAX_BUTTONS)) {
    const label = String(item?.text || '').replace(/[\r\n<>]/g, '').trim().slice(0, 64);
    const link = String(item?.url || '').trim().slice(0, 512);
    if (!label && !link) continue;
    if (!label || !link) return { ok: false, success: false, error: 'Для кнопки нужны и текст, и ссылка' };
    if (!/^https:\/\//i.test(link) && !/^tg:\/\//i.test(link)) {
      return { ok: false, success: false, error: 'Ссылка кнопки должна начинаться с https:// или tg://' };
    }
    buttons.push({ text: label, url: link });
  }
  const buttonsLayout = String(raw.buttonsLayout) === 'stack' ? 'stack' : 'row';

  if (kind === 'text' && !text) return { ok: false, success: false, error: 'Введите текст сообщения' };
  if (kind !== 'text' && !mediaFileId) return { ok: false, success: false, error: 'Сначала прикрепите файл' };
  if (audience === 'selected' && !selectedIds.length) return { ok: false, success: false, error: 'Выберите хотя бы одного пользователя' };
  if ((buttonText && !buttonUrl) || (!buttonText && buttonUrl)) return { ok: false, success: false, error: 'Для кнопки нужны и текст, и ссылка' };
  if (buttonUrl && !/^https:\/\//i.test(buttonUrl) && !/^tg:\/\//i.test(buttonUrl)) {
    return { ok: false, success: false, error: 'Ссылка кнопки должна начинаться с https:// или tg://' };
  }

  return {
    ok: true,
    kind,
    text,
    mediaFileId,
    mediaName,
    audience,
    selectedIds,
    silent: Boolean(raw.silent),
    html: Boolean(raw.html),
    buttonText: buttons[0]?.text || '',
    buttonUrl: buttons[0]?.url || '',
    buttons,
    buttonsLayout,
  };
}

/**
 * Клавиатура рассылки. У рассылок, созданных до появления списка кнопок, в
 * строке есть только button_text и button_url — их и берём.
 */
function keyboardFor(job = {}) {
  const parsed = parseButtons(job.buttons);
  const items = parsed.items.length
    ? parsed.items
    : (job.button_text && job.button_url ? [{ text: job.button_text, url: job.button_url }] : []);
  if (!items.length) return null;
  if (items.length === 1) return [[items[0]]];
  return parsed.layout === 'stack' ? items.map((item) => [item]) : [items];
}

function parseButtons(value) {
  try {
    const parsed = JSON.parse(String(value || '[]'));
    const items = (Array.isArray(parsed) ? parsed : parsed?.items || [])
      .filter((item) => item && item.text && item.url)
      .slice(0, MAX_BUTTONS)
      .map((item) => ({ text: String(item.text), url: String(item.url) }));
    const layout = (Array.isArray(parsed) ? 'row' : String(parsed?.layout || 'row')) === 'stack' ? 'stack' : 'row';
    return { items, layout };
  } catch {
    return { items: [], layout: 'row' };
  }
}

function toPublicJob(row = {}) {
  return {
    id: String(row.id || ''),
    kind: String(row.kind || 'text'),
    text: String(row.text || ''),
    mediaName: String(row.media_name || ''),
    audience: String(row.audience || 'all'),
    selectedIds: parseJsonArray(row.selected_ids),
    silent: Boolean(row.silent),
    html: Boolean(row.html),
    buttonText: String(row.button_text || ''),
    buttonUrl: String(row.button_url || ''),
    buttons: parseButtons(row.buttons).items,
    buttonsLayout: parseButtons(row.buttons).layout,
    status: String(row.status || 'queued'),
    total: Number(row.total || 0),
    sent: Number(row.sent || 0),
    failed: Number(row.failed || 0),
    createdAt: Number(row.created_at || 0),
    startedAt: Number(row.started_at || 0),
    finishedAt: Number(row.finished_at || 0),
    lastError: String(row.last_error || ''),
  };
}

async function sendTelegram(token, chatId, job) {
  if (!token) throw new Error('Telegram bot token is missing');
  let method = 'sendMessage';
  const payload = {
    chat_id: chatId,
    disable_notification: Boolean(job.silent),
  };

  if (job.kind === 'photo') {
    method = 'sendPhoto';
    payload.photo = job.media_file_id;
    if (job.text) payload.caption = job.text;
  } else if (job.kind === 'document') {
    method = 'sendDocument';
    payload.document = job.media_file_id;
    if (job.text) payload.caption = job.text;
  } else {
    payload.text = job.text;
  }

  if (job.html) payload.parse_mode = 'HTML';
  const keyboard = keyboardFor(job);
  if (keyboard) payload.reply_markup = { inline_keyboard: keyboard };

  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (response.ok && data?.ok) return { ok: true };
  return {
    ok: false,
    status: response.status,
    retryAfter: Number(data?.parameters?.retry_after || 0),
    error: String(data?.description || `Telegram HTTP ${response.status}`),
  };
}

function parseJsonArray(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function cleanError(value) {
  return String(value || '').replace(/[\r\n\t]/g, ' ').trim().slice(0, 300);
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function response(value, status = 200) {
  const ok = value?.ok !== false;
  return new Response(JSON.stringify(value), {
    status: ok ? status : 400,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
