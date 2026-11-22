import { useEffect, useMemo, useRef, useState } from 'react';

import { previewIntervals } from '../engine/fsrs';
import {
  decideAutoMcqRating,
  evaluateMcq,
  prepareMcqOptions,
} from '../engine/mcq';
import type { FrequencyTier, Rating, StudyCard, StudyMode } from '../types';
import { AppleCoinMini } from './DeckThemeArt';
import { ImageLightbox } from './ImageLightbox';

interface StudyViewProps {
  deckName: string;
  sessionId: number;
  mode: StudyMode;
  queue: StudyCard[];
  mediaUrls: Map<string, string>;
  tierFilter: FrequencyTier | 'all';
  showIntervals: boolean;
  shuffleOptions: boolean;
  onChangeTierFilter: (tier: FrequencyTier | 'all') => void;
  onRateCard: (
    card: StudyCard,
    rating: Rating,
    elapsedMs: number,
  ) => Promise<{ label: string }> | { label: string };
  onUpdateMnemonic: (card: StudyCard, mnemonic: string) => void;
  onExit: () => void;
}

interface ClozePart {
  kind: 'text' | 'blank';
  content: string;
  hint?: string;
  idx?: number;
}

interface ArchivedRecord {
  rating: Rating;
  reason: string;
  intervalLabel: string;
}

interface SessionCardRecord {
  selectedOpts: string[];
  revealed: boolean;
  archived?: ArchivedRecord;
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
  sessionId,
  mode,
  queue,
  mediaUrls,
  tierFilter,
  showIntervals,
  shuffleOptions,
  onChangeTierFilter,
  onRateCard,
  onUpdateMnemonic,
  onExit,
}: StudyViewProps) {
  const [cursor, setCursor] = useState(0);
  const [records, setRecords] = useState<Record<string, SessionCardRecord>>({});
  const [peekedBlanks, setPeekedBlanks] = useState<Set<number>>(new Set());
  const [editingMnemonic, setEditingMnemonic] = useState(false);
  const [mnemonicDraft, setMnemonicDraft] = useState('');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [cardStartedAt, setCardStartedAt] = useState(() => Date.now());
  const [dragX, setDragX] = useState(0);

  const touchRef = useRef<{
    x: number;
    y: number;
    t: number;
    locked: 'h' | 'v' | null;
  } | null>(null);

  const card = queue[cursor] ?? null;
  const currentRecord: SessionCardRecord = card
    ? (records[card.guid] ?? { selectedOpts: [], revealed: false })
    : { selectedOpts: [], revealed: false };
  const revealed = currentRecord.revealed;
  const selectedSet = useMemo(
    () => new Set(currentRecord.selectedOpts),
    [currentRecord.selectedOpts],
  );

  useEffect(() => {
    setCursor(0);
    setRecords({});
    setDragX(0);
  }, [sessionId, mode, tierFilter]);

  useEffect(() => {
    setPeekedBlanks(new Set());
    setEditingMnemonic(false);
    setMnemonicDraft(card?.mnemonic ?? '');
    setCardStartedAt(Date.now());
    setDragX(0);
    touchRef.current = null;
  }, [card?.guid, cursor]);

  const intervals = useMemo(
    () => (card ? previewIntervals(card.fsrs) : null),
    [card?.guid, card?.fsrs.reps, card?.fsrs.lapses],
  );

  const preparedMcq = useMemo(() => {
    if (!card || card.cardType !== 'mcq') return null;
    return prepareMcqOptions(
      card.options,
      card.answer,
      shuffleOptions,
      `${sessionId}:${card.guid}`,
    );
  }, [card, shuffleOptions, sessionId]);

  const mcqDisplayTexts = useMemo(
    () => (preparedMcq ? preparedMcq.options.map((o) => o.displayText) : []),
    [preparedMcq],
  );

  const mcqEval = useMemo(() => {
    if (!preparedMcq) return null;
    return evaluateMcq(selectedSet, preparedMcq.answer, mcqDisplayTexts, revealed);
  }, [preparedMcq, selectedSet, mcqDisplayTexts, revealed]);

  const goPrev = () => {
    setCursor((prev) => Math.max(0, prev - 1));
  };

  const goNext = () => {
    setCursor((prev) => Math.min(queue.length, prev + 1));
  };

  const commitMcqReveal = (picked: Set<string>) => {
    if (!card || !preparedMcq) return;
    const prevRec = records[card.guid];
    if (prevRec?.revealed) return;

    const pickedArr = [...picked].sort();
    const ev = evaluateMcq(picked, preparedMcq.answer, mcqDisplayTexts, true);
    const elapsedMs = Math.max(300, Date.now() - cardStartedAt);
    const decision = decideAutoMcqRating(ev.verdict, ev.isMulti, elapsedMs);
    const fallbackLabel = intervals ? intervals[decision.rating].label : '已归档';

    if (prevRec?.archived) {
      setRecords((prev) => ({
        ...prev,
        [card.guid]: {
          selectedOpts: pickedArr,
          revealed: true,
          archived: prevRec.archived,
        },
      }));
      return;
    }

    setRecords((prev) => ({
      ...prev,
      [card.guid]: {
        selectedOpts: pickedArr,
        revealed: true,
        archived: {
          rating: decision.rating,
          reason: decision.reason,
          intervalLabel: fallbackLabel,
        },
      },
    }));

    void Promise.resolve(onRateCard(card, decision.rating, elapsedMs)).then((res) => {
      if (!res?.label) return;
      setRecords((prev) => {
        const cur = prev[card.guid];
        if (!cur?.archived) return prev;
        return {
          ...prev,
          [card.guid]: {
            ...cur,
            archived: {
              ...cur.archived,
              intervalLabel: res.label,
            },
          },
        };
      });
    });
  };

  const handleManualRate = (rating: Rating) => {
    if (!card) return;
    const elapsedMs = Math.max(300, Date.now() - cardStartedAt);
    const fallbackLabel = intervals ? intervals[rating].label : '已归档';
    const labels: Record<Rating, string> = {
      1: '需重学 · 短期重测',
      2: '稍难 · 巩固记忆',
      3: '正常掌握',
      4: '熟练掌握',
    };

    if (!currentRecord.archived) {
      setRecords((prev) => ({
        ...prev,
        [card.guid]: {
          ...(prev[card.guid] ?? { selectedOpts: [], revealed: true }),
          revealed: true,
          archived: {
            rating,
            reason: labels[rating],
            intervalLabel: fallbackLabel,
          },
        },
      }));
      void Promise.resolve(onRateCard(card, rating, elapsedMs)).then((res) => {
        if (!res?.label) return;
        setRecords((prev) => {
          const cur = prev[card.guid];
          if (!cur?.archived) return prev;
          return {
            ...prev,
            [card.guid]: {
              ...cur,
              archived: { ...cur.archived, intervalLabel: res.label },
            },
          };
        });
      });
    }
    goNext();
  };

  const toggleMultiOption = (letter: string) => {
    if (!card || revealed) return;
    setRecords((prev) => {
      const cur = prev[card.guid] ?? { selectedOpts: [], revealed: false };
      const nextSet = new Set(cur.selectedOpts);
      if (nextSet.has(letter)) nextSet.delete(letter);
      else nextSet.add(letter);
      return {
        ...prev,
        [card.guid]: {
          ...cur,
          selectedOpts: [...nextSet].sort(),
        },
      };
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingMnemonic || lightboxSrc) return;
      if (e.key === 'ArrowLeft') {
        if (cursor > 0) {
          e.preventDefault();
          goPrev();
        }
        return;
      }
      if (e.key === 'ArrowRight') {
        if (card) {
          e.preventDefault();
          goNext();
        }
        return;
      }
      if (!card) return;

      if ((e.code === 'Space' || e.code === 'Enter') && !revealed) {
        e.preventDefault();
        if (card.cardType === 'mcq') {
          commitMcqReveal(selectedSet);
        } else {
          setRecords((prev) => ({
            ...prev,
            [card.guid]: {
              ...(prev[card.guid] ?? { selectedOpts: [], revealed: false }),
              revealed: true,
            },
          }));
        }
        return;
      }

      if (!revealed && card.cardType === 'mcq' && preparedMcq && mcqEval && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const keyLetter = e.key.trim().toUpperCase();
        if (/^[A-H]$/.test(keyLetter)) {
          const valid = preparedMcq.options.some((opt) => opt.displayLetter === keyLetter);
          if (valid) {
            e.preventDefault();
            if (mcqEval.isMulti) {
              toggleMultiOption(keyLetter);
            } else {
              commitMcqReveal(new Set([keyLetter]));
            }
            return;
          }
        }
      }

      if (revealed && card.cardType !== 'mcq' && !currentRecord.archived) {
        if (e.key === '1') handleManualRate(1);
        if (e.key === '2') handleManualRate(2);
        if (e.key === '3') handleManualRate(3);
        if (e.key === '4') handleManualRate(4);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const modeLabel = mode === 'sprint' ? '考前冲刺' : mode === 'leech' ? '卡壳攻坚' : 'FSRS 复习';

  if (!card) {
    return (
      <div className="card-panel" style={{ textAlign: 'center', padding: '36px 18px' }}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>这一轮已经刷完了</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 18 }}>
          {deckName} · {modeLabel}
        </div>
        <div className="row-wrap" style={{ justifyContent: 'center' }}>
          {queue.length > 0 && (
            <button type="button" className="btn btn-subtle" onClick={goPrev}>
              ← 回到上一题
            </button>
          )}
          <button type="button" className="btn btn-primary" onClick={onExit}>
            返回牌组列表
          </button>
        </div>
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

  const suitMark =
    card.cardType === 'basic'
      ? { glyph: '♥', crimson: true }
      : card.cardType === 'cloze'
        ? { glyph: '♣', crimson: false }
        : mcqEval?.isMulti
          ? { glyph: '♦', crimson: true }
          : { glyph: '♠', crimson: false };

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

      <div
        className="study-swipe-stage"
        onTouchStart={(e) => {
          if (e.touches.length !== 1 || lightboxSrc || editingMnemonic) {
            touchRef.current = null;
            return;
          }
          const t = e.touches[0];
          touchRef.current = { x: t.clientX, y: t.clientY, t: Date.now(), locked: null };
        }}
        onTouchMove={(e) => {
          const st = touchRef.current;
          if (!st || e.touches.length !== 1) return;
          const t = e.touches[0];
          const dx = t.clientX - st.x;
          const dy = t.clientY - st.y;
          if (st.locked === null) {
            if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
            if (Math.abs(dx) > Math.abs(dy) * 1.35) {
              st.locked = 'h';
            } else {
              st.locked = 'v';
              touchRef.current = null;
              return;
            }
          }
          if (st.locked === 'h') {
            const atLeftEdge = cursor === 0 && dx > 0;
            const factor = atLeftEdge ? 0.28 : 1;
            const clamped = Math.max(-140, Math.min(140, dx * factor));
            setDragX(clamped);
          }
        }}
        onTouchEnd={() => {
          const st = touchRef.current;
          if (st && st.locked === 'h') {
            const elapsed = Date.now() - st.t;
            const passed = Math.abs(dragX) >= 58 || (elapsed < 220 && Math.abs(dragX) >= 35);
            if (passed) {
              if (dragX > 0 && cursor > 0) goPrev();
              else if (dragX < 0) goNext();
            }
          }
          touchRef.current = null;
          setDragX(0);
        }}
        onTouchCancel={() => {
          touchRef.current = null;
          setDragX(0);
        }}
      >
        {dragX > 28 && cursor > 0 && (
          <div className="swipe-hint left">← 上一题</div>
        )}
        {dragX < -28 && (
          <div className="swipe-hint right">
            {cursor + 1 >= queue.length ? '完成本轮 →' : '下一题 →'}
          </div>
        )}

        <div
          className="card-panel"
          style={{
            transform: dragX !== 0 ? `translateX(${dragX}px)` : undefined,
            transition: dragX === 0 ? 'transform 0.18s ease-out' : 'none',
          }}
        >
          <span
            className={`card-suit-mark ${suitMark.crimson ? 'crimson' : ''}`}
            aria-hidden="true"
          >
            {suitMark.glyph}
          </span>

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

          {card.cardType === 'mcq' && preparedMcq && mcqEval && (
            <>
              <div className="study-card-prompt">{card.stem}</div>
              {mediaBlock}
              <div className="mcq-list">
                {preparedMcq.options.map((opt) => {
                  const letter = opt.displayLetter;
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
                  const movedLetter =
                    revealed && preparedMcq.shuffled && opt.originalLetter !== opt.displayLetter;
                  return (
                    <button
                      key={`${card.guid}-${opt.displayLetter}-${opt.originalLetter}`}
                      type="button"
                      className={cls}
                      onClick={() => {
                        if (revealed) return;
                        if (mcqEval.isMulti) {
                          toggleMultiOption(letter);
                        } else {
                          commitMcqReveal(new Set([letter]));
                        }
                      }}
                    >
                      {mcqEval.isMulti && (
                        <span className={`mcq-check ${optState}`} aria-hidden="true">
                          {checkChar}
                        </span>
                      )}
                      <span className="mcq-opt-text">{opt.displayText}</span>
                      {movedLetter && (
                        <span className="mcq-orig-tag">原{opt.originalLetter}</span>
                      )}
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
                      onClick={() => commitMcqReveal(selectedSet)}
                    >
                      提交判分（已选 {mcqEval.selectedLetters.join('')}）
                    </button>
                    <button
                      type="button"
                      className="btn btn-subtle"
                      onClick={() =>
                        setRecords((prev) => ({
                          ...prev,
                          [card.guid]: { selectedOpts: [], revealed: false },
                        }))
                      }
                    >
                      清空重选
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    onClick={() => commitMcqReveal(new Set())}
                  >
                    直接显示答案（未勾选）
                  </button>
                )
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  onClick={() => {
                    if (card.cardType === 'mcq') {
                      commitMcqReveal(selectedSet);
                    } else {
                      setRecords((prev) => ({
                        ...prev,
                        [card.guid]: {
                          ...(prev[card.guid] ?? { selectedOpts: [], revealed: false }),
                          revealed: true,
                        },
                      }));
                    }
                  }}
                >
                  显示答案
                </button>
              )}
            </div>
          ) : (
            <>
              <hr className="study-divider" />
              {card.cardType === 'basic' && <div className="study-answer-box">{card.back}</div>}
              {card.cardType === 'mcq' && preparedMcq && mcqEval && (() => {
                const ansSuffix =
                  preparedMcq.shuffled && preparedMcq.answer !== preparedMcq.originalAnswer
                    ? `（原卷 ${preparedMcq.originalAnswer}）`
                    : '';
                if (mcqEval.verdict === 'correct') {
                  return (
                    <div className="study-answer-box">
                      回答正确 · 参考答案：{preparedMcq.answer}{ansSuffix}
                    </div>
                  );
                }
                if (mcqEval.verdict === 'partial') {
                  return (
                    <div className="study-answer-box partial">
                      漏选（已选 {mcqEval.selectedLetters.join('')} / 漏选 {mcqEval.missedLetters.join('')}）· 参考答案：{preparedMcq.answer}{ansSuffix}
                    </div>
                  );
                }
                if (mcqEval.verdict === 'wrong') {
                  return (
                    <div className="study-answer-box wrong">
                      回答有误（已选 {mcqEval.selectedLetters.join('')}）· 参考答案：{preparedMcq.answer}{ansSuffix}
                    </div>
                  );
                }
                return (
                  <div className="study-answer-box">
                    参考答案：{preparedMcq.answer}{ansSuffix}
                  </div>
                );
              })()}

              {currentRecord.archived && (
                <div
                  className={`auto-archive-strip ${currentRecord.archived.rating === 1 ? 'lapsed' : ''}`}
                >
                  <AppleCoinMini size={16} />
                  <span>
                    已按记忆曲线自动归档 · 下次复习：{currentRecord.archived.intervalLabel}（{currentRecord.archived.reason}）
                  </span>
                </div>
              )}

              {card.explanation && (
                <div className="study-info-box">
                  <div className="box-label">解析 / 考点说明</div>
                  {card.explanation}
                </div>
              )}

              <div className="study-mnemonic-box">
                <div className="row-between" style={{ marginBottom: 4 }}>
                  <span className="box-label" style={{ marginBottom: 0 }}>
                    <AppleCoinMini size={14} />
                    <span>记忆法助记</span>
                  </span>
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
      </div>

      {revealed && card.cardType !== 'mcq' && !currentRecord.archived && intervals && (
        <div className="rating-bar">
          <button type="button" className="rate-btn rate-again" onClick={() => handleManualRate(1)}>
            <strong>重来</strong>
            {showIntervals && <span>{intervals[1].label}</span>}
          </button>
          <button type="button" className="rate-btn" onClick={() => handleManualRate(2)}>
            <strong>困难</strong>
            {showIntervals && <span>{intervals[2].label}</span>}
          </button>
          <button type="button" className="rate-btn rate-good" onClick={() => handleManualRate(3)}>
            <strong>良好</strong>
            {showIntervals && <span>{intervals[3].label}</span>}
          </button>
          <button type="button" className="rate-btn" onClick={() => handleManualRate(4)}>
            <strong>简单</strong>
            {showIntervals && <span>{intervals[4].label}</span>}
          </button>
        </div>
      )}

      <div className="study-nav-bar">
        <button
          type="button"
          className="btn btn-sm btn-subtle"
          disabled={cursor === 0}
          onClick={goPrev}
        >
          ← 上一题
        </button>
        <span className="study-nav-tip">左右滑动切题</span>
        <button
          type="button"
          className="btn btn-sm btn-subtle"
          onClick={goNext}
        >
          {cursor + 1 >= queue.length ? '完成本轮 ✓' : '下一题 →'}
        </button>
      </div>

      {lightboxSrc && (
        <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />
      )}
    </>
  );
}
