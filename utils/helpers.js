// Shuffle array (Fisher-Yates)
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Get level info from XP
function getLevel(xp) {
  if (xp >= 5000) return { level: 7, nama: '🏆 Master', next: null, emoji: '🏆' };
  if (xp >= 3000) return { level: 6, nama: '🐉 Ahli', next: 5000, emoji: '🐉' };
  if (xp >= 1500) return { level: 5, nama: '⭐ Mahir', next: 3000, emoji: '⭐' };
  if (xp >= 800) return { level: 4, nama: '📖 Menengah', next: 1500, emoji: '📖' };
  if (xp >= 400) return { level: 3, nama: '📗 Pelajar', next: 800, emoji: '📗' };
  if (xp >= 150) return { level: 2, nama: '🌱 Pemula+', next: 400, emoji: '🌱' };
  return { level: 1, nama: '🐣 Pemula', next: 150, emoji: '🐣' };
}

// XP progress bar
function xpBar(xp, next) {
  if (!next) return '██████████ MAX';
  const pct = Math.min(xp / next, 1);
  const filled = Math.round(pct * 10);
  const empty = 10 - filled;
  return '█'.repeat(filled) + '░'.repeat(empty) + ` ${Math.round(pct * 100)}%`;
}

// Hearts display
function heartsDisplay(hearts) {
  return '❤️'.repeat(Math.max(hearts, 0)) + '🖤'.repeat(Math.max(5 - hearts, 0));
}

// String similarity (for susun kalimat)
function similarity(a, b) {
  if (!a || !b) return 0;
  a = a.replace(/\s+/g, '').toLowerCase();
  b = b.replace(/\s+/g, '').toLowerCase();
  if (a === b) return 100;
  const len = Math.max(a.length, b.length);
  let match = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] === b[i]) match++;
  }
  return Math.round((match / len) * 100);
}

// Today's date string
function todayStr() {
  return new Date().toISOString().split('T')[0];
}

// Generate word search grid
function generateWordSearchGrid(words, fillers, size = 6) {
  // Pick 3 random words that fit
  const picked = shuffle(words).slice(0, 3);
  const grid = Array.from({ length: size }, () => Array(size).fill(''));
  const placed = [];

  for (const word of picked) {
    const chars = word.split('');
    if (chars.length > size) continue;

    let success = false;
    for (let attempt = 0; attempt < 50; attempt++) {
      const dir = Math.random() < 0.5 ? 'h' : 'v'; // horizontal or vertical
      const maxR = dir === 'v' ? size - chars.length : size - 1;
      const maxC = dir === 'h' ? size - chars.length : size - 1;
      const r = Math.floor(Math.random() * (maxR + 1));
      const c = Math.floor(Math.random() * (maxC + 1));

      let canPlace = true;
      for (let i = 0; i < chars.length; i++) {
        const cr = dir === 'v' ? r + i : r;
        const cc = dir === 'h' ? c + i : c;
        if (grid[cr][cc] !== '' && grid[cr][cc] !== chars[i]) {
          canPlace = false;
          break;
        }
      }

      if (canPlace) {
        for (let i = 0; i < chars.length; i++) {
          const cr = dir === 'v' ? r + i : r;
          const cc = dir === 'h' ? c + i : c;
          grid[cr][cc] = chars[i];
        }
        placed.push({ word, dir, r, c });
        success = true;
        break;
      }
    }
  }

  // Fill empty cells with random fillers
  const shuffledFillers = shuffle(fillers);
  let fi = 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c] === '') {
        grid[r][c] = shuffledFillers[fi % shuffledFillers.length];
        fi++;
      }
    }
  }

  return { grid, placed };
}

// Render grid to string
function renderGrid(grid) {
  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣'];
  let result = '⬛' + numberEmojis.slice(0, grid[0].length).join('') + '\n';
  for (let r = 0; r < grid.length; r++) {
    result += numberEmojis[r];
    for (let c = 0; c < grid[r].length; c++) {
      result += ` ${grid[r][c]}`;
    }
    result += '\n';
  }
  return result;
}

// Adaptive difficulty: get weak words for user
function getWeakWords(db, userId, limit = 10) {
  const rows = db.prepare(`
    SELECT uw.word_id, uw.times_correct, uw.times_wrong, w.hanzi, w.pinyin, w.arti,
           w.unit, w.lesson, w.contoh, w.contoh_pinyin, w.contoh_arti,
           CASE WHEN uw.times_wrong > 0 THEN CAST(uw.times_correct AS REAL) / (uw.times_correct + uw.times_wrong) ELSE 1.0 END as accuracy
    FROM user_words uw
    JOIN words w ON uw.word_id = w.id
    WHERE uw.user_id = ?
    ORDER BY accuracy ASC, uw.times_wrong DESC
    LIMIT ?
  `).all(userId, limit);
  return rows;
}

// Get words needing review (SRS)
function getReviewWords(db, userId, limit = 10) {
  const now = new Date().toISOString();
  const rows = db.prepare(`
    SELECT uw.word_id, uw.times_correct, uw.times_wrong, w.hanzi, w.pinyin, w.arti,
           w.unit, w.lesson, w.contoh, w.contoh_pinyin, w.contoh_arti
    FROM user_words uw
    JOIN words w ON uw.word_id = w.id
    WHERE uw.user_id = ? AND uw.next_review <= ?
    ORDER BY uw.next_review ASC
    LIMIT ?
  `).all(userId, now, limit);
  return rows;
}

// Calculate next review date based on SRS
function nextReviewDate(timesCorrect, wasCorrect) {
  const now = new Date();
  if (!wasCorrect) {
    now.setHours(now.getHours() + 4);
    return now.toISOString();
  }
  const intervals = [1, 3, 7, 14, 30]; // days
  const idx = Math.min(timesCorrect, intervals.length - 1);
  now.setDate(now.getDate() + intervals[idx]);
  return now.toISOString();
}

// Daily login reward calculation
function getDailyReward(streak) {
  const base = 10;
  const bonus = Math.min(Math.floor(streak / 7) * 5, 50); // +5 per week, max +50
  return base + bonus;
}

module.exports = {
  shuffle,
  getLevel,
  xpBar,
  heartsDisplay,
  similarity,
  todayStr,
  generateWordSearchGrid,
  renderGrid,
  getWeakWords,
  getReviewWords,
  nextReviewDate,
  getDailyReward,
};
