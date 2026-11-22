export type CardType = 'basic' | 'mcq' | 'cloze';

export type FrequencyTier = 'high' | 'medium' | 'low' | 'supplement';

export type Rating = 1 | 2 | 3 | 4; // 1=Again, 2=Hard, 3=Good, 4=Easy

export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export type StudyMode = 'fsrs' | 'sprint' | 'leech';

export interface FSRSState {
  state: CardState;
  due: number; // epoch ms
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  lastReview: number | null;
  scheduledDays: number;
}

export interface StudyCard {
  guid: string;
  cardId: string;
  deckId: string;
  subdeck: string;
  cardType: CardType;
  conceptKey: string;
  front: string;
  back: string;
  stem: string;
  options: string[];
  answer: string;
  text: string;
  extra: string;
  explanation: string;
  mnemonic: string;
  topic: string;
  frequency: number;
  frequencyTier: FrequencyTier;
  frequencyBadge: string;
  sourceKind: 'past_exam' | 'ppt_supplement';
  sourceYears: string[];
  tags: string[];
  media: string[];
  fsrs: FSRSState;
  isLeech: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface DeckRecord {
  id: string;
  name: string;
  description: string;
  examDate: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewLogEntry {
  id: string;
  guid: string;
  deckId: string;
  rating: Rating;
  elapsedMs: number;
  reviewedAt: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  leechThreshold: number;
  dailyNewLimit: number;
  showIntervals: boolean;
}

export interface ImportResult {
  deck: DeckRecord;
  addedCount: number;
  updatedCount: number;
  mediaCount: number;
}

export interface PendingNativeFile {
  filename: string;
  bytes: Uint8Array;
}
