const challenges = [
  { id: 1,  type: 'lesson',  title: 'Pelajari 1 Lesson',        desc: 'Selesaikan minimal 1 lesson hari ini',      target: 1,  xp: 30  },
  { id: 2,  type: 'review',  title: 'Review 5 Kata',            desc: 'Review minimal 5 kata hari ini',            target: 5,  xp: 25  },
  { id: 3,  type: 'correct', title: 'Jawab 10 Benar',           desc: 'Jawab 10 soal dengan benar',               target: 10, xp: 40  },
  { id: 4,  type: 'perfect', title: 'Perfect Lesson!',          desc: 'Selesaikan 1 lesson tanpa salah',           target: 1,  xp: 50  },
  { id: 5,  type: 'lesson',  title: 'Pelajari 2 Lesson',        desc: 'Selesaikan 2 lesson hari ini',              target: 2,  xp: 60  },
  { id: 6,  type: 'review',  title: 'Review Master',            desc: 'Review 10 kata hari ini',                   target: 10, xp: 50  },
  { id: 7,  type: 'correct', title: 'Jawab 20 Benar',           desc: 'Jawab 20 soal dengan benar hari ini',      target: 20, xp: 70  },
  { id: 8,  type: 'streak',  title: 'Jaga Streak!',             desc: 'Pastikan streak tidak putus hari ini',      target: 1,  xp: 20  },
  { id: 9,  type: 'lesson',  title: 'Maraton Lesson',           desc: 'Selesaikan 3 lesson hari ini',              target: 3,  xp: 90  },
  { id: 10, type: 'correct', title: 'Akurasi Tinggi',           desc: 'Jawab 15 soal benar dengan max 2 salah',   target: 15, xp: 60  },
];
module.exports = challenges;
