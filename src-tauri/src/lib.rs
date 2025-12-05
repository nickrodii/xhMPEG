use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct MediaInfo {
    duration_seconds: f64,
    width: u32,
    height: u32,
    fps: f64,
    bitrate_kbps: u64,
}

#[derive(Debug, Deserialize)]
pub struct ConversionOptions {
    input_path: String,
    output_path: String,
    start_ms: u64,
    end_ms: u64,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    video_bitrate_kbps: Option<u64>,
    audio_bitrate_kbps: Option<u64>,
    format: Option<String>,
}

#[tauri::command]
async fn analyze_media(path: String) -> Result<MediaInfo, String> {
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-print_format",
                "json",
                "-show_format",
                "-show_streams",
                &path,
            ])
            .output()
    })
    .await
    .map_err(|e| format!("Failed to join ffprobe task: {e}"))?
    .map_err(|e| format!("Failed to run ffprobe: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe error: {stderr}"));
    }

    let value: Value = serde_json::from_slice(&output.stdout)
        .map_err(|e| format!("Failed to parse ffprobe JSON: {e}"))?;
    parse_media_info(value)
}

fn parse_media_info(value: Value) -> Result<MediaInfo, String> {
    let format = value
        .get("format")
        .ok_or_else(|| "Missing format section".to_string())?;

    let duration_seconds = format
        .get("duration")
        .and_then(|d| d.as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .ok_or_else(|| "Missing duration".to_string())?;

    let streams = value
        .get("streams")
        .and_then(|s| s.as_array())
        .ok_or_else(|| "Missing streams".to_string())?;

    let video_stream = streams
        .iter()
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"))
        .ok_or_else(|| "No video stream found".to_string())?;

    let width = video_stream
        .get("width")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "Missing width".to_string())? as u32;
    let height = video_stream
        .get("height")
        .and_then(|v| v.as_u64())
        .ok_or_else(|| "Missing height".to_string())? as u32;

    let fps = video_stream
        .get("avg_frame_rate")
        .and_then(|v| v.as_str())
        .and_then(parse_frame_rate)
        .or_else(|| {
            video_stream
                .get("r_frame_rate")
                .and_then(|v| v.as_str())
                .and_then(parse_frame_rate)
        })
        .unwrap_or(0.0);

    let bitrate_kbps = format
        .get("bit_rate")
        .and_then(|b| b.as_str())
        .and_then(|s| s.parse::<u64>().ok())
        .or_else(|| {
            video_stream
                .get("bit_rate")
                .and_then(|b| b.as_str())
                .and_then(|s| s.parse::<u64>().ok())
        })
        .map(|b| b / 1000)
        .unwrap_or(0);

    Ok(MediaInfo {
        duration_seconds,
        width,
        height,
        fps,
        bitrate_kbps,
    })
}

fn parse_frame_rate(rate: &str) -> Option<f64> {
    if let Some((num, den)) = rate.split_once('/') {
        let num: f64 = num.parse().ok()?;
        let den: f64 = den.parse().ok()?;
        if den == 0.0 {
            None
        } else {
            Some(num / den)
        }
    } else {
        rate.parse::<f64>().ok()
    }
}

#[tauri::command]
async fn run_conversion(options: ConversionOptions) -> Result<(), String> {
    if options.end_ms <= options.start_ms {
        return Err("End time must be greater than start time".to_string());
    }

    let args = build_ffmpeg_args(&options)?;

    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new("ffmpeg").args(&args).output()
    })
    .await
    .map_err(|e| format!("Failed to join ffmpeg task: {e}"))?
    .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffmpeg failed: {stderr}"));
    }

    Ok(())
}

fn build_ffmpeg_args(options: &ConversionOptions) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = Vec::new();
    args.push("-y".to_string());

    let start_secs = options.start_ms as f64 / 1000.0;
    let duration_secs = (options.end_ms - options.start_ms) as f64 / 1000.0;

    if start_secs > 0.0 {
        args.push("-ss".to_string());
        args.push(format!("{start_secs:.3}"));
    }

    args.push("-i".to_string());
    args.push(options.input_path.clone());

    args.push("-t".to_string());
    args.push(format!("{duration_secs:.3}"));

    let mut filters: Vec<String> = Vec::new();
    if let (Some(w), Some(h)) = (options.width, options.height) {
        filters.push(format!("scale={w}:{h}"));
    }
    if let Some(fps) = options.fps {
        filters.push(format!("fps={fps}"));
    }
    if !filters.is_empty() {
        args.push("-vf".to_string());
        args.push(filters.join(","));
    }

    args.push("-c:v".to_string());
    args.push("libx264".to_string());
    args.push("-preset".to_string());
    args.push("medium".to_string());

    if let Some(vb) = options.video_bitrate_kbps {
        args.push("-b:v".to_string());
        args.push(format!("{vb}k"));
    }

    args.push("-c:a".to_string());
    args.push("aac".to_string());
    if let Some(ab) = options.audio_bitrate_kbps {
        args.push("-b:a".to_string());
        args.push(format!("{ab}k"));
    }

    match options.format.as_deref() {
        Some("mp4") | None => {
            args.push("-movflags".to_string());
            args.push("+faststart".to_string());
        }
        Some("mkv") => {}
        Some(other) => return Err(format!("Unsupported format: {other}")),
    }

    args.push("-pix_fmt".to_string());
    args.push("yuv420p".to_string());

    args.push(options.output_path.clone());
    Ok(args)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![analyze_media, run_conversion])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
