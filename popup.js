(() => {
  'use strict';

  const DEFAULTS = { enabled: true, speed: 1, language: 'auto' };
  const LOCALES = [
    ['ar', 'العربية'],
    ['bg', 'Български'],
    ['ca', 'Català'],
    ['cs', 'Čeština'],
    ['da', 'Dansk'],
    ['de', 'Deutsch'],
    ['el', 'Ελληνικά'],
    ['en', 'English'],
    ['es', 'Español'],
    ['fi', 'Suomi'],
    ['fil', 'Filipino'],
    ['fr', 'Français'],
    ['he', 'עברית'],
    ['hi', 'हिन्दी'],
    ['hr', 'Hrvatski'],
    ['hu', 'Magyar'],
    ['id', 'Bahasa Indonesia'],
    ['it', 'Italiano'],
    ['ja', '日本語'],
    ['ko', '한국어'],
    ['nl', 'Nederlands'],
    ['no', 'Norsk'],
    ['pl', 'Polski'],
    ['pt_BR', 'Português (Brasil)'],
    ['pt_PT', 'Português (Portugal)'],
    ['ro', 'Română'],
    ['ru', 'Русский'],
    ['sk', 'Slovenčina'],
    ['sv', 'Svenska'],
    ['th', 'ไทย'],
    ['tr', 'Türkçe'],
    ['uk', 'Українська'],
    ['vi', 'Tiếng Việt'],
    ['zh_CN', '简体中文'],
    ['zh_TW', '繁體中文']
  ];

  const enabledInput = document.querySelector('#enabled');
  const speedInput = document.querySelector('#speed');
  const languageInput = document.querySelector('#language');
  const status = document.querySelector('#status');
  let statusTimer = 0;
  let getText = (key) => chrome.i18n.getMessage(key);

  async function loadMessages(language) {
    if (language === 'auto') {
      return (key) => chrome.i18n.getMessage(key);
    }

    try {
      const url = chrome.runtime.getURL(`_locales/${language}/messages.json`);
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Locale ${language} could not be loaded`);
      const messages = await response.json();
      return (key) => messages[key]?.message || chrome.i18n.getMessage(key);
    } catch (error) {
      console.warn('[Twitch Smooth Scroll]', error);
      return (key) => chrome.i18n.getMessage(key);
    }
  }

  function populateLanguages(selectedLanguage) {
    languageInput.replaceChildren();

    const automatic = document.createElement('option');
    automatic.value = 'auto';
    automatic.textContent = getText('automatic');
    languageInput.appendChild(automatic);

    for (const [value, label] of LOCALES) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      languageInput.appendChild(option);
    }

    languageInput.value = LOCALES.some(([value]) => value === selectedLanguage)
      ? selectedLanguage
      : 'auto';
  }

  async function localizePopup(language) {
    getText = await loadMessages(language);
    const browserLanguage = chrome.i18n.getUILanguage().replace('_', '-');
    const activeLanguage = language === 'auto' ? browserLanguage : language.replace('_', '-');
    document.documentElement.lang = activeLanguage;
    document.documentElement.dir = /^(ar|he|fa|ur)(-|$)/i.test(activeLanguage) ? 'rtl' : 'ltr';
    document.title = getText('extensionName');

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const message = getText(element.dataset.i18n);
      if (message) element.textContent = message;
    });

    populateLanguages(language);
  }

  function showSaved() {
    status.textContent = getText('saved');
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      status.textContent = '';
    }, 1200);
  }

  chrome.storage.sync.get(DEFAULTS, async (settings) => {
    const language = typeof settings.language === 'string' ? settings.language : DEFAULTS.language;
    await localizePopup(language);
    enabledInput.checked = settings.enabled !== false;
    speedInput.value = String(settings.speed);
    if (!speedInput.value) speedInput.value = String(DEFAULTS.speed);
  });

  enabledInput.addEventListener('change', () => {
    chrome.storage.sync.set({ enabled: enabledInput.checked }, showSaved);
  });

  speedInput.addEventListener('change', () => {
    chrome.storage.sync.set({ speed: Number(speedInput.value) }, showSaved);
  });

  languageInput.addEventListener('change', async () => {
    const language = languageInput.value;
    await new Promise((resolve) => chrome.storage.sync.set({ language }, resolve));
    await localizePopup(language);
    showSaved();
  });
})();
