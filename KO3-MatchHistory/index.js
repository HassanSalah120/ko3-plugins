/**
 * @name KO3-MatchHistory — Constants
 * @description Immutable configuration, queue/spell/rune lookups, period definitions
 */
const MH = {};
let panel;

/** User-configurable settings with defaults */
MH.CFG = { games: 50, queue: 'all', period: 'all' };

/** Available game-count options */
MH.GAME_COUNTS = [20, 50, 100];

/** Time-period filters */
MH.PERIODS = {
  all:   { name: 'All',   ms: 0 },
  day:   { name: 'Day',   ms: 86_400_000 },
  week:  { name: 'Week',  ms: 604_800_000 },
  month: { name: 'Month', ms: 2_592_000_000 },
};

/** Queue-type map (key → { id, name }) */
MH.QUEUES = {
  all:           { id: 0,    name: 'All Modes' },
  ranked_solo:   { id: 420,  name: 'Ranked Solo' },
  ranked_flex:   { id: 440,  name: 'Ranked Flex' },
  normal_draft:  { id: 400,  name: 'Draft Pick' },
  normal_blind:  { id: 430,  name: 'Blind Pick' },
  aram:          { id: 450,  name: 'ARAM' },
  swiftplay:     { id: 1300, name: 'Swiftplay' },
};

/** Summoner spell ID → display name */
MH.SPELLS = {
  1:  'Cleanse',   3: 'Exhaust',   4: 'Flash',
  6:  'Ghost',     7: 'Heal',     11: 'Smite',
  12: 'Teleport', 14: 'Ignite',   21: 'Barrier',
};

/** Summoner spell ID → DDragon icon filename (PascalCase) */
MH.SPELL_ICONS = {
  1:  'SummonerBoost',   3: 'SummonerExhaust',   4: 'SummonerFlash',
  6:  'SummonerGhost',   7: 'SummonerHeal',     11: 'SummonerSmite',
  12: 'SummonerTeleport',14: 'SummonerDot',      21: 'SummonerBarrier',
};

/** Primary rune tree ID → { name, iconPath } */
MH.RUNE_TREES = {
  8000: { name: 'Precision',   img: '7000_Precision' },
  8100: { name: 'Domination',  img: '7100_Domination' },
  8200: { name: 'Sorcery',     img: '7200_Sorcery' },
  8300: { name: 'Inspiration', img: '7300_Inspiration' },
  8400: { name: 'Resolve',     img: '7400_Resolve' },
};

/** Ward / trinket item IDs that should be visually highlighted */
MH.TRINKET_IDS = new Set([3340, 3363, 3364, 2055, 3013]);

/**
 * @name KO3-MatchHistory — State
 * @description Mutable runtime state for the match-history plugin
 */

/** The current summoner's PUUID */
MH.puuid = null;

/** Index of the currently expanded match, or null */
MH.expandedIdx = null;

/** Full list of match objects currently displayed */
MH.matchData = [];

/** Simple TTL cache for API responses (key → { data, ts }) */
MH.cache = new Map();

/** Champion-name cache (championId → name string) */
MH.champNameCache = new Map();

/** Current DDragon version string */
MH.ddVer = '16.11.1';

/** In-flight DDragon version fetch promise (dedup) */
MH.ddVerPromise = null;

/**
 * @name KO3-MatchHistory — Utils
 * @description Pure helper functions: formatters, stat calculators, URL builders
 */
const esc = KO3Utils.escapeHtml;

// ─── Asset URL builders ────────────────────────────────────────────

/** Item icon URL (DDragon) */
MH.itemIcon = (id) => id
  ? `https://ddragon.leagueoflegends.com/cdn/${MH.ddVer}/img/item/${id}.png`
  : null;

/** Spell icon URL (DDragon) */
MH.spellIcon = (id) => {
  const name = MH.SPELL_ICONS[id] || 'SummonerBoost';
  return `https://ddragon.leagueoflegends.com/cdn/${MH.ddVer}/img/spell/${name}.png`;
};

/** Rune-tree icon URL (DDragon) */
MH.runeIcon = (id) => {
  const tree = MH.RUNE_TREES[id];
  return tree
    ? `https://ddragon.leagueoflegends.com/cdn/${MH.ddVer}/img/perk-images/Styles/${tree.img}.png`
    : '';
};

// ─── Display formatters ────────────────────────────────────────────

/** Format seconds → MM:SS */
MH.formatTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = String(seconds % 60).padStart(2, '0');
  return `${m}:${s}`;
};

/** Format KDA ratio, handling 0 deaths → 'Perfect' */
MH.formatKda = (kills, deaths, assists) => {
  return deaths === 0 ? 'Perfect' : ((kills + assists) / deaths).toFixed(2);
};

/** Resolve queue ID → display name */
MH.queueName = (id) => {
  for (const key of Object.keys(MH.QUEUES)) {
    if (MH.QUEUES[key].id === id) return MH.QUEUES[key].name;
  }
  return `Q${id}`;
};

// ─── Streak calculator ─────────────────────────────────────────────

/**
 * Calculate current win/loss streak from an ordered game list.
 * Positive = wins, negative = losses, 0 = no streak.
 */
MH.calcStreak = (games) => {
  let streak = 0;
  let direction = 0;

  for (const game of games) {
    const player = game?.participants?.[0];
    if (!player) break;

    const team = game.teams?.find((t) => t.teamId === player.teamId);
    if (!team) break;

    const won = team.win === 'Win';

    if (direction === 0) {
      direction = won ? 1 : -1;
      streak = 1;
    } else if ((won && direction > 0) || (!won && direction < 0)) {
      streak++;
    } else {
      break;
    }
  }

  return direction * streak;
};

// ─── Stats aggregator ──────────────────────────────────────────────

/** Aggregate stats across all loaded games into a summary object */
MH.calcStats = (games) => {
  let totalWins = 0;
  let totalLosses = 0;
  let totalKills = 0;
  let totalDeaths = 0;
  let totalAssists = 0;
  let totalCs = 0;
  let totalDuration = 0;
  let totalDmg = 0;
  let totalGold = 0;
  let totalVis = 0;
  let totalCc = 0;

  const champMap = new Map();

  for (const game of games) {
    if (!game) continue;

    const player = game.participants?.[0];
    if (!player) continue;

    const team = game.teams?.find((t) => t.teamId === player.teamId);
    if (!team) continue;

    const won = team.win === 'Win';
    totalWins += won ? 1 : 0;
    totalLosses += won ? 0 : 1;

    const s = player.stats ?? {};
    const k = s.kills ?? 0;
    const d = s.deaths ?? 0;
    const a = s.assists ?? 0;
    const cs = (s.minionsKilled ?? s.totalMinionsKilled ?? 0) + (s.neutralMinionsKilled ?? 0);
    const gold = s.goldEarned ?? 0;

    totalKills += k;
    totalDeaths += d;
    totalAssists += a;
    totalCs += cs;
    totalDuration += game.gameDuration ?? 0;
    totalDmg += s.totalDamageDealtToChampions ?? 0;
    totalGold += gold;
    totalVis += s.visionScore ?? 0;
    totalCc += s.timeCCingOthers ?? 0;

    const cid = game.championId ?? player.championId;
    if (cid) {
      if (!champMap.has(cid)) {
        champMap.set(cid, { id: cid, wins: 0, losses: 0, kills: 0, deaths: 0, assists: 0 });
      }
      const c = champMap.get(cid);
      if (won) c.wins++; else c.losses++;
      c.kills += k;
      c.deaths += d;
      c.assists += a;
    }
  }

  const totalGames = totalWins + totalLosses;
  const streak = MH.calcStreak(games);

  // Best champion (≥3 games, highest WR)
  let best = null;
  let bestAny = null;

  for (const c of champMap.values()) {
    const played = c.wins + c.losses;
    const wr = (c.wins / played) * 100;

    if (!bestAny || played > bestAny.total) {
      bestAny = { id: c.id, total: played, wr: Math.round(wr) };
    }
    if (played >= 3 && (!best || wr > best.wr)) {
      best = { id: c.id, total: played, wr: Math.round(wr) };
    }
  }

  if (!best) best = bestAny;

  const streakStr = streak > 0
    ? `W${streak}`
    : streak < 0
      ? `L${Math.abs(streak)}`
      : '-';

  return {
    wins: totalWins,
    wr: totalGames ? ((totalWins / totalGames) * 100).toFixed(1) : '0',
    kda: totalDeaths ? ((totalKills + totalAssists) / totalDeaths).toFixed(2) : 'Perfect',
    total: totalGames,
    avgDur: totalGames ? MH.formatTime(Math.round(totalDuration / totalGames)) : '0:00',
    avgDmg: totalGames ? Math.round(totalDmg / totalGames) : 0,
    cspm: totalGames ? ((totalCs / (totalDuration || 1)) * 60).toFixed(1) : '0',
    gpm: totalGames ? Math.round(totalGold / (totalDuration / 60)) : 0,
    avgCc: totalGames ? (totalCc / totalGames).toFixed(0) : '0',
    vpm: totalGames ? ((totalVis / (totalDuration || 1)) * 60).toFixed(1) : '0',
    streak,
    streakStr,
    best,
  };
};

/**
 * @name KO3-MatchHistory — Render
 * @description HTML generators for the match list, stats bar, sparkline, and expanded view
 */

// ─── Single match row (collapsed) ──────────────────────────────────

/** Render one match in the list (collapsed or expanded) */
MH.renderMatch = (game, index) => {
  if (!game) return '';

  const player = game.participants?.[0];
  if (!player) return '';

  const team = game.teams?.find((t) => t.teamId === player.teamId);
  if (!team) return '';

  const won = team.win === 'Win';
  const cid = game.championId ?? player.championId;
  const s = player.stats ?? {};

  const k = s.kills ?? 0;
  const d = s.deaths ?? 0;
  const a = s.assists ?? 0;
  const cs = (s.minionsKilled ?? s.totalMinionsKilled ?? 0) + (s.neutralMinionsKilled ?? 0);
  const name = MH.champNameCache.get(cid) ?? `#${cid}`;

  const items = [];
  for (let i = 0; i <= 6; i++) items.push(s[`item${i}`] ?? 0);

  const isExpanded = MH.expandedIdx === index;

  let html = `<div class="mh-m ${won ? 'w' : 'l'}${isExpanded ? ' exp' : ''}" data-idx="${index}">`;

  // Champion icon
 html += `<div class="mh-c"><img src="${KO3Utils.LCU.championIcon(cid)}" alt=""></div>`;

  // Name + queue + date
  html += `<div class="mh-i"><div class="mh-n">${KO3Utils.escapeHtml(name)}</div>`;
  html += `<div class="mh-mt"><span class="mh-qt">${KO3Utils.escapeHtml(MH.queueName(game.queueId))}</span>`;
  html += game.gameCreation ? new Date(game.gameCreation).toLocaleDateString() : '';
  html += '</div></div>';

  // KDA
  html += `<div class="mh-k"><div class="kv">${k}/${d}/${a}</div>`;
  html += `<div class="kr">${MH.formatKda(k, d, a)} KDA</div></div>`;

  // CS + duration
  html += `<div class="mh-cs"><div class="cv">${cs}</div>`;
  html += `<div class="cd">${MH.formatTime(game.gameDuration ?? 0)}</div></div>`;

  // Items
  html += `<div class="mh-it">${items.map((id) => {
    const url = MH.itemIcon(id);
    return url
      ? `<div class="i${MH.TRINKET_IDS.has(id) ? ' t' : ''}"><img src="${url}" alt="" onerror="this.style.opacity=0"></div>`
      : '<div class="i"></div>';
  }).join('')}</div>`;

  // Result label
  html += `<div class="mh-r ${won ? 'w' : 'l'}">${won ? 'VICTORY' : 'DEFEAT'}</div>`;
  html += '</div>';

  // ─── Expanded details ──────────────────────────────────────────
  if (isExpanded) {
    html += MH.renderExpanded(game, player, team, s);
  }

  return html;
};

// ─── Expanded view ─────────────────────────────────────────────────

/** Render the expanded detail section for a match */
MH.renderExpanded = (game, player, team, s) => {
  const teamDmg = game._teamDmg || s.totalDamageDealtToChampions || 1;
  const myDmg = s.totalDamageDealtToChampions || 0;
  const teamGold = game._teamGold || s.goldEarned || 1;
  const myGold = s.goldEarned || 0;
  const teamVis = game._teamVis || s.visionScore || 1;
  const myVis = s.visionScore || 0;

  const spell1 = player.spell1Id || 0;
  const spell2 = player.spell2Id || 0;
  const primaryPerk = s.perks?.perkStyle || 0;
  const secondaryPerk = s.perks?.perkSubStyle || 0;

  const dmgMagic = s.magicDamageDealtToChampions || 0;
  const dmgPhys = s.physicalDamageDealtToChampions || 0;
  const dmgTrue = s.trueDamageDealtToChampions || 0;
  const dmgTotal = dmgMagic + dmgPhys + dmgTrue || 1;

  const goldEff = s.goldSpent ? Math.round((s.goldSpent / (myGold || 1)) * 100) : 0;

  const pct = (val, total) => Math.round((val / total) * 100);
  const barPct = (val, total) => `${Math.min(100, (val / total) * 500)}%`;
  const dm = (v) => v.toLocaleString();

  let html = '<div class="mh-m-exp">';

  // Row 1: Spells, runes, damage/gold/vision bars
  html += '<div class="mh-m-exp-row">';

  html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">Spells</div>`;
  html += '<div class="mh-m-exp-spells">';
  html += `<img src="${MH.spellIcon(spell1)}" title="${MH.SPELLS[spell1] || ''}" onerror="this.style.display='none'">`;
  html += `<img src="${MH.spellIcon(spell2)}" title="${MH.SPELLS[spell2] || ''}" onerror="this.style.display='none'">`;
  html += '</div></div>';

  if (primaryPerk) {
    html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">Runes</div>`;
    html += '<div class="mh-m-exp-spells">';
    html += `<img src="${MH.runeIcon(primaryPerk)}" title="${MH.RUNE_TREES[primaryPerk]?.name || ''}" onerror="this.style.opacity=0">`;
    if (secondaryPerk) {
      html += `<img src="${MH.runeIcon(secondaryPerk)}" title="${MH.RUNE_TREES[secondaryPerk]?.name || ''}" onerror="this.style.opacity=0">`;
    }
    html += '</div></div>';
  }

  // Damage share
  html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">Damage</div>`;
  html += `<div class="mh-m-exp-bar"><div class="mh-m-exp-bar-f" style="width:${barPct(myDmg, teamDmg)}"></div></div>`;
  html += `<div class="mh-m-exp-val">${dm(myDmg)} <span class="mh-m-exp-pct">(${pct(myDmg, teamDmg)}%)</span></div></div>`;

  // Gold share
  html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">Gold</div>`;
  html += `<div class="mh-m-exp-bar"><div class="mh-m-exp-bar-f gold" style="width:${barPct(myGold, teamGold)}"></div></div>`;
  html += `<div class="mh-m-exp-val">${dm(myGold)} <span class="mh-m-exp-pct">(${pct(myGold, teamGold)}%)</span></div></div>`;

  // Vision share
  html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">Vision</div>`;
  html += `<div class="mh-m-exp-bar"><div class="mh-m-exp-bar-f vis" style="width:${barPct(myVis, teamVis)}"></div></div>`;
  html += `<div class="mh-m-exp-val">${myVis} <span class="mh-m-exp-pct">(${pct(myVis, teamVis)}%)</span></div></div>`;

  html += '</div>'; // end row 1

  // Row 2: KDA context, support stats, damage types
  html += '<div class="mh-m-exp-row">';

  const fba = s.firstBloodAssist ? 'First Blood · ' : '';
  const fta = s.firstTowerAssist ? 'First Tower · ' : '';
  const laneCs = s.totalMinionsKilled ?? s.minionsKilled ?? 0;
  const jungleCs = s.neutralMinionsKilled ?? 0;

  html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">KDA Context</div>`;
  html += `<div class="mh-m-exp-kda">${s.kills || 0} / ${s.deaths || 0} / ${s.assists || 0}</div>`;
  html += `<div class="mh-m-exp-kda-sub">${fba}${fta}CS ${(s.minionsKilled ?? s.totalMinionsKilled ?? 0) + (s.neutralMinionsKilled ?? 0)} (${MH.formatTime(game.gameDuration ?? 0)}) · ${laneCs} lane + ${jungleCs} jungle</div></div>`;

  html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">Support</div>`;
  html += `<div class="mh-m-exp-kda-sub">Heal ${dm(s.totalHeal || 0)} · CC ${s.timeCCingOthers || 0}s · Wards ${s.wardsPlaced || 0} (${s.visionWardsBoughtInGame || 0} pink) · Killed ${s.wardsKilled || 0}</div></div>`;

  html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">Dmg Types</div>`;
  html += '<div class="mh-m-exp-bar">';
  html += `<div class="mh-m-exp-bar-f vis" style="width:${(dmgMagic / dmgTotal) * 100}%;background:#9b59b6"></div>`;
  html += `<div class="mh-m-exp-bar-f" style="width:${(dmgPhys / dmgTotal) * 100}%;background:#e74c3c"></div>`;
  html += `<div class="mh-m-exp-bar-f gold" style="width:${(dmgTrue / dmgTotal) * 100}%"></div></div>`;
  html += `<div class="mh-m-exp-val"><span style="color:#9b59b6">M ${dm(dmgMagic)}</span> · <span style="color:#e74c3c">P ${dm(dmgPhys)}</span> · <span style="color:#e9c46a">T ${dm(dmgTrue)}</span></div></div>`;

  html += '</div>'; // end row 2

  // Row 3: Items + details
  html += '<div class="mh-m-exp-row">';

  const items = [];
  for (let i = 0; i <= 6; i++) items.push(s[`item${i}`] ?? 0);

  html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">Items</div>`;
  html += '<div class="mh-m-exp-items">';
  items.forEach((id) => {
    if (id) html += `<img src="${MH.itemIcon(id)}" class="mh-m-exp-item" onerror="this.style.opacity=0">`;
  });
  html += '</div></div>';

  html += `<div class="mh-m-exp-sec"><div class="mh-m-exp-lbl">Details</div>`;
  html += `<div class="mh-m-exp-kda-sub">DMG Taken ${dm(s.totalDamageTaken || 0)} · Self Mit ${dm(s.damageSelfMitigated || 0)} · Crit ${s.largestCriticalStrike || 0}</div>`;
  html += `<div class="mh-m-exp-kda-sub" style="margin-top:3px">Turret Dmg ${dm(s.damageDealtToTurrets || 0)} · Gold Eff ${goldEff}% · Longest Life ${MH.formatTime(s.longestTimeSpentLiving || 0)}</div></div>`;

  html += '</div>'; // end row 3

  html += '</div>'; // end mh-m-exp
  return html;
};

// ─── Main panel ───────────────────────────────────────────────────

/** Render the full panel header, filters, stats bar, sparkline, and match list */
MH.render = () => {
  const inner = panel.getInner();
  if (!inner) return;

  let html = '<div class="mh-h"><h2>Match History</h2><button class="mh-x" id="mh-x">&times;</button></div>';

  // Period + game count selector
  html += '<div class="mh-period" id="mh-period">';
  for (const [key, period] of Object.entries(MH.PERIODS)) {
    html += `<button class="mh-p-btn${MH.CFG.period === key ? ' on' : ''}" data-period="${key}">${period.name}</button>`;
  }
  html += '<div class="mh-vr"></div>';
  for (const n of MH.GAME_COUNTS) {
    html += `<button class="mh-p-btn${MH.CFG.games === n ? ' on' : ''}" data-games="${n}">${n}</button>`;
  }
  html += '</div>';

  // Stats bar (placeholder — populated by load())
  html += '<div class="mh-s" id="mh-s"><div class="mh-st"><div class="n cg">...</div><div class="t">Loading</div></div></div>';
  html += '<div class="mh-spark" id="mh-spark"></div>';

  // Queue filter bar
  html += '<div class="mh-tb">';
  for (const [key, q] of Object.entries(MH.QUEUES)) {
    html += `<button class="mh-q${MH.CFG.queue === key ? ' on' : ''}" data-q="${key}">${KO3Utils.escapeHtml(q.name)}</button>`;
  }
  html += '</div>';

  // Match list (placeholder)
  html += '<div class="mh-l" id="mh-l"><div class="mh-msg ld">Loading matches</div></div>';

  inner.innerHTML = html;
  MH.bindFilterEvents();
};

// ─── Sparkline ────────────────────────────────────────────────────

/** Render a win/loss sparkline for the last 20 matches */
MH.renderSparkline = (games) => {
  const el = document.getElementById('mh-spark');
  if (!el) return;

  const last20 = games.slice(0, 20);
  let html = `<div class="mh-spark-l">Last ${last20.length}</div>`;

  for (const game of last20) {
    const player = game?.participants?.[0];
    if (!player) continue;
    const team = game.teams?.find((t) => t.teamId === player.teamId);
    const won = team?.win === 'Win';
    html += `<div class="mh-spark-d ${won ? 'w' : 'l'}" title="${won ? 'Win' : 'Loss'}"></div>`;
  }

  el.innerHTML = html;
};

// ─── Event binding ────────────────────────────────────────────────

/** Attach click handlers to the filter buttons in the rendered panel */
MH.bindFilterEvents = () => {
  document.getElementById('mh-x')?.addEventListener('click', () => panel.close());

  const inner = panel.getInner();
  if (!inner) return;

  inner.querySelectorAll('[data-q]').forEach((btn) => {
    btn.addEventListener('click', () => {
      MH.CFG.queue = btn.dataset.q;
      MH.expandedIdx = null;
      MH.load();
    });
  });

  inner.querySelectorAll('[data-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      MH.CFG.period = btn.dataset.period;
      MH.expandedIdx = null;
      MH.load();
    });
  });

  inner.querySelectorAll('[data-games]').forEach((btn) => {
    btn.addEventListener('click', () => {
      MH.CFG.games = Number(btn.dataset.games);
      MH.expandedIdx = null;
      MH.load();
    });
  });
};

/** Attach click handlers to the match list rows (expand/collapse) */
MH.bindMatchEvents = () => {
  const list = document.getElementById('mh-l');
  if (!list) return;

  list.querySelectorAll('.mh-m').forEach((el) => {
    el.addEventListener('click', () => {
      const idx = Number(el.dataset.idx);
      MH.expandedIdx = MH.expandedIdx === idx ? null : idx;

      list.querySelectorAll('.mh-m').forEach((m) => m.classList.remove('exp'));
      list.querySelectorAll('.mh-m-exp').forEach((e) => e.remove());

      if (MH.expandedIdx !== null) {
        el.classList.add('exp');
        const match = MH.renderMatch(MH.matchData[MH.expandedIdx], MH.expandedIdx);
        const expandedHtml = match.match(/<div class="mh-m-exp">[\s\S]*?<\/div><\/div>$/);
        if (expandedHtml) el.insertAdjacentHTML('afterend', expandedHtml[0]);
      }
    });
  });
};

/**
 * @name KO3-MatchHistory — Data
 * @description LCU API calls, champion-name resolution, and the main load orchestrator
 */

// ─── API helpers ───────────────────────────────────────────────────

/** Fetch the DDragon versions list and cache the latest */
MH.loadDdVer = async () => {
  if (MH.ddVerPromise) return MH.ddVerPromise;

  MH.ddVerPromise = (async () => {
    try {
      const response = await fetch('https://ddragon.leagueoflegends.com/api/versions.json');
      if (response.ok) {
        const versions = await response.json();
        if (versions?.[0]) MH.ddVer = versions[0];
      }
    } catch {
      // Fall back to default version
    } finally {
      MH.ddVerPromise = null;
    }
  })();

  return MH.ddVerPromise;
};

/** Get a champion name from the LCU static-data endpoint */
MH.getChampName = async (championId) => {
  if (championId == null) return '';
  if (MH.champNameCache.has(championId)) return MH.champNameCache.get(championId);

  try {
    const data = await KO3Utils.LCU.fetch(`/lol-game-data/assets/v1/champions/${championId}.json`);
    const name = data.name ?? data.alias ?? '';
    MH.champNameCache.set(championId, name);
    return name;
  } catch {
    return '';
  }
};

/** Fetch match-history list for a given summoner */
MH.getMatches = async (puuid, start, end) => {
  if (puuid == null) throw new Error('Invalid PUUID');

  const cacheKey = `${puuid}_${start}_${end}_${MH.CFG.queue}`;
  const cached = MH.cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 300_000) return cached.data;

  const url = `/lol-match-history/v1/products/lol/${puuid}/matches?begIndex=${start}&endIndex=${end}`;
  const data = await KO3Utils.LCU.fetch(url);

  MH.cache.set(cacheKey, { data, ts: Date.now() });
  return data;
};

/** Fetch detailed game data from the LCU API */
MH.getGameDetail = async (gameId) => {
  const cacheKey = `gd_${gameId}`;
  const cached = MH.cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 300_000) return cached.data;

  try {
    const data = await KO3Utils.LCU.fetch(`/lol-match-history/v1/games/${gameId}`);
    MH.cache.set(cacheKey, { data, ts: Date.now() });
    return data;
  } catch {
    return null;
  }
};

// ─── Main data-loading orchestrator ───────────────────────────────

/** Fetch matches, enrich with team stats, compute aggregates, and render */
MH.load = async () => {
  const list = document.getElementById('mh-l');
  const statsBar = document.getElementById('mh-s');

  if (list) list.innerHTML = '<div class="mh-msg ld">Loading matches</div>';

  // Toggle active filter buttons
  document.querySelectorAll('[data-period]').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.period === MH.CFG.period);
  });
  document.querySelectorAll('[data-games]').forEach((btn) => {
    btn.classList.toggle('on', Number(btn.dataset.games) === MH.CFG.games);
  });

  try {
    // Resolve summoner PUUID if needed
    if (!MH.puuid) {
      const summoner = await KO3Utils.LCU.getSummoner();
      if (!summoner?.puuid) throw new Error('No summoner data');
      MH.puuid = summoner.puuid;
    }

    // Fetch match list
    const data = await MH.getMatches(MH.puuid, 0, MH.CFG.games - 1);
    if (!data?.games?.games) {
      if (list) list.innerHTML = '<div class="mh-msg">No match history</div>';
      return;
    }

    let games = data.games.games;

    // Apply period filter
    if (MH.CFG.period !== 'all') {
      const cutoff = Date.now() - MH.PERIODS[MH.CFG.period].ms;
      games = games.filter((g) => (g.gameCreation ?? 0) >= cutoff);
    }

    // Apply queue filter
    if (MH.CFG.queue !== 'all') {
      const qid = MH.QUEUES[MH.CFG.queue]?.id;
      if (qid) games = games.filter((g) => g.queueId === qid);
    }

    MH.matchData = games;

    // Enrich each game with team-level aggregates from game details
    const batchSize = 10;
    for (let i = 0; i < games.length; i += batchSize) {
      const batch = games.slice(i, i + batchSize);
      await Promise.all(batch.map(async (game) => {
        if (!game?.gameId) return;

        const detail = await MH.getGameDetail(game.gameId);
        if (!detail?.participants) return;

        const myTeamId = game.participants?.[0]?.teamId;
        const teammates = detail.participants.filter((p) => p.teamId === myTeamId);
        const sum = (field) => teammates.reduce((acc, p) => acc + (p.stats?.[field] ?? 0), 0);

        game._teamKills = sum('kills');
        game._teamDmg = sum('totalDamageDealtToChampions');
        game._teamGold = sum('goldEarned');
        game._teamVis = sum('visionScore');
      }));
    }

    // Compute stats
    const stats = MH.calcStats(games);

    // Preload champion names
    const champIds = new Set();
    games.forEach((g) => {
      const id = g.championId ?? g.participants?.[0]?.championId;
      if (id) champIds.add(id);
    });
    await Promise.all(Array.from(champIds).map((id) => MH.getChampName(id)));

    // Render sparkline + match count
    MH.renderSparkline(games);

    const sparkEl = document.getElementById('mh-spark');
    if (sparkEl) {
      sparkEl.insertAdjacentHTML(
        'afterend',
        `<div class="mh-count">Showing <b>${games.length}</b> of <b>${data.games.games.length}</b> matches</div>`,
      );
    }

    // Render stats bar
    if (statsBar) MH.renderStats(stats);

    // Render match list
    if (list) {
      if (!games.length) {
        list.innerHTML = '<div class="mh-msg">No matches for this period</div>';
        return;
      }
      list.innerHTML = games.map((g, i) => MH.renderMatch(g, i)).join('');
      MH.bindMatchEvents();
    }
  } catch (error) {
    LOG.error('Load failed', error);
    if (list) list.innerHTML = '<div class="mh-msg">Failed to load</div>';
  }
};

/** Render the stats-bar HTML with computed aggregates */
MH.renderStats = (stats) => {
  const sb = document.getElementById('mh-s');
  if (!sb) return;

  let bestName = '-';
  if (stats.best) {
    const cached = MH.champNameCache.get(stats.best.id);
    if (cached) {
      bestName = cached;
    } else {
      MH.getChampName(stats.best.id).then((name) => {
        const el = document.getElementById('mh-best');
        if (el) el.textContent = name || `#${stats.best.id}`;
      });
    }
  }

  const wrColor = parseFloat(stats.wr) >= 50 ? 'cw' : 'cl';
  const streakClass = stats.streak > 0 ? 'cw' : stats.streak < 0 ? 'cl' : 'cg';

  sb.innerHTML = `
    <div class="mh-s-row">
      <div class="mh-st"><div class="n cg">${stats.total}</div><div class="t">Games</div></div>
      <div class="mh-st"><div class="n cw">${stats.wins}</div><div class="t">Wins</div></div>
      <div class="mh-st"><div class="n ${wrColor}">${stats.wr}%</div><div class="t">WR</div></div>
      <div class="mh-st"><div class="n ck">${stats.kda}</div><div class="t">KDA</div></div>
      <div class="mh-st"><div class="n ck">${stats.avgCc}s</div><div class="t">CC</div></div>
      <div class="mh-st"><div class="n ck">${stats.cspm}</div><div class="t">CS/m</div></div>
    </div>
    <div class="mh-s-row">
      <div class="mh-st"><div class="n cg">${stats.gpm}</div><div class="t">GPM</div></div>
      <div class="mh-st"><div class="n ck">${(stats.avgDmg || 0).toLocaleString()}</div><div class="t">DMG</div></div>
      <div class="mh-st"><div class="n cg">${stats.vpm}</div><div class="t">V/min</div></div>
      <div class="mh-st"><div class="n cg">${stats.avgDur}</div><div class="t">Duration</div></div>
      <div class="mh-st"><div class="n ${streakClass}">${stats.streakStr}</div><div class="t">Streak</div></div>
      <div class="mh-st"><div class="n cg" id="mh-best" style="font-size:11px">${bestName}</div><div class="t">Best</div></div>
    </div>`;
};



/**
 * @name KO3-MatchHistory
 * @author Kingof30
 * @description Detailed match history with stats, KDA, items, and performance tracking
 * @dependencies KO3-Utils
 */
(function initMatchHistory() {
  const LOG = KO3Utils.createLogger('[KO3-MatchHistory]');


  /** Overlay panel instance */
  panel = KO3Utils.Panel('mh', 'mh');

  /** Navigation-bar button */
  const nav = KO3Utils.NavButton(
    'mh',
    'data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\'%3E%3Cpath d=\'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14zM7 12h2v5H7zm4-3h2v8h-2zm4-3h2v11h-2z\'/%3E%3C/svg%3E',
  );

  // ─── Panel lifecycle ───────────────────────────────────────────

  function openPanel() {
    panel.open();
    MH.expandedIdx = null;
    MH.render();
    MH.load();
  }

  function closePanel() {
    panel.close();
  }

  /** Phase handler for nav visibility */
  function handlePhaseNav(phase) {
    const showIn = new Set(['None', 'Lobby', 'Matchmaking']);
    if (showIn.has(phase)) {
      nav.setup(() => openPanel());
    } else {
      nav.remove();
      if (panel.getIsOpen()) closePanel();
    }
  }

  // ─── Bootstrap ─────────────────────────────────────────────────

  async function init() {
    try {
      await KO3Utils.waitForBridge();
      LOG.info('Bridge ready');
    } catch (error) {
      LOG.error('No bridge', error);
      return;
    }

    KO3Utils.injectCss('ko3-mh-css', '//plugins/KO3-MatchHistory/style.css');
    MH.loadDdVer();

    // Expose panel toggle globally for the nav button
    window.toggleMatchHistory = () => panel.toggle();
    window.openMatchHistory = openPanel;

    // Listen for phase changes to show/hide nav button
    const bridge = window.__roseBridge;
    bridge.subscribe('phase-change', (data) => {
      const phase = data?.phase ?? data;
      if (typeof phase === 'string') handlePhaseNav(phase);
    });

    // Show nav in the initial lobby state
    handlePhaseNav('None');
  }

  KO3Utils.boot(init);
})();

