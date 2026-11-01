import './style.css';
import { createParticlePortrait } from './particles.js';

const root = document.documentElement;
const hero = document.querySelector('.hero');
const themeButtons = [...document.querySelectorAll('[data-theme-option]')];
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
const themePreference = matchMedia('(prefers-color-scheme: dark)');
const toggle = document.querySelector('#toggle-particles');
const replay = document.querySelector('#replay');
const pause = document.querySelector('#pause');
const announcement = document.querySelector('#animation-announcement');
let portrait;

function setTheme(theme) {
  root.dataset.theme = theme;
  themeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.themeOption === theme)));
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#060b14' : '#f5f7fb';
  portrait?.setTheme(theme);
}

themeButtons.forEach(button => button.addEventListener('click', () => {
  const theme = button.dataset.themeOption;
  setTheme(theme);
  document.cookie = `ludens-theme=${theme}; max-age=31536000; path=/; SameSite=Lax`;
}));
themePreference.addEventListener('change', event => {
  if (!document.cookie.split('; ').some(value => value.startsWith('ludens-theme='))) setTheme(event.matches ? 'dark' : 'light');
});
setTheme(root.dataset.theme);

function updateControls({ assembled, paused, progress, settled }) {
  toggle.setAttribute('aria-pressed', String(!assembled));
  document.querySelector('#toggle-label').textContent = assembled ? 'Disperse' : 'Reassemble';
  pause.setAttribute('aria-pressed', String(paused));
  pause.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
  pause.title = paused ? 'Resume animation' : 'Pause animation';
  document.querySelector('#pause-icon').setAttribute('d', paused ? 'M6 3l10 7-10 7Z' : 'M6 4v12M14 4v12');
  hero.classList.toggle('motion-paused', paused);
  hero.dataset.assembly = assembled ? settled ? 'assembled' : 'assembling' : settled ? 'dispersed' : 'dispersing';
  document.querySelector('#assembly-progress').textContent = `${String(Math.round(progress * 100)).padStart(3, '0')}%`;
  document.querySelector('#progress-fill').style.width = `${progress * 100}%`;
  document.querySelector('#assembly-state').textContent = paused ? 'Motion paused.' : assembled ? settled ? 'A little curiosity, brought to life.' : 'Gathering possibilities...' : 'A world of possibilities.';
}

createParticlePortrait({
  canvas: document.querySelector('#particles'),
  image: document.querySelector('.portrait-fallback'),
  anchor: document.querySelector('.portrait-anchor'),
  reducedMotion: motionPreference.matches,
  theme: root.dataset.theme,
  onUpdate: updateControls,
}).then(controller => {
  portrait = controller;
  [toggle, replay, pause].forEach(button => { button.disabled = false; });
  toggle.addEventListener('click', () => {
    const assembled = portrait.toggle();
    announcement.textContent = assembled ? 'The whale girl is reassembling.' : 'The whale girl is dispersing into particles.';
  });
  replay.addEventListener('click', () => {
    portrait.replay();
    announcement.textContent = 'Replaying the particle assembly.';
  });
  pause.addEventListener('click', () => portrait.togglePause());
  motionPreference.addEventListener('change', event => portrait.setReducedMotion(event.matches));
  if (import.meta.hot) import.meta.hot.dispose(() => portrait.dispose());
}).catch(error => {
  hero.classList.add('static-portrait');
  document.querySelector('.particle-controls').hidden = true;
  document.querySelector('.telemetry').hidden = true;
  document.querySelector('.interaction-hint').hidden = true;
  announcement.textContent = 'The interactive portrait is unavailable. A still illustration is shown.';
  console.error('Particle portrait could not start:', error);
});
