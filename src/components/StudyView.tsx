import { useEffect, useMemo, useState } from 'react';

import { previewIntervals } from '../engine/fsrs';
import { evaluateMcq, extractOptionLetter } from '../engine/mcq';
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
  const [selectedOpts, setSelectedOpts] = useState<Set<string>>(() => new Set());
  const [peekedBlanks, setPeekedBlanks] = useState<Set<number>>(new Set());
  const [editingMnemonic, setEditingMnemonic] = useState(false);
  const [mnemonicDraft, setMnemonicDraft] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [cardStartedAt, setCardStartedAt] = useState(() => Date.now());

  const card = queue[cursor] ?? null;

  useEffect(() => {
    setRevealed(false);
    setSelectedOpts(new Set());
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

  const mcqEval = useMemo(
    () =>
      card && card.cardType === 'mcq'
        ? evaluateMcq(selectedOpts, card.answer, card.options, revealed)
        : null,
    [card, selectedOpts, revealed],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!card || editingMnemonic) return;
      if ((e.code === 'Space' || e.code === 'Enter') && !revealed) {
        e.preventDefault();
        setRevealed(true);
        return;
      }
      if (!revealed && card.cardType === 'mcq' && mcqEval && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const keyLetter = e.key.trim().toUpperCase();
        if (/^[A-H]$/.test(keyLetter)) {
          const valid = card.options.some((opt) => extractOptionLetter(opt) === keyLetter);
          if (valid) {
            e.preventDefault();
            if (mcqEval.isMulti) {
              setSelectedOpts((prev) => {
                const next = new Set(prev);
                if (next.has(keyLetter)) next.delete(keyLetter);
                else next.add(keyLetter);
                return next;
              });
            } else {
              setSelectedOpts(new Set([keyLetter]));
              setRevealed(true);
            }
            return;
          }
        }
      }
      if (revealed) {
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
  const resolvedMedia = card.media
    .map((mname) => ({ mname, src: mediaUrls.get(mname) }))
    .filter((item): item is { mname: string; src: string } => Boolean(item.src));

  const mediaBlock = resolvedMedia.length > 0 ? (
    <div>
      {resolvedMedia.map(({ mname, src }) => (
        <img
          key={mname}
          src={src}
          alt={mname}
          className="media-thumb"
          onClick={() => setLightboxSrc(src)}
        />
      ))}
      <div className="media-caption">点击图片可全屏放大查看</div>
    </div>
  ) : null;

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
          {card.cardType === 'mcq' && mcqEval?.isMulti && (
            <span className="pill pill-multi">多选题</span>
          )}
          {card.topic && <span className="pill pill-topic">{card.topic}</span>}
          {card.isLeech && <span className="pill pill-leech">卡壳 ({card.fsrs.lapses}次遗忘)</span>}
        </div>

        {card.cardType === 'basic' && (
          <>
            <div className="study-card-prompt">{card.front}</div>
            {mediaBlock}
          </>
        )}

        {card.cardType === 'mcq' && mcqEval && (
          <>
            <div className="study-card-prompt">{card.stem}</div>
            {mediaBlock}
            <div className="mcq-list">
              {card.options.map((opt) => {
                const letter = extractOptionLetter(opt);
                const optState = mcqEval.getOptionState(letter);
                const cls = optState === 'idle' ? 'mcq-opt' : `mcq-opt ${optState}`;
                const checkChar =
                  optState === 'selected' || optState === 'correct'
                    ? '✓'
                    : optState === 'wrong'
                      ? '✕'
                      : optState === 'missed'
                        ? '!'
                        : '';
                const showTag =
                  revealed &&
                  mcqEval.isMulti &&
                  mcqEval.selectedLetters.length > 0 &&
                  (optState === 'correct' || optState === 'missed' || optState === 'wrong');
                const tagLabel =
                  optState === 'correct' ? '选对' : optState === 'missed' ? '漏选' : '错选';
                return (
                  <button
                    key={opt}
                    type="button"
                    className={cls}
                    onClick={() => {
                      if (revealed) return;
                      if (mcqEval.isMulti) {
                        setSelectedOpts((prev) => {
                          const next = new Set(prev);
                          if (next.has(letter)) next.delete(letter);
                          else next.add(letter);
                          return next;
                        });
                      } else {
                        setSelectedOpts(new Set([letter]));
                        setRevealed(true);
                      }
                    }}
                  >
                    {mcqEval.isMulti && (
                      <span className={`mcq-check ${optState}`} aria-hidden="true">
                        {checkChar}
                      </span>
                    )}
                    <span className="mcq-opt-text">{opt}</span>
                    {showTag && <span className={`mcq-opt-tag ${optState}`}>{tagLabel}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}

        {card.cardType === 'cloze' && (
          <>
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
            {mediaBlock}
          </>
        )}

        {!revealed ? (
          <div style={{ marginTop: 18 }}>
            {card.cardType === 'mcq' && mcqEval?.isMulti ? (
              mcqEval.selectedLetters.length > 0 ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={() => setRevealed(true)}
                  >
                    提交判分（已选 {mcqEval.selectedLetters.join('')}）
                  </button>
                  <button
                    type="button"
                    className="btn btn-subtle"
                    onClick={() => setSelectedOpts(new Set())}
                  >
                    清空重选
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => setRevealed(true)}
                >
                  直接显示答案（未勾选）
                </button>
              )
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                onClick={() => setRevealed(true)}
              >
                显示答案
              </button>
            )}
          </div>
        ) : (
          <>
            <hr className="study-divider" />
            {card.cardType === 'basic' && <div className="study-answer-box">{card.back}</div>}
            {card.cardType === 'mcq' && mcqEval && (
              mcqEval.verdict === 'correct' ? (
                <div className="study-answer-box">回答正确 · 参考答案：{card.answer}</div>
              ) : mcqEval.verdict === 'partial' ? (
                <div className="study-answer-box partial">
                  漏选（已选 {mcqEval.selectedLetters.join('')} / 漏选 {mcqEval.missedLetters.join('')}）· 参考答案：{card.answer}
                </div>
              ) : mcqEval.verdict === 'wrong' ? (
                <div className="study-answer-box wrong">
                  回答有误（已选 {mcqEval.selectedLetters.join('')}）· 参考答案：{card.answer}
                </div>
              ) : (
                <div className="study-answer-box">参考答案：{card.answer}</div>
              )
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
