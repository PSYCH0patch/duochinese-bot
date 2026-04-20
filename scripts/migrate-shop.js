const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '../database/duochinese.db'));
db.pragma('journal_mode = WAL');

console.log('🔧 Migrating database for shop system...');

const addCol = (t, c, type, def) => {
  try { db.exec(`ALTER TABLE ${t} ADD COLUMN ${c} ${type} DEFAULT ${def}`); console.log(`  ➕ ${t}.${c}`); } catch(e) {}
};

// User shop columns
addCol('users', 'streak_freeze_count', 'INTEGER', '0');
addCol('users', 'streak_freeze_active', 'TEXT', "''");
addCol('users', 'double_xp_until', 'TEXT', "''");
addCol('users', 'total_xp_spent', 'INTEGER', '0');

// Purchase history table
db.exec(`
  CREATE TABLE IF NOT EXISTS purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    item TEXT,
    cost INTEGER,
    purchased_at TEXT DEFAULT (datetime('now'))
  );
`);

// Weekly tracking table
db.exec(`
  CREATE TABLE IF NOT EXISTS weekly_stats (
    user_id TEXT,
    week TEXT,
    xp_earned INTEGER DEFAULT 0,
    words_learned INTEGER DEFAULT 0,
    reviews_done INTEGER DEFAULT 0,
    correct_answers INTEGER DEFAULT 0,
    PRIMARY KEY (user_id, week)
  );
`);

console.log('✅ Shop migration complete');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name);
console.log('📊 Tables:', tables.join(', '));
db.close();
process.exit(0);
