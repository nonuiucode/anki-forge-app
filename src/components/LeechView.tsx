import { useState } from 'react';

import type { DeckRecord, StudyCard } from '../types';

interface LeechViewProps {
  decks: DeckRecord[];
  cards: StudyCard[];
  leechThreshold: number;
  onStartLeechStudy: (deckId: string) => void;
  onExportLeechJson: (deckName: string, leechCards: StudyCard[]) => void;
  onExportApkg: (deck: DeckRecord) => void;
  onUpdateMnemonic: (card: StudyCard, mnemonic: string) => void;
}

export function LeechView({
  decks,
  cards,
  leechThreshold,
  onStartLeechStudy,
  onExportLeechJson,
  onExportApkg,
  onUpdateMnemonic,
}: LeechViewProps) {
  const [selectedDeckId, setSelectedDeckId] = useState<string>('all');
  const [editingGuid, setEditingGuid] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const leechCards = cards
    .filter((c) => {
      if (selectedDeckId !== 'all' && c.deckId !== selectedDeckId) return false;
      return c.isLeech || c.fsrs.lapses >= leechThreshold;
    })
    .sort((a, b) => b.fsrs.lapses - a.fsrs.lapses);

  const selectedDeck = decks.find((d) => d.id === selectedDeckId) ?? decks[0] ?? null;
  const exportDeckName = selectedDeckId === 'all' ? 'All-Leeches' : selectedDeck?.name ?? 'Decks';

  return (
    <>
      <div className="card-panel">
        <div className="row-between" style={{ marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>卡壳本 (Leech)</div>
            <div className="top-sub">
              遗忘达到 {leechThreshold} 次的卡片自动收入这里，一键导出即可交回 anki-exam-forge 配记忆法助记
            </div>
          </div>
          <span className="pill pill-leech num-tab">{leechCards.length} 张</span>
        </div>

        <div className="row-wrap">
          <select
            className="select-field"
            style={{ flex: 1, minWidth: 160 }}
            value={selectedDeckId}
            onChange={(e) => setSelectedDeckId(e.target.value)}
          >
            <option value="all">全部牌组</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          {selectedDeck && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={leechCards.length === 0}
              onClick={() => onStartLeechStudy(selectedDeckId === 'all' ? selectedDeck.id : selectedDeckId)}
            >
              攻坚刷卡
            </button>
          )}
          <button
            type="button"
            className="btn btn-sm"
            disabled={leechCards.length === 0}
            onClick={() => onExportLeechJson(exportDeckName, leechCards)}
          >
            导出卡壳清单 (.json)
          </button>
          {selectedDeck && (
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onExportApkg(selectedDeck)}
            >
              导出含进度 .apkg
            </button>
          )}
        </div>
      </div>

      {leechCards.length === 0 ? (
        <div className="card-panel" style={{ textAlign: 'center', padding: '28px 16px' }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>目前没有卡壳卡片</div>
          <div className="top-sub" style={{ marginTop: 4 }}>
            刷卡时多次点击「重来」的难背知识点会自动沉淀到这里。
          </div>
        </div>
      ) : (
        leechCards.map((c) => {
          const isEditing = editingGuid === c.guid;
          return (
            <div key={c.guid} className="card-panel">
              <div className="row-between" style={{ marginBottom: 6 }}>
                <div className="row-wrap">
                  <span className="pill pill-leech num-tab">遗忘 {c.fsrs.lapses} 次</span>
                  {c.topic && <span className="pill pill-topic">{c.topic}</span>}
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-subtle"
                  onClick={() => {
                    if (isEditing) {
                      setEditingGuid(null);
                    } else {
                      setEditingGuid(c.guid);
                      setDraft(c.mnemonic);
                    }
                  }}
                >
                  {isEditing ? '取消' : c.mnemonic ? '改助记' : '写助记'}
                </button>
              </div>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>{c.front || c.stem || c.text}</div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                {c.back || c.answer || c.extra}
              </div>
              {c.mnemonic && !isEditing && (
                <div className="study-mnemonic-box" style={{ marginTop: 8, padding: '8px 12px' }}>
                  {c.mnemonic}
                </div>
              )}
              {isEditing && (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    className="textarea-field"
                    value={draft}
                    placeholder="填写针对性助记口诀或对比提示…"
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{ marginTop: 6 }}
                    onClick={() => {
                      onUpdateMnemonic(c, draft.trim());
                      setEditingGuid(null);
                    }}
                  >
                    保存助记
                  </button>
                </div>
              )}
            </div>
          );
        })
      )}
    </>
  );
}
