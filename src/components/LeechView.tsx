import { useState } from 'react';

import type { DeckRecord, StudyCard } from '../types';
import { Icon } from './Icons';

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
      <section className="card-panel">
        <div className="panel-head">
          <div className="grow">
            <h2 className="page-title">卡壳本</h2>
            <div className="panel-sub">遗忘 ≥ {leechThreshold} 次自动收录</div>
          </div>
          <span className="pill pill-leech num-tab">{leechCards.length} 张</span>
        </div>

        <div className="toolbar">
          <select
            className="select-field"
            aria-label="选择牌组"
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
          <div className="toolbar-actions">
            {selectedDeck && (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={leechCards.length === 0}
                onClick={() =>
                  onStartLeechStudy(selectedDeckId === 'all' ? selectedDeck.id : selectedDeckId)
                }
              >
                <Icon name="target" size={16} />
                攻坚刷卡
              </button>
            )}
            <button
              type="button"
              className="btn btn-subtle btn-sm"
              aria-label="导出卡壳清单 (.json)"
              disabled={leechCards.length === 0}
              onClick={() => onExportLeechJson(exportDeckName, leechCards)}
            >
              <Icon name="download" size={16} />
              导出清单
            </button>
            {selectedDeck && (
              <button
                type="button"
                className="btn btn-subtle btn-sm"
                aria-label="导出含进度 .apkg"
                onClick={() => onExportApkg(selectedDeck)}
              >
                导出 .apkg
              </button>
            )}
          </div>
        </div>
      </section>

      {leechCards.length === 0 ? (
        <div className="card-panel empty-state">
          <span className="empty-badge">
            <Icon name="check" size={24} />
          </span>
          <h2 className="empty-title">目前没有卡壳卡片</h2>
        </div>
      ) : (
        leechCards.map((c) => {
          const isEditing = editingGuid === c.guid;
          return (
            <article key={c.guid} className="card-panel">
              <div className="leech-head">
                <div className="study-meta">
                  <span className="pill pill-leech num-tab">遗忘 {c.fsrs.lapses} 次</span>
                  {c.topic && <span className="pill pill-topic">{c.topic}</span>}
                </div>
                <button
                  type="button"
                  className="text-btn"
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
              <div className="leech-q">{c.front || c.stem || c.text}</div>
              <div className="leech-a">{c.back || c.answer || c.extra}</div>
              {c.mnemonic && !isEditing && (
                <div className="study-mnemonic-box is-compact">{c.mnemonic}</div>
              )}
              {isEditing && (
                <div className="box-edit">
                  <textarea
                    className="textarea-field"
                    value={draft}
                    placeholder="填写针对性助记口诀或对比提示…"
                    onChange={(e) => setDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    onClick={() => {
                      onUpdateMnemonic(c, draft.trim());
                      setEditingGuid(null);
                    }}
                  >
                    保存助记
                  </button>
                </div>
              )}
            </article>
          );
        })
      )}
    </>
  );
}
