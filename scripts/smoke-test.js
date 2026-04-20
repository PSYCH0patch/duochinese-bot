require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { execSync } = require('child_process');
const { REST, Routes } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

let passed = 0;
let failed = 0;
let warnings = 0;
const results = [];

function ok(name, detail = '') {
  results.push(`✅ ${name}${detail ? ' — ' + detail : ''}`);
  passed++;
}
function no(name, detail = '') {
  results.push(`❌ ${name}${detail ? ' — ' + detail : ''}`);
  failed++;
}
function warn(name, detail = '') {
  results.push(`⚠️  ${name}${detail ? ' — ' + detail : ''}`);
  warnings++;
}
function check(name, cond, detail = '') {
  if (cond) ok(name, detail);
  else no(name, detail);
}

function loadData(relPath) {
  try {
    const mod = require(path.join(__dirname, '..', relPath));
    if (Array.isArray(mod)) return mod;
    for (const key of Object.keys(mod)) {
      if (Array.isArray(mod[key])) return mod[key];
    }
    return [];
  } catch (e) {
    return [];
  }
}

(async () => {
  console.log('======================================');
  console.log(' DUOCHINESE BOT — AUTOMATED SMOKE TEST');
  console.log('======================================\n');

  // A. Syntax
  console.log('--- A. SYNTAX ---');
  try {
    execSync(`node --check ${path.join(__dirname, '../index.js')}`, { stdio: 'pipe' });
    ok('index.js syntax');
  } catch (e) {
    no('index.js syntax', 'syntax error');
  }

  try {
    execSync(`node --check ${path.join(__dirname, '../deploy-commands.js')}`, { stdio: 'pipe' });
    ok('deploy-commands.js syntax');
  } catch (e) {
    no('deploy-commands.js syntax', 'syntax error');
  }

  // B. Data
  console.log('--- B. DATA ---');
  const words1 = loadData('data/words');
  const words2 = loadData('data/words_hsk2');
  const lessons1 = loadData('data/lessons');
  const lessons2 = loadData('data/lessons_hsk2');
  const badges = loadData('data/badges');
  const grammar1 = loadData('data/grammar');
  const grammar2 = loadData('data/grammar_hsk2');
  const tones1 = loadData('data/tones');
  const tones2 = loadData('data/tones_hsk2');
  const susun1 = loadData('data/susun_kalimat');
  const susun2 = loadData('data/susun_hsk2');
  const emoji = loadData('data/emoji_game');
  const ws = loadData('data/wordsearch');
  const challenges1 = loadData('data/challenges');
  const challenges2 = loadData('data/challenges_hsk2');

  check('Words HSK1 = 150', words1.length === 150, `got ${words1.length}`);
  check('Words HSK2 = 150', words2.length === 150, `got ${words2.length}`);
  check('Lessons HSK1 = 28', lessons1.length === 28, `got ${lessons1.length}`);
  check('Lessons HSK2 = 32', lessons2.length === 32, `got ${lessons2.length}`);
  check('Badges = 20', badges.length === 20, `got ${badges.length}`);
  check('Grammar total = 16', grammar1.length + grammar2.length === 16, `got ${grammar1.length + grammar2.length}`);
  check('Tones total = 40', tones1.length + tones2.length === 40, `got ${tones1.length + tones2.length}`);
  check('Susun total = 40', susun1.length + susun2.length === 40, `got ${susun1.length + susun2.length}`);
  check('Emoji = 30', emoji.length === 30, `got ${emoji.length}`);
  check('Wordsearch pools = 5', ws.length === 5, `got ${ws.length}`);
  check('Challenges total = 20', challenges1.length + challenges2.length === 20, `got ${challenges1.length + challenges2.length}`);

  // C. Data integrity
  console.log('--- C. DATA INTEGRITY ---');
  const ids1 = new Set(words1.map(w => w.id));
  const overlap = words2.filter(w => ids1.has(w.id)).map(w => w.id);
  check('No word ID overlap', overlap.length === 0, overlap.length ? `overlap: ${overlap.join(',')}` : '');

  const allWords = [...words1, ...words2];
  const minId = allWords.length ? Math.min(...allWords.map(w => w.id)) : null;
  const maxId = allWords.length ? Math.max(...allWords.map(w => w.id)) : null;
  check('Combined words = 300', allWords.length === 300, `got ${allWords.length}`);
  check('Word ID range = 1-300', minId === 1 && maxId === 300, `${minId}-${maxId}`);

  const allWordIdSet = new Set(allWords.map(w => w.id));
  const allLessons = [...lessons1, ...lessons2];
  let badRefs = 0;
  for (const l of allLessons) {
    const wordIds = l.wordIds || l.word_ids || [];
    for (const wid of wordIds) {
      if (!allWordIdSet.has(wid)) badRefs++;
    }
  }
  check('Lesson wordIds valid', badRefs === 0, badRefs ? `${badRefs} invalid refs` : '');

  // D. Database
  console.log('--- D. DATABASE ---');
  try {
    const db = new Database(path.join(__dirname, '../database/duochinese.db'));
    const total = db.prepare('SELECT COUNT(*) as c FROM words').get().c;
    const h1 = db.prepare('SELECT COUNT(*) as c FROM words WHERE hsk_level=1').get().c;
    const h2 = db.prepare('SELECT COUNT(*) as c FROM words WHERE hsk_level=2').get().c;
    const mm = db.prepare('SELECT MIN(id) as min, MAX(id) as max FROM words').get();
    const users = db.prepare('SELECT COUNT(*) as c FROM users').get().c;

    check('DB words total = 300', total === 300, `got ${total}`);
    check('DB HSK1 = 150', h1 === 150, `got ${h1}`);
    check('DB HSK2 = 150', h2 === 150, `got ${h2}`);
    check('DB ID range = 1-300', mm.min === 1 && mm.max === 300, `${mm.min}-${mm.max}`);
    check('DB has >= 1 user', users >= 1, `got ${users}`);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
    const requiredTables = ['users', 'user_words', 'user_badges', 'user_lessons', 'user_challenges', 'battles', 'words', 'server_xp', 'daily_logins', 'purchases', 'weekly_stats', 'notifications', 'leaderboard_seasons', 'season_snapshots', 'pair_sessions', 'flashcard_sessions'];
    for (const t of requiredTables) {
      check(`Table exists: ${t}`, tables.includes(t));
    }

    const userCols = db.prepare("PRAGMA table_info(users)").all().map(r => r.name);
    const requiredUserCols = ['streak_freeze_count', 'streak_freeze_active', 'double_xp_until', 'total_xp_spent'];
    for (const c of requiredUserCols) {
      check(`User column exists: ${c}`, userCols.includes(c));
    }

    db.close();
  } catch (e) {
    no('Database accessible', e.message);
  }

  // E. Handlers / routes
  console.log('--- E. HANDLERS & ROUTES ---');
  const indexSrc = fs.readFileSync(path.join(__dirname, '../index.js'), 'utf8');

  const handlers = [
    'handleMulai', 'handleLanjut', 'handleReview', 'handleProfil',
    'handleStatistik', 'handleStreak', 'handleBadge', 'handleLeaderboard',
    'handleKataHariIni', 'handleSkillmap', 'handleGrammar', 'handleChallenge',
    'handleToneTrain', 'handleSusun', 'handleBattle', 'handleKamus',
    'handleReminder', 'handleDaily', 'handleTebakEmoji', 'handleWordSearch',
    'handleSpeedRound', 'handleSetupRoles', 'handleSyncRoles',
    'handleDbStats', 'handleBotInfo', 'handleAdminUser'
  ];

  for (const h of handlers) {
    check(`Handler exists: ${h}`, indexSrc.includes(`async function ${h}`));
  }

  const routes = [
    'mulai','lanjut','review','profil','statistik','streak','badge','leaderboard',
    'katahariini','skillmap','grammar','challenge','tonetrain','susun','battle',
    'kamus','reminder','daily','tebakemoji','wordsearch','speedround',
    'setuproles','syncroles','dbstats','botinfo','adminuser',
    'shop','buy','weekly','notif','quiz','flashcard','progress','hint','pair'
  ];

  for (const r of routes) {
    check(`Route exists: ${r}`, indexSrc.includes(`${r}:handle`));
  }

  // F. Discord API global commands
  console.log('--- F. DISCORD API ---');
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    const cmds = await rest.get(Routes.applicationCommands(process.env.CLIENT_ID));
    const names = cmds.map(c => c.name);
    check('Global commands count >= 30', names.length >= 30, `got ${names.length}`);
    for (const r of routes) {
      check(`Global cmd: ${r}`, names.includes(r));
    }
  } catch (e) {
    warn('Discord API check failed', e.message);
  }

  // G. System / PM2 / backup
  console.log('--- G. SYSTEM ---');
  try {
    const pm2Raw = execSync('pm2 jlist 2>/dev/null', { encoding: 'utf8' });
    const list = JSON.parse(pm2Raw);
    const app = list.find(p => p.name === 'duochinese');
    check('PM2 app exists', !!app);
    check('PM2 status online', app && app.pm2_env && app.pm2_env.status === 'online', app?.pm2_env?.status || 'not found');
  } catch (e) {
    warn('PM2 check failed', e.message);
  }

  try {
    const cron = execSync('crontab -l 2>/dev/null', { encoding: 'utf8' });
    check('Backup cron active', cron.includes('backup.js'));
  } catch (e) {
    warn('Cron check failed', e.message);
  }

  try {
    const backupDir = '/root/backups/duochinese';
    const backups = fs.existsSync(backupDir) ? fs.readdirSync(backupDir).filter(f => f.startsWith('backup_')) : [];
    check('Backup files exist', backups.length > 0, `count ${backups.length}`);
  } catch (e) {
    warn('Backup dir check failed', e.message);
  }

  // H. Files
  console.log('--- H. FILES ---');
  check('UAT.md exists', fs.existsSync(path.join(__dirname, '../UAT.md')));
  check('roleSync.js exists', fs.existsSync(path.join(__dirname, '../utils/roleSync.js')));
  check('backup.js exists', fs.existsSync(path.join(__dirname, '../utils/backup.js')));
  check('notifier.js exists', fs.existsSync(path.join(__dirname, '../utils/notifier.js')));
  check('leaderboardReset.js exists', fs.existsSync(path.join(__dirname, '../utils/leaderboardReset.js')));

  console.log('\n======================================');
  for (const line of results) console.log(line);
  console.log('======================================');
  console.log(`RESULT: ✅ ${passed} passed | ❌ ${failed} failed | ⚠️ ${warnings} warnings`);
  console.log('======================================');

  if (failed === 0) {
    console.log('\n🎉 ALL TESTS PASSED — BOT IS PRODUCTION READY\n');
  } else {
    console.log('\n⚠️ Some tests failed — review lines above.\n');
  }

  process.exit(failed > 0 ? 1 : 0);
})();
