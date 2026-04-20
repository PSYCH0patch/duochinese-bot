require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  // === LEARNING ===
  new SlashCommandBuilder().setName('mulai').setDescription('🎯 Mulai belajar dari lesson pertama'),
  new SlashCommandBuilder().setName('lanjut').setDescription('➡️ Lanjut ke lesson berikutnya'),
  new SlashCommandBuilder().setName('review').setDescription('🔄 Review kata yang perlu diulang (SRS)'),
  new SlashCommandBuilder().setName('grammar')
    .setDescription('📖 Penjelasan grammar Mandarin')
    .addIntegerOption(opt => opt.setName('nomor').setDescription('Nomor grammar (1-16)').setRequired(false)),

  // === PROFILE & STATS ===
  new SlashCommandBuilder().setName('profil').setDescription('👤 Lihat profil, XP, level, progress'),
  new SlashCommandBuilder().setName('statistik').setDescription('📊 Statistik detail belajar'),
  new SlashCommandBuilder().setName('streak').setDescription('🔥 Lihat streak belajar harian'),
  new SlashCommandBuilder().setName('badge').setDescription('🏅 Koleksi badge'),
  new SlashCommandBuilder().setName('skillmap').setDescription('🗺️ Peta semua lesson (Unit 1-16)'),

  // === SOCIAL ===
  new SlashCommandBuilder().setName('leaderboard')
    .setDescription('🏆 Ranking XP')
    .addStringOption(opt =>
      opt.setName('tipe').setDescription('Global atau server ini')
        .addChoices({ name: 'Global', value: 'global' }, { name: 'Server Ini', value: 'server' })
        .setRequired(false)),
  new SlashCommandBuilder().setName('battle')
    .setDescription('⚔️ Battle quiz 1v1')
    .addUserOption(opt => opt.setName('lawan').setDescription('Pilih lawan').setRequired(true)),

  // === MINI GAMES ===
  new SlashCommandBuilder().setName('katahariini').setDescription('📅 Kata harian'),
  new SlashCommandBuilder().setName('challenge').setDescription('🎯 Tantangan harian'),
  new SlashCommandBuilder().setName('tonetrain').setDescription('🎵 Latihan 4 nada Mandarin'),
  new SlashCommandBuilder().setName('susun').setDescription('🧩 Mini game susun kalimat'),
  new SlashCommandBuilder().setName('tebakemoji').setDescription('😃 Tebak hanzi dari emoji'),
  new SlashCommandBuilder().setName('wordsearch').setDescription('🔍 Cari kata di grid hanzi'),
  new SlashCommandBuilder().setName('speedround').setDescription('⚡ Speed round — 10 soal cepat!'),

  // === UTILITY ===
  new SlashCommandBuilder().setName('daily').setDescription('🎁 Klaim hadiah login harian'),
  new SlashCommandBuilder().setName('kamus')
    .setDescription('📖 Cari kata')
    .addStringOption(opt => opt.setName('kata').setDescription('Cari hanzi/pinyin/arti').setRequired(true)),
  new SlashCommandBuilder().setName('reminder')
    .setDescription('⏰ Set reminder belajar')
    .addStringOption(opt => opt.setName('jam').setDescription('Jam reminder (contoh: 20:00)').setRequired(true)),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
  try {
    console.log(`🔄 Registering ${commands.length} commands (global)...`);
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ All commands registered globally!');
  } catch (err) {
    console.error('❌ Error:', err);
  }
})();
