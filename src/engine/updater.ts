import pkg from '../../package.json';

export const FALLBACK_APP_VERSION = pkg.version;
export const FALLBACK_APP_VERSION_CODE = 7;

export const GITHUB_RELEASES_PAGE =
  'https://github.com/nonuiucode/anki-forge-app/releases/latest';

export const DEFAULT_MANIFEST_URLS: readonly string[] = [
  'https://fastly.jsdelivr.net/gh/nonuiucode/anki-forge-app@updates/version.json',
  'https://gcore.jsdelivr.net/gh/nonuiucode/anki-forge-app@updates/version.json',
  'https://cdn.jsdelivr.net/gh/nonuiucode/anki-forge-app@updates/version.json',
  'https://ghfast.top/https://raw.githubusercontent.com/nonuiucode/anki-forge-app/updates/version.json',
  'https://gh-proxy.com/https://raw.githubusercontent.com/nonuiucode/anki-forge-app/updates/version.json',
  'https://ghproxy.net/https://raw.githubusercontent.com/nonuiucode/anki-forge-app/updates/version.json',
  'https://raw.githubusercontent.com/nonuiucode/anki-forge-app/updates/version.json',
];

export interface UpdateManifest {
  version: string;
  versionCode: number | null;
  apkSize: number | null;
  apkSha256: string | null;
  notesZh: string;
  notesEn: string;
  releasePageUrl: string;
  downloadUrls: string[];
  publishedAt: string | null;
}

export interface InstalledAppVersion {
  versionName: string;
  versionCode: number;
  native: boolean;
}

export interface UpdateCheckResult {
  installed: InstalledAppVersion;
  hasUpdate: boolean;
  manifest: UpdateManifest;
  sourceUrl: string;
}

export interface UpdateDownloadProgress {
  percent: number;
  downloadedBytes: number;
  totalBytes: number;
  mirrorIndex: number;
  mirrorCount: number;
  host: string;
}

function parseSemverParts(raw: string): number[] {
  const cleaned = raw.trim().replace(/^v/i, '');
  if (!cleaned) return [];
  const core = cleaned.split('-', 1)[0];
  const segments = core.split('.');
  if (segments.some((seg) => !/^\d+$/.test(seg))) {
    return [];
  }
  return segments.map((seg) => Number(seg));
}

export function compareSemver(a: string, b: string): number {
  const pa = parseSemverParts(a);
  const pb = parseSemverParts(b);
  if (pa.length === 0 && pb.length === 0) {
    return a.trim().localeCompare(b.trim());
  }
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

export function isUpdateAvailable(
  currentVersion: string,
  currentVersionCode: number | null,
  remote: UpdateManifest,
): boolean {
  const cmp = compareSemver(remote.version, currentVersion);
  if (cmp > 0) return true;
  if (cmp < 0) return false;
  if (
    remote.versionCode !== null &&
    currentVersionCode !== null &&
    remote.versionCode > currentVersionCode
  ) {
    return true;
  }
  return false;
}

function isValidHttpsUrl(raw: string): boolean {
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function parseUpdateManifest(raw: unknown): UpdateManifest {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('更新清单格式无效');
  }
  const obj = raw as Record<string, unknown>;
  const rawVersion = typeof obj.version === 'string' ? obj.version.trim() : '';
  const version = rawVersion.replace(/^v/i, '');
  if (!version || parseSemverParts(version).length === 0) {
    throw new Error('更新清单缺少合法版本号');
  }

  const rawUrls = Array.isArray(obj.downloadUrls) ? obj.downloadUrls : [];
  const downloadUrls = rawUrls
    .filter((item): item is string => typeof item === 'string')
    .map((u) => u.trim())
    .filter((u) => isValidHttpsUrl(u));
  if (downloadUrls.length === 0) {
    throw new Error('更新清单缺少有效的 HTTPS 下载地址');
  }

  let versionCode: number | null = null;
  if (obj.versionCode !== undefined && obj.versionCode !== null) {
    const n = Number(obj.versionCode);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error('更新清单 versionCode 无效');
    }
    versionCode = n;
  }

  let apkSize: number | null = null;
  if (obj.apkSize !== undefined && obj.apkSize !== null) {
    const s = Number(obj.apkSize);
    if (!Number.isFinite(s) || s <= 0) {
      throw new Error('更新清单 apkSize 无效');
    }
    apkSize = Math.round(s);
  }

  let apkSha256: string | null = null;
  if (obj.apkSha256 !== undefined && obj.apkSha256 !== null && obj.apkSha256 !== '') {
    if (typeof obj.apkSha256 !== 'string' || !/^[0-9a-fA-F]{64}$/.test(obj.apkSha256.trim())) {
      throw new Error('更新清单 SHA-256 校验值无效');
    }
    apkSha256 = obj.apkSha256.trim().toLowerCase();
  }

  const notesZh = typeof obj.notesZh === 'string' ? obj.notesZh.trim() : '';
  const notesEn = typeof obj.notesEn === 'string' ? obj.notesEn.trim() : '';
  const releaseCandidate = typeof obj.releasePageUrl === 'string' ? obj.releasePageUrl.trim() : '';
  const releasePageUrl = isValidHttpsUrl(releaseCandidate)
    ? releaseCandidate
    : GITHUB_RELEASES_PAGE;
  const publishedAt = typeof obj.publishedAt === 'string' && obj.publishedAt.trim()
    ? obj.publishedAt.trim()
    : null;

  return {
    version,
    versionCode,
    apkSize,
    apkSha256,
    notesZh,
    notesEn,
    releasePageUrl,
    downloadUrls,
    publishedAt,
  };
}

export function buildManifestRequestUrls(nowMs = Date.now()): string[] {
  return DEFAULT_MANIFEST_URLS.map((url) => {
    if (url.includes('jsdelivr.net/')) {
      return url;
    }
    const sep = url.includes('?') ? '&' : '?';
    return `${url}${sep}t=${Math.floor(nowMs)}`;
  });
}

export function extractUrlHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export function formatByteSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}
