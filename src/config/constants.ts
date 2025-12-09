export type MediaInfo = {
  duration_seconds: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrate_kbps?: number;
  has_video: boolean;
};

export type NumericPreset = {
  label: string;
  value: string;
  amount?: number;
};

export type FormatOption = {
  label: string;
  value: string;
  ext: string;
};

export const FPS_PRESETS: NumericPreset[] = [
  { label: "60 fps", value: "60", amount: 60 },
  { label: "30 fps", value: "30", amount: 30 },
  { label: "24 fps", value: "24", amount: 24 },
  { label: "Custom", value: "custom" },
];

export const VIDEO_BITRATE_PRESETS: NumericPreset[] = [
  { label: "Source", value: "source" },
  { label: "8000 kbps", value: "8000", amount: 8000 },
  { label: "6000 kbps", value: "6000", amount: 6000 },
  { label: "4000 kbps", value: "4000", amount: 4000 },
  { label: "2500 kbps", value: "2500", amount: 2500 },
  { label: "Custom", value: "custom" },
];

// I dont want TS HERE. I will phase this out soon
export const AUDIO_BITRATE_PRESETS: NumericPreset[] = [
    { label: "Source", value: "source" }
];

export const FORMAT_OPTIONS: FormatOption[] = [
  { label: "MP4", value: "mp4", ext: "mp4" },
  { label: "MKV", value: "mkv", ext: "mkv" },
  { label: "MOV", value: "mov", ext: "mov" },
  { label: "WebM", value: "webm", ext: "webm" },
  { label: "AVI", value: "avi", ext: "avi" },
  { label: "FLV", value: "flv", ext: "flv" },
  { label: "GIF", value: "gif", ext: "gif" },
];

export const AUDIO_FORMAT_OPTIONS: FormatOption[] = [
  { label: "MP3", value: "mp3", ext: "mp3" },
  { label: "WAV", value: "wav", ext: "wav" },
  { label: "FLAC", value: "flac", ext: "flac" },
  { label: "AAC", value: "m4a", ext: "m4a" },
  { label: "OGG", value: "ogg", ext: "ogg" },
  { label: "Opus", value: "opus", ext: "opus" },
];

export const VIDEO_CODECS_BY_FORMAT: Record<string, string[]> = {
  mp4: ["libx264", "libx265"],
  mov: ["libx264", "libx265", "prores_ks", "mjpeg"],
  mkv: ["libx264", "libx265", "libvpx-vp9", "prores_ks", "mjpeg"],
  webm: ["libvpx-vp9"],
  avi: ["libx264", "mjpeg"],
  flv: ["libx264"],
  gif: ["gif"],
};

export const AUDIO_CODECS_BY_FORMAT: Record<string, string[]> = {
  mp4: ["aac", "libmp3lame"],
  mov: ["aac"],
  mkv: ["aac", "libopus", "libvorbis", "libmp3lame", "flac"],
  webm: ["libopus", "libvorbis"],
  avi: ["libmp3lame"],
  flv: ["aac"],
  gif: [],
  mp3: ["libmp3lame"],
  wav: ["pcm_s16le"],
  flac: ["flac"],
  m4a: ["aac"],
  ogg: ["libvorbis"],
  opus: ["libopus"],
};

export const SETTINGS_STORE_FILE = "settings.json";