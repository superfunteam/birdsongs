import { ICONS } from './icons.js';

const KEY = 'birdsongs:settings';

export function loadSettings() {
  const defaults = { music: true, sound: true, volume: 0.8, scene: 0 };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return defaults;
  }
}

export function saveSettings(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private mode etc.
  }
}

const $ = (id) => document.getElementById(id);

export class Controls {
  constructor({ settings, scenes, onStart, onMusic, onSound, onVolume, onScene, onSkip }) {
    this.settings = settings;
    this.scenes = scenes;
    this.handlers = { onStart, onMusic, onSound, onVolume, onScene, onSkip };
    this.started = false;

    // icons
    $('dock-toggle').innerHTML = ICONS.bird;
    $('scene-prev').innerHTML = ICONS.prev;
    $('scene-next').innerHTML = ICONS.next;
    $('skip').insertAdjacentHTML('afterbegin', ICONS.skip);
    $('fullscreen').insertAdjacentHTML('afterbegin', ICONS.full);
    $('hide-ui').insertAdjacentHTML('afterbegin', ICONS.close);
    document.querySelector('#t-music .ico').innerHTML = ICONS.note;
    document.querySelector('#t-sound .ico').innerHTML = ICONS.rain;
    document.querySelector('#start .ico').innerHTML = ICONS.play;

    this.bindIntro();
    this.bindDock();
    this.bindKeys();
    this.bindIdle();
    this.render();
  }

  // ---------------------------------------------------------------- intro
  bindIntro() {
    const intro = $('intro');
    const go = (e) => {
      if (this.started) return;
      e?.preventDefault?.();
      this.started = true;
      intro.classList.add('gone');
      setTimeout(() => intro.remove(), 900);
      this.handlers.onStart();
    };
    intro.addEventListener('click', go);
    $('start').addEventListener('click', go);
    this.startFromKey = go;
  }

  // ---------------------------------------------------------------- dock
  bindDock() {
    const panel = $('panel');
    const toggle = $('dock-toggle');
    toggle.addEventListener('click', () => this.setPanel(panel.hidden));
    $('t-music').addEventListener('click', () => this.toggle('music'));
    $('t-sound').addEventListener('click', () => this.toggle('sound'));
    $('volume').addEventListener('input', (e) => {
      this.settings.volume = parseFloat(e.target.value);
      this.handlers.onVolume(this.settings.volume);
      this.persist();
    });
    $('scene-prev').addEventListener('click', () => this.handlers.onScene(-1));
    $('scene-next').addEventListener('click', () => this.handlers.onScene(1));
    $('skip').addEventListener('click', () => this.handlers.onSkip());
    $('fullscreen').addEventListener('click', () => this.fullscreen());
    $('hide-ui').addEventListener('click', () => this.hideAll(true));
    document.addEventListener('pointerdown', (e) => {
      if (!panel.hidden && !$('dock').contains(e.target)) this.setPanel(false);
    });
  }

  setPanel(open) {
    const panel = $('panel');
    panel.hidden = !open;
    $('dock-toggle').setAttribute('aria-expanded', String(open));
    $('dock').classList.toggle('open', open);
  }

  toggle(which) {
    this.settings[which] = !this.settings[which];
    if (which === 'music') this.handlers.onMusic(this.settings.music);
    else this.handlers.onSound(this.settings.sound);
    this.persist();
    this.render();
    this.flash(`${which === 'music' ? 'music' : 'sounds'} ${this.settings[which] ? 'on' : 'off'}`);
  }

  fullscreen() {
    const el = document.documentElement;
    if (!document.fullscreenElement) el.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.();
  }

  hideAll(hidden) {
    document.body.classList.toggle('ui-hidden', hidden);
    if (hidden) this.setPanel(false);
  }

  // ---------------------------------------------------------------- keys
  bindKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof HTMLInputElement) return;
      if (!this.started && (e.key === 'Enter' || e.key === ' ')) {
        this.startFromKey(e);
        return;
      }
      switch (e.key.toLowerCase()) {
        case 'm':
          this.toggle('music');
          break;
        case 's':
          this.toggle('sound');
          break;
        case 'arrowright':
          this.handlers.onScene(1);
          break;
        case 'arrowleft':
          this.handlers.onScene(-1);
          break;
        case 'n':
          this.handlers.onSkip();
          break;
        case 'h':
          this.hideAll(!document.body.classList.contains('ui-hidden'));
          break;
        case 'f':
          this.fullscreen();
          break;
        case 'escape':
          this.setPanel(false);
          break;
        default:
          return;
      }
      this.wake();
    });
  }

  // ---------------------------------------------------------------- idle fade
  bindIdle() {
    this.idleTimer = null;
    const wake = () => this.wake();
    for (const ev of ['pointermove', 'pointerdown', 'touchstart', 'wheel']) window.addEventListener(ev, wake, { passive: true });
    this.wake();
  }

  wake() {
    document.body.classList.remove('idle');
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if ($('dock').matches(':hover') || !$('panel').hidden) {
        this.wake();
        return;
      }
      document.body.classList.add('idle');
    }, 3500);
  }

  // ---------------------------------------------------------------- display
  render() {
    const s = this.settings;
    $('t-music').setAttribute('aria-pressed', String(s.music));
    $('t-sound').setAttribute('aria-pressed', String(s.sound));
    $('volume').value = String(s.volume);
    const sc = this.scenes[s.scene] || this.scenes[0];
    $('scene-name').textContent = sc.name;
  }

  persist() {
    saveSettings(this.settings);
  }

  setScene(index) {
    this.settings.scene = index;
    this.persist();
    this.render();
  }

  showScene(scene) {
    this.toast('scene', scene.name, scene.blurb);
  }

  showSong(song) {
    $('song-title').textContent = song.title;
    $('song-meta').textContent = `${song.composer} · ${song.year}`;
    this.toast('now playing', song.title, song.composer);
    if ('mediaSession' in navigator && window.MediaMetadata) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: song.title,
        artist: song.composer,
        album: 'Birdsongs',
      });
    }
  }

  toast(kicker, title, sub) {
    const el = $('toast');
    el.innerHTML = '';
    const k = document.createElement('div');
    k.className = 'kicker';
    k.textContent = kicker;
    const t = document.createElement('div');
    t.className = 't';
    t.textContent = title;
    const s = document.createElement('div');
    s.className = 's';
    s.textContent = sub || '';
    el.append(k, t, s);
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('show'), 6500);
  }

  flash(text) {
    const el = $('flash');
    el.textContent = text;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => el.classList.remove('show'), 1400);
  }

  setViewers(n) {
    $('viewers').textContent = n == null ? '1' : String(n);
  }
}
