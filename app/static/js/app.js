document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('generateForm');
  const urlInput = document.getElementById('spotifyUrl');
  const submitBtn = document.getElementById('submitBtn');
  const btnText = document.getElementById('btnText');
  const btnSpinner = document.getElementById('btnSpinner');
  const errorMsg = document.getElementById('errorMessage');

  const resultCard = document.getElementById('resultCard');
  const trackCover = document.getElementById('trackCover');
  const trackTitle = document.getElementById('trackTitle');
  const trackArtist = document.getElementById('trackArtist');
  const trackAlbum = document.getElementById('trackAlbum');
  const playCounter = document.getElementById('playCounter');
  const downloadVideoBtn = document.getElementById('downloadVideoBtn');
  const copyShareBtn = document.getElementById('copyShareBtn');
  const spotifyDirectLink = document.getElementById('spotifyDirectLink');

  const audio = document.getElementById('audioElement');
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const progressContainer = document.getElementById('progressContainer');
  const progressBar = document.getElementById('progressBar');
  const currentTimeEl = document.getElementById('currentTime');
  const totalDurationEl = document.getElementById('totalDuration');

  let currentTrack = null;
  let isCountedThisSession = false;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    // Loading state
    submitBtn.disabled = true;
    btnText.textContent = 'در حال استخراج و ساخت کارت...';
    btnSpinner.classList.remove('hidden');
    errorMsg.classList.add('hidden');

    try {
      const resp = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });

      const data = await resp.json();
      if (!resp.ok || data.error) {
        throw new Error(data.error || 'خطا در پردازش لینک اسپاتیفای');
      }

      currentTrack = data;
      isCountedThisSession = false;
      renderTrack(data);

    } catch (err) {
      errorMsg.textContent = err.message || 'خطای غیرمنتظره رخ داد.';
      errorMsg.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
      btnText.textContent = 'ساخت کارت توییتری';
      btnSpinner.classList.add('hidden');
    }
  });

  function renderTrack(track) {
    trackCover.src = track.cover_url;
    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist;
    trackAlbum.textContent = track.album || '';
    playCounter.textContent = (track.stats?.total_plays || 0).toLocaleString('fa-IR');

    audio.src = track.audio_url_local || track.audio_url;
    audio.load();
    progressBar.style.width = '0%';
    currentTimeEl.textContent = '0:00';
    playIcon.textContent = '▶';

    downloadVideoBtn.href = track.video_url;
    downloadVideoBtn.setAttribute('download', `${track.id}_twitter_card.mp4`);

    spotifyDirectLink.href = track.spotify_url;

    resultCard.classList.remove('hidden');
    resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Audio Play / Pause
  playPauseBtn.addEventListener('click', () => {
    if (!audio.src) return;
    if (audio.paused) {
      audio.play();
      playIcon.textContent = '❚❚';
      if (!isCountedThisSession && currentTrack) {
        registerPlay(currentTrack.id);
        isCountedThisSession = true;
      }
    } else {
      audio.pause();
      playIcon.textContent = '▶';
    }
  });

  audio.addEventListener('timeupdate', () => {
    if (!audio.duration) return;
    const pct = (audio.currentTime / audio.duration) * 100;
    progressBar.style.width = pct + '%';
    currentTimeEl.textContent = formatTime(audio.currentTime);
  });

  audio.addEventListener('loadedmetadata', () => {
    totalDurationEl.textContent = formatTime(audio.duration);
  });

  audio.addEventListener('ended', () => {
    playIcon.textContent = '▶';
    progressBar.style.width = '0%';
  });

  progressContainer.addEventListener('click', (e) => {
    if (!audio.duration) return;
    const rect = progressContainer.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = clickX / rect.width;
    audio.currentTime = pct * audio.duration;
  });

  // Copy Share Link
  copyShareBtn.addEventListener('click', () => {
    if (!currentTrack) return;
    const fullShareUrl = window.location.origin + currentTrack.share_url;
    navigator.clipboard.writeText(fullShareUrl).then(() => {
      const origText = copyShareBtn.innerHTML;
      copyShareBtn.innerHTML = '<span>کپی شد! ✓</span>';
      copyShareBtn.classList.add('bg-emerald-800');
      setTimeout(() => {
        copyShareBtn.innerHTML = origText;
        copyShareBtn.classList.remove('bg-emerald-800');
      }, 2000);
    });
  });

  function registerPlay(trackId) {
    fetch(`/api/track/${trackId}/play`, { method: 'POST' })
      .then(r => r.json())
      .then(res => {
        if (res.total_plays !== undefined) {
          playCounter.textContent = res.total_plays.toLocaleString('fa-IR');
        }
      })
      .catch(console.error);
  }

  function formatTime(sec) {
    if (isNaN(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
});
