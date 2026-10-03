import os
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI, Request, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

from app.config import BASE_DIR, MEDIA_DIR, BASE_URL
from app.database import init_db, save_track, get_track_by_id, get_track_by_spotify_id, record_play, update_track_files
from app.services.spotify import fetch_spotify_track, extract_spotify_id
from app.services.visualizer import generate_video_card

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield

app = FastAPI(
    title="TrackCard API",
    description="Turn Spotify tracks into Twitter video cards & real-time playable web cards",
    version="1.0.0",
    lifespan=lifespan
)

# Mount static and templates
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "app" / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "app" / "templates"))

class GenerateRequest(BaseModel):
    url: str

@app.get("/", response_class=HTMLResponse)
async def home_view(request: Request):
    return templates.TemplateResponse(request, "index.html", {})

@app.get("/t/{track_id}", response_class=HTMLResponse)
async def player_view(request: Request, track_id: str):
    track = get_track_by_id(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    host_url = str(request.base_url).rstrip("/")
    share_url = f"{host_url}/t/{track_id}"
    embed_url = f"{host_url}/embed/{track_id}"
    audio_stream_url = f"{host_url}/media/{track['audio_file']}" if track.get("audio_file") else track.get("audio_url", "")
    video_download_url = f"{host_url}/media/{track['video_file']}" if track.get("video_file") else "#"

    return templates.TemplateResponse(request, "player.html", {
        "track": track,
        "share_url": share_url,
        "embed_url": embed_url,
        "audio_stream_url": audio_stream_url,
        "video_download_url": video_download_url
    })

@app.get("/embed/{track_id}", response_class=HTMLResponse)
async def embed_view(request: Request, track_id: str):
    track = get_track_by_id(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    host_url = str(request.base_url).rstrip("/")
    audio_stream_url = f"{host_url}/media/{track['audio_file']}" if track.get("audio_file") else track.get("audio_url", "")

    return templates.TemplateResponse(request, "embed.html", {
        "track": track,
        "audio_stream_url": audio_stream_url
    })

@app.post("/api/generate")
async def generate_card(payload: GenerateRequest, request: Request, background_tasks: BackgroundTasks):
    url = payload.url.strip()
    spotify_id = extract_spotify_id(url)
    if not spotify_id:
        raise HTTPException(status_code=400, detail="Invalid Spotify URL. Example: https://open.spotify.com/track/...")

    # Check cache first
    existing = get_track_by_spotify_id(spotify_id)
    if existing and existing.get("video_file"):
        host_url = str(request.base_url).rstrip("/")
        return {
            **existing,
            "share_url": f"/t/{existing['id']}",
            "embed_url": f"/embed/{existing['id']}",
            "audio_url_local": f"{host_url}/media/{existing['audio_file']}" if existing.get("audio_file") else existing["audio_url"],
            "video_url": f"{host_url}/media/{existing['video_file']}"
        }

    # Fetch track metadata & media
    try:
        track_info = await fetch_spotify_track(url)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Generate Twitter Video Card
    try:
        video_filename = await generate_video_card(track_info)
        track_info["video_file"] = video_filename
    except Exception as e:
        print(f"Warning: Video generation failed: {e}")
        track_info["video_file"] = ""

    # Save to database
    saved = save_track(track_info)
    saved_stats = get_track_by_id(saved["id"])

    host_url = str(request.base_url).rstrip("/")
    return {
        **saved_stats,
        "share_url": f"/t/{saved['id']}",
        "embed_url": f"/embed/{saved['id']}",
        "audio_url_local": f"{host_url}/media/{saved['audio_file']}" if saved.get("audio_file") else saved["audio_url"],
        "video_url": f"{host_url}/media/{saved['video_file']}" if saved.get("video_file") else None
    }

@app.get("/api/track/{track_id}")
async def get_track(track_id: str):
    track = get_track_by_id(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return track

@app.post("/api/track/{track_id}/play")
async def register_track_play(track_id: str, request: Request):
    track = get_track_by_id(track_id)
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")

    client_ip = request.client.host if request.client else "127.0.0.1"
    user_agent = request.headers.get("user-agent", "")
    referer = request.headers.get("referer", "")

    stats = record_play(track_id, client_ip=client_ip, user_agent=user_agent, referer=referer)
    return {
        "success": True,
        "track_id": track_id,
        "total_plays": stats["total_plays"],
        "unique_listeners": stats["unique_listeners"]
    }

@app.get("/media/{filename}")
async def serve_media(filename: str):
    file_path = MEDIA_DIR / filename
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    
    media_type = "application/octet-stream"
    if filename.endswith(".mp4"):
        media_type = "video/mp4"
    elif filename.endswith(".mp3"):
        media_type = "audio/mpeg"
    elif filename.endswith(".jpg") or filename.endswith(".jpeg"):
        media_type = "image/jpeg"
    elif filename.endswith(".png"):
        media_type = "image/png"

    return FileResponse(file_path, media_type=media_type)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "trackcard", "version": "1.0.0"}
