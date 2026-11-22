import { useCallback, useEffect, useMemo, useState } from 'react';

import { DecksView } from './components/DecksView';
import { LeechView } from './components/LeechView';
import { StatsView } from './components/StatsView';
import { StudyView } from './components/StudyView';
import { exportApkg, exportLeechJson, importApkg, importDeckJson } from './engine/apkgCodec';
import { buildStudyQueue, scheduleCard } from './engine/fsrs';
import { shareOrDownloadBytes, shareOrDownloadText, subscribeIncomingFiles } from './native/androidBridge';
import {
  DEFAULT_SETTINGS,
  deleteDeckAndCards,
  exportFullBackupJson,
  importFullBackupJson,
  loadAllCards,
  loadAllDecks,
  loadAllMediaMap,
  loadDeckMedia,
  loadReviewLogs,
  loadSettings,
  saveCardAndLog,
  saveDeckRecord,
  saveSettings,
  upsertDeckImport,
} from './storage/db';
import type {
  AppSettings,
  DeckRecord,
  FrequencyTier,
  Rating,
  ReviewLogEntry,
  StudyCard,
  StudyMode,
} from './types';

type TabKey = 'decks' | 'study' | 'leech' | 'stats';

function isZipMagic(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function App() {
  const [tab, setTab] = useState<TabKey>('decks');
  const [decks, setDecks] = useState<DeckRecord[]>([]);
  const [cards, setCards] = useState<StudyCard[]>([]);
  const [logs, setLogs] = useState<ReviewLogEntry[]>([]);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [mediaUrls, setMediaUrls] = useState<Map<string, string>>(new Map());
  const [toast, setToast] = useState<string | null>(null);

  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [studyMode, setStudyMode] = useState<StudyMode>('fsrs');
  const [tierFilter, setTierFilter] = useState<FrequencyTier | 'all'>('all');
  const [sessionQueue, setSessionQueue] = useState<StudyCard[]>([]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const refreshAll = useCallback(async () => {
    const [dList, cList, rLogs, appSet, mediaMap] = await Promise.all([
      loadAllDecks(),
      loadAllCards(),
      loadReviewLogs(),
      loadSettings(),
      loadAllMediaMap(),
    ]);
    setDecks(dList);
    setCards(cList);
    setLogs(rLogs);
    setSettings(appSet);
    setMediaUrls((prev) => {
      for (const url of prev.values()) URL.revokeObjectURL(url);
      const next = new Map<string, string>();
      for (const [fname, blob] of mediaMap.entries()) {
        next.set(fname, URL.createObjectURL(blob));
      }
      return next;
    });
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const applyTheme = () => {
      const dark =
        settings.theme === 'dark' ||
        (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', dark ? '#0b1120' : '#f7f6f2');
    };
    applyTheme();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', applyTheme);
    return () => mq.removeEventListener('change', applyTheme);
  }, [settings.theme]);

  const ingestFileBytes = useCallback(
    async (filename: string, bytes: Uint8Array) => {
      try {
        const lower = filename.toLowerCase();
        if (lower.endsWith('.apkg') || isZipMagic(bytes)) {
          const parsed = await importApkg(bytes, filename.replace(/\.(apkg|zip)$/i, ''));
          const res = await upsertDeckImport(parsed.deckName, parsed.cards, parsed.mediaBlobs);
          await refreshAll();
          setActiveDeckId(res.deck.id);
          showToast(
            `已导入「${res.deck.name}」：新增 ${res.addedCount} 张，更新 ${res.updatedCount} 张${
              res.mediaCount ? `，图片 ${res.mediaCount} 个` : ''
            }`,
          );
          return;
        }

        const text = new TextDecoder('utf-8').decode(bytes);
        const maybeObj = JSON.parse(text) as { format?: string };
        if (maybeObj.format === 'anki-forge-backup-v1') {
          const backupRes = await importFullBackupJson(text);
          await refreshAll();
          showToast(`已恢复备份：${backupRes.deckCount} 个牌组，${backupRes.cardCount} 张卡片`);
          return;
        }

        const parsed = importDeckJson(text, filename.replace(/\.json$/i, ''));
        const res = await upsertDeckImport(parsed.deckName, parsed.cards);
        await refreshAll();
        setActiveDeckId(res.deck.id);
        showToast(`已导入「${res.deck.name}」：新增 ${res.addedCount} 张，原地更新 ${res.updatedCount} 张`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showToast(`导入失败：${msg}`);
      }
    },
    [refreshAll, showToast],
  );

  useEffect(() => {
    return subscribeIncomingFiles((incoming) => {
      void ingestFileBytes(incoming.filename, incoming.bytes);
    });
  }, [ingestFileBytes]);

  const handleImportFiles = useCallback(
    async (files: FileList) => {
      for (const file of Array.from(files)) {
        const buf = new Uint8Array(await file.arrayBuffer());
        await ingestFileBytes(file.name, buf);
      }
    },
    [ingestFileBytes],
  );

  const handleLoadDemo = useCallback(async () => {
    try {
      const resp = await fetch('./demo-medical-deck.json');
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const text = await resp.text();
      const parsed = importDeckJson(text);
      const res = await upsertDeckImport(parsed.deckName, parsed.cards);
      await refreshAll();
      setActiveDeckId(res.deck.id);
      showToast(`已载入医学示例牌组（${res.addedCount + res.updatedCount} 张）`);
    } catch (err) {
      showToast(`载入示例失败：${err instanceof Error ? err.message : String(err)}`);
    }
  }, [refreshAll, showToast]);

  const startStudySession = useCallback(
    (deckId: string, mode: StudyMode, overrideTier: FrequencyTier | 'all' = 'all') => {
      const deckCards = cards.filter((c) => c.deckId === deckId);
      const q = buildStudyQueue(deckCards, mode, {
        dailyNewLimit: settings.dailyNewLimit,
        tierFilter: overrideTier,
        leechThreshold: settings.leechThreshold,
      });
      setActiveDeckId(deckId);
      setStudyMode(mode);
      setTierFilter(overrideTier);
      setSessionQueue(q);
      setTab('study');
    },
    [cards, settings.dailyNewLimit, settings.leechThreshold],
  );

  const handleChangeTierFilter = useCallback(
    (nextTier: FrequencyTier | 'all') => {
      setTierFilter(nextTier);
      if (activeDeckId) {
        const deckCards = cards.filter((c) => c.deckId === activeDeckId);
        setSessionQueue(
          buildStudyQueue(deckCards, studyMode, {
            dailyNewLimit: settings.dailyNewLimit,
            tierFilter: nextTier,
            leechThreshold: settings.leechThreshold,
          }),
        );
      }
    },
    [activeDeckId, cards, studyMode, settings.dailyNewLimit, settings.leechThreshold],
  );

  const handleRateCard = useCallback(
    async (card: StudyCard, rating: Rating, elapsedMs: number) => {
      const nowMs = Date.now();
      const updated = scheduleCard(card, rating, nowMs, settings.leechThreshold);
      const log: ReviewLogEntry = {
        id: `${nowMs}-${card.guid}`,
        guid: card.guid,
        deckId: card.deckId,
        rating,
        elapsedMs,
        reviewedAt: nowMs,
      };
      setCards((prev) => prev.map((c) => (c.guid === updated.guid ? updated : c)));
      setLogs((prev) => [...prev, log]);
      await saveCardAndLog(updated, log);
    },
    [settings.leechThreshold],
  );

  const handleUpdateMnemonic = useCallback(
    async (card: StudyCard, mnemonic: string) => {
      const updated: StudyCard = {
        ...card,
        mnemonic,
        tags: mnemonic && !card.tags.includes('mnemonic::added') ? [...card.tags, 'mnemonic::added'] : card.tags,
        updatedAt: Date.now(),
      };
      setCards((prev) => prev.map((c) => (c.guid === updated.guid ? updated : c)));
      setSessionQueue((prev) => prev.map((c) => (c.guid === updated.guid ? updated : c)));
      await saveCardAndLog(updated);
      showToast('助记已保存');
    },
    [showToast],
  );

  const handleExportApkg = useCallback(
    async (deck: DeckRecord) => {
      try {
        const deckCards = cards.filter((c) => c.deckId === deck.id);
        const media = await loadDeckMedia(deck.id);
        const bytes = await exportApkg(deck.name, deckCards, media);
        const safeName = `${deck.name.replace(/[^\w\u4e00-\u9fff-]+/g, '_')}.apkg`;
        const action = await shareOrDownloadBytes(safeName, 'application/octet-stream', bytes);
        showToast(action === 'shared' ? `已调起分享：${safeName}` : `已导出 ${safeName}`);
      } catch (err) {
        showToast(`导出失败：${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [cards, showToast],
  );

  const handleExportLeechJson = useCallback(
    async (deckName: string, leechCards: StudyCard[]) => {
      const jsonText = exportLeechJson(deckName, leechCards);
      const safeName = `leech-${deckName.replace(/[^\w\u4e00-\u9fff-]+/g, '_')}.json`;
      const action = await shareOrDownloadText(safeName, 'application/json', jsonText);
      showToast(action === 'shared' ? `已调起分享：${safeName}` : `已导出 ${safeName}`);
    },
    [showToast],
  );

  const handleUpdateExamDate = useCallback(
    async (deck: DeckRecord, examDate: string | null) => {
      const updated = { ...deck, examDate, updatedAt: Date.now() };
      setDecks((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      await saveDeckRecord(updated);
    },
    [],
  );

  const handleDeleteDeck = useCallback(
    async (deck: DeckRecord) => {
      await deleteDeckAndCards(deck.id);
      if (activeDeckId === deck.id) setActiveDeckId(null);
      await refreshAll();
      showToast(`已删除「${deck.name}」`);
    },
    [activeDeckId, refreshAll, showToast],
  );

  const handleUpdateSettings = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await saveSettings(next);
  }, []);

  const handleExportBackup = useCallback(async () => {
    const json = await exportFullBackupJson();
    const fname = `anki-forge-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const action = await shareOrDownloadText(fname, 'application/json', json);
    showToast(action === 'shared' ? `已分享备份：${fname}` : `已下载备份：${fname}`);
  }, [showToast]);

  const handleImportBackup = useCallback(
    async (file: File) => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      await ingestFileBytes(file.name, bytes);
    },
    [ingestFileBytes],
  );

  const activeDeck = useMemo(
    () => decks.find((d) => d.id === activeDeckId) ?? decks[0] ?? null,
    [decks, activeDeckId],
  );

  const isDark =
    settings.theme === 'dark' ||
    (settings.theme === 'system' &&
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches);

  return (
    <div
      className="app-shell"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (e.dataTransfer.files.length > 0) {
          void handleImportFiles(e.dataTransfer.files);
        }
      }}
    >
      <header className="top-bar">
        <div>
          <h1 className="top-title">Anki Forge</h1>
          <div className="top-sub">真题考频 · FSRS 复习 · 卡壳助记闭环</div>
        </div>
        <button
          type="button"
          className="btn btn-sm btn-subtle"
          onClick={() =>
            void handleUpdateSettings({
              ...settings,
              theme: isDark ? 'light' : 'dark',
            })
          }
        >
          {isDark ? '浅色' : '暗夜'}
        </button>
      </header>

      {toast && <div className="toast-banner">{toast}</div>}

      <main className="page-body">
        {tab === 'decks' && (
          <DecksView
            decks={decks}
            cards={cards}
            dailyNewLimit={settings.dailyNewLimit}
            onImportFiles={(f) => void handleImportFiles(f)}
            onLoadDemo={() => void handleLoadDemo()}
            onStartStudy={(id, mode) => startStudySession(id, mode)}
            onExportApkg={(d) => void handleExportApkg(d)}
            onUpdateExamDate={(d, dt) => void handleUpdateExamDate(d, dt)}
            onDeleteDeck={(d) => void handleDeleteDeck(d)}
          />
        )}

        {tab === 'study' && (
          <StudyView
            deckName={activeDeck?.name ?? '复习'}
            mode={studyMode}
            queue={sessionQueue}
            mediaUrls={mediaUrls}
            tierFilter={tierFilter}
            showIntervals={settings.showIntervals}
            onChangeTierFilter={handleChangeTierFilter}
            onRateCard={(c, r, ms) => void handleRateCard(c, r, ms)}
            onUpdateMnemonic={(c, mn) => void handleUpdateMnemonic(c, mn)}
            onExit={() => setTab('decks')}
          />
        )}

        {tab === 'leech' && (
          <LeechView
            decks={decks}
            cards={cards}
            leechThreshold={settings.leechThreshold}
            onStartLeechStudy={(id) => startStudySession(id, 'leech')}
            onExportLeechJson={(name, lc) => void handleExportLeechJson(name, lc)}
            onExportApkg={(d) => void handleExportApkg(d)}
            onUpdateMnemonic={(c, mn) => void handleUpdateMnemonic(c, mn)}
          />
        )}

        {tab === 'stats' && (
          <StatsView
            cards={cards}
            logs={logs}
            settings={settings}
            onUpdateSettings={(s) => void handleUpdateSettings(s)}
            onExportBackup={() => void handleExportBackup()}
            onImportBackup={(f) => void handleImportBackup(f)}
          />
        )}
      </main>

      <nav className="bottom-nav" aria-label="主导航">
        <div className="bottom-nav-inner">
          <button
            type="button"
            className={`nav-item ${tab === 'decks' ? 'active' : ''}`}
            onClick={() => setTab('decks')}
          >
            <span className="nav-icon">◫</span>
            <span>牌组</span>
          </button>
          <button
            type="button"
            className={`nav-item ${tab === 'study' ? 'active' : ''}`}
            onClick={() => {
              if (sessionQueue.length > 0) {
                setTab('study');
              } else if (activeDeck) {
                startStudySession(activeDeck.id, 'fsrs');
              } else {
                setTab('decks');
                showToast('请先导入或选择一个牌组');
              }
            }}
          >
            <span className="nav-icon">▸</span>
            <span>复习</span>
          </button>
          <button
            type="button"
            className={`nav-item ${tab === 'leech' ? 'active' : ''}`}
            onClick={() => setTab('leech')}
          >
            <span className="nav-icon">!</span>
            <span>卡壳本</span>
          </button>
          <button
            type="button"
            className={`nav-item ${tab === 'stats' ? 'active' : ''}`}
            onClick={() => setTab('stats')}
          >
            <span className="nav-icon">▤</span>
            <span>统计</span>
          </button>
        </div>
      </nav>
    </div>
  );
}
