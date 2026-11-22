import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

import type { PendingNativeFile } from '../types';

interface ApkgIntentNativePlugin {
  getPendingFile(): Promise<{ hasFile: boolean; filename?: string; dataBase64?: string }>;
  shareFile(options: { filename: string; mimeType: string; dataBase64: string }): Promise<{ shared: boolean }>;
  addListener(
    eventName: 'fileOpened',
    listenerFunc: (event: { filename: string; dataBase64: string }) => void,
  ): Promise<PluginListenerHandle>;
}

const ApkgIntent = registerPlugin<ApkgIntentNativePlugin>('ApkgIntent');

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
