require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder().setName('mulai').setDescription('Mulai belajar Mandarin dari awal'),
  new SlashCommandBuilder().setName('lanjut').setDescription('Lanjut ke lesson berikutnya'),
  new SlashCommandBuilder().setName('review').setDescription('Review kata yang perlu diulang'),
  new SlashCommandBuilder().setName('profil').setDescription('Lihat profil dan progress belajar'),
  new SlashCommandBuilder().setName('streak').setDescription('Lihat streak belajar harian'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('Lihat peringkat server'),
  new SlashCommandBuilder().setName('badge').setDescription('Lihat koleksi badge'),
  new SlashCommandBuilder().setName('katahariini').setDescription('Lihat kata hari ini'),
  new SlashCommandBuilder().setName('skillmap').setDescription('Lihat peta semua lesson'),
  new SlashCommandBuilder().setName('statistik').setDescription('Lihat statistik belajar detail'),
  new SlashCommandBuilder().setName('challenge').setDescription('Lihat tantangan harian'),
  new SlashCommandBuilder().setName('tonetrain').setDescription('Latihan nada (tone) bahasa Mandarin'),
  new SlashCommandBuilder().setName('susun').setDescription('Mini game susun kalimat Mandarin'),
  new SlashCommandBuilder().setName('battle').setDescription('Battle quiz 1v1 dengan member lain')
    .addUserOption(o => o.setName('lawan').setDescription('Pilih lawan battle').setRequired(true)),
  new SlashCommandBuilder().setName('grammar').setDescription('Lihat penjelasan grammar')
    .addIntegerOption(o => o.setName('nomor').setDescription('Nomor grammar (1-8)')),
  new SlashCommandBuilder().setName('reminder').setDescription('Set reminder belajar harian')
    .addStringOption(o => o.setName('jam').setDescription('Format: 19:00').setRequired(true)),
  new SlashCommandBuilder().setName('kamus').setDescription('Cari kata dalam kamus')
    .addStringOption(o => o.setName('kata').setDescription('Hanzi, pinyin, atau arti Indonesia').setRequired(true)),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
(async () => {
  try {
    console.log('Registering commands...');
    await rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), { body: commands });
    console.log('✅ Commands registered!');
  } catch (e) { console.error(e); }
})();
