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
app.use(express.json());

// Раздача статики (production)
app.use(express.static(path.join(__dirname, '../dist')));

const DATA_FILE = './data.json';
const PLAYERS_DB_FILE = './players_db.json';
const ACTIVITY_LOG_FILE = './activity_log.json';

// === DATA LOADERS ===
const loadData = () => {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { servers: {} }; }
};
const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// База данных игроков (все кто когда-либо заходил)
const loadPlayersDB = () => {
  try { return JSON.parse(fs.readFileSync(PLAYERS_DB_FILE, 'utf8')); }
  catch { return { players: {} }; }
};
const savePlayersDB = (data) => fs.writeFileSync(PLAYERS_DB_FILE, JSON.stringify(data, null, 2));

// Лог активности
const loadActivityLog = () => {
  try { return JSON.parse(fs.readFileSync(ACTIVITY_LOG_FILE, 'utf8')); }
  catch { return { logs: [] }; }
};
const saveActivityLog = (data) => {
  // Храним только последние 10000 записей
  if (data.logs.length > 10000) {
    data.logs = data.logs.slice(-10000);
  }
  fs.writeFileSync(ACTIVITY_LOG_FILE, JSON.stringify(data, null, 2));
};

// Добавить запись в лог
const addActivityLog = (type, data) => {
  const logs = loadActivityLog();
  logs.logs.push({
    id: crypto.randomUUID(),
    type,
    data,
    timestamp: Date.now(),
    date: new Date().toISOString()
  });
  saveActivityLog(logs);
};

// Обновить или создать игрока в базе
const updatePlayerInDB = (playerData, serverName) => {
  const db = loadPlayersDB();
  const steamId = playerData.steam_id;
  
  const now = Date.now();
  
  if (!db.players[steamId]) {
    // Новый игрок
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
      servers_played: [serverName],
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
    
    addActivityLog('player_first_join', {
      steam_id: steamId,
      name: playerData.name,
      server: serverName,
      ip: playerData.ip
    });
  } else {
    // Существующий игрок
    const player = db.players[steamId];
    player.last_seen = now;
    
    // Обновляем имя если изменилось
    if (player.steam_name !== playerData.name) {
      player.names_history.push({ name: playerData.name, date: now });
      addActivityLog('player_name_change', {
        steam_id: steamId,
        old_name: player.steam_name,
        new_name: playerData.name
      });
      player.steam_name = playerData.name;
    }
    
    // Обновляем аватар и гео
    if (playerData.avatar) player.avatar = playerData.avatar;
    if (playerData.country) player.country = playerData.country;
    if (playerData.countryCode) player.countryCode = playerData.countryCode;
    if (playerData.city) player.city = playerData.city;
    if (playerData.provider) player.provider = playerData.provider;
    
    // Добавляем сервер если новый
    if (!player.servers_played.includes(serverName)) {
      player.servers_played.push(serverName);
    }
  }
  
  // Добавляем IP если новый
  if (playerData.ip && playerData.ip !== '') {
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
      addActivityLog('player_new_ip', {
        steam_id: steamId,
        name: playerData.name,
        ip: playerData.ip,
        country: playerData.country
      });
    } else {
      existingIp.last_seen = now;
    }
  }
  
  savePlayersDB(db);
  return db.players[steamId];
};

// Отметить отключение игрока
const markPlayerDisconnect = (steamId, serverName, reason) => {
  const db = loadPlayersDB();
  if (db.players[steamId]) {
    const player = db.players[steamId];
    const now = Date.now();
    
    // Считаем время сессии
    if (player.last_session_start) {
      const sessionTime = Math.floor((now - player.last_session_start) / 1000);
      player.total_playtime_seconds += sessionTime;
      player.last_session_start = null;
    }
    
    player.last_seen = now;
    savePlayersDB(db);
    
    addActivityLog('player_disconnect', {
      steam_id: steamId,
      name: player.steam_name,
      server: serverName,
      reason: reason || 'Unknown'
    });
  }
};

const STEAM_API_KEY = process.env.STEAM_API_KEY;

// === API ROUTES ===

// Get all servers
app.get('/api/servers', (req, res) => {
  const data = loadData();
  const servers = Object.values(data.servers).map(s => ({
    ...s,
    lastUpdate: s.lastUpdate ? new Date(s.lastUpdate).toLocaleTimeString('ru') : null
  }));
  res.json(servers);
});

// Create server
app.post('/api/servers', (req, res) => {
  console.log('POST /api/servers', req.body);
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  
  const id = crypto.randomUUID();
  const secretKey = crypto.randomBytes(32).toString('hex');
  const server = { id, name, secretKey, hostname: '', port: 0, online: 0, maxPlayers: 0, lastUpdate: null, status: 'offline', players: [], createdAt: Date.now() };
  
  const data = loadData();
  data.servers[id] = server;
  saveData(data);
  
  addActivityLog('server_created', { id, name });
  
  console.log('Server created:', server.name, server.id);
  res.json(server);
});

// Delete server
app.delete('/api/servers/:id', (req, res) => {
  const data = loadData();
  const server = data.servers[req.params.id];
  if (server) {
    addActivityLog('server_deleted', { id: req.params.id, name: server.name });
  }
  delete data.servers[req.params.id];
  saveData(data);
  res.json({ success: true });
});

// Plugin sends state
app.post('/api/state', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadData();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const previousPlayers = new Set((server.players || []).map(p => p.steam_id));
  
  server.hostname = req.body.hostname || server.name;
  server.port = req.body.port || 0;
  server.online = req.body.online || 0;
  server.maxPlayers = req.body.max_players || 0;
  server.lastUpdate = Date.now();
  server.status = 'online';
  
  const players = req.body.players || [];
  const currentPlayers = new Set(players.map(p => p.steam_id));
  const steamIds = players.map(p => p.steam_id).join(',');
  
  // Определяем кто вышел
  for (const prevSteamId of previousPlayers) {
    if (!currentPlayers.has(prevSteamId)) {
      markPlayerDisconnect(prevSteamId, server.name, 'Left server');
    }
  }
  
  // Определяем кто зашёл
  for (const steamId of currentPlayers) {
    if (!previousPlayers.has(steamId)) {
      const player = players.find(p => p.steam_id === steamId);
      if (player) {
        addActivityLog('player_connect', {
          steam_id: steamId,
          name: player.name,
          server: server.name,
          ip: player.ip
        });
        
        // Увеличиваем счётчик подключений
        const db = loadPlayersDB();
        if (db.players[steamId]) {
          db.players[steamId].total_connections++;
          db.players[steamId].last_session_start = Date.now();
          savePlayersDB(db);
        }
      }
    }
  }
  
  // Получаем аватары через Steam API
  let avatars = {};
  if (steamIds && STEAM_API_KEY) {
    try {
      const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamIds}`);
      const steamData = await steamRes.json();
      steamData.response?.players?.forEach(p => { avatars[p.steamid] = p.avatarfull; });
    } catch {}
  }
  
  // Геолокация и аватары
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
    
    // Обновляем игрока в базе
    updatePlayerInDB(p, server.name);
  }
  server.players = players;
  
  saveData(data);
  res.json({ success: true });
});

// Get players (online on all servers)
app.get('/api/players', (req, res) => {
  const data = loadData();
  const players = Object.values(data.servers).flatMap(s => 
    (s.players || []).map(p => ({ ...p, serverName: s.name, serverStatus: s.status }))
  );
  res.json(players);
});

// Get all players from database (including offline)
app.get('/api/players/all', (req, res) => {
  const db = loadPlayersDB();
  const players = Object.values(db.players).map(p => ({
    ...p,
    playtime_hours: Math.round(p.total_playtime_seconds / 3600 * 10) / 10
  }));
  
  // Сортируем по последнему визиту
  players.sort((a, b) => b.last_seen - a.last_seen);
  
  res.json(players);
});

// Get player by steam_id
app.get('/api/players/db/:steamId', (req, res) => {
  const db = loadPlayersDB();
  const player = db.players[req.params.steamId];
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  res.json({
    ...player,
    playtime_hours: Math.round(player.total_playtime_seconds / 3600 * 10) / 10
  });
});

// Search players in database
app.get('/api/players/search', (req, res) => {
  const { q } = req.query;
  if (!q) return res.json([]);
  
  const db = loadPlayersDB();
  const query = q.toLowerCase();
  
  const results = Object.values(db.players).filter(p => {
    // Поиск по имени
    if (p.steam_name.toLowerCase().includes(query)) return true;
    // Поиск по steam_id
    if (p.steam_id.includes(query)) return true;
    // Поиск по истории имён
    if (p.names_history.some(h => h.name.toLowerCase().includes(query))) return true;
    // Поиск по IP
    if (p.ips_history.some(h => h.ip.includes(query))) return true;
    return false;
  });
  
  res.json(results.slice(0, 50));
});

// Add note to player
app.post('/api/players/db/:steamId/note', (req, res) => {
  const db = loadPlayersDB();
  const player = db.players[req.params.steamId];
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const { text, author } = req.body;
  player.notes.push({
    id: crypto.randomUUID(),
    text,
    author: author || 'Admin',
    date: Date.now()
  });
  
  savePlayersDB(db);
  addActivityLog('player_note_added', {
    steam_id: req.params.steamId,
    name: player.steam_name,
    note: text
  });
  
  res.json({ success: true });
});

// Add tag to player
app.post('/api/players/db/:steamId/tag', (req, res) => {
  const db = loadPlayersDB();
  const player = db.players[req.params.steamId];
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  const { tag } = req.body;
  if (!player.tags.includes(tag)) {
    player.tags.push(tag);
    savePlayersDB(db);
  }
  
  res.json({ success: true });
});

// Remove tag from player
app.delete('/api/players/db/:steamId/tag/:tag', (req, res) => {
  const db = loadPlayersDB();
  const player = db.players[req.params.steamId];
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  player.tags = player.tags.filter(t => t !== req.params.tag);
  savePlayersDB(db);
  
  res.json({ success: true });
});

// Get activity logs
app.get('/api/activity', (req, res) => {
  const { type, steam_id, limit = 100, offset = 0 } = req.query;
  const logs = loadActivityLog();
  
  let filtered = logs.logs;
  
  if (type) {
    filtered = filtered.filter(l => l.type === type);
  }
  
  if (steam_id) {
    filtered = filtered.filter(l => l.data?.steam_id === steam_id);
  }
  
  // Сортируем по времени (новые первые)
  filtered.sort((a, b) => b.timestamp - a.timestamp);
  
  const total = filtered.length;
  filtered = filtered.slice(Number(offset), Number(offset) + Number(limit));
  
  res.json({ logs: filtered, total });
});

// Get activity for specific player
app.get('/api/activity/player/:steamId', (req, res) => {
  const logs = loadActivityLog();
  const steamId = req.params.steamId;
  
  const playerLogs = logs.logs.filter(l => l.data?.steam_id === steamId);
  playerLogs.sort((a, b) => b.timestamp - a.timestamp);
  
  res.json(playerLogs.slice(0, 100));
});

// Get player Steam info
app.get('/api/player/:steamId/steam', async (req, res) => {
  const { steamId } = req.params;
  console.log('Fetching Steam info for:', steamId);
  
  if (!STEAM_API_KEY) {
    return res.status(500).json({ error: 'Steam API key not configured' });
  }
  
  try {
    // Получаем профиль
    const profileUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`;
    const profileRes = await fetch(profileUrl);
    const profileData = await profileRes.json();
    const player = profileData.response?.players?.[0];
    
    if (!player) {
      return res.json({ error: 'Player not found' });
    }

    // Получаем баны
    const bansRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${STEAM_API_KEY}&steamids=${steamId}`);
    const bansData = await bansRes.json();
    const bans = bansData.players?.[0];

    // Получаем игры (часы в Rust)
    let rustHours = null;
    let recentHours = null;
    try {
      const gamesRes = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&include_played_free_games=1&appids_filter[0]=252490`);
      const gamesData = await gamesRes.json();
      const rustGame = gamesData.response?.games?.find(g => g.appid === 252490);
      if (rustGame) {
        rustHours = Math.round(rustGame.playtime_forever / 60);
      }
      
      const recentRes = await fetch(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}`);
      const recentData = await recentRes.json();
      const recentRust = recentData.response?.games?.find(g => g.appid === 252490);
      if (recentRust) {
        recentHours = Math.round(recentRust.playtime_2weeks / 60);
      }
    } catch (e) {
      console.log('Games fetch error:', e.message);
    }

    const privacyStates = {
      1: 'Профиль скрыт',
      2: 'Только друзья',
      3: 'Публичный'
    };

    const result = {
      steamId: player.steamid,
      personaName: player.personaname,
      avatar: player.avatarfull,
      profileUrl: player.profileurl,
      privacy: privacyStates[player.communityvisibilitystate] || 'Неизвестно',
      isPrivate: player.communityvisibilitystate !== 3,
      accountCreated: player.timecreated ? new Date(player.timecreated * 1000).toISOString() : null,
      lastLogoff: player.lastlogoff ? new Date(player.lastlogoff * 1000).toISOString() : null,
      rustHours,
      recentHours,
      vacBans: bans?.NumberOfVACBans || 0,
      gameBans: bans?.NumberOfGameBans || 0,
      daysSinceLastBan: bans?.DaysSinceLastBan || null,
      communityBanned: bans?.CommunityBanned || false
    };
    
    res.json(result);
  } catch (err) {
    console.error('Steam API error:', err);
    res.status(500).json({ error: 'Steam API error', details: err.message });
  }
});

// Get statistics
app.get('/api/stats', (req, res) => {
  const data = loadData();
  const db = loadPlayersDB();
  const logs = loadActivityLog();
  
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;
  
  const totalPlayers = Object.keys(db.players).length;
  const onlinePlayers = Object.values(data.servers).reduce((sum, s) => sum + (s.players?.length || 0), 0);
  const totalServers = Object.keys(data.servers).length;
  const onlineServers = Object.values(data.servers).filter(s => s.status === 'online').length;
  
  // Уникальные игроки за день/неделю
  const playersToday = Object.values(db.players).filter(p => p.last_seen > dayAgo).length;
  const playersWeek = Object.values(db.players).filter(p => p.last_seen > weekAgo).length;
  
  // Новые игроки за день/неделю
  const newPlayersToday = Object.values(db.players).filter(p => p.first_seen > dayAgo).length;
  const newPlayersWeek = Object.values(db.players).filter(p => p.first_seen > weekAgo).length;
  
  // Логи за день
  const logsToday = logs.logs.filter(l => l.timestamp > dayAgo).length;
  
  res.json({
    totalPlayers,
    onlinePlayers,
    totalServers,
    onlineServers,
    playersToday,
    playersWeek,
    newPlayersToday,
    newPlayersWeek,
    logsToday
  });
});

// Create test players
app.post('/api/test-players', (req, res) => {
  const data = loadData();
  const serverIds = Object.keys(data.servers);
  
  if (serverIds.length === 0) {
    const id = crypto.randomUUID();
    const secretKey = crypto.randomBytes(32).toString('hex');
    data.servers[id] = {
      id, name: 'Test Server', secretKey, hostname: 'Test Server',
      port: 28015, online: 0, maxPlayers: 100, lastUpdate: Date.now(),
      status: 'online', players: [], createdAt: Date.now()
    };
    serverIds.push(id);
  }

  const testPlayers = [
    { steam_id: '76561198012345678', name: 'ProGamer2024', ip: '185.123.45.67', ping: 45, online: true, position: '100, 50, 200', country: 'Russia', countryCode: 'ru', city: 'Moscow', provider: 'Rostelecom', avatar: 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg' },
    { steam_id: '76561198087654321', name: 'RustKing', ip: '91.215.67.89', ping: 78, online: true, position: '250, 30, 180', country: 'Ukraine', countryCode: 'ua', city: 'Kyiv', provider: 'Kyivstar', avatar: 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg' },
    { steam_id: '76561198111222333', name: 'ShadowHunter', ip: '78.140.23.156', ping: 120, online: true, position: '500, 10, 350', country: 'Germany', countryCode: 'de', city: 'Berlin', provider: 'Deutsche Telekom', avatar: 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg' },
    { steam_id: '76561198444555666', name: 'NightWolf', ip: '195.88.12.34', ping: 35, online: true, position: '150, 25, 400', country: 'Poland', countryCode: 'pl', city: 'Warsaw', provider: 'Orange Polska', avatar: 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg' },
    { steam_id: '76561198777888999', name: 'CyberNinja', ip: '212.45.78.90', ping: 92, online: true, position: '300, 45, 150', country: 'France', countryCode: 'fr', city: 'Paris', provider: 'Free SAS', avatar: 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg' },
  ];

  const serverId = serverIds[0];
  const serverName = data.servers[serverId].name;
  
  // Добавляем в базу данных
  testPlayers.forEach(p => updatePlayerInDB(p, serverName));
  
  data.servers[serverId].players = testPlayers;
  data.servers[serverId].online = testPlayers.length;
  data.servers[serverId].status = 'online';
  data.servers[serverId].lastUpdate = Date.now();
  
  saveData(data);
  res.json({ success: true, count: testPlayers.length });
});

// Delete test players
app.delete('/api/test-players', (req, res) => {
  const data = loadData();
  Object.values(data.servers).forEach(s => {
    s.players = [];
    s.online = 0;
  });
  saveData(data);
  res.json({ success: true });
});

// Check offline servers (no update > 30s)
setInterval(() => {
  const data = loadData();
  let changed = false;
  Object.values(data.servers).forEach(s => {
    if (s.status === 'online' && s.lastUpdate && Date.now() - s.lastUpdate > 30000) {
      // Отмечаем всех игроков как отключившихся
      (s.players || []).forEach(p => {
        markPlayerDisconnect(p.steam_id, s.name, 'Server offline');
      });
      s.status = 'offline';
      s.players = [];
      changed = true;
    }
  });
  if (changed) saveData(data);
}, 10000);

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
