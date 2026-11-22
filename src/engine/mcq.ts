import type { Rating } from '../types';

export type McqOptionState = 'idle' | 'selected' | 'correct' | 'missed' | 'wrong';

export type McqVerdict = 'unanswered' | 'correct' | 'partial' | 'wrong';

export interface McqEvaluation {
  isMulti: boolean;
  correctLetters: string[];
  selectedLetters: string[];
  missedLetters: string[];
  wrongLetters: string[];
  verdict: McqVerdict;
  getOptionState: (letter: string) => McqOptionState;
}

export interface AutoScheduleDecision {
  rating: Rating;
  reason: string;
}

export interface PreparedMcqOption {
  displayLetter: string;
  originalLetter: string;
  body: string;
  displayText: string;
}

export interface PreparedMcq {
  options: PreparedMcqOption[];
  answer: string;
  originalAnswer: string;
  shuffled: boolean;
}

const POSITIONAL_REF_RE =
  /以上(?:均|都|全|各项|说法|选项)|上述(?:均|都|全|各项|说法|选项)|[A-H]\s*[、和与及]\s*[A-H]\s*(?:均|都|全)/i;

export function extractOptionLetter(opt: string): string {
  const m = /^\s*([A-Ha-h])\s*[.．、:：\)\]]/.exec(opt);
  return m ? m[1].toUpperCase() : opt.trim().slice(0, 1).toUpperCase();
}

export function stripOptionPrefix(opt: string): { letter: string; body: string } {
  const m = /^\s*([A-Ha-h])\s*[.．、:：\)\]]\s*(.*)$/.exec(opt);
  if (m) {
    return { letter: m[1].toUpperCase(), body: m[2].trim() };
  }
  return { letter: extractOptionLetter(opt), body: opt.trim() };
}

export function parseAnswerLetters(answer: string, options: string[] = []): string[] {
  const optionLetters = new Set(
    options.map(extractOptionLetter).filter((l) => /^[A-H]$/.test(l)),
  );
  const upper = answer.trim().toUpperCase();
  if (!upper) return [];

  const compact = upper.replace(/[,，、\s;/+·]+/g, '');
  if (/^[A-H]+$/.test(compact)) {
    const letters = [...new Set(compact.split(''))];
    if (optionLetters.size === 0 || letters.every((l) => optionLetters.has(l))) {
      return letters.sort();
    }
  }

  const standalone = [...upper.matchAll(/\b([A-H])\b/g)].map((m) => m[1]);
  const filtered = optionLetters.size > 0
    ? standalone.filter((l) => optionLetters.has(l))
    : standalone;
  return [...new Set(filtered)].sort();
}

export function isMultiSelectMcq(answer: string, options: string[] = []): boolean {
  return parseAnswerLetters(answer, options).length > 1;
}

export function evaluateMcq(
  selected: ReadonlySet<string>,
  answer: string,
  options: string[],
  revealed: boolean,
): McqEvaluation {
  const correctLetters = parseAnswerLetters(answer, options);
  const correctSet = new Set(correctLetters);
  const isMulti = correctLetters.length > 1;

  const selectedLetters = [...selected]
    .map((s) => s.trim().toUpperCase())
    .filter((s) => /^[A-H]$/.test(s))
    .sort();
  const selectedSet = new Set(selectedLetters);

  const missedLetters = correctLetters.filter((l) => !selectedSet.has(l));
  const wrongLetters = selectedLetters.filter((l) => !correctSet.has(l));

  let verdict: McqVerdict = 'unanswered';
  if (selectedSet.size > 0) {
    if (wrongLetters.length === 0 && missedLetters.length === 0) {
      verdict = 'correct';
    } else if (isMulti && wrongLetters.length === 0 && missedLetters.length > 0) {
      verdict = 'partial';
    } else {
      verdict = 'wrong';
    }
  }

  const getOptionState = (letter: string): McqOptionState => {
    const key = letter.trim().toUpperCase();
    const isCorrect = correctSet.has(key);
    const isPicked = selectedSet.has(key);

    if (!revealed) {
      return isPicked ? 'selected' : 'idle';
    }
    if (isCorrect && isPicked) {
      return 'correct';
    }
    if (isCorrect && !isPicked) {
      return isMulti && selectedSet.size > 0 ? 'missed' : 'correct';
    }
    if (!isCorrect && isPicked) {
      return 'wrong';
    }
    return 'idle';
  };

  return {
    isMulti,
    correctLetters,
    selectedLetters,
    missedLetters,
    wrongLetters,
    verdict,
    getOptionState,
  };
}

export function decideAutoMcqRating(
  verdict: McqVerdict,
  isMulti: boolean,
  elapsedMs: number,
): AutoScheduleDecision {
  if (verdict === 'correct') {
    const fastCutoff = isMulti ? 15_000 : 8_000;
    const goodCutoff = isMulti ? 45_000 : 25_000;
    if (elapsedMs <= fastCutoff) {
      return { rating: 4, reason: '熟练秒选' };
    }
    if (elapsedMs <= goodCutoff) {
      return { rating: 3, reason: '准确掌握' };
    }
    return { rating: 2, reason: '耗时偏长 · 巩固记忆' };
  }
  if (verdict === 'partial') {
    return { rating: 2, reason: '多选漏项 · 缩短间隔巩固' };
  }
  if (verdict === 'wrong') {
    return { rating: 1, reason: '答错 · 短期重测' };
  }
  return { rating: 1, reason: '未作答 · 短期重测' };
}

function fnv1aHash(seedKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedKey.length; i += 1) {
    h ^= seedKey.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function seededNext(state: number): [number, number] {
  const next = (state + 0x6d2b79f5) >>> 0;
  let t = Math.imul(next ^ (next >>> 15), 1 | next);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, next];
}

export function prepareMcqOptions(
  rawOptions: string[],
  rawAnswer: string,
  shuffle: boolean,
  seedKey: string,
): PreparedMcq {
  const parsed = rawOptions.map((raw, idx) => {
    const { letter, body } = stripOptionPrefix(raw);
    const fallbackLetter = String.fromCharCode(65 + (idx % 26));
    const originalLetter = /^[A-H]$/.test(letter) ? letter : fallbackLetter;
    return {
      originalLetter,
      body,
      raw,
    };
  });

  const origLettersList = parsed.map((p) => `${p.originalLetter}. ${p.body}`);
  const origAnswerLetters = parseAnswerLetters(rawAnswer, origLettersList);
  const originalAnswer = origAnswerLetters.length > 0 ? origAnswerLetters.join('') : rawAnswer.trim().toUpperCase();

  const blockedByPositionalRef = parsed.some((p) => POSITIONAL_REF_RE.test(p.body));
  if (!shuffle || parsed.length < 2 || blockedByPositionalRef) {
    return {
      options: parsed.map((p) => ({
        displayLetter: p.originalLetter,
        originalLetter: p.originalLetter,
        body: p.body,
        displayText: `${p.originalLetter}. ${p.body}`,
      })),
      answer: originalAnswer,
      originalAnswer,
      shuffled: false,
    };
  }

  const permuted = [...parsed];
  let prngState = fnv1aHash(seedKey);
  for (let i = permuted.length - 1; i > 0; i -= 1) {
    const [r, nextState] = seededNext(prngState);
    prngState = nextState;
    const j = Math.floor(r * (i + 1));
    [permuted[i], permuted[j]] = [permuted[j], permuted[i]];
  }

  const letterMap = new Map<string, string>();
  const preparedOptions: PreparedMcqOption[] = permuted.map((item, idx) => {
    const displayLetter = String.fromCharCode(65 + (idx % 26));
    letterMap.set(item.originalLetter, displayLetter);
    return {
      displayLetter,
      originalLetter: item.originalLetter,
      body: item.body,
      displayText: `${displayLetter}. ${item.body}`,
    };
  });

  const remappedAnswer = origAnswerLetters.length > 0
    ? origAnswerLetters
        .map((orig) => letterMap.get(orig) ?? orig)
        .sort()
        .join('')
    : originalAnswer;

  return {
    options: preparedOptions,
    answer: remappedAnswer,
    originalAnswer,
    shuffled: true,
  };
}
