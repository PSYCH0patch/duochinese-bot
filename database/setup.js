const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'duochinese.db'));
db.pragma('journal_mode = WAL');

console.log('🔧 Setting up database...');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY, username TEXT, xp INTEGER DEFAULT 0, level INTEGER DEFAULT 1,
    streak INTEGER DEFAULT 0, max_streak INTEGER DEFAULT 0, last_active TEXT,
    current_unit INTEGER DEFAULT 1, current_lesson INTEGER DEFAULT 1,
    hearts INTEGER DEFAULT 5, hearts_refreshed_at TEXT,
    lessons_completed INTEGER DEFAULT 0, total_reviews INTEGER DEFAULT 0, total_correct INTEGER DEFAULT 0,
    reminder_time TEXT, reminder_channel TEXT, daily_claimed TEXT, total_daily_claims INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS user_words (
    user_id TEXT, word_id INTEGER, times_correct INTEGER DEFAULT 0, times_wrong INTEGER DEFAULT 0,
    last_reviewed TEXT, next_review TEXT, PRIMARY KEY (user_id, word_id)
  );
  CREATE TABLE IF NOT EXISTS user_badges (
    user_id TEXT, badge_id TEXT, earned_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (user_id, badge_id)
  );
  CREATE TABLE IF NOT EXISTS user_lessons (
    user_id TEXT, lesson_id INTEGER, completed INTEGER DEFAULT 0, best_score INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, lesson_id)
  );
  CREATE TABLE IF NOT EXISTS user_challenges (
    user_id TEXT, date TEXT, challenge_id INTEGER, progress INTEGER DEFAULT 0, completed INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, date)
  );
  CREATE TABLE IF NOT EXISTS battles (
    id INTEGER PRIMARY KEY AUTOINCREMENT, challenger_id TEXT, challenged_id TEXT,
    challenger_score INTEGER DEFAULT 0, challenged_score INTEGER DEFAULT 0,
    current_q INTEGER DEFAULT 0, total_q INTEGER DEFAULT 5, questions TEXT,
    status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY, hanzi TEXT, pinyin TEXT, arti TEXT, unit INTEGER, lesson INTEGER,
    kategori TEXT, contoh TEXT, contoh_pinyin TEXT, contoh_arti TEXT, hsk_level INTEGER DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS server_xp (
    user_id TEXT, guild_id TEXT, xp INTEGER DEFAULT 0, PRIMARY KEY (user_id, guild_id)
  );
  CREATE TABLE IF NOT EXISTS daily_logins (
    user_id TEXT, date TEXT, reward_xp INTEGER, PRIMARY KEY (user_id, date)
  );
`);

// Safe migrations
const addCol = (t, c, type, def) => {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type} DEFAULT ${def}`); console.log(`  ➕ Added ${t}.${c}`); } catch(e) {}
};
addCol('users', 'daily_claimed', 'TEXT', "''");
addCol('users', 'total_daily_claims', 'INTEGER', '0');
addCol('words', 'hsk_level', 'INTEGER', '1');

console.log('✅ Tables ready');

// Universal loader — handles ANY export format
function loadWords(filePath) {
  try {
    const mod = require(filePath);
    // Direct array: module.exports = [...]
    if (Array.isArray(mod)) {
      console.log(`  📂 ${filePath}: array(${mod.length})`);
      return mod;
    }
    // Named export: module.exports = { words: [...] }
    for (const key of Object.keys(mod)) {
      if (Array.isArray(mod[key]) && mod[key].length > 0 && mod[key][0].hanzi) {
        console.log(`  📂 ${filePath}: {${key}}(${mod[key].length})`);
        return mod[key];
      }
    }
    // Any array property
    for (const key of Object.keys(mod)) {
      if (Array.isArray(mod[key])) {
        console.log(`  📂 ${filePath}: {${key}}(${mod[key].length})`);
        return mod[key];
      }
    }
    console.log(`  ⚠️  ${filePath}: no array found`);
    return [];
  } catch(e) {
    console.log(`  ⚠️  ${filePath}: ${e.message}`);
    return [];
  }
}

const insertWord = db.prepare(`
  INSERT OR REPLACE INTO words (id, hanzi, pinyin, arti, unit, lesson, kategori, contoh, contoh_pinyin, contoh_arti, hsk_level)
  VALUES (@id, @hanzi, @pinyin, @arti, @unit, @lesson, @kategori, @contoh, @contoh_pinyin, @contoh_arti, @hsk_level)
`);

function insertWords(wordList, hskLevel) {
  if (!Array.isArray(wordList) || wordList.length === 0) {
    console.log(`  ⚠️  No words to insert for HSK ${hskLevel}`);
    return 0;
  }
  const insertMany = db.transaction((list) => {
    for (const w of list) {
      insertWord.run({
        id: w.id,
        hanzi: w.hanzi || '',
        pinyin: w.pinyin || '',
        arti: w.arti || '',
        unit: w.unit || 1,
        lesson: w.lesson || 1,
        kategori: w.kategori || '',
        contoh: w.contoh || '',
        contoh_pinyin: w.contoh_pinyin || '',
        contoh_arti: w.contoh_arti || '',
        hsk_level: hskLevel,
      });
    }
  });
  insertMany(wordList);
  return wordList.length;
}

// Load & insert HSK 1
const words1 = loadWords(path.join(__dirname, '../data/words'));
const n1 = insertWords(words1, 1);
console.log(`✅ HSK 1: ${n1} words inserted`);

// Load & insert HSK 2
const words2 = loadWords(path.join(__dirname, '../data/words_hsk2'));
const n2 = insertWords(words2, 2);
if (n2 > 0) console.log(`✅ HSK 2: ${n2} words inserted`);
else console.log('⚠️  HSK 2 words skipped');

const total = db.prepare('SELECT COUNT(*) as c FROM words').get();
console.log(`📊 Total words in DB: ${total.c}`);
console.log('🎉 Database setup complete!');
process.exit(0);
