/**
 * Персонажи игрока — пиксельные спрайты и анимация
 */

const CHARACTERS = [
  {
    id: 'traveler',
    name: 'Путешественник',
    description: 'Искатель приключений в песках древности',
    colors: {
      body: '#4a8a6a',
      head: '#3a7a5a',
      skin: '#d4a86a',
      accent: '#ffd700',
      detail: '#6b4226',
    },
    speedMult: 1,
  },
  {
    id: 'turtle',
    name: 'Черепашка',
    description: 'Медленная, но выносливая хранительница храма',
    colors: {
      body: '#5a8a4a',
      head: '#4a7a3a',
      skin: '#8aba6a',
      accent: '#aadd66',
      detail: '#3a5a2a',
      shell: '#6a9a5a',
    },
    speedMult: 0.82,
  },
  {
    id: 'frog',
    name: 'Лягушонок',
    description: 'Прыгучий обитатель священных болот',
    colors: {
      body: '#4a9a5a',
      head: '#3a8a4a',
      skin: '#7acc6a',
      accent: '#ffee44',
      detail: '#2a6a3a',
    },
    speedMult: 1.12,
  },
];

let selectedCharacterId = 'traveler';

const CharacterSelect = {
  init(onConfirm) {
    this.onConfirm = onConfirm;
    this.renderCards();
    this.bindEvents();
    this.select(CHARACTERS[0].id);
  },

  bindEvents() {
    document.getElementById('btn-char-back').addEventListener('click', () => {
      Audio.play('ui');
      showScreen('start');
    });
    document.getElementById('btn-char-start').addEventListener('click', () => {
      Audio.play('ui');
      if (this.onConfirm) this.onConfirm(selectedCharacterId);
    });
  },

  select(id) {
    selectedCharacterId = id;
    document.querySelectorAll('.char-card').forEach(card => {
      card.classList.toggle('active', card.dataset.id === id);
    });
    const ch = CHARACTERS.find(c => c.id === id);
    const desc = document.getElementById('char-description');
    if (desc && ch) desc.textContent = ch.description;
  },

  renderCards() {
    const container = document.getElementById('char-cards');
    container.innerHTML = '';

    CHARACTERS.forEach((ch) => {
      const card = document.createElement('button');
      card.type = 'button';
      card.className = 'char-card';
      card.dataset.id = ch.id;

      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      canvas.className = 'char-preview';

      card.innerHTML = `<span class="char-name">${ch.name}</span>`;
      card.prepend(canvas);

      card.addEventListener('click', () => {
        Audio.play('ui');
        this.select(ch.id);
        this.drawPreview(canvas, ch, true);
      });

      container.appendChild(card);
      this.drawPreview(canvas, ch, false);
    });
  },

  drawPreview(canvas, ch, moving) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.imageSmoothingEnabled = false;
    drawCharacterSprite(ctx, 32, 36, ch, 'down', moving, Math.floor(Date.now() / 120));
  },

  animatePreviews() {
    if (state !== GameState.CHAR_SELECT) return;
    document.querySelectorAll('.char-card').forEach((card) => {
      const ch = CHARACTERS.find(c => c.id === card.dataset.id);
      const canvas = card.querySelector('canvas');
      if (ch && canvas) {
        const moving = card.classList.contains('active');
        this.drawPreview(canvas, ch, moving);
      }
    });
    requestAnimationFrame(() => this.animatePreviews());
  },
};

function getSelectedCharacter() {
  return CHARACTERS.find(c => c.id === selectedCharacterId) || CHARACTERS[0];
}

function drawCharacterSprite(ctx, px, py, character, dir, moving, frame) {
  const c = character.colors;
  const s = 28;
  const half = s / 2;
  const walkBob = moving ? Math.sin(frame * 0.45) * 2.5 : 0;
  const drawY = py + walkBob;

  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(px, py + half - 2, half - 2, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (character.id === 'turtle') {
    ctx.fillStyle = c.shell || c.body;
    ctx.fillRect(px - half, drawY - half + 6, s, s - 8);
    ctx.fillStyle = c.detail;
    ctx.fillRect(px - half + 4, drawY - half + 10, s - 8, s - 14);
    ctx.fillStyle = c.body;
    ctx.fillRect(px - half + 6, drawY - half + 2, s - 12, 10);
    ctx.fillStyle = c.skin;
    ctx.fillRect(px - 5, drawY - half + 4, 10, 7);
    ctx.fillStyle = c.accent;
    ctx.fillRect(px - 2, drawY - half + 6, 4, 3);
    if (moving) {
      const leg = Math.sin(frame * 0.45) * 2;
      ctx.fillStyle = c.detail;
      ctx.fillRect(px - 7, drawY + half - 5, 5, 3 + leg * 0.2);
      ctx.fillRect(px + 2, drawY + half - 5, 5, 3 - leg * 0.2);
    }
  } else if (character.id === 'frog') {
    ctx.fillStyle = c.body;
    ctx.fillRect(px - half + 2, drawY - 2, s - 4, s - 8);
    ctx.fillStyle = c.head;
    ctx.beginPath();
    ctx.ellipse(px, drawY - half + 8, half - 2, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = c.skin;
    ctx.fillRect(px - 8, drawY - half + 2, 6, 6);
    ctx.fillRect(px + 2, drawY - half + 2, 6, 6);
    ctx.fillStyle = '#fff';
    ctx.fillRect(px - 6, drawY - half + 4, 3, 3);
    ctx.fillRect(px + 3, drawY - half + 4, 3, 3);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(px - 5, drawY - half + 5, 2, 2);
    ctx.fillRect(px + 4, drawY - half + 5, 2, 2);
    if (moving) {
      const hop = Math.abs(Math.sin(frame * 0.5)) * 3;
      ctx.fillStyle = c.detail;
      ctx.fillRect(px - 8, drawY + half - 4 - hop, 6, 4);
      ctx.fillRect(px + 2, drawY + half - 4 - hop, 6, 4);
    } else {
      ctx.fillStyle = c.detail;
      ctx.fillRect(px - 8, drawY + half - 4, 6, 4);
      ctx.fillRect(px + 2, drawY + half - 4, 6, 4);
    }
  } else {
    ctx.fillStyle = c.body;
    ctx.fillRect(px - half + 4, drawY - half + 8, s - 8, s - 10);
    ctx.fillStyle = c.head;
    ctx.fillRect(px - half + 6, drawY - half + 2, s - 12, 10);
    ctx.fillStyle = c.skin;
    ctx.fillRect(px - 4, drawY - half + 4, 8, 6);
    ctx.fillStyle = c.detail;
    ctx.fillRect(px - 3, drawY - 2, 6, 8);
    ctx.fillStyle = c.accent;
    ctx.fillRect(px - 2, drawY, 4, 4);
    if (moving) {
      const legOffset = Math.sin(frame * 0.45) * 3;
      ctx.fillStyle = c.head;
      ctx.fillRect(px - 5, drawY + half - 6, 4, 4 + legOffset * 0.3);
      ctx.fillRect(px + 1, drawY + half - 6, 4, 4 - legOffset * 0.3);
    }
  }

  ctx.fillStyle = c.accent;
  const dirOffset = { up: [0, -6], down: [0, 6], left: [-6, 0], right: [6, 0] };
  const [ox, oy] = dirOffset[dir] || dirOffset.down;
  ctx.fillRect(px + ox - 2, drawY + oy - 2, 4, 4);
}
