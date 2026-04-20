require('dotenv').config({ path: '/root/duochinese-bot/.env' });
const Database = require('better-sqlite3');
const words = require('../data/words');

const db = new Database('/root/duochinese-bot/database/duochinese.db');
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,
    username TEXT,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    streak INTEGER DEFAULT 0,
    max_streak INTEGER DEFAULT 0,
    last_active TEXT,
    current_unit INTEGER DEFAULT 1,
    current_lesson INTEGER DEFAULT 1,
    hearts INTEGER DEFAULT 5,
    hearts_refreshed_at TEXT,
    lessons_completed INTEGER DEFAULT 0,
    total_reviews INTEGER DEFAULT 0,
    total_correct INTEGER DEFAULT 0,
    reminder_time TEXT,
    reminder_channel TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_words (
    user_id TEXT,
    word_id INTEGER,
    times_correct INTEGER DEFAULT 0,
    times_wrong INTEGER DEFAULT 0,
    last_reviewed TEXT,
    next_review TEXT,
    PRIMARY KEY (user_id, word_id)
  );

  CREATE TABLE IF NOT EXISTS user_badges (
    user_id TEXT,
    badge_id TEXT,
    earned_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, badge_id)
  );

  CREATE TABLE IF NOT EXISTS user_lessons (
    user_id TEXT,
    lesson_id INTEGER,
    completed INTEGER DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, lesson_id)
  );

  CREATE TABLE IF NOT EXISTS user_challenges (
    user_id TEXT,
    date TEXT,
    challenge_id INTEGER,
    progress INTEGER DEFAULT 0,
    completed INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );

  CREATE TABLE IF NOT EXISTS battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id TEXT,
    challenged_id TEXT,
    challenger_score INTEGER DEFAULT 0,
    challenged_score INTEGER DEFAULT 0,
    current_q INTEGER DEFAULT 0,
    total_q INTEGER DEFAULT 5,
    questions TEXT,
    status TEXT DEFAULT 'waiting',
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY,
    hanzi TEXT, pinyin TEXT, arti TEXT,
    unit INTEGER, lesson INTEGER, kategori TEXT,
    contoh TEXT, contoh_pinyin TEXT, contoh_arti TEXT
  );
`);

// Add missing columns safely
const alterCols = [
  'ALTER TABLE users ADD COLUMN total_correct INTEGER DEFAULT 0',
  'ALTER TABLE users ADD COLUMN reminder_time TEXT',
  'ALTER TABLE users ADD COLUMN reminder_channel TEXT',
];
for (const sql of alterCols) { try { db.exec(sql); } catch(_) {} }

// Insert words
const ins = db.prepare('INSERT OR REPLACE INTO words VALUES (?,?,?,?,?,?,?,?,?,?)');
const tx = db.transaction(list => {
  for (const w of list) ins.run(w.id,w.hanzi,w.pinyin,w.arti,w.unit,w.lesson,w.kategori,w.contoh,w.contoh_pinyin,w.contoh_arti);
});
tx(words);

console.log('✅ Database ready! Words: ' + words.length);
db.close();
