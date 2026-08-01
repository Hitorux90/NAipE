import { useState, useRef, useCallback } from 'react';

type Props = {
  defaultLeftWidth?: number;
  minLeftWidth?: number;
  maxLeftWidth?: number;
  left: React.ReactNode;
  right: React.ReactNode;
};

export default function SplitPane({
  defaultLeftWidth = 360,
  minLeftWidth = 220,
  maxLeftWidth = 640,
  left,
  right,
}: Props) {
  const [leftWidth, setLeftWidth] = useState(defaultLeftWidth);
  const dragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startWidth.current = leftWidth;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [leftWidth]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragging.current) return;
    const delta = e.clientX - startX.current;
    const next = Math.min(maxLeftWidth, Math.max(minLeftWidth, startWidth.current + delta));
    setLeftWidth(next);
  }, [minLeftWidth, maxLeftWidth]);

  const handleMouseUp = useCallback(() => {
    dragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  return (
    <div className="split-pane">
      <div className="split-pane__left" style={{ width: leftWidth }}>
        {left}
      </div>
      <div className="split-pane__divider" role="separator" aria-orientation="vertical" onMouseDown={handleMouseDown} />
      <div className="split-pane__right">
        {right}
      </div>
    </div>
  );
}
