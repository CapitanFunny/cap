// ============================================================================
// index.js — <<<<</// cap \\\>>>>> managed by @capitanfunny
// ============================================================================

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');

const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.AutoModerationConfiguration,
    GatewayIntentBits.AutoModerationExecution
  ]
});

// ============================================================================
// File Storage 1/10
// ============================================================================
(() => {
  try {
    const djs = require('discord.js');
    const { PermissionsBitField } = djs;

    function makeDummyMessage(channel) {
      const dummy = {
        id: '0',
        channel,
        author: client.user,
        async edit() { return dummy; },
        async delete() { return null; },
        async reply() { return dummy; },
        async react() { return null; },
        attachments: { size: 0, first: () => null },
        embeds: [],
        content: '',
      };
      return dummy;
    }

    function shouldNoOp(channel) {
      try {
        if (!channel || typeof channel.permissionsFor !== 'function') return false;
        const perms = channel.permissionsFor(client.user);
        return perms && !perms.has(PermissionsBitField.Flags.SendMessages);
      } catch {
        return false;
      }
    }

    const channelClasses = [
      djs.TextChannel,
      djs.NewsChannel,
      djs.ThreadChannel,
      djs.BaseGuildTextChannel
    ].filter(Boolean);

    for (const C of channelClasses) {
      if (!C || !C.prototype || C.prototype.send.__safePatched) continue;
      const origSend = C.prototype.send;
      C.prototype.send = async function (...args) {
        try {
          if (shouldNoOp(this)) return makeDummyMessage(this);
          return await origSend.apply(this, args);
        } catch {
          return makeDummyMessage(this);
        }
      };
      C.prototype.send.__safePatched = true;
    }

    if (djs.Message && djs.Message.prototype && !djs.Message.prototype.reply.__safePatched) {
      const origReply = djs.Message.prototype.reply;
      djs.Message.prototype.reply = async function (...args) {
        try {
          const ch = this.channel;
          if (shouldNoOp(ch)) return makeDummyMessage(ch);
          return await origReply.apply(this, args);
        } catch {
          return makeDummyMessage(this.channel);
        }
      };
      djs.Message.prototype.reply.__safePatched = true;
    }

  } catch {
  }
})();


const GUILD_CONFIG_ROOT = path.join(__dirname, 'guildconfigurations');

function guildFolderName(guildId) {
  return `guild_${String(guildId)}`;
}
function guildFolder(guildId) {
  return path.join(GUILD_CONFIG_ROOT, guildFolderName(guildId));
}
function casesFilename(guildId) {
  return `cases_${guildId}.txt`;
}
function prefixesFilename() {
  return 'server_prefixes.json';
}
function loggingFilename() {
  return 'server_logging_channels.json';
}
function guildCasesPath(guildId) {
  return path.join(guildFolder(guildId), casesFilename(guildId));
}
function guildPrefixesPath(guildId) {
  return path.join(guildFolder(guildId), prefixesFilename());
}
function guildLoggingPath(guildId) {
  return path.join(guildFolder(guildId), loggingFilename());
}

async function ensureRoot() {
  await fsp.mkdir(GUILD_CONFIG_ROOT, { recursive: true });
}

async function ensureGuildFolder(guildId) {
  const folder = guildFolder(guildId);
  await fsp.mkdir(folder, { recursive: true });
  return folder;
}

async function readJsonFileNullable(fpath) {
  try {
    const raw = await fsp.readFile(fpath, 'utf8');
    if (!raw || !raw.trim()) return null;
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}
async function writeJsonFile(fpath, obj) {
  const dir = path.dirname(fpath);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(fpath, JSON.stringify(obj, null, 2), 'utf8');
}

async function loadCasesFromFile(guildId = null) {
  await ensureRoot();
  if (guildId) {
    await ensureGuildFolder(guildId);
    const p = guildCasesPath(guildId);
    try {
      const obj = (await readJsonFileNullable(p)) || {};
      for (const [caseId, caseData] of Object.entries(obj)) {
        moderationCases.set(String(caseId), caseData);
      }
      console.log(`Cases Loaded; ${Object.keys(obj).length} | Cases for; ${guildId}`);
    } catch (err) {
      console.error(`Error loading cases from file for guild ${guildId}:`, err);
    }
  } else {
    try {
      const entries = await fsp.readdir(GUILD_CONFIG_ROOT, { withFileTypes: true }).catch(() => []);
      for (const e of entries) {
        if (!e.isDirectory()) continue;
        const dirName = e.name;
        const gid = dirName.startsWith('guild_') ? dirName.slice(6) : dirName;
        const p = guildCasesPath(gid);
        try {
          const obj = (await readJsonFileNullable(p)) || {};
          for (const [caseId, caseData] of Object.entries(obj)) {
            moderationCases.set(String(caseId), caseData);
          }
        } catch (err) {
          console.error(`Error loading cases for guild ${gid}:`, err);
        }
      }
      console.log(`Loaded ${moderationCases.size} total cases from guild folders`);
    } catch (err) {
      console.error('Error loading cases from file main file:', err);
    }
  }
}
async function saveCasesToFile(guildId = null) {
  await ensureRoot();
  if (guildId) {
    await ensureGuildFolder(guildId);
    const out = {};
    for (const [caseId, caseData] of moderationCases.entries()) {
      if (String(caseData.guildId) === String(guildId)) {
        out[caseId] = caseData;
      }
    }
    await writeJsonFile(guildCasesPath(guildId), out);
  } else {
    const byGuild = {};
    for (const [caseId, caseData] of moderationCases.entries()) {
      const gid = String(caseData.guildId || 'unknown');
      if (!byGuild[gid]) byGuild[gid] = {};
      byGuild[gid][caseId] = caseData;
    }
    for (const [gid, casesObj] of Object.entries(byGuild)) {
      await ensureGuildFolder(gid);
      await writeJsonFile(guildCasesPath(gid), casesObj);
    }
  }
}
async function loadServerPrefixes() {
  await ensureRoot();
  try {
    const entries = await fsp.readdir(GUILD_CONFIG_ROOT, { withFileTypes: true }).catch(() => []);
    serverPrefixes = new Map();
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const gid = e.name.startsWith('guild_') ? e.name.slice(6) : e.name;
      const p = guildPrefixesPath(gid);
      try {
        const obj = await readJsonFileNullable(p);
        if (!obj) continue;
        const pref = (typeof obj === 'string' ? obj : (obj.prefix || '!'));
        serverPrefixes.set(gid, pref);
      } catch (err) {
        console.error(`Error loading server prefixes for guild ${gid}:`, err);
      }
    }
    console.log(`Prefixes Loaded; ${serverPrefixes.size}g`);
  } catch (err) {
    console.error('Error loading server prefixes from file:', err);
  }
}

function automodConfigFilename() {
  return 'automod_config.json';
}
function guildAutomodPath(guildId) {
  return path.join(guildFolder(guildId), automodConfigFilename());
}

let serverAutomodConfig = new Map();

async function loadAutomodConfig() {
  await ensureRoot();
  serverAutomodConfig = new Map();
  try {
    const entries = await fsp.readdir(GUILD_CONFIG_ROOT, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const gid = e.name.startsWith('guild_') ? e.name.slice(6) : e.name;
      const p = guildAutomodPath(gid);
      try {
        const obj = await readJsonFileNullable(p);
        if (obj) {
          serverAutomodConfig.set(gid, obj);
        }
      } catch (err) {
        console.error(`Error loading automod config for guild ${gid}:`, err);
      }
    }
    console.log(`Loaded automod configs; ${serverAutomodConfig.size}g`);
  } catch (err) {
    console.error('Error loading automod configs from file:', err);
  }
}

async function saveAutomodConfig(guildId) {
  const config = serverAutomodConfig.get(guildId) || {};
  await ensureGuildFolder(guildId);
  await writeJsonFile(guildAutomodPath(guildId), config);
}

async function saveServerPrefixes() {
  for (const [gid, prefix] of serverPrefixes.entries()) {
    try {
      await ensureGuildFolder(gid);
      await writeJsonFile(guildPrefixesPath(gid), { prefix });
    } catch (err) {
      console.error(`Error saving prefix for guild ${gid}:`, err);
    }
  }
}
async function setServerPrefixPersist(guildId, prefix) {
  serverPrefixes.set(guildId, prefix);
  await ensureGuildFolder(guildId);
  await writeJsonFile(guildPrefixesPath(guildId), { prefix });
}

async function loadServerLoggingChannels() {
  await ensureRoot();
  serverLoggingChannels = new Map();
  try {
    const entries = await fsp.readdir(GUILD_CONFIG_ROOT, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const gid = e.name.startsWith('guild_') ? e.name.slice(6) : e.name;
      const p = guildLoggingPath(gid);
      try {
        const obj = (await readJsonFileNullable(p)) || {};
        serverLoggingChannels.set(gid, obj);
      } catch (err) {
        console.error(`Error loading server logging channels for guild ${gid}:`, err);
      }
    }
    console.log(`Loaded logging channels for ${serverLoggingChannels.size} guilds`);
  } catch (err) {
    console.error('Error loading server logging channels from file:', err);
  }
}

async function saveServerLoggingChannels() {
  for (const [gid, obj] of serverLoggingChannels.entries()) {
    try {
      await ensureGuildFolder(gid);
      await writeJsonFile(guildLoggingPath(gid), obj || {});
    } catch (err) {
      console.error(`Error saving logging channels for guild ${gid}:`, err);
    }
  }
}
async function setServerLoggingChannelPersist(guildId, logType, channelId) {
  const current = serverLoggingChannels.get(guildId) || {};
  current[logType] = channelId;
  serverLoggingChannels.set(guildId, current);
  await ensureGuildFolder(guildId);
  await writeJsonFile(guildLoggingPath(guildId), current);
}
async function setServerLoggingChannel(guildId, logType, channelId) {
  return await setServerLoggingChannelPersist(guildId, logType, channelId);
}


async function migrateOldRootFiles() {
  try {
    const rootFiles = await fsp.readdir(__dirname);
    for (const fname of rootFiles) {
      const casesMatch = fname.match(/^cases_(\d{5,})\\.txt$/);
      if (casesMatch) {
        const gid = casesMatch[1];
        const src = path.join(__dirname, fname);
        const destFolder = guildFolder(gid);
        await fsp.mkdir(destFolder, { recursive: true });
        const dest = path.join(destFolder, fname);
        try {
          const srcContent = await fsp.readFile(src, 'utf8');
          const srcObj = srcContent ? JSON.parse(srcContent) : {};
          const existing = (await readJsonFileNullable(dest)) || {};
          const merged = Object.assign({}, existing, srcObj);
          await writeJsonFile(dest, merged);
          await fsp.unlink(src).catch(()=>{});
          console.log(`Migrated ${fname} -> ${dest}`);
        } catch (err) {
          console.error('Failed migrating cases file', src, err);
        }
      }
    }
    const globalCasesPath = path.join(__dirname, 'cases.txt');
    try {
      const raw = await fsp.readFile(globalCasesPath, 'utf8').catch(()=>null);
      if (raw && raw.trim()) {
        let globalObj = {};
        try { globalObj = JSON.parse(raw); } catch (err) { globalObj = {}; }
        const byGuild = {};
        for (const [caseId, caseData] of Object.entries(globalObj || {})) {
          const gid = String(caseData.guildId || 'unknown');
          if (!byGuild[gid]) byGuild[gid] = {};
          byGuild[gid][caseId] = caseData;
        }
        for (const [gid, casesObj] of Object.entries(byGuild)) {
          const dest = guildCasesPath(gid);
          await ensureGuildFolder(gid);
          const existing = (await readJsonFileNullable(dest)) || {};
          const merged = Object.assign({}, existing, casesObj);
          await writeJsonFile(dest, merged);
        }
        await fsp.unlink(globalCasesPath).catch(()=>{});
        console.log('Migrated global cases.txt into per-guild files.');
      }
    } catch (err) {}
    const rootPrefixesPath = path.join(__dirname, 'server_prefixes.json');
    try {
      const rawPref = await fsp.readFile(rootPrefixesPath, 'utf8').catch(()=>null);
      if (rawPref && rawPref.trim()) {
        let obj = {};
        try { obj = JSON.parse(rawPref); } catch {}
        if (Object.keys(obj).length > 0 && Object.keys(obj).every(k => /^\d+$/.test(k))) {
          for (const [gid, pref] of Object.entries(obj)) {
            await ensureGuildFolder(gid);
            await writeJsonFile(guildPrefixesPath(gid), { prefix: pref });
          }
          await fsp.unlink(rootPrefixesPath).catch(()=>{});
          console.log('Migrated root server_prefixes.json into per-guild files.');
        }
      }
    } catch (err) {}
    const rootLoggingPath = path.join(__dirname, 'server_logging_channels.json');
    try {
      const rawLog = await fsp.readFile(rootLoggingPath, 'utf8').catch(()=>null);
      if (rawLog && rawLog.trim()) {
        let obj = {};
        try { obj = JSON.parse(rawLog); } catch {}
        if (Object.keys(obj).length > 0 && Object.keys(obj).every(k => /^\d+$/.test(k))) {
          for (const [gid, loggingObj] of Object.entries(obj)) {
            await ensureGuildFolder(gid);
            await writeJsonFile(guildLoggingPath(gid), loggingObj || {});
          }
          await fsp.unlink(rootLoggingPath).catch(()=>{});
          console.log('Migrated root server_logging_channels.json into per-guild files.');
        }
      }
    } catch (err) {}

  } catch (err) {
    console.error('Migration error:', err);
  }
}


// ============================================================================
// In-Memory Data 2/10
// ============================================================================
let moderationCases = new Map();
let serverPrefixes = new Map();
let serverLoggingChannels = new Map();
let serverImmunes = new Map();
let scheduledMessages = new Map();
let reminders = new Map();
const afkUsers = new Map();
const commandCooldowns = new Map();
const aboutInfo = {
  title: "cap",
  description: "A comprehensive multi-purpose moderation bot",
  version: "1.2.5",
  author: "<@1005866530350833794>",
  features: [
    "Case appeal, lookup, editing, and voiding system",
    "All the moderation commands you'll ever need",
    "Comprehensive verification, moderation, and general logging",
    "And so much more!"
  ],
  supportServer: "https://discord.gg/PfCC7Y2tXH",
  website: "https://sites.google.com/view/capitanfunny/discord-bot-developer?authuser=0"
};
const debugInfo = {
  about: {
    desc: 'Show information about the bot',
    perms: 'None',
    usage: '!about or /about',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  afk: {
    desc: 'Set yourself AFK with an optional reason',
    perms: 'None',
    usage: '!afk [reason] or /afk [reason]',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  automod: {
    desc: 'Manage Discord AutoMod with punishment assignments',
    perms: 'Administrator',
    usage: '!automod <create|delete|assign|view>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  appeal: {
    desc: 'Process an appeal for a moderation case',
    perms: 'Manage Messages + Timeout Members + Kick Members + Ban Members',
    usage: '!appeal <case_id> <accept/deny> [feedback]',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  ban: {
    desc: 'Ban a member',
    perms: 'Ban Members',
    usage: '!ban @user <reason>',
    test: async (ctx) => {
      try {
        if (!ctx.guild?.members?.me?.permissions.has(PermissionsBitField.Flags.BanMembers)) {
          return { status: '⚠️ Missing', details: 'Bot lacks Ban Members' };
        }
        return { status: '✅ OK', details: 'Permissions look good' };
      } catch (err) {
        return { status: '❌ Failed', details: err.message };
      }
    }
  },
  case: {
    desc: 'Look up detailed information about a specific moderation case',
    perms: 'Manage Messages',
    usage: '!case <case_id>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  cases: {
    desc: 'List all cases for a user',
    perms: 'Manage Messages',
    usage: '!cases @user',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  cmds: {
    desc: 'Alias of help, shows all commands',
    perms: 'None',
    usage: '!cmds or /cmds',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  commands: {
    desc: 'Alias of help, shows all commands',
    perms: 'None',
    usage: '!commands or /commands',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  debug: {
    desc: 'Show debug information and run self-tests',
    perms: 'Administrator',
    usage: '!debug [command]',
    test: async () => ({ status: '✅ OK', details: 'Debug command available.' })
  },
  editcase: {
    desc: 'Edit fields on a moderation case',
    perms: 'Manage Messages',
    usage: '!editcase <case_id> <field> <value>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  help: {
    desc: 'Show all available commands',
    perms: 'None',
    usage: '!help or /help',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  infract: {
    desc: 'Apply an infraction',
    perms: 'Manage Messages',
    usage: '!infract @user <reason>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  kick: {
    desc: 'Kick a member',
    perms: 'Kick Members',
    usage: '!kick @user <reason>',
    test: async (ctx) => {
      try {
        if (!ctx.guild?.members?.me?.permissions.has(PermissionsBitField.Flags.KickMembers)) {
          return { status: '⚠️ Missing', details: 'Bot lacks Kick Members' };
        }
        return { status: '✅ OK', details: 'Permissions look good' };
      } catch (err) {
        return { status: '❌ Failed', details: err.message };
      }
    }
  },
  membercount: {
    desc: 'Show member counts (total/humans/bots)',
    perms: 'None',
    usage: '!membercount or /membercount',
    test: async (ctx) => {
      try {
        const total = ctx.guild?.memberCount ?? 0;
        return { status: '✅ OK', details: `Total = ${total}` };
      } catch (err) {
        return { status: '❌ Failed', details: err.message };
      }
    }
  },
  memberinfo: {
    desc: 'Show info about a member',
    perms: 'None',
    usage: '!memberinfo [@user]',
    test: async (ctx) => {
      try {
        const user = ctx.author || ctx.user;
        await ctx.guild.members.fetch(user.id);
        return { status: '✅ OK', details: `Can fetch member ${user.tag}` };
      } catch (err) {
        return { status: '❌ Failed', details: err.message };
      }
    }
  },
  mute: {
    desc: 'Timeout (mute) a member',
    perms: 'Moderate Members',
    usage: '!mute @user <minutes> <reason>',
    test: async (ctx) => {
      try {
        if (!ctx.guild?.members?.me?.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
          return { status: '⚠️ Missing', details: 'Bot lacks Moderate Members' };
        }
        return { status: '✅ OK', details: 'Permissions look good' };
      } catch (err) {
        return { status: '❌ Failed', details: err.message };
      }
    }
  },
  nick: {
    desc: 'Change a member’s nickname',
    perms: 'Manage Nicknames',
    usage: '!nick @user <new nickname>',
    test: async (ctx) => {
      try {
        if (!ctx.guild?.members?.me?.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
          return { status: '⚠️ Missing', details: 'Bot lacks Manage Nicknames' };
        }
        return { status: '✅ OK', details: 'Permissions look good' };
      } catch (err) {
        return { status: '❌ Failed', details: err.message };
      }
    }
  },
  note: {
    desc: 'Add a note about a member',
    perms: 'Manage Messages',
    usage: '!note @user <reason>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  ping: {
    desc: 'Responds with Pong and latency',
    perms: 'None',
    usage: '!ping or /ping',
    test: async () => ({ status: '✅ OK', details: 'Latency check ready.' })
  },
  prefix: {
    desc: 'Change the server prefix',
    perms: 'Administrator',
    usage: '!prefix <new_prefix>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  purge: {
    desc: 'Delete multiple messages',
    perms: 'Manage Messages',
    usage: '!purge <number>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  role: {
    desc: 'Add or remove a role from a user',
    perms: 'Manage Roles',
    usage: '!role add|remove @user @role',
    test: async (ctx) => {
      try {
        if (!ctx.guild?.members?.me?.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
          return { status: '⚠️ Missing', details: 'Bot lacks Manage Roles' };
        }
        return { status: '✅ OK', details: 'Permissions look good' };
      } catch (err) {
        return { status: '❌ Failed', details: err.message };
      }
    }
  },
  say: {
    desc: 'Make the bot repeat a message',
    perms: 'Manage Messages',
    usage: '!say <text>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  serverinfo: {
    desc: 'Show information about the server',
    perms: 'None',
    usage: '!serverinfo or /serverinfo',
    test: async (ctx) => {
      try {
        const owner = await ctx.guild.fetchOwner();
        return { status: '✅ OK', details: `Owner is ${owner.user.tag}` };
      } catch (err) {
        return { status: '❌ Failed', details: err.message };
      }
    }
  },
  set: {
    desc: 'Set logging channels, prefixes, or DM footers',
    perms: 'Administrator',
    usage: '!set <log_type|prefix|dmfooter> <value>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  setproof: {
    desc: 'Attach or edit proof in a case',
    perms: 'Manage Messages',
    usage: '!setproof <case_id> <proof>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  status: {
    desc: 'Check bot status and latency',
    perms: 'None',
    usage: '!status or /status',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  support: {
    desc: 'Get the support server link',
    perms: 'None',
    usage: '!support or /support',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  updates: {
    desc: 'Post an update into a chosen channel',
    perms: 'Role-specific (1404888064601624726)',
    usage: '!updates #channel <text>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  verification: {
    desc: 'Send verification button to a channel',
    perms: 'Administrator',
    usage: '!verification [#channel] [role]',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  voidcase: {
    desc: 'Void an existing case',
    perms: 'Manage Messages + Timeout Members + Kick Members + Ban Members',
    usage: '!voidcase <case_id> <reason>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  immune: {
    desc: 'Mark a user or role as immune from a punishment (except kick/ban)',
    perms: 'Administrator',
    usage: '!immune @user|@role <punishment>',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  immunes: {
    desc: 'List immunities in the server',
    perms: 'Administrator',
    usage: '!immunes',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  reset: {
    desc: 'Reset all bot settings, cases, automod, reminders, and logs (server owner only)',
    perms: 'Server Owner',
    usage: '/reset (requires typing "reset authorize")',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  schedulemsg: {
    desc: 'Schedule a message to be sent later',
    perms: 'Manage Messages',
    usage: '!schedulemsg #channel <minutes> <message> or /schedulemsg',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  scheduledel: {
    desc: 'Delete scheduled messages',
    perms: 'Manage Messages',
    usage: '!scheduledel [@user] [minutes] or /scheduledel',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  schedulelist: {
    desc: 'List scheduled messages',
    perms: 'Manage Messages',
    usage: '!schedulelist [@user] [#channel] or /schedulelist',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  remindme: {
    desc: 'Create a reminder for yourself',
    perms: 'None',
    usage: '!remindme <minutes> <text> or /remindme',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  reminddel: {
    desc: 'Delete one of your reminders',
    perms: 'None',
    usage: '!reminddel <reminderId> or /reminddel',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  remindchange: {
    desc: 'Change one of your reminders',
    perms: 'None',
    usage: '!remindchange <reminderId> <minutes> <new text> or /remindchange',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  remindlist: {
    desc: 'List your active reminders',
    perms: 'None',
    usage: '!remindlist or /remindlist',
    test: async () => ({ status: '✅ OK', details: 'Handler present.' })
  },
  warn: {
    desc: 'Warn a member (creates case)',
    perms: 'Manage Messages',
    usage: '!warn @user <reason>',
    test: async (ctx) => {
      try {
        if (!ctx.guild?.members?.me?.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return { status: '⚠️ Missing', details: 'Bot lacks Manage Messages' };
        }
        return { status: '✅ OK', details: 'Permissions look good' };
      } catch (err) {
        return { status: '❌ Failed', details: err.message };
      }
    }
  }
};



// ============================================================================
// Utility Functions 3/10
// ============================================================================
function buildHelpEmbed(guildId) {
  const currentPrefix = getServerPrefix(guildId);

  const fields = [
    {
      name: 'ℹ️ about',
      value: '**Usage:** `about` or `!about`\n**Permissions:** None\n**Example:** `!about`',
      inline: false
    },
    {
      name: '💤 afk',
      value: '**Usage:** `afk reason:[text]` or `!afk [reason]`\n**Permissions:** None\n**Example:** `!afk Going to sleep`\n**Description:** Set yourself as AFK with an optional reason',
      inline: false
    },
    {
      name: '📋 appeal',
      value: '**Usage:** `appeal case_id:[case_id] decision:[accept/deny] feedback:[text]` or `!appeal [case_id] [accept/deny] [feedback]`\n**Permissions:** Manage Messages + Timeout Members + Kick Members + Ban Members\n**Example:** `!appeal AbCdEfGhIj accept The evidence was insufficient`\n**Description:** Process an appeal for a moderation case',
      inline: false
    },
    {
      name: '🔨 ban',
      value: '**Usage:** `ban user:[user] reason:[text] proof:[text]` or `!ban @user [reason] [proof]`\n**Permissions:** Ban Members\n**Example:** `!ban @user123 Severe rule violation`',
      inline: false
    },
    {
      name: '🔍 case',
      value: `**Usage:** \`case case_id:[case_id]\` or \`${currentPrefix}case [case_id]\`\n**Permissions:** Manage Messages\n**Example:** \`${currentPrefix}case AbCdEfGhIj\`\n**Description:** Look up detailed information about a specific moderation case`,
      inline: false
    },
    {
      name: '📋 cases',
      value: '**Usage:** `cases user:[user]` or `!cases @user`\n**Permissions:** Manage Messages\n**Example:** `!cases @user123`',
      inline: false
    },
    {
      name: '🔎 debug',
      value: `**Usage:** \`debug command:[name]\` or \`${currentPrefix}debug [command]\`\n**Permissions:** None\n**Example:** \`${currentPrefix}debug ping\`\n**Description:** Shows command info and runs a self-test`,
      inline: false
    },
    {
      name: '📝 editcase',
      value: `**Usage:** \`editcase case_id:[id] field:[field] value:[new]\` or \`${currentPrefix}editcase [id] [field] [new]\`\n**Permissions:** Manage Messages\n**Example:** \`${currentPrefix}editcase AbCdEfGhIj reason Updated reason\`\n**Description:** Edit fields on a moderation case (reason, proof, duration, voided, moderator, target)`,
      inline: false
    },
    {
      name: '❓ help',
      value: '**Usage:** `help` or `!help`\n**Permissions:** None\n**Example:** `!help`',
      inline: false
    },
    {
      name: '👢 kick',
      value: '**Usage:** `kick user:[user] reason:[text] proof:[text]` or `!kick @user [reason] [proof]`\n**Permissions:** Kick Members\n**Example:** `!kick @user123 Repeated violations`',
      inline: false
    },
    {
      name: '📊 membercount',
      value: '**Usage:** `membercount` or `!membercount`\n**Permissions:** None\n**Example:** `!membercount`\n**Description:** Show server total members, humans, and bots',
      inline: false
    },
    {
      name: '👤 memberinfo',
      value: '**Usage:** `memberinfo user:[user]` or `!memberinfo [@user]`\n**Permissions:** None\n**Example:** `!memberinfo @user123`\n**Description:** Show account creation date, join date, nickname, and avatar',
      inline: false
    },
    {
      name: '🔇 mute',
      value: '**Usage:** `mute user:[user] duration:[minutes] reason:[text] proof:[text]` or `!mute @user [duration] [reason] [proof]`\n**Permissions:** Moderate Members\n**Example:** `!mute @user123 60 Inappropriate behavior`',
      inline: false
    },
    {
      name: '✏️ nick / nickname',
      value: '**Usage:** `nick user:[user] nickname:[text]` or `!nick @user [new_nickname]`\n**Permissions:** Manage Nicknames\n**Example:** `!nick @user123 NewNick`\n**Description:** Change a member’s nickname',
      inline: false
    },
    {
      name: '📝 note',
      value: '**Usage:** `note user:[user] reason:[text] proof:[text]` or `!note @user [reason] [proof]`\n**Permissions:** Manage Messages\n**Example:** `!note @user123 Verbal warning for minor offense`',
      inline: false
    },
    {
      name: '🏓 ping',
      value: '**Usage:** `ping` or `!ping`\n**Permissions:** None\n**Example:** `!ping`\n**Description:** Check bot response time and latency',
      inline: false
    },
    {
      name: '🔧 prefix',
      value: `**Usage:** \`prefix new_prefix:[text]\` or \`${currentPrefix}prefix [new_prefix]\`\n**Permissions:** Administrator\n**Example:** \`${currentPrefix}prefix\`\n**Description:** Change the server prefix for bot commands`,
      inline: false
    },
    {
      name: '🗑️ purge',
      value: `**Usage:** \`purge amount:[number]\` or \`${currentPrefix}purge [number]\`\n**Permissions:** Manage Messages\n**Example:** \`${currentPrefix}purge 10\`\n**Description:** Delete a specified number of messages (1-100)`,
      inline: false
    },
    {
      name: '🎭 role',
      value: `**Usage:** \`role action:[add/remove] user:[user] role:[role]\` or \`${currentPrefix}role add @user @role\`\n**Permissions:** Manage Roles\n**Example:** \`${currentPrefix}role remove @user @Muted\`\n**Description:** Add or remove a role from a member (hierarchy enforced)`,
      inline: false
    },
    {
      name: '💬 say',
      value: `**Usage:** \`say content:[text]\` or \`${currentPrefix}say [text]\`\n**Permissions:** Manage Messages\n**Example:** \`${currentPrefix}say Hello everyone!\`\n**Description:** Make the bot repeat a message`,
      inline: false
    },
    {
      name: '🌐 serverinfo',
      value: '**Usage:** `serverinfo` or `!serverinfo`\n**Permissions:** None\n**Example:** `!serverinfo`\n**Description:** View server creation date, owner, ID, and icon',
      inline: false
    },
    {
      name: '⚙️ set',
      value: `**Usage:** \`${currentPrefix}set [modlogs/all.logs] #channel\` or \`${currentPrefix}set modlogs [text]\`\n**Permissions:** Administrator\n**Example:** \`${currentPrefix}set modlogs #moderation-channel\`\n**Description:** Set logging channels`,
      inline: false
    },
    {
      name: '📎 setproof',
      value: `**Usage:** \`setproof case_id:[id] proof:[text]\` or \`${currentPrefix}setproof [id] [proof]\`\n**Permissions:** Manage Messages\n**Example:** \`${currentPrefix}setproof AbCdEfGhIj Screenshot link\`\n**Description:** Add or update proof for an existing moderation case`,
      inline: false
    },
    {
      name: '📊 status',
      value: '**Usage:** `status` or `!status`\n**Permissions:** None\n**Example:** `!status`\n**Description:** View bot status and system information',
      inline: false
    },
    {
      name: '🤝 support',
      value: '**Usage:** `support` or `!support`\n**Permissions:** None\n**Example:** `!support`\n**Description:** View bot support server',
      inline: false
    },
    {
      name: '❌ voidcase',
      value: '**Usage:** `voidcase case_id:[case_id] reason:[text]` or `!voidcase [case_id] [reason]`\n**Permissions:** Manage Messages\n**Example:** `!voidcase AbCdEfGhIj False accusation`\n**Description:** Void an existing case',
      inline: false
    },
    {
      name: '⚠️ warn',
      value: '**Usage:** `warn user:[user] reason:[text] proof:[text]` or `!warn @user [reason] [proof]`\n**Permissions:** Manage Messages\n**Example:** `!warn @user123 Spamming Screenshot link`',
      inline: false
    }
  ];
  const MAX_FIELDS = 25;
  const reserveForExtras = 1;
  if (fields.length > (MAX_FIELDS - reserveForExtras)) {
    const allowed = MAX_FIELDS - reserveForExtras - 1;
    const visible = fields.slice(0, allowed);
    const remaining = fields.slice(allowed);

    const grouped = remaining.map(f => `**${f.name}** — ${f.value.replace(/\n/g, ' ')}`);
    visible.push({
      name: '📚 More commands',
      value: grouped.join('\n\n').slice(0, 1024),
      inline: false
    });

    const helpEmbed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('🤖 Bot Commands Help')
      .setDescription(`Here are all available commands, their usage, and required permissions:\n\n**Command Prefixes:** You can use either \`/\` (slash commands) or \`${currentPrefix}\` (prefix commands)`)
      .addFields(visible)
      .addFields({
        name: '📋 Additional Information',
        value: '• All moderation actions generate a unique 10-character case ID\n• All actions are logged in the moderation channel\n• Moderated users receive a DM with details about their punishment\n• Cases can be voided or edited by authorized moderators\n• Warnings, notes, and mutes expire after 30 days automatically\n• Kicks and bans are permanent\n• Your nickname will show [AFK] when you are away',
        inline: false
      })
      .setTimestamp();

    return helpEmbed;
  }
  const helpEmbed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle('🤖 Bot Commands Help')
    .setDescription(`Here are all available commands, their usage, and required permissions:\n\n**Command Prefixes:** You can use either \`/\` (slash commands) or \`${currentPrefix}\` (prefix commands)`)
    .addFields(fields)
    .addFields({
      name: '📋 Additional Information',
      value: '• All moderation actions generate a unique 10-character case ID\n• All actions are logged in the moderation channel\n• Moderated users receive a DM with details about their punishment\n• Cases can be voided or edited by authorized moderators\n• Warnings, notes, and mutes expire after 30 days automatically\n• Kicks and bans are permanent\n• Your nickname will show [AFK] when you are away',
      inline: false
    })
    .setTimestamp();

  return helpEmbed;
}

function getServerPrefix(guildId) {
  return serverPrefixes.get(guildId) || '!';
}

async function setServerPrefix(guildId, prefix) {
  serverPrefixes.set(guildId, prefix);
  await saveServerPrefixes();
}

function getServerLoggingChannel(guildId, logType) {
  const guildChannels = serverLoggingChannels.get(guildId);
  if (!guildChannels) return null;
  return guildChannels[logType] || null;
}

function guildSchedulesPath(guildId) {
  return path.join(guildFolder(guildId), 'schedules.json');
}


function parseDuration(input) {
  if (!input || typeof input !== 'string') return null;

  input = input.trim().toLowerCase();

  const match = input.match(/^(\d+(?:\.\d+)?)(s|m|h|d|w|mo|y)?$/);
  if (!match) return null;

  const value = parseFloat(match[1]);
  const unit = match[2] || 'm';

  const multipliers = {
    s: 1000,                     
    m: 1000 * 60,                
    h: 1000 * 60 * 60,           
    d: 1000 * 60 * 60 * 24,      
    w: 1000 * 60 * 60 * 24 * 7,  
    mo: 1000 * 60 * 60 * 24 * 30,
    y: 1000 * 60 * 60 * 24 * 365
  };

  return Math.floor(value * (multipliers[unit] || multipliers.m));
}


async function loadSchedules() {
  await ensureRoot();
  scheduledMessages = new Map();
  const entries = await fsp.readdir(GUILD_CONFIG_ROOT, { withFileTypes: true }).catch(() => []);
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const gid = e.name.startsWith('guild_') ? e.name.slice(6) : e.name;
    const obj = (await readJsonFileNullable(guildSchedulesPath(gid))) || [];
    scheduledMessages.set(gid, obj);
  }
}

async function saveSchedules(guildId) {
  const arr = scheduledMessages.get(String(guildId)) || [];
  await ensureGuildFolder(guildId);
  await writeJsonFile(guildSchedulesPath(guildId), arr);
}

function getGuildSchedules(guildId) {
  const arr = scheduledMessages.get(String(guildId));
  if (!arr) {
    scheduledMessages.set(String(guildId), []);
    return [];
  }
  return arr;
}

async function setUserAFK(member, reason) {
  const currentNickname = member.displayName;
  if (!afkUsers.has(member.guild.id)) {
    afkUsers.set(member.guild.id, new Map());
  }
  afkUsers.get(member.guild.id).set(member.id, {
    reason: reason || 'No reason provided',
    timestamp: new Date(),
    originalNickname: currentNickname
  });
  try {
    const newNickname = `[AFK] ${currentNickname}`;
    await member.setNickname(newNickname);
  } catch (error) {
    if (error.code !== 50013) {
      console.error('Failed to change nickname:', error);
    }
  }
}


function guildImmunesPath(guildId) {
  return path.join(guildFolder(guildId), 'immunes.json');
}
async function loadImmunes() {
  await ensureRoot();
  serverImmunes = new Map();
  try {
    const entries = await fsp.readdir(GUILD_CONFIG_ROOT, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      const gid = e.name.startsWith('guild_') ? e.name.slice(6) : e.name;
      const p = guildImmunesPath(gid);
      try {
        const obj = (await readJsonFileNullable(p)) || { roles: {}, users: {} };
        serverImmunes.set(gid, obj);
      } catch (err) {
        console.error(`Error loading immunes for guild ${gid}:`, err);
      }
    }
    console.log(`Loaded immunes for ${serverImmunes.size} guilds`);
  } catch (err) {
    console.error('Error loading immunes:', err);
  }
}
async function saveImmunes(guildId) {
  const obj = serverImmunes.get(String(guildId)) || { roles: {}, users: {} };
  await ensureGuildFolder(guildId);
  await writeJsonFile(guildImmunesPath(guildId), obj);
}
function guildRemindersPath(guildId) {
  return path.join(guildFolder(guildId), 'reminders.json');
}


async function resetGuildData(guildId) {
  try {
    const folder = guildFolder(guildId);
    await fsp.rm(folder, { recursive: true, force: true });

    moderationCases.forEach((v, k) => { if (v.guildId === guildId) moderationCases.delete(k); });
    serverPrefixes.delete(guildId);
    serverLoggingChannels.delete(guildId);
    serverAutomodConfig.delete(guildId);
    serverImmunes.delete(guildId);
    scheduledMessages.delete(guildId);

    console.log(`✅ Guild data reset for ${guildId}`);
    return true;
  } catch (err) {
    console.error(`❌ Failed to reset guild data for ${guildId}:`, err);
    return false;
  }
}

function addReminder(guildId, reminder) {
  const gid = String(guildId);
  if (!reminders.has(gid)) reminders.set(gid, []);
  reminders.get(gid).push(reminder);
}

function removeReminder(guildId, reminderId) {
  const gid = String(guildId);
  if (!reminders.has(gid)) return false;
  const arr = reminders.get(gid);
  const idx = arr.findIndex(r => r.id === reminderId);
  if (idx === -1) return false;
  arr.splice(idx, 1);
  if (arr.length === 0) reminders.delete(gid);
  return true;
}

function getGuildReminders(guildId) {
  const gid = String(guildId);
  if (!reminders.has(gid)) reminders.set(gid, []);
  return reminders.get(gid);
}

function getGuildImmunes(guildId) {
  const obj = serverImmunes.get(String(guildId));
  if (!obj) {
    const base = { roles: {}, users: {} };
    serverImmunes.set(String(guildId), base);
    return base;
  }
  return obj;
}
function isMemberImmune(guild, member, punishment) {
  if (!guild || !member || !punishment) return false;
  const immunes = getGuildImmunes(guild.id);
  const userList = immunes.users || {};
  const roleList = immunes.roles || {};
  const userEntry = userList[String(member.id)];
  if (Array.isArray(userEntry) && userEntry.includes(punishment)) return true;
  for (const roleId of Object.keys(roleList || {})) {
    if (!member.roles) continue;
    if (member.roles.cache && member.roles.cache.has(roleId)) {
      const arr = roleList[roleId];
      if (Array.isArray(arr) && arr.includes(punishment)) return true;
    }
  }

  return false;
}

async function removeUserAFK(member) {
  const guildAfkUsers = afkUsers.get(member.guild.id);
  if (!guildAfkUsers || !guildAfkUsers.has(member.id)) return false;

  const afkData = guildAfkUsers.get(member.id);
  guildAfkUsers.delete(member.id);
  try {
    await member.setNickname(afkData.originalNickname);
  } catch (error) {
    if (error.code !== 50013) {
      console.error('Failed to restore nickname:', error);
    }
  }

  return true;
}
const COOLDOWN_DURATION = 3000;
function checkCooldown(userId, commandName) {
  const now = Date.now();
  const cooldownKey = `${userId}-${commandName}`;

  if (commandCooldowns.has(cooldownKey)) {
    const expirationTime = commandCooldowns.get(cooldownKey) + COOLDOWN_DURATION;

    if (now < expirationTime) {
      const timeLeft = (expirationTime - now) / 1000;
      return { onCooldown: true, timeLeft: timeLeft.toFixed(1) };
    }
  }

  commandCooldowns.set(cooldownKey, now);
  return { onCooldown: false };
}
async function cleanupExpiredVoidedCases(guildId = null) {
  const now = new Date();
  const threeDaysAgo = new Date(now.getTime() - (72 * 60 * 60 * 1000));
  let cleaned = 0;

  const caseIds = [...moderationCases.keys()];

  for (const caseId of caseIds) {
    const moderationCase = moderationCases.get(caseId);
    if (!guildId || moderationCase.guildId === guildId) {
      if (moderationCase.voided && moderationCase.voidTimestamp && new Date(moderationCase.voidTimestamp) < threeDaysAgo) {
        moderationCases.delete(caseId);
        cleaned++;
      }
      if (moderationCase.appealed && moderationCase.appealTimestamp && new Date(moderationCase.appealTimestamp) < threeDaysAgo) {
        moderationCases.delete(caseId);
        cleaned++;
      }
    }
  }

  if (cleaned > 0) {
    await saveCasesToFile(guildId);
    console.log(`Cleaned up ${cleaned} expired voided/appealed cases ${guildId ? `for guild ${guildId}` : 'globally'}`);
  }
}

function isCaseExpired(moderationCase) {
  if (moderationCase.type === 'ban') {
    return false;
  }

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return new Date(moderationCase.timestamp) < thirtyDaysAgo;
}
function getAllGuildCases(guildId, page = 1, limit = 10) {
  const allCases = [];
  for (const [caseId, moderationCase] of moderationCases) {
    if (moderationCase.guildId === guildId && !moderationCase.voided) {
      allCases.push({ caseId, ...moderationCase });
    }
  }
  allCases.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  const startIndex = (page - 1) * limit;
  const endIndex = startIndex + limit;
  const paginatedCases = allCases.slice(startIndex, endIndex);
  
  return {
    cases: paginatedCases,
    total: allCases.length,
    page: page,
    totalPages: Math.ceil(allCases.length / limit)
  };
}
async function cleanupExpiredCases(guildId = null) {
  let cleaned = 0;
  const caseIds = [...moderationCases.keys()];

  for (const caseId of caseIds) {
    const moderationCase = moderationCases.get(caseId);

    if (!guildId || moderationCase.guildId === guildId) {

      if (isCaseExpired(moderationCase)) {
        moderationCases.delete(caseId);
        cleaned++;
      }
    }
  }
 if (cleaned > 0) {
    await saveCasesToFile(guildId);
    console.log(`Cleaned up ${cleaned} expired cases ${guildId ? `for guild ${guildId}` : ''}`);
  }
}
function getActiveCases(userId, guildId) {
  const activeCases = [];
  for (const [caseId, moderationCase] of moderationCases) {
    if (moderationCase.target === userId && 
        moderationCase.guildId === guildId && 
        !moderationCase.voided && 
        !moderationCase.appealed &&
        !isCaseExpired(moderationCase)) {
      activeCases.push({ caseId, ...moderationCase });
    }
  }
  return activeCases;
}



setInterval(() => cleanupExpiredCases(), 12 * 60 * 60 * 1000);
setInterval(() => cleanupExpiredCases(), 12 * 60 * 60 * 1000);

// =========
// Case ID's
// =========
function generateCaseId() {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}


// ============
// Continuation
// ============
async function resolveUser(guild, userInput) {
  if (!userInput) return null;
  const mentionMatch = userInput.match(/^<@!?(\d+)>$/);
  if (mentionMatch) {
    try {
      return await guild.client.users.fetch(mentionMatch[1]);
    } catch (error) {
      return null;
    }
  }
  if (/^\d{17,19}$/.test(userInput)) {
    try {
      return await guild.client.users.fetch(userInput);
    } catch (error) {
      return null;
    }
  }
  const member = guild.members.cache.find(m => 
    m.user.username.toLowerCase() === userInput.toLowerCase() ||
    m.user.tag.toLowerCase() === userInput.toLowerCase() ||
    (m.nickname && m.nickname.toLowerCase() === userInput.toLowerCase())
  );
  
  return member ? member.user : null;
}

// ========================
// Moderation Configuration
// ========================
async function sendModerationDM(target, action, moderator, reason, caseId, duration = null, guildId = null) {
  try {
    if (!target || target.bot) return;

    let guildName = 'Unknown';
    try {
      if (guildId) {
        if (typeof guildId === 'object' && guildId.name) {
          guildName = guildId.name;
        } else {
          const gid = String(guildId);
          let guildObj = client.guilds.cache.get(gid);
          if (!guildObj) {
            guildObj = await client.guilds.fetch(gid).catch(() => null);
          }
          if (guildObj && guildObj.name) guildName = guildObj.name;
        }
      }
    } catch (e) {
      console.warn('Could not resolve guild for DM footer:', e);
    }
    let moderatorDisplay = 'Unknown';
    try {
      if (moderator) {
        if (typeof moderator === 'string') {
          const u = await client.users.fetch(moderator).catch(() => null);
          moderatorDisplay = u ? u.tag : moderator;
        } else if (moderator.tag) {
          moderatorDisplay = moderator.tag;
        } else {
          moderatorDisplay = String(moderator);
        }
      }
    } catch (e) {
      console.warn('Could not resolve moderator for DM:', e);
    }
    let dmEmbed;
    if (action === 'note') {
      dmEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle('📝 You have been noted')
        .addFields(
          { name: 'Action', value: action.toUpperCase(), inline: true },
          { name: 'Moderator', value: moderatorDisplay, inline: true },
          { name: 'Case ID', value: String(caseId || 'N/A'), inline: true },
          { name: 'Reason', value: reason || 'No reason provided', inline: false },
          
        )
        .setFooter({ text: `Sent from ${guildName}` })
        .setTimestamp();
    } else {
      const titleAction = action === 'mute' ? 'given a mute' : `${action}ed`;
      dmEmbed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle(`\u200E<:a_2:1415171126560165928> You have been ${titleAction}!`)
        .addFields(
          { name: 'Action', value: action.toUpperCase(), inline: true },
          { name: 'Moderator', value: moderatorDisplay, inline: true },
          { name: 'Case ID', value: String(caseId || 'N/A'), inline: true },
          { name: 'Reason', value: reason || 'No reason provided', inline: false },
        )
        .setFooter({ text: `Sent from ${guildName}` })
        .setTimestamp();
    }

    if (duration) {
      dmEmbed.addFields({ name: 'Duration', value: String(duration), inline: true });
    }

    if (action === 'warn' || action === 'mute' || action === 'note') {
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);
      dmEmbed.addFields({
        name: 'This action expires',
        value: `<t:${Math.floor(expirationDate.getTime() / 1000)}:R>`,
        inline: true
      });
    }

    await target.send({ embeds: [dmEmbed] });
  } catch (error) {
    console.error('Failed to send DM to moderated user:', error);
  }
}

async function logModerationAction(guild, action, moderator, target, reason, proof, caseId, duration = null) {
  const guildId = guild.id;
  const modlogChannelId = getServerLoggingChannel(guildId, 'modlogs');
  const logChannel = modlogChannelId ? guild.channels.cache.get(modlogChannelId) : null;

  if (!logChannel) {
    console.warn(`Moderation log channel not found for guild ${guildId}. Skipping log.`);
    await sendModerationDM(target, action, moderator, reason, caseId, duration, guildId);
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`${action.toUpperCase()} | Case \`${caseId}\``)
    .addFields(
      { name: 'Target', value: `${target.tag} (${target.id})`, inline: true },
      { name: 'Moderator', value: `${moderator.tag} (${moderator.id})`, inline: true },
      { name: 'Reason', value: reason || 'No reason provided', inline: false }
    )
    .setTimestamp();

  if (proof) {
    embed.addFields({ name: 'Proof', value: proof, inline: false });
  }

  if (duration) {
    embed.addFields({ name: 'Duration', value: duration, inline: true });
  }
  if (action === 'warn' || action === 'mute' || action === 'note') {
    const expirationDate = new Date();
    expirationDate.setDate(expirationDate.getDate() + 30);
    embed.addFields({ name: 'Expires', value: `<t:${Math.floor(expirationDate.getTime() / 1000)}:R>`, inline: true });
  }
  await logChannel.send({ embeds: [embed] });
  await sendModerationDM(target, action, moderator, reason, caseId, duration, guildId);
}

function getActionColor(action) {
  return 0xFFFFFF;
}

// ============================================================================
// Pre-Prefix command handler
// ============================================================================
client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  if (message.interaction) return;
  const guildId = message.guild.id;
  const prefix = getServerPrefix(guildId);
if (afkUsers.has(message.guild.id) && afkUsers.get(message.guild.id).has(message.author.id)) {
  const removed = await removeUserAFK(message.member);
  if (removed) {
    const backEmbed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Welcome back!')
      .setDescription(`${message.author.tag}, your AFK status has been removed.`)
      .setTimestamp();

    const backMsg = await message.reply({ embeds: [backEmbed] });
    setTimeout(() => backMsg.delete().catch(() => {}), 5000);
  }
}
  if (message.mentions.users.size > 0 || message.reference) {
    const mentionedUsers = [...message.mentions.users.values()];
    if (message.reference) {
      try {
        const repliedMessage = await message.channel.messages.fetch(message.reference.messageId);
        if (repliedMessage && !mentionedUsers.includes(repliedMessage.author)) {
          mentionedUsers.push(repliedMessage.author);
        }
      } catch (error) {
      }
    }

    for (const user of mentionedUsers) {
      if (afkUsers.has(guildId) && afkUsers.get(guildId).has(user.id)) {
        const afkData = afkUsers.get(guildId).get(user.id);
        const afkEmbed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle(`${user.displayName} is currently AFK`)
          .addFields(
            { name: 'Reason', value: afkData.reason, inline: true },
            { name: 'Since', value: `<t:${Math.floor(afkData.timestamp.getTime() / 1000)}:R>`, inline: true }
          )
          .setTimestamp();

        const afkReply = await message.reply({ embeds: [afkEmbed] });
        setTimeout(() => {
          afkReply.delete().catch(() => {});
        }, 10000);
      }
    }
  }

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const commandName = args.shift().toLowerCase();
  const { member, guild } = message;

  try {
const cooldownCheck = checkCooldown(message.author.id, commandName);
if (cooldownCheck.onCooldown) {
  const cooldownMsg = await message.reply(`⏱️ You're on cooldown! Please wait ${cooldownCheck.timeLeft} more seconds before using this command again.`);
  setTimeout(() => {
    cooldownMsg.delete().catch(() => {});
  }, cooldownCheck.timeLeft * 1000);
  return;
}

// ============================================================================
// Prefix Command Handler 4/10
// ============================================================================

switch (commandName) {
case 'membercount': {
  const guild = message.guild;
  const total = guild.memberCount;

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`Member Count — ${guild.name}`)
    .addFields(
      { name: 'Total Members', value: `${total}`, inline: true },
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
  break;
}
case 'role': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Roles" permission to use this command.');
  }

  const action = args.shift()?.toLowerCase();
  if (!action || !['add','remove'].includes(action)) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!role add|remove @user @role`');
  }
  let targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]);
  if (!targetMember && args[0]) {
    targetMember = message.guild.members.cache.get(args[0]);
  }
  let roleArg = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]) || message.guild.roles.cache.get(args[1]);
  if (!roleArg) {
    const roleName = args.join(' ');
    roleArg = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
  }

  if (!targetMember || !roleArg) {
    return await message.reply('<:a_2:1415171126560165928> Could not find the target user or role. Usage: `!role add|remove @user @role`');
  }

  const executorHighest = member.roles.highest;
  const botMember = message.guild.members.cache.get(client.user.id);
  const botHighest = botMember.roles.highest;

  if (roleArg.position >= executorHighest.position) {
    return await message.reply('<:a_2:1415171126560165928> You cannot manage a role equal or higher than your highest role.');
  }
  if (roleArg.position >= botHighest.position) {
    return await message.reply('<:a_2:1415171126560165928> I cannot manage that role because it is equal or higher than my highest role.');
  }

  try {
    if (action === 'add') {
      if (targetMember.roles.cache.has(roleArg.id)) {
        return await message.reply('<:a_2:1415171126560165928> User already has that role.');
      }
      await targetMember.roles.add(roleArg.id);
      await message.reply(`<a:y1:1415173658237866025> Role ${roleArg.name} has been added to ${targetMember.user.tag}.`);
    } else {
      if (!targetMember.roles.cache.has(roleArg.id)) {
        return await message.reply('<:a_2:1415171126560165928> User does not have that role.');
      }
      await targetMember.roles.remove(roleArg.id);
      await message.reply(`<a:y1:1415173658237866025> Role ${roleArg.name} has been removed from ${targetMember.user.tag}.`);
    }
  } catch (err) {
    console.error('Role command error:', err);
    await message.reply('<:a_2:1415171126560165928> Failed to modify role. Check my permissions and role hierarchy.');
  }
  break;
}
case 'debug': {
  const cmd = args.shift()?.toLowerCase();

  if (!cmd) {
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Available debug commands')
      .setDescription(Object.keys(debugInfo).map(k => `• **${k}** — ${debugInfo[k].desc}`).join('\n'))
      .setTimestamp();
    return await message.reply({ embeds: [embed] });
  }

  const info = debugInfo[cmd];
  if (!info) {
    return await message.reply('<:a_2:1415171126560165928> Unknown command for debug.');
  }

  let testResult = { status: '⚠️ Not implemented', details: 'No self-test available.' };
  if (info.test) testResult = await info.test(message);

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`Debug — ${cmd}`)
    .addFields(
      { name: 'Description', value: info.desc, inline: false },
      { name: 'Permissions', value: info.perms || 'None', inline: true },
      { name: 'Usage', value: info.usage || 'N/A', inline: true },
      { name: 'Self-Test', value: `${testResult.status}\n${testResult.details}`, inline: false }
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
  break;
}

    case 'automod': {
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Administrator" permission to use this command.');
  }

  const subcommand = args.shift()?.toLowerCase();
  
  if (!subcommand || !['create', 'delete', 'assign', 'view'].includes(subcommand)) {
    return await message.reply(
      '<:a_2:1415171126560165928> Usage: `!automod <create|delete|assign|view>`\n' +
      '• `create <name>` - Create a new automod rule\n' +
      '• `delete <rule_id>` - Delete an automod rule\n' +
      '• `assign <rule_id> <punishment>` - Assign punishment (note/warn/kick/ban)\n' +
      '• `view` - View all automod rules and their punishments'
    );
  }

  const guildConfig = serverAutomodConfig.get(guildId) || { rules: {} };

  switch (subcommand) {
    case 'create': {
      const ruleName = args.join(' ');
      if (!ruleName) {
        return await message.reply('<:a_2:1415171126560165928> Please provide a name for the automod rule.');
      }

      try {
        const rule = await message.guild.autoModerationRules.create({
          name: ruleName,
          eventType: 1,
          triggerType: 1,
          triggerMetadata: {
            keywordFilter: ['default_blocked_word'],
          },
          actions: [{
            type: 1,
            metadata: {
              customMessage: 'Your message was blocked by AutoMod'
            }
          }],
          enabled: true,
          exemptRoles: [],
          exemptChannels: []
        });

        guildConfig.rules[rule.id] = {
          id: rule.id,
          name: ruleName,
          punishment: 'none',
          createdBy: message.author.id,
          createdAt: new Date().toISOString()
        };
        
        serverAutomodConfig.set(guildId, guildConfig);
        await saveAutomodConfig(guildId);

        await message.reply(`<a:y1:1415173658237866025> AutoMod rule "${ruleName}" created with ID: \`${rule.id}\`\nUse Discord's AutoMod settings to configure triggers, or use \`!automod assign ${rule.id} <punishment>\` to set a punishment.`);
      } catch (err) {
        console.error('Failed to create automod rule:', err);
        return await message.reply('<:a_2:1415171126560165928> Failed to create automod rule. Check my permissions.');
      }
      break;
    }

    case 'delete': {
      const ruleId = args[0];
      if (!ruleId) {
        return await message.reply('<:a_2:1415171126560165928> Please provide a rule ID to delete.');
      }

      try {
        const existingRule = await message.guild.autoModerationRules.fetch(ruleId).catch(() => null);
        if (!existingRule) {
          return await message.reply('<:a_2:1415171126560165928> AutoMod rule not found.');
        }

        await existingRule.delete();
        
        if (guildConfig.rules[ruleId]) {
          delete guildConfig.rules[ruleId];
          serverAutomodConfig.set(guildId, guildConfig);
          await saveAutomodConfig(guildId);
        }

        await message.reply(`<a:y1:1415173658237866025> AutoMod rule deleted successfully.`);
      } catch (err) {
        console.error('Failed to delete automod rule:', err);
        return await message.reply('<:a_2:1415171126560165928> Failed to delete automod rule.');
      }
      break;
    }

    case 'assign': {
      const ruleId = args[0];
      const punishment = args[1]?.toLowerCase();
      
      if (!ruleId || !punishment) {
        return await message.reply('<:a_2:1415171126560165928> Usage: `!automod assign <rule_id> <none|note|warn|kick|ban>`');
      }

      if (!['none', 'note', 'warn', 'kick', 'ban'].includes(punishment)) {
        return await message.reply('<:a_2:1415171126560165928> Punishment must be: none, note, warn, kick, or ban.');
      }

      try {
        const existingRule = await message.guild.autoModerationRules.fetch(ruleId).catch(() => null);
        if (!existingRule) {
          return await message.reply('<:a_2:1415171126560165928> AutoMod rule not found.');
        }
        if (!guildConfig.rules[ruleId]) {
          guildConfig.rules[ruleId] = {
            id: ruleId,
            name: existingRule.name,
            punishment: 'none',
            createdBy: message.author.id,
            createdAt: new Date().toISOString()
          };
        }
        
        guildConfig.rules[ruleId].punishment = punishment;
        guildConfig.rules[ruleId].assignedBy = message.author.id;
        guildConfig.rules[ruleId].assignedAt = new Date().toISOString();
        
        serverAutomodConfig.set(guildId, guildConfig);
        await saveAutomodConfig(guildId);

        await message.reply(`<a:y1:1415173658237866025> Punishment "${punishment}" assigned to rule "${existingRule.name}".`);
      } catch (err) {
        console.error('Failed to assign punishment:', err);
        return await message.reply('<:a_2:1415171126560165928> Failed to assign punishment.');
      }
      break;
    }

    case 'reset': {
  if (message.author.id !== message.guild.ownerId)
    return message.reply('❌ Only the **server owner** can use this command.');

  if (args[0] && args[0].toLowerCase() === 'authorize') {
    const ok = await resetGuildData(message.guild.id);
    if (ok) {
      return message.reply('✅ All server data has been reset successfully.');
    } else {
      return message.reply('❌ Failed to reset server data. Check logs for details.');
    }
  }

  return message.reply('⚠️ Type `reset authorize` to confirm full server reset. This will permanently erase all bot data for this server.');
}

    case 'view': {
      try {
        const rules = await message.guild.autoModerationRules.fetch();
        
        if (rules.size === 0) {
          return await message.reply('No AutoMod rules configured for this server.');
        }

        const embed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle('🤖 AutoMod Configuration')
          .setDescription('Current AutoMod rules and assigned punishments:')
          .setTimestamp();

        for (const rule of rules.values()) {
          const config = guildConfig.rules[rule.id];
          const punishment = config?.punishment || 'none';
          const assignedBy = config?.assignedBy ? `<@${config.assignedBy}>` : 'Not set';
          
          const triggerInfo = [];
          if (rule.triggerType === 1) triggerInfo.push('Keyword Filter');
          if (rule.triggerType === 3) triggerInfo.push('Spam Detection');
          if (rule.triggerType === 4) triggerInfo.push('Keyword Preset');
          if (rule.triggerType === 5) triggerInfo.push('Mention Spam');
          
          embed.addFields({
            name: `${rule.enabled ? '✅' : '❌'} ${rule.name}`,
            value: `**ID:** \`${rule.id}\`\n**Type:** ${triggerInfo.join(', ')}\n**Punishment:** ${punishment}\n**Assigned By:** ${assignedBy}`,
            inline: false
          });
        }

        await message.reply({ embeds: [embed] });
      } catch (err) {
        console.error('Failed to view automod rules:', err);
        return await message.reply('<:a_2:1415171126560165928> Failed to fetch automod rules.');
      }
      break;
    }
  }
  break;
}
case 'editcase': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Server" permission to use this command.');
  }

  const caseId = args.shift();
  const field = args.shift()?.toLowerCase();
  const newValue = args.join(' ');

  if (!caseId || !field || !newValue) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!editcase <case_id> <field> <new value>`\nFields: reason, proof, duration, voided (true/false), moderator, target');
  }

  if (!moderationCases.has(caseId)) {
    return await message.reply('<:a_2:1415171126560165928> Case ID not found.');
  }

  const caseData = moderationCases.get(caseId);

  if (caseData.guildId !== guildId) {
    return await message.reply('<:a_2:1415171126560165928> This case does not belong to this server.');
  }

  try {
    switch (field) {
      case 'reason':
        caseData.reason = newValue;
        break;
      case 'proof':
        caseData.proof = newValue;
        break;
      case 'duration':
        caseData.duration = newValue;
        break;
      case 'voided':
        caseData.voided = (newValue.toLowerCase() === 'true');
        if (caseData.voided) {
          caseData.voidedBy = message.author.id;
          caseData.voidTimestamp = new Date();
        } else {
          delete caseData.voidedBy;
          delete caseData.voidTimestamp;
        }
        break;
      case 'moderator': {
        const mention = message.mentions.users.first();
        const idMatch = newValue.match(/^<@!?(\d+)>$/) ? newValue.match(/^<@!?(\d+)>$/)[1] : (/^\d{17,19}$/.test(newValue) ? newValue : null);
        const modId = mention ? mention.id : idMatch;
        if (!modId) return await message.reply('<:a_2:1415171126560165928> Provide a moderator mention or ID.');
        caseData.moderator = modId;
        break;
      }
      case 'target': {
        const mention = message.mentions.users.first();
        const idMatch = newValue.match(/^<@!?(\d+)>$/) ? newValue.match(/^<@!?(\d+)>$/)[1] : (/^\d{17,19}$/.test(newValue) ? newValue : null);
        const targetId = mention ? mention.id : idMatch;
        if (!targetId) return await message.reply('<:a_2:1415171126560165928> Provide a target mention or ID.');
        caseData.target = targetId;
        break;
      }
      default:
        return await message.reply('<:a_2:1415171126560165928> Unknown field. Supported: reason, proof, duration, voided, moderator, target.');
    }

    moderationCases.set(caseId, caseData);
    await saveCasesToFile(guildId);
    try {
      const modlogChannelId = getServerLoggingChannel(guildId, 'modlogs');
      const logChannel = modlogChannelId ? message.guild.channels.cache.get(modlogChannelId) : null;
      if (logChannel && logChannel.isTextBased()) {
        const embed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle(`CASE UPDATED | Case \`${caseId}\``)
          .addFields(
            { name: 'Edited By', value: `${message.author.tag} (${message.author.id})`, inline: true },
            { name: 'Field', value: field.toUpperCase(), inline: true },
            { name: 'New Value', value: newValue.length > 1024 ? newValue.slice(0, 1020) + '...' : newValue, inline: false }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Failed to send modlog for editcase:', err);
    }

    await message.reply(`<a:y1:1415173658237866025> Case \`${caseId}\` updated (${field}).`);
  } catch (err) {
    console.error('editcase error:', err);
    await message.reply('<:a_2:1415171126560165928> Failed to edit the case.');
  }
  break;
}
case 'serverinfo': 
case 'si': {
  const guild = message.guild;
  const owner = await guild.fetchOwner().catch(() => null);

 const retracted = "**{RETRACTED}**";

const safeGuildName = guild?.name || retracted;
const safeGuildId = guild?.id || retracted;
const safeGuildCreated = guild?.createdTimestamp
  ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`
  : retracted;
const safeOwner = owner ? `${owner.user.tag} (${owner.id})` : retracted;
const safeIcon = guild?.iconURL?.({ dynamic: true, size: 1024 }) || null;

const embed = new EmbedBuilder()
  .setColor(0xFFFFFF)
  .setTitle(`Server Info — ${safeGuildName}`)
  .setThumbnail(safeIcon)
  .addFields(
    { name: 'Server Name', value: safeGuildName, inline: true },
    { name: 'Guild ID', value: safeGuildId, inline: true },
    { name: 'Owner', value: safeOwner, inline: true },
    { name: 'Created', value: safeGuildCreated, inline: true }
  )
  .setTimestamp();



  await message.reply({ embeds: [embed] });
  break;
}
case 'memberinfo':
case 'mi':{
  let targetMember = message.mentions.members.first() || message.guild.members.cache.get(args[0]) || null;
  if (!targetMember && args[0]) {
    const search = args.join(' ');
    targetMember = message.guild.members.cache.find(m =>
      m.user.username.toLowerCase().includes(search.toLowerCase()) ||
      (m.displayName && m.displayName.toLowerCase().includes(search.toLowerCase()))
    );
  }
  if (!targetMember) targetMember = message.member;

  const user = targetMember.user;
  const retracted = "**{RETRACTED}**";

const safeUsername = user?.tag || retracted;
const safeUserId = user?.id || retracted;
const safeNickname = targetMember?.displayName || retracted;
const safeCreated = user?.createdTimestamp
  ? `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`
  : retracted;
const safeJoined = targetMember?.joinedAt
  ? `<t:${Math.floor(targetMember.joinedAt.getTime() / 1000)}:F>`
  : retracted;
const safeAvatar = user?.displayAvatarURL?.({ dynamic: true, size: 1024 }) || null;
const safeAvatarLink = user?.displayAvatarURL
  ? `[Link](${user.displayAvatarURL({ dynamic: true, size: 1024 })})`
  : retracted;

const embed = new EmbedBuilder()
  .setColor(0xFFFFFF)
  .setTitle(`${safeUsername}`)
  .setThumbnail(safeAvatar)
  .addFields(
    { name: 'Username', value: safeUsername, inline: true },
    { name: 'User ID', value: safeUserId, inline: true },
    { name: 'Nickname', value: safeNickname, inline: true },
    { name: 'Account Created', value: safeCreated, inline: true },
    { name: 'Joined Server', value: safeJoined, inline: true },
    { name: 'Avatar URL', value: safeAvatarLink, inline: false }
  )
  .setTimestamp();



  await message.reply({ embeds: [embed] });
  break;
}
case 'immune': {
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return await message.reply('<:a_2:1415171126560165928> You need Administrator permission to use this command.');
  }

  const targetArg = args[0];
  const punishment = (args[1] || '').toLowerCase();

  if (!targetArg || !punishment) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!immune <@role|@user|id|name> <punishment>` — kicks/bans cannot be immunized.');
  }
  if (['kick','ban'].includes(punishment)) {
    return await message.reply('<:a_2:1415171126560165928> You cannot make roles/users immune to `kick` or `ban`.');
  }
  const roleMention = message.mentions.roles.first();
  const userMention = message.mentions.users.first();

  const immunes = getGuildImmunes(guildId);
  immunes.roles = immunes.roles || {};
  immunes.users = immunes.users || {};

  if (roleMention || guild.roles.cache.get(targetArg) || guild.roles.cache.find(r=>r.name.toLowerCase()===targetArg.toLowerCase())) {
    const role = roleMention || guild.roles.cache.get(targetArg) || guild.roles.cache.find(r=>r.name.toLowerCase()===targetArg.toLowerCase());
    if (!role) return await message.reply('<:a_2:1415171126560165928> Role not found.');

    const arr = immunes.roles[role.id] = immunes.roles[role.id] || [];
    if (arr.includes(punishment)) {
      immunes.roles[role.id] = arr.filter(x=>x!==punishment);
      await saveImmunes(guildId);
      return await message.reply(`<a:y1:1415173658237866025> Removed immunity for role **${role.name}** on \`${punishment}\`.`);
    } else {
      arr.push(punishment);
      await saveImmunes(guildId);
      return await message.reply(`<a:y1:1415173658237866025> Role **${role.name}** is now immune to \`${punishment}\`.`);
    }
  } else if (userMention || /^\d{17,19}$/.test(targetArg) || targetArg) {
    const user = userMention || await resolveUser(guild, targetArg).catch(()=>null) || ( /^\d{17,19}$/.test(targetArg) ? await client.users.fetch(targetArg).catch(()=>null) : null );
    if (!user) return await message.reply('<:a_2:1415171126560165928> User not found.');

    const arr = immunes.users[user.id] = immunes.users[user.id] || [];
    if (arr.includes(punishment)) {
      immunes.users[user.id] = arr.filter(x=>x!==punishment);
      await saveImmunes(guildId);
      return await message.reply(`<a:y1:1415173658237866025> Removed immunity for ${user.tag} on \`${punishment}\`.`);
    } else {
      arr.push(punishment);
      await saveImmunes(guildId);
      return await message.reply(`<a:y1:1415173658237866025> ${user.tag} is now immune to \`${punishment}\`.`);
    }
  } else {
    return await message.reply('<:a_2:1415171126560165928> Could not resolve a role or user from that argument.');
  }
}

case 'immunes': {
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return await message.reply('<:a_2:1415171126560165928> You need Administrator permission to use this command.');
  }

  const filter = (args[0] || '').toLowerCase();
  const immunes = getGuildImmunes(guildId);

  const roleLines = Object.entries(immunes.roles || {}).map(([id, arr]) => {
    const role = guild.roles.cache.get(id);
    return `• ${role ? role.name : id}: ${arr.join(', ')}`;
  });
  const userLines = Object.entries(immunes.users || {}).map(([id, arr]) => {
    const user = client.users.cache.get(id);
    return `• ${user ? user.tag : id}: ${arr.join(', ')}`;
  });

  const format = (lines) => {
    if (!lines.length) return 'None';
    if (!filter) return lines.join('\n');
    return lines.filter(l => l.toLowerCase().includes(filter)).join('\n') || 'None';
  };

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle('Immunities')
    .addFields(
      { name: 'Role Immunities', value: format(roleLines), inline: false },
      { name: 'User Immunities', value: format(userLines), inline: false }
    )
    .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
    .setTimestamp();

  return await message.reply({ embeds: [embed] });
}




case 'nick':
case 'nickname': {
 
  if (!member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Nicknames" permission to use this command.');
  }

  const targetInput = args.shift();
  const newNickname = args.join(" ");

  if (!targetInput || !newNickname) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!nick @user [new nickname]` or `!nick username [new nickname]`');
  }

  let targetMember;

  if (message.mentions.members.size > 0) {
    targetMember = message.mentions.members.first();
  }

  if (!targetMember && /^\d{17,19}$/.test(targetInput)) {
    targetMember = message.guild.members.cache.get(targetInput);
  }

  if (!targetMember) {
    targetMember = message.guild.members.cache.find(m =>
      m.user.username.toLowerCase().includes(targetInput.toLowerCase()) ||
      (m.displayName && m.displayName.toLowerCase().includes(targetInput.toLowerCase()))
    );
  }

  if (!targetMember) {
    return await message.reply('<:a_2:1415171126560165928> Could not find that user.');
  }

  try {
    await targetMember.setNickname(newNickname);
    await message.reply(`<a:y1:1415173658237866025> Nickname for **${targetMember.user.tag}** has been changed to **${newNickname}**.`);
  } catch (err) {
    console.error("Nickname change error:", err);
    return await message.reply('<:a_2:1415171126560165928> Failed to change nickname. Check role hierarchy and permissions.');
  }
  break;
}
case 'verification': {
  const isAdmin = member.permissions.has(PermissionsBitField.Flags.Administrator);

  if (!isAdmin) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Administrator" permission to use this command.');
  }
  let argsCopy = Array.from(args);
  let targetChannel = message.mentions.channels.first();
  if (!targetChannel && argsCopy[0] && /^\d{16,19}$/.test(argsCopy[0])) {
    const maybeChannel = message.guild.channels.cache.get(argsCopy[0]);
    if (maybeChannel) {
      targetChannel = maybeChannel;
      argsCopy.shift();
    }
  }
  if (!targetChannel) targetChannel = message.channel;
  let verifiedRole = message.mentions.roles.first();
  if (!verifiedRole) {
    const roleInput = argsCopy[0];
    if (roleInput) {
      if (/^\d{16,19}$/.test(roleInput)) {
        verifiedRole = message.guild.roles.cache.get(roleInput);
      } else {
        verifiedRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === roleInput.toLowerCase());
      }
    }
  }

  if (!verifiedRole) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!verification [#channel] <@role|roleId|roleName>` — role is required.');
  }

  if (!targetChannel || !targetChannel.isTextBased()) {
    return await message.reply('<:a_2:1415171126560165928> The selected channel is not a valid text channel.');
  }

  const verifyButton = new ButtonBuilder()
    .setCustomId(`verify_${verifiedRole.id}`)
    .setLabel('Verify')
    .setStyle(ButtonStyle.Success);

  const row = new ActionRowBuilder().addComponents(verifyButton);

  try {
    await targetChannel.send({
      content: `## Verification\nVerify yourself to get access to the server!\nOpen a support ticket if you are encountering any issues.`,
      components: [row],
    });

    await message.reply('<a:y1:1415173658237866025> Verification message sent!');
  } catch (err) {
    console.error('Failed to send verification message (prefix):', err);
    await message.reply('<:a_2:1415171126560165928> Failed to send the verification message to that channel.');
  }

  break;
}


      case 'afk': {
  const reason = args.join(' ') || 'No reason provided';
  await setUserAFK(message.member, reason);
  message.reply(`💤 You are now AFK: ${reason}`);
  break;
}

        
        case 'avatar':
        case 'av':
  const avatarTarget = args[0] ? await resolveUser(guild, args[0]) : message.author;
  
  if (!avatarTarget) {
    return await message.reply('<:x_:1377774934406987837> User not found. Please provide a valid user mention, ID, or username.');
  }

  const avatarEmbed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`${avatarTarget.displayName || avatarTarget.username}`)
    .setImage(avatarTarget.displayAvatarURL({ dynamic: true, size: 1024 }))
    .addFields(
      { name: 'User', value: `${avatarTarget.tag} (${avatarTarget.id})`, inline: true },
      { name: 'Avatar URL', value: `[Click here](${avatarTarget.displayAvatarURL({ dynamic: true, size: 1024 })})`, inline: false }
    )
    .setTimestamp();

  await message.reply({ embeds: [avatarEmbed] });
  break;
        
case 'say': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.');
  }
  const raw = message.content;
  const sayContent = raw.slice(prefix.length + commandName.length);

  if (!sayContent || sayContent.length === 0) {
    return await message.reply('<:a_2:1415171126560165928> Please provide content to say.');
  }

  await message.channel.send(sayContent);

  try {
    await message.delete();
  } catch (error) {
    console.error('Failed to delete say command message:', error);
  }
  break;
}

        
case 'case':
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.');
  }

  const caseIdToLookup = args[0];
  if (!caseIdToLookup) {
    return await message.reply('<:a_2:1415171126560165928> Please provide a case ID to lookup. Usage: `!case [case_id]`');
  }

  if (!moderationCases.has(caseIdToLookup)) {
    return await message.reply('<:a_2:1415171126560165928> Case ID not found.');
  }

  const caseData = moderationCases.get(caseIdToLookup);
  
  if (caseData.guildId !== guildId) {
    return await message.reply('<:a_2:1415171126560165928> Case ID not found in this server.');
  }

  let targetUser, moderatorUser;
  try {
    targetUser = await client.users.fetch(caseData.target);
  } catch (error) {
    targetUser = null;
  }
  
  try {
    moderatorUser = await client.users.fetch(caseData.moderator);
  } catch (error) {
    moderatorUser = null;
  }

  const targetDisplay = targetUser ? `${targetUser.tag} (${targetUser.id})` : `User ID: ${caseData.target}`;
  const moderatorDisplay = moderatorUser ? `${moderatorUser.tag} (${moderatorUser.id})` : `User ID: ${caseData.moderator}`;
  let expirationText;
if (caseData.type === 'ban') {
  expirationText = 'Permanent';
} else {
  const expirationDate = new Date(caseData.timestamp);
  expirationDate.setDate(expirationDate.getDate() + 30);
  const isExpired = new Date() > expirationDate;
  expirationText = isExpired
    ? 'Expired'
    : `<t:${Math.floor(expirationDate.getTime() / 1000)}:R>`;
}


  const caseEmbed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`${caseData.type.toUpperCase()} | Case ${caseIdToLookup}`)
    .addFields(
      { name: 'Target User', value: targetDisplay, inline: true },
      { name: 'Moderator', value: moderatorDisplay, inline: true },
      { name: 'Date', value: `<t:${Math.floor(new Date(caseData.timestamp).getTime() / 1000)}:F>`, inline: true },
      { name: 'Reason', value: caseData.reason || 'No reason provided', inline: false }
    )
    .setTimestamp();
  if (caseData.duration) {
    caseEmbed.addFields({ name: 'Duration', value: caseData.duration, inline: true });
  }
  if (caseData.proof) {
    caseEmbed.addFields({ name: 'Proof', value: caseData.proof, inline: false });
  }
  caseEmbed.addFields({ name: 'Expires', value: expirationText, inline: true });
  if (caseData.voided) {
    const voidedBy = caseData.voidedBy ? `<@${caseData.voidedBy}>` : 'Unknown';
    const voidReason = caseData.voidReason || 'No reason provided';
    const voidDate = caseData.voidTimestamp ? `<t:${Math.floor(new Date(caseData.voidTimestamp).getTime() / 1000)}:R>` : 'Unknown';
    
    caseEmbed.addFields({ 
      name: '❌ VOIDED', 
      value: `**By:** ${voidedBy}\n**Reason:** ${voidReason}\n**Date:** ${voidDate}`, 
      inline: false 
    });
    caseEmbed.setColor(0x808080);
  }

  if (caseData.appealed) {
    const appealedBy = caseData.appealedBy ? `<@${caseData.appealedBy}>` : 'Unknown';
    const appealDecision = caseData.appealDecision ? caseData.appealDecision.toUpperCase() : 'Unknown';
    const appealFeedback = caseData.appealFeedback || 'No feedback provided';
    const appealDate = caseData.appealTimestamp ? `<t:${Math.floor(new Date(caseData.appealTimestamp).getTime() / 1000)}:R>` : 'Unknown';
    
    const appealColor = caseData.appealDecision === 'accept' ? '✅' : '❌';
    caseEmbed.addFields({ 
      name: `${appealColor} APPEAL ${appealDecision}`, 
      value: `**By:** ${appealedBy}\n**Feedback:** ${appealFeedback}\n**Date:** ${appealDate}`, 
      inline: false 
    });
  }

  await message.reply({ embeds: [caseEmbed] });
  break;

      case 'purge': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.');
  }

  const amount = parseInt(args[0]);
  if (!amount || amount < 1 || amount > 10000) {
    return await message.reply('<:a_2:1415171126560165928> Please provide a valid number of messages to delete (1-10000).');
  }
  let targetUser = null;
  if (args[1]) {
    const mentionMatch = args[1].match(/^<@!?(\d+)>$/);
    if (mentionMatch) {
      targetUser = await client.users.fetch(mentionMatch[1]).catch(() => null);
    } else if (/^\d{17,19}$/.test(args[1])) {
      targetUser = await client.users.fetch(args[1]).catch(() => null);
    } else {
      targetUser = (await resolveUser(guild, args[1])) || null;
    }
    if (!targetUser) {
      return await message.reply('<:a_2:1415171126560165928> Could not resolve that user. Provide a mention, ID, or username.');
    }
  }

  try {
    if (!targetUser) {
      const deleted = await message.channel.bulkDelete(amount, true);
      const confirm = await message.channel.send(`<a:y1:1415173658237866025> Successfully deleted ${deleted.size} messages.`);
      setTimeout(() => confirm.delete().catch(() => {}), 5000);
    } else {
      const collected = [];
      let lastId = null;
      while (collected.length < amount) {
        const toFetch = 10000;
        const options = { limit: toFetch };
        if (lastId) options.before = lastId;
        const fetched = await message.channel.messages.fetch(options);
        if (fetched.size === 0) break;
        for (const m of fetched.values()) {
          if (m.author.id === targetUser.id) {
            collected.push(m);
            if (collected.length >= amount) break;
          }
        }
        lastId = fetched.last().id;
        if (fetched.size < toFetch) break;
      }

      if (collected.length === 0) {
        return await message.reply(`<:a_2:1415171126560165928> No recent messages found for ${targetUser.tag}.`);
      }
      const toDelete = collected.slice(0, 100);
      await message.channel.bulkDelete(toDelete, true);
      const confirm = await message.channel.send(`<a:y1:1415173658237866025> Deleted ${toDelete.length} message(s) from ${targetUser.tag}.`);
      setTimeout(() => confirm.delete().catch(() => {}), 5000);
    }
  } catch (err) {
    console.error('Purge error:', err);
    return await message.reply('<:a_2:1415171126560165928> An error occurred while trying to purge messages. Messages older than 14 days cannot be deleted in bulk.');
  }
  break;
}

    case 'schedulemsg':
    case 'schedule': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need Manage Messages permission to schedule messages.');
  }

  const channelMention = message.mentions.channels.first();
  if (!channelMention) {
    return await message.reply('Usage: `!schedulemsg #channel [time] {message}`');
  }
  const argsNoChannel = args.slice(1);
  const timeStr = argsNoChannel.shift();
  const content = argsNoChannel.join(' ');
  if (!timeStr || !content) {
    return await message.reply('Usage: `!schedulemsg #channel [time] {message}`');
  }

  const ms = parseDuration(newTimeStr);
if (!ms || ms < 1000) {
  return await message.reply('⚠️ Invalid duration. Use examples: `10s`, `5m`, `1h`, `2d`, `1w`, `1mo`.');
}

schedule.time = Date.now() + ms;

  const schedules = getGuildSchedules(guildId);
  const id = Date.now().toString();
  schedules.push({
    id,
    userId: message.author.id,
    channelId: channelMention.id,
    time: sendAt,
    content
  });
  scheduledMessages.set(guildId, schedules);
  await saveSchedules(guildId);

  return await message.reply(`<a:y1:1415173658237866025> Scheduled message for <#${channelMention.id}> in ${minutes} minutes.`);
}
case 'scheduledel': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need Manage Messages permission.');
  }

  const userMention = message.mentions.users.first();
  const timeStr = args.find(a => /^\d+$/.test(a));
  let schedules = getGuildSchedules(guildId);

  if (userMention) {
    schedules = schedules.filter(s => s.userId !== userMention.id);
  }
  if (timeStr) {
    const minutes = parseInt(timeStr);
    const cutoff = Date.now() + minutes * 60_000;
    schedules = schedules.filter(s => s.time > cutoff);
  }

  scheduledMessages.set(guildId, schedules);
  await saveSchedules(guildId);

  return await message.reply('<a:y1:1415173658237866025> Scheduled messages matching criteria were deleted.');
}

case 'schedulelist': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need Manage Messages permission.');
  }

  const userMention = message.mentions.users.first();
  const channelMention = message.mentions.channels.first();
  let schedules = getGuildSchedules(guildId);

  if (userMention) schedules = schedules.filter(s => s.userId === userMention.id);
  if (channelMention) schedules = schedules.filter(s => s.channelId === channelMention.id);

  if (!schedules.length) {
    return await message.reply('No scheduled messages found.');
  }

  const lines = schedules.map(s => {
    const when = `<t:${Math.floor(s.time / 1000)}:R>`;
    const user = client.users.cache.get(s.userId);
    const uname = user ? user.tag : s.userId;
    const chan = `<#${s.channelId}>`;
    return `• ${uname} → ${chan} at ${when}: ${s.content}`;
  });

  return await message.reply(lines.join('\n'));
}


case 'warn': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.');
  }

  const warnTarget = await resolveUser(guild, args[0]);
  if (!warnTarget) return await message.reply('<:a_2:1415171126560165928> Please provide a valid user (mention, ID, or username) to warn.');
  const warnMember = guild.members.cache.get(warnTarget.id) || await guild.members.fetch(warnTarget.id).catch(()=>null);
  if (warnMember && isMemberImmune(guild, warnMember, 'warn')) {
    return await message.reply('<:a_2:1415171126560165928> That user (or one of their roles) is immune to `warn`.');
  }

  const warnReason = args.slice(1).join(' ') || null;
  const warnCaseId = generateCaseId();

  moderationCases.set(warnCaseId, {
    type: 'warn',
    target: warnTarget.id,
    moderator: message.author.id,
    reason: warnReason,
    proof: null,
    timestamp: new Date(),
    voided: false,
    guildId: guildId
  });

  await saveCasesToFile(guildId);
  await logModerationAction(guild, 'warn', message.author, warnTarget, warnReason, null, warnCaseId);
  await message.reply(`<a:y1:1415173658237866025> ${warnTarget.tag} has been warned. Case ID: \`${warnCaseId}\``);
  break;
}


case 'infract': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Server" permission to use this command.');
  }

  const infractTarget = await resolveUser(guild, args[0]);
  if (!infractTarget) return await message.reply('<:a_2:1415171126560165928> Please provide a valid user (mention, ID, or username) to infract.');
  const infractMember = guild.members.cache.get(infractTarget.id) || await guild.members.fetch(infractTarget.id).catch(()=>null);
  if (infractMember && isMemberImmune(guild, infractMember, 'infract')) {
    return await message.reply('<:a_2:1415171126560165928> That user (or one of their roles) is immune to `infract`.');
  }

  const infractReason = args.slice(1).join(' ') || null;
  const infractCaseId = generateCaseId();

  moderationCases.set(infractCaseId, {
    type: 'infract',
    target: infractTarget.id,
    moderator: message.author.id,
    reason: infractReason,
    proof: null,
    timestamp: new Date(),
    voided: false,
    guildId: guildId
  });

  await saveCasesToFile(guildId);
  await logModerationAction(guild, 'infract', message.author, infractTarget, infractReason, null, infractCaseId);
  await message.reply(`<a:y1:1415173658237866025> ${infractTarget.tag} has been infracted. Case ID: \`${infractCaseId}\``);
  break;
}


case 'note': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.');
  }

  const noteTarget = await resolveUser(guild, args[0]);
  if (!noteTarget) return await message.reply('<:a_2:1415171126560165928> Please provide a valid user (mention, ID, or username) to add a note for.');
  const noteMember = guild.members.cache.get(noteTarget.id) || await guild.members.fetch(noteTarget.id).catch(()=>null);
  if (noteMember && isMemberImmune(guild, noteMember, 'note')) {
    return await message.reply('<:a_2:1415171126560165928> That user (or one of their roles) is immune to `note`.');
  }

  const noteReason = args.slice(1).join(' ') || null;
  const noteCaseId = generateCaseId();

  moderationCases.set(noteCaseId, {
    type: 'note',
    target: noteTarget.id,
    moderator: message.author.id,
    reason: noteReason,
    proof: null,
    timestamp: new Date(),
    voided: false,
    guildId: guildId
  });

  await saveCasesToFile(guildId);
  await logModerationAction(guild, 'note', message.author, noteTarget, noteReason, null, noteCaseId);
  await message.reply(`<a:y1:1415173658237866025> A note has been added for ${noteTarget.tag}. Case ID: \`${noteCaseId}\``);
  break;
}


        const noteReason = args.slice(1).join(' ') || null;
        const noteCaseId = generateCaseId();

        moderationCases.set(noteCaseId, {
          type: 'note',
          target: noteTarget.id,
          moderator: message.author.id,
          reason: noteReason,
          proof: null,
          timestamp: new Date(),
          voided: false,
          guildId: guildId
        });

        await saveCasesToFile(guildId);
        await logModerationAction(guild, 'note', message.author, noteTarget, noteReason, null, noteCaseId);
        await message.reply(`<a:y1:1415173658237866025> A note has been added for ${noteTarget.tag}. Case ID: \`${noteCaseId}\``);
        break;

case 'mute': {
  if (!member.permissions.has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers])) {
    return await message.reply('<:a_2:1415171126560165928> You need both "Manage Messages" and "Timeout Members" permissions to use this command.');
  }

  const muteTargetUser = await resolveUser(guild, args[0]);
  if (!muteTargetUser)
    return await message.reply('<:a_2:1415171126560165928> Please provide a valid user (mention, ID, or username) to mute.');

  const muteTarget = guild.members.cache.get(muteTargetUser.id);
  if (!muteTarget)
    return await message.reply('<:a_2:1415171126560165928> User not found in this server.');

  if (isMemberImmune(guild, muteTarget, 'mute')) {
    return await message.reply('<:a_2:1415171126560165928> That user (or one of their roles) is immune to `mute`.');
  }

  const durationInput = args[1];
  const muteDurationMs = parseDuration(durationInput);

  if (!muteDurationMs || muteDurationMs < 1000)
    return await message.reply('<:a_2:1415171126560165928> Please provide a valid duration. Example: `10m`, `1h`, `2d`, `1w`, etc.');

  const muteReason = args.slice(2).join(' ') || 'No reason provided';
  const muteCaseId = generateCaseId();

  if (muteTarget.id === guild.ownerId)
    return await message.reply('<:a_2:1415171126560165928> Cannot timeout the server owner.');

  if (muteTarget.user.bot)
    return await message.reply('<:a_2:1415171126560165928> Cannot timeout bots.');

  const botMember = guild.members.cache.get(client.user.id);
  if (muteTarget.roles.highest.position >= botMember.roles.highest.position) {
    return await message.reply('<:a_2:1415171126560165928> Cannot timeout this user due to role hierarchy. My role must be higher than their highest role.');
  }

  if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return await message.reply('<:a_2:1415171126560165928> I need the "Timeout Members" permission to mute users.');
  }

  try {
    await muteTarget.timeout(muteDurationMs, muteReason);
  } catch (error) {
    console.error('Mute error:', error);
    if (error.code === 50013) {
      return await message.reply('<:a_2:1415171126560165928> I don\'t have permission to timeout this user. Check my role position and permissions.');
    }
    return await message.reply('<:a_2:1415171126560165928> Failed to mute the user due to an unexpected error.');
  }

  const humanReadable = (() => {
    const units = [
      { label: 'year', ms: 1000 * 60 * 60 * 24 * 365 },
      { label: 'month', ms: 1000 * 60 * 60 * 24 * 30 },
      { label: 'week', ms: 1000 * 60 * 60 * 24 * 7 },
      { label: 'day', ms: 1000 * 60 * 60 * 24 },
      { label: 'hour', ms: 1000 * 60 * 60 },
      { label: 'minute', ms: 1000 * 60 },
    ];
    for (const u of units) {
      if (muteDurationMs >= u.ms) {
        const val = Math.round(muteDurationMs / u.ms);
        return `${val} ${u.label}${val > 1 ? 's' : ''}`;
      }
    }
    return `${Math.round(muteDurationMs / 1000)} seconds`;
  })();

  moderationCases.set(muteCaseId, {
    type: 'mute',
    target: muteTarget.user.id,
    moderator: message.author.id,
    reason: muteReason,
    proof: null,
    duration: humanReadable,
    timestamp: new Date(),
    voided: false,
    guildId: guildId
  });

  await saveCasesToFile(guildId);
  await logModerationAction(guild, 'mute', message.author, muteTarget.user, muteReason, null, muteCaseId, humanReadable);
  await message.reply(`<a:y1:1415173658237866025> ${muteTarget.user.tag} has been muted for ${humanReadable}. Case ID: \`${muteCaseId}\``);
  break;
}


      case 'kick':
        if (!member.permissions.has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers, PermissionsBitField.Flags.KickMembers])) {
          return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages", "Timeout Members", and "Kick Members" permissions to use this command.');
        }

        const kickTargetUser = await resolveUser(guild, args[0]);
if (!kickTargetUser) return await message.reply('<:a_2:1415171126560165928> Please provide a valid user (mention, ID, or username) to kick.');

const kickTarget = guild.members.cache.get(kickTargetUser.id);
if (!kickTarget) return await message.reply('<:a_2:1415171126560165928> User not found in this server.');

        const kickReason = args.slice(1).join(' ') || null;
        const kickCaseId = generateCaseId();

        await kickTarget.kick(kickReason);

        moderationCases.set(kickCaseId, {
          type: 'kick',
          target: kickTarget.user.id,
          moderator: message.author.id,
          reason: kickReason,
          proof: null,
          timestamp: new Date(),
          voided: false,
          guildId: guildId
        });

        await saveCasesToFile(guildId);
        await logModerationAction(guild, 'kick', message.author, kickTarget.user, kickReason, null, kickCaseId);
        await message.reply(`<a:y1:1415173658237866025> ${kickTarget.user.tag} has been kicked. Case ID: \`${kickCaseId}\``);
        break;

      case 'ban':
        if (!member.permissions.has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers, PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.BanMembers])) {
          return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages", "Timeout Members", "Kick Members", and "Ban Members" permissions to use this command.');
        }

       const banTarget = await resolveUser(guild, args[0]);
if (!banTarget) return await message.reply('<:a_2:1415171126560165928> Please provide a valid user (mention, ID, or username) to ban.');
        const banReason = args.slice(1).join(' ') || null;
        const banCaseId = generateCaseId();

        await guild.members.ban(banTarget, { reason: banReason });

        moderationCases.set(banCaseId, {
          type: 'ban',
          target: banTarget.id,
          moderator: message.author.id,
          reason: banReason,
          proof: null,
          timestamp: new Date(),
          voided: false,
          guildId: guildId
        });

        await saveCasesToFile(guildId);
        await logModerationAction(guild, 'ban', message.author, banTarget, banReason, null, banCaseId);
        await message.reply(`<a:y1:1415173658237866025> ${banTarget.tag} has been banned. Case ID: \`${banCaseId}\``);
        break;

case 'remindme':
case 'remind': {
  const duration = args.shift();
  const text = args.join(' ');
  if (!duration || !text) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!remindme <minutes> <text>`');
  }

  const ms = parseDuration(duration);
  if (!ms || ms < 10000) {
    return await message.reply('<:a_2:1415171126560165928> Duration must be at least 10 seconds.');
  }

  const reminderId = Math.random().toString(36).slice(2, 8);
  const remindTime = Date.now() + ms;

  const reminder = {
    id: reminderId,
    userId: message.author.id,
    text,
    timestamp: remindTime
  };

  addReminder(message.guild.id, reminder);
if (remindTime <= Date.now() + WORKER_INTERVAL_MS) {
  try {
    await message.author.send(`🔔 Reminder: ${text}`);
    removeReminder(message.guild.id, reminderId);
  } catch (err) { console.error(err); }
  return;
}

  await message.reply(
    `<a:y1:1415173658237866025> Reminder set! I'll remind you in <t:${Math.floor(remindTime / 1000)}:R>.\n**ID:** \`${reminderId}\``
  );

  break;
}


case 'reminddel': {
  const reminderId = args[0];
  if (!reminderId) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!reminddel <reminderId>`');
  }

  const list = getGuildReminders(message.guild.id);
  const reminder = list.find(r => r.id === reminderId && r.userId === message.author.id);
  if (!reminder) {
    return await message.reply('<:a_2:1415171126560165928> Reminder not found.');
  }

  removeReminder(message.guild.id, reminderId);
  await message.reply(`<a:y1:1415173658237866025> Reminder \`${reminderId}\` deleted.`);
  break;
}
case 'remindchange': {
  const reminderId = args.shift();
  const newDuration = args.shift();
  const newText = args.join(' ');

  if (!reminderId || !newDuration || !newText) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!remindchange <reminderId> <minutes> <new text>`');
  }

  const list = getGuildReminders(message.guild.id);
  const reminder = list.find(r => r.id === reminderId && r.userId === message.author.id);
  if (!reminder) {
    return await message.reply('<:a_2:1415171126560165928> Reminder not found.');
  }

  const ms = parseDuration(newDuration);
  if (!ms || ms < 10000) {
    return await message.reply('<:a_2:1415171126560165928> Duration must be at least 10 seconds.');
  }

  reminder.text = newText;
  reminder.timestamp = Date.now() + ms;

  await message.reply(
    `<a:y1:1415173658237866025> Reminder \`${reminderId}\` updated! I'll remind you in <t:${Math.floor(reminder.timestamp / 1000)}:R>.`
  );

  break;
}
case 'remindlist': {
  const list = getGuildReminders(message.guild.id).filter(r => r.userId === message.author.id);
  if (list.length === 0) {
    return await message.reply('<:a_2:1415171126560165928> You have no active reminders.');
  }

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`${message.author.username}'s Active Reminders`)
    .setDescription(
      list.map(r => `• **${r.id}** — ${r.text} *(<t:${Math.floor(r.timestamp / 1000)}:R>)*`).join('\n')
    )
    .setTimestamp();

  await message.reply({ embeds: [embed] });
  break;
}

      case 'voidcase':
        if (!member.permissions.has([PermissionsBitField.Flags.Administrator])) {
          return await message.reply('<:a_2:1415171126560165928> You need the "Administrator" permission to use this command.');
        }

        const caseId = args[0];
        if (!caseId) return await message.reply('<:a_2:1415171126560165928> Please provide a case ID to void.');

        const voidReason = args.slice(1).join(' ') || null;

        if (!moderationCases.has(caseId)) {
          return await message.reply('<:a_2:1415171126560165928> Case ID not found.');
        }

        const moderationCase = moderationCases.get(caseId);
        if (moderationCase.voided) {
          return await message.reply('<:a_2:1415171126560165928> This case has already been voided.');
        }

        moderationCase.voided = true;
        moderationCase.voidedBy = message.author.id;
        moderationCase.voidReason = voidReason;
        moderationCase.voidTimestamp = new Date();

        await saveCasesToFile(guildId);
        const modlogChannelId = getServerLoggingChannel(guildId, 'modlogs');
        const logChannel = modlogChannelId ? guild.channels.cache.get(modlogChannelId) : null;
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`CASE VOIDED | Case \`${caseId}\``)
            .addFields(
              { name: 'Original Action', value: moderationCase.type.toUpperCase(), inline: true },
              { name: 'Voided By', value: `${message.author.tag} (${message.author.id})`, inline: true },
              { name: 'Void Reason', value: voidReason || 'No reason provided', inline: false }
            )
            .setTimestamp();

          await logChannel.send({ embeds: [embed] });
        }

        await message.reply(`<a:y1:1415173658237866025> Case \`${caseId}\` has been voided.`);
        break;

      case 'cases':
  
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.');
  }

  if (args[0] && args[0].toLowerCase() === 'all') {
    const page = parseInt(args[1]) || 1;
    const result = getAllGuildCases(guildId, page, 10);
    
    if (result.cases.length === 0) {
      return await message.reply('<a:y1:1415173658237866025> No moderation cases found for this server.');
    }

    const casesEmbed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle(`All Moderation Cases - Page ${result.page}/${result.totalPages}`)
      .setDescription(`Found ${result.total} total case(s):`)
      .setTimestamp();

    result.cases.forEach((caseData) => {
      const targetUser = client.users.cache.get(caseData.target);
      const targetDisplay = targetUser ? `${targetUser.tag} (${targetUser.id})` : `User ID: ${caseData.target}`;
      
      const expirationText = (caseData.type === 'kick' || caseData.type === 'ban')
        ? 'Permanent'
        : `<t:${Math.floor((new Date(caseData.timestamp).getTime() + (30 * 24 * 60 * 60 * 1000)) / 1000)}:R>`;

      casesEmbed.addFields({
        name: `${caseData.type.toUpperCase()} | Case \`${caseData.caseId}\``,
        value: `**Target:** ${targetDisplay}\n**Reason:** ${caseData.reason || 'No reason provided'}\n**Date:** <t:${Math.floor(new Date(caseData.timestamp).getTime() / 1000)}:R>\n**Expires:** ${expirationText}`,
        inline: false
      });
    });

    if (result.totalPages > 1) {
      casesEmbed.setFooter({ text: `Use "${getServerPrefix(guildId)}cases all ${result.page + 1}" for next page` });
    }

    await message.reply({ embeds: [casesEmbed] });
  } else {
    const casesTarget = await resolveUser(guild, args[0]);
    if (!casesTarget) return await message.reply('<:a_2:1415171126560165928> Please provide a valid user (mention, ID, or username) to check cases for, or use "all" to see all server cases.');

    const activeCases = getActiveCases(casesTarget.id, guildId);

    if (activeCases.length === 0) {
      return await message.reply(`<a:y1:1415173658237866025> ${casesTarget.tag} has no active moderation cases.`);
    }

    const casesEmbed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle(`Active Cases for ${casesTarget.tag}`)
      .setDescription(`Found ${activeCases.length} active case(s):`)
      .setTimestamp();

    activeCases.forEach((activeCase) => {
      const expirationText = (activeCase.type === 'kick' || activeCase.type === 'ban')
        ? 'Permanent'
        : `<t:${Math.floor((new Date(activeCase.timestamp).getTime() + (30 * 24 * 60 * 60 * 1000)) / 1000)}:R>`;

      casesEmbed.addFields({
        name: `${activeCase.type.toUpperCase()} | Case \`${activeCase.caseId}\``,
        value: `**Reason:** ${activeCase.reason || 'No reason provided'}\n**Date:** <t:${Math.floor(new Date(activeCase.timestamp).getTime() / 1000)}:R>\n**Expires:** ${expirationText}`,
        inline: false
      });
    });

    await message.reply({ embeds: [casesEmbed] });
  }
  break;
      case 'about':
        const aboutEmbed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle(aboutInfo.title)
          .setDescription(aboutInfo.description)
          .addFields(
            { name: 'Version', value: aboutInfo.version, inline: true },
            { name: 'Author', value: aboutInfo.author, inline: true },
            { name: 'Support Server', value: aboutInfo.supportServer, inline: false },
            { name: 'Website', value: aboutInfo.website, inline: false },
            { name: 'Features', value: aboutInfo.features.map(f => `• ${f}`).join('\n'), inline: false }
          )
          .setTimestamp();

        await message.reply({ embeds: [aboutEmbed] });
        break;


case 'cmds':
case 'commands': {
  const helpEmbed = buildHelpEmbed(guildId);
  await message.reply({ embeds: [helpEmbed] });
  break;
}
        case 'help':
        const helpReply = await message.reply('***Support/help server for cap***\n\n> https://discord.gg/PfCC7Y2tXH\n\n***Website***\n\n> <https://sites.google.com/view/capitanfunny/discord-bot-developer?authuser=0>');
        break;

            
      case 'ping': {
  const sent = await message.reply('Pong! Calculating raw response time...');
  const rawLatency = sent.createdTimestamp - message.createdTimestamp;
  await sent.edit(`Pong!\n• Raw response time: **${rawLatency}ms**\n• Measuring edit roundtrip...`);
  const editStart = Date.now();
  await sent.edit(`Pong!\n• Raw response time: **${rawLatency}ms**\n• Edit roundtrip: measuring...`);
  const editLatency = Date.now() - editStart;
  await sent.edit(
    `Pong!\n` +
    `• Raw response time: **${rawLatency}ms**\n` +
    `• Edit roundtrip: **${editLatency}ms**\n` +
    `• WebSocket ping: **${Math.round(client.ws.ping)}ms**`
  );
  break;
}
      case 'status': {
  try {
    const uptimeMs = Date.now() - (client.readyTimestamp || Date.now());
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimePretty = `${days}d ${hours}h ${minutes}m ${seconds}s`;
    let totalUsers = 0;
    for (const g of client.guilds.cache.values()) {
      if (typeof g.memberCount === 'number') totalUsers += g.memberCount;
    }

    const mem = process.memoryUsage();
    const memMb = (mem.rss / 1024 / 1024).toFixed(1);

    const statusEmbed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Bot Status — Live Check')
      .addFields(
        { name: 'Uptime', value: uptimePretty, inline: true },
        { name: 'Guilds', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Users (cached total)', value: `${totalUsers}`, inline: true },
        { name: 'WebSocket Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
        { name: 'Memory (RSS)', value: `${memMb} MB`, inline: true },
        { name: 'Node.js', value: process.version, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `Bot: ${client.user ? client.user.tag : 'unknown'}` });
    const statusReply = await message.reply({ embeds: [statusEmbed] });
    setTimeout(() => {
      statusReply.delete().catch(() => {});
    }, 30000);
  } catch (err) {
    console.error('Status command failed:', err);
    await message.reply('<:a_2:1415171126560165928> Failed to gather status information.');
  }
  break;
}
        
        case 'support':
        const supportReply = await message.reply('***Support Server for cap***\n\n> https://discord.gg/PfCC7Y2tXH\n\n***Website***\n\n> https://sites.google.com/view/capitanfunny/discord-bot-developer?authuser=0');
        break;

      case 'appeal':
        if (!member.permissions.has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers, PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.BanMembers])) {
          return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages", "Timeout Members", "Kick Members", and "Ban Members" permissions to use this command.');
        }

        const appealCaseId = args[0];
        const appealDecision = args[1]?.toLowerCase();
        const appealFeedback = args.slice(2).join(' ');

        if (!appealCaseId || !appealDecision || !appealFeedback) {
          return await message.reply('<:a_2:1415171126560165928> Usage: `!appeal [case_id] [accept/deny] [feedback]`');
        }

        if (appealDecision !== 'accept' && appealDecision !== 'deny') {
          return await message.reply('<:a_2:1415171126560165928> Decision must be either "accept" or "deny".');
        }

        if (!moderationCases.has(appealCaseId)) {
          return await message.reply('<:a_2:1415171126560165928> Case ID not found.');
        }

        const appealCase = moderationCases.get(appealCaseId);
        appealCase.appealed = true;
        appealCase.appealDecision = appealDecision;
        appealCase.appealFeedback = appealFeedback;
        appealCase.appealTimestamp = new Date();
        appealCase.appealedBy = message.author.id;

        await saveCasesToFile(guildId);

        const appealTarget = await client.users.fetch(appealCase.target).catch(() => null);

        if (!appealTarget) {
          return await message.reply('<:a_2:1415171126560165928> Could not find the user for this case.');
        }
        try {
          const appealEmbed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(appealDecision === 'accept' ? '<:a_3:1415171233447678002> Appeal Accepted' : '<:a_1:1415171153156374589> Appeal Denied')
            .addFields(
              { name: 'Case ID', value: appealCaseId, inline: true },
              { name: 'Decision', value: appealDecision === 'accept' ? 'ACCEPTED' : 'DENIED', inline: true },
              { name: 'Moderator Feedback', value: appealFeedback, inline: false }
            )
            .setFooter({ text: 'This appeal has been reviewed. No further action required.' })
            .setTimestamp();

          await appealTarget.send({ embeds: [appealEmbed] });
          const modlogChannelId = getServerLoggingChannel(guildId, 'modlogs');
          const logChannel = modlogChannelId ? guild.channels.cache.get(modlogChannelId) : null;
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(0xFFFFFF)
              .setTitle(`APPEAL ${appealDecision.toUpperCase()} | Case \`${appealCaseId}\``)
              .addFields(
                { name: 'Original Action', value: appealCase.type.toUpperCase(), inline: true },
                { name: 'Target User', value: `${appealTarget.tag} (${appealTarget.id})`, inline: true },
                { name: 'Decision', value: appealDecision.toUpperCase(), inline: true },
                { name: 'Moderator', value: `${message.author.tag} (${message.author.id})`, inline: true },
                { name: 'Feedback', value: appealFeedback, inline: false }
              )
              .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] });
          }

          await message.reply(`<a:y1:1415173658237866025> Appeal for case \`${appealCaseId}\` has been ${appealDecision}ed. The user has been notified.`);
        } catch (error) {
          console.error('Appeal DM error:', error);
          await message.reply(`<a:y1:1415173658237866025> Appeal for case \`${appealCaseId}\` has been ${appealDecision}ed, but failed to send DM to the user.`);
        }
        break;
case 'setproof': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.');
  }

  const caseId = args.shift();
  const proofText = args.join(' ');

  if (!caseId || !proofText) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!setproof <case_id> <proof text>`');
  }

  if (!moderationCases.has(caseId)) {
    return await message.reply('<:a_2:1415171126560165928> Case ID not found.');
  }

  const caseData = moderationCases.get(caseId);

  if (caseData.guildId !== guildId) {
    return await message.reply('<:a_2:1415171126560165928> That case does not belong to this server.');
  }
  caseData.proof = proofText;
  moderationCases.set(caseId, caseData);
  try {
    await saveCasesToFile(guildId);
  } catch (err) {
    console.error('Failed to save cases after setproof:', err);
    await message.reply('<:a_2:1415171126560165928> Failed to save the case to disk. Proof updated in memory.');
  }
  try {
    const modlogChannelId = getServerLoggingChannel(guildId, 'modlogs');
    const logChannel = modlogChannelId ? message.guild.channels.cache.get(modlogChannelId) : null;
    if (logChannel && logChannel.isTextBased()) {
      const embed = new EmbedBuilder()
        .setColor(0xFFFFFF)
        .setTitle(`PROOF UPDATED | Case \`${caseId}\``)
        .addFields(
          { name: 'Case ID', value: caseId, inline: true },
          { name: 'Updated By', value: `${message.author.tag} (${message.author.id})`, inline: true },
          { name: 'Target', value: `${caseData.target}`, inline: true },
          { name: 'New Proof', value: proofText.length > 1024 ? proofText.slice(0, 1020) + '...' : proofText, inline: false }
        )
        .setTimestamp();

      await logChannel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error('Failed to send modlog for setproof:', err);
  }

  await message.reply(`<a:y1:1415173658237866025> Proof for case \`${caseId}\` updated successfully.`);
  break;
}


    case 'set': {
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return await message.reply('<:a_2:1415171126560165928> You need the "Administrator" permission to use this command.');
  }

  const logType = args.shift()?.toLowerCase();
  const channelArg = args.shift();

  if (!logType || !channelArg) {
    return await message.reply('<:a_2:1415171126560165928> Usage: `!set <modlogs|all.logs|verification.logs> <#channel|channelId|channelName>`');
  }

  if (!['modlogs', 'all.logs', 'verification.logs'].includes(logType)) {
    return await message.reply('<:a_2:1415171126560165928> Invalid log type. Valid types: modlogs, all.logs, verification.logs');
  }
  let channel = message.mentions.channels.first() || message.guild.channels.cache.get(channelArg.replace(/[<#>]/g, ''));

  if (!channel) {
    const remaining = [channelArg, ...args].join(' ');
    channel = message.guild.channels.cache.find(c => c.name.toLowerCase() === remaining.toLowerCase());
  }

  if (!channel) {
    return await message.reply('<:a_2:1415171126560165928> Could not find the specified channel. Use a mention, ID, or exact channel name.');
  }

  try {
    const logTypeForStorage = (logType === 'all.logs') ? 'alllogs' : logType;
    await setServerLoggingChannelPersist(guildId, logTypeForStorage, channel.id);
    return await message.reply(`<a:y1:1415173658237866025> ${logType} will now be sent to ${channel}`);
  } catch (err) {
    console.error('Prefix set command error:', err);
    return await message.reply('<:a_2:1415171126560165928> Failed to apply settings. Check my permissions and that the bot can access the channel.');
  }
      break;
}



      case 'prefix':
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return await message.reply('<:a_2:1415171126560165928> You need the "Administrator" permission to use this command.');
        }

        const newPrefix = args[0];
        if (!newPrefix) {
          const currentPrefix = getServerPrefix(guildId);
          return await message.reply(`<a:y1:1415173658237866025> Current server prefix is: \`${currentPrefix}\`\nUsage: \`${currentPrefix}prefix <new_prefix>\``);
        }

        if (newPrefix.length > 5) {
          return await message.reply('<:a_2:1415171126560165928> Prefix cannot be longer than 5 characters.');
        }

        await setServerPrefix(guildId, newPrefix);
        await message.reply(`<a:y1:1415173658237866025> Server prefix has been changed to: \`${newPrefix}\``);
        break;
        
        default:
  const reply = await message.reply('Command not found!\n-# Ensure you spell the command correctly.');
  setTimeout(() => {
    reply.delete().catch(() => {});
  }, 15000);
  break;

    }
  } catch (error) {
    console.error('Prefix command error:', error);
    await message.reply('<:a_2:1415171126560165928> An error occurred while executing this command.');
  }
});

// ============================================================================
// Slash Command Handler 6/10
// ============================================================================
client.on(Events.AutoModerationActionExecution, async (action) => {
  try {
    const { guild, user, ruleTriggerType, action: actionData, matchedKeyword, matchedContent, channel, ruleId } = action;

    const guildConfig = serverAutomodConfig.get(guild.id) || { rules: {} };
    const ruleConfig = guildConfig.rules[ruleId];

    if (!ruleConfig || !ruleConfig.punishment || ruleConfig.punishment === 'none') {
      return;
    }

    const punishment = ruleConfig.punishment;
    const reason = `AutoMod: Rule "${actionData.autoModerationRuleName}" triggered (matched: "${matchedKeyword || 'content filter'}")`;
    const caseId = generateCaseId();

    switch (punishment) {
      case 'note': {
        moderationCases.set(caseId, {
          type: 'note',
          target: user.id,
          moderator: client.user.id,
          reason: reason,
          proof: `AutoMod Rule ID: ${ruleId}`,
          timestamp: new Date(),
          voided: false,
          guildId: guild.id
        });
        await saveCasesToFile(guild.id);
        await logModerationAction(guild, 'note', client.user, user, reason, `AutoMod Rule: ${ruleId}`, caseId);
        break;
      }

      case 'warn': {
        moderationCases.set(caseId, {
          type: 'warn',
          target: user.id,
          moderator: client.user.id,
          reason: reason,
          proof: `AutoMod Rule ID: ${ruleId}`,
          timestamp: new Date(),
          voided: false,
          guildId: guild.id
        });
        await saveCasesToFile(guild.id);
        await logModerationAction(guild, 'warn', client.user, user, reason, `AutoMod Rule: ${ruleId}`, caseId);
        break;
      }

      case 'kick': {
        const member = guild.members.cache.get(user.id);
        if (member && member.kickable) {
          await member.kick(reason);
          moderationCases.set(caseId, {
            type: 'kick',
            target: user.id,
            moderator: client.user.id,
            reason: reason,
            proof: `AutoMod Rule ID: ${ruleId}`,
            timestamp: new Date(),
            voided: false,
            guildId: guild.id
          });
          await saveCasesToFile(guild.id);
          await logModerationAction(guild, 'kick', client.user, user, reason, `AutoMod Rule: ${ruleId}`, caseId);
        }
        break;
      }

      case 'ban': {
        const member = guild.members.cache.get(user.id);
        if (member && member.bannable) {
          await guild.members.ban(user.id, { reason: reason });
          moderationCases.set(caseId, {
            type: 'ban',
            target: user.id,
            moderator: client.user.id,
            reason: reason,
            proof: `AutoMod Rule ID: ${ruleId}`,
            timestamp: new Date(),
            voided: false,
            guildId: guild.id
          });
          await saveCasesToFile(guild.id);
          await logModerationAction(guild, 'ban', client.user, user, reason, `AutoMod Rule: ${ruleId}`, caseId);
        }
        break;
      }
    }

    const allLogsChannelId = getServerLoggingChannel(guild.id, 'alllogs');
    if (allLogsChannelId) {
      const logChannel = guild.channels.cache.get(allLogsChannelId);
      if (logChannel) {
        const embed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle('🚨 AutoMod Action Executed')
          .addFields(
            { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
            { name: 'Channel', value: `<#${channel.id}>`, inline: true },
            { name: 'Rule', value: actionData.autoModerationRuleName, inline: true },
            { name: 'Matched', value: matchedKeyword || 'Content filter', inline: true },
            { name: 'Punishment', value: punishment.toUpperCase(), inline: true },
            { name: 'Case ID', value: caseId, inline: true }
          )
          .setTimestamp();
        await logChannel.send({ embeds: [embed] });
      }
    }
  } catch (err) {
    console.error('Failed to execute automod punishment:', err);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (interaction.replied || interaction.deferred) return;
  if (interaction.isButton() && interaction.customId.startsWith('verify_')) {
    await interaction.deferReply({ flags: 64 });
    const accountAgeMs = Date.now() - interaction.user.createdAt.getTime();
    const minAgeMs = 7 * 24 * 60 * 60 * 1000;
    if (accountAgeMs < minAgeMs) {
      return await interaction.editReply('<:a_1:1415171153156374589> Your account must be at least **7 days old** to verify.');
    }
    const verifiedRoleId = interaction.customId.split('_')[1];
    if (!verifiedRoleId) {
      return await interaction.editReply('<:a_1:1415171153156374589> Verification role ID is missing from the button. Please contact a server admin.');
    }

    const role = interaction.guild.roles.cache.get(verifiedRoleId);
    if (!role) {
      return await interaction.editReply('<:a_2:1415171126560165928> The configured verification role no longer exists.');
    }

    try {
      if (interaction.member.roles.cache.has(role.id)) {
        return await interaction.editReply('<a:y1:1415173658237866025> You are already verified!');
      }
      await interaction.member.roles.add(role);
    } catch (err) {
      console.error('Failed to add verified role:', err);
      return await interaction.editReply('<:a_1:1415171153156374589> Failed to add the verified role. Check my permissions and role hierarchy.');
    }

    try {
      const logChannelId = getServerLoggingChannel(interaction.guild.id, 'verification.logs');
      if (logChannelId) {
        const logChannel = interaction.guild.channels.cache.get(logChannelId);
        if (logChannel && logChannel.isTextBased()) {
          await logChannel.send(`<a:y1:1415173658237866025> <@${interaction.user.id}> was verified.`);
        }
      }
    } catch (err) {
      console.error('Failed to post verification log:', err);
    }
    
    return await interaction.editReply('<a:y1:1415173658237866025> You have been verified!');
  }

  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'reset') {
  if (interaction.user.id !== interaction.guild.ownerId)
    return interaction.reply({ content: '❌ Only the **server owner** can use this command.', ephemeral: true });

  const sub = interaction.options.getString('action');
  if (sub === 'authorize') {
    const ok = await resetGuildData(interaction.guild.id);
    if (ok) {
      return interaction.reply({ content: '✅ All server data has been reset successfully.' });
    } else {
      return interaction.reply({ content: '❌ Failed to reset server data. Check logs for details.' });
    }
  }

  return interaction.reply({ content: '⚠️ Type `reset authorize` to confirm full server reset. This will permanently erase all bot data for this server.' });
}

  const commandName = interaction.commandName;
  const member = interaction.member;
  const guild = interaction.guild;
  const guildId = guild ? guild.id : null;


  try {
    const cooldownCheck = checkCooldown(interaction.user.id, commandName);
    if (cooldownCheck.onCooldown) {
      const cooldownReply = await interaction.reply({ 
        content: `⏱️ You're on cooldown! Please wait ${cooldownCheck.timeLeft} more seconds before using this command again.`, 
        flags: 64 
      });
      setTimeout(() => {
        cooldownReply.delete().catch(() => {});
      }, cooldownCheck.timeLeft * 1000);
      return;
    }

    switch (commandName) {
      case 'verification': {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
            return interaction.reply({ content: 'You need Administrator.', flags: 64 });
        }

        const verifiedRole = interaction.options.getRole('verifiedrole', true);
        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        if (!verifiedRole) {
          return await interaction.reply({ content: '❌ You must supply a verified role.', flags: 64 });
        }
        if (!targetChannel || !targetChannel.isTextBased()) {
          return await interaction.reply({ content: '❌ The selected channel is not a valid text channel.', flags: 64 });
        }

        const verifyButton = new ButtonBuilder()
          .setCustomId(`verify_${verifiedRole.id}`)
          .setLabel('Verify')
          .setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(verifyButton);

        try {
          await targetChannel.send({
            content: `## Verification\nVerify yourself to get access to the server!\nOpen a support ticket if you are encountering any issues.`,
            components: [row],
          });

          return await interaction.reply({ content: `<a:y1:1415173658237866025> Verification message sent in ${targetChannel}`, flags: 64 });
        } catch (err) {
          console.error('Failed to send verification message (slash):', err);
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Failed to send the verification message to that channel.', flags: 64 });
        }
      }

      case 'membercount': {
        const guild = interaction.guild;
        const total = guild.memberCount;

        const embed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle(`Member Count — ${guild.name}`)
          .addFields(
            { name: 'Total Members', value: `${total}`, inline: true },
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed] });
        break;
      }


      case 'automod': {

  const member = interaction.member;
  if (!member || !member.permissions || !member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Administrator" permission to use this command.', flags: 64 });
    break;
  }

  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: '<:a_2:1415171126560165928> This command must be used in a server.', flags: 64 });
    break;
  }

  const guildId = guild.id;

  let sub;
  try {
    sub = interaction.options.getSubcommand();
  } catch (e) {
    await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide a valid subcommand (create/delete/assign/view).', flags: 64 });
    break;
  }

  const guildConfig = serverAutomodConfig.get(guildId) || { rules: {} };
  if (!guildConfig.rules) guildConfig.rules = {};

  try {
    switch (sub) {
      case 'create': {
        const name = interaction.options.getString('name');
        if (!name) {
          await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide a rule name.', flags: 64 });
          break;
        }
        const rule = await guild.autoModerationRules.create({
          name,
          eventType: 1,
          triggerType: 1,
          triggerMetadata: { keywordFilter: ['example_block'] },
          actions: [{
            type: 1,
            metadata: { customMessage: 'Your message was blocked by AutoMod.' }
          }],
          enabled: true
        }).catch(err => {
          console.error('AutoMod create error:', err);
          return null;
        });

        if (!rule) {
          await interaction.reply({ content: '<:a_2:1415171126560165928> Failed to create AutoMod rule. Check my permissions and guild settings.', flags: 64 });
          break;
        }

        guildConfig.rules[rule.id] = {
          id: rule.id,
          name,
          punishment: 'none',
          createdBy: interaction.user.id,
          createdAt: new Date().toISOString()
        };
        serverAutomodConfig.set(guildId, guildConfig);
        await saveAutomodConfig(guildId);

        await interaction.reply({
          content: `<a:y1:1415173658237866025> AutoMod rule **${name}** created with ID \`${rule.id}\`. Use \`/automod assign rule_id:${rule.id} punishment:<type>\` to assign a punishment.`,
          flags: 64
        });
        break;
      }

      case 'delete': {
        const ruleId = interaction.options.getString('rule_id');
        if (!ruleId) {
          await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide a rule ID to delete.', flags: 64 });
          break;
        }

        const existingRule = await guild.autoModerationRules.fetch(ruleId).catch(() => null);
        if (!existingRule) {
          await interaction.reply({ content: '<:a_2:1415171126560165928> Rule not found.', flags: 64 });
          break;
        }

        try {
          if (existingRule && typeof existingRule.delete === 'function') {
            await existingRule.delete();
          }
        } catch (err) {
          console.error('Failed deleting automod rule:', err);
        }

        if (guildConfig.rules[ruleId]) {
          delete guildConfig.rules[ruleId];
          serverAutomodConfig.set(guildId, guildConfig);
          await saveAutomodConfig(guildId);
        }

        await interaction.reply({ content: `<a:y1:1415173658237866025> AutoMod rule deleted successfully.`, flags: 64 });
        break;
      }

      case 'assign': {
        const ruleId = interaction.options.getString('rule_id');
        const punishment = interaction.options.getString('punishment');

        if (!ruleId || !punishment) {
          await interaction.reply({ content: '<:a_2:1415171126560165928> Usage: /automod assign rule_id:<id> punishment:<none|note|warn|kick|ban>', flags: 64 });
          break;
        }

        const existingRule = await guild.autoModerationRules.fetch(ruleId).catch(() => null);
        if (!existingRule) {
          await interaction.reply({ content: '<:a_2:1415171126560165928> Rule not found.', flags: 64 });
          break;
        }

        const allowed = ['none','note','warn','kick','ban'];
        if (!allowed.includes(punishment)) {
          await interaction.reply({ content: `<:a_2:1415171126560165928> Punishment must be one of: ${allowed.join(', ')}.`, flags: 64 });
          break;
        }

        if (!guildConfig.rules[ruleId]) {
          guildConfig.rules[ruleId] = {
            id: ruleId,
            name: existingRule.name || 'Unnamed Rule',
            punishment: 'none',
            createdBy: interaction.user.id,
            createdAt: new Date().toISOString()
          };
        }

        guildConfig.rules[ruleId].punishment = punishment;
        guildConfig.rules[ruleId].assignedBy = interaction.user.id;
        guildConfig.rules[ruleId].assignedAt = new Date().toISOString();
        serverAutomodConfig.set(guildId, guildConfig);
        await saveAutomodConfig(guildId);

        await interaction.reply({ content: `<a:y1:1415173658237866025> Punishment **${punishment}** assigned to rule **${existingRule.name || ruleId}**.`, flags: 64 });
        break;
      }

      case 'view': {
        const rules = await guild.autoModerationRules.fetch().catch(() => null);
        if (!rules || rules.size === 0) {
          await interaction.reply({ content: 'No AutoMod rules configured for this server.', flags: 64 });
          break;
        }

        const embed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle('🤖 AutoMod Configuration')
          .setDescription('Current AutoMod rules and their punishments:')
          .setTimestamp();

        for (const rule of rules.values()) {
          const config = (guildConfig.rules || {})[rule.id];
          const punishment = config?.punishment || 'none';
          const assignedBy = config?.assignedBy ? `<@${config.assignedBy}>` : 'Not set';

          const triggerInfo = [];
          if (rule.triggerType === 1) triggerInfo.push('Keyword Filter');
          if (rule.triggerType === 3) triggerInfo.push('Spam Detection');
          if (rule.triggerType === 4) triggerInfo.push('Keyword Preset');
          if (rule.triggerType === 5) triggerInfo.push('Mention Spam');

          embed.addFields({
            name: `${rule.enabled ? '✅' : '❌'} ${rule.name}`,
            value: `**ID:** \`${rule.id}\`\n**Type:** ${triggerInfo.join(', ') || 'Unknown'}\n**Punishment:** ${punishment}\n**Assigned By:** ${assignedBy}`,
            inline: false
          });
        }

        await interaction.reply({ embeds: [embed], flags: 64 });
        break;
      }

      default: {
        await interaction.reply({ content: '<:a_2:1415171126560165928> Unknown subcommand.', flags: 64 });
        break;
      }
    }
  } catch (err) {
    console.error('automod case error:', err);
    if (!interaction.replied) {
      await interaction.reply({ content: '<:a_2:1415171126560165928> Something went wrong while handling the automod command.', flags: 64 });
    }
  }
  break;
}


      case 'role': {
        if (!guild) {
            return await interaction.reply({
            content: '<:a_2:1415171126560165928> This command can only be used inside a server.',
            flags: 64
            });
        }

        if (!member.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
            return await interaction.reply({
            content: '<:a_2:1415171126560165928> You need the "Manage Roles" permission to use this command.',
            flags: 64
            });
        }

        const action = interaction.options.getString('action')?.toLowerCase();
        const targetMember = interaction.options.getMember('user');
        const roleArg = interaction.options.getRole('role');

        if (!action || !['add','remove'].includes(action)) {
            return await interaction.reply({
            content: '<:a_2:1415171126560165928> Action must be either "add" or "remove".',
            flags: 64
            });
        }

        if (!targetMember || !roleArg) {
            return await interaction.reply({
            content: '<:a_2:1415171126560165928> Could not find the target user or role.',
            flags: 64
            });
        }

        const executorHighest = member.roles.highest;
        const botMember = guild.members.cache.get(client.user.id);
        const botHighest = botMember.roles.highest;

        if (roleArg.position >= executorHighest.position) {
            return await interaction.reply({
            content: '<:a_2:1415171126560165928> You cannot manage a role equal or higher than your highest role.',
            flags: 64
            });
        }

        if (roleArg.position >= botHighest.position) {
            return await interaction.reply({
            content: '<:a_2:1415171126560165928> I cannot manage that role because it is equal or higher than my highest role.',
            flags: 64
            });
        }

        try {
            if (action === 'add') {
            if (targetMember.roles.cache.has(roleArg.id)) {
                return await interaction.reply({
                content: '<:a_2:1415171126560165928> User already has that role.',
                flags: 64
                });
            }
            await targetMember.roles.add(roleArg.id);
            await interaction.reply({
                content: `<a:y1:1415173658237866025> Role ${roleArg.name} has been added to ${targetMember.user.tag}.`,
                flags: 64
            });
            } else {
            if (!targetMember.roles.cache.has(roleArg.id)) {
                return await interaction.reply({
                content: '<:a_2:1415171126560165928> User does not have that role.',
                flags: 64
                });
            }
            await targetMember.roles.remove(roleArg.id);
            await interaction.reply({
                content: `<a:y1:1415173658237866025> Role ${roleArg.name} has been removed from ${targetMember.user.tag}.`,
                flags: 64
            });
            }
        } catch (err) {
            console.error('Role command error:', err);
            await interaction.reply({
            content: '<:a_2:1415171126560165928> Failed to modify role. Check my permissions and role hierarchy.',
            flags: 64
            });
        }
        break;
        }

  case 'remindme':
  case 'remind': {
      const duration = options.getString('duration');
      const text = options.getString('text');

      const ms = parseDuration(duration);
      if (!ms || ms < 10000) {
        return await interaction.reply({ content: 'Duration must be at least 10 seconds.', flags: 64 });
      }

      const reminderId = Math.random().toString(36).slice(2, 8);
      const remindTime = Date.now() + ms;

      const reminder = { id: reminderId, userId: user.id, text, timestamp: remindTime };
      addReminder(guild.id, reminder);
if (remindTime <= Date.now() + WORKER_INTERVAL_MS) {
  try {
    await message.author.send(`🔔 Reminder: ${text}`);
    removeReminder(message.guild.id, reminderId);
  } catch (err) { console.error(err); }
  return;
}

      await interaction.reply({
        content: `<a:y1:1415173658237866025> Reminder set! I'll remind you in <t:${Math.floor(remindTime / 1000)}:R>.\n**ID:** \`${reminderId}\``,
        flags: 64
      });
      break;
    }


case 'reminddel': {
      const reminderId = options.getString('id');
      const list = getGuildReminders(guild.id);
      const reminder = list.find(r => r.id === reminderId && r.userId === user.id);
      if (!reminder) {
        return await interaction.reply({ content: 'Reminder not found.', flags: 64 });
      }
      removeReminder(guild.id, reminderId);
      await interaction.reply({ content: `Reminder \`${reminderId}\` deleted.`, flags: 64 });
      break;
    }
case 'remindchange': {
      const reminderId = options.getString('id');
      const newDuration = options.getString('duration');
      const newText = options.getString('text');

      const list = getGuildReminders(guild.id);
      const reminder = list.find(r => r.id === reminderId && r.userId === user.id);
      if (!reminder) {
        return await interaction.reply({ content: 'Reminder not found.', flags: 64 });
      }

      const ms = parseDuration(newDuration);
      if (!ms || ms < 10000) {
        return await interaction.reply({ content: 'Duration must be at least 10 seconds.', flags: 64 });
      }

      reminder.text = newText;
      reminder.timestamp = Date.now() + ms;

      await interaction.reply({
        content: `Reminder \`${reminderId}\` updated! I'll remind you in <t:${Math.floor(reminder.timestamp / 1000)}:R>.`,
        flags: 64
      });

      setTimeout(async () => {
        try {
          await user.send(`<:a_2:1415171126560165928> Reminder: ${reminder.text}`);
          removeReminder(guild.id, reminderId);
        } catch (err) {
          console.error('Failed to DM reminder:', err);
        }
      }, ms);
      break;
    }
case 'remindlist': {
      const list = getGuildReminders(guild.id).filter(r => r.userId === user.id);
      if (list.length === 0) {
        return await interaction.reply({ content: 'You have no active reminders.', flags: 64 });
      }

      const desc = list.map(r => `• **${r.id}** — ${r.text} *(<t:${Math.floor(r.timestamp / 1000)}:R>)*`).join('\n');
      const embed = new EmbedBuilder().setColor(0xFFFFFF).setTitle(`${user.username}'s Active Reminders`).setDescription(desc).setTimestamp();

      await interaction.reply({ embeds: [embed], flags: 64 });
      break;
    }


      case 'debug': {
        const cmd = interaction.options.getString('command')?.toLowerCase();

        if (!cmd) {
          const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle('Available debug commands')
            .setDescription(Object.keys(debugInfo).map(k => `• **${k}** — ${debugInfo[k].desc}`).join('\n'))
            .setTimestamp();
          return await interaction.reply({ embeds: [embed], flags: 64 });
        }

        const info = debugInfo[cmd];
        if (!info) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Unknown command for debug.', flags: 64 });
        }

        let testResult = { status: '⚠️ Not implemented', details: 'No self-test available.' };
        if (info.test) testResult = await info.test(interaction);

        const embed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle(`Debug — ${cmd}`)
          .addFields(
            { name: 'Description', value: info.desc, inline: false },
            { name: 'Permissions', value: info.perms || 'None', inline: true },
            { name: 'Usage', value: info.usage || 'N/A', inline: true },
            { name: 'Self-Test', value: `${testResult.status}\n${testResult.details}`, inline: false }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed], flags: 64 });
        break;
      }


      case 'editcase': {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Server" permission to use this command.', flags: 64 });
        }

        const caseId = interaction.options.getString('case_id');
        const field = interaction.options.getString('field')?.toLowerCase();
        const newValue = interaction.options.getString('new_value');

        if (!caseId || !field || !newValue) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> All parameters are required: case_id, field, and new_value', flags: 64 });
        }

        if (!moderationCases.has(caseId)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Case ID not found.', flags: 64 });
        }

        const caseData = moderationCases.get(caseId);

        if (caseData.guildId !== guildId) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> This case does not belong to this server.', flags: 64 });
        }

        try {
          switch (field) {
            case 'reason':
              caseData.reason = newValue;
              break;
            case 'proof':
              caseData.proof = newValue;
              break;
            case 'duration':
              caseData.duration = newValue;
              break;
            case 'voided':
              caseData.voided = (newValue.toLowerCase() === 'true');
              if (caseData.voided) {
                caseData.voidedBy = interaction.user.id;
                caseData.voidTimestamp = new Date();
              } else {
                delete caseData.voidedBy;
                delete caseData.voidTimestamp;
              }
              break;
            case 'moderator': {
              const modUser = interaction.options.getUser('moderator') || await client.users.fetch(newValue).catch(() => null);
              if (!modUser) return await interaction.reply({ content: '<:a_2:1415171126560165928> Could not find that moderator.', flags: 64 });
              caseData.moderator = modUser.id;
              break;
            }
            case 'target': {
              const targetUser = interaction.options.getUser('target') || await client.users.fetch(newValue).catch(() => null);
              if (!targetUser) return await interaction.reply({ content: '<:a_2:1415171126560165928> Could not find that target user.', flags: 64 });
              caseData.target = targetUser.id;
              break;
            }
            default:
              return await interaction.reply({ content: '<:a_2:1415171126560165928> Unknown field. Supported: reason, proof, duration, voided, moderator, target.', flags: 64 });
          }

          moderationCases.set(caseId, caseData);
          await saveCasesToFile(guildId);
          
          try {
            const modlogChannelId = getServerLoggingChannel(guildId, 'modlogs');
            const logChannel = modlogChannelId ? interaction.guild.channels.cache.get(modlogChannelId) : null;
            if (logChannel && logChannel.isTextBased()) {
              const embed = new EmbedBuilder()
                .setColor(0xFFFFFF)
                .setTitle(`CASE UPDATED | Case \`${caseId}\``)
                .addFields(
                  { name: 'Edited By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                  { name: 'Field', value: field.toUpperCase(), inline: true },
                  { name: 'New Value', value: newValue.length > 1024 ? newValue.slice(0, 1020) + '...' : newValue, inline: false }
                )
                .setTimestamp();
              await logChannel.send({ embeds: [embed] });
            }
          } catch (err) {
            console.error('Failed to send modlog for editcase:', err);
          }

          await interaction.reply({ content: `<a:y1:1415173658237866025> Case \`${caseId}\` updated (${field}).`, flags: 64 });
        } catch (err) {
          console.error('editcase error:', err);
          await interaction.reply({ content: '<:a_2:1415171126560165928> Failed to edit the case.', flags: 64 });
        }
        break;
      }

      case 'serverinfo':
      case 'si': {
        const guild = interaction.guild;
        const owner = await guild.fetchOwner().catch(() => null);

       const retracted = "**{RETRACTED}**";

const safeGuildName = guild?.name || retracted;
const safeGuildId = guild?.id || retracted;
const safeGuildCreated = guild?.createdTimestamp
  ? `<t:${Math.floor(guild.createdTimestamp / 1000)}:F>`
  : retracted;
const safeOwner = owner ? `${owner.user.tag} (${owner.id})` : retracted;
const safeIcon = guild?.iconURL?.({ dynamic: true, size: 1024 }) || null;

const embed = new EmbedBuilder()
  .setColor(0xFFFFFF)
  .setTitle(`Server Info — ${safeGuildName}`)
  .setThumbnail(safeIcon)
  .addFields(
    { name: 'Server Name', value: safeGuildName, inline: true },
    { name: 'Guild ID', value: safeGuildId, inline: true },
    { name: 'Owner', value: safeOwner, inline: true },
    { name: 'Created', value: safeGuildCreated, inline: true }
  )
  .setTimestamp();
        await interaction.reply({ embeds: [embed] });
        break;
      }

      case 'memberinfo': 
      case 'mi': {
  const retracted = "**{RETRACTED}**";

  const targetMember = interaction.options.getMember('user') || interaction.member || null;
  const user = targetMember?.user || null;

  const safeUsername = user?.tag || retracted;
  const safeUserId = user?.id || retracted;
  const safeNickname = targetMember?.displayName || retracted;
  const safeCreated = user?.createdTimestamp
    ? `<t:${Math.floor(user.createdTimestamp / 1000)}:F>`
    : retracted;
  const safeJoined = targetMember?.joinedAt
    ? `<t:${Math.floor(targetMember.joinedAt.getTime() / 1000)}:F>`
    : retracted;
  const safeAvatar = user?.displayAvatarURL?.({ dynamic: true, size: 1024 }) || null;
  const safeAvatarLink = user?.displayAvatarURL
    ? `[Link](${user.displayAvatarURL({ dynamic: true, size: 1024 })})`
    : retracted;

  const embed = new EmbedBuilder()
    .setColor(0xFFFFFF)
    .setTitle(`Member Info — ${safeUsername}`)
    .setThumbnail(safeAvatar)
    .addFields(
      { name: 'Username', value: safeUsername, inline: true },
      { name: 'User ID', value: safeUserId, inline: true },
      { name: 'Nickname', value: safeNickname, inline: true },
      { name: 'Account Created', value: safeCreated, inline: true },
      { name: 'Joined Server', value: safeJoined, inline: true },
      { name: 'Avatar URL', value: safeAvatarLink, inline: false }
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
  break;
}


      case 'nick':
      case 'nickname': {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageNicknames)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Nicknames" permission to use this command.', flags: 64 });
        }

        const targetMember = interaction.options.getMember('user');
        const newNickname = interaction.options.getString('nickname');

        if (!targetMember || !newNickname) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Please specify a user and nickname.', flags: 64 });
        }

        try {
          await targetMember.setNickname(newNickname);
          await interaction.reply({ content: `<a:y1:1415173658237866025> Nickname for **${targetMember.user.tag}** has been changed to **${newNickname}**.`, flags: 64 });
        } catch (err) {
          console.error("Nickname change error:", err);
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Failed to change nickname. Check role hierarchy and permissions.', flags: 64 });
        }
        break;
      }

      case 'afk': {
        const afkReason = interaction.options.getString('reason') || 'No reason provided';

        await setUserAFK(member, afkReason);

        const afkConfirmEmbed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle('AFK Status Set')
          .addFields(
            { name: 'User', value: member.user.tag, inline: true },
            { name: 'Reason', value: afkReason, inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [afkConfirmEmbed], flags: 64 });
        break;
      }

      case 'avatar': 
      case 'av': {
        const avatarUser = interaction.options.getUser('user') || interaction.user;
        
        const avatarEmbed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle(`${avatarUser.displayName || avatarUser.username}`)
          .setImage(avatarUser.displayAvatarURL({ dynamic: true, size: 1024 }))
          .addFields(
            { name: 'User', value: `${avatarUser.tag} (${avatarUser.id})`, inline: true },
            { name: 'Avatar URL', value: `[Click here](${avatarUser.displayAvatarURL({ dynamic: true, size: 1024 })})`, inline: false }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [avatarEmbed] });
        break;
      }

      case 'say': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.', flags:64 });
  }
  const raw = interaction.content;
  const sayContent = raw.slice(prefix.length + commandName.length);

  if (!sayContent || sayContent.length === 0) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide content to say.', flags:64 });
  }

  await message.channel.send(sayContent);

  try {
    await message.delete();
  } catch (error) {
    console.error('Failed to delete say command message:', error);
  }
  break;
}


      case 'ping': {
  try {
    const sent = await interaction.reply({ content: 'Pong! Calculating raw response time...', withResponse: true });
    const rawLatency = sent.createdTimestamp - interaction.createdTimestamp;
    await interaction.editReply(`Pong!\n• Raw response time: **${rawLatency}ms**\n• Measuring edit roundtrip...`);

    const editStart = Date.now();
    await interaction.editReply(`Pong!\n• Raw response time: **${rawLatency}ms**\n• Edit roundtrip: measuring...`);
    const editLatency = Date.now() - editStart;

    await interaction.editReply(
      `Pong!\n` +
      `• Raw response time: **${rawLatency}ms**\n` +
      `• Edit roundtrip: **${editLatency}ms**\n` +
      `• WebSocket ping: **${Math.round(client.ws.ping)}ms**`
    );
  } catch (err) {
    console.error('Ping interaction failed:', err);
    await interaction.reply({ content: '<:a_2:1415171126560165928> Ping failed.', flags: 64 });
  }
  break;
}

      case 'purge': {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.', flags: 64 });
        }

        const amount = interaction.options.getInteger('amount');
        const targetUser = interaction.options.getUser('user');

        if (!amount || amount < 1 || amount > 10000) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide a valid number of messages to delete (1-10000).', flags: 64 });
        }

        try {
          await interaction.deferReply({ flags: 64 });

          if (!targetUser) {
            const deleted = await interaction.channel.bulkDelete(amount, true);
            await interaction.editReply({ content: `<a:y1:1415173658237866025> Successfully deleted ${deleted.size} messages.` });
          } else {
            const messages = await interaction.channel.messages.fetch({ limit: 10000 });
            const userMessages = messages.filter(m => m.author.id === targetUser.id).first(amount);

            if (userMessages.length === 0) {
              return await interaction.editReply({ content: `<:a_2:1415171126560165928> No recent messages found for ${targetUser.tag}.` });
            }

            const deleted = await interaction.channel.bulkDelete(userMessages, true);
            await interaction.editReply({ content: `<a:y1:1415173658237866025> Deleted ${deleted.size} message(s) from ${targetUser.tag}.` });
          }
        } catch (err) {
          console.error('Purge error:', err);
          return await interaction.editReply({ content: '<:a_2:1415171126560165928> An error occurred while trying to purge messages. Messages older than 14 days cannot be deleted in bulk.' });
        }
        break;
      }

      case 'status': {
  try {
    const uptimeMs = Date.now() - (client.readyTimestamp || Date.now());
    const uptimeSeconds = Math.floor(uptimeMs / 1000);
    const days = Math.floor(uptimeSeconds / 86400);
    const hours = Math.floor((uptimeSeconds % 86400) / 3600);
    const minutes = Math.floor((uptimeSeconds % 3600) / 60);
    const seconds = uptimeSeconds % 60;
    const uptimePretty = `${days}d ${hours}h ${minutes}m ${seconds}s`;

    let totalUsers = 0;
    for (const g of client.guilds.cache.values()) {
      if (typeof g.memberCount === 'number') totalUsers += g.memberCount;
    }

    const mem = process.memoryUsage();
    const memMb = (mem.rss / 1024 / 1024).toFixed(1);

    const statusEmbed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle('Bot Status — Live Check')
      .addFields(
        { name: 'Uptime', value: uptimePretty, inline: true },
        { name: 'Guilds', value: `${client.guilds.cache.size}`, inline: true },
        { name: 'Users (cached total)', value: `${totalUsers}`, inline: true },
        { name: 'WebSocket Ping', value: `${Math.round(client.ws.ping)}ms`, inline: true },
        { name: 'Memory (RSS)', value: `${memMb} MB`, inline: true },
        { name: 'Node.js', value: process.version, inline: true }
      )
      .setTimestamp()
      .setFooter({ text: `Bot: ${client.user ? client.user.tag : 'unknown'}` });

    await interaction.reply({ embeds: [statusEmbed], flags: 64 });
  } catch (err) {
    console.error('Status interaction failed:', err);
    await interaction.reply({ content: '<:a_2:1415171126560165928> Failed to gather status information.', flags: 64 });
  }
  break;
}

case 'warn': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.', flags: 64 });
  }

  const warnTarget = interaction.options.getUser('user');
  if (!warnTarget) return await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide a valid user to warn.', flags: 64 });
  const warnMember = interaction.guild.members.cache.get(warnTarget.id) || await interaction.guild.members.fetch(warnTarget.id).catch(()=>null);
  if (warnMember && isMemberImmune(interaction.guild, warnMember, 'warn')) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> That user (or one of their roles) is immune to `warn`.', flags: 64 });
  }

  const warnReason = interaction.options.getString('reason');
  const warnProof = interaction.options.getString('proof');
  const warnCaseId = generateCaseId();

  moderationCases.set(warnCaseId, {
    type: 'warn',
    target: warnTarget.id,
    moderator: interaction.user.id,
    reason: warnReason,
    proof: warnProof,
    timestamp: new Date(),
    voided: false,
    guildId: guildId
  });

  await saveCasesToFile(guildId);
  await logModerationAction(guild, 'warn', interaction.user, warnTarget, warnReason, warnProof, warnCaseId);
  await interaction.reply({ content: `<a:y1:1415173658237866025> ${warnTarget.tag} has been warned. Case ID: \`${warnCaseId}\``, flags: 64 });
  break;
}
case 'immune': {
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> Admins only.', flags: 64 });
  }

  const user = interaction.options.getUser('user');
  const role = interaction.options.getRole('role');
  const punishment = (interaction.options.getString('punishment') || '').toLowerCase();
  if (!user && !role) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> Provide either a `user` or a `role` to toggle immunity for.', flags: 64 });
  }
  if (user && role) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> Provide only one: user **or** role (not both).', flags: 64 });
  }
  if (['kick','ban'].includes(punishment)) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> You cannot make roles/users immune to `kick` or `ban`.', flags: 64 });
  }

  const immunes = getGuildImmunes(interaction.guildId);
  immunes.roles = immunes.roles || {};
  immunes.users = immunes.users || {};

  if (role) {
    const arr = immunes.roles[role.id] = immunes.roles[role.id] || [];
    if (arr.includes(punishment)) {
      immunes.roles[role.id] = arr.filter(x => x !== punishment);
      await saveImmunes(interaction.guildId);
      return await interaction.reply({ content: `Removed immunity for role **${role.name}** on \`${punishment}\`.`, flags: 64 });
    } else {
      arr.push(punishment);
      await saveImmunes(interaction.guildId);
      return await interaction.reply({ content: `Role **${role.name}** is now immune to \`${punishment}\`.`, flags: 64 });
    }
  } else {
    const arr = immunes.users[user.id] = immunes.users[user.id] || [];
    if (arr.includes(punishment)) {
      immunes.users[user.id] = arr.filter(x => x !== punishment);
      await saveImmunes(interaction.guildId);
      return await interaction.reply({ content: `Removed immunity for ${user.tag} on \`${punishment}\`.`, flags: 64 });
    } else {
      arr.push(punishment);
      await saveImmunes(interaction.guildId);
      return await interaction.reply({ content: `${user.tag} is now immune to \`${punishment}\`.`, flags: 64 });
    }
  }
  break;
}

case 'immunes': {
  if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> Admins only.', flags: 64 });
  }

  const filter = (interaction.options.getString('filter') || '').toLowerCase();
  const immunes = getGuildImmunes(interaction.guildId);

  const roleLines = Object.entries(immunes.roles || {}).map(([id, arr]) => {
    const r = interaction.guild.roles.cache.get(id);
    return `• ${r ? r.name : id}: ${arr.join(', ')}`;
  });
  const userLines = Object.entries(immunes.users || {}).map(([id, arr]) => {
    const u = client.users.cache.get(id);
    return `• ${u ? u.tag : id}: ${arr.join(', ')}`;
  });

  const format = lines => {
    if (!lines.length) return 'None';
    if (!filter) return lines.join('\n');
    return lines.filter(l => l.toLowerCase().includes(filter)).join('\n') || 'None';
  };

  const out = [
    '**Role immunities**',
    format(roleLines),
    '',
    '**User immunities**',
    format(userLines)
  ].join('\n');

  return await interaction.reply({ content: out, flags: 64 });
  break;
}




      case 'case': {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.', flags: 64 });
        }

        const caseIdToLookup = interaction.options.getString('case_id');

        if (!moderationCases.has(caseIdToLookup)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Case ID not found.', flags: 64 });
        }

        const caseData = moderationCases.get(caseIdToLookup);
        if (caseData.guildId !== guildId) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Case ID not found in this server.', flags: 64 });
        }

        let targetUser, moderatorUser;
        try {
          targetUser = await client.users.fetch(caseData.target);
        } catch (error) {
          targetUser = null;
        }
        
        try {
          moderatorUser = await client.users.fetch(caseData.moderator);
        } catch (error) {
          moderatorUser = null;
        }

        const targetDisplay = targetUser ? `${targetUser.tag} (${targetUser.id})` : `User ID: ${caseData.target}`;
        const moderatorDisplay = moderatorUser ? `${moderatorUser.tag} (${moderatorUser.id})` : `User ID: ${caseData.moderator}`;

        let expirationText;
        if (caseData.type === 'kick' || caseData.type === 'ban') {
          expirationText = 'Permanent';
        } else {
          const expirationDate = new Date(caseData.timestamp);
          expirationDate.setDate(expirationDate.getDate() + 30);
          const isExpired = new Date() > expirationDate;
          expirationText = isExpired ? 'Expired' : `<t:${Math.floor(expirationDate.getTime() / 1000)}:R>`;
        }
        
        const caseEmbed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle(`${caseData.type.toUpperCase()} | Case ${caseIdToLookup}`)
          .addFields(
            { name: 'Target User', value: targetDisplay, inline: true },
            { name: 'Moderator', value: moderatorDisplay, inline: true },
            { name: 'Date', value: `<t:${Math.floor(new Date(caseData.timestamp).getTime() / 1000)}:F>`, inline: true },
            { name: 'Reason', value: caseData.reason || 'No reason provided', inline: false }
          )
          .setTimestamp();
          
        if (caseData.duration) {
          caseEmbed.addFields({ name: 'Duration', value: caseData.duration, inline: true });
        }
        if (caseData.proof) {
          caseEmbed.addFields({ name: 'Proof', value: caseData.proof, inline: false });
        }
        caseEmbed.addFields({ name: 'Expires', value: expirationText, inline: true });
        
        if (caseData.voided) {
          const voidedBy = caseData.voidedBy ? `<@${caseData.voidedBy}>` : 'Unknown';
          const voidReason = caseData.voidReason || 'No reason provided';
          const voidDate = caseData.voidTimestamp ? `<t:${Math.floor(new Date(caseData.voidTimestamp).getTime() / 1000)}:R>` : 'Unknown';
          
          caseEmbed.addFields({ 
            name: '<:a_1:1415171153156374589> VOIDED', 
            value: `**By:** ${voidedBy}\n**Reason:** ${voidReason}\n**Date:** ${voidDate}`, 
            inline: false 
          });
          caseEmbed.setColor(0x808080);
        }

        if (caseData.appealed) {
          const appealedBy = caseData.appealedBy ? `<@${caseData.appealedBy}>` : 'Unknown';
          const appealDecision = caseData.appealDecision ? caseData.appealDecision.toUpperCase() : 'Unknown';
          const appealFeedback = caseData.appealFeedback || 'No feedback provided';
          const appealDate = caseData.appealTimestamp ? `<t:${Math.floor(new Date(caseData.appealTimestamp).getTime() / 1000)}:R>` : 'Unknown';
          
          const appealColor = caseData.appealDecision === 'accept' ? '<:y_1:1415171084055216128>' : '<:a_2:1415171126560165928>';
          caseEmbed.addFields({ 
            name: `${appealColor} APPEAL ${appealDecision}`, 
            value: `**By:** ${appealedBy}\n**Feedback:** ${appealFeedback}\n**Date:** ${appealDate}`, 
            inline: false 
          });
        }

        await interaction.reply({ embeds: [caseEmbed], flags: 64 });
        break;
      }

case 'infract': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Server" permission to use this command.', flags: 64 });
  }

  const infractTarget = interaction.options.getUser('user');
  if (!infractTarget) return await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide a valid user to infract.', flags: 64 });

  const infractMember = interaction.guild.members.cache.get(infractTarget.id) || await interaction.guild.members.fetch(infractTarget.id).catch(()=>null);
  if (infractMember && isMemberImmune(interaction.guild, infractMember, 'infract')) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> That user (or one of their roles) is immune to `infract`.', flags: 64 });
  }

  const infractReason = interaction.options.getString('reason');
  const infractProof = interaction.options.getString('proof');
  const infractCaseId = generateCaseId();

  moderationCases.set(infractCaseId, {
    type: 'infract',
    target: infractTarget.id,
    moderator: interaction.user.id,
    reason: infractReason,
    proof: infractProof,
    timestamp: new Date(),
    voided: false,
    guildId: guildId
  });

  await saveCasesToFile(guildId);
  await logModerationAction(guild, 'infract', interaction.user, infractTarget, infractReason, infractProof, infractCaseId);
  await interaction.reply({ content: `<a:y1:1415173658237866025> ${infractTarget.tag} has been infracted. Case ID: \`${infractCaseId}\``, flags: 64 });
  break;
}

case 'schedulemsg':
case 'schedule': {
  const channel = interaction.options.getChannel('channel');
  const newTimeStr = interaction.options.getString('time'); // or 'duration'
const ms = parseDuration(newTimeStr);
if (!ms || ms < 1000) {
  return await interaction.reply({ content: '⚠️ Invalid duration. Use `10m`, `1h`, etc.', flags: 64 });
}
schedule.time = Date.now() + ms;
const content = interaction.options.getString('content');

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await interaction.reply({ content: 'You need Manage Messages permission.', flags: 64 });
  }
  if (!channel || !channel.isTextBased()) {
    return await interaction.reply({ content: 'Invalid channel.', flags: 64 });
  }

  const sendAt = Date.now() + minutes * 60_000;
  const schedules = getGuildSchedules(interaction.guildId);
  const id = Date.now().toString();

  schedules.push({
    id,
    userId: interaction.user.id,
    channelId: channel.id,
    time: sendAt,
    content
  });
  scheduledMessages.set(interaction.guildId, schedules);
  await saveSchedules(interaction.guildId);

  return await interaction.reply({ content: `Scheduled message for ${channel} in ${minutes} minutes.`, flags: 64 });
}

case 'reset': {
  if (interaction.user.id !== interaction.guild.ownerId) {
    return interaction.reply({ content: '❌ Only the **server owner** can use this command.', ephemeral: true });
  }

  const sub = interaction.options.getString('action');
  if (sub && sub.toLowerCase() === 'authorize') {
    const ok = await resetGuildData(interaction.guild.id);
    if (ok) {
      return interaction.reply({ content: '✅ All server data has been reset successfully.' });
    } else {
      return interaction.reply({ content: '❌ Failed to reset server data. Check logs for details.' });
    }
  }

  return interaction.reply({
    content: '⚠️ Type `reset authorize` to confirm full server reset. This will permanently erase all bot data for this server.',
  });
}


case 'scheduledel': {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await interaction.reply({ content: 'You need Manage Messages permission.', flags: 64 });
  }

  const user = interaction.options.getUser('user');
  const time = interaction.options.getInteger('time');

  let schedules = getGuildSchedules(interaction.guildId);

  if (user) schedules = schedules.filter(s => s.userId !== user.id);
  if (time) {
    const cutoff = Date.now() + time * 60_000;
    schedules = schedules.filter(s => s.time > cutoff);
  }

  scheduledMessages.set(interaction.guildId, schedules);
  await saveSchedules(interaction.guildId);

  return await interaction.reply({ content: 'Scheduled messages matching criteria were deleted.', flags: 64 });
}
case 'schedulelist': {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await interaction.reply({ content: 'You need Manage Messages permission.', flags: 64 });
  }

  const user = interaction.options.getUser('user');
  const channel = interaction.options.getChannel('channel');
  let schedules = getGuildSchedules(interaction.guildId);

  if (user) schedules = schedules.filter(s => s.userId === user.id);
  if (channel) schedules = schedules.filter(s => s.channelId === channel.id);

  if (!schedules.length) {
    return await interaction.reply({ content: 'No scheduled messages found.', flags: 64 });
  }

  const lines = schedules.map(s => {
    const when = `<t:${Math.floor(s.time / 1000)}:R>`;
    const u = client.users.cache.get(s.userId);
    const uname = u ? u.tag : s.userId;
    const chan = `<#${s.channelId}>`;
    return `• ${uname} → ${chan} at ${when}: ${s.content}`;
  });

  return await interaction.reply({ content: lines.join('\n'), flags: 64 });
}

case 'note': {
  if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.', flags: 64 });
  }

  const noteTarget = interaction.options.getUser('user');
  if (!noteTarget) return await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide a valid user to add a note for.', flags: 64 });

  const noteMember = interaction.guild.members.cache.get(noteTarget.id) || await interaction.guild.members.fetch(noteTarget.id).catch(()=>null);
  if (noteMember && isMemberImmune(interaction.guild, noteMember, 'note')) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> That user (or one of their roles) is immune to `note`.', flags: 64 });
  }

  const noteReason = interaction.options.getString('reason');
  const noteProof = interaction.options.getString('proof');
  const noteCaseId = generateCaseId();

  moderationCases.set(noteCaseId, {
    type: 'note',
    target: noteTarget.id,
    moderator: interaction.user.id,
    reason: noteReason,
    proof: noteProof,
    timestamp: new Date(),
    voided: false,
    guildId: guildId
  });

  await saveCasesToFile(guildId);
  await logModerationAction(guild, 'note', interaction.user, noteTarget, noteReason, noteProof, noteCaseId);
  await interaction.reply({ content: `<a:y1:1415173658237866025> A note has been added for ${noteTarget.tag}. Case ID: \`${noteCaseId}\``, flags: 64 });
  break;
}

case 'mute': {
  if (!member.permissions.has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers])) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> You need both "Manage Messages" and "Timeout Members" permissions to use this command.', flags: 64 });
  }

  const muteTarget = interaction.options.getUser('user');
  if (!muteTarget) return await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide a valid user to mute.', flags: 64 });

  const muteMember = interaction.guild.members.cache.get(muteTarget.id) || await interaction.guild.members.fetch(muteTarget.id).catch(()=>null);
  if (muteMember && isMemberImmune(interaction.guild, muteMember, 'mute')) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> That user (or one of their roles) is immune to `mute`.', flags: 64 });
  }

  const muteDuration = interaction.options.getInteger('duration');
  const muteReason = interaction.options.getString('reason');
  const muteProof = interaction.options.getString('proof');
  const muteCaseId = generateCaseId();

  if (!muteMember) return await interaction.reply({ content: '<:a_2:1415171126560165928> User not found in this server.', flags: 64 });
  if (!muteDuration || muteDuration < 1) return await interaction.reply({ content: '<:a_2:1415171126560165928> Please provide a valid duration in minutes.', flags: 64 });

  if (muteMember.id === interaction.guild.ownerId) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> Cannot timeout the server owner.', flags: 64 });
  }
  if (muteMember.user.bot) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> Cannot timeout bots.', flags: 64 });
  }

  const botMember = interaction.guild.members.cache.get(client.user.id);
  if (muteMember.roles.highest.position >= botMember.roles.highest.position) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> Cannot timeout this user due to role hierarchy. My role must be higher than their highest role.', flags: 64 });
  }
  if (!botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return await interaction.reply({ content: '<:a_2:1415171126560165928> I need the "Timeout Members" permission to mute users.', flags: 64 });
  }

  try {
    await muteMember.timeout(muteDuration * 60 * 1000, muteReason);
  } catch (error) {
    console.error('Mute error:', error);
    if (error.code === 50013) {
      return await interaction.reply({ content: '<:a_2:1415171126560165928> I don\'t have permission to timeout this user. Check my role position and permissions.', flags: 64 });
    }
    return await interaction.reply({ content: '<:a_2:1415171126560165928> Failed to mute the user due to an unexpected error.', flags: 64 });
  }

  moderationCases.set(muteCaseId, {
    type: 'mute',
    target: muteMember.user.id,
    moderator: interaction.user.id,
    reason: muteReason,
    proof: muteProof,
    duration: `${muteDuration} minutes`,
    timestamp: new Date(),
    voided: false,
    guildId: guildId
  });

  await saveCasesToFile(guildId);
  await logModerationAction(interaction.guild, 'mute', interaction.user, muteMember.user, muteReason, muteProof, muteCaseId, `${muteDuration} minutes`);
  await interaction.reply({ content: `<a:y1:1415173658237866025> ${muteMember.user.tag} has been muted for ${muteDuration} minutes. Case ID: \`${muteCaseId}\``, flags: 64 });
  break;
}


      case 'kick': {
        if (!member.permissions.has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers, PermissionsBitField.Flags.KickMembers])) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages", "Timeout Members", and "Kick Members" permissions to use this command.', flags: 64 });
        }

        const kickTarget = interaction.options.getMember('user');
        const kickReason = interaction.options.getString('reason');
        const kickProof = interaction.options.getString('proof');
        const kickCaseId = generateCaseId();

        if (!kickTarget) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> User not found in this server.', flags: 64 });
        }

        await kickTarget.kick(kickReason);

        moderationCases.set(kickCaseId, {
          type: 'kick',
          target: kickTarget.user.id,
          moderator: interaction.user.id,
          reason: kickReason,
          proof: kickProof,
          timestamp: new Date(),
          voided: false,
          guildId: guildId
        });

        await saveCasesToFile(guildId);
        await logModerationAction(guild, 'kick', interaction.user, kickTarget.user, kickReason, kickProof, kickCaseId);
        await interaction.reply({ content: `<a:y1:1415173658237866025> ${kickTarget.user.tag} has been kicked. Case ID: \`${kickCaseId}\``, flags: 64 });
        break;
      }

      case 'ban': {
        if (!member.permissions.has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers, PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.BanMembers])) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages", "Timeout Members", "Kick Members", and "Ban Members" permissions to use this command.', flags: 64 });
        }

        const banTarget = interaction.options.getUser('user');
        const banReason = interaction.options.getString('reason');
        const banProof = interaction.options.getString('proof');
        const banCaseId = generateCaseId();

        await guild.members.ban(banTarget, { reason: banReason });

        moderationCases.set(banCaseId, {
          type: 'ban',
          target: banTarget.id,
          moderator: interaction.user.id,
          reason: banReason,
          proof: banProof,
          timestamp: new Date(),
          voided: false,
          guildId: guildId
        });

        await saveCasesToFile(guildId);
        await logModerationAction(guild, 'ban', interaction.user, banTarget, banReason, banProof, banCaseId);
        await interaction.reply({ content: `<a:y1:1415173658237866025> ${banTarget.tag} has been banned. Case ID: \`${banCaseId}\``, flags: 64 });
        break;
      }

      case 'voidcase': {
        if (!member.permissions.has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers, PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.BanMembers])) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages", "Timeout Members", "Kick Members", and "Ban Members" permissions to use this command.', flags: 64 });
        }

        const caseId = interaction.options.getString('case_id');
        const voidReason = interaction.options.getString('reason');

        if (!moderationCases.has(caseId)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Case ID not found.', flags: 64 });
        }

        const moderationCase = moderationCases.get(caseId);
        if (moderationCase.voided) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> This case has already been voided.', flags: 64 });
        }

        moderationCase.voided = true;
        moderationCase.voidedBy = interaction.user.id;
        moderationCase.voidReason = voidReason;
        moderationCase.voidTimestamp = new Date();

        await saveCasesToFile(guildId);
        const modlogChannelId = getServerLoggingChannel(guildId, 'modlogs');
        const logChannel = modlogChannelId ? guild.channels.cache.get(modlogChannelId) : null;
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`CASE VOIDED | Case \`${caseId}\``)
            .addFields(
              { name: 'Original Action', value: moderationCase.type.toUpperCase(), inline: true },
              { name: 'Voided By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
              { name: 'Void Reason', value: voidReason || 'No reason provided', inline: false }
            )
            .setTimestamp();

          await logChannel.send({ embeds: [embed] });
        }

        await interaction.reply({ content: `<a:y1:1415173658237866025> Case \`${caseId}\` has been voided.`, flags: 64 });
        break;
      }

      case 'about': {
        const aboutEmbed = new EmbedBuilder()
          .setColor(0xFFFFFF)
          .setTitle(aboutInfo.title)
          .setDescription(aboutInfo.description)
          .addFields(
            { name: 'Version', value: aboutInfo.version, inline: true },
            { name: 'Author', value: aboutInfo.author, inline: true },
            { name: 'Support Server', value: aboutInfo.supportServer, inline: false },
            { name: 'Website', value: aboutInfo.website, inline: false },
            { name: 'Features', value: aboutInfo.features.map(f => `• ${f}`).join('\n'), inline: false }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [aboutEmbed] });
        break;
      }

      case 'cmds':
      case 'commands': {
        const helpEmbed = buildHelpEmbed(guildId);
        await interaction.reply({ embeds: [helpEmbed] });
        break;
      }

      case 'help': {
        await interaction.reply({ content: "***Support/help server for cap***\n\n> https://discord.gg/PfCC7Y2tXH\n\n***Website***\n\n> <https://sites.google.com/view/capitanfunny/discord-bot-developer?authuser=0>" });
        break;
      }
            
      case 'cases': {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.', flags: 64 });
        }

        const casesTarget = interaction.options.getUser('user');
        
        if (!casesTarget) {
          const result = getAllGuildCases(guildId, 1, 10);
          
          if (result.cases.length === 0) {
            return await interaction.reply({ content: '<a:y1:1415173658237866025> No moderation cases found for this server.', flags: 64 });
          }

          const casesEmbed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`All Moderation Cases - Page ${result.page}/${result.totalPages}`)
            .setDescription(`Found ${result.total} total case(s):`)
            .setTimestamp();

          result.cases.forEach((caseData) => {
            const targetUser = client.users.cache.get(caseData.target);
            const targetDisplay = targetUser ? `${targetUser.tag} (${targetUser.id})` : `User ID: ${caseData.target}`;
            
            const expirationText = (caseData.type === 'kick' || caseData.type === 'ban')
              ? 'Permanent'
              : `<t:${Math.floor((new Date(caseData.timestamp).getTime() + (30 * 24 * 60 * 60 * 1000)) / 1000)}:R>`;

            casesEmbed.addFields({
              name: `${caseData.type.toUpperCase()} | Case \`${caseData.caseId}\``,
              value: `**Target:** ${targetDisplay}\n**Reason:** ${caseData.reason || 'No reason provided'}\n**Date:** <t:${Math.floor(new Date(caseData.timestamp).getTime() / 1000)}:R>\n**Expires:** ${expirationText}`,
              inline: false
            });
          });

          if (result.totalPages > 1) {
            casesEmbed.setFooter({ text: 'Use prefix command for pagination: !cases all [page]' });
          }

          await interaction.reply({ embeds: [casesEmbed], flags: 64 });
        } else {
          const activeCases = getActiveCases(casesTarget.id, guildId);

          if (activeCases.length === 0) {
            return await interaction.reply({ content: `<a:y1:1415173658237866025> ${casesTarget.tag} has no active moderation cases.`, flags: 64 });
          }

          const casesEmbed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(`Active Cases for ${casesTarget.tag}`)
            .setDescription(`Found ${activeCases.length} active case(s):`)
            .setTimestamp();

          activeCases.forEach((activeCase) => {
            const expirationText = (activeCase.type === 'kick' || activeCase.type === 'ban')
              ? 'Permanent'
              : `<t:${Math.floor((new Date(activeCase.timestamp).getTime() + (30 * 24 * 60 * 60 * 1000)) / 1000)}:R>`;

            casesEmbed.addFields({
              name: `${activeCase.type.toUpperCase()} | Case \`${activeCase.caseId}\``,
              value: `**Reason:** ${activeCase.reason || 'No reason provided'}\n**Date:** <t:${Math.floor(new Date(activeCase.timestamp).getTime() / 1000)}:R>\n**Expires:** ${expirationText}`,
              inline: false
            });
          });

          await interaction.reply({ embeds: [casesEmbed], flags: 64 });
        }
        break;
      }

      case 'appeal': {
        if (!member.permissions.has([PermissionsBitField.Flags.ManageMessages, PermissionsBitField.Flags.ModerateMembers, PermissionsBitField.Flags.KickMembers, PermissionsBitField.Flags.BanMembers])) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages", "Timeout Members", "Kick Members", and "Ban Members" permissions to use this command.', flags: 64 });
        }

        const appealCaseId = interaction.options.getString('case_id');
        const appealDecision = interaction.options.getString('decision');
        const appealFeedback = interaction.options.getString('feedback');

        if (!moderationCases.has(appealCaseId)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Case ID not found.', flags: 64 });
        }

        const appealCase = moderationCases.get(appealCaseId);
        appealCase.appealed = true;
        appealCase.appealDecision = appealDecision;
        appealCase.appealFeedback = appealFeedback;
        appealCase.appealTimestamp = new Date();
        appealCase.appealedBy = interaction.user.id;
        await saveCasesToFile(guildId);
        const appealTarget = await client.users.fetch(appealCase.target).catch(() => null);
        if (!appealTarget) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Could not find the user for this case.', flags: 64 });
        }
        try {
          const appealEmbed = new EmbedBuilder()
            .setColor(0xFFFFFF)
            .setTitle(appealDecision === 'accept' ? '<:a_3:1415171233447678002> Appeal Accepted' : '<:a_1:1415171153156374589> Appeal Denied')
            .addFields(
              { name: 'Case ID', value: appealCaseId, inline: true },
              { name: 'Decision', value: appealDecision === 'accept' ? 'ACCEPTED' : 'DENIED', inline: true },
              { name: 'Moderator Feedback', value: appealFeedback, inline: false }
            )
            .setFooter({ text: 'This appeal has been reviewed. No further action required.' })
            .setTimestamp();

          await appealTarget.send({ embeds: [appealEmbed] });

          const modlogChannelId = getServerLoggingChannel(guildId, 'modlogs');
          const logChannel = modlogChannelId ? guild.channels.cache.get(modlogChannelId) : null;
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setColor(0xFFFFFF)
              .setTitle(`APPEAL ${appealDecision.toUpperCase()} | Case \`${appealCaseId}\``)
              .addFields(
                { name: 'Original Action', value: appealCase.type.toUpperCase(), inline: true },
                { name: 'Target User', value: `${appealTarget.tag} (${appealTarget.id})`, inline: true },
                { name: 'Decision', value: appealDecision.toUpperCase(), inline: true },
                { name: 'Moderator', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                { name: 'Feedback', value: appealFeedback, inline: false }
              )
              .setTimestamp();

            await logChannel.send({ embeds: [logEmbed] });
          }

          await interaction.reply({ content: `<a:y1:1415173658237866025> Appeal for case \`${appealCaseId}\` has been ${appealDecision}ed. The user has been notified.`, flags: 64 });
        } catch (error) {
          console.error('Appeal DM error:', error);
          await interaction.reply({ content: `<a:y1:1415173658237866025> Appeal for case \`${appealCaseId}\` has been ${appealDecision}ed, but failed to send DM to the user.`, flags: 64 });
        }
        break;
      }

      case 'support': {
        await interaction.reply({ 
          content: '***Support Server for cap***\n\n> https://discord.gg/PfCC7Y2tXH\n\n***Website***\n\n> https://sites.google.com/view/capitanfunny/discord-bot-developer?authuser=0',
          flags: 64 
        });
        break;
      }

      case 'setproof': {
        if (!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Manage Messages" permission to use this command.', flags: 64 });
        }

        const caseId = interaction.options.getString('case_id');
        const proofText = interaction.options.getString('proof');

        if (!caseId || !proofText) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Both case_id and proof are required.', flags: 64 });
        }

        if (!moderationCases.has(caseId)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Case ID not found.', flags: 64 });
        }

        const caseData = moderationCases.get(caseId);

        if (caseData.guildId !== guildId) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> That case does not belong to this server.', flags: 64 });
        }

        caseData.proof = proofText;
        moderationCases.set(caseId, caseData);
        
        try {
          await saveCasesToFile(guildId);
        } catch (err) {
          console.error('Failed to save cases after setproof:', err);
          await interaction.reply({ content: '<:a_2:1415171126560165928> Failed to save the case to disk. Proof updated in memory.', flags: 64 });
        }
        
        try {
          const modlogChannelId = getServerLoggingChannel(guildId, 'modlogs');
          const logChannel = modlogChannelId ? interaction.guild.channels.cache.get(modlogChannelId) : null;
          if (logChannel && logChannel.isTextBased()) {
            const embed = new EmbedBuilder()
              .setColor(0xFFFFFF)
              .setTitle(`PROOF UPDATED | Case \`${caseId}\``)
              .addFields(
                { name: 'Case ID', value: caseId, inline: true },
                { name: 'Updated By', value: `${interaction.user.tag} (${interaction.user.id})`, inline: true },
                { name: 'Target', value: `${caseData.target}`, inline: true },
                { name: 'New Proof', value: proofText.length > 1024 ? proofText.slice(0, 1020) + '...' : proofText, inline: false }
              )
              .setTimestamp();

            await logChannel.send({ embeds: [embed] });
          }
        } catch (err) {
          console.error('Failed to send modlog for setproof:', err);
        }

        await interaction.reply({ content: `<a:y1:1415173658237866025> Proof for case \`${caseId}\` updated successfully.`, flags: 64 });
        break;
      }

      case 'set': {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return await interaction.reply({
            content: '<:a_2:1415171126560165928> You need the "Administrator" permission to use this command.',
            flags: 64
          });
        }

        const logTypeOpt = interaction.options.getString('log_type', true);
        const channelOpt = interaction.options.getChannel('channel', true);

        if (!['modlogs', 'all.logs', 'verification.logs'].includes(logTypeOpt)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Invalid log_type.', flags: 64 });
        }

        const logTypeForStorage = logTypeOpt === 'all.logs' ? 'alllogs' : logTypeOpt;
        await setServerLoggingChannelPersist(guildId, logTypeForStorage, channelOpt.id);

        return await interaction.reply({
          content: `<a:y1:1415173658237866025> ${logTypeOpt} will now be sent to ${channelOpt}`,
          flags: 64
        });
      }

      case 'prefix': {
        if (!member.permissions.has(PermissionsBitField.Flags.Administrator)) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> You need the "Administrator" permission to use this command.', flags: 64 });
        }
        const newPrefix = interaction.options.getString('new_prefix');
        if (!newPrefix) {
          const currentPrefix = getServerPrefix(guildId);
          return await interaction.reply({ content: `<a:y1:1415173658237866025> Current server prefix is: \`${currentPrefix}\``, flags: 64 });
        }
        if (newPrefix.length > 5) {
          return await interaction.reply({ content: '<:a_2:1415171126560165928> Prefix cannot be longer than 5 characters.', flags: 64 });
        }
        await setServerPrefixPersist(guildId, newPrefix);
        await interaction.reply({ content: `<a:y1:1415173658237866025> Server prefix has been changed to: \`${newPrefix}\``, flags: 64 });
        break;
      }

      default:
        await interaction.reply({ content: '<:a_2:1415171126560165928> Unknown command.', flags: 64 });
        break;
    }
  } catch (error) {
    console.error('Command error:', error);
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ 
          content: '<:a_2:1415171126560165928> An error occurred while executing this command.', 
          flags: 64 
        });
      } catch (replyError) {
        console.error('Failed to send error message:', replyError);
      }
    } else {
        await interaction.followUp({
            content: '<:a_2:1415171126560165928> An error occurred while executing this command.', 
            flags: 64 
        });
    }
  }
});
// ============================================================================
// Server Logging 8/10
// ============================================================================
async function getAuditLogEntry(guild, action, targetId = null, maxAge = 5000) {
  try {
    const auditLogs = await guild.fetchAuditLogs({
      type: action,
      limit: 10
    });


    const entry = auditLogs.entries.find(entry => {
      const timeDiff = Date.now() - entry.createdTimestamp;
      if (timeDiff > maxAge) return false;

      if (targetId && entry.target?.id !== targetId) return false;

      return true;
    });

    return entry;
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return null;
  }
}

async function logServerEvent(guild, eventType, eventData) {
  const guildId = guild.id;
  const allLogsChannelId = getServerLoggingChannel(guildId, 'alllogs');
  const logChannel = allLogsChannelId ? guild.channels.cache.get(allLogsChannelId) : null;

  if (!logChannel) {
    return;
  }

  try {
    const embed = new EmbedBuilder()
      .setColor(0xFFFFFF)
      .setTitle(eventData.title)
      .setTimestamp();

    if (eventData.fields) {
      embed.addFields(eventData.fields);
    }

    if (eventData.description) {
      embed.setDescription(eventData.description);
    }

    await logChannel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Server logging error:', error);
  }
}

function getEventColor(eventType) {
  return 0xFFFFFF;
}
client.on(Events.GuildMemberAdd, async member => {
  await logServerEvent(member.guild, 'member_join', {
    title: '👋 Member Joined',
    fields: [
      { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
      { name: 'Account Created', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    ]
  });
});


client.on(Events.GuildMemberRemove, async member => {
  await logServerEvent(member.guild, 'member_leave', {
    title: '👋 Member Left',
    fields: [
      { name: 'User', value: `${member.user.tag} (${member.user.id})`, inline: true },
      { name: 'Joined', value: member.joinedAt ? `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:R>` : 'Unknown', inline: true },
      { name: 'Member Count', value: `${member.guild.memberCount}`, inline: true }
    ]
  });
});
client.on(Events.MessageDelete, async message => {
  if (!message.guild || message.author?.bot) return;

  const auditEntry = await getAuditLogEntry(message.guild, 72, message.author?.id);

  const fields = [
    { name: 'Author', value: message.author ? `${message.author.tag} (${message.author.id})` : 'Unknown', inline: true },
    { name: 'Channel', value: `${message.channel} (${message.channel.id})`, inline: true }
  ];

  if (auditEntry && auditEntry.executor) {
    fields.push({ name: 'Deleted By', value: `${auditEntry.executor.tag} (${auditEntry.executor.id})`, inline: true });
  } else {
    fields.push({ name: 'Deleted By', value: 'Author (self-delete) or Unknown', inline: true });
  }

  fields.push({ name: 'Content', value: message.content ? (message.content.length > 1024 ? message.content.substring(0, 1021) + '...' : message.content) : 'No content', inline: false });

  await logServerEvent(message.guild, 'message_delete', {
    title: '🗑️ Message Deleted',
    fields: fields
  });
});
client.on(Events.MessageUpdate, async (oldMessage, newMessage) => {
  if (!newMessage.guild || newMessage.author?.bot || oldMessage.content === newMessage.content) return;

  await logServerEvent(newMessage.guild, 'message_edit', {
    title: '✏️ Message Edited',
    fields: [
      { name: 'Author', value: `${newMessage.author.tag} (${newMessage.author.id})`, inline: true },
      { name: 'Channel', value: `${newMessage.channel} (${newMessage.channel.id})`, inline: true },
      { name: 'Before', value: oldMessage.content ? (oldMessage.content.length > 512 ? oldMessage.content.substring(0, 509) + '...' : oldMessage.content) : 'No content', inline: false },
      { name: 'After', value: newMessage.content ? (newMessage.content.length > 512 ? newMessage.content.substring(0, 509) + '...' : newMessage.content) : 'No content', inline: false }
    ]
  });
});
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
  const guild = oldState.guild || newState.guild;
  const member = oldState.member || newState.member;
  if (!oldState.channel && newState.channel) {
    await logServerEvent(guild, 'voice_join', {
      title: '🔊 Voice Channel Joined',
      fields: [
        { name: 'Member', value: `${member.user.tag} (${member.user.id})`, inline: true },
        { name: 'Channel', value: `${newState.channel.name} (${newState.channel.id})`, inline: true }
      ]
    });
  }
  else if (oldState.channel && !newState.channel) {
    await logServerEvent(guild, 'voice_leave', {
      title: '🔇 Voice Channel Left',
      fields: [
        { name: 'Member', value: `${member.user.tag} (${member.user.id})`, inline: true },
        { name: 'Channel', value: `${oldState.channel.name} (${oldState.channel.id})`, inline: true }
      ]
    });
  }
  else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
    const auditEntry = await getAuditLogEntry(guild, 26, member.user.id);

    const fields = [
      { name: 'Member', value: `${member.user.tag} (${member.user.id})`, inline: true },
      { name: 'From', value: `${oldState.channel.name} (${oldState.channel.id})`, inline: true },
      { name: 'To', value: `${newState.channel.name} (${newState.channel.id})`, inline: true }
    ];

    if (auditEntry && auditEntry.executor && auditEntry.executor.id !== member.user.id) {
      fields.push({ name: 'Moved By', value: `${auditEntry.executor.tag} (${auditEntry.executor.id})`, inline: true });
    } else {
      fields.push({ name: 'Moved By', value: 'Self', inline: true });
    }

    await logServerEvent(guild, 'voice_move', {
      title: '🔄 Voice Channel Moved',
      fields: fields
    });
  }
});
client.on(Events.GuildRoleCreate, async role => {
  await logServerEvent(role.guild, 'role_create', {
    title: '🎭 Role Created',
    fields: [
      { name: 'Role', value: `${role.name} (${role.id})`, inline: true },
      { name: 'Color', value: role.hexColor, inline: true },
      { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true }
    ]
  });
});
client.on(Events.GuildRoleDelete, async role => {
  await logServerEvent(role.guild, 'role_delete', {
    title: '🗑️ Role Deleted',
    fields: [
      { name: 'Role', value: `${role.name} (${role.id})`, inline: true },
      { name: 'Color', value: role.hexColor, inline: true },
      { name: 'Members', value: `${role.members.size}`, inline: true }
    ]
  });
});
client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
  const permissionChanges = [];
  const oldPerms = oldRole.permissions.toArray();
  const newPerms = newRole.permissions.toArray();

  const addedPerms = newPerms.filter(perm => !oldPerms.includes(perm));
  const removedPerms = oldPerms.filter(perm => !newPerms.includes(perm));

  if (addedPerms.length > 0) {
    permissionChanges.push(`**Added:** ${addedPerms.join(', ')}`);
  }

  if (removedPerms.length > 0) {
    permissionChanges.push(`**Removed:** ${removedPerms.join(', ')}`);
  }
  const otherChanges = [];

  if (oldRole.name !== newRole.name) {
    otherChanges.push(`**Name:** ${oldRole.name} → ${newRole.name}`);
  }

  if (oldRole.color !== newRole.color) {
    otherChanges.push(`**Color:** ${oldRole.hexColor} → ${newRole.hexColor}`);
  }

  if (oldRole.hoist !== newRole.hoist) {
    otherChanges.push(`**Display Separately:** ${oldRole.hoist ? 'Yes' : 'No'} → ${newRole.hoist ? 'Yes' : 'No'}`);
  }

  if (oldRole.mentionable !== newRole.mentionable) {
    otherChanges.push(`**Mentionable:** ${oldRole.mentionable ? 'Yes' : 'No'} → ${newRole.mentionable ? 'Yes' : 'No'}`);
  }
  if (permissionChanges.length > 0 || otherChanges.length > 0) {
    const auditEntry = await getAuditLogEntry(newRole.guild, 31, newRole.id);

    const fields = [
      { name: 'Role', value: `${newRole.name} (${newRole.id})`, inline: true }
    ];

    if (auditEntry && auditEntry.executor) {
      fields.push({ name: 'Updated By', value: `${auditEntry.executor.tag} (${auditEntry.executor.id})`, inline: true });
    }

    if (permissionChanges.length > 0) {
      fields.push({ name: 'Permission Changes', value: permissionChanges.join('\n'), inline: false });
    }

    if (otherChanges.length > 0) {
      fields.push({ name: 'Other Changes', value: otherChanges.join('\n'), inline: false });
    }

    await logServerEvent(newRole.guild, 'role_update', {
      title: '🎭 Role Updated',
      fields: fields
    });
  }
});
client.on(Events.GuildMemberUpdate, async (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache;
  const newRoles = newMember.roles.cache;

  const addedRoles = newRoles.filter(role => !oldRoles.has(role.id));
  const removedRoles = oldRoles.filter(role => !newRoles.has(role.id));

  if (addedRoles.size > 0 || removedRoles.size > 0) {
    const auditEntry = await getAuditLogEntry(newMember.guild, 25, newMember.user.id);

    const changes = [];

    if (addedRoles.size > 0) {
      changes.push(`**Added:** ${addedRoles.map(role => role.name).join(', ')}`);
    }

    if (removedRoles.size > 0) {
      changes.push(`**Removed:** ${removedRoles.map(role => role.name).join(', ')}`);
    }

    const fields = [
      { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true }
    ];

    if (auditEntry && auditEntry.executor) {
      fields.push({ name: 'Updated By', value: `${auditEntry.executor.tag} (${auditEntry.executor.id})`, inline: true });
    }

    fields.push({ name: 'Role Changes', value: changes.join('\n'), inline: false });

    await logServerEvent(newMember.guild, 'member_role_update', {
      title: '👤 Member Roles Updated',
      fields: fields
    });
  }
  if (oldMember.nickname !== newMember.nickname) {
    const auditEntry = await getAuditLogEntry(newMember.guild, 24, newMember.user.id);

    const fields = [
      { name: 'Member', value: `${newMember.user.tag} (${newMember.user.id})`, inline: true },
      { name: 'Old Nickname', value: oldMember.nickname || 'None', inline: true },
      { name: 'New Nickname', value: newMember.nickname || 'None', inline: true }
    ];

    if (auditEntry && auditEntry.executor) {
      fields.push({ name: 'Changed By', value: `${auditEntry.executor.tag} (${auditEntry.executor.id})`, inline: true });
    }

    await logServerEvent(newMember.guild, 'nickname_change', {
      title: '✏️ Nickname Changed',
      fields: fields
    });
  }
});
client.on(Events.ChannelCreate, async channel => {
  if (!channel.guild) return;
  const auditEntry = await getAuditLogEntry(channel.guild, 10, channel.id);

  const channelTypes = {
    0: 'Text Channel',
    1: 'DM',
    2: 'Voice Channel',
    3: 'Group DM',
    4: 'Category',
    5: 'News Channel',
    10: 'News Thread',
    11: 'Public Thread',
    12: 'Private Thread',
    13: 'Stage Voice',
    15: 'Forum Channel'
  };

  const fields = [
    { name: 'Channel', value: `${channel.name} (${channel.id})`, inline: true },
    { name: 'Type', value: channelTypes[channel.type] || `Unknown (${channel.type})`, inline: true },
    { name: 'Category', value: channel.parent ? `${channel.parent.name}` : 'None', inline: true }
  ];

  if (auditEntry && auditEntry.executor) {
    fields.push({ name: 'Created By', value: `${auditEntry.executor.tag} (${auditEntry.executor.id})`, inline: true });
  }

  await logServerEvent(channel.guild, 'channel_create', {
    title: '📝 Channel Created',
    fields: fields
  });
});
client.on(Events.ChannelDelete, async channel => {
  if (!channel.guild) return;
  const auditEntry = await getAuditLogEntry(channel.guild, 12, channel.id);

  const channelTypes = {
    0: 'Text Channel',
    1: 'DM',
    2: 'Voice Channel',
    3: 'Group DM',
    4: 'Category',
    5: 'News Channel',
    10: 'News Thread',
    11: 'Public Thread',
    12: 'Private Thread',
    13: 'Stage Voice',
    15: 'Forum Channel'
  };

  const fields = [
    { name: 'Channel', value: `${channel.name} (${channel.id})`, inline: true },
    { name: 'Type', value: channelTypes[channel.type] || `Unknown (${channel.type})`, inline: true },
    { name: 'Category', value: channel.parent ? `${channel.parent.name}` : 'None', inline: true }
  ];

  if (auditEntry && auditEntry.executor) {
    fields.push({ name: 'Deleted By', value: `${auditEntry.executor.tag} (${auditEntry.executor.id})`, inline: true });
  }

  await logServerEvent(channel.guild, 'channel_delete', {
    title: '🗑️ Channel Deleted',
    fields: fields
  });
});

function formatPermissionName(permission) {
  return permission
    .split(/(?=[A-Z])/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
function comparePermissionOverwrites(oldOverwrites, newOverwrites) {
  const changes = [];
  const oldMap = new Map();
  const newMap = new Map();
  
  oldOverwrites.forEach(overwrite => {
    oldMap.set(overwrite.id, overwrite);
  });
  newOverwrites.forEach(overwrite => {
    newMap.set(overwrite.id, overwrite);
  });
  newMap.forEach((newOverwrite, id) => {
    if (!oldMap.has(id)) {
      changes.push({
        type: 'added',
        target: newOverwrite,
        changes: {
          allow: newOverwrite.allow.toArray(),
          deny: newOverwrite.deny.toArray()
        }
      });
    }
  });
  oldMap.forEach((oldOverwrite, id) => {
    if (!newMap.has(id)) {
      changes.push({
        type: 'removed',
        target: oldOverwrite,
        changes: {
          allow: oldOverwrite.allow.toArray(),
          deny: oldOverwrite.deny.toArray()
        }
      });
    }
  });
  newMap.forEach((newOverwrite, id) => {
    const oldOverwrite = oldMap.get(id);
    if (oldOverwrite) {
      const oldAllow = oldOverwrite.allow.toArray();
      const newAllow = newOverwrite.allow.toArray();
      const oldDeny = oldOverwrite.deny.toArray();
      const newDeny = newOverwrite.deny.toArray();
      
      const allowAdded = newAllow.filter(perm => !oldAllow.includes(perm));
      const allowRemoved = oldAllow.filter(perm => !newAllow.includes(perm));
      const denyAdded = newDeny.filter(perm => !oldDeny.includes(perm));
      const denyRemoved = oldDeny.filter(perm => !newDeny.includes(perm));
      
      if (allowAdded.length > 0 || allowRemoved.length > 0 || denyAdded.length > 0 || denyRemoved.length > 0) {
        changes.push({
          type: 'modified',
          target: newOverwrite,
          changes: {
            allowAdded,
            allowRemoved,
            denyAdded,
            denyRemoved
          }
        });
      }
    }
  });
  
  return changes;
}
async function getPermissionAuditLogEntry(guild, targetChannelId, maxAge = 10000) {
  try {
    const auditLogs = await guild.fetchAuditLogs({
      limit: 20
    });
    const permissionAuditTypes = [
      13,
      14, 
      15,
      11
    ];

    for (const entry of auditLogs.entries.values()) {
      const timeDiff = Date.now() - entry.createdTimestamp;
      if (timeDiff <= maxAge && 
          permissionAuditTypes.includes(entry.action) &&
          (entry.target?.id === targetChannelId || entry.extra?.channel?.id === targetChannelId)) {
        return entry;
      }
    }
    const generalEntry = auditLogs.entries.find(entry => {
      const timeDiff = Date.now() - entry.createdTimestamp;
      return timeDiff <= maxAge && 
             entry.action === 11 &&
             entry.target?.id === targetChannelId;
    });

    return generalEntry || null;
  } catch (error) {
    console.error('Error fetching permission audit logs:', error);
    return null;
  }
}
client.on(Events.ChannelUpdate, async (oldChannel, newChannel) => {
  if (!newChannel.guild) return;
  const permissionChanges = comparePermissionOverwrites(
    oldChannel.permissionOverwrites?.cache || new Map(),
    newChannel.permissionOverwrites?.cache || new Map()
  );
  
  if (permissionChanges.length > 0) {
    const auditEntry = await getPermissionAuditLogEntry(newChannel.guild, newChannel.id);
    
    const channelTypes = {
      0: 'Text Channel',
      1: 'DM',
      2: 'Voice Channel',
      3: 'Group DM',
      4: 'Category',
      5: 'News Channel',
      10: 'News Thread',
      11: 'Public Thread',
      12: 'Private Thread',
      13: 'Stage Voice',
      15: 'Forum Channel'
    };
    
    for (const change of permissionChanges) {
      const fields = [
        { name: 'Channel', value: `${newChannel.name} (${newChannel.id})`, inline: true },
        { name: 'Type', value: channelTypes[newChannel.type] || `Unknown (${newChannel.type})`, inline: true }
      ];
      let targetDisplay = '';
      if (change.target.type === 0) {
        const role = newChannel.guild.roles.cache.get(change.target.id);
        targetDisplay = role ? `@${role.name} (Role)` : `Unknown Role (${change.target.id})`;
      } else {
        try {
          const user = await client.users.fetch(change.target.id);
          targetDisplay = `${user.tag} (User)`;
        } catch (error) {
          targetDisplay = `Unknown User (${change.target.id})`;
        }
      }
      
      fields.push({ name: 'Target', value: targetDisplay, inline: true });
      if (auditEntry && auditEntry.executor) {
        fields.push({ name: 'Changed By', value: `${auditEntry.executor.tag} (${auditEntry.executor.id})`, inline: true });
        const auditActionNames = {
          11: 'Channel Update',
          13: 'Permission Override Create', 
          14: 'Permission Override Update',
          15: 'Permission Override Delete'
        };
        
        const actionName = auditActionNames[auditEntry.action] || `Action ${auditEntry.action}`;
        fields.push({ name: 'Audit Action', value: actionName, inline: true });
      } else {
        fields.push({ name: 'Changed By', value: 'Unknown (No audit log found)', inline: true });
        fields.push({ name: 'Debug', value: `Searched audit logs for channel ${newChannel.id}`, inline: true });
      }
      if (change.type === 'added') {
        fields.push({ name: 'Action', value: 'Permission Override Added', inline: false });
        
        if (change.changes.allow.length > 0) {
          fields.push({
            name: '✅ Allowed Permissions',
            value: change.changes.allow.map(formatPermissionName).join(', '),
            inline: false
          });
        }
        
        if (change.changes.deny.length > 0) {
          fields.push({
            name: '❌ Denied Permissions',
            value: change.changes.deny.map(formatPermissionName).join(', '),
            inline: false
          });
        }
        
      } else if (change.type === 'removed') {
        fields.push({ name: 'Action', value: 'Permission Override Removed', inline: false });
        
        if (change.changes.allow.length > 0) {
          fields.push({
            name: 'Previously Allowed',
            value: change.changes.allow.map(formatPermissionName).join(', '),
            inline: false
          });
        }
        
        if (change.changes.deny.length > 0) {
          fields.push({
            name: 'Previously Denied',
            value: change.changes.deny.map(formatPermissionName).join(', '),
            inline: false
          });
        }
        
      } else if (change.type === 'modified') {
        fields.push({ name: 'Action', value: 'Permission Override Modified', inline: false });
        
        const changeDescriptions = [];
        
        if (change.changes.allowAdded.length > 0) {
          changeDescriptions.push(`**✅ Permissions Allowed:** ${change.changes.allowAdded.map(formatPermissionName).join(', ')}`);
        }
        
        if (change.changes.allowRemoved.length > 0) {
          changeDescriptions.push(`**↩️ Allow Removed:** ${change.changes.allowRemoved.map(formatPermissionName).join(', ')}`);
        }
        
        if (change.changes.denyAdded.length > 0) {
          changeDescriptions.push(`**❌ Permissions Denied:** ${change.changes.denyAdded.map(formatPermissionName).join(', ')}`);
        }
        
        if (change.changes.denyRemoved.length > 0) {
          changeDescriptions.push(`**↩️ Deny Removed:** ${change.changes.denyRemoved.map(formatPermissionName).join(', ')}`);
        }
        
        fields.push({
          name: 'Changes',
          value: changeDescriptions.join('\n'),
          inline: false
        });
      }
      
      await logServerEvent(newChannel.guild, 'channel_permission_update', {
        title: '🔐 Channel Permissions Updated',
        fields: fields
      });
    }
  }
  const otherChanges = [];

  if (oldChannel.name !== newChannel.name) {
    otherChanges.push(`**Name:** ${oldChannel.name} → ${newChannel.name}`);
  }

  if (oldChannel.topic !== newChannel.topic) {
    otherChanges.push(`**Topic:** ${oldChannel.topic || 'None'} → ${newChannel.topic || 'None'}`);
  }

  if (oldChannel.nsfw !== newChannel.nsfw) {
    otherChanges.push(`**NSFW:** ${oldChannel.nsfw ? 'Yes' : 'No'} → ${newChannel.nsfw ? 'Yes' : 'No'}`);
  }

  if (oldChannel.parent?.id !== newChannel.parent?.id) {
    otherChanges.push(`**Category:** ${oldChannel.parent?.name || 'None'} → ${newChannel.parent?.name || 'None'}`);
  }

  if (otherChanges.length > 0) {
    const auditEntry = await getAuditLogEntry(newChannel.guild, 11, newChannel.id);

    const channelTypes = {
      0: 'Text Channel',
      1: 'DM',
      2: 'Voice Channel',
      3: 'Group DM',
      4: 'Category',
      5: 'News Channel',
      10: 'News Thread',
      11: 'Public Thread',
      12: 'Private Thread',
      13: 'Stage Voice',
      15: 'Forum Channel'
    };

    const fields = [
      { name: 'Channel', value: `${newChannel.name} (${newChannel.id})`, inline: true },
      { name: 'Type', value: channelTypes[newChannel.type] || `Unknown (${newChannel.type})`, inline: true }
    ];

    if (auditEntry && auditEntry.executor) {
      fields.push({ name: 'Updated By', value: `${auditEntry.executor.tag} (${auditEntry.executor.id})`, inline: true });
    }

    fields.push({ name: 'Changes', value: otherChanges.join('\n'), inline: false });

    await logServerEvent(newChannel.guild, 'channel_update', {
      title: '📝 Channel Updated',
      fields: fields
    });
  }
});
client.on(Events.GuildUpdate, async (oldGuild, newGuild) => {
  const changes = [];

  if (oldGuild.name !== newGuild.name) {
    changes.push(`**Name:** ${oldGuild.name} → ${newGuild.name}`);
  }

  if (oldGuild.description !== newGuild.description) {
    changes.push(`**Description:** ${oldGuild.description || 'None'} → ${newGuild.description || 'None'}`);
  }

  if (oldGuild.verificationLevel !== newGuild.verificationLevel) {
    const levels = ['None', 'Low', 'Medium', 'High', 'Very High'];
    changes.push(`**Verification Level:** ${levels[oldGuild.verificationLevel]} → ${levels[newGuild.verificationLevel]}`);
  }

  if (changes.length > 0) {
    await logServerEvent(newGuild, 'guild_update', {
      title: '🏠 Server Updated',
      fields: [
        { name: 'Changes', value: changes.join('\n'), inline: false }
      ]
    });
  }
});
client.on(Events.GuildBanAdd, async ban => {
  await logServerEvent(ban.guild, 'member_ban', {
    title: '🔨 Member Banned',
    fields: [
      { name: 'User', value: `${ban.user.tag} (${ban.user.id})`, inline: true },
      { name: 'Reason', value: ban.reason || 'No reason provided', inline: true }
    ]
  });
});

client.on(Events.GuildBanRemove, async ban => {
  await logServerEvent(ban.guild, 'member_unban', {
    title: '✅ Member Unbanned',
    fields: [
      { name: 'User', value: `${ban.user.tag} (${ban.user.id})`, inline: true }
    ]
  });
});
client.on(Events.InviteCreate, async invite => {
  await logServerEvent(invite.guild, 'invite_create', {
    title: '📨 Invite Created',
    fields: [
      { name: 'Code', value: invite.code, inline: true },
      { name: 'Channel', value: `${invite.channel.name} (${invite.channel.id})`, inline: true },
      { name: 'Creator', value: invite.inviter ? `${invite.inviter.tag} (${invite.inviter.id})` : 'Unknown', inline: true },
      { name: 'Max Uses', value: invite.maxUses === 0 ? 'Unlimited' : invite.maxUses.toString(), inline: true },
      { name: 'Expires', value: invite.expiresAt ? `<t:${Math.floor(invite.expiresAt.getTime() / 1000)}:R>` : 'Never', inline: true }
    ]
  });
});

client.on(Events.InviteDelete, async invite => {
  await logServerEvent(invite.guild, 'invite_delete', {
    title: '🗑️ Invite Deleted',
    fields: [
      { name: 'Code', value: invite.code, inline: true },
      { name: 'Channel', value: `${invite.channel.name} (${invite.channel.id})`, inline: true }
    ]
  });
});

// ============================================================================
// Command Registry 9/10
// ============================================================================
const globalCommands = [
  new SlashCommandBuilder()
  .setName('avatar')
  .setDescription('Display a user\'s avatar')
  .setDMPermission(true)
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user whose avatar to display (leave empty for your own)')
      .setRequired(false)),

new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Replies with Pong, along with other statistics!')
    .setDMPermission(true),

new SlashCommandBuilder()
  .setName('cmds')
  .setDescription('Shows all bot commands')
  .setDMPermission(true),

new SlashCommandBuilder()
  .setName('commands')
  .setDescription('Shows all bot commands')
  .setDMPermission(true),
  new SlashCommandBuilder()
  .setName('memberinfo')
  .setDescription('Show member info (creation/join dates, id, nickname, avatar)')
  .setDMPermission(true)
  .addUserOption(opt => opt.setName('user').setDescription('User to view').setRequired(false)),

new SlashCommandBuilder()
    .setName('about')
    .setDescription('Display information about the bot')
    .setDMPermission(true),
 new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show all bot commands')
    .setDMPermission(true),
new SlashCommandBuilder()
    .setName('status')
    .setDescription('View bot status and system information')
    .setDMPermission(true),
    
  new SlashCommandBuilder()
    .setName('support')
    .setDescription('View bot support server')
    .setDMPermission(true),
].map(cmd => cmd.toJSON());

const guildCommands = [
  new SlashCommandBuilder()
  .setName('afk')
  .setDescription('Set yourself as AFK')
  .addStringOption(option =>
    option
      .setName('reason')
      .setDescription('Reason for being AFK')
      .setRequired(false)),

    new SlashCommandBuilder()
  .setName('say')
  .setDescription('Make the bot say something')
  .addStringOption(option =>
    option.setName('content')
      .setDescription('The content to say')
      .setRequired(true)),
    
    new SlashCommandBuilder()
  .setName('case')
  .setDescription('Look up a specific moderation case by identifier.')
  .addStringOption(option =>
    option.setName('case_id')
      .setDescription('The case ID to look up')
      .setRequired(true)),
    
    new SlashCommandBuilder()
  .setName('setproof')
  .setDescription('Set or update proof for a moderation case')
  .addStringOption(option =>
    option.setName('case_id')
      .setDescription('The case ID to modify')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('proof')
      .setDescription('Proof text to attach to the case')
      .setRequired(true)),

  new SlashCommandBuilder()
  .setName('serverinfo')
  .setDescription('Show server info (creation date, owner, id, icon)')
  .setDMPermission(false),


new SlashCommandBuilder()
  .setName("nick")
  .setDescription("Change a user's nickname")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageNicknames)
  .addUserOption(option =>
    option.setName("user")
      .setDescription("The user to change nickname for")
      .setRequired(true))
  .addStringOption(option =>
    option.setName("nickname")
      .setDescription("The new nickname")
      .setRequired(true)),


new SlashCommandBuilder()
  .setName("nickname")
  .setDescription("Change a user's nickname (alias of /nick)")
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageNicknames)
  .addUserOption(option =>
    option.setName("user")
      .setDescription("The user to change nickname for")
      .setRequired(true))
  .addStringOption(option =>
    option.setName("nickname")
      .setDescription("The new nickname")
      .setRequired(true)),


  new SlashCommandBuilder()
  .setName('purge')
  .setDescription('Purge messages in a channel')
  .addIntegerOption(option =>
    option.setName('amount')
      .setDescription('The number of messages to purge (1-10000)')
      .setRequired(true)
      .setMinValue(1)
      .setMaxValue(10000))
  .addUserOption(option =>
    option.setName('user')
      .setDescription('Optional: only purge messages from this user')
      .setRequired(false)),


  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to warn')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the warning')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('proof')
        .setDescription('Proof/evidence for the warning')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('infract')
    .setDescription('Issue an infraction to a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to infract')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the infraction')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('proof')
        .setDescription('Proof/evidence for the infraction')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('note')
    .setDescription('Add a note/verbal warning for a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to add a note for')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the note')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('proof')
        .setDescription('Proof/evidence for the note')
        .setRequired(false)),
    
    new SlashCommandBuilder()
  .setName('role')
  .setDescription('Add or remove a role from a member')
  .addStringOption(opt => opt.setName('action').setDescription('add or remove').setRequired(true).addChoices({ name: 'add', value: 'add' }, { name: 'remove', value: 'remove' }))
  .addUserOption(opt => opt.setName('user').setDescription('User to modify').setRequired(true))
  .addRoleOption(opt => opt.setName('role').setDescription('Role to add/remove').setRequired(true)),

    
    new SlashCommandBuilder()
  .setName('editcase')
  .setDescription('Edit fields on a moderation case')
  .addStringOption(opt => opt.setName('case_id').setDescription('Case ID').setRequired(true))
  .addStringOption(opt => opt.setName('field').setDescription('Field to edit').setRequired(true)
    .addChoices(
      { name: 'reason', value: 'reason' },
      { name: 'proof', value: 'proof' },
      { name: 'duration', value: 'duration' },
      { name: 'voided', value: 'voided' },
      { name: 'moderator', value: 'moderator' },
      { name: 'target', value: 'target' }
    ))
  .addStringOption(opt => opt.setName('value').setDescription('New value').setRequired(true)),


  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Mute/timeout a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to mute')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('duration')
     .setDescription('Duration (e.g. 10m, 1h, 2d). Accepts s/m/h/d/w/mo/y')
     .setRequired(true))

    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the mute')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('proof')
        .setDescription('Proof/evidence for the mute')
        .setRequired(false)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to kick')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the kick')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('proof')
        .setDescription('Proof/evidence for the kick')
        .setRequired(false)),

  new SlashCommandBuilder()
  .setName('automod')
  .setDescription('Manage AutoMod rules and punishments')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
  .addSubcommand(subcommand =>
    subcommand
      .setName('create')
      .setDescription('Create a new AutoMod rule')
      .addStringOption(option =>
        option.setName('name')
          .setDescription('Name for the AutoMod rule')
          .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('delete')
      .setDescription('Delete an AutoMod rule')
      .addStringOption(option =>
        option.setName('rule_id')
          .setDescription('ID of the rule to delete')
          .setRequired(true)))
  .addSubcommand(subcommand =>
    subcommand
      .setName('assign')
      .setDescription('Assign a punishment to an AutoMod rule')
      .addStringOption(option =>
        option.setName('rule_id')
          .setDescription('ID of the rule')
          .setRequired(true))
      .addStringOption(option =>
        option.setName('punishment')
          .setDescription('Punishment to assign')
          .setRequired(true)
          .addChoices(
            { name: 'None', value: 'none' },
            { name: 'Note', value: 'note' },
            { name: 'Warning', value: 'warn' },
            { name: 'Kick', value: 'kick' },
            { name: 'Ban', value: 'ban' }
          )))
  .addSubcommand(subcommand =>
    subcommand
      .setName('view')
      .setDescription('View all AutoMod rules and their punishments')),

  new SlashCommandBuilder()
  .setName('schedulemsg')
  .setDescription('Schedule a message to be sent by the bot')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Channel to send the message in')
      .setRequired(true))
  .addStringOption(opt =>
  opt.setName('time')
     .setDescription('Duration (e.g. 10m, 1h, 2d). Accepts s/m/h/d/w/mo/y')
     .setRequired(true))
  .addStringOption(opt =>
    opt.setName('content')
      .setDescription('Message content to send')
      .setRequired(true)),

new SlashCommandBuilder()
  .setName('scheduledel')
  .setDescription('Delete scheduled messages')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
  .addStringOption(opt =>
  opt.setName('time')
     .setDescription('Duration (e.g. 10m, 1h, 2d). Accepts s/m/h/d/w/mo/y / deletes messages from the time stated')
     .setRequired(true))
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription('Filter: delete schedules from this user')
      .setRequired(false)),


new SlashCommandBuilder()
  .setName('schedulelist')
  .setDescription('List scheduled messages')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages)
  .addUserOption(opt =>
    opt.setName('user')
      .setDescription('Filter schedules by user')
      .setRequired(false))
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Filter schedules by channel')
      .setRequired(false)),


  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user')
    .addUserOption(option =>
      option.setName('user')
        .setDescription('The user to ban')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('reason')
        .setDescription('Reason for the ban')
        .setRequired(false))
    .addStringOption(option =>
      option.setName('proof')
        .setDescription('Proof/evidence for the ban')
        .setRequired(false)),
    new SlashCommandBuilder()
  .setName('membercount')
  .setDescription('Show total member count of the server'),


 new SlashCommandBuilder()
  .setName('voidcase')
  .setDescription('Void a moderation case')
  .addStringOption(option =>
    option.setName('case_id')
      .setDescription('The case ID to void')
      .setRequired(true))
  .addStringOption(option =>
    option.setName('reason')
      .setDescription('Reason for voiding the case')
      .setRequired(false)),


 new SlashCommandBuilder()
  .setName('cases')
  .setDescription('View moderation cases')
  .addUserOption(option =>
    option.setName('user')
      .setDescription('The user to check cases for (leave empty for all cases)')
      .setRequired(false)),

  new SlashCommandBuilder()
    .setName('appeal')
    .setDescription('Process an appeal for a moderation case')
    .addStringOption(option =>
      option.setName('case_id')
        .setDescription('The ID of the moderation case to appeal')
        .setRequired(true))
    .addStringOption(option =>
      option.setName('decision')
        .setDescription('The decision on the appeal (accept/deny)')
        .setRequired(true)
        .addChoices(
          { name: 'Accept', value: 'accept' },
          { name: 'Deny', value: 'deny' }
        ))
    .addStringOption(option =>
      option.setName('feedback')
        .setDescription('Feedback on the appeal')
        .setRequired(true)),

  new SlashCommandBuilder()
  .setName('remindme')
  .setDescription('Set a reminder for yourself')
  .addStringOption(opt =>
  opt.setName('time')
     .setDescription('Duration (e.g. 10m, 1h, 2d). Accepts s/m/h/d/w/mo/y')
     .setRequired(true))
  .addStringOption(opt =>
    opt.setName('content')
      .setDescription('What to remind you about')
      .setRequired(true)),

new SlashCommandBuilder()
  .setName('reminddel')
  .setDescription('Delete one of your reminders')
  .addStringOption(opt =>
    opt.setName('id')
      .setDescription('The reminder ID to delete')
      .setRequired(true)),

new SlashCommandBuilder()
  .setName('remindchange')
  .setDescription('Change one of your reminders')
  .addStringOption(opt =>
    opt.setName('id')
      .setDescription('The reminder ID to change')
      .setRequired(true))
  .addStringOption(opt =>
  opt.setName('time')
     .setDescription('Duration (e.g. 10m, 1h, 2d). Accepts s/m/h/d/w/mo/y')
     .setRequired(true))
  .addStringOption(opt =>
    opt.setName('content')
      .setDescription('New reminder text')
      .setRequired(true)),

new SlashCommandBuilder()
  .setName('remindlist')
  .setDescription('View your active reminders'),

  new SlashCommandBuilder()
  .setName('reset')
  .setDescription('Reset all bot settings and data for this server (owner only)')
  .addStringOption(opt =>
    opt.setName('action')
      .setDescription('Type "authorize" to confirm')
      .setRequired(false)
  ),


    
    new SlashCommandBuilder()
  .setName('debug')
  .setDescription('Debug a command')
  .addStringOption(opt => opt.setName('command').setDescription('Command to debug').setRequired(false)),
    
    new SlashCommandBuilder()
  .setName('verification')
  .setDescription('Send a verification button to a channel.')
  .addRoleOption(option =>
    option.setName('verifiedrole')
      .setDescription('The role users will get once verified')
      .setRequired(true)
  )
  .addChannelOption(option =>
    option.setName('channel')
      .setDescription('Channel to send the verification message in (defaults to current channel)')
      .setRequired(false)),

  new SlashCommandBuilder()
  .setName('immune')
  .setDescription('Toggle immunity for a user or role (prevents certain punishments)')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
  .addUserOption(option =>
    option.setName('user')
      .setDescription('User to toggle immunity for')
      .setRequired(true))

  .addStringOption(option =>
    option.setName('punishment')
      .setDescription('Punishment to toggle immunity for')
      .setRequired(true)
      .addChoices(
        { name: 'Note', value: 'note' },
        { name: 'Warn', value: 'warn' },
        { name: 'Infract', value: 'infract' },
        { name: 'Mute', value: 'mute' }))
  .addRoleOption(option =>
    option.setName('role')
      .setDescription('Role to toggle immunity for')
      .setRequired(false)),

new SlashCommandBuilder()
  .setName('immunes')
  .setDescription('List current immunities for this server')
  .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
  .addStringOption(option =>
    option.setName('filter')
      .setDescription('Optional: filter by punishment (note/warn/infract/mute)')
      .setRequired(true)),


new SlashCommandBuilder()
  .setName('set')
  .setDescription('Server configuration: choose a log type and channel')
  .addStringOption(opt =>
    opt.setName('log_type')
      .setDescription('The type of logs to configure (required)')
      .addChoices(
        { name: 'modlogs', value: 'modlogs' },
        { name: 'all.logs', value: 'all.logs' },
        { name: 'verification.logs', value: 'verification.logs' }
      )
      .setRequired(true)
  )
  .addChannelOption(opt =>
    opt.setName('channel')
      .setDescription('Channel to send logs to (required)')
      .setRequired(true)
  ),
  new SlashCommandBuilder()
    .setName('prefix')
    .setDescription('Change the bot\'s prefix for this server.')
    .addStringOption(option => 
        option.setName('new_prefix')
            .setDescription('The new prefix to set.')
            .setRequired(true)
    )


].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// ============================================================================
// Consolidated ClientReady Event
// ============================================================================
client.once(Events.ClientReady, async (readyClient) => {
    console.log(`✅ Logged in as ${readyClient.user.tag}`);
    await migrateOldRootFiles();
    await loadCasesFromFile();
    await loadServerPrefixes();
    await loadAutomodConfig();
    await loadServerLoggingChannels();
    await cleanupExpiredVoidedCases();
    await loadImmunes();
    await cleanupExpiredCases();
    await loadSchedules();
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: globalCommands }
        );
        console.log('Successfully reloaded GLOBAL commands.');
        for (const guild of client.guilds.cache.values()) {
            await rest.put(
                Routes.applicationGuildCommands(process.env.CLIENT_ID, guild.id),
                { body: guildCommands }
            );
            console.log(`Successfully reloaded GUILD commands for: ${guild.name}`);
        }

    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
    const guild = client.guilds.cache.get("1370896392901496952");
    if (!guild) return console.error("❌ Guild not found for status message.");

    const channel = guild.channels.cache.get("1416265046266478662");
    if (!channel || !channel.isTextBased()) {
        return console.error("❌ Status channel not found or invalid!");
    }

    try {
        const fetched = await channel.messages.fetch({ limit: 10 });
        const botMessages = fetched.filter(msg => msg.author.id === client.user.id);
        for (const msg of botMessages.values()) {
            await msg.delete().catch(() => {});
        }
        await channel.send({
            content: `# <a:y1:1378620542256414721> All systems operational!
**After *a brief debug testing session*, no errors have been found.**

## Updates;
- minor bug fixes
remind commands are fixed, added new time system;
1m for 1 minute
1h for 1 hour
1d for 1 day
etc...

## Coming Soon;
- New Ticketing system
- Advanced Custom Automod 

If you find an error, please open a <#1376450603068166165> ticket.
Date of last startup: <t:${Math.floor(Date.now() / 1000)}:F>

**Keep an eye out on this channel for more bot updates!**
-# shutdowns, restarts, bugs, data breaches, optimizations, security updates, and new commands will be hoisted here.`
        });

        console.log("📢 Startup message sent and old ones cleared.");
    } catch (err) {
        console.error("Error sending startup status:", err);
    }
setInterval(async () => {
    const now = Date.now();
    for (const [guildId, arr] of scheduledMessages) {
      const due = arr.filter(s => s.time <= now);
      if (due.length) {
        for (const s of due) {
          try {
            const guild = client.guilds.cache.get(guildId);
            if (!guild) continue;
            const channel = guild.channels.cache.get(s.channelId);
            if (channel && channel.isTextBased()) {
              await channel.send(s.content);
            }
          } catch (err) {
            console.error('Error sending scheduled message:', err);
          }
        }
        const newArr = arr.filter(s => s.time > now);
        scheduledMessages.set(guildId, newArr);
        await saveSchedules(guildId);
      }
    }
  }, 30_000);
  setInterval(async () => {
  const now = Date.now();
  for (const [guildId, arr] of reminders) {
    const due = arr.filter(r => r.time <= now);
    if (due.length) {
      for (const r of due) {
        try {
          const guild = client.guilds.cache.get(guildId);
          if (!guild) continue;
          const user = await client.users.fetch(r.userId).catch(() => null);
          if (user) {
            await user.send(`⏰ Reminder: ${r.content}`);
          }
        } catch (err) {
          console.error('Error delivering reminder:', err);
        }
      }
      const newArr = arr.filter(r => r.time > now);
      reminders.set(guildId, newArr);
    }
  }
}, 30_000);

const WORKER_INTERVAL_MS = 5000;

function startReminderWorker() {
  if (reminderWorker) return;
  reminderWorker = setInterval(async () => {
    try {
      const now = Date.now();
      for (const [guildId, list] of Array.from(reminders.entries())) {
        // iterate over a copy to avoid mutation issues
        for (const rem of [...list]) {
          if (!rem || !rem.timestamp) continue;
          if (rem.timestamp <= now) {
            try {
              const user = await client.users.fetch(rem.userId).catch(() => null);
              if (user) {
                await user.send(`🔔 Reminder: ${rem.text}`).catch(() => {});
              }
            } catch (err) {
              console.error('Reminder delivery error:', err);
            }
            // remove it whether send succeeded or not
            removeReminder(guildId, rem.id);
          }
        }
      }
    } catch (err) {
      console.error('Reminder worker error:', err);
    }
  }, WORKER_INTERVAL_MS);
}

function stopReminderWorker() {
  if (!reminderWorker) return;
  clearInterval(reminderWorker);
  reminderWorker = null;
}


});

// ============================================================================
// Login 10/10
// ============================================================================
client.login(process.env.TOKEN);
