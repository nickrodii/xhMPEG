import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Store } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type MediaInfo = {
  duration_seconds: number;
  width: number;
  height: number;
  fps: number;
  bitrate_kbps: number;
};

type NumericPreset = {
  label: string;
  value: string;
  amount?: number;
};

type FormatOption = {
  label: string;
  value: string;
  ext: string;
};

const FPS_PRESETS: NumericPreset[] = [
  { label: "60 fps", value: "60", amount: 60 },
  { label: "30 fps", value: "30", amount: 30 },
  { label: "24 fps", value: "24", amount: 24 },
  { label: "Custom", value: "custom" },
];

const VIDEO_BITRATE_PRESETS: NumericPreset[] = [
  { label: "8000 kbps", value: "8000", amount: 8000 },
  { label: "6000 kbps", value: "6000", amount: 6000 },
  { label: "4000 kbps", value: "4000", amount: 4000 },
  { label: "2500 kbps", value: "2500", amount: 2500 },
  { label: "Custom", value: "custom" },
];

const AUDIO_BITRATE_PRESETS: NumericPreset[] = [
  { label: "320 kbps", value: "320", amount: 320 },
  { label: "192 kbps", value: "192", amount: 192 },
  { label: "128 kbps", value: "128", amount: 128 },
  { label: "Custom", value: "custom" },
];

const FORMAT_OPTIONS: FormatOption[] = [
  { label: "MP4 (H.264 + AAC)", value: "mp4", ext: "mp4" },
  { label: "MKV (H.264 + AAC)", value: "mkv", ext: "mkv" },
];

const SETTINGS_STORE_FILE = "settings.json";

function joinPaths(dir: string, file: string): string {
  if (!dir) return file;
  if (dir.endsWith("/") || dir.endsWith("\\")) {
    return `${dir}${file}`;
  }
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir}${sep}${file}`;
}

function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? "";
}

function parentDir(path: string): string {
  const match = path.match(/^(.*)[\\/][^\\/]+$/);
  return match && match[1] ? match[1] : "";
}

function baseNameNoExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

function formatHMS(ms: number): string {
  if (!Number.isFinite(ms)) return "--:--";
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
      .toString()
      .padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function evenDimension(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

function buildResolutionOptions(sourceWidth: number, sourceHeight: number) {
  const scaleOption = (label: string, factor: number, key: string) => ({
    label: `${label} (${evenDimension(sourceWidth * factor)}x${evenDimension(sourceHeight * factor)})`,
    value: key,
    width: evenDimension(sourceWidth * factor),
    height: evenDimension(sourceHeight * factor),
  });

  const opts = [
    scaleOption("125%", 1.25, "scale_125"),
    {
      label: `Source (${sourceWidth}x${sourceHeight})`,
      value: "source",
      width: sourceWidth,
      height: sourceHeight,
    },
    scaleOption("75%", 0.75, "scale_75"),
    scaleOption("50%", 0.5, "scale_50"),
  ];

  const unique: typeof opts = [];
  const seen = new Set<string>();
  for (const o of opts) {
    const key = `${o.width}x${o.height}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(o);
    }
  }
  return unique;
}
function App() {
  const [selectedFile, setSelectedFile] = useState<string>("");
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [startMs, setStartMs] = useState<number>(0);
  const [endMs, setEndMs] = useState<number>(0);
  const [loadingInfo, setLoadingInfo] = useState<boolean>(false);
  const [conversionRunning, setConversionRunning] = useState<boolean>(false);
  const [status, setStatus] = useState<string>("");
  const [lastOutputPath, setLastOutputPath] = useState<string>("");
  const [step, setStep] = useState<number>(1);

  const [resolutionPreset, setResolutionPreset] = useState<string>("source");
  const [customWidth, setCustomWidth] = useState<string>("");
  const [customHeight, setCustomHeight] = useState<string>("");
  const [resolutionOptions, setResolutionOptions] = useState<
    { label: string; value: string; width?: number; height?: number }[]
  >([]);
  const [, setSourceResolution] = useState<{ width: number; height: number } | null>(null);

  const [fpsPreset, setFpsPreset] = useState<string>("source");
  const [customFps, setCustomFps] = useState<string>("");
  const [sourceFps, setSourceFps] = useState<number | null>(null);

  const [videoBitratePreset, setVideoBitratePreset] = useState<string>("source");
  const [customVideoBitrate, setCustomVideoBitrate] = useState<string>("");
  const [sourceVideoBitrate, setSourceVideoBitrate] = useState<number | null>(null);

  const [audioBitratePreset] = useState<string>("192");
  const [customAudioBitrate] = useState<string>("");

  const [outputDir, setOutputDir] = useState<string>("");
  const [outputFilename, setOutputFilename] = useState<string>("output");
  const [format, setFormat] = useState<string>("mp4");

  const storeRef = useRef<Store | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const store = await Store.load(SETTINGS_STORE_FILE);
        storeRef.current = store;
        const saved = await store.get<string>("lastOutputDir");
        if (saved && !cancelled) setOutputDir(saved);
      } catch (err) {
        console.error("Failed to load store", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const durationMs = mediaInfo ? Math.round(mediaInfo.duration_seconds * 1000) : 0;

  const clipLengthSeconds = useMemo(() => {
    return Math.max(0, (endMs - startMs) / 1000);
  }, [startMs, endMs]);

  const resolution = useMemo(() => {
    const preset = resolutionOptions.find((p) => p.value === resolutionPreset);
    if (!preset || preset.value === "custom") {
      const w = parseInt(customWidth, 10);
      const h = parseInt(customHeight, 10);
      return {
        width: Number.isFinite(w) ? w : undefined,
        height: Number.isFinite(h) ? h : undefined,
      };
    }
    return { width: preset.width, height: preset.height };
  }, [resolutionPreset, customWidth, customHeight, resolutionOptions]);

  const fpsValue = useMemo(() => {
    if (fpsPreset === "custom") {
      const f = parseFloat(customFps);
      return Number.isFinite(f) ? f : undefined;
    }
    if (fpsPreset === "source") return sourceFps ?? undefined;
    const preset = FPS_PRESETS.find((p) => p.value === fpsPreset);
    return preset?.amount;
  }, [fpsPreset, customFps, sourceFps]);

  const fpsOptions = useMemo(() => {
    const opts: NumericPreset[] = [];
    if (sourceFps) {
      opts.push({ label: `Source (${Math.round(sourceFps)} fps)`, value: "source", amount: sourceFps });
    }
    return opts.concat(FPS_PRESETS);
  }, [sourceFps]);

  const videoBitrateValue = useMemo(() => {
    if (videoBitratePreset === "custom") {
      const v = parseInt(customVideoBitrate, 10);
      return Number.isFinite(v) ? v : undefined;
    }
    if (videoBitratePreset === "source") return sourceVideoBitrate ?? undefined;
    const preset = VIDEO_BITRATE_PRESETS.find((p) => p.value === videoBitratePreset);
    return preset?.amount;
  }, [videoBitratePreset, customVideoBitrate, sourceVideoBitrate]);

  const audioBitrateValue = useMemo(() => {
    if (audioBitratePreset === "custom") {
      const v = parseInt(customAudioBitrate, 10);
      return Number.isFinite(v) ? v : undefined;
    }
    const preset = AUDIO_BITRATE_PRESETS.find((p) => p.value === audioBitratePreset);
    return preset?.amount;
  }, [audioBitratePreset, customAudioBitrate]);

  const currentFormat = useMemo(() => {
    return FORMAT_OPTIONS.find((f) => f.value === format) ?? FORMAT_OPTIONS[0];
  }, [format]);

  const finalOutputPath = useMemo(() => {
    const base = outputFilename.replace(/\.[^/.]+$/, "") || "output";
    const nameWithExt = `${base}.${currentFormat.ext}`;
    if (!outputDir) return nameWithExt;
    return joinPaths(outputDir, nameWithExt);
  }, [outputDir, outputFilename, currentFormat]);

  const estimatedSizeText = useMemo(() => {
    if (!clipLengthSeconds) return "--";
    const totalKbps = (videoBitrateValue ?? 0) + (audioBitrateValue ?? 0);
    if (!totalKbps) return "--";
    const bytes = (totalKbps * 1000 * clipLengthSeconds) / 8;
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) {
      return `${mb.toFixed(1)} MB`;
    }
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }, [clipLengthSeconds, videoBitrateValue, audioBitrateValue]);

  const handlePointerMove = (clientX: number) => {
    if (!dragging || !sliderRef.current || durationMs <= 0) return;
    const rect = sliderRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const ms = Math.round(ratio * durationMs);
    const stepMs = 100;
    if (dragging === "start") {
      const clamped = Math.min(ms, endMs - stepMs);
      setStartMs(Math.max(0, clamped));
    } else if (dragging === "end") {
      const clamped = Math.max(ms, startMs + stepMs);
      setEndMs(Math.min(durationMs, clamped));
    }
  };

  useEffect(() => {
    const onMove = (e: PointerEvent) => handlePointerMove(e.clientX);
    const onUp = () => setDragging(null);
    if (dragging) {
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    }
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, durationMs, endMs, startMs]);

  const pickMediaFile = async () => {
    setStatus("");
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Media", extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"] },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    setSelectedFile(selected);
    setMediaInfo(null);
    setLoadingInfo(true);
    try {
      const info = await invoke<MediaInfo>("analyze_media", { path: selected });
      setMediaInfo(info);
      setSourceResolution({ width: info.width, height: info.height });
      setSourceVideoBitrate(info.bitrate_kbps || null);
      setResolutionOptions(buildResolutionOptions(info.width, info.height));
      setResolutionPreset("source");
      setSourceFps(info.fps);
      setFpsPreset("source");
      if (info.bitrate_kbps) {
        setVideoBitratePreset("source");
      } else {
        setVideoBitratePreset("8000");
      }
      setStartMs(0);
      const end = Math.round(info.duration_seconds * 1000);
      setEndMs(end);
      const base = baseNameNoExt(fileNameFromPath(selected)) || "output";
      setOutputFilename(`${base}_converted`);
      if (!outputDir) {
        setOutputDir(parentDir(selected));
      }
      setStep(2);
    } catch (err) {
      console.error(err);
      setStatus(`Failed to analyze file: ${err}`);
    } finally {
      setLoadingInfo(false);
    }
  };

  const pickOutputDir = async () => {
    const dir = await open({ directory: true, multiple: false });
    if (!dir || Array.isArray(dir)) return;
    setOutputDir(dir);
    if (storeRef.current) {
      try {
        await storeRef.current.set("lastOutputDir", dir);
        await storeRef.current.save();
      } catch (err) {
        console.error("Failed to save output dir", err);
      }
    }
  };

  const runConversion = async () => {
    if (!selectedFile || !mediaInfo) {
      setStatus("Pick a media file first.");
      return;
    }
    if (!outputDir) {
      setStatus("Choose an output folder.");
      return;
    }
    const width = resolution.width ?? null;
    const height = resolution.height ?? null;
    const outputPath = finalOutputPath;
    setLastOutputPath(outputPath);
    setConversionRunning(true);
    setStatus("Running conversion...");
    setStep(5);
    try {
      await invoke("run_conversion", {
        options: {
          input_path: selectedFile,
          output_path: outputPath,
          start_ms: Math.round(startMs),
          end_ms: Math.round(endMs),
          width,
          height,
          fps: fpsValue ?? null,
          video_bitrate_kbps: videoBitrateValue ?? null,
          audio_bitrate_kbps: audioBitrateValue ?? null,
          format: currentFormat.value,
        },
      });
      setStatus("");
      setStep(6);
    } catch (err) {
      console.error(err);
      setStatus(`Conversion failed: ${err}`);
      setStep(4);
    } finally {
      setConversionRunning(false);
    }
  };

  const renderTrimPage = () => {
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
            <p className="label">Clip length</p>
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

  const renderQualityPage = () => (
    <section className="panel grid">
      <div>
        <div className="panel-header">
          <h2>Resolution</h2>
        </div>
        <select
          value={resolutionPreset}
          onChange={(e) => setResolutionPreset(e.target.value)}
          disabled={!mediaInfo}
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
        <div className="panel-header">
          <h2>FPS</h2>
        </div>
        <select
          value={fpsPreset}
          onChange={(e) => setFpsPreset(e.target.value)}
          disabled={!mediaInfo}
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
            placeholder="Custom fps"
            value={customFps}
            onChange={(e) => setCustomFps(e.target.value)}
          />
        )}
      </div>

      <div>
        <div className="panel-header">
          <h2>Video bitrate</h2>
        </div>
        <select
          value={videoBitratePreset}
          onChange={(e) => setVideoBitratePreset(e.target.value)}
          disabled={!mediaInfo}
        >
          {(sourceVideoBitrate
            ? [{ label: `Source (${sourceVideoBitrate} kbps)`, value: "source", amount: sourceVideoBitrate } as NumericPreset]
            : []
          )
            .concat(VIDEO_BITRATE_PRESETS)
            .map((preset) => (
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
    </section>
  );

  const renderOutputPage = () => (
    <section className="panel centered-panel">
      <div className="panel-header">
        <h2>Output</h2>
      </div>
      <div className="output-row">
        <div className="output-path">
          <p className="label">Folder</p>
          <div className="inline-fields">
            <input type="text" value={outputDir} readOnly placeholder="Choose output folder" />
            <button className="browse-btn" onClick={pickOutputDir}>
              Browse
            </button>
          </div>
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
        <div className="output-format">
          <p className="label">Format</p>
          <select value={format} onChange={(e) => setFormat(e.target.value)}>
            {FORMAT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="run-panel">
        <button className="run-cta center" onClick={runConversion} disabled={!mediaInfo || conversionRunning}>
          {conversionRunning ? "Converting..." : "Run"}
        </button>
      </div>
    </section>
  );

  const renderRunningPage = () => (
    <section className="panel run-screen">
      <h2>Running conversion...</h2>
      <div className="progress">
        <div className="progress-bar smooth" />
      </div>
      <p className="helper">Working with ffmpeg, please wait.</p>
    </section>
  );

  const renderDonePage = () => (
    <section className="panel done-screen">
      <h1 className="done-title">Conversion Complete</h1>
      {lastOutputPath ? (
        <div className="file-save-block">
          <p className="helper label">File saved as</p>
          <p className="saved-path">{lastOutputPath}</p>
        </div>
      ) : (
        <p className="helper">{status || "Conversion finished."}</p>
      )}
      <div className="inline-fields">
        <button
          className="ghost"
          onClick={() => {
            getCurrentWindow().close();
          }}
        >
          Exit
        </button>
        <button
          className="primary"
          onClick={() => {
            setSelectedFile("");
            setMediaInfo(null);
            setStatus("");
            setStep(1);
          }}
        >
          Convert another file
        </button>
      </div>
    </section>
  );

  const renderWelcome = () => (
    <section className="welcome-plain">
      <h1 className="brand-title">xhMPEG</h1>
      <p className="muted">Start by importing a media file to analyze and convert.</p>
      <button className="primary" onClick={pickMediaFile} disabled={loadingInfo}>
        {loadingInfo ? "Analyzing..." : "Begin"}
      </button>
    </section>
  );

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return renderWelcome();
      case 2:
        return renderTrimPage();
      case 3:
        return renderQualityPage();
      case 4:
        return renderOutputPage();
      case 5:
        return renderRunningPage();
      case 6:
        return renderDonePage();
      default:
        return renderWelcome();
    }
  };

  const canGoNext =
    mediaInfo &&
    ((step === 2 && durationMs > 0) ||
      step === 3 ||
      (step === 4 && outputDir && outputFilename));

  return (
    <div className="app">
      {step > 1 && (
        <div className="stepper">
          {[2, 3, 4, 5, 6].map((i) => (
            <div key={i} className={`step-line ${step === i ? "active" : ""}`} />
          ))}
        </div>
      )}

      <div key={step} className="step-content slide">
        {renderStepContent()}
      </div>

      {step >= 2 && step <= 4 && (
        <div className="wizard-nav">
          {step > 1 && step <= 4 && (
            <button className="ghost" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < 4 && (
            <button className="primary" onClick={() => setStep(step + 1)} disabled={!canGoNext}>
              Next
            </button>
          )}
        </div>
      )}

      {step >= 2 && step <= 4 && estimatedSizeText !== "--" && (
        <div className="est-inline">
          Estimated size: <span className="est-value-inline">{estimatedSizeText}</span>
        </div>
      )}

      {status && step !== 5 && step !== 6 && <div className="status">{status}</div>}
    </div>
  );
}

export default App;
