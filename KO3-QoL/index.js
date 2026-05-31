/**
 * @name KO3-QoL — State
 * @description Default settings, persisted config, runtime state
 */
const QOL = {};

/** Default settings */
QOL.DEFAULTS = {
  autoAccept: false,
  dodgeButton: true,
  skipHonor: false,
  autoRequeue: false,
  autoHonor: false,
  honorTarget: 'random',
  honorTeammatesOnly: true,
  queuePopSound: true,
  queuePopVolume: 50,
  autoReload: false,
  autoReloadInterval: 60,
  hideNotifications: false,
  perfMode: false,
  appearOffline: false,
  timerOverlay: false,
  queueStats: false,
  lobbyReveal: false,
  friendsNotifier: false,
  randomSkin: false,
  autoMessage: false,
  messageText: 'gl hf',
  gameModeQuickJoin: false,
  autoLockChamp: false,
  lockChampId: 0,
  autoBan: false,
  banChampId: 0,
  lockDelay: 2000,
  // Profile customization
  profileBackground: false,
  backgroundSkinId: 0,
  profileIcon: false,
  profileIconId: 0,
  challengeBadges: false,
  challengeId1: 0,
  challengeId2: 0,
  challengeId3: 0,
  presenceBio: false,
  statusMessage: '',
  autoSetRoles: false,
  primaryRole: 'top',
  secondaryRole: 'jungle',
  autoGG: false,
  ggMessage: 'gg',
  queuePopFlash: false,
  // CSS cleanup
  cleanHomePage: false,
  // Champion mastery
  masteryOverlay: false,
  // Auto-skip EOG spinning screen
  autoSkipEOG: false,
  autoSkipEOGDelay: 30,
  // Desktop notifications
  desktopNotifs: false,
  notifOnQueue: true,
  notifOnGameStart: true,
  notifOnGameEnd: false,
  // Skin Showcase
  skinShards: false,
  bgChampId: 0,
};

/** Load settings from DataStore or return defaults */
QOL.loadSettings = function loadSettings() {
  const saved = DataStore.get('ko3-qol-settings');
  if (saved) return { ...QOL.DEFAULTS, ...saved };
  return { ...QOL.DEFAULTS };
};

/** Save settings to DataStore */
QOL.saveSettings = function saveSettings() {
  DataStore.set('ko3-qol-settings', QOL.settings);
};

/** Current settings (mutable runtime copy) */
QOL.settings = QOL.loadSettings();

/** Whether we've set the user's offline status */
QOL.isOffline = false;

/** Interval / timeout ID references for cleanup */
QOL.intervals = {
  accept: null,
  requeue: null,
  honor: null,
  reload: null,
  notifCleaner: null,
  honorSkip: null,
  timer: null,
  queueStats: null,
  friends: null,
  lobbyReveal: null,
};

/** Dodge button DOM element reference */
QOL.dodgeBtn = null;

/** Game counter for auto-reload threshold */
QOL.gameCount = 0;

/** Cached summoner IDs of teammates (populated during ChampSelect) */
QOL.myTeamIds = null;

/**
 * @name KO3-QoL — API
 * @description LCU endpoint wrappers for quality-of-life actions
 */

/** Accept the ready check */
QOL.tryAccept = async function tryAccept() {
  try {
    await KO3Utils.LCU.fetch('/lol-matchmaking/v1/ready-check/accept', { method: 'POST' });
    return true;
  } catch {
    return false;
  }
};

/** Dodge the current champ select session */
QOL.doDodge = async function doDodge() {
  try {
    const params = new URLSearchParams({
      destination: 'lcdsServiceProxy',
      method: 'call',
      args: JSON.stringify(['', 'teambuilder-draft', 'quitV2', '']),
    });
    await fetch('/lol-login/v1/session/invoke?' + params.toString(), { method: 'POST' });
    return true;
  } catch {
    return false;
  }
};

/** Re-enter matchmaking queue */
QOL.doRequeue = async function doRequeue() {
  try {
    await KO3Utils.LCU.fetch('/lol-lobby/v2/lobby/matchmaking/search', { method: 'POST' });
    return true;
  } catch {
    return false;
  }
};

/** Honor a specific player by summoner ID */
QOL.doHonor = async function doHonor(summonerId) {
  try {
    await KO3Utils.LCU.fetch('/lol-honor-v2/v1/honor-player', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summonerId }),
    });
    return true;
  } catch {
    return false;
  }
};

/** Get the current honor ballot (list of honor-able players) */
QOL.getHonorBallot = async function getHonorBallot() {
  try {
    return await KO3Utils.LCU.fetch('/lol-honor-v2/v1/ballot');
  } catch {
    return null;
  }
};

/** Set appear-offline status */
QOL.setAppearOffline = async function setAppearOffline(offline) {
  try {
    await KO3Utils.LCU.fetch('/lol-chat/v1/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ availability: offline ? 'offline' : 'chat' }),
    });
    return true;
  } catch {
    return false;
  }
};

/** Get current gameflow phase */
QOL.getPhase = async function getPhase() {
  try {
    const data = await KO3Utils.LCU.fetch('/lol-gameflow/v1/gameflow-phase');
    return data;
  } catch {
    return null;
  }
};

/** Get current champ select session */
QOL.getChampSelectSession = async function getChampSelectSession() {
  try {
    return await KO3Utils.LCU.fetch('/lol-champ-select/v1/session');
  } catch { return null; }
};

/** Get champ select timer data */
QOL.getChampSelectTimer = async function getChampSelectTimer() {
  try {
    return await KO3Utils.LCU.fetch('/lol-champ-select/v1/session/timer');
  } catch { return null; }
};

/** Get friends list */
QOL.getFriends = async function getFriends() {
  try {
    return await KO3Utils.LCU.fetch('/lol-chat/v1/friends');
  } catch { return []; }
};

/** Pick a champion in champ select */
QOL.selectChampion = async function selectChampion(actionId, championId) {
  try {
    await KO3Utils.LCU.fetch(`/lol-champ-select/v1/session/actions/${actionId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ championId }),
    });
    return true;
  } catch { return false; }
};

/** Lock in the selected champion */
QOL.lockChampion = async function lockChampion(actionId) {
  try {
    await KO3Utils.LCU.fetch(`/lol-champ-select/v1/session/actions/${actionId}/complete`, {
      method: 'POST',
    });
    return true;
  } catch { return false; }
};

/** Set selected skin in champ select */
QOL.setSkin = async function setSkin(skinId) {
  try {
    await KO3Utils.LCU.fetch('/lol-champ-select/v1/session/my-selection', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedSkinId: skinId }),
    });
    return true;
  } catch { return false; }
};

/** Get pickable skin IDs for current champion */
QOL.getPickableSkins = async function getPickableSkins() {
  try {
    return await KO3Utils.LCU.fetch('/lol-champ-select/v1/pickable-skin-ids');
  } catch { return []; }
};

/** Get chat conversations */
QOL.getConversations = async function getConversations() {
  try {
    return await KO3Utils.LCU.fetch('/lol-chat/v1/conversations');
  } catch { return []; }
};

/** Send a chat message in champ select */
QOL.sendChatMessage = async function sendChatMessage(convId, msg) {
  try {
    await KO3Utils.LCU.fetch(`/lol-chat/v1/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: msg }),
    });
    return true;
  } catch { return false; }
};

/** Create a lobby for a specific queue */
QOL.createLobby = async function createLobby(queueId) {
  try {
    await KO3Utils.LCU.fetch('/lol-lobby/v2/lobby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ queueId }),
    });
    await KO3Utils.LCU.fetch('/lol-lobby/v2/lobby/matchmaking/search', { method: 'POST' });
    return true;
  } catch { return false; }
};

/**
 * @name KO3-QoL — Profile
 * @description Profile customization API wrappers
 */

/** Set loading screen background by skin ID */
QOL.setBackground = async function setBackground(skinId) {
  try {
    await KO3Utils.LCU.fetch('/lol-summoner/v1/current-summoner/summoner-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: 'backgroundSkinId', value: skinId }),
    });
    QOL.showToast('Background updated');
    return true;
  } catch { return false; }
};

/** Set profile icon by icon ID */
QOL.setIcon = async function setIcon(iconId) {
  try {
    await KO3Utils.LCU.fetch('/lol-summoner/v1/current-summoner-icon', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileIconId: iconId }),
    });
    QOL.showToast('Icon updated');
    return true;
  } catch { return false; }
};

/** Set challenge badge tokens (up to 3 IDs) */
QOL.setChallengeBadges = async function setChallengeBadges(ids) {
  try {
    await KO3Utils.LCU.fetch('/lol-challenges/v1/update-player-preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeIds: ids }),
    });
    QOL.showToast('Badges updated');
    return true;
  } catch { return false; }
};

/** Set chat status message */
QOL.setStatusMessage = async function setStatusMessage(msg) {
  try {
    await KO3Utils.LCU.fetch('/lol-chat/v1/me', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ statusMessage: msg }),
    });
    QOL.showToast('Status updated');
    return true;
  } catch { return false; }
};

/**
 * @name KO3-QoL — Social
 * @description Quick invite, missions, and friend manager API wrappers
 */

/** Invite recent teammates (up to 5) from last 20 games */
QOL.doQuickInvite = async function doQuickInvite() {
  try {
    const summoner = await KO3Utils.LCU.getSummoner();
    const data = await KO3Utils.LCU.fetch(`/lol-match-history/v1/products/lol/${summoner.puuid}/matches?begIndex=0&endIndex=20`);
    const games = data.games && data.games.games ? data.games.games : [];
    const seen = new Set();
    const recent = [];
    for (const game of games) {
      for (const p of (game.participants || [])) {
        if (p.summonerId && p.summonerId !== summoner.summonerId && !seen.has(p.summonerId)) {
          seen.add(p.summonerId);
          recent.push(p.summonerId);
        }
      }
    }
    const invites = recent.slice(0, 5);
    for (const id of invites) {
      await KO3Utils.LCU.fetch('/lol-lobby/v2/lobby/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([{ summonerId: id }]),
      });
    }
    QOL.showToast(`Invited ${invites.length} recent player(s)`);
    return true;
  } catch {
    QOL.showToast('Quick invite failed');
    return false;
  }
};

/** Claim all completed mission rewards */
QOL.claimAllMissions = async function claimAllMissions() {
  try {
    const summoner = await KO3Utils.LCU.getSummoner();
    const missions = await KO3Utils.LCU.fetch(`/lol-missions/v1/player/${summoner.puuid}/missions`);
    let claimed = 0;
    for (const m of (missions || [])) {
      if (m.status === 'COMPLETED' && (!m.rewardGroupsClaimed || !m.rewardGroupsClaimed.length)) {
        await KO3Utils.LCU.fetch(`/lol-missions/v1/player/${summoner.puuid}/mission/${m.id}/reward`, {
          method: 'POST',
        });
        claimed++;
      }
    }
    QOL.showToast(`Claimed ${claimed} mission reward(s)`);
    return true;
  } catch {
    QOL.showToast('Mission claim failed');
    return false;
  }
};

/** Remove all offline/DND friends from friend list */
QOL.removeOfflineFriends = async function removeOfflineFriends() {
  try {
    const friends = await QOL.getFriends();
    let removed = 0;
    for (const f of friends) {
      if (f.availability === 'offline' || f.availability === 'dnd' || f.availability === 'mobile') {
        await KO3Utils.LCU.fetch(`/lol-chat/v1/friends/${f.summonerId}`, {
          method: 'DELETE',
        });
        removed++;
      }
    }
    QOL.showToast(`Removed ${removed} friend(s)`);
    return true;
  } catch {
    QOL.showToast('Friend removal failed');
    return false;
  }
};

/**
 * @name KO3-QoL — Custom Games
 * @description Custom lobby creation and management API wrappers
 */

/** Create a custom game lobby */
QOL.createCustomGame = async function createCustomGame(config) {
  try {
    const body = {
      isCustom: true,
      customGameLobby: {
        configuration: {
          gameMode: config.gameMode || 'PRACTICETOOL',
          gameMutator: '',
          gameServerRegion: '',
          mapId: config.mapId || 11,
          mutators: { id: 1 },
          spectatorPolicy: config.spectatorPolicy || 'AllAllowed',
          teamSize: config.teamSize || 5,
        },
        lobbyName: config.lobbyName || 'KO3 Custom',
        lobbyPassword: config.lobbyPassword || '',
      },
    };
    await KO3Utils.LCU.fetch('/lol-lobby/v2/lobby', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    QOL.showToast('Custom lobby created');
    return true;
  } catch {
    QOL.showToast('Create lobby failed');
    return false;
  }
};

/** Add a bot to the custom lobby */
QOL.addBotToLobby = async function addBotToLobby(botConfig) {
  try {
    await KO3Utils.LCU.fetch('/lol-lobby/v1/lobby/custom/bots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        championId: botConfig.championId || 0,
        botDifficulty: botConfig.difficulty || 'EASY',
        teamId: botConfig.teamId || 'CHAOS',
      }),
    });
    QOL.showToast('Bot added');
    return true;
  } catch {
    QOL.showToast('Add bot failed');
    return false;
  }
};

/** Start champ select for the custom lobby */
QOL.startCustomChampSelect = async function startCustomChampSelect() {
  try {
    await KO3Utils.LCU.fetch('/lol-lobby/v1/lobby/custom/start-champ-select', {
      method: 'POST',
    });
    QOL.showToast('Starting custom game');
    return true;
  } catch {
    QOL.showToast('Start failed');
    return false;
  }
};

/**
 * @name KO3-QoL — Data Cache & Pickers
 * @description Champion/skin data caching and custom picker components
 */

QOL.cache = { champs: null, skins: {} };

QOL.ensureChamps = async function ensureChamps() {
  if (QOL.cache.champs) return QOL.cache.champs;
  try {
    const summoner = await KO3Utils.LCU.getSummoner();
    const data = await KO3Utils.LCU.fetch(`/lol-champions/v1/inventories/${summoner.summonerId}/champions-minimal`);
    QOL.cache.champs = data.filter(c => c.name).sort((a, b) => a.name.localeCompare(b.name));
    return QOL.cache.champs;
  } catch { return []; }
};

QOL.ensureSkins = async function ensureSkins(championId) {
  if (!championId) return [];
  const cached = QOL.cache.skins[championId];
  if (cached) return cached;
  try {
    const summoner = await KO3Utils.LCU.getSummoner();
    const data = await KO3Utils.LCU.fetch(`/lol-champions/v1/inventories/${summoner.summonerId}/champions/${championId}/skins`);
    QOL.cache.skins[championId] = data;
    return data;
  } catch { return []; }
};

/** Render a champion search picker */
QOL.renderChampPicker = function renderChampPicker(key, currentId, champs) {
  const champ = champs.find(c => c.id === currentId);
  const iconHtml = champ ? `<img class="kcp-img" src="${champ.squarePortraitPath || `/lol-game-data/assets/v1/champion-icons/${champ.id}.png`}" alt="">` : '';
  const name = champ ? KO3Utils.escapeHtml(champ.name) : 'Select Champion';
  return `<div class="kcp" data-key="${key}">
    <div class="kcp-sel">${iconHtml}<span class="kcp-n${champ ? '' : ' ph'}">${name}</span><span class="kcp-a">▾</span></div>
    <div class="kcp-dd"><input class="kcp-sr" type="text" placeholder="Search..." spellcheck="false">
    <div class="kcp-l">${champs.map(c => {
      const sel = c.id === currentId ? ' sel' : '';
      const ci = c.squarePortraitPath || `/lol-game-data/assets/v1/champion-icons/${c.id}.png`;
      return `<div class="kcp-i${sel}" data-cid="${c.id}"><img class="kcp-ii" src="${ci}" alt=""><span>${KO3Utils.escapeHtml(c.name)}</span></div>`;
    }).join('')}</div></div></div>`;
};

/** Render a skin search picker */
QOL.renderSkinPicker = function renderSkinPicker(key, currentSkinId, skins) {
  const skin = skins.find(s => s.id === currentSkinId);
  const name = skin ? KO3Utils.escapeHtml(skin.name) : 'Select a skin';
  return `<div class="ksp" data-key="${key}">
    <div class="ksp-sel"><span class="ksp-n${skin ? '' : ' ph'}">${name}</span><span class="ksp-a">▾</span></div>
    <div class="ksp-dd"><input class="ksp-sr" type="text" placeholder="Search..." spellcheck="false">
    <div class="ksp-l">${skins.map(s => {
      const sel = s.id === currentSkinId ? ' sel' : '';
      return `<div class="ksp-i${sel}" data-sid="${s.id}"><span>${KO3Utils.escapeHtml(s.name)}</span></div>`;
    }).join('')}</div></div></div>`;
};

/** Bind champion picker events in a container */
QOL.bindChampPicker = function bindChampPicker(container) {
  container.querySelectorAll('.kcp-sel').forEach(sel => {
    sel.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = sel.parentElement.querySelector('.kcp-dd');
      const open = dd.classList.contains('open');
      container.querySelectorAll('.kcp-dd.open').forEach(d => d !== dd && d.classList.remove('open'));
      if (!open) {
        dd.classList.add('open');
        const sr = dd.querySelector('.kcp-sr');
        if (sr) { sr.value = ''; sr.focus(); }
        dd.querySelectorAll('.kcp-i').forEach(i => { i.style.display = 'flex'; });
      } else { dd.classList.remove('open'); }
    });
  });
  container.querySelectorAll('.kcp-i').forEach(item => {
    item.addEventListener('click', () => {
      const picker = item.closest('.kcp');
      if (!picker) return;
      const key = picker.dataset.key;
      const cid = parseInt(item.dataset.cid, 10);
      QOL.settings[key] = cid;
      QOL.saveSettings();
      const imgSrc = item.querySelector('.kcp-ii').src;
      const name = item.querySelector('span').textContent;
      const sel = picker.querySelector('.kcp-sel');
      sel.innerHTML = `<img class="kcp-img" src="${imgSrc}" alt=""><span class="kcp-n">${KO3Utils.escapeHtml(name)}</span><span class="kcp-a">▾</span>`;
      picker.querySelector('.kcp-dd').classList.remove('open');
      QOL.onToggle(key, cid);
    });
  });
  container.querySelectorAll('.kcp-sr').forEach(sr => {
    sr.addEventListener('input', () => {
      const q = sr.value.toLowerCase();
      const list = sr.closest('.kcp-dd').querySelector('.kcp-l');
      list.querySelectorAll('.kcp-i').forEach(i => {
        i.style.display = i.querySelector('span').textContent.toLowerCase().includes(q) ? 'flex' : 'none';
      });
    });
  });
};

/** Bind skin picker events in a container */
QOL.bindSkinPicker = function bindSkinPicker(container) {
  container.querySelectorAll('.ksp-sel').forEach(sel => {
    sel.addEventListener('click', (e) => {
      e.stopPropagation();
      const dd = sel.parentElement.querySelector('.ksp-dd');
      const open = dd.classList.contains('open');
      container.querySelectorAll('.ksp-dd.open').forEach(d => d !== dd && d.classList.remove('open'));
      if (!open) {
        dd.classList.add('open');
        const sr = dd.querySelector('.ksp-sr');
        if (sr) { sr.value = ''; sr.focus(); }
        dd.querySelectorAll('.ksp-i').forEach(i => { i.style.display = 'flex'; });
      } else { dd.classList.remove('open'); }
    });
  });
  container.querySelectorAll('.ksp-i').forEach(item => {
    item.addEventListener('click', () => {
      const picker = item.closest('.ksp');
      if (!picker) return;
      const key = picker.dataset.key;
      const sid = parseInt(item.dataset.sid, 10);
      QOL.settings[key] = sid;
      QOL.saveSettings();
      const name = item.querySelector('span').textContent;
      const sel = picker.querySelector('.ksp-sel');
      sel.innerHTML = `<span class="ksp-n">${KO3Utils.escapeHtml(name)}</span><span class="ksp-a">▾</span>`;
      picker.querySelector('.ksp-dd').classList.remove('open');
      QOL.onToggle(key, sid);
    });
  });
  container.querySelectorAll('.ksp-sr').forEach(sr => {
    sr.addEventListener('input', () => {
      const q = sr.value.toLowerCase();
      const list = sr.closest('.ksp-dd').querySelector('.ksp-l');
      list.querySelectorAll('.ksp-i').forEach(i => {
        i.style.display = i.querySelector('span').textContent.toLowerCase().includes(q) ? 'flex' : 'none';
      });
    });
  });
};

if (!QOL._outsideClickBound) {
  QOL._outsideClickBound = true;
  document.addEventListener('click', () => {
    document.querySelectorAll('.kcp-dd.open, .ksp-dd.open').forEach(d => d.classList.remove('open'));
  });
}

/**
 * @name KO3-QoL — Roles & GG
 * @description Auto-set roles and post-game chat utilities
 */

/** Track whether roles have been auto-set for the current lobby session */
QOL.rolesSet = false;

/** Set primary/secondary role preferences for matchmaking */
QOL.setPositionPreferences = async function setPositionPreferences(primary, secondary) {
  try {
    await KO3Utils.LCU.fetch('/lol-lobby/v1/lobby/members/localMember/position-preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstPreference: primary, secondPreference: secondary }),
    });
    return true;
  } catch { return false; }
};

/** Track whether GG message has been sent for the current game */
QOL.sentGG = false;

/** Send post-game chat message ("gg") */
QOL.doSendGG = async function doSendGG() {
  if (QOL.sentGG) return;
  QOL.sentGG = true;
  const msg = QOL.settings.ggMessage || 'gg';
  try {
    const convs = await QOL.getConversations();
    const postGame = convs.find((c) => c.type === 'postGame' || c.type === 'postgame');
    if (postGame) {
      await QOL.sendChatMessage(postGame.id, msg);
    }
  } catch { /* ignore */ }
};

/** Flash overlay when queue pop appears */
QOL.showQueueFlash = function showQueueFlash() {
  const el = document.createElement('div');
  el.id = 'ko3-qol-qpf';
  el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(200,155,60,.25);pointer-events:none;animation:ko3-qol-qpf-fade .4s ease-out forwards';
  document.body.appendChild(el);
  setTimeout(() => { const e = document.getElementById('ko3-qol-qpf'); if (e) e.remove(); }, 500);
};

/**
 * @name KO3-QoL — DOM
 * @description DOM manipulation utilities for QoL features
 */

/** Inject a floating dodge button into champ select */
QOL.injectDodgeBtn = function injectDodgeBtn() {
  if (document.getElementById('ko3-qol-dodge')) return;
  const btn = document.createElement('button');
  btn.id = 'ko3-qol-dodge';
  btn.textContent = 'DODGE';
  btn.addEventListener('click', async () => {
    btn.textContent = 'DODGING…';
    btn.disabled = true;
    const ok = await QOL.doDodge();
    if (!ok) {
      btn.textContent = 'FAILED';
      setTimeout(() => {
        btn.textContent = 'DODGE';
        btn.disabled = false;
      }, 2000);
    }
  });
  document.body.appendChild(btn);
  QOL.dodgeBtn = btn;
};

/** Remove the dodge button */
QOL.removeDodgeBtn = function removeDodgeBtn() {
  const btn = document.getElementById('ko3-qol-dodge');
  if (btn) btn.remove();
  QOL.dodgeBtn = null;
};

/** Start polling to auto-skip the honor screen by clicking the "Skip" button */
QOL.startHonorSkip = function startHonorSkip() {
  QOL.stopHonorSkip();
  QOL.intervals.honorSkip = setInterval(() => {
    const skipBtn = document.querySelector('.honor-skip-button, button[data-testid="skip"], .lol-honor-cardless-actions button');
    if (skipBtn) skipBtn.click();
  }, 1000);
};

/** Stop honor-skip polling */
QOL.stopHonorSkip = function stopHonorSkip() {
  if (QOL.intervals.honorSkip) {
    clearInterval(QOL.intervals.honorSkip);
    QOL.intervals.honorSkip = null;
  }
};

/** Start polling to hide notification badges */
QOL.startNotifCleaner = function startNotifCleaner() {
  QOL.stopNotifCleaner();
  QOL.intervals.notifCleaner = setInterval(() => {
    document.querySelectorAll('[class*="badge"], [class*="unread"], [class*="notification-dot"]').forEach((el) => {
      if (el.offsetParent !== null) el.style.display = 'none';
    });
  }, 500);
};

/** Stop notification cleaner */
QOL.stopNotifCleaner = function stopNotifCleaner() {
  if (QOL.intervals.notifCleaner) {
    clearInterval(QOL.intervals.notifCleaner);
    QOL.intervals.notifCleaner = null;
  }
};

/** Toggle performance mode class on <html> */
QOL.applyPerfMode = function applyPerfMode(on) {
  document.documentElement.classList.toggle('ko3-qol-perf', on);
};

/** Toggle notification-hide CSS class on <html> */
QOL.applyNotifCss = function applyNotifCss(on) {
  document.documentElement.classList.toggle('ko3-qol-hide-notif', on);
};

/** Play an audio beep using Web Audio API */
QOL.beep = function beep(volume = 50) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const gain = ctx.createGain();
    gain.connect(ctx.destination);
    gain.gain.value = Math.min(1, Math.max(0, volume / 100));
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 800;
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
  } catch { /* audio not supported */ }
};

/** Inject floating champ select timer overlay */
QOL.injectTimerOverlay = function injectTimerOverlay() {
  if (document.getElementById('ko3-qol-timer')) return;
  const el = document.createElement('div');
  el.id = 'ko3-qol-timer';
  el.innerHTML = '<div class="ko3-qol-timer-n">--</div><div class="ko3-qol-timer-l">REMAINING</div>';
  document.body.appendChild(el);
  QOL.intervals.timer = setInterval(async () => {
    const t = await QOL.getChampSelectTimer();
    if (!t) return;
    const remaining = Math.max(0, Math.floor((t.adjustedTimeLeftInPhase || 0) / 1000));
    const m = Math.floor(remaining / 60);
    const s = remaining % 60;
    const el2 = document.getElementById('ko3-qol-timer');
    if (el2) el2.querySelector('.ko3-qol-timer-n').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
};

/** Remove timer overlay */
QOL.removeTimerOverlay = function removeTimerOverlay() {
  const el = document.getElementById('ko3-qol-timer');
  if (el) el.remove();
  if (QOL.intervals.timer) { clearInterval(QOL.intervals.timer); QOL.intervals.timer = null; }
};

/** Inject queue stats overlay */
QOL.injectQueueStats = function injectQueueStats() {
  if (document.getElementById('ko3-qol-qs')) return;
  const el = document.createElement('div');
  el.id = 'ko3-qol-qs';
  el.innerHTML = '<div class="ko3-qol-qs-n">0:00</div><div class="ko3-qol-qs-l">QUEUE TIME</div>';
  document.body.appendChild(el);
  const start = Date.now();
  QOL.intervals.queueStats = setInterval(() => {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const el2 = document.getElementById('ko3-qol-qs');
    if (el2) el2.querySelector('.ko3-qol-qs-n').textContent = `${m}:${s.toString().padStart(2, '0')}`;
  }, 1000);
};

/** Remove queue stats overlay */
QOL.removeQueueStats = function removeQueueStats() {
  const el = document.getElementById('ko3-qol-qs');
  if (el) el.remove();
  if (QOL.intervals.queueStats) { clearInterval(QOL.intervals.queueStats); QOL.intervals.queueStats = null; }
};

/** Lobby reveal state */
QOL.lobbyRevealData = { prevSummoners: '' };

/** Inject lobby reveal overlay (shows summoner names in champ select) */
QOL.injectLobbyReveal = function injectLobbyReveal() {
  if (document.getElementById('ko3-qol-lr')) return;
  const el = document.createElement('div');
  el.id = 'ko3-qol-lr';
  el.innerHTML = '<div class="ko3-qol-lr-h">SUMMONERS</div><div class="ko3-qol-lr-b"></div>';
  document.body.appendChild(el);
  QOL.lobbyRevealData.prevSummoners = '';
  QOL.intervals.lobbyReveal = setInterval(async () => {
    const session = await QOL.getChampSelectSession();
    if (!session) return;
    const teams = [];
    const myTeam = (session.myTeam || []).map((p) => ({ name: p.summonerId ? `${p.gameName || '?'}#${p.tagLine || '?'}` : 'Bot', team: 'blue', championId: p.championId }));
    const theirTeam = (session.theirTeam || []).map((p) => ({ name: p.summonerId ? `${p.gameName || '?'}#${p.tagLine || '?'}` : 'Bot', team: 'red', championId: p.championId }));
    const all = [...myTeam, ...theirTeam];
    const joined = all.map((p) => p.name).join(',');
    if (joined === QOL.lobbyRevealData.prevSummoners) return;
    QOL.lobbyRevealData.prevSummoners = joined;
    const el2 = document.getElementById('ko3-qol-lr');
    if (!el2) return;
    el2.querySelector('.ko3-qol-lr-b').innerHTML = [
      '<div style="color:#4a9eff;margin-bottom:4px;font-size:10px;font-weight:700;letter-spacing:1px">BLUE TEAM</div>',
      ...myTeam.map((p) => `<div class="ko3-qol-lr-p">${KO3Utils.escapeHtml(p.name)}</div>`),
      '<div style="color:#ff4a4a;margin:8px 0 4px;font-size:10px;font-weight:700;letter-spacing:1px">RED TEAM</div>',
      ...theirTeam.map((p) => `<div class="ko3-qol-lr-p">${KO3Utils.escapeHtml(p.name)}</div>`),
    ].join('');
  }, 2000);
};

/** Remove lobby reveal overlay */
QOL.removeLobbyReveal = function removeLobbyReveal() {
  const el = document.getElementById('ko3-qol-lr');
  if (el) el.remove();
  if (QOL.intervals.lobbyReveal) { clearInterval(QOL.intervals.lobbyReveal); QOL.intervals.lobbyReveal = null; }
};

/** Friends notifier state */
QOL.friendsData = { prev: '' };

/** Start friends notifier polling */
QOL.startFriendsNotifier = function startFriendsNotifier() {
  QOL.stopFriendsNotifier();
  QOL.friendsData.prev = '';
  QOL.intervals.friends = setInterval(async () => {
    const friends = await QOL.getFriends();
    const online = friends.filter((f) => f.availability === 'chat' || f.availability === 'mobile' || f.availability === 'in-game').map((f) => f.name || f.id || '');
    const joined = online.sort().join(',');
    if (QOL.friendsData.prev && joined !== QOL.friendsData.prev) {
      QOL.showToast('Friend activity changed');
    }
    QOL.friendsData.prev = joined;
  }, 15000);
};

/** Stop friends notifier */
QOL.stopFriendsNotifier = function stopFriendsNotifier() {
  if (QOL.intervals.friends) { clearInterval(QOL.intervals.friends); QOL.intervals.friends = null; }
};

/** Show a simple toast notification */
QOL.showToast = function showToast(msg) {
  const existing = document.getElementById('ko3-qol-toast');
  if (existing) existing.remove();
  const t = document.createElement('div');
  t.id = 'ko3-qol-toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { const e = document.getElementById('ko3-qol-toast'); if (e) e.remove(); }, 4000);
};

/** Last known champion ID for random skin tracking */
QOL.lastChampionId = 0;

/** Inject random skin button in champ select */
QOL.injectRandomSkinBtn = function injectRandomSkinBtn() {
  if (document.getElementById('ko3-qol-rs')) return;
  const btn = document.createElement('button');
  btn.id = 'ko3-qol-rs';
  btn.textContent = 'RANDOM SKIN';
  btn.addEventListener('click', async () => {
    btn.textContent = '…';
    btn.disabled = true;
    const session = await QOL.getChampSelectSession();
    if (!session) { btn.textContent = 'RANDOM SKIN'; btn.disabled = false; return; }
    const mySel = (session.myTeam || []).find((p) => p.cellId === session.localPlayerCellId);
    if (!mySel || !mySel.championId) { btn.textContent = 'RANDOM SKIN'; btn.disabled = false; return; }
    const skins = await QOL.getPickableSkins();
    if (!skins || !skins.length) { btn.textContent = 'RANDOM SKIN'; btn.disabled = false; return; }
    const pick = skins[Math.floor(Math.random() * skins.length)];
    const ok = await QOL.setSkin(pick);
    btn.textContent = ok ? '✓' : 'FAILED';
    setTimeout(() => { btn.textContent = 'RANDOM SKIN'; btn.disabled = false; }, 1500);
  });
  document.body.appendChild(btn);
};

/** Remove random skin button */
QOL.removeRandomSkinBtn = function removeRandomSkinBtn() {
  const btn = document.getElementById('ko3-qol-rs');
  if (btn) btn.remove();
};

/** Auto-send message in champ select (fires once per session) */
QOL.sentAutoMsg = false;

QOL.doSendAutoMsg = async function doSendAutoMsg() {
  if (QOL.sentAutoMsg) return;
  QOL.sentAutoMsg = true;
  const convs = await QOL.getConversations();
  const champChat = convs.find((c) => c.type === 'championSelect');
  if (champChat) QOL.sendChatMessage(champChat.id, QOL.settings.messageText || 'gl hf');
};

/** Find the player's action in champ select session */
QOL.findMyAction = function findMyAction(session) {
  if (!session || !session.actions || !session.myTeam) return null;
  const myCellId = session.localPlayerCellId;
  for (const actionList of session.actions) {
    for (const action of actionList) {
      if (action.actorCellId === myCellId && !action.completed) return action;
    }
  }
  return null;
};

/**
 * @name KO3-QoL — CSS Cleanup
 * @description Hide news feed, ads, and bloat from the home page
 */

/** Track whether cleanup style element exists */
QOL.cleanStyle = null;

/** Apply or remove home page CSS cleanup */
QOL.applyCleanHomePage = function applyCleanHomePage(on) {
  if (on) {
    if (document.getElementById('ko3-qol-clean-css')) return;
    const style = document.createElement('style');
    style.id = 'ko3-qol-clean-css';
    style.textContent = [
      /* Hide news feed on home page */
      '#news-feed-container, .news-feed-container, [class*="news"]:not([class*="badge"]):not([class*="notification"]):not([class*="count"]),',
      /* Hide featured/rotating content */
      '[class*="featured"]:not([class*="featured-loot"]):not([class*="featured-champion"]),',
      /* Hide promotional/sales content */
      '[class*="promotion"], [class*="sale-banner"], [class*="offer"]:not([class*="offer-ready"]):not([class*="offer-card"]),',
      /* Hide loot shop and store highlights */
      '[class*="loot-panel"], [class*="store-highlight"], [class*="shop-offer"],',
      /* Hide right sidebar bloat */
      '.parties-panel, [class*="parties-panel"], [class*="sidebar"]:not([class*="social"]):not([class*="chat"]),',
      /* Hide the Riot Partnered / Esports content */
      '[class*="esports"], [class*="partner"]:not([class*="party"]),',
      /* Hide "Your Shop" and similar */
      '[class*="your-shop"], [class*="personalized"], [class*="recommended"],',
      /* Hide mission center / pass ads */
      '[class*="battle-pass"], [class*="event-center"]:not([class*="lol-uikit"]),',
      /* Hide the home header/tabs bloat */
      '.home-header-container > div:not(:first-child)',
      '{ display: none !important; }',
      /* Make main content area use full width when sidebar/news hidden */
      '.home-content-container, [class*="content-container"], .main-content',
      '{ max-width: 100% !important; width: 100% !important; }',
    ].join('\n');
    document.head.appendChild(style);
    QOL.cleanStyle = style;
  } else {
    const el = document.getElementById('ko3-qol-clean-css');
    if (el) el.remove();
    QOL.cleanStyle = null;
  }
};

/**
 * @name KO3-QoL — Champion Mastery Overlay
 * @description Show champion mastery levels/points for all players in champ select
 */

QOL.masteryData = { interval: null, prev: '' };

/** Fetch champion mastery for a given summoner */
QOL.getMasteryForSummoner = async function getMasteryForSummoner(puuid) {
  try {
    return await KO3Utils.LCU.fetch(`/lol-champion-mastery/v1/${puuid}/champion-mastery`);
  } catch { return null; }
};

/** Inject mastery overlay into champ select */
QOL.injectMasteryOverlay = function injectMasteryOverlay() {
  if (document.getElementById('ko3-qol-mo')) return;
  const el = document.createElement('div');
  el.id = 'ko3-qol-mo';
  el.innerHTML = '<div class="ko3-qol-mo-h">MASTERY</div><div class="ko3-qol-mo-b"></div>';
  document.body.appendChild(el);
  QOL.masteryData.prev = '';
  QOL.startMasteryPoll();
};

/** Start polling mastery data */
QOL.startMasteryPoll = function startMasteryPoll() {
  QOL.stopMasteryPoll();
  QOL.masteryData.interval = setInterval(async () => {
    const session = await QOL.getChampSelectSession();
    if (!session) return;

    // Build cellId → championId map from actions (covers hovered + locked)
    const actionChamps = {};
    for (const actionList of (session.actions || [])) {
      for (const a of actionList) {
        if (a.championId) actionChamps[a.actorCellId] = a.championId;
      }
    }
    // Build blue team cellId set and collect all players
    const blueCellIds = new Set((session.myTeam || []).map((p) => p.cellId));
    const players = [...(session.myTeam || []), ...(session.theirTeam || [])];

    // Resolve championId: use action hover first, fall back to locked-in
    const resolved = players.map((p) => ({
      name: `${p.gameName || '?'}#${p.tagLine || '?'}`,
      cellId: p.cellId,
      summonerId: p.summonerId,
      puuid: p.puuid,
      championId: actionChamps[p.cellId] || p.championId || 0,
      isBlue: blueCellIds.has(p.cellId),
    }));
    const key = resolved.filter((p) => p.summonerId).map((p) => `${p.summonerId}-${p.championId}`).join(',');
    if (key === QOL.masteryData.prev) return;
    QOL.masteryData.prev = key;

    // Fetch mastery for players who have a champion identified
    const data = [];
    for (const p of resolved) {
      if (!p.summonerId || !p.championId) continue;
      if (!p.puuid) continue;
      const masteryList = await QOL.getMasteryForSummoner(p.puuid);
      if (!masteryList) continue;
      const m = masteryList.find((entry) => entry.championId === p.championId);
      data.push({
        name: p.name,
        champId: p.championId,
        level: m ? m.championLevel : 0,
        points: m ? m.championPoints : 0,
        tokens: m ? (m.tokensEarned || 0) : 0,
        team: p.isBlue ? 'blue' : 'red',
      });
    }
    // Build display
    const blue = data.filter((d) => d.team === 'blue');
    const red = data.filter((d) => d.team === 'red');
    const el = document.getElementById('ko3-qol-mo');
    if (!el) return;
    const body = el.querySelector('.ko3-qol-mo-b');
    body.innerHTML = [
      blue.length ? '<div class="ko3-qol-mo-t" style="color:#4a9eff">BLUE TEAM</div>' : '',
      ...blue.map((d) => QOL.renderMasteryRow(d)),
      blue.length && red.length ? '<div class="ko3-qol-mo-t" style="color:#ff4a4a;margin-top:8px">RED TEAM</div>' : '',
      ...red.map((d) => QOL.renderMasteryRow(d)),
    ].join('');
  }, 3000);
};

/** Render a single mastery row */
QOL.renderMasteryRow = function renderMasteryRow(d) {
  const iconUrl = `https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/champion-icons/${d.champId}.png`;
  const pts = d.points >= 1000000
    ? (d.points / 1000000).toFixed(1) + 'M'
    : d.points >= 1000
      ? (d.points / 1000).toFixed(0) + 'K'
      : String(d.points);
  const cls = `ko3-qol-mo-l${Math.min(d.level, 7)}`;
  return `<div class="ko3-qol-mo-r ${cls}"><img class="ko3-qol-mo-ico" src="${iconUrl}" alt=""><span class="ko3-qol-mo-n">${KO3Utils.escapeHtml(d.name.split('#')[0])}</span><span class="ko3-qol-mo-lv">${d.level}</span><span class="ko3-qol-mo-m">${pts}</span></div>`;
};

/** Stop mastery polling */
QOL.stopMasteryPoll = function stopMasteryPoll() {
  if (QOL.masteryData.interval) {
    clearInterval(QOL.masteryData.interval);
    QOL.masteryData.interval = null;
  }
};

/** Remove mastery overlay */
QOL.removeMasteryOverlay = function removeMasteryOverlay() {
  const el = document.getElementById('ko3-qol-mo');
  if (el) el.remove();
  QOL.stopMasteryPoll();
};

/**
 * @name KO3-QoL — Auto-Skip EOG
 * @description Skip the spinning end-of-game stats screen
 */

QOL.eogTimer = null;

/** Attempt to play-again (skip EOG and go to lobby) */
QOL.doPlayAgain = async function doPlayAgain() {
  try {
    await KO3Utils.LCU.fetch('/lol-lobby/v2/play-again', { method: 'POST' });
    return true;
  } catch { return false; }
};

/** Start monitoring for stuck EOG screen */
QOL.startEOGSkip = function startEOGSkip() {
  QOL.stopEOGSkip();
  const delay = (QOL.settings.autoSkipEOGDelay || 30) * 1000;
  QOL.eogTimer = setTimeout(async () => {
    // Check if still in EndOfGame via phase endpoint
    const phase = await QOL.getPhase();
    if (phase !== 'EndOfGame' && phase !== 'WaitingForStats') return;
    // Try clicking any visible skip/continue buttons first
    document.querySelectorAll('button, [role="button"], .skip-button, [class*="skip"], [class*="continue"], [class*="dismiss"]').forEach((btn) => {
      if (btn.offsetParent !== null) btn.click();
    });
    // If still stuck after a brief wait, try play-again, fallback to requeue
    setTimeout(async () => {
      const phase2 = await QOL.getPhase();
      if (phase2 === 'EndOfGame' || phase2 === 'WaitingForStats') {
        const ok = await QOL.doPlayAgain();
        if (!ok) await QOL.doRequeue();
      }
    }, 2000);
  }, delay);
};

/** Stop EOG skip timer */
QOL.stopEOGSkip = function stopEOGSkip() {
  if (QOL.eogTimer) {
    clearTimeout(QOL.eogTimer);
    QOL.eogTimer = null;
  }
};

/**
 * @name KO3-QoL — Desktop Notifications
 * @description Browser notifications for in-game events
 */

/** Request notification permission and send notifications */
QOL.notify = function notify(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, icon: '/lol-game-data/assets/v1/league-of-legends.ico' });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission();
  }
};

QOL.notifiedGameStart = false;

/** Reset notification flags */
QOL.resetNotifFlags = function resetNotifFlags() {
  QOL.notifiedGameStart = false;
};

/**
 * @name KO3-QoL — Render
 * @description Settings panel HTML generation and event binding
 */

/** Build the quality-of-life settings panel content (async — fetches champion data) */
QOL.render = async function render(panelInner) {
  const s = QOL.settings;
  const champs = await QOL.ensureChamps();

  // Derive background champion from skin ID for initial display
  const bgSkinId = s.backgroundSkinId || 0;
  const bgChampId = s.bgChampId || (bgSkinId ? Math.floor(bgSkinId / 1000) : 0);
  const bgSkins = bgChampId ? await QOL.ensureSkins(bgChampId) : [];

  panelInner.innerHTML = `
<div class="ko3-qol-h">
  <div style="display:flex;align-items:center;gap:10px">
    <h2>Quality of Life</h2>
    <span class="ko3-qol-hr-st">${Object.keys(QOL.DEFAULTS).length} features</span>
  </div>
  <div class="ko3-qol-x" data-action="close">✕</div>
</div>
<div class="ko3-qol-body">
  <input class="ko3-qol-ssr" type="text" placeholder="Search settings..." id="ko3-qol-settings-search" spellcheck="false">
  <div class="ko3-qol-cats" id="ko3-qol-cats">
    <span class="ko3-qol-cat active" data-cat="all">All</span>
    <span class="ko3-qol-cat" data-cat="matchmaking">Matchmaking</span>
    <span class="ko3-qol-cat" data-cat="champselect">Champ Select</span>
    <span class="ko3-qol-cat" data-cat="endgame">End of Game</span>
    <span class="ko3-qol-cat" data-cat="social">Social</span>
    <span class="ko3-qol-cat" data-cat="profile">Profile</span>
    <span class="ko3-qol-cat" data-cat="custom">Custom</span>
    <span class="ko3-qol-cat" data-cat="display">Display</span>
    <span class="ko3-qol-cat" data-cat="system">System</span>
  </div>

  <!-- Matchmaking -->
  <div class="ko3-qol-grp" data-cat="matchmaking">
    <div class="ko3-qol-grp-lbl"><svg class="ko3-qol-grp-ico" viewBox="0 0 24 24" fill="none" stroke="#c89b3c" stroke-width="1.5" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h12"/></svg>Matchmaking</div>
    ${opt('autoAccept', 'Auto-Accept', 'Automatically accept ready checks', s.autoAccept)}
    ${opt('autoRequeue', 'Auto-Requeue', 'Re-enter queue after game ends', s.autoRequeue)}
    ${opt('queuePopSound', 'Queue Pop Sound', 'Play a sound when ready check appears', s.queuePopSound, `<div class="ko3-qol-sl-row"><input type="range" class="ko3-qol-sl" data-key="queuePopVolume" value="${s.queuePopVolume}" min="0" max="100"><span class="ko3-qol-sl-v" data-label="queuePopVolume">${s.queuePopVolume}</span></div>`)}
    ${opt('queuePopFlash', 'Queue Pop Flash', 'Flash overlay on ready check', s.queuePopFlash)}
    ${opt('autoSetRoles', 'Auto-Set Roles', 'Set preferred roles when queueing', s.autoSetRoles, `<div class="ko3-qol-sub"><select class="ko3-qol-dd" data-key="primaryRole"><option value="top"${s.primaryRole==='top'?' selected':''}>Top</option><option value="jungle"${s.primaryRole==='jungle'?' selected':''}>Jungle</option><option value="middle"${s.primaryRole==='middle'?' selected':''}>Middle</option><option value="bottom"${s.primaryRole==='bottom'?' selected':''}>Bottom</option><option value="utility"${s.primaryRole==='utility'?' selected':''}>Support</option><option value="fill"${s.primaryRole==='fill'?' selected':''}>Fill</option></select><select class="ko3-qol-dd" data-key="secondaryRole"><option value="top"${s.secondaryRole==='top'?' selected':''}>Top</option><option value="jungle"${s.secondaryRole==='jungle'?' selected':''}>Jungle</option><option value="middle"${s.secondaryRole==='middle'?' selected':''}>Middle</option><option value="bottom"${s.secondaryRole==='bottom'?' selected':''}>Bottom</option><option value="utility"${s.secondaryRole==='utility'?' selected':''}>Support</option><option value="fill"${s.secondaryRole==='fill'?' selected':''}>Fill</option></select></div>`)}
    ${opt('gameModeQuickJoin', 'Quick Join', 'One-click queue join buttons', s.gameModeQuickJoin, s.gameModeQuickJoin ? `<div class="ko3-qol-sub"><button class="ko3-qol-qj" data-q="430">Blind</button><button class="ko3-qol-qj" data-q="400">Draft</button><button class="ko3-qol-qj" data-q="420">Ranked Solo</button><button class="ko3-qol-qj" data-q="440">Ranked Flex</button><button class="ko3-qol-qj" data-q="450">ARAM</button><button class="ko3-qol-qj" data-q="900">URF</button></div>` : '')}
  </div>

  <!-- Champion Select -->
  <div class="ko3-qol-grp" data-cat="champselect">
    <div class="ko3-qol-grp-lbl"><svg class="ko3-qol-grp-ico" viewBox="0 0 24 24" fill="none" stroke="#c89b3c" stroke-width="1.5" stroke-linecap="round"><path d="M14 2l-4 6h3l-2 8 7-10h-3l4-6zM4 18l4-4M18 18l-4-4"/></svg>Champion Select</div>
    ${opt('dodgeButton', 'Dodge Button', 'Floating dodge button in champ select', s.dodgeButton)}
    ${opt('timerOverlay', 'Timer Overlay', 'Large countdown in champ select', s.timerOverlay)}
    ${opt('queueStats', 'Queue Timer', 'Show elapsed queue time', s.queueStats)}
    ${opt('lobbyReveal', 'Lobby Reveal', 'Show summoner names in champ select', s.lobbyReveal)}
    ${opt('masteryOverlay', 'Mastery Overlay', 'Show champion mastery levels/points', s.masteryOverlay)}
    ${opt('randomSkin', 'Random Skin', 'Pick a random owned skin in champ select', s.randomSkin)}
    ${opt('autoMessage', 'Auto Message', 'Send a message when champ select starts', s.autoMessage, `<div class="ko3-qol-sub"><input type="text" class="ko3-qol-ti" data-key="messageText" value="${KO3Utils.escapeHtml(s.messageText)}" placeholder="gl hf" style="width:100px"></div>`)}
    ${opt('autoLockChamp', 'Auto Lock-In', 'Auto-pick and lock a champion on your turn', s.autoLockChamp, `<div class="ko3-qol-sub" style="flex-direction:column;align-items:stretch;gap:3px"><div>${QOL.renderChampPicker('lockChampId', s.lockChampId, champs)}</div><div class="ko3-qol-sl-row"><input type="range" class="ko3-qol-sl" data-key="lockDelay" value="${s.lockDelay}" min="500" max="5000" step="100"><span class="ko3-qol-sl-v" data-label="lockDelay">${s.lockDelay}ms</span></div></div>`)}
    ${opt('autoBan', 'Auto Ban', 'Auto-ban a champion on your ban turn', s.autoBan, `<div class="ko3-qol-sub">${QOL.renderChampPicker('banChampId', s.banChampId, champs)}</div>`)}
  </div>

  <!-- End of Game -->
  <div class="ko3-qol-grp" data-cat="endgame">
    <div class="ko3-qol-grp-lbl"><svg class="ko3-qol-grp-ico" viewBox="0 0 24 24" fill="none" stroke="#c89b3c" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="8" r="6"/><path d="M15.5 14l2.5 8-6-3-6 3 2.5-8"/></svg>End of Game</div>
    ${opt('skipHonor', 'Skip Honor Screen', 'Auto-click skip on honor screen', s.skipHonor)}
    ${opt('autoSkipEOG', 'Auto-Skip EOG', 'Skip end-of-game stats screen', s.autoSkipEOG, `<div class="ko3-qol-sl-row"><input type="range" class="ko3-qol-sl" data-key="autoSkipEOGDelay" value="${s.autoSkipEOGDelay}" min="10" max="120"><span class="ko3-qol-sl-v" data-label="autoSkipEOGDelay">${s.autoSkipEOGDelay}s</span></div>`)}
    ${opt('autoHonor', 'Auto-Honor', 'Automatically honor a player', s.autoHonor, `<div class="ko3-qol-sub"><select class="ko3-qol-dd" data-key="honorTarget"><option value="random"${s.honorTarget==='random'?' selected':''}>Random</option><option value="best"${s.honorTarget==='best'?' selected':''}>Best KDA</option><option value="first"${s.honorTarget==='first'?' selected':''}>First</option><option value="support"${s.honorTarget==='support'?' selected':''}>Support</option></select></div>`)}
    ${opt('honorTeammatesOnly', 'Teammates Only', 'Only honor teammates, not enemies', s.honorTeammatesOnly)}
    ${opt('autoGG', 'Auto-GG', 'Auto-send message after game ends', s.autoGG, `<div class="ko3-qol-sub"><input type="text" class="ko3-qol-ti" data-key="ggMessage" value="${KO3Utils.escapeHtml(s.ggMessage)}" placeholder="gg" style="width:80px"></div>`)}
  </div>

  <!-- Social & Tools -->
  <div class="ko3-qol-grp" data-cat="social">
    <div class="ko3-qol-grp-lbl"><svg class="ko3-qol-grp-ico" viewBox="0 0 24 24" fill="none" stroke="#c89b3c" stroke-width="1.5" stroke-linecap="round"><circle cx="9" cy="7" r="3"/><circle cx="17" cy="7" r="3"/><path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2"/></svg>Social &amp; Tools</div>
    ${opt('friendsNotifier', 'Friends Notifier', 'Notify when friends change status', s.friendsNotifier)}
    <div class="ko3-qol-opt" style="cursor:default">
      <div><div class="ko3-qol-opt-lbl">Quick Invite Recent</div><div class="ko3-qol-opt-desc">Invite recent teammates to lobby</div></div>
      <button class="ko3-qol-btn" data-action="quickInvite">Invite</button>
    </div>
    <div class="ko3-qol-opt" style="cursor:default">
      <div><div class="ko3-qol-opt-lbl">Mission Claimer</div><div class="ko3-qol-opt-desc">Claim all completed mission rewards</div></div>
      <button class="ko3-qol-btn" data-action="claimMissions">Claim</button>
    </div>
    <div class="ko3-qol-opt" style="cursor:default">
      <div><div class="ko3-qol-opt-lbl">Friend Manager</div><div class="ko3-qol-opt-desc">Remove offline / DND friends</div></div>
      <button class="ko3-qol-btn" data-action="removeOffline">Clean</button>
    </div>
  </div>

  <!-- Profile -->
  <div class="ko3-qol-grp" data-cat="profile">
    <div class="ko3-qol-grp-lbl"><svg class="ko3-qol-grp-ico" viewBox="0 0 24 24" fill="none" stroke="#c89b3c" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>Profile</div>
    <div class="ko3-qol-opt" style="flex-direction:column;align-items:stretch;cursor:default">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;cursor:pointer">
        <div><div class="ko3-qol-opt-lbl">Background Image</div><div class="ko3-qol-opt-desc">Set profile loading screen background</div></div>
        <div class="ko3-qol-tog${s.profileBackground?' on':''}" data-key="profileBackground"></div>
      </div>
      ${s.profileBackground ? `<div style="margin-top:8px;display:flex;flex-direction:column;gap:6px">
        <div class="ko3-qol-2col">
          <div>${QOL.renderChampPicker('bgChampId', bgChampId, champs)}</div>
          <div>${QOL.renderSkinPicker('backgroundSkinId', s.backgroundSkinId, bgSkins)}</div>
        </div>
        <div class="ko3-qol-sub"><button class="ko3-qol-btn" data-action="setBackground">Apply Background</button><span style="color:#5b5340;font-size:8px">Champion → Skin → Apply</span></div>
      </div>` : ''}
    </div>
    <div class="ko3-qol-opt" style="flex-direction:column;align-items:stretch;cursor:default">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;cursor:pointer">
        <div><div class="ko3-qol-opt-lbl">Profile Icon</div><div class="ko3-qol-opt-desc">Change your summoner icon</div></div>
        <div class="ko3-qol-tog${s.profileIcon?' on':''}" data-key="profileIcon"></div>
      </div>
      ${s.profileIcon ? `<div class="ko3-qol-sub"><img src="/lol-game-data/assets/v1/profile-icons/${s.profileIconId}.jpg" alt="" style="width:26px;height:26px;border-radius:4px;border:1px solid rgba(200,170,110,.12);flex-shrink:0" onerror="this.style.display='none'"><input type="number" class="ko3-qol-ni" data-key="profileIconId" value="${s.profileIconId}" min="0" placeholder="ID" style="width:60px"><button class="ko3-qol-btn" data-action="setIcon">Apply</button></div>` : ''}
    </div>
    <div class="ko3-qol-opt" style="flex-direction:column;align-items:stretch;cursor:default">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;cursor:pointer">
        <div><div class="ko3-qol-opt-lbl">Challenge Badges</div><div class="ko3-qol-opt-desc">3 badges on your profile</div></div>
        <div class="ko3-qol-tog${s.challengeBadges?' on':''}" data-key="challengeBadges"></div>
      </div>
      ${s.challengeBadges ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:4px"><div class="ko3-qol-sub"><input type="number" class="ko3-qol-ni" data-key="challengeId1" value="${s.challengeId1}" min="0" placeholder="ID" style="width:60px"><span style="color:#5b5340;font-size:8px">Badge 1</span></div><div class="ko3-qol-sub"><input type="number" class="ko3-qol-ni" data-key="challengeId2" value="${s.challengeId2}" min="0" placeholder="ID" style="width:60px"><span style="color:#5b5340;font-size:8px">Badge 2</span></div><div class="ko3-qol-sub"><input type="number" class="ko3-qol-ni" data-key="challengeId3" value="${s.challengeId3}" min="0" placeholder="ID" style="width:60px"><span style="color:#5b5340;font-size:8px">Badge 3</span></div><div class="ko3-qol-sub"><button class="ko3-qol-btn" data-action="setBadges">Apply</button></div></div>` : ''}
    </div>
    <div class="ko3-qol-opt" style="flex-direction:column;align-items:stretch;cursor:default">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;cursor:pointer">
        <div><div class="ko3-qol-opt-lbl">Status Message</div><div class="ko3-qol-opt-desc">Custom text shown to friends</div></div>
        <div class="ko3-qol-tog${s.presenceBio?' on':''}" data-key="presenceBio"></div>
      </div>
      ${s.presenceBio ? `<div class="ko3-qol-sub"><input type="text" class="ko3-qol-ti" data-key="statusMessage" value="${KO3Utils.escapeHtml(s.statusMessage)}" placeholder="Enter status..." maxlength="128" style="width:140px"><button class="ko3-qol-btn" data-action="setStatus">Set</button></div>` : ''}
    </div>
  </div>

  <!-- Custom Games -->
  <div class="ko3-qol-grp" data-cat="custom">
    <div class="ko3-qol-grp-lbl"><svg class="ko3-qol-grp-ico" viewBox="0 0 24 24" fill="none" stroke="#c89b3c" stroke-width="1.5" stroke-linecap="round"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 12h4M14 12h4M10 12V8M14 12v4"/></svg>Custom Games</div>
    <div style="padding:10px 12px;display:flex;flex-direction:column;gap:6px;background:rgba(0,0,0,.2);border:1px solid rgba(200,170,110,.05);border-radius:8px">
      <div class="ko3-qol-sub">
        <span style="color:#5b5340;font-size:9px;font-weight:600;min-width:34px">Mode</span>
        <select class="ko3-qol-dd" data-key="cgMode" style="flex:1">
          <option value="CLASSIC">Summoner's Rift</option>
          <option value="ARAM">ARAM</option>
          <option value="URF">URF</option>
          <option value="PRACTICETOOL">Practice Tool</option>
          <option value="ONEFORALL">One for All</option>
          <option value="NEXUSBLITZ">Nexus Blitz</option>
        </select>
        <span style="color:#5b5340;font-size:9px;font-weight:600;min-width:24px">Map</span>
        <select class="ko3-qol-dd" data-key="cgMap" style="flex:1">
          <option value="11">Summoner's Rift</option>
          <option value="12">Howling Abyss</option>
          <option value="30">Nexus Blitz</option>
        </select>
      </div>
      <div class="ko3-qol-sub">
        <span style="color:#5b5340;font-size:9px;font-weight:600;min-width:34px">Size</span>
        <input type="number" class="ko3-qol-ni" data-key="cgTeamSize" value="5" min="1" max="5" style="width:40px">
        <span style="color:#5b5340;font-size:9px;font-weight:600;min-width:44px">Spectate</span>
        <select class="ko3-qol-dd" data-key="cgSpectate" style="flex:1">
          <option value="AllAllowed">Anyone</option>
          <option value="LobbyOnly">Lobby Only</option>
          <option value="DropIn">Drop In</option>
          <option value="Disabled">Disabled</option>
        </select>
      </div>
      <div class="ko3-qol-sub">
        <button class="ko3-qol-btn" data-action="createCustom">Create</button>
        <button class="ko3-qol-btn" data-action="addBotCustom">Add Bot</button>
        <button class="ko3-qol-btn" data-action="startCustom">Start</button>
      </div>
    </div>
  </div>

  <!-- Notifications & Display -->
  <div class="ko3-qol-grp" data-cat="display">
    <div class="ko3-qol-grp-lbl"><svg class="ko3-qol-grp-ico" viewBox="0 0 24 24" fill="none" stroke="#c89b3c" stroke-width="1.5" stroke-linecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>Notifications &amp; Display</div>
    <div class="ko3-qol-opt" style="flex-direction:column;align-items:stretch;cursor:default">
      <div style="display:flex;align-items:center;justify-content:space-between;width:100%;cursor:pointer">
        <div><div class="ko3-qol-opt-lbl">Desktop Notifications</div><div class="ko3-qol-opt-desc">OS notifications for in-game events</div></div>
        <div class="ko3-qol-tog${s.desktopNotifs?' on':''}" data-key="desktopNotifs"></div>
      </div>
      ${s.desktopNotifs ? `<div style="margin-top:6px;display:flex;flex-direction:column;gap:2px;padding-left:4px">
        <div class="ko3-qol-sub" style="justify-content:space-between"><span style="color:#a09880;font-size:9px;font-weight:600">Queue Pop</span><div class="ko3-qol-tog mi${s.notifOnQueue?' on':''}" data-key="notifOnQueue"></div></div>
        <div class="ko3-qol-sub" style="justify-content:space-between"><span style="color:#a09880;font-size:9px;font-weight:600">Game Start</span><div class="ko3-qol-tog mi${s.notifOnGameStart?' on':''}" data-key="notifOnGameStart"></div></div>
        <div class="ko3-qol-sub" style="justify-content:space-between"><span style="color:#a09880;font-size:9px;font-weight:600">Game End</span><div class="ko3-qol-tog mi${s.notifOnGameEnd?' on':''}" data-key="notifOnGameEnd"></div></div>
      </div>` : ''}
    </div>
    ${opt('hideNotifications', 'Hide Badges', 'Hide notification badges/dots', s.hideNotifications)}
    ${opt('cleanHomePage', 'Clean Home Page', 'Hide news, ads, and promotions', s.cleanHomePage)}
  </div>

  <!-- System -->
  <div class="ko3-qol-grp" data-cat="system">
    <div class="ko3-qol-grp-lbl"><svg class="ko3-qol-grp-ico" viewBox="0 0 24 24" fill="none" stroke="#c89b3c" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>System</div>
    ${opt('autoReload', 'Auto-Reload', 'Reload client periodically to free memory', s.autoReload, `<div class="ko3-qol-sl-row"><input type="range" class="ko3-qol-sl" data-key="autoReloadInterval" value="${s.autoReloadInterval}" min="15" max="240" step="5"><span class="ko3-qol-sl-v" data-label="autoReloadInterval">${s.autoReloadInterval}m</span></div>`)}
    ${opt('perfMode', 'Performance Mode', 'Disable CSS animations & transitions', s.perfMode)}
    ${opt('appearOffline', 'Appear Offline', 'Set chat status to offline', s.appearOffline)}
    ${opt('skinShards', 'Skin Shard Indicators', 'Show green shard badges in Skin Showcase', s.skinShards)}
  </div>

</div>`;

  // ──── Helpers ────
  function opt(key, label, desc, value, extra) {
    return `<div class="ko3-qol-opt" data-skey="${key}">
      <div>
        <div class="ko3-qol-opt-lbl">${KO3Utils.escapeHtml(label)}</div>
        <div class="ko3-qol-opt-desc">${KO3Utils.escapeHtml(desc)}</div>
        ${extra || ''}
      </div>
      <div class="ko3-qol-tog${value ? ' on' : ''}" data-key="${key}"></div>
    </div>`;
  }

  // ──── Event Binding ────

  // Close
  panelInner.querySelector('[data-action="close"]').addEventListener('click', () => QOL.panel.close());

  // Settings search
  const searchInput = panelInner.querySelector('#ko3-qol-settings-search');
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      const q = searchInput.value.toLowerCase();
      panelInner.querySelectorAll('.ko3-qol-opt').forEach(o => {
        o.style.display = o.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
      });
      panelInner.querySelectorAll('.ko3-qol-grp').forEach(g => {
        const vis = Array.from(g.querySelectorAll('.ko3-qol-opt')).some(o => o.style.display !== 'none');
        g.style.display = vis ? '' : 'none';
      });
    });
  }

  // Category filter pills
  panelInner.querySelectorAll('.ko3-qol-cat').forEach(pill => {
    pill.addEventListener('click', () => {
      const cat = pill.dataset.cat;
      const cats = panelInner.querySelector('.ko3-qol-cats');
      cats.querySelectorAll('.ko3-qol-cat').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      panelInner.querySelectorAll('.ko3-qol-grp').forEach(g => {
        g.style.display = (cat === 'all' || g.dataset.cat === cat) ? '' : 'none';
      });
      // Clear search when changing category
      if (searchInput) {
        searchInput.value = '';
        searchInput.dispatchEvent(new Event('input'));
      }
    });
  });

  // Toggle switches
  panelInner.querySelectorAll('.ko3-qol-tog').forEach(tog => {
    tog.addEventListener('click', (e) => {
      e.stopPropagation();
      const key = tog.dataset.key;
      if (!key) return;
      const newVal = !QOL.settings[key];
      QOL.settings[key] = newVal;
      tog.classList.toggle('on', newVal);
      QOL.saveSettings();
      QOL.onToggle(key, newVal);
      // Re-render for toggles that reveal sub-options
      if (['gameModeQuickJoin','profileBackground','profileIcon','challengeBadges','presenceBio','desktopNotifs'].includes(key)) {
        setTimeout(async () => { if (QOL.panel && QOL.panel.getIsOpen()) await QOL.render(QOL.panel.getInner()); }, 60);
      }
    });
  });

  // Sliders
  panelInner.querySelectorAll('.ko3-qol-sl').forEach(sl => {
    sl.addEventListener('input', () => {
      const key = sl.dataset.key;
      const val = parseInt(sl.value, 10);
      QOL.settings[key] = val;
      QOL.saveSettings();
      const label = panelInner.querySelector(`[data-label="${key}"]`);
      if (label) {
        let suffix = '';
        if (key === 'lockDelay') suffix = 'ms';
        else if (key === 'autoSkipEOGDelay') suffix = 's';
        else if (key === 'autoReloadInterval') suffix = 'm';
        label.textContent = val + suffix;
      }
      QOL.onToggle(key, val);
    });
  });

  // Dropdowns
  panelInner.querySelectorAll('.ko3-qol-dd').forEach(dd => {
    dd.addEventListener('change', () => {
      const key = dd.dataset.key;
      QOL.settings[key] = dd.value;
      QOL.saveSettings();
      QOL.onToggle(key, dd.value);
    });
  });

  // Text inputs
  panelInner.querySelectorAll('.ko3-qol-ti').forEach(ti => {
    ti.addEventListener('change', () => {
      const key = ti.dataset.key;
      QOL.settings[key] = ti.value;
      QOL.saveSettings();
      QOL.onToggle(key, ti.value);
    });
  });

  // Number inputs
  panelInner.querySelectorAll('.ko3-qol-ni').forEach(ni => {
    ni.addEventListener('change', () => {
      const key = ni.dataset.key;
      const val = parseInt(ni.value, 10) || 0;
      QOL.settings[key] = val;
      QOL.saveSettings();
      QOL.onToggle(key, val);
    });
  });

  // Quick join buttons
  const QJ_LABELS = {430:'Blind',400:'Draft',420:'Ranked Solo',440:'Ranked Flex',450:'ARAM',900:'URF'};
  panelInner.querySelectorAll('.ko3-qol-qj').forEach(qj => {
    qj.addEventListener('click', () => {
      const q = qj.dataset.q;
      qj.textContent = '...';
      qj.disabled = true;
      QOL.createLobby(parseInt(q, 10)).then(ok => {
        qj.textContent = ok ? '✓' : 'FAILED';
        setTimeout(() => { qj.textContent = QJ_LABELS[q] || `Q${q}`; qj.disabled = false; }, 2000);
      });
    });
  });

  // Action buttons
  panelInner.querySelectorAll('.ko3-qol-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const origText = btn.textContent;
      btn.textContent = '…';
      btn.disabled = true;
      let ok = false;
      switch (action) {
        case 'setBackground':
          ok = await QOL.setBackground(QOL.settings.backgroundSkinId || 0);
          break;
        case 'setIcon': {
          const id = parseInt(document.querySelector('.ko3-qol-ni[data-key="profileIconId"]')?.value, 10) || 0;
          QOL.settings.profileIconId = id;
          QOL.saveSettings();
          ok = await QOL.setIcon(id);
          break;
        }
        case 'setBadges': {
          const id1 = parseInt(document.querySelector('.ko3-qol-ni[data-key="challengeId1"]')?.value, 10) || 0;
          const id2 = parseInt(document.querySelector('.ko3-qol-ni[data-key="challengeId2"]')?.value, 10) || 0;
          const id3 = parseInt(document.querySelector('.ko3-qol-ni[data-key="challengeId3"]')?.value, 10) || 0;
          QOL.settings.challengeId1 = id1;
          QOL.settings.challengeId2 = id2;
          QOL.settings.challengeId3 = id3;
          QOL.saveSettings();
          ok = await QOL.setChallengeBadges([id1, id2, id3].filter(n => n > 0));
          break;
        }
        case 'setStatus': {
          const msg = document.querySelector('.ko3-qol-ti[data-key="statusMessage"]')?.value || '';
          QOL.settings.statusMessage = msg;
          QOL.saveSettings();
          ok = await QOL.setStatusMessage(msg);
          break;
        }
        case 'quickInvite':
          ok = await QOL.doQuickInvite();
          break;
        case 'claimMissions':
          ok = await QOL.claimAllMissions();
          break;
        case 'removeOffline': {
          const friends = await QOL.getFriends();
          const offline = friends.filter(f => f.availability === 'offline' || f.availability === 'dnd' || f.availability === 'mobile');
          if (!offline.length) { QOL.showToast('No offline friends'); ok = true; break; }
          if (!confirm(`Remove ${offline.length} offline friend(s)?`)) { ok = true; break; }
          ok = await QOL.removeOfflineFriends();
          break;
        }
        case 'createCustom': {
          const cgMode = panelInner.querySelector('[data-key="cgMode"]')?.value || 'CLASSIC';
          const cgMap = parseInt(panelInner.querySelector('[data-key="cgMap"]')?.value, 10) || 11;
          const cgTeamSize = parseInt(panelInner.querySelector('[data-key="cgTeamSize"]')?.value, 10) || 5;
          const cgSpectate = panelInner.querySelector('[data-key="cgSpectate"]')?.value || 'AllAllowed';
          ok = await QOL.createCustomGame({ gameMode: cgMode, mapId: cgMap, teamSize: cgTeamSize, spectatorPolicy: cgSpectate });
          break;
        }
        case 'addBotCustom':
          ok = await QOL.addBotToLobby({});
          break;
        case 'startCustom':
          ok = await QOL.startCustomChampSelect();
          break;
      }
      btn.textContent = ok ? '✓' : 'FAILED';
      setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, ok ? 1200 : 2000);
    });
  });

  // Bind champion and skin pickers
  QOL.bindChampPicker(panelInner);
  QOL.bindSkinPicker(panelInner);
};

/** Called when any setting changes — applies or removes the feature immediately */
QOL.onToggle = function onToggle(key, val) {
  switch (key) {
    case 'perfMode':
      QOL.applyPerfMode(!!val);
      break;
    case 'hideNotifications':
      QOL.applyNotifCss(!!val);
      if (val) QOL.startNotifCleaner();
      else QOL.stopNotifCleaner();
      break;
    case 'dodgeButton':
      if (val) QOL.injectDodgeBtn();
      else QOL.removeDodgeBtn();
      break;
    case 'appearOffline':
      QOL.setAppearOffline(!!val);
      break;
    case 'skipHonor':
      if (val) QOL.startHonorSkip();
      else QOL.stopHonorSkip();
      break;
    case 'timerOverlay':
      if (val) QOL.injectTimerOverlay();
      else QOL.removeTimerOverlay();
      break;
    case 'queueStats':
      if (val) QOL.injectQueueStats();
      else QOL.removeQueueStats();
      break;
    case 'lobbyReveal':
      if (val) QOL.injectLobbyReveal();
      else QOL.removeLobbyReveal();
      break;
    case 'friendsNotifier':
      if (val) QOL.startFriendsNotifier();
      else QOL.stopFriendsNotifier();
      break;
    case 'randomSkin':
      if (val) QOL.injectRandomSkinBtn();
      else QOL.removeRandomSkinBtn();
      break;
    case 'gameModeQuickJoin':
      if (QOL.panel && QOL.panel.getIsOpen()) {
        (async () => { await QOL.render(QOL.panel.getInner()); })();
      }
      break;
    case 'profileBackground':
      if (val && QOL.settings.backgroundSkinId) QOL.setBackground(QOL.settings.backgroundSkinId);
      break;
    case 'profileIcon':
      if (val && QOL.settings.profileIconId) QOL.setIcon(QOL.settings.profileIconId);
      break;
    case 'challengeBadges':
      if (val) {
        const ids = [QOL.settings.challengeId1, QOL.settings.challengeId2, QOL.settings.challengeId3].filter((n) => n > 0);
        if (ids.length) QOL.setChallengeBadges(ids);
      }
      break;
    case 'presenceBio':
      if (val && QOL.settings.statusMessage) QOL.setStatusMessage(QOL.settings.statusMessage);
      break;
    case 'autoReload':
      if (val) {
        const intervalMs = (QOL.settings.autoReloadInterval || 60) * 60 * 1000;
        QOL.intervals.reload = setInterval(() => {
          try { window.reloadClient(); } catch {}
        }, intervalMs);
      } else {
        if (QOL.intervals.reload) {
          clearInterval(QOL.intervals.reload);
          QOL.intervals.reload = null;
        }
      }
      break;
    case 'skinShards':
      break;
    case 'bgChampId':
      if (QOL.panel && QOL.panel.getIsOpen()) {
        (async () => { await QOL.render(QOL.panel.getInner()); })();
      }
      break;
    case 'autoSetRoles':
      if (val) QOL.setPositionPreferences(QOL.settings.primaryRole, QOL.settings.secondaryRole);
      break;
    case 'autoGG':
      // Nothing to do immediately — fires on EndOfGame
      break;
    case 'queuePopFlash':
      // Nothing to do immediately — fires on ReadyCheck
      break;
    case 'cleanHomePage':
      QOL.applyCleanHomePage(!!val);
      break;
    case 'masteryOverlay':
      if (!val) QOL.removeMasteryOverlay();
      break;
    case 'autoSkipEOG':
      if (!val) QOL.stopEOGSkip();
      break;
    case 'desktopNotifs':
      if (val && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
      }
      break;
    default:
      break;
  }
};



/**
 * @name KO3-QoL — Main
 * @description Bootstrap: nav button, panel, phase-based feature logic
 */

(async () => {
  const log = KO3Utils.createLogger('[KO3-QoL]');

  try {
    await KO3Utils.waitForBridge(10000);
    log.info('Bridge ready');
  } catch {
    log.error('Bridge timeout — QoL disabled');
    return;
  }

  KO3Utils.injectCss('ko3-qol-css', '//plugins/KO3-QoL/style.css');

  // --- Shared state reference ---
  const s = QOL.settings;

  // --- Apply persistent settings on load ---
  if (s.perfMode) QOL.applyPerfMode(true);
  if (s.hideNotifications) {
    QOL.applyNotifCss(true);
    QOL.startNotifCleaner();
  }
  if (s.appearOffline) {
    QOL.setAppearOffline(true);
    QOL.isOffline = true;
  }
  if (s.cleanHomePage) QOL.applyCleanHomePage(true);
  if (s.desktopNotifs && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  if (s.profileBackground && s.backgroundSkinId) QOL.setBackground(s.backgroundSkinId);
  if (s.profileIcon && s.profileIconId) QOL.setIcon(s.profileIconId);
  if (s.challengeBadges) {
    const ids = [s.challengeId1, s.challengeId2, s.challengeId3].filter((n) => n > 0);
    if (ids.length) QOL.setChallengeBadges(ids);
  }
  if (s.presenceBio && s.statusMessage) QOL.setStatusMessage(s.statusMessage);
  if (s.autoSetRoles) {
    setTimeout(() => QOL.setPositionPreferences(s.primaryRole, s.secondaryRole), 3000);
  }

  // --- Panel ---
  QOL.panel = KO3Utils.Panel('qol', 'qol');

  async function openPanel() {
    const inner = QOL.panel.open();
    await QOL.render(inner);
  }

  function closePanel() {
    QOL.panel.close();
  }

  // --- Nav button ---
  const navBtn = KO3Utils.NavButton('qol',
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22%23cdbe91%22 d=%22M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z%22/%3E%3C/svg%3E'
  );

  // --- Phase handler ---
  function phaseHandler(phase) {
    const showIn = new Set(['None', 'Lobby', 'Matchmaking']);
    if (showIn.has(phase)) {
      navBtn.setup(() => openPanel());
    } else {
      navBtn.remove();
      if (QOL.panel.getIsOpen()) closePanel();
    }
  }

  const handlePhase = (phase) => {
    phaseHandler(phase);

    switch (phase) {
      case 'ReadyCheck':
        if (s.autoAccept) QOL.tryAccept();
        if (s.queuePopSound) QOL.beep(s.queuePopVolume);
        if (s.queuePopFlash) QOL.showQueueFlash();
        if (s.desktopNotifs && s.notifOnQueue) QOL.notify('Match Ready', 'A game has been found! Accept now.');
        break;

      case 'Matchmaking':
        if (s.queueStats) QOL.injectQueueStats();
        if (s.autoSetRoles && !QOL.rolesSet) {
          QOL.setPositionPreferences(s.primaryRole, s.secondaryRole);
          QOL.rolesSet = true;
        }
        break;

      case 'ChampSelect':
        // Clean up queue stats & reset session flags
        QOL.removeQueueStats();
        QOL.rolesSet = false;

        // Mastery overlay
        if (s.masteryOverlay) QOL.injectMasteryOverlay();

        // Cache teammate IDs for honor filtering (enemies now in ballot)
        QOL.getChampSelectSession().then((session) => {
          if (session && session.myTeam) {
            QOL.myTeamIds = new Set(session.myTeam.map((p) => p.summonerId).filter(Boolean));
          }
        });

        // Inject phase-specific UI
        if (s.dodgeButton) QOL.injectDodgeBtn();
        if (s.timerOverlay) QOL.injectTimerOverlay();
        if (s.lobbyReveal) QOL.injectLobbyReveal();
        if (s.randomSkin) QOL.injectRandomSkinBtn();

        // Auto message (once per session)
        QOL.sentAutoMsg = false;
        if (s.autoMessage) {
          setTimeout(() => QOL.doSendAutoMsg(), 3000);
        }

        // Auto lock-in & auto ban
        if (s.autoLockChamp || s.autoBan) {
          const checkActions = async () => {
            const session = await QOL.getChampSelectSession();
            if (!session) return;
            const myAction = QOL.findMyAction(session);
            if (!myAction) return;
            if (myAction.type === 'pick' && s.autoLockChamp && s.lockChampId && !myAction.championId) {
              const picked = await QOL.selectChampion(myAction.id, s.lockChampId);
              if (picked && s.lockDelay > 0) {
                setTimeout(() => QOL.lockChampion(myAction.id), s.lockDelay);
              } else if (picked) {
                QOL.lockChampion(myAction.id);
              }
            }
            if (myAction.type === 'ban' && s.autoBan && s.banChampId && !myAction.championId) {
              await QOL.selectChampion(myAction.id, s.banChampId);
            }
          };
          // Check immediately and after a short delay (actions may load late)
          checkActions();
          setTimeout(checkActions, 2000);
        }
        break;

      case 'InProgress':
      case 'Reconnect':
        QOL.removeDodgeBtn();
        QOL.removeTimerOverlay();
        QOL.removeLobbyReveal();
        QOL.removeRandomSkinBtn();
        QOL.removeQueueStats();
        QOL.removeMasteryOverlay();
        QOL.myTeamIds = null;
        if (s.desktopNotifs && s.notifOnGameStart && !QOL.notifiedGameStart) {
          QOL.notifiedGameStart = true;
          QOL.notify('Game Started', 'Your game is loading. Good luck!');
        }
        break;

      case 'WaitingForStats':
        QOL.removeDodgeBtn();
        QOL.removeTimerOverlay();
        QOL.removeLobbyReveal();
        QOL.removeRandomSkinBtn();
        QOL.removeMasteryOverlay();
        QOL.stopEOGSkip();
        QOL.gameCount++;
        break;

      case 'EndOfGame':
        QOL.removeDodgeBtn();
        QOL.removeTimerOverlay();
        QOL.removeLobbyReveal();
        QOL.removeRandomSkinBtn();
        QOL.removeQueueStats();
        QOL.removeMasteryOverlay();
        if (s.desktopNotifs && s.notifOnGameEnd) QOL.notify('Game Over', 'Your game has ended.');
        if (s.autoSkipEOG) QOL.startEOGSkip();
        if (s.autoHonor) {
          QOL.getHonorBallot().then((ballot) => {
            if (!ballot || !ballot.eligiblePlayers || !ballot.eligiblePlayers.length) return;
            let players = ballot.eligiblePlayers;
            // Filter to teammates only when we have cached team data and setting is enabled
            if (s.honorTeammatesOnly && QOL.myTeamIds && QOL.myTeamIds.size) {
              players = players.filter((p) => QOL.myTeamIds.has(p.summonerId));
              if (!players.length) return;
            }
            let target;
            switch (s.honorTarget) {
              case 'first':
                target = players[0];
                break;
              case 'best':
                target = players.reduce((a, b) => ((a.gameScore || 0) > (b.gameScore || 0) ? a : b));
                break;
              case 'support':
                target = players.sort((a, b) => (a.gameScore || 0) - (b.gameScore || 0))[0];
                break;
              case 'random':
              default:
                target = players[Math.floor(Math.random() * players.length)];
                break;
            }
            if (target) QOL.doHonor(target.summonerId);
          });
        }
        if (s.autoRequeue) {
          setTimeout(() => QOL.doRequeue(), 3000);
        }
        if (s.autoGG) {
          setTimeout(() => QOL.doSendGG(), 5000);
        }
        break;

      case 'None':
      case 'Lobby':
        QOL.removeDodgeBtn();
        QOL.removeTimerOverlay();
        QOL.removeLobbyReveal();
        QOL.removeRandomSkinBtn();
        QOL.removeQueueStats();
        QOL.removeMasteryOverlay();
        QOL.stopEOGSkip();
        QOL.resetNotifFlags();
        break;

      default:
        break;
    }
  };

  // --- Auto-reload interval ---
  if (s.autoReload) {
    const intervalMs = (s.autoReloadInterval || 60) * 60 * 1000;
    QOL.intervals.reload = setInterval(() => {
      try { window.reloadClient(); } catch { /* Pengu runtime API */ }
    }, intervalMs);
  }

  // --- Subscribe to gameflow phase changes (MatchHistory-compatible pattern) ---
  const bridge = window.__roseBridge;
  bridge.subscribe('phase-change', (data) => {
    const phase = data?.phase ?? data;
    if (typeof phase === 'string') handlePhase(phase);
  });

  // --- Show nav button in initial lobby state ---
  handlePhase('None');

  log.info('Initialized');
})();

