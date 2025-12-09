# xhMPEG

### **xhMPEG is a program for that allows you to do very basic FFmpeg operations with an extremely simple GUI**

*Honest note: I do not want to officially release this program until I am sure all of the significant code is produced by me (and not an LLM).
The skills demonstrated at the bottom are written according to the code that I came up with and coded myself. Thanks for understanding.*

## Features

- Video format conversion to mp4, mkv, mov, WebM, avi, flv, and even gif
- Audio format conversions to mp3, wav, flac, aac, ogg, and Opus
- Variety of codecs to choose from each container (when enabled in settings)
- Change resolution, FPS, and bitrate of a video to any value
- Trim video length to any specified duration
- View an estimated file size of the video before conversion
- Extract audio from a video file

## QoL settings

The user can also:
- Enable an advanced mode that compiles all of the steps into one page for quicker conversions
- Enable a setting that exits the program and sends the user to the location of the converted file once converted
- Enable a setting that allows more advanced users to change codecs of the media they're converting

## To do

- Incorporate yt-dlp
    - "Download from URL" on welcome screen that takes user to an extra first step to insert a link
    - Once successfully downloaded, the user is then taken to the usual next steps (trim, quality, output)
- Organize file structure

## Skills demonstrated

- Rust language (syntax)
- TypeScript language (syntax)
- Thread management (async, spawn_blocking)
- Multithreading (ffmpeg output line-by-line streaming)
- Component-based architecture

