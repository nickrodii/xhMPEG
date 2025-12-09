import React from 'react';
import { formatHMS } from "../utils/mediaUtils";

interface TrimPageProps {
    startMs: number;
    endMs: number;
    durationMs: number;
    sliderRef: React.RefObject<HTMLDivElement | null>;
    
    setDragging: (value: "start" | "end" | null) => void;
    handlePointerMove: (clientX: number) => void;
}



export const TrimPage: React.FC<TrimPageProps> = ({
    startMs,
    endMs,
    durationMs,
    sliderRef,
    setDragging,
    handlePointerMove
}) => {
    const startPct = durationMs ? (startMs / durationMs) * 100 : 0;
    const endPct = durationMs ? (endMs / durationMs) * 100 : 0;
    return (
      <section className="panel">
        <div className="panel-header center">
          <h2>Trim</h2>
        </div>
        <div className="trim-readout">
          <div>
            <p className="label">Start</p>
            <p className="value">{formatHMS(startMs)}</p>
          </div>
          <div>
            <p className="label">End</p>
            <p className="value">{formatHMS(endMs)}</p>
          </div>
          <div>
            <p className="label">Length</p>
            <p className="value">{formatHMS(Math.max(0, endMs - startMs))}</p>
          </div>
        </div>
        <div
          className="trim-slider"
          ref={sliderRef}
          onPointerDown={(e) => {
            if (durationMs <= 0) return;
            const rect = sliderRef.current?.getBoundingClientRect();
            if (!rect) return;
            const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
            const ms = ratio * durationMs;
            const distanceToStart = Math.abs(ms - startMs);
            const distanceToEnd = Math.abs(ms - endMs);
            setDragging(distanceToStart <= distanceToEnd ? "start" : "end");
            handlePointerMove(e.clientX);
          }}
        >
          <div className="trim-track" />
          <div
            className="trim-range"
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
          />
          <div
            className="trim-handle"
            style={{ left: `${startPct}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragging("start");
            }}
          />
          <div
            className="trim-handle"
            style={{ left: `${endPct}%` }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setDragging("end");
            }}
          />
        </div>
      </section>
    );
};
    