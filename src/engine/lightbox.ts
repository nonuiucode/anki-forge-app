export interface LightboxTransform {
  scale: number;
  tx: number;
  ty: number;
}

export interface LightboxOffset {
  tx: number;
  ty: number;
}

export const LIGHTBOX_MIN_SCALE = 1;
export const LIGHTBOX_MAX_SCALE = 5;
export const LIGHTBOX_DOUBLE_TAP_SCALE = 2.5;

function normalizeZero(n: number): number {
  return Object.is(n, -0) || Math.abs(n) < 1e-9 ? 0 : n;
}

export function clampScale(
  scale: number,
  min = LIGHTBOX_MIN_SCALE,
  max = LIGHTBOX_MAX_SCALE,
): number {
  if (!Number.isFinite(scale)) return min;
  return Math.min(max, Math.max(min, scale));
}

export function clampOffset(
  tx: number,
  ty: number,
  scale: number,
  contentW: number,
  contentH: number,
  viewportW: number,
  viewportH: number,
): LightboxOffset {
  const safeScale = Math.max(0, Number.isFinite(scale) ? scale : 1);
  const maxTx = Math.max(0, (contentW * safeScale - viewportW) / 2);
  const maxTy = Math.max(0, (contentH * safeScale - viewportH) / 2);

  const clampedX = Math.min(maxTx, Math.max(-maxTx, Number.isFinite(tx) ? tx : 0));
  const clampedY = Math.min(maxTy, Math.max(-maxTy, Number.isFinite(ty) ? ty : 0));

  return {
    tx: normalizeZero(clampedX),
    ty: normalizeZero(clampedY),
  };
}

export function computePinchTransform(
  startScale: number,
  startTx: number,
  startTy: number,
  startMidX: number,
  startMidY: number,
  curMidX: number,
  curMidY: number,
  distRatio: number,
  viewportCenterX: number,
  viewportCenterY: number,
  contentW: number,
  contentH: number,
  viewportW: number,
  viewportH: number,
): LightboxTransform {
  const safeStartScale = Math.max(1e-6, startScale);
  const scale = clampScale(safeStartScale * distRatio);
  const ratio = scale / safeStartScale;

  // Keep the image point under (startMidX, startMidY) locked to (curMidX, curMidY).
  const rawTx = curMidX - viewportCenterX - ratio * (startMidX - viewportCenterX - startTx);
  const rawTy = curMidY - viewportCenterY - ratio * (startMidY - viewportCenterY - startTy);

  const { tx, ty } = clampOffset(rawTx, rawTy, scale, contentW, contentH, viewportW, viewportH);
  return { scale, tx, ty };
}

export function computeDoubleTapTransform(
  currentScale: number,
  tapX: number,
  tapY: number,
  viewportCenterX: number,
  viewportCenterY: number,
  contentW: number,
  contentH: number,
  viewportW: number,
  viewportH: number,
  targetScale = LIGHTBOX_DOUBLE_TAP_SCALE,
): LightboxTransform {
  if (currentScale > 1.05) {
    return { scale: 1, tx: 0, ty: 0 };
  }

  return computePinchTransform(
    1,
    0,
    0,
    tapX,
    tapY,
    tapX,
    tapY,
    targetScale,
    viewportCenterX,
    viewportCenterY,
    contentW,
    contentH,
    viewportW,
    viewportH,
  );
}
