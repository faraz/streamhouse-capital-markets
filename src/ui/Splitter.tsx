import { useRef } from 'react';

interface Props {
  /** x drags a column edge left and right; y drags a row edge up and down. */
  axis: 'x' | 'y';
  label: string;
  /** The size being dragged, as it is on screen right now. */
  measure(): number;
  /** 1 when dragging right or down grows it, -1 when it shrinks it. */
  grows: 1 | -1;
  min: number;
  max: number;
  onChange(px: number): void;
  /** Back to the design's own size. */
  onReset(): void;
}

const STEP = 24;

/**
 * A drag handle on a panel edge. Pointer capture keeps the drag alive when the pointer
 * leaves the handle, the arrow keys move it for anyone not using a mouse, and a double
 * click puts the design's own size back.
 */
export function Splitter({ axis, label, measure, grows, min, max, onChange, onReset }: Props) {
  const start = useRef<{ at: number; size: number } | null>(null);
  const clamp = (px: number) => Math.round(Math.min(max, Math.max(min, px)));

  return (
    <div
      className="split"
      data-axis={axis}
      role="separator"
      aria-label={label}
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      tabIndex={0}
      title={`${label}: drag, or double click to reset`}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { at: axis === 'x' ? e.clientX : e.clientY, size: measure() };
        e.currentTarget.dataset['dragging'] = 'true';
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const moved = (axis === 'x' ? e.clientX : e.clientY) - start.current.at;
        onChange(clamp(start.current.size + moved * grows));
      }}
      onPointerUp={(e) => {
        start.current = null;
        delete e.currentTarget.dataset['dragging'];
      }}
      onPointerCancel={(e) => {
        start.current = null;
        delete e.currentTarget.dataset['dragging'];
      }}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        const forward = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
        if (e.key !== forward && e.key !== back) return;
        e.preventDefault();
        // Kept from the tour, which uses the same arrow keys to move between beats.
        e.stopPropagation();
        onChange(clamp(measure() + (e.key === forward ? STEP : -STEP) * grows));
      }}
    />
  );
}
