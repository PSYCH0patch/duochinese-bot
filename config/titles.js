const TITLES = [
  { minXp: 0,    title: '学生', titleEn: 'Pelajar', emoji: '📖' },
  { minXp: 500,  title: '努力者', titleEn: 'Pekerja Keras', emoji: '💪' },
  { minXp: 1500, title: '学者', titleEn: 'Cendekiawan', emoji: '🎓' },
  { minXp: 3000, title: '专家', titleEn: 'Ahli', emoji: '⭐' },
  { minXp: 5000, title: '大师', titleEn: 'Master', emoji: '🏆' },
];

function getTitle(xp) {
  let result = TITLES[0];
  for (const t of TITLES) {
    if (xp >= t.minXp) result = t;
  }
  return result;
}

module.exports = { TITLES, getTitle };
