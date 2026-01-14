import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Раздача статики (production)
app.use(express.static(path.join(__dirname, '../dist')));

// === PATHS ===
const DATA_DIR = path.join(__dirname, 'data');
const SERVERS_FILE = path.join(DATA_DIR, 'servers.json');

const STEAM_API_KEY = process.env.STEAM_API_KEY;

// === ENSURE DATA DIRECTORY EXISTS ===
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// === HELPER FUNCTIONS ===
const getServerDir = (serverId) => {
  const dir = path.join(DATA_DIR, serverId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
};

const loadJSON = (filePath, defaultValue = {}) => {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    console.error(`Error loading ${filePath}:`, e.message);
  }
  return defaultValue;
};

const saveJSON = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// === SERVERS DATA ===
const loadServers = () => loadJSON(SERVERS_FILE, { servers: {} });
const saveServers = (data) => saveJSON(SERVERS_FILE, data);

// === PER-SERVER DATA ===
const loadServerPlayers = (serverId) => {
  const file = path.join(getServerDir(serverId), 'players.json');
  return loadJSON(file, { players: {} });
};

const saveServerPlayers = (serverId, data) => {
  const file = path.join(getServerDir(serverId), 'players.json');
  saveJSON(file, data);
};

const loadServerChat = (serverId) => {
  const file = path.join(getServerDir(serverId), 'chat.json');
  return loadJSON(file, { messages: [] });
};

const saveServerChat = (serverId, data) => {
  const file = path.join(getServerDir(serverId), 'chat.json');
  // Limit to 5000 messages
  if (data.messages.length > 5000) {
    data.messages = data.messages.slice(-5000);
  }
  saveJSON(file, data);
};

const loadServerActivity = (serverId) => {
  const file = path.join(getServerDir(serverId), 'activity.json');
  return loadJSON(file, { logs: [] });
};

const saveServerActivity = (serverId, data) => {
  const file = path.join(getServerDir(serverId), 'activity.json');
  // Limit to 10000 logs
  if (data.logs.length > 10000) {
    data.logs = data.logs.slice(-10000);
  }
  saveJSON(file, data);
};

// Add activity log for specific server
const addServerActivityLog = (serverId, type, logData) => {
  const activity = loadServerActivity(serverId);
  activity.logs.push({
    id: crypto.randomUUID(),
    type,
    data: logData,
    timestamp: Date.now(),
    date: new Date().toISOString()
  });
  saveServerActivity(serverId, activity);
};

// Update player in server's database
const updatePlayerInServerDB = (serverId, playerData, serverName) => {
  const db = loadServerPlayers(serverId);
  const steamId = playerData.steam_id;
  const now = Date.now();
  
  if (!db.players[steamId]) {
    // New player
    db.players[steamId] = {
      steam_id: steamId,
      steam_name: playerData.name,
      first_seen: now,
      last_seen: now,
      total_connections: 1,
      total_playtime_seconds: 0,
      last_session_start: now,
      names_history: [{ name: playerData.name, date: now }],
      ips_history: [],
      notes: [],
      tags: [],
      is_banned: false,
      ban_reason: null,
      avatar: playerData.avatar || '',
      country: playerData.country || '',
      countryCode: playerData.countryCode || '',
      city: playerData.city || '',
      provider: playerData.provider || ''
    };
    
    addServerActivityLog(serverId, 'player_first_join', {
      steam_id: steamId,
      name: playerData.name,
      server: serverName,
      ip: playerData.ip
    });
  } else {
    const player = db.players[steamId];
    player.last_seen = now;
    
    if (player.steam_name !== playerData.name) {
      player.names_history.push({ name: playerData.name, date: now });
      addServerActivityLog(serverId, 'player_name_change', {
        steam_id: steamId,
        old_name: player.steam_name,
        new_name: playerData.name
      });
      player.steam_name = playerData.name;
    }
    
    if (playerData.avatar) player.avatar = playerData.avatar;
    if (playerData.country) player.country = playerData.country;
    if (playerData.countryCode) player.countryCode = playerData.countryCode;
    if (playerData.city) player.city = playerData.city;
    if (playerData.provider) player.provider = playerData.provider;
  }
  
  // Add IP if new
  if (playerData.ip) {
    const player = db.players[steamId];
    const existingIp = player.ips_history.find(h => h.ip === playerData.ip);
    if (!existingIp) {
      player.ips_history.push({
        ip: playerData.ip,
        first_seen: now,
        last_seen: now,
        country: playerData.country || '',
        city: playerData.city || '',
        provider: playerData.provider || ''
      });
    } else {
      existingIp.last_seen = now;
    }
  }
  
  // Update stats if provided
  if (playerData.stats) {
    const player = db.players[steamId];
    if (!player.stats) {
      player.stats = { kills: 0, deaths: 0, headshots: 0, bodyshots: 0, limbshots: 0, playtime_hours: 0, reports_count: 0, kd: 0 };
    }
    Object.assign(player.stats, playerData.stats);
    if (player.stats.deaths > 0) {
      player.stats.kd = Math.round((player.stats.kills / player.stats.deaths) * 100) / 100;
    }
  }
  
  saveServerPlayers(serverId, db);
  return db.players[steamId];
};

// Mark player disconnect
const markPlayerDisconnect = (serverId, steamId, serverName, reason) => {
  const db = loadServerPlayers(serverId);
  if (db.players[steamId]) {
    const player = db.players[steamId];
    const now = Date.now();
    
    if (player.last_session_start) {
      const sessionTime = Math.floor((now - player.last_session_start) / 1000);
      player.total_playtime_seconds += sessionTime;
      player.last_session_start = null;
    }
    
    player.last_seen = now;
    saveServerPlayers(serverId, db);
    
    addServerActivityLog(serverId, 'player_disconnect', {
      steam_id: steamId,
      name: player.steam_name,
      server: serverName,
      reason: reason || 'Unknown'
    });
  }
};


// === API ROUTES ===

// Get all servers
app.get('/api/servers', (req, res) => {
  const data = loadServers();
  const servers = Object.values(data.servers).map(s => ({
    ...s,
    lastUpdate: s.lastUpdate ? new Date(s.lastUpdate).toLocaleTimeString('ru') : null
  }));
  res.json(servers);
});

// Create server
app.post('/api/servers', (req, res) => {
  const { name, slug, website, logo } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  
  const id = crypto.randomUUID();
  const secretKey = crypto.randomBytes(32).toString('hex');
  const server = { 
    id, 
    name, 
    slug: slug || name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    website: website || '',
    logo: logo || '',
    secretKey, 
    hostname: '', 
    port: 0, 
    online: 0, 
    maxPlayers: 0, 
    lastUpdate: null, 
    status: 'offline', 
    players: [], 
    createdAt: Date.now() 
  };
  
  const data = loadServers();
  data.servers[id] = server;
  saveServers(data);
  
  // Create server data directory
  getServerDir(id);
  
  console.log('Server created:', server.name, server.id);
  res.json(server);
});

// Delete server
app.delete('/api/servers/:id', (req, res) => {
  const data = loadServers();
  const server = data.servers[req.params.id];
  if (server) {
    delete data.servers[req.params.id];
    saveServers(data);
    // Optionally delete server data directory
    // fs.rmSync(getServerDir(req.params.id), { recursive: true, force: true });
  }
  res.json({ success: true });
});

// Get server by ID or slug
app.get('/api/servers/:idOrSlug', (req, res) => {
  const data = loadServers();
  const server = Object.values(data.servers).find(s => 
    s.id === req.params.idOrSlug || s.slug === req.params.idOrSlug
  );
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  res.json(server);
});

// Plugin sends state
app.post('/api/state', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadServers();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const previousPlayers = new Set((server.players || []).map(p => p.steam_id));
  
  // hostname = IP адрес, name = название сервера
  server.hostname = req.body.hostname || server.hostname || '';
  if (req.body.name) server.name = req.body.name;
  server.port = req.body.port || 0;
  server.online = req.body.online || 0;
  server.maxPlayers = req.body.max_players || 0;
  server.lastUpdate = Date.now();
  server.status = 'online';
  
  const players = req.body.players || [];
  const currentPlayers = new Set(players.map(p => p.steam_id));
  const steamIds = players.map(p => p.steam_id).join(',');
  
  // Detect disconnects
  for (const prevSteamId of previousPlayers) {
    if (!currentPlayers.has(prevSteamId)) {
      markPlayerDisconnect(server.id, prevSteamId, server.name, 'Left server');
    }
  }
  
  // Detect connects
  for (const steamId of currentPlayers) {
    if (!previousPlayers.has(steamId)) {
      const player = players.find(p => p.steam_id === steamId);
      if (player) {
        addServerActivityLog(server.id, 'player_connect', {
          steam_id: steamId,
          name: player.name,
          server: server.name,
          ip: player.ip
        });
        
        const db = loadServerPlayers(server.id);
        if (db.players[steamId]) {
          db.players[steamId].total_connections++;
          db.players[steamId].last_session_start = Date.now();
          saveServerPlayers(server.id, db);
        }
      }
    }
  }
  
  // Get avatars via Steam API
  let avatars = {};
  if (steamIds && STEAM_API_KEY) {
    try {
      const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamIds}`);
      const steamData = await steamRes.json();
      steamData.response?.players?.forEach(p => { avatars[p.steamid] = p.avatarfull; });
    } catch {}
  }
  
  // Geolocation and avatars
  for (const p of players) {
    p.avatar = avatars[p.steam_id] || p.avatar || '';
    if (p.ip && !p.country) {
      try {
        const geo = await fetch(`http://ip-api.com/json/${p.ip}?fields=country,city,isp,countryCode`);
        const info = await geo.json();
        p.country = info.country || '';
        p.countryCode = (info.countryCode || '').toLowerCase();
        p.city = info.city || '';
        p.provider = info.isp || '';
      } catch {}
    }
    
    updatePlayerInServerDB(server.id, p, server.name);
  }
  server.players = players;
  
  saveServers(data);
  res.json({ success: true });
});

// Sync all players from plugin
app.post('/api/sync', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadServers();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const players = req.body.players || [];
  
  // Get avatars
  let avatars = {};
  if (STEAM_API_KEY) {
    const allSteamIds = players.map(p => p.steam_id);
    for (let i = 0; i < allSteamIds.length; i += 100) {
      const batch = allSteamIds.slice(i, i + 100).join(',');
      try {
        const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${batch}`);
        const steamData = await steamRes.json();
        steamData.response?.players?.forEach(p => { avatars[p.steamid] = p.avatarfull; });
      } catch {}
    }
  }
  
  let added = 0, updated = 0;
  const db = loadServerPlayers(server.id);
  
  for (const p of players) {
    p.avatar = avatars[p.steam_id] || p.avatar || '';
    
    if (p.ip && p.online && !p.country) {
      try {
        const geo = await fetch(`http://ip-api.com/json/${p.ip}?fields=country,city,isp,countryCode`);
        const info = await geo.json();
        p.country = info.country || '';
        p.countryCode = (info.countryCode || '').toLowerCase();
        p.city = info.city || '';
        p.provider = info.isp || '';
      } catch {}
    }
    
    if (!db.players[p.steam_id]) added++;
    else updated++;
    
    updatePlayerInServerDB(server.id, p, server.name);
  }
  
  addServerActivityLog(server.id, 'server_sync', {
    server: server.name,
    total: players.length,
    added,
    updated
  });
  
  console.log(`Sync from ${server.name}: ${players.length} players (${added} new, ${updated} updated)`);
  res.json({ success: true, added, updated, total: players.length });
});


// === PLAYERS API (per server) ===

// Get online players for a server
app.get('/api/servers/:serverId/players', (req, res) => {
  const data = loadServers();
  const server = data.servers[req.params.serverId];
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  res.json(server.players || []);
});

// Get all players from server database (including offline)
app.get('/api/servers/:serverId/players/all', async (req, res) => {
  const db = loadServerPlayers(req.params.serverId);
  let players = Object.values(db.players).map(p => ({
    ...p,
    playtime_hours: Math.round(p.total_playtime_seconds / 3600 * 10) / 10
  }));
  
  players.sort((a, b) => b.last_seen - a.last_seen);
  
  // Load avatars for players without one
  const playersWithoutAvatar = players.filter(p => !p.avatar).slice(0, 50);
  if (playersWithoutAvatar.length > 0 && STEAM_API_KEY) {
    const steamIds = playersWithoutAvatar.map(p => p.steam_id).join(',');
    try {
      const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamIds}`);
      const steamData = await steamRes.json();
      steamData.response?.players?.forEach(sp => {
        if (db.players[sp.steamid]) {
          db.players[sp.steamid].avatar = sp.avatarfull;
          const idx = players.findIndex(p => p.steam_id === sp.steamid);
          if (idx !== -1) players[idx].avatar = sp.avatarfull;
        }
      });
      saveServerPlayers(req.params.serverId, db);
    } catch {}
  }
  
  res.json(players);
});

// Get player by steam_id from server
app.get('/api/servers/:serverId/players/:steamId', async (req, res) => {
  const db = loadServerPlayers(req.params.serverId);
  const player = db.players[req.params.steamId];
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  if (!player.avatar && STEAM_API_KEY) {
    try {
      const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${req.params.steamId}`);
      const steamData = await steamRes.json();
      const sp = steamData.response?.players?.[0];
      if (sp) {
        player.avatar = sp.avatarfull;
        saveServerPlayers(req.params.serverId, db);
      }
    } catch {}
  }
  
  res.json({
    ...player,
    playtime_hours: Math.round(player.total_playtime_seconds / 3600 * 10) / 10
  });
});

// Search players in server
app.get('/api/servers/:serverId/players/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  
  const db = loadServerPlayers(req.params.serverId);
  const query = q.toLowerCase();
  
  const results = Object.values(db.players).filter(p => {
    if (p.steam_name.toLowerCase().includes(query)) return true;
    if (p.steam_id.includes(query)) return true;
    if (p.names_history?.some(h => h.name.toLowerCase().includes(query))) return true;
    if (p.ips_history?.some(h => h.ip.includes(query))) return true;
    return false;
  });
  
  res.json(results.slice(0, 50));
});

// Add note to player
app.post('/api/servers/:serverId/players/:steamId/note', (req, res) => {
  const db = loadServerPlayers(req.params.serverId);
  const player = db.players[req.params.steamId];
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const { text, author } = req.body;
  if (!player.notes) player.notes = [];
  player.notes.push({
    id: crypto.randomUUID(),
    text,
    author: author || 'Admin',
    date: Date.now()
  });
  
  saveServerPlayers(req.params.serverId, db);
  res.json({ success: true });
});

// Add/remove tag
app.post('/api/servers/:serverId/players/:steamId/tag', (req, res) => {
  const db = loadServerPlayers(req.params.serverId);
  const player = db.players[req.params.steamId];
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const { tag } = req.body;
  if (!player.tags) player.tags = [];
  if (!player.tags.includes(tag)) {
    player.tags.push(tag);
    saveServerPlayers(req.params.serverId, db);
  }
  
  res.json({ success: true });
});

app.delete('/api/servers/:serverId/players/:steamId/tag/:tag', (req, res) => {
  const db = loadServerPlayers(req.params.serverId);
  const player = db.players[req.params.steamId];
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  player.tags = (player.tags || []).filter(t => t !== req.params.tag);
  saveServerPlayers(req.params.serverId, db);
  
  res.json({ success: true });
});

// === CHAT API (per server) ===

// Get chat messages for server
app.get('/api/servers/:serverId/chat', (req, res) => {
  const { limit = 100, before, player } = req.query;
  const chat = loadServerChat(req.params.serverId);
  
  let messages = chat.messages;
  
  // Filter by player steam_id
  if (player) {
    messages = messages.filter(m => m.steam_id === player);
  }
  
  if (before) {
    messages = messages.filter(m => m.timestamp < Number(before));
  }
  
  messages = messages.slice(-Number(limit));
  res.json(messages);
});

// Plugin sends chat message (supports both single message and batch from PanRust)
app.post('/api/chat', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadServers();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const chat = loadServerChat(server.id);
  
  // Support batch messages from PanRust plugin: { messages: [...], server: ... }
  if (req.body.messages && Array.isArray(req.body.messages)) {
    for (const msg of req.body.messages) {
      chat.messages.push({
        id: crypto.randomUUID(),
        steam_id: msg.si || msg.steam_id,
        name: msg.n || msg.name,
        message: msg.m || msg.message,
        team: msg.t || msg.team || false,
        avatar: msg.avatar || '',
        timestamp: msg.ts || Date.now(),
        server: server.name
      });
    }
  } else {
    // Single message format
    const { steam_id, name, message, team, avatar } = req.body;
    chat.messages.push({
      id: crypto.randomUUID(),
      steam_id,
      name,
      message,
      team: team || false,
      avatar: avatar || '',
      timestamp: Date.now(),
      server: server.name
    });
  }
  
  saveServerChat(server.id, chat);
  res.json({ success: true });
});

// === ACTIVITY API (per server) ===

app.get('/api/servers/:serverId/activity', (req, res) => {
  const { type, steam_id, limit = 100, offset = 0 } = req.query;
  const activity = loadServerActivity(req.params.serverId);
  
  let logs = activity.logs;
  
  if (type) {
    logs = logs.filter(l => l.type === type);
  }
  
  if (steam_id) {
    logs = logs.filter(l => l.data?.steam_id === steam_id);
  }
  
  logs.sort((a, b) => b.timestamp - a.timestamp);
  
  const total = logs.length;
  logs = logs.slice(Number(offset), Number(offset) + Number(limit));
  
  res.json({ logs, total });
});

// === STEAM INFO ===

app.get('/api/player/:steamId/steam', async (req, res) => {
  const { steamId } = req.params;
  
  if (!STEAM_API_KEY) {
    return res.status(500).json({ error: 'Steam API key not configured' });
  }
  
  try {
    const [profileRes, bansRes, gamesRes] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`),
      fetch(`https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${STEAM_API_KEY}&steamids=${steamId}`),
      fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&include_played_free_games=1&appids_filter[0]=252490`).catch(() => null)
    ]);
    
    const profileData = await profileRes.json();
    const steamPlayer = profileData.response?.players?.[0];
    
    if (!steamPlayer) {
      return res.json({ error: 'Player not found' });
    }

    const bansData = await bansRes.json();
    const bans = bansData.players?.[0];

    let rustHours = null;
    if (gamesRes) {
      try {
        const gamesData = await gamesRes.json();
        const rustGame = gamesData.response?.games?.find(g => g.appid === 252490);
        if (rustGame) rustHours = Math.round(rustGame.playtime_forever / 60);
      } catch {}
    }

    const privacyStates = { 1: 'Профиль скрыт', 2: 'Только друзья', 3: 'Публичный' };

    res.json({
      steamId: steamPlayer.steamid,
      personaName: steamPlayer.personaname,
      avatar: steamPlayer.avatarfull,
      profileUrl: steamPlayer.profileurl,
      privacy: privacyStates[steamPlayer.communityvisibilitystate] || 'Неизвестно',
      isPrivate: steamPlayer.communityvisibilitystate !== 3,
      accountCreated: steamPlayer.timecreated ? new Date(steamPlayer.timecreated * 1000).toISOString() : null,
      rustHours,
      vacBans: bans?.NumberOfVACBans || 0,
      gameBans: bans?.NumberOfGameBans || 0,
      daysSinceLastBan: bans?.DaysSinceLastBan || null,
      communityBanned: bans?.CommunityBanned || false
    });
  } catch (err) {
    console.error('Steam API error:', err);
    res.status(500).json({ error: 'Steam API error' });
  }
});


// === PLUGIN COMMANDS (mute, ban, kick, etc.) ===

// Commands queue per server
const getCommandsFile = (serverId) => path.join(getServerDir(serverId), 'commands.json');

const loadCommands = (serverId) => loadJSON(getCommandsFile(serverId), { commands: [] });
const saveCommands = (serverId, data) => saveJSON(getCommandsFile(serverId), data);

// Plugin fetches commands
app.get('/api/cmd', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadServers();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const cmds = loadCommands(server.id);
  const pending = cmds.commands.filter(c => !c.executed);
  
  // Mark as executed
  pending.forEach(c => c.executed = true);
  saveCommands(server.id, cmds);
  
  res.json(pending);
});

// Web sends command to server
app.post('/api/servers/:serverId/cmd', (req, res) => {
  const { type, target_steam_id, steam_id, reason, duration, broadcast, admin, message, is_global } = req.body;
  
  const cmds = loadCommands(req.params.serverId);
  const cmd = {
    id: crypto.randomUUID(),
    type,
    target_steam_id: target_steam_id || steam_id,
    steam_id: target_steam_id || steam_id,
    reason: reason || '',
    duration: duration || '',
    broadcast: broadcast || false,
    message: message || '',
    is_global: is_global || false,
    admin: admin || 'Admin',
    timestamp: Date.now(),
    executed: false,
    // For mute - calculate expired_at
    expired_at: type === 'mute' ? calculateExpiredAt(duration) : 0
  };
  
  cmds.commands.push(cmd);
  
  // Keep only last 1000 commands
  if (cmds.commands.length > 1000) {
    cmds.commands = cmds.commands.slice(-1000);
  }
  
  saveCommands(req.params.serverId, cmds);
  
  // Log the action
  addServerActivityLog(req.params.serverId, `player_${type}`, {
    steam_id: target_steam_id || steam_id,
    reason,
    duration,
    admin
  });
  
  res.json({ success: true, command: cmd });
});

// Helper to calculate expired_at from duration string
function calculateExpiredAt(duration) {
  if (!duration || duration === '0') return 0; // permanent
  
  const now = Date.now();
  const match = duration.match(/^(\d+)([mhdwy])$/);
  if (!match) return 0;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  const multipliers = {
    'm': 60 * 1000,           // minutes
    'h': 60 * 60 * 1000,      // hours
    'd': 24 * 60 * 60 * 1000, // days
    'w': 7 * 24 * 60 * 60 * 1000, // weeks
    'y': 365 * 24 * 60 * 60 * 1000 // years
  };
  
  return now + (value * (multipliers[unit] || 0));
}

// === BANS & MUTES (per server) ===

const getBansFile = (serverId) => path.join(getServerDir(serverId), 'bans.json');
const getMutesFile = (serverId) => path.join(getServerDir(serverId), 'mutes.json');

const loadBans = (serverId) => loadJSON(getBansFile(serverId), { bans: [] });
const saveBans = (serverId, data) => saveJSON(getBansFile(serverId), data);

const loadMutes = (serverId) => loadJSON(getMutesFile(serverId), { mutes: [] });
const saveMutes = (serverId, data) => saveJSON(getMutesFile(serverId), data);

// Get bans
app.get('/api/servers/:serverId/bans', (req, res) => {
  const bans = loadBans(req.params.serverId);
  res.json(bans.bans);
});

// Add ban
app.post('/api/servers/:serverId/bans', (req, res) => {
  const { steam_id, name, reason, duration, admin } = req.body;
  
  const bans = loadBans(req.params.serverId);
  const ban = {
    id: crypto.randomUUID(),
    steam_id,
    name: name || 'Unknown',
    reason: reason || 'Нарушение правил',
    duration: duration || 0, // 0 = permanent
    admin: admin || 'Admin',
    timestamp: Date.now(),
    expires: duration ? Date.now() + duration * 1000 : null
  };
  
  bans.bans.push(ban);
  saveBans(req.params.serverId, bans);
  
  res.json(ban);
});

// Remove ban
app.delete('/api/servers/:serverId/bans/:banId', (req, res) => {
  const bans = loadBans(req.params.serverId);
  // Ищем по id или по steam_id
  bans.bans = bans.bans.filter(b => b.id !== req.params.banId && b.steam_id !== req.params.banId);
  saveBans(req.params.serverId, bans);
  res.json({ success: true });
});

// Get mutes
app.get('/api/servers/:serverId/mutes', (req, res) => {
  const mutes = loadMutes(req.params.serverId);
  // Filter out expired mutes
  const now = Date.now();
  const activeMutes = mutes.mutes.filter(m => !m.expires || m.expires > now);
  res.json(activeMutes);
});

// Add mute
app.post('/api/servers/:serverId/mutes', (req, res) => {
  const { steam_id, name, reason, duration, admin } = req.body;
  
  const mutes = loadMutes(req.params.serverId);
  const mute = {
    id: crypto.randomUUID(),
    steam_id,
    name: name || 'Unknown',
    reason: reason || 'Нарушение правил чата',
    duration: duration || 3600, // default 1 hour
    admin: admin || 'Admin',
    timestamp: Date.now(),
    expires: Date.now() + (duration || 3600) * 1000
  };
  
  mutes.mutes.push(mute);
  saveMutes(req.params.serverId, mutes);
  
  res.json(mute);
});

// Remove mute
app.delete('/api/servers/:serverId/mutes/:muteId', (req, res) => {
  const mutes = loadMutes(req.params.serverId);
  // Ищем по id или по steam_id
  mutes.mutes = mutes.mutes.filter(m => m.id !== req.params.muteId && m.steam_id !== req.params.muteId);
  saveMutes(req.params.serverId, mutes);
  res.json({ success: true });
});

// === KILLS API ===

app.post('/api/kills', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadServers();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const kills = req.body.kills || [req.body];
  
  for (const kill of kills) {
    addServerActivityLog(server.id, 'player_kill', {
      killer_steam_id: kill.killer_steam_id || kill.k,
      killer_name: kill.killer_name || kill.kn,
      victim_steam_id: kill.victim_steam_id || kill.v,
      victim_name: kill.victim_name || kill.vn,
      weapon: kill.weapon || kill.w,
      distance: kill.distance || kill.d,
      is_headshot: kill.is_headshot || kill.hs,
      server: server.name
    });
  }
  
  res.json({ success: true, count: kills.length });
});

app.get('/api/servers/:serverId/kills', (req, res) => {
  const { steam_id, limit = 50 } = req.query;
  const activity = loadServerActivity(req.params.serverId);
  
  let kills = activity.logs.filter(l => l.type === 'player_kill');
  
  if (steam_id) {
    kills = kills.filter(k => 
      k.data?.killer_steam_id === steam_id || k.data?.victim_steam_id === steam_id
    );
  }
  
  kills.sort((a, b) => b.timestamp - a.timestamp);
  res.json(kills.slice(0, Number(limit)));
});

// === LEGACY COMPATIBILITY ===
// Keep old endpoints working but redirect to server-specific ones

app.get('/api/players', (req, res) => {
  // Return online players from all servers
  const data = loadServers();
  const players = Object.values(data.servers).flatMap(s => 
    (s.players || []).map(p => ({ ...p, serverName: s.name, serverId: s.id }))
  );
  res.json(players);
});

app.get('/api/players/all', async (req, res) => {
  // Return all players from all servers (for backward compatibility)
  const data = loadServers();
  let allPlayers = [];
  
  for (const server of Object.values(data.servers)) {
    const db = loadServerPlayers(server.id);
    const players = Object.values(db.players).map(p => ({
      ...p,
      serverId: server.id,
      serverName: server.name
    }));
    allPlayers = allPlayers.concat(players);
  }
  
  // Remove duplicates by steam_id (keep most recent)
  const uniquePlayers = {};
  for (const p of allPlayers) {
    if (!uniquePlayers[p.steam_id] || p.last_seen > uniquePlayers[p.steam_id].last_seen) {
      uniquePlayers[p.steam_id] = p;
    }
  }
  
  res.json(Object.values(uniquePlayers).sort((a, b) => b.last_seen - a.last_seen));
});

// === WEB CHAT SEND (admin sends message to game) ===
app.post('/api/chat/send', (req, res) => {
  const { target_steam_id, message, is_global, server_id } = req.body;
  
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  // Find server to send command to
  const data = loadServers();
  let targetServerId = server_id;
  
  // If no server specified, use first available server
  if (!targetServerId) {
    const servers = Object.values(data.servers);
    if (servers.length === 0) {
      return res.status(400).json({ error: 'No servers available' });
    }
    targetServerId = servers[0].id;
  }
  
  const server = data.servers[targetServerId];
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  // Add command to queue for plugin to fetch
  const cmds = loadCommands(targetServerId);
  const cmd = {
    id: crypto.randomUUID(),
    type: 'chat_message',
    target_steam_id: target_steam_id || null,
    message: message.trim(),
    is_global: is_global !== false,
    timestamp: Date.now(),
    executed: false
  };
  
  cmds.commands.push(cmd);
  saveCommands(targetServerId, cmds);
  
  res.json({ success: true, command: cmd });
});

// === SERVERS CHAT SEND (per server) ===
app.post('/api/servers/:serverId/chat/send', (req, res) => {
  const { target_steam_id, message, is_global } = req.body;
  const serverId = req.params.serverId;
  
  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  const data = loadServers();
  const server = data.servers[serverId];
  if (!server) {
    return res.status(404).json({ error: 'Server not found' });
  }
  
  // Add command to queue for plugin to fetch
  const cmds = loadCommands(serverId);
  const cmd = {
    id: crypto.randomUUID(),
    type: 'chat_message',
    target_steam_id: target_steam_id || null,
    message: message.trim(),
    is_global: is_global !== false,
    timestamp: Date.now(),
    executed: false
  };
  
  cmds.commands.push(cmd);
  saveCommands(serverId, cmds);
  
  // Also save to chat history so it appears in web interface
  const chat = loadServerChat(serverId);
  chat.messages.push({
    id: crypto.randomUUID(),
    steam_id: 'admin',
    name: '[Админ]',
    message: target_steam_id ? `[ЛС → ${target_steam_id}] ${message.trim()}` : message.trim(),
    team: false,
    avatar: '',
    timestamp: Date.now(),
    server: server.name,
    is_admin: true
  });
  saveServerChat(serverId, chat);
  
  res.json({ success: true, command: cmd });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
