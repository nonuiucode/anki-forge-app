import { describe, expect, it } from 'vitest';

import {
  buildManifestRequestUrls,
  compareSemver,
  extractUrlHost,
  formatByteSize,
  isUpdateAvailable,
  parseUpdateManifest,
} from '../updater';

const VALID_SHA256 = 'a'.repeat(64);

describe('App updater helpers', () => {
  it('compares semantic versions accurately across v-prefixes and multi-digit segments', () => {
    expect(compareSemver('1.3.1', '1.3.0')).toBe(1);
    expect(compareSemver('v1.10.0', 'v1.9.9')).toBe(1);
    expect(compareSemver('1.3.1', 'v1.3.1')).toBe(0);
    expect(compareSemver('1.3.0', '1.3.2')).toBe(-1);
  });

  it('determines update availability from semver and versionCode', () => {
    const manifest = parseUpdateManifest({
      version: '1.3.1',
      versionCode: 8,
      apkSize: 5_500_000,
      apkSha256: VALID_SHA256,
      notesZh: '优化体验',
      downloadUrls: ['https://ghfast.top/https://example.com/app.apk'],
    });

    expect(isUpdateAvailable('1.3.0', 6, manifest)).toBe(true);
    expect(isUpdateAvailable('1.3.1', 7, manifest)).toBe(true);
    expect(isUpdateAvailable('1.3.1', 8, manifest)).toBe(false);
    expect(isUpdateAvailable('1.4.0', 9, manifest)).toBe(false);
  });

  it('validates update manifests strictly and rejects non-HTTPS URLs or bad hashes', () => {
    const ok = parseUpdateManifest({
      version: 'v1.3.2',
      versionCode: 9,
      apkSize: 5_400_000,
      apkSha256: VALID_SHA256.toUpperCase(),
      notesZh: '修复若干问题',
      notesEn: 'Minor fixes',
      downloadUrls: ['https://fastly.jsdelivr.net/gh/nonuiucode/anki-forge-app@updates/app.apk'],
    });
    expect(ok.version).toBe('1.3.2');
    expect(ok.apkSha256).toBe(VALID_SHA256);

    expect(() =>
      parseUpdateManifest({
        version: '1.3.2',
        downloadUrls: ['http://insecure.example.com/app.apk'],
      }),
    ).toThrow();

    expect(() =>
      parseUpdateManifest({
        version: '1.3.2',
        downloadUrls: [],
      }),
    ).toThrow();

    expect(() =>
      parseUpdateManifest({
        version: '1.3.2',
        apkSha256: 'not-a-sha256',
        downloadUrls: ['https://example.com/app.apk'],
      }),
    ).toThrow();
  });

  it('builds manifest URLs cleanly and formats byte sizes and hosts', () => {
    const urls = buildManifestRequestUrls(1700000000123);
    expect(urls[0]).toBe(
      'https://fastly.jsdelivr.net/gh/nonuiucode/anki-forge-app@updates/version.json',
    );
    expect(urls.some((u) => u.includes('?t=1700000000123'))).toBe(true);

    expect(extractUrlHost('https://ghfast.top/https://github.com/foo')).toBe('ghfast.top');
    expect(formatByteSize(5_505_024)).toBe('5.3 MB');
    expect(formatByteSize(512_000)).toBe('500.0 KB');
  });
});
