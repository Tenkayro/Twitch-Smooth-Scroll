(() => {
  'use strict';

  const DEFAULTS = { enabled: true, speed: 1 };
  const enabledInput = document.querySelector('#enabled');
  const speedInput = document.querySelector('#speed');
  const status = document.querySelector('#status');
  let statusTimer = 0;

  function showSaved() {
    status.textContent = 'Gespeichert';
    window.clearTimeout(statusTimer);
    statusTimer = window.setTimeout(() => {
      status.textContent = '';
    }, 1200);
  }

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
