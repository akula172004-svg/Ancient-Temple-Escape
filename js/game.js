/**
 * Побег из древнего храма
 * 2D блочная игра — 5 уровней, кристаллы, ловушки, жизни, очки
 */

// ============================================================
// КОНСТАНТЫ
// ============================================================

const TILE_SIZE = 40;
const PLAYER_SPEED = 3;
const PLAYER_SIZE = 28;
const MAX_LIVES = 3;
const MAX_LIVES_CAP = 5;
const INVINCIBLE_TIME = 2000;

const POWERUP = {
  SPEED_DURATION: 8000,
  SLOW_DURATION: 10000,
  SPEED_MULT: 1.65,
  TIME_SCALE: 0.35,
};

const SCORE = {
  CRYSTAL: 100,
  KEY: 200,
  DOOR: 150,
  LEVEL_COMPLETE: 500,
  TIME_BONUS_PER_SEC: 5,
  TRAP_PENALTY: 25,
  CHEST_POINTS: 250,
  SECRET_ROOM: 150,
};

const TILE = {
  WALL: 0,
  FLOOR: 1,
  KEY: 2,
  DOOR: 3,
  EXIT: 4,
  TORCH: 5,
  SYMBOL: 6,
  CRYSTAL: 7,
  TRAP: 8,
  CHEST: 9,
  SPEED_BOOST: 10,
  SLOW_TIME: 11,
  EXTRA_LIFE: 12,
  SECRET_DOOR: 13,
};

const BASE_COLORS = {
  sand: '#d4b86a',
  gold: '#ffd700',
  goldDark: '#c9a227',
  key: '#ffcc00',
  doorWood: '#6b4226',
  doorFrame: '#4a3020',
  exitGlow: '#44ff88',
  exitBase: '#2a6a4a',
  playerBody: '#4a8a6a',
  playerHead: '#3a7a5a',
  playerSkin: '#d4a86a',
  guardBody: '#7a6a5a',
  guardStone: '#5a4a3a',
  guardEye: '#ff3333',
  torchWood: '#5c3d1a',
  flame1: '#ffcc00',
  flame2: '#ff6600',
  symbol: '#8b6914',
};

const GameState = {
  START: 'start',
  CHAR_SELECT: 'char_select',
  PLAYING: 'playing',
  LEVEL_COMPLETE: 'level_complete',
  GAMEOVER: 'gameover',
  VICTORY: 'victory',
};

// ============================================================
// СОСТОЯНИЕ
// ============================================================

let state = GameState.START;
let currentLevelIndex = 0;
let COLORS = { ...BASE_COLORS };

let maze = [];
let mazeWidth = 0;
let mazeHeight = 0;
let spawnPoint = { x: 0, y: 0 };

let player = { x: 0, y: 0, renderX: 0, renderY: 0, dir: 'down', moving: false };
let hasKey = false;
let doorOpen = false;
let keyCollected = false;

let lives = MAX_LIVES;
let score = 0;
let crystalsCollected = 0;
let crystalsTotal = 0;

let keys = {};
let timerStart = 0;
let elapsedTime = 0;
let totalElapsedTime = 0;
let animationFrame = 0;
let torchFlicker = 0;

let invincibleUntil = 0;
let damageFlashUntil = 0;

let doorAnims = [];
let torchPositions = [];
let stepCooldown = 0;

let chestData = {};
let discoveredSecrets = new Set();
let speedBoostUntil = 0;
let slowTimeUntil = 0;
let lastFrameTime = 0;
let timeAccumulator = 0;
let pickupToastTimer = null;

let canvas, ctx;
let screens = {};
let cachedLayouts = {};
let gameSeed = 1;

// ============================================================
// ИНИЦИАЛИЗАЦИЯ
// ============================================================

function init() {
  canvas = document.getElementById('game-canvas');
  ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  screens = {
    start: document.getElementById('start-screen'),
    char: document.getElementById('char-screen'),
    game: document.getElementById('game-screen'),
    level: document.getElementById('level-screen'),
    gameover: document.getElementById('gameover-screen'),
    victory: document.getElementById('victory-screen'),
  };

  document.getElementById('btn-start').addEventListener('click', () => {
    Audio.init();
    Audio.resume();
    Audio.play('ui');
    showScreen('char');
  });
  document.getElementById('btn-continue').addEventListener('click', () => {
    Audio.init();
    Audio.resume();
    Audio.play('ui');
    Audio.startMusic();
    continueSavedGame();
  });
  document.getElementById('btn-restart').addEventListener('click', () => {
    Audio.play('ui');
    startNewGame();
  });
  document.getElementById('btn-retry').addEventListener('click', () => {
    Audio.play('ui');
    if (Save.hasContinue()) {
      continueSavedGame();
    } else {
      startNewGame();
    }
  });
  document.getElementById('btn-next-level').addEventListener('click', onNextLevelClick);

  document.getElementById('btn-mute').addEventListener('click', () => {
    const muted = Audio.toggleMute();
    document.getElementById('btn-mute').textContent = muted ? '🔇' : '🔊';
    document.getElementById('btn-mute').classList.toggle('muted', muted);
  });

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);

  CharacterSelect.init((characterId) => {
    selectedCharacterId = characterId;
    Audio.startMusic();
    startNewGame();
  });
  CharacterSelect.animatePreviews();

  showScreen('start');
}

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');

  if (name === 'start') {
    updateStartScreen();
  }

  const map = {
    start: GameState.START,
    char: GameState.CHAR_SELECT,
    game: GameState.PLAYING,
    level: GameState.LEVEL_COMPLETE,
    gameover: GameState.GAMEOVER,
    victory: GameState.VICTORY,
  };
  state = map[name];

  if (name === 'game') Audio.setMusicIntensity(0.8);
  else if (name === 'victory') { Audio.play('victory'); Audio.setMusicIntensity(0.3); }
  else if (name === 'gameover') { Audio.play('defeat'); Audio.setMusicIntensity(0.2); }
  else if (name === 'level') Audio.play('level');
  else if (name === 'start') Audio.setMusicIntensity(0.5);
  else if (name === 'char') Audio.setMusicIntensity(0.55);
}

// ============================================================
// УРОВНИ
// ============================================================

function getCurrentLevel() {
  return LEVELS[currentLevelIndex];
}

function applyLevelPalette(level) {
  COLORS = { ...BASE_COLORS, ...level.palette };
}

function parseMaze(layout, options = {}) {
  maze = [];
  mazeHeight = layout.length;
  mazeWidth = layout[0].length;
  crystalsTotal = 0;
  crystalsCollected = 0;
  chestData = {};

  for (let row = 0; row < mazeHeight; row++) {
    maze[row] = [];
    for (let col = 0; col < mazeWidth; col++) {
      const char = layout[row][col];
      switch (char) {
        case '#': maze[row][col] = TILE.WALL; break;
        case 'P':
          spawnPoint.x = col * TILE_SIZE + TILE_SIZE / 2;
          spawnPoint.y = row * TILE_SIZE + TILE_SIZE / 2;
          player.x = spawnPoint.x;
          player.y = spawnPoint.y;
          player.renderX = spawnPoint.x;
          player.renderY = spawnPoint.y;
          maze[row][col] = TILE.FLOOR;
          break;
        case 'K': maze[row][col] = TILE.KEY; break;
        case 'D': maze[row][col] = TILE.DOOR; break;
        case 'E': maze[row][col] = TILE.EXIT; break;
        case 'C':
          maze[row][col] = TILE.CRYSTAL;
          crystalsTotal++;
          break;
        case 'X': maze[row][col] = TILE.TRAP; break;
        case 'B':
          maze[row][col] = TILE.CHEST;
          chestData[`${col},${row}`] = { bonus: rollChestBonus(col, row), opened: false };
          break;
        case '>': maze[row][col] = TILE.SPEED_BOOST; break;
        case '<': maze[row][col] = TILE.SLOW_TIME; break;
        case '+': maze[row][col] = TILE.EXTRA_LIFE; break;
        case 'R': maze[row][col] = TILE.SECRET_DOOR; break;
        case 'T': maze[row][col] = TILE.TORCH; break;
        case 'S': maze[row][col] = TILE.SYMBOL; break;
        default: maze[row][col] = TILE.FLOOR;
      }
    }
  }

  if (!options.skipDecorations) {
    addDecorations();
  }
  collectTorchPositions();
  doorAnims = [];
  discoveredSecrets = new Set();
}

function rollChestBonus(col, row) {
  const types = ['points', 'speed', 'slow', 'life', 'points', 'points'];
  return types[(col * 31 + row * 17 + gameSeed) % types.length];
}

function collectTorchPositions() {
  torchPositions = [];
  for (let row = 0; row < mazeHeight; row++) {
    for (let col = 0; col < mazeWidth; col++) {
      if (maze[row][col] === TILE.TORCH) {
        torchPositions.push({
          x: col * TILE_SIZE + TILE_SIZE / 2,
          y: row * TILE_SIZE + TILE_SIZE / 2,
        });
      }
    }
  }
}

function addDecorations() {
  const skip = new Set([
    TILE.CHEST, TILE.SPEED_BOOST, TILE.SLOW_TIME, TILE.EXTRA_LIFE, TILE.SECRET_DOOR,
    TILE.KEY, TILE.DOOR, TILE.EXIT, TILE.CRYSTAL, TILE.TRAP,
  ]);

  for (let row = 0; row < mazeHeight; row++) {
    for (let col = 0; col < mazeWidth; col++) {
      if (maze[row][col] !== TILE.FLOOR) continue;
      if (skip.has(maze[row][col])) continue;
      if (col === 0 || row === 0 || col === mazeWidth - 1 || row === mazeHeight - 1) continue;
      const hash = (col * 17 + row * 31) % 20;
      if (hash === 0) maze[row][col] = TILE.TORCH;
      else if (hash === 1) maze[row][col] = TILE.SYMBOL;
    }
  }
}

function resetLevelState() {
  hasKey = false;
  doorOpen = false;
  keyCollected = false;
  crystalsCollected = 0;
  player.x = spawnPoint.x;
  player.y = spawnPoint.y;
  player.renderX = spawnPoint.x;
  player.renderY = spawnPoint.y;
  player.dir = 'down';
  player.moving = false;
  invincibleUntil = 0;
  doorAnims = [];
  speedBoostUntil = 0;
  slowTimeUntil = 0;
  timeAccumulator = 0;
  lastFrameTime = performance.now();
  discoveredSecrets = new Set();
  resetEnemyPositions();
}

function getPlayerSpeed() {
  const ch = getSelectedCharacter();
  const base = Date.now() < speedBoostUntil ? PLAYER_SPEED * POWERUP.SPEED_MULT : PLAYER_SPEED;
  return base * (ch.speedMult || 1);
}

function prepareFairLevel(index) {
  const level = LEVELS[index];

  for (let attempt = 0; attempt < 50; attempt++) {
    const seed = gameSeed + index * 1000 + attempt * 1777;
    const layout = generateValidatedLayout(level, seed);
    if (!validateFullLayout(layout)) continue;

    parseMaze(layout);
    cachedEnemies = {};
    spawnEnemiesForLevel(level, index, seed);

    if (validateEnemySpawns(level)) {
      cachedEnemies[index] = {
        enemies: enemies.map(e => ({ ...e, waypoints: e.waypoints?.map(w => ({ ...w })) || [] })),
        boss: boss ? { ...boss } : null,
        bossDefeated,
      };
      return layout;
    }
  }

  const fallback = getFallbackLayout(level);
  parseMaze(fallback);
  cachedEnemies = {};
  spawnFallbackEnemies(level);
  cachedEnemies[index] = {
    enemies: enemies.map(e => ({ ...e, waypoints: e.waypoints?.map(w => ({ ...w })) || [] })),
    boss: boss ? { ...boss } : null,
    bossDefeated,
  };
  return fallback;
}

function loadLevel(index) {
  currentLevelIndex = index;
  const level = getCurrentLevel();
  applyLevelPalette(level);

  if (!cachedLayouts[index]) {
    cachedLayouts[index] = prepareFairLevel(index);
  }

  parseMaze(cachedLayouts[index]);
  initEnemies(index);

  canvas.width = mazeWidth * TILE_SIZE;
  canvas.height = mazeHeight * TILE_SIZE;

  resetLevelState();
  invincibleUntil = Date.now() + 1500;
  updateHUD();
  updateBossHUD();
}

// ============================================================
// УПРАВЛЕНИЕ
// ============================================================

function onKeyDown(e) {
  const key = e.key.toLowerCase();
  if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
    e.preventDefault();
    keys[key] = true;
  }
  if (key === ' ' && state === GameState.PLAYING) {
    e.preventDefault();
    tryAttackBoss();
  }
}

function onKeyUp(e) {
  keys[e.key.toLowerCase()] = false;
}

function getMovement() {
  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup']) dy = -1;
  if (keys['s'] || keys['arrowdown']) dy = 1;
  if (keys['a'] || keys['arrowleft']) dx = -1;
  if (keys['d'] || keys['arrowright']) dx = 1;

  if (dx !== 0 && dy !== 0) {
    dx *= 0.707;
    dy *= 0.707;
  }

  if (dx < 0) player.dir = 'left';
  else if (dx > 0) player.dir = 'right';
  else if (dy < 0) player.dir = 'up';
  else if (dy > 0) player.dir = 'down';

  return { dx, dy };
}

// ============================================================
// КОЛЛИЗИИ И ВЗАИМОДЕЙСТВИЯ
// ============================================================

function getTile(col, row) {
  if (col < 0 || row < 0 || col >= mazeWidth || row >= mazeHeight) return TILE.WALL;
  return maze[row][col];
}

function isBlocking(tile) {
  if (tile === TILE.WALL) return true;
  if (tile === TILE.DOOR && !doorOpen && !hasKey) return true;
  return false;
}

function canMoveTo(x, y) {
  const half = PLAYER_SIZE / 2 - 2;
  const corners = [
    [x - half, y - half],
    [x + half, y - half],
    [x - half, y + half],
    [x + half, y + half],
  ];

  for (const [cx, cy] of corners) {
    const col = Math.floor(cx / TILE_SIZE);
    const row = Math.floor(cy / TILE_SIZE);
    if (isBlocking(getTile(col, row))) return false;
  }
  return true;
}

function addScore(points) {
  score = Math.max(0, score + points);
  updateHUD();
}

function showPickupToast(text) {
  const toast = document.getElementById('pickup-toast');
  toast.textContent = text;
  toast.classList.remove('hidden');
  if (pickupToastTimer) clearTimeout(pickupToastTimer);
  pickupToastTimer = setTimeout(() => toast.classList.add('hidden'), 2200);
}

function applyBonus(type) {
  switch (type) {
    case 'points':
      addScore(SCORE.CHEST_POINTS);
      showPickupToast(`+${SCORE.CHEST_POINTS} очков!`);
      break;
    case 'speed':
      speedBoostUntil = Date.now() + POWERUP.SPEED_DURATION;
      showPickupToast('Ускорение!');
      Audio.play('powerup');
      break;
    case 'slow':
      slowTimeUntil = Date.now() + POWERUP.SLOW_DURATION;
      showPickupToast('Замедление времени!');
      Audio.play('powerup');
      break;
    case 'life':
      if (lives < MAX_LIVES_CAP) {
        lives++;
        showPickupToast('+1 жизнь!');
        Audio.play('life');
      } else {
        addScore(SCORE.CHEST_POINTS);
        showPickupToast('Жизней макс. → +очки!');
      }
      break;
  }
  updateHUD();
}

function openChest(col, row) {
  const key = `${col},${row}`;
  const chest = chestData[key];
  if (!chest || chest.opened) return;

  chest.opened = true;
  maze[row][col] = TILE.FLOOR;
  delete chestData[key];
  Audio.play('chest');
  applyBonus(chest.bonus);
}

function checkInteractions() {
  const col = Math.floor(player.x / TILE_SIZE);
  const row = Math.floor(player.y / TILE_SIZE);
  const tile = getTile(col, row);

  if (tile === TILE.SECRET_DOOR) {
    const sKey = `${col},${row}`;
    if (!discoveredSecrets.has(sKey)) {
      discoveredSecrets.add(sKey);
      addScore(SCORE.SECRET_ROOM);
      showPickupToast('Секретная комната!');
      Audio.play('secret');
    }
  }

  if (tile === TILE.CHEST) {
    openChest(col, row);
  }

  if (tile === TILE.SPEED_BOOST) {
    maze[row][col] = TILE.FLOOR;
    speedBoostUntil = Date.now() + POWERUP.SPEED_DURATION;
    showPickupToast('Ускорение!');
    Audio.play('powerup');
    updateHUD();
  }

  if (tile === TILE.SLOW_TIME) {
    maze[row][col] = TILE.FLOOR;
    slowTimeUntil = Date.now() + POWERUP.SLOW_DURATION;
    showPickupToast('Замедление времени!');
    Audio.play('powerup');
    updateHUD();
  }

  if (tile === TILE.EXTRA_LIFE) {
    maze[row][col] = TILE.FLOOR;
    if (lives < MAX_LIVES_CAP) {
      lives++;
      showPickupToast('+1 жизнь!');
      Audio.play('life');
    } else {
      addScore(SCORE.CHEST_POINTS);
      showPickupToast('+очки (жизней макс.)');
    }
    updateHUD();
  }

  if (tile === TILE.CRYSTAL) {
    crystalsCollected++;
    maze[row][col] = TILE.FLOOR;
    addScore(SCORE.CRYSTAL);
    Audio.play('crystal');
  }

  if (tile === TILE.KEY && !keyCollected) {
    keyCollected = true;
    hasKey = true;
    maze[row][col] = TILE.FLOOR;
    addScore(SCORE.KEY);
    Audio.play('key');
  }

  if (tile === TILE.DOOR && hasKey && !doorOpen) {
    doorOpen = true;
    doorAnims.push({ col, row, progress: 0 });
    addScore(SCORE.DOOR);
    Audio.play('door');
    updateHUD();
  }

  if (tile === TILE.TRAP && Date.now() > invincibleUntil) {
    hitTrap();
  }

  if (tile === TILE.EXIT && doorOpen) {
    const level = getCurrentLevel();
    if (level.hasBoss && !bossDefeated) {
      showPickupToast('Сначала победи Хранителя! (Пробел)');
      return;
    }
    completeLevel();
  }
}

function respawnPlayer() {
  const safe = findSafeRespawnPoint();
  player.x = safe.x;
  player.y = safe.y;
  player.renderX = safe.x;
  player.renderY = safe.y;
}

function hurtPlayer(opts = {}) {
  if (Date.now() < invincibleUntil) return;

  const { penalty = 0, message = '', sound = 'trap' } = opts;
  lives--;
  if (penalty) addScore(-penalty);

  invincibleUntil = Date.now() + INVINCIBLE_TIME;
  damageFlashUntil = Date.now() + 400;
  Audio.play(sound);

  const flash = document.getElementById('damage-flash');
  flash.classList.remove('hidden');
  setTimeout(() => flash.classList.add('hidden'), 400);

  if (message) showPickupToast(message);

  respawnPlayer();
  resetEnemyPositions();
  updateHUD();

  if (lives <= 0) gameOver();
}

function hitTrap() {
  hurtPlayer({ penalty: SCORE.TRAP_PENALTY, sound: 'trap' });
}

// ============================================================
// СОХРАНЕНИЕ
// ============================================================

function updateStartScreen() {
  const btnContinue = document.getElementById('btn-continue');
  const saveInfo = document.getElementById('save-info');
  if (!btnContinue || !saveInfo) return;

  if (Save.hasContinue()) {
    const save = Save.load();
    const level = LEVELS[save.nextLevelIndex];
    btnContinue.classList.remove('hidden');
    saveInfo.classList.remove('hidden');
    saveInfo.textContent =
      `Уровень ${save.nextLevelIndex + 1}: ${level.name} · ${save.score} очков`;
  } else {
    btnContinue.classList.add('hidden');
    saveInfo.classList.add('hidden');
  }
}

function persistProgress(isLast) {
  const savedTotalTime = totalElapsedTime + elapsedTime;

  if (isLast) {
    Save.write({
      gameCompleted: true,
      score,
      totalElapsedTime: savedTotalTime,
      gameSeed,
    });
  } else {
    Save.write({
      nextLevelIndex: currentLevelIndex + 1,
      score,
      lives,
      totalElapsedTime: savedTotalTime,
      gameSeed,
    });
  }
}

function startNewGame() {
  Save.clear();
  updateStartScreen();
  startGame(0);
}

function continueSavedGame() {
  const save = Save.load();
  if (!save || !Save.hasContinue()) {
    startNewGame();
    return;
  }

  startGame(save.nextLevelIndex, {
    score: save.score,
    lives: MAX_LIVES,
    totalElapsedTime: save.totalElapsedTime,
    gameSeed: save.gameSeed,
  });
}

// ============================================================
// ИГРОВОЙ ЦИКЛ
// ============================================================

function startGame(levelIndex, progress) {
  if (progress) {
    lives = progress.lives;
    score = progress.score;
    totalElapsedTime = progress.totalElapsedTime;
    gameSeed = progress.gameSeed;
  } else {
    lives = MAX_LIVES;
    score = 0;
    totalElapsedTime = 0;
    gameSeed = Date.now();
  }

  keys = {};
  animationFrame = 0;
  currentLevelIndex = levelIndex;
  cachedLayouts = {};
  cachedEnemies = {};
  chestData = {};

  loadLevel(levelIndex);

  timerStart = Date.now();
  elapsedTime = 0;
  timeAccumulator = 0;
  lastFrameTime = performance.now();

  showScreen('game');
  requestAnimationFrame(gameLoop);
}

function nextLevel() {
  if (currentLevelIndex + 1 >= LEVELS.length) return;

  totalElapsedTime += elapsedTime;
  loadLevel(currentLevelIndex + 1);
  timerStart = Date.now();
  elapsedTime = 0;
  timeAccumulator = 0;
  lastFrameTime = performance.now();

  showScreen('game');
  requestAnimationFrame(gameLoop);
}

function updateDoorAnims() {
  for (const anim of doorAnims) {
    if (anim.progress < 1) {
      anim.progress = Math.min(1, anim.progress + 0.04);
    }
    if (anim.progress >= 1 && maze[anim.row][anim.col] === TILE.DOOR) {
      maze[anim.row][anim.col] = TILE.FLOOR;
    }
  }
}

function gameLoop() {
  if (state !== GameState.PLAYING) return;

  animationFrame++;
  torchFlicker = Math.sin(animationFrame * 0.15) * 0.3 + 0.7;

  const { dx, dy } = getMovement();
  const speed = getPlayerSpeed();
  const newX = player.x + dx * speed;
  const newY = player.y + dy * speed;

  player.moving = dx !== 0 || dy !== 0;

  if (canMoveTo(newX, player.y)) player.x = newX;
  if (canMoveTo(player.x, newY)) player.y = newY;

  // Плавная интерполяция позиции
  const lerp = player.moving ? 0.28 : 0.4;
  player.renderX += (player.x - player.renderX) * lerp;
  player.renderY += (player.y - player.renderY) * lerp;

  // Звук шагов
  if (player.moving) {
    stepCooldown--;
    if (stepCooldown <= 0) {
      Audio.play('step');
      stepCooldown = 14;
    }
  } else {
    stepCooldown = 0;
  }

  updateDoorAnims();
  updateEnemies();
  checkInteractions();
  checkEnemyCollisions(hurtPlayer);

  const now = performance.now();
  const delta = now - lastFrameTime;
  lastFrameTime = now;
  const timeScale = Date.now() < slowTimeUntil ? POWERUP.TIME_SCALE : 1;
  timeAccumulator += (delta / 1000) * timeScale;
  elapsedTime = Math.floor(timeAccumulator);
  document.getElementById('timer').textContent = formatTime(elapsedTime);

  render();
  requestAnimationFrame(gameLoop);
}

function onNextLevelClick() {
  Audio.play('ui');
  if (currentLevelIndex + 1 >= LEVELS.length) {
    winGame();
  } else {
    nextLevel();
  }
}

function completeLevel() {
  state = GameState.LEVEL_COMPLETE;

  const timeBonus = Math.max(0, 120 - elapsedTime) * SCORE.TIME_BONUS_PER_SEC;
  const levelBonus = SCORE.LEVEL_COMPLETE + timeBonus;
  addScore(levelBonus);

  const level = getCurrentLevel();
  const isLast = currentLevelIndex + 1 >= LEVELS.length;
  document.getElementById('level-complete-title').textContent =
    isLast ? 'Все уровни пройдены!' : 'Уровень пройден!';
  document.getElementById('level-complete-name').textContent = level.name;
  document.getElementById('level-bonus').textContent = '+' + levelBonus;
  document.getElementById('level-total-score').textContent = score;
  document.getElementById('btn-next-level').textContent =
    isLast ? 'Завершить' : 'Следующий уровень';

  persistProgress(isLast);
  showScreen('level');
}

function gameOver() {
  state = GameState.GAMEOVER;
  document.getElementById('gameover-score').textContent = score;
  document.getElementById('gameover-level').textContent = currentLevelIndex + 1;
  showScreen('gameover');
}

function winGame() {
  state = GameState.VICTORY;
  totalElapsedTime += elapsedTime;
  document.getElementById('final-timer').textContent = formatTime(totalElapsedTime);
  document.getElementById('final-score').textContent = score;
  showScreen('victory');
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function updateHUD() {
  const level = getCurrentLevel();
  document.getElementById('level-info').textContent =
    `${level.id} / ${LEVELS.length}`;
  document.getElementById('level-name').textContent = level.name;
  document.getElementById('score').textContent = score;
  document.getElementById('crystal-status').textContent = `${crystalsCollected} / ${crystalsTotal}`;

  const livesEl = document.getElementById('lives');
  livesEl.textContent = '♥'.repeat(lives) + '♡'.repeat(MAX_LIVES_CAP - lives);
  livesEl.className = 'hud-value lives-display' + (lives <= 1 ? ' lives-low' : '');

  const powerEl = document.getElementById('powerup-status');
  const now = Date.now();
  if (now < speedBoostUntil && now < slowTimeUntil) {
    powerEl.textContent = '⚡🕐';
    powerEl.className = 'hud-value powerup-speed';
  } else if (now < speedBoostUntil) {
    powerEl.textContent = '⚡';
    powerEl.className = 'hud-value powerup-speed';
  } else if (now < slowTimeUntil) {
    powerEl.textContent = '🕐';
    powerEl.className = 'hud-value powerup-slow';
  } else {
    powerEl.textContent = '—';
    powerEl.className = 'hud-value powerup-none';
  }

  const keyEl = document.getElementById('key-status');
  keyEl.textContent = hasKey ? '✓' : '✗';
  keyEl.className = 'hud-value ' + (hasKey ? 'key-found' : 'key-missing');

  const doorEl = document.getElementById('door-status');
  doorEl.textContent = doorOpen ? '🔓' : '🔒';
  doorEl.className = 'hud-value ' + (doorOpen ? 'door-open' : 'door-locked');
}

// ============================================================
// РЕНДЕРИНГ
// ============================================================

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let row = 0; row < mazeHeight; row++) {
    for (let col = 0; col < mazeWidth; col++) {
      const x = col * TILE_SIZE;
      const y = row * TILE_SIZE;
      const tile = maze[row][col];

      drawFloor(x, y, col, row);

      switch (tile) {
        case TILE.WALL: drawWall(x, y); break;
        case TILE.KEY: drawKey(x, y); break;
        case TILE.DOOR: drawDoor(x, y, col, row); break;
        case TILE.EXIT: drawExit(x, y); break;
        case TILE.TORCH: drawTorch(x, y); break;
        case TILE.SYMBOL: drawSymbol(x, y, col, row); break;
        case TILE.CRYSTAL: drawCrystal(x, y, col); break;
        case TILE.TRAP: drawTrap(x, y); break;
        case TILE.CHEST: drawChest(x, y, col, row); break;
        case TILE.SPEED_BOOST: drawSpeedBoost(x, y); break;
        case TILE.SLOW_TIME: drawSlowTime(x, y); break;
        case TILE.EXTRA_LIFE: drawExtraLife(x, y); break;
        case TILE.SECRET_DOOR: drawSecretDoor(x, y, col, row); break;
      }
    }
  }

  applyAmbientLighting();
  drawAllEnemies(ctx, animationFrame);
  drawPlayer();
}

function applyAmbientLighting() {
  ctx.save();

  // Затемнение всего поля
  ctx.fillStyle = 'rgba(5, 5, 20, 0.4)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Свет от факелов
  ctx.globalCompositeOperation = 'lighter';
  for (const torch of torchPositions) {
    const flicker = torchFlicker + Math.sin(animationFrame * 0.2 + torch.x) * 0.1;
    const radius = 90;

    const glow = ctx.createRadialGradient(
      torch.x, torch.y - 4, 0,
      torch.x, torch.y - 4, radius
    );
    glow.addColorStop(0, `rgba(255, 200, 100, ${0.35 * flicker})`);
    glow.addColorStop(0.3, `rgba(255, 140, 50, ${0.15 * flicker})`);
    glow.addColorStop(0.7, `rgba(255, 80, 20, ${0.04 * flicker})`);
    glow.addColorStop(1, 'rgba(255, 60, 10, 0)');

    ctx.fillStyle = glow;
    ctx.fillRect(torch.x - radius, torch.y - radius, radius * 2, radius * 2);
  }

  // Лёгкое свечение ключа и кристаллов сквозь темноту
  for (let row = 0; row < mazeHeight; row++) {
    for (let col = 0; col < mazeWidth; col++) {
      const tile = maze[row][col];
      const cx = col * TILE_SIZE + TILE_SIZE / 2;
      const cy = row * TILE_SIZE + TILE_SIZE / 2;

      if (tile === TILE.KEY) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 35);
        g.addColorStop(0, 'rgba(255, 215, 0, 0.2)');
        g.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 35, cy - 35, 70, 70);
      } else if (tile === TILE.CRYSTAL) {
        const pulse = Math.sin(animationFrame * 0.1 + col) * 0.15 + 0.2;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 30);
        g.addColorStop(0, `rgba(100, 220, 255, ${pulse})`);
        g.addColorStop(1, 'rgba(100, 220, 255, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(cx - 30, cy - 30, 60, 60);
      }
    }
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
}

function drawFloor(x, y, col, row) {
  const variant = (col + row) % 3;
  const colors = [COLORS.floor1, COLORS.floor2, COLORS.floor3];
  ctx.fillStyle = colors[variant];
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
}

function drawWall(x, y) {
  const s = TILE_SIZE;

  ctx.fillStyle = COLORS.wallTop;
  ctx.fillRect(x, y, s, s * 0.6);

  ctx.fillStyle = COLORS.wallFront;
  ctx.fillRect(x, y + s * 0.6, s, s * 0.4);

  ctx.fillStyle = COLORS.wallSide;
  ctx.fillRect(x + s - 6, y + 4, 6, s - 4);

  ctx.fillStyle = COLORS.wallDark;
  ctx.fillRect(x, y + s - 3, s, 3);

  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  const seed = (x * 7 + y * 13) % 5;
  for (let i = 0; i < seed; i++) {
    const px = x + ((x * 3 + y * 5 + i * 11) % (s - 8)) + 4;
    const py = y + ((x * 7 + y * 3 + i * 7) % (s * 0.5 - 4)) + 4;
    ctx.fillRect(px, py, 3, 2);
  }
}

function drawKey(x, y) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const bob = Math.sin(animationFrame * 0.08) * 3;
  const pulse = Math.sin(animationFrame * 0.1) * 0.2 + 0.8;

  // Внешнее свечение
  const outerGlow = ctx.createRadialGradient(cx, cy + bob, 0, cx, cy + bob, 28);
  outerGlow.addColorStop(0, `rgba(255, 215, 0, ${0.5 * pulse})`);
  outerGlow.addColorStop(0.5, `rgba(255, 180, 0, ${0.15 * pulse})`);
  outerGlow.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.fillStyle = outerGlow;
  ctx.fillRect(x - 8, y - 8, TILE_SIZE + 16, TILE_SIZE + 16);

  // Искры
  for (let i = 0; i < 3; i++) {
    const angle = animationFrame * 0.05 + i * 2.1;
    const dist = 14 + Math.sin(animationFrame * 0.15 + i) * 4;
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + bob + Math.sin(angle) * dist;
    ctx.fillStyle = `rgba(255, 240, 150, ${0.6 * pulse})`;
    ctx.fillRect(sx - 1, sy - 1, 2, 2);
  }

  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(cx - 4, cy - 8 + bob, 8, 8);
  ctx.fillStyle = COLORS.sand;
  ctx.fillRect(cx - 2, cy - 6 + bob, 4, 4);

  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(cx - 2, cy + bob, 4, 10);
  ctx.fillRect(cx + 2, cy + 6 + bob, 4, 3);
  ctx.fillRect(cx + 2, cy + 10 + bob, 6, 3);
}

function drawCrystal(x, y, col) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const bob = Math.sin(animationFrame * 0.1 + col) * 2;
  const pulse = Math.sin(animationFrame * 0.12) * 0.3 + 0.7;
  const color = COLORS.crystal || '#44ddff';

  // Внешнее свечение
  const outerGlow = ctx.createRadialGradient(cx, cy + bob, 0, cx, cy + bob, 30);
  outerGlow.addColorStop(0, `rgba(100, 220, 255, ${0.45 * pulse})`);
  outerGlow.addColorStop(0.4, `rgba(80, 180, 255, ${0.12 * pulse})`);
  outerGlow.addColorStop(1, 'rgba(100, 220, 255, 0)');
  ctx.fillStyle = outerGlow;
  ctx.fillRect(x - 10, y - 10, TILE_SIZE + 20, TILE_SIZE + 20);

  // Вращающиеся блики
  for (let i = 0; i < 4; i++) {
    const angle = animationFrame * 0.04 + i * 1.57;
    const bx = cx + Math.cos(angle) * 12;
    const by = cy + bob + Math.sin(angle) * 12;
    ctx.fillStyle = `rgba(255, 255, 255, ${0.4 * pulse})`;
    ctx.fillRect(bx - 1, by - 1, 2, 2);
  }

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - 12 + bob);
  ctx.lineTo(cx + 8, cy + bob);
  ctx.lineTo(cx, cy + 12 + bob);
  ctx.lineTo(cx - 8, cy + bob);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.5 * pulse;
  ctx.fillRect(cx - 2, cy - 6 + bob, 3, 8);
  ctx.globalAlpha = 1;
}

function drawTrap(x, y) {
  const s = TILE_SIZE;
  const pulse = Math.sin(animationFrame * 0.2) * 0.2 + 0.8;

  ctx.fillStyle = `rgba(180, 40, 40, ${0.15 * pulse})`;
  ctx.fillRect(x, y, s, s);

  const cx = x + s / 2;
  const cy = y + s / 2;
  const color = COLORS.trap || '#cc4444';

  // Шипы
  ctx.fillStyle = color;
  for (let i = -1; i <= 1; i++) {
    const sx = cx + i * 10;
    ctx.beginPath();
    ctx.moveTo(sx, cy + 10);
    ctx.lineTo(sx - 5, cy + 2);
    ctx.lineTo(sx + 5, cy + 2);
    ctx.closePath();
    ctx.fill();
  }

  // Предупреждающие полосы
  ctx.fillStyle = 'rgba(255, 100, 0, 0.3)';
  ctx.fillRect(x + 4, y + 4, s - 8, 3);
  ctx.fillRect(x + 4, y + s - 7, s - 8, 3);
}

function drawDoor(x, y, col, row) {
  const s = TILE_SIZE;
  const cx = x + s / 2;
  const cy = y + s / 2;

  const anim = doorAnims.find(d => d.col === col && d.row === row);
  const progress = anim ? anim.progress : 0;
  const slide = progress * (s * 0.38);
  const fade = 1 - progress * 0.7;

  // Рама
  ctx.fillStyle = COLORS.doorFrame;
  ctx.fillRect(x + 2, y + 2, s - 4, s - 4);

  // Левая створка
  ctx.fillStyle = COLORS.doorWood;
  ctx.globalAlpha = fade;
  ctx.fillRect(x + 4 - slide, y + 6, s * 0.4, s - 12);
  // Правая створка
  ctx.fillRect(x + s * 0.55 + slide, y + 6, s * 0.4, s - 12);
  ctx.globalAlpha = 1;

  // Замок (исчезает при открытии)
  if (progress < 0.5) {
    const lockAlpha = 1 - progress * 2;
    ctx.globalAlpha = lockAlpha;
    ctx.fillStyle = COLORS.goldDark;
    ctx.fillRect(cx - 4, cy - 2, 8, 10);
    ctx.fillStyle = COLORS.gold;
    ctx.fillRect(cx - 2, cy + 4, 4, 4);
    ctx.globalAlpha = 1;
  }

  // Свет из-за двери при открытии
  if (progress > 0.2) {
    const lightAlpha = (progress - 0.2) * 0.6;
    const light = ctx.createRadialGradient(cx, cy, 0, cx, cy, s);
    light.addColorStop(0, `rgba(255, 220, 100, ${lightAlpha})`);
    light.addColorStop(1, 'rgba(255, 220, 100, 0)');
    ctx.fillStyle = light;
    ctx.fillRect(x, y, s, s);
  }

  if (!doorOpen) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 4, y + 4, s - 8, s - 8);
  }
}

function drawExit(x, y) {
  const s = TILE_SIZE;
  const pulse = Math.sin(animationFrame * 0.06) * 0.3 + 0.7;

  if (doorOpen) {
    const glow = ctx.createRadialGradient(x + s / 2, y + s / 2, 0, x + s / 2, y + s / 2, s);
    glow.addColorStop(0, `rgba(68, 255, 136, ${0.3 * pulse})`);
    glow.addColorStop(1, 'rgba(68, 255, 136, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, s, s);
  }

  ctx.fillStyle = COLORS.exitBase;
  ctx.fillRect(x + 4, y + 4, s - 8, s - 8);

  ctx.fillStyle = doorOpen ? COLORS.exitGlow : '#1a4a2a';
  ctx.globalAlpha = doorOpen ? pulse : 0.5;
  ctx.fillRect(x + 10, y + 8, s - 20, s - 14);
  ctx.globalAlpha = 1;

  ctx.fillStyle = COLORS.wallTop;
  ctx.fillRect(x + 6, y + s - 8, s - 12, 4);
  ctx.fillRect(x + 10, y + s - 4, s - 20, 4);

  ctx.fillStyle = doorOpen ? '#ffffff' : COLORS.symbol;
  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  ctx.fillText('☥', x + s / 2, y + s / 2 + 6);
}

function drawTorch(x, y) {
  const s = TILE_SIZE;
  const cx = x + s / 2;
  const flicker = torchFlicker + Math.sin(animationFrame * 0.3 + x) * 0.15;

  ctx.fillStyle = COLORS.wallSide;
  ctx.fillRect(cx - 2, y + 8, 4, 12);

  ctx.fillStyle = COLORS.torchWood;
  ctx.fillRect(cx - 3, y + 18, 6, 14);

  // Пламя (многослойное)
  ctx.fillStyle = COLORS.flame2;
  ctx.globalAlpha = flicker * 0.8;
  ctx.fillRect(cx - 6, y + 2, 12, 18);
  ctx.fillStyle = COLORS.flame1;
  ctx.globalAlpha = flicker;
  ctx.fillRect(cx - 4, y + 4, 8, 14);
  ctx.fillStyle = '#ffffaa';
  ctx.globalAlpha = flicker * 0.7;
  ctx.fillRect(cx - 2, y + 6, 4, 8);
  ctx.globalAlpha = 1;
}

function drawSymbol(x, y, col, row) {
  const symbols = ['☥', '𓂀', '◆', '❖', '✦'];
  const idx = (col * 3 + row * 7) % symbols.length;
  ctx.fillStyle = COLORS.symbol;
  ctx.globalAlpha = 0.35;
  ctx.font = '18px serif';
  ctx.textAlign = 'center';
  ctx.fillText(symbols[idx], x + TILE_SIZE / 2, y + TILE_SIZE / 2 + 6);
  ctx.globalAlpha = 1;
}

function drawChest(x, y, col, row) {
  const s = TILE_SIZE;
  const cx = x + s / 2;
  const cy = y + s / 2;
  const bob = Math.sin(animationFrame * 0.07) * 2;
  const pulse = Math.sin(animationFrame * 0.1) * 0.2 + 0.8;

  const glow = ctx.createRadialGradient(cx, cy + bob, 0, cx, cy + bob, 24);
  glow.addColorStop(0, `rgba(255, 180, 50, ${0.35 * pulse})`);
  glow.addColorStop(1, 'rgba(255, 180, 50, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - 4, y - 4, s + 8, s + 8);

  ctx.fillStyle = '#6b4226';
  ctx.fillRect(x + 6, y + 14 + bob, s - 12, s - 18);
  ctx.fillStyle = '#8b5a2a';
  ctx.fillRect(x + 8, y + 8 + bob, s - 16, 8);
  ctx.fillStyle = COLORS.goldDark;
  ctx.fillRect(cx - 5, cy + 2 + bob, 10, 6);
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(cx - 3, cy + 4 + bob, 6, 3);
}

function drawSpeedBoost(x, y) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const pulse = Math.sin(animationFrame * 0.15) * 0.3 + 0.7;

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
  glow.addColorStop(0, `rgba(255, 150, 50, ${0.4 * pulse})`);
  glow.addColorStop(1, 'rgba(255, 150, 50, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.fillStyle = '#ffaa44';
  ctx.font = 'bold 18px serif';
  ctx.textAlign = 'center';
  ctx.fillText('⚡', cx, cy + 6);
}

function drawSlowTime(x, y) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const pulse = Math.sin(animationFrame * 0.12) * 0.3 + 0.7;

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
  glow.addColorStop(0, `rgba(150, 100, 255, ${0.35 * pulse})`);
  glow.addColorStop(1, 'rgba(150, 100, 255, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.fillStyle = '#aa88ff';
  ctx.font = 'bold 16px serif';
  ctx.textAlign = 'center';
  ctx.fillText('🕐', cx, cy + 6);
}

function drawExtraLife(x, y) {
  const cx = x + TILE_SIZE / 2;
  const cy = y + TILE_SIZE / 2;
  const pulse = Math.sin(animationFrame * 0.1) * 0.2 + 0.8;

  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, 22);
  glow.addColorStop(0, `rgba(255, 80, 80, ${0.35 * pulse})`);
  glow.addColorStop(1, 'rgba(255, 80, 80, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);

  ctx.fillStyle = '#ff4444';
  ctx.font = 'bold 18px serif';
  ctx.textAlign = 'center';
  ctx.fillText('♥', cx, cy + 6);
}

function drawSecretDoor(x, y, col, row) {
  const s = TILE_SIZE;
  const cx = x + s / 2;
  const discovered = discoveredSecrets.has(`${col},${row}`);
  const pulse = Math.sin(animationFrame * 0.08) * 0.2 + 0.8;

  if (!discovered) {
    const glow = ctx.createRadialGradient(cx, y + s / 2, 0, cx, y + s / 2, s);
    glow.addColorStop(0, `rgba(180, 140, 255, ${0.25 * pulse})`);
    glow.addColorStop(1, 'rgba(180, 140, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(x, y, s, s);
  }

  ctx.fillStyle = discovered ? COLORS.floor2 : '#5a4a6a';
  ctx.fillRect(x + 4, y + 4, s - 8, s - 8);

  ctx.fillStyle = discovered ? COLORS.gold : '#aa88cc';
  ctx.font = '16px serif';
  ctx.textAlign = 'center';
  ctx.fillText(discovered ? '✦' : '?', cx, y + s / 2 + 6);

  if (!discovered) {
    ctx.strokeStyle = `rgba(200, 160, 255, ${0.5 * pulse})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 6, y + 6, s - 12, s - 12);
  }
}

function drawPlayer() {
  const px = player.renderX;
  const py = player.renderY;
  const half = PLAYER_SIZE / 2;

  if (Date.now() < speedBoostUntil && player.moving) {
    ctx.fillStyle = 'rgba(255, 170, 60, 0.25)';
    ctx.beginPath();
    ctx.ellipse(px, py + half, half - 4, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  if (Date.now() < invincibleUntil) {
    ctx.globalAlpha = 0.5 + Math.sin(animationFrame * 0.5) * 0.3;
  }

  drawCharacterSprite(ctx, px, py, getSelectedCharacter(), player.dir, player.moving, animationFrame);
  ctx.globalAlpha = 1;
}

document.addEventListener('DOMContentLoaded', init);
