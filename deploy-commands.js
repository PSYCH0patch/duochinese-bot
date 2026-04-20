require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  // === LEARNING ===
  new SlashCommandBuilder().setName('mulai').setDescription('🎯 Mulai belajar dari lesson pertama'),
  new SlashCommandBuilder().setName('lanjut').setDescription('➡️ Lanjut ke lesson berikutnya'),
  new SlashCommandBuilder().setName('review').setDescription('🔄 Review kata yang perlu diulang'),
  new SlashCommandBuilder().setName('grammar').setDescription('📖 Penjelasan grammar Mandarin')
    .addIntegerOption(opt => opt.setName('nomor').setDescription('Nomor grammar (1-16)').setRequired(false)),
  new SlashCommandBuilder().setName('quiz').setDescription('🎯 Custom quiz — pilih sendiri')
    .addStringOption(opt => opt.setName('mode').setDescription('Mode quiz')
      .addChoices(
        { name: '📚 Per Unit', value: 'unit' },
        { name: '📂 Per Kategori', value: 'kategori' },
        { name: '🏷️ Per HSK Level', value: 'hsk' },
        { name: '🧠 Kata Lemah', value: 'lemah' },
        { name: '🔀 Random', value: 'random' },
      ).setRequired(true))
    .addIntegerOption(opt => opt.setName('nilai').setDescription('Nomor unit (1-16) atau HSK level (1-2)').setRequired(false)),
  new SlashCommandBuilder().setName('flashcard').setDescription('🃏 Mode flashcard — ketik jawaban sendiri')
    .addStringOption(opt => opt.setName('mode').setDescription('Pilih sumber kata')
      .addChoices(
        { name: '🔀 Random', value: 'random' },
        { name: '🧠 Kata Lemah', value: 'lemah' },
        { name: '📚 Per Unit', value: 'unit' },
      ).setRequired(false))
    .addIntegerOption(opt => opt.setName('unit').setDescription('Nomor unit (1-16)').setRequired(false)),

  // === PROFILE & STATS ===
  new SlashCommandBuilder().setName('profil').setDescription('👤 Lihat profil, XP, level, progress'),
  new SlashCommandBuilder().setName('statistik').setDescription('📊 Statistik detail belajar'),
  new SlashCommandBuilder().setName('streak').setDescription('🔥 Lihat streak belajar harian'),
  new SlashCommandBuilder().setName('badge').setDescription('🏅 Koleksi badge'),
  new SlashCommandBuilder().setName('skillmap').setDescription('🗺️ Peta semua lesson'),
  new SlashCommandBuilder().setName('progress').setDescription('📊 Visual progress card'),
  new SlashCommandBuilder().setName('weekly').setDescription('📊 Rangkuman belajar minggu ini'),

  // === SOCIAL ===
  new SlashCommandBuilder().setName('leaderboard').setDescription('🏆 Ranking XP')
    .addStringOption(opt => opt.setName('tipe').setDescription('Tipe leaderboard')
      .addChoices(
        { name: '🌍 Global (3 Bulan)', value: 'global' },
        { name: '🏠 Server (Mingguan)', value: 'server' },
        { name: '📜 Global All-Time', value: 'alltime' },
      ).setRequired(false)),
  new SlashCommandBuilder().setName('battle').setDescription('⚔️ Battle quiz 1v1')
    .addUserOption(opt => opt.setName('lawan').setDescription('Pilih lawan').setRequired(true)),
  new SlashCommandBuilder().setName('pair').setDescription('👫 Belajar bersama teman')
    .addUserOption(opt => opt.setName('teman').setDescription('Pilih teman').setRequired(true)),

  // === MINI GAMES ===
  new SlashCommandBuilder().setName('katahariini').setDescription('📅 Kata harian'),
  new SlashCommandBuilder().setName('challenge').setDescription('🎯 Tantangan harian'),
  new SlashCommandBuilder().setName('tonetrain').setDescription('🎵 Latihan nada'),
  new SlashCommandBuilder().setName('susun').setDescription('🧩 Susun kalimat'),
  new SlashCommandBuilder().setName('tebakemoji').setDescription('😃 Tebak hanzi dari emoji'),
  new SlashCommandBuilder().setName('wordsearch').setDescription('🔍 Cari kata di grid'),
  new SlashCommandBuilder().setName('speedround').setDescription('⚡ Speed round'),

  // === UTILITY ===
  new SlashCommandBuilder().setName('daily').setDescription('🎁 Hadiah login harian'),
  new SlashCommandBuilder().setName('shop').setDescription('🏪 Belanja item pakai XP'),
  new SlashCommandBuilder().setName('buy').setDescription('💰 Beli item dari shop')
    .addStringOption(opt => opt.setName('item').setDescription('Pilih item')
      .addChoices(
        { name: '❄️ Streak Freeze (500 XP)', value: 'streak_freeze' },
        { name: '❤️ Heart Refill (200 XP)', value: 'heart_refill' },
        { name: '⚡ Double XP 1jam (800 XP)', value: 'double_xp' },
        { name: '⏩ Skip Lesson (1000 XP)', value: 'skip_lesson' },
      ).setRequired(true)),
  new SlashCommandBuilder().setName('kamus').setDescription('📖 Cari kata')
    .addStringOption(opt => opt.setName('kata').setDescription('Cari hanzi/pinyin/arti').setRequired(true)),
  new SlashCommandBuilder().setName('reminder').setDescription('⏰ Set reminder belajar')
    .addStringOption(opt => opt.setName('jam').setDescription('Jam (contoh: 20:00)').setRequired(true)),
  new SlashCommandBuilder().setName('notif').setDescription('🔔 Atur notifikasi')
    .addStringOption(opt => opt.setName('action').setDescription('Aktifkan/matikan')
      .addChoices(
        { name: '🔔 Aktifkan', value: 'on' },
        { name: '🔕 Matikan', value: 'off' },
        { name: '📋 Status', value: 'status' },
      ).setRequired(false)),
  new SlashCommandBuilder().setName('hint').setDescription('💡 Minta hint saat quiz (-5 XP)'),

  // === ADMIN ===
  new SlashCommandBuilder().setName('setuproles').setDescription('🎭 Setup role level'),
  new SlashCommandBuilder().setName('syncroles').setDescription('🔄 Sinkron role level')
    .addUserOption(opt => opt.setName('user').setDescription('Sinkron 1 user').setRequired(false)),
  new SlashCommandBuilder().setName('dbstats').setDescription('📊 Database stats (admin)'),
  new SlashCommandBuilder().setName('botinfo').setDescription('🤖 Bot health check'),
  new SlashCommandBuilder().setName('adminuser').setDescription('🔍 Detail user (admin)')
    .addUserOption(opt => opt.setName('user').setDescription('Target').setRequired(true)),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`🔄 Registering ${commands.length} commands...`);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log(`✅ ${commands.length} commands registered!`);
  } catch (err) {
    console.error('❌', err);
  }
})();
