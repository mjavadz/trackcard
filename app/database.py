import sqlite3
import hashlib
import time
from typing import Optional, Dict, Any
from app.config import DB_PATH

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def init_db() -> None:
    with get_connection() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY,
            spotify_id TEXT UNIQUE,
            spotify_url TEXT NOT NULL,
            title TEXT NOT NULL,
            artist TEXT NOT NULL,
            album TEXT,
            cover_url TEXT,
            audio_url TEXT,
            audio_file TEXT,
            video_file TEXT,
            duration_sec REAL DEFAULT 30.0,
            created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS plays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            track_id TEXT NOT NULL,
            ip_hash TEXT NOT NULL,
            user_agent TEXT,
            referer TEXT,
            played_at INTEGER NOT NULL,
            FOREIGN KEY(track_id) REFERENCES tracks(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_plays_track ON plays(track_id);
        CREATE INDEX IF NOT EXISTS idx_plays_ip ON plays(track_id, ip_hash);
        CREATE INDEX IF NOT EXISTS idx_tracks_spotify ON tracks(spotify_id);
        """)

def save_track(track_data: Dict[str, Any]) -> Dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO tracks (
                id, spotify_id, spotify_url, title, artist, album,
                cover_url, audio_url, audio_file, video_file, duration_sec, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(spotify_id) DO UPDATE SET
                title=excluded.title,
                artist=excluded.artist,
                album=excluded.album,
                cover_url=excluded.cover_url,
                audio_url=excluded.audio_url,
                audio_file=COALESCE(excluded.audio_file, tracks.audio_file),
                video_file=COALESCE(excluded.video_file, tracks.video_file)
            RETURNING *;
        """, (
            track_data["id"],
            track_data["spotify_id"],
            track_data["spotify_url"],
            track_data["title"],
            track_data["artist"],
            track_data.get("album", ""),
            track_data.get("cover_url", ""),
            track_data.get("audio_url", ""),
            track_data.get("audio_file", ""),
            track_data.get("video_file", ""),
            track_data.get("duration_sec", 30.0),
            int(time.time())
        ))
        row = cursor.fetchone()
        conn.commit()
        return dict(row)

def update_track_files(track_id: str, audio_file: Optional[str] = None, video_file: Optional[str] = None) -> None:
    with get_connection() as conn:
        if audio_file and video_file:
            conn.execute("UPDATE tracks SET audio_file=?, video_file=? WHERE id=?", (audio_file, video_file, track_id))
        elif audio_file:
            conn.execute("UPDATE tracks SET audio_file=? WHERE id=?", (audio_file, track_id))
        elif video_file:
            conn.execute("UPDATE tracks SET video_file=? WHERE id=?", (video_file, track_id))
        conn.commit()

def get_track_by_id(track_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tracks WHERE id = ?", (track_id,))
        row = cursor.fetchone()
        if not row:
            return None
        track = dict(row)
        track["stats"] = get_track_stats(track_id)
        return track

def get_track_by_spotify_id(spotify_id: str) -> Optional[Dict[str, Any]]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM tracks WHERE spotify_id = ?", (spotify_id,))
        row = cursor.fetchone()
        if not row:
            return None
        track = dict(row)
        track["stats"] = get_track_stats(track["id"])
        return track

def record_play(track_id: str, client_ip: str, user_agent: str = "", referer: str = "") -> Dict[str, Any]:
    # Hash IP for privacy compliance
    ip_hash = hashlib.sha256(client_ip.encode("utf-8")).hexdigest()[:16]
    now = int(time.time())

    with get_connection() as conn:
        cursor = conn.cursor()
        # Rate limit: allow 1 count per IP per track per 30 seconds
        cursor.execute("""
            SELECT id FROM plays 
            WHERE track_id = ? AND ip_hash = ? AND played_at > ?
            LIMIT 1
        """, (track_id, ip_hash, now - 30))
        recent = cursor.fetchone()
        
        if not recent:
            cursor.execute("""
                INSERT INTO plays (track_id, ip_hash, user_agent, referer, played_at)
                VALUES (?, ?, ?, ?, ?)
            """, (track_id, ip_hash, user_agent[:255], referer[:255], now))
            conn.commit()
            
    return get_track_stats(track_id)

def get_track_stats(track_id: str) -> Dict[str, Any]:
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM plays WHERE track_id = ?", (track_id,))
        total_plays = cursor.fetchone()[0]

        cursor.execute("SELECT COUNT(DISTINCT ip_hash) FROM plays WHERE track_id = ?", (track_id,))
        unique_listeners = cursor.fetchone()[0]

        return {
            "total_plays": total_plays,
            "unique_listeners": unique_listeners
        }
