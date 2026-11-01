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
const caption = document.querySelector('#assembly-state');
const portraitImage = document.querySelector('.portrait-fallback');
const captions = [
  'A little curiosity, brought to life.',
  'Learning the world, one step at a time.',
  'Every experiment opens a new path.',
  'Turning questions into possibilities.',
  'Play. Explore. Discover. Begin again.',
  'Small steps. Unexpected discoveries.',
  'A new world starts with a question.',
  'Let curiosity write the next chapter.',
];
let captionIndex = 0;
let characterCount = 0;
let deletingCaption = false;
let captionActive = false;
let nextCharacterAt = 0;
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

function updateControls({ assembled, paused, progress, settled, time }) {
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
  if (assembled && settled) {
    if (!captionActive) {
      captionActive = true;
      characterCount = 0;
      deletingCaption = false;
      nextCharacterAt = time + .35;
      caption.textContent = '';
    }
    if (!paused && time >= nextCharacterAt) {
      characterCount = Math.max(0, characterCount + (deletingCaption ? -2 : 1));
      caption.textContent = captions[captionIndex].slice(0, characterCount);
      if (deletingCaption && characterCount === 0) {
        captionIndex = (captionIndex + 1 + Math.floor(Math.random() * (captions.length - 1))) % captions.length;
        deletingCaption = false;
        nextCharacterAt = time + .45;
      } else if (!deletingCaption && characterCount === captions[captionIndex].length) {
        deletingCaption = true;
        nextCharacterAt = time + 2.4 + Math.random() * .8;
      } else {
        nextCharacterAt = time + (deletingCaption ? .035 : .055 + Math.random() * .045);
      }
    }
  } else {
    captionActive = false;
    caption.textContent = paused ? 'Motion paused.' : assembled ? 'Gathering possibilities...' : 'A world of possibilities.';
  }
}

async function startHero() {
  await new Promise(resolve => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
  await Promise.all([document.fonts.ready, portraitImage.decode()]);
  hero.dataset.ready = 'true';
  await Promise.all(hero.getAnimations().map(animation => animation.finished));
  return createParticlePortrait({
    canvas: document.querySelector('#particles'),
    image: portraitImage,
    anchor: document.querySelector('.portrait-anchor'),
    reducedMotion: motionPreference.matches,
    theme: root.dataset.theme,
    onUpdate: updateControls,
  });
}

startHero().then(controller => {
  portrait = controller;
  portrait.setTheme(root.dataset.theme);
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
  hero.dataset.ready = 'true';
  hero.classList.add('static-portrait');
  document.querySelector('.particle-controls').hidden = true;
  document.querySelector('.telemetry').hidden = true;
  document.querySelector('.interaction-hint').hidden = true;
  announcement.textContent = 'The interactive portrait is unavailable. A still illustration is shown.';
  console.error('Particle portrait could not start:', error);
});
