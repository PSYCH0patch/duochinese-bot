const { EmbedBuilder } = require('discord.js');

function getWeekString() {
  const d = new Date();
  const year = d.getFullYear();
  const start = new Date(year, 0, 1);
  const weekNum = Math.ceil(((d - start) / 604800000 + start.getDay() + 1) / 1);
  return year + '-W' + String(weekNum).padStart(2, '0');
}

function getSeasonString() {
  const d = new Date();
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return d.getFullYear() + '-Q' + q;
}

async function resetServerLeaderboard(client, db) {
  const guilds = client.guilds.cache;
  let totalReset = 0;

  for (const [guildId, guild] of guilds) {
    const top10 = db.prepare(
      'SELECT u.user_id, u.username, sx.xp FROM server_xp sx JOIN users u ON sx.user_id = u.user_id WHERE sx.guild_id = ? ORDER BY sx.xp DESC LIMIT 10'
    ).all(guildId);

    if (top10.length === 0) continue;

    const weekStr = getWeekString();
    const seasonRow = db.prepare(
      "INSERT INTO leaderboard_seasons (type, guild_id, season, started_at, ended_at, summary) VALUES (?, ?, ?, ?, ?, ?)"
    ).run('server_weekly', guildId, weekStr, '', new Date().toISOString(), JSON.stringify(top10));

    const seasonId = seasonRow.lastInsertRowid;
    for (let i = 0; i < top10.length; i++) {
      db.prepare('INSERT INTO season_snapshots (season_id, user_id, username, xp, rank) VALUES (?, ?, ?, ?, ?)')
        .run(seasonId, top10[i].user_id, top10[i].username, top10[i].xp, i + 1);
    }

    // Build summary embed
    const medals = ['🥇', '🥈', '🥉'];
    const list = top10.map((r, i) => {
      const m = i < 3 ? medals[i] : (i + 1) + '.';
      return m + ' **' + r.username + '** — ' + r.xp + ' XP';
    }).join('\n');

    const embed = new EmbedBuilder()
      .setColor(0xf1c40f)
      .setTitle('🏆 Rangkuman Leaderboard Minggu Ini — ' + weekStr)
      .setDescription('Selamat kepada pemenang minggu ini!\n\n' + list)
      .addFields(
        { name: '🥇 Juara 1', value: top10[0] ? top10[0].username + ' — ' + top10[0].xp + ' XP' : '-', inline: true },
      )
      .setFooter({ text: 'DuoChinese • Server leaderboard reset setiap Senin' });

    // Send to first available text channel
    const channel = guild.channels.cache.find(c =>
      c.isTextBased() && !c.isThread() && (
        c.name.includes('mandarin') ||
        c.name.includes('chinese') ||
        c.name.includes('belajar') ||
        c.name.includes('general') ||
        c.name.includes('umum') ||
        c.name.includes('chat')
      )
    );

    if (channel) {
      await channel.send({ embeds: [embed] }).catch(() => {});
    }

    // Reset server XP
    db.prepare('DELETE FROM server_xp WHERE guild_id = ?').run(guildId);
    totalReset++;
  }

  return totalReset;
}

async function resetGlobalSeason(client, db) {
  const top10 = db.prepare(
    'SELECT user_id, username, xp, streak FROM users ORDER BY xp DESC LIMIT 10'
  ).all();

  if (top10.length === 0) return 0;

  const seasonStr = getSeasonString();
  const seasonRow = db.prepare(
    "INSERT INTO leaderboard_seasons (type, guild_id, season, started_at, ended_at, summary) VALUES (?, ?, ?, ?, ?, ?)"
  ).run('global_quarterly', '', seasonStr, '', new Date().toISOString(), JSON.stringify(top10));

  const seasonId = seasonRow.lastInsertRowid;
  for (let i = 0; i < top10.length; i++) {
    db.prepare('INSERT INTO season_snapshots (season_id, user_id, username, xp, rank) VALUES (?, ?, ?, ?, ?)')
      .run(seasonId, top10[i].user_id, top10[i].username, top10[i].xp, i + 1);
  }

  const medals = ['🥇', '🥈', '🥉'];
  const list = top10.map((r, i) => {
    const m = i < 3 ? medals[i] : (i + 1) + '.';
    return m + ' **' + r.username + '** — ' + r.xp + ' XP 🔥' + (r.streak || 0);
  }).join('\n');

  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('🌍 Rangkuman Season Global — ' + seasonStr)
    .setDescription('Season berakhir! Selamat kepada pemenang!\n\n' + list)
    .addFields(
      { name: '🥇 Champion', value: top10[0] ? '**' + top10[0].username + '** — ' + top10[0].xp + ' XP' : '-', inline: false },
    )
    .setFooter({ text: 'DuoChinese • Global season reset setiap 3 bulan' });

  // Send to all guilds
  let sent = 0;
  for (const [guildId, guild] of client.guilds.cache) {
    const channel = guild.channels.cache.find(c =>
      c.isTextBased() && !c.isThread() && (
        c.name.includes('mandarin') ||
        c.name.includes('chinese') ||
        c.name.includes('belajar') ||
        c.name.includes('general') ||
        c.name.includes('umum') ||
        c.name.includes('chat')
      )
    );
    if (channel) {
      await channel.send({ embeds: [embed] }).catch(() => {});
      sent++;
    }
  }

  // Reset seasonal XP (keep all-time, reset for new season tracking)
  // We use weekly_stats table to track seasonal XP, so just don't delete users.xp
  // Clear weekly_stats for new season
  db.prepare("DELETE FROM weekly_stats").run();

  return sent;
}

function checkAndRunResets(client, db) {
  const now = new Date();
  const day = now.getDay(); // 0=Sunday, 1=Monday
  const hour = now.getHours();
  const minute = now.getMinutes();
  const month = now.getMonth() + 1;
  const date = now.getDate();

  // Server reset: Monday 00:00-00:04
  if (day === 1 && hour === 0 && minute < 5) {
    const weekStr = getWeekString();
    const alreadyDone = db.prepare(
      "SELECT id FROM leaderboard_seasons WHERE type='server_weekly' AND season=?"
    ).get(weekStr);

    if (!alreadyDone) {
      console.log('🔄 Running weekly server leaderboard reset...');
      resetServerLeaderboard(client, db)
        .then(count => console.log('✅ Server reset done: ' + count + ' servers'))
        .catch(err => console.error('❌ Server reset error:', err));
    }
  }

  // Global reset: 1st day of Jan/Apr/Jul/Oct, 00:00-00:04
  if (date === 1 && [1, 4, 7, 10].includes(month) && hour === 0 && minute < 5) {
    const seasonStr = getSeasonString();
    const alreadyDone = db.prepare(
      "SELECT id FROM leaderboard_seasons WHERE type='global_quarterly' AND season=?"
    ).get(seasonStr);

    if (!alreadyDone) {
      console.log('🔄 Running quarterly global leaderboard reset...');
      resetGlobalSeason(client, db)
        .then(count => console.log('✅ Global reset done: sent to ' + count + ' servers'))
        .catch(err => console.error('❌ Global reset error:', err));
    }
  }
}

module.exports = { resetServerLeaderboard, resetGlobalSeason, checkAndRunResets, getWeekString, getSeasonString };
