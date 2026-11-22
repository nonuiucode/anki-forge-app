import { describe, expect, it } from 'vitest';

import {
  evaluateMcq,
  extractOptionLetter,
  isMultiSelectMcq,
  parseAnswerLetters,
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
});
