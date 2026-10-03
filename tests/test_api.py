import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.database import init_db, save_track

@pytest.fixture(autouse=True)
def setup_db(tmp_path, monkeypatch):
    test_db = tmp_path / "test_api.sqlite"
    monkeypatch.setattr("app.database.DB_PATH", test_db)
    init_db()
    yield

client = TestClient(app)

def test_health():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"

def test_play_tracking_api():
    sample = {
        "id": "demo-track",
        "spotify_id": "demo123",
        "spotify_url": "https://open.spotify.com/track/demo123",
        "title": "Demo Song",
        "artist": "Demo Artist",
        "duration_sec": 30.0
    }
    save_track(sample)

    # Check track info
    resp = client.get("/api/track/demo-track")
    assert resp.status_code == 200
    assert resp.json()["title"] == "Demo Song"
    assert resp.json()["stats"]["total_plays"] == 0

    # Register play
    play_resp = client.post("/api/track/demo-track/play")
    assert play_resp.status_code == 200
    data = play_resp.json()
    assert data["success"] is True
    assert data["total_plays"] == 1
    assert data["unique_listeners"] == 1

def test_player_html_rendering():
    sample = {
        "id": "pure-love-test",
        "spotify_id": "test5fd",
        "spotify_url": "https://open.spotify.com/track/test5fd",
        "title": "Pure Love",
        "artist": "Reasonandu",
        "cover_url": "https://example.com/cover.jpg",
        "duration_sec": 30.0
    }
    save_track(sample)

    resp = client.get("/t/pure-love-test")
    assert resp.status_code == 200
    assert "Pure Love" in resp.text
    assert "Reasonandu" in resp.text
    assert "twitter:card" in resp.text
    assert "twitter:player" in resp.text
