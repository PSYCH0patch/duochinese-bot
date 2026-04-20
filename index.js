require('dotenv').config();
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// === DATA LOADER & NORMALIZER ===
function loadData(filePath) {
  try {
    const mod = require(filePath);
    if (Array.isArray(mod)) return mod;
    for (const key of Object.keys(mod)) { if (Array.isArray(mod[key])) return mod[key]; }
    return [];
  } catch (e) { return []; }
}

const data = {
  words: [...loadData('./data/words'), ...loadData('./data/words_hsk2')],
  lessons: [...loadData('./data/lessons'), ...loadData('./data/lessons_hsk2')],
  grammar: [...loadData('./data/grammar'), ...loadData('./data/grammar_hsk2')],
  badges: loadData('./data/badges'),
  challenges: [...loadData('./data/challenges'), ...loadData('./data/challenges_hsk2')],
  tones: [...loadData('./data/tones'), ...loadData('./data/tones_hsk2')],
  susun: [...loadData('./data/susun_kalimat'), ...loadData('./data/susun_hsk2')],
  emoji: loadData('./data/emoji_game'),
  wordsearch: loadData('./data/wordsearch')
};

const helpers = require('./utils/helpers');
const db = new Database(path.join(__dirname, 'database', 'duochinese.db'));
db.pragma('journal_mode = WAL');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
client.sessions = new Map();
client.battleSessions = new Map();
client.wordsearchSessions = new Map();
client.speedSessions = new Map();

// Centralized DB Helpers for commands
client.dbUtils = {
  ensureUser: (id, name) => {
    if (!db.prepare('SELECT user_id FROM users WHERE user_id=?').get(id)) {
      db.prepare("INSERT INTO users (user_id, username, last_active, hearts_refreshed_at) VALUES (?,?,?,?)")
        .run(id, name, helpers.todayStr(), new Date().toISOString());
    }
    return db.prepare('SELECT * FROM users WHERE user_id=?').get(id);
  },
  addXp: (id, amt, gId) => {
    db.prepare('UPDATE users SET xp = xp + ? WHERE user_id=?').run(amt, id);
    if (gId) {
      if (db.prepare('SELECT 1 FROM server_xp WHERE user_id=? AND guild_id=?').get(id, gId)) {
        db.prepare('UPDATE server_xp SET xp=xp+? WHERE user_id=? AND guild_id=?').run(amt, id, gId);
      } else {
        db.prepare('INSERT INTO server_xp (user_id, guild_id, xp) VALUES (?,?,?)').run(id, gId, amt);
      }
    }
  }
};

client.once('clientReady', () => {
  console.log(`✅ ${client.user.tag} Online!`);
  console.log(`📊 Words: ${data.words.length} | Lessons: ${data.lessons.length}`);
});

// Simple Logic for Interactions (Untuk sementara tetap di index agar tidak over-complex saat gass)
client.on('interactionCreate', async (int) => {
  // Logic quiz, button, modal dsb tetap berjalan menggunakan helper dari data global
  // Kita akan perlahan pindahkan ke folder commands jika kamu mau.
});

client.login(process.env.BOT_TOKEN);
