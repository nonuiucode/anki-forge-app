import type {
  AppSettings,
  DeckRecord,
  ImportResult,
  ReviewLogEntry,
  StudyCard,
} from '../types';

const DB_NAME = 'anki-forge-db';
const DB_VERSION = 1;

export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  leechThreshold: 3,
  dailyNewLimit: 30,
  showIntervals: true,
  shuffleQuestions: true,
  shuffleOptions: true,
  reminderEnabled: false,
  reminderTime: '20:30',
  smartDueReminder: true,
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('decks')) {
        db.createObjectStore('decks', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('cards')) {
        const cardStore = db.createObjectStore('cards', { keyPath: 'guid' });
        cardStore.createIndex('by_deck', 'deckId', { unique: false });
        cardStore.createIndex('by_leech', 'isLeech', { unique: false });
      }
      if (!db.objectStoreNames.contains('media')) {
        const mediaStore = db.createObjectStore('media', { keyPath: 'key' });
        mediaStore.createIndex('by_deck', 'deckId', { unique: false });
      }
      if (!db.objectStoreNames.contains('reviewLogs')) {
        const logStore = db.createObjectStore('reviewLogs', { keyPath: 'id' });
        logStore.createIndex('by_date', 'reviewedAt', { unique: false });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('Failed to open IndexedDB'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function reqPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function makeDeckId(name: string): string {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `deck-${(h >>> 0).toString(36)}`;
}

export async function loadAllDecks(): Promise<DeckRecord[]> {
  const db = await openDb();
  try {
    const tx = db.transaction('decks', 'readonly');
    const items = await reqPromise(tx.objectStore('decks').getAll());
    return (items as DeckRecord[]).sort((a, b) => b.updatedAt - a.updatedAt);
  } finally {
    db.close();
  }
}

export async function loadAllCards(): Promise<StudyCard[]> {
  const db = await openDb();
  try {
    const tx = db.transaction('cards', 'readonly');
    return (await reqPromise(tx.objectStore('cards').getAll())) as StudyCard[];
  } finally {
    db.close();
  }
}

export async function loadDeckMedia(deckId: string): Promise<Map<string, Blob>> {
  const db = await openDb();
  try {
    const tx = db.transaction('media', 'readonly');
    const idx = tx.objectStore('media').index('by_deck');
    const items = (await reqPromise(idx.getAll(deckId))) as Array<{
      key: string;
      filename: string;
      blob: Blob;
    }>;
    const map = new Map<string, Blob>();
    for (const item of items) {
      map.set(item.filename, item.blob);
    }
    return map;
  } finally {
    db.close();
  }
}

export async function loadAllMediaMap(): Promise<Map<string, Blob>> {
  const db = await openDb();
  try {
    const tx = db.transaction('media', 'readonly');
    const items = (await reqPromise(tx.objectStore('media').getAll())) as Array<{
      key: string;
      filename: string;
      blob: Blob;
    }>;
    const map = new Map<string, Blob>();
    for (const item of items) {
      map.set(item.filename, item.blob);
    }
    return map;
  } finally {
    db.close();
  }
}

export async function loadReviewLogs(): Promise<ReviewLogEntry[]> {
  const db = await openDb();
  try {
    const tx = db.transaction('reviewLogs', 'readonly');
    return (await reqPromise(tx.objectStore('reviewLogs').getAll())) as ReviewLogEntry[];
  } finally {
    db.close();
  }
}

export async function loadSettings(): Promise<AppSettings> {
  const db = await openDb();
  try {
    const tx = db.transaction('settings', 'readonly');
    const rec = (await reqPromise(tx.objectStore('settings').get('app'))) as
      | { key: string; value: AppSettings }
      | undefined;
    return rec ? { ...DEFAULT_SETTINGS, ...rec.value } : DEFAULT_SETTINGS;
  } finally {
    db.close();
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction('settings', 'readwrite');
    tx.objectStore('settings').put({ key: 'app', value: settings });
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function saveDeckRecord(deck: DeckRecord): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction('decks', 'readwrite');
    tx.objectStore('decks').put(deck);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function saveCardAndLog(card: StudyCard, log?: ReviewLogEntry): Promise<void> {
  const db = await openDb();
  try {
    const stores = log ? ['cards', 'reviewLogs'] : ['cards'];
    const tx = db.transaction(stores, 'readwrite');
    tx.objectStore('cards').put(card);
    if (log) {
      tx.objectStore('reviewLogs').put(log);
    }
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function upsertDeckImport(
  deckName: string,
  incomingCards: StudyCard[],
  mediaBlobs: Map<string, Blob> = new Map(),
): Promise<ImportResult> {
  const nowMs = Date.now();
  const deckId = makeDeckId(deckName);
  const db = await openDb();

  try {
    const tx = db.transaction(['decks', 'cards', 'media'], 'readwrite');
    const deckStore = tx.objectStore('decks');
    const cardStore = tx.objectStore('cards');
    const mediaStore = tx.objectStore('media');

    const existingDeck = (await reqPromise(deckStore.get(deckId))) as DeckRecord | undefined;
    const deck: DeckRecord = existingDeck
      ? { ...existingDeck, updatedAt: nowMs }
      : { id: deckId, name: deckName, description: '', examDate: null, createdAt: nowMs, updatedAt: nowMs };
    deckStore.put(deck);

    let addedCount = 0;
    let updatedCount = 0;

    for (const incoming of incomingCards) {
      const existingCard = (await reqPromise(cardStore.get(incoming.guid))) as StudyCard | undefined;
      if (existingCard) {
        // In-place GUID merge: update content, tags, frequency, and mnemonic while preserving FSRS progress
        const mergedTags = [...new Set([...existingCard.tags, ...incoming.tags])];
        const updatedCard: StudyCard = {
          ...incoming,
          deckId: existingCard.deckId || deckId,
          fsrs: existingCard.fsrs,
          isLeech: existingCard.isLeech || incoming.isLeech,
          mnemonic: incoming.mnemonic || existingCard.mnemonic,
          tags: mergedTags,
          createdAt: existingCard.createdAt,
          updatedAt: nowMs,
        };
        cardStore.put(updatedCard);
        updatedCount += 1;
      } else {
        cardStore.put({
          ...incoming,
          deckId,
          createdAt: incoming.createdAt || nowMs,
          updatedAt: nowMs,
        });
        addedCount += 1;
      }
    }

    for (const [filename, blob] of mediaBlobs.entries()) {
      mediaStore.put({
        key: `${deckId}::${filename}`,
        deckId,
        filename,
        blob,
      });
    }

    await txDone(tx);
    return { deck, addedCount, updatedCount, mediaCount: mediaBlobs.size };
  } finally {
    db.close();
  }
}

export async function deleteDeckAndCards(deckId: string): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(['decks', 'cards', 'media'], 'readwrite');
    tx.objectStore('decks').delete(deckId);

    const cardStore = tx.objectStore('cards');
    const cardKeys = await reqPromise(cardStore.index('by_deck').getAllKeys(deckId));
    for (const key of cardKeys) {
      cardStore.delete(key);
    }

    const mediaStore = tx.objectStore('media');
    const mediaKeys = await reqPromise(mediaStore.index('by_deck').getAllKeys(deckId));
    for (const key of mediaKeys) {
      mediaStore.delete(key);
    }

    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function exportFullBackupJson(): Promise<string> {
  const [decks, cards, reviewLogs, settings] = await Promise.all([
    loadAllDecks(),
    loadAllCards(),
    loadReviewLogs(),
    loadSettings(),
  ]);
  return JSON.stringify(
    {
      format: 'anki-forge-backup-v1',
      exportedAt: new Date().toISOString(),
      decks,
      cards,
      reviewLogs,
      settings,
    },
    null,
    2,
  );
}

export async function importFullBackupJson(jsonText: string): Promise<{ deckCount: number; cardCount: number }> {
  const data = JSON.parse(jsonText) as {
    format?: string;
    decks?: DeckRecord[];
    cards?: StudyCard[];
    reviewLogs?: ReviewLogEntry[];
    settings?: AppSettings;
  };
  if (data.format !== 'anki-forge-backup-v1' || !Array.isArray(data.decks) || !Array.isArray(data.cards)) {
    throw new Error('无效的 Anki Forge 全量备份文件');
  }
  const db = await openDb();
  try {
    const tx = db.transaction(['decks', 'cards', 'reviewLogs', 'settings'], 'readwrite');
    for (const d of data.decks) tx.objectStore('decks').put(d);
    for (const c of data.cards) tx.objectStore('cards').put(c);
    for (const l of data.reviewLogs ?? []) tx.objectStore('reviewLogs').put(l);
    if (data.settings) tx.objectStore('settings').put({ key: 'app', value: data.settings });
    await txDone(tx);
    return { deckCount: data.decks.length, cardCount: data.cards.length };
  } finally {
    db.close();
  }
}
