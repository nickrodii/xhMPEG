import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { Store } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

type MediaInfo = {
  duration_seconds: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate_kbps?: number;
  has_video: boolean;
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
  { label: "Source", value: "source" },
  { label: "8000 kbps", value: "8000", amount: 8000 },
  { label: "6000 kbps", value: "6000", amount: 6000 },
  { label: "4000 kbps", value: "4000", amount: 4000 },
  { label: "2500 kbps", value: "2500", amount: 2500 },
  { label: "Custom", value: "custom" },
];

const AUDIO_BITRATE_PRESETS: NumericPreset[] = [
  { label: "Source", value: "source" },
  { label: "320 kbps", value: "320", amount: 320 },
  { label: "192 kbps", value: "192", amount: 192 },
  { label: "128 kbps", value: "128", amount: 128 },
  { label: "Custom", value: "custom" },
];

const FORMAT_OPTIONS: FormatOption[] = [
  { label: "MP4", value: "mp4", ext: "mp4" },
  { label: "MKV", value: "mkv", ext: "mkv" },
  { label: "MOV", value: "mov", ext: "mov" },
  { label: "WebM", value: "webm", ext: "webm" },
  { label: "AVI", value: "avi", ext: "avi" },
  { label: "FLV", value: "flv", ext: "flv" },
  { label: "Animated GIF", value: "gif", ext: "gif" },
];

const AUDIO_FORMAT_OPTIONS: FormatOption[] = [
  { label: "MP3", value: "mp3", ext: "mp3" },
  { label: "WAV", value: "wav", ext: "wav" },
  { label: "FLAC", value: "flac", ext: "flac" },
  { label: "AAC (M4A)", value: "m4a", ext: "m4a" },
  { label: "OGG", value: "ogg", ext: "ogg" },
  { label: "Opus", value: "opus", ext: "opus" },
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
  const [advancedMode, setAdvancedMode] = useState<boolean>(false);
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
  const [sourceResolution, setSourceResolution] = useState<{ width: number; height: number } | null>(null);

  const [fpsPreset, setFpsPreset] = useState<string>("source");
  const [customFps, setCustomFps] = useState<string>("");
  const [sourceFps, setSourceFps] = useState<number | null>(null);

  const [videoBitratePreset, setVideoBitratePreset] = useState<string>("source");
  const [customVideoBitrate, setCustomVideoBitrate] = useState<string>("");
  const [sourceVideoBitrate, setSourceVideoBitrate] = useState<number | null>(null);

  const [audioBitratePreset, setAudioBitratePreset] = useState<string>("192");
  const [customAudioBitrate, setCustomAudioBitrate] = useState<string>("");
  const [sourceAudioBitrate, setSourceAudioBitrate] = useState<number | null>(null);

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
  const isAudioOnly = mediaInfo ? !mediaInfo.has_video : false;

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

  const videoBitrateOptions = useMemo(() => {
    if (sourceVideoBitrate) {
      return [
        { label: `Source (${sourceVideoBitrate} kbps)`, value: "source", amount: sourceVideoBitrate } as NumericPreset,
        ...VIDEO_BITRATE_PRESETS.filter((p) => p.value !== "source"),
      ];
    }
    return VIDEO_BITRATE_PRESETS;
  }, [sourceVideoBitrate]);

  const audioBitrateValue = useMemo(() => {
    if (audioBitratePreset === "custom") {
      const v = parseInt(customAudioBitrate, 10);
      return Number.isFinite(v) ? v : undefined;
    }
    if (audioBitratePreset === "source") return sourceAudioBitrate ?? undefined;
    const preset = AUDIO_BITRATE_PRESETS.find((p) => p.value === audioBitratePreset);
    return preset?.amount;
  }, [audioBitratePreset, customAudioBitrate, sourceAudioBitrate]);

  const effectiveVideoBitrate = useMemo(() => {
    if (isAudioOnly) return 0;
    if (!videoBitrateValue) return 0;
    if (sourceFps && fpsValue) {
      return Math.round(videoBitrateValue * (fpsValue / sourceFps));
    }
    return videoBitrateValue;
  }, [isAudioOnly, videoBitrateValue, sourceFps, fpsValue]);

  const formatOptions = useMemo(() => (isAudioOnly ? AUDIO_FORMAT_OPTIONS : FORMAT_OPTIONS), [isAudioOnly]);

  const currentFormat = useMemo(() => {
    return formatOptions.find((f) => f.value === format) ?? formatOptions[0];
  }, [format, formatOptions]);

  const formatSizeMultiplier = useMemo(() => {
    if (isAudioOnly) {
      switch (currentFormat.value) {
        case "wav":
          return 3.8; // approximate PCM overhead relative to typical compressed kbps
        case "flac":
          return 0.7;
        case "opus":
          return 0.7;
        case "ogg":
          return 0.85;
        case "m4a":
          return 0.9;
        default:
          return 1;
      }
    }
    switch (currentFormat.value) {
      case "webm":
        return 0.85;
      case "mkv":
        return 0.95;
      case "mov":
        return 1.05;
      case "avi":
        return 1.15;
      case "flv":
        return 1.1;
      case "gif":
        return 2.5; // inefficient palette animation
      default:
        return 1;
    }
  }, [currentFormat.value, isAudioOnly]);

  useEffect(() => {
    if (currentFormat?.value !== format) {
      setFormat(currentFormat.value);
    }
  }, [currentFormat, format]);

  const resolutionScale = useMemo(() => {
    if (
      !isAudioOnly &&
      sourceResolution &&
      resolution.width &&
      resolution.height &&
      sourceResolution.width > 0 &&
      sourceResolution.height > 0
    ) {
      const baseArea = sourceResolution.width * sourceResolution.height;
      const targetArea = resolution.width * resolution.height;
      const scale = targetArea / baseArea;
      // Clamp to avoid extreme swings from tiny or huge values.
      return Math.min(1.5, Math.max(0.2, scale));
    }
    return 1;
  }, [isAudioOnly, resolution.height, resolution.width, sourceResolution]);

  const finalOutputPath = useMemo(() => {
    const base = outputFilename.replace(/\.[^/.]+$/, "") || "output";
    const nameWithExt = `${base}.${currentFormat.ext}`;
    if (!outputDir) return nameWithExt;
    return joinPaths(outputDir, nameWithExt);
  }, [outputDir, outputFilename, currentFormat]);

  const estimatedSizeText = useMemo(() => {
    if (!clipLengthSeconds) return "--";
    const totalKbps = (effectiveVideoBitrate ?? 0) * resolutionScale + (audioBitrateValue ?? 0);
    if (!totalKbps) return "--";
    const bytes = (totalKbps * formatSizeMultiplier * 1000 * clipLengthSeconds) / 8;
    const mb = bytes / (1024 * 1024);
    if (mb < 1024) {
      return `${mb.toFixed(1)} MB`;
    }
    const gb = mb / 1024;
    return `${gb.toFixed(2)} GB`;
  }, [clipLengthSeconds, videoBitrateValue, audioBitrateValue, formatSizeMultiplier, effectiveVideoBitrate, resolutionScale]);

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
        {
          name: "Media",
          extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v", "mp3", "wav", "aac", "flac", "ogg"],
        },
      ],
    });
    if (!selected || Array.isArray(selected)) return;
    setSelectedFile(selected);
    setMediaInfo(null);
    setLoadingInfo(true);
    try {
      const info = await invoke<MediaInfo>("analyze_media", { path: selected });
      setMediaInfo(info);
      setSourceAudioBitrate(info.bitrate_kbps ?? null);
      if (info.bitrate_kbps) {
        setCustomAudioBitrate(String(info.bitrate_kbps));
        setAudioBitratePreset("source");
      } else {
        setAudioBitratePreset("192");
      }
      if (info.has_video && info.width && info.height) {
        setSourceResolution({ width: info.width, height: info.height });
        setResolutionOptions(buildResolutionOptions(info.width, info.height));
        setResolutionPreset("source");
        setSourceVideoBitrate(info.bitrate_kbps ?? null);
        setSourceFps(info.fps ?? null);
        setFpsPreset("source");
        if (info.bitrate_kbps) {
          setVideoBitratePreset("source");
        } else {
          setVideoBitratePreset("8000");
        }
      } else {
        setResolutionOptions([]);
        setResolutionPreset("source");
        setSourceVideoBitrate(null);
        setSourceFps(null);
        setFpsPreset("source");
        setVideoBitratePreset("source");
      }
      setStartMs(0);
      const end = Math.round(info.duration_seconds * 1000);
      setEndMs(end);
      const base = baseNameNoExt(fileNameFromPath(selected)) || "output";
      setOutputFilename(`${base}_converted`);
      setFormat(info.has_video ? "mp4" : "mp3");
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
          is_audio_only: isAudioOnly,
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

  const handleMinimize = async () => {
    const win = getCurrentWindow();
    await win.minimize();
  };

  const handleClose = async () => {
    const win = getCurrentWindow();
    await win.close();
  };

  const handleTopBarMouseDown = async (e: ReactMouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest(".no-drag")) return;
    try {
      await getCurrentWindow().startDragging();
    } catch (err) {
      console.error("Drag failed", err);
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
          className={resolutionPreset === "custom" ? "custom-select" : ""}
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
          className={fpsPreset === "custom" ? "custom-select" : ""}
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
            placeholder="fps"
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
          className={videoBitratePreset === "custom" ? "custom-select" : ""}
          value={videoBitratePreset}
          onChange={(e) => setVideoBitratePreset(e.target.value)}
          disabled={!mediaInfo}
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
            {formatOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
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

  const renderAdvancedPage = () => (
    <>
      {renderTrimPage()}
      {renderQualityPage()}
      {renderOutputPage()}
      <div className="wizard-nav" style={{ justifyContent: "flex-end" }}>
        <button
          className="run-cta"
          onClick={runConversion}
          disabled={!mediaInfo || conversionRunning}
        >
          {conversionRunning ? "Converting..." : "Run"}
        </button>
      </div>
    </>
  );

  const renderWelcome = () => (
    <section className="welcome-plain">
      <h1 className="brand-title">xhMPEG</h1>
      <p className="muted welcome-subtitle">
        Trim, resize, and reformat any audio or video file using FFmpeg... Without the terminal.
      </p>
      <button
        className="primary"
        onClick={pickMediaFile}
        disabled={loadingInfo}
        style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 20h16" />
          <path d="M12 4v9" />
          <path d="m8 10 4 4 4-4" />
        </svg>
        {loadingInfo ? "Analyzing..." : "Import media"}
      </button>
    </section>
  );

  const renderSettingsPage = () => (
    <>
      <h2 className="settings-heading">Settings</h2>
      <section className="panel settings-panel">
        <label className="advanced-toggle">
          <input
            type="checkbox"
            checked={advancedMode}
            onChange={(e) => setAdvancedMode(e.target.checked)}
          />
          <span className="label">Advanced Mode</span>
        </label>
      </section>
    </>
  );

  const renderStepContent = () => {
    if (advancedMode && mediaInfo) {
      return renderAdvancedPage();
    }
    switch (step) {
      case 0:
        return renderSettingsPage();
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
      (!isAudioOnly && step === 3) ||
      (step === 4 && outputDir && outputFilename));

  const showWizardNav = !(advancedMode && mediaInfo);
  const showStepper = showWizardNav && step > 1;

  return (
    <div className="app">
      <div
        className={`top-bar drag-region ${step === 1 ? "top-bar-welcome" : ""} ${step === 0 ? "top-bar-settings" : ""}`}
        data-tauri-drag-region
        onMouseDown={handleTopBarMouseDown}
      >
        <div className="brand-top drag-region" data-tauri-drag-region>
          {step > 1 && <h1 className="brand-title brand-small">xhMPEG</h1>}
        </div>
        <div className="window-controls no-drag" data-tauri-drag-region="false">
          <button
            type="button"
            className="window-btn no-drag"
            onClick={handleMinimize}
            title="Minimize"
            data-tauri-drag-region="false"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg
              className="no-drag"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
            >
              <line x1="3" y1="7" x2="11" y2="7" />
            </svg>
          </button>
          <button
            type="button"
            className="window-btn no-drag"
            onClick={handleClose}
            title="Close"
            data-tauri-drag-region="false"
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <svg
              className="no-drag"
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.2"
              strokeLinecap="round"
            >
              <line x1="3.5" y1="3.5" x2="10.5" y2="10.5" />
              <line x1="10.5" y1="3.5" x2="3.5" y2="10.5" />
            </svg>
          </button>
        </div>
      </div>

      {step === 1 && (
        <button className="settings-btn no-drag" title="Settings" onClick={() => setStep(0)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
          <span className="settings-tab">Settings</span>
        </button>
      )}
      {step === 0 && (
        <button className="settings-btn no-drag" title="Back" onClick={() => setStep(1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
            <line x1="9" y1="12" x2="21" y2="12" />
          </svg>
          <span className="settings-tab">Back</span>
        </button>
      )}

      {showStepper && (
        <div
          className="stepper"
          style={{ gridTemplateColumns: `repeat(${(isAudioOnly ? 4 : 5)}, 1fr)` }}
        >
          {(isAudioOnly ? [2, 4, 5, 6] : [2, 3, 4, 5, 6]).map((i) => (
            <div key={i} className={`step-line ${step === i ? "active" : ""}`} />
          ))}
        </div>
      )}

      <div key={step} className="step-content slide">
        {renderStepContent()}
      </div>

      {showWizardNav && step >= 2 && step <= 4 && (
        <div className="wizard-nav">
          {step > 1 && step <= 4 && (
            <button
              className="ghost"
              onClick={() => {
                if (isAudioOnly && step === 4) {
                  setStep(2);
                } else if (step > 1) {
                  setStep(step - 1);
                } else {
                  setStep(1);
                }
              }}
            >
              Back
            </button>
          )}
          {step < 4 && (
            <button
              className="primary"
              onClick={() => {
                if (isAudioOnly && step === 2) {
                  setStep(4);
                } else {
                  setStep(step + 1);
                }
              }}
              disabled={!canGoNext}
            >
              Next
            </button>
          )}
          {step === 4 && (
            <button
              className="run-cta"
              onClick={runConversion}
              disabled={!mediaInfo || conversionRunning}
            >
              {conversionRunning ? "Converting..." : "Run"}
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
