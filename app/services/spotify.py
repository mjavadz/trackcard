import re
import urllib.request
import urllib.parse
from pathlib import Path
from typing import Dict, Any, Optional
import httpx
from app.config import MEDIA_DIR

SPOTIFY_TRACK_REGEX = re.compile(r"open\.spotify\.com/track/([a-zA-Z0-9]+)")

def extract_spotify_id(url: str) -> Optional[str]:
    match = SPOTIFY_TRACK_REGEX.search(url)
    return match.group(1) if match else None

def clean_track_title(raw_title: str) -> str:
    # Remove redundant Spotify suffixes
    cleaned = re.sub(r"\s*-\s*song\s+and\s+lyrics\s+by.*$", "", raw_title, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*\|\s*Spotify$", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()

def parse_description(raw_desc: str) -> Dict[str, str]:
    # Typical description: "Reasonandu, Logical Elements · Alchemy of Love · Song · 2016"
    parts = [p.strip() for p in raw_desc.split("·")]
    artist = parts[0] if len(parts) > 0 else "Unknown Artist"
    album = parts[1] if len(parts) > 1 else ""
    return {"artist": artist, "album": album}

async def fetch_spotify_track(url: str) -> Dict[str, Any]:
    spotify_id = extract_spotify_id(url)
    if not spotify_id:
        raise ValueError("Invalid Spotify track URL. Please provide a link like: https://open.spotify.com/track/...")

    clean_url = f"https://open.spotify.com/track/{spotify_id}"
    
    # Using Twitterbot User-Agent ensures Spotify delivers complete OpenGraph metadata + direct MP3 preview
    headers = {
        "User-Agent": "Twitterbot/1.0",
        "Accept-Language": "en-US,en;q=0.9"
    }

    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        resp = await client.get(clean_url, headers=headers)
        if resp.status_code != 200:
            raise ValueError(f"Could not load Spotify track page (HTTP {resp.status_code})")
        html = resp.text

    # Extract OpenGraph tags
    title_match = re.search(r'<meta property="og:title" content="([^"]+)"', html)
    desc_match = re.search(r'<meta property="og:description" content="([^"]+)"', html)
    image_match = re.search(r'<meta property="og:image" content="([^"]+)"', html)
    audio_match = re.search(r'<meta property="og:audio" content="([^"]+)"', html)

    raw_title = title_match.group(1) if title_match else "Unknown Track"
    title = clean_track_title(raw_title)
    
    raw_desc = desc_match.group(1) if desc_match else ""
    parsed = parse_description(raw_desc)
    
    cover_url = image_match.group(1) if image_match else ""
    audio_url = audio_match.group(1) if audio_match else ""

    # Generate a clean URL-friendly slug ID
    slug_base = re.sub(r"[^a-zA-Z0-9]+", "-", title.lower()).strip("-")
    if not slug_base:
        slug_base = "track"
    track_id = f"{slug_base}-{spotify_id[:6]}"

    # Local file destinations
    cover_file = f"{track_id}_cover.jpg"
    audio_file = f"{track_id}_preview.mp3"
    cover_path = MEDIA_DIR / cover_file
    audio_path = MEDIA_DIR / audio_file

    # Download cover if not already cached
    if cover_url and not cover_path.exists():
        async with httpx.AsyncClient(timeout=20.0) as client:
            c_resp = await client.get(cover_url)
            if c_resp.status_code == 200:
                cover_path.write_bytes(c_resp.content)

    # Download preview audio if provided
    if audio_url and not audio_path.exists():
        async with httpx.AsyncClient(timeout=30.0) as client:
            a_resp = await client.get(audio_url)
            if a_resp.status_code == 200:
                audio_path.write_bytes(a_resp.content)

    return {
        "id": track_id,
        "spotify_id": spotify_id,
        "spotify_url": clean_url,
        "title": title,
        "artist": parsed["artist"],
        "album": parsed["album"],
        "cover_url": cover_url,
        "audio_url": audio_url,
        "cover_file": cover_file if cover_path.exists() else "",
        "audio_file": audio_file if audio_path.exists() else "",
        "duration_sec": 30.0
    }
