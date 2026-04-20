# ✅ CHECKLIST UAT FINAL — DuoChinese Bot

## A. Bot Health
- [ ] PM2 online, no crash loop
- [ ] Error log bersih
- [ ] 26 global commands terdaftar

## B. Core Learning
- [ ] `/mulai` — soal tampil, tombol normal, bisa jawab
- [ ] `/lanjut` — lesson sesuai progress, adaptive label jika ada kata lemah
- [ ] `/review` — mixed queue SRS + lemah, label jelas

## C. Profile & Stats
- [ ] `/profil` — XP, level, streak, review queue, kata lemah
- [ ] `/statistik` — overview, sering salah, per kategori, per unit, rekomendasi
- [ ] `/streak` — streak + max streak + target
- [ ] `/badge` — earned + locked, tidak undefined

## D. Content & Utility
- [ ] `/grammar nomor:9` — grammar HSK2 tampil
- [ ] `/kamus kata:医院` — hasil pencarian benar
- [ ] `/katahariini` — kata harian + contoh
- [ ] `/daily` — klaim reward, reject jika sudah klaim
- [ ] `/challenge` — challenge harian + progress
- [ ] `/skillmap` — semua Unit 1-16 tampil

## E. Mini Games
- [ ] `/tebakemoji` — soal + tombol 1234 + selesai
- [ ] `/tonetrain` — soal tone + jawaban
- [ ] `/susun` — modal input + scoring
- [ ] `/wordsearch` — grid + tebak + hint + menyerah
- [ ] `/speedround` — 10 soal + timer + bonus XP

## F. Social
- [ ] `/leaderboard tipe:global` — ranking tampil
- [ ] `/leaderboard tipe:server` — ranking server tampil
- [ ] `/battle @user` — challenge + accept + soal + hasil

## G. Role System
- [ ] `/setuproles` — 7 role dibuat/dicek
- [ ] `/syncroles` — sync semua / 1 user
- [ ] Auto sync saat level up

## H. Admin Diagnostics
- [ ] `/botinfo` — uptime, memory, sessions
- [ ] `/dbstats` — users, words, akurasi global
- [ ] `/adminuser user:@x` — detail user lengkap

## I. Reminder
- [ ] `/reminder jam:20:00` — tersimpan
- [ ] Reminder cron kirim notif

## J. Data Integrity
- [ ] DB words = 300
- [ ] HSK1 = 150, HSK2 = 150
- [ ] ID range 1-300
- [ ] Tidak ada lesson kosong

---
Generated: $(date)
