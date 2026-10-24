(() => {
  'use strict';

  const DEFAULTS = Object.freeze({
    enabled: true,
    speed: 1
  });

  const MESSAGE_CONTAINER_SELECTORS = [
    '[data-test-selector="chat-scrollable-area__message-container"]',
    '.chat-scrollable-area__message-container',
    '[data-a-target="chat-messages"]',
    '.chat-messages',
    '[data-a-target="chat-scroller"]'
  ];

  const SCROLL_CONTAINER_SELECTORS = [
    '[data-a-target="chat-scroller"]',
    '[data-test-selector="chat-scrollable-area__scroll-container"]',
    '.chat-scrollable-area__scroll-container',
    '.simplebar-scroll-content',
    '.simplebar-content-wrapper'
  ];

  const FOLLOW_DISTANCE_PX = 240;
  const RESUME_DISTANCE_PX = 48;
  const CONTAINER_CHECK_MS = 1000;

  class TwitchSmoothScroll {
    constructor() {
      this.settings = { ...DEFAULTS };
      this.messageContainer = null;
      this.scrollContainer = null;
      this.messageObserver = null;
      this.animationFrame = 0;
      this.lastFrameTime = 0;
      this.lastScrollTop = 0;
      this.following = true;
      this.pointerActive = false;

      this.onMutations = this.onMutations.bind(this);
      this.onScroll = this.onScroll.bind(this);
      this.onWheel = this.onWheel.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);

      this.loadSettings();
      this.watchSettings();
      this.containerTimer = window.setInterval(() => this.bindChat(), CONTAINER_CHECK_MS);
    }

    loadSettings() {
      chrome.storage.sync.get(DEFAULTS, (stored) => {
        this.settings.enabled = stored.enabled !== false;
        this.settings.speed = this.normalizeSpeed(stored.speed);
        this.bindChat();
      });
    }

    watchSettings() {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== 'sync') return;

        if (changes.enabled) {
          this.settings.enabled = changes.enabled.newValue !== false;
          if (!this.settings.enabled) this.stopAnimation();
        }

        if (changes.speed) {
          this.settings.speed = this.normalizeSpeed(changes.speed.newValue);
        }

        this.bindChat();
      });
    }

    normalizeSpeed(value) {
      const speed = Number(value);
      return Number.isFinite(speed) ? Math.min(2, Math.max(0.5, speed)) : DEFAULTS.speed;
    }

    queryFirst(selectors) {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) return element;
      }
      return null;
    }

    findScrollableAncestor(element) {
      let current = element;

      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const canScroll = /(auto|scroll|overlay)/.test(style.overflowY);
        if (canScroll && current.scrollHeight > current.clientHeight) return current;
        current = current.parentElement;
      }

      return null;
    }

    findChat() {
      const messageContainer = this.queryFirst(MESSAGE_CONTAINER_SELECTORS);
      if (!messageContainer) return null;

      const scrollContainer =
        this.findScrollableAncestor(messageContainer) ||
        this.queryFirst(SCROLL_CONTAINER_SELECTORS) ||
        messageContainer;

      return { messageContainer, scrollContainer };
    }

    bindChat() {
      if (!this.settings.enabled) {
        this.unbindChat();
        return;
      }

      const chat = this.findChat();
      if (!chat) return;

      const isCurrent =
        chat.messageContainer === this.messageContainer &&
        chat.scrollContainer === this.scrollContainer &&
        chat.messageContainer.isConnected &&
        chat.scrollContainer.isConnected;

      if (isCurrent) return;

      this.unbindChat();
      this.messageContainer = chat.messageContainer;
      this.scrollContainer = chat.scrollContainer;
      this.lastScrollTop = this.scrollContainer.scrollTop;
      this.following = this.distanceFromBottom() <= FOLLOW_DISTANCE_PX;

      this.messageObserver = new MutationObserver(this.onMutations);
      this.messageObserver.observe(this.messageContainer, {
        childList: true,
        subtree: true
      });

      this.scrollContainer.addEventListener('scroll', this.onScroll, { passive: true });
      this.scrollContainer.addEventListener('wheel', this.onWheel, { passive: true });
      this.scrollContainer.addEventListener('pointerdown', this.onPointerDown, { passive: true });
      window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    }

    unbindChat() {
      this.stopAnimation();
      this.messageObserver?.disconnect();
      this.messageObserver = null;

      if (this.scrollContainer) {
        this.scrollContainer.removeEventListener('scroll', this.onScroll);
        this.scrollContainer.removeEventListener('wheel', this.onWheel);
        this.scrollContainer.removeEventListener('pointerdown', this.onPointerDown);
      }
      window.removeEventListener('pointerup', this.onPointerUp);

      this.messageContainer = null;
      this.scrollContainer = null;
      this.pointerActive = false;
    }

    distanceFromBottom() {
      if (!this.scrollContainer) return Infinity;
      return Math.max(
        0,
        this.scrollContainer.scrollHeight -
          this.scrollContainer.clientHeight -
          this.scrollContainer.scrollTop
      );
    }

    onWheel(event) {
      if (event.deltaY < 0) {
        this.following = false;
        this.stopAnimation();
      } else if (this.distanceFromBottom() <= FOLLOW_DISTANCE_PX) {
        this.following = true;
      }
    }

    onPointerDown() {
      this.pointerActive = true;
      this.stopAnimation();
    }

    onPointerUp() {
      this.pointerActive = false;
      this.following = this.distanceFromBottom() <= RESUME_DISTANCE_PX;
    }

    onScroll() {
      const currentScrollTop = this.scrollContainer?.scrollTop ?? 0;

      if (this.pointerActive) {
        this.following = this.distanceFromBottom() <= RESUME_DISTANCE_PX;
        this.lastScrollTop = currentScrollTop;
        return;
      }

      if (!this.animationFrame) {
        if (currentScrollTop < this.lastScrollTop - 1) {
          this.following = false;
        } else if (this.distanceFromBottom() <= RESUME_DISTANCE_PX) {
          this.following = true;
        }
      }

      this.lastScrollTop = currentScrollTop;
    }

    onMutations(mutations) {
      const hasAddedContent = mutations.some((mutation) => mutation.addedNodes.length > 0);
      if (!hasAddedContent || !this.following || this.pointerActive) return;
      this.startAnimation();
    }

    startAnimation() {
      if (this.animationFrame || !this.scrollContainer || !this.settings.enabled) return;
      this.lastFrameTime = performance.now();
      this.animationFrame = requestAnimationFrame((time) => this.animate(time));
    }

    animate(time) {
      this.animationFrame = 0;
      const container = this.scrollContainer;
      if (!container || !container.isConnected || !this.following || this.pointerActive) return;

      const distance = this.distanceFromBottom();
      const targetScrollTop = Math.max(0, container.scrollHeight - container.clientHeight);
      if (distance <= 0.5) {
        container.scrollTop = targetScrollTop;
        return;
      }

      const elapsed = Math.min(50, Math.max(1, time - this.lastFrameTime));
      this.lastFrameTime = time;

      // Adapted from Twitch ToolKit's short, linear chat-follow animation.
      // One shared animation is retargeted every frame so fast 7TV/Twitch updates
      // never create competing requestAnimationFrame loops.
      const baseDuration = Math.min(260, Math.max(80, distance * 0.22));
      const duration = baseDuration / this.settings.speed;
      const step = Math.max(0.75, distance * Math.min(1, elapsed / duration));
      container.scrollTop = Math.min(targetScrollTop, container.scrollTop + step);
      this.lastScrollTop = container.scrollTop;

      this.animationFrame = requestAnimationFrame((nextTime) => this.animate(nextTime));
    }

    stopAnimation() {
      if (!this.animationFrame) return;
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
    }
  }

  new TwitchSmoothScroll();
})();
