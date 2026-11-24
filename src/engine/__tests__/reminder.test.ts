import { describe, expect, it } from 'vitest';

import { DEFAULT_SETTINGS } from '../../storage/db';
import type { DeckRecord, StudyCard } from '../../types';
import { createInitialFSRS } from '../fsrs';
import {
  adjustForQuietHours,
  buildReminderPayload,
  formatReminderDateTime,
  parseReminderTime,
} from '../reminder';

function makeDeck(id: string, name: string): DeckRecord {
  return { id, name, description: '', examDate: null, createdAt: 1000, updatedAt: 1000 };
}

function makeCard(
  guid: string,
  deckId: string,
  overrides: Partial<StudyCard> = {},
): StudyCard {
  const now = 1_700_000_000_000;
  return {
    guid,
    cardId: guid,
    deckId,
    subdeck: '',
    cardType: 'mcq',
    conceptKey: guid,
    front: '',
    back: '',
    stem: 'Q?',
    options: ['A. 1', 'B. 2'],
    answer: 'A',
    text: '',
    extra: '',
    explanation: '',
    mnemonic: '',
    topic: '',
    frequency: 1,
    frequencyTier: 'high',
    frequencyBadge: '',
    sourceKind: 'past_exam',
    sourceYears: [],
    tags: [],
    media: [],
    fsrs: createInitialFSRS(now),
    isLeech: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('Review reminder scheduler & quiet hours', () => {
  it('parses valid, out-of-range clamped, and malformed reminder times', () => {
    expect(parseReminderTime('09:15')).toEqual({ hour: 9, minute: 15 });
    expect(parseReminderTime('29:75')).toEqual({ hour: 23, minute: 59 });
    expect(parseReminderTime('')).toEqual({ hour: 20, minute: 30 });
    expect(parseReminderTime('invalid')).toEqual({ hour: 20, minute: 30 });
  });

  it('defers quiet-hour FSRS reminders to 08:30 while preserving daytime windows', () => {
    const daytime = new Date(2026, 10, 24, 14, 20, 0, 0).getTime();
    expect(adjustForQuietHours(daytime)).toBe(daytime);

    const lateNight = new Date(2026, 10, 24, 23, 30, 0, 0).getTime();
    const expectedNextMorning = new Date(2026, 10, 25, 8, 30, 0, 0).getTime();
    expect(adjustForQuietHours(lateNight)).toBe(expectedNextMorning);

    const earlyMorning = new Date(2026, 10, 24, 3, 15, 0, 0).getTime();
    const expectedSameMorning = new Date(2026, 10, 24, 8, 30, 0, 0).getTime();
    expect(adjustForQuietHours(earlyMorning)).toBe(expectedSameMorning);
  });

  it('builds due/new/leech payload, picks active deck, enforces 15m cooldown, and honors toggle', () => {
    const now = new Date(2026, 10, 24, 15, 0, 0, 0).getTime();
    const decks = [makeDeck('d1', '心电图100题'), makeDeck('d2', '病理')];
    const cards: StudyCard[] = [
      makeCard('c1', 'd1', {
        isLeech: true,
        fsrs: { ...createInitialFSRS(now), state: 'review', due: now - 60_000, lapses: 3 },
      }),
      makeCard('c2', 'd1', {
        fsrs: { ...createInitialFSRS(now), state: 'learning', due: now + 5 * 60_000 },
      }),
      makeCard('c3', 'd2', {
        fsrs: { ...createInitialFSRS(now), state: 'new', due: now },
      }),
    ];

    const payload = buildReminderPayload(
      cards,
      decks,
      { ...DEFAULT_SETTINGS, reminderEnabled: true, reminderTime: '21:15', smartDueReminder: true },
      now,
    );
    expect(payload.enabled).toBe(true);
    expect(payload.hour).toBe(21);
    expect(payload.minute).toBe(15);
    expect(payload.dueCount).toBe(1);
    expect(payload.newCount).toBe(1);
    expect(payload.leechCount).toBe(1);
    expect(payload.deckName).toBe('心电图100题');
    // Earliest future due (now + 5m) gets clamped up to 15m cooldown
    expect(payload.nextDueAtMs).toBe(now + 15 * 60_000);
    expect(formatReminderDateTime(payload.nextDueAtMs!)).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/);

    const noSmart = buildReminderPayload(
      cards,
      decks,
      { ...DEFAULT_SETTINGS, smartDueReminder: false },
      now,
    );
    expect(noSmart.nextDueAtMs).toBeNull();
  });
});
