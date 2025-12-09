import React from 'react';
import { MediaInfo , FormatOption } from "../config/constants";

interface OutputPageProps {
    mediaInfo: MediaInfo | null;
    outputDir: string;
    outputFilename: string;
    setOutputFilename: (v: string) => void;
    format: string;
    setFormat: (v: string) => void;
    selectedCodec: string;
    setSelectedCodec: (v: string) => void;

    // Logic / Data
    formatOptions: FormatOption[];
    currentFormat: FormatOption;
    enableCodecSelection: boolean;
    codecOptions: string[];

    // Actions
    onBrowse: () => void;
}

export const OutputPage: React.FC<OutputPageProps> = ({
  mediaInfo,
  outputDir,
  outputFilename,
  setOutputFilename,
  format,
  setFormat,
  selectedCodec,
  setSelectedCodec,
  formatOptions,
  currentFormat,
  enableCodecSelection,
  codecOptions,
  onBrowse,
}) => {
  return (
    <section className="panel centered-panel">
      <div className="panel-header">
        <h2>Output</h2>
      </div>
      <div className="output-row">
        
        <div className="output-path">
          <p className="label">Folder</p>
          <div className="inline-fields">
            <input type="text" value={outputDir} readOnly placeholder="Choose output folder" />
          </div>
        </div>
        <button className="browse-btn output-browse" onClick={onBrowse} aria-label="Browse for folder">
           <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M3 6V4a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v2"/></svg>
        </button>

        <div className="output-format">
          <p className="label">Format</p>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {formatOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {enableCodecSelection && (
          <div className="output-codec inline-codec">
            <p className="label">Codec</p>
            <select
              value={selectedCodec}
              onChange={(e) => setSelectedCodec(e.target.value)}
              disabled={!mediaInfo || codecOptions.length <= 1}
            >
              {codecOptions.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="output-file">
        <p className="label">Filename</p>
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
  );
};