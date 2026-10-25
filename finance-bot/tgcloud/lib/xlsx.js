// Минимальный генератор .xlsx без зависимостей: XML-части книги упаковываются
// в ZIP (без сжатия — Excel, Google Таблицы и Numbers это читают).
//
//   const wb = new Workbook({ money: moneyFormat('₽', true) });
//   const ws = wb.addSheet('Операции', { widths: [12, 30], freeze: 1, tab: '1F4E78' });
//   ws.row([{ v: 'Дата', s: 'head' }, { v: 'Сумма', s: 'head' }]);
//   ws.row([{ v: excelDate(2026, 10, 25), s: 'date' }, { v: 250, s: 'money' }]);
//   const bytes = wb.toBytes();

// ── Стили ──────────────────────────────────────────────────────────────────
// Индекс в массиве = номер стиля (s="N") в листе.

// money и moneySigned (баланс со знаком) задаются для каждой книги: с символом
// валюты и без копеек, если все суммы целые (см. Workbook({ money })).
const NUMFMTS = { date: 164, money: 165, pct: 166, datetime: 167, int: 3, time: 168, moneySigned: 169 };
const DEFAULT_MONEY = '#,##0.00';
const fixedNumFmts = [[164, 'dd.mm.yyyy'], [166, '0%'], [167, 'dd.mm.yyyy hh:mm'], [168, 'hh:mm']];

// fonts: 0 обычный, 1 жирный белый, 2 жирный, 3 заголовок, 4 серый курсив, 5 красный, 6 зелёный,
// 7 жирный крупный, 8 серый, 9 синий (шкала), 10 жирный тёмно-синий (заголовок категории)
const FONTS = [
  '<font><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><b/><sz val="11"/><color theme="1"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><b/><sz val="16"/><color rgb="FF1F3864"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><i/><sz val="10"/><color rgb="FF7F7F7F"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><sz val="11"/><color rgb="FFC00000"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><sz val="11"/><color rgb="FF2E7D32"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><b/><sz val="13"/><color rgb="FF1F3864"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><sz val="11"/><color rgb="FF7F7F7F"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><sz val="11"/><color rgb="FF4F81BD"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><b/><sz val="12"/><color rgb="FF1F3864"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><b/><sz val="11"/><color rgb="FFC00000"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
  '<font><b/><sz val="11"/><color rgb="FF2E7D32"/><name val="Calibri"/><family val="2"/><scheme val="minor"/></font>',
];
// fills: 0/1 обязательные, 2 тёмно-синяя шапка, 3 светло-голубой итог, 4 светло-серый, 5 светло-зелёный,
// 6 светло-красный, 7 «зебра» (чередование дней)
const FILLS = [
  '<fill><patternFill patternType="none"/></fill>',
  '<fill><patternFill patternType="gray125"/></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FF1F4E78"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFDDEBF7"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF2F2F2"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE2F0D9"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFFBE2E2"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFF5F8FC"/><bgColor indexed="64"/></patternFill></fill>',
];
const ZEBRA_FILL = 7;
// borders: 0 нет, 1 тонкая серая сетка, 2 верхняя линия итога
const BORDERS = [
  '<border><left/><right/><top/><bottom/><diagonal/></border>',
  '<border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right><top style="thin"><color rgb="FFD9D9D9"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>',
  '<border><left style="thin"><color rgb="FFD9D9D9"/></left><right style="thin"><color rgb="FFD9D9D9"/></right><top style="medium"><color rgb="FF1F4E78"/></top><bottom style="thin"><color rgb="FFD9D9D9"/></bottom><diagonal/></border>',
];

// name → [numFmtId, fontId, fillId, borderId, align]
const BASE_STYLES = [
  ['default', 0, 0, 0, 0, null],
  ['head', 0, 1, 2, 1, 'center'],
  ['text', 0, 0, 0, 1, null],
  ['wrap', 0, 0, 0, 1, 'wrap'],
  ['date', NUMFMTS.date, 0, 0, 1, 'center'],
  ['datetime', NUMFMTS.datetime, 0, 0, 1, 'center'],
  ['time', NUMFMTS.time, 0, 0, 1, 'center'],
  ['money', NUMFMTS.money, 0, 0, 1, null],
  ['moneyRed', NUMFMTS.money, 5, 0, 1, null],
  ['moneyGreen', NUMFMTS.money, 6, 0, 1, null],
  ['moneySigned', NUMFMTS.moneySigned, 0, 0, 1, null],
  ['pct', NUMFMTS.pct, 0, 0, 1, 'center'],
  ['int', NUMFMTS.int, 0, 0, 1, 'center'],
  ['muted', 0, 8, 0, 1, 'center'],
  ['mutedLeft', 0, 8, 0, 1, null],
  ['textBold', 0, 2, 0, 1, null],
  ['pctMuted', NUMFMTS.pct, 8, 0, 1, 'center'],
  ['bar', 0, 9, 0, 1, null],
  ['title', 0, 3, 0, 0, null],
  ['subtitle', 0, 4, 0, 0, null],
  ['note', 0, 4, 0, 0, 'wrap'],
  ['section', 0, 7, 0, 0, null],
  ['catHead', 0, 10, 3, 1, null],
  ['catHeadMoney', NUMFMTS.money, 10, 3, 1, null],
  ['moneyBold', NUMFMTS.money, 2, 3, 1, null],
  ['totalLabel', 0, 2, 3, 2, null],
  ['totalMoney', NUMFMTS.money, 2, 3, 2, null],
  ['totalSigned', NUMFMTS.moneySigned, 2, 3, 2, null],
  ['totalInt', NUMFMTS.int, 2, 3, 2, 'center'],
  ['totalPct', NUMFMTS.pct, 2, 3, 2, 'center'],
  ['totalText', 0, 2, 3, 2, null],
  ['kpiLabel', 0, 2, 4, 1, null],
  ['kpiRed', NUMFMTS.money, 11, 6, 1, null],
  ['kpiGreen', NUMFMTS.money, 12, 5, 1, null],
  ['kpiMoney', NUMFMTS.moneySigned, 2, 4, 1, null],
  ['kpiPlain', NUMFMTS.money, 2, 4, 1, null],
  ['kpiInt', NUMFMTS.int, 2, 4, 1, null],
  ['kpiText', 0, 0, 4, 1, null],
  ['textRed', 0, 5, 0, 1, null],
  ['textGreen', 0, 6, 0, 1, null],
];
// Те же стили на «зебре»: имя + 'Z' (строки чередующихся дней в списке операций).
const ZEBRA = ['text', 'date', 'muted', 'money', 'moneyRed', 'moneyGreen', 'int'];
const STYLE_DEFS = [
  ...BASE_STYLES,
  ...BASE_STYLES.filter((d) => ZEBRA.includes(d[0])).map(([n, nf, font, , border, align]) => [n + 'Z', nf, font, ZEBRA_FILL, border, align]),
];
const STYLE_INDEX = Object.fromEntries(STYLE_DEFS.map((d, i) => [d[0], i]));

/** Формат денег: «#,##0 "₽"» (целые) или «#,##0.00 "₽"»; без валюты — просто число. */
export function moneyFormat(symbol, whole) {
  const num = whole ? '#,##0' : '#,##0.00';
  return symbol ? `${num}" ${symbol.replace(/"/g, '')}"` : num;
}

function stylesXml(money = DEFAULT_MONEY) {
  // Баланс: «+45 600 ₽», «−1 200 ₽», «0 ₽».
  const [num, ...rest] = money.split('"');
  const suffix = rest.length ? `"${rest.join('"')}` : '';
  const signed = `+${num}${suffix};"−"${num}${suffix};0${suffix}`;
  const numFmts = [...fixedNumFmts, [165, money], [169, signed]].sort((a, b) => a[0] - b[0]);
  const xfs = STYLE_DEFS.map(([, numFmt, font, fill, border, align]) => {
    const attrs = `numFmtId="${numFmt}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0"` +
      (numFmt ? ' applyNumberFormat="1"' : '') + (font ? ' applyFont="1"' : '') +
      (fill ? ' applyFill="1"' : '') + (border ? ' applyBorder="1"' : '');
    if (!align) return `<xf ${attrs}/>`;
    const al = align === 'wrap' ? '<alignment vertical="top" wrapText="1"/>' : `<alignment horizontal="${align}" vertical="center"/>`;
    return `<xf ${attrs} applyAlignment="1">${al}</xf>`;
  });
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<numFmts count="${numFmts.length}">${numFmts.map(([id, code]) => `<numFmt numFmtId="${id}" formatCode="${xmlEsc(code)}"/>`).join('')}</numFmts>` +
    `<fonts count="${FONTS.length}">${FONTS.join('')}</fonts>` +
    `<fills count="${FILLS.length}">${FILLS.join('')}</fills>` +
    `<borders count="${BORDERS.length}">${BORDERS.join('')}</borders>` +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    `<cellXfs count="${xfs.length}">${xfs.join('')}</cellXfs>` +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';
}

// ── Утилиты ────────────────────────────────────────────────────────────────

function xmlEsc(s) {
  return String(s)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function colName(n) { // 1 → A, 27 → AA
  let s = '';
  for (; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export const ref = (col, row) => `${colName(col)}${row}`;

/** Серийный номер даты Excel из локальных компонентов (без часового пояса). */
export function excelDate(y, m, d, hh = 0, mi = 0) {
  return Date.UTC(y, m - 1, d, hh, mi) / 86400000 + 25569;
}

// Имя листа: до 31 символа, без []:*?/\ и уникальное в книге.
function sheetName(name, used) {
  let base = String(name || 'Лист').replace(/[[\]:*?/\\]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || 'Лист';
  let candidate = base, i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const quoteSheet = (name) => `'${name.replace(/'/g, "''")}'`;

// ── UTF-8 и ZIP ────────────────────────────────────────────────────────────

function utf8(str) {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(str);
  const out = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      const c2 = str.charCodeAt(i + 1);
      if (c2 >= 0xdc00 && c2 <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return Uint8Array.from(out);
}

let CRC_TABLE = null;
function crc32(bytes) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** ZIP без сжатия (метод STORE). files: [{ name, data: Uint8Array }]. */
export function zipStore(files, date = new Date()) {
  const dosTime = ((date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1)) & 0xffff;
  const dosDate = (((date.getUTCFullYear() - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate()) & 0xffff;
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = utf8(f.name);
    const crc = crc32(f.data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0x0800, true); // имена в UTF-8
    local.setUint16(8, 0, true);
    local.setUint16(10, dosTime, true);
    local.setUint16(12, dosDate, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, f.data.length, true);
    local.setUint32(22, f.data.length, true);
    local.setUint16(26, name.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), name, f.data);

    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint16(8, 0x0800, true);
    cd.setUint16(10, 0, true);
    cd.setUint16(12, dosTime, true);
    cd.setUint16(14, dosDate, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, f.data.length, true);
    cd.setUint32(24, f.data.length, true);
    cd.setUint16(28, name.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), name);
    offset += 30 + name.length + f.data.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let p = 0;
  for (const c of all) { out.set(c, p); p += c.length; }
  return out;
}

// ── Книга и листы ─────────────────────────────────────────────────────────

class Sheet {
  constructor(name, opts) {
    this.name = name;
    this.widths = opts.widths || [];
    this.freeze = opts.freeze || 0;      // сколько верхних строк закрепить
    this.tab = opts.tab || '';
    this.rows = [];
    this.merges = [];
    this.filter = '';
  }

  /** Добавляет строку. Ячейка: значение или { v, s, f }. Возвращает номер строки. */
  row(cells = [], { height } = {}) {
    this.rows.push({ cells, height });
    return this.rows.length;
  }

  get nextRow() { return this.rows.length + 1; }
  merge(range) { this.merges.push(range); }
  autoFilter(range) { this.filter = range; }

  cellXml(cell, r, c) {
    if (cell === null || cell === undefined || cell === '') return '';
    const obj = typeof cell === 'object' && !(cell instanceof Date) ? cell : { v: cell };
    const s = STYLE_INDEX[obj.s || (typeof obj.v === 'number' ? 'default' : 'default')] || 0;
    const at = `r="${ref(c, r)}"${s ? ` s="${s}"` : ''}`;
    if (obj.f) {
      const cached = typeof obj.v === 'number' && isFinite(obj.v) ? `<v>${obj.v}</v>` : '';
      return `<c ${at}><f>${xmlEsc(obj.f)}</f>${cached}</c>`;
    }
    if (typeof obj.v === 'number') return isFinite(obj.v) ? `<c ${at}><v>${obj.v}</v></c>` : '';
    if (obj.v === null || obj.v === undefined || obj.v === '') return s ? `<c ${at}/>` : '';
    return `<c ${at} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(obj.v)}</t></is></c>`;
  }

  toXml(selected) {
    const maxCol = Math.max(1, this.widths.length, ...this.rows.map((r) => r.cells.length));
    const dim = this.rows.length ? `A1:${ref(maxCol, this.rows.length)}` : 'A1';
    const pane = this.freeze
      ? `<pane ySplit="${this.freeze}" topLeftCell="A${this.freeze + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${this.freeze + 1}" sqref="A${this.freeze + 1}"/>`
      : '';
    const cols = this.widths.length
      ? `<cols>${this.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>`
      : '';
    const rows = this.rows.map((r, i) => {
      const n = i + 1;
      const cells = r.cells.map((c, j) => this.cellXml(c, n, j + 1)).join('');
      const ht = r.height ? ` ht="${r.height}" customHeight="1"` : '';
      return `<row r="${n}"${ht}>${cells}</row>`;
    }).join('');
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      (this.tab ? `<sheetPr><tabColor rgb="FF${this.tab}"/></sheetPr>` : '') +
      `<dimension ref="${dim}"/>` +
      `<sheetViews><sheetView workbookViewId="0"${selected ? ' tabSelected="1"' : ''}>${pane}</sheetView></sheetViews>` +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      cols +
      `<sheetData>${rows}</sheetData>` +
      (this.filter ? `<autoFilter ref="${this.filter}"/>` : '') +
      (this.merges.length ? `<mergeCells count="${this.merges.length}">${this.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
      '<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>' +
      '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
      '</worksheet>';
  }
}

export class Workbook {
  /** money — формат денежных ячеек, см. moneyFormat(). */
  constructor({ money = DEFAULT_MONEY } = {}) {
    this.money = money;
    this.sheets = [];
    this.used = new Set();
  }

  addSheet(name, opts = {}) {
    const sheet = new Sheet(sheetName(name, this.used), opts);
    this.sheets.push(sheet);
    return sheet;
  }

  toBytes() {
    if (!this.sheets.length) this.addSheet('Лист1');
    const n = this.sheets.length;
    const files = [];
    const add = (name, xml) => files.push({ name, data: utf8(xml) });

    add('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      this.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
      '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>' +
      '</Types>');

    add('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>' +
      '</Relationships>');

    const iso = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
    add('docProps/core.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
      '<dc:title>Учёт финансов</dc:title><dc:creator>Finance Bot</dc:creator>' +
      `<dcterms:created xsi:type="dcterms:W3CDTF">${iso}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${iso}</dcterms:modified>` +
      '</cp:coreProperties>');
    add('docProps/app.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Microsoft Excel</Application></Properties>');

    const defined = this.sheets
      .map((s, i) => (s.filter ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">${xmlEsc(quoteSheet(s.name))}!${s.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>` : ''))
      .join('');
    add('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="28800" windowHeight="16000" activeTab="0"/></bookViews>' +
      `<sheets>${this.sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>` +
      (defined ? `<definedNames>${defined}</definedNames>` : '') +
      '<calcPr calcId="191029" fullCalcOnLoad="1"/>' +
      '</workbook>');

    add('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      this.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
      `<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      '</Relationships>');

    add('xl/styles.xml', stylesXml(this.money));
    this.sheets.forEach((s, i) => add(`xl/worksheets/sheet${i + 1}.xml`, s.toXml(i === 0)));
    return zipStore(files);
  }
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
