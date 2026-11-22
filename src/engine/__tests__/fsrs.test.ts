import { describe, expect, it } from 'vitest';

import {
  buildStudyQueue,
  computeExamPace,
  createInitialFSRS,
  previewIntervals,
  scheduleCard,
  scheduleCardWithPreview,
} from '../fsrs';
import type { StudyCard } from '../../types';

function makeCard(overrides: Partial<StudyCard> = {}): StudyCard {
  const now = 1_700_000_000_000;
  return {
    guid: 'guid-1',
    cardId: 'card-1',
    deckId: 'deck-1',
    subdeck: '',
    cardType: 'basic',
    conceptKey: 'concept-1',
    front: 'Front?',
    back: 'Back',
    stem: '',
    options: [],
    answer: '',
    text: '',
    extra: '',
    explanation: '',
    mnemonic: '',
    topic: 'Anatomy',
    frequency: 1,
    frequencyTier: 'low',
    frequencyBadge: '真题 · 1次',
    sourceKind: 'past_exam',
    sourceYears: ['2024'],
    tags: [],
    media: [],
    fsrs: createInitialFSRS(now),
    isLeech: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('FSRS-5 scheduler & queue prioritization', () => {
  it('previews progressive intervals and promotes new cards to review', () => {
    const t0 = 1_700_000_000_000;
    const base = makeCard();
    const preview = previewIntervals(base.fsrs, t0);
    expect(preview[1].label).toBe('<10分钟');
    expect(preview[3].next.state).toBe('review');
    expect(preview[3].next.scheduledDays).toBeGreaterThanOrEqual(1);
    expect(preview[4].next.scheduledDays).toBeGreaterThanOrEqual(preview[3].next.scheduledDays);
  });

  it('tracks lapses on review failure and auto-flags leech at threshold', () => {
    const t0 = 1_700_000_000_000;
    let card = makeCard();
    card = scheduleCard(card, 3, t0, 3);
    expect(card.fsrs.state).toBe('review');
    expect(card.isLeech).toBe(false);

    // Fail 3 review cycles -> lapses reaches 3 -> auto leech
    for (let i = 0; i < 3; i += 1) {
      const ti = t0 + (i + 1) * 86_400_000;
      card = scheduleCard(card, 1, ti, 3); // Again -> relearning, lapses++
      if (i < 2) {
        card = scheduleCard(card, 3, ti + 600_000, 3); // back to review
      }
    }
    expect(card.fsrs.lapses).toBe(3);
    expect(card.isLeech).toBe(true);
    expect(card.tags).toContain('leech');
  });

  it('sorts sprint queue strictly by past-exam frequency tier and supports leech queue', () => {
    const cards = [
      makeCard({ guid: 'g-supp', cardId: 'c4', frequencyTier: 'supplement', sourceKind: 'ppt_supplement', frequency: 1 }),
      makeCard({ guid: 'g-low', cardId: 'c3', frequencyTier: 'low', frequency: 1 }),
      makeCard({ guid: 'g-high', cardId: 'c1', frequencyTier: 'high', frequency: 5, isLeech: true, fsrs: { ...createInitialFSRS(), lapses: 4 } }),
      makeCard({ guid: 'g-med', cardId: 'c2', frequencyTier: 'medium', frequency: 2 }),
    ];

    const sprint = buildStudyQueue(cards, 'sprint');
    expect(sprint.map((c) => c.cardId)).toEqual(['c1', 'c2', 'c3', 'c4']);

    const highOnly = buildStudyQueue(cards, 'sprint', { tierFilter: 'high' });
    expect(highOnly.map((c) => c.cardId)).toEqual(['c1']);

    const leeches = buildStudyQueue(cards, 'leech');
    expect(leeches.map((c) => c.cardId)).toEqual(['c1']);
  });

  it('computes exam pace based on unmastered cards and days remaining', () => {
    const now = Date.parse('2026-06-01T08:00:00Z');
    const cards = [
      makeCard({ guid: '1' }),
      makeCard({ guid: '2' }),
      makeCard({ guid: '3', fsrs: { ...createInitialFSRS(now), state: 'review', scheduledDays: 14 } }),
    ];
    const pace = computeExamPace(cards, '2026-06-05', now);
    expect(pace.unmasteredCount).toBe(2);
    expect(pace.daysLeft).toBeGreaterThanOrEqual(4);
    expect(pace.suggestedDaily).toBe(1);
  });

  it('supports seeded question shuffling across fsrs, sprint (within tiers), and leech modes', () => {
    const now = 1_700_000_000_000;
    const cards: StudyCard[] = Array.from({ length: 12 }, (_, idx) =>
      makeCard({
        guid: `guid-${idx + 1}`,
        cardId: `q-${String(idx + 1).padStart(2, '0')}`,
        frequencyTier: idx < 4 ? 'high' : idx < 8 ? 'medium' : 'low',
        frequency: idx < 4 ? 5 : idx < 8 ? 2 : 1,
        isLeech: idx >= 8,
        fsrs: {
          ...createInitialFSRS(now),
          lapses: idx >= 8 ? idx : 0,
        },
      }),
    );

    const fsrsOrdered = buildStudyQueue(cards, 'fsrs', { nowMs: now, dailyNewLimit: 4, shuffle: false });
    expect(fsrsOrdered.map((c) => c.cardId)).toEqual(['q-01', 'q-02', 'q-03', 'q-04']);

    // FSRS with shuffle=true samples across the entire new pool before dailyNewLimit slicing
    const fsrsShuffled = buildStudyQueue(cards, 'fsrs', {
      nowMs: now,
      dailyNewLimit: 4,
      shuffle: true,
      seed: 20261122,
    });
    expect(fsrsShuffled).toHaveLength(4);
    expect(fsrsShuffled.map((c) => c.cardId)).not.toEqual(['q-01', 'q-02', 'q-03', 'q-04']);

    // Sprint with shuffle=true keeps tier ordering (all high before medium before low) while shuffling within tiers
    const sprintShuffled = buildStudyQueue(cards, 'sprint', {
      nowMs: now,
      shuffle: true,
      seed: 20261122,
    });
    expect(sprintShuffled.slice(0, 4).every((c) => c.frequencyTier === 'high')).toBe(true);
    expect(sprintShuffled.slice(4, 8).every((c) => c.frequencyTier === 'medium')).toBe(true);
    expect(sprintShuffled.slice(8, 12).every((c) => c.frequencyTier === 'low')).toBe(true);
    expect(sprintShuffled.map((c) => c.cardId)).not.toEqual(cards.map((c) => c.cardId));

    // scheduleCardWithPreview returns updated card and non-empty interval label
    const rated = scheduleCardWithPreview(cards[0], 3, now, 3);
    expect(rated.card.fsrs.state).toBe('review');
    expect(rated.label).toContain('天');
  });
});
