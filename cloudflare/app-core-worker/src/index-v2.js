import original, { UserStore as BaseUserStore } from './index.js';

export default original;

export class UserStore extends BaseUserStore {
  async importUsers(users) {
    const result = await super.importUsers(users);
    const list = Array.isArray(users) ? users : [];
    let repairedUsernames = 0;
    let repairedLinks = 0;

    for (const raw of list) {
      const id = cleanId(raw?.id ?? raw?.ID ?? raw?.telegramId);
      if (!id) continue;
      const key = `user:${id}`;
      const record = await this.ctx.storage.get(key);
      if (!record) continue;

      const importedUsername = normalizeUsername(raw?.username ?? raw?.userName ?? raw?.Username);
      const currentUsername = normalizeUsername(record.username);
      let changed = false;

      if (!currentUsername && importedUsername) {
        record.username = importedUsername;
        repairedUsernames += 1;
        changed = true;
      }

      const importedLink = normalizeLink(raw?.link ?? raw?.Link, importedUsername || currentUsername);
      if (isMissingLink(record.link) && importedLink) {
        record.link = importedLink;
        repairedLinks += 1;
        changed = true;
      } else if (changed && isMissingLink(record.link) && record.username) {
        record.link = `https://t.me/${record.username}`;
        repairedLinks += 1;
        changed = true;
      }

      if (changed) {
        record.updatedAt = Date.now();
        await this.ctx.storage.put(key, record);
      }
    }

    await this.ctx.storage.put('meta:usernameRepairDone', true);
    await this.ctx.storage.put('meta:usernameRepairAt', Date.now());
    return { ...result, repairedUsernames, repairedLinks };
  }

  async meta() {
    const meta = await super.meta();
    const repairDone = Boolean(await this.ctx.storage.get('meta:usernameRepairDone'));
    return {
      ...meta,
      fullImportDone: Boolean(meta.fullImportDone) && repairDone,
      usernameRepairDone: repairDone,
      usernameRepairAt: Number((await this.ctx.storage.get('meta:usernameRepairAt')) || 0),
    };
  }
}

function cleanId(value) {
  const id = String(value ?? '').replace(/\D/g, '').slice(0, 24);
  return id.length >= 3 ? id : '';
}

function normalizeUsername(value) {
  const text = String(value ?? '').trim().replace(/^@+/, '').slice(0, 64);
  if (!text) return '';
  const lowered = text.toLowerCase().replace(/[\s_-]+/g, '');
  if (['безника', 'безusername', 'nousername', 'unknown', 'неизвестно', 'none', 'null'].includes(lowered)) return '';
  return text;
}

function isMissingLink(value) {
  const text = String(value ?? '').trim().toLowerCase();
  return !text || ['неизвестно', 'unknown', 'none', 'null'].includes(text);
}

function normalizeLink(value, username) {
  const text = String(value ?? '').trim();
  if (/^https?:\/\//i.test(text)) return text.slice(0, 300);
  return username ? `https://t.me/${username}` : '';
}
