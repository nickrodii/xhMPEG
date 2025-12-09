import React from 'react';
import { MediaInfo, NumericPreset, FormatOption } from "../config/constants";
import { formatHMS } from "../utils/mediaUtils";

// Actually insane file right here like ITS SO BIGGG

interface AdvancedPageProps {
  // Media
  mediaInfo: MediaInfo | null;
  isAudioOnly: boolean;
  conversionRunning: boolean;

  // Trim
  startMs: number;
  endMs: number;
  durationMs: number;
  sliderRef: React.RefObject<HTMLDivElement | null>;
  setDragging: (v: "start" | "end" | null) => void;
  handlePointerMove: (x: number) => void;

  // Output
  outputDir: string;
  pickOutputDir: () => void;
  outputFilename: string;
  setOutputFilename: (v: string) => void;
  
  // Formatting & Codec
  format: string;
  setFormat: (v: string) => void;
  formatOptions: FormatOption[];
  currentFormat: FormatOption;
  enableCodecSelection: boolean;
  selectedCodec: string;
  setSelectedCodec: (v: string) => void;
  codecOptions: string[];

  // Quality
  resolutionPreset: string;
  setResolutionPreset: (v: string) => void;
  resolutionOptions: { label: string; value: string; width?: number; height?: number }[];
  customWidth: string;
  setCustomWidth: (v: string) => void;
  customHeight: string;
  setCustomHeight: (v: string) => void;
  fpsPreset: string;
  setFpsPreset: (v: string) => void;
  fpsOptions: NumericPreset[];
  customFps: string;
  setCustomFps: (v: string) => void;
  videoBitratePreset: string;
  setVideoBitratePreset: (v: string) => void;
  videoBitrateOptions: NumericPreset[];
  customVideoBitrate: string;
  setCustomVideoBitrate: (v: string) => void;

  // Audio Toggle
  forceAudioOnly: boolean;
  updateForceAudioOnly: (v: boolean) => void;

  // Actions
  onBack: () => void;
  onRun: () => void;
}

export const AdvancedPage: React.FC<AdvancedPageProps> = ({
  mediaInfo, isAudioOnly, conversionRunning,
  startMs, endMs, durationMs, sliderRef, setDragging, handlePointerMove,
  outputDir, pickOutputDir, outputFilename, setOutputFilename,
  format, setFormat, formatOptions, currentFormat,
  enableCodecSelection, selectedCodec, setSelectedCodec, codecOptions,
  resolutionPreset, setResolutionPreset, resolutionOptions, customWidth, setCustomWidth, customHeight, setCustomHeight,
  fpsPreset, setFpsPreset, fpsOptions, customFps, setCustomFps,
  videoBitratePreset, setVideoBitratePreset, videoBitrateOptions, customVideoBitrate, setCustomVideoBitrate,
  forceAudioOnly, updateForceAudioOnly,
  onBack, onRun
}) => {
  
  const startPct = durationMs ? (startMs / durationMs) * 100 : 0;
  const endPct = durationMs ? (endMs / durationMs) * 100 : 0;
  const clipMs = Math.max(0, endMs - startMs);

  return (
    <div className="advanced-layout">
      <div className="advanced-grid-2">
        
        {/* Output section */}
        <section className="panel compact-panel advanced-output-panel">
          <div className="advanced-output-row">
            <div className="output-path">
              <p className="label">Folder</p>
              <div className="inline-fields">
                <input
                  type="text"
                  className="output-path-input"
                  value={outputDir}
                  readOnly
                  placeholder="Choose output folder"
                />
                <button className="browse-btn" onClick={pickOutputDir} aria-label="Browse for folder">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 6V4a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          </div>
          <div className="output-file advanced-filename">
            <div className="inline-fields">
              <input
                type="text"
                value={outputFilename}
                onChange={(e) => setOutputFilename(e.target.value.replace(/\.[^/.]+$/, ""))}
                placeholder="output"
              />
              <span className="suffix">.{currentFormat.ext}</span>
            </div>
          </div>
        </section>

        {/* Format & Codec */}
        <section className="panel compact-panel advanced-format-panel">
          <div className="format-codec-row">
            <div className="output-format">
              <p className="label">Format</p>
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                {formatOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            {enableCodecSelection && (
              <div className="output-codec">
                <p className="label">Codec</p>
                <select
                  value={selectedCodec}
                  onChange={(e) => setSelectedCodec(e.target.value)}
                  disabled={!mediaInfo || codecOptions.length <= 1}
                >
                  {codecOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            )}
          </div>
        </section>

        {/* Trim */}
        <section className="panel compact-panel trim-short advanced-trim-panel">
          <div className="trim-readout compact-readout">
            <div><p className="label">Start</p><p className="value">{formatHMS(startMs)}</p></div>
            <div><p className="label">End</p><p className="value">{formatHMS(endMs)}</p></div>
            <div><p className="label">Length</p><p className="value">{formatHMS(clipMs)}</p></div>
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
            <div className="trim-range" style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }} />
            <div className="trim-handle" style={{ left: `${startPct}%` }} onPointerDown={(e) => { e.stopPropagation(); setDragging("start"); }} />
            <div className="trim-handle" style={{ left: `${endPct}%` }} onPointerDown={(e) => { e.stopPropagation(); setDragging("end"); }} />
          </div>
        </section>

        {/* Quality (only shows when video passed thru) */}
        {mediaInfo?.has_video && (
          <section className="panel compact-panel quality-wide">
            <div className="advanced-inline">
              <div className="grow">
                <p className="label">Resolution</p>
                <select
                  className={resolutionPreset === "custom" ? "custom-select" : ""}
                  value={resolutionPreset}
                  onChange={(e) => setResolutionPreset(e.target.value)}
                  disabled={!mediaInfo || isAudioOnly}
                >
                  {[...resolutionOptions, { label: "Custom", value: "custom" }].map((preset) => (
                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                  ))}
                </select>
                {resolutionPreset === "custom" && (
                  <div className="inline-fields">
                    <input type="number" placeholder="Width" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} />
                    <span className="times">x</span>
                    <input type="number" placeholder="Height" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} />
                  </div>
                )}
              </div>
              <div className="grow">
                <p className="label">FPS</p>
                <select
                  className={fpsPreset === "custom" ? "custom-select" : ""}
                  value={fpsPreset}
                  onChange={(e) => setFpsPreset(e.target.value)}
                  disabled={!mediaInfo || isAudioOnly}
                >
                  {fpsOptions.map((preset) => (
                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                  ))}
                </select>
                {fpsPreset === "custom" && (
                  <input type="number" placeholder="fps" value={customFps} onChange={(e) => setCustomFps(e.target.value)} />
                )}
              </div>
              <div className="grow">
                <p className="label">Video bitrate</p>
                <select
                  className={videoBitratePreset === "custom" ? "custom-select" : ""}
                  value={videoBitratePreset}
                  onChange={(e) => setVideoBitratePreset(e.target.value)}
                  disabled={!mediaInfo || isAudioOnly}
                >
                  {videoBitrateOptions.map((preset) => (
                    <option key={preset.value} value={preset.value}>{preset.label}</option>
                  ))}
                </select>
                {videoBitratePreset === "custom" && (
                  <input type="number" placeholder="kbps" value={customVideoBitrate} onChange={(e) => setCustomVideoBitrate(e.target.value)} />
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* Stuff at footer */}
      <div className="advanced-actions">
        {mediaInfo?.has_video && (
          <div className="advanced-inline" style={{ marginRight: "auto" }}>
            <label className="advanced-toggle small-toggle">
              <input
                type="checkbox"
                checked={forceAudioOnly}
                onChange={(e) => updateForceAudioOnly(e.target.checked)}
              />
              <span className="label">Extract audio only</span>
            </label>
          </div>
        )}
        <div className="advanced-buttons">
          <button className="ghost" onClick={onBack}>Back</button>
          <button className="run-cta" onClick={onRun} disabled={!mediaInfo || conversionRunning}>
            {conversionRunning ? "Converting..." : "Run"}
          </button>
        </div>
      </div>
    </div>
  );
};