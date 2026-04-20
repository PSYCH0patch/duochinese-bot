const { EmbedBuilder } = require('discord.js');

function getWeekString(d = new Date()) {
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const weekNum = Math.ceil(((d - start) / 604800000 + start.getDay() + 1) / 1);
  return year + '-W' + String(weekNum).padStart(2, '0');
}

async function sendNotif(client, userId, channelId, embed) {
  try {
    const channel = client.channels.cache.get(channelId);
    if (!channel) return false;
    await channel.send({ content: `<@${userId}>`, embeds: [embed] });
    return true;
  } catch (e) {
    return false;
  }
}

async function runNotifications(client, db) {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const nowIso = now.toISOString();
  const hour = now.getHours();

  // Get users yang punya notif_channel aktif
  const users = db.prepare(`
    SELECT * FROM users
    WHERE notif_channel IS NOT NULL
    AND notif_channel != ''
    AND COALESCE(notif_enabled, 1) = 1
  `).all();

  for (const user of users) {
    const uid = user.user_id;
    const cid = user.notif_channel;

    // === 1. REVIEW QUEUE REMINDER ===
    // Kirim max 1x per hari, kalau ada > 5 kata due
    if (user.last_review_notif !== today) {
      const dueCount = db.prepare('SELECT COUNT(*) as c FROM user_words WHERE user_id = ? AND next_review <= ?').get(uid, nowIso).c;
      if (dueCount >= 5) {
        const sent = await sendNotif(client, uid, cid, new EmbedBuilder()
          .setColor(0xe74c3c)
          .setTitle('🔔 Waktunya Review!')
          .setDescription(`Kamu punya **${dueCount} kata** yang menunggu untuk direview.\n\nGunakan \`/review\` sekarang sebelum terlupakan!`)
          .setFooter({ text: 'DuoChinese • Review reminder' })
        );
        if (sent) {
          db.prepare("UPDATE users SET last_review_notif = ? WHERE user_id = ?").run(today, uid);
          db.prepare("INSERT INTO notifications (user_id, type) VALUES (?, ?)").run(uid, 'review_reminder');
        }
      }
    }

    // === 2. STREAK DANGER (jam 20:00-21:00, belum aktif hari ini) ===
    if (hour >= 20 && hour < 21 && user.last_active !== today && user.last_streak_notif !== today) {
      const streak = user.streak || 0;
      if (streak >= 1) {
        const sent = await sendNotif(client, uid, cid, new EmbedBuilder()
          .setColor(0xff6600)
          .setTitle('🔥 Streak Kamu Terancam!')
          .setDescription(`Streak **${streak} hari** kamu akan putus tengah malam ini jika tidak belajar!\n\nGunakan \`/lanjut\` atau \`/review\` sekarang!\n\nAtau pakai \`/buy item:streak_freeze\` untuk melindungi streak (500 XP).`)
          .setFooter({ text: 'DuoChinese • Streak danger' })
        );
        if (sent) {
          db.prepare("UPDATE users SET last_streak_notif = ? WHERE user_id = ?").run(today, uid);
          db.prepare("INSERT INTO notifications (user_id, type) VALUES (?, ?)").run(uid, 'streak_danger');
        }
      }
    }

    // === 3. DOUBLE XP HAMPIR HABIS (15 menit sebelum expired) ===
    if (user.double_xp_until) {
      const expiry = new Date(user.double_xp_until);
      const minsLeft = (expiry - now) / 60000;
      if (minsLeft > 0 && minsLeft <= 15) {
        // Check sudah notif belum hari ini
        const alreadyNotif = db.prepare(
          "SELECT id FROM notifications WHERE user_id = ? AND type = 'double_xp_warning' AND sent_at >= ?"
        ).get(uid, new Date(Date.now() - 900000).toISOString());

        if (!alreadyNotif) {
          const sent = await sendNotif(client, uid, cid, new EmbedBuilder()
            .setColor(0xf1c40f)
            .setTitle('⚡ Double XP Hampir Habis!')
            .setDescription(`Double XP kamu akan berakhir dalam **${Math.ceil(minsLeft)} menit**!\n\nCepat gunakan \`/lanjut\` atau \`/speedround\` untuk memaksimalkan XP!`)
            .setFooter({ text: 'DuoChinese • Double XP warning' })
          );
          if (sent) {
            db.prepare("INSERT INTO notifications (user_id, type) VALUES (?, ?)").run(uid, 'double_xp_warning');
          }
        }
      }
    }

    // === 4. NYAWA SUDAH PENUH KEMBALI ===
    // Kalau hearts < 5 tadi, check apakah sekarang sudah 5 lagi
    if ((user.hearts || 5) < 5 && user.hearts_refreshed_at && user.last_heart_notif !== today) {
      const lastRefresh = new Date(user.hearts_refreshed_at);
      const hoursPassed = (now - lastRefresh) / 3600000;
      const newHearts = Math.min(Math.floor(hoursPassed) + (user.hearts || 0), 5);

      if (newHearts >= 5) {
        const sent = await sendNotif(client, uid, cid, new EmbedBuilder()
          .setColor(0x2ecc71)
          .setTitle('❤️ Nyawa Sudah Penuh!')
          .setDescription(`Nyawa kamu sudah terisi penuh kembali! ❤️❤️❤️❤️❤️\n\nWaktunya belajar lagi dengan \`/lanjut\`!`)
          .setFooter({ text: 'DuoChinese • Heart refill' })
        );
        if (sent) {
          db.prepare("UPDATE users SET last_heart_notif = ? WHERE user_id = ?").run(today, uid);
          db.prepare("INSERT INTO notifications (user_id, type) VALUES (?, ?)").run(uid, 'heart_refill');
        }
      }
    }
  }
}

module.exports = { runNotifications, sendNotif, getWeekString };
