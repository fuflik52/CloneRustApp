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
const CHAT_LOG_FILE = './chat_log.json';
const PROJECTS_FILE = './projects.json';

const STEAM_API_KEY = process.env.STEAM_API_KEY;
const RUSTAPP_API_TOKEN = process.env.RUSTAPP_API_TOKEN;
const RUSTAPP_API_URL = 'https://court.rustapp.io';

// === DATA LOADERS ===
const loadData = () => {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { servers: {} }; }
};
const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// Проекты (используем серверы как проекты)
const loadProjects = () => {
  try { return JSON.parse(fs.readFileSync(PROJECTS_FILE, 'utf8')); }
  catch { return { projects: [] }; }
};
const saveProjects = (data) => fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));
const saveProjects = (data) => fs.writeFileSync(PROJECTS_FILE, JSON.stringify(data, null, 2));

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

// Лог чата
const loadChatLog = () => {
  try { return JSON.parse(fs.readFileSync(CHAT_LOG_FILE, 'utf8')); }
  catch { return { messages: [] }; }
};
const saveChatLog = (data) => {
  // Храним только последние 5000 сообщений
  if (data.messages.length > 5000) {
    data.messages = data.messages.slice(-5000);
  }
  fs.writeFileSync(CHAT_LOG_FILE, JSON.stringify(data, null, 2));
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
  
  // Обновляем статистику если пришла от плагина
  if (playerData.stats) {
    const player = db.players[steamId];
    if (!player.stats) {
      player.stats = { kills: 0, deaths: 0, headshots: 0, bodyshots: 0, limbshots: 0, playtime_hours: 0, reports_count: 0, kd: 0 };
    }
    // Обновляем статистику из плагина
    player.stats.kills = playerData.stats.kills || player.stats.kills;
    player.stats.deaths = playerData.stats.deaths || player.stats.deaths;
    player.stats.headshots = playerData.stats.headshots || player.stats.headshots;
    player.stats.bodyshots = playerData.stats.bodyshots || player.stats.bodyshots;
    player.stats.limbshots = playerData.stats.limbshots || player.stats.limbshots;
    player.stats.reports_count = playerData.stats.reports_count || player.stats.reports_count;
    if (playerData.stats.playtime_hours) {
      player.stats.playtime_hours = playerData.stats.playtime_hours;
    }
    if (playerData.stats.kd !== undefined) {
      player.stats.kd = playerData.stats.kd;
    } else if (player.stats.deaths > 0) {
      player.stats.kd = Math.round((player.stats.kills / player.stats.deaths) * 100) / 100;
    } else {
      player.stats.kd = player.stats.kills;
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

// === API ROUTES ===

// === RustApp Proxy API ===
// Прокси к RustApp API для получения данных

// Получить всех игроков с RustApp
app.get('/api/rustapp/players', async (req, res) => {
  if (!RUSTAPP_API_TOKEN) {
    return res.status(500).json({ error: 'RUSTAPP_API_TOKEN not configured' });
  }
  
  try {
    const response = await fetch(`${RUSTAPP_API_URL}/plugin/players`, {
      headers: {
        'Authorization': `Bearer ${RUSTAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      return res.status(response.status).json({ error: 'RustApp API error' });
    }
    
    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error('RustApp proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch from RustApp' });
  }
});

// Универсальный прокси к RustApp API
app.all('/api/rustapp/*', async (req, res) => {
  if (!RUSTAPP_API_TOKEN) {
    return res.status(500).json({ error: 'RUSTAPP_API_TOKEN not configured' });
  }
  
  const path = req.params[0]; // всё после /api/rustapp/
  const url = `${RUSTAPP_API_URL}/${path}`;
  
  try {
    const options = {
      method: req.method,
      headers: {
        'Authorization': `Bearer ${RUSTAPP_API_TOKEN}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      options.body = JSON.stringify(req.body);
    }
    
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    
    res.status(response.status).json(data);
  } catch (err) {
    console.error('RustApp proxy error:', err);
    res.status(500).json({ error: 'Failed to fetch from RustApp' });
  }
});

// === PROJECTS API ===

// Get all projects
app.get('/api/projects', (req, res) => {
  const data = loadProjects();
  res.json(data.projects || []);
});

// Create project
app.post('/api/projects', (req, res) => {
  const { name, slug, website, logo } = req.body;
  if (!name || !slug) {
    return res.status(400).json({ error: 'Name and slug required' });
  }
  
  const data = loadProjects();
  
  // Проверяем уникальность slug
  if (data.projects.some(p => p.slug === slug)) {
    return res.status(400).json({ error: 'Slug already exists' });
  }
  
  const project = {
    id: crypto.randomUUID(),
    name,
    slug,
    website: website || '',
    logo: logo || '',
    createdAt: Date.now()
  };
  
  data.projects.push(project);
  saveProjects(data);
  
  res.json(project);
});

// Get project by slug
app.get('/api/projects/:slug', (req, res) => {
  const data = loadProjects();
  const project = data.projects.find(p => p.slug === req.params.slug);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  res.json(project);
});

// Delete project
app.delete('/api/projects/:id', (req, res) => {
  const data = loadProjects();
  const idx = data.projects.findIndex(p => p.id === req.params.id);
  if (idx === -1) {
    return res.status(404).json({ error: 'Project not found' });
  }
  data.projects.splice(idx, 1);
  saveProjects(data);
  res.json({ success: true });
});

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

// Sync all players (including sleepers) from plugin
app.post('/api/sync', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadData();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const players = req.body.players || [];
  
  // Получаем аватары для ВСЕХ игроков через Steam API (батчами по 100)
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
  
  let added = 0;
  let updated = 0;
  
  const db = loadPlayersDB();
  
  for (const p of players) {
    p.avatar = avatars[p.steam_id] || p.avatar || '';
    
    // Геолокация для онлайн игроков с IP
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
    
    // Для офлайн игроков — подтягиваем данные из базы если есть
    if (!p.online && db.players[p.steam_id]) {
      const existing = db.players[p.steam_id];
      if (!p.avatar) p.avatar = existing.avatar || '';
      if (!p.country && existing.country) p.country = existing.country;
      if (!p.countryCode && existing.countryCode) p.countryCode = existing.countryCode;
      if (!p.city && existing.city) p.city = existing.city;
      if (!p.provider && existing.provider) p.provider = existing.provider;
      // Берём последний известный IP из истории
      if (!p.ip && existing.ips_history?.length > 0) {
        const lastIp = existing.ips_history[existing.ips_history.length - 1];
        p.ip = lastIp.ip || '';
        if (!p.country) p.country = lastIp.country || '';
        if (!p.city) p.city = lastIp.city || '';
        if (!p.provider) p.provider = lastIp.provider || '';
      }
    }
    
    if (!db.players[p.steam_id]) {
      added++;
    } else {
      updated++;
    }
    
    // Обновляем игрока в базе
    updatePlayerInDB(p, server.name);
  }
  
  addActivityLog('server_sync', {
    server: server.name,
    total: players.length,
    added,
    updated,
    online: players.filter(p => p.online).length,
    sleepers: players.filter(p => !p.online).length
  });
  
  console.log(`Sync from ${server.name}: ${players.length} players (${added} new, ${updated} updated)`);
  res.json({ success: true, added, updated, total: players.length });
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
app.get('/api/players/all', async (req, res) => {
  const db = loadPlayersDB();
  let players = Object.values(db.players).map(p => ({
    ...p,
    playtime_hours: Math.round(p.total_playtime_seconds / 3600 * 10) / 10
  }));
  
  // Сортируем по последнему визиту
  players.sort((a, b) => b.last_seen - a.last_seen);
  
  // Фоновая загрузка аватаров для игроков без аватара (первые 50)
  const playersWithoutAvatar = players.filter(p => !p.avatar).slice(0, 50);
  if (playersWithoutAvatar.length > 0 && STEAM_API_KEY) {
    const steamIds = playersWithoutAvatar.map(p => p.steam_id).join(',');
    try {
      const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamIds}`);
      const steamData = await steamRes.json();
      steamData.response?.players?.forEach(sp => {
        if (db.players[sp.steamid]) {
          db.players[sp.steamid].avatar = sp.avatarfull;
          // Обновляем в ответе тоже
          const idx = players.findIndex(p => p.steam_id === sp.steamid);
          if (idx !== -1) players[idx].avatar = sp.avatarfull;
        }
      });
      savePlayersDB(db);
    } catch {}
  }
  
  res.json(players);
});

// Get player by steam_id
app.get('/api/players/db/:steamId', async (req, res) => {
  const db = loadPlayersDB();
  const player = db.players[req.params.steamId];
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  // Подгружаем аватар если нет
  if (!player.avatar && STEAM_API_KEY) {
    try {
      const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${req.params.steamId}`);
      const steamData = await steamRes.json();
      const sp = steamData.response?.players?.[0];
      if (sp) {
        player.avatar = sp.avatarfull;
        savePlayersDB(db);
      }
    } catch {}
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
  const db = loadPlayersDB();
  const player = db.players[steamId];
  
  // Проверяем кэш (обновляем раз в час)
  if (player?.steamInfo && player.steamInfoUpdated && Date.now() - player.steamInfoUpdated < 3600000) {
    return res.json(player.steamInfo);
  }
  
  if (!STEAM_API_KEY) {
    return res.status(500).json({ error: 'Steam API key not configured' });
  }
  
  try {
    // Параллельные запросы для скорости
    const [profileRes, bansRes, gamesRes, recentRes] = await Promise.all([
      fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`),
      fetch(`https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${STEAM_API_KEY}&steamids=${steamId}`),
      fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&include_played_free_games=1&appids_filter[0]=252490`).catch(() => null),
      fetch(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}`).catch(() => null)
    ]);
    
    const profileData = await profileRes.json();
    const steamPlayer = profileData.response?.players?.[0];
    
    if (!steamPlayer) {
      return res.json({ error: 'Player not found' });
    }

    const bansData = await bansRes.json();
    const bans = bansData.players?.[0];

    let rustHours = null;
    let recentHours = null;
    
    if (gamesRes) {
      try {
        const gamesData = await gamesRes.json();
        const rustGame = gamesData.response?.games?.find(g => g.appid === 252490);
        if (rustGame) rustHours = Math.round(rustGame.playtime_forever / 60);
      } catch {}
    }
    
    if (recentRes) {
      try {
        const recentData = await recentRes.json();
        const recentRust = recentData.response?.games?.find(g => g.appid === 252490);
        if (recentRust) recentHours = Math.round(recentRust.playtime_2weeks / 60);
      } catch {}
    }

    const privacyStates = { 1: 'Профиль скрыт', 2: 'Только друзья', 3: 'Публичный' };

    const result = {
      steamId: steamPlayer.steamid,
      personaName: steamPlayer.personaname,
      avatar: steamPlayer.avatarfull,
      profileUrl: steamPlayer.profileurl,
      privacy: privacyStates[steamPlayer.communityvisibilitystate] || 'Неизвестно',
      isPrivate: steamPlayer.communityvisibilitystate !== 3,
      accountCreated: steamPlayer.timecreated ? new Date(steamPlayer.timecreated * 1000).toISOString() : null,
      lastLogoff: steamPlayer.lastlogoff ? new Date(steamPlayer.lastlogoff * 1000).toISOString() : null,
      rustHours,
      recentHours,
      vacBans: bans?.NumberOfVACBans || 0,
      gameBans: bans?.NumberOfGameBans || 0,
      daysSinceLastBan: bans?.DaysSinceLastBan || null,
      communityBanned: bans?.CommunityBanned || false
    };
    
    // Кэшируем в базу
    if (player) {
      player.steamInfo = result;
      player.steamInfoUpdated = Date.now();
      player.avatar = steamPlayer.avatarfull;
      savePlayersDB(db);
    }
    
    res.json(result);
  } catch (err) {
    console.error('Steam API error:', err);
    res.status(500).json({ error: 'Steam API error', details: err.message });
  }
});

// === PLAYER STATS API ===

// Get player stats
app.get('/api/player/:steamId/stats', (req, res) => {
  const { steamId } = req.params;
  const db = loadPlayersDB();
  const player = db.players[steamId];
  
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  // Возвращаем статистику игрока
  const stats = player.stats || {
    kills: 0,
    deaths: 0,
    headshots: 0,
    bodyshots: 0,
    limbshots: 0,
    playtime_hours: 0,
    reports_count: 0,
    kd: 0
  };
  
  // Рассчитываем K/D если не задан
  if (!stats.kd && stats.deaths > 0) {
    stats.kd = Math.round((stats.kills / stats.deaths) * 100) / 100;
  } else if (!stats.kd) {
    stats.kd = stats.kills;
  }
  
  // Добавляем время на проекте из базы
  if (!stats.playtime_hours && player.total_playtime_seconds) {
    stats.playtime_hours = Math.round(player.total_playtime_seconds / 3600 * 10) / 10;
  }
  
  res.json(stats);
});

// Get player kills
app.get('/api/player/:steamId/kills', (req, res) => {
  const { steamId } = req.params;
  const { limit = 50 } = req.query;
  const logs = loadActivityLog();
  const db = loadPlayersDB();
  
  // Ищем убийства где игрок был убийцей или жертвой
  const kills = logs.logs
    .filter(l => l.type === 'player_kill' && 
      (l.data?.killer_steam_id === steamId || l.data?.victim_steam_id === steamId))
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, Number(limit))
    .map(l => {
      const killerPlayer = db.players[l.data.killer_steam_id];
      const victimPlayer = db.players[l.data.victim_steam_id];
      return {
        id: l.id,
        timestamp: l.timestamp,
        killer_steam_id: l.data.killer_steam_id,
        killer_name: killerPlayer?.steam_name || 'Unknown',
        killer_avatar: killerPlayer?.avatar || '',
        victim_steam_id: l.data.victim_steam_id,
        victim_name: victimPlayer?.steam_name || 'Unknown',
        victim_avatar: victimPlayer?.avatar || '',
        weapon: l.data.weapon || 'unknown',
        ammo: l.data.ammo || 'unknown',
        bone: l.data.bone || 'body',
        distance: l.data.distance || 0,
        old_hp: l.data.old_hp || 100,
        new_hp: l.data.new_hp || 0,
        is_headshot: l.data.is_headshot || false,
        server: l.data.server || '',
        hit_history: l.data.hit_history || []
      };
    });
  
  res.json(kills);
});

// Plugin sends kills data (supports both short and full field names from PanRust.cs)
app.post('/api/kills', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadData();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const { kills, server: serverName } = req.body;
  if (!kills || !Array.isArray(kills)) {
    return res.status(400).json({ error: 'Kills array required' });
  }
  
  const db = loadPlayersDB();
  
  // Helper to map short field names from PanRust.cs to full names
  const mapKill = (k) => ({
    killer_steam_id: k.ki || k.killer_steam_id,
    victim_steam_id: k.vi || k.victim_steam_id,
    weapon: k.wp || k.weapon,
    bone: k.bn || k.bone,
    distance: k.ds || k.distance || 0,
    is_headshot: k.hs || k.is_headshot || false,
    timestamp: k.ts || k.timestamp || Date.now(),
    hit_history: (k.h || k.hit_history || []).map(h => ({
      time: h.t ?? h.time ?? 0,
      attacker_steam_id: h.asi || h.attacker_steam_id || '',
      target_steam_id: h.tsi || h.target_steam_id || '',
      attacker: h.a || h.attacker || '',
      target: h.tg || h.target || '',
      weapon: h.wp || h.weapon || '',
      ammo: h.am || h.ammo || '',
      bone: h.bn || h.bone || '',
      distance: h.ds || h.distance || 0,
      hp_old: h.ho ?? h.hp_old ?? 0,
      hp_new: h.hn ?? h.hp_new ?? 0,
      info: h.inf || h.info || '',
      proj_hits: h.ph || h.proj_hits || 0,
      proj_integrity: h.pi || h.proj_integrity || 0,
      proj_travel: h.pt || h.proj_travel || 0,
      proj_mismatch: h.pm || h.proj_mismatch || 0,
      desync: h.dy || h.desync || 0,
      attacker_dead: h.ad || h.attacker_dead || false
    }))
  });
  
  for (const rawKill of kills) {
    const kill = mapKill(rawKill);
    
    // Обновляем статистику убийцы
    if (kill.killer_steam_id && db.players[kill.killer_steam_id]) {
      const killer = db.players[kill.killer_steam_id];
      if (!killer.stats) {
        killer.stats = { kills: 0, deaths: 0, headshots: 0, bodyshots: 0, limbshots: 0, playtime_hours: 0, reports_count: 0, kd: 0 };
      }
      killer.stats.kills++;
      
      // Определяем часть тела
      const bone = (kill.bone || '').toLowerCase();
      if (bone.includes('head') || bone.includes('jaw') || bone.includes('eye') || bone.includes('neck')) {
        killer.stats.headshots++;
      } else if (bone.includes('hand') || bone.includes('arm') || bone.includes('finger') || 
                 bone.includes('leg') || bone.includes('foot') || bone.includes('toe') || bone.includes('knee')) {
        killer.stats.limbshots++;
      } else {
        killer.stats.bodyshots++;
      }
      
      // Пересчитываем K/D
      killer.stats.kd = killer.stats.deaths > 0 
        ? Math.round((killer.stats.kills / killer.stats.deaths) * 100) / 100 
        : killer.stats.kills;
    }
    
    // Обновляем статистику жертвы
    if (kill.victim_steam_id && db.players[kill.victim_steam_id]) {
      const victim = db.players[kill.victim_steam_id];
      if (!victim.stats) {
        victim.stats = { kills: 0, deaths: 0, headshots: 0, bodyshots: 0, limbshots: 0, playtime_hours: 0, reports_count: 0, kd: 0 };
      }
      victim.stats.deaths++;
      
      // Пересчитываем K/D
      victim.stats.kd = victim.stats.deaths > 0 
        ? Math.round((victim.stats.kills / victim.stats.deaths) * 100) / 100 
        : victim.stats.kills;
    }
    
    // Логируем убийство с hit_history
    addActivityLog('player_kill', {
      killer_steam_id: kill.killer_steam_id,
      victim_steam_id: kill.victim_steam_id,
      weapon: kill.weapon,
      distance: kill.distance,
      is_headshot: kill.is_headshot,
      bone: kill.bone,
      server: serverName || server.name,
      hit_history: kill.hit_history || []
    });
  }
  
  savePlayersDB(db);
  console.log(`Kills from ${server.name}: ${kills.length} kills processed`);
  res.json({ success: true, count: kills.length });
});

// === CHAT API ===

// Plugin sends chat messages (supports both short and full field names from PanRust.cs)
app.post('/api/chat', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadData();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const { messages, server: serverName } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Messages array required' });
  }
  
  const chatLog = loadChatLog();
  const db = loadPlayersDB();
  
  for (const msg of messages) {
    // Map short field names from PanRust.cs to full names
    const steamId = msg.si || msg.steam_id;
    const name = msg.n || msg.name;
    const message = msg.m || msg.message;
    const isTeam = msg.t || msg.is_team || false;
    const timestamp = msg.ts || msg.timestamp || Date.now();
    
    const player = db.players[steamId];
    chatLog.messages.push({
      id: crypto.randomUUID(),
      steam_id: steamId,
      name: name,
      avatar: player?.avatar || '',
      message: message,
      is_team: isTeam,
      server: serverName || server.name,
      timestamp: timestamp,
      date: new Date(timestamp).toISOString()
    });
  }
  
  saveChatLog(chatLog);
  res.json({ success: true, count: messages.length });
});

// Get chat messages
app.get('/api/chat', (req, res) => {
  const { limit = 100, offset = 0, steam_id, server, search } = req.query;
  const chatLog = loadChatLog();
  const db = loadPlayersDB();
  
  let messages = chatLog.messages;
  
  // Фильтрация по steam_id
  if (steam_id) {
    messages = messages.filter(m => m.steam_id === steam_id);
  }
  
  // Фильтрация по серверу
  if (server) {
    messages = messages.filter(m => m.server === server);
  }
  
  // Поиск по тексту
  if (search) {
    const q = search.toLowerCase();
    messages = messages.filter(m => 
      m.message.toLowerCase().includes(q) || 
      m.name.toLowerCase().includes(q)
    );
  }
  
  // Сортируем по времени (новые последние для чата)
  messages.sort((a, b) => a.timestamp - b.timestamp);
  
  const total = messages.length;
  
  // Берём последние сообщения
  const start = Math.max(0, total - Number(limit) - Number(offset));
  const end = total - Number(offset);
  messages = messages.slice(start, end);
  
  // Добавляем аватары из базы
  messages = messages.map(m => ({
    ...m,
    avatar: m.avatar || db.players[m.steam_id]?.avatar || ''
  }));
  
  res.json({ messages, total });
});

// Очередь команд для плагина (сообщения админа в игру)
const COMMANDS_QUEUE_FILE = './commands_queue.json';
const MUTES_FILE = './mutes.json';

const loadCommandsQueue = () => {
  try { return JSON.parse(fs.readFileSync(COMMANDS_QUEUE_FILE, 'utf8')); }
  catch { return { commands: [] }; }
};
const saveCommandsQueue = (data) => fs.writeFileSync(COMMANDS_QUEUE_FILE, JSON.stringify(data, null, 2));

// Муты
const loadMutes = () => {
  try { return JSON.parse(fs.readFileSync(MUTES_FILE, 'utf8')); }
  catch { return { mutes: {} }; }
};
const saveMutes = (data) => fs.writeFileSync(MUTES_FILE, JSON.stringify(data, null, 2));

// Send message to player (admin -> player)
app.post('/api/chat/send', (req, res) => {
  const { target_steam_id, message, is_global } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message required' });
  }
  
  const chatLog = loadChatLog();
  
  // Сохраняем сообщение админа в лог чата
  chatLog.messages.push({
    id: crypto.randomUUID(),
    steam_id: 'admin',
    name: 'Администратор',
    avatar: '',
    message: message,
    is_team: false,
    is_admin: true,
    is_global: is_global || false,
    target_steam_id: target_steam_id || null,
    server: 'Panel',
    timestamp: Date.now(),
    date: new Date().toISOString()
  });
  saveChatLog(chatLog);
  
  // Добавляем команду в очередь для плагина
  const queue = loadCommandsQueue();
  queue.commands.push({
    id: crypto.randomUUID(),
    type: 'chat_message',
    target_steam_id: target_steam_id || null,
    message: message,
    is_global: !target_steam_id,
    timestamp: Date.now()
  });
  saveCommandsQueue(queue);
  
  res.json({ success: true });
});

// Плагин забирает команды из очереди
app.get('/api/commands', (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadData();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  const queue = loadCommandsQueue();
  const commands = queue.commands;
  
  // Очищаем очередь после получения
  queue.commands = [];
  saveCommandsQueue(queue);
  
  res.json({ commands });
});

// Get chat messages for specific player
app.get('/api/chat/player/:steamId', (req, res) => {
  const { steamId } = req.params;
  const { limit = 50 } = req.query;
  const chatLog = loadChatLog();
  const db = loadPlayersDB();
  
  let messages = chatLog.messages.filter(m => m.steam_id === steamId);
  messages.sort((a, b) => b.timestamp - a.timestamp);
  messages = messages.slice(0, Number(limit));
  
  // Добавляем аватары
  messages = messages.map(m => ({
    ...m,
    avatar: m.avatar || db.players[m.steam_id]?.avatar || ''
  }));
  
  res.json(messages.reverse());
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

// === MUTES API ===

// Get all active mutes
app.get('/api/mutes', (req, res) => {
  const mutes = loadMutes();
  const now = Date.now();
  const db = loadPlayersDB();
  
  // Фильтруем только активные муты
  const activeMutes = Object.entries(mutes.mutes)
    .filter(([_, m]) => m.expired_at === 0 || m.expired_at > now)
    .map(([steamId, m]) => {
      const player = db.players[steamId];
      return {
        ...m,
        steam_id: steamId,
        name: player?.steam_name || m.name || 'Unknown',
        avatar: player?.avatar || ''
      };
    });
  
  res.json(activeMutes);
});

// Get mute for specific player
app.get('/api/mutes/:steamId', (req, res) => {
  const mutes = loadMutes();
  const mute = mutes.mutes[req.params.steamId];
  const now = Date.now();
  
  if (!mute || (mute.expired_at !== 0 && mute.expired_at < now)) {
    return res.json({ muted: false });
  }
  
  res.json({ muted: true, ...mute });
});

// Create mute
app.post('/api/mutes', (req, res) => {
  const { steam_id, reason, duration, comment, broadcast } = req.body;
  
  if (!steam_id || !reason) {
    return res.status(400).json({ error: 'steam_id and reason required' });
  }
  
  const mutes = loadMutes();
  const db = loadPlayersDB();
  const player = db.players[steam_id];
  const now = Date.now();
  
  // Парсим duration (например: "1h", "30m", "7d", "0" для перманента)
  let expiredAt = 0;
  if (duration && duration !== '0' && duration !== 'perm') {
    const match = duration.match(/^(\d+)([smhd])$/);
    if (match) {
      const value = parseInt(match[1]);
      const unit = match[2];
      const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
      expiredAt = now + value * multipliers[unit];
    }
  }
  
  mutes.mutes[steam_id] = {
    reason,
    duration: duration || '0',
    expired_at: expiredAt,
    created_at: now,
    comment: comment || '',
    name: player?.steam_name || ''
  };
  
  saveMutes(mutes);
  
  // Добавляем команду в очередь для плагина
  const queue = loadCommandsQueue();
  queue.commands.push({
    id: crypto.randomUUID(),
    type: 'mute',
    steam_id,
    reason,
    duration: duration || '0',
    expired_at: expiredAt,
    broadcast: broadcast || false,
    timestamp: now
  });
  saveCommandsQueue(queue);
  
  addActivityLog('player_muted', {
    steam_id,
    name: player?.steam_name || 'Unknown',
    reason,
    duration: duration || 'permanent'
  });
  
  res.json({ success: true });
});

// Delete mute (unmute)
app.delete('/api/mutes/:steamId', (req, res) => {
  const mutes = loadMutes();
  const db = loadPlayersDB();
  const player = db.players[req.params.steamId];
  
  if (mutes.mutes[req.params.steamId]) {
    delete mutes.mutes[req.params.steamId];
    saveMutes(mutes);
    
    // Добавляем команду в очередь для плагина
    const queue = loadCommandsQueue();
    queue.commands.push({
      id: crypto.randomUUID(),
      type: 'unmute',
      steam_id: req.params.steamId,
      timestamp: Date.now()
    });
    saveCommandsQueue(queue);
    
    addActivityLog('player_unmuted', {
      steam_id: req.params.steamId,
      name: player?.steam_name || 'Unknown'
    });
  }
  
  res.json({ success: true });
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
