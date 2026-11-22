import { useEffect, useMemo, useState } from 'react';

import { previewIntervals } from '../engine/fsrs';
import type { FrequencyTier, Rating, StudyCard, StudyMode } from '../types';
import { ImageLightbox } from './ImageLightbox';

interface StudyViewProps {
  deckName: string;
  mode: StudyMode;
  queue: StudyCard[];
  mediaUrls: Map<string, string>;
  tierFilter: FrequencyTier | 'all';
  showIntervals: boolean;
  onChangeTierFilter: (tier: FrequencyTier | 'all') => void;
  onRateCard: (card: StudyCard, rating: Rating, elapsedMs: number) => void;
  onUpdateMnemonic: (card: StudyCard, mnemonic: string) => void;
  onExit: () => void;
}

interface ClozePart {
  kind: 'text' | 'blank';
  content: string;
  hint?: string;
  idx?: number;
}

function parseClozeSegments(raw: string): ClozePart[] {
  const re = /\{\{c(\d+)::([\s\S]*?)(?:::([\s\S]*?))?\}\}/g;
  const parts: ClozePart[] = [];
  let lastIndex = 0;
  let blankSeq = 0;
  let m: RegExpExecArray | null = re.exec(raw);
  while (m !== null) {
    if (m.index > lastIndex) {
      parts.push({ kind: 'text', content: raw.slice(lastIndex, m.index) });
    }
    parts.push({
      kind: 'blank',
      content: m[2],
      hint: m[3],
      idx: blankSeq,
    });
    blankSeq += 1;
    lastIndex = m.index + m[0].length;
    m = re.exec(raw);
  }
  if (lastIndex < raw.length) {
    parts.push({ kind: 'text', content: raw.slice(lastIndex) });
  }
  return parts;
}

function extractOptionLetter(opt: string): string {
  const m = /^\s*([A-Ha-h])\s*[.．、:：\)\]]/.exec(opt);
  return m ? m[1].toUpperCase() : opt.trim().slice(0, 1).toUpperCase();
}

export function StudyView({
  deckName,
  mode,
  queue,
  mediaUrls,
  tierFilter,
  showIntervals,
  onChangeTierFilter,
  onRateCard,
  onUpdateMnemonic,
  onExit,
}: StudyViewProps) {
  const [cursor, setCursor] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [selectedOpt, setSelectedOpt] = useState<string | null>(null);
  const [peekedBlanks, setPeekedBlanks] = useState<Set<number>>(new Set());
  const [editingMnemonic, setEditingMnemonic] = useState(false);
  const [mnemonicDraft, setMnemonicDraft] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [cardStartedAt, setCardStartedAt] = useState(() => Date.now());

  const card = queue[cursor] ?? null;

  useEffect(() => {
    setRevealed(false);
    setSelectedOpt(null);
    setPeekedBlanks(new Set());
    setEditingMnemonic(false);
    setMnemonicDraft(card?.mnemonic ?? '');
    setCardStartedAt(Date.now());
  }, [card?.guid]);

  useEffect(() => {
    setCursor(0);
  }, [mode, tierFilter]);

  const intervals = useMemo(
    () => (card ? previewIntervals(card.fsrs) : null),
    [card?.guid, card?.fsrs.reps, card?.fsrs.lapses],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!card || editingMnemonic) return;
      if (e.code === 'Space' && !revealed) {
        e.preventDefault();
        setRevealed(true);
      } else if (revealed) {
        if (e.key === '1') handleRate(1);
        if (e.key === '2') handleRate(2);
        if (e.key === '3') handleRate(3);
        if (e.key === '4') handleRate(4);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const handleRate = (rating: Rating) => {
    if (!card) return;
    const elapsedMs = Math.max(300, Date.now() - cardStartedAt);
    onRateCard(card, rating, elapsedMs);
    setCursor((prev) => prev + 1);
  };

  const modeLabel = mode === 'sprint' ? '考前冲刺' : mode === 'leech' ? '卡壳攻坚' : 'FSRS 复习';

  if (!card) {
    return (
      <div className="card-panel" style={{ textAlign: 'center', padding: '36px 18px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>这一轮已经刷完了</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>
          {deckName} · {modeLabel}
        </div>
        <button type="button" className="btn btn-primary" onClick={onExit}>
          返回牌组列表
        </button>
      </div>
    );
  }

  const clozeParts = card.cardType === 'cloze' ? parseClozeSegments(card.text) : [];
  const normAnswer = card.answer.trim().toUpperCase();

  return (
    <>
      <div className="row-between" style={{ padding: '4px 0' }}>
        <button type="button" className="btn btn-sm btn-subtle" onClick={onExit}>
          ← 返回
        </button>
        <div style={{ fontSize: 13, fontWeight: 600 }} className="num-tab">
          {modeLabel} · {cursor + 1} / {queue.length}
        </div>
        {mode === 'sprint' ? (
          <select
            className="select-field"
            style={{ width: 'auto', padding: '4px 8px', fontSize: 12 }}
            value={tierFilter}
            onChange={(e) => onChangeTierFilter(e.target.value as FrequencyTier | 'all')}
          >
            <option value="all">全部考点</option>
            <option value="high">仅高频必背</option>
            <option value="medium">中频常考</option>
            <option value="supplement">课件补充</option>
          </select>
        ) : (
          <span style={{ width: 52 }} />
        )}
      </div>

      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${Math.round(((cursor + 1) / Math.max(1, queue.length)) * 100)}%` }}
        />
      </div>

      <div className="card-panel">
        <div className="row-wrap">
          {card.frequencyBadge && (
            <span className={`pill ${card.frequencyTier === 'high' ? 'pill-high' : ''}`}>
              {card.frequencyBadge}
            </span>
          )}
          {card.topic && <span className="pill pill-topic">{card.topic}</span>}
          {card.isLeech && <span className="pill pill-leech">卡壳 ({card.fsrs.lapses}次遗忘)</span>}
        </div>

        {card.cardType === 'basic' && (
          <div className="study-card-prompt">{card.front}</div>
        )}

        {card.cardType === 'mcq' && (
          <>
            <div className="study-card-prompt">{card.stem}</div>
            <div className="mcq-list">
              {card.options.map((opt) => {
                const letter = extractOptionLetter(opt);
                const isSelected = selectedOpt === letter;
                const isCorrect = normAnswer.includes(letter);
                let cls = 'mcq-opt';
                if (revealed) {
                  if (isCorrect) cls += ' correct';
                  else if (isSelected) cls += ' wrong';
                }
                return (
                  <button
                    key={opt}
                    type="button"
                    className={cls}
                    onClick={() => {
                      setSelectedOpt(letter);
                      setRevealed(true);
                    }}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {card.cardType === 'cloze' && (
          <div className="study-card-prompt">
            {clozeParts.map((part, idx) => {
              if (part.kind === 'text') return <span key={idx}>{part.content}</span>;
              const isBlankShown = revealed || peekedBlanks.has(part.idx ?? idx);
              if (isBlankShown) {
                return (
                  <span key={idx} className="cloze-revealed">
                    {part.content}
                  </span>
                );
              }
              return (
                <button
                  key={idx}
                  type="button"
                  className="cloze-blank"
                  onClick={() => {
                    const next = new Set(peekedBlanks);
                    next.add(part.idx ?? idx);
                    setPeekedBlanks(next);
                  }}
                >
                  {part.hint ? `[ ${part.hint} ]` : '[ … ]'}
                </button>
              );
            })}
          </div>
        )}

        {card.media.map((mname) => {
          const src = mediaUrls.get(mname);
          if (!src) return null;
          return (
            <img
              key={mname}
              src={src}
              alt={mname}
              className="media-thumb"
              onClick={() => setLightboxSrc(src)}
            />
          );
        })}

        {!revealed ? (
          <div style={{ marginTop: 18 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => setRevealed(true)}
            >
              显示答案
            </button>
          </div>
        ) : (
          <>
            <hr className="study-divider" />
            {card.cardType === 'basic' && <div className="study-answer-box">{card.back}</div>}
            {card.cardType === 'mcq' && (
              <div className="study-answer-box">参考答案：{card.answer}</div>
            )}

            {card.explanation && (
              <div className="study-info-box">
                <div className="box-label">解析 / 考点说明</div>
                {card.explanation}
              </div>
            )}

            <div className="study-mnemonic-box">
              <div className="row-between" style={{ marginBottom: 4 }}>
                <span className="box-label" style={{ marginBottom: 0 }}>记忆法助记</span>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ minHeight: 26, fontSize: 12 }}
                  onClick={() => setEditingMnemonic(!editingMnemonic)}
                >
                  {editingMnemonic ? '取消' : card.mnemonic ? '编辑' : '添加助记'}
                </button>
              </div>
              {editingMnemonic ? (
                <div style={{ marginTop: 6 }}>
                  <textarea
                    className="textarea-field"
                    value={mnemonicDraft}
                    placeholder="输入口诀、对比记忆或谐音联想…"
                    onChange={(e) => setMnemonicDraft(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{ marginTop: 6 }}
                    onClick={() => {
                      onUpdateMnemonic(card, mnemonicDraft.trim());
                      setEditingMnemonic(false);
                    }}
                  >
                    保存助记
                  </button>
                </div>
              ) : card.mnemonic ? (
                <div>{card.mnemonic}</div>
              ) : (
                <div style={{ fontSize: 13, opacity: 0.75 }}>
                  暂无助记；如果反复记不住，可导出卡壳清单交给 AI 生成记忆法后回写。
                </div>
              )}
            </div>

            {card.sourceYears.length > 0 && (
              <div className="top-sub" style={{ marginTop: 12 }}>
                真题年份 / 来源：{card.sourceYears.join(', ')}
              </div>
            )}
          </>
        )}
      </div>

      {revealed && intervals && (
        <div className="rating-bar">
          <button type="button" className="rate-btn rate-again" onClick={() => handleRate(1)}>
            <strong>重来</strong>
            {showIntervals && <span>{intervals[1].label}</span>}
          </button>
          <button type="button" className="rate-btn" onClick={() => handleRate(2)}>
            <strong>困难</strong>
            {showIntervals && <span>{intervals[2].label}</span>}
          </button>
          <button type="button" className="rate-btn rate-good" onClick={() => handleRate(3)}>
            <strong>良好</strong>
            {showIntervals && <span>{intervals[3].label}</span>}
          </button>
          <button type="button" className="rate-btn" onClick={() => handleRate(4)}>
            <strong>简单</strong>
            {showIntervals && <span>{intervals[4].label}</span>}
          </button>
        </div>
      )}

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}
