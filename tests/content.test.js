'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const listeners = new Map();
const frames = [];
let observerCallback;

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
  isConnected: true,
  parentElement: scrollContainer
};

const context = {
  console,
  performance: { now: () => 0 },
  document: {
    body: {},
    querySelector(selector) {
      return selector.includes('message-container') ? messageContainer : null;
    }
  },
  window: {
    getComputedStyle: () => ({ overflowY: 'auto' }),
    setInterval: () => 1,
    addEventListener() {},
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
  requestAnimationFrame(callback) {
    frames.push(callback);
    return frames.length;
  },
  cancelAnimationFrame() {}
};

vm.createContext(context);
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
vm.runInContext(source, context);

function drainFrames(limit = 500) {
  let time = 0;
  let count = 0;
  while (frames.length && count < limit) {
    const frame = frames.shift();
    time += 16;
    frame(time);
    count += 1;
  }
  assert.ok(count < limit, 'animation should settle');
}

scrollContainer.scrollHeight = 1040;
observerCallback([{ addedNodes: [{}] }]);
drainFrames();
assert.equal(scrollContainer.scrollTop, 640, 'new message should be followed to the bottom');

listeners.get('wheel')({ deltaY: -100 });
scrollContainer.scrollTop = 400;
scrollContainer.scrollHeight = 1080;
observerCallback([{ addedNodes: [{}] }]);
assert.equal(frames.length, 0, 'scrolling upward should pause chat following');

scrollContainer.scrollTop = 680;
listeners.get('scroll')();
scrollContainer.scrollHeight = 1120;
observerCallback([{ addedNodes: [{}] }]);
drainFrames();
assert.equal(scrollContainer.scrollTop, 720, 'returning to the bottom should resume following');

console.log('content scroll behavior: OK');
