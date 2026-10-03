# 🎵 TrackCard (XMusic)

> **Turn Spotify tracks into Twitter-playable video cards & real-time playable web cards with live play analytics.**

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Python: 3.12](https://img.shields.io/badge/Python-3.12-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/Framework-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)
[![FFmpeg](https://img.shields.io/badge/Media-FFmpeg-green.svg)](https://ffmpeg.org/)
[![Tests](https://img.shields.io/badge/Tests-Passing-brightgreen.svg)]()

---

## 🎯 The Problem

When you share a Spotify track link on Twitter/X:
1. **No In-Feed Playback:** Twitter renders a plain summary card. Clicking it forces users out of Twitter into the Spotify app or web login.
2. **High Drop-off Rate:** Over 85% of users scroll past without opening Spotify.
3. **No Centralized Analytics:** Creators cannot track real-time play counts from their tweet.

---

## ⚡ The Solution

**TrackCard** bridges this gap by providing two complementary solutions:

1. **Native Twitter Video Cards (Guaranteed Timeline Autoplay):**
   - Automatically renders an aesthetic 1080×1080 MP4 video card featuring ambient blurred background, rounded album cover, animated audio waveform, and typography.
   - Plays natively in the Twitter feed on iOS, Android, and Desktop with zero clicks or external app switching.
   - Leverages Twitter's native view counter right on the tweet.

2. **Hosted Interactive Web Player (`/t/:id` & `/embed/:id`):**
   - Clean dark-mode web player with real-time play tracking (`🔥 X plays`).
   - Standard Twitter Player Card (`twitter:card = player`) & OpenGraph metadata.
   - Direct buttons to open on Spotify and download the ready-to-tweet MP4.

---

## 🏗️ Architecture

```
[Spotify Track Link] ──► [TrackCard Engine]
                             │
                             ├──► 1. Metadata & Audio Extractor (Zero API Key Needed)
                             │
                             ├──► 2. FFmpeg Visualizer Generator (1080x1080 MP4 Card)
                             │
                             ├──► 3. Real-Time Play Analytics Engine (SQLite WAL / Anonymized IP)
                             │
                             └──► 4. Web Player Page & Twitter Card Endpoint (/t/:id)
```

---

## ✨ Features

- **Zero API Key Requirement:** Extracts track metadata, album cover, and official preview audio directly via social graph protocols.
- **Fast Media Rendering:** Generates 1080×1080 MP4 video cards in seconds using optimized FFmpeg pipeline with `faststart` flags for instant streaming.
- **Real-Time Play Counter:** Tracks unique listeners and total plays with built-in rate-limiting and privacy-compliant IP hashing.
- **Modern Minimal UI:** Built with Tailwind CSS, Vazirmatn & DejaVu fonts, and responsive audio player controls.
- **Dual Output:** Instantly provides both the shareable web link and the downloadable Twitter video file.
- **Docker Ready:** Ships with complete `Dockerfile` and `docker-compose.yml`.

---

## 🚀 Quick Start

### 1. Local Setup

```bash
# Clone the repository
git clone https://github.com/mjavadz/trackcard.git
cd trackcard

# Install dependencies (requires ffmpeg installed on system)
pip install -r requirements.txt

# Run server
uvicorn app.main:app --host 0.0.0.0 --port 8787 --reload
```

Open `http://localhost:8787` in your browser.

### 2. Docker Setup

```bash
docker compose up -d
```

---

## 📡 REST API Reference

### 1. Generate TrackCard
```http
POST /api/generate
Content-Type: application/json

{
  "url": "https://open.spotify.com/track/5Fd3Grb3DN9bD6Qw46BjSO"
}
```

**Response:**
```json
{
  "id": "pure-love-5fd3gr",
  "title": "Pure Love",
  "artist": "Reasonandu, Logical Elements",
  "album": "Alchemy of Love",
  "cover_url": "https://i.scdn.co/image/...",
  "share_url": "/t/pure-love-5fd3gr",
  "embed_url": "/embed/pure-love-5fd3gr",
  "video_url": "http://localhost:8787/media/pure-love-5fd3gr_card.mp4",
  "stats": {
    "total_plays": 0,
    "unique_listeners": 0
  }
}
```

### 2. Register Play Event
```http
POST /api/track/{track_id}/play
```

**Response:**
```json
{
  "success": true,
  "track_id": "pure-love-5fd3gr",
  "total_plays": 1,
  "unique_listeners": 1
}
```

### 3. Get Track Details & Stats
```http
GET /api/track/{track_id}
```

---

## 🧪 Testing

The repository includes comprehensive unit and end-to-end integration tests:

```bash
python3 -m pytest -v
```

All 9 tests verify:
- Spotify URL normalization and regex patterns.
- Metadata and preview audio extraction.
- FFmpeg video generation with 1080×1080 resolution validation.
- Database storage and rate-limited play counter tracking.
- OpenGraph and Twitter Player Card HTML template rendering.

---

## 📄 License

MIT License © 2026 [Javad](https://github.com/mjavadz)
