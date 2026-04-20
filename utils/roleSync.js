const { PermissionFlagsBits } = require('discord.js');

const LEVEL_ROLES = [
  { level: 1, name: '🐣 DuoChinese • Pemula',    color: 0x95a5a6 },
  { level: 2, name: '🌱 DuoChinese • Pemula+',   color: 0x2ecc71 },
  { level: 3, name: '📗 DuoChinese • Pelajar',   color: 0x27ae60 },
  { level: 4, name: '📖 DuoChinese • Menengah',  color: 0x3498db },
  { level: 5, name: '⭐ DuoChinese • Mahir',     color: 0x9b59b6 },
  { level: 6, name: '🐉 DuoChinese • Ahli',      color: 0xe67e22 },
  { level: 7, name: '🏆 DuoChinese • Master',    color: 0xf1c40f },
];

const ROLE_NAMES = new Set(LEVEL_ROLES.map(r => r.name));

async function botCanManageRoles(guild) {
  try {
    const me = guild.members.me || await guild.members.fetchMe();
    return me?.permissions?.has(PermissionFlagsBits.ManageRoles) ?? false;
  } catch { return false; }
}

async function ensureRoles(guild) {
  if (!await botCanManageRoles(guild)) return { ok: false, reason: 'BOT_NO_PERMISSION', created: [], existing: [] };
  const created = [], existing = [];
  for (const cfg of LEVEL_ROLES) {
    const exists = guild.roles.cache.find(r => r.name === cfg.name);
    if (exists) { existing.push(cfg.name); continue; }
    try {
      await guild.roles.create({ name: cfg.name, color: cfg.color, hoist: false, mentionable: false, reason: 'DuoChinese level roles' });
      created.push(cfg.name);
    } catch (e) { /* skip if failed */ }
  }
  return { ok: true, created, existing };
}

async function syncRole(guild, userId, level) {
  if (!await botCanManageRoles(guild)) return false;
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member || member.user?.bot) return false;

  const me = guild.members.me || await guild.members.fetchMe();
  const targetCfg = LEVEL_ROLES.find(r => r.level === level) || LEVEL_ROLES[0];
  let targetRole = guild.roles.cache.find(r => r.name === targetCfg.name);

  // Auto-create role if missing
  if (!targetRole) {
    try {
      targetRole = await guild.roles.create({ name: targetCfg.name, color: targetCfg.color, hoist: false, mentionable: false, reason: 'DuoChinese auto role' });
    } catch { return false; }
  }

  if (me.roles.highest.position <= targetRole.position) return false;

  // Remove old level roles
  const toRemove = member.roles.cache.filter(r => ROLE_NAMES.has(r.name) && r.id !== targetRole.id);
  for (const role of toRemove.values()) {
    if (me.roles.highest.position > role.position) {
      await member.roles.remove(role).catch(() => {});
    }
  }

  // Add new role
  if (!member.roles.cache.has(targetRole.id)) {
    await member.roles.add(targetRole).catch(() => {});
  }

  return true;
}

async function syncAllRoles(guild, db) {
  if (!await botCanManageRoles(guild)) return { ok: false, reason: 'BOT_NO_PERMISSION' };
  await ensureRoles(guild);

  let members;
  try { members = await guild.members.fetch(); } catch { members = guild.members.cache; }

  let synced = 0, skipped = 0;
  for (const member of members.values()) {
    if (member.user?.bot) continue;
    const row = db.prepare('SELECT level FROM users WHERE user_id = ?').get(member.id);
    if (!row) { skipped++; continue; }
    const ok = await syncRole(guild, member.id, row.level || 1);
    if (ok) synced++; else skipped++;
  }
  return { ok: true, synced, skipped, total: members.size };
}

module.exports = { LEVEL_ROLES, ROLE_NAMES, ensureRoles, syncRole, syncAllRoles };
