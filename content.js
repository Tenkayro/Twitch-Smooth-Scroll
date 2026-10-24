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
    '.scrollable-area[data-a-target="chat-scroller"]',
    '[data-test-selector="chat-scrollable-area__scroll-container"]',
    '.chat-scrollable-area__scroll-container',
    '.simplebar-scroll-content',
    '.simplebar-content-wrapper'
  ];

  const FOLLOW_DISTANCE_PX = 240;
  const RESUME_DISTANCE_PX = 48;
  const WATCHDOG_INTERVAL_MS = 250;
  const SCROLL_STYLE_ID = 'twitch-smooth-scroll-control';

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
      this.pointerStartScrollTop = 0;
      this.followingBeforePointer = true;

      this.onMutations = this.onMutations.bind(this);
      this.onScroll = this.onScroll.bind(this);
      this.onWheel = this.onWheel.bind(this);
      this.onPointerDown = this.onPointerDown.bind(this);
      this.onPointerUp = this.onPointerUp.bind(this);
      this.onKeyDown = this.onKeyDown.bind(this);
      this.onWindowBlur = this.onWindowBlur.bind(this);

      this.loadSettings();
      this.watchSettings();
      this.containerTimer = window.setInterval(() => this.watchdogTick(), WATCHDOG_INTERVAL_MS);
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
        // Twitch also uses overflow:hidden for programmatically scrollable chat
        // elements, so only visible/clip are definitely not scroll containers.
        const canScroll = !/(visible|clip)/.test(style.overflowY);
        const isKnownScroller = SCROLL_CONTAINER_SELECTORS.some((selector) => current.matches?.(selector));
        if ((canScroll || isKnownScroller) && current.scrollHeight > current.clientHeight) {
          return current;
        }
        current = current.parentElement;
      }

      return null;
    }

    findChat() {
      const messageContainer = this.queryFirst(MESSAGE_CONTAINER_SELECTORS);
      if (!messageContainer) return null;

      const closestKnownScroller = messageContainer.closest?.(
        SCROLL_CONTAINER_SELECTORS.join(', ')
      );

      const scrollContainer =
        // Current Twitch DOM: .scrollable-area[data-a-target="chat-scroller"]
        // wraps the message container and owns scrollTop. The inner message
        // container may report a large scrollHeight but is not itself scrollable.
        closestKnownScroller ||
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
      this.installScrollControlStyle();
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
      window.addEventListener('pointercancel', this.onPointerUp, { passive: true });
      window.addEventListener('keydown', this.onKeyDown, { passive: true });
      window.addEventListener('blur', this.onWindowBlur);
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
      window.removeEventListener('pointercancel', this.onPointerUp);
      window.removeEventListener('keydown', this.onKeyDown);
      window.removeEventListener('blur', this.onWindowBlur);

      this.messageContainer = null;
      this.scrollContainer = null;
      this.pointerActive = false;
      document.getElementById?.(SCROLL_STYLE_ID)?.remove();
    }

    installScrollControlStyle() {
      if (document.getElementById?.(SCROLL_STYLE_ID) || !document.createElement) return;

      const style = document.createElement('style');
      style.id = SCROLL_STYLE_ID;
      style.textContent = `
        [data-a-target="chat-scroller"] {
          scroll-behavior: auto !important;
          overflow-anchor: none !important;
        }
      `;
      (document.head || document.documentElement)?.appendChild(style);
    }

    watchdogTick() {
      this.bindChat();

      // Images, badges and 7TV emotes can change the chat height without adding
      // another node. Keep following in that case even if MutationObserver is quiet.
      if (
        this.settings.enabled &&
        this.following &&
        !this.pointerActive &&
        this.scrollContainer?.isConnected &&
        this.distanceFromBottom() > 0.5
      ) {
        this.startAnimation();
      }
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
      this.pointerActive = false;
      if (event.deltaY < 0) {
        this.following = false;
        this.stopAnimation();
      } else if (this.distanceFromBottom() <= FOLLOW_DISTANCE_PX) {
        this.following = true;
      }
    }

    onPointerDown(event) {
      // Pointer events from usernames, emotes and 7TV controls bubble through
      // the scroller. Only the scroller itself can represent interaction with
      // its native scrollbar; ordinary chat clicks must never pause following.
      if (event?.target !== this.scrollContainer || (event.button ?? 0) !== 0) return;

      this.followingBeforePointer = this.following;
      this.pointerStartScrollTop = this.scrollContainer?.scrollTop ?? 0;
      this.pointerActive = true;
      this.stopAnimation();
    }

    onPointerUp() {
      if (!this.pointerActive) return;
      const currentScrollTop = this.scrollContainer?.scrollTop ?? 0;
      const dragged = Math.abs(currentScrollTop - this.pointerStartScrollTop) > 2;
      this.pointerActive = false;
      this.following = dragged
        ? this.distanceFromBottom() <= RESUME_DISTANCE_PX
        : this.followingBeforePointer || this.distanceFromBottom() <= RESUME_DISTANCE_PX;

      if (this.following) this.startAnimation();
    }

    onWindowBlur() {
      // A pointer release outside the tab does not always emit pointerup here.
      this.onPointerUp();
    }

    onKeyDown(event) {
      if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) {
        this.following = false;
        this.stopAnimation();
      } else if (event.key === 'End') {
        this.following = true;
        this.startAnimation();
      }
    }

    onScroll() {
      const currentScrollTop = this.scrollContainer?.scrollTop ?? 0;

      if (this.pointerActive) {
        this.following = this.distanceFromBottom() <= RESUME_DISTANCE_PX;
        this.lastScrollTop = currentScrollTop;
        return;
      }

      // Twitch sometimes performs its own instant jump after committing a new
      // message. Restore the last rendered position before paint and let our
      // single RAF loop animate the same distance instead.
      if (this.following && currentScrollTop > this.lastScrollTop + 2) {
        const previousScrollTop = this.lastScrollTop;
        this.stopAnimation();
        this.scrollContainer.scrollTop = previousScrollTop;
        this.lastScrollTop = previousScrollTop;
        this.startAnimation();
        return;
      }

      // Do not interpret Twitch's virtual-list repositioning as user input.
      // Explicit wheel, pointer and keyboard handlers pause following instead.
      if (!this.animationFrame && this.distanceFromBottom() <= RESUME_DISTANCE_PX) {
        this.following = true;
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
        this.lastScrollTop = targetScrollTop;
        return;
      }

      const elapsed = Math.min(50, Math.max(1, time - this.lastFrameTime));
      this.lastFrameTime = time;

      // One shared animation is retargeted every frame. A short adaptive
      // duration lets it catch up even while a busy chat keeps growing, without
      // creating Twitch ToolKit-style competing animation loops.
      const baseDuration = Math.min(180, Math.max(72, distance * 0.12));
      const duration = baseDuration / this.settings.speed;
      const step = Math.max(1, distance * Math.min(1, elapsed / duration));
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
