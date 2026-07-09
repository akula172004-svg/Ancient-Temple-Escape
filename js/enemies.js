/**
 * Враги — стражи храма с разным поведением и финальный босс
 * Движение строго по сетке лабиринта, без прохода сквозь стены
 */

const ENEMY_SIZE = 28;
const BOSS_SIZE = 48;
const BOSS_MAX_HP = 5;
const BOSS_ATTACK_RANGE = 52;
const BOSS_ATTACK_COOLDOWN = 700;
const MAX_ENEMY_SPAWN_ATTEMPTS = 30;

// Отталкивание стражей: игрок не может их убить, но может оглушить и отбросить,
// чтобы гарантированно пройти мимо (нажатие Пробела)
const REPEL_RANGE = 78;
const REPEL_COOLDOWN = 900;
const REPEL_STUN = 2400;
const REPEL_PUSH_CELLS = 3;
let lastRepel = 0;

// TILE_SIZE объявлен в game.js (загружается позже), поэтому вычисляем при вызове
function enemySafeSpawnDist() {
  return TILE_SIZE * 5;
}

const ENEMY_DEFS = {
  patrol: { label: 'Страж', speed: 0.95, color: '#5a4a3a', eye: '#ff3333', range: 0 },
  chaser: { label: 'Преследователь', speed: 1.0, color: '#6a3a2a', eye: '#ff6600', range: 95 },
  sentry: { label: 'Часовой', speed: 0.8, color: '#4a4a5a', eye: '#ffaa00', range: 70, lungeSpeed: 1.4 },
  wanderer: { label: 'Блуждающий', speed: 0.85, color: '#5a5a4a', eye: '#cc4444', range: 0 },
  boss: { label: 'Хранитель', speed: 1.1, color: '#3a2a1a', eye: '#ff2200', range: 140 },
};

let enemies = [];
let boss = null;
let bossDefeated = false;
let lastBossAttack = 0;
let cachedEnemies = {};

function getMinSpawnDistTiles(level) {
  return 8 + level.id * 2;
}

function getEnemySpeedMultiplier(levelId) {
  if (levelId <= 2) return 0.8;
  if (levelId === 3) return 0.72;
  if (levelId === 4) return 0.65;
  return 0.6;
}

function canEnemyWalk(col, row, doorOpen) {
  if (col < 0 || row < 0 || col >= mazeWidth || row >= mazeHeight) return false;
  const tile = maze[row][col];
  if (tile === TILE.WALL) return false;
  if (tile === TILE.DOOR && !doorOpen) return false;
  return true;
}

function isCorridorCellForEnemy(col, row, doorOpen) {
  if (!canEnemyWalk(col, row, doorOpen)) return false;
  let neighbors = 0;
  for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    if (canEnemyWalk(col + dc, row + dr, doorOpen)) neighbors++;
  }
  return neighbors <= 2;
}

function isNearSpawn(col, row, minDist) {
  const spCol = Math.floor(spawnPoint.x / TILE_SIZE);
  const spRow = Math.floor(spawnPoint.y / TILE_SIZE);
  return Math.abs(col - spCol) + Math.abs(row - spRow) < minDist;
}

function enemyGridPos(entity) {
  return {
    col: Math.floor(entity.x / TILE_SIZE),
    row: Math.floor(entity.y / TILE_SIZE),
  };
}

function playerGridPos() {
  return {
    col: Math.floor(player.x / TILE_SIZE),
    row: Math.floor(player.y / TILE_SIZE),
  };
}

function cellCenter(col, row) {
  return {
    x: col * TILE_SIZE + TILE_SIZE / 2,
    y: row * TILE_SIZE + TILE_SIZE / 2,
  };
}

function enemyBfsPath(start, end) {
  if (start.col === end.col && start.row === end.row) return [start];

  const h = mazeHeight;
  const w = mazeWidth;
  const key = (c, r) => `${c},${r}`;
  const queue = [start];
  const visited = new Set([key(start.col, start.row)]);
  const parent = new Map();

  while (queue.length) {
    const cur = queue.shift();
    const curKey = key(cur.col, cur.row);

    if (cur.col === end.col && cur.row === end.row) {
      const path = [cur];
      let k = curKey;
      while (parent.has(k)) {
        const prev = parent.get(k);
        path.unshift(prev);
        k = key(prev.col, prev.row);
      }
      return path;
    }

    for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      const nk = key(nc, nr);
      if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
      if (visited.has(nk)) continue;
      if (!canEnemyWalk(nc, nr, doorOpen)) continue;
      visited.add(nk);
      parent.set(nk, cur);
      queue.push({ col: nc, row: nr });
    }
  }
  return null;
}

function getPathLengthToPlayer(entity) {
  const path = enemyBfsPath(enemyGridPos(entity), playerGridPos());
  return path ? path.length - 1 : Infinity;
}

function canEnemyReachPlayer(entity) {
  return getPathLengthToPlayer(entity) < Infinity;
}

function canEnemyHitPlayer(entity, hitDist) {
  const pathLen = getPathLengthToPlayer(entity);
  if (pathLen > 1) return false;
  return Math.hypot(player.x - entity.x, player.y - entity.y) < hitDist;
}

function snapEnemyToGrid(entity, size = ENEMY_SIZE) {
  const pos = enemyGridPos(entity);
  const center = cellCenter(pos.col, pos.row);
  if (canEnemyMoveTo(center.x, center.y, size)) {
    entity.x = center.x;
    entity.y = center.y;
  }
}

function canEnemyMoveTo(x, y, size = ENEMY_SIZE) {
  const half = size / 2 - 3;
  const corners = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ];
  for (const [cx, cy] of corners) {
    const col = Math.floor(cx / TILE_SIZE);
    const row = Math.floor(cy / TILE_SIZE);
    if (!canEnemyWalk(col, row, doorOpen)) return false;
  }
  return true;
}

function moveEnemyToCell(entity, targetCol, targetRow, speed, size = ENEMY_SIZE) {
  const start = enemyGridPos(entity);
  if (start.col === targetCol && start.row === targetRow) return true;

  const path = enemyBfsPath(start, { col: targetCol, row: targetRow });
  if (!path || path.length < 2) return false;

  const next = path[1];
  const center = cellCenter(next.col, next.row);
  const dx = center.x - entity.x;
  const dy = center.y - entity.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.01) return true;

  const step = Math.min(speed, dist, TILE_SIZE * 0.5);
  const nx = entity.x + (dx / dist) * step;
  const ny = entity.y + (dy / dist) * step;

  if (canEnemyMoveTo(nx, ny, size)) {
    entity.x = nx;
    entity.y = ny;
    if (Math.abs(dx) > Math.abs(dy)) entity.dir = dx > 0 ? 'right' : 'left';
    else entity.dir = dy > 0 ? 'down' : 'up';
    return Math.hypot(center.x - entity.x, center.y - entity.y) < 2;
  }
  return false;
}

function isEnemyNearPoint(x, y, minDist) {
  for (const e of enemies) {
    if (Math.hypot(e.x - x, e.y - y) < minDist) return true;
  }
  if (boss && !bossDefeated && Math.hypot(boss.x - x, boss.y - y) < minDist) return true;
  return false;
}

function findSafeRespawnPoint() {
  const spCol = Math.floor(spawnPoint.x / TILE_SIZE);
  const spRow = Math.floor(spawnPoint.y / TILE_SIZE);
  const start = { col: spCol, row: spRow };
  const visited = new Set([`${spCol},${spRow}`]);
  const queue = [start];
  const candidates = [];

  while (queue.length) {
    const cur = queue.shift();
    const center = cellCenter(cur.col, cur.row);

    if (canEnemyWalk(cur.col, cur.row, doorOpen)
        && !isEnemyNearPoint(center.x, center.y, enemySafeSpawnDist())) {
      const nearestEnemyDist = Math.min(
        ...enemies.map(e => Math.hypot(e.homeX - center.x, e.homeY - center.y)),
        boss && !bossDefeated ? Math.hypot(boss.x - center.x, boss.y - center.y) : Infinity,
        Infinity,
      );
      candidates.push({
        x: center.x,
        y: center.y,
        dist: Math.abs(cur.col - spCol) + Math.abs(cur.row - spRow),
        enemyDist: nearestEnemyDist,
      });
    }

    for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nc = cur.col + dc;
      const nr = cur.row + dr;
      const k = `${nc},${nr}`;
      if (nc < 0 || nr < 0 || nc >= mazeWidth || nr >= mazeHeight) continue;
      if (visited.has(k)) continue;
      if (!canEnemyWalk(nc, nr, doorOpen)) continue;
      visited.add(k);
      queue.push({ col: nc, row: nr });
    }
  }

  candidates.sort((a, b) => a.dist - b.dist || b.enemyDist - a.enemyDist);
  if (candidates.length) return { x: candidates[0].x, y: candidates[0].y };
  return { x: spawnPoint.x, y: spawnPoint.y };
}

function findPatrolRoutes(doorOpen, level) {
  const routes = [];
  const usedCells = new Set();
  const minLen = 4;
  const spawnDist = getMinSpawnDistTiles(level);

  function commitRun(run) {
    if (run.length < minLen) return;
    if (run.some(c => isNearSpawn(c.col, c.row, spawnDist))) return;
    if (run.some(c => usedCells.has(`${c.col},${c.row}`))) return;
    run.forEach(c => usedCells.add(`${c.col},${c.row}`));
    routes.push(run);
  }

  for (let row = 1; row < mazeHeight - 1; row++) {
    let run = [];
    for (let col = 1; col < mazeWidth - 1; col++) {
      if (isCorridorCellForEnemy(col, row, doorOpen)) run.push({ col, row });
      else { commitRun(run); run = []; }
    }
    commitRun(run);
  }

  for (let col = 1; col < mazeWidth - 1; col++) {
    let run = [];
    for (let row = 1; row < mazeHeight - 1; row++) {
      if (isCorridorCellForEnemy(col, row, doorOpen)) run.push({ col, row });
      else { commitRun(run); run = []; }
    }
    commitRun(run);
  }

  return routes;
}

function createPatrolEnemy(route, speed, type) {
  const waypoints = route.map(c => cellCenter(c.col, c.row));
  return {
    type,
    x: waypoints[0].x,
    y: waypoints[0].y,
    renderX: waypoints[0].x,
    renderY: waypoints[0].y,
    waypoints,
    wpIndex: waypoints.length > 1 ? 1 : 0,
    wpDir: 1,
    speed,
    dir: 'right',
    homeX: waypoints[0].x,
    homeY: waypoints[0].y,
    wanderTimer: 0,
    lungeUntil: 0,
  };
}

function createWanderingEnemy(cell, speed, type) {
  const center = cellCenter(cell.col, cell.row);
  return {
    type,
    x: center.x,
    y: center.y,
    renderX: center.x,
    renderY: center.y,
    speed,
    dir: 'down',
    homeX: center.x,
    homeY: center.y,
    wanderTimer: 0,
    lungeUntil: 0,
    waypoints: [],
    wpIndex: 0,
    wpDir: 1,
  };
}

function getValidSpawnCells(level, type) {
  const spawnDist = getMinSpawnDistTiles(level);
  const extra = type === 'chaser' ? 4 : 0;
  const cells = [];

  for (let row = 2; row < mazeHeight - 2; row++) {
    for (let col = 2; col < mazeWidth - 2; col++) {
      if (!canEnemyWalk(col, row, false)) continue;
      if (isNearSpawn(col, row, spawnDist + extra)) continue;
      cells.push({ col, row });
    }
  }
  return cells;
}

function validateEnemySpawns(level) {
  const minPixelDist = getMinSpawnDistTiles(level) * TILE_SIZE * 0.85;

  for (const e of enemies) {
    if (Math.hypot(e.x - spawnPoint.x, e.y - spawnPoint.y) < minPixelDist) return false;
    const pathFromSpawn = enemyBfsPath(
      { col: Math.floor(spawnPoint.x / TILE_SIZE), row: Math.floor(spawnPoint.y / TILE_SIZE) },
      enemyGridPos(e),
    );
    if (!pathFromSpawn || pathFromSpawn.length < getMinSpawnDistTiles(level)) return false;
  }

  if (boss && !bossDefeated) {
    if (Math.hypot(boss.x - spawnPoint.x, boss.y - spawnPoint.y) < minPixelDist * 0.7) return false;
  }
  return true;
}

function spawnEnemiesAttempt(level, levelIndex, seed) {
  enemies = [];
  boss = null;
  bossDefeated = !level.hasBoss;

  const rng = createRng(seed);
  const routes = shuffleArray(findPatrolRoutes(false, level), rng);
  let routeIdx = 0;
  const speedMult = getEnemySpeedMultiplier(level.id);

  for (const entry of level.enemies || []) {
    for (let i = 0; i < entry.count; i++) {
      const def = ENEMY_DEFS[entry.type];
      if (!def) continue;

      if (entry.type === 'patrol' || entry.type === 'sentry') {
        if (routeIdx >= routes.length) continue;
        const speed = (def.speed + level.id * 0.02) * speedMult;
        enemies.push(createPatrolEnemy(routes[routeIdx++], speed, entry.type));
      } else {
        const cells = shuffleArray(getValidSpawnCells(level, entry.type), rng);
        if (!cells.length) continue;
        const cell = cells[Math.floor(rng() * cells.length)];
        const speed = (def.speed + level.id * 0.015) * speedMult;
        enemies.push(createWanderingEnemy(cell, speed, entry.type));
      }
    }
  }

  if (level.hasBoss) {
    const exit = findCharInMaze('E');
    if (exit) {
      const spawnDist = getMinSpawnDistTiles(level);
      const candidates = [];
      for (const [dc, dr] of [[0, -1], [-1, 0], [0, 1], [1, 0], [-2, 0], [0, -2]]) {
        const nc = exit.col + dc;
        const nr = exit.row + dr;
        if (!canEnemyWalk(nc, nr, true)) continue;
        if (isNearSpawn(nc, nr, spawnDist)) continue;
        candidates.push({ col: nc, row: nr });
      }
      const cell = candidates[0] || { col: exit.col, row: exit.row - 1 };
      const center = cellCenter(cell.col, cell.row);
      boss = {
        type: 'boss',
        x: center.x,
        y: center.y,
        renderX: center.x,
        renderY: center.y,
        hp: BOSS_MAX_HP,
        maxHp: BOSS_MAX_HP,
        speed: ENEMY_DEFS.boss.speed * speedMult,
        dir: 'down',
        phase: 0,
      };
    }
  }

  for (const e of enemies) snapEnemyToGrid(e);
  if (boss) snapEnemyToGrid(boss, BOSS_SIZE);
}

function spawnFallbackEnemies(level) {
  enemies = [];
  boss = null;
  bossDefeated = !level.hasBoss;

  const routes = findPatrolRoutes(false, level);
  if (routes.length) {
    const speed = ENEMY_DEFS.patrol.speed * getEnemySpeedMultiplier(level.id);
    enemies.push(createPatrolEnemy(routes[routes.length - 1], speed, 'patrol'));
  }

  if (level.hasBoss) {
    const exit = findCharInMaze('E');
    if (exit) {
      let bx = exit.col;
      let by = exit.row - 1;
      if (!canEnemyWalk(bx, by, true)) by = exit.row + 1;
      const center = cellCenter(bx, by);
      boss = {
        type: 'boss',
        x: center.x,
        y: center.y,
        renderX: center.x,
        renderY: center.y,
        hp: BOSS_MAX_HP,
        maxHp: BOSS_MAX_HP,
        speed: ENEMY_DEFS.boss.speed * 0.6,
        dir: 'down',
        phase: 0,
      };
    }
  }
}

function spawnEnemiesForLevel(level, levelIndex, gameSeed) {
  for (let attempt = 0; attempt < MAX_ENEMY_SPAWN_ATTEMPTS; attempt++) {
    spawnEnemiesAttempt(level, levelIndex, gameSeed + attempt * 9991);
    if (validateEnemySpawns(level)) return true;
  }
  spawnFallbackEnemies(level);
  return validateEnemySpawns(level);
}

function findCharInMaze(char) {
  for (let row = 0; row < mazeHeight; row++) {
    for (let col = 0; col < mazeWidth; col++) {
      if (charFromTile(maze[row][col]) === char) return { col, row };
    }
  }
  return null;
}

function charFromTile(tile) {
  const map = {
    [TILE.WALL]: '#', [TILE.FLOOR]: '.', [TILE.KEY]: 'K', [TILE.DOOR]: 'D',
    [TILE.EXIT]: 'E', [TILE.CRYSTAL]: 'C', [TILE.TRAP]: 'X',
  };
  return map[tile] || '.';
}

function initEnemies(levelIndex) {
  const level = getCurrentLevel();
  if (!cachedEnemies[levelIndex]) {
    spawnEnemiesForLevel(level, levelIndex, gameSeed);
    cachedEnemies[levelIndex] = {
      enemies: enemies.map(e => ({ ...e, waypoints: e.waypoints?.map(w => ({ ...w })) || [] })),
      boss: boss ? { ...boss } : null,
      bossDefeated,
    };
  } else {
    const cached = cachedEnemies[levelIndex];
    enemies = cached.enemies.map(e => ({
      ...e,
      waypoints: e.waypoints?.map(w => ({ ...w })) || [],
    }));
    boss = cached.boss ? { ...cached.boss } : null;
    bossDefeated = cached.bossDefeated;
    resetEnemyPositions();
  }
}

function resetEnemyPositions() {
  for (const e of enemies) {
    if (e.waypoints?.length) {
      e.x = e.waypoints[0].x;
      e.y = e.waypoints[0].y;
      e.renderX = e.waypoints[0].x;
      e.renderY = e.waypoints[0].y;
      e.wpIndex = e.waypoints.length > 1 ? 1 : 0;
      e.wpDir = 1;
    } else {
      e.x = e.homeX;
      e.y = e.homeY;
      e.renderX = e.homeX;
      e.renderY = e.homeY;
    }
    e.lungeUntil = 0;
    e.wanderTimer = 0;
    e.stunnedUntil = 0;
    snapEnemyToGrid(e);
  }
  if (boss && !bossDefeated) {
    boss.phase = 0;
    snapEnemyToGrid(boss, BOSS_SIZE);
  }
}

function updatePatrolEnemy(e) {
  if (e.waypoints.length < 2) return;
  const target = e.waypoints[e.wpIndex];
  const tCol = Math.floor(target.x / TILE_SIZE);
  const tRow = Math.floor(target.y / TILE_SIZE);
  const arrived = moveEnemyToCell(e, tCol, tRow, e.speed);
  const pos = enemyGridPos(e);
  if (arrived || (pos.col === tCol && pos.row === tRow)) {
    e.wpIndex += e.wpDir;
    if (e.wpIndex >= e.waypoints.length) {
      e.wpIndex = e.waypoints.length - 2;
      e.wpDir = -1;
    } else if (e.wpIndex < 0) {
      e.wpIndex = 1;
      e.wpDir = 1;
    }
  }
}

function updateChaserEnemy(e) {
  const def = ENEMY_DEFS.chaser;
  const pathLen = getPathLengthToPlayer(e);
  if (pathLen > def.range / TILE_SIZE) {
    updateWanderEnemy(e);
    return;
  }
  const pCell = playerGridPos();
  moveEnemyToCell(e, pCell.col, pCell.row, e.speed);
}

function updateSentryEnemy(e) {
  const def = ENEMY_DEFS.sentry;
  const now = Date.now();
  const pathLen = getPathLengthToPlayer(e);

  if (now < e.lungeUntil && pathLen <= 8) {
    const pCell = playerGridPos();
    moveEnemyToCell(e, pCell.col, pCell.row, def.lungeSpeed);
  } else if (pathLen <= def.range / TILE_SIZE && pathLen > 1) {
    e.lungeUntil = now + 800;
  } else {
    updatePatrolEnemy(e);
  }
}

function updateWanderEnemy(e) {
  e.wanderTimer--;
  if (e.wanderTimer <= 0) {
    e.wanderTimer = 50 + Math.floor(Math.random() * 60);
    const pos = enemyGridPos(e);
    const dirs = shuffleArray([[1, 0], [-1, 0], [0, 1], [0, -1]], () => Math.random());
    for (const [dc, dr] of dirs) {
      const nc = pos.col + dc;
      const nr = pos.row + dr;
      if (canEnemyWalk(nc, nr, doorOpen)) {
        moveEnemyToCell(e, nc, nr, e.speed * 0.7);
        break;
      }
    }
  }
}

function updateBoss() {
  if (!boss || bossDefeated) return;

  boss.phase += 0.02;
  const pathLen = getPathLengthToPlayer(boss);
  const pCell = playerGridPos();

  if (pathLen <= ENEMY_DEFS.boss.range / TILE_SIZE) {
    moveEnemyToCell(boss, pCell.col, pCell.row, boss.speed, BOSS_SIZE);
  } else {
    const exit = findCharInMaze('E');
    if (exit) moveEnemyToCell(boss, exit.col, exit.row, boss.speed * 0.35, BOSS_SIZE);
  }

  boss.renderX += (boss.x - boss.renderX) * 0.2;
  boss.renderY += (boss.y - boss.renderY) * 0.2;
}

function isEnemyStunned(e) {
  return !!e.stunnedUntil && Date.now() < e.stunnedUntil;
}

function pushEnemyBack(e, cells) {
  for (let i = 0; i < cells; i++) {
    const pos = enemyGridPos(e);
    const pCell = playerGridPos();
    let best = null;
    let bestDist = Math.abs(pos.col - pCell.col) + Math.abs(pos.row - pCell.row);
    for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nc = pos.col + dc;
      const nr = pos.row + dr;
      if (!canEnemyWalk(nc, nr, doorOpen)) continue;
      const dist = Math.abs(nc - pCell.col) + Math.abs(nr - pCell.row);
      if (dist > bestDist) { bestDist = dist; best = { col: nc, row: nr }; }
    }
    if (!best) break;
    const c = cellCenter(best.col, best.row);
    e.x = c.x;
    e.y = c.y;
  }
  snapEnemyToGrid(e);
}

// Оглушить и отбросить всех стражей рядом с игроком. Возвращает true, если кого-то задели.
function tryRepelEnemies() {
  const now = Date.now();
  if (now - lastRepel < REPEL_COOLDOWN) return false;

  let hit = false;
  for (const e of enemies) {
    if (Math.hypot(e.x - player.x, e.y - player.y) <= REPEL_RANGE) {
      pushEnemyBack(e, REPEL_PUSH_CELLS);
      e.stunnedUntil = now + REPEL_STUN;
      hit = true;
    }
  }

  if (hit) {
    lastRepel = now;
    if (typeof Audio !== 'undefined' && Audio.play) Audio.play('door');
    if (typeof showPickupToast === 'function') showPickupToast('Страж отброшен!');
  }
  return hit;
}

function updateEnemies() {
  for (const e of enemies) {
    if (isEnemyStunned(e)) {
      e.renderX += (e.x - e.renderX) * 0.3;
      e.renderY += (e.y - e.renderY) * 0.3;
      continue;
    }
    switch (e.type) {
      case 'patrol': updatePatrolEnemy(e); break;
      case 'chaser': updateChaserEnemy(e); break;
      case 'sentry': updateSentryEnemy(e); break;
      case 'wanderer': updateWanderEnemy(e); break;
      default: updatePatrolEnemy(e);
    }
    e.renderX += (e.x - e.renderX) * 0.3;
    e.renderY += (e.y - e.renderY) * 0.3;
  }
  updateBoss();
}

function checkEnemyCollisions(hurtCallback) {
  if (Date.now() < invincibleUntil) return;

  const hitDist = (PLAYER_SIZE + ENEMY_SIZE) / 2 - 4;
  for (const e of enemies) {
    if (isEnemyStunned(e)) continue;
    if (canEnemyHitPlayer(e, hitDist)) {
      hurtCallback({ message: `${ENEMY_DEFS[e.type]?.label || 'Страж'} поймал тебя!`, sound: 'guard' });
      return;
    }
  }

  if (boss && !bossDefeated) {
    const bossDist = (PLAYER_SIZE + BOSS_SIZE) / 2 - 4;
    if (canEnemyHitPlayer(boss, bossDist)) {
      hurtCallback({ message: 'Хранитель атакует!', sound: 'guard' });
    }
  }
}

function tryAttackBoss() {
  if (!boss || bossDefeated || !keyCollected) return false;
  const now = Date.now();
  if (now - lastBossAttack < BOSS_ATTACK_COOLDOWN) return false;
  if (getPathLengthToPlayer(boss) > 1) return false;

  const dist = Math.hypot(player.x - boss.x, player.y - boss.y);
  if (dist > BOSS_ATTACK_RANGE) return false;

  lastBossAttack = now;
  boss.hp--;
  Audio.play('door');
  showPickupToast(`Хранитель: ${boss.hp}/${boss.maxHp} HP`);

  if (boss.hp <= 0) {
    bossDefeated = true;
    boss = null;
    Audio.play('victory');
    showPickupToast('Хранитель повержен! Беги к выходу!');
    updateBossHUD();
  }
  return true;
}

function updateBossHUD() {
  const bar = document.getElementById('boss-hud');
  if (!bar) return;
  if (!boss || bossDefeated) {
    bar.classList.add('hidden');
    return;
  }
  bar.classList.remove('hidden');
  const pct = (boss.hp / boss.maxHp) * 100;
  document.getElementById('boss-hp-fill').style.width = `${pct}%`;
  document.getElementById('boss-hp-text').textContent = `${boss.hp} / ${boss.maxHp}`;
}

function drawEnemy(ctx, e, frame) {
  const def = ENEMY_DEFS[e.type] || ENEMY_DEFS.patrol;
  const px = e.renderX;
  const py = e.renderY;
  const s = ENEMY_SIZE;
  const half = s / 2;
  const stunned = isEnemyStunned(e);
  const bob = stunned ? 0 : Math.sin(frame * 0.2 + px) * 1.5;

  if (stunned) ctx.globalAlpha = 0.55;

  const eyeGlow = ctx.createRadialGradient(px, py - 4, 0, px, py, 20);
  eyeGlow.addColorStop(0, `${def.eye}40`);
  eyeGlow.addColorStop(1, 'rgba(255, 50, 50, 0)');
  ctx.fillStyle = eyeGlow;
  ctx.fillRect(px - 20, py - 20, 40, 40);

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(px, py + half - 2, half - 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = def.color;
  ctx.fillRect(px - half + 2, py - half + 6 + bob, s - 4, s - 8);
  ctx.fillRect(px - half, py - half + 10 + bob, s, s - 14);
  ctx.fillRect(px - half + 4, py - half + 2 + bob, s - 8, 12);

  ctx.fillStyle = def.eye;
  const eyePulse = Math.sin(frame * 0.25) * 0.3 + 0.7;
  ctx.globalAlpha = eyePulse;
  ctx.fillRect(px - 6, py - half + 6 + bob, 4, 4);
  ctx.fillRect(px + 2, py - half + 6 + bob, 4, 4);
  ctx.globalAlpha = 1;

  if (e.type === 'chaser') {
    ctx.fillStyle = '#ff6600';
    ctx.fillRect(px - 2, py + 2 + bob, 4, 4);
  } else if (e.type === 'sentry') {
    ctx.strokeStyle = def.eye;
    ctx.lineWidth = 2;
    ctx.strokeRect(px - half + 2, py - half + 4 + bob, s - 4, s - 6);
  } else if (e.type === 'wanderer') {
    ctx.fillStyle = '#888';
    ctx.fillRect(px - 4, py + bob, 8, 3);
  } else {
    ctx.fillStyle = COLORS.goldDark;
    ctx.globalAlpha = 0.6;
    ctx.font = '10px serif';
    ctx.textAlign = 'center';
    ctx.fillText('☥', px, py + 4 + bob);
    ctx.globalAlpha = 1;
  }

  ctx.globalAlpha = 1;

  if (stunned) {
    ctx.fillStyle = '#ffe066';
    ctx.font = 'bold 12px serif';
    ctx.textAlign = 'center';
    for (let i = 0; i < 3; i++) {
      const a = frame * 0.15 + (i * Math.PI * 2) / 3;
      ctx.globalAlpha = 0.6 + Math.sin(frame * 0.2 + i) * 0.3;
      ctx.fillText('✦', px + Math.cos(a) * 12, py - half - 4 + Math.sin(a) * 4);
    }
    ctx.globalAlpha = 1;
  }
}

function drawBossEntity(ctx, b, frame) {
  const px = b.renderX;
  const py = b.renderY;
  const s = BOSS_SIZE;
  const half = s / 2;
  const pulse = Math.sin(frame * 0.08) * 0.15 + 0.85;

  const aura = ctx.createRadialGradient(px, py, 0, px, py, 60);
  aura.addColorStop(0, `rgba(255, 80, 20, ${0.35 * pulse})`);
  aura.addColorStop(1, 'rgba(255, 40, 0, 0)');
  ctx.fillStyle = aura;
  ctx.fillRect(px - 60, py - 60, 120, 120);

  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.beginPath();
  ctx.ellipse(px, py + half - 2, half - 4, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#2a1a0a';
  ctx.fillRect(px - half, py - half + 8, s, s - 6);
  ctx.fillStyle = '#4a3020';
  ctx.fillRect(px - half + 4, py - half + 14, s - 8, s - 16);
  ctx.fillStyle = '#1a0a00';
  ctx.fillRect(px - half + 8, py - half + 2, s - 16, 18);
  ctx.fillStyle = '#ff2200';
  ctx.globalAlpha = pulse;
  ctx.fillRect(px - 10, py - half + 8, 8, 8);
  ctx.fillRect(px + 2, py - half + 8, 8, 8);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 18px serif';
  ctx.textAlign = 'center';
  ctx.fillText('☥', px, py + 8);
  ctx.fillStyle = '#aa4400';
  const horns = Math.sin(frame * 0.1) * 2;
  ctx.fillRect(px - half - 2, py - half - 4 + horns, 8, 12);
  ctx.fillRect(px + half - 6, py - half - 4 - horns, 8, 12);
}

function drawAllEnemies(ctx, frame) {
  for (const e of enemies) drawEnemy(ctx, e, frame);
  if (boss && !bossDefeated) drawBossEntity(ctx, boss, frame);
}
