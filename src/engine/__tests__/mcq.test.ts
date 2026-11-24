import { describe, expect, it } from 'vitest';

import {
  decideAutoMcqRating,
  evaluateMcq,
  extractOptionLetter,
  isMultiSelectMcq,
  parseAnswerLetters,
  prepareMcqOptions,
} from '../mcq';

const SAMPLE_OPTIONS = [
  'A. 左室高电压',
  'B. QRS波群增宽',
  'C. 继发性ST-T改变',
  'D. 心电轴左偏',
];

describe('MCQ multi-select helpers', () => {
  it('extracts normalized option letters across punctuation styles', () => {
    expect(extractOptionLetter('a. 测试')).toBe('A');
    expect(extractOptionLetter(' B．双分支阻滞')).toBe('B');
    expect(extractOptionLetter('c、电轴右偏')).toBe('C');
    expect(extractOptionLetter('D: 病理性Q波')).toBe('D');
  });

  it('parses single and multi-select answer formats cleanly', () => {
    expect(parseAnswerLetters('B', SAMPLE_OPTIONS)).toEqual(['B']);
    expect(parseAnswerLetters('BCD', SAMPLE_OPTIONS)).toEqual(['B', 'C', 'D']);
    expect(parseAnswerLetters('d, a, b', SAMPLE_OPTIONS)).toEqual(['A', 'B', 'D']);
    expect(parseAnswerLetters('A、B、C、D', SAMPLE_OPTIONS)).toEqual(['A', 'B', 'C', 'D']);
    // Non-letter explanatory text without matching option letters should safely yield []
    expect(parseAnswerLetters('该患者考虑心肌梗死', SAMPLE_OPTIONS)).toEqual([]);
  });

  it('distinguishes single-choice vs multi-choice questions', () => {
    expect(isMultiSelectMcq('D', SAMPLE_OPTIONS)).toBe(false);
    expect(isMultiSelectMcq('BCD', SAMPLE_OPTIONS)).toBe(true);
    expect(isMultiSelectMcq('ABCD', SAMPLE_OPTIONS)).toBe(true);
  });

  it('tracks pre-reveal single-choice selection cleanly before post-submit grading', () => {
    const first = evaluateMcq(new Set(['A']), 'B', SAMPLE_OPTIONS, false);
    expect(first.isMulti).toBe(false);
    expect(first.getOptionState('A')).toBe('selected');
    expect(first.getOptionState('B')).toBe('idle');

    // Switching pick to B before submit marks only B selected, without grading early
    const switched = evaluateMcq(new Set(['B']), 'B', SAMPLE_OPTIONS, false);
    expect(switched.getOptionState('A')).toBe('idle');
    expect(switched.getOptionState('B')).toBe('selected');
  });

  it('tracks pre-reveal toggles for multi-select without grading prematurely', () => {
    const ev = evaluateMcq(new Set(['A', 'C']), 'ACD', SAMPLE_OPTIONS, false);
    expect(ev.isMulti).toBe(true);
    expect(ev.getOptionState('A')).toBe('selected');
    expect(ev.getOptionState('B')).toBe('idle');
    expect(ev.getOptionState('C')).toBe('selected');
    expect(ev.getOptionState('D')).toBe('idle');
  });

  it('grades exact multi-select match as correct', () => {
    const ev = evaluateMcq(new Set(['A', 'C', 'D']), 'ACD', SAMPLE_OPTIONS, true);
    expect(ev.verdict).toBe('correct');
    expect(ev.missedLetters).toEqual([]);
    expect(ev.wrongLetters).toEqual([]);
    expect(ev.getOptionState('A')).toBe('correct');
    expect(ev.getOptionState('B')).toBe('idle');
    expect(ev.getOptionState('C')).toBe('correct');
    expect(ev.getOptionState('D')).toBe('correct');
  });

  it('grades missing option without wrong picks as partial + marks missed', () => {
    const ev = evaluateMcq(new Set(['A', 'D']), 'ACD', SAMPLE_OPTIONS, true);
    expect(ev.verdict).toBe('partial');
    expect(ev.missedLetters).toEqual(['C']);
    expect(ev.wrongLetters).toEqual([]);
    expect(ev.getOptionState('A')).toBe('correct');
    expect(ev.getOptionState('C')).toBe('missed');
    expect(ev.getOptionState('D')).toBe('correct');
  });

  it('grades wrong selection as wrong and flags missed + wrong options separately', () => {
    const ev = evaluateMcq(new Set(['A', 'B']), 'ACD', SAMPLE_OPTIONS, true);
    expect(ev.verdict).toBe('wrong');
    expect(ev.missedLetters).toEqual(['C', 'D']);
    expect(ev.wrongLetters).toEqual(['B']);
    expect(ev.getOptionState('A')).toBe('correct');
    expect(ev.getOptionState('B')).toBe('wrong');
    expect(ev.getOptionState('C')).toBe('missed');
    expect(ev.getOptionState('D')).toBe('missed');
  });

  it('handles direct reveal with zero picks cleanly', () => {
    const ev = evaluateMcq(new Set(), 'BCD', SAMPLE_OPTIONS, true);
    expect(ev.verdict).toBe('unanswered');
    expect(ev.getOptionState('A')).toBe('idle');
    expect(ev.getOptionState('B')).toBe('correct');
    expect(ev.getOptionState('C')).toBe('correct');
    expect(ev.getOptionState('D')).toBe('correct');
  });

  it('grades single-select right and wrong properly', () => {
    const right = evaluateMcq(new Set(['B']), 'B', SAMPLE_OPTIONS, true);
    expect(right.isMulti).toBe(false);
    expect(right.verdict).toBe('correct');
    expect(right.getOptionState('B')).toBe('correct');

    const wrong = evaluateMcq(new Set(['A']), 'B', SAMPLE_OPTIONS, true);
    expect(wrong.verdict).toBe('wrong');
    expect(wrong.getOptionState('A')).toBe('wrong');
    expect(wrong.getOptionState('B')).toBe('correct');
  });

  it('auto-schedules MCQ ratings by verdict, single/multi complexity, and response time', () => {
    expect(decideAutoMcqRating('correct', false, 4500)).toEqual({ rating: 4, reason: '熟练秒选' });
    expect(decideAutoMcqRating('correct', false, 14_000)).toEqual({ rating: 3, reason: '准确掌握' });
    expect(decideAutoMcqRating('correct', false, 35_000)).toEqual({ rating: 2, reason: '耗时偏长 · 巩固记忆' });
    expect(decideAutoMcqRating('correct', true, 12_000).rating).toBe(4);
    expect(decideAutoMcqRating('correct', true, 30_000).rating).toBe(3);
    expect(decideAutoMcqRating('partial', true, 10_000)).toEqual({ rating: 2, reason: '多选漏项 · 缩短间隔巩固' });
    expect(decideAutoMcqRating('wrong', false, 5_000).rating).toBe(1);
    expect(decideAutoMcqRating('unanswered', true, 5_000).rating).toBe(1);
  });

  it('shuffles MCQ options deterministically, remaps answers, and respects positional guards', () => {
    const prep = prepareMcqOptions(SAMPLE_OPTIONS, 'BD', true, 'sess-42:ecg100-q068');
    expect(prep.shuffled).toBe(true);
    expect(prep.originalAnswer).toBe('BD');
    expect(prep.options.map((o) => o.displayLetter)).toEqual(['A', 'B', 'C', 'D']);

    const expectedCorrectBody = new Set(['QRS波群增宽', '心电轴左偏']);
    const mappedCorrectBodies = new Set(
      prep.options
        .filter((o) => prep.answer.includes(o.displayLetter))
        .map((o) => o.body),
    );
    expect(mappedCorrectBodies).toEqual(expectedCorrectBody);

    // Same seed reproduces exact permutation
    const prep2 = prepareMcqOptions(SAMPLE_OPTIONS, 'BD', true, 'sess-42:ecg100-q068');
    expect(prep2.options.map((o) => o.originalLetter)).toEqual(
      prep.options.map((o) => o.originalLetter),
    );

    // Anatomical phrasing containing "以上" (like Q96) must still shuffle
    const anatOpts = [
      'A. 阻滞部位在房室结或希氏束分叉以上',
      'B. 阻滞部位在希氏束分叉以下',
      'C. 心室率在 20~40 次/分之间',
      'D. 伴见宽大畸形QRS波群',
    ];
    expect(prepareMcqOptions(anatOpts, 'A', true, 'sess-1:q096').shuffled).toBe(true);

    // Positional meta-option like "以上均正确" stays unshuffled
    const metaOpts = [
      'A. V1 位置在胸骨右缘第4肋间',
      'B. V2 位置在胸骨左缘第4肋间',
      'C. V4 在左锁骨中线第5肋间',
      'D. 以上均正确',
    ];
    const unshuffled = prepareMcqOptions(metaOpts, 'D', true, 'sess-1:meta');
    expect(unshuffled.shuffled).toBe(false);
    expect(unshuffled.answer).toBe('D');
    expect(unshuffled.options.map((o) => o.originalLetter)).toEqual(['A', 'B', 'C', 'D']);
  });
});
