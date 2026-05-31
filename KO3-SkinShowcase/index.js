/**
 * @name KO3-SkinShowcase — Constants
 * @description Tier labels, milestone thresholds, rarity maps
 */
const SS = {};

/** Tier display config */
SS.TIERS = {
  ultimate: { label: 'Ultimate', color: '#e9c46a', rank: 5 },
  mythic: { label: 'Mythic', color: '#e76f51', rank: 4 },
  legendary: { label: 'Legendary', color: '#c89b3c', rank: 3 },
  epic: { label: 'Epic', color: '#9b59b6', rank: 2 },
  standard: { label: 'Standard', color: '#6b6556', rank: 1 },
};

/** Collection milestones */
SS.MILESTONES = [
  { count: 50, label: 'Collector', icon: '🥉' },
  { count: 100, label: 'Enthusiast', icon: '🥈' },
  { count: 200, label: 'Connoisseur', icon: '🥇' },
  { count: 350, label: 'Curator', icon: '💎' },
  { count: 500, label: 'Mythic', icon: '👑' },
  { count: 750, label: 'Legend', icon: '🏆' },
  { count: 1000, label: 'Transcendent', icon: '🌟' },
];

/** Map skin rarity strings to tier keys */
SS.RARITY_MAP = {
  ULTIMATE: 'ultimate',
  MYTHIC: 'mythic',
  LEGENDARY: 'legendary',
  EPIC: 'epic',
  STANDARD: 'standard',
};

/**
 * @name KO3-SkinShowcase — State
 * @description Runtime data: skins, champions, filters, selection
 */

/** All skin objects with ownership and metadata merged */
SS.allSkins = [];

/** Champion summary list [{ id, name, owned, total }] */
SS.allChamps = [];

/** Set of favorited skin composite IDs */
SS.favs = new Set();

/** Active filter state */
SS.filter = {
  tier: 'all',
  search: '',
  favsOnly: false,
  shardsOnly: false,
  sortBy: 'tier',
};

/** Currently selected champion ID (expanded view) */
SS.selectedChamp = null;

/** Currently previewed skin object (full-screen splash) */
SS.previewSkin = null;

/** Loading progress tracker */
SS.loadProgress = { loading: false, error: null };

/**
 * @name KO3-SkinShowcase — Utils
 * @description Helpers for IDs, URLs, filtering, sorting, favorites
 */

/** Build a composite skin ID string */
SS.skinId = function skinId(championId, skinNum) {
  return `${championId}_${skinNum}`;
};

/** LCU local tile path for a champion skin (uses full skinId) */
SS.tilePath = function tilePath(championId, skinNum) {
  const skinId = championId * 1000 + skinNum;
  return `/lol-game-data/assets/v1/champion-tiles/${championId}/${skinId}.jpg`;
};

/** LCU local splash path for a champion skin */
SS.splashPath = function splashPath(championId, skinNum) {
  return `/lol-game-data/assets/v1/champion-splashes/${championId}/${skinNum}.jpg`;
};

/** Guess the tier of a skin based on its LCU data */
SS.guessTier = function guessTier(skin) {
  if (!skin) return 'standard';
  const raw = (skin.rarity || skin.rarityGem || '').replace(/^k/i, '');
  const upper = raw.toUpperCase();
  if (SS.RARITY_MAP[upper]) return SS.RARITY_MAP[upper];
  if (skin.ultimate) return 'ultimate';
  if (skin.mythic) return 'mythic';
  if (skin.legendary) return 'legendary';
  if (skin.epic) return 'epic';
  return 'standard';
};

/** Apply current filters to the champion + skin data */
SS.filtered = function filtered() {
  const f = SS.filter;
  const search = f.search.trim().toLowerCase();

  let champs = SS.allChamps;

  if (search) {
    champs = champs.filter((c) => c.name.toLowerCase().includes(search));
  }
  if (f.favsOnly) {
    champs = champs.filter((c) => c.favCount > 0);
  }
  if (f.shardsOnly) {
    champs = champs.filter((c) => c.shards > 0);
  }

  return champs;
};

/** Sort skins by tier rank then by name */
SS.sortSkins = function sortSkins(skins) {
  return [...skins].sort((a, b) => {
    const aTier = SS.TIERS[SS.guessTier(a)]?.rank || 0;
    const bTier = SS.TIERS[SS.guessTier(b)]?.rank || 0;
    if (bTier !== aTier) return bTier - aTier;
    return (a.name || '').localeCompare(b.name || '');
  });
};

/** Load favorites from DataStore */
SS.loadFavs = function loadFavs() {
  const saved = DataStore.get('ko3-ss-favs');
  if (saved && Array.isArray(saved)) SS.favs = new Set(saved);
};

/** Save favorites to DataStore */
SS.saveFavs = function saveFavs() {
  DataStore.set('ko3-ss-favs', [...SS.favs]);
};

/** Toggle favorite status for a skin */
SS.toggleFav = function toggleFav(skinId) {
  if (SS.favs.has(skinId)) {
    SS.favs.delete(skinId);
  } else {
    SS.favs.add(skinId);
  }
  SS.saveFavs();
  return SS.favs.has(skinId);
};

/**
 * @name KO3-SkinShowcase — Render
 * @description Panel HTML rendering and event binding
 */

/** Render the full splash preview modal for a skin */
SS.renderPreview = function renderPreview(skin) {
  const existing = document.getElementById('ko3-ss-pv');
  if (existing) existing.remove();

  if (!skin) return;

  const champId = skin.championId;
  const skinNum = skin.skinId != null ? skin.skinId % 1000 : 0;
  const src = SS.splashPath(champId, skinNum);
  const tier = SS.guessTier(skin);
  const tierCfg = SS.TIERS[tier];
  const isFav = SS.favs.has(SS.skinId(champId, skinNum));

  const div = document.createElement('div');
  div.id = 'ko3-ss-pv';
  div.innerHTML = `
    <div class="ko3-ss-pv-bg"></div>
    <div class="ko3-ss-pv-box">
      <div class="ko3-ss-pv-x" data-action="pv-close">✕</div>
      <img src="${src}" alt="${KO3Utils.escapeHtml(skin.name || '')}" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23010a13%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%22200%22 y=%22150%22 fill=%22%236b6556%22 font-size=%2214%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Splash%3C/text%3E%3C/svg%3E'">
      <div class="ko3-ss-pv-info">
        <div class="ko3-ss-pv-name">${KO3Utils.escapeHtml(skin.name || 'Unknown Skin')} ${isFav ? '♥' : ''}</div>
        <div class="ko3-ss-pv-champ">${KO3Utils.escapeHtml(skin.championName || '')}</div>
        <div class="ko3-ss-pv-tier" style="color:${tierCfg?.color || '#6b6556'}">${tierCfg?.label || tier}</div>
      </div>
    </div>`;
  document.body.appendChild(div);

  // Background click to close
  div.querySelector('.ko3-ss-pv-bg').addEventListener('click', () => div.remove());
  div.querySelector('[data-action="pv-close"]').addEventListener('click', () => div.remove());
  SS.previewSkin = skin;
};

/** Render the entire Skin Showcase panel into the inner container */
SS.render = function render(inner) {
  const loading = SS.loadProgress.loading;
  const error = SS.loadProgress.error;
  const champs = SS.filtered();
  const totalSkins = SS.allSkins.filter((s) => s.owned).length;
  const allChampsCount = SS.allChamps.filter((c) => c.owned > 0).length;
  const pct = SS.allChamps.length ? Math.round((allChampsCount / SS.allChamps.length) * 100) : 0;
  const totalShards = SS.allChamps.reduce((sum, c) => sum + (c.shards || 0), 0);

  // Milestones
  const mileHtml = SS.MILESTONES.map((m) => {
    const done = totalSkins >= m.count;
    return `<div class="ko3-ss-mile-b" style="${done ? 'border-color:#c89b3c;background:rgba(200,155,60,.12)' : 'opacity:.5'}">
      <span class="ko3-ss-mile-i">${m.icon}</span>
      <span class="ko3-ss-mile-n">${m.label}</span>
    </div>`;
  }).join('');

  // Tier filter buttons
  const tiers = ['all', 'ultimate', 'mythic', 'legendary', 'epic', 'standard'];
  const filterHtml = tiers.map((t) => {
    const label = t === 'all' ? 'All' : SS.TIERS[t]?.label || t;
    return `<span class="ko3-ss-f${SS.filter.tier === t ? ' on' : ''}" data-tier="${t}">${label}</span>`;
  }).join('');

  // Champion dropdown
  const champOpts = SS.allChamps
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => `<option value="${c.id}"${SS.selectedChamp === c.id ? ' selected' : ''}>${KO3Utils.escapeHtml(c.name)} (${c.owned})</option>`)
    .join('');

  // Champion cards
  const champCards = champs
    .sort((a, b) => b.owned - a.owned || a.name.localeCompare(b.name))
    .map((c) => {
      const p = c.total ? Math.round((c.owned / c.total) * 100) : 0;
      const ps = c.total ? Math.round(((c.owned + c.shards) / c.total) * 100) : 0;
      const hasShards = c.shards > 0;
      const ccClass = (SS.selectedChamp === c.id ? ' on' : '') + (hasShards ? ' shard' : '');
      return `<div class="ko3-ss-cc${ccClass}" data-champ="${c.id}">
        <div class="ko3-ss-cc-img${hasShards ? ' shard' : ''}"><img src="${KO3Utils.LCU.championIcon(c.id)}" alt="" loading="lazy" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2252%22 height=%2252%22%3E%3Crect fill=%22%23010a13%22 width=%2252%22 height=%2252%22/%3E%3C/svg%3E'"></div>
        <div class="ko3-ss-cc-n">${KO3Utils.escapeHtml(c.name)}</div>
        <div class="ko3-ss-cc-c">${c.owned} / ${c.total}</div>
        <div class="ko3-ss-cc-pb"><div class="ko3-ss-cc-pb-f" style="width:${p}%"></div>${hasShards ? `<div class="ko3-ss-cc-pb-s" style="width:${ps}%"></div>` : ''}</div>
        ${hasShards ? `<div class="ko3-ss-cc-sr">◆ ${c.shards}</div>` : ''}
      </div>`;
    }).join('');

  // Expanded champion skin grid
  let expHtml = '';
  if (SS.selectedChamp != null) {
    const champSkins = SS.allSkins
      .filter((s) => s.championId === SS.selectedChamp)
      .sort((a, b) => {
        if (a.owned !== b.owned) return a.owned ? -1 : 1;
        const aTier = SS.TIERS[SS.guessTier(a)]?.rank || 0;
        const bTier = SS.TIERS[SS.guessTier(b)]?.rank || 0;
        if (bTier !== aTier) return bTier - aTier;
        return (a.name || '').localeCompare(b.name || '');
      });

    const selChamp = SS.allChamps.find((c) => c.id === SS.selectedChamp);
    const ownedCount = champSkins.filter((s) => s.owned).length;
    const shardCount = champSkins.filter((s) => s.shard).length;
    expHtml = `<div class="ko3-ss-exp">
      <div class="ko3-ss-exp-h">
        <span>${KO3Utils.escapeHtml(selChamp?.name || '')} — ${ownedCount} / ${champSkins.length} Skins${shardCount ? ` <span style="color:#2ecc71;font-weight:800">◆ ${shardCount} shard</span>` : ''}</span>
        <div class="ko3-ss-exp-x" data-action="close-exp">✕</div>
      </div>
      <div class="ko3-ss-cg-grid">
        ${champSkins.map((s) => {
          const owned = s.owned;
          const shard = s.shard;
          const sid = SS.skinId(s.championId, s.skinNum);
          const isFav = SS.favs.has(sid);
          const tier = SS.guessTier(s);
          const tierCfg = SS.TIERS[tier];
          const tileSrc = SS.tilePath(s.championId, s.skinNum);

          const cls = owned ? '' : shard ? ' shard' : ' miss';
          const badge = owned ? '' : shard ? '<div class="ko3-ss-shard-badge">◆</div>' : '<div class="ko3-ss-miss-badge">Missing</div>';
          return `<div class="ko3-ss-c${cls}" data-skin="${sid}">
            <img src="${tileSrc}" alt="" loading="lazy" onerror="this.onerror=function(){this.onerror=null;this.src='/lol-game-data/assets/v1/champion-icons/${s.championId}.png'};this.src='https://ddragon.leagueoflegends.com/cdn/img/champion/loading/${(s.championName||'').replace(/[^a-zA-Z0-9]/g,'')}_${s.skinNum}.jpg'">
            <div class="ko3-ss-cg"></div>
            ${tierCfg ? `<div class="ko3-ss-ct" style="color:${tierCfg.color}">${tierCfg.label}</div>` : ''}
            <div class="ko3-ss-cf${isFav ? ' fd' : ''}" data-fav="${sid}">${isFav ? '♥' : '♡'}</div>
            ${badge}
            <div class="ko3-ss-ci"><div class="ko3-ss-cn">${KO3Utils.escapeHtml(s.name || '')}</div></div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }

  inner.innerHTML = `
    <div class="ko3-ss-h">
      <h2>Skin Showcase</h2>
      <div class="ko3-ss-hr">
        <span class="ko3-ss-hr-s"><b>${totalSkins}</b> Skins · <b>${allChampsCount}</b> Champions</span>
        <div class="ko3-ss-x" data-action="close">✕</div>
      </div>
    </div>
    <div class="ko3-ss-s">
    <div class="ko3-ss-st"><div class="n">${totalSkins}</div><div class="t">Total Skins</div></div>
      <div class="ko3-ss-st"><div class="n">${allChampsCount}</div><div class="t">Champions</div></div>
      <div class="ko3-ss-st"><div class="n">${pct}%</div><div class="t">Collection</div></div>
      <div class="ko3-ss-st" style="color:#2ecc71"><div class="n" style="color:#2ecc71">◆ ${totalShards}</div><div class="t" style="color:#2ecc71">Shards</div></div>
      <div class="ko3-ss-st"><div class="n">${SS.allSkins.length || 0}</div><div class="t">Available</div></div>
    </div>
    <div class="ko3-ss-pb"><div class="ko3-ss-pb-f" style="width:${Math.min(100, pct)}%"></div></div>
    <div class="ko3-ss-mile">
      <span class="ko3-ss-mile-lbl">Milestones</span>
      <div class="ko3-ss-mile-row">${mileHtml}</div>
    </div>
    <div class="ko3-ss-tb">
      <input class="ko3-ss-sr" type="text" placeholder="Search champion..." value="${KO3Utils.escapeHtml(SS.filter.search)}">
      ${filterHtml}
      <div class="ko3-ss-d"></div>
      <select class="ko3-ss-ch"><option value="">All Champions</option>${champOpts}</select>
      <span class="ko3-ss-f${SS.filter.favsOnly ? ' on' : ''}" data-action="favs-toggle">♥ Favorites</span>
      <span class="ko3-ss-f${SS.filter.shardsOnly ? ' on' : ''}" data-action="shards-toggle" style="color:${SS.filter.shardsOnly ? '#2ecc71' : ''}">◆ Shards</span>
    </div>
    ${loading ? '<div class="ko3-ss-msg ld">Loading skins</div>' : ''}
    ${error ? `<div class="ko3-ss-msg">Error: ${KO3Utils.escapeHtml(error)}</div>` : ''}
    ${!loading && !error && !champs.length ? '<div class="ko3-ss-msg">No matches</div>' : ''}
    <div class="ko3-ss-g" id="ss-g">
      ${!loading && !error && champs.length ? `<div class="ko3-ss-cc-grid">${champCards}</div>` : ''}
      ${expHtml}
    </div>`;

  // ─── Event binding ─────────────────────────────────────────────

  // Close button
  inner.querySelector('[data-action="close"]')?.addEventListener('click', () => SS.panel.close());
  inner.querySelector('[data-action="close-exp"]')?.addEventListener('click', () => {
    SS.selectedChamp = null;
    SS.render(SS.panel.getInner());
    SS.panel.getInner().querySelector('.ko3-ss-g')?.scrollTo(0, 0);
  });

  // Preview close via Escape
  const onKey = (e) => {
    if (e.key === 'Escape') {
      const pv = document.getElementById('ko3-ss-pv');
      if (pv) pv.remove();
    }
  };
  document.addEventListener('keydown', onKey);

  // Tier filter clicks
  inner.querySelectorAll('[data-tier]').forEach((el) => {
    el.addEventListener('click', () => {
      SS.filter.tier = el.dataset.tier;
      SS.filter.search = '';
      SS.filter.favsOnly = false;
      SS.render(inner);
      inner.querySelector('.ko3-ss-g')?.scrollTo(0, 0);
    });
  });

  // Favorites toggle
  inner.querySelector('[data-action="favs-toggle"]')?.addEventListener('click', () => {
    SS.filter.favsOnly = !SS.filter.favsOnly;
    SS.render(inner);
    inner.querySelector('.ko3-ss-g')?.scrollTo(0, 0);
  });

  // Shards toggle
  inner.querySelector('[data-action="shards-toggle"]')?.addEventListener('click', () => {
    SS.filter.shardsOnly = !SS.filter.shardsOnly;
    SS.render(inner);
    inner.querySelector('.ko3-ss-g')?.scrollTo(0, 0);
  });

  // Champion dropdown
  inner.querySelector('.ko3-ss-ch')?.addEventListener('change', (e) => {
    const val = e.target.value;
    SS.selectedChamp = val ? Number(val) : null;
    SS.filter.search = '';
    SS.render(inner);
    inner.querySelector('.ko3-ss-g')?.scrollTo(0, 0);
  });

  // Search input (debounced)
  let searchTimer;
  inner.querySelector('.ko3-ss-sr')?.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      SS.filter.search = e.target.value;
      SS.filter.favsOnly = false;
      SS.selectedChamp = null;
      SS.render(inner);
      inner.querySelector('.ko3-ss-g')?.scrollTo(0, 0);
    }, 250);
  });

  // Champion card clicks
  inner.querySelectorAll('.ko3-ss-cc').forEach((el) => {
    el.addEventListener('click', () => {
      const id = Number(el.dataset.champ);
      SS.selectedChamp = SS.selectedChamp === id ? null : id;
      SS.render(inner);
      const expEl = inner.querySelector('.ko3-ss-exp');
      if (expEl) {
        expEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        inner.querySelector('.ko3-ss-g')?.scrollTo(0, 0);
      }
    });
  });

  // Skin card clicks (preview)
  inner.querySelectorAll('.ko3-ss-c').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-fav]')) return;
      const sid = el.dataset.skin;
      if (!sid) return;
      const [champId, skinNum] = sid.split('_').map(Number);
      const skin = SS.allSkins.find((s) => s.championId === champId && s.skinNum === skinNum);
      if (skin) SS.renderPreview(skin);
    });
  });

  // Favorite toggles on skin cards
  inner.querySelectorAll('[data-fav]').forEach((el) => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const sid = el.dataset.fav;
      SS.toggleFav(sid);
      el.textContent = SS.favs.has(sid) ? '♥' : '♡';
      el.classList.toggle('fd', SS.favs.has(sid));
    });
  });
};

/**
 * @name KO3-SkinShowcase — Data
 * @description LCU API calls: skin inventory, metadata, champion summaries
 */

/** Load all skin and champion data from LCU */
SS.loadData = async function loadData() {
  SS.loadProgress.loading = true;
  SS.loadProgress.error = null;
  SS.render(SS.panel.getInner());

  try {
    const summoner = await KO3Utils.LCU.getSummoner();
    const summonerId = summoner.summonerId;

    // Check if KO3-QoL skin shard indicators are enabled
    const qolSettings = DataStore.get('ko3-qol-settings');
    const showShards = !!(qolSettings?.skinShards);
    // Fetch owned skins, all skins DB, champion summary, and (optionally) loot
    const [ownedRaw, skinsDb, champsSummary, lootRaw] = await Promise.all([
      KO3Utils.LCU.fetch(`/lol-champions/v1/inventories/${summonerId}/skins-minimal`),
      KO3Utils.LCU.fetch('/lol-game-data/assets/v1/skins.json').catch(() => []),
      KO3Utils.LCU.fetch('/lol-game-data/assets/v1/champion-summary.json').catch(() => []),
      showShards
        ? KO3Utils.LCU.fetch('/lol-loot/v1/player-loot').catch(() => null)
        : Promise.resolve(null),
    ]);

    // Build set of skin IDs the player has shards for
    const shardSkinIds = new Set();
    if (Array.isArray(lootRaw)) {
      for (const item of lootRaw) {
        if (item.lootId && item.lootId.startsWith('CHAMPION_SKIN_RENTAL_')) {
          const id = parseInt(item.lootId.slice('CHAMPION_SKIN_RENTAL_'.length), 10);
          if (id > 0) shardSkinIds.add(id);
        }
      }
    }

    const toArray = (v) => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.values(v) : []);

    console.log('[KO3-SS] ownedRaw type:', typeof ownedRaw, Array.isArray(ownedRaw), ownedRaw ? Object.keys(ownedRaw).slice(0,5) : null);
    console.log('[KO3-SS] skinsDb type:', typeof skinsDb, Array.isArray(skinsDb), skinsDb ? Object.keys(skinsDb).slice(0,5) : null);
    console.log('[KO3-SS] champsSummary type:', typeof champsSummary, Array.isArray(champsSummary), champsSummary ? Object.keys(champsSummary).slice(0,5) : null);

    const ownedArr = Array.isArray(ownedRaw) ? ownedRaw : ownedRaw?.skins || ownedRaw?.data || ownedRaw?.entries || ownedRaw?.items || toArray(ownedRaw);
    console.log('[KO3-SS] ownedArr length:', ownedArr?.length);

    // Build champion name map
    const champNames = new Map();
    const champFullNames = new Map();
    toArray(champsSummary).forEach((c) => {
      champNames.set(c.id, c.name || c.alias || `#${c.id}`);
      champFullNames.set(c.id, c.name || '');
    });
    console.log('[KO3-SS] ownedArr length:', ownedArr?.length, 'champNames size:', champNames.size);

    // Build allSkins array and champion stats from ownedArr (primary source)
    const allSkins = [];
    const champTotals = new Map();
    const skinDbMap = new Map();
    toArray(skinsDb).forEach((s) => skinDbMap.set(s.id, s));

    ownedArr.forEach((s) => {
      const cId = s.championId;
      if (cId == null) return;

      const skinNum = s.id % 1000;
      if (skinNum === 0) return;

      const owned = s.ownership?.owned;
      const dbEntry = skinDbMap.get(s.id) || {};

      const skinObj = {
        championId: cId,
        championName: champFullNames.get(cId) || '',
        skinNum,
        skinId: s.id,
        name: s.name || `Skin #${skinNum}`,
        owned,
        shard: !owned && shardSkinIds.has(s.id),
        rarity: dbEntry.rarity || '',
        rarityGem: dbEntry.rarityGem || '',
        ultimate: dbEntry.ultimate || false,
        mythic: dbEntry.mythic || false,
        legendary: dbEntry.legendary || false,
        epic: dbEntry.epic || false,
        chromas: dbEntry.chromas || false,
      };
      allSkins.push(skinObj);

      if (!champTotals.has(cId)) {
        champTotals.set(cId, { id: cId, name: champNames.get(cId) || `#${cId}`, total: 0, owned: 0, shards: 0 });
      }
      champTotals.get(cId).total++;
      if (owned) champTotals.get(cId).owned++;
      if (skinObj.shard) champTotals.get(cId).shards++;
    });

    // Filter out non-champion entries (Doom Bots, None, etc.)
    const invalid = [];
    champNames.forEach((name, cId) => {
      if (!name || name === 'None' || name.includes('Doom')) invalid.push(cId);
    });
    invalid.forEach((cId) => champNames.delete(cId));

    // Also add champions that exist in champNames but have 0 owned skins
    champNames.forEach((name, cId) => {
      if (!champTotals.has(cId)) {
        champTotals.set(cId, { id: cId, name, total: 0, owned: 0, shards: 0 });
      }
    });

    console.log('[KO3-SS] allSkins final:', allSkins.length, 'champTotals:', champTotals.size);
    console.log('[KO3-SS] sample skin:', allSkins?.[0]);
    SS.allSkins = allSkins;
    SS.allChamps = Array.from(champTotals.values());
    SS.loadProgress.loading = false;
    SS.loadFavs();

    // Count favorite skins per champion for favsOnly filter
    const favCounts = new Map();
    SS.allSkins.forEach(s => {
      if (SS.favs.has(SS.skinId(s.championId, s.skinNum))) {
        favCounts.set(s.championId, (favCounts.get(s.championId) || 0) + 1);
      }
    });
    SS.allChamps.forEach(c => { c.favCount = favCounts.get(c.id) || 0; });

    SS.render(SS.panel.getInner());

    // Scroll to top after initial load
    const grid = SS.panel.getInner().querySelector('.ko3-ss-g');
    if (grid) grid.scrollTo(0, 0);

  } catch (err) {
    SS.loadProgress.loading = false;
    SS.loadProgress.error = err.message || 'Unknown error';
    SS.render(SS.panel.getInner());
  }
};



/**
 * @name KO3-SkinShowcase — Main
 * @description Bootstrap: nav button, panel, data loading, phase visibility
 */

(async () => {
  const log = KO3Utils.createLogger('[KO3-SkinShowcase]');

  try {
    await KO3Utils.waitForBridge(10000);
    log.info('Bridge ready');
  } catch {
    log.error('Bridge timeout — SkinShowcase disabled');
    return;
  }

  KO3Utils.injectCss('ko3-ss-css', '//plugins/KO3-SkinShowcase/style.css');

  // ─── Panel ──────────────────────────────────────────────────────
  SS.panel = KO3Utils.Panel('ss', 'ss');

  function openPanel() {
    SS.panel.open();
    const inner = SS.panel.getInner();
    SS.render(inner);
    SS.loadData();
  }

  function closePanel() {
    const pv = document.getElementById('ko3-ss-pv');
    if (pv) pv.remove();
    SS.previewSkin = null;
    SS.panel.close();
  }

  // ─── Nav button ─────────────────────────────────────────────────
  const nav = KO3Utils.NavButton('ss',
    'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22%3E%3Cpath fill=%22%23cdbe91%22 d=%22M21 3H3C2 3 1 4 1 5v14c0 1.1.9 2 2 2h18c1 0 2-1 2-2V5c0-1-1-2-2-2zM5 17l3.5-4.5 2.5 3.01L14.5 11l4.5 6H5z%22/%3E%3C/svg%3E'
  );

  function phaseHandler(phase) {
    const showIn = new Set(['None', 'Lobby', 'Matchmaking']);
    if (showIn.has(phase)) {
      nav.setup(() => openPanel());
    } else {
      nav.remove();
      if (SS.panel.getIsOpen()) closePanel();
    }
  }

  // ─── Subscribe to phase changes ─────────────────────────────────
  const bridge = window.__roseBridge;
  bridge.subscribe('phase-change', (data) => {
    const phase = data?.phase ?? data;
    if (typeof phase === 'string') phaseHandler(phase);
  });

  // ─── Show nav in lobby ──────────────────────────────────────────
  phaseHandler('None');

  // ─── Expose open/close for external use ─────────────────────────
  SS.openPanel = openPanel;
  SS.closePanel = closePanel;

  // ─── Escape key closes panel (only when preview is not open) ────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && SS.panel.getIsOpen() && !document.getElementById('ko3-ss-pv')) {
      closePanel();
    }
  });

  log.info('Initialized');
})();

