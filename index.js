require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

// === UNIVERSAL DATA LOADER ===
function loadData(filePath) {
  try {
    const mod = require(filePath);
    if (Array.isArray(mod)) return mod;
    const keys = Object.keys(mod);
    for (const key of keys) {
      if (Array.isArray(mod[key])) return mod[key];
    }
    return [];
  } catch (e) {
    console.log(`⚠️  Cannot load ${filePath}: ${e.message}`);
    return [];
  }
}

// === FIELD NORMALIZER ===
// Normalize badges: support both {name/nama, description/deskripsi, emoji}
function normalizeBadge(b) {
  return {
    id: b.id,
    emoji: b.emoji || '🏅',
    nama: b.nama || b.name || b.title || String(b.id),
    deskripsi: b.deskripsi || b.description || b.desc || '',
  };
}

// Normalize lessons: support both {title/nama, description/deskripsi}
function normalizeLesson(l) {
  return {
    id: l.id,
    unit: l.unit,
    nama: l.nama || l.title || l.name || `Lesson ${l.id}`,
    deskripsi: l.deskripsi || l.description || l.desc || '',
    wordIds: l.wordIds || l.word_ids || [],
    isBoss: l.isBoss || l.is_boss || false,
  };
}

// Normalize grammar
function normalizeGrammar(g) {
  return {
    id: g.id,
    judul: g.judul || g.title || g.nama || `Grammar ${g.id}`,
    level: g.level || 'HSK 1',
    penjelasan: g.penjelasan || g.explanation || g.content || g.desc || '',
  };
}

// Normalize challenge
function normalizeChallenge(c) {
  return {
    id: c.id,
    nama: c.nama || c.title || c.name || `Challenge ${c.id}`,
    deskripsi: c.deskripsi || c.description || c.desc || '',
    target: c.target || 5,
    xpReward: c.xpReward || c.xp || c.reward || 30,
    kategori: c.kategori || c.type || c.category || 'umum',
  };
}

// Normalize tone: support both formats
// Old: { id, hanzi, tone, pinyin, arti, audio }
// New: { hanzi, jawaban, opsi }
function normalizeTone(t) {
  if (t.opsi && t.jawaban) {
    // Already new format
    return { hanzi: t.hanzi, jawaban: t.jawaban, opsi: t.opsi };
  }
  // Old format — generate options from pinyin with tone marks
  const pinyin = t.pinyin || '';
  const base = pinyin.replace(/[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/g, (c) => {
    const map = {
      'ā':'a','á':'a','ǎ':'a','à':'a',
      'ē':'e','é':'e','ě':'e','è':'e',
      'ī':'i','í':'i','ǐ':'i','ì':'i',
      'ō':'o','ó':'o','ǒ':'o','ò':'o',
      'ū':'u','ú':'u','ǔ':'u','ù':'u',
      'ǖ':'ü','ǘ':'ü','ǚ':'ü','ǜ':'ü',
    };
    return map[c] || c;
  });
  // Generate 4 tone variants
  const toneMarks = [
    ['a','ā','á','ǎ','à'], ['e','ē','é','ě','è'],
    ['i','ī','í','ǐ','ì'], ['o','ō','ó','ǒ','ò'],
    ['u','ū','ú','ǔ','ù'],
  ];
  const variants = new Set([pinyin]);
  for (const [plain, t1, t2, t3, t4] of toneMarks) {
    if (base.includes(plain)) {
      variants.add(base.replace(plain, t1));
      variants.add(base.replace(plain, t2));
      variants.add(base.replace(plain, t3));
      variants.add(base.replace(plain, t4));
    }
  }
  const opsiArr = [...variants].slice(0, 4);
  while (opsiArr.length < 4) opsiArr.push(base + opsiArr.length);
  return { hanzi: t.hanzi, jawaban: pinyin, opsi: opsiArr };
}

// === LOAD ALL DATA ===
const rawWords      = loadData('./data/words');
const rawLessons    = loadData('./data/lessons');
const rawBadges     = loadData('./data/badges');
const rawGrammar    = loadData('./data/grammar');
const rawChallenges = loadData('./data/challenges');
const rawTones      = loadData('./data/tones');

// HSK 2
const rawWordsHsk2      = loadData('./data/words_hsk2');
const rawLessonsHsk2    = loadData('./data/lessons_hsk2');
const rawGrammarHsk2    = loadData('./data/grammar_hsk2');
const rawTonesHsk2      = loadData('./data/tones_hsk2');
const rawSusunHsk2      = loadData('./data/susun_hsk2');
const rawChallengesHsk2 = loadData('./data/challenges_hsk2');
const emojiGame         = loadData('./data/emoji_game');
const wordsearchPools   = loadData('./data/wordsearch');

// Susun HSK1 — try multiple filenames
let rawSusunHsk1 = loadData('./data/susun_kalimat');
if (rawSusunHsk1.length === 0) rawSusunHsk1 = loadData('./data/susun');
if (rawSusunHsk1.length === 0) rawSusunHsk1 = loadData('./data/sentences');

// === NORMALIZE ALL DATA ===
const words      = rawWords;      // words already have standard fields
const wordsHsk2  = rawWordsHsk2;
const badges     = rawBadges.map(normalizeBadge);
const lessons    = rawLessons.map(normalizeLesson);
const lessonsHsk2 = rawLessonsHsk2.map(normalizeLesson);
const grammar    = rawGrammar.map(normalizeGrammar);
const grammarHsk2 = rawGrammarHsk2.map(normalizeGrammar);
const challenges  = rawChallenges.map(normalizeChallenge);
const challengesHsk2 = rawChallengesHsk2.map(normalizeChallenge);
const tones      = rawTones.map(normalizeTone);
const tonesHsk2  = rawTonesHsk2.map(normalizeTone);
const susun      = [...rawSusunHsk1, ...rawSusunHsk2];

// === COMBINED ARRAYS ===
const allWords      = [...words, ...wordsHsk2];
const allLessons    = [...lessons, ...lessonsHsk2];
const allGrammar    = [...grammar, ...grammarHsk2];
const allTones      = [...tones, ...tonesHsk2];
const allChallenges = [...challenges, ...challengesHsk2];

// === HELPERS ===
const {
  shuffle, getLevel, xpBar, heartsDisplay, similarity,
  todayStr, generateWordSearchGrid, renderGrid,
  getWeakWords, getReviewWords, nextReviewDate, getDailyReward
} = require('./utils/helpers');

// === DATABASE ===
const db = new Database(path.join(__dirname, 'database', 'duochinese.db'));
db.pragma('journal_mode = WAL');

// === DISCORD CLIENT ===
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// === SESSION MAPS ===
const sessions          = new Map();
const battleSessions    = new Map();
const wordsearchSessions = new Map();
const speedSessions     = new Map();

// ============================================================
// === DB HELPER FUNCTIONS ===
// ============================================================

function ensureUser(userId, username) {
  if (!db.prepare('SELECT user_id FROM users WHERE user_id = ?').get(userId)) {
    db.prepare(`INSERT INTO users (user_id, username, last_active, hearts_refreshed_at, created_at)
      VALUES (?, ?, ?, ?, ?)`
    ).run(userId, username, todayStr(), new Date().toISOString(), new Date().toISOString());
  }
  return db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
}

function updateStreak(userId) {
  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (user.last_active === today) return user.streak || 0;
  const newStreak = user.last_active === yesterday ? (user.streak || 0) + 1 : 1;
  const maxStreak = Math.max(newStreak, user.max_streak || 0);
  db.prepare('UPDATE users SET streak=?, max_streak=?, last_active=? WHERE user_id=?')
    .run(newStreak, maxStreak, today, userId);
  return newStreak;
}

function addXp(userId, amount, guildId = null) {
  if (!amount || amount <= 0) return;
  db.prepare('UPDATE users SET xp = xp + ? WHERE user_id = ?').run(amount, userId);
  if (guildId) {
    if (db.prepare('SELECT 1 FROM server_xp WHERE user_id=? AND guild_id=?').get(userId, guildId)) {
      db.prepare('UPDATE server_xp SET xp=xp+? WHERE user_id=? AND guild_id=?').run(amount, userId, guildId);
    } else {
      db.prepare('INSERT INTO server_xp (user_id, guild_id, xp) VALUES (?,?,?)').run(userId, guildId, amount);
    }
  }
  const { xp } = db.prepare('SELECT xp FROM users WHERE user_id=?').get(userId);
  db.prepare('UPDATE users SET level=? WHERE user_id=?').run(getLevel(xp).level, userId);
}

function checkHearts(userId) {
  const u = db.prepare('SELECT hearts, hearts_refreshed_at FROM users WHERE user_id=?').get(userId);
  if (u.hearts < 5 && u.hearts_refreshed_at) {
    const hrs = (Date.now() - new Date(u.hearts_refreshed_at)) / 3600000;
    if (hrs >= 1) {
      const add = Math.min(Math.floor(hrs), 5 - u.hearts);
      db.prepare('UPDATE users SET hearts=MIN(hearts+?,5), hearts_refreshed_at=? WHERE user_id=?')
        .run(add, new Date().toISOString(), userId);
    }
  }
  return db.prepare('SELECT hearts FROM users WHERE user_id=?').get(userId).hearts;
}

function loseHeart(userId) {
  db.prepare('UPDATE users SET hearts=MAX(hearts-1,0) WHERE user_id=?').run(userId);
  return db.prepare('SELECT hearts FROM users WHERE user_id=?').get(userId).hearts;
}

function awardBadge(userId, badgeId) {
  db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id) VALUES (?,?)').run(userId, badgeId);
}

function checkAndAwardBadges(userId) {
  const user  = db.prepare('SELECT * FROM users WHERE user_id=?').get(userId);
  const earned = new Set(db.prepare('SELECT badge_id FROM user_badges WHERE user_id=?').all(userId).map(b => b.badge_id));
  const wordCount = db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id=? AND times_correct>=3').get(userId).c;
  const newBadges = [];

  const check = (id, cond) => {
    if (cond && !earned.has(id)) { awardBadge(userId, id); newBadges.push(id); }
  };

  check('first_step',    (user.lessons_completed || 0) >= 1);
  check('streak_3',      (user.streak || 0) >= 3);
  check('streak_7',      (user.streak || 0) >= 7);
  check('streak_30',     (user.streak || 0) >= 30);
  check('streak_100',    (user.streak || 0) >= 100);
  check('words_25',      wordCount >= 25);
  check('words_50',      wordCount >= 50);
  check('words_100',     wordCount >= 100);
  check('words_all',     wordCount >= allWords.length);
  check('unit1_done',    (user.current_unit || 1) > 1);
  check('unit4_done',    (user.current_unit || 1) > 4);
  check('all_done',      (user.lessons_completed || 0) >= allLessons.length);
  check('review_master', (user.total_reviews || 0) >= 100);
  check('comeback',      (user.streak || 0) === 1 && (user.max_streak || 0) >= 3);

  return newBadges;
}

// ============================================================
// === QUIZ HELPERS ===
// ============================================================

function generateQuestion(word, pool, type = null) {
  const types = ['arti', 'hanzi', 'pinyin', 'fill'];
  const qType = type || types[Math.floor(Math.random() * types.length)];
  const sameUnit = pool.filter(w => w.unit === word.unit && w.id !== word.id);
  const src = sameUnit.length >= 3 ? sameUnit : pool.filter(w => w.id !== word.id);
  const wrong = shuffle(src).slice(0, 3);

  switch (qType) {
    case 'arti': return {
      type: 'arti',
      question: `Apa arti dari **${word.hanzi}** (${word.pinyin})?`,
      options: shuffle([
        { label: word.arti.slice(0,80), value: `correct_${word.id}`, correct: true },
        ...wrong.map(w => ({ label: w.arti.slice(0,80), value: `wrong_${w.id}`, correct: false }))
      ]), word
    };
    case 'hanzi': return {
      type: 'hanzi',
      question: `Mana hanzi yang artinya **"${word.arti}"**?`,
      options: shuffle([
        { label: word.hanzi, value: `correct_${word.id}`, correct: true },
        ...wrong.map(w => ({ label: w.hanzi, value: `wrong_${w.id}`, correct: false }))
      ]), word
    };
    case 'pinyin': return {
      type: 'pinyin',
      question: `Apa pinyin dari **${word.hanzi}**?`,
      options: shuffle([
        { label: word.pinyin, value: `correct_${word.id}`, correct: true },
        ...wrong.map(w => ({ label: w.pinyin, value: `wrong_${w.id}`, correct: false }))
      ]), word
    };
    case 'fill': {
      if (!word.contoh || !word.contoh.includes(word.hanzi))
        return generateQuestion(word, pool, 'arti');
      return {
        type: 'fill',
        question: `Isi yang hilang:\n${word.contoh.replace(word.hanzi,'____')}\n*(${word.contoh_pinyin})*\n"${word.contoh_arti}"`,
        options: shuffle([
          { label: word.hanzi, value: `correct_${word.id}`, correct: true },
          ...wrong.map(w => ({ label: w.hanzi, value: `wrong_${w.id}`, correct: false }))
        ]), word
      };
    }
    default: return generateQuestion(word, pool, 'arti');
  }
}

function buildUI(question, qNum, totalQ, hearts, label = '') {
  const emojis = ['🅰️','🅱️','🅲','🅳'];
  return {
    embed: new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle(`📝 Soal ${qNum}/${totalQ}`)
      .setDescription(question.question)
      .setFooter({ text: `${heartsDisplay(hearts)} ${label}` }),
    row: new ActionRowBuilder().addComponents(
      question.options.map((opt, i) =>
        new ButtonBuilder()
          .setCustomId(opt.value)
          .setLabel(opt.label.slice(0,80))
          .setEmoji(emojis[i])
          .setStyle(ButtonStyle.Secondary)
      )
    )
  };
}

function startSession(userId, questions, lessonId, guildId, extra = {}) {
  const session = { lessonId, questions, current: 0, score: 0, startTime: Date.now(), guildId, ...extra };
  sessions.set(userId, session);
  return session;
}

async function finishSession(userId, session, interaction) {
  const { questions, score, startTime, guildId, isReview, isTone, isEmoji } = session;
  const total   = questions.length;
  const pct     = Math.round((score / total) * 100);
  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const hearts  = checkHearts(userId);

  // XP
  let xp = score * (isTone ? 5 : isEmoji ? 8 : 10);
  if (!isReview && !isTone && !isEmoji) {
    if (score === total) xp += 20;
    if (elapsed < 60 && total >= 3) xp += 10;
  }
  addXp(userId, xp, guildId);

  // Lesson progress
  if (!isReview && !isTone && !isEmoji) {
    const lesson = allLessons.find(l => l.id === session.lessonId);
    if (lesson) {
      const prev = db.prepare('SELECT best_score FROM user_lessons WHERE user_id=? AND lesson_id=?').get(userId, lesson.id);
      db.prepare('INSERT OR REPLACE INTO user_lessons (user_id,lesson_id,completed,best_score) VALUES (?,?,1,?)')
        .run(userId, lesson.id, Math.max(score, prev?.best_score || 0));
      if (pct >= 60) {
        const user = db.prepare('SELECT current_lesson FROM users WHERE user_id=?').get(userId);
        if ((user.current_lesson || 1) <= lesson.id) {
          const next = allLessons.find(l => l.id === lesson.id + 1);
          if (next) {
            db.prepare('UPDATE users SET current_lesson=?, current_unit=?, lessons_completed=lessons_completed+1 WHERE user_id=?')
              .run(next.id, next.unit, userId);
          } else {
            db.prepare('UPDATE users SET lessons_completed=lessons_completed+1 WHERE user_id=?').run(userId);
          }
        }
      }
      if (lesson.isBoss && score === total) {
        awardBadge(userId, 'boss_slayer');
        if (lesson.id >= allLessons.length - 1) awardBadge(userId, 'final_boss');
      }
    }
    if (score === total)  awardBadge(userId, 'perfect');
    if (elapsed < 30 && total >= 5) awardBadge(userId, 'speed_demon');
    if (hearts === 0 && pct >= 60)  awardBadge(userId, 'survivor');
  }
  if ((db.prepare('SELECT total_reviews FROM users WHERE user_id=?').get(userId).total_reviews || 0) >= 100)
    awardBadge(userId, 'review_master');

  const newBadges = checkAndAwardBadges(userId);

  const title = pct===100 ? '🌟 PERFECT!' : pct>=80 ? '🎉 Hebat!' : pct>=60 ? '👍 Bagus!' : '😅 Coba lagi!';
  const label = isReview ? 'Review' : isTone ? 'Tone Training' : isEmoji ? 'Tebak Emoji' : 'Lesson';

  const embed = new EmbedBuilder()
    .setColor(pct >= 60 ? 0x2ecc71 : 0xe74c3c)
    .setTitle(`${title} — ${label} Selesai!`)
    .addFields(
      { name: '📊 Skor',  value: `${score}/${total} (${pct}%)`, inline: true },
      { name: '💰 XP',    value: `+${xp}`,                      inline: true },
      { name: '⏱️ Waktu', value: `${elapsed}s`,                  inline: true },
      { name: '❤️ Nyawa', value: heartsDisplay(hearts),          inline: true },
    );

  if (newBadges.length > 0) {
    embed.addFields({ name: '🏅 Badge Baru!',
      value: newBadges.map(id => { const b = badges.find(bg=>bg.id===id); return b ? `${b.emoji} ${b.nama}` : id; }).join(', ')
    });
  }

  const weak = getWeakWords(db, userId, 3);
  if (weak.length > 0 && pct < 100) {
    embed.addFields({ name: '🧠 Perlu diulang', value: weak.map(w => `${w.hanzi} (${w.pinyin}) — ${w.arti}`).join('\n') });
  }

  const reviewCount = getReviewWords(db, userId).length;
  embed.setFooter({ text: reviewCount > 0 ? `📌 ${reviewCount} kata perlu /review | /lanjut untuk lanjut` : '✅ Review beres! | /lanjut untuk lanjut' });

  sessions.delete(userId);
  return interaction.update({ embeds: [embed], components: [] });
}

// ============================================================
// === COMMAND HANDLERS ===
// ============================================================

async function handleMulai(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);
  updateStreak(userId);
  db.prepare('UPDATE users SET current_unit=1, current_lesson=1 WHERE user_id=?').run(userId);

  const lesson = allLessons[0];
  if (!lesson) return interaction.reply({ content: '❌ Lesson tidak ditemukan.', ephemeral: true });

  const hearts = checkHearts(userId);
  if (hearts <= 0) return interaction.reply({ content: `💔 Nyawa habis! Tunggu 1 jam atau /review.\n${heartsDisplay(0)}`, ephemeral: true });

  const lessonWords = lesson.wordIds.map(id => allWords.find(w => w.id === id)).filter(Boolean);
  if (!lessonWords.length) return interaction.reply({ content: '❌ Tidak ada kata di lesson ini.', ephemeral: true });

  const qs = shuffle(lesson.isBoss ? lessonWords : lessonWords.slice(0, 5)).map(w => generateQuestion(w, allWords));
  const session = startSession(userId, qs, lesson.id, interaction.guildId);
  const { embed, row } = buildUI(qs[0], 1, qs.length, hearts, `Unit ${lesson.unit} • ${lesson.nama}`);
  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleLanjut(interaction) {
  const userId = interaction.user.id;
  const user = ensureUser(userId, interaction.user.username);
  updateStreak(userId);

  const hearts = checkHearts(userId);
  if (hearts <= 0) return interaction.reply({ content: `💔 Nyawa habis! /review untuk lanjut.\n${heartsDisplay(0)}`, ephemeral: true });

  const lessonId = user.current_lesson || 1;
  const lesson = allLessons.find(l => l.id === lessonId) || allLessons[0];
  if (!lesson) return interaction.reply({ content: '🎉 Semua lesson selesai! Tunggu update berikutnya.', ephemeral: true });

  const lessonWords = lesson.wordIds.map(id => allWords.find(w => w.id === id)).filter(Boolean);
  if (!lessonWords.length) return interaction.reply({ content: '❌ Tidak ada kata di lesson ini.', ephemeral: true });

  const qs = shuffle(lesson.isBoss ? lessonWords : lessonWords.slice(0, 5)).map(w => generateQuestion(w, allWords));
  startSession(userId, qs, lesson.id, interaction.guildId);
  const { embed, row } = buildUI(qs[0], 1, qs.length, hearts, `Unit ${lesson.unit} • ${lesson.nama}`);
  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleReview(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);
  updateStreak(userId);

  const due = getReviewWords(db, userId, 5);
  const wordObjs = (due.length > 0 ? due : getWeakWords(db, userId, 5))
    .map(r => allWords.find(w => w.id === r.word_id)).filter(Boolean);

  if (!wordObjs.length) return interaction.reply({ content: '✅ Tidak ada kata yang perlu di-review! Gunakan /lanjut.', ephemeral: true });

  const qs = wordObjs.map(w => generateQuestion(w, allWords));
  startSession(userId, qs, 'review', interaction.guildId, { isReview: true });
  const hearts = checkHearts(userId);
  const { embed, row } = buildUI(qs[0], 1, qs.length, hearts, due.length > 0 ? '🔄 Review SRS' : '🧠 Review Lemah');
  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleProfil(interaction) {
  const userId = interaction.user.id;
  const user = ensureUser(userId, interaction.user.username);
  const lvl = getLevel(user.xp || 0);
  const wordCount = db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id=? AND times_correct>=3').get(userId).c;
  const badgeCount = db.prepare('SELECT COUNT(*) as c FROM user_badges WHERE user_id=?').get(userId).c;
  const hearts = checkHearts(userId);
  const curLesson = allLessons.find(l => l.id === (user.current_lesson || 1)) || allLessons[0];

  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle(`👤 Profil ${interaction.user.username}`)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      { name: '📊 Level', value: `${lvl.nama}\nXP: ${user.xp||0}${lvl.next ? `/${lvl.next}` : ' MAX'}\n${xpBar(user.xp||0, lvl.next)}` },
      { name: '❤️ Nyawa',  value: heartsDisplay(hearts), inline: true },
      { name: '🔥 Streak', value: `${user.streak||0} hari (Max: ${user.max_streak||0})`, inline: true },
      { name: '📚 Progress', value: `Lesson: ${user.lessons_completed||0}/${allLessons.length}\nKata dikuasai: ${wordCount}/${allWords.length}\nUnit: ${user.current_unit||1}`, inline: true },
      { name: '🎯 Sekarang', value: curLesson ? `Unit ${curLesson.unit}: ${curLesson.nama}` : '-', inline: true },
      { name: '🏅 Badge',   value: `${badgeCount}/${badges.length}`, inline: true },
      { name: '📈 Akurasi', value: (user.total_reviews||0) > 0 ? `${Math.round((user.total_correct/user.total_reviews)*100)}%` : '-', inline: true },
    )
    .setFooter({ text: `Bergabung: ${(user.created_at||'').split('T')[0]||'-'}` })] });
}

async function handleStatistik(interaction) {
  const userId = interaction.user.id;
  const user = ensureUser(userId, interaction.user.username);

  const wrongWords = db.prepare(`SELECT uw.*,w.hanzi,w.pinyin,w.arti FROM user_words uw JOIN words w ON uw.word_id=w.id
    WHERE uw.user_id=? AND uw.times_wrong>0 ORDER BY uw.times_wrong DESC LIMIT 5`).all(userId);

  const catStats = db.prepare(`SELECT w.kategori, COUNT(*) as total,
    SUM(CASE WHEN uw.times_correct>=3 THEN 1 ELSE 0 END) as mastered
    FROM user_words uw JOIN words w ON uw.word_id=w.id WHERE uw.user_id=? GROUP BY w.kategori`).all(userId);

  const unitProgress = db.prepare(`SELECT w.unit, COUNT(DISTINCT w.id) as total,
    COUNT(DISTINCT CASE WHEN uw.times_correct>=3 THEN uw.word_id END) as mastered
    FROM words w LEFT JOIN user_words uw ON w.id=uw.word_id AND uw.user_id=?
    GROUP BY w.unit ORDER BY w.unit`).all(userId);

  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0xe74c3c).setTitle(`📊 Statistik ${interaction.user.username}`)
    .addFields(
      { name: '📈 Overview', value: `Review: ${user.total_reviews||0} | Benar: ${user.total_correct||0} | Akurasi: ${(user.total_reviews||0)>0?Math.round((user.total_correct/user.total_reviews)*100):0}%` },
      { name: '❌ Sering Salah', value: wrongWords.length ? wrongWords.map((w,i)=>`${i+1}. ${w.hanzi} ❌${w.times_wrong} ✅${w.times_correct}`).join('\n') : 'Belum ada' },
      { name: '📂 Per Kategori', value: catStats.length ? catStats.map(c=>`${c.kategori}: ${c.mastered}/${c.total}`).join('\n') : 'Belum ada' },
      { name: '📊 Per Unit', value: unitProgress.length ? unitProgress.map(u=>{
          const pct = u.total>0?Math.round((u.mastered/u.total)*100):0;
          return `U${u.unit}: ${'█'.repeat(Math.round(pct/10))}${'░'.repeat(10-Math.round(pct/10))} ${pct}%`;
        }).join('\n') : 'Belum ada' },
    )] });
}

async function handleStreak(interaction) {
  const user = ensureUser(interaction.user.id, interaction.user.username);
  const s = user.streak || 0;
  const emoji = s>=100?'👑':s>=30?'⭐':s>=7?'🔥':s>=3?'🔥':'❄️';
  const next  = s<3?3:s<7?7:s<30?30:s<100?100:null;
  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(s>=7?0xff6600:0x95a5a6)
    .setTitle(`${emoji} Streak: ${s} hari`)
    .setDescription(`Max: **${user.max_streak||0}** hari\nTerakhir aktif: ${user.last_active||'-'}`)
    .addFields({ name: '🎯 Target', value: next ? `${next} hari` : '🏆 LEGENDARY!' })] });
}

async function handleBadge(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);
  const earned = new Set(db.prepare('SELECT badge_id FROM user_badges WHERE user_id=?').all(userId).map(b=>b.badge_id));
  const list = badges.map(b => `${earned.has(b.id)?'✅':'🔒'} ${b.emoji} **${b.nama}** — ${b.deskripsi}`).join('\n');
  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0xf39c12).setTitle(`🏅 Badge (${earned.size}/${badges.length})`).setDescription(list.slice(0,4096))] });
}

async function handleLeaderboard(interaction) {
  const tipe = interaction.options?.getString('tipe') || 'global';
  let rows, title;
  if (tipe === 'server' && interaction.guildId) {
    rows = db.prepare(`SELECT u.username,sx.xp,u.streak FROM server_xp sx JOIN users u ON sx.user_id=u.user_id
      WHERE sx.guild_id=? ORDER BY sx.xp DESC LIMIT 10`).all(interaction.guildId);
    title = `🏆 Leaderboard — ${interaction.guild?.name||'Server'}`;
  } else {
    rows = db.prepare('SELECT username,xp,streak FROM users ORDER BY xp DESC LIMIT 10').all();
    title = '🏆 Leaderboard Global';
  }
  if (!rows.length) return interaction.reply({ content: 'Belum ada data!', ephemeral: true });
  const medals = ['🥇','🥈','🥉'];
  const list = rows.map((r,i)=>`${i<3?medals[i]:`${i+1}.`} **${r.username}** — ${r.xp||0} XP ${getLevel(r.xp||0).emoji} 🔥${r.streak||0}`).join('\n');
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle(title).setDescription(list)] });
}

async function handleKataHariIni(interaction) {
  const word = allWords[Math.floor(Date.now()/86400000) % allWords.length];
  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0x9b59b6).setTitle('📅 Kata Hari Ini')
    .addFields(
      { name: 'Hanzi',  value: word.hanzi,  inline: true },
      { name: 'Pinyin', value: word.pinyin, inline: true },
      { name: 'Arti',   value: word.arti,   inline: true },
      { name: '📝 Contoh', value: `${word.contoh}\n${word.contoh_pinyin}\n"${word.contoh_arti}"` },
      { name: 'Info', value: `Unit ${word.unit} • ${word.kategori} • HSK ${word.id<=70?1:2}` },
    )] });
}

async function handleSkillmap(interaction) {
  const userId = interaction.user.id;
  const user = ensureUser(userId, interaction.user.username);
  const done = new Set(db.prepare('SELECT lesson_id FROM user_lessons WHERE user_id=? AND completed=1').all(userId).map(l=>l.lesson_id));
  const maxUnit = Math.max(...allLessons.map(l=>l.unit));
  const embeds = [];

  for (let u = 1; u <= maxUnit; u++) {
    const ul = allLessons.filter(l => l.unit === u);
    if (!ul.length) continue;
    let text = ul.map(l => {
      const icon = done.has(l.id) ? '✅' : l.id===(user.current_lesson||1) ? '👉' : '🔒';
      return `${icon} L${l.id}: ${l.nama}${l.isBoss?' 🏆':''}`;
    }).join('\n');
    embeds.push(new EmbedBuilder()
      .setColor(u<=8?0x1abc9c:0xe67e22)
      .setTitle(`Unit ${u} (HSK ${u<=8?1:2})`)
      .setDescription(text));
    if (embeds.length >= 10) break;
  }

  await interaction.reply({ embeds });
}

async function handleGrammar(interaction) {
  const nomor = interaction.options?.getInteger('nomor');
  if (!nomor) {
    const list = allGrammar.map(g=>`**${g.id}.** ${g.judul} *(${g.level})*`).join('\n');
    return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('📖 Daftar Grammar').setDescription(list.slice(0,4096))] });
  }
  const g = allGrammar.find(gr=>gr.id===nomor);
  if (!g) return interaction.reply({ content: `❌ Grammar ${nomor} tidak ada. Tersedia 1-${allGrammar.length}`, ephemeral: true });
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle(`📖 ${g.judul}`).setDescription((g.penjelasan||'').slice(0,4096)).setFooter({ text: g.level })] });
}

async function handleChallenge(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);
  const today = todayStr();
  const dayIdx = Math.floor(Date.now()/86400000) % allChallenges.length;
  const ch = allChallenges[dayIdx];
  let uc = db.prepare('SELECT * FROM user_challenges WHERE user_id=? AND date=?').get(userId, today);
  if (!uc) {
    db.prepare('INSERT INTO user_challenges (user_id,date,challenge_id,progress,completed) VALUES (?,?,?,0,0)').run(userId, today, ch.id);
    uc = { progress: 0, completed: 0 };
  }
  const pct = Math.round((uc.progress/ch.target)*100);
  const bar = '█'.repeat(Math.round(pct/10))+'░'.repeat(10-Math.round(pct/10));
  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(uc.completed?0x2ecc71:0xe67e22).setTitle(`🎯 ${ch.nama}`).setDescription(ch.deskripsi)
    .addFields(
      { name: 'Progress', value: `${bar} ${uc.progress}/${ch.target}`, inline: false },
      { name: 'Reward',   value: `+${ch.xpReward} XP`, inline: true },
      { name: 'Status',   value: uc.completed?'✅ Selesai!':'⏳ Belum', inline: true },
    ).setFooter({ text: 'Challenge berganti tiap hari!' })] });
}

async function handleToneTrain(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);
  updateStreak(userId);

  const data = shuffle(allTones).slice(0, 5);
  const qs = data.map(t => ({
    type: 'tone',
    question: `Apa pinyin yang benar untuk **${t.hanzi}**?`,
    options: shuffle(t.opsi.map(o => ({
      label: o,
      value: o === t.jawaban ? `correct_tone_${t.hanzi}` : `wrong_tone_${encodeURIComponent(o)}`,
      correct: o === t.jawaban
    }))),
    word: { hanzi: t.hanzi, pinyin: t.jawaban, arti: t.hanzi, id: null }
  }));

  startSession(userId, qs, 'tone', interaction.guildId, { isTone: true });
  const hearts = checkHearts(userId);
  const { embed, row } = buildUI(qs[0], 1, 5, hearts, '🎵 Tone Training');
  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleSusun(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);
  updateStreak(userId);

  if (!susun.length) return interaction.reply({ content: '❌ Data susun kalimat tidak tersedia.', ephemeral: true });
  const soal = susun[Math.floor(Math.random() * susun.length)];
  const shuffled = shuffle([...(soal.kata || [])]);

  sessions.set(userId, { type: 'susun', jawaban: soal.jawaban, arti: soal.arti, startTime: Date.now(), guildId: interaction.guildId });

  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0xe74c3c).setTitle('🧩 Susun Kalimat')
    .setDescription(`Susun menjadi kalimat yang benar:\n\n**${shuffled.join('  |  ')}**\n\nArti: *"${soal.arti}"*`)
    .setFooter({ text: 'Klik Jawab untuk menjawab!' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('susun_answer').setLabel('✍️ Jawab').setStyle(ButtonStyle.Primary)
    )] });
}

async function handleKamus(interaction) {
  const kata = interaction.options.getString('kata').toLowerCase();
  const res = allWords.filter(w =>
    w.hanzi.includes(kata) || w.pinyin.toLowerCase().includes(kata) || w.arti.toLowerCase().includes(kata)
  ).slice(0, 8);
  if (!res.length) return interaction.reply({ content: `❌ "${kata}" tidak ditemukan.`, ephemeral: true });
  const list = res.map(w =>
    `**${w.hanzi}** (${w.pinyin}) — ${w.arti}\n📝 ${w.contoh} *"${w.contoh_arti}"*\nUnit ${w.unit} • HSK ${w.id<=70?1:2}`
  ).join('\n\n');
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x3498db).setTitle(`📖 Kamus: "${kata}"`).setDescription(list.slice(0,4096)).setFooter({ text: `${res.length} hasil` })] });
}

async function handleReminder(interaction) {
  const jam = interaction.options.getString('jam');
  if (!/^\d{1,2}:\d{2}$/.test(jam)) return interaction.reply({ content: '❌ Format: HH:MM (contoh: 20:00)', ephemeral: true });
  ensureUser(interaction.user.id, interaction.user.username);
  db.prepare('UPDATE users SET reminder_time=?, reminder_channel=? WHERE user_id=?').run(jam, interaction.channelId, interaction.user.id);
  await interaction.reply({ content: `⏰ Reminder diset jam **${jam}**!`, ephemeral: true });
}

async function handleDaily(interaction) {
  const userId = interaction.user.id;
  const user = ensureUser(userId, interaction.user.username);
  const today = todayStr();
  if (user.daily_claimed === today) return interaction.reply({ content: '🎁 Sudah klaim hari ini! Coba lagi besok.', ephemeral: true });

  const streak = updateStreak(userId);
  const reward = getDailyReward(streak);
  db.prepare('UPDATE users SET daily_claimed=?, total_daily_claims=COALESCE(total_daily_claims,0)+1 WHERE user_id=?').run(today, userId);
  addXp(userId, reward, interaction.guildId);
  try { db.prepare('INSERT OR IGNORE INTO daily_logins (user_id,date,reward_xp) VALUES (?,?,?)').run(userId, today, reward); } catch(e){}
  checkAndAwardBadges(userId);

  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0x2ecc71).setTitle('🎁 Hadiah Login Harian!')
    .setDescription(`Kamu dapat **+${reward} XP**!`)
    .addFields(
      { name: '🔥 Streak',      value: `${streak} hari`, inline: true },
      { name: '📅 Total Login', value: `${(user.total_daily_claims||0)+1} hari`, inline: true },
      { name: '💡 Info', value: streak>=7?`Bonus streak! +${reward-10} XP ekstra`:'Login 7 hari berturut untuk bonus!' },
    )] });
}

async function handleTebakEmoji(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);
  updateStreak(userId);
  if (!emojiGame.length) return interaction.reply({ content: '❌ Data emoji game tidak tersedia.', ephemeral: true });

  const data = shuffle(emojiGame).slice(0, 5);
  const qs = data.map(eg => ({
    type: 'emoji',
    question: `Emoji ini menunjukkan apa?\n\n# ${eg.emoji}\n💡 *${eg.hint}*`,
    options: shuffle(eg.opsi.map(o => ({
      label: o, value: o===eg.jawaban?`correct_e_${eg.jawaban}`:`wrong_e_${o}`, correct: o===eg.jawaban
    }))),
    word: { hanzi: eg.jawaban, pinyin: '', arti: eg.hint, id: null }
  }));

  startSession(userId, qs, 'emoji', interaction.guildId, { isEmoji: true });
  const hearts = checkHearts(userId);
  const { embed, row } = buildUI(qs[0], 1, 5, hearts, '😃 Tebak Emoji');
  await interaction.reply({ embeds: [embed], components: [row] });
}

async function handleWordSearch(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);
  updateStreak(userId);
  if (!wordsearchPools.length) return interaction.reply({ content: '❌ Data word search tidak tersedia.', ephemeral: true });

  const pool = wordsearchPools[Math.floor(Math.random() * wordsearchPools.length)];
  const { grid, placed } = generateWordSearchGrid(pool.words, pool.fillers, 6);
  if (!placed.length) return interaction.reply({ content: '❌ Gagal generate grid. Coba lagi!', ephemeral: true });

  wordsearchSessions.set(userId, { grid, placed, found: [], startTime: Date.now(), guildId: interaction.guildId });

  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0x9b59b6).setTitle(`🔍 Word Search — ${pool.tema}`)
    .setDescription(`Cari **${placed.length}** kata!\n\n${renderGrid(grid)}`)
    .addFields(
      { name: '🎯 Jumlah', value: `${placed.length} kata`, inline: true },
      { name: '📏 Arah',   value: '→ atau ↓', inline: true },
      { name: '💡 Cara', value: 'Klik **Tebak Kata** lalu ketik hanzinya', inline: false },
    )],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ws_guess').setLabel('🔍 Tebak Kata').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ws_hint').setLabel('💡 Hint').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ws_giveup').setLabel('🏳️ Menyerah').setStyle(ButtonStyle.Danger),
    )] });
}

async function handleSpeedRound(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);
  updateStreak(userId);

  const weak = getWeakWords(db, userId, 5).map(w => allWords.find(aw => aw.id === w.word_id)).filter(Boolean);
  const rest = shuffle(allWords.filter(w => !weak.find(aw => aw.id === w.id))).slice(0, 10 - weak.length);
  const pool = shuffle([...weak, ...rest]).slice(0, 10);
  const qs = pool.map(w => generateQuestion(w, allWords));

  speedSessions.set(userId, { questions: qs, current: 0, score: 0, startTime: Date.now(), questionStartTime: Date.now(), guildId: interaction.guildId, times: [] });

  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0xff0000).setTitle('⚡ SPEED ROUND!')
    .setDescription('10 soal secepat mungkin!\n⏱️ Semakin cepat = makin banyak bonus XP!')
    .setFooter({ text: 'Klik MULAI untuk memulai!' })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('speed_start').setLabel('🏁 MULAI!').setStyle(ButtonStyle.Danger)
    )] });
}

async function handleBattle(interaction) {
  const userId = interaction.user.id;
  const target = interaction.options.getUser('lawan');
  if (target.id === userId) return interaction.reply({ content: '❌ Tidak bisa battle sendiri!', ephemeral: true });
  if (target.bot) return interaction.reply({ content: '❌ Tidak bisa battle dengan bot!', ephemeral: true });

  ensureUser(userId, interaction.user.username);
  ensureUser(target.id, target.username);

  const qs = shuffle(allWords).slice(0, 5).map(w => generateQuestion(w, allWords));
  const res = db.prepare(`INSERT INTO battles (challenger_id,challenged_id,total_q,questions,status) VALUES (?,?,5,?,'pending')`)
    .run(userId, target.id, JSON.stringify(qs));
  const battleId = res.lastInsertRowid;

  battleSessions.set(battleId, { id: battleId, challengerId: userId, challengedId: target.id, questions: qs, challengerScore: 0, challengedScore: 0, phase: 'waiting', currentQ: 0 });

  await interaction.reply({ embeds: [new EmbedBuilder()
    .setColor(0xe74c3c).setTitle('⚔️ Battle Challenge!')
    .setDescription(`**${interaction.user.username}** vs **${target.username}**\n\n5 soal! Pemenang +50 XP!`)
    .setFooter({ text: `Battle #${battleId}` })],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`battle_accept_${battleId}`).setLabel('✅ Terima').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`battle_decline_${battleId}`).setLabel('❌ Tolak').setStyle(ButtonStyle.Danger),
    )] });
}

// ============================================================
// === BUTTON HANDLER ===
// ============================================================
async function handleButton(interaction) {
  const userId = interaction.user.id;
  const cid = interaction.customId;

  // --- SUSUN ---
  if (cid === 'susun_answer') {
    const s = sessions.get(userId);
    if (!s || s.type !== 'susun') return interaction.reply({ content: '❌ Sesi tidak ditemukan.', ephemeral: true });
    const modal = new ModalBuilder().setCustomId('susun_modal').setTitle('Susun Kalimat');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('susun_input').setLabel('Ketik kalimat yang benar').setStyle(TextInputStyle.Short).setRequired(true)
    ));
    return interaction.showModal(modal);
  }

  // --- SPEED START ---
  if (cid === 'speed_start') {
    const s = speedSessions.get(userId);
    if (!s) return interaction.reply({ content: '❌ Sesi tidak ditemukan.', ephemeral: true });
    s.questionStartTime = Date.now();
    const { embed, row } = buildUI(s.questions[0], 1, 10, checkHearts(userId), '⚡ SPEED ROUND');
    return interaction.update({ embeds: [embed], components: [row] });
  }

  // --- WORD SEARCH ---
  if (cid === 'ws_guess') {
    const modal = new ModalBuilder().setCustomId('ws_guess_modal').setTitle('Tebak Kata');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('ws_input').setLabel('Ketik hanzi yang kamu temukan').setStyle(TextInputStyle.Short).setRequired(true)
    ));
    return interaction.showModal(modal);
  }
  if (cid === 'ws_hint') {
    const s = wordsearchSessions.get(userId);
    if (!s) return interaction.reply({ content: '❌ Sesi tidak ditemukan.', ephemeral: true });
    const rem = s.placed.filter(p => !s.found.includes(p.word));
    if (!rem.length) return interaction.reply({ content: '✅ Semua kata sudah ditemukan!', ephemeral: true });
    return interaction.reply({ content: `💡 **${rem[0].word.length}** karakter, arah ${rem[0].dir==='h'?'horizontal →':'vertikal ↓'}`, ephemeral: true });
  }
  if (cid === 'ws_giveup') {
    const s = wordsearchSessions.get(userId);
    if (!s) return interaction.reply({ content: '❌ Sesi tidak ditemukan.', ephemeral: true });
    wordsearchSessions.delete(userId);
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('🏳️ Menyerah')
        .setDescription(`Jawabannya: **${s.placed.map(p=>p.word).join(', ')}**\nDitemukan: ${s.found.length}/${s.placed.length}`)],
      components: []
    });
  }

  // --- BATTLE ACCEPT/DECLINE ---
  if (cid.startsWith('battle_accept_')) {
    const battleId = parseInt(cid.replace('battle_accept_',''));
    const b = battleSessions.get(battleId);
    if (!b) return interaction.reply({ content: '❌ Battle tidak ditemukan.', ephemeral: true });
    if (userId !== b.challengedId) return interaction.reply({ content: '❌ Bukan untukmu!', ephemeral: true });

    b.phase = 'challenger_playing';
    const q = b.questions[0];
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('⚔️ Battle — Giliran Challenger').setDescription(q.question).setFooter({ text: 'Soal 1/5' })],
      components: [new ActionRowBuilder().addComponents(
        q.options.map((opt,i) => new ButtonBuilder().setCustomId(`ba_${battleId}_${i}_${opt.correct?'c':'w'}`).setLabel(opt.label.slice(0,80)).setEmoji(['🅰️','🅱️','🅲','🅳'][i]).setStyle(ButtonStyle.Secondary))
      )]
    });
  }
  if (cid.startsWith('battle_decline_')) {
    battleSessions.delete(parseInt(cid.replace('battle_decline_','')));
    return interaction.update({ embeds: [new EmbedBuilder().setColor(0x95a5a6).setTitle('⚔️ Ditolak').setDescription('Tantangan ditolak.')], components: [] });
  }

  // --- BATTLE ANSWER ---
  if (cid.startsWith('ba_')) {
    const parts = cid.split('_');
    const battleId = parseInt(parts[1]);
    const isCorrect = parts[3] === 'c';
    const b = battleSessions.get(battleId);
    if (!b) return interaction.reply({ content: '❌ Battle tidak ditemukan.', ephemeral: true });

    const isChallenger = userId === b.challengerId;
    const isChallenged = userId === b.challengedId;
    if (b.phase==='challenger_playing' && !isChallenger) return interaction.reply({ content: '❌ Bukan giliranmu!', ephemeral: true });
    if (b.phase==='challenged_playing' && !isChallenged) return interaction.reply({ content: '❌ Bukan giliranmu!', ephemeral: true });

    const buildBattleRow = (bId, qs, qIdx) => new ActionRowBuilder().addComponents(
      qs[qIdx].options.map((opt,i) => new ButtonBuilder().setCustomId(`ba_${bId}_${i}_${opt.correct?'c':'w'}`).setLabel(opt.label.slice(0,80)).setEmoji(['🅰️','🅱️','🅲','🅳'][i]).setStyle(ButtonStyle.Secondary))
    );

    if (b.phase === 'challenger_playing') {
      if (isCorrect) b.challengerScore++;
      b.currentQ++;
      if (b.currentQ >= 5) {
        b.phase = 'challenged_playing'; b.currentQ = 0;
        const q = b.questions[0];
        return interaction.update({
          embeds: [new EmbedBuilder().setColor(0x3498db).setTitle('⚔️ Battle — Giliran Challenged').setDescription(q.question).setFooter({ text: `Soal 1/5 | Challenger: ${b.challengerScore}/5` })],
          components: [buildBattleRow(battleId, b.questions, 0)]
        });
      }
      const q = b.questions[b.currentQ];
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(isCorrect?0x2ecc71:0xe74c3c).setTitle('⚔️ Challenger').setDescription(`${isCorrect?'✅':'❌'}\n\n${q.question}`).setFooter({ text: `Soal ${b.currentQ+1}/5 | Skor: ${b.challengerScore}` })],
        components: [buildBattleRow(battleId, b.questions, b.currentQ)]
      });
    }

    if (b.phase === 'challenged_playing') {
      if (isCorrect) b.challengedScore++;
      b.currentQ++;
      if (b.currentQ >= 5) {
        b.phase = 'done';
        let result;
        if (b.challengerScore > b.challengedScore)      { result = '🏆 Challenger menang!'; addXp(b.challengerId, 50, interaction.guildId); addXp(b.challengedId, 15, interaction.guildId); awardBadge(b.challengerId, 'battle_winner'); }
        else if (b.challengedScore > b.challengerScore) { result = '🏆 Challenged menang!'; addXp(b.challengedId, 50, interaction.guildId); addXp(b.challengerId, 15, interaction.guildId); awardBadge(b.challengedId, 'battle_winner'); }
        else { result = '🤝 Seri!'; addXp(b.challengerId, 25, interaction.guildId); addXp(b.challengedId, 25, interaction.guildId); }

        db.prepare('UPDATE battles SET challenger_score=?,challenged_score=?,status=? WHERE id=?').run(b.challengerScore, b.challengedScore, 'done', battleId);
        battleSessions.delete(battleId);
        return interaction.update({
          embeds: [new EmbedBuilder().setColor(0xf1c40f).setTitle('⚔️ Battle Selesai!').setDescription(result)
            .addFields({ name: 'Challenger', value: `${b.challengerScore}/5`, inline: true },{ name: 'VS', value: '⚔️', inline: true },{ name: 'Challenged', value: `${b.challengedScore}/5`, inline: true })],
          components: []
        });
      }
      const q = b.questions[b.currentQ];
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(isCorrect?0x2ecc71:0xe74c3c).setTitle('⚔️ Challenged').setDescription(`${isCorrect?'✅':'❌'}\n\n${q.question}`).setFooter({ text: `Soal ${b.currentQ+1}/5 | Skor: ${b.challengedScore}` })],
        components: [buildBattleRow(battleId, b.questions, b.currentQ)]
      });
    }
  }

  // --- SPEED ROUND ANSWERS ---
  if (cid.startsWith('correct_') || cid.startsWith('wrong_')) {
    const sp = speedSessions.get(userId);
    if (sp) {
      const isCorrect = cid.startsWith('correct_');
      const elapsed = (Date.now() - sp.questionStartTime) / 1000;
      sp.times.push(elapsed);
      if (isCorrect) sp.score++;
      sp.current++;

      if (sp.current >= 10) {
        const total = (Date.now() - sp.startTime) / 1000;
        const avg = sp.times.reduce((a,b)=>a+b,0) / sp.times.length;
        let xp = sp.score * 5 + (avg < 5 ? 30 : avg < 10 ? 15 : 0);
        addXp(userId, xp, sp.guildId);
        speedSessions.delete(userId);
        checkAndAwardBadges(userId);
        return interaction.update({
          embeds: [new EmbedBuilder().setColor(sp.score>=8?0x2ecc71:0xe74c3c).setTitle('⚡ Speed Round Selesai!')
            .addFields(
              { name: '🎯 Skor', value: `${sp.score}/10`, inline: true },
              { name: '⏱️ Total', value: `${total.toFixed(1)}s`, inline: true },
              { name: '⏱️ Avg', value: `${avg.toFixed(1)}s`, inline: true },
              { name: '💰 XP', value: `+${xp}`, inline: true },
            )],
          components: []
        });
      }

      sp.questionStartTime = Date.now();
      const q = sp.questions[sp.current];
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xff0000).setTitle(`⚡ Speed ${sp.current+1}/10`).setDescription(`${isCorrect?'✅':'❌'} (${elapsed.toFixed(1)}s)\n\n${q.question}`).setFooter({ text: `Skor: ${sp.score} | Cepat = bonus XP!` })],
        components: [new ActionRowBuilder().addComponents(q.options.map((opt,i)=>new ButtonBuilder().setCustomId(opt.value).setLabel(opt.label.slice(0,80)).setEmoji(['🅰️','🅱️','🅲','🅳'][i]).setStyle(ButtonStyle.Secondary)))]
      });
    }

    // --- REGULAR SESSION ANSWERS ---
    const session = sessions.get(userId);
    if (!session || session.type === 'susun') return interaction.reply({ content: '❌ Sesi tidak ditemukan. Mulai dengan /mulai', ephemeral: true });

    const isCorrect = cid.startsWith('correct_');
    const curQ = session.questions[session.current];
    let hearts = checkHearts(userId);

    // Record user_words
    if (curQ.word && curQ.word.id) {
      const wid = curQ.word.id;
      const ex = db.prepare('SELECT * FROM user_words WHERE user_id=? AND word_id=?').get(userId, wid);
      if (ex) {
        if (isCorrect) db.prepare('UPDATE user_words SET times_correct=times_correct+1,last_reviewed=?,next_review=? WHERE user_id=? AND word_id=?').run(new Date().toISOString(), nextReviewDate(ex.times_correct, true), userId, wid);
        else db.prepare('UPDATE user_words SET times_wrong=times_wrong+1,last_reviewed=?,next_review=? WHERE user_id=? AND word_id=?').run(new Date().toISOString(), nextReviewDate(0, false), userId, wid);
      } else {
        db.prepare('INSERT INTO user_words (user_id,word_id,times_correct,times_wrong,last_reviewed,next_review) VALUES (?,?,?,?,?,?)')
          .run(userId, wid, isCorrect?1:0, isCorrect?0:1, new Date().toISOString(), nextReviewDate(isCorrect?1:0, isCorrect));
      }
      db.prepare('UPDATE users SET total_reviews=total_reviews+1 WHERE user_id=?').run(userId);
      if (isCorrect) db.prepare('UPDATE users SET total_correct=total_correct+1 WHERE user_id=?').run(userId);
    }

    // Hearts
    if (isCorrect && session.isReview && hearts < 5) {
      db.prepare('UPDATE users SET hearts=MIN(hearts+1,5) WHERE user_id=?').run(userId);
      hearts = Math.min(hearts+1, 5);
    } else if (!isCorrect && !session.isReview && !session.isTone && !session.isEmoji) {
      hearts = loseHeart(userId);
    }

    // Challenge progress
    const today = todayStr();
    db.prepare('UPDATE user_challenges SET progress=progress+1 WHERE user_id=? AND date=? AND completed=0').run(userId, today);
    const ch = allChallenges[Math.floor(Date.now()/86400000) % allChallenges.length];
    if (ch) {
      const uc = db.prepare('SELECT * FROM user_challenges WHERE user_id=? AND date=?').get(userId, today);
      if (uc && uc.progress >= ch.target && !uc.completed) {
        db.prepare('UPDATE user_challenges SET completed=1 WHERE user_id=? AND date=?').run(userId, today);
        addXp(userId, ch.xpReward, session.guildId);
      }
    }

    if (isCorrect) session.score++;
    session.current++;

    // No hearts
    if (hearts <= 0 && !session.isReview && !session.isTone && !session.isEmoji) {
      sessions.delete(userId);
      return interaction.update({
        embeds: [new EmbedBuilder().setColor(0xe74c3c).setTitle('💔 Nyawa Habis!')
          .setDescription(`${isCorrect?'✅':'❌'} Nyawa habis!\n\nTunggu 1 jam atau /review untuk nyawa kembali.\n${heartsDisplay(0)}\nSkor: ${session.score}/${session.current}`)],
        components: []
      });
    }

    // Done?
    if (session.current >= session.questions.length) return finishSession(userId, session, interaction);

    // Next question
    const nextQ = session.questions[session.current];
    const resultMsg = isCorrect ? `✅ **Benar!**` : `❌ **Salah!** ${curQ.word.hanzi} = ${curQ.word.arti}`;
    const label = session.isReview?'🔄 Review':session.isTone?'🎵 Tone':session.isEmoji?'😃 Emoji':
      (()=>{ const l=allLessons.find(l=>l.id===session.lessonId); return l?`U${l.unit}•${l.nama}`:''; })();

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(isCorrect?0x2ecc71:0xe74c3c)
        .setTitle(`📝 Soal ${session.current+1}/${session.questions.length}`)
        .setDescription(`${resultMsg}\n\n${nextQ.question}`)
        .setFooter({ text: `${heartsDisplay(hearts)} | Skor: ${session.score} | ${label}` })],
      components: [new ActionRowBuilder().addComponents(nextQ.options.map((opt,i)=>new ButtonBuilder().setCustomId(opt.value).setLabel(opt.label.slice(0,80)).setEmoji(['🅰️','🅱️','🅲','🅳'][i]).setStyle(ButtonStyle.Secondary)))]
    });
  }
}

// ============================================================
// === MODAL HANDLER ===
// ============================================================
async function handleModal(interaction) {
  const userId = interaction.user.id;

  if (interaction.customId === 'susun_modal') {
    const s = sessions.get(userId);
    if (!s || s.type !== 'susun') return interaction.reply({ content: '❌ Sesi tidak ditemukan.', ephemeral: true });
    const answer = interaction.fields.getTextInputValue('susun_input').trim();
    const sim = similarity(answer, s.jawaban);
    const elapsed = Math.round((Date.now() - s.startTime) / 1000);
    let xp = 2, title = '❌ Coba lagi!';
    if (sim===100) { title='🌟 PERFECT!'; xp=elapsed<15?30:20; }
    else if (sim>=80) { title='👍 Hampir!'; xp=10; }
    else if (sim>=50) { title='😅 Lumayan'; xp=5; }
    addXp(userId, xp, s.guildId);
    sessions.delete(userId);
    checkAndAwardBadges(userId);
    return interaction.reply({ embeds: [new EmbedBuilder()
      .setColor(sim===100?0x2ecc71:sim>=50?0xf39c12:0xe74c3c).setTitle(`🧩 ${title}`)
      .addFields(
        { name: 'Jawabanmu', value: answer||'(kosong)' },
        { name: 'Jawaban benar', value: s.jawaban },
        { name: 'Arti', value: s.arti },
        { name: 'Kemiripan', value: `${sim}%`, inline: true },
        { name: 'Waktu', value: `${elapsed}s`, inline: true },
        { name: 'XP', value: `+${xp}`, inline: true },
      )] });
  }

  if (interaction.customId === 'ws_guess_modal') {
    const s = wordsearchSessions.get(userId);
    if (!s) return interaction.reply({ content: '❌ Sesi tidak ditemukan.', ephemeral: true });
    const guess = interaction.fields.getTextInputValue('ws_input').trim();
    const found = s.placed.find(p => p.word===guess && !s.found.includes(p.word));
    if (found) {
      s.found.push(found.word);
      if (s.found.length >= s.placed.length) {
        const elapsed = Math.round((Date.now()-s.startTime)/1000);
        const xp = 30 + (elapsed<60?20:0);
        addXp(userId, xp, s.guildId);
        wordsearchSessions.delete(userId);
        checkAndAwardBadges(userId);
        return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x2ecc71).setTitle('🎉 Semua ditemukan!')
          .setDescription(`Kata: ${s.placed.map(p=>p.word).join(', ')}\nWaktu: ${elapsed}s | +${xp} XP`)] });
      }
      return interaction.reply({ content: `✅ **${guess}** ditemukan! (${s.found.length}/${s.placed.length})`, ephemeral: true });
    }
    return interaction.reply({ content: s.found.includes(guess)?`⚠️ **${guess}** sudah ditemukan!`:`❌ **${guess}** bukan kata tersembunyi!`, ephemeral: true });
  }
}

// ============================================================
// === EVENTS ===
// ============================================================
client.once('clientReady', () => {
  console.log(`✅ ${client.user.tag} online!`);
  console.log(`📊 Words: ${allWords.length} | Lessons: ${allLessons.length} | Grammar: ${allGrammar.length} | Badges: ${badges.length} | Tones: ${allTones.length}`);
  console.log(`🎮 HSK1: ${words.length}w/${lessons.length}l | HSK2: ${wordsHsk2.length}w/${lessonsHsk2.length}l | Susun: ${susun.length} | Emoji: ${emojiGame.length}`);

  setInterval(() => {
    const time = new Date().toTimeString().slice(0,5);
    const today = todayStr();
    db.prepare('SELECT * FROM users WHERE reminder_time=?').all(time).forEach(u => {
      if (u.last_active===today || !u.reminder_channel) return;
      client.channels.cache.get(u.reminder_channel)?.send(`⏰ <@${u.user_id}> Waktunya belajar! /lanjut atau /review 📚`).catch(()=>{});
    });
  }, 60000);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isCommand()) {
      const handlers = {
        mulai: handleMulai, lanjut: handleLanjut, review: handleReview,
        profil: handleProfil, statistik: handleStatistik, streak: handleStreak,
        badge: handleBadge, leaderboard: handleLeaderboard, katahariini: handleKataHariIni,
        skillmap: handleSkillmap, grammar: handleGrammar, challenge: handleChallenge,
        tonetrain: handleToneTrain, susun: handleSusun, battle: handleBattle,
        kamus: handleKamus, reminder: handleReminder, daily: handleDaily,
        tebakemoji: handleTebakEmoji, wordsearch: handleWordSearch, speedround: handleSpeedRound,
      };
      return handlers[interaction.commandName]?.(interaction);
    }
    if (interaction.isButton())      return handleButton(interaction);
    if (interaction.isModalSubmit()) return handleModal(interaction);
  } catch (err) {
    console.error('❌ Error:', err);
    const msg = { content: '❌ Terjadi error. Coba lagi.', ephemeral: true };
    try { interaction.replied||interaction.deferred ? await interaction.followUp(msg) : await interaction.reply(msg); } catch(e){}
  }
});

client.login(process.env.BOT_TOKEN);
