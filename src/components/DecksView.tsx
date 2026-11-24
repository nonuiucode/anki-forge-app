import { useRef, useState } from 'react';

import { computeExamPace } from '../engine/fsrs';
import type { DeckRecord, StudyCard, StudyMode } from '../types';
import { Switch } from './Controls';
import { HeroCover } from './DeckThemeArt';
import { Icon } from './Icons';

interface DecksViewProps {
  decks: DeckRecord[];
  cards: StudyCard[];
  dailyNewLimit: number;
  todayReviewed: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  onToggleShuffleQuestions: () => void;
  onToggleShuffleOptions: () => void;
  onImportFiles: (files: FileList) => void;
  onLoadDemo: () => void;
  onStartStudy: (deckId: string, mode: StudyMode) => void;
  onExportApkg: (deck: DeckRecord) => void;
  onUpdateExamDate: (deck: DeckRecord, examDate: string | null) => void;
  onDeleteDeck: (deck: DeckRecord) => void;
  isDark: boolean;
}

export function DecksView({
  decks,
  cards,
  dailyNewLimit,
  todayReviewed,
  shuffleQuestions,
  shuffleOptions,
  onToggleShuffleQuestions,
  onToggleShuffleOptions,
  onImportFiles,
  onLoadDemo,
  onStartStudy,
  onExportApkg,
  onUpdateExamDate,
  onDeleteDeck,
  isDark,
}: DecksViewProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [editingDateId, setEditingDateId] = useState<string | null>(null);
  const [searchDeckId, setSearchDeckId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const nowMs = Date.now();
  const dueTotal = cards.filter(
    (c) => c.fsrs.state === 'new' || c.fsrs.due <= nowMs,
  ).length;

  return (
    <>
      <HeroCover
        isDark={isDark}
        totalCards={cards.length}
        todayReviewed={todayReviewed}
        dueTotal={dueTotal}
      />

      <div className="card-panel is-list">
        <div className="list-group">
          <div className="list-row">
            <span className="list-row-icon">
              <Icon name="shuffle" size={18} />
            </span>
            <div className="list-row-text">
              <div className="list-row-title">题目乱序</div>
              <div className="list-row-sub">每轮随机打乱出题顺序</div>
            </div>
            <Switch
              checked={shuffleQuestions}
              label="题目乱序"
              onChange={() => onToggleShuffleQuestions()}
            />
          </div>
          <div className="list-row">
            <span className="list-row-icon">
              <Icon name="shuffle" size={18} />
            </span>
            <div className="list-row-text">
              <div className="list-row-title">选项乱序</div>
              <div className="list-row-sub">选择题选项随机排列，揭晓后标注原卷字母</div>
            </div>
            <Switch
              checked={shuffleOptions}
              label="选项乱序"
              onChange={() => onToggleShuffleOptions()}
            />
          </div>
        </div>
      </div>

      <div className="import-bar">
        <span className="import-bar-icon">
          <Icon name="upload" />
        </span>
        <div className="grow">
          <div className="import-bar-title">导入卡片包</div>
          <div className="import-bar-sub">.apkg（含图片）或 deck.json</div>
        </div>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => fileInputRef.current?.click()}
        >
          导入
        </button>
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
        <div className="card-panel empty-state">
          <img
            className="empty-art"
            src="./art/empty-vignette.webp"
            alt=""
            aria-hidden="true"
            loading="lazy"
            decoding="async"
          />
          <h2 className="empty-title">还没有牌组</h2>
          <p className="empty-desc">
            在微信或文件管理里点开收到的 .apkg，可直接用「玖记」打开；也可以先载入内置的临床医学示例体验。
          </p>
          <div className="empty-actions">
            <button type="button" className="btn btn-primary btn-block" onClick={onLoadDemo}>
              体验临床医学高频真题示例
            </button>
            <button
              type="button"
              className="btn btn-subtle btn-block"
              onClick={() => fileInputRef.current?.click()}
            >
              从文件导入
            </button>
          </div>
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
          const filteredSearch =
            isSearching && searchTerm.trim()
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

          const menuOpen = openMenuId === deck.id;
          const editingDate = editingDateId === deck.id;
          const hasTags = highCount + medCount + suppCount + leechCount > 0;

          return (
            <article key={deck.id} className="card-panel deck-card">
              <div className="deck-head">
                <div className="grow">
                  <h3 className="deck-name">{deck.name}</h3>
                  <div className="deck-meta">
                    共 <b>{deckCards.length}</b> 张 · 待复习 <b>{dueCount}</b> · 新卡{' '}
                    <b>{newCount}</b>/{totalNew}
                  </div>
                </div>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="更多操作"
                  aria-expanded={menuOpen}
                  onClick={() => {
                    setOpenMenuId(menuOpen ? null : deck.id);
                    setConfirmDeleteId(null);
                  }}
                >
                  <Icon name="more" />
                </button>
              </div>

              {pace.daysLeft !== null && (
                <button
                  type="button"
                  className="deck-exam"
                  onClick={() => setEditingDateId(editingDate ? null : deck.id)}
                >
                  <Icon name="calendar" size={14} />
                  距考试 {pace.daysLeft} 天 · 建议 {pace.suggestedDaily} 张/天
                </button>
              )}

              {hasTags && (
                <div className="deck-tags">
                  {highCount > 0 && <span className="pill pill-high num-tab">高频 {highCount}</span>}
                  {medCount > 0 && <span className="pill num-tab">中频 {medCount}</span>}
                  {suppCount > 0 && (
                    <span className="pill pill-topic num-tab">课件补充 {suppCount}</span>
                  )}
                  {leechCount > 0 && <span className="pill pill-leech num-tab">卡壳 {leechCount}</span>}
                </div>
              )}

              <div className="deck-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => onStartStudy(deck.id, 'fsrs')}
                >
                  开始复习
                  <span className="btn-count">{dueCount + newCount}</span>
                </button>
                <button
                  type="button"
                  className="btn btn-subtle"
                  onClick={() => onStartStudy(deck.id, 'sprint')}
                >
                  <Icon name="zap" size={18} />
                  考前冲刺
                </button>
              </div>

              {menuOpen && (
                <div className="deck-drawer" role="group" aria-label={`${deck.name} 更多操作`}>
                  <button
                    type="button"
                    className={`drawer-btn${isSearching ? ' is-active' : ''}`}
                    onClick={() => {
                      setSearchDeckId(isSearching ? null : deck.id);
                      setSearchTerm('');
                    }}
                  >
                    <Icon name="search" />
                    检索
                  </button>
                  <button
                    type="button"
                    className={`drawer-btn${editingDate ? ' is-active' : ''}`}
                    onClick={() => setEditingDateId(editingDate ? null : deck.id)}
                  >
                    <Icon name="calendar" />
                    考试倒计时
                  </button>
                  <button
                    type="button"
                    className="drawer-btn"
                    onClick={() => onExportApkg(deck)}
                  >
                    <Icon name="download" />
                    导出
                  </button>
                  {confirmDeleteId === deck.id ? (
                    <button
                      type="button"
                      className="drawer-btn is-confirm"
                      onClick={() => {
                        onDeleteDeck(deck);
                        setConfirmDeleteId(null);
                        setOpenMenuId(null);
                      }}
                    >
                      <Icon name="trash" />
                      确认删除
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="drawer-btn is-danger"
                      onClick={() => setConfirmDeleteId(deck.id)}
                    >
                      <Icon name="trash" />
                      删除
                    </button>
                  )}
                </div>
              )}

              {editingDate && (
                <div className="deck-inline">
                  <div className="deck-inline-label">考试日期</div>
                  <div className="row-wrap">
                    <input
                      type="date"
                      className="input-field is-compact grow"
                      value={deck.examDate ?? ''}
                      onChange={(e) => onUpdateExamDate(deck, e.target.value || null)}
                    />
                    {deck.examDate && (
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => {
                          onUpdateExamDate(deck, null);
                          setEditingDateId(null);
                        }}
                      >
                        清除
                      </button>
                    )}
                  </div>
                </div>
              )}

              {isSearching && (
                <div className="deck-inline">
                  <input
                    type="search"
                    className="input-field"
                    autoFocus
                    placeholder="输入知识点、症状、药名或章节关键词检索…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  {searchTerm.trim() && (
                    <>
                      {filteredSearch.slice(0, 12).map((c) => (
                        <div key={c.guid} className="search-hit">
                          <div className="search-hit-q">{c.front || c.stem || c.text}</div>
                          <div className="search-hit-a">{c.back || c.answer || c.extra}</div>
                        </div>
                      ))}
                      {filteredSearch.length === 0 && (
                        <div className="search-empty">没有匹配卡片。</div>
                      )}
                    </>
                  )}
                </div>
              )}
            </article>
          );
        })
      )}
    </>
  );
}
