import { useState, useRef, useCallback } from 'react';

type Props = {
  /** Which pane gets the fixed (resizable) width; the other flexes. @default 'left' */
  primaryPane?: 'left' | 'right';
  /** Initial width (px) of the primary pane. @default 280 */
  defaultSize?: number;
  /** Minimum width (px) of the primary pane. @default 180 */
  minSize?: number;
  /** Maximum width (px) of the primary pane. @default 640 */
  maxSize?: number;
  left: React.ReactNode;
  right: React.ReactNode;
};

export default function SplitPane({
  primaryPane = 'left',
  defaultSize = 280,
  minSize = 180,
  maxSize = 640,
  left,
  right,
}: Props) {
  const [paneSize, setPaneSize] = useState(defaultSize);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = paneSize;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [paneSize]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    // primaryPane='left':  drag right → increase → +delta
    // primaryPane='right': drag right → decrease → -delta
    const rawDelta = e.clientX - startX.current;
    const delta = primaryPane === 'left' ? rawDelta : -rawDelta;
    const next = Math.min(maxSize, Math.max(minSize, startWidth.current + delta));
    setPaneSize(next);
  }, [minSize, maxSize, primaryPane]);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // ArrowRight always INCREASES the primary pane; ArrowLeft DECREASES.
    // For primaryPane='right', the sign flips because moving the divider
    // right makes a right-side primary pane smaller.
    const sign = primaryPane === 'left' ? 1 : -1;
    if (e.key === 'ArrowLeft') {
      setPaneSize((w) => Math.max(minSize, w - 10 * sign));
    } else if (e.key === 'ArrowRight') {
      setPaneSize((w) => Math.min(maxSize, w + 10 * sign));
    }
  }, [minSize, maxSize, primaryPane]);

  const divider = (
    <div
      className="split-pane__divider"
      role="separator"
      aria-orientation="vertical"
      aria-valuenow={Math.round(paneSize)}
      aria-valuemin={minSize}
      aria-valuemax={maxSize}
      tabIndex={0}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    />
  );

  return (
    <div className="split-pane">
      {primaryPane === 'left' ? (
        <>
          <div className="split-pane__primary" style={{ width: paneSize }}>
            {left}
          </div>
          {divider}
          <div className="split-pane__secondary">
            {right}
          </div>
        </>
      ) : (
        <>
          <div className="split-pane__secondary">
            {left}
          </div>
          {divider}
          <div className="split-pane__primary" style={{ width: paneSize }}>
            {right}
          </div>
        </>
      )}
    </div>
  );
}