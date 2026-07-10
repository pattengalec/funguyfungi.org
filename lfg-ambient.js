/**
 * lfg-ambient.js — Fun Guy Fungi
 * Sound + Haptic + Creature + Weather Emoji system
 *
 * Public API:
 *   FGF.sound.tap()          — light UI tap
 *   FGF.sound.open()         — sheet/screen open
 *   FGF.sound.close()        — sheet/screen close
 *   FGF.sound.success()      — save/submit success
 *   FGF.sound.error()        — validation error
 *   FGF.sound.complete()     — task marked complete (reward)
 *   FGF.sound.toggle(bool)   — mute/unmute, returns new state
 *   FGF.sound.isMuted()      — returns bool
 *
 *   FGF.haptic.tap()         — single short buzz
 *   FGF.haptic.success()     — double tap
 *   FGF.haptic.complete()    — triple tap (reward)
 *   FGF.haptic.error()       — single sharp buzz
 *
 *   FGF.ambient.start()      — start creature + weather system
 *   FGF.ambient.stop()       — stop all ambient activity
 *   FGF.ambient.setWeather(data) — feed in NWS weather data
 */

(function() {
  'use strict';

  // ── Audio Context ────────────────────────────────────────────
  let _ctx = null;
  let _muted = false;

  try { _muted = localStorage.getItem('lfg-muted') === 'true'; } catch(e) {}

  function ctx() {
    if (!_ctx) {
      try { _ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) {}
    }
    if (_ctx && _ctx.state === 'suspended') _ctx.resume();
    return _ctx;
  }

  function playTone(freq, type, duration, gain, delay) {
    if (_muted) return;
    const c = ctx(); if (!c) return;
    const t = c.currentTime + (delay || 0);
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g); g.connect(c.destination);
    osc.type = type || 'sine';
    osc.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain || 0.15, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  // ── Sound profiles ───────────────────────────────────────────
  const sound = {
    tap() {
      playTone(880, 'sine', 0.06, 0.10);
    },
    open() {
      playTone(440, 'sine', 0.08, 0.12);
      playTone(660, 'sine', 0.10, 0.10, 0.04);
    },
    close() {
      playTone(660, 'sine', 0.06, 0.10);
      playTone(440, 'sine', 0.08, 0.08, 0.04);
    },
    success() {
      playTone(523, 'sine', 0.10, 0.13);
      playTone(659, 'sine', 0.10, 0.13, 0.08);
      playTone(784, 'sine', 0.14, 0.13, 0.16);
    },
    error() {
      playTone(220, 'square', 0.12, 0.12);
    },
    complete() {
      // Rewarding ascending chime
      playTone(523, 'sine', 0.10, 0.15);
      playTone(659, 'sine', 0.10, 0.15, 0.09);
      playTone(784, 'sine', 0.10, 0.15, 0.18);
      playTone(1047,'sine', 0.20, 0.15, 0.27);
    },
    toggle(val) {
      _muted = (val !== undefined) ? !val : !_muted;
      try { localStorage.setItem('lfg-muted', _muted); } catch(e) {}
      return !_muted;
    },
    isMuted() { return _muted; }
  };

  // ── Haptic profiles ──────────────────────────────────────────
  const haptic = {
    tap()      { if (navigator.vibrate) navigator.vibrate(10); },
    success()  { if (navigator.vibrate) navigator.vibrate([12, 60, 12]); },
    complete() { if (navigator.vibrate) navigator.vibrate([15, 50, 15, 50, 30]); },
    error()    { if (navigator.vibrate) navigator.vibrate(40); }
  };

  // ── Emoji pools ──────────────────────────────────────────────
  const CREATURES = ['🐝','🦋','🐞','🪲','🦗','🐜','🪱','🕷️','🐿️','🌿','🍃','👼','🐛','🦎','🐸'];

  const SEASON_EMOJI = {
    spring: ['🌸','🌷','🌱','🌼','🌻'],
    summer: ['🌻','🌞','🍉','🌴','🏖️'],
    fall:   ['🍂','🍁','🎃','🌾','🍄'],
    winter: ['❄️','⛄','🧣','🧤','🕯️']
  };

  const WEATHER_PROFILES = {
    sunny_hot:   { emoji:['☀️','😎','🔥','💦','🥵'],      intensity:3, speedMult:1.0 },
    sunny_warm:  { emoji:['☀️','😎','🌻'],                  intensity:2, speedMult:1.0 },
    sunny_cool:  { emoji:['☀️','🌤️'],                       intensity:2, speedMult:0.9 },
    sunny_cold:  { emoji:['☀️','❄️','🥶'],                  intensity:2, speedMult:0.8 },
    partly:      { emoji:['⛅','🌤️'],                       intensity:1, speedMult:1.0 },
    cloudy:      { emoji:['☁️','🌫️'],                       intensity:2, speedMult:0.9 },
    windy_fall:  { emoji:['🍂','🍁','💨','🌬️','🍃'],        intensity:6, speedMult:1.8 },
    windy_spring:{ emoji:['🌸','💨','🌷','🌬️'],             intensity:5, speedMult:1.7 },
    windy:       { emoji:['💨','🌬️','🍃'],                  intensity:5, speedMult:1.7 },
    rain:        { emoji:['🌧️','☔','💧'],                   intensity:4, speedMult:1.1 },
    drizzle:     { emoji:['🌦️','💧'],                       intensity:2, speedMult:1.0 },
    thunder:     { emoji:['⛈️','🌩️','⚡','💧'],             intensity:6, speedMult:1.9 },
    fog:         { emoji:['🌫️','👻'],                       intensity:2, speedMult:0.6 },
    snow:        { emoji:['❄️','⛄','🌨️','🌊'],             intensity:5, speedMult:0.7 },
    clear_night: { emoji:['🌙','⭐','🦉'],                  intensity:2, speedMult:0.8 },
    default:     { emoji:['🌿','🍃'],                       intensity:1, speedMult:1.0 }
  };

  // ── Season detection ─────────────────────────────────────────
  function getSeason() {
    const m = new Date().getMonth(); // 0-11
    if (m >= 2 && m <= 4) return 'spring';
    if (m >= 5 && m <= 7) return 'summer';
    if (m >= 8 && m <= 10) return 'fall';
    return 'winter';
  }

  // ── Weather profile resolver ──────────────────────────────────
  let _weatherProfile = WEATHER_PROFILES.default;
  let _weatherResolved = false;

  function resolveWeatherProfile(data) {
    if (!data) return;
    const desc = (data.shortForecast || '').toLowerCase();
    const temp = data.temperature || 70;
    const wind = parseInt(data.windSpeed) || 0;
    const season = getSeason();
    const isNight = data.isDaytime === false;

    if (isNight) { _weatherProfile = WEATHER_PROFILES.clear_night; }
    else if (desc.includes('thunder') || desc.includes('storm')) { _weatherProfile = WEATHER_PROFILES.thunder; }
    else if (desc.includes('snow') || desc.includes('blizzard')) { _weatherProfile = WEATHER_PROFILES.snow; }
    else if (desc.includes('fog') || desc.includes('mist')) { _weatherProfile = WEATHER_PROFILES.fog; }
    else if (wind >= 20) {
      _weatherProfile = (season === 'fall') ? WEATHER_PROFILES.windy_fall :
                        (season === 'spring') ? WEATHER_PROFILES.windy_spring :
                        WEATHER_PROFILES.windy;
    }
    else if (desc.includes('rain') || desc.includes('shower')) {
      _weatherProfile = desc.includes('light') || desc.includes('slight') ? WEATHER_PROFILES.drizzle : WEATHER_PROFILES.rain;
    }
    else if (desc.includes('cloud') || desc.includes('overcast')) { _weatherProfile = WEATHER_PROFILES.cloudy; }
    else if (desc.includes('partly') || desc.includes('mostly cloudy')) { _weatherProfile = WEATHER_PROFILES.partly; }
    else {
      // Clear/sunny
      if (temp >= 90) _weatherProfile = WEATHER_PROFILES.sunny_hot;
      else if (temp >= 65) _weatherProfile = WEATHER_PROFILES.sunny_warm;
      else if (temp >= 45) _weatherProfile = WEATHER_PROFILES.sunny_cool;
      else _weatherProfile = WEATHER_PROFILES.sunny_cold;
    }

    // Add season emojis to pool
    const seasonEmoji = SEASON_EMOJI[season] || [];
    _weatherProfile = {
      ..._weatherProfile,
      emoji: [..._weatherProfile.emoji, ...seasonEmoji.slice(0, 2)]
    };
    _weatherResolved = true;
  }

  // ── Sprite factory ───────────────────────────────────────────
  function makeSprite(emoji, opts) {
    const el = document.createElement('div');
    el.setAttribute('aria-hidden', 'true');

    const size = opts.size || 20;
    const duration = opts.duration || 16;
    const startY = opts.startY || 30;
    const drift = (Math.random() * 100 - 50);
    const flip = opts.flip || false;

    el.style.cssText = [
      'position:fixed',
      flip ? 'right:-70px' : 'left:-70px',
      `top:${startY}vh`,
      `font-size:${size}px`,
      'pointer-events:none',
      'z-index:9999',
      'will-change:transform',
      'line-height:1',
      `animation:lfgMove${flip ? 'Back' : ''} ${duration}s linear forwards`
    ].join(';');

    const inner = document.createElement('span');
    inner.textContent = emoji;
    const bobDur = (0.7 + Math.random() * 0.9).toFixed(2);
    inner.style.cssText = `display:inline-block;animation:lfgBob ${bobDur}s ease-in-out infinite alternate`;
    el.appendChild(inner);

    // Inject keyframes once
    if (!window._lfgAmbientStyle) {
      const s = document.createElement('style');
      s.id = 'lfg-ambient-style';
      s.textContent = [
        `@keyframes lfgMove{to{transform:translateX(calc(100vw + 140px)) translateY(${drift}px)}}`,
        `@keyframes lfgMoveBack{to{transform:translateX(calc(-100vw - 140px)) translateY(${drift}px)}}`,
        `@keyframes lfgBob{from{transform:translateY(-6px)}to{transform:translateY(6px)}}`
      ].join('');
      document.head.appendChild(s);
      window._lfgAmbientStyle = true;
    }

    document.body.appendChild(el);
    setTimeout(() => el.remove(), duration * 1000 + 500);
  }

  // ── Size + speed tiers ───────────────────────────────────────
  // Tier 0 = far/small/slow, Tier 2 = near/large/fast
  const TIERS = [
    { size: [12, 16], speed: [20, 28] }, // background
    { size: [18, 24], speed: [12, 18] }, // mid
    { size: [26, 34], speed: [6,  11] }  // foreground
  ];

  function randomTier() {
    // Weight toward background for depth feel
    const r = Math.random();
    return r < 0.50 ? 0 : r < 0.80 ? 1 : 2;
  }

  function spawnCreature() {
    const tier = randomTier();
    const t = TIERS[tier];
    const size = t.size[0] + Math.random() * (t.size[1] - t.size[0]);
    const speed = t.speed[0] + Math.random() * (t.speed[1] - t.speed[0]);
    const emoji = CREATURES[Math.floor(Math.random() * CREATURES.length)];
    makeSprite(emoji, {
      size, duration: speed,
      startY: 5 + Math.random() * 85,
      flip: Math.random() < 0.5
    });
  }

  function spawnWeatherEmoji() {
    const profile = _weatherProfile;
    const speedMult = profile.speedMult || 1.0;
    const tier = randomTier();
    const t = TIERS[tier];
    const size = t.size[0] + Math.random() * (t.size[1] - t.size[0]);
    const baseSpeed = t.speed[0] + Math.random() * (t.speed[1] - t.speed[0]);
    const speed = baseSpeed / speedMult;
    const emoji = profile.emoji[Math.floor(Math.random() * profile.emoji.length)];
    makeSprite(emoji, {
      size, duration: Math.max(3, speed),
      startY: 5 + Math.random() * 90,
      flip: Math.random() < 0.5
    });
  }

  // ── Ambient scheduler ─────────────────────────────────────────
  let _running = false;
  let _timers = [];

  function schedule(fn, minMs, maxMs) {
    const delay = minMs + Math.random() * (maxMs - minMs);
    const t = setTimeout(() => {
      if (!_running) return;
      fn();
      schedule(fn, minMs, maxMs);
    }, delay);
    _timers.push(t);
  }

  const ambient = {
    start() {
      if (_running) return;
      _running = true;

      // Creatures: 1-3 on screen, spawn every 10-22s
      schedule(spawnCreature, 10000, 22000);
      // Second creature stream with offset
      setTimeout(() => {
        if (_running) schedule(spawnCreature, 14000, 26000);
      }, 6000);

      // Weather emojis: intensity-based spawn rate
      function weatherSpawn() {
        if (!_running) return;
        spawnWeatherEmoji();
        const intensity = _weatherProfile.intensity || 1;
        // More intense weather = faster spawning
        const minMs = Math.max(1500, 8000 / intensity);
        const maxMs = Math.max(3000, 16000 / intensity);
        const t = setTimeout(weatherSpawn, minMs + Math.random() * (maxMs - minMs));
        _timers.push(t);
      }
      setTimeout(weatherSpawn, 4000);

      // First creatures appear quickly on load
      setTimeout(spawnCreature, 2000 + Math.random() * 3000);
      setTimeout(spawnWeatherEmoji, 5000 + Math.random() * 3000);
    },

    stop() {
      _running = false;
      _timers.forEach(clearTimeout);
      _timers = [];
    },

    setWeather(data) {
      resolveWeatherProfile(data);
    }
  };

  // ── Mute button updater ───────────────────────────────────────
  function updateMuteButtons() {
    document.querySelectorAll('.audio-mute, [id^="audio-mute"]').forEach(btn => {
      btn.textContent = _muted ? '🔇' : '🔊';
      btn.classList.toggle('is-muted', _muted);
    });
  }

  // ── Wire up mute buttons ──────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    updateMuteButtons();
    document.addEventListener('click', e => {
      const btn = e.target.closest('.audio-mute, [id^="audio-mute"]');
      if (btn) {
        sound.toggle();
        haptic.tap();
        updateMuteButtons();
      }
    });
  });

  // ── Try to pull cached weather ────────────────────────────────
  try {
    const cached = JSON.parse(sessionStorage.getItem('lfg-wx') || 'null');
    if (cached && cached.periods && cached.periods[0]) {
      resolveWeatherProfile(cached.periods[0]);
    }
  } catch(e) {}

  // ── Public API ────────────────────────────────────────────────
  window.FGF = window.FGF || {};
  window.FGF.sound   = sound;
  window.FGF.haptic  = haptic;
  window.FGF.ambient = ambient;

  // Auto-start ambient when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => ambient.start());
  } else {
    ambient.start();
  }

})();
