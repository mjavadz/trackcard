import pytest
import os
import shutil
from pathlib import Path
from app.config import DATA_DIR, DB_PATH
from app.database import init_db, save_track, get_track_by_id, record_play, get_track_stats

@pytest.fixture(autouse=True)
def setup_test_db(tmp_path, monkeypatch):
    test_db = tmp_path / "test_trackcard.sqlite"
    monkeypatch.setattr("app.database.DB_PATH", test_db)
    init_db()
    yield

def test_save_and_retrieve_track():
    sample = {
        "id": "pure-love-5fd3gr",
        "spotify_id": "5Fd3Grb3DN9bD6Qw46BjSO",
        "spotify_url": "https://open.spotify.com/track/5Fd3Grb3DN9bD6Qw46BjSO",
        "title": "Pure Love",
        "artist": "Reasonandu, Logical Elements",
        "album": "Alchemy of Love",
        "cover_url": "https://example.com/cover.jpg",
        "audio_url": "https://example.com/preview.mp3",
        "duration_sec": 30.0
    }
    saved = save_track(sample)
    assert saved["id"] == "pure-love-5fd3gr"
    assert saved["title"] == "Pure Love"

    retrieved = get_track_by_id("pure-love-5fd3gr")
    assert retrieved is not None
    assert retrieved["artist"] == "Reasonandu, Logical Elements"
    assert retrieved["stats"]["total_plays"] == 0

def test_record_play_and_stats():
    sample = {
        "id": "test-track-1",
        "spotify_id": "sp123",
        "spotify_url": "https://open.spotify.com/track/sp123",
        "title": "Test Song",
        "artist": "Artist",
        "duration_sec": 30.0
    }
    save_track(sample)

    # First play from IP 1
    stats1 = record_play("test-track-1", client_ip="1.2.3.4", user_agent="Mozilla")
    assert stats1["total_plays"] == 1
    assert stats1["unique_listeners"] == 1

    # Play from IP 2
    stats2 = record_play("test-track-1", client_ip="5.6.7.8", user_agent="Chrome")
    assert stats2["total_plays"] == 2
    assert stats2["unique_listeners"] == 2

    # Duplicate play from IP 1 within 30s rate limit window should not increase count
    stats3 = record_play("test-track-1", client_ip="1.2.3.4", user_agent="Mozilla")
    assert stats3["total_plays"] == 2
    assert stats3["unique_listeners"] == 2
