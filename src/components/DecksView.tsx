import { useRef, useState } from 'react';

import { computeExamPace } from '../engine/fsrs';
import type { DeckRecord, StudyCard, StudyMode } from '../types';

interface DecksViewProps {
  decks: DeckRecord[];
  cards: StudyCard[];
  dailyNewLimit: number;
  onImportFiles: (files: FileList) => void;
  onLoadDemo: () => void;
  onStartStudy: (deckId: string, mode: StudyMode) => void;
  onExportApkg: (deck: DeckRecord) => void;
  onUpdateExamDate: (deck: DeckRecord, examDate: string | null) => void;
  onDeleteDeck: (deck: DeckRecord) => void;
}

export function DecksView({
  decks,
  cards,
  dailyNewLimit,
  onImportFiles,
  onLoadDemo,
  onStartStudy,
  onExportApkg,
  onUpdateExamDate,
  onDeleteDeck,
}: DecksViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [searchDeckId, setSearchDeckId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const nowMs = Date.now();

  return (
    <>
      <div className="card-panel">
        <div className="row-between">
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>导入卡片包</div>
            <div className="top-sub">支持标准 .apkg（含图片）与 anki-exam-forge 的 deck.json</div>
          </div>
          <div className="row-wrap">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => fileInputRef.current?.click()}
            >
              导入 .apkg / JSON
            </button>
            {decks.length === 0 && (
              <button type="button" className="btn btn-subtle" onClick={onLoadDemo}>
                载入医学示例
              </button>
            )}
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".apkg,.json,application/octet-stream,application/zip,application/json"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onImportFiles(e.target.files);
              e.target.value = '';
            }
          }}
        />
      </div>

      {decks.length === 0 ? (
        <div className="card-panel" style={{ textAlign: 'center', padding: '32px 16px' }}>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>还没有牌组</div>
          <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
            在手机微信或文件管理里点击收到的 .apkg 可直接用「玖记」打开，也可先载入内置临床医学示例体验。
          </div>
          <button type="button" className="btn btn-primary" onClick={onLoadDemo}>
            体验临床医学高频真题示例
          </button>
        </div>
      ) : (
        decks.map((deck) => {
          const deckCards = cards.filter((c) => c.deckId === deck.id);
          const dueCount = deckCards.filter((c) => c.fsrs.state !== 'new' && c.fsrs.due <= nowMs).length;
          const newCount = Math.min(
            dailyNewLimit,
            deckCards.filter((c) => c.fsrs.state === 'new').length,
          );
          const totalNew = deckCards.filter((c) => c.fsrs.state === 'new').length;
          const highCount = deckCards.filter((c) => c.frequencyTier === 'high').length;
          const medCount = deckCards.filter((c) => c.frequencyTier === 'medium').length;
          const suppCount = deckCards.filter((c) => c.frequencyTier === 'supplement').length;
          const leechCount = deckCards.filter((c) => c.isLeech).length;
          const pace = computeExamPace(deckCards, deck.examDate, nowMs);

          const isSearching = searchDeckId === deck.id;
          const filteredSearch = isSearching && searchTerm.trim()
            ? deckCards.filter((c) => {
                const q = searchTerm.trim().toLowerCase();
                return (
                  c.front.toLowerCase().includes(q) ||
                  c.stem.toLowerCase().includes(q) ||
                  c.text.toLowerCase().includes(q) ||
                  c.back.toLowerCase().includes(q) ||
                  c.topic.toLowerCase().includes(q)
                );
              })
            : [];

          return (
            <div key={deck.id} className="card-panel">
              <div className="row-between" style={{ marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700 }}>{deck.name}</div>
                  <div className="top-sub num-tab">
                    共 {deckCards.length} 张 · 今日待复习 {dueCount} · 可学新卡 {newCount}/{totalNew}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-subtle"
                  onClick={() => setEditingDateId(editingDateId === deck.id ? null : deck.id)}
                >
                  {pace.daysLeft !== null
                    ? `距考试 ${pace.daysLeft} 天 · 建议 ${pace.suggestedDaily} 张/天`
                    : '设考试倒计时'}
                </button>
              </div>

              {editingDateId === deck.id && (
                <div className="row-wrap" style={{ marginBottom: 10 }}>
                  <input
                    type="date"
                    className="input-field"
                    style={{ width: 'auto', flex: 1 }}
                    value={deck.examDate ?? ''}
                    onChange={(e) => onUpdateExamDate(deck, e.target.value || null)}
                  />
                  {deck.examDate && (
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={() => {
                        onUpdateExamDate(deck, null);
                        setEditingDateId(null);
                      }}
                    >
                      清除
                    </button>
                  )}
                </div>
              )}

              <div className="row-wrap" style={{ marginBottom: 12 }}>
                {highCount > 0 && <span className="pill pill-high num-tab">高频 {highCount}</span>}
                {medCount > 0 && <span className="pill num-tab">中频 {medCount}</span>}
                {suppCount > 0 && <span className="pill pill-topic num-tab">课件补充 {suppCount}</span>}
                {leechCount > 0 && <span className="pill pill-leech num-tab">卡壳 {leechCount}</span>}
              </div>

              <div className="row-wrap">
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                  onClick={() => onStartStudy(deck.id, 'fsrs')}
                >
                  日常复习 ({dueCount + newCount})
                </button>
                <button
                  type="button"
                  className="btn btn-subtle"
                  style={{ flex: 1 }}
                  onClick={() => onStartStudy(deck.id, 'sprint')}
                >
                  考前冲刺
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => {
                    setSearchDeckId(isSearching ? null : deck.id);
                    setSearchTerm('');
                  }}
                >
                  检索
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => onExportApkg(deck)}
                >
                  导出 .apkg
                </button>
                {confirmDeleteId === deck.id ? (
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    onClick={() => {
                      onDeleteDeck(deck);
                      setConfirmDeleteId(null);
                    }}
                  >
                    确认删除
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setConfirmDeleteId(deck.id)}
                  >
                    删除
                  </button>
                )}
              </div>

              {isSearching && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border-subtle)' }}>
                  <input
                    type="search"
                    className="input-field"
                    placeholder="输入知识点、症状、药名或章节关键词检索…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm.trim() && (
                    <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {filteredSearch.slice(0, 12).map((c) => (
                        <div
                          key={c.guid}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 8,
                            background: 'var(--bg-subtle)',
                            fontSize: 13,
                          }}
                        >
                          <div style={{ fontWeight: 600 }}>{c.front || c.stem || c.text}</div>
                          <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>
                            {c.back || c.answer || c.extra}
                          </div>
                        </div>
                      ))}
                      {filteredSearch.length === 0 && (
                        <div className="top-sub">没有匹配卡片。</div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
