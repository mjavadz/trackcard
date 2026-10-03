import subprocess
import asyncio
from pathlib import Path
from typing import Dict, Any
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from app.config import MEDIA_DIR

def render_static_card_frame(title: str, artist: str, cover_path: Path, output_frame_path: Path) -> Path:
    width, height = 1080, 1080
    
    if cover_path.exists() and cover_path.is_file():
        raw_cover = Image.open(str(cover_path)).convert("RGB")
    else:
        # Fallback dark gradient
        raw_cover = Image.new("RGB", (600, 600), (30, 35, 45))
        ImageDraw.Draw(raw_cover).rectangle([0, 0, 600, 600], fill=(20, 24, 33))

    # 1. Background: Ambient blurred and darkened
    bg = raw_cover.resize((width, height), Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(35))
    dark_tint = Image.new("RGBA", (width, height), (10, 12, 16, 175))
    bg.paste(dark_tint, (0, 0), dark_tint)

    # 2. Main Album Art with rounded corners & shadow
    cover_size = 620
    cover = raw_cover.resize((cover_size, cover_size), Image.Resampling.LANCZOS)
    
    mask = Image.new("L", (cover_size, cover_size), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, cover_size, cover_size), radius=28, fill=255)
    
    shadow_size = cover_size + 36
    shadow = Image.new("RGBA", (shadow_size, shadow_size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((8, 8, shadow_size - 8, shadow_size - 8), radius=32, fill=(0, 0, 0, 190))
    shadow = shadow.filter(ImageFilter.GaussianBlur(14))
    
    cx = (width - cover_size) // 2
    cy = 75
    bg.paste(shadow, (cx - 18, cy - 10), shadow)
    bg.paste(cover, (cx, cy), mask)

    # 3. Typography
    draw = ImageDraw.Draw(bg)
    font_paths = [
        "/usr/share/fonts/truetype/vazirmatn/Vazirmatn-Bold.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    ]
    font_title = None
    for fp in font_paths:
        if Path(fp).exists():
            font_title = ImageFont.truetype(fp, 36)
            font_artist = ImageFont.truetype(fp.replace("Bold", "Regular") if "Vazirmatn" in fp else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 24)
            font_tag = ImageFont.truetype(fp, 18)
            break
            
    if not font_title:
        font_title = ImageFont.load_default()
        font_artist = ImageFont.load_default()
        font_tag = ImageFont.load_default()

    # Top Brand Pill
    draw.text((width // 2, 40), "TRACKCARD • LIVE AUDIO", font=font_tag, fill=(30, 215, 96), anchor="mm")

    # Title & Artist with length truncation
    disp_title = (title[:36] + "...") if len(title) > 38 else title
    disp_artist = (artist[:42] + "...") if len(artist) > 44 else artist

    t_box = draw.textbbox((0, 0), disp_title, font=font_title)
    t_w = t_box[2] - t_box[0]
    draw.text(((width - t_w) // 2, 745), disp_title, font=font_title, fill=(255, 255, 255))

    a_box = draw.textbbox((0, 0), disp_artist, font=font_artist)
    a_w = a_box[2] - a_box[0]
    draw.text(((width - a_w) // 2, 795), disp_artist, font=font_artist, fill=(180, 190, 205))

    bg.save(str(output_frame_path), quality=95)
    return output_frame_path

def generate_video_card_sync(track_data: Dict[str, Any]) -> str:
    track_id = track_data["id"]
    video_filename = f"{track_id}_card.mp4"
    video_path = MEDIA_DIR / video_filename

    # If already generated and valid, return immediately
    if video_path.exists() and video_path.stat().st_size > 100000:
        return video_filename

    audio_file_name = track_data.get("audio_file")
    if not audio_file_name:
        raise ValueError(f"No audio file available for track {track_id}")

    audio_path = MEDIA_DIR / audio_file_name
    cover_file_name = track_data.get("cover_file")
    cover_path = (MEDIA_DIR / cover_file_name) if cover_file_name else Path("")

    if not audio_path.exists() or not audio_path.is_file():
        raise FileNotFoundError(f"Audio file {audio_path} not found on disk.")

    frame_path = MEDIA_DIR / f"{track_id}_frame.jpg"
    render_static_card_frame(
        title=track_data["title"],
        artist=track_data["artist"],
        cover_path=cover_path,
        output_frame_path=frame_path
    )

    # FFmpeg command
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1", "-i", str(frame_path),
        "-i", str(audio_path),
        "-filter_complex",
        "[1:a]showwaves=s=760x100:mode=cline:colors=0x1DB954@0.9:scale=sqrt:r=20[wave];"
        "[0:v][wave]overlay=(W-w)/2:870[outv]",
        "-map", "[outv]",
        "-map", "1:a",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-r", "20",
        "-c:a", "aac",
        "-b:a", "160k",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-shortest",
        str(video_path)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg error: {result.stderr[-500:]}")

    # Clean temporary frame
    if frame_path.exists():
        frame_path.unlink()

    return video_filename

async def generate_video_card(track_data: Dict[str, Any]) -> str:
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, generate_video_card_sync, track_data)
