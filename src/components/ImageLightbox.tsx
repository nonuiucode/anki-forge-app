import { useState } from 'react';

interface ImageLightboxProps {
  src: string;
  alt?: string;
  onClose: () => void;
}

const ZOOM_STEPS = [1, 1.75, 2.5];

export function ImageLightbox({ src, alt = '附图预览', onClose }: ImageLightboxProps) {
  const [zoomIdx, setZoomIdx] = useState(0);
  const scale = ZOOM_STEPS[zoomIdx];

  return (
    <div
      className="lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="lightbox-toolbar" onClick={(e) => e.stopPropagation()}>
        <span style={{ fontSize: 13 }}>{alt}</span>
        <div className="row-wrap">
          {ZOOM_STEPS.map((z, idx) => (
            <button
              key={z}
              type="button"
              className={`btn btn-sm ${idx === zoomIdx ? 'btn-primary' : ''}`}
              onClick={() => setZoomIdx(idx)}
            >
              {z}×
            </button>
          ))}
          <button type="button" className="btn btn-sm" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>
      <div className="lightbox-stage">
        <img
          src={src}
          alt={alt}
          onClick={(e) => {
            e.stopPropagation();
            setZoomIdx((prev) => (prev + 1) % ZOOM_STEPS.length);
          }}
          style={{
            maxWidth: scale === 1 ? '100%' : 'none',
            maxHeight: scale === 1 ? '100%' : 'none',
            width: scale === 1 ? 'auto' : `${scale * 100}%`,
            borderRadius: 8,
          }}
        />
      </div>
    </div>
  );
}
