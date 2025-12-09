import React from 'react';
import { MediaInfo , NumericPreset } from "../config/constants";

interface QualityPageProps {
    mediaInfo: MediaInfo | null;
    isAudioOnly: boolean;

    // Resolution
    resolutionPreset: string;
    setResolutionPreset: (v: string) => void;
    resolutionOptions: { label: string; value: string; width?: number; height?: number }[];
    customWidth: string;
    setCustomWidth: (v: string) => void;
    customHeight: string;
    setCustomHeight: (v: string) => void;

    // fps
    fpsPreset: string;
    setFpsPreset: (v: string) => void;
    fpsOptions: NumericPreset[];
    customFps: string;
    setCustomFps: (v: string) => void;

    // Video Bitrate
    videoBitratePreset: string;
    setVideoBitratePreset: (v: string) => void;
    videoBitrateOptions: NumericPreset[];
    customVideoBitrate: string;
    setCustomVideoBitrate: (v: string) => void;

    // Audio only toggle
    forceAudioOnly: boolean;
    updateForceAudioOnly: (v: boolean) => void;
}

export const QualityPage: React.FC<QualityPageProps> = ({
    mediaInfo,
    isAudioOnly,
    resolutionPreset,
    setResolutionPreset,
    resolutionOptions,
    customWidth,
    setCustomWidth,
    customHeight,
    setCustomHeight,
    fpsPreset,
    setFpsPreset,
    fpsOptions,
    customFps,
    setCustomFps,
    videoBitratePreset,
    setVideoBitratePreset,
    videoBitrateOptions,
    customVideoBitrate,
    setCustomVideoBitrate,
    forceAudioOnly,
    updateForceAudioOnly,
}) => {
    return (
        <section className="panel quality-panel">
      <div className="panel-header center">
        <h2>Quality</h2>
      </div>
      <div className="quality-grid">
        <div>
          <p className="label">Resolution</p>
          <select
            className={resolutionPreset === "custom" ? "custom-select" : ""}
            value={resolutionPreset}
            onChange={(e) => setResolutionPreset(e.target.value)}
            disabled={!mediaInfo || isAudioOnly || !mediaInfo?.has_video}
          >
            {[...resolutionOptions, { label: "Custom", value: "custom" }].map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          {resolutionPreset === "custom" && (
            <div className="inline-fields">
              <input
                type="number"
                placeholder="Width"
                value={customWidth}
                onChange={(e) => setCustomWidth(e.target.value)}
              />
              <span className="times">x</span>
              <input
                type="number"
                placeholder="Height"
                value={customHeight}
                onChange={(e) => setCustomHeight(e.target.value)}
              />
            </div>
          )}
        </div>

        <div>
          <p className="label">FPS</p>
          <select
            className={fpsPreset === "custom" ? "custom-select" : ""}
            value={fpsPreset}
            onChange={(e) => setFpsPreset(e.target.value)}
            disabled={!mediaInfo || isAudioOnly || !mediaInfo?.has_video}
          >
            {fpsOptions.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          {fpsPreset === "custom" && (
            <input
              type="number"
              placeholder="fps"
              value={customFps}
              onChange={(e) => setCustomFps(e.target.value)}
            />
          )}
        </div>

        <div>
          <p className="label">Video bitrate</p>
          <select
            className={videoBitratePreset === "custom" ? "custom-select" : ""}
            value={videoBitratePreset}
            onChange={(e) => setVideoBitratePreset(e.target.value)}
            disabled={!mediaInfo || isAudioOnly || !mediaInfo?.has_video}
          >
            {videoBitrateOptions.map((preset) => (
              <option key={preset.value} value={preset.value}>
                {preset.label}
              </option>
            ))}
          </select>
          {videoBitratePreset === "custom" && (
            <input
              type="number"
              placeholder="kbps"
              value={customVideoBitrate}
              onChange={(e) => setCustomVideoBitrate(e.target.value)}
            />
          )}
        </div>
      </div>
      {mediaInfo && mediaInfo.has_video && (
        <div className="quality-audio-toggle">
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
    </section>
  );
};
    