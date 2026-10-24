(() => {
  'use strict';

  const DEFAULTS = { enabled: true, speed: 1 };
  const enabledInput = document.querySelector('#enabled');
  const speedInput = document.querySelector('#speed');
  const status = document.querySelector('#status');
  let statusTimer = 0;

  function localizePopup() {
    const language = chrome.i18n.getUILanguage().replace('_', '-');
    document.documentElement.lang = language;
    document.documentElement.dir = /^(ar|he|fa|ur)(-|$)/i.test(language) ? 'rtl' : 'ltr';
    document.title = chrome.i18n.getMessage('extensionName');

    document.querySelectorAll('[data-i18n]').forEach((element) => {
      const message = chrome.i18n.getMessage(element.dataset.i18n);
      if (message) element.textContent = message;
    });
  }

  function showSaved() {
    status.textContent = chrome.i18n.getMessage('saved');
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      status.textContent = '';
    }, 1200);
  }

  localizePopup();

  chrome.storage.sync.get(DEFAULTS, (settings) => {
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
})();
