use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;

#[derive(Debug, Serialize)]
pub struct MediaInfo {
    duration_seconds: f64,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f64>,
    bitrate_kbps: Option<u64>,
    has_video: bool,
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
    is_audio_only: bool,
    video_codec: Option<String>,
    audio_codec: Option<String>,
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
        .find(|s| s.get("codec_type").and_then(|c| c.as_str()) == Some("video"));

    let has_video = video_stream.is_some();

    let (width, height, fps) = if let Some(vs) = video_stream {
        let w = vs.get("width").and_then(|v| v.as_u64()).map(|v| v as u32);
        let h = vs.get("height").and_then(|v| v.as_u64()).map(|v| v as u32);
        let fps_val = vs
            .get("avg_frame_rate")
            .and_then(|v| v.as_str())
            .and_then(parse_frame_rate)
            .or_else(|| {
                vs.get("r_frame_rate")
                    .and_then(|v| v.as_str())
                    .and_then(parse_frame_rate)
            });
        (w, h, fps_val)
    } else {
        (None, None, None)
    };

    let bitrate_kbps = format
        .get("bit_rate")
        .and_then(|b| b.as_str())
        .and_then(|s| s.parse::<u64>().ok())
        .or_else(|| {
            video_stream.and_then(|vs| {
                vs.get("bit_rate")
                    .and_then(|b| b.as_str())
                    .and_then(|s| s.parse::<u64>().ok())
            })
        })
        .map(|b| b / 1000);

    Ok(MediaInfo {
        duration_seconds,
        width,
        height,
        fps,
        bitrate_kbps,
        has_video,
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

fn video_codecs_for_format(fmt: &str) -> Vec<&'static str> {
    match fmt {
        "mp4" => vec!["libx264", "libx265"],
        "mov" => vec!["libx264", "libx265", "prores_ks", "mjpeg"],
        "mkv" => vec!["libx264", "libx265", "libvpx-vp9", "prores_ks", "mjpeg"],
        "webm" => vec!["libvpx-vp9"],
        "avi" => vec!["libx264", "mjpeg"],
        "flv" => vec!["libx264"],
        "gif" => vec!["gif"],
        _ => vec![],
    }
}

fn audio_codecs_for_format(fmt: &str) -> Vec<&'static str> {
    match fmt {
        "mp4" => vec!["aac", "libmp3lame"],
        "mov" => vec!["aac"],
        "mkv" => vec!["aac", "libopus", "libvorbis", "libmp3lame", "flac"],
        "webm" => vec!["libopus", "libvorbis"],
        "avi" => vec!["libmp3lame"],
        "flv" => vec!["aac"],
        "gif" => vec![],
        "mp3" => vec!["libmp3lame"],
        "wav" => vec!["pcm_s16le"],
        "flac" => vec!["flac"],
        "m4a" | "aac" => vec!["aac"],
        "ogg" => vec!["libvorbis"],
        "opus" => vec!["libopus"],
        _ => vec![],
    }
}

fn build_ffmpeg_args(options: &ConversionOptions) -> Result<Vec<String>, String> {
    let mut args: Vec<String> = Vec::new();
    args.push("-y".to_string());

    let format = options.format.as_deref().unwrap_or("mp4");
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

    if options.is_audio_only {
        let allowed_audio = audio_codecs_for_format(format);
        if allowed_audio.is_empty() {
            return Err(format!("No audio codecs available for format: {format}"));
        }
        let audio_codec = if let Some(ref user) = options.audio_codec {
            if allowed_audio.iter().any(|c| c == user) {
                user.as_str()
            } else {
                return Err(format!("Audio codec {user} not allowed for format {format}"));
            }
        } else {
            allowed_audio[0]
        };
        args.push("-vn".to_string());
        args.push("-c:a".to_string());
        args.push(audio_codec.to_string());
        if let Some(ab) = options.audio_bitrate_kbps {
            args.push("-b:a".to_string());
            args.push(format!("{ab}k"));
        }
    } else {
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

        let allowed_video = video_codecs_for_format(format);
        if allowed_video.is_empty() {
            return Err(format!("No video codecs available for format: {format}"));
        }
        let mut video_codec = if let Some(ref user) = options.video_codec {
            if allowed_video.iter().any(|c| c == user) {
                user.as_str()
            } else {
                return Err(format!("Video codec {user} not allowed for format {format}"));
            }
        } else {
            allowed_video[0]
        };

        let mut audio_codec: Option<&str>;
        let mut add_x264_preset = true;
        let mut pix_fmt: Option<&str> = Some("yuv420p");
        let mut extra: Vec<String> = Vec::new();

        let allowed_audio = audio_codecs_for_format(format);
        audio_codec = if let Some(ref user) = options.audio_codec {
            if allowed_audio.iter().any(|c| c == user) {
                Some(user.as_str())
            } else if !allowed_audio.is_empty() {
                Some(allowed_audio[0])
            } else {
                None
            }
        } else {
            allowed_audio.first().copied()
        };

        if video_codec == "prores_ks" {
            pix_fmt = Some("yuv422p10le");
            extra.push("-profile:v".to_string());
            extra.push("3".to_string()); // standard quality
        } else if video_codec == "mjpeg" {
            pix_fmt = Some("yuvj422p");
        }

        match format {
            "mp4" | "mov" => {
                extra.push("-movflags".to_string());
                extra.push("+faststart".to_string());
            }
            "mkv" => {}
            "webm" => {
                video_codec = "libvpx-vp9";
                audio_codec = Some("libopus");
                add_x264_preset = false;
            }
            "avi" => {
                audio_codec = Some("mp3");
            }
            "flv" => {
                audio_codec = Some("aac");
            }
            "gif" => {
                video_codec = "gif";
                audio_codec = None;
                add_x264_preset = false;
                pix_fmt = Some("rgb8");
                extra.push("-an".to_string());
                extra.push("-loop".to_string());
                extra.push("0".to_string());
            }
            other => return Err(format!("Unsupported format: {other}")),
        }

        args.push("-c:v".to_string());
        args.push(video_codec.to_string());
        if add_x264_preset && video_codec == "libx264" {
            args.push("-preset".to_string());
            args.push("medium".to_string());
        }

        if let Some(vb) = options.video_bitrate_kbps {
            // Skip setting a bitrate for GIF; the encoder will choose based on palette.
            if video_codec != "gif" {
                args.push("-b:v".to_string());
                args.push(format!("{vb}k"));
            }
        }

        if let Some(ac) = audio_codec {
            args.push("-c:a".to_string());
            args.push(ac.to_string());
            if let Some(ab) = options.audio_bitrate_kbps {
                args.push("-b:a".to_string());
                args.push(format!("{ab}k"));
            }
        }

        args.extend(extra);

        if let Some(fmt) = pix_fmt {
            args.push("-pix_fmt".to_string());
            args.push(fmt.to_string());
        }
    }

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
