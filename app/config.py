import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = Path(os.getenv("TRACKCARD_DATA_DIR", BASE_DIR / "data"))
MEDIA_DIR = DATA_DIR / "media"
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = DATA_DIR / "trackcard.sqlite"

HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", 8787))
BASE_URL = os.getenv("BASE_URL", "https://javadnode.top").rstrip("/")
