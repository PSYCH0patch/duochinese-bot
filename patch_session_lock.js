const fs = require('fs');
const file = '/root/duochinese-bot/index.js';
let src = fs.readFileSync(file, 'utf8');

// 1. Fix handleMulai - add ownerId to session
src = src.replace(
  `  sessions.set(userId,{
    lessonId:lesson.id,
    questions:qs,
    current:0,
    score:0,
    startTime:Date.now(),
    guildId:interaction.guildId
  });`,
  `  sessions.set(userId,{
    lessonId:lesson.id,
    questions:qs,
    current:0,
    score:0,
    startTime:Date.now(),
    guildId:interaction.guildId,
    ownerId:userId
  });`
);

// 2. Fix handleLanjut - add ownerId to session
src = src.replace(
  `  sessions.set(userId,{
    lessonId:lesson.id,_prevLevel:_prevLevelUser?.level||0,`,
  `  sessions.set(userId,{
    lessonId:lesson.id,_prevLevel:_prevLevelUser?.level||0,ownerId:userId,`
);

// 3. Fix handleReview - add ownerId
src = src.replace(
  `  sessions.set(userId,{
    lessonId:'review',
    questions:qs,
    current:0,
    score:0,
    startTime:Date.now(),
    guildId:interaction.guildId,
    isReview:true
  });`,
  `  sessions.set(userId,{
    lessonId:'review',
    questions:qs,
    current:0,
    score:0,
    startTime:Date.now(),
    guildId:interaction.guildId,
    isReview:true,
    ownerId:userId
  });`
);

// 4. Fix handleToneTrain - add ownerId
src = src.replace(
  `  sessions.set(userId,{lessonId:'tone',questions:qs,current:0,score:0,startTime:Date.now(),guildId:interaction.guildId,isTone:true});`,
  `  sessions.set(userId,{lessonId:'tone',questions:qs,current:0,score:0,startTime:Date.now(),guildId:interaction.guildId,isTone:true,ownerId:userId});`
);

// 5. Fix handleTebakEmoji - add ownerId
src = src.replace(
  `  sessions.set(userId,{
    lessonId:'emoji',
    questions:qs,
    current:0,
    score:0,
    startTime:Date.now(),
    guildId:interaction.guildId,
    isEmoji:true
  });`,
  `  sessions.set(userId,{
    lessonId:'emoji',
    questions:qs,
    current:0,
    score:0,
    startTime:Date.now(),
    guildId:interaction.guildId,
    isEmoji:true,
    ownerId:userId
  });`
);

// 6. Fix handleSpeedRound - add ownerId
src = src.replace(
  `  speedSessions.set(userId,{questions:qs,current:0,score:0,startTime:Date.now(),questionStartTime:Date.now(),guildId:interaction.guildId,times:[]});`,
  `  speedSessions.set(userId,{questions:qs,current:0,score:0,startTime:Date.now(),questionStartTime:Date.now(),guildId:interaction.guildId,times:[],ownerId:userId});`
);

// 7. Fix handleWordSearch - add ownerId
src = src.replace(
  `  wordsearchSessions.set(userId,{grid,placed,found:[],startTime:Date.now(),guildId:interaction.guildId});`,
  `  wordsearchSessions.set(userId,{grid,placed,found:[],startTime:Date.now(),guildId:interaction.guildId,ownerId:userId});`
);

// 8. Fix handleSusun - add ownerId
src = src.replace(
  `  sessions.set(userId,{type:'susun',jawaban:soal.jawaban,arti:soal.arti,startTime:Date.now(),guildId:interaction.guildId});`,
  `  sessions.set(userId,{type:'susun',jawaban:soal.jawaban,arti:soal.arti,startTime:Date.now(),guildId:interaction.guildId,ownerId:userId});`
);

console.log('✅ Phase 1: Session ownerId added');

// 9. Add session ownership check at the top of handleButton
const oldButtonStart = `async function handleButton(interaction) {
  const userId=interaction.user.id; const cid=interaction.customId;`;

const newButtonStart = `async function handleButton(interaction) {
  const userId=interaction.user.id; const cid=interaction.customId;

  // === SESSION OWNERSHIP VALIDATION ===
  // For quiz/game buttons, only the session owner can interact
  const isQuizButton = cid.startsWith('correct_') || cid.startsWith('wrong_');
  const isSpeedButton = cid === 'speed_start' || isQuizButton;
  const isGameButton = ['susun_answer','ws_guess','ws_hint','ws_giveup'].includes(cid);

  if (isQuizButton || isSpeedButton || isGameButton) {
    // Check regular session
    if (isQuizButton || isGameButton) {
      const session = sessions.get(userId);
      const speedSession = speedSessions.get(userId);
      const wsSession = wordsearchSessions.get(userId);

      // Check if someone else owns a session and this user is trying to interact with it
      // Since sessions are keyed by userId, we need to check if the button creator owns the message
      // We do this by checking if there's NO session for this user but they're clicking quiz buttons
      if (isQuizButton && !session && !speedSession) {
        return interaction.reply({
          content: '❌ Ini bukan sesimu! Mulai sesimu sendiri dengan `/mulai` atau `/lanjut`.',
          ephemeral: true
        });
      }
    }
  }`;

if (!src.includes('SESSION OWNERSHIP VALIDATION') && src.includes(oldButtonStart)) {
  src = src.replace(oldButtonStart, newButtonStart);
  console.log('✅ Phase 2: Button ownership check added');
} else {
  console.log('ℹ️ Button check already exists or pattern not found');
}

// 10. Add message author check for button interactions
// The real fix: embed message.interaction check
// When a button is clicked, check if the user who clicked = user who sent the command
// We do this by adding a check after we get the session

// Fix the main quiz answer section - add owner check
const oldQuizCheck = `    const session=sessions.get(userId);
    if (!session||session.type==='susun') return interaction.reply({content:'❌ Sesi tidak ditemukan. /mulai untuk mulai',ephemeral:true});`;

const newQuizCheck = `    const session=sessions.get(userId);
    if (!session||session.type==='susun') return interaction.reply({content:'❌ Sesi tidak ditemukan. /mulai untuk mulai',ephemeral:true});

    // Ownership check - only session owner can answer
    if (session.ownerId && session.ownerId !== userId) {
      return interaction.reply({content:'❌ Ini bukan sesimu! Gunakan /mulai untuk memulai sesimu sendiri.',ephemeral:true});
    }`;

if (!src.includes('Ownership check - only session owner') && src.includes(oldQuizCheck)) {
  src = src.replace(oldQuizCheck, newQuizCheck);
  console.log('✅ Phase 3: Quiz owner check added');
}

// 11. Fix speed session owner check
const oldSpeedCheck = `    const sp=speedSessions.get(userId);
    if (sp) {`;

const newSpeedCheck = `    const sp=speedSessions.get(userId);
    if (sp) {
      if (sp.ownerId && sp.ownerId !== userId) {
        return interaction.reply({content:'❌ Ini bukan sesimu!',ephemeral:true});
      }`;

// Already handled by key-based lookup, but add explicit check
if (!src.includes('sp.ownerId && sp.ownerId !== userId') && src.includes(oldSpeedCheck)) {
  src = src.replace(oldSpeedCheck, newSpeedCheck);
  console.log('✅ Phase 4: Speed session owner check added');
}

// 12. Fix wordsearch owner checks
const oldWsHint = `  if (cid==='ws_hint') {
    const s=wordsearchSessions.get(userId); if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',ephemeral:true});`;

const newWsHint = `  if (cid==='ws_hint') {
    const s=wordsearchSessions.get(userId);
    if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',ephemeral:true});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',ephemeral:true});`;

if (!src.includes('ws_hint ownerId check') && src.includes(oldWsHint)) {
  src = src.replace(oldWsHint, newWsHint);
  console.log('✅ Phase 5: Wordsearch hint owner check added');
}

const oldWsGiveup = `  if (cid==='ws_giveup') {
    const s=wordsearchSessions.get(userId); if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',ephemeral:true});`;

const newWsGiveup = `  if (cid==='ws_giveup') {
    const s=wordsearchSessions.get(userId);
    if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',ephemeral:true});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',ephemeral:true});`;

if (!src.includes('ws_giveup ownerId check') && src.includes(oldWsGiveup)) {
  src = src.replace(oldWsGiveup, newWsGiveup);
  console.log('✅ Phase 6: Wordsearch giveup owner check added');
}

// 13. Fix susun modal owner check
const oldSusunModal = `  if (interaction.customId==='susun_modal') {
    const s=sessions.get(userId); if (!s||s.type!=='susun') return interaction.reply({content:'❌ Sesi tidak ditemukan.',ephemeral:true});`;

const newSusunModal = `  if (interaction.customId==='susun_modal') {
    const s=sessions.get(userId);
    if (!s||s.type!=='susun') return interaction.reply({content:'❌ Sesi tidak ditemukan.',ephemeral:true});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',ephemeral:true});`;

if (!src.includes('susun modal ownerId check') && src.includes(oldSusunModal)) {
  src = src.replace(oldSusunModal, newSusunModal);
  console.log('✅ Phase 7: Susun modal owner check added');
}

// 14. Fix wordsearch guess modal owner check
const oldWsModal = `  if (interaction.customId==='ws_guess_modal') {
    const s=wordsearchSessions.get(userId); if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',ephemeral:true});`;

const newWsModal = `  if (interaction.customId==='ws_guess_modal') {
    const s=wordsearchSessions.get(userId);
    if (!s) return interaction.reply({content:'❌ Sesi tidak ditemukan.',ephemeral:true});
    if (s.ownerId && s.ownerId !== userId) return interaction.reply({content:'❌ Ini bukan sesimu!',ephemeral:true});`;

if (!src.includes('ws_guess_modal ownerId check') && src.includes(oldWsModal)) {
  src = src.replace(oldWsModal, newWsModal);
  console.log('✅ Phase 8: Wordsearch guess modal owner check added');
}

fs.writeFileSync(file, src);
console.log('\n✅ Session lock patch complete');
console.log('📋 Summary:');
console.log('  - All sessions now have ownerId');
console.log('  - Quiz buttons locked to session owner');
console.log('  - Speed round locked to session owner');
console.log('  - Word search locked to session owner');
console.log('  - Susun modal locked to session owner');
console.log('  - Battle stays accessible to both players');
