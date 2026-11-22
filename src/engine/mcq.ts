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

export function extractOptionLetter(opt: string): string {
  const m = /^\s*([A-Ha-h])\s*[.．、:：\)\]]/.exec(opt);
  return m ? m[1].toUpperCase() : opt.trim().slice(0, 1).toUpperCase();
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
