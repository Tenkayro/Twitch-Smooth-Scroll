'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = new Map();
const windowListeners = new Map();
const frames = [];
let observerCallback;
let resizeCallback;
let watchdogCallback;
let frameTime = 0;

const scrollContainer = {
  clientHeight: 400,
  scrollHeight: 1000,
  scrollTop: 600,
  isConnected: true,
  parentElement: null,
  addEventListener(type, callback) {
    listeners.set(type, callback);
  },
  removeEventListener() {}
};

const messageContainer = {
  // Mirrors Twitch's real inner message element: it can be taller than its
  // viewport even though the parent owns the actual scrollTop.
  clientHeight: 400,
  scrollHeight: 1000,
  scrollTop: 0,
  isConnected: true,
  parentElement: scrollContainer,
  closest(selector) {
    return selector.includes('chat-scroller') ? scrollContainer : null;
  }
};

const context = {
  console,
  performance: { now: () => frameTime },
  document: {
    body: {},
    querySelector(selector) {
      return selector.includes('message-container') ? messageContainer : null;
    }
  },
  window: {
    getComputedStyle: () => ({ overflowY: 'auto' }),
    setInterval(callback) {
      watchdogCallback = callback;
      return 1;
    },
    addEventListener(type, callback) {
      windowListeners.set(type, callback);
    },
    removeEventListener() {}
  },
  chrome: {
    storage: {
      sync: {
        get(defaults, callback) {
          callback(defaults);
        }
      },
      onChanged: { addListener() {} }
    }
  },
  MutationObserver: class {
    constructor(callback) {
      observerCallback = callback;
    }
    observe() {}
    disconnect() {}
  },
  ResizeObserver: class {
    constructor(callback) {
      resizeCallback = callback;
    }
    observe() {}
    disconnect() {}
  },
  requestAnimationFrame(callback) {
    frames.push(callback);
    return frames.length;
  },
  cancelAnimationFrame() {}
};

vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
vm.runInContext(source, context);

assert.ok(
  listeners.has('scroll') && listeners.has('wheel'),
  'the outer Twitch chat-scroller must receive the scroll listeners'
);

function drainFrames(limit = 500) {
  let count = 0;
  while (frames.length && count < limit) {
    const frame = frames.shift();
    frameTime += 16;
    frame(frameTime);
    count += 1;
  }
  assert.ok(count < limit, 'animation should settle');
}

scrollContainer.scrollHeight = 1040;
observerCallback([{ addedNodes: [{}] }]);
drainFrames();
assert.equal(scrollContainer.scrollTop, 640, 'new message should be followed to the bottom');

scrollContainer.scrollHeight = 1080;
scrollContainer.scrollTop = 680;
observerCallback([{ addedNodes: [{}] }]);
assert.equal(
  scrollContainer.scrollTop,
  640,
  'a native Twitch jump must be restored even before its scroll event arrives'
);
drainFrames();
assert.equal(scrollContainer.scrollTop, 680, 'the intercepted native jump should be replayed smoothly');

scrollContainer.scrollHeight = 1120;
resizeCallback();
drainFrames();
assert.equal(scrollContainer.scrollTop, 720, '7TV layout changes should animate without waiting for watchdog');

scrollContainer.scrollHeight = 1160;
observerCallback([{ addedNodes: [] }]);
drainFrames();
assert.equal(scrollContainer.scrollTop, 760, 'recycled Twitch message nodes should still trigger following');

for (let message = 0; message < 120; message += 1) {
  scrollContainer.scrollHeight += 24;
  observerCallback([{ addedNodes: [{}] }]);
  assert.equal(frames.length, 1, 'a busy chat must keep exactly one animation loop');
  const frame = frames.shift();
  frameTime += 16;
  frame(frameTime);
}
drainFrames();
assert.equal(
  scrollContainer.scrollTop,
  scrollContainer.scrollHeight - scrollContainer.clientHeight,
  'continuous high-volume messages should still settle smoothly at the bottom'
);

listeners.get('pointerdown')({ target: {}, button: 0 });
scrollContainer.scrollHeight += 40;
observerCallback([{ addedNodes: [{}] }]);
drainFrames();
assert.equal(
  scrollContainer.scrollTop,
  scrollContainer.scrollHeight - scrollContainer.clientHeight,
  'clicking chat content must not be mistaken for dragging the scrollbar'
);

listeners.get('wheel')({ deltaY: -100 });
scrollContainer.scrollTop = 400;
scrollContainer.scrollHeight = 1080;
observerCallback([{ addedNodes: [{}] }]);
resizeCallback();
assert.equal(frames.length, 0, 'scrolling upward should pause chat following');

scrollContainer.scrollTop = 680;
listeners.get('scroll')();
scrollContainer.scrollHeight = 1120;
observerCallback([{ addedNodes: [{}] }]);
drainFrames();
assert.equal(scrollContainer.scrollTop, 720, 'returning to the bottom should resume following');

scrollContainer.scrollHeight = 1160;
watchdogCallback();
drainFrames();
assert.equal(scrollContainer.scrollTop, 760, 'watchdog should catch height changes without DOM mutations');

scrollContainer.scrollTop = 730;
listeners.get('scroll')();
scrollContainer.scrollHeight = 1200;
observerCallback([{ addedNodes: [{}] }]);
drainFrames();
assert.equal(scrollContainer.scrollTop, 800, 'Twitch virtual-list repositioning should not pause following');

listeners.get('pointerdown')({ target: scrollContainer, button: 0 });
windowListeners.get('blur')();
scrollContainer.scrollHeight = 1240;
watchdogCallback();
drainFrames();
assert.equal(scrollContainer.scrollTop, 840, 'lost pointerup should recover when the window loses focus');

scrollContainer.scrollHeight = 1280;
scrollContainer.scrollTop = 880;
listeners.get('scroll')();
assert.equal(scrollContainer.scrollTop, 840, 'an instant Twitch jump should be restored before animation');
drainFrames();
assert.equal(scrollContainer.scrollTop, 880, 'an instant Twitch jump should be replayed smoothly');

listeners.get('pointerdown')({ target: scrollContainer, button: 0 });
scrollContainer.scrollTop = 500;
listeners.get('scroll')();
windowListeners.get('pointerup')();
scrollContainer.scrollHeight = 1320;
observerCallback([{ addedNodes: [{}] }]);
assert.equal(frames.length, 0, 'dragging the scrollbar upward should pause following');

console.log('content scroll behavior: OK');
