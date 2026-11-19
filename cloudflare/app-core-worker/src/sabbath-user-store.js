import '../../../web/js/sabbath-clock.js';

const Clock = globalThis.SabbathClock;
// The first Wednesday starts at UTC+14. Use one 30-day interval for the report.
export const AUDIT_START = Clock.FIRST_WEEK - 14 * 3_600_000;
export const AUDIT_END = AUDIT_START + 30 * Clock.dayMs;
const PAGE_SIZE = 50;

function cleanCity(value) {
  if (!Clock.validCity(value)) return null;
  const name = value.name.trim();
  const country = String(value.country || '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(country) || /[\p{Cc}\p{Cf}]/u.test(name)) return null;
  return { name, country, latitude:value.latitude, longitude:value.longitude, timeZone:Clock.normalizeZone(value.timeZone) };
}

function sameCity(left, right) {
  return left && right && left.country === right.country && left.timeZone === right.timeZone
    && Math.abs(left.latitude-right.latitude) < 0.015 && Math.abs(left.longitude-right.longitude) < 0.015;
}

export class SabbathUserStore {
  constructor(storage) {
    this.storage = storage;
    this.sql = storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS sabbath_preferences (
      user_id TEXT PRIMARY KEY,
      device_zone TEXT NOT NULL,
      city TEXT,
      confirmed_week INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER NOT NULL DEFAULT 0,
      previous_place TEXT,
      previous_until INTEGER NOT NULL DEFAULT 0,
      changes INTEGER NOT NULL DEFAULT 0,
      revision INTEGER NOT NULL DEFAULT 0,
      last_change INTEGER
    )`);
  }

  read(id) {
    return this.sql.exec('SELECT * FROM sabbath_preferences WHERE user_id = ?',id).toArray()[0];
  }

  view(row, now) {
    const city = row.city ? JSON.parse(row.city) : null;
    const base = city || Clock.referenceCity(row.device_zone);
    const carrying = row.previous_place && now < row.previous_until;
    const place = carrying ? JSON.parse(row.previous_place) : base;
    const week = Clock.weekFor(now,place.timeZone);
    const pending = week >= Clock.FIRST_WEEK && row.confirmed_week < week;
    const phase = Clock.state(now,place);
    const locked = now < row.locked_until || phase.cityFrozen || !phase.allowed;
    return { city, place, week, revision:row.revision, confirmedWeek:row.confirmed_week, pending, editable:pending || !locked, lockedUntil:row.locked_until,
      effectiveUntil:carrying ? row.previous_until : null };
  }

  status(userId, zone, now = Date.now()) {
    const detected = Clock.normalizeZone(zone);
    let row = this.read(userId);
    if (!row) {
      this.sql.exec('INSERT INTO sabbath_preferences (user_id,device_zone) VALUES (?,?) ON CONFLICT(user_id) DO NOTHING',
        userId,detected || 'UTC');
      row = this.read(userId);
    } else if (!row.city && detected && row.device_zone !== detected) {
      const existing = this.view(row,now);
      const phase = Clock.state(now,existing.place);
      if (!existing.pending && !phase.cityFrozen && phase.allowed) {
        this.sql.exec('UPDATE sabbath_preferences SET device_zone = ?, revision=revision+1 WHERE user_id = ?',detected,userId);
        row = this.read(userId);
      }
    }
    if (row.previous_place && now >= row.previous_until) {
      this.sql.exec('UPDATE sabbath_preferences SET previous_place=NULL,previous_until=0 WHERE user_id=?',userId);
      row.previous_place = null;
      row.previous_until = 0;
    }
    return this.view(row,now);
  }

  confirm(userId, {week, city:value}, now = Date.now()) {
    const city = cleanCity(value);
    if (!city) return {status:400, data:{ok:false,error:'Выберите город из списка.'}};
    return this.storage.transactionSync(() => {
      const row = this.read(userId);
      if (!row) return {status:409,data:{ok:false,error:'Обновите расписание и выберите город.'}};
      const current = this.view(row,now);
      if (!current.pending && sameCity(current.city,city)) return {status:200,data:{ok:true,sabbath:current}};
      if (week !== current.week || !current.editable) {
        return {status:409,data:{ok:false,sabbath:current,error:'Расписание уже зафиксировано. Проверьте сохранённый город.'}};
      }
      const phase = Clock.state(now,current.place);
      const oldWindow = Clock.weekWindow(current.week,current.place);
      const preserve = current.pending && (phase.cityFrozen || !phase.allowed) && oldWindow.end > now;
      const confirmedWeek = current.pending ? Math.max(week,Clock.weekFor(now,city.timeZone)) : row.confirmed_week;
      const cityEnd = current.pending ? Clock.weekWindow(confirmedWeek,city).end : row.locked_until;
      const previousUntil = preserve ? oldWindow.end : 0;
      const changed = Boolean(current.city && !sameCity(current.city,city));
      const counted = changed && now >= AUDIT_START && now < AUDIT_END;
      this.sql.exec(`UPDATE sabbath_preferences SET city=?,confirmed_week=?,locked_until=?,previous_place=?,previous_until=?,
        changes=changes+?,revision=revision+1,last_change=CASE WHEN ?=1 THEN ? ELSE last_change END WHERE user_id=?`,
        JSON.stringify(city),confirmedWeek,Math.max(cityEnd,previousUntil),preserve ? JSON.stringify(current.place) : null,
        previousUntil,Number(counted),Number(counted),now,userId);
      return {status:200,data:{ok:true,sabbath:this.view(this.read(userId),now)}};
    });
  }

  report(offset = 0, now = Date.now()) {
    offset = Number.isSafeInteger(offset) && offset >= 0 ? offset : 0;
    const rows = this.sql.exec(`SELECT u.telegram_id AS id,u.username,p.*
      FROM users u LEFT JOIN sabbath_preferences p ON p.user_id=u.telegram_id
      ORDER BY COALESCE(p.changes,0) DESC,COALESCE(p.last_change,0) DESC,u.telegram_id
      LIMIT ? OFFSET ?`,PAGE_SIZE+1,offset).toArray();
    return {
      ok:true, from:AUDIT_START, until:AUDIT_END, offset,
      next:rows.length > PAGE_SIZE ? offset+PAGE_SIZE : null,
      previous:offset ? Math.max(0,offset-PAGE_SIZE) : null,
      users:rows.slice(0,PAGE_SIZE).map(row => {
        const city = row.city ? JSON.parse(row.city) : null;
        return {id:row.id,username:row.username,city:city?.name || null,country:city?.country || null,
          timeZone:city?.timeZone || row.device_zone || null,changes:row.changes || 0,lastChange:row.last_change || null,
          pending:row.device_zone ? this.view(row,now).pending : null};
      }),
    };
  }
}
