import { ICONS } from './icons.js';

const KEY = 'birdsongs:settings';

export const DEFAULTS = {
  music: true,
  sound: true,
  notes: true,
  silhouette: false,
  shuffle: false,
  volume: 0.8,
  scene: 0,
  bird: 'mixed',
};

export function loadSettings() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
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

// toggle buttons → setting keys (+ the label used in the little flash message)
const TOGGLES = [
  { id: 't-music', key: 'music', icon: 'note', label: 'music' },
  { id: 't-sound', key: 'sound', icon: 'rain', label: 'sounds' },
  { id: 't-notes', key: 'notes', icon: 'pip', label: 'notes' },
  { id: 't-silhouette', key: 'silhouette', icon: 'silhouette', label: 'silhouette' },
  { id: 't-shuffle', key: 'shuffle', icon: 'shuffle', label: 'shuffle wires' },
];

export class Controls {
  // birds: [{ id, label }] with 'mixed' first
  constructor({ settings, scenes, birds, onStart, onToggle, onVolume, onScene, onBird, onSkip, onReshuffle }) {
    this.settings = settings;
    this.scenes = scenes;
    this.birds = birds;
    this.handlers = { onStart, onToggle, onVolume, onScene, onBird, onSkip, onReshuffle };
    this.started = false;

    $('dock-toggle').innerHTML = ICONS.bird;
    for (const id of ['scene-prev', 'bird-prev']) $(id).innerHTML = ICONS.prev;
    for (const id of ['scene-next', 'bird-next']) $(id).innerHTML = ICONS.next;
    $('skip').insertAdjacentHTML('afterbegin', ICONS.skip);
    $('reshuffle').insertAdjacentHTML('afterbegin', ICONS.shuffle);
    $('hide-ui').insertAdjacentHTML('afterbegin', ICONS.close);
    for (const t of TOGGLES) document.querySelector(`#${t.id} .ico`).innerHTML = ICONS[t.icon];
    document.querySelector('#t-full .ico').innerHTML = ICONS.full;
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
    $('dock-toggle').addEventListener('click', () => this.setPanel(panel.hidden));
    for (const t of TOGGLES) $(t.id).addEventListener('click', () => this.toggle(t.key));
    $('t-full').addEventListener('click', () => this.fullscreen());
    document.addEventListener('fullscreenchange', () => this.render());
    $('volume').addEventListener('input', (e) => {
      this.settings.volume = parseFloat(e.target.value);
      this.handlers.onVolume(this.settings.volume);
      this.persist();
    });
    $('scene-prev').addEventListener('click', () => this.handlers.onScene(-1));
    $('scene-next').addEventListener('click', () => this.handlers.onScene(1));
    $('bird-prev').addEventListener('click', () => this.cycleBird(-1));
    $('bird-next').addEventListener('click', () => this.cycleBird(1));
    $('skip').addEventListener('click', () => this.handlers.onSkip());
    $('reshuffle').addEventListener('click', () => this.handlers.onReshuffle());
    $('hide-ui').addEventListener('click', () => this.hideAll(true));
    document.addEventListener('pointerdown', (e) => {
      if (!panel.hidden && !$('dock').contains(e.target)) this.setPanel(false);
    });
  }

  setPanel(open) {
    $('panel').hidden = !open;
    $('dock-toggle').setAttribute('aria-expanded', String(open));
    $('dock').classList.toggle('open', open);
  }

  toggle(key) {
    this.settings[key] = !this.settings[key];
    this.handlers.onToggle(key, this.settings[key]);
    this.persist();
    this.render();
    const t = TOGGLES.find((x) => x.key === key);
    this.flash(`${t.label} ${this.settings[key] ? 'on' : 'off'}`);
  }

  cycleBird(dir) {
    const ids = this.birds.map((b) => b.id);
    const i = Math.max(0, ids.indexOf(this.settings.bird));
    const next = this.birds[(i + dir + ids.length) % ids.length];
    this.settings.bird = next.id;
    this.handlers.onBird(next.id);
    this.persist();
    this.render();
    this.flash(next.label);
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
        case 't':
          this.toggle('notes');
          break;
        case 'o':
          this.toggle('silhouette');
          break;
        case 'w':
          this.toggle('shuffle');
          break;
        case 'r':
          this.handlers.onReshuffle();
          break;
        case 'b':
          this.cycleBird(e.shiftKey ? -1 : 1);
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
    for (const t of TOGGLES) $(t.id).setAttribute('aria-pressed', String(!!s[t.key]));
    $('t-full').setAttribute('aria-pressed', String(!!document.fullscreenElement));
    $('volume').value = String(s.volume);
    const sc = this.scenes[s.scene] || this.scenes[0];
    $('scene-name').textContent = sc.name;
    $('bird-name').textContent = (this.birds.find((b) => b.id === s.bird) || this.birds[0]).label;
    $('reshuffle').hidden = !s.shuffle;
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
