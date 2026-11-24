import type { AppSettings, DeckRecord, ReviewReminderPayload, StudyCard } from '../types';

const QUIET_MIN_MS = 15 * 60_000;

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.trunc(n)));
}

export function parseReminderTime(hhmm: string): { hour: number; minute: number } {
  const m = /^\s*(\d{1,2})\s*:\s*(\d{1,2})\s*$/.exec(hhmm || '');
  if (!m) {
    return { hour: 20, minute: 30 };
  }
  return {
    hour: clampInt(Number(m[1]), 0, 23),
    minute: clampInt(Number(m[2]), 0, 59),
  };
}

export function adjustForQuietHours(epochMs: number): number {
  const d = new Date(epochMs);
  const minsOfDay = d.getHours() * 60 + d.getMinutes();
  if (minsOfDay >= 23 * 60) {
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    next.setHours(8, 30, 0, 0);
    return next.getTime();
  }
  if (minsOfDay < 7 * 60 + 30) {
    const same = new Date(d);
    same.setHours(8, 30, 0, 0);
    return same.getTime();
  }
  return epochMs;
}

export function buildReminderPayload(
  cards: StudyCard[],
  decks: DeckRecord[],
  settings: AppSettings,
  nowMs = Date.now(),
): ReviewReminderPayload {
  const { hour, minute } = parseReminderTime(settings.reminderTime);
  const dueCards = cards.filter((c) => c.fsrs.state !== 'new' && c.fsrs.due <= nowMs);
  const dueCount = dueCards.length;
  const totalNew = cards.filter((c) => c.fsrs.state === 'new').length;
  const newCount = Math.min(Math.max(0, settings.dailyNewLimit), totalNew);
  const leechCount = cards.filter(
    (c) => c.isLeech || c.fsrs.lapses >= settings.leechThreshold,
  ).length;

  const deckScores = new Map<string, number>();
  for (const c of cards) {
    if (c.fsrs.state !== 'new') {
      deckScores.set(c.deckId, (deckScores.get(c.deckId) ?? 0) + (c.fsrs.due <= nowMs ? 3 : 1));
    }
  }

  let pickedDeck = decks[0] ?? null;
  let bestScore = -1;
  for (const deck of decks) {
    const sc = deckScores.get(deck.id) ?? 0;
    if (sc > bestScore) {
      bestScore = sc;
      pickedDeck = deck;
    }
  }
  const deckName = pickedDeck?.name || '玖记';

  let nextDueAtMs: number | null = null;
  if (settings.smartDueReminder) {
    let earliestDue: number | null = null;
    for (const c of cards) {
      if (c.fsrs.state !== 'new' && c.fsrs.due > nowMs) {
        if (earliestDue === null || c.fsrs.due < earliestDue) {
          earliestDue = c.fsrs.due;
        }
      }
    }
    if (earliestDue !== null) {
      const target = Math.max(earliestDue, nowMs + QUIET_MIN_MS);
      nextDueAtMs = adjustForQuietHours(target);
    }
  }

  return {
    enabled: settings.reminderEnabled,
    hour,
    minute,
    smartDueEnabled: settings.smartDueReminder,
    dueCount,
    newCount,
    leechCount,
    deckName,
    nextDueAtMs,
  };
}

export function formatReminderDateTime(epochMs: number): string {
  const d = new Date(epochMs);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}
