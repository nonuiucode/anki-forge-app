import { describe, expect, it } from 'vitest';

import {
  clampOffset,
  clampScale,
  computeDoubleTapTransform,
  computePinchTransform,
} from '../lightbox';

describe('lightbox transform engine', () => {
  it('clamps scale within [1, 5] by default and respects custom bounds', () => {
    expect(clampScale(0.4)).toBe(1);
    expect(clampScale(1)).toBe(1);
    expect(clampScale(2.75)).toBe(2.75);
    expect(clampScale(8.5)).toBe(5);
    expect(clampScale(Number.NaN)).toBe(1);
    expect(clampScale(0.5, 0.8, 3)).toBe(0.8);
    expect(clampScale(4, 0.8, 3)).toBe(3);
  });

  it('clamps offsets to zero at 1x when image fits inside viewport', () => {
    const res = clampOffset(120, -85, 1, 360, 500, 400, 700);
    expect(res).toEqual({ tx: 0, ty: 0 });
  });

  it('clamps offsets cleanly to overflow bounds at 3x zoom', () => {
    // contentW=360, contentH=240, viewport=400x700
    // at 3x: scaledW=1080 -> maxTx = (1080-400)/2 = 340
    // scaledH=720 -> maxTy = (720-700)/2 = 10
    expect(clampOffset(500, -100, 3, 360, 240, 400, 700)).toEqual({ tx: 340, ty: -10 });
    expect(clampOffset(-999, 50, 3, 360, 240, 400, 700)).toEqual({ tx: -340, ty: 10 });
    expect(clampOffset(120, -4, 3, 360, 240, 400, 700)).toEqual({ tx: 120, ty: -4 });
  });

  it('keeps focal point under pinch midpoint invariant during zoom and pan', () => {
    const vpW = 400;
    const vpH = 800;
    const vpCx = vpW / 2;
    const vpCy = vpH / 2;
    const contentW = 400;
    const contentH = 600;

    const startScale = 1.5;
    const startTx = 20;
    const startTy = -30;
    const startMidX = 260;
    const startMidY = 340;

    // Image-local point under the start midpoint:
    const u = (startMidX - vpCx - startTx) / startScale;
    const v = (startMidY - vpCy - startTy) / startScale;

    // Spread fingers 1.6x while panning midpoint by (+15, -20)
    const curMidX = startMidX + 15;
    const curMidY = startMidY - 20;
    const distRatio = 1.6;

    const next = computePinchTransform(
      startScale,
      startTx,
      startTy,
      startMidX,
      startMidY,
      curMidX,
      curMidY,
      distRatio,
      vpCx,
      vpCy,
      contentW,
      contentH,
      vpW,
      vpH,
    );

    expect(next.scale).toBeCloseTo(2.4, 6);
    // Re-project the same image point (u, v) to screen coordinates:
    const projectedX = vpCx + next.tx + next.scale * u;
    const projectedY = vpCy + next.ty + next.scale * v;
    expect(projectedX).toBeCloseTo(curMidX, 5);
    expect(projectedY).toBeCloseTo(curMidY, 5);
  });

  it('clamps scale at max 5x during aggressive pinch while staying within bounds', () => {
    const next = computePinchTransform(2, 0, 0, 220, 380, 220, 380, 10, 200, 400, 400, 600, 400, 800);
    expect(next.scale).toBe(5);
    // maxTx = (400*5 - 400)/2 = 800, maxTy = (600*5 - 800)/2 = 1100
    expect(Math.abs(next.tx)).toBeLessThanOrEqual(800);
    expect(Math.abs(next.ty)).toBeLessThanOrEqual(1100);
  });

  it('toggles 1x <-> 2.5x on double-tap anchored at tap point', () => {
    const vpW = 400;
    const vpH = 800;
    const vpCx = 200;
    const vpCy = 400;
    const contentW = 400;
    const contentH = 600;

    // Double-tap at (260, 360) from 1x -> zooms to 2.5x anchored at (260, 360)
    const zoomed = computeDoubleTapTransform(1, 260, 360, vpCx, vpCy, contentW, contentH, vpW, vpH);
    expect(zoomed.scale).toBe(2.5);
    // u = 260 - 200 = 60, v = 360 - 400 = -40
    // tx = (1 - 2.5) * 60 = -90 (within maxTx = 300)
    // ty = (1 - 2.5) * -40 = 60 (within maxTy = 350)
    expect(zoomed.tx).toBeCloseTo(-90, 5);
    expect(zoomed.ty).toBeCloseTo(60, 5);

    // Verify focal point invariance: screenX = 200 + (-90) + 2.5 * 60 = 260
    expect(vpCx + zoomed.tx + zoomed.scale * (260 - vpCx)).toBeCloseTo(260, 5);
    expect(vpCy + zoomed.ty + zoomed.scale * (360 - vpCy)).toBeCloseTo(360, 5);

    // Double-tap again when already zoomed (> 1.05) -> resets cleanly to 1x centered
    const reset = computeDoubleTapTransform(
      zoomed.scale,
      260,
      360,
      vpCx,
      vpCy,
      contentW,
      contentH,
      vpW,
      vpH,
    );
    expect(reset).toEqual({ scale: 1, tx: 0, ty: 0 });
  });
});
