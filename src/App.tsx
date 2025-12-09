import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { revealItemInDir, openUrl } from "@tauri-apps/plugin-opener";
import { Store } from "@tauri-apps/plugin-store";
import { getCurrentWindow } from "@tauri-apps/api/window";
import "./App.css";

// Components
import { WelcomePage } from "./components/WelcomePage";
import { SettingsPage } from "./components/SettingsPage";
import { RunningPage } from "./components/RunningPage";
import { DonePage } from "./components/DonePage";
import { OutputPage } from "./components/OutputPage";
import { QualityPage } from "./components/QualityPage";
import { AdvancedPage } from "./components/AdvancedPage";

// Utils
import {
  joinPaths,
  fileNameFromPath,
  parentDir,
  baseNameNoExt,
  formatHMS,
  buildResolutionOptions
} from "./utils/mediaUtils";

// Constants
import {
  type MediaInfo,
  type NumericPreset,
  FPS_PRESETS,
  VIDEO_BITRATE_PRESETS,
  AUDIO_BITRATE_PRESETS,
  FORMAT_OPTIONS,
  AUDIO_FORMAT_OPTIONS,
  VIDEO_CODECS_BY_FORMAT,
  AUDIO_CODECS_BY_FORMAT,
  SETTINGS_STORE_FILE
} from "./config/constants";
import { TrimPage } from "./components/TrimPage";

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
  const [autoOpenExit, setAutoOpenExit] = useState<boolean>(false);
  const [enableCodecSelection, setEnableCodecSelection] = useState<boolean>(false);

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
  const [forceAudioOnly, setForceAudioOnly] = useState<boolean>(false);
  const [selectedCodec, setSelectedCodec] = useState<string>("");

  const storeRef = useRef<Store | null>(null);
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);

  useEffect(() => {
    // Keep the window fixed size to prevent layout issues.
    getCurrentWindow()
      .setResizable(false)
      .catch((err) => console.error("Failed to lock window size", err));

    let cancelled = false;
    (async () => {
      try {
        const store = await Store.load(SETTINGS_STORE_FILE);
        storeRef.current = store;
        const saved = await store.get<string>("lastOutputDir");
        if (saved && !cancelled) setOutputDir(saved);
        const savedAuto = await store.get<boolean>("autoOpenExit");
        if (typeof savedAuto === "boolean" && !cancelled) setAutoOpenExit(savedAuto);
        const savedAdvanced = await store.get<boolean>("advancedMode");
        if (typeof savedAdvanced === "boolean" && !cancelled) setAdvancedMode(savedAdvanced);
        const savedCodecSetting = await store.get<boolean>("enableCodecSelection");
        if (typeof savedCodecSetting === "boolean" && !cancelled) setEnableCodecSelection(savedCodecSetting);
      } catch (err) {
        console.error("Failed to load store", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const durationMs = mediaInfo ? Math.round(mediaInfo.duration_seconds * 1000) : 0;
  const hasVideoSource = mediaInfo ? mediaInfo.has_video : false;
  const isAudioOnly = !hasVideoSource || forceAudioOnly;
  const wizardIsAudioOnly = !hasVideoSource;

  const getAvailableCodecs = useCallback(
    (fmt: string, audioOnly: boolean) => {
      return audioOnly ? AUDIO_CODECS_BY_FORMAT[fmt] ?? [] : VIDEO_CODECS_BY_FORMAT[fmt] ?? [];
    },
    []
  );

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

  const codecOptions = useMemo(() => getAvailableCodecs(currentFormat.value, isAudioOnly), [currentFormat.value, getAvailableCodecs, isAudioOnly]);

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
    const selected = await openDialog({
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
      setForceAudioOnly(!info.has_video);
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
    const dir = await openDialog({ directory: true, multiple: false });
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

  const updateAdvancedMode = async (value: boolean) => {
    setAdvancedMode(value);
    if (storeRef.current) {
      try {
        await storeRef.current.set("advancedMode", value);
        await storeRef.current.save();
      } catch (err) {
        console.error("Failed to save advanced mode setting", err);
      }
    }
  };

  const updateAutoOpenExit = async (value: boolean) => {
    setAutoOpenExit(value);
    if (storeRef.current) {
      try {
        await storeRef.current.set("autoOpenExit", value);
        await storeRef.current.save();
      } catch (err) {
        console.error("Failed to save auto-open setting", err);
      }
    }
  };

  const openOutputLocation = async () => {
    if (!lastOutputPath) return;
    try {
      await revealItemInDir(lastOutputPath);
      setStatus("");
    } catch (err) {
      console.error("Failed to open output folder", err);
      setStatus("Couldn't open the output folder.");
    }
  };

  const updateEnableCodecSelection = async (value: boolean) => {
    setEnableCodecSelection(value);
    if (!value) {
      setSelectedCodec("");
    }
    if (storeRef.current) {
      try {
        await storeRef.current.set("enableCodecSelection", value);
        await storeRef.current.save();
      } catch (err) {
        console.error("Failed to save codec selection setting", err);
      }
    }
  };

  const updateForceAudioOnly = (value: boolean) => {
    setForceAudioOnly(value);
    if (value) {
      if (!AUDIO_FORMAT_OPTIONS.some((opt) => opt.value === format)) {
        setFormat(AUDIO_FORMAT_OPTIONS[0].value);
      }
    } else if (mediaInfo?.has_video) {
      if (!FORMAT_OPTIONS.some((opt) => opt.value === format)) {
        setFormat("mp4");
      }
    }
  };

  const autoOpenAndExitIfEnabled = async (outputPath: string) => {
    if (!autoOpenExit) return;
    try {
      await revealItemInDir(outputPath);
    } catch (err) {
      console.error("Failed to auto-open output folder", err);
    }
    try {
      await getCurrentWindow().close();
    } catch (err) {
      console.error("Failed to exit after auto-open", err);
    }
  };

  useEffect(() => {
    if (!enableCodecSelection) {
      setSelectedCodec("");
      return;
    }
    const list = getAvailableCodecs(format, isAudioOnly);
    if (!list.length) {
      setSelectedCodec("");
    } else if (!list.includes(selectedCodec)) {
      setSelectedCodec(list[0]);
    }
  }, [enableCodecSelection, format, getAvailableCodecs, isAudioOnly, selectedCodec]);

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
          video_codec: enableCodecSelection && !isAudioOnly && selectedCodec ? selectedCodec : null,
          audio_codec: enableCodecSelection && isAudioOnly && selectedCodec ? selectedCodec : null,
        },
      });
      setStatus("");
      setStep(6);
      await autoOpenAndExitIfEnabled(outputPath);
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

  const resetForNewFile = () => {
    setSelectedFile("");
    setMediaInfo(null);
    setStatus("");
    setLastOutputPath("");
    setStep(1);
  };

  const renderStepContent = () => {
    if (step === 5) return (
      <RunningPage/>
    )
    if (step === 6) return (
      <DonePage 
        lastOutputPath={lastOutputPath}
        status={status}
        onConvertAnother={resetForNewFile}
        onOpenLocation={openOutputLocation}
        onExit={() => getCurrentWindow().close()}
        />
    );
    if (advancedMode && mediaInfo && step >= 2) {
      return (
        <AdvancedPage
          // Media & State
          mediaInfo={mediaInfo}
          isAudioOnly={isAudioOnly}
          conversionRunning={conversionRunning}

          // Trim
          startMs={startMs}
          endMs={endMs}
          durationMs={durationMs}
          sliderRef={sliderRef}
          setDragging={setDragging}
          handlePointerMove={handlePointerMove}

          // Output
          outputDir={outputDir}
          pickOutputDir={pickOutputDir}
          outputFilename={outputFilename}
          setOutputFilename={setOutputFilename}

          // Format & Codec
          format={format}
          setFormat={setFormat}
          formatOptions={formatOptions}
          currentFormat={currentFormat}
          enableCodecSelection={enableCodecSelection}
          selectedCodec={selectedCodec}
          setSelectedCodec={setSelectedCodec}
          codecOptions={codecOptions}

          // Quality
          resolutionPreset={resolutionPreset}
          setResolutionPreset={setResolutionPreset}
          resolutionOptions={resolutionOptions}
          customWidth={customWidth}
          setCustomWidth={setCustomWidth}
          customHeight={customHeight}
          setCustomHeight={setCustomHeight}

          fpsPreset={fpsPreset}
          setFpsPreset={setFpsPreset}
          fpsOptions={fpsOptions}
          customFps={customFps}
          setCustomFps={setCustomFps}

          videoBitratePreset={videoBitratePreset}
          setVideoBitratePreset={setVideoBitratePreset}
          videoBitrateOptions={videoBitrateOptions}
          customVideoBitrate={customVideoBitrate}
          setCustomVideoBitrate={setCustomVideoBitrate}

          // Audio Toggle
          forceAudioOnly={forceAudioOnly}
          updateForceAudioOnly={updateForceAudioOnly}

          // Actions
          onRun={runConversion}
          onBack={() => {
            // The logic from your original Back button
            setSelectedFile("");
            setMediaInfo(null);
            setStatus("");
            setLastOutputPath("");
            setStep(1);
          }}
        />
      );
    }
    switch (step) {
      case 0:
        return (
          <SettingsPage
            advancedMode={advancedMode}
            setAdvancedMode={updateAdvancedMode}

            autoOpenExit={autoOpenExit}
            setAutoOpenExit={updateAutoOpenExit}

            enableCodecSelection={enableCodecSelection}
            setEnableCodecSelection={updateEnableCodecSelection}
          />
        );
      case 1:
        return (
          <WelcomePage
            onPickMedia={pickMediaFile}
            loading={loadingInfo}
          />
        );
      case 2:
        return (
          <TrimPage
            startMs={startMs}
            endMs={endMs}
            durationMs={durationMs}
            sliderRef={sliderRef}
            setDragging={setDragging}
            handlePointerMove={handlePointerMove}
            />
        );
      case 3:
        return (
          <QualityPage
            mediaInfo={mediaInfo}
            isAudioOnly={isAudioOnly}
            resolutionPreset={resolutionPreset}
            setResolutionPreset={setResolutionPreset}
            resolutionOptions={resolutionOptions}
            customWidth={customWidth}
            setCustomWidth={setCustomWidth}
            customHeight={customHeight}
            setCustomHeight={setCustomHeight}
            fpsPreset={fpsPreset}
            setFpsPreset={setFpsPreset}
            fpsOptions={fpsOptions}
            customFps={customFps}
            setCustomFps={setCustomFps}
            videoBitratePreset={videoBitratePreset}
            setVideoBitratePreset={setVideoBitratePreset}
            videoBitrateOptions={videoBitrateOptions}
            customVideoBitrate={customVideoBitrate}
            setCustomVideoBitrate={setCustomVideoBitrate}
            forceAudioOnly={forceAudioOnly}
            updateForceAudioOnly={updateForceAudioOnly}
            />
        );
      case 4:
        return (
          <OutputPage
            mediaInfo={mediaInfo}
            outputDir={outputDir}
            outputFilename={outputFilename}
            setOutputFilename={setOutputFilename}
            format={format}
            setFormat={setFormat}
            selectedCodec={selectedCodec}
            setSelectedCodec={setSelectedCodec}
            formatOptions={formatOptions}
            currentFormat={currentFormat}
            enableCodecSelection={enableCodecSelection}
            codecOptions={codecOptions}
            onBrowse={pickOutputDir}
            />
        );
      default:
        return (
          <WelcomePage
            onPickMedia={pickMediaFile}
            loading={loadingInfo}
            />
        );
    }
  };

  const canGoNext =
    mediaInfo &&
    ((step === 2 && durationMs > 0) || step === 3 || (step === 4 && outputDir && outputFilename));

  const showWizardNav = !(advancedMode && mediaInfo);
  const showStepper = showWizardNav && step > 1;

  const isAdvancedView = advancedMode && mediaInfo && step >= 2;

  return (
    <div className={`app ${isAdvancedView ? "advanced-view" : ""}`}>
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
        <>
          <button
            className="donate-btn no-drag"
            title="Support my work"
            onClick={() => {
              openUrl("https://www.paypal.com/donate/?business=2XHBCR8TMFA3N&no_recurring=0&currency_code=USD").catch(
                (err) => console.error("Failed to open donate link", err),
              );
            }}
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
              <path d="M12 21s-6-4.35-9-9a5.25 5.25 0 0 1 8.1-6.45L12 6l.9-.45A5.25 5.25 0 0 1 21 12c-3 4.65-9 9-9 9Z" />
            </svg>
            <span className="donate-tab">Support my work</span>
          </button>
          <button className="settings-btn no-drag" title="Settings" onClick={() => setStep(0)}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
            </svg>
            <span className="settings-tab">Settings</span>
          </button>
        </>
      )}
      {step === 0 && (
        <button className="settings-btn no-drag" title="Back" onClick={() => setStep(1)}>
          <svg width="22" height="18" viewBox="0 0 26 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="16 18 8 12 16 6" />
            <line x1="8" y1="12" x2="24" y2="12" />
          </svg>
          <span className="settings-tab">Back</span>
        </button>
      )}

      {showStepper && (
        <div
          className="stepper"
          style={{ gridTemplateColumns: `repeat(${(wizardIsAudioOnly ? 4 : 5)}, 1fr)` }}
        >
          {(wizardIsAudioOnly ? [2, 4, 5, 6] : [2, 3, 4, 5, 6]).map((i) => (
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
                if (wizardIsAudioOnly && step === 4) {
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
                if (wizardIsAudioOnly && step === 2) {
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

      {status && step !== 5 && <div className="status">{status}</div>}
    </div>
  );
}

export default App;
