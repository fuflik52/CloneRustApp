import { useState, useEffect } from 'react'
import { useToast } from '../components/Toast'

interface PlayerDB {
  steam_id: string
  steam_name: string
  avatar: string
  first_seen: number
  last_seen: number
  total_connections: number
  total_playtime_seconds: number
  playtime_hours: number
  names_history: { name: string; date: number }[]
  ips_history: { ip: string; first_seen: number; last_seen: number; country: string; city: string; provider: string }[]
  servers_played: string[]
  notes: { id: string; text: string; author: string; date: number }[]
  tags: string[]
  country: string
  countryCode: string
  city: string
}

interface ActivityLog {
  id: string
  type: string
  data: any
  timestamp: number
  date: string
}

interface Stats {
  totalPlayers: number
  onlinePlayers: number
  totalServers: number
  onlineServers: number
  playersToday: number
  playersWeek: number
  newPlayersToday: number
  newPlayersWeek: number
  logsToday: number
}

const SECRET_PASSWORD = 'rustadmin2024'

export default function Database() {
  const [isAuthed, setIsAuthed] = useState(false)
  const [password, setPassword] = useState('')
  const [tab, setTab] = useState<'players' | 'activity' | 'stats'>('players')
  const [players, setPlayers] = useState<PlayerDB[]>([])
  const [activity, setActivity] = useState<ActivityLog[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [search, setSearch] = useState('')
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDB | null>(null)
  const [loading, setLoading] = useState(false)
  const [noteText, setNoteText] = useState('')
  const [tagText, setTagText] = useState('')
  const { showToast } = useToast()

  const checkAuth = () => {
    if (password === SECRET_PASSWORD) {
      setIsAuthed(true)
      localStorage.setItem('db_auth', 'true')
    } else {
      showToast('Неверный пароль', 'error')
    }
  }

  useEffect(() => {
    if (localStorage.getItem('db_auth') === 'true') {
      setIsAuthed(true)
    }
  }, [])

  useEffect(() => {
    if (isAuthed) {
      fetchData()
    }
  }, [isAuthed, tab])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (tab === 'players') {
        const res = await fetch('/api/players/all')
        if (res.ok) setPlayers(await res.json())
      } else if (tab === 'activity') {
        const res = await fetch('/api/activity?limit=200')
        if (res.ok) {
          const data = await res.json()
          setActivity(data.logs)
        }
      } else if (tab === 'stats') {
        const res = await fetch('/api/stats')
        if (res.ok) setStats(await res.json())
      }
    } catch {}
    setLoading(false)
  }

  const searchPlayers = async () => {
    if (!search.trim()) {
      fetchData()
      return
    }
    setLoading(true)
    try {
      const res = await fetch(`/api/players/search?q=${encodeURIComponent(search)}`)
      if (res.ok) setPlayers(await res.json())
    } catch {}
    setLoading(false)
  }

  const loadPlayerDetails = async (steamId: string) => {
    try {
      const res = await fetch(`/api/players/db/${steamId}`)
      if (res.ok) setSelectedPlayer(await res.json())
    } catch {}
  }

  const addNote = async () => {
    if (!selectedPlayer || !noteText.trim()) return
    try {
      await fetch(`/api/players/db/${selectedPlayer.steam_id}/note`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: noteText, author: 'Admin' })
      })
      showToast('Заметка добавлена')
      setNoteText('')
      loadPlayerDetails(selectedPlayer.steam_id)
    } catch {}
  }

  const addTag = async () => {
    if (!selectedPlayer || !tagText.trim()) return
    try {
      await fetch(`/api/players/db/${selectedPlayer.steam_id}/tag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag: tagText })
      })
      showToast('Тег добавлен')
      setTagText('')
      loadPlayerDetails(selectedPlayer.steam_id)
    } catch {}
  }

  const removeTag = async (tag: string) => {
    if (!selectedPlayer) return
    try {
      await fetch(`/api/players/db/${selectedPlayer.steam_id}/tag/${tag}`, { method: 'DELETE' })
      loadPlayerDetails(selectedPlayer.steam_id)
    } catch {}
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleString('ru')
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${hours}ч ${mins}м`
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'player_connect': return '🟢'
      case 'player_disconnect': return '🔴'
      case 'player_first_join': return '⭐'
      case 'player_name_change': return '✏️'
      case 'player_new_ip': return '🌐'
      case 'player_note_added': return '📝'
      case 'server_created': return '🖥️'
      case 'server_deleted': return '🗑️'
      default: return '📋'
    }
  }

  const getActivityText = (log: ActivityLog) => {
    const d = log.data
    switch (log.type) {
      case 'player_connect': return `${d.name} подключился к ${d.server}`
      case 'player_disconnect': return `${d.name} отключился от ${d.server} (${d.reason})`
      case 'player_first_join': return `${d.name} впервые зашёл на сервер ${d.server}`
      case 'player_name_change': return `Смена ника: ${d.old_name} → ${d.new_name}`
      case 'player_new_ip': return `${d.name} зашёл с нового IP: ${d.ip} (${d.country})`
      case 'player_note_added': return `Заметка для ${d.name}: ${d.note}`
      case 'server_created': return `Создан сервер: ${d.name}`
      case 'server_deleted': return `Удалён сервер: ${d.name}`
      default: return JSON.stringify(d)
    }
  }

  if (!isAuthed) {
    return (
      <div className="db-login">
        <div className="db-login-box">
          <h2>🔒 Доступ к базе данных</h2>
          <input
            type="password"
            placeholder="Введите пароль"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkAuth()}
          />
          <button onClick={checkAuth}>Войти</button>
        </div>
      </div>
    )
  }

  return (
    <div className="db-page">
      <div className="db-header">
        <h1>📊 База данных</h1>
        <div className="db-tabs">
          <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>Игроки</button>
          <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>Активность</button>
          <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>Статистика</button>
        </div>
        <button className="db-logout" onClick={() => { setIsAuthed(false); localStorage.removeItem('db_auth') }}>Выйти</button>
      </div>

      {tab === 'players' && (
        <div className="db-players">
          <div className="db-search">
            <input
              placeholder="Поиск по имени, SteamID, IP..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchPlayers()}
            />
            <button onClick={searchPlayers}>Найти</button>
            <button onClick={fetchData}>Сбросить</button>
          </div>

          <div className="db-content">
            <div className="db-list">
              {loading ? <p>Загрузка...</p> : players.length === 0 ? <p>Нет игроков</p> : (
                players.map(p => (
                  <div key={p.steam_id} className={`db-player-row ${selectedPlayer?.steam_id === p.steam_id ? 'selected' : ''}`} onClick={() => loadPlayerDetails(p.steam_id)}>
                    <img src={p.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                    <div className="db-player-info">
                      <span className="db-player-name">{p.steam_name}</span>
                      <span className="db-player-meta">{p.steam_id} • {p.total_connections} подкл. • {p.playtime_hours}ч</span>
                    </div>
                    {p.countryCode && <img className="db-flag" src={`https://flagcdn.com/24x18/${p.countryCode}.png`} alt="" />}
                  </div>
                ))
              )}
            </div>

            {selectedPlayer && (
              <div className="db-details">
                <div className="db-details-header">
                  <img src={selectedPlayer.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                  <div>
                    <h3>{selectedPlayer.steam_name}</h3>
                    <p>{selectedPlayer.steam_id}</p>
                  </div>
                  <button className="db-close" onClick={() => setSelectedPlayer(null)}>✕</button>
                </div>

                <div className="db-details-grid">
                  <div><span>Первый визит</span><strong>{formatDate(selectedPlayer.first_seen)}</strong></div>
                  <div><span>Последний визит</span><strong>{formatDate(selectedPlayer.last_seen)}</strong></div>
                  <div><span>Подключений</span><strong>{selectedPlayer.total_connections}</strong></div>
                  <div><span>Время игры</span><strong>{formatTime(selectedPlayer.total_playtime_seconds)}</strong></div>
                  <div><span>Страна</span><strong>{selectedPlayer.country || '—'} {selectedPlayer.city}</strong></div>
                  <div><span>Серверы</span><strong>{selectedPlayer.servers_played.join(', ') || '—'}</strong></div>
                </div>

                <div className="db-section">
                  <h4>Теги</h4>
                  <div className="db-tags">
                    {selectedPlayer.tags.map(t => (
                      <span key={t} className="db-tag">{t} <button onClick={() => removeTag(t)}>×</button></span>
                    ))}
                    <input placeholder="Новый тег" value={tagText} onChange={e => setTagText(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()} />
                    <button onClick={addTag}>+</button>
                  </div>
                </div>

                <div className="db-section">
                  <h4>История имён ({selectedPlayer.names_history.length})</h4>
                  <div className="db-history">
                    {selectedPlayer.names_history.map((h, i) => (
                      <div key={i}><span>{h.name}</span><small>{formatDate(h.date)}</small></div>
                    ))}
                  </div>
                </div>

                <div className="db-section">
                  <h4>История IP ({selectedPlayer.ips_history.length})</h4>
                  <div className="db-history">
                    {selectedPlayer.ips_history.map((h, i) => (
                      <div key={i}>
                        <span>{h.ip}</span>
                        <small>{h.country} {h.city} • {h.provider}</small>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="db-section">
                  <h4>Заметки ({selectedPlayer.notes.length})</h4>
                  <div className="db-notes">
                    {selectedPlayer.notes.map(n => (
                      <div key={n.id} className="db-note">
                        <p>{n.text}</p>
                        <small>{n.author} • {formatDate(n.date)}</small>
                      </div>
                    ))}
                    <div className="db-note-add">
                      <textarea placeholder="Новая заметка..." value={noteText} onChange={e => setNoteText(e.target.value)} />
                      <button onClick={addNote}>Добавить</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <div className="db-activity">
          {loading ? <p>Загрузка...</p> : activity.length === 0 ? <p>Нет логов</p> : (
            activity.map(log => (
              <div key={log.id} className="db-log">
                <span className="db-log-icon">{getActivityIcon(log.type)}</span>
                <div className="db-log-content">
                  <p>{getActivityText(log)}</p>
                  <small>{formatDate(log.timestamp)}</small>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'stats' && stats && (
        <div className="db-stats">
          <div className="db-stat-card"><span>Всего игроков</span><strong>{stats.totalPlayers}</strong></div>
          <div className="db-stat-card"><span>Онлайн</span><strong>{stats.onlinePlayers}</strong></div>
          <div className="db-stat-card"><span>Серверов</span><strong>{stats.totalServers}</strong></div>
          <div className="db-stat-card"><span>Серверов онлайн</span><strong>{stats.onlineServers}</strong></div>
          <div className="db-stat-card"><span>Игроков за день</span><strong>{stats.playersToday}</strong></div>
          <div className="db-stat-card"><span>Игроков за неделю</span><strong>{stats.playersWeek}</strong></div>
          <div className="db-stat-card"><span>Новых за день</span><strong>{stats.newPlayersToday}</strong></div>
          <div className="db-stat-card"><span>Новых за неделю</span><strong>{stats.newPlayersWeek}</strong></div>
          <div className="db-stat-card"><span>Логов за день</span><strong>{stats.logsToday}</strong></div>
        </div>
      )}
    </div>
  )
}
