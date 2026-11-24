import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

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
  checkPermission(): Promise<{ granted: boolean; canExactAlarm?: boolean }>;
  requestNotificationPermission(): Promise<{ granted: boolean }>;
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
  sendTestNotification(): Promise<{ sent: boolean }>;
}

const ApkgIntent = registerPlugin<ApkgIntentNativePlugin>('ApkgIntent');
const ReviewReminder = registerPlugin<ReviewReminderNativePlugin>('ReviewReminder');

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

export async function checkReminderPermission(): Promise<{ granted: boolean; native: boolean }> {
  if (isNativeAndroid()) {
    try {
      const res = await ReviewReminder.checkPermission();
      return { granted: Boolean(res?.granted), native: true };
    } catch {
      return { granted: false, native: true };
    }
  }
  if (typeof Notification !== 'undefined') {
    return { granted: Notification.permission === 'granted', native: false };
  }
  return { granted: false, native: false };
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

export async function sendTestReminderNotification(): Promise<boolean> {
  if (isNativeAndroid()) {
    try {
      const res = await ReviewReminder.sendTestNotification();
      return Boolean(res?.sent);
    } catch {
      return false;
    }
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification('玖记 · 复习提醒已就绪', {
        body: '浏览器通知可用；桌面提醒需保持页面打开，手机 APK 支持后台定时与记忆曲线到期提醒。',
      });
      return true;
    } catch {
      return false;
    }
  }
  return false;
}
