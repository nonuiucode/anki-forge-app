import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

import {
  FALLBACK_APP_VERSION,
  FALLBACK_APP_VERSION_CODE,
  GITHUB_RELEASES_PAGE,
  buildManifestRequestUrls,
  extractUrlHost,
  isUpdateAvailable,
  parseUpdateManifest,
  type InstalledAppVersion,
  type UpdateCheckResult,
  type UpdateDownloadProgress,
  type UpdateManifest,
} from '../engine/updater';
import type { PendingNativeFile, ReviewReminderPayload } from '../types';

interface ApkgIntentNativePlugin {
  getPendingFile(): Promise<{ hasFile: boolean; filename?: string; dataBase64?: string }>;
  shareFile(options: { filename: string; mimeType: string; dataBase64: string }): Promise<{ shared: boolean }>;
  addListener(
    eventName: 'fileOpened',
    listenerFunc: (event: { filename: string; dataBase64: string }) => void,
  ): Promise<PluginListenerHandle>;
}

interface ReviewReminderNativePlugin {
  checkPermission(): Promise<{
    granted: boolean;
    canExactAlarm?: boolean;
    ignoringBatteryOptimizations?: boolean;
  }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
  requestBackgroundPermission(): Promise<{ opened: boolean }>;
  syncReminders(options: {
    enabled: boolean;
    hour: number;
    minute: number;
    smartDueEnabled: boolean;
    dueCount: number;
    newCount: number;
    leechCount: number;
    deckName: string;
    nextDueAtMs: number;
  }): Promise<{ scheduled: boolean; nextDailyAtMs?: number; nextSmartDueAtMs?: number }>;
  sendTestNotification(): Promise<{ sent: boolean; delayedSeconds?: number }>;
}

interface AppUpdateNativePlugin {
  getAppVersion(): Promise<{ versionName: string; versionCode: number }>;
  fetchUpdateManifest(options: { urls: string[] }): Promise<{ json: string; sourceUrl: string }>;
  downloadAndInstallApk(options: {
    urls: string[];
    filename: string;
    expectedSha256?: string;
    expectedSize?: number;
  }): Promise<{ status: 'installing' | 'needs_install_permission'; sourceUrl: string }>;
  installPendingApk(): Promise<{ status: 'installing' | 'needs_install_permission' | 'missing' }>;
  openExternalUrl(options: { url: string }): Promise<{ opened: boolean }>;
  addListener(
    eventName: 'updateDownloadProgress',
    listenerFunc: (event: UpdateDownloadProgress) => void,
  ): Promise<PluginListenerHandle>;
}

const ApkgIntent = registerPlugin<ApkgIntentNativePlugin>('ApkgIntent');
const ReviewReminder = registerPlugin<ReviewReminderNativePlugin>('ReviewReminder');
const AppUpdate = registerPlugin<AppUpdateNativePlugin>('AppUpdate');

export function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x2000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    parts.push(String.fromCharCode(...slice));
  }
  return btoa(parts.join(''));
}

export function isNativeAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export function subscribeIncomingFiles(onFile: (file: PendingNativeFile) => void): () => void {
  if (!Capacitor.isNativePlatform()) {
    return () => {};
  }

  let disposed = false;
  let listenerHandle: PluginListenerHandle | null = null;

  void ApkgIntent.addListener('fileOpened', (event) => {
    if (disposed || !event?.dataBase64) return;
    onFile({
      filename: event.filename || 'incoming.apkg',
      bytes: base64ToUint8Array(event.dataBase64),
    });
  }).then((handle) => {
    if (disposed) {
      void handle.remove();
    } else {
      listenerHandle = handle;
    }
  }).catch(() => {});

  void ApkgIntent.getPendingFile()
    .then((res) => {
      if (disposed || !res?.hasFile || !res.dataBase64) return;
      onFile({
        filename: res.filename || 'incoming.apkg',
        bytes: base64ToUint8Array(res.dataBase64),
      });
    })
    .catch(() => {});

  return () => {
    disposed = true;
    if (listenerHandle) {
      void listenerHandle.remove();
    }
  };
}

export async function shareOrDownloadBytes(
  filename: string,
  mimeType: string,
  bytes: Uint8Array,
): Promise<'shared' | 'downloaded'> {
  if (Capacitor.isNativePlatform()) {
    const dataBase64 = uint8ArrayToBase64(bytes);
    await ApkgIntent.shareFile({ filename, mimeType, dataBase64 });
    return 'shared';
  }

  const safeCopy = new Uint8Array(bytes);
  const blob = new Blob([safeCopy.buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return 'downloaded';
}

export async function shareOrDownloadText(
  filename: string,
  mimeType: string,
  text: string,
): Promise<'shared' | 'downloaded'> {
  const bytes = new TextEncoder().encode(text);
  return shareOrDownloadBytes(filename, mimeType, bytes);
}

export async function checkReminderPermission(): Promise<{
  granted: boolean;
  native: boolean;
  canExactAlarm: boolean;
  ignoringBatteryOptimizations: boolean;
}> {
  if (isNativeAndroid()) {
    try {
      const res = await ReviewReminder.checkPermission();
      return {
        granted: Boolean(res?.granted),
        native: true,
        canExactAlarm: res?.canExactAlarm !== false,
        ignoringBatteryOptimizations: res?.ignoringBatteryOptimizations !== false,
      };
    } catch {
      return {
        granted: false,
        native: true,
        canExactAlarm: true,
        ignoringBatteryOptimizations: true,
      };
    }
  }
  if (typeof Notification !== 'undefined') {
    return {
      granted: Notification.permission === 'granted',
      native: false,
      canExactAlarm: true,
      ignoringBatteryOptimizations: true,
    };
  }
  return {
    granted: false,
    native: false,
    canExactAlarm: true,
    ignoringBatteryOptimizations: true,
  };
}

export async function requestReminderBackgroundPermission(): Promise<boolean> {
  if (!isNativeAndroid()) {
    return false;
  }
  try {
    const res = await ReviewReminder.requestBackgroundPermission();
    return Boolean(res?.opened);
  } catch {
    return false;
  }
}

export async function requestReminderPermission(): Promise<boolean> {
  if (isNativeAndroid()) {
    try {
      const res = await ReviewReminder.requestNotificationPermission();
      return Boolean(res?.granted);
    } catch {
      return false;
    }
  }
  if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try {
      const res = await Notification.requestPermission();
      return res === 'granted';
    } catch {
      return false;
    }
  }
  return true;
}

export async function syncReviewReminders(
  payload: ReviewReminderPayload,
): Promise<{ scheduled: boolean; nextDailyAtMs?: number; nextSmartDueAtMs?: number }> {
  if (!isNativeAndroid()) {
    return { scheduled: false };
  }
  try {
    return await ReviewReminder.syncReminders({
      enabled: payload.enabled,
      hour: payload.hour,
      minute: payload.minute,
      smartDueEnabled: payload.smartDueEnabled,
      dueCount: payload.dueCount,
      newCount: payload.newCount,
      leechCount: payload.leechCount,
      deckName: payload.deckName,
      nextDueAtMs: payload.nextDueAtMs ?? 0,
    });
  } catch {
    return { scheduled: false };
  }
}

export async function sendTestReminderNotification(): Promise<{
  sent: boolean;
  delayedSeconds?: number;
}> {
  if (isNativeAndroid()) {
    try {
      const res = await ReviewReminder.sendTestNotification();
      return {
        sent: Boolean(res?.sent),
        delayedSeconds: typeof res?.delayedSeconds === 'number' ? res.delayedSeconds : undefined,
      };
    } catch {
      return { sent: false };
    }
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('玖记 · 复习提醒已就绪', {
        body: '浏览器通知可用；桌面提醒需保持页面打开，手机 APK 支持后台定时与记忆曲线到期提醒。',
      });
      return { sent: true, delayedSeconds: 0 };
    } catch {
      return { sent: false };
    }
  }
  return { sent: false };
}

export async function getInstalledAppVersion(): Promise<InstalledAppVersion> {
  if (isNativeAndroid()) {
    try {
      const info = await AppUpdate.getAppVersion();
      if (info?.versionName) {
        return {
          versionName: String(info.versionName).replace(/^v/i, ''),
          versionCode: Number(info.versionCode) || FALLBACK_APP_VERSION_CODE,
          native: true,
        };
      }
    } catch {
      // Fall back to bundled app metadata
    }
  }
  return {
    versionName: FALLBACK_APP_VERSION,
    versionCode: FALLBACK_APP_VERSION_CODE,
    native: false,
  };
}

async function fetchManifestViaBrowser(urls: string[]): Promise<{ raw: unknown; sourceUrl: string }> {
  let lastError = '无法连接更新服务器';
  for (const url of urls) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const resp = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      if (!resp.ok) {
        lastError = `${extractUrlHost(url)} HTTP ${resp.status}`;
        continue;
      }
      const data: unknown = await resp.json();
      return { raw: data, sourceUrl: url };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = `${extractUrlHost(url)}: ${msg}`;
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(lastError);
}

export async function checkForAppUpdate(): Promise<UpdateCheckResult> {
  const installed = await getInstalledAppVersion();
  const urls = buildManifestRequestUrls();

  let rawManifest: unknown;
  let sourceUrl: string;

  if (isNativeAndroid()) {
    const res = await AppUpdate.fetchUpdateManifest({ urls });
    rawManifest = JSON.parse(res.json);
    sourceUrl = res.sourceUrl;
  } else {
    const fetched = await fetchManifestViaBrowser(urls);
    rawManifest = fetched.raw;
    sourceUrl = fetched.sourceUrl;
  }

  const manifest = parseUpdateManifest(rawManifest);
  const hasUpdate = isUpdateAvailable(installed.versionName, installed.versionCode, manifest);
  return {
    installed,
    hasUpdate,
    manifest,
    sourceUrl,
  };
}

export async function downloadAndInstallAppUpdate(
  manifest: UpdateManifest,
  onProgress: (progress: UpdateDownloadProgress) => void,
): Promise<{
  status: 'installing' | 'needs_install_permission' | 'opened_browser';
  sourceUrl?: string;
}> {
  if (!isNativeAndroid()) {
    const targetUrl = manifest.downloadUrls[0] ?? manifest.releasePageUrl ?? GITHUB_RELEASES_PAGE;
    window.open(targetUrl, '_blank', 'noopener');
    return { status: 'opened_browser', sourceUrl: targetUrl };
  }

  let handle: PluginListenerHandle | null = null;
  try {
    handle = await AppUpdate.addListener('updateDownloadProgress', (ev) => {
      if (ev) onProgress(ev);
    });
    const res = await AppUpdate.downloadAndInstallApk({
      urls: manifest.downloadUrls,
      filename: `Jiuji-AnkiForge-v${manifest.version}-release.apk`,
      expectedSha256: manifest.apkSha256 ?? undefined,
      expectedSize: manifest.apkSize ?? undefined,
    });
    return { status: res.status, sourceUrl: res.sourceUrl };
  } finally {
    if (handle) {
      await handle.remove().catch(() => {});
    }
  }
}

export async function installPendingAppUpdate(): Promise<{
  status: 'installing' | 'needs_install_permission' | 'missing';
}> {
  if (!isNativeAndroid()) {
    return { status: 'missing' };
  }
  const res = await AppUpdate.installPendingApk();
  return { status: res.status };
}

export async function openExternalDownloadUrl(url: string): Promise<void> {
  if (isNativeAndroid()) {
    await AppUpdate.openExternalUrl({ url });
    return;
  }
  window.open(url, '_blank', 'noopener');
}
