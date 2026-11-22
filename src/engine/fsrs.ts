import type { CardState, FrequencyTier, FSRSState, Rating, StudyCard, StudyMode } from '../types';

// Standard FSRS-5 default 19 parameters
const W = [
  0.40255, 1.18385, 3.173, 15.69105,
  7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395,
  0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621,
] as const;

const DECAY = -0.5;
const FACTOR = 19 / 81;
const REQUEST_RETENTION = 0.9;
const MINUTE_MS = 60_000;
const DAY_MS = 86_400_000;

const TIER_RANK: Record<FrequencyTier, number> = {
  high: 0,
  medium: 1,
  low: 2,
  supplement: 3,
};

function clamp(val: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, val));
}

function initStability(rating: Rating): number {
  return Math.max(0.1, W[rating - 1]);
}

function initDifficulty(rating: Rating): number {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10);
}

function nextIntervalDays(stability: number, retention = REQUEST_RETENTION): number {
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  return Math.max(1, Math.round(raw));
}

function forgettingCurve(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0.9;
  return Math.pow(1 + FACTOR * (elapsedDays / stability), DECAY);
}

function nextDifficulty(d: number, rating: Rating): number {
  const deltaD = -W[6] * (rating - 3);
  const dNext = d + deltaD * ((10 - d) / 9);
  const meanRev = W[7] * initDifficulty(4) + (1 - W[7]) * dNext;
  return clamp(meanRev, 1, 10);
}

function nextRecallStability(d: number, s: number, r: number, rating: Rating): number {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  const factor =
    1 +
    Math.exp(W[8]) *
      (11 - d) *
      Math.pow(s, -W[9]) *
      (Math.exp((1 - r) * W[10]) - 1) *
      hardPenalty *
      easyBonus;
  return Math.max(0.1, s * factor);
}

function nextForgetStability(d: number, s: number, r: number): number {
  const next =
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(s + 1, W[13]) - 1) *
    Math.exp((1 - r) * W[14]);
  return clamp(next, 0.1, s);
}

export function createInitialFSRS(nowMs = Date.now()): FSRSState {
  return {
    state: 'new',
    due: nowMs,
    stability: 0,
    difficulty: 0,
    reps: 0,
    lapses: 0,
    lastReview: null,
    scheduledDays: 0,
  };
}

export function formatIntervalLabel(scheduledDays: number, minutesFallback = 10): string {
  if (scheduledDays <= 0) {
    return minutesFallback < 10 ? `<${minutesFallback}分钟` : `${minutesFallback}分钟`;
  }
  if (scheduledDays < 7) {
    return `${scheduledDays}天`;
  }
  if (scheduledDays < 30) {
    const weeks = Math.round((scheduledDays / 7) * 10) / 10;
    return `${weeks}周`;
  }
  if (scheduledDays < 365) {
    const months = Math.round((scheduledDays / 30) * 10) / 10;
    return `${months}月`;
  }
  const years = Math.round((scheduledDays / 365) * 10) / 10;
  return `${years}年`;
}

function computeNextFSRS(fsrs: FSRSState, rating: Rating, nowMs: number): { next: FSRSState; label: string } {
  const elapsedDays = fsrs.lastReview ? Math.max(0, (nowMs - fsrs.lastReview) / DAY_MS) : 0;
  const reps = fsrs.reps + 1;
  let lapses = fsrs.lapses;
  let state: CardState = fsrs.state;
  let stability = fsrs.stability;
  let difficulty = fsrs.difficulty;
  let scheduledDays = 0;
  let due = nowMs;
  let label = '10分钟';

  if (fsrs.state === 'new') {
    stability = initStability(rating);
    difficulty = initDifficulty(rating);
    if (rating === 1) {
      state = 'learning';
      due = nowMs + 5 * MINUTE_MS;
      label = '<10分钟';
    } else if (rating === 2) {
      state = 'learning';
      due = nowMs + 10 * MINUTE_MS;
      label = '10分钟';
    } else if (rating === 3) {
      state = 'review';
      scheduledDays = nextIntervalDays(stability);
      due = nowMs + scheduledDays * DAY_MS;
      label = formatIntervalLabel(scheduledDays);
    } else {
      state = 'review';
      scheduledDays = Math.max(2, nextIntervalDays(stability));
      due = nowMs + scheduledDays * DAY_MS;
      label = formatIntervalLabel(scheduledDays);
    }
  } else if (fsrs.state === 'learning' || fsrs.state === 'relearning') {
    if (rating === 1) {
      if (fsrs.reps >= 2 || fsrs.state === 'relearning') {
        lapses += 1;
      }
      stability = Math.max(0.1, stability || initStability(1));
      difficulty = difficulty ? nextDifficulty(difficulty, rating) : initDifficulty(1);
      state = fsrs.state;
      due = nowMs + 5 * MINUTE_MS;
      label = '<10分钟';
    } else if (rating === 2) {
      stability = Math.max(0.2, stability || initStability(2));
      difficulty = difficulty ? nextDifficulty(difficulty, rating) : initDifficulty(2);
      state = fsrs.state;
      due = nowMs + 10 * MINUTE_MS;
      label = '10分钟';
    } else {
      const r = forgettingCurve(elapsedDays, Math.max(0.2, stability || 1));
      stability = stability > 0 ? nextRecallStability(difficulty || 5, stability, r, rating) : initStability(rating);
      difficulty = difficulty ? nextDifficulty(difficulty, rating) : initDifficulty(rating);
      state = 'review';
      scheduledDays = nextIntervalDays(stability);
      if (rating === 4) {
        scheduledDays = Math.max(scheduledDays, 3);
      }
      due = nowMs + scheduledDays * DAY_MS;
      label = formatIntervalLabel(scheduledDays);
    }
  } else {
    // 'review'
    const r = forgettingCurve(elapsedDays, Math.max(0.1, stability));
    difficulty = nextDifficulty(difficulty || 5, rating);
    if (rating === 1) {
      lapses += 1;
      stability = nextForgetStability(difficulty, Math.max(0.2, stability), r);
      state = 'relearning';
      due = nowMs + 5 * MINUTE_MS;
      label = '<10分钟';
    } else {
      stability = nextRecallStability(difficulty, Math.max(0.2, stability), r, rating);
      state = 'review';
      scheduledDays = nextIntervalDays(stability);
      if (rating === 3 && scheduledDays <= fsrs.scheduledDays) {
        scheduledDays = fsrs.scheduledDays + 1;
      }
      if (rating === 4) {
        scheduledDays = Math.max(scheduledDays, fsrs.scheduledDays + 2);
      }
      due = nowMs + scheduledDays * DAY_MS;
      label = formatIntervalLabel(scheduledDays);
    }
  }

  return {
    next: {
      state,
      due,
      stability: Math.round(stability * 1000) / 1000,
      difficulty: Math.round(difficulty * 1000) / 1000,
      reps,
      lapses,
      lastReview: nowMs,
      scheduledDays,
    },
    label,
  };
}

export function previewIntervals(
  fsrs: FSRSState,
  nowMs = Date.now(),
): Record<Rating, { next: FSRSState; label: string }> {
  return {
    1: computeNextFSRS(fsrs, 1, nowMs),
    2: computeNextFSRS(fsrs, 2, nowMs),
    3: computeNextFSRS(fsrs, 3, nowMs),
    4: computeNextFSRS(fsrs, 4, nowMs),
  };
}

export function scheduleCard(
  card: StudyCard,
  rating: Rating,
  nowMs = Date.now(),
  leechThreshold = 3,
): StudyCard {
  const { next } = computeNextFSRS(card.fsrs, rating, nowMs);
  const becameLeech = card.isLeech || next.lapses >= leechThreshold;
  const tags = [...card.tags];
  if (becameLeech && !tags.includes('leech')) {
    tags.push('leech');
  }
  return {
    ...card,
    fsrs: next,
    isLeech: becameLeech,
    tags,
    updatedAt: nowMs,
  };
}

function comparePriority(a: StudyCard, b: StudyCard): number {
  const srcA = a.sourceKind === 'past_exam' ? 0 : 1;
  const srcB = b.sourceKind === 'past_exam' ? 0 : 1;
  if (srcA !== srcB) return srcA - srcB;

  const tierDiff = TIER_RANK[a.frequencyTier] - TIER_RANK[b.frequencyTier];
  if (tierDiff !== 0) return tierDiff;

  if (a.frequency !== b.frequency) return b.frequency - a.frequency;
  return a.cardId.localeCompare(b.cardId);
}

export function buildStudyQueue(
  cards: StudyCard[],
  mode: StudyMode,
  opts: {
    nowMs?: number;
    dailyNewLimit?: number;
    tierFilter?: FrequencyTier | 'all';
    topicFilter?: string;
    leechThreshold?: number;
  } = {},
): StudyCard[] {
  const nowMs = opts.nowMs ?? Date.now();
  const dailyNewLimit = opts.dailyNewLimit ?? 30;
  const tierFilter = opts.tierFilter ?? 'all';
  const topicFilter = (opts.topicFilter ?? '').trim().toLowerCase();
  const leechThreshold = opts.leechThreshold ?? 3;

  const filtered = cards.filter((c) => {
    if (tierFilter !== 'all' && c.frequencyTier !== tierFilter) return false;
    if (topicFilter && !c.topic.toLowerCase().includes(topicFilter)) return false;
    return true;
  });

  if (mode === 'leech') {
    return filtered
      .filter((c) => c.isLeech || c.fsrs.lapses >= leechThreshold)
      .sort((a, b) => b.fsrs.lapses - a.fsrs.lapses || comparePriority(a, b));
  }

  if (mode === 'sprint') {
    return [...filtered].sort((a, b) => {
      const p = comparePriority(a, b);
      if (p !== 0) return p;
      if (a.fsrs.lapses !== b.fsrs.lapses) return b.fsrs.lapses - a.fsrs.lapses;
      return a.fsrs.stability - b.fsrs.stability;
    });
  }

  // Standard FSRS queue: due learning/review first, then priority-sorted new cards up to dailyNewLimit
  const dueCards = filtered
    .filter((c) => c.fsrs.state !== 'new' && c.fsrs.due <= nowMs)
    .sort((a, b) => a.fsrs.due - b.fsrs.due || comparePriority(a, b));

  const newCards = filtered
    .filter((c) => c.fsrs.state === 'new')
    .sort(comparePriority)
    .slice(0, Math.max(0, dailyNewLimit));

  return [...dueCards, ...newCards];
}

export function computeExamPace(
  cards: StudyCard[],
  examDateIso: string | null,
  nowMs = Date.now(),
): { daysLeft: number | null; unmasteredCount: number; suggestedDaily: number } {
  const unmasteredCount = cards.filter(
    (c) => c.fsrs.state === 'new' || c.fsrs.scheduledDays < 7,
  ).length;
  if (!examDateIso) {
    return { daysLeft: null, unmasteredCount, suggestedDaily: Math.min(30, unmasteredCount) };
  }
  const targetMs = Date.parse(`${examDateIso}T23:59:59`);
  if (!Number.isFinite(targetMs)) {
    return { daysLeft: null, unmasteredCount, suggestedDaily: Math.min(30, unmasteredCount) };
  }
  const daysLeft = Math.max(1, Math.ceil((targetMs - nowMs) / DAY_MS));
  const suggestedDaily = unmasteredCount === 0 ? 0 : Math.ceil(unmasteredCount / daysLeft);
  return { daysLeft, unmasteredCount, suggestedDaily };
}
