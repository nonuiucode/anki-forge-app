import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, TouchEvent as ReactTouchEvent } from 'react';

import {
  clampOffset,
  computeDoubleTapTransform,
  computePinchTransform,
  type LightboxTransform,
} from '../engine/lightbox';
import { Icon } from './Icons';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

type Pt = { x: number; y: number };

const DOUBLE_TAP_MS = 280;
const TAP_SLOP = 7;
const DISMISS_THRESHOLD_PX = 90;

const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

export function ImageLightbox({ src, alt = '附图预览', onClose }: ImageLightboxProps) {
  const [view, setView] = useState<LightboxTransform>({ scale: 1, tx: 0, ty: 0 });
  const [dismissY, setDismissY] = useState(0);
  const [gesturing, setGesturing] = useState(false);
  const [showTip, setShowTip] = useState(true);

  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const viewRef = useRef(view);
  viewRef.current = view;
  const dismissYRef = useRef(dismissY);
  dismissYRef.current = dismissY;

  const pointers = useRef(new Map<number, Pt>());
  const gesture = useRef<{
    startDist: number;
    startMid: Pt;
    startPt: Pt;
    startView: LightboxTransform;
    moved: boolean;
    mode: 'idle' | 'pinch' | 'pan' | 'dismiss';
  } | null>(null);
  const lastTap = useRef<{ time: number; x: number; y: number } | null>(null);

  const measureGeometry = useCallback(() => {
    const stage = stageRef.current;
    const img = imgRef.current;
    const stageRect = stage?.getBoundingClientRect();
    const viewportW = stage?.clientWidth ?? window.innerWidth;
    const viewportH = stage?.clientHeight ?? window.innerHeight;
    const viewportCenterX = stageRect ? stageRect.left + stageRect.width / 2 : window.innerWidth / 2;
    const viewportCenterY = stageRect ? stageRect.top + stageRect.height / 2 : window.innerHeight / 2;
    const contentW = img?.offsetWidth || viewportW;
    const contentH = img?.offsetHeight || viewportH;
    return { viewportW, viewportH, viewportCenterX, viewportCenterY, contentW, contentH };
  }, []);

  useEffect(() => {
    const t = window.setTimeout(() => setShowTip(false), 2600);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  // Desktop wheel zoom anchored at cursor (non-passive so preventDefault works cleanly)
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const factor = Math.exp(-e.deltaY * 0.0022);
      const cur = viewRef.current;
      const g = measureGeometry();
      const next = computePinchTransform(
        cur.scale,
        cur.tx,
        cur.ty,
        e.clientX,
        e.clientY,
        e.clientX,
        e.clientY,
        factor,
        g.viewportCenterX,
        g.viewportCenterY,
        g.contentW,
        g.contentH,
        g.viewportW,
        g.viewportH,
      );
      setDismissY(0);
      setView(next);
    };
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [measureGeometry]);

  const reset = () => {
    setDismissY(0);
    setView({ scale: 1, tx: 0, ty: 0 });
  };

  const baseline = (preserveMoved: boolean) => {
    const pts = [...pointers.current.values()];
    if (pts.length === 0) {
      gesture.current = null;
      return;
    }
    const isPinch = pts.length >= 2;
    gesture.current = {
      startDist: isPinch ? Math.max(1, dist(pts[0], pts[1])) : 0,
      startMid: isPinch ? mid(pts[0], pts[1]) : pts[0],
      startPt: pts[0],
      startView: viewRef.current,
      moved: preserveMoved ? (gesture.current?.moved ?? false) : false,
      mode: isPinch ? 'pinch' : viewRef.current.scale > 1.02 ? 'pan' : 'idle',
    };
  };

  const stopTouch = (e: ReactTouchEvent) => {
    e.stopPropagation();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic pointer capture failures
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const firstPointer = pointers.current.size === 1;
    if (firstPointer) {
      gesture.current = null;
      setDismissY(0);
    }
    setGesturing(true);
    baseline(!firstPointer);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const pts = [...pointers.current.values()];

    if (pts.length >= 2 && g.startDist > 0) {
      const m = mid(pts[0], pts[1]);
      const curDist = dist(pts[0], pts[1]);
      const distRatio = curDist / g.startDist;
      const geom = measureGeometry();
      const next = computePinchTransform(
        g.startView.scale,
        g.startView.tx,
        g.startView.ty,
        g.startMid.x,
        g.startMid.y,
        m.x,
        m.y,
        distRatio,
        geom.viewportCenterX,
        geom.viewportCenterY,
        geom.contentW,
        geom.contentH,
        geom.viewportW,
        geom.viewportH,
      );
      g.mode = 'pinch';
      g.moved = true;
      setDismissY(0);
      setView(next);
      return;
    }

    const dx = pts[0].x - g.startPt.x;
    const dy = pts[0].y - g.startPt.y;
    if (Math.hypot(dx, dy) > TAP_SLOP) {
      g.moved = true;
    }

    if (g.startView.scale > 1.02) {
      const geom = measureGeometry();
      const { tx, ty } = clampOffset(
        g.startView.tx + dx,
        g.startView.ty + dy,
        g.startView.scale,
        geom.contentW,
        geom.contentH,
        geom.viewportW,
        geom.viewportH,
      );
      g.mode = 'pan';
      setView({ scale: g.startView.scale, tx, ty });
      return;
    }

    // At 1x rest: vertical drag-down to dismiss with live opacity fade
    if (g.mode === 'idle' && dy > TAP_SLOP && dy > Math.abs(dx) * 0.9) {
      g.mode = 'dismiss';
    }
    if (g.mode === 'dismiss') {
      setDismissY(Math.max(0, dy));
    }
  };

  const onPointerEnd = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    pointers.current.delete(e.pointerId);
    const g = gesture.current;

    if (pointers.current.size > 0) {
      // One finger lifted mid-pinch: re-anchor remaining finger seamlessly as pan
      setDismissY(0);
      baseline(true);
      return;
    }

    setGesturing(false);

    if (g?.mode === 'dismiss') {
      const dy = dismissYRef.current;
      gesture.current = null;
      if (dy > DISMISS_THRESHOLD_PX) {
        onClose();
      } else {
        setDismissY(0);
      }
      return;
    }

    if (viewRef.current.scale <= 1.02) {
      reset();
    }

    if (g && !g.moved && e.type === 'pointerup') {
      const onImage = (e.target as HTMLElement).tagName === 'IMG';
      if (!onImage && viewRef.current.scale <= 1.02) {
        gesture.current = null;
        onClose();
        return;
      }

      const now = Date.now();
      const prev = lastTap.current;
      if (
        prev &&
        now - prev.time < DOUBLE_TAP_MS &&
        Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 42
      ) {
        lastTap.current = null;
        const geom = measureGeometry();
        const next = computeDoubleTapTransform(
          viewRef.current.scale,
          e.clientX,
          e.clientY,
          geom.viewportCenterX,
          geom.viewportCenterY,
          geom.contentW,
          geom.contentH,
          geom.viewportW,
          geom.viewportH,
        );
        setDismissY(0);
        setView(next);
      } else {
        lastTap.current = { time: now, x: e.clientX, y: e.clientY };
      }
    }

    gesture.current = null;
  };

  const backdropAlpha = dismissY > 0 ? Math.max(0.22, 1 - dismissY / 340) : 1;
  const imgTx = view.tx;
  const imgTy = view.ty + dismissY;

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      style={{ backgroundColor: `rgba(3, 7, 13, ${backdropAlpha.toFixed(3)})` }}
      onTouchStart={stopTouch}
      onTouchMove={stopTouch}
      onTouchEnd={stopTouch}
      onTouchCancel={stopTouch}
    >
      <div
        ref={stageRef}
        className="lightbox-stage"
        onTouchStart={stopTouch}
        onTouchMove={stopTouch}
        onTouchEnd={stopTouch}
        onTouchCancel={stopTouch}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      >
        <img
          ref={imgRef}
          className={`lightbox-img${gesturing ? '' : ' is-settling'}`}
          src={src}
          alt={alt}
          draggable={false}
          style={{ transform: `translate3d(${imgTx}px, ${imgTy}px, 0) scale(${view.scale})` }}
        />
      </div>

      <div
        className={`lightbox-zoom num-tab${view.scale > 1.02 ? ' is-active' : ''}`}
        aria-live="polite"
      >
        {view.scale.toFixed(1)}×
      </div>

      <button
        type="button"
        className="lightbox-close"
        aria-label="关闭"
        onTouchStart={stopTouch}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        <Icon name="x" size={22} strokeWidth={2} />
      </button>

      {showTip && <div className="lightbox-tip">双指缩放 · 拖拽查看 · 双击还原</div>}
    </div>
  );
}
