import JSZip from 'jszip';
import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';

import type { CardType, FrequencyTier, StudyCard } from '../types';
import { createInitialFSRS } from './fsrs';

const SUBDECK_BY_TIER: Record<FrequencyTier, string> = {
  high: '01-高频必背',
  medium: '02-中频常考',
  low: '03-真题常规',
  supplement: '04-课件补充',
};

const MODEL_NAMES = {
  basic: 'ExamForge-Basic',
  mcq: 'ExamForge-MCQ',
  cloze: 'ExamForge-Cloze',
} as const;

const MODEL_IDS: Record<CardType, number> = {
  basic: 1589100001001,
  mcq: 1589100001002,
  cloze: 1589100001003,
};

const CARD_CSS = `
.card { font-family: "Microsoft YaHei", "PingFang SC", -apple-system, BlinkMacSystemFont, sans-serif; font-size: 17px; line-height: 1.65; color: #1e293b; background: #f8fafc; padding: 14px; }
.ef-wrap { max-width: 720px; margin: 0 auto; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 18px 20px; }
.ef-header { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.ef-pill { font-size: 12px; font-weight: 600; padding: 2px 10px; border-radius: 999px; }
.ef-badge { background: #fef3c7; color: #92400e; }
.ef-topic { background: #e0f2fe; color: #075985; }
.ef-prompt { font-size: 18px; font-weight: 600; color: #0f172a; margin-bottom: 12px; }
.ef-divider { border: none; border-top: 1px dashed #cbd5e1; margin: 14px 0; }
.ef-answer-block { background: #f0fdf4; border-left: 4px solid #16a34a; padding: 10px 14px; border-radius: 6px; margin-bottom: 12px; font-weight: 600; }
.ef-opt-list { display: flex; flex-direction: column; gap: 8px; }
.ef-opt { padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #f8fafc; }
.ef-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 14px; margin-top: 10px; font-size: 15px; }
.ef-mnemonic { background: #fffbeb; border-left: 4px solid #f59e0b; border-radius: 8px; padding: 10px 14px; margin-top: 10px; font-size: 15px; color: #78350f; }
.ef-footer { margin-top: 12px; font-size: 12px; color: #64748b; display: flex; justify-content: space-between; }
.cloze { font-weight: 700; color: #2563eb; }
.nightMode .card, .nightMode { background: #0f172a; color: #e2e8f0; }
.nightMode .ef-wrap { background: #1e293b; border-color: #334155; }
`;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS col (
  id integer primary key, crt integer not null, mod integer not null, scm integer not null,
  ver integer not null, dty integer not null, usn integer not null, ls integer not null,
  conf text not null, models text not null, decks text not null, dconf text not null, tags text not null
);
CREATE TABLE IF NOT EXISTS notes (
  id integer primary key, guid text not null, mid integer not null, mod integer not null,
  usn integer not null, tags text not null, flds text not null, sfld text not null,
  csum integer not null, flags integer not null, data text not null
);
CREATE TABLE IF NOT EXISTS cards (
  id integer primary key, nid integer not null, did integer not null, ord integer not null,
  mod integer not null, usn integer not null, type integer not null, queue integer not null,
  due integer not null, ivl integer not null, factor integer not null, reps integer not null,
  lapses integer not null, left integer not null, odue integer not null, odid integer not null,
  flags integer not null, data text not null
);
CREATE TABLE IF NOT EXISTS revlog (
  id integer primary key, cid integer not null, usn integer not null, ease integer not null,
  ivl integer not null, lastIvl integer not null, factor integer not null, time integer not null, type integer not null
);
CREATE TABLE IF NOT EXISTS graves (
  usn integer not null, oid integer not null, type integer not null
);
CREATE INDEX IF NOT EXISTS ix_notes_usn on notes (usn);
CREATE INDEX IF NOT EXISTS ix_cards_usn on cards (usn);
CREATE INDEX IF NOT EXISTS ix_revlog_usn on revlog (usn);
CREATE INDEX IF NOT EXISTS ix_cards_nid on cards (nid);
CREATE INDEX IF NOT EXISTS ix_cards_sched on cards (did, queue, due);
CREATE INDEX IF NOT EXISTS ix_revlog_cid on revlog (cid);
CREATE INDEX IF NOT EXISTS ix_notes_csum on notes (csum);
`;

let sqlPromise: Promise<SqlJsStatic> | null = null;

export function initSqlJsOffline(): Promise<SqlJsStatic> {
  if (!sqlPromise) {
    sqlPromise = (async () => {
      if (typeof window === 'undefined') {
        const fs = await import(/* @vite-ignore */ 'node:fs/promises');
        const path = await import(/* @vite-ignore */ 'node:path');
        const wasmPath = path.resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');
        const wasmBuf = await fs.readFile(wasmPath);
        const wasmBinary = wasmBuf.buffer.slice(
          wasmBuf.byteOffset,
          wasmBuf.byteOffset + wasmBuf.byteLength,
        );
        return initSqlJs({ wasmBinary });
      }
      return initSqlJs({ locateFile: () => './sql-wasm.wasm' });
    })();
  }
  return sqlPromise;
}

function deterministicHash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) + 1_000_000_000;
}

function deterministicGuid(seed: string): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < seed.length; i += 1) {
    const ch = seed.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 2246822519) >>> 0;
  }
  let out = '';
  let v1 = h1;
  let v2 = h2;
  for (let i = 0; i < 6; i += 1) {
    out += chars[v1 % 62];
    v1 = Math.floor(v1 / 62);
  }
  for (let i = 0; i < 6; i += 1) {
    out += chars[v2 % 62];
    v2 = Math.floor(v2 / 62);
  }
  return out;
}

function unescapeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

function stripHtmlTags(input: string): string {
  return unescapeHtmlEntities(input.replace(/<[^>]+>/g, ''));
}

function htmlFieldToText(val: string): string {
  if (!val) return '';
  const withNewlines = val
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr)>/gi, '\n');
  return unescapeHtmlEntities(withNewlines.replace(/<[^>]+>/g, ''))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeFieldHtml(text: string): string {
  if (!text) return '';
  return text
    .replace(/\x1f/g, ' ')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r\n/g, '\n')
    .replace(/\n/g, '<br>');
}

function formatMcqOptionsHtml(options: string[]): string {
  if (!options.length) return '';
  const rows = options.map((opt, idx) => {
    const m = /^\s*([A-Ha-h])\s*[.．、:：\)\]]\s*(.*)$/.exec(opt);
    const letter = m ? m[1].toUpperCase() : String.fromCharCode(65 + (idx % 26));
    const body = m ? m[2].trim() : opt.trim();
    return (
      `<div class="ef-opt" data-opt="${letter}">` +
      `<span class="ef-opt-key">${letter}. </span>` +
      `<span class="ef-opt-body">${escapeFieldHtml(body)}</span>` +
      `</div>`
    );
  });
  return `<div class="ef-opt-list">${rows.join('')}</div>`;
}

function parseMcqOptionsHtml(val: string): string[] {
  const optRe =
    /<div\s+class="ef-opt"[^>]*>\s*<span\s+class="ef-opt-key">([\s\S]*?)<\/span>\s*<span\s+class="ef-opt-body">([\s\S]*?)<\/span>\s*<\/div>/gi;
  const parsed: string[] = [];
  let match: RegExpExecArray | null = optRe.exec(val);
  while (match !== null) {
    const k = stripHtmlTags(match[1]).trim();
    const b = htmlFieldToText(match[2]);
    parsed.push(`${k} ${b}`.trim());
    match = optRe.exec(val);
  }
  if (parsed.length > 0) return parsed;
  return htmlFieldToText(val)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

function guessMimeType(filename: string): string {
  const low = filename.toLowerCase();
  if (low.endsWith('.png')) return 'image/png';
  if (low.endsWith('.jpg') || low.endsWith('.jpeg')) return 'image/jpeg';
  if (low.endsWith('.webp')) return 'image/webp';
  if (low.endsWith('.gif')) return 'image/gif';
  if (low.endsWith('.svg')) return 'image/svg+xml';
  return 'application/octet-stream';
}

function extractImgSrcs(rawFields: string[]): string[] {
  const re = /<img\b[^>]*\bsrc=["']([^"']+)["']/gi;
  const out: string[] = [];
  for (const val of rawFields) {
    let m: RegExpExecArray | null = re.exec(val);
    while (m !== null) {
      if (!out.includes(m[1])) out.push(m[1]);
      m = re.exec(val);
    }
    re.lastIndex = 0;
  }
  return out;
}

async function computeAnkiChecksum(firstFieldHtml: string): Promise<number> {
  const plain = stripHtmlTags(firstFieldHtml).trim();
  const encoded = new TextEncoder().encode(plain);
  const digest = await globalThis.crypto.subtle.digest('SHA-1', encoded);
  const view = new DataView(digest);
  return view.getUint32(0, false);
}

function formatFrequencyBadge(freq: number, tier: FrequencyTier, sourceKind: 'past_exam' | 'ppt_supplement'): string {
  if (sourceKind === 'ppt_supplement' && freq <= 1) return '课件补充';
  if (tier === 'high' || freq >= 3) return `高频 · ${freq}次`;
  if (tier === 'medium' || freq === 2) return `中频 · ${freq}次`;
  return `真题 · ${Math.max(1, freq)}次`;
}

function buildModelsJson(defaultDid: number, modTs: number) {
  return {
    [String(MODEL_IDS.basic)]: {
      id: MODEL_IDS.basic,
      name: MODEL_NAMES.basic,
      type: 0,
      mod: modTs,
      usn: -1,
      sortf: 0,
      did: defaultDid,
      tmpls: [
        {
          name: 'ExamForge Basic Card',
          ord: 0,
          qfmt: '<div class="ef-wrap"><div class="ef-header">{{#FrequencyBadge}}<span class="ef-pill ef-badge">{{FrequencyBadge}}</span>{{/FrequencyBadge}}{{#Topic}}<span class="ef-pill ef-topic">{{Topic}}</span>{{/Topic}}</div><div class="ef-prompt">{{Front}}</div>{{#Media}}<div class="ef-media">{{Media}}</div>{{/Media}}</div>',
          afmt: '<div class="ef-wrap"><div class="ef-header">{{#FrequencyBadge}}<span class="ef-pill ef-badge">{{FrequencyBadge}}</span>{{/FrequencyBadge}}{{#Topic}}<span class="ef-pill ef-topic">{{Topic}}</span>{{/Topic}}</div><div class="ef-prompt">{{Front}}</div><hr class="ef-divider"><div class="ef-answer-block">{{Back}}</div>{{#Explanation}}<div class="ef-box"><div class="ef-box-title">解析</div>{{Explanation}}</div>{{/Explanation}}{{#Mnemonic}}<div class="ef-mnemonic"><div class="ef-box-title">记忆法助记</div>{{Mnemonic}}</div>{{/Mnemonic}}{{#Media}}<div class="ef-media">{{Media}}</div>{{/Media}}<div class="ef-footer"><span>{{SourceYears}}</span><span>{{CardID}}</span></div></div>',
          bqfmt: '',
          bafmt: '',
          did: null,
        },
      ],
      flds: ['Front', 'Back', 'Explanation', 'Mnemonic', 'FrequencyBadge', 'SourceYears', 'Topic', 'Media', 'CardID'].map(
        (name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] }),
      ),
      css: CARD_CSS,
      req: [[0, 'any', [0]]],
      tags: [],
      vers: [],
    },
    [String(MODEL_IDS.mcq)]: {
      id: MODEL_IDS.mcq,
      name: MODEL_NAMES.mcq,
      type: 0,
      mod: modTs,
      usn: -1,
      sortf: 0,
      did: defaultDid,
      tmpls: [
        {
          name: 'ExamForge MCQ Card',
          ord: 0,
          qfmt: '<div class="ef-wrap"><div class="ef-header">{{#FrequencyBadge}}<span class="ef-pill ef-badge">{{FrequencyBadge}}</span>{{/FrequencyBadge}}{{#Topic}}<span class="ef-pill ef-topic">{{Topic}}</span>{{/Topic}}</div><div class="ef-prompt">{{Stem}}</div>{{Options}}{{#Media}}<div class="ef-media">{{Media}}</div>{{/Media}}</div>',
          afmt: '<div class="ef-wrap"><div class="ef-header">{{#FrequencyBadge}}<span class="ef-pill ef-badge">{{FrequencyBadge}}</span>{{/FrequencyBadge}}{{#Topic}}<span class="ef-pill ef-topic">{{Topic}}</span>{{/Topic}}</div><div class="ef-prompt">{{Stem}}</div>{{Options}}<hr class="ef-divider"><div class="ef-answer-block">参考答案：{{Answer}}</div>{{#Explanation}}<div class="ef-box"><div class="ef-box-title">解析</div>{{Explanation}}</div>{{/Explanation}}{{#Mnemonic}}<div class="ef-mnemonic"><div class="ef-box-title">记忆法助记</div>{{Mnemonic}}</div>{{/Mnemonic}}{{#Media}}<div class="ef-media">{{Media}}</div>{{/Media}}<div class="ef-footer"><span>{{SourceYears}}</span><span>{{CardID}}</span></div></div>',
          bqfmt: '',
          bafmt: '',
          did: null,
        },
      ],
      flds: [
        'Stem',
        'Options',
        'Answer',
        'Explanation',
        'Mnemonic',
        'FrequencyBadge',
        'SourceYears',
        'Topic',
        'Media',
        'CardID',
      ].map((name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] })),
      css: CARD_CSS,
      req: [[0, 'any', [0]]],
      tags: [],
      vers: [],
    },
    [String(MODEL_IDS.cloze)]: {
      id: MODEL_IDS.cloze,
      name: MODEL_NAMES.cloze,
      type: 1,
      mod: modTs,
      usn: -1,
      sortf: 0,
      did: defaultDid,
      tmpls: [
        {
          name: 'ExamForge Cloze',
          ord: 0,
          qfmt: '<div class="ef-wrap"><div class="ef-header">{{#FrequencyBadge}}<span class="ef-pill ef-badge">{{FrequencyBadge}}</span>{{/FrequencyBadge}}{{#Topic}}<span class="ef-pill ef-topic">{{Topic}}</span>{{/Topic}}</div><div class="ef-prompt">{{cloze:Text}}</div>{{#Media}}<div class="ef-media">{{Media}}</div>{{/Media}}</div>',
          afmt: '<div class="ef-wrap"><div class="ef-header">{{#FrequencyBadge}}<span class="ef-pill ef-badge">{{FrequencyBadge}}</span>{{/FrequencyBadge}}{{#Topic}}<span class="ef-pill ef-topic">{{Topic}}</span>{{/Topic}}</div><div class="ef-prompt">{{cloze:Text}}</div>{{#Extra}}<div class="ef-box"><div class="ef-box-title">补充解析</div>{{Extra}}</div>{{/Extra}}{{#Mnemonic}}<div class="ef-mnemonic"><div class="ef-box-title">记忆法助记</div>{{Mnemonic}}</div>{{/Mnemonic}}{{#Media}}<div class="ef-media">{{Media}}</div>{{/Media}}<div class="ef-footer"><span>{{SourceYears}}</span><span>{{CardID}}</span></div></div>',
          bqfmt: '',
          bafmt: '',
          did: null,
        },
      ],
      flds: ['Text', 'Extra', 'Mnemonic', 'FrequencyBadge', 'SourceYears', 'Topic', 'Media', 'CardID'].map(
        (name, ord) => ({ name, ord, sticky: false, rtl: false, font: 'Arial', size: 20, media: [] }),
      ),
      css: CARD_CSS,
      req: [[0, 'any', [0]]],
      tags: [],
      vers: [],
    },
  };
}

export async function importApkg(
  bytes: Uint8Array,
  fallbackDeckName = '导入牌组',
): Promise<{
  deckName: string;
  cards: StudyCard[];
  mediaBlobs: Map<string, Blob>;
  dbSource: string;
}> {
  const zip = await JSZip.loadAsync(bytes);
  const anki21 = zip.file('collection.anki21');
  const anki2 = zip.file('collection.anki2');
  const anki21b = zip.file('collection.anki21b');

  let dbSource = '';
  let dbFile: JSZip.JSZipObject | null = null;
  if (anki21) {
    dbSource = 'collection.anki21';
    dbFile = anki21;
  } else if (anki2) {
    dbSource = 'collection.anki2';
    dbFile = anki2;
  } else if (anki21b) {
    throw new Error(
      '检测到新版 Anki 压缩格式 (collection.anki21b)。请在电脑版 Anki 导出 .apkg 时勾选「支持旧版 Anki / Support older Anki versions」后再导入。',
    );
  } else {
    throw new Error('无效的 .apkg 文件：缺少 collection 数据库');
  }

  const mediaBlobs = new Map<string, Blob>();
  const mediaJsonFile = zip.file('media');
  if (mediaJsonFile) {
    try {
      const mediaManifest = JSON.parse(await mediaJsonFile.async('string')) as Record<string, string>;
      for (const [zipKey, origName] of Object.entries(mediaManifest)) {
        const entry = zip.file(zipKey);
        if (entry && origName) {
          const bin = await entry.async('uint8array');
          const safeCopy = new Uint8Array(bin);
          mediaBlobs.set(origName, new Blob([safeCopy.buffer], { type: guessMimeType(origName) }));
        }
      }
    } catch {
      // Ignore corrupt media manifest while continuing note import
    }
  }

  const SQL = await initSqlJsOffline();
  const dbBytes = await dbFile.async('uint8array');
  const db: Database = new SQL.Database(dbBytes);
  const nowMs = Date.now();

  try {
    const colRes = db.exec('SELECT models, decks, conf FROM col LIMIT 1');
    if (!colRes.length || !colRes[0].values.length) {
      throw new Error('损坏的 .apkg：col 表为空');
    }
    const modelsMap = JSON.parse(String(colRes[0].values[0][0])) as Record<
      string,
      { name?: string; type?: number; flds?: Array<{ name?: string }> }
    >;
    const decksMap = JSON.parse(String(colRes[0].values[0][1])) as Record<
      string,
      { name?: string }
    >;
    const confObj = JSON.parse(String(colRes[0].values[0][2] || '{}')) as { curDeck?: number | string };
    const curDeckName = confObj.curDeck ? String(decksMap[String(confObj.curDeck)]?.name ?? '') : '';

    const cardAgg = new Map<number, { did: number; maxLapses: number; totalReps: number; maxIvl: number }>();
    const cardRes = db.exec('SELECT nid, did, lapses, reps, ivl FROM cards');
    if (cardRes.length) {
      for (const row of cardRes[0].values) {
        const nid = Number(row[0]);
        const did = Number(row[1]);
        const lapses = Number(row[2] || 0);
        const reps = Number(row[3] || 0);
        const ivl = Number(row[4] || 0);
        const prev = cardAgg.get(nid);
        if (!prev) {
          cardAgg.set(nid, { did, maxLapses: lapses, totalReps: reps, maxIvl: ivl });
        } else {
          prev.maxLapses = Math.max(prev.maxLapses, lapses);
          prev.totalReps += reps;
          prev.maxIvl = Math.max(prev.maxIvl, ivl);
        }
      }
    }

    const noteRes = db.exec('SELECT id, guid, mid, tags, flds FROM notes ORDER BY id ASC');
    const deckCounter = new Map<string, number>();
    const cards: StudyCard[] = [];

    if (noteRes.length) {
      for (const row of noteRes[0].values) {
        const nid = Number(row[0]);
        const guid = String(row[1] || deterministicGuid(String(nid)));
        const mid = String(row[2]);
        const tagsRaw = String(row[3] || '');
        const fldsRaw = String(row[4] || '');

        const model = modelsMap[mid] ?? {};
        const modelName = String(model.name ?? '');
        const modelType = Number(model.type ?? 0);
        const fieldNames = (model.flds ?? []).map((f, i) => String(f.name ?? `Field${i}`));
        const rawVals = fldsRaw.split('\x1f');
        const fields: Record<string, string> = {};
        rawVals.forEach((val, i) => {
          fields[fieldNames[i] ?? `Field${i}`] = val;
        });

        const tags = tagsRaw
          .trim()
          .split(/\s+/)
          .filter(Boolean);

        const agg = cardAgg.get(nid) ?? { did: 1, maxLapses: 0, totalReps: 0, maxIvl: 0 };
        const fullDeckName = decksMap[String(agg.did)]?.name ?? fallbackDeckName;
        let rootName = fullDeckName;
        let subdeck = '';
        if (curDeckName && curDeckName !== 'Default' && (fullDeckName === curDeckName || fullDeckName.startsWith(`${curDeckName}::`))) {
          rootName = curDeckName;
          subdeck = fullDeckName.slice(curDeckName.length).replace(/^::/, '');
        } else if (fullDeckName.includes('::')) {
          const parts = fullDeckName.split('::');
          const last = parts[parts.length - 1];
          if (Object.values(SUBDECK_BY_TIER).includes(last)) {
            rootName = parts.slice(0, -1).join('::');
            subdeck = last;
          } else {
            rootName = parts[0];
            subdeck = parts.slice(1).join('::');
          }
        }
        if (rootName !== 'Default') {
          deckCounter.set(rootName, (deckCounter.get(rootName) ?? 0) + 1);
        }

        let cardType: CardType = 'basic';
        if (modelName === MODEL_NAMES.mcq || ('Stem' in fields && 'Options' in fields)) {
          cardType = 'mcq';
        } else if (modelType === 1 || modelName === MODEL_NAMES.cloze || 'Text' in fields) {
          cardType = 'cloze';
        }

        const badge = htmlFieldToText(fields.FrequencyBadge ?? '');
        const freqMatch = /(\d+)\s*次/.exec(badge);
        const frequency = freqMatch ? Math.max(1, Number(freqMatch[1])) : 1;

        const sourceKind: 'past_exam' | 'ppt_supplement' = tags.includes('source::ppt-supplement')
          ? 'ppt_supplement'
          : 'past_exam';

        let frequencyTier: FrequencyTier = 'low';
        if (tags.includes('freq::high') || badge.includes('高频')) {
          frequencyTier = 'high';
        } else if (tags.includes('freq::medium') || badge.includes('中频')) {
          frequencyTier = 'medium';
        } else if (sourceKind === 'ppt_supplement' || badge.includes('课件补充')) {
          frequencyTier = 'supplement';
        }

        const topic = htmlFieldToText(fields.Topic ?? '');
        const mnemonic = htmlFieldToText(fields.Mnemonic ?? '');
        const yearsStr = htmlFieldToText(fields.SourceYears ?? '');
        const sourceYears = yearsStr
          ? yearsStr
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        const cardId = (fields.CardID ?? '').trim() || `note-${guid}`;
        const media = extractImgSrcs(rawVals);

        const front = cardType === 'basic' ? htmlFieldToText(fields.Front ?? rawVals[0] ?? '') : '';
        const back = cardType === 'basic' ? htmlFieldToText(fields.Back ?? rawVals[1] ?? '') : '';
        const stem = cardType === 'mcq' ? htmlFieldToText(fields.Stem ?? rawVals[0] ?? '') : '';
        const options = cardType === 'mcq' ? parseMcqOptionsHtml(fields.Options ?? '') : [];
        const answer = cardType === 'mcq' ? htmlFieldToText(fields.Answer ?? '') : '';
        const text = cardType === 'cloze' ? htmlFieldToText(fields.Text ?? rawVals[0] ?? '') : '';
        const extra = cardType === 'cloze' ? htmlFieldToText(fields.Extra ?? rawVals[1] ?? '') : '';
        const explanation =
          cardType === 'cloze' ? extra : htmlFieldToText(fields.Explanation ?? '');

        const fsrs = createInitialFSRS(nowMs);
        if (agg.totalReps > 0 || agg.maxIvl > 0 || agg.maxLapses > 0) {
          fsrs.state = agg.maxIvl > 0 ? 'review' : 'learning';
          fsrs.reps = agg.totalReps;
          fsrs.lapses = agg.maxLapses;
          fsrs.scheduledDays = Math.max(0, agg.maxIvl);
          fsrs.stability = Math.max(1, agg.maxIvl);
          fsrs.difficulty = Math.min(10, Math.max(1, 5 + agg.maxLapses * 0.5));
          fsrs.lastReview = nowMs;
          fsrs.due = agg.maxLapses > 0 ? nowMs : nowMs + agg.maxIvl * 86_400_000;
        }

        const isLeech = tags.some((t) => t.toLowerCase() === 'leech') || agg.maxLapses >= 3;

        cards.push({
          guid,
          cardId,
          deckId: '',
          subdeck,
          cardType,
          conceptKey: front || stem || text || cardId,
          front,
          back,
          stem,
          options,
          answer,
          text,
          extra,
          explanation,
          mnemonic,
          topic,
          frequency,
          frequencyTier,
          frequencyBadge: badge || formatFrequencyBadge(frequency, frequencyTier, sourceKind),
          sourceKind,
          sourceYears,
          tags,
          media,
          fsrs,
          isLeech,
          createdAt: nowMs,
          updatedAt: nowMs,
        });
      }
    }

    let resolvedDeckName = fallbackDeckName;
    let bestCount = -1;
    for (const [name, cnt] of deckCounter.entries()) {
      if (cnt > bestCount) {
        bestCount = cnt;
        resolvedDeckName = name;
      }
    }

    return { deckName: resolvedDeckName, cards, mediaBlobs, dbSource };
  } finally {
    db.close();
  }
}

export function importDeckJson(
  text: string,
  fallbackDeckName = '导入 JSON 牌组',
): { deckName: string; cards: StudyCard[] } {
  const parsed = JSON.parse(text) as
    | { deck_name?: string; name?: string; cards?: Array<Record<string, unknown>> }
    | Array<Record<string, unknown>>;

  const nowMs = Date.now();
  const deckName = Array.isArray(parsed)
    ? fallbackDeckName
    : String(parsed.deck_name ?? parsed.name ?? fallbackDeckName);
  const rawCards = Array.isArray(parsed) ? parsed : parsed.cards ?? [];

  const cards: StudyCard[] = rawCards.map((raw, idx) => {
    const optionsRaw = raw.options;
    const options = Array.isArray(optionsRaw) ? optionsRaw.map((x) => String(x)) : [];
    const primary = String(raw.text ?? raw.front ?? raw.stem ?? '');
    const explicitType = String(raw.card_type ?? raw.cardType ?? '').toLowerCase();
    let cardType: CardType = 'basic';
    if (explicitType === 'mcq' || explicitType === 'cloze' || explicitType === 'basic') {
      cardType = explicitType;
    } else if (/\{\{c\d+::/.test(primary)) {
      cardType = 'cloze';
    } else if (options.length > 0) {
      cardType = 'mcq';
    }

    const cardId = String(raw.card_id ?? raw.cardId ?? `card-${idx}-${deterministicHash(primary)}`);
    const guid = String(raw.guid ?? deterministicGuid(cardId));
    const freq = Math.max(1, Number(raw.frequency ?? 1));
    const sourceKind =
      String(raw.source_kind ?? raw.sourceKind ?? 'past_exam') === 'ppt_supplement'
        ? 'ppt_supplement'
        : 'past_exam';
    const rawTier = String(raw.frequency_tier ?? raw.frequencyTier ?? '').toLowerCase();
    let frequencyTier: FrequencyTier = 'low';
    if (rawTier === 'high' || rawTier === 'medium' || rawTier === 'low' || rawTier === 'supplement') {
      frequencyTier = rawTier;
    } else if (sourceKind === 'ppt_supplement' && freq <= 1) {
      frequencyTier = 'supplement';
    } else if (freq >= 3) {
      frequencyTier = 'high';
    } else if (freq === 2) {
      frequencyTier = 'medium';
    }

    const tags = Array.isArray(raw.tags) ? raw.tags.map((t) => String(t)) : [];
    const media = Array.isArray(raw.media) ? raw.media.map((m) => String(m)) : [];
    const sourceYears = Array.isArray(raw.source_years ?? raw.sourceYears)
      ? ((raw.source_years ?? raw.sourceYears) as unknown[]).map((y) => String(y))
      : [];

    const fsrsRaw = raw.fsrs as Partial<StudyCard['fsrs']> | undefined;
    const fsrs = fsrsRaw && typeof fsrsRaw === 'object'
      ? { ...createInitialFSRS(nowMs), ...fsrsRaw }
      : createInitialFSRS(nowMs);

    const isLeech = Boolean(raw.isLeech) || tags.includes('leech') || fsrs.lapses >= 3;

    return {
      guid,
      cardId,
      deckId: '',
      subdeck: String(raw.subdeck ?? ''),
      cardType,
      conceptKey: String(raw.concept_key ?? raw.conceptKey ?? primary),
      front: cardType === 'basic' ? String(raw.front ?? raw.stem ?? '') : '',
      back: cardType === 'basic' ? String(raw.back ?? raw.answer ?? '') : '',
      stem: cardType === 'mcq' ? String(raw.stem ?? raw.front ?? '') : '',
      options,
      answer: cardType === 'mcq' ? String(raw.answer ?? raw.back ?? '') : '',
      text: cardType === 'cloze' ? String(raw.text ?? raw.front ?? '') : '',
      extra: cardType === 'cloze' ? String(raw.extra ?? raw.explanation ?? '') : '',
      explanation: String(raw.explanation ?? raw.extra ?? ''),
      mnemonic: String(raw.mnemonic ?? ''),
      topic: String(raw.topic ?? ''),
      frequency: freq,
      frequencyTier,
      frequencyBadge: String(
        raw.frequency_badge ?? raw.frequencyBadge ?? formatFrequencyBadge(freq, frequencyTier, sourceKind),
      ),
      sourceKind,
      sourceYears,
      tags,
      media,
      fsrs,
      isLeech,
      createdAt: Number(raw.createdAt ?? nowMs),
      updatedAt: Number(raw.updatedAt ?? nowMs),
    };
  });

  return { deckName, cards };
}

export async function exportApkg(
  deckName: string,
  cards: StudyCard[],
  mediaBlobs: Map<string, Blob> = new Map(),
): Promise<Uint8Array> {
  if (!cards.length) {
    throw new Error('牌组为空，无法导出 .apkg');
  }
  const SQL = await initSqlJsOffline();
  const db = new SQL.Database();
  const nowSec = Math.floor(Date.now() / 1000);
  const rootDid = deterministicHash(`deck:${deckName}`);

  const decksMap: Record<string, Record<string, unknown>> = {
    '1': { id: 1, mod: nowSec, name: 'Default', usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, desc: '', dyn: 0, conf: 1 },
    [String(rootDid)]: { id: rootDid, mod: nowSec, name: deckName, usn: -1, lrnToday: [0, 0], revToday: [0, 0], newToday: [0, 0], timeToday: [0, 0], collapsed: false, desc: '', dyn: 0, conf: 1 },
  };
  const modelsMap = buildModelsJson(rootDid, nowSec);
  const allTags: Record<string, number> = {};
  const mediaManifest: Record<string, string> = {};
  const mediaZipEntries = new Map<string, Blob>();
  let mediaCounter = 0;

  try {
    db.run(SCHEMA_SQL);

    const baseId = Math.max(1_700_000_000_000, Date.now());
    let dueCounter = 1;

    const noteStmt = db.prepare(
      'INSERT INTO notes (id, guid, mid, mod, usn, tags, flds, sfld, csum, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );
    const cardStmt = db.prepare(
      'INSERT INTO cards (id, nid, did, ord, mod, usn, type, queue, due, ivl, factor, reps, lapses, left, odue, odid, flags, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    );

    for (let idx = 0; idx < cards.length; idx += 1) {
      const c = cards[idx];
      const sub = c.subdeck || SUBDECK_BY_TIER[c.frequencyTier] || SUBDECK_BY_TIER.low;
      const targetDeck = sub.startsWith(`${deckName}::`) ? sub : `${deckName}::${sub}`;
      const targetDid = deterministicHash(`deck:${targetDeck}`);
      if (!decksMap[String(targetDid)]) {
        decksMap[String(targetDid)] = {
          id: targetDid,
          mod: nowSec,
          name: targetDeck,
          usn: -1,
          lrnToday: [0, 0],
          revToday: [0, 0],
          newToday: [0, 0],
          timeToday: [0, 0],
          collapsed: false,
          desc: '',
          dyn: 0,
          conf: 1,
        };
      }

      const mediaHtmlParts: string[] = [];
      for (const fname of c.media) {
        if (!mediaZipEntries.has(fname) && mediaBlobs.has(fname)) {
          const zKey = String(mediaCounter);
          mediaCounter += 1;
          mediaManifest[zKey] = fname;
          mediaZipEntries.set(zKey, mediaBlobs.get(fname)!);
        }
        mediaHtmlParts.push(`<img src="${fname.replace(/"/g, '&quot;')}">`);
      }
      const mediaHtml = mediaHtmlParts.join('');
      const yearsStr = escapeFieldHtml(c.sourceYears.join(', '));
      const badge = escapeFieldHtml(c.frequencyBadge);
      const topic = escapeFieldHtml(c.topic);
      const mnemonic = escapeFieldHtml(c.mnemonic);

      let fldsList: string[];
      if (c.cardType === 'mcq') {
        fldsList = [
          escapeFieldHtml(c.stem),
          formatMcqOptionsHtml(c.options),
          escapeFieldHtml(c.answer),
          escapeFieldHtml(c.explanation),
          mnemonic,
          badge,
          yearsStr,
          topic,
          mediaHtml,
          c.cardId,
        ];
      } else if (c.cardType === 'cloze') {
        fldsList = [
          escapeFieldHtml(c.text),
          escapeFieldHtml(c.extra || c.explanation),
          mnemonic,
          badge,
          yearsStr,
          topic,
          mediaHtml,
          c.cardId,
        ];
      } else {
        fldsList = [
          escapeFieldHtml(c.front),
          escapeFieldHtml(c.back),
          escapeFieldHtml(c.explanation),
          mnemonic,
          badge,
          yearsStr,
          topic,
          mediaHtml,
          c.cardId,
        ];
      }

      const fldsJoined = fldsList.join('\x1f');
      const sfld = stripHtmlTags(fldsList[0]).trim();
      const csum = await computeAnkiChecksum(fldsList[0]);

      const tagsSet = new Set(c.tags);
      if (c.isLeech) tagsSet.add('leech');
      const tagsList = [...tagsSet];
      for (const t of tagsList) allTags[t] = 0;
      const tagsStr = tagsList.length ? ` ${tagsList.join(' ')} ` : '';

      const nid = baseId + idx * 100;
      noteStmt.run([nid, c.guid, MODEL_IDS[c.cardType], nowSec, -1, tagsStr, fldsJoined, sfld, csum, 0, '{}']);

      let ords = [0];
      if (c.cardType === 'cloze') {
        const ordSet = new Set<number>();
        const clozeRe = /\{\{c(\d+)::/g;
        let m: RegExpExecArray | null = clozeRe.exec(fldsList[0]);
        while (m !== null) {
          const n = Number(m[1]);
          if (n >= 1) ordSet.add(n - 1);
          m = clozeRe.exec(fldsList[0]);
        }
        if (ordSet.size > 0) {
          ords = [...ordSet].sort((a, b) => a - b);
        }
      }

      const ankiCardType = c.fsrs.state === 'new' ? 0 : c.fsrs.state === 'review' ? 2 : 1;
      for (const ord of ords) {
        const cid = nid + 1 + ord;
        cardStmt.run([
          cid,
          nid,
          targetDid,
          ord,
          nowSec,
          -1,
          ankiCardType,
          ankiCardType,
          dueCounter,
          c.fsrs.scheduledDays,
          2500,
          c.fsrs.reps,
          c.fsrs.lapses,
          0,
          0,
          0,
          0,
          '{}',
        ]);
        dueCounter += 1;
      }
    }

    noteStmt.free();
    cardStmt.free();

    const conf = {
      nextPos: 1,
      estTimes: true,
      activeDecks: [rootDid],
      sortType: 'noteFld',
      timeLim: 0,
      sortBackwards: false,
      addToCur: true,
      curDeck: rootDid,
      newBury: true,
      newSpread: 0,
      dueCounts: true,
      curModel: String(MODEL_IDS.basic),
      collapseTime: 1200,
    };
    const dconf = {
      '1': {
        id: 1,
        mod: nowSec,
        name: 'Default',
        usn: -1,
        maxTaken: 60,
        autoplay: true,
        timer: 0,
        replayq: true,
        new: { bury: false, delays: [1, 10], initialFactor: 2500, ints: [1, 4, 7], order: 1, perDay: 30 },
        rev: { bury: false, ease4: 1.3, fuzz: 0.05, ivlFct: 1.0, maxIvl: 36500, perDay: 200, hardFactor: 1.2 },
        lapse: { delays: [10], leechAction: 0, leechFails: 8, minInt: 1, mult: 0.0 },
      },
    };

    db.run(
      'INSERT INTO col (id, crt, mod, scm, ver, dty, usn, ls, conf, models, decks, dconf, tags) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        1,
        nowSec,
        nowSec * 1000,
        nowSec * 1000,
        11,
        0,
        0,
        0,
        JSON.stringify(conf),
        JSON.stringify(modelsMap),
        JSON.stringify(decksMap),
        JSON.stringify(dconf),
        JSON.stringify(allTags),
      ],
    );

    const dbBinary = db.export();
    const zip = new JSZip();
    zip.file('collection.anki2', dbBinary);
    zip.file('media', JSON.stringify(mediaManifest));
    for (const [zKey, blob] of mediaZipEntries.entries()) {
      zip.file(zKey, await blob.arrayBuffer());
    }
    return await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  } finally {
    db.close();
  }
}

export function exportLeechJson(deckName: string, cards: StudyCard[]): string {
  const payload = {
    deck_name: deckName,
    exported_at: new Date().toISOString(),
    leech_count: cards.length,
    cards: cards.map((c) => ({
      guid: c.guid,
      card_id: c.cardId,
      concept_key: c.conceptKey,
      card_type: c.cardType,
      topic: c.topic,
      front: c.front || undefined,
      back: c.back || undefined,
      stem: c.stem || undefined,
      options: c.options.length ? c.options : undefined,
      answer: c.answer || undefined,
      text: c.text || undefined,
      explanation: c.explanation,
      mnemonic: c.mnemonic,
      lapses: c.fsrs.lapses,
      reps: c.fsrs.reps,
      tags: c.tags,
    })),
  };
  return JSON.stringify(payload, null, 2);
}
