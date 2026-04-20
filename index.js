require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

function loadData(filePath) {
  try {
    const mod = require(filePath);
    if (Array.isArray(mod)) return mod;
    for (const key of Object.keys(mod)) { if (Array.isArray(mod[key])) return mod[key]; }
    return [];
  } catch (e) { console.log(`⚠️  Cannot load ${filePath}: ${e.message}`); return []; }
}

const words      = loadData('./data/words');
const lessons    = loadData('./data/lessons');
const badges     = loadData('./data/badges');
const grammar    = loadData('./data/grammar');
const challenges = loadData('./data/challenges');
const tones      = loadData('./data/tones');
const wordsHsk2      = loadData('./data/words_hsk2');
const lessonsHsk2    = loadData('./data/lessons_hsk2');
const grammarHsk2    = loadData('./data/grammar_hsk2');
const tonesHsk2      = loadData('./data/tones_hsk2');
const susunHsk2      = loadData('./data/susun_hsk2');
const challengesHsk2 = loadData('./data/challenges_hsk2');
const emojiGame      = loadData('./data/emoji_game');
const wordsearchPools = loadData('./data/wordsearch');
let susunHsk1 = loadData('./data/susun_kalimat');

const allWords      = [...words, ...wordsHsk2];
const allLessons    = [...lessons, ...lessonsHsk2];
const allGrammar    = [...grammar, ...grammarHsk2];
const allTones      = [...tones, ...tonesHsk2];
const allChallenges = [...challenges, ...challengesHsk2];
const susun         = [...susunHsk1, ...susunHsk2];

function normalizeBadge(b) { return { id: b.id, emoji: b.emoji||'🏅', nama: b.nama||b.name||String(b.id), deskripsi: b.deskripsi||b.description||'' }; }
function normalizeLesson(l) { return { id: l.id, unit: l.unit, nama: l.nama||l.title||`Lesson ${l.id}`, deskripsi: l.deskripsi||l.description||'', wordIds: l.wordIds||[], isBoss: l.isBoss||false }; }
function normalizeGrammar(g) { return { id: g.id, judul: g.judul||g.title||`Grammar ${g.id}`, level: g.level||'HSK 1', penjelasan: g.penjelasan||g.explanation||g.content||'' }; }
function normalizeChallenge(c) { return { id: c.id, nama: c.nama||c.title||`Challenge ${c.id}`, deskripsi: c.deskripsi||c.description||c.desc||'', target: c.target||5, xpReward: c.xpReward||c.xp||30, kategori: c.kategori||c.type||'umum' }; }
function normalizeTone(t) { if (t.opsi&&t.jawaban) return { hanzi: t.hanzi, jawaban: t.jawaban, opsi: t.opsi }; return { hanzi: t.hanzi, jawaban: t.pinyin||'', opsi: [t.pinyin||'', t.pinyin+'1', t.pinyin+'2', t.pinyin+'3'].slice(0,4) }; }

const allBadges     = badges.map(normalizeBadge);
const allLessonsN   = allLessons.map(normalizeLesson);
const allGrammarN   = allGrammar.map(normalizeGrammar);
const allChallengesN = allChallenges.map(normalizeChallenge);
const allTonesN     = allTones.map(normalizeTone);

const { shuffle, getLevel, xpBar, heartsDisplay, similarity, todayStr, generateWordSearchGrid, renderGrid, getWeakWords, getReviewWords, nextReviewDate, getDailyReward } = require('./utils/helpers');
const { runNotifications, sendNotif } = require('./utils/notifier');
const { SHOP_ITEMS } = require('./config/shop');
const { ensureRoles, syncRole, syncAllRoles } = require('./utils/roleSync');

const db = new Database(path.join(__dirname, 'database', 'duochinese.db'));
db.pragma('journal_mode = WAL');

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const sessions = new Map();
const battleSessions = new Map();
const wordsearchSessions = new Map();
const speedSessions = new Map();


function getWeekString(d = new Date()) {
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const diff = d - start;
  const oneWeek = 604800000;
  const weekNum = Math.ceil(((diff / oneWeek) + start.getDay() + 1) / 1);
  return year + '-W' + String(weekNum).padStart(2, '0');
}

function ensureUser(userId, username) {
  if (!db.prepare('SELECT user_id FROM users WHERE user_id=?').get(userId)) {
    db.prepare('INSERT INTO users (user_id,username,last_active,hearts_refreshed_at,created_at) VALUES (?,?,?,?,?)').run(userId, username, todayStr(), new Date().toISOString(), new Date().toISOString());
  }
  return db.prepare('SELECT * FROM users WHERE user_id=?').get(userId);
}

function updateStreak(userId) {
  const user = db.prepare('SELECT * FROM users WHERE user_id=?').get(userId);
  const today = todayStr();
  const yesterday = new Date(Date.now()-86400000).toISOString().split('T')[0];
  if (user.last_active===today) return user.streak||0;
  const newStreak = user.last_active===yesterday ? (user.streak||0)+1 : 1;
  const maxStreak = Math.max(newStreak, user.max_streak||0);
  db.prepare('UPDATE users SET streak=?,max_streak=?,last_active=? WHERE user_id=?').run(newStreak, maxStreak, today, userId);
  return newStreak;
}

function addXp(userId, amount, guildId=null) {
  if (!amount||amount<=0) return;

  // Check double XP
  const userDoubleXp = db.prepare('SELECT double_xp_until FROM users WHERE user_id=?').get(userId);
  if (userDoubleXp && userDoubleXp.double_xp_until && new Date(userDoubleXp.double_xp_until) > new Date()) {
    amount = amount * 2;
  }

  db.prepare('UPDATE users SET xp=xp+? WHERE user_id=?').run(amount, userId);
  if (guildId) {
    if (db.prepare('SELECT 1 FROM server_xp WHERE user_id=? AND guild_id=?').get(userId, guildId))
      db.prepare('UPDATE server_xp SET xp=xp+? WHERE user_id=? AND guild_id=?').run(amount, userId, guildId);
    else
      db.prepare('INSERT INTO server_xp (user_id,guild_id,xp) VALUES (?,?,?)').run(userId, guildId, amount);
  }
  const {xp} = db.prepare('SELECT xp FROM users WHERE user_id=?').get(userId);
  const newLevel = getLevel(xp).level;
  db.prepare('UPDATE users SET level=? WHERE user_id=?').run(newLevel, userId);

  // Auto role sync
  if (guildId) {
    const guild = client.guilds.cache.get(guildId);
    if (guild) syncRole(guild, userId, newLevel).catch(() => {});
  }

  // Track weekly stats
  const weekStr = getWeekString();
  const existing = db.prepare('SELECT * FROM weekly_stats WHERE user_id=? AND week=?').get(userId, weekStr);
  if (existing) {
    db.prepare('UPDATE weekly_stats SET xp_earned=xp_earned+? WHERE user_id=? AND week=?').run(amount, userId, weekStr);
  } else {
    db.prepare('INSERT INTO weekly_stats (user_id,week,xp_earned) VALUES (?,?,?)').run(userId, weekStr, amount);
  }
}

function checkHearts(userId) {
  const u = db.prepare('SELECT hearts,hearts_refreshed_at FROM users WHERE user_id=?').get(userId);
  if (u.hearts<5 && u.hearts_refreshed_at) {
    const hrs = (Date.now()-new Date(u.hearts_refreshed_at))/3600000;
    if (hrs>=1) { const add=Math.min(Math.floor(hrs),5-u.hearts); db.prepare('UPDATE users SET hearts=MIN(hearts+?,5),hearts_refreshed_at=? WHERE user_id=?').run(add,new Date().toISOString(),userId); }
  }
  return db.prepare('SELECT hearts FROM users WHERE user_id=?').get(userId).hearts;
}

function loseHeart(userId) {
  db.prepare('UPDATE users SET hearts=MAX(hearts-1,0) WHERE user_id=?').run(userId);
  return db.prepare('SELECT hearts FROM users WHERE user_id=?').get(userId).hearts;
}

function awardBadge(userId, badgeId) { db.prepare('INSERT OR IGNORE INTO user_badges (user_id,badge_id) VALUES (?,?)').run(userId, badgeId); }

function checkAndAwardBadges(userId) {
  const user = db.prepare('SELECT * FROM users WHERE user_id=?').get(userId);
  const earned = new Set(db.prepare('SELECT badge_id FROM user_badges WHERE user_id=?').all(userId).map(b=>b.badge_id));
  const wordCount = db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id=? AND times_correct>=3').get(userId).c;
  const newBadges = [];
  const check = (id,cond) => { if (cond&&!earned.has(id)) { awardBadge(userId,id); newBadges.push(id); } };
  check('first_step',(user.lessons_completed||0)>=1);
  check('streak_3',(user.streak||0)>=3); check('streak_7',(user.streak||0)>=7);
  check('streak_30',(user.streak||0)>=30); check('streak_100',(user.streak||0)>=100);
  check('words_25',wordCount>=25); check('words_50',wordCount>=50);
  check('words_100',wordCount>=100); check('words_all',wordCount>=allWords.length);
  check('unit1_done',(user.current_unit||1)>1); check('unit4_done',(user.current_unit||1)>4);
  check('all_done',(user.lessons_completed||0)>=allLessonsN.length);
  check('review_master',(user.total_reviews||0)>=100);
  check('comeback',(user.streak||0)===1&&(user.max_streak||0)>=3);

  // Send badge notifications
  if (newBadges.length > 0) {
    const user = db.prepare('SELECT notif_channel, notif_enabled FROM users WHERE user_id=?').get(userId);
    if (user && user.notif_channel && user.notif_enabled) {
      const badgeNames = newBadges.map(id => {
        const b = allBadges.find(bg => bg.id === id);
        return b ? b.emoji + ' **' + b.nama + '**' : id;
      }).join('\n');
      sendNotif(client, userId, user.notif_channel, new EmbedBuilder()
        .setColor(0xf39c12)
        .setTitle('🏅 Badge Baru!')
        .setDescription('Kamu mendapatkan badge baru!\n\n' + badgeNames)
        .setFooter({ text: 'DuoChinese • Achievement unlocked!' })
      ).catch(() => {});
    }
  }
  return newBadges;
}

function generateQuestion(word, pool, type=null) {
  const types=['arti','hanzi','pinyin','fill'];
  const qType=type||types[Math.floor(Math.random()*types.length)];
  const sameUnit=pool.filter(w=>w.unit===word.unit&&w.id!==word.id);
  const src=sameUnit.length>=3?sameUnit:pool.filter(w=>w.id!==word.id);
  const wrong=shuffle(src).slice(0,3);
  switch(qType) {
    case 'arti': return { type:'arti', question:`Apa arti dari **${word.hanzi}** (${word.pinyin})?`, options:shuffle([{label:word.arti.slice(0,80),value:`correct_${word.id}`,correct:true},...wrong.map(w=>({label:w.arti.slice(0,80),value:`wrong_${w.id}`,correct:false}))]), word };
    case 'hanzi': return { type:'hanzi', question:`Mana hanzi yang artinya **"${word.arti}"**?`, options:shuffle([{label:word.hanzi,value:`correct_${word.id}`,correct:true},...wrong.map(w=>({label:w.hanzi,value:`wrong_${w.id}`,correct:false}))]), word };
    case 'pinyin': return { type:'pinyin', question:`Apa pinyin dari **${word.hanzi}**?`, options:shuffle([{label:word.pinyin,value:`correct_${word.id}`,correct:true},...wrong.map(w=>({label:w.pinyin,value:`wrong_${w.id}`,correct:false}))]), word };
    case 'fill': {
      if (!word.contoh||!word.contoh.includes(word.hanzi)) return generateQuestion(word,pool,'arti');
      return { type:'fill', question:`Isi yang hilang:\n${word.contoh.replace(word.hanzi,'____')}\n*(${word.contoh_pinyin})*\n"${word.contoh_arti}"`, options:shuffle([{label:word.hanzi,value:`correct_${word.id}`,correct:true},...wrong.map(w=>({label:w.hanzi,value:`wrong_${w.id}`,correct:false}))]), word };
    }
    default: return generateQuestion(word,pool,'arti');
  }
}

function buildUI(question, qNum, totalQ, hearts, label='', ownerId='') {
  const emojis=['1️⃣','2️⃣','3️⃣','4️⃣'];
  return {
    embed: new EmbedBuilder().setColor(0x3498db).setTitle(`📝 Soal ${qNum}/${totalQ}`).setDescription(question.question).setFooter({text:`${heartsDisplay(hearts)} ${label}`}),
    row: new ActionRowBuilder().addComponents(question.options.map((opt,i)=>{
      const cid = (ownerId && ownerId !== '') ? opt.value + '_uid_' + ownerId : opt.value;
      return new ButtonBuilder().setCustomId(cid.slice(0,100)).setLabel(opt.label.slice(0,80)).setEmoji(emojis[i]).setStyle(ButtonStyle.Secondary);
    }))
  };
}

async function finishSession(userId, session, interaction) {
  const {questions,score,startTime,guildId,isReview,isTone,isEmoji} = session;
  const total=questions.length, pct=Math.round((score/total)*100), elapsed=Math.round((Date.now()-startTime)/1000), hearts=checkHearts(userId);
  let xp=score*(isTone?5:isEmoji?8:10);
  if (!isReview&&!isTone&&!isEmoji) { if(score===total) xp+=20; if(elapsed<60&&total>=3) xp+=10; }
  addXp(userId, xp, guildId);
  if (!isReview&&!isTone&&!isEmoji) {
    const lesson=allLessonsN.find(l=>l.id===session.lessonId);
    if (lesson) {
      const prev=db.prepare('SELECT best_score FROM user_lessons WHERE user_id=? AND lesson_id=?').get(userId,lesson.id);
      db.prepare('INSERT OR REPLACE INTO user_lessons (user_id,lesson_id,completed,best_score) VALUES (?,?,1,?)').run(userId,lesson.id,Math.max(score,prev?.best_score||0));
      if (pct>=60) {
        const user=db.prepare('SELECT current_lesson FROM users WHERE user_id=?').get(userId);
        if ((user.current_lesson||1)<=lesson.id) {
          const next=allLessonsN.find(l=>l.id===lesson.id+1);
          if (next) db.prepare('UPDATE users SET current_lesson=?,current_unit=?,lessons_completed=lessons_completed+1 WHERE user_id=?').run(next.id,next.unit,userId);
          else db.prepare('UPDATE users SET lessons_completed=lessons_completed+1 WHERE user_id=?').run(userId);
        }
      }
      if (lesson.isBoss&&score===total) { awardBadge(userId,'boss_slayer'); if(lesson.id>=allLessonsN.length-1) awardBadge(userId,'final_boss'); }
    }
    if (score===total) awardBadge(userId,'perfect');
    if (elapsed<30&&total>=5) awardBadge(userId,'speed_demon');
    if (hearts===0&&pct>=60) awardBadge(userId,'survivor');
  }
  if ((db.prepare('SELECT total_reviews FROM users WHERE user_id=?').get(userId).total_reviews||0)>=100) awardBadge(userId,'review_master');
  
  // Level up notification
  const prevLevel = session._prevLevel || 0;
  const newUserData = db.prepare('SELECT level, notif_channel, notif_enabled FROM users WHERE user_id=?').get(userId);
  if (newUserData && prevLevel > 0 && newUserData.level > prevLevel && newUserData.notif_channel && newUserData.notif_enabled) {
    const lvlInfo = getLevel(newUserData.xp || 0);
    sendNotif(client, userId, newUserData.notif_channel, new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🎉 Level Naik!')
      .setDescription('Selamat! Kamu naik ke **' + lvlInfo.nama + '**!\n\nTerus semangat belajar! 🚀')
      .setFooter({ text: 'DuoChinese • Level up!' })
    ).catch(() => {});
  }

const newBadges=checkAndAwardBadges(userId);
  const title=pct===100?'🌟 PERFECT!':pct>=80?'🎉 Hebat!':pct>=60?'👍 Bagus!':'😅 Coba lagi!';
  const label=isReview?'Review':isTone?'Tone Training':isEmoji?'Tebak Emoji':'Lesson';
  const embed=new EmbedBuilder().setColor(pct>=60?0x2ecc71:0xe74c3c).setTitle(`${title} — ${label} Selesai!`)
    .addFields({name:'📊 Skor',value:`${score}/${total} (${pct}%)`,inline:true},{name:'💰 XP',value:`+${xp}`,inline:true},{name:'⏱️ Waktu',value:`${elapsed}s`,inline:true},{name:'❤️ Nyawa',value:heartsDisplay(hearts),inline:true});
  if (newBadges.length>0) embed.addFields({name:'🏅 Badge Baru!',value:newBadges.map(id=>{const b=allBadges.find(bg=>bg.id===id);return b?`${b.emoji} ${b.nama}`:id;}).join(', ')});
  const weak=getWeakWords(db,userId,3);
  if (weak.length>0&&pct<100) embed.addFields({name:'🧠 Perlu diulang',value:weak.map(w=>`${w.hanzi} (${w.pinyin}) — ${w.arti}`).join('\n')});
  const reviewCount=getReviewWords(db,userId).length;
  embed.setFooter({text:reviewCount>0?`📌 ${reviewCount} kata perlu /review | /lanjut untuk lanjut`:'✅ Review beres! | /lanjut untuk lanjut'});
  sessions.delete(userId);
  return interaction.update({embeds:[embed],components:[]});
}


function getAdaptiveReviewQueue(userId, limit=8) {
  const dueRows = getReviewWords(db, userId, limit);
  const weakRows = getWeakWords(db, userId, limit * 2);
  const seen = new Set();
  const words = [];

  for (const row of [...dueRows, ...weakRows]) {
    const wordId = row.word_id;
    if (!wordId || seen.has(wordId)) continue;
    const word = allWords.find(w => w.id === wordId);
    if (!word) continue;
    seen.add(wordId);
    words.push(word);
    if (words.length >= limit) break;
  }

  const dueIds = new Set(dueRows.map(r => r.word_id));
  const weakMixed = words.filter(w => !dueIds.has(w.id)).length;

  return {
    words,
    dueCount: Math.min(dueRows.length, words.length),
    weakMixed
  };
}


function getAdaptiveLessonWords(userId, lessonWords, isBoss=false) {
  let baseWords = shuffle(isBoss ? lessonWords : lessonWords.slice(0,5));
  let injectedWeak = 0;

  if (!isBoss) {
    const weak = getWeakWords(db, userId, 4);
    const weakWordObjs = weak
      .map(w => allWords.find(aw => aw.id === w.word_id))
      .filter(Boolean)
      .filter(w => !baseWords.find(bw => bw.id === w.id));

    const injectCount = Math.min(weakWordObjs.length, 2);
    if (injectCount > 0) {
      const injected = weakWordObjs.slice(0, injectCount);
      const mid = Math.floor(baseWords.length / 2);
      baseWords = [...baseWords.slice(0, mid), ...injected, ...baseWords.slice(mid)];
      injectedWeak = injectCount;
    }
  }

  return { words: baseWords, injectedWeak };
}

async function handleMulai(interaction) {
  const userId=interaction.user.id;
  ensureUser(userId,interaction.user.username); updateStreak(userId);
  db.prepare('UPDATE users SET current_unit=1,current_lesson=1 WHERE user_id=?').run(userId);
  const lesson=allLessonsN[0];
  if (!lesson) return interaction.reply({content:'❌ Lesson tidak ditemukan.',flags:MessageFlags.Ephemeral});
  const hearts=checkHearts(userId);
  if (hearts<=0) return interaction.reply({content:`💔 Nyawa habis! Tunggu 1 jam atau /review.\n${heartsDisplay(0)}`,flags:MessageFlags.Ephemeral});
  const lessonWords=lesson.wordIds.map(id=>allWords.find(w=>w.id===id)).filter(Boolean);
  if (!lessonWords.length) return interaction.reply({content:'❌ Tidak ada kata.',flags:MessageFlags.Ephemeral});
  const qs=shuffle(lesson.isBoss?lessonWords:lessonWords.slice(0,5)).map(w=>generateQuestion(w,allWords));
  sessions.set(userId,{lessonId:lesson.id,questions:qs,current:0,score:0,startTime:Date.now(),guildId:interaction.guildId});
  const {embed,row}=buildUI(qs[0], 1, qs.length, hearts, `Unit ${lesson.unit} • ${lesson.nama}`, userId);
  await interaction.reply({embeds:[embed],components:[row]});
}


async function handleLanjut(interaction) {
  const userId=interaction.user.id;
  const user=ensureUser(userId,interaction.user.username); updateStreak(userId);
  const hearts=checkHearts(userId);
  if (hearts<=0) return interaction.reply({content:`💔 Nyawa habis!\n${heartsDisplay(0)}`,flags:MessageFlags.Ephemeral});

  const lesson=allLessonsN.find(l=>l.id===(user.current_lesson||1))||allLessonsN[0];
  if (!lesson) return interaction.reply({content:'🎉 Semua lesson selesai!',flags:MessageFlags.Ephemeral});

  const lessonWords=lesson.wordIds.map(id=>allWords.find(w=>w.id===id)).filter(Boolean);
  if (!lessonWords.length) return interaction.reply({content:'❌ Tidak ada kata.',flags:MessageFlags.Ephemeral});

  const adaptive = getAdaptiveLessonWords(userId, lessonWords, lesson.isBoss);
  const qs = adaptive.words.map(w=>generateQuestion(w,allWords));

  sessions.set(userId,{
    lessonId:lesson.id,
    questions:qs,
    current:0,
    score:0,
    startTime:Date.now(),
    guildId:interaction.guildId,
    ownerId:userId
  });

  const label = adaptive.injectedWeak > 0
    ? `Unit ${lesson.unit} • ${lesson.nama} (+${adaptive.injectedWeak} review)`
    : `Unit ${lesson.unit} • ${lesson.nama}`;

  const {embed,row}=buildUI(qs[0], 1, qs.length, hearts, label, userId);
  await interaction.reply({embeds:[embed],components:[row]});
}


async function handleReview(interaction) {
  const userId=interaction.user.id;
  ensureUser(userId,interaction.user.username);
  updateStreak(userId);

  const adaptive = getAdaptiveReviewQueue(userId, 8);
  if (!adaptive.words.length) {
    return interaction.reply({
      content:'✅ Tidak ada kata yang perlu di-review sekarang! Gunakan /lanjut untuk belajar.',
      flags:MessageFlags.Ephemeral
    });
  }

  const qs = adaptive.words.map(w => generateQuestion(w, allWords));
  sessions.set(userId,{
    lessonId:'review',
    questions:qs,
    current:0,
    score:0,
    startTime:Date.now(),
    guildId:interaction.guildId,
    isReview:true,
    ownerId:userId
  });

  const hearts = checkHearts(userId);

  let label = '🧠 Review Lemah';
  if (adaptive.dueCount > 0 && adaptive.weakMixed > 0) label = '🔄 Review Campuran';
  else if (adaptive.dueCount > 0) label = '🔄 Review SRS';

  const ui = buildUI(qs[0], 1, qs.length, hearts, label, userId);
  ui.embed.addFields({
    name:'Queue',
    value:'Due: ' + adaptive.dueCount + ' • Lemah: ' + adaptive.weakMixed,
    inline:false
  });

  await interaction.reply({ embeds:[ui.embed], components:[ui.row] });
}



async function handleProfil(interaction) {
  const userId=interaction.user.id;
  const user=ensureUser(userId,interaction.user.username);
  const lvl=getLevel(user.xp||0);
  const wordCount=db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id=? AND times_correct>=3').get(userId).c;
  const badgeCount=db.prepare('SELECT COUNT(*) as c FROM user_badges WHERE user_id=?').get(userId).c;
  const hearts=checkHearts(userId);
  const curLesson=allLessonsN.find(l=>l.id===(user.current_lesson||1))||allLessonsN[0];

  const dueNow = db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id = ? AND next_review <= ?').get(userId, new Date().toISOString()).c;
  const weakFocus = getWeakWords(db, userId, 3);

  const embed = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setTitle('👤 Profil ' + interaction.user.username)
    .setThumbnail(interaction.user.displayAvatarURL())
    .addFields(
      {name:'📊 Level',value:lvl.nama + '\nXP: ' + (user.xp||0) + (lvl.next ? '/' + lvl.next : ' MAX') + '\n' + xpBar(user.xp||0,lvl.next)},
      {name:'❤️ Nyawa',value:heartsDisplay(hearts),inline:true},
      {name:'🔥 Streak',value:(user.streak||0) + ' hari (Max: ' + (user.max_streak||0) + ')',inline:true},
      {name:'📚 Progress',value:'Lesson: ' + (user.lessons_completed||0) + '/' + allLessonsN.length + '\nKata: ' + wordCount + '/' + allWords.length + '\nUnit: ' + (user.current_unit||1),inline:true},
      {name:'🎯 Sekarang',value:curLesson ? ('Unit ' + curLesson.unit + ': ' + curLesson.nama) : '-',inline:true},
      {name:'🏅 Badge',value:badgeCount + '/' + allBadges.length,inline:true},
      {name:'📈 Akurasi',value:(user.total_reviews||0)>0 ? (Math.round((user.total_correct/user.total_reviews)*100) + '%') : '-',inline:true},
      {name:'🔄 Review Queue',value:dueNow > 0 ? (dueNow + ' kata siap direview') : 'Kosong',inline:true},
    )
    .setFooter({text:'Bergabung: ' + (((user.created_at||'').split('T')[0])||'-')});

  if (weakFocus.length > 0) {
    embed.addFields({
      name:'🧠 Kata Lemah',
      value:weakFocus.map(w => w.hanzi + ' (' + w.pinyin + ') — ' + w.arti).join('\n'),
      inline:false
    });
  }

  await interaction.reply({ embeds:[embed] });
}



async function handleStatistik(interaction) {
  const userId=interaction.user.id;
  const user=ensureUser(userId,interaction.user.username);

  const wrongWords=db.prepare('SELECT uw.*,w.hanzi,w.pinyin FROM user_words uw JOIN words w ON uw.word_id=w.id WHERE uw.user_id=? AND uw.times_wrong>0 ORDER BY uw.times_wrong DESC LIMIT 5').all(userId);
  const catStats=db.prepare('SELECT w.kategori,COUNT(*) as total,SUM(CASE WHEN uw.times_correct>=3 THEN 1 ELSE 0 END) as mastered FROM user_words uw JOIN words w ON uw.word_id=w.id WHERE uw.user_id=? GROUP BY w.kategori').all(userId);
  const unitProgress=db.prepare('SELECT w.unit,COUNT(DISTINCT w.id) as total,COUNT(DISTINCT CASE WHEN uw.times_correct>=3 THEN uw.word_id END) as mastered FROM words w LEFT JOIN user_words uw ON w.id=uw.word_id AND uw.user_id=? GROUP BY w.unit ORDER BY w.unit').all(userId);
  const weakRecs = getWeakWords(db, userId, 5);

  const embed = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('📊 Statistik ' + interaction.user.username)
    .addFields(
      {name:'📈 Overview',value:'Review: ' + (user.total_reviews||0) + ' | Benar: ' + (user.total_correct||0) + ' | Akurasi: ' + ((user.total_reviews||0)>0 ? Math.round((user.total_correct/user.total_reviews)*100) : 0) + '%'},
      {name:'❌ Sering Salah',value:wrongWords.length ? wrongWords.map((w,i)=> (i+1) + '. ' + w.hanzi + ' ❌' + w.times_wrong + ' ✅' + w.times_correct).join('\n') : 'Belum ada'},
      {name:'📂 Per Kategori',value:catStats.length ? catStats.map(c=>c.kategori + ': ' + c.mastered + '/' + c.total).join('\n') : 'Belum ada'},
      {name:'📊 Per Unit',value:unitProgress.length ? unitProgress.map(u=>{const p=u.total>0?Math.round((u.mastered/u.total)*100):0;return 'U' + u.unit + ': ' + '█'.repeat(Math.round(p/10)) + '░'.repeat(10-Math.round(p/10)) + ' ' + p + '%';}).join('\n') : 'Belum ada'}
    );

  if (weakRecs.length > 0) {
    embed.addFields({
      name:'🎯 Rekomendasi Review',
      value:weakRecs.map(w => {
        const acc = w.accuracy !== undefined ? Math.round(w.accuracy * 100) : 0;
        return w.hanzi + ' (' + w.pinyin + ') — ' + w.arti + ' • ' + acc + '%';
      }).join('\n'),
      inline:false
    });
  }

  await interaction.reply({ embeds:[embed] });
}


async function handleStreak(interaction) {
  const user=ensureUser(interaction.user.id,interaction.user.username);
  const s=user.streak||0;
  const emoji=s>=100?'👑':s>=30?'⭐':s>=7?'🔥':s>=3?'🔥':'❄️';
  const next=s<3?3:s<7?7:s<30?30:s<100?100:null;
  await interaction.reply({embeds:[new EmbedBuilder().setColor(s>=7?0xff6600:0x95a5a6).setTitle(`${emoji} Streak: ${s} hari`).setDescription(`Max: **${user.max_streak||0}** hari\nTerakhir: ${user.last_active||'-'}`).addFields({name:'🎯 Target',value:next?`${next} hari`:'🏆 LEGENDARY!'})]});
}

async function handleBadge(interaction) {
  const userId=interaction.user.id;
  ensureUser(userId,interaction.user.username);
  const earned=new Set(db.prepare('SELECT badge_id FROM user_badges WHERE user_id=?').all(userId).map(b=>b.badge_id));
  const list=allBadges.map(b=>`${earned.has(b.id)?'✅':'🔒'} ${b.emoji} **${b.nama}** — ${b.deskripsi}`).join('\n');
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0xf39c12).setTitle(`🏅 Badge (${earned.size}/${allBadges.length})`).setDescription(list.slice(0,4096))]});
}

async function handleLeaderboard(interaction) {
  const tipe=interaction.options?.getString('tipe')||'global';
  let rows,title;
  if (tipe==='server'&&interaction.guildId) {
    rows=db.prepare('SELECT u.username,sx.xp,u.streak FROM server_xp sx JOIN users u ON sx.user_id=u.user_id WHERE sx.guild_id=? ORDER BY sx.xp DESC LIMIT 10').all(interaction.guildId);
    title=`🏆 Leaderboard — ${interaction.guild?.name||'Server'}`;
  } else {
    rows=db.prepare('SELECT username,xp,streak FROM users ORDER BY xp DESC LIMIT 10').all();
    title='🏆 Leaderboard Global';
  }
  if (!rows.length) return interaction.reply({content:'Belum ada data!',flags:MessageFlags.Ephemeral});
  const medals=['🥇','🥈','🥉'];
  const list=rows.map((r,i)=>`${i<3?medals[i]:`${i+1}.`} **${r.username}** — ${r.xp||0} XP ${getLevel(r.xp||0).emoji} 🔥${r.streak||0}`).join('\n');
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0xf1c40f).setTitle(title).setDescription(list)]});
}

async function handleKataHariIni(interaction) {
  const word=allWords[Math.floor(Date.now()/86400000)%allWords.length];
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0x9b59b6).setTitle('📅 Kata Hari Ini')
    .addFields({name:'Hanzi',value:word.hanzi,inline:true},{name:'Pinyin',value:word.pinyin,inline:true},{name:'Arti',value:word.arti,inline:true},
      {name:'📝 Contoh',value:`${word.contoh}\n${word.contoh_pinyin}\n"${word.contoh_arti}"`},{name:'Info',value:`Unit ${word.unit} • ${word.kategori} • HSK ${word.id<=150?1:2}`})]});
}

async function handleSkillmap(interaction) {
  const userId=interaction.user.id;
  const user=ensureUser(userId,interaction.user.username);
  const done=new Set(db.prepare('SELECT lesson_id FROM user_lessons WHERE user_id=? AND completed=1').all(userId).map(l=>l.lesson_id));
  const maxUnit=Math.max(...allLessonsN.map(l=>l.unit));

  // Group units into chunks of 2 per embed to fit all 16 units in 8 embeds (Discord max 10)
  const embeds=[];
  for (let u=1;u<=maxUnit;u+=2) {
    let desc='';
    for (let uu=u;uu<=Math.min(u+1,maxUnit);uu++) {
      const ul=allLessonsN.filter(l=>l.unit===uu);
      if (!ul.length) continue;
      const hsk=uu<=8?1:2;
      desc+=`**Unit ${uu} (HSK ${hsk})**\n`;
      desc+=ul.map(l=>`${done.has(l.id)?'✅':l.id===(user.current_lesson||1)?'👉':'🔒'} L${l.id}: ${l.nama}${l.isBoss?' 🏆':''}`).join('\n');
      desc+='\n\n';
    }
    if (desc.trim()) {
      const color=u<=8?0x1abc9c:0xe67e22;
      embeds.push(new EmbedBuilder().setColor(color).setDescription(desc.slice(0,4096)));
    }
    if (embeds.length>=10) break;
  }

  // Set title on first embed
  if (embeds.length>0) {
    embeds[0].setTitle(`🗺️ Skill Map — ${interaction.user.username}`);
  }

  await interaction.reply({embeds});
}

async function handleGrammar(interaction) {
  const nomor=interaction.options?.getInteger('nomor');
  if (!nomor) {
    const list=allGrammarN.map(g=>`**${g.id}.** ${g.judul} *(${g.level})*`).join('\n');
    return interaction.reply({embeds:[new EmbedBuilder().setColor(0x3498db).setTitle('📖 Daftar Grammar').setDescription(list.slice(0,4096))]});
  }
  const g=allGrammarN.find(gr=>gr.id===nomor);
  if (!g) return interaction.reply({content:`❌ Grammar ${nomor} tidak ada. Tersedia 1-${allGrammarN.length}`,flags:MessageFlags.Ephemeral});
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0x3498db).setTitle(`📖 ${g.judul}`).setDescription((g.penjelasan||'').slice(0,4096)).setFooter({text:g.level})]});
}

async function handleChallenge(interaction) {
  const userId=interaction.user.id; ensureUser(userId,interaction.user.username);
  const today=todayStr();
  const ch=allChallengesN[Math.floor(Date.now()/86400000)%allChallengesN.length];
  let uc=db.prepare('SELECT * FROM user_challenges WHERE user_id=? AND date=?').get(userId,today);
  if (!uc) { db.prepare('INSERT INTO user_challenges (user_id,date,challenge_id,progress,completed) VALUES (?,?,?,0,0)').run(userId,today,ch.id); uc={progress:0,completed:0}; }
  const pct=Math.round((uc.progress/ch.target)*100);
  const bar='█'.repeat(Math.round(pct/10))+'░'.repeat(10-Math.round(pct/10));
  await interaction.reply({embeds:[new EmbedBuilder().setColor(uc.completed?0x2ecc71:0xe67e22).setTitle(`🎯 ${ch.nama}`).setDescription(ch.deskripsi)
    .addFields({name:'Progress',value:`${bar} ${uc.progress}/${ch.target}`},{name:'Reward',value:`+${ch.xpReward} XP`,inline:true},{name:'Status',value:uc.completed?'✅ Selesai!':'⏳ Belum',inline:true}).setFooter({text:'Challenge berganti tiap hari!'})]});
}

async function handleToneTrain(interaction) {
  const userId=interaction.user.id; ensureUser(userId,interaction.user.username); updateStreak(userId);
  const data=shuffle(allTonesN).slice(0,5);
  const qs=data.map(t=>({type:'tone',question:`Apa pinyin yang benar untuk **${t.hanzi}**?`,options:shuffle(t.opsi.map(o=>({label:o,value:o===t.jawaban?`correct_tone_${t.hanzi}`:`wrong_tone_${Buffer.from(o).toString('hex')}`,correct:o===t.jawaban}))),word:{hanzi:t.hanzi,pinyin:t.jawaban,arti:t.hanzi,id:null}}));
  sessions.set(userId,{lessonId:'tone',questions:qs,current:0,score:0,startTime:Date.now(),guildId:interaction.guildId,isTone:true,ownerId:userId});
  const hearts=checkHearts(userId);
  const {embed,row}=buildUI(qs[0], 1, 5, hearts, '🎵 Tone Training', userId);
  await interaction.reply({embeds:[embed],components:[row]});
}

async function handleSusun(interaction) {
  const userId=interaction.user.id; ensureUser(userId,interaction.user.username); updateStreak(userId);
  if (!susun.length) return interaction.reply({content:'❌ Data susun tidak tersedia.',flags:MessageFlags.Ephemeral});
  const soal=susun[Math.floor(Math.random()*susun.length)];
  const shuffled=shuffle([...(soal.kata||[])]);
  sessions.set(userId,{type:'susun',jawaban:soal.jawaban,arti:soal.arti,startTime:Date.now(),guildId:interaction.guildId,ownerId:userId});
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0xe74c3c).setTitle('🧩 Susun Kalimat').setDescription(`Susun menjadi kalimat:\n\n**${shuffled.join('  |  ')}**\n\nArti: *"${soal.arti}"*`).setFooter({text:'Klik Jawab!'})],
    components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('susun_answer').setLabel('✍️ Jawab').setStyle(ButtonStyle.Primary))]});
}

async function handleKamus(interaction) {
  const kata=interaction.options.getString('kata').toLowerCase();
  const res=allWords.filter(w=>w.hanzi.includes(kata)||w.pinyin.toLowerCase().includes(kata)||w.arti.toLowerCase().includes(kata)).slice(0,8);
  if (!res.length) return interaction.reply({content:`❌ "${kata}" tidak ditemukan.`,flags:MessageFlags.Ephemeral});
  const list=res.map(w=>`**${w.hanzi}** (${w.pinyin}) — ${w.arti}\n📝 ${w.contoh} *"${w.contoh_arti}"*\nUnit ${w.unit} • HSK ${w.id<=150?1:2}`).join('\n\n');
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0x3498db).setTitle(`📖 Kamus: "${kata}"`).setDescription(list.slice(0,4096)).setFooter({text:`${res.length} hasil`})]});
}

async function handleReminder(interaction) {
  const jam=interaction.options.getString('jam');
  if (!/^\d{1,2}:\d{2}$/.test(jam)) return interaction.reply({content:'❌ Format: HH:MM (contoh: 20:00)',flags:MessageFlags.Ephemeral});
  ensureUser(interaction.user.id,interaction.user.username);
  db.prepare('UPDATE users SET reminder_time=?,reminder_channel=? WHERE user_id=?').run(jam,interaction.channelId,interaction.user.id);
  await interaction.reply({content:`⏰ Reminder diset jam **${jam}**!`,flags:MessageFlags.Ephemeral});
}

async function handleDaily(interaction) {
  const userId=interaction.user.id;
  const user=ensureUser(userId,interaction.user.username);
  const today=todayStr();
  if (user.daily_claimed===today) return interaction.reply({content:'🎁 Sudah klaim hari ini! Coba lagi besok.',flags:MessageFlags.Ephemeral});
  const streak=updateStreak(userId);
  const reward=getDailyReward(streak);
  db.prepare('UPDATE users SET daily_claimed=?,total_daily_claims=COALESCE(total_daily_claims,0)+1 WHERE user_id=?').run(today,userId);
  addXp(userId,reward,interaction.guildId);
  try { db.prepare('INSERT OR IGNORE INTO daily_logins (user_id,date,reward_xp) VALUES (?,?,?)').run(userId,today,reward); } catch(e){}
  checkAndAwardBadges(userId);
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0x2ecc71).setTitle('🎁 Hadiah Login Harian!').setDescription(`Kamu dapat **+${reward} XP**!`)
    .addFields({name:'🔥 Streak',value:`${streak} hari`,inline:true},{name:'📅 Total Login',value:`${(user.total_daily_claims||0)+1} hari`,inline:true},{name:'💡 Info',value:streak>=7?`Bonus streak! +${reward-10} XP ekstra`:'Login 7 hari berturut untuk bonus!'})]});
}

async function handleTebakEmoji(interaction) {
  const userId=interaction.user.id; ensureUser(userId,interaction.user.username); updateStreak(userId);
  if (!emojiGame.length) return interaction.reply({content:'❌ Data emoji game tidak tersedia.',flags:MessageFlags.Ephemeral});
  const data=shuffle(emojiGame).slice(0,5);
  const qs=data.map(eg=>({type:'emoji',question:`Emoji ini menunjukkan apa?\n\n# ${eg.emoji}\n💡 *${eg.hint}*`,options:shuffle(eg.opsi.map(o=>({label:o,value:o===eg.jawaban?`correct_e_${eg.jawaban}`:`wrong_e_${o}`,correct:o===eg.jawaban}))),word:{hanzi:eg.jawaban,pinyin:'',arti:eg.hint,id:null}}));
  sessions.set(userId,{lessonId:'emoji',questions:qs,current:0,score:0,startTime:Date.now(),guildId:interaction.guildId,isEmoji:true,ownerId:userId});
  const hearts=checkHearts(userId);
  const {embed,row}=buildUI(qs[0], 1, 5, hearts, '😃 Tebak Emoji', userId);
  await interaction.reply({embeds:[embed],components:[row]});
}

async function handleWordSearch(interaction) {
  const userId=interaction.user.id; ensureUser(userId,interaction.user.username); updateStreak(userId);
  if (!wordsearchPools.length) return interaction.reply({content:'❌ Data word search tidak tersedia.',flags:MessageFlags.Ephemeral});
  const pool=wordsearchPools[Math.floor(Math.random()*wordsearchPools.length)];
  const {grid,placed}=generateWordSearchGrid(pool.words,pool.fillers,6);
  if (!placed.length) return interaction.reply({content:'❌ Gagal generate grid. Coba lagi!',flags:MessageFlags.Ephemeral});
  wordsearchSessions.set(userId,{grid,placed,found:[],startTime:Date.now(),guildId:interaction.guildId,ownerId:userId});
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0x9b59b6).setTitle(`🔍 Word Search — ${pool.tema}`).setDescription(`Cari **${placed.length}** kata!\n\n${renderGrid(grid)}`).addFields({name:'💡 Cara main',value:'Klik Tebak Kata lalu ketik hanzinya'})],
    components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ws_guess').setLabel('🔍 Tebak Kata').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('ws_hint').setLabel('💡 Hint').setStyle(ButtonStyle.Secondary),new ButtonBuilder().setCustomId('ws_giveup').setLabel('🏳️ Menyerah').setStyle(ButtonStyle.Danger))]});
}

async function handleSpeedRound(interaction) {
  const userId=interaction.user.id; ensureUser(userId,interaction.user.username); updateStreak(userId);
  const weak=getWeakWords(db,userId,5).map(w=>allWords.find(aw=>aw.id===w.word_id)).filter(Boolean);
  const rest=shuffle(allWords.filter(w=>!weak.find(aw=>aw.id===w.id))).slice(0,10-weak.length);
  const pool=shuffle([...weak,...rest]).slice(0,10);
  const qs=pool.map(w=>generateQuestion(w,allWords));
  speedSessions.set(userId,{questions:qs,current:0,score:0,startTime:Date.now(),questionStartTime:Date.now(),guildId:interaction.guildId,times:[]});
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0xff0000).setTitle('⚡ SPEED ROUND!').setDescription('10 soal secepat mungkin!\n⏱️ Cepat = bonus XP!').setFooter({text:'Klik MULAI!'})],
    components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('speed_start').setLabel('🏁 MULAI!').setStyle(ButtonStyle.Danger))]});
}

async function handleBattle(interaction) {
  const userId=interaction.user.id;
  const target=interaction.options.getUser('lawan');
  if (target.id===userId) return interaction.reply({content:'❌ Tidak bisa battle sendiri!',flags:MessageFlags.Ephemeral});
  if (target.bot) return interaction.reply({content:'❌ Tidak bisa battle dengan bot!',flags:MessageFlags.Ephemeral});
  ensureUser(userId,interaction.user.username); ensureUser(target.id,target.username);
  const qs=shuffle(allWords).slice(0,5).map(w=>generateQuestion(w,allWords));
  const res=db.prepare("INSERT INTO battles (challenger_id,challenged_id,total_q,questions,status) VALUES (?,?,5,?,'pending')").run(userId,target.id,JSON.stringify(qs));
  const battleId=res.lastInsertRowid;
  battleSessions.set(battleId,{id:battleId,challengerId:userId,challengedId:target.id,questions:qs,challengerScore:0,challengedScore:0,phase:'waiting',currentQ:0,createdAt:Date.now()});
  await interaction.reply({embeds:[new EmbedBuilder().setColor(0xe74c3c).setTitle('⚔️ Battle Challenge!').setDescription(`**${interaction.user.username}** vs **${target.username}**\n5 soal! Pemenang +50 XP!`).setFooter({text:`Battle #${battleId}`})],
    components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`battle_accept_${battleId}`).setLabel('✅ Terima').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId(`battle_decline_${battleId}`).setLabel('❌ Tolak').setStyle(ButtonStyle.Danger))]});
}

async function handleSetupRoles(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌ Hanya bisa dipakai di server.', flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(0x20n) && !interaction.memberPermissions?.has(0x8n)) {
    return interaction.reply({ content: '❌ Kamu butuh permission **Manage Server** atau **Admin**.', flags: MessageFlags.Ephemeral });
  }
  const res = await ensureRoles(interaction.guild);
  if (!res.ok) return interaction.reply({ content: '❌ Bot tidak punya permission **Manage Roles**. Cek role bot di server settings.', flags: MessageFlags.Ephemeral });
  const { EmbedBuilder } = require('discord.js');
  const embed = new EmbedBuilder()
    .setColor(0x2ecc71).setTitle('🎭 Setup Level Roles Selesai!')
    .addFields(
      { name: '✅ Role baru dibuat', value: res.created.length ? res.created.join('\n') : 'Tidak ada', inline: false },
      { name: '📋 Sudah ada', value: res.existing.length ? `${res.existing.length} role` : '0', inline: false },
      { name: '💡 Next', value: 'Gunakan /syncroles untuk sinkron semua user', inline: false },
    );
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function handleSyncRoles(interaction) {
  if (!interaction.guild) return interaction.reply({ content: '❌ Hanya bisa dipakai di server.', flags: MessageFlags.Ephemeral });
  if (!interaction.memberPermissions?.has(0x20n) && !interaction.memberPermissions?.has(0x8n)) {
    return interaction.reply({ content: '❌ Kamu butuh permission **Manage Server** atau **Admin**.', flags: MessageFlags.Ephemeral });
  }
  const target = interaction.options?.getUser('user');
  if (target) {
    const row = db.prepare('SELECT level FROM users WHERE user_id = ?').get(target.id);
    if (!row) return interaction.reply({ content: `❌ ${target.username} belum ada di database.`, flags: MessageFlags.Ephemeral });
    const ok = await syncRole(interaction.guild, target.id, row.level || 1);
    return interaction.reply({ content: ok ? `✅ Role ${target.username} disinkronkan ke level ${row.level || 1}` : `⚠️ Gagal sync — pastikan bot punya Manage Roles dan role bot lebih tinggi dari level roles.`, flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const res = await syncAllRoles(interaction.guild, db);
  if (!res.ok) return interaction.editReply('❌ Bot tidak punya permission Manage Roles.');
  return interaction.editReply(`✅ Sync selesai!\n• Synced: ${res.synced}\n• Skipped: ${res.skipped}\n• Total member: ${res.total}`);
}



async function handleShop(interaction) {
  const userId = interaction.user.id;
  const user = ensureUser(userId, interaction.user.username);

  const itemList = SHOP_ITEMS.map(item => {
    const canAfford = (user.xp || 0) >= item.cost;
    return (canAfford ? '🟢' : '🔴') + ' **' + item.name + '** — ' + item.cost + ' XP\n' + item.desc;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0xf39c12)
    .setTitle('🏪 XP Shop')
    .setDescription('Belanja item pakai XP kamu!\n\n' + itemList)
    .addFields(
      { name: '💰 XP Kamu', value: String(user.xp || 0), inline: true },
      { name: '💡 Cara beli', value: '/buy item:(pilih item)', inline: true },
    )
    .setFooter({ text: 'XP yang dipakai akan berkurang dari total XP kamu' });

  await interaction.reply({ embeds: [embed] });
}

async function handleBuy(interaction) {
  const userId = interaction.user.id;
  const user = ensureUser(userId, interaction.user.username);
  const itemId = interaction.options.getString('item');
  const item = SHOP_ITEMS.find(i => i.id === itemId);

  if (!item) return interaction.reply({ content: '❌ Item tidak ditemukan.', flags: MessageFlags.Ephemeral });
  if ((user.xp || 0) < item.cost) {
    return interaction.reply({
      content: '❌ XP tidak cukup! Kamu punya **' + (user.xp || 0) + ' XP**, butuh **' + item.cost + ' XP**.\nTerus belajar untuk dapat lebih banyak XP! 📚',
      flags: MessageFlags.Ephemeral
    });
  }

  // Deduct XP
  db.prepare('UPDATE users SET xp = xp - ?, total_xp_spent = COALESCE(total_xp_spent, 0) + ? WHERE user_id = ?')
    .run(item.cost, item.cost, userId);

  // Record purchase
  db.prepare('INSERT INTO purchases (user_id, item, cost) VALUES (?, ?, ?)')
    .run(userId, item.id, item.cost);

  // Apply item effect
  let effectMsg = '';

  switch (item.id) {
    case 'streak_freeze': {
      const today = todayStr();
      db.prepare('UPDATE users SET streak_freeze_count = COALESCE(streak_freeze_count, 0) + 1, streak_freeze_active = ? WHERE user_id = ?')
        .run(today, userId);
      effectMsg = '❄️ Streak Freeze aktif! Streak kamu dilindungi hari ini.';
      break;
    }
    case 'heart_refill': {
      db.prepare('UPDATE users SET hearts = 5, hearts_refreshed_at = ? WHERE user_id = ?')
        .run(new Date().toISOString(), userId);
      effectMsg = '❤️ Nyawa terisi penuh! 5/5';
      break;
    }
    case 'double_xp': {
      const until = new Date(Date.now() + 3600000).toISOString();
      db.prepare('UPDATE users SET double_xp_until = ? WHERE user_id = ?')
        .run(until, userId);
      effectMsg = '⚡ Double XP aktif selama 1 jam! Semua XP x2!';
      break;
    }
    case 'skip_lesson': {
      const curLesson = user.current_lesson || 1;
      const nextLesson = allLessonsN.find(l => l.id === curLesson + 1);
      if (nextLesson) {
        db.prepare('INSERT OR REPLACE INTO user_lessons (user_id, lesson_id, completed, best_score) VALUES (?, ?, 1, 0)')
          .run(userId, curLesson);
        db.prepare('UPDATE users SET current_lesson = ?, current_unit = ?, lessons_completed = lessons_completed + 1 WHERE user_id = ?')
          .run(nextLesson.id, nextLesson.unit, userId);
        effectMsg = '⏩ Lesson ' + curLesson + ' di-skip! Sekarang di Lesson ' + nextLesson.id + '.';
      } else {
        effectMsg = '⏩ Kamu sudah di lesson terakhir!';
        // Refund
        db.prepare('UPDATE users SET xp = xp + ? WHERE user_id = ?').run(item.cost, userId);
      }
      break;
    }
  }

  const newXp = db.prepare('SELECT xp FROM users WHERE user_id = ?').get(userId).xp;

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle('🛒 Pembelian Berhasil!')
      .setDescription(item.emoji + ' **' + item.name + '** telah dibeli!')
      .addFields(
        { name: '💰 XP Dipakai', value: String(item.cost), inline: true },
        { name: '💰 Sisa XP', value: String(newXp), inline: true },
        { name: '✨ Efek', value: effectMsg, inline: false },
      )]
  });
}

async function handleWeekly(interaction) {
  const userId = interaction.user.id;
  const user = ensureUser(userId, interaction.user.username);
  const weekStr = getWeekString();

  const stats = db.prepare('SELECT * FROM weekly_stats WHERE user_id = ? AND week = ?').get(userId, weekStr);

  const xpThisWeek = stats?.xp_earned || 0;
  const reviewsThisWeek = stats?.reviews_done || 0;
  const correctThisWeek = stats?.correct_answers || 0;
  const wordsThisWeek = stats?.words_learned || 0;
  const accThisWeek = reviewsThisWeek > 0 ? Math.round((correctThisWeek / reviewsThisWeek) * 100) : 0;

  // Server ranking this week
  let rankText = '-';
  if (interaction.guildId) {
    const serverWeekly = db.prepare('SELECT ws.user_id, ws.xp_earned, u.username FROM weekly_stats ws JOIN users u ON ws.user_id = u.user_id WHERE ws.week = ? ORDER BY ws.xp_earned DESC LIMIT 10')
      .all(weekStr);

    if (serverWeekly.length > 0) {
      const myRank = serverWeekly.findIndex(r => r.user_id === userId) + 1;
      const medals = ['🥇', '🥈', '🥉'];
      rankText = serverWeekly.slice(0, 5).map((r, i) =>
        (i < 3 ? medals[i] : (i + 1) + '.') + ' ' + r.username + ' — ' + r.xp_earned + ' XP'
      ).join('\n');
      if (myRank > 0) rankText += '\n\nKamu: #' + myRank;
    }
  }

  // Streak info
  const streakEmoji = (user.streak || 0) >= 7 ? '🔥' : (user.streak || 0) >= 3 ? '🔥' : '❄️';

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setColor(0x3498db)
      .setTitle('📊 Rangkuman Minggu Ini — ' + weekStr)
      .setThumbnail(interaction.user.displayAvatarURL())
      .addFields(
        { name: '💰 XP Minggu Ini', value: String(xpThisWeek), inline: true },
        { name: '📚 Kata Baru', value: String(wordsThisWeek), inline: true },
        { name: '🔄 Reviews', value: String(reviewsThisWeek), inline: true },
        { name: '📈 Akurasi', value: accThisWeek + '%', inline: true },
        { name: streakEmoji + ' Streak', value: (user.streak || 0) + ' hari', inline: true },
        { name: '❤️ Nyawa', value: heartsDisplay(checkHearts(userId)), inline: true },
        { name: '🏆 Ranking Minggu Ini', value: rankText, inline: false },
      )
      .setFooter({ text: 'Terus belajar untuk naik ranking! 📚' })]
  });
}

async function handleDbStats(interaction) {
  const isAdmin = interaction.memberPermissions?.has(0x8n) || interaction.user.id === interaction.guild?.ownerId;
  if (!isAdmin) return interaction.reply({ content: '❌ Admin only.', flags: MessageFlags.Ephemeral });

  const totalUsers   = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  const totalWords   = db.prepare('SELECT COUNT(*) as c FROM words').get().c;
  const totalReviews = db.prepare('SELECT SUM(total_reviews) as c FROM users').get().c || 0;
  const totalCorrect = db.prepare('SELECT SUM(total_correct) as c FROM users').get().c || 0;
  const totalLessons = db.prepare('SELECT COUNT(*) as c FROM user_lessons WHERE completed=1').get().c;
  const totalBadges  = db.prepare('SELECT COUNT(*) as c FROM user_badges').get().c;
  const hsk1Count    = db.prepare('SELECT COUNT(*) as c FROM words WHERE hsk_level=1').get().c;
  const hsk2Count    = db.prepare('SELECT COUNT(*) as c FROM words WHERE hsk_level=2').get().c;
  const activeToday  = db.prepare('SELECT COUNT(*) as c FROM users WHERE last_active = ?').get(new Date().toISOString().split('T')[0]).c;
  const topUsers     = db.prepare('SELECT username, xp, streak FROM users ORDER BY xp DESC LIMIT 5').all();
  const globalAcc    = totalReviews > 0 ? Math.round((totalCorrect / totalReviews) * 100) + '%' : '-';

  await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder()
    .setColor(0x3498db).setTitle('📊 Database Stats')
    .addFields(
      { name: '👥 Users',           value: String(totalUsers),   inline: true },
      { name: '🟢 Aktif Hari Ini',  value: String(activeToday),  inline: true },
      { name: '📚 Words',           value: 'HSK1: ' + hsk1Count + ' | HSK2: ' + hsk2Count + ' | Total: ' + totalWords, inline: false },
      { name: '🔄 Total Reviews',   value: String(totalReviews), inline: true },
      { name: '✅ Total Correct',   value: String(totalCorrect), inline: true },
      { name: '📈 Akurasi Global',  value: globalAcc,            inline: true },
      { name: '🎓 Lessons Done',    value: String(totalLessons), inline: true },
      { name: '🏅 Badges Earned',   value: String(totalBadges),  inline: true },
      { name: '🏆 Top 5',           value: topUsers.length ? topUsers.map((u,i) => (i+1) + '. ' + u.username + ' — ' + u.xp + ' XP 🔥' + u.streak).join('\n') : '-', inline: false },
    )
    .setFooter({ text: 'DuoChinese Bot | ' + new Date().toLocaleString('id-ID') })] });
}

async function handleBotInfo(interaction) {
  const sec  = Math.floor(process.uptime());
  const h    = Math.floor(sec / 3600);
  const m    = Math.floor((sec % 3600) / 60);
  const s    = sec % 60;
  const mem  = process.memoryUsage();
  const rss  = Math.round(mem.rss / 1024 / 1024);
  const heap = Math.round(mem.heapUsed / 1024 / 1024);

  await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder()
    .setColor(sessions.size > 20 ? 0xe74c3c : 0x2ecc71)
    .setTitle('🤖 Bot Health Check')
    .addFields(
      { name: '⏱️ Uptime',      value: h + 'j ' + m + 'm ' + s + 'd',       inline: true },
      { name: '💾 Memory RSS',  value: rss + ' MB',                           inline: true },
      { name: '🧠 Heap Used',   value: heap + ' MB',                          inline: true },
      { name: '📝 Sessions',    value: String(sessions.size),                 inline: true },
      { name: '⚔️ Battles',     value: String(battleSessions.size),           inline: true },
      { name: '🔍 Wordsearch',  value: String(wordsearchSessions.size),       inline: true },
      { name: '⚡ Speed',       value: String(speedSessions.size),            inline: true },
      { name: '📦 Node.js',     value: process.version,                       inline: true },
      { name: '🌍 Servers',     value: String(client.guilds.cache.size),      inline: true },
    )
    .setFooter({ text: 'PID: ' + process.pid })] });
}

async function handleAdminUser(interaction) {
  const isAdmin = interaction.memberPermissions?.has(0x8n) || interaction.user.id === interaction.guild?.ownerId;
  if (!isAdmin) return interaction.reply({ content: '❌ Admin only.', flags: MessageFlags.Ephemeral });

  const target     = interaction.options.getUser('user');
  const user       = db.prepare('SELECT * FROM users WHERE user_id = ?').get(target.id);
  if (!user) return interaction.reply({ content: '❌ ' + target.username + ' belum ada di database.', flags: MessageFlags.Ephemeral });

  const lvl        = getLevel(user.xp || 0);
  const wordCount  = db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id = ? AND times_correct >= 3').get(target.id).c;
  const badgeCount = db.prepare('SELECT COUNT(*) as c FROM user_badges WHERE user_id = ?').get(target.id).c;
  const dueNow     = db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id = ? AND next_review <= ?').get(target.id, new Date().toISOString()).c;
  const weakWords  = getWeakWords(db, target.id, 5);
  const wrongMost  = db.prepare('SELECT w.hanzi, w.pinyin, uw.times_wrong, uw.times_correct FROM user_words uw JOIN words w ON uw.word_id = w.id WHERE uw.user_id = ? ORDER BY uw.times_wrong DESC LIMIT 3').all(target.id);
  const acc        = (user.total_reviews || 0) > 0 ? Math.round((user.total_correct / user.total_reviews) * 100) + '%' : '-';

  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('🔍 Admin: ' + target.username)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: '📊 Level',       value: lvl.nama + ' (' + (user.xp || 0) + ' XP)',           inline: true },
      { name: '🔥 Streak',      value: (user.streak || 0) + ' hari',                         inline: true },
      { name: '❤️ Hearts',      value: (user.hearts || 0) + '/5',                            inline: true },
      { name: '📚 Kata',        value: wordCount + '/' + allWords.length,                    inline: true },
      { name: '🏅 Badge',       value: badgeCount + '/' + allBadges.length,                 inline: true },
      { name: '🔄 Due Review',  value: dueNow + ' kata',                                     inline: true },
      { name: '📅 Last Active', value: user.last_active || '-',                              inline: true },
      { name: '🎓 Lessons',     value: (user.lessons_completed || 0) + '/' + allLessonsN.length, inline: true },
      { name: '📈 Akurasi',     value: acc,                                                  inline: true },
    );

  if (weakWords.length > 0) {
    embed.addFields({ name: '🧠 Kata Lemah', value: weakWords.map(w => w.hanzi + ' (' + w.pinyin + ') — ' + w.arti).join('\n') });
  }
  if (wrongMost.length > 0) {
    embed.addFields({ name: '❌ Sering Salah', value: wrongMost.map(w => w.hanzi + ' (' + w.pinyin + ') ❌' + w.times_wrong + ' ✅' + w.times_correct).join('\n') });
  }

  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}


async function handleNotif(interaction) {
  const userId = interaction.user.id;
  ensureUser(userId, interaction.user.username);

  const action = interaction.options?.getString('action') || 'status';

  if (action === 'on') {
    db.prepare('UPDATE users SET notif_channel = ?, notif_enabled = 1 WHERE user_id = ?')
      .run(interaction.channelId, userId);
    return interaction.reply({
      content: '🔔 Notifikasi **diaktifkan** di channel ini!\n\nKamu akan mendapat notif untuk:\n• 📚 Review queue menumpuk\n• 🔥 Streak terancam putus\n• ⚡ Double XP hampir habis\n• ❤️ Nyawa sudah penuh',
      flags: MessageFlags.Ephemeral
    });
  }

  if (action === 'off') {
    db.prepare("UPDATE users SET notif_enabled = 0 WHERE user_id = ?").run(userId);
    return interaction.reply({ content: '🔕 Notifikasi **dimatikan**.', flags: MessageFlags.Ephemeral });
  }

  // Status
  const user = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId);
  const enabled = user.notif_enabled !== 0;
  const channel = user.notif_channel;

  const recentNotifs = db.prepare(
    "SELECT type, sent_at FROM notifications WHERE user_id = ? ORDER BY sent_at DESC LIMIT 5"
  ).all(userId);

  const notifList = recentNotifs.length > 0
    ? recentNotifs.map(n => '• ' + n.type + ' — ' + n.sent_at.split('T')[0]).join('\n')
    : 'Belum ada notifikasi';

  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder()
      .setColor(enabled ? 0x2ecc71 : 0x95a5a6)
      .setTitle('🔔 Status Notifikasi')
      .addFields(
        { name: 'Status', value: enabled ? '✅ Aktif' : '❌ Nonaktif', inline: true },
        { name: 'Channel', value: channel ? '<#' + channel + '>' : 'Belum diset', inline: true },
        { name: '📋 Notif Terakhir', value: notifList, inline: false },
        { name: '💡 Cara atur', value: '/notif action:on — aktifkan\n/notif action:off — matikan', inline: false },
      )]
  });
}

async function handleButton(interaction) {
  const userId=interaction.user.id;
  let cid=interaction.customId;

  // === OWNERSHIP CHECK — runs FIRST before anything else ===
  if (cid.includes('_uid_')) {
    const uidIdx = cid.lastIndexOf('_uid_');
    const ownerId = cid.slice(uidIdx + 5);
    cid = cid.slice(0, uidIdx);
    if (ownerId !== userId) {
      return interaction.reply({
        content: '❌ Tombol ini milik orang lain! Gunakan /mulai untuk sesimu sendiri.',
        flags: MessageFlags.Ephemeral
      });
    }
  }
  if (cid==='susun_answer') {
    const s=sessions.get(userId);
    if (!s||s.type!=='susun') return interaction.reply({content:'❌ Sesi tidak ditemukan.',flags:MessageFlags.Ephemeral});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',flags:MessageFlags.Ephemeral});
    const modal=new ModalBuilder().setCustomId('susun_modal').setTitle('Susun Kalimat');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('susun_input').setLabel('Ketik kalimat yang benar').setStyle(TextInputStyle.Short).setRequired(true)));
    return interaction.showModal(modal);
  }
  if (cid==='speed_start') {
    const s=speedSessions.get(userId);
    if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',flags:MessageFlags.Ephemeral});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',flags:MessageFlags.Ephemeral});
    s.questionStartTime=Date.now(); const {embed,row}=buildUI(s.questions[0],1,10,checkHearts(userId),'⚡ SPEED ROUND');
    return interaction.update({embeds:[embed],components:[row]});
  }
  if (cid==='ws_guess') {
    const modal=new ModalBuilder().setCustomId('ws_guess_modal').setTitle('Tebak Kata');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ws_input').setLabel('Ketik hanzi yang kamu temukan').setStyle(TextInputStyle.Short).setRequired(true)));
    return interaction.showModal(modal);
  }
  if (cid==='ws_hint') {
    const s=wordsearchSessions.get(userId);
    if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',flags:MessageFlags.Ephemeral});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',flags:MessageFlags.Ephemeral});
    const rem=s.placed.filter(p=>!s.found.includes(p.word));
    if (!rem.length) return interaction.reply({content:'✅ Semua kata sudah ditemukan!',flags:MessageFlags.Ephemeral});
    return interaction.reply({content:`💡 **${rem[0].word.length}** karakter, arah ${rem[0].dir==='h'?'horizontal →':'vertikal ↓'}`,flags:MessageFlags.Ephemeral});
  }
  if (cid==='ws_giveup') {
    const s=wordsearchSessions.get(userId);
    if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',flags:MessageFlags.Ephemeral});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',flags:MessageFlags.Ephemeral});
    wordsearchSessions.delete(userId);
    return interaction.update({embeds:[new EmbedBuilder().setColor(0xe74c3c).setTitle('🏳️ Menyerah').setDescription(`Jawabannya: **${s.placed.map(p=>p.word).join(', ')}**\nDitemukan: ${s.found.length}/${s.placed.length}`)],components:[]});
  }
  if (cid.startsWith('battle_accept_')) {
    const battleId=parseInt(cid.replace('battle_accept_','')); const b=battleSessions.get(battleId);
    if (!b) return interaction.reply({content:'❌ Battle tidak ditemukan.',flags:MessageFlags.Ephemeral});
    if (userId!==b.challengedId) return interaction.reply({content:'❌ Bukan untukmu!',flags:MessageFlags.Ephemeral});
    b.phase='challenger_playing';
    const q=b.questions[0];
    const mkRow=(bId,qs,qi)=>new ActionRowBuilder().addComponents(qs[qi].options.map((opt,i)=>new ButtonBuilder().setCustomId(`ba_${bId}_${i}_${opt.correct?'c':'w'}`).setLabel(opt.label.slice(0,80)).setEmoji(['1️⃣','2️⃣','3️⃣','4️⃣'][i]).setStyle(ButtonStyle.Secondary)));
    return interaction.update({embeds:[new EmbedBuilder().setColor(0xe74c3c).setTitle('⚔️ Battle — Giliran Challenger').setDescription(q.question).setFooter({text:'Soal 1/5'})],components:[mkRow(battleId,b.questions,0)]});
  }
  if (cid.startsWith('battle_decline_')) { battleSessions.delete(parseInt(cid.replace('battle_decline_',''))); return interaction.update({embeds:[new EmbedBuilder().setColor(0x95a5a6).setTitle('⚔️ Ditolak').setDescription('Tantangan ditolak.')],components:[]}); }
  if (cid.startsWith('ba_')) {
    const parts=cid.split('_'); const battleId=parseInt(parts[1]); const isCorrect=parts[3]==='c';
    const b=battleSessions.get(battleId); if (!b) return interaction.reply({content:'❌ Battle tidak ditemukan.',flags:MessageFlags.Ephemeral});
    const isC=userId===b.challengerId; const isD=userId===b.challengedId;
    if (b.phase==='challenger_playing'&&!isC) return interaction.reply({content:'❌ Bukan giliranmu!',flags:MessageFlags.Ephemeral});
    if (b.phase==='challenged_playing'&&!isD) return interaction.reply({content:'❌ Bukan giliranmu!',flags:MessageFlags.Ephemeral});
    const mkRow=(bId,qs,qi)=>new ActionRowBuilder().addComponents(qs[qi].options.map((opt,i)=>new ButtonBuilder().setCustomId(`ba_${bId}_${i}_${opt.correct?'c':'w'}`).setLabel(opt.label.slice(0,80)).setEmoji(['1️⃣','2️⃣','3️⃣','4️⃣'][i]).setStyle(ButtonStyle.Secondary)));
    if (b.phase==='challenger_playing') {
      if(isCorrect) b.challengerScore++; b.currentQ++;
      if (b.currentQ>=5) {
        b.phase='challenged_playing'; b.currentQ=0;
        return interaction.update({embeds:[new EmbedBuilder().setColor(0x3498db).setTitle('⚔️ Battle — Giliran Challenged').setDescription(b.questions[0].question).setFooter({text:`Soal 1/5 | Challenger: ${b.challengerScore}/5`})],components:[mkRow(battleId,b.questions,0)]});
      }
      return interaction.update({embeds:[new EmbedBuilder().setColor(isCorrect?0x2ecc71:0xe74c3c).setTitle('⚔️ Challenger').setDescription(`${isCorrect?'✅':'❌'}\n\n${b.questions[b.currentQ].question}`).setFooter({text:`Soal ${b.currentQ+1}/5 | Skor: ${b.challengerScore}`})],components:[mkRow(battleId,b.questions,b.currentQ)]});
    }
    if (b.phase==='challenged_playing') {
      if(isCorrect) b.challengedScore++; b.currentQ++;
      if (b.currentQ>=5) {
        b.phase='done';
        let result;
        if(b.challengerScore>b.challengedScore){result='🏆 Challenger menang!';addXp(b.challengerId,50,interaction.guildId);addXp(b.challengedId,15,interaction.guildId);awardBadge(b.challengerId,'battle_winner');}
        else if(b.challengedScore>b.challengerScore){result='🏆 Challenged menang!';addXp(b.challengedId,50,interaction.guildId);addXp(b.challengerId,15,interaction.guildId);awardBadge(b.challengedId,'battle_winner');}
        else{result='🤝 Seri!';addXp(b.challengerId,25,interaction.guildId);addXp(b.challengedId,25,interaction.guildId);}
        db.prepare('UPDATE battles SET challenger_score=?,challenged_score=?,status=? WHERE id=?').run(b.challengerScore,b.challengedScore,'done',battleId);
        battleSessions.delete(battleId);
        return interaction.update({embeds:[new EmbedBuilder().setColor(0xf1c40f).setTitle('⚔️ Battle Selesai!').setDescription(result).addFields({name:'Challenger',value:`${b.challengerScore}/5`,inline:true},{name:'VS',value:'⚔️',inline:true},{name:'Challenged',value:`${b.challengedScore}/5`,inline:true})],components:[]});
      }
      return interaction.update({embeds:[new EmbedBuilder().setColor(isCorrect?0x2ecc71:0xe74c3c).setTitle('⚔️ Challenged').setDescription(`${isCorrect?'✅':'❌'}\n\n${b.questions[b.currentQ].question}`).setFooter({text:`Soal ${b.currentQ+1}/5 | Skor: ${b.challengedScore}`})],components:[mkRow(battleId,b.questions,b.currentQ)]});
    }
  }
  if (cid.startsWith('correct_')||cid.startsWith('wrong_')) {
    const sp=speedSessions.get(userId);
    if (sp) {
      if (sp.ownerId && sp.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',flags:MessageFlags.Ephemeral});
      const isCorrect=cid.startsWith('correct_'); const elapsed=(Date.now()-sp.questionStartTime)/1000;
      sp.times.push(elapsed); if(isCorrect) sp.score++; sp.current++;
      if (sp.current>=10) {
        const total=(Date.now()-sp.startTime)/1000; const avg=sp.times.reduce((a,b)=>a+b,0)/sp.times.length;
        let xp=sp.score*5+(avg<5?30:avg<10?15:0); addXp(userId,xp,sp.guildId); speedSessions.delete(userId); checkAndAwardBadges(userId);
        return interaction.update({embeds:[new EmbedBuilder().setColor(sp.score>=8?0x2ecc71:0xe74c3c).setTitle('⚡ Speed Round Selesai!').addFields({name:'🎯 Skor',value:`${sp.score}/10`,inline:true},{name:'⏱️ Total',value:`${total.toFixed(1)}s`,inline:true},{name:'⏱️ Avg',value:`${avg.toFixed(1)}s`,inline:true},{name:'💰 XP',value:`+${xp}`,inline:true})],components:[]});
      }
      sp.questionStartTime=Date.now(); const q=sp.questions[sp.current];
      return interaction.update({embeds:[new EmbedBuilder().setColor(0xff0000).setTitle(`⚡ Speed ${sp.current+1}/10`).setDescription(`${isCorrect?'✅':'❌'} (${elapsed.toFixed(1)}s)\n\n${q.question}`).setFooter({text:`Skor: ${sp.score} | Cepat = bonus XP!`})],components:[new ActionRowBuilder().addComponents(q.options.map((opt,i)=>new ButtonBuilder().setCustomId(opt.value).setLabel(opt.label.slice(0,80)).setEmoji(['1️⃣','2️⃣','3️⃣','4️⃣'][i]).setStyle(ButtonStyle.Secondary)))]});
    }
    const session=sessions.get(userId);
    if (!session||session.type==='susun') return interaction.reply({content:'❌ Sesi tidak ditemukan. /mulai untuk mulai',flags:MessageFlags.Ephemeral});
    if (session.ownerId && session.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu! Gunakan /mulai untuk sesi sendiri.',flags:MessageFlags.Ephemeral});
    const isCorrect=cid.startsWith('correct_'); const curQ=session.questions[session.current]; let hearts=checkHearts(userId);
    if (curQ.word&&curQ.word.id) {
      const wid=curQ.word.id; const ex=db.prepare('SELECT * FROM user_words WHERE user_id=? AND word_id=?').get(userId,wid);
      if (ex) {
        if(isCorrect) db.prepare('UPDATE user_words SET times_correct=times_correct+1,last_reviewed=?,next_review=? WHERE user_id=? AND word_id=?').run(new Date().toISOString(),nextReviewDate(ex.times_correct,true),userId,wid);
        else db.prepare('UPDATE user_words SET times_wrong=times_wrong+1,last_reviewed=?,next_review=? WHERE user_id=? AND word_id=?').run(new Date().toISOString(),nextReviewDate(0,false),userId,wid);
      } else {
        db.prepare('INSERT INTO user_words (user_id,word_id,times_correct,times_wrong,last_reviewed,next_review) VALUES (?,?,?,?,?,?)').run(userId,wid,isCorrect?1:0,isCorrect?0:1,new Date().toISOString(),nextReviewDate(isCorrect?1:0,isCorrect));
      }
      db.prepare('UPDATE users SET total_reviews=total_reviews+1 WHERE user_id=?').run(userId);
      if(isCorrect) db.prepare('UPDATE users SET total_correct=total_correct+1 WHERE user_id=?').run(userId);
    }
    if(isCorrect&&session.isReview&&hearts<5){db.prepare('UPDATE users SET hearts=MIN(hearts+1,5) WHERE user_id=?').run(userId);hearts=Math.min(hearts+1,5);}
    else if(!isCorrect&&!session.isReview&&!session.isTone&&!session.isEmoji){hearts=loseHeart(userId);}
    const today=todayStr();
    db.prepare('UPDATE user_challenges SET progress=progress+1 WHERE user_id=? AND date=? AND completed=0').run(userId,today);
    const ch=allChallengesN[Math.floor(Date.now()/86400000)%allChallengesN.length];
    if(ch){const uc=db.prepare('SELECT * FROM user_challenges WHERE user_id=? AND date=?').get(userId,today);if(uc&&uc.progress>=ch.target&&!uc.completed){db.prepare('UPDATE user_challenges SET completed=1 WHERE user_id=? AND date=?').run(userId,today);addXp(userId,ch.xpReward,session.guildId);}}
    if(isCorrect) session.score++; session.current++;
    if(hearts<=0&&!session.isReview&&!session.isTone&&!session.isEmoji){sessions.delete(userId);return interaction.update({embeds:[new EmbedBuilder().setColor(0xe74c3c).setTitle('💔 Nyawa Habis!').setDescription(`Nyawa habis!\nTunggu 1 jam atau /review.\n${heartsDisplay(0)}\nSkor: ${session.score}/${session.current}`)],components:[]});}
    if(session.current>=session.questions.length) return finishSession(userId,session,interaction);
    const nextQ=session.questions[session.current];
    const resultMsg=isCorrect?'✅ **Benar!**':`❌ **Salah!** ${curQ.word.hanzi||''} = ${curQ.word.arti||''}`;
    const label=session.isReview?'🔄 Review':session.isTone?'🎵 Tone':session.isEmoji?'😃 Emoji':(()=>{const l=allLessonsN.find(l=>l.id===session.lessonId);return l?`U${l.unit}•${l.nama}`:'';})();
    return interaction.update({embeds:[new EmbedBuilder().setColor(isCorrect?0x2ecc71:0xe74c3c).setTitle(`📝 Soal ${session.current+1}/${session.questions.length}`).setDescription(`${resultMsg}\n\n${nextQ.question}`).setFooter({text:`${heartsDisplay(hearts)} | Skor: ${session.score} | ${label}`})],components:[new ActionRowBuilder().addComponents(nextQ.options.map((opt,i)=>new ButtonBuilder().setCustomId(opt.value).setLabel(opt.label.slice(0,80)).setEmoji(['1️⃣','2️⃣','3️⃣','4️⃣'][i]).setStyle(ButtonStyle.Secondary)))]});
  }
}

async function handleModal(interaction) {
  const userId=interaction.user.id;
  if (interaction.customId==='susun_modal') {
    const s=sessions.get(userId);
    if (!s||s.type!=='susun') return interaction.reply({content:'❌ Sesi tidak ditemukan.',flags:MessageFlags.Ephemeral});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',flags:MessageFlags.Ephemeral});
    const answer=interaction.fields.getTextInputValue('susun_input').trim();
    const sim=similarity(answer,s.jawaban); const elapsed=Math.round((Date.now()-s.startTime)/1000);
    let xp=2,title='❌ Coba lagi!';
    if(sim===100){title='🌟 PERFECT!';xp=elapsed<15?30:20;}else if(sim>=80){title='👍 Hampir!';xp=10;}else if(sim>=50){title='😅 Lumayan';xp=5;}
    addXp(userId,xp,s.guildId); sessions.delete(userId); checkAndAwardBadges(userId);
    return interaction.reply({embeds:[new EmbedBuilder().setColor(sim===100?0x2ecc71:sim>=50?0xf39c12:0xe74c3c).setTitle(`🧩 ${title}`).addFields({name:'Jawabanmu',value:answer||'(kosong)'},{name:'Jawaban benar',value:s.jawaban},{name:'Arti',value:s.arti},{name:'Kemiripan',value:`${sim}%`,inline:true},{name:'Waktu',value:`${elapsed}s`,inline:true},{name:'XP',value:`+${xp}`,inline:true})]});
  }
  if (interaction.customId==='ws_guess_modal') {
    const s=wordsearchSessions.get(userId);
    if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',flags:MessageFlags.Ephemeral});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',flags:MessageFlags.Ephemeral});
    const guess=interaction.fields.getTextInputValue('ws_input').trim();
    const found=s.placed.find(p=>p.word===guess&&!s.found.includes(p.word));
    if (found) {
      s.found.push(found.word);
      if (s.found.length>=s.placed.length) {
        const elapsed=Math.round((Date.now()-s.startTime)/1000); const xp=30+(elapsed<60?20:0);
        addXp(userId,xp,s.guildId); wordsearchSessions.delete(userId); checkAndAwardBadges(userId);
        return interaction.reply({embeds:[new EmbedBuilder().setColor(0x2ecc71).setTitle('🎉 Semua ditemukan!').setDescription(`Kata: ${s.placed.map(p=>p.word).join(', ')}\nWaktu: ${elapsed}s | +${xp} XP`)]});
      }
      return interaction.reply({content:`✅ **${guess}** ditemukan! (${s.found.length}/${s.placed.length})`,flags:MessageFlags.Ephemeral});
    }
    return interaction.reply({content:s.found.includes(guess)?`⚠️ **${guess}** sudah ditemukan!`:`❌ **${guess}** bukan kata tersembunyi!`,flags:MessageFlags.Ephemeral});
  }
}


function cleanupStaleMaps() {
  const now = Date.now();
  const limits = {
    sessions: 30 * 60 * 1000,
    battle: 20 * 60 * 1000,
    wordsearch: 20 * 60 * 1000,
    speed: 15 * 60 * 1000,
  };

  let cleaned = { sessions: 0, battles: 0, wordsearch: 0, speed: 0 };

  for (const [key, value] of sessions.entries()) {
    const ts = value?.startTime || 0;
    if (ts && (now - ts > limits.sessions)) {
      sessions.delete(key);
      cleaned.sessions++;
    }
  }

  for (const [key, value] of battleSessions.entries()) {
    const ts = value?.createdAt || 0;
    if (ts && (now - ts > limits.battle)) {
      battleSessions.delete(key);
      cleaned.battles++;
    }
  }

  for (const [key, value] of wordsearchSessions.entries()) {
    const ts = value?.startTime || 0;
    if (ts && (now - ts > limits.wordsearch)) {
      wordsearchSessions.delete(key);
      cleaned.wordsearch++;
    }
  }

  for (const [key, value] of speedSessions.entries()) {
    const ts = value?.startTime || 0;
    if (ts && (now - ts > limits.speed)) {
      speedSessions.delete(key);
      cleaned.speed++;
    }
  }

  const total = cleaned.sessions + cleaned.battles + cleaned.wordsearch + cleaned.speed;
  if (total > 0) {
    console.log(`🧹 Cleaned stale sessions: lesson=${cleaned.sessions}, battle=${cleaned.battles}, wordsearch=${cleaned.wordsearch}, speed=${cleaned.speed}`);
  }
}


client.once('clientReady', () => {
  console.log(`✅ ${client.user.tag} online!`);
  console.log(`📊 Words: ${allWords.length} | Lessons: ${allLessonsN.length} | Grammar: ${allGrammarN.length} | Badges: ${allBadges.length} | Tones: ${allTonesN.length}`);
  console.log(`🎮 HSK1: ${words.length}w/${lessons.length}l | HSK2: ${wordsHsk2.length}w/${lessonsHsk2.length}l | Susun: ${susun.length} | Emoji: ${emojiGame.length}`);
  setInterval(()=>{
    const time=new Date().toTimeString().slice(0,5); const today=todayStr();
    db.prepare('SELECT * FROM users WHERE reminder_time=?').all(time).forEach(u=>{
      if(u.last_active===today||!u.reminder_channel) return;
      client.channels.cache.get(u.reminder_channel)?.send(`⏰ <@${u.user_id}> Waktunya belajar! /lanjut atau /review 📚`).catch(()=>{});
    });
  },60000);

  setInterval(() => {
    cleanupStaleMaps();
  }, 5 * 60 * 1000);

  setInterval(() => {
    runNotifications(client, db).catch(err => console.error('Notif error:', err));
  }, 5 * 60 * 1000);

  // Run once on startup too
  setTimeout(() => {
    runNotifications(client, db).catch(() => {});
  }, 10000);
});

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isCommand()) {
      const handlers = {
        mulai:handleMulai, lanjut:handleLanjut, review:handleReview,
        profil:handleProfil, statistik:handleStatistik, streak:handleStreak,
        badge:handleBadge, leaderboard:handleLeaderboard, katahariini:handleKataHariIni,
        skillmap:handleSkillmap, grammar:handleGrammar, challenge:handleChallenge,
        tonetrain:handleToneTrain, susun:handleSusun, battle:handleBattle,
        kamus:handleKamus, reminder:handleReminder, daily:handleDaily,
        tebakemoji:handleTebakEmoji, wordsearch:handleWordSearch, speedround:handleSpeedRound, setuproles:handleSetupRoles, syncroles:handleSyncRoles, shop:handleShop, buy:handleBuy, weekly:handleWeekly, notif:handleNotif, dbstats:handleDbStats, botinfo:handleBotInfo, adminuser:handleAdminUser,
      };
      return handlers[interaction.commandName]?.(interaction);
    }
    if (interaction.isButton()) return handleButton(interaction);
    if (interaction.isModalSubmit()) return handleModal(interaction);
  } catch (err) {
    console.error('❌ Error:', err);
    const msg={content:'❌ Terjadi error. Coba lagi.',flags:MessageFlags.Ephemeral};
    try { interaction.replied||interaction.deferred?await interaction.followUp(msg):await interaction.reply(msg); } catch(e){}
  }
});

client.login(process.env.BOT_TOKEN);
