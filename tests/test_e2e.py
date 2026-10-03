import pytest
import os
import subprocess
from pathlib import Path
from fastapi.testclient import TestClient
from app.main import app
from app.config import MEDIA_DIR
from app.database import init_db

@pytest.fixture(autouse=True)
def setup_test_env(tmp_path, monkeypatch):
    test_db = tmp_path / "test_e2e.sqlite"
    monkeypatch.setattr("app.database.DB_PATH", test_db)
    init_db()
    yield

client = TestClient(app)

def test_full_pipeline_with_user_track():
    url = "https://open.spotify.com/track/5Fd3Grb3DN9bD6Qw46BjSO?si=7YlxI50bS7Kg1ljo5Kw3Gw"
    
    # 1. Call generate API
    resp = client.post("/api/generate", json={"url": url})
    assert resp.status_code == 200, f"Generate failed: {resp.text}"
    data = resp.json()
    
    assert data["title"] == "Pure Love"
    assert "Reasonandu" in data["artist"]
    assert data["stats"]["total_plays"] == 0
    assert data["video_url"] is not None

    track_id = data["id"]
    video_file = data["video_file"]
    video_path = MEDIA_DIR / video_file

    # 2. Verify generated MP4 video exists and is valid
    assert video_path.exists(), f"Video file {video_path} does not exist"
    assert video_path.stat().st_size > 500000, "Video file too small"

    # Check with ffprobe
    probe = subprocess.run([
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        str(video_path)
    ], capture_output=True, text=True)
    assert "1080,1080" in probe.stdout.strip(), f"Expected 1080x1080 resolution, got: {probe.stdout}"

    # 3. Test Play counter
    play_resp = client.post(f"/api/track/{track_id}/play")
    assert play_resp.status_code == 200
    assert play_resp.json()["total_plays"] == 1

    # 4. Test Web Player page
    page_resp = client.get(f"/t/{track_id}")
    assert page_resp.status_code == 200
    assert "Pure Love" in page_resp.text
    assert 'name="twitter:card" content="player"' in page_resp.text
    assert 'name="twitter:player"' in page_resp.text

    # 5. Test Embed page
    embed_resp = client.get(f"/embed/{track_id}")
    assert embed_resp.status_code == 200
    assert "Pure Love" in embed_resp.text
