/**
 * Генерация и проверка лабиринтов
 * Гарантирует проходимость всех целей и безопасную расстановку ловушек
 */

const MAX_GENERATION_ATTEMPTS = 80;

// ============================================================
// RNG
// ============================================================

function createRng(seed) {
  let s = seed >>> 0;
  return function rng() {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function shuffleArray(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// СЕТКА И ФОРМЫ
// ============================================================

function createWallGrid(width, height) {
  return Array.from({ length: height }, () => Array(width).fill('#'));
}

function isInsideShape(col, row, width, height, shape) {
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const nx = (col - cx) / Math.max(1, width * 0.42);
  const ny = (row - cy) / Math.max(1, height * 0.42);

  switch (shape) {
    case 'circle':
      return nx * nx + ny * ny <= 1;
    case 'diamond':
      return Math.abs(col - cx) / (width * 0.42) + Math.abs(row - cy) / (height * 0.42) <= 1;
    case 'octagon': {
      const d = Math.abs(col - cx) / (width * 0.44) + Math.abs(row - cy) / (height * 0.44);
      const d2 = Math.abs(col - cx) / (width * 0.3) + Math.abs(row - cy) / (height * 0.3);
      return d <= 1 || d2 <= 0.75;
    }
    case 'cross': {
      const armW = Math.max(2, Math.floor(width * 0.14));
      const armH = Math.max(2, Math.floor(height * 0.14));
      const onH = Math.abs(row - cy) <= armH;
      const onV = Math.abs(col - cx) <= armW;
      const nearCenter = Math.abs(col - cx) <= armW + 1 && Math.abs(row - cy) <= armH + 1;
      return onH || onV || nearCenter;
    }
    case 'spiral':
    case 'symmetric':
    case 'rect':
    default:
      return col >= 1 && row >= 1 && col < width - 1 && row < height - 1;
  }
}

function applyShapeMask(grid, shape) {
  const h = grid.length;
  const w = grid[0].length;
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      if (!isInsideShape(col, row, w, h, shape)) {
        grid[row][col] = '#';
      }
    }
  }
}

function getFloorCells(grid) {
  const cells = [];
  for (let row = 0; row < grid.length; row++) {
    for (let col = 0; col < grid[0].length; col++) {
      if (grid[row][col] !== '#') cells.push({ col, row });
    }
  }
  return cells;
}

function countWalkNeighbors(grid, col, row) {
  let n = 0;
  for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
    const nc = col + dc;
    const nr = row + dr;
    if (nc >= 0 && nr >= 0 && nc < grid[0].length && nr < grid.length && grid[nr][nc] !== '#') n++;
  }
  return n;
}

// ============================================================
// ГЕНЕРАЦИЯ ЛАБИРИНТА
// ============================================================

function carveMaze(grid, width, height, rng, extraPassages) {
  function carve(cx, cy) {
    grid[cy][cx] = '.';
    const dirs = shuffleArray([[0, -2], [0, 2], [-2, 0], [2, 0]], rng);
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 1 && nx < width - 1 && ny >= 1 && ny < height - 1 && grid[ny][nx] === '#') {
        grid[cy + dy / 2][cx + dx / 2] = '.';
        carve(nx, ny);
      }
    }
  }

  carve(1, 1);

  for (let i = 0; i < extraPassages; i++) {
    const x = 1 + Math.floor(rng() * (width - 2));
    const y = 1 + Math.floor(rng() * (height - 2));
    if (grid[y][x] !== '#') continue;
    let floorNeighbors = 0;
    for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      if (grid[y + dr]?.[x + dc] === '.') floorNeighbors++;
    }
    if (floorNeighbors >= 2) grid[y][x] = '.';
  }
}

function addDeadEnds(grid, count, rng) {
  const floors = getFloorCells(grid).filter(c => countWalkNeighbors(grid, c.col, c.row) >= 3);
  const shuffled = shuffleArray(floors, rng);
  let added = 0;

  for (const cell of shuffled) {
    if (added >= count) break;
    for (const [dc, dr] of shuffleArray([[0, 1], [0, -1], [1, 0], [-1, 0]], rng)) {
      const nc = cell.col + dc;
      const nr = cell.row + dr;
      if (nc < 1 || nr < 1 || nc >= grid[0].length - 1 || nr >= grid.length - 1) continue;
      if (grid[nr][nc] !== '#') continue;
      grid[nr][nc] = '.';
      added++;
      break;
    }
  }
}

function generateSpiralMaze(width, height, rng) {
  const grid = createWallGrid(width, height);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);
  let x = cx;
  let y = cy;
  let dir = 0;
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  let steps = 1;
  let spiralLen = Math.min(width, height) * 2;

  grid[y][x] = '.';
  while (spiralLen-- > 0) {
    for (let rep = 0; rep < 2; rep++) {
      const [dx, dy] = dirs[dir % 4];
      for (let s = 0; s < steps; s++) {
        x += dx;
        y += dy;
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
        grid[y][x] = '.';
        if (rng() < 0.15) {
          const bx = x + (rng() < 0.5 ? 1 : -1);
          const by = y;
          if (bx >= 1 && bx < width - 1 && grid[by][bx] === '#') grid[by][bx] = '.';
        }
      }
      dir++;
    }
    steps++;
  }

  applyShapeMask(grid, 'circle');
  return grid;
}

function generateSymmetricMaze(width, height, rng, extraPassages) {
  const grid = createWallGrid(width, height);
  const mid = Math.floor(width / 2);

  function carveHalf(cx, cy) {
    grid[cy][cx] = '.';
    const dirs = shuffleArray([[0, -2], [0, 2], [-2, 0]], rng);
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx >= 1 && nx <= mid && ny >= 1 && ny < height - 1 && grid[ny][nx] === '#') {
        grid[cy + dy / 2][cx + dx / 2] = '.';
        carveHalf(nx, ny);
      }
    }
  }

  carveHalf(1, 1);

  for (let row = 1; row < height - 1; row++) {
    for (let col = 1; col <= mid; col++) {
      if (grid[row][col] === '.') {
        const mirror = width - 1 - col;
        grid[row][mirror] = '.';
      }
    }
  }

  for (let i = 0; i < extraPassages; i++) {
    const x = 1 + Math.floor(rng() * (width - 2));
    const y = 1 + Math.floor(rng() * (height - 2));
    if (grid[y][x] === '#') {
      let n = 0;
      for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (grid[y + dr]?.[x + dc] === '.') n++;
      }
      if (n >= 2) grid[y][x] = '.';
    }
  }

  return grid;
}

function generateBaseGrid(level, shape, rng) {
  const w = level.width;
  const h = level.height;
  const extraPassages = level.extraPassages ?? Math.max(2, level.id * 2);

  let grid;
  if (shape === 'spiral') {
    grid = generateSpiralMaze(w, h, rng);
    addDeadEnds(grid, level.deadEnds, rng);
  } else if (shape === 'symmetric') {
    grid = generateSymmetricMaze(w, h, rng, extraPassages);
    addDeadEnds(grid, level.deadEnds, rng);
  } else {
    grid = createWallGrid(w, h);
    carveMaze(grid, w, h, rng, extraPassages + level.deadEnds);
    applyShapeMask(grid, shape);
    addDeadEnds(grid, Math.floor(level.deadEnds / 2), rng);
  }

  return grid;
}

// ============================================================
// ПУТИ И ПРОВЕРКА
// ============================================================

function bfsDistances(grid, start, isWalkable) {
  const h = grid.length;
  const w = grid[0].length;
  const key = (c, r) => `${c},${r}`;
  const dist = new Map();
  const queue = [start];
  dist.set(key(start.col, start.row), 0);

  while (queue.length) {
    const { col, row } = queue.shift();
    const d = dist.get(key(col, row));
    for (const [dc, dr] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const nc = col + dc;
      const nr = row + dr;
      const k = key(nc, nr);
      if (nc < 0 || nr < 0 || nc >= w || nr >= h) continue;
      if (dist.has(k)) continue;
      if (!isWalkable(grid[nr][nc], nc, nr)) continue;
      dist.set(k, d + 1);
      queue.push({ col: nc, row: nr });
    }
  }
  return dist;
}

function findFarthestCell(dist) {
  let best = null;
  let bestD = -1;
  for (const [k, d] of dist) {
    if (d > bestD) {
      bestD = d;
      const [col, row] = k.split(',').map(Number);
      best = { col, row };
    }
  }
  return best;
}

function bfsPath(grid, start, end, isWalkable) {
  const h = grid.length;
  const w = grid[0].length;
  const key = (c, r) => `${c},${r}`;
  const startKey = key(start.col, start.row);
  const endKey = key(end.col, end.row);
  const queue = [start];
  const visited = new Set([startKey]);
  const parent = new Map();

  while (queue.length) {
    const cur = queue.shift();
    const curKey = key(cur.col, cur.row);
    if (curKey === endKey) {
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
      if (!isWalkable(grid[nr][nc], nc, nr)) continue;
      visited.add(nk);
      parent.set(nk, cur);
      queue.push({ col: nc, row: nr });
    }
  }
  return null;
}

function findMainPath(grid, minLen) {
  const floors = getFloorCells(grid);
  if (floors.length < 6) return null;

  const rngIdx = floors[Math.floor(floors.length * 0.2)];
  const distA = bfsDistances(grid, rngIdx, (cell) => cell !== '#');
  const pointB = findFarthestCell(distA);
  if (!pointB) return null;

  const distB = bfsDistances(grid, pointB, (cell) => cell !== '#');
  const pointC = findFarthestCell(distB);
  if (!pointC) return null;

  const path = bfsPath(grid, pointB, pointC, (cell) => cell !== '#');
  if (!path || path.length < minLen) return null;
  return path;
}

function findChar(layout, char) {
  for (let row = 0; row < layout.length; row++) {
    const col = layout[row].indexOf(char);
    if (col !== -1) return { col, row };
  }
  return null;
}

function findAllChars(layout, char) {
  const found = [];
  for (let row = 0; row < layout.length; row++) {
    for (let col = 0; col < layout[row].length; col++) {
      if (layout[row][col] === char) found.push({ col, row });
    }
  }
  return found;
}

function layoutToWalkGrid(layout) {
  return layout.map(row =>
    row.split('').map(ch => (ch === '#' ? '#' : '.'))
  );
}

function isWalkableForPlayer(ch) {
  return ch !== '#';
}

function isWalkableBeforeDoor(ch) {
  return ch !== '#' && ch !== 'D';
}

function getCriticalCells(layout) {
  const start = findChar(layout, 'P');
  const key = findChar(layout, 'K');
  const door = findChar(layout, 'D');
  const exit = findChar(layout, 'E');
  if (!start || !key || !door || !exit) return new Set();

  const grid = layoutToWalkGrid(layout);
  const critical = new Set();

  const toKey = bfsPath(grid, start, key, (_, c, r) => isWalkableBeforeDoor(layout[r][c]));
  const toDoor = bfsPath(grid, key, door, (_, c, r) => isWalkableForPlayer(layout[r][c]));
  const toExit = bfsPath(grid, door, exit, (_, c, r) => isWalkableForPlayer(layout[r][c]));

  for (const path of [toKey, toDoor, toExit]) {
    if (!path) continue;
    for (const p of path) critical.add(`${p.col},${p.row}`);
  }
  return critical;
}

function validateFullLayout(layout) {
  const start = findChar(layout, 'P');
  const key = findChar(layout, 'K');
  const door = findChar(layout, 'D');
  const exit = findChar(layout, 'E');
  if (!start || !key || !door || !exit) return false;

  const grid = layoutToWalkGrid(layout);

  const toKey = bfsPath(grid, start, key, (_, c, r) => isWalkableBeforeDoor(layout[r][c]));
  const toDoor = bfsPath(grid, key, door, (_, c, r) => isWalkableForPlayer(layout[r][c]));
  const toExit = bfsPath(grid, door, exit, (_, c, r) => isWalkableForPlayer(layout[r][c]));
  if (!toKey || !toDoor || !toExit) return false;

  const crystals = findAllChars(layout, 'C');
  for (const crystal of crystals) {
    const path = bfsPath(grid, start, crystal, (_, c, r) => isWalkableBeforeDoor(layout[r][c]));
    if (!path) return false;
  }

  const critical = getCriticalCells(layout);
  const traps = findAllChars(layout, 'X');
  for (const trap of traps) {
    if (critical.has(`${trap.col},${trap.row}`)) return false;
  }

  return true;
}

// Для обратной совместимости с редактором
function validateLayoutPaths(layout) {
  return validateFullLayout(layout);
}

// ============================================================
// РАССТАНОВКА ОБЪЕКТОВ
// ============================================================

function placeEntitiesOnPath(grid, path, level, rng) {
  if (!path || path.length < level.minPathLen) return false;

  const len = path.length;
  const keyIdx = Math.max(1, Math.floor(len * 0.28));
  let doorIdx = Math.max(keyIdx + 3, Math.floor(len * 0.58));
  const exitIdx = len - 1;
  if (doorIdx >= exitIdx) doorIdx = exitIdx - 1;
  if (doorIdx <= keyIdx) return false;

  const critical = new Set();
  function mark(idx, char) {
    const { col, row } = path[idx];
    grid[row][col] = char;
    critical.add(`${col},${row}`);
  }

  mark(0, 'P');
  mark(keyIdx, 'K');
  mark(doorIdx, 'D');
  mark(exitIdx, 'E');

  const floors = getFloorCells(grid).filter(({ col, row }) => !critical.has(`${col},${row}`));
  const shuffled = shuffleArray(floors, rng);

  const deadEnds = shuffled.filter(c => countWalkNeighbors(grid, c.col, c.row) === 1);
  const sideCells = shuffled.filter(c => !critical.has(`${c.col},${c.row}`) && countWalkNeighbors(grid, c.col, c.row) >= 2);

  let placedCrystals = 0;
  let placedTraps = 0;

  for (const cell of sideCells) {
    if (placedCrystals >= level.crystals) break;
    grid[cell.row][cell.col] = 'C';
    placedCrystals++;
  }

  for (const cell of deadEnds) {
    if (placedTraps >= level.traps) break;
    if (grid[cell.row][cell.col] !== '.') continue;
    grid[cell.row][cell.col] = 'X';
    placedTraps++;
  }

  for (const cell of sideCells) {
    if (placedTraps >= level.traps) break;
    if (grid[cell.row][cell.col] !== '.') continue;
    grid[cell.row][cell.col] = 'X';
    placedTraps++;
  }

  placeBonusItems(grid, critical, level, rng);
  return placedCrystals >= level.crystals;
}

function tryPlaceSecretRoom(grid, critical, level, rng) {
  const chance = 0.15 + level.id * 0.05;
  if (rng() > chance) return false;

  const h = grid.length;
  const w = grid[0].length;
  const floors = getFloorCells(grid).filter(c => !critical.has(`${c.col},${c.row}`) && grid[c.row][c.col] === '.');
  const shuffled = shuffleArray(floors, rng);

  for (const cell of shuffled) {
    const dirs = shuffleArray([[0, -1], [0, 1], [-1, 0], [1, 0]], rng);
    for (const [dc, dr] of dirs) {
      const wc = cell.col + dc;
      const wr = cell.row + dr;
      if (grid[wr]?.[wc] !== '#') continue;

      const room = [];
      let valid = true;
      const depth = 2 + Math.floor(rng() * 2);
      for (let i = 1; i <= depth; i++) {
        const rc = cell.col + dc * i;
        const rr = cell.row + dr * i;
        if (rc < 1 || rr < 1 || rc >= w - 1 || rr >= h - 1 || grid[rr][rc] !== '#') {
          valid = false;
          break;
        }
        room.push({ col: rc, row: rr });
      }
      if (!valid || room.length < 2) continue;

      for (const r of room) grid[r.row][r.col] = '.';
      grid[cell.row][cell.col] = 'R';
      const rewardCell = room[room.length - 1];
      const rewards = ['B', 'C', '>', '+', 'B', '<'];
      grid[rewardCell.row][rewardCell.col] = rewards[Math.floor(rng() * rewards.length)];
      return true;
    }
  }
  return false;
}

function placeBonusItems(grid, critical, level, rng) {
  const floors = getFloorCells(grid).filter(c => !critical.has(`${c.col},${c.row}`) && grid[c.row][c.col] === '.');
  const shuffled = shuffleArray(floors, rng);

  const plan = {
    chest: rng() < 0.2 + level.id * 0.06 ? 1 : 0,
    speed: rng() < 0.16 + level.id * 0.04 ? 1 : 0,
    slow: rng() < 0.14 + level.id * 0.03 ? 1 : 0,
    life: level.id <= 2 ? 0 : (rng() < 0.1 ? 1 : 0),
  };

  const placed = { chest: 0, speed: 0, slow: 0, life: 0 };
  const chars = { chest: 'B', speed: '>', slow: '<', life: '+' };

  for (const cell of shuffled) {
    if (grid[cell.row][cell.col] !== '.') continue;
    if (placed.chest < plan.chest) { grid[cell.row][cell.col] = 'B'; placed.chest++; }
    else if (placed.speed < plan.speed) { grid[cell.row][cell.col] = '>'; placed.speed++; }
    else if (placed.slow < plan.slow) { grid[cell.row][cell.col] = '<'; placed.slow++; }
    else if (placed.life < plan.life) { grid[cell.row][cell.col] = '+'; placed.life++; }
    else break;
  }

  tryPlaceSecretRoom(grid, critical, level, rng);
}

function gridToLayout(grid) {
  return grid.map(row => row.join(''));
}

function getFallbackLayout(level) {
  const w = level.width;
  const h = level.height;
  const grid = createWallGrid(w, h);

  for (let row = 1; row < h - 1; row++) {
    for (let col = 1; col < w - 1; col++) grid[row][col] = '.';
  }

  const mid = Math.floor(w / 2);
  grid[1][1] = 'P';
  grid[Math.floor(h * 0.35)][mid] = 'K';
  grid[Math.floor(h * 0.6)][mid] = 'D';
  grid[h - 2][w - 2] = 'E';

  const freeCells = getFloorCells(grid).filter(({ col, row }) => {
    const ch = grid[row][col];
    return ch === '.' || ch === 'C' || ch === 'X';
  });

  let ci = 0;
  let ti = 0;
  const critical = getCriticalCells(gridToLayout(grid));
  for (const cell of freeCells) {
    if (critical.has(`${cell.col},${cell.row}`)) continue;
    if (ci < level.crystals) { grid[cell.row][cell.col] = 'C'; ci++; }
    else if (ti < level.traps) { grid[cell.row][cell.col] = 'X'; ti++; }
    else break;
  }

  return gridToLayout(grid);
}

// ============================================================
// ПУБЛИЧНЫЙ API
// ============================================================

function generateLevelLayout(level, seed) {
  const rng = createRng(seed);
  const shapes = level.shapes || ['rect'];
  const shapeOrder = shuffleArray(shapes, rng);

  for (let shapeAttempt = 0; shapeAttempt < shapeOrder.length; shapeAttempt++) {
    const shape = shapeOrder[shapeAttempt];

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
      const attemptRng = createRng(seed + attempt * 7919 + shapeAttempt * 31337);
      const grid = generateBaseGrid(level, shape, attemptRng);
      const path = findMainPath(grid, level.minPathLen);
      if (!path) continue;

      const gridCopy = grid.map(row => row.slice());
      if (!placeEntitiesOnPath(gridCopy, path, level, createRng(seed + attempt * 997))) continue;

      const layout = gridToLayout(gridCopy);
      if (validateFullLayout(layout)) return layout;
    }
  }

  const fallback = getFallbackLayout(level);
  return validateFullLayout(fallback) ? fallback : getFallbackLayout(level);
}

function generateValidatedLayout(level, seed) {
  let layout = generateLevelLayout(level, seed);
  let attempts = 0;

  while (!validateFullLayout(layout) && attempts < MAX_GENERATION_ATTEMPTS) {
    layout = generateLevelLayout(level, seed + attempts + 1);
    attempts++;
  }

  if (!validateFullLayout(layout)) {
    layout = getFallbackLayout(level);
  }

  return layout;
}
