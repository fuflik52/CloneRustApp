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
const loadData = () => {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
  catch { return { servers: {} }; }
};
const saveData = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

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
  
  console.log('Server created:', server.name, server.id);
  res.json(server);
});

// Delete server
app.delete('/api/servers/:id', (req, res) => {
  const data = loadData();
  delete data.servers[req.params.id];
  saveData(data);
  res.json({ success: true });
});

const STEAM_API_KEY = process.env.STEAM_API_KEY;

// Plugin sends state
app.post('/api/state', async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  
  const key = auth.slice(7);
  const data = loadData();
  const server = Object.values(data.servers).find(s => s.secretKey === key);
  if (!server) return res.status(401).json({ error: 'Invalid key' });
  
  server.hostname = req.body.hostname || server.name;
  server.port = req.body.port || 0;
  server.online = req.body.online || 0;
  server.maxPlayers = req.body.max_players || 0;
  server.lastUpdate = Date.now();
  server.status = 'online';
  
  const players = req.body.players || [];
  const steamIds = players.map(p => p.steam_id).join(',');
  
  // Получаем аватары через Steam API
  let avatars = {};
  if (steamIds) {
    try {
      const steamRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamIds}`);
      const steamData = await steamRes.json();
      steamData.response?.players?.forEach(p => { avatars[p.steamid] = p.avatarfull; });
    } catch {}
  }
  
  // Геолокация и аватары
  for (const p of players) {
    p.avatar = avatars[p.steam_id] || '';
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
  }
  server.players = players;
  
  saveData(data);
  res.json({ success: true });
});

// Get players (all servers)
app.get('/api/players', (req, res) => {
  const data = loadData();
  const players = Object.values(data.servers).flatMap(s => 
    (s.players || []).map(p => ({ ...p, serverName: s.name, serverStatus: s.status }))
  );
  res.json(players);
});

// Get player Steam info
app.get('/api/player/:steamId/steam', async (req, res) => {
  const { steamId } = req.params;
  console.log('Fetching Steam info for:', steamId);
  
  try {
    // Получаем профиль
    const profileUrl = `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${STEAM_API_KEY}&steamids=${steamId}`;
    console.log('Profile URL:', profileUrl);
    
    const profileRes = await fetch(profileUrl);
    const profileData = await profileRes.json();
    console.log('Profile response:', JSON.stringify(profileData));
    
    const player = profileData.response?.players?.[0];
    
    if (!player) {
      console.log('Player not found in Steam');
      return res.json({ error: 'Player not found' });
    }

    // Получаем баны
    const bansRes = await fetch(`https://api.steampowered.com/ISteamUser/GetPlayerBans/v1/?key=${STEAM_API_KEY}&steamids=${steamId}`);
    const bansData = await bansRes.json();
    console.log('Bans response:', JSON.stringify(bansData));
    const bans = bansData.players?.[0];

    // Получаем игры (часы в Rust)
    let rustHours = null;
    let recentHours = null;
    try {
      const gamesRes = await fetch(`https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}&include_played_free_games=1&appids_filter[0]=252490`);
      const gamesData = await gamesRes.json();
      console.log('Games response:', JSON.stringify(gamesData));
      const rustGame = gamesData.response?.games?.find(g => g.appid === 252490);
      if (rustGame) {
        rustHours = Math.round(rustGame.playtime_forever / 60);
      }
      
      // Недавние игры
      const recentRes = await fetch(`https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/?key=${STEAM_API_KEY}&steamid=${steamId}`);
      const recentData = await recentRes.json();
      const recentRust = recentData.response?.games?.find(g => g.appid === 252490);
      if (recentRust) {
        recentHours = Math.round(recentRust.playtime_2weeks / 60);
      }
    } catch (e) {
      console.log('Games fetch error:', e.message);
    }

    // Приватность профиля
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
    
    console.log('Returning:', JSON.stringify(result));
    res.json(result);
  } catch (err) {
    console.error('Steam API error:', err);
    res.status(500).json({ error: 'Steam API error', details: err.message });
  }
});

// Create test players
app.post('/api/test-players', (req, res) => {
  const data = loadData();
  const serverIds = Object.keys(data.servers);
  
  if (serverIds.length === 0) {
    // Создаём тестовый сервер если нет серверов
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
      s.status = 'offline';
      s.players = [];
      changed = true;
    }
  });
  if (changed) saveData(data);
}, 10000);

// SPA fallback - все остальные запросы отдают index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
