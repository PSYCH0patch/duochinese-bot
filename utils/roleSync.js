const { PermissionFlagsBits } = require('discord.js');
const { LEVEL_ROLE_CONFIG } = require('../config/levelRoles');

async function getBotMember(guild) {
  return guild.members.me
    || await guild.members.fetchMe().catch(() => null)
    || await guild.members.fetch(guild.client.user.id).catch(() => null);
}

function getLevelRoleConfig(level) {
  return LEVEL_ROLE_CONFIG.find(r => r.level === level) || LEVEL_ROLE_CONFIG[0];
}

async function ensureLevelRoles(guild) {
  const botMember = await getBotMember(guild);
  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, reason: 'BOT_MISSING_MANAGE_ROLES', created: [], existing: [], failed: [] };
  }

  const created = [];
  const existing = [];
  const failed = [];

  for (const cfg of LEVEL_ROLE_CONFIG) {
    let role = guild.roles.cache.find(r => r.name === cfg.name);
    if (role) {
      existing.push(cfg.name);
      continue;
    }

    try {
      role = await guild.roles.create({
        name: cfg.name,
        color: cfg.color,
        hoist: false,
        mentionable: false,
        reason: 'DuoChinese level role setup',
      });
      created.push(role.name);
    } catch (err) {
      failed.push(`${cfg.name} (${err.message})`);
    }
  }

  return { ok: failed.length === 0, created, existing, failed };
}

async function syncMemberLevelRole(member, level, options = {}) {
  const { createMissing = true } = options;
  if (!member || member.user?.bot) return { ok: false, reason: 'INVALID_MEMBER' };

  const guild = member.guild;
  const botMember = await getBotMember(guild);

  if (!botMember?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
    return { ok: false, reason: 'BOT_MISSING_MANAGE_ROLES' };
  }

  if (createMissing) {
    await ensureLevelRoles(guild);
  }

  const targetCfg = getLevelRoleConfig(level);
  const targetRole = guild.roles.cache.find(r => r.name === targetCfg.name);

  if (!targetRole) {
    return { ok: false, reason: 'ROLE_NOT_FOUND' };
  }

  if (botMember.roles.highest.position <= targetRole.position) {
    return { ok: false, reason: 'ROLE_TOO_HIGH' };
  }

  const levelRoleNames = new Set(LEVEL_ROLE_CONFIG.map(r => r.name));
  const removable = member.roles.cache.filter(r => levelRoleNames.has(r.name) && r.id !== targetRole.id);

  const removed = [];
  for (const role of removable.values()) {
    if (botMember.roles.highest.position > role.position) {
      await member.roles.remove(role).catch(() => {});
      removed.push(role.name);
    }
  }

  if (!member.roles.cache.has(targetRole.id)) {
    await member.roles.add(targetRole).catch(err => {
      throw new Error(`ADD_FAILED: ${err.message}`);
    });
  }

  return { ok: true, targetRole: targetRole.name, removed };
}

async function syncUserRoleById(guild, userId, level, options = {}) {
  const member = await guild.members.fetch(userId).catch(() => null);
  if (!member) return { ok: false, reason: 'MEMBER_NOT_FOUND' };
  return syncMemberLevelRole(member, level, options);
}

async function syncGuildLevelRoles(guild, db, options = {}) {
  const { createMissing = true } = options;
  let members;
  let mode = 'cache';

  try {
    members = await guild.members.fetch();
    mode = 'fetch';
  } catch {
    members = guild.members.cache;
    mode = 'cache';
  }

  let checked = 0;
  let synced = 0;
  let skipped = 0;
  let failed = 0;

  for (const member of members.values()) {
    if (member.user?.bot) continue;
    checked++;

    const row = db.prepare('SELECT level FROM users WHERE user_id = ?').get(member.id);
    if (!row) {
      skipped++;
      continue;
    }

    try {
      const res = await syncMemberLevelRole(member, row.level || 1, { createMissing });
      if (res.ok) synced++;
      else failed++;
    } catch {
      failed++;
    }
  }

  return { checked, synced, skipped, failed, mode };
}

module.exports = {
  LEVEL_ROLE_CONFIG,
  ensureLevelRoles,
  syncMemberLevelRole,
  syncUserRoleById,
  syncGuildLevelRoles,
};
