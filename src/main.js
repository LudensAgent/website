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
const toggleLabel = document.querySelector('#toggle-label');
const pauseIcon = document.querySelector('#pause-icon');
const assemblyProgress = document.querySelector('#assembly-progress');
const progressFill = document.querySelector('#progress-fill');
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
// "A General Game Agent Framework", echoed in twenty languages beneath the title.
const translations = [
  { lang: 'zh-Hans', text: '一个通用游戏智能体框架' },
  { lang: 'ja', text: '汎用ゲームエージェントフレームワーク' },
  { lang: 'ko', text: '범용 게임 에이전트 프레임워크' },
  { lang: 'es', text: 'Un marco general para agentes de juego' },
  { lang: 'fr', text: 'Un cadre général pour agents de jeu' },
  { lang: 'de', text: 'Ein allgemeines Framework für Spielagenten' },
  { lang: 'pt', text: 'Uma estrutura geral para agentes de jogo' },
  { lang: 'it', text: 'Un framework generale per agenti di gioco' },
  { lang: 'ru', text: 'Общий фреймворк игровых агентов' },
  { lang: 'ar', text: 'إطار عام لوكلاء الألعاب', rtl: true },
  { lang: 'hi', text: 'एक सामान्य गेम एजेंट फ्रेमवर्क' },
  { lang: 'el', text: 'Ένα γενικό πλαίσιο πρακτόρων παιχνιδιού' },
  { lang: 'tr', text: 'Genel bir oyun ajanı çerçevesi' },
  { lang: 'nl', text: 'Een algemeen raamwerk voor spelagenten' },
  { lang: 'pl', text: 'Ogólne ramy agentów do gier' },
  { lang: 'sv', text: 'Ett allmänt ramverk för spelagenter' },
  { lang: 'th', text: 'กรอบงานเอเจนต์เกมทั่วไป' },
  { lang: 'vi', text: 'Một khung tác tử trò chơi tổng quát' },
  { lang: 'id', text: 'Kerangka umum agen permainan' },
  { lang: 'he', text: 'מסגרת כללית לסוכני משחק', rtl: true },
];
const translationLine = document.querySelector('.description-translation');
const translationText = document.querySelector('#translation-text');
let translationIndex = 0;
let translationChars = [];
let translationCount = 0;
let translationDeleting = false;
let translationNextAt = 0;
let translationPaused = false;
let captionIndex = 0;
let characterCount = 0;
let deletingCaption = false;
let captionActive = false;
let nextCharacterAt = 0;
let portrait;
let previousControls = '';
let previousProgress = -1;

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

function setTranslationLanguage(index) {
  translationIndex = index;
  const translation = translations[index];
  translationChars = Array.from(translation.text);
  translationText.lang = translation.lang;
  translationLine.dir = translation.rtl ? 'rtl' : 'ltr';
}

// Type each translation in, hold it, erase it, then move to the next language.
// Mirrors the telemetry caption, which keeps typing even when reduced motion is requested.
function updateTranslation(time) {
  if (time < translationNextAt) return;
  if (!translationDeleting && translationCount === translationChars.length) {
    translationDeleting = true;
    translationNextAt = time + 2.4 + Math.random() * .8;
    return;
  }
  translationCount = Math.max(0, Math.min(translationChars.length, translationCount + (translationDeleting ? -2 : 1)));
  translationText.textContent = translationChars.slice(0, translationCount).join('');
  translationNextAt = time + (translationDeleting ? .035 : .055 + Math.random() * .045);
  if (translationDeleting && translationCount === 0) {
    setTranslationLanguage((translationIndex + 1) % translations.length);
    translationDeleting = false;
    translationNextAt = time + .45;
  } else if (!translationDeleting && translationCount === translationChars.length) {
    translationDeleting = true;
    translationNextAt = time + 2.4 + Math.random() * .8;
  }
}

setTranslationLanguage(0);
requestAnimationFrame(function animateTranslations(now) {
  if (hero.dataset.ready === 'true' && !translationPaused) updateTranslation(now / 1000);
  requestAnimationFrame(animateTranslations);
});

function updateControls({ assembled, paused, progress, settled, time }) {
  translationPaused = paused;
  const controls = `${assembled}:${paused}:${settled}`;
  if (controls !== previousControls) {
    toggle.setAttribute('aria-pressed', String(!assembled));
    toggleLabel.textContent = assembled ? 'Disperse' : 'Reassemble';
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? 'Resume animation' : 'Pause animation');
    pause.title = paused ? 'Resume animation' : 'Pause animation';
    pauseIcon.setAttribute('d', paused ? 'M6 3l10 7-10 7Z' : 'M6 4v12M14 4v12');
    hero.classList.toggle('motion-paused', paused);
    hero.dataset.assembly = assembled ? settled ? 'assembled' : 'assembling' : settled ? 'dispersed' : 'dispersing';
    previousControls = controls;
  }
  const percentage = Math.round(progress * 100);
  if (percentage !== previousProgress) {
    assemblyProgress.textContent = `${String(percentage).padStart(3, '0')}%`;
    progressFill.style.width = `${percentage}%`;
    previousProgress = percentage;
  }
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
    const text = paused ? 'Motion paused.' : assembled ? 'Gathering possibilities...' : 'A world of possibilities.';
    if (caption.textContent !== text) caption.textContent = text;
  }
}

async function startHero() {
  await new Promise(resolve => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
  await Promise.all([document.fonts.ready, portraitImage.decode()]);
  const controller = await createParticlePortrait({
    canvas: document.querySelector('#particles'),
    image: portraitImage,
    anchor: document.querySelector('.portrait-anchor'),
    reducedMotion: motionPreference.matches,
    theme: root.dataset.theme,
    onUpdate: updateControls,
  });
  hero.dataset.ready = 'true';
  await Promise.all(hero.getAnimations().map(animation => animation.finished));
  controller.start();
  return controller;
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
