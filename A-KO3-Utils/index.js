/**
 * @name KO3-Utils — Core
 * @description Bridge waiter, HTML escaper, logger factory, DOM-ready boot
 */
const KO3Utils = window.KO3Utils = {};

/** Wait for the Pengu Loader Runtime Bridge to be available */
KO3Utils.waitForBridge = async function waitForBridge(timeout = 10000) {
  return new Promise((resolve, reject) => {
    let elapsed = 0;
    const check = () => {
      if (window.__roseBridge) return resolve(window.__roseBridge);
      elapsed += 50;
      if (elapsed >= timeout) return reject(new Error('No bridge'));
      setTimeout(check, 50);
    };
    check();
  });
};

/** HTML-encode a string */
KO3Utils.escapeHtml = function escapeHtml(s) {
  return typeof s !== 'string' ? String(s) : s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

/** Create a prefixed console logger */
KO3Utils.createLogger = function createLogger(prefix) {
  return {
    info: (m) => console.info(prefix, m),
    error: (m, e) => console.error(prefix, m, e ?? ''),
  };
};

/** Run fn on DOMContentLoaded or immediately if already loaded */
KO3Utils.boot = function boot(fn) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fn);
  } else {
    fn();
  }
};

/**
 * @name KO3-Utils — CSS
 * @description Stylesheet and navigation-bar CSS injection
 */

/** Inject a <link> stylesheet with cache-busting query param */
KO3Utils.injectCss = function injectCss(id, href) {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = `${href}?v=${Date.now()}`;
  document.body.appendChild(link);
};

/** Inject navigation-bar style overrides for a plugin's nav button */
KO3Utils.injectNavCss = function injectNavCss(id, cls) {
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = [
    `lol-uikit-navigation-item.${cls}-nav .section.active::before,`,
    `lol-uikit-navigation-item.${cls}-nav .section.active::after,`,
    `lol-uikit-navigation-item.${cls}-nav .section.active,`,
    `lol-uikit-navigation-item.${cls}-nav .section.active .section-glow,`,
    `lol-uikit-navigation-item.${cls}-nav .section.active .section-glow-container {`,
    `  display:none!important;background:none!important;background-image:none!important`,
    `}`,
    `lol-uikit-navigation-item.${cls}-nav .section:hover::after { display:none!important }`,
    `lol-uikit-navigation-item.${cls}-nav .menu-item-icon {`,
    `  width:28px;height:28px;background:#cdbe91;`,
    `  -webkit-mask-size:contain;-webkit-mask-repeat:no-repeat;-webkit-mask-position:center;`,
    `  mask-size:contain;mask-repeat:no-repeat;mask-position:center`,
    `}`,
  ].join('\n');
  document.head.appendChild(style);
};

/**
 * @name KO3-Utils — LCU
 * @description LCU API fetch wrapper, common endpoints, asset URL builders
 */
KO3Utils.LCU = {};

/** Fetch a JSON endpoint from the LCU API, throwing on HTTP errors */
KO3Utils.LCU.fetch = async function lcuFetch(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) throw new Error(`LCU ${response.status} — ${url}`);
  return response.json();
};

/** Get the current summoner profile */
KO3Utils.LCU.getSummoner = async function lcuGetSummoner() {
  return KO3Utils.LCU.fetch('/lol-summoner/v1/current-summoner');
};

/** Build a champion-icon URL from its numeric ID */
KO3Utils.LCU.championIcon = function lcuChampionIcon(id) {
  return `/lol-game-data/assets/v1/champion-icons/${id}.png`;
};

/**
 * @name KO3-Utils — Panel
 * @description Overlay panel factory with auto-close coordination across plugins
 */

/**
 * Create a managed overlay panel for a KO3 plugin.
 *
 * @param {string} prefix  Short unique prefix (e.g. 'mh', 'ss', 'qol')
 * @param {string} detail  Value passed as CustomEvent detail for panel coordination
 * @returns {{ open, close, toggle, getInner, getIsOpen }}
 */
KO3Utils.Panel = function createPanel(prefix, detail) {
  const panelId = `ko3-${prefix}`;
  const innerId = `${panelId}-p`;
  let el = null;
  let inner = null;
  let isOpen = false;

  /** Open (or create then open) the panel */
  function open() {
    if (!el) {
      el = document.createElement('div');
      el.id = panelId;
      el.innerHTML = `<div id="${innerId}"></div>`;
      document.body.appendChild(el);
      inner = el.querySelector(`#${innerId}`);
      el.addEventListener('click', (e) => {
        if (e.target === el) close();
      });
    }
    el.classList.add('open');
    isOpen = true;
    document.dispatchEvent(new CustomEvent('ko3-panel-open', { detail }));
    return inner;
  }

  /** Close the panel */
  function close() {
    if (el) el.classList.remove('open');
    isOpen = false;
  }

  /** Toggle open/close */
  function toggle() {
    isOpen ? close() : open();
  }

  /** Get the inner content container */
  function getInner() { return inner; }

  /** Check if the panel is currently open */
  function getIsOpen() { return isOpen; }

  // Auto-close when another KO3 panel opens (mutual exclusion)
  document.addEventListener('ko3-panel-open', (e) => {
    if (e.detail !== detail && isOpen) close();
  });

  return { open, close, toggle, getInner, getIsOpen };
};

/**
 * @name KO3-Utils — Nav
 * @description Navigation-button factory and phase-based visibility handler
 */

/**
 * Create a navigation-bar button for a KO3 plugin.
 *
 * @param {string} prefix   Short unique prefix (e.g. 'mh', 'ss', 'qol')
 * @param {string} maskSvg  SVG data-URI for the button icon
 * @returns {{ inject, remove, setup, getBtn }}
 */
KO3Utils.NavButton = function createNavButton(prefix, maskSvg) {
  const navId = `ko3-${prefix}-nav`;
  const cls = `ko3-${prefix}`;
  let btn = null;

  /** Try to inject the nav button into the right-nav-menu */
  function inject(onToggle) {
    const menu = document.querySelector('.right-nav-menu');
    if (!menu) return false;
    if (document.getElementById(navId)) return true;

    KO3Utils.injectNavCss(`${cls}-ncss`, cls);

    const item = document.createElement('lol-uikit-navigation-item');
    item.id = navId;
    item.className = `main-navigation-menu-item ${cls}-nav ember-view`;

    const wrapper = document.createElement('div');
    wrapper.className = 'menu-item-icon-wrapper';

    const glow = document.createElement('div');
    glow.className = 'menu-item-glow';

    const icon = document.createElement('div');
    icon.className = 'menu-item-icon';
    icon.style.cssText = [
      'background:#cdbe91',
      `-webkit-mask-image:url("${maskSvg}")`,
      `mask-image:url("${maskSvg}")`,
    ].join(';');

    wrapper.appendChild(glow);
    wrapper.appendChild(icon);
    item.appendChild(wrapper);
    menu.insertBefore(item, menu.firstChild);

    const rule = document.createElement('div');
    rule.className = 'right-nav-vertical-rule';
    menu.insertBefore(rule, item.nextSibling);

    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      onToggle();
    }, true);

    btn = item;
    return true;
  }

  /** Remove the nav button from the DOM */
  function remove() {
    const existing = document.getElementById(navId);
    if (existing) {
      const rule = existing.nextSibling;
      if (rule && rule.className === 'right-nav-vertical-rule') rule.remove();
      existing.remove();
    }
    btn = null;
  }

  /**
   * Ensure the nav button is present.
   * Tries inject() first; falls back to MutationObserver + polling for dynamic menus.
   */
  function setup(onToggle) {
    if (inject(onToggle)) return;

    const observer = new MutationObserver(() => {
      if (inject(onToggle)) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const interval = setInterval(() => {
      if (inject(onToggle)) {
        clearInterval(interval);
        observer.disconnect();
      }
    }, 500);

    setTimeout(() => {
      observer.disconnect();
      clearInterval(interval);
    }, 30000);
  }

  /** Get the current button DOM element */
  function getBtn() { return btn; }

  return { inject, remove, setup, getBtn };
};

/**
 * Create a phase-change handler that shows the nav button in lobby
 * phases and hides it (closing the panel) during games.
 */
KO3Utils.createPhaseNavHandler = function createPhaseNavHandler(nav, panel) {
  return (phase) => {
    const showIn = new Set(['None', 'Lobby', 'Matchmaking']);
    if (showIn.has(phase)) {
      nav.setup(() => panel.toggle());
    } else {
      nav.remove();
      if (panel.getIsOpen()) panel.close();
    }
  };
};


/** KO3-Utils entry point (domain files concatenated above) */
