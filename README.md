# 🎵 XPlay

> **Play music directly inside Twitter/X timeline with real-time analytics. Seamless bridge for Spotify & YouTube.**

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020.svg)](https://workers.cloudflare.com/)
[![FastAPI](https://img.shields.io/badge/Framework-FastAPI-009688.svg)](https://fastapi.tiangolo.com/)

---

## 🎯 The Problem

When you share a Spotify or YouTube track link on Twitter/X:
1. **No In-Feed Playback:** Twitter renders a plain summary card. Clicking it forces users out of Twitter into the Spotify app or web login.
2. **High Drop-off Rate:** Over 85% of users scroll past without opening external apps.
3. **No Centralized Analytics:** Creators cannot track real-time play counts directly from their tweet.

---

## ⚡ The Solution

**XPlay** bridges this gap:

1. **In-Timeline Twitter Player Card (`twitter:card = player`):**
   - Automatically maps Spotify and YouTube links to a responsive, dark-mode in-tweet player.
   - Plays full-length audio/video directly in the timeline with zero external app switching.
   - Live play counter tracks how many times your track was listened to on Twitter.

2. **Real-Time Music Search:**
   - Search by track or artist name directly from the search bar (English & Persian).
   - Generates instant Twitter-ready cards with 1 click.

---

## 🚀 Deployment Options

### 1. Cloudflare Workers (Serverless Edge)
Runs 100% on Cloudflare's Global Edge Network for free with zero VPS resources.
```bash
npx wrangler deploy
```

### 2. GitHub Pages (`xplay-app.github.io`)
Deployable as a free static / client player under a GitHub organization.

---

## 📄 License

MIT License © 2026 [XPlay](https://github.com/mjavadz/xplay)
