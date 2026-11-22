import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';

import {
  exportApkg,
  exportLeechJson,
  importApkg,
  importDeckJson,
  initSqlJsOffline,
} from '../apkgCodec';
import { createInitialFSRS } from '../fsrs';
import type { StudyCard } from '../../types';

const runFile = promisify(execFile);

function makeTestPngBlob(): Blob {
  // Minimal 1x1 PNG header/bytes sufficient for blob MIME & byte round-trip checks
  const bytes = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  return new Blob([bytes.buffer], { type: 'image/png' });
}

function makeCards(): StudyCard[] {
  const now = 1_700_000_000_000;
  return [
    {
      guid: 'AbCdEfGh1234',
      cardId: 'card-acidosis',
      deckId: 'd1',
      subdeck: '02-中频常考',
      cardType: 'basic',
      conceptKey: '呼吸性酸中毒诊断标准',
      front: '动脉血气判断呼酸的核心指标？',
      back: 'pH < 7.35 且 PaCO2 > 45 mmHg',
      stem: '',
      options: [],
      answer: '',
      text: '',
      extra: '',
      explanation: '原发性 PaCO2 潴留。',
      mnemonic: '【对比辨析】pH↓ 与 PaCO2↑ 反向变化',
      topic: '病理生理学',
      frequency: 2,
      frequencyTier: 'medium',
      frequencyBadge: '中频 · 2次',
      sourceKind: 'past_exam',
      sourceYears: ['2021', '2024'],
      tags: ['freq::medium'],
      media: ['acidosis.png'],
      fsrs: { ...createInitialFSRS(now), state: 'review', reps: 4, lapses: 3, scheduledDays: 5 },
      isLeech: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      guid: 'McqGuid56789',
      cardId: 'card-mi-mcq',
      deckId: 'd1',
      subdeck: '01-高频必背',
      cardType: 'mcq',
      conceptKey: '急性广泛前壁心梗导联',
      front: '',
      back: '',
      stem: '急性广泛前壁心梗 ST 段抬高见于？',
      options: ['A. II、III、aVF', 'B. V1～V5', 'C. I、aVL', 'D. V7～V9'],
      answer: 'B',
      text: '',
      extra: '',
      explanation: 'V1～V5 反映前壁。',
      mnemonic: '',
      topic: '内科学',
      frequency: 4,
      frequencyTier: 'high',
      frequencyBadge: '高频 · 4次',
      sourceKind: 'past_exam',
      sourceYears: ['2020', '2022', '2023', '2025'],
      tags: ['freq::high'],
      media: [],
      fsrs: createInitialFSRS(now),
      isLeech: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      guid: 'ClzGuid99999',
      cardId: 'card-mitral-cloze',
      deckId: 'd1',
      subdeck: '04-课件补充',
      cardType: 'cloze',
      conceptKey: '二尖瓣狭窄听诊杂音',
      front: '',
      back: '',
      stem: '',
      options: [],
      answer: '',
      text: '二尖瓣狭窄最常见病因是{{c1::风湿热}}，听诊为心尖区{{c2::舒张中晚期隆隆样}}杂音。',
      extra: '可伴开瓣音。',
      explanation: '可伴开瓣音。',
      mnemonic: '',
      topic: '内科学',
      frequency: 1,
      frequencyTier: 'supplement',
      frequencyBadge: '课件补充',
      sourceKind: 'ppt_supplement',
      sourceYears: ['课件第4章'],
      tags: ['source::ppt-supplement'],
      media: [],
      fsrs: createInitialFSRS(now),
      isLeech: false,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

describe('Offline .apkg & deck.json codec', () => {
  it('exports and re-imports Basic/MCQ/Cloze + PNG media + scheduling faithfully', async () => {
    const cards = makeCards();
    const media = new Map<string, Blob>([['acidosis.png', makeTestPngBlob()]]);
    const apkgBytes = await exportApkg('临床医学::测试库', cards, media);

    const imported = await importApkg(apkgBytes);
    expect(imported.dbSource).toBe('collection.anki2');
    expect(imported.deckName).toBe('临床医学::测试库');
    expect(imported.cards.length).toBe(3);
    expect(imported.mediaBlobs.has('acidosis.png')).toBe(true);

    const basic = imported.cards.find((c) => c.guid === 'AbCdEfGh1234')!;
    expect(basic.back).toBe('pH < 7.35 且 PaCO2 > 45 mmHg');
    expect(basic.mnemonic).toBe('【对比辨析】pH↓ 与 PaCO2↑ 反向变化');
    expect(basic.isLeech).toBe(true);
    expect(basic.fsrs.lapses).toBe(3);

    const mcq = imported.cards.find((c) => c.guid === 'McqGuid56789')!;
    expect(mcq.cardType).toBe('mcq');
    expect(mcq.options.length).toBe(4);
    expect(mcq.answer).toBe('B');

    const cloze = imported.cards.find((c) => c.guid === 'ClzGuid99999')!;
    expect(cloze.cardType).toBe('cloze');
    expect(cloze.text).toContain('{{c1::风湿热}}');
    expect(cloze.text).toContain('{{c2::舒张中晚期隆隆样}}');
  });

  it('prefers collection.anki21 over stub collection.anki2 and rejects anki21b-only clearly', async () => {
    const stubApkg = await exportApkg('StubDeck', [makeCards()[0]]);
    const realApkg = await exportApkg('RealDeck', makeCards());

    const stubZip = await JSZip.loadAsync(stubApkg);
    const realZip = await JSZip.loadAsync(realApkg);

    const comboZip = new JSZip();
    comboZip.file('collection.anki2', await stubZip.file('collection.anki2')!.async('uint8array'));
    comboZip.file('collection.anki21', await realZip.file('collection.anki2')!.async('uint8array'));
    comboZip.file('media', '{}');

    const comboBytes = await comboZip.generateAsync({ type: 'uint8array' });
    const imported = await importApkg(comboBytes);
    expect(imported.dbSource).toBe('collection.anki21');
    expect(imported.cards.length).toBe(3);

    const v3Zip = new JSZip();
    v3Zip.file('collection.anki21b', new Uint8Array([1, 2, 3, 4]));
    v3Zip.file('media', '{}');
    const v3Bytes = await v3Zip.generateAsync({ type: 'uint8array' });
    await expect(importApkg(v3Bytes)).rejects.toThrow(/collection\.anki21b/);
  });

  it('imports deck.json and exports structured leech JSON cleanly', async () => {
    const SQL = await initSqlJsOffline();
    expect(SQL).toBeTruthy();

    const cards = makeCards();
    const deckJson = JSON.stringify({ deck_name: 'JSONTest', cards });
    const imported = importDeckJson(deckJson);
    expect(imported.deckName).toBe('JSONTest');
    expect(imported.cards.length).toBe(3);

    const leechJsonText = exportLeechJson('JSONTest', [cards[0]]);
    const leechObj = JSON.parse(leechJsonText);
    expect(leechObj.leech_count).toBe(1);
    expect(leechObj.cards[0].guid).toBe('AbCdEfGh1234');
    expect(leechObj.cards[0].lapses).toBe(3);
  });

  it('imports .apkg built by sibling anki-exam-forge Python engine if present', async () => {
    const forgeRoot = resolve(process.cwd(), '..', 'anki-exam-forge');
    const cliPy = join(forgeRoot, 'engine', 'cli.py');
    const sampleJson = join(forgeRoot, 'examples', 'sample-medical-exams.json');
    if (!existsSync(cliPy) || !existsSync(sampleJson)) {
      return;
    }

    const tmpDir = await mkdtemp(join(tmpdir(), 'aef-interop-'));
    try {
      const deckJsonPath = join(tmpDir, 'deck_v1.json');
      const apkgPath = join(tmpDir, 'med_v1.apkg');
      const pyBin = process.platform === 'win32' ? 'python' : 'python3';

      await runFile(
        pyBin,
        [cliPy, 'freq', sampleJson, '--preset', 'clinical-medicine', '--deck-out', deckJsonPath],
        { env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true },
      );
      await runFile(
        pyBin,
        [cliPy, 'build', deckJsonPath, '--out', apkgPath],
        { env: { ...process.env, PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true },
      );

      const expectedDeck = JSON.parse(await readFile(deckJsonPath, 'utf8'));
      const apkgBytes = new Uint8Array(await readFile(apkgPath));
      const imported = await importApkg(apkgBytes);

      expect(imported.cards.length).toBe(expectedDeck.cards.length);
      expect(imported.cards.some((c) => c.frequencyTier === 'high')).toBe(true);
      expect(imported.cards.some((c) => c.cardType === 'mcq' && c.options.length === 4)).toBe(true);
      expect(imported.cards.some((c) => c.cardType === 'cloze' && c.text.includes('{{c1::'))).toBe(true);
      expect(imported.cards.map((c) => c.guid).sort()).toEqual(
        expectedDeck.cards.map((c: { guid: string }) => c.guid).sort(),
      );

      // Verify leeexport JSON round-trip compatibility
      const patchJson = exportLeechJson(imported.deckName, [imported.cards[0]]);
      const patchPath = join(tmpDir, 'leech_patch.json');
      await writeFile(patchPath, patchJson, 'utf8');
      expect(existsSync(patchPath)).toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
