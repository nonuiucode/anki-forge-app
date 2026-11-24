#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key.startsWith('--') && i + 1 < argv.length) {
      out[key.slice(2)] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const repo = args.repo || process.env.GITHUB_REPOSITORY || 'nonuiucode/anki-forge-app';
const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'));
const tag = args.tag || `v${pkg.version}`;
const version = tag.replace(/^v/i, '');
const apkPath = resolve(args.apk || 'Jiuji-AnkiForge-release.apk');
const outPath = resolve(args.out || 'version.json');
const apkFilename = basename(apkPath);

const gradleText = readFileSync(resolve('android/app/build.gradle'), 'utf8');
const codeMatch = gradleText.match(/\bversionCode\s+(\d+)/);
if (!codeMatch) {
  throw new Error('Could not find versionCode in android/app/build.gradle');
}
const versionCode = Number(codeMatch[1]);

const apkBytes = readFileSync(apkPath);
const apkSize = statSync(apkPath).size;
const apkSha256 = createHash('sha256').update(apkBytes).digest('hex').toLowerCase();

let notesMap = {};
try {
  notesMap = JSON.parse(readFileSync(resolve('scripts/update-notes.json'), 'utf8'));
} catch {
  notesMap = {};
}
const entry = notesMap[version] || notesMap[tag] || {};
const notesZh =
  typeof entry.notesZh === 'string' && entry.notesZh.trim()
    ? entry.notesZh.trim()
    : `- 发布 ${tag} 更新`;
const notesEn =
  typeof entry.notesEn === 'string' && entry.notesEn.trim()
    ? entry.notesEn.trim()
    : `- Release ${tag}`;

const directReleaseAsset = `https://github.com/${repo}/releases/download/${tag}/${apkFilename}`;
const releasePageUrl = `https://github.com/${repo}/releases/tag/${tag}`;

const downloadUrls = [
  `https://ghfast.top/${directReleaseAsset}`,
  `https://gh-proxy.com/${directReleaseAsset}`,
  `https://ghproxy.net/${directReleaseAsset}`,
  `https://mirror.ghproxy.com/${directReleaseAsset}`,
  directReleaseAsset,
];

const manifest = {
  version,
  versionCode,
  apkSize,
  apkSha256,
  notesZh,
  notesEn,
  publishedAt: new Date().toISOString(),
  releasePageUrl,
  downloadUrls,
};

writeFileSync(outPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(
  `Generated ${outPath}: version=${version}, versionCode=${versionCode}, size=${apkSize}, sha256=${apkSha256}`,
);
