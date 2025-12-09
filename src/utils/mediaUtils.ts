export function joinPaths(dir: string, file: string): string {
  if (!dir) return file;
  if (dir.endsWith("/") || dir.endsWith("\\")) {
    return `${dir}${file}`;
  }
  const sep = dir.includes("\\") ? "\\" : "/";
  return `${dir}${sep}${file}`;
}

export function fileNameFromPath(path: string): string {
  return path.split(/[/\\]/).pop() ?? "";
}

export function parentDir(path: string): string {
  const match = path.match(/^(.*)[\\/][^\\/]+$/);
  return match && match[1] ? match[1] : "";
}

export function baseNameNoExt(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return name;
  return name.slice(0, dot);
}

export function formatHMS(ms: number): string {
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

export function buildResolutionOptions(sourceWidth: number, sourceHeight: number) {
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