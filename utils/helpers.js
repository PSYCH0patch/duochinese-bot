function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getLevelInfo(xp) {
  const levels = [
    { level: 1, min: 0,    max: 100,      name: '🐣 Pemula' },
    { level: 2, min: 100,  max: 300,      name: '🐥 Belajar' },
    { level: 3, min: 300,  max: 600,      name: '🐤 Berkembang' },
    { level: 4, min: 600,  max: 1000,     name: '🐔 Lancar' },
    { level: 5, min: 1000, max: 2000,     name: '🦅 Percaya Diri' },
    { level: 6, min: 2000, max: 4000,     name: '🐉 Mahir' },
    { level: 7, min: 4000, max: Infinity, name: '🏆 Master' },
  ];
  for (let i = levels.length - 1; i >= 0; i--) {
    if (xp >= levels[i].min) {
      const current = xp - levels[i].min;
      const needed = levels[i].max === Infinity ? 999 : levels[i].max - levels[i].min;
      return { ...levels[i], current, needed, progress: Math.min(current / needed, 1) };
    }
  }
  return { ...levels[0], current: 0, needed: 100, progress: 0 };
}

function progressBar(progress, len = 10) {
  const f = Math.round(progress * len);
  return '█'.repeat(f) + '░'.repeat(len - f);
}

function streakEmoji(streak) {
  if (streak >= 30) return '⭐';
  if (streak >= 7)  return '🔥';
  if (streak >= 3)  return '🔥';
  return '💫';
}

module.exports = { shuffleArray, getToday, getLevelInfo, progressBar, streakEmoji };
