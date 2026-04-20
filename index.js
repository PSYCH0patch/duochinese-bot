require('dotenv').config();
const {
  Client, GatewayIntentBits, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, EmbedBuilder, Collection,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const Database  = require('better-sqlite3');
const words     = require('./data/words');
const lessons   = require('./data/lessons');
const badges    = require('./data/badges');
const grammar   = require('./data/grammar');
const challenges= require('./data/challenges');
const tones     = require('./data/tones');
const { shuffleArray, getToday, getLevelInfo, progressBar, streakEmoji } = require('./utils/helpers');

const db = new Database('/root/duochinese-bot/database/duochinese.db');
db.pragma('journal_mode = WAL');
['ALTER TABLE users ADD COLUMN total_correct INTEGER DEFAULT 0',
 'ALTER TABLE users ADD COLUMN reminder_time TEXT',
 'ALTER TABLE users ADD COLUMN reminder_channel TEXT',
].forEach(s=>{try{db.exec(s);}catch(_){}});

const sessions = new Collection();
const battles  = new Collection();
const client   = new Client({ intents: [GatewayIntentBits.Guilds] });

// ═══════════════════════════════════════════
//  DB HELPERS
// ═══════════════════════════════════════════
function ensureUser(id,name){
  let u=db.prepare('SELECT * FROM users WHERE user_id=?').get(id);
  if(!u){db.prepare('INSERT INTO users(user_id,username,last_active) VALUES(?,?,?)').run(id,name,getToday());u=db.prepare('SELECT * FROM users WHERE user_id=?').get(id);}
  else db.prepare('UPDATE users SET username=? WHERE user_id=?').run(name,id);
  return u;
}
function getUser(id){return db.prepare('SELECT * FROM users WHERE user_id=?').get(id);}
function updateStreak(id){
  const u=getUser(id),today=getToday();
  if(u.last_active===today) return {streak:u.streak,updated:false,isComeback:false};
  const yest=new Date();yest.setDate(yest.getDate()-1);
  const yStr=yest.toISOString().split('T')[0];
  const isComeback=u.last_active&&u.last_active!==yStr&&u.streak>0;
  const ns=u.last_active===yStr?u.streak+1:1;
  db.prepare('UPDATE users SET streak=?,max_streak=MAX(max_streak,?),last_active=? WHERE user_id=?').run(ns,ns,today,id);
  return {streak:ns,updated:true,isComeback};
}
function getHearts(id){
  const u=getUser(id);
  if(u.hearts===0&&u.hearts_refreshed_at&&(Date.now()-new Date(u.hearts_refreshed_at))/3600000>=1){
    db.prepare('UPDATE users SET hearts=5 WHERE user_id=?').run(id);return 5;
  }
  return u.hearts;
}
function recordWord(id,wordId,correct){
  const now=new Date().toISOString();
  const ex=db.prepare('SELECT * FROM user_words WHERE user_id=? AND word_id=?').get(id,wordId);
  const tc=(ex?.times_correct||0)+(correct?1:0);
  const intervals=[86400000,259200000,604800000,1209600000,2592000000];
  const nxt=new Date(Date.now()+(correct?intervals[Math.min(tc-1,4)]:14400000)).toISOString();
  if(!ex) db.prepare('INSERT INTO user_words(user_id,word_id,times_correct,times_wrong,last_reviewed,next_review) VALUES(?,?,?,?,?,?)').run(id,wordId,correct?1:0,correct?0:1,now,nxt);
  else db.prepare('UPDATE user_words SET times_correct=times_correct+?,times_wrong=times_wrong+?,last_reviewed=?,next_review=? WHERE user_id=? AND word_id=?').run(correct?1:0,correct?0:1,now,nxt,id,wordId);
}
function getMastered(id){return db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id=? AND times_correct>=3').get(id).c;}
function awardBadge(id,bid){
  if(db.prepare('SELECT 1 FROM user_badges WHERE user_id=? AND badge_id=?').get(id,bid)) return null;
  db.prepare('INSERT INTO user_badges(user_id,badge_id) VALUES(?,?)').run(id,bid);
  return badges.find(b=>b.id===bid);
}
function checkBadges(id,extras={}){
  const u=getUser(id),m=getMastered(id),nb=[];
  const a=bid=>{const r=awardBadge(id,bid);if(r)nb.push(r);};
  if(u.lessons_completed>=1) a('first_lesson');
  if(u.streak>=3) a('streak_3'); if(u.streak>=7) a('streak_7');
  if(u.streak>=30) a('streak_30'); if(u.streak>=100) a('streak_100');
  if(m>=25) a('words_25'); if(m>=50) a('words_50');
  if(m>=100) a('words_100'); if(m>=150) a('words_all');
  if(u.lessons_completed>=4) a('unit_1');
  if(u.lessons_completed>=16) a('unit_4');
  if(u.lessons_completed>=28) a('unit_8');
  if(u.total_reviews>=50) a('reviewer_50');
  if(extras.perfect) a('perfect_lesson'); if(extras.boss) a('boss_slayer');
  if(extras.finalBoss) a('final_boss'); if(extras.survivor) a('survivor');
  if(extras.speed) a('speed_demon'); if(extras.comeback) a('comeback');
  if(extras.battle_win) a('battle_winner');
  return nb;
}

// ═══════════════════════════════════════════
//  CHALLENGE SYSTEM
// ═══════════════════════════════════════════
function getTodayChallenge(){return challenges[Math.floor(Date.now()/86400000)%challenges.length];}
function getChallengeProgress(id){
  const ch=getTodayChallenge();
  const rec=db.prepare('SELECT * FROM user_challenges WHERE user_id=? AND date=?').get(id,getToday());
  return {challenge:ch,progress:rec?.progress||0,completed:rec?.completed||0};
}
function updateChallengeProgress(id,type,amount=1){
  const today=getToday(),ch=getTodayChallenge();
  if(ch.type!==type&&type!=='correct') return null;
  const rec=db.prepare('SELECT * FROM user_challenges WHERE user_id=? AND date=?').get(id,today);
  if(rec?.completed) return null;
  const np=Math.min((rec?.progress||0)+amount,ch.target);
  const done=np>=ch.target?1:0;
  if(!rec) db.prepare('INSERT INTO user_challenges(user_id,date,challenge_id,progress,completed) VALUES(?,?,?,?,?)').run(id,today,ch.id,np,done);
  else db.prepare('UPDATE user_challenges SET progress=?,completed=? WHERE user_id=? AND date=?').run(np,done,id,today);
  if(done){db.prepare('UPDATE users SET xp=xp+? WHERE user_id=?').run(ch.xp,id);return ch;}
  return null;
}


// ═══════════════════════════════════════════
//  QUIZ ENGINE
// ═══════════════════════════════════════════
function makeQuestion(word,allWords,type=null){
  const types=['arti','hanzi','pinyin','fill'];
  const t=type||types[Math.floor(Math.random()*types.length)];
  const wrongs=allWords.filter(w=>w.id!==word.id).sort(()=>Math.random()-0.5).slice(0,3);
  if(t==='fill'&&!word.contoh.includes(word.hanzi)) return makeQuestion(word,allWords,'arti');
  let q,opts,ans;
  if(t==='arti'){
    q=`Apa arti dari **${word.hanzi}** (${word.pinyin})?`;
    opts=shuffleArray([{label:word.arti,ok:true},...wrongs.map(w=>({label:w.arti,ok:false}))]);
    ans=word.arti;
  } else if(t==='hanzi'){
    q=`Mana hanzi yang artinya **"${word.arti}"**?`;
    opts=shuffleArray([{label:word.hanzi,ok:true},...wrongs.map(w=>({label:w.hanzi,ok:false}))]);
    ans=word.hanzi;
  } else if(t==='pinyin'){
    q=`Apa pinyin dari **${word.hanzi}** *(${word.arti})*?`;
    opts=shuffleArray([{label:word.pinyin,ok:true},...wrongs.map(w=>({label:w.pinyin,ok:false}))]);
    ans=word.pinyin;
  } else {
    q=`Isi yang kosong:\n**${word.contoh.replace(word.hanzi,'____')}**\n*(${word.contoh_arti})*`;
    opts=shuffleArray([{label:word.hanzi,ok:true},...wrongs.map(w=>({label:w.hanzi,ok:false}))]);
    ans=word.hanzi;
  }
  return {q,opts,ans,word,type:t,explain:`${word.hanzi} (${word.pinyin}) = **${word.arti}**\n📝 ${word.contoh}\n🔤 ${word.contoh_pinyin}\n💬 ${word.contoh_arti}`};
}

function makeToneQuestion(){
  const base=tones[Math.floor(Math.random()*tones.length)];
  const sameBase=tones.filter(t=>t.id!==base.id).sort(()=>Math.random()-0.5).slice(0,3);
  const toneNames=['','datar ▬','naik ↗','turun-naik ↘↗','turun ↘'];
  return {
    q:`Termasuk nada berapa?\n\n# **${base.hanzi}** — *${base.pinyin}*\n*(${base.arti})*`,
    opts:shuffleArray([
      {label:`Nada ${base.tone} — ${toneNames[base.tone]}`,ok:true},
      ...sameBase.map(t=>({label:`Nada ${t.tone} — ${toneNames[t.tone]}`,ok:false}))
    ]),
    ans:`Nada ${base.tone}`, tone:base
  };
}

// Susun kalimat pool — lebih banyak dan bervariasi
const susunPool = [
  { words:['我','是','学生'], answer:'我是学生', arti:'Saya adalah pelajar' },
  { words:['你','好','吗'], answer:'你好吗', arti:'Apa kabar?' },
  { words:['我','喜欢','中文'], answer:'我喜欢中文', arti:'Saya suka bahasa Mandarin' },
  { words:['他','在','学校'], answer:'他在学校', arti:'Dia di sekolah' },
  { words:['今天','天气','很','好'], answer:'今天天气很好', arti:'Cuaca hari ini bagus' },
  { words:['我','想','吃','饭'], answer:'我想吃饭', arti:'Saya ingin makan' },
  { words:['你','叫','什么','名字'], answer:'你叫什么名字', arti:'Siapa namamu?' },
  { words:['我','不','知道'], answer:'我不知道', arti:'Saya tidak tahu' },
  { words:['她','很','漂亮'], answer:'她很漂亮', arti:'Dia sangat cantik' },
  { words:['我们','是','朋友'], answer:'我们是朋友', arti:'Kami adalah teman' },
  { words:['他','会','说','中文'], answer:'他会说中文', arti:'Dia bisa bicara Mandarin' },
  { words:['我','要','喝','水'], answer:'我要喝水', arti:'Saya mau minum air' },
  { words:['你','在','哪里'], answer:'你在哪里', arti:'Kamu di mana?' },
  { words:['她','是','老师'], answer:'她是老师', arti:'Dia adalah guru' },
  { words:['我','有','一','本','书'], answer:'我有一本书', arti:'Saya punya satu buku' },
  { words:['今天','很','冷'], answer:'今天很冷', arti:'Hari ini sangat dingin' },
  { words:['我','也','喜欢'], answer:'我也喜欢', arti:'Saya juga suka' },
  { words:['他','是','谁'], answer:'他是谁', arti:'Dia siapa?' },
  { words:['妈妈','在','做','饭'], answer:'妈妈在做饭', arti:'Ibu sedang memasak' },
  { words:['这','是','什么'], answer:'这是什么', arti:'Ini apa?' },
];

function makeSusunQuestion(){
  const q = susunPool[Math.floor(Math.random() * susunPool.length)];
  return { ...q, shuffled: shuffleArray([...q.words]) };
}

// Normalize Chinese text for comparison
function normalizeChinese(text) {
  return text.replace(/\s+/g, '').replace(/[，。！？、；：""''（）【】]/g, '').trim();
}


// ═══════════════════════════════════════════
//  EMBEDS
// ═══════════════════════════════════════════
function eQuestion(qq,cur,tot,hearts,ok,ng){
  const tl={arti:'🔤→💬',hanzi:'💬→🔤',pinyin:'🔤→拼音',fill:'📝 Isi Kosong'}[qq.type]||'';
  return new EmbedBuilder().setColor(0x1CB0F6)
    .setTitle(`❓ Soal ${cur}/${tot}  ${tl}`)
    .setDescription(qq.q)
    .addFields(
      {name:'❤️ Nyawa',value:'❤️'.repeat(hearts)+'🖤'.repeat(5-hearts),inline:true},
      {name:'📊 Skor',value:`✅${ok} ❌${ng}`,inline:true}
    );
}
function eCorrect(qq){return new EmbedBuilder().setColor(0x58CC02).setTitle('✅ Benar! +10 XP').setDescription(qq.explain);}
function eWrong(qq){return new EmbedBuilder().setColor(0xFF4B4B).setTitle('❌ Salah!').setDescription(`Jawaban: **${qq.ans}**\n\n${qq.explain}`);}
function eComplete(u,st,nb,challengeDone=null){
  const lv=getLevelInfo(u.xp);
  const em=new EmbedBuilder().setColor(st.wrong===0?0xFFD700:0x58CC02)
    .setTitle(st.wrong===0?'🌟 PERFECT!':'🎉 Selesai!')
    .addFields(
      {name:'📊 Hasil',value:`✅${st.ok}/${st.tot} ❌${st.wrong}/${st.tot}`,inline:true},
      {name:'⭐ XP',value:`+${st.xp} XP`,inline:true},
      {name:`${streakEmoji(u.streak)} Streak`,value:`${u.streak} hari`,inline:true},
      {name:lv.name,value:`${progressBar(lv.progress)} ${u.xp} XP`}
    );
  if(nb.length) em.addFields({name:'🏅 Badge Baru!',value:nb.map(b=>`${b.emoji} **${b.name}**`).join('\n')});
  if(challengeDone) em.addFields({name:'🎯 Challenge Selesai!',value:`${challengeDone.title} +${challengeDone.xp} XP bonus!`});
  return em;
}
function eProfil(u,mastered){
  const lv=getLevelInfo(u.xp);
  const bc=db.prepare('SELECT COUNT(*) as c FROM user_badges WHERE user_id=?').get(u.user_id).c;
  const rc=db.prepare("SELECT COUNT(*) as c FROM user_words WHERE user_id=? AND next_review<=datetime('now')").get(u.user_id).c;
  const tc=db.prepare('SELECT COALESCE(SUM(times_correct),0) as c FROM user_words WHERE user_id=?').get(u.user_id).c;
  const tw=db.prepare('SELECT COALESCE(SUM(times_wrong),0) as c FROM user_words WHERE user_id=?').get(u.user_id).c;
  const acc=tc+tw>0?Math.round(tc/(tc+tw)*100):0;
  const {challenge,progress,completed}=getChallengeProgress(u.user_id);
  return new EmbedBuilder().setColor(0x1CB0F6).setTitle('📋 Profil Belajar')
    .addFields(
      {name:'⭐ XP',value:`${u.xp}`,inline:true},
      {name:lv.name,value:`Level ${lv.level}`,inline:true},
      {name:`${streakEmoji(u.streak)} Streak`,value:`${u.streak} (max:${u.max_streak})`,inline:true},
      {name:'📖 Dikuasai',value:`${mastered}/${words.length}`,inline:true},
      {name:'📚 Lesson',value:`${u.lessons_completed}`,inline:true},
      {name:'🏅 Badge',value:`${bc}/${badges.length}`,inline:true},
      {name:'🎯 Akurasi',value:`${acc}%`,inline:true},
      {name:'🧠 Review',value:`${rc} kata`,inline:true},
      {name:'📍 Posisi',value:`Unit ${u.current_unit} L${u.current_lesson}`,inline:true},
      {name:'📈 Progress',value:`${progressBar(lv.progress,15)} ${lv.current}/${lv.needed} XP`},
      {name:`🎯 Challenge${completed?' ✅':''}`,value:`${challenge.title}: ${progressBar(progress/challenge.target)} ${progress}/${challenge.target}`}
    );
}
function eStatistik(id){
  const tc=db.prepare('SELECT COALESCE(SUM(times_correct),0) as c FROM user_words WHERE user_id=?').get(id).c;
  const tw=db.prepare('SELECT COALESCE(SUM(times_wrong),0) as c FROM user_words WHERE user_id=?').get(id).c;
  const acc=tc+tw>0?Math.round(tc/(tc+tw)*100):0;
  const wc=db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id=?').get(id).c;
  const mc=getMastered(id);
  const rc=db.prepare("SELECT COUNT(*) as c FROM user_words WHERE user_id=? AND next_review<=datetime('now')").get(id).c;
  const hard=db.prepare('SELECT w.hanzi,w.arti,uw.times_wrong FROM user_words uw JOIN words w ON uw.word_id=w.id WHERE uw.user_id=? AND uw.times_wrong>0 ORDER BY uw.times_wrong DESC LIMIT 5').all(id);
  const best=db.prepare('SELECT w.hanzi,w.arti,uw.times_correct FROM user_words uw JOIN words w ON uw.word_id=w.id WHERE uw.user_id=? ORDER BY uw.times_correct DESC LIMIT 5').all(id);
  const kat=db.prepare('SELECT w.kategori,COUNT(*) as t,SUM(CASE WHEN uw.times_correct>=3 THEN 1 ELSE 0 END) as m FROM user_words uw JOIN words w ON uw.word_id=w.id WHERE uw.user_id=? GROUP BY w.kategori').all(id);
  return new EmbedBuilder().setColor(0x9B59B6).setTitle('📊 Statistik Detail')
    .addFields(
      {name:'📖 Dipelajari',value:`${wc}`,inline:true},{name:'✅ Dikuasai',value:`${mc}`,inline:true},{name:'🎯 Akurasi',value:`${acc}%`,inline:true},
      {name:'✅ Benar',value:`${tc}x`,inline:true},{name:'❌ Salah',value:`${tw}x`,inline:true},{name:'🧠 Review',value:`${rc}`,inline:true},
      {name:'😰 Sering Salah',value:hard.length?hard.map(w=>`**${w.hanzi}**(${w.arti}) ❌${w.times_wrong}x`).join('\n'):'—'},
      {name:'⭐ Paling Dikuasai',value:best.length?best.map(w=>`**${w.hanzi}**(${w.arti}) ✅${w.times_correct}x`).join('\n'):'—'},
      {name:'📂 Per Kategori',value:kat.length?kat.map(k=>`**${k.kategori}**: ${k.m}/${k.t}`).join('\n'):'—'}
    );
}


// ═══════════════════════════════════════════
//  LESSON FLOW
// ═══════════════════════════════════════════
function buildSession(lesson,userId){
  const lw=lesson.wordIds.map(id=>words.find(w=>w.id===id)).filter(Boolean);
  const count=lesson.isBoss?Math.min(10,lw.length):Math.min(5,lw.length);
  return {lessonId:lesson.id,lesson,qs:shuffleArray(lw).slice(0,count).map(w=>makeQuestion(w,words)),cur:0,ok:0,wrong:0,hearts:5,userId,isBoss:lesson.isBoss,isReview:false,startAt:Date.now()};
}

async function showQ(interaction,s){
  const qq=s.qs[s.cur];
  const emb=eQuestion(qq,s.cur+1,s.qs.length,s.hearts,s.ok,s.wrong);
  const lbls=['🅰️','🅱️','🅲','🅳'];
  const row=new ActionRowBuilder();
  qq.opts.forEach((o,i)=>row.addComponents(new ButtonBuilder().setCustomId(`A${i}_${o.ok?1:0}`).setLabel(`${lbls[i]} ${o.label}`).setStyle(ButtonStyle.Secondary)));
  await interaction.update({embeds:[emb],components:[row]});
}

async function onAnswer(interaction,s,correct){
  const qq=s.qs[s.cur];
  recordWord(s.userId,qq.word.id,correct);
  if(correct){s.ok++;db.prepare('UPDATE users SET total_correct=total_correct+1 WHERE user_id=?').run(s.userId);updateChallengeProgress(s.userId,'correct');}
  else{
    s.wrong++;s.hearts--;
    if(s.hearts<=0){
      sessions.delete(s.userId);
      db.prepare('UPDATE users SET hearts=0,hearts_refreshed_at=? WHERE user_id=?').run(new Date().toISOString(),s.userId);
      return interaction.update({embeds:[eWrong(qq),new EmbedBuilder().setColor(0xFF4B4B).setTitle('💔 Nyawa Habis!').setDescription('Tunggu 1 jam atau `/review`')],components:[]});
    }
  }
  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('NEXT').setLabel('Lanjut ➡️').setStyle(correct?ButtonStyle.Success:ButtonStyle.Primary));
  await interaction.update({embeds:[correct?eCorrect(qq):eWrong(qq)],components:[row]});
}

async function finishLesson(interaction,s){
  const xp=s.ok*10+(s.wrong===0?10:0)+(s.isBoss?30:0);
  db.prepare('UPDATE users SET xp=xp+?,lessons_completed=lessons_completed+1 WHERE user_id=?').run(xp,s.userId);
  const idx=lessons.findIndex(l=>l.id===s.lessonId);
  const next=idx>=0&&idx<lessons.length-1?lessons[idx+1]:null;
  if(next) db.prepare('UPDATE users SET current_unit=?,current_lesson=? WHERE user_id=?').run(next.unit,next.lesson,s.userId);
  const score=Math.round(s.ok/s.qs.length*100);
  const exL=db.prepare('SELECT 1 FROM user_lessons WHERE user_id=? AND lesson_id=?').get(s.userId,s.lessonId);
  if(!exL) db.prepare('INSERT INTO user_lessons(user_id,lesson_id,completed,best_score) VALUES(?,?,1,?)').run(s.userId,s.lessonId,score);
  else db.prepare('UPDATE user_lessons SET completed=1,best_score=MAX(best_score,?) WHERE user_id=? AND lesson_id=?').run(score,s.userId,s.lessonId);
  const {streak,isComeback}=updateStreak(s.userId);
  updateChallengeProgress(s.userId,'lesson');
  if(s.wrong===0) updateChallengeProgress(s.userId,'perfect');
  const cp=getChallengeProgress(s.userId);
  const u=getUser(s.userId);
  const nb=checkBadges(s.userId,{perfect:s.wrong===0,boss:s.isBoss,finalBoss:s.isBoss&&s.lessonId===28,survivor:s.hearts===1,speed:(Date.now()-s.startAt)/1000<60,comeback:isComeback});
  sessions.delete(s.userId);
  const row=new ActionRowBuilder().addComponents(
    ...(next?[new ButtonBuilder().setCustomId('NEXTLESSON').setLabel('Lesson Berikutnya ➡️').setStyle(ButtonStyle.Success)]:[]),
    new ButtonBuilder().setCustomId('REVIEW_BTN').setLabel('Review 🧠').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('PROFIL').setLabel('Profil 📋').setStyle(ButtonStyle.Secondary));
  await interaction.update({embeds:[eComplete(u,{ok:s.ok,wrong:s.wrong,tot:s.qs.length,xp},nb,cp.completed?cp.challenge:null)],components:[row]});
}


// ═══════════════════════════════════════════
//  BOT EVENTS
// ═══════════════════════════════════════════
client.once('ready',()=>{
  console.log(`✅ ${client.user.tag} online! Words:${words.length} Lessons:${lessons.length}`);
  // Reminder
  setInterval(()=>{
    const now=new Date();
    const t=`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    db.prepare('SELECT * FROM users WHERE reminder_time=? AND reminder_channel IS NOT NULL').all(t).forEach(u=>{
      try{
        const ch=client.channels.cache.get(u.reminder_channel);if(!ch)return;
        const rev=db.prepare("SELECT COUNT(*) as c FROM user_words WHERE user_id=? AND next_review<=datetime('now')").get(u.user_id).c;
        ch.send(`⏰ <@${u.user_id}> **Waktunya belajar!** 📚\n${u.streak>0?`🔥 Streak **${u.streak}** — jangan putus!`:'💫 Mulai streak!'}\n${rev>0?`🧠 **${rev} kata** review`:'✅ No review'}\n\`/lanjut\` atau \`/review\``);
      }catch(_){}
    });
  },60000);
});

client.on('interactionCreate',async interaction=>{
  try{
    // ── SLASH ──
    if(interaction.isChatInputCommand()){
      const id=interaction.user.id, name=interaction.user.username;

      if(['mulai','lanjut'].includes(interaction.commandName)){
        const u=ensureUser(id,name);
        if(getHearts(id)===0) return interaction.reply({content:'💔 Nyawa habis! Tunggu 1 jam atau `/review`',ephemeral:true});
        if(interaction.commandName==='mulai') db.prepare('UPDATE users SET current_unit=1,current_lesson=1 WHERE user_id=?').run(id);
        const fu=getUser(id);
        const lesson=lessons.find(l=>l.unit===fu.current_unit&&l.lesson===fu.current_lesson)||lessons[0];
        const s=buildSession(lesson,id); sessions.set(id,s);
        const {challenge,progress,completed}=getChallengeProgress(id);
        const emb=new EmbedBuilder().setColor(0x58CC02).setTitle(`📚 Unit ${lesson.unit} — Les ${lesson.lesson}`)
          .setDescription(`**${lesson.title}**\n${lesson.description}`)
          .addFields({name:'📝 Soal',value:`${s.qs.length}`,inline:true},{name:'❤️',value:`${getHearts(id)}/5`,inline:true},
            {name:`🎯 Challenge${completed?' ✅':''}`,value:`${challenge.title}: ${progress}/${challenge.target}`});
        await interaction.reply({embeds:[emb],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('START').setLabel('Mulai! 🚀').setStyle(ButtonStyle.Success))]});
      }

      else if(interaction.commandName==='review'){
        ensureUser(id,name);
        const rw=db.prepare("SELECT w.* FROM user_words uw JOIN words w ON uw.word_id=w.id WHERE uw.user_id=? AND uw.next_review<=datetime('now') ORDER BY uw.next_review LIMIT 5").all(id);
        if(!rw.length) return interaction.reply({content:'✅ Tidak ada review! `/lanjut` 💪',ephemeral:true});
        sessions.set(id,{lessonId:-1,qs:rw.map(w=>makeQuestion(w,words)),cur:0,ok:0,wrong:0,hearts:5,userId:id,isReview:true,startAt:Date.now()});
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0x9B59B6).setTitle('🧠 Review!').setDescription(`**${rw.length} kata** perlu diulang`)],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('START').setLabel(`Review ${rw.length} kata 🧠`).setStyle(ButtonStyle.Primary))]});
      }

      else if(interaction.commandName==='profil'){await interaction.reply({embeds:[eProfil(ensureUser(id,name),getMastered(id))]});}
      else if(interaction.commandName==='statistik'){ensureUser(id,name);await interaction.reply({embeds:[eStatistik(id)]});}

      else if(interaction.commandName==='challenge'){
        ensureUser(id,name);
        const {challenge:ch,progress:p,completed:d}=getChallengeProgress(id);
        await interaction.reply({embeds:[new EmbedBuilder().setColor(d?0xFFD700:0xFF6B35)
          .setTitle(`🎯 Challenge${d?' ✅ SELESAI!':''}`).setDescription(d?'Datang lagi besok! 🎉':ch.desc)
          .addFields({name:'📋',value:ch.title,inline:true},{name:'⭐',value:`+${ch.xp} XP`,inline:true},
            {name:'📊',value:`${progressBar(p/ch.target,15)} ${p}/${ch.target}`})]});
      }

      else if(interaction.commandName==='streak'){
        const u=ensureUser(id,name);
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0xFF6B35).setTitle(`${streakEmoji(u.streak)} Streak: ${u.streak} hari`)
          .addFields({name:'🏆 Max',value:`${u.max_streak}`,inline:true},{name:'📅',value:u.last_active||'-',inline:true})]});
      }

      else if(interaction.commandName==='leaderboard'){
        const top=db.prepare('SELECT * FROM users ORDER BY xp DESC LIMIT 10').all();
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0xFFD700).setTitle('🏆 Leaderboard')
          .setDescription(top.length?top.map((u,i)=>`${['🥇','🥈','🥉'][i]||`${i+1}.`} **${u.username}** — ${u.xp} XP ${streakEmoji(u.streak)}${u.streak}`).join('\n'):'Belum ada data.')]});
      }

      else if(interaction.commandName==='badge'){
        ensureUser(id,name);
        const ub=db.prepare('SELECT badge_id FROM user_badges WHERE user_id=?').all(id);
        if(!ub.length) return interaction.reply({content:'🏅 Belum ada badge!',ephemeral:true});
        const e=ub.map(b=>{const bd=badges.find(x=>x.id===b.badge_id);return bd?`${bd.emoji} **${bd.name}** — ${bd.description}`:null;}).filter(Boolean).join('\n');
        const l=badges.filter(b=>!ub.find(u=>u.badge_id===b.id)).map(b=>`🔒 ${b.name}`).join(' | ');
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0xFFD700).setTitle(`🏅 Badge (${ub.length}/${badges.length})`).addFields({name:'✅',value:e},{name:'🔒',value:l||'Semua didapat!'})]});
      }

      else if(interaction.commandName==='katahariini'){
        const w=words[Math.floor((Date.now()-new Date(new Date().getFullYear(),0,0))/86400000)%words.length];
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0xF1C40F).setTitle('📅 Kata Hari Ini').setDescription(`# ${w.hanzi}`)
          .addFields({name:'🔤',value:w.pinyin,inline:true},{name:'💬',value:w.arti,inline:true},{name:'📝',value:`${w.contoh}\n*${w.contoh_arti}*`})]});
      }

      else if(interaction.commandName==='skillmap'){
        ensureUser(id,name);
        const ul=db.prepare('SELECT * FROM user_lessons WHERE user_id=?').all(id);
        let d='',cu=0;
        for(const l of lessons){if(l.unit!==cu){cu=l.unit;d+=`\n**━━ Unit ${cu} ━━**\n`;}const u=ul.find(x=>x.lesson_id===l.id);d+=`${u?.completed?'✅':l.isBoss?'🔒':'⬜'} L${l.lesson}: ${l.title}${u?.completed?` *(${u.best_score}%)*`:''}\n`;}
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0x2ECC71).setTitle('🗺️ Skill Map').setDescription(d)]});
      }

      // ── /tonetrain ──
      else if(interaction.commandName==='tonetrain'){
        ensureUser(id,name);
        const qq=makeToneQuestion();
        const lbls=['🅰️','🅱️','🅲','🅳'];
        const row=new ActionRowBuilder();
        qq.opts.forEach((o,i)=>row.addComponents(new ButtonBuilder().setCustomId(`TO${i}_${o.ok?1:0}`).setLabel(`${lbls[i]} ${o.label}`).setStyle(ButtonStyle.Secondary)));
        sessions.set(id,{isTone:true,qq,userId:id});
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0xE74C3C).setTitle('🎵 Latihan Nada').setDescription(qq.q)
          .addFields({name:'📖 4 Nada',value:'1▬ datar | 2↗ naik | 3↘↗ turun-naik | 4↘ turun'})],components:[row]});
      }

      // ── /susun — NOW WITH AUTO CORRECTION ──
      else if(interaction.commandName==='susun'){
        ensureUser(id,name);
        const q=makeSusunQuestion();
        sessions.set(id,{isSusun:true,q,userId:id,startAt:Date.now()});
        const emb=new EmbedBuilder().setColor(0x27AE60)
          .setTitle('🧩 Susun Kalimat!')
          .setDescription(`Susun kata-kata ini menjadi kalimat yang benar:\n\n## ${q.shuffled.map(w=>`「${w}」`).join('  ')}\n\n💬 Artinya: *${q.arti}*`)
          .setFooter({text:'Klik tombol di bawah untuk mengetik jawaban!'});
        const row=new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('SUSUN_JAWAB').setLabel('✍️ Ketik Jawaban').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('SUSUN_HINT').setLabel('💡 Hint').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('SUSUN_SKIP').setLabel('⏭️ Skip').setStyle(ButtonStyle.Danger)
        );
        await interaction.reply({embeds:[emb],components:[row]});
      }

      // ── /battle ──
      else if(interaction.commandName==='battle'){
        const lawan=interaction.options.getUser('lawan');
        if(lawan.id===id) return interaction.reply({content:'❌ Tidak bisa battle diri sendiri!',ephemeral:true});
        if(lawan.bot) return interaction.reply({content:'❌ Tidak bisa battle bot!',ephemeral:true});
        ensureUser(id,name); ensureUser(lawan.id,lawan.username);
        const bid=`${id}_${lawan.id}`;
        await interaction.reply({content:`<@${lawan.id}> kamu ditantang battle!`,
          embeds:[new EmbedBuilder().setColor(0xFF6B35).setTitle('⚔️ BATTLE CHALLENGE!')
            .setDescription(`**${name}** vs **${lawan.username}**\n5 soal — siapa paling banyak benar menang!`)],
          components:[new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`BACCEPT_${id}_${lawan.id}`).setLabel('✅ Terima!').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`BDECLINE`).setLabel('❌ Tolak').setStyle(ButtonStyle.Danger))]});
      }

      else if(interaction.commandName==='grammar'){
        const n=interaction.options.getInteger('nomor');
        if(!n) return interaction.reply({embeds:[new EmbedBuilder().setColor(0x8E44AD).setTitle('📖 Grammar').setDescription(grammar.map(g=>`**${g.id}.** ${g.title}`).join('\n')).setFooter({text:'/grammar nomor:1'})]});
        const g=grammar.find(x=>x.id===n);
        if(!g) return interaction.reply({content:`❌ Tidak ada nomor ${n}`,ephemeral:true});
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0x8E44AD).setTitle(`📖 ${g.title}`)
          .addFields({name:'📐 Pola',value:`\`${g.pattern}\``},{name:'📝',value:g.explanation},{name:'💬 Contoh',value:g.examples.map(e=>`> ${e.cn}\n> ${e.py}\n> *${e.id}*`).join('\n\n')},{name:'💡',value:g.tip})]});
      }

      else if(interaction.commandName==='reminder'){
        const jam=interaction.options.getString('jam');
        if(!/^([01]?\d|2[0-3]):[0-5]\d$/.test(jam)) return interaction.reply({content:'❌ Format HH:MM!',ephemeral:true});
        ensureUser(id,name);
        db.prepare('UPDATE users SET reminder_time=?,reminder_channel=? WHERE user_id=?').run(jam,interaction.channelId,id);
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0x58CC02).setTitle('⏰ Reminder Diset!').setDescription(`Setiap hari jam **${jam}** di sini!`)]});
      }

      else if(interaction.commandName==='kamus'){
        const q=interaction.options.getString('kata').toLowerCase();
        const f=words.find(w=>w.hanzi===q||w.pinyin.toLowerCase().includes(q)||w.arti.toLowerCase().includes(q));
        if(!f){
          const sim=words.filter(w=>w.hanzi.includes(q)||w.pinyin.toLowerCase().includes(q)||w.arti.toLowerCase().includes(q)).slice(0,5);
          if(sim.length) return interaction.reply({content:`🔍 Mungkin:\n${sim.map(w=>`• **${w.hanzi}** (${w.pinyin}) — ${w.arti}`).join('\n')}`});
          return interaction.reply({content:'❌ Tidak ditemukan.',ephemeral:true});
        }
        await interaction.reply({embeds:[new EmbedBuilder().setColor(0x3498DB).setTitle(`📖 ${f.hanzi}`)
          .addFields({name:'🔤',value:f.pinyin,inline:true},{name:'💬',value:f.arti,inline:true},{name:'📂',value:f.kategori,inline:true},{name:'📝',value:`${f.contoh}\n${f.contoh_pinyin}\n*${f.contoh_arti}*`})]});
      }
    }


    // ── BUTTONS ──
    else if(interaction.isButton()){
      const id=interaction.user.id, s=sessions.get(id), c=interaction.customId;

      if(c==='START'){if(!s) return interaction.reply({content:'❌ Ketik `/lanjut`',ephemeral:true}); await showQ(interaction,s);}
      else if(c.startsWith('A')&&!c.startsWith('BACCEPT')){if(!s) return interaction.reply({content:'❌ Sesi expired.',ephemeral:true}); await onAnswer(interaction,s,c.endsWith('_1'));}
      else if(c==='NEXT'){
        if(!s) return interaction.reply({content:'❌ Sesi expired.',ephemeral:true});
        s.cur++;
        if(s.cur>=s.qs.length){
          if(s.isReview){
            const xp=s.ok*5;
            db.prepare('UPDATE users SET xp=xp+?,total_reviews=total_reviews+? WHERE user_id=?').run(xp,s.ok,id);
            db.prepare('UPDATE users SET hearts=MIN(5,hearts+?) WHERE user_id=?').run(Math.floor(s.ok/2),id);
            updateStreak(id); updateChallengeProgress(id,'review',s.ok);
            const u=getUser(id); sessions.delete(id);
            await interaction.update({embeds:[eComplete(u,{ok:s.ok,wrong:s.wrong,tot:s.qs.length,xp},checkBadges(id))],
              components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('NEXTLESSON').setLabel('Lesson ➡️').setStyle(ButtonStyle.Success),new ButtonBuilder().setCustomId('PROFIL').setLabel('Profil 📋').setStyle(ButtonStyle.Secondary))]});
          } else { await finishLesson(interaction,s); }
        } else { await showQ(interaction,s); }
      }
      else if(c==='NEXTLESSON'){
        const u=getUser(id)||ensureUser(id,interaction.user.username);
        const lesson=lessons.find(l=>l.unit===u.current_unit&&l.lesson===u.current_lesson);
        if(!lesson) return interaction.update({content:'🎉 Semua selesai! 🏆',embeds:[],components:[]});
        const ns=buildSession(lesson,id); sessions.set(id,ns);
        await interaction.update({embeds:[new EmbedBuilder().setColor(0x58CC02).setTitle(`📚 Unit ${lesson.unit} — Les ${lesson.lesson}`).setDescription(`**${lesson.title}**\n${lesson.description}`).addFields({name:'📝',value:`${ns.qs.length} soal`,inline:true},{name:'❤️',value:`${getHearts(id)}/5`,inline:true})],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('START').setLabel('Mulai! 🚀').setStyle(ButtonStyle.Success))]});
      }
      else if(c==='REVIEW_BTN'){
        const rw=db.prepare("SELECT w.* FROM user_words uw JOIN words w ON uw.word_id=w.id WHERE uw.user_id=? AND uw.next_review<=datetime('now') LIMIT 5").all(id);
        if(!rw.length) return interaction.update({content:'✅ Tidak ada review!',embeds:[],components:[]});
        sessions.set(id,{lessonId:-1,qs:rw.map(w=>makeQuestion(w,words)),cur:0,ok:0,wrong:0,hearts:5,userId:id,isReview:true,startAt:Date.now()});
        await interaction.update({embeds:[new EmbedBuilder().setColor(0x9B59B6).setTitle('🧠 Review!').setDescription(`${rw.length} kata`)],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('START').setLabel(`Review 🧠`).setStyle(ButtonStyle.Primary))]});
      }
      else if(c==='PROFIL'){
        const u=getUser(id)||ensureUser(id,interaction.user.username);
        await interaction.update({embeds:[eProfil(u,getMastered(id))],components:[]});
      }

      // Tone
      else if(c.startsWith('TO')&&!c.startsWith('TONE')){
        const ts=sessions.get(id);
        if(!ts?.isTone) return interaction.reply({content:'❌ Expired.',ephemeral:true});
        const correct=c.endsWith('_1'); sessions.delete(id);
        if(correct) db.prepare('UPDATE users SET xp=xp+5 WHERE user_id=?').run(id);
        await interaction.update({
          embeds:[new EmbedBuilder().setColor(correct?0x58CC02:0xFF4B4B).setTitle(correct?'✅ Benar! +5 XP':'❌ Salah!')
            .setDescription(`**${ts.qq.tone.hanzi}** (${ts.qq.tone.pinyin}) = **Nada ${ts.qq.tone.tone}**\n${ts.qq.tone.audio}`)],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('TONE_NEXT').setLabel('Lagi 🎵').setStyle(ButtonStyle.Success))]});
      }
      else if(c==='TONE_NEXT'){
        const qq=makeToneQuestion(); const lbls=['🅰️','🅱️','🅲','🅳'];
        const row=new ActionRowBuilder();
        qq.opts.forEach((o,i)=>row.addComponents(new ButtonBuilder().setCustomId(`TO${i}_${o.ok?1:0}`).setLabel(`${lbls[i]} ${o.label}`).setStyle(ButtonStyle.Secondary)));
        sessions.set(id,{isTone:true,qq,userId:id});
        await interaction.update({embeds:[new EmbedBuilder().setColor(0xE74C3C).setTitle('🎵 Latihan Nada').setDescription(qq.q)
          .addFields({name:'📖',value:'1▬ datar | 2↗ naik | 3↘↗ turun-naik | 4↘ turun'})],components:[row]});
      }

      // ═══════════════════════════════════════
      //  SUSUN KALIMAT — MODAL POPUP
      // ═══════════════════════════════════════
      else if(c==='SUSUN_JAWAB'){
        const ss=sessions.get(id);
        if(!ss?.isSusun) return interaction.reply({content:'❌ Ketik `/susun` dulu!',ephemeral:true});
        const modal=new ModalBuilder().setCustomId('SUSUN_MODAL').setTitle('🧩 Ketik Jawabanmu');
        const input=new TextInputBuilder().setCustomId('susun_answer').setLabel('Ketik kalimat Mandarin yang benar:').setStyle(TextInputStyle.Short).setPlaceholder('Contoh: 我是学生').setRequired(true);
        modal.addComponents(new ActionRowBuilder().addComponents(input));
        await interaction.showModal(modal);
      }
      else if(c==='SUSUN_HINT'){
        const ss=sessions.get(id);
        if(!ss?.isSusun) return interaction.reply({content:'❌ Expired.',ephemeral:true});
        const ans=ss.q.answer;
        const hint=ans[0] + '...' + ans[ans.length-1];
        await interaction.reply({content:`💡 Hint: kata pertama adalah **${ans[0]}**, kata terakhir adalah **${ans[ans.length-1]}**\nKalimat punya **${ss.q.words.length}** bagian.`,ephemeral:true});
      }
      else if(c==='SUSUN_SKIP'){
        const ss=sessions.get(id);
        sessions.delete(id);
        const ans=ss?.q?.answer||'?';
        const arti=ss?.q?.arti||'?';
        await interaction.update({embeds:[new EmbedBuilder().setColor(0xFF4B4B).setTitle('⏭️ Dilewati').setDescription(`Jawaban benar:\n\n# ${ans}\n\n*${arti}*`)],
          components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('SUSUN_LAGI').setLabel('Soal Baru 🧩').setStyle(ButtonStyle.Success))]});
      }
      else if(c==='SUSUN_LAGI'){
        const q=makeSusunQuestion();
        sessions.set(id,{isSusun:true,q,userId:id,startAt:Date.now()});
        const emb=new EmbedBuilder().setColor(0x27AE60).setTitle('🧩 Susun Kalimat!')
          .setDescription(`Susun kata-kata ini:\n\n## ${q.shuffled.map(w=>`「${w}」`).join('  ')}\n\n💬 *${q.arti}*`)
          .setFooter({text:'Klik tombol untuk mengetik jawaban!'});
        await interaction.update({embeds:[emb],components:[new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('SUSUN_JAWAB').setLabel('✍️ Ketik Jawaban').setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId('SUSUN_HINT').setLabel('💡 Hint').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('SUSUN_SKIP').setLabel('⏭️ Skip').setStyle(ButtonStyle.Danger))]});
      }

      // Battle
      else if(c.startsWith('BACCEPT_')){
        const [_,_2,challengerId,challengedId]=c.split('_');
        if(id!==challengedId) return interaction.reply({content:'❌ Bukan kamu!',ephemeral:true});
        const bid=`${challengerId}_${challengedId}`;
        const bs={challengerId,challengedId,scores:{[challengerId]:0,[challengedId]:0},qs:shuffleArray(words).slice(0,5).map(w=>makeQuestion(w,words,'arti')),cur:0,answered:{},startAt:Date.now()};
        battles.set(bid,bs);
        const qq=bs.qs[0]; const lbls=['🅰️','🅱️','🅲','🅳'];
        const row=new ActionRowBuilder();
        qq.opts.forEach((o,i)=>row.addComponents(new ButtonBuilder().setCustomId(`BQ${i}_${o.ok?1:0}_${bid}`).setLabel(`${lbls[i]} ${o.label}`).setStyle(ButtonStyle.Secondary)));
        await interaction.update({content:`⚔️ <@${challengerId}> vs <@${challengedId}> — MULAI!`,
          embeds:[new EmbedBuilder().setColor(0xFF6B35).setTitle('⚔️ BATTLE! Soal 1/5').setDescription(qq.q)],components:[row]});
      }
      else if(c==='BDECLINE'){await interaction.update({content:'❌ Battle ditolak.',embeds:[],components:[]});}
      else if(c.startsWith('BQ')){
        const parts=c.split('_'); const correct=parts[1]==='1';
        const bid=parts.slice(2).join('_');
        const bs=battles.get(bid);
        if(!bs) return interaction.reply({content:'❌ Battle expired.',ephemeral:true});
        if(id!==bs.challengerId&&id!==bs.challengedId) return interaction.reply({content:'❌ Bukan peserta!',ephemeral:true});
        if(bs.answered[`${bs.cur}_${id}`]) return interaction.reply({content:'⏳ Sudah dijawab!',ephemeral:true});
        bs.answered[`${bs.cur}_${id}`]=true;
        if(correct) bs.scores[id]=(bs.scores[id]||0)+1;
        await interaction.reply({content:correct?'✅ Benar!':'❌ Salah!',ephemeral:true});
        if(bs.answered[`${bs.cur}_${bs.challengerId}`]&&bs.answered[`${bs.cur}_${bs.challengedId}`]){
          bs.cur++;
          if(bs.cur>=bs.qs.length){
            battles.delete(bid);
            const cs=bs.scores[bs.challengerId]||0,cds=bs.scores[bs.challengedId]||0;
            const winner=cs>cds?bs.challengerId:cds>cs?bs.challengedId:null;
            if(winner){db.prepare('UPDATE users SET xp=xp+50 WHERE user_id=?').run(winner);checkBadges(winner,{battle_win:true});}
            const [cu,cdu]=await Promise.all([client.users.fetch(bs.challengerId).catch(()=>null),client.users.fetch(bs.challengedId).catch(()=>null)]);
            interaction.channel.send({embeds:[new EmbedBuilder().setColor(winner?0xFFD700:0x95A5A6).setTitle('🏁 BATTLE SELESAI!')
              .setDescription(winner?`🏆 <@${winner}> menang!`:'🤝 Seri!')
              .addFields({name:`${cu?.username||'P1'}`,value:`${cs}/5`,inline:true},{name:'🆚',value:'—',inline:true},{name:`${cdu?.username||'P2'}`,value:`${cds}/5`,inline:true})]});
          } else {
            const qq=bs.qs[bs.cur]; const lbls=['🅰️','🅱️','🅲','🅳'];
            const row=new ActionRowBuilder();
            qq.opts.forEach((o,i)=>row.addComponents(new ButtonBuilder().setCustomId(`BQ${i}_${o.ok?1:0}_${bid}`).setLabel(`${lbls[i]} ${o.label}`).setStyle(ButtonStyle.Secondary)));
            interaction.channel.send({embeds:[new EmbedBuilder().setColor(0xFF6B35).setTitle(`⚔️ Soal ${bs.cur+1}/5`).setDescription(qq.q)
              .addFields({name:'Skor',value:`<@${bs.challengerId}>: ${bs.scores[bs.challengerId]||0} | <@${bs.challengedId}>: ${bs.scores[bs.challengedId]||0}`})],components:[row]});
          }
        }
      }
    }

    // ═══════════════════════════════════════════
    //  MODAL SUBMIT — SUSUN KALIMAT AUTO CHECK
    // ═══════════════════════════════════════════
    else if(interaction.isModalSubmit()){
      if(interaction.customId==='SUSUN_MODAL'){
        const id=interaction.user.id;
        const ss=sessions.get(id);
        if(!ss?.isSusun) return interaction.reply({content:'❌ Sesi expired. Ketik `/susun`',ephemeral:true});

        const userAnswer = interaction.fields.getTextInputValue('susun_answer');
        const correctAnswer = ss.q.answer;

        // Normalize both for comparison
        const normalUser = normalizeChinese(userAnswer);
        const normalCorrect = normalizeChinese(correctAnswer);

        const isCorrect = normalUser === normalCorrect;
        const elapsed = Math.round((Date.now() - ss.startAt) / 1000);

        sessions.delete(id);

        if(isCorrect){
          const xp = elapsed < 15 ? 20 : 15; // bonus XP kalau cepat
          db.prepare('UPDATE users SET xp=xp+? WHERE user_id=?').run(xp, id);

          await interaction.update({
            embeds: [new EmbedBuilder().setColor(0x58CC02)
              .setTitle(`✅ Benar! +${xp} XP ${elapsed < 15 ? '⚡ Cepat!' : ''}`)
              .setDescription(`# ${correctAnswer}\n\n*${ss.q.arti}*`)
              .addFields(
                {name: '✍️ Jawaban Kamu', value: userAnswer, inline: true},
                {name: '⏱️ Waktu', value: `${elapsed} detik`, inline: true}
              )],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('SUSUN_LAGI').setLabel('Soal Baru 🧩').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('PROFIL').setLabel('Profil 📋').setStyle(ButtonStyle.Secondary)
            )]
          });
        } else {
          // Cek seberapa dekat jawabannya
          let similarity = 0;
          for(let i = 0; i < Math.min(normalUser.length, normalCorrect.length); i++){
            if(normalUser[i] === normalCorrect[i]) similarity++;
          }
          const pct = normalCorrect.length > 0 ? Math.round(similarity / normalCorrect.length * 100) : 0;

          let feedback = '';
          if(pct >= 80) feedback = '😮 Hampir benar!';
          else if(pct >= 50) feedback = '🤔 Mendekati...';
          else if(pct >= 20) feedback = '😅 Masih jauh...';
          else feedback = '💪 Coba lagi!';

          await interaction.update({
            embeds: [new EmbedBuilder().setColor(0xFF4B4B)
              .setTitle(`❌ Salah! ${feedback}`)
              .setDescription(`Jawaban benar:\n# ${correctAnswer}\n\n*${ss.q.arti}*`)
              .addFields(
                {name: '✍️ Jawaban Kamu', value: userAnswer || '(kosong)', inline: true},
                {name: '📊 Kemiripan', value: `${pct}%`, inline: true},
                {name: '💡 Urutan Benar', value: ss.q.words.map((w,i) => `${i+1}. ${w}`).join('\n')}
              )],
            components: [new ActionRowBuilder().addComponents(
              new ButtonBuilder().setCustomId('SUSUN_LAGI').setLabel('Coba Soal Lain 🧩').setStyle(ButtonStyle.Success),
              new ButtonBuilder().setCustomId('PROFIL').setLabel('Profil 📋').setStyle(ButtonStyle.Secondary)
            )]
          });
        }
      }
    }

  }catch(err){
    console.error('Error:',err);
    try{
      const msg={content:'❌ Error. Coba lagi.',ephemeral:true};
      if(interaction.replied||interaction.deferred) await interaction.followUp(msg);
      else await interaction.reply(msg);
    }catch(_){}
  }
});

client.login(process.env.BOT_TOKEN);
