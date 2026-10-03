import pytest
from app.services.spotify import extract_spotify_id, clean_track_title, parse_description

def test_extract_spotify_id():
    assert extract_spotify_id("https://open.spotify.com/track/5Fd3Grb3DN9bD6Qw46BjSO") == "5Fd3Grb3DN9bD6Qw46BjSO"
    assert extract_spotify_id("https://open.spotify.com/track/5Fd3Grb3DN9bD6Qw46BjSO?si=7YlxI50bS7Kg1ljo5Kw3Gw") == "5Fd3Grb3DN9bD6Qw46BjSO"
    assert extract_spotify_id("https://open.spotify.com/album/12345") is None
    assert extract_spotify_id("invalid-string") is None

def test_clean_track_title():
    assert clean_track_title("Pure Love - song and lyrics by Reasonandu | Spotify") == "Pure Love"
    assert clean_track_title("Never Gonna Give You Up | Spotify") == "Never Gonna Give You Up"
    assert clean_track_title("Stay") == "Stay"

def test_parse_description():
    desc = "Reasonandu, Logical Elements · Alchemy of Love · Song · 2016"
    parsed = parse_description(desc)
    assert parsed["artist"] == "Reasonandu, Logical Elements"
    assert parsed["album"] == "Alchemy of Love"

    desc2 = "Coldplay · Parachutes · Song"
    parsed2 = parse_description(desc2)
    assert parsed2["artist"] == "Coldplay"
    assert parsed2["album"] == "Parachutes"
