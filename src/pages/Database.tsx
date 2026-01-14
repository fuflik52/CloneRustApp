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
  provider: string
}

interface ActivityLog {
  id: string
  type: string
  data: any
  timestamp: number
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
  const [loading, setLoading] = useState(false)
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerDB | null>(null)
  const [noteText, setNoteText] = useState('')
  const [tagText, setTagText] = useState('')
  const { showToast } = useToast()

  useEffect(() => {
    if (localStorage.getItem('db_auth') === 'true') setIsAuthed(true)
  }, [])

  useEffect(() => {
    if (isAuthed) fetchData()
  }, [isAuthed, tab])

  const checkAuth = () => {
    if (password === SECRET_PASSWORD) {
      setIsAuthed(true)
      localStorage.setItem('db_auth', 'true')
    } else {
      showToast('Неверный пароль', 'error')
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      if (tab === 'players') {
        const res = await fetch('/api/players/all')
        if (res.ok) setPlayers(await res.json())
      } else if (tab === 'activity') {
        const res = await fetch('/api/activity?limit=200')
        if (res.ok) setActivity((await res.json()).logs)
      } else if (tab === 'stats') {
        const res = await fetch('/api/stats')
        if (res.ok) setStats(await res.json())
      }
    } catch {}
    setLoading(false)
  }

  const searchPlayers = async () => {
    if (!search.trim()) { fetchData(); return }
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showToast('Скопировано')
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleString('ru')
  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    return `${hours}ч ${mins}м`
  }
  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins} мин назад`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} ч назад`
    return `${Math.floor(hours / 24)} дн назад`
  }

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'player_connect': return <ConnectIcon />
      case 'player_disconnect': return <DisconnectIcon />
      case 'player_first_join': return <StarIcon />
      case 'player_name_change': return <EditIcon />
      case 'player_new_ip': return <GlobeIcon />
      case 'server_sync': return <SyncIcon />
      default: return <LogIcon />
    }
  }

  const getActivityText = (log: ActivityLog) => {
    const d = log.data
    switch (log.type) {
      case 'player_connect': return <><strong>{d.name}</strong> подключился к <strong>{d.server}</strong></>
      case 'player_disconnect': return <><strong>{d.name}</strong> отключился ({d.reason})</>
      case 'player_first_join': return <><strong>{d.name}</strong> впервые на сервере</>
      case 'player_name_change': return <>Смена ника: <strong>{d.old_name}</strong> → <strong>{d.new_name}</strong></>
      case 'player_new_ip': return <><strong>{d.name}</strong> новый IP: {d.ip}</>
      case 'server_sync': return <>Синхронизация: {d.total} игроков</>
      default: return <>{log.type}</>
    }
  }

  if (!isAuthed) {
    return (
      <div className="db-login">
        <div className="db-login-box">
          <div className="db-login-icon"><LockIcon /></div>
          <h2>Доступ к базе данных</h2>
          <p>Введите пароль для доступа</p>
          <input type="password" placeholder="Пароль" value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && checkAuth()} />
          <button onClick={checkAuth}><KeyIcon /> Войти</button>
        </div>
      </div>
    )
  }

  return (
    <div className="db-page">
      <div className="db-header">
        <div className="db-title"><DatabaseIcon /><span>База данных</span></div>
        <div className="db-tabs">
          <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}><UsersIcon />Игроки</button>
          <button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><ActivityIcon />Активность</button>
          <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}><ChartIcon />Статистика</button>
        </div>
        <button className="db-logout" onClick={() => { setIsAuthed(false); localStorage.removeItem('db_auth') }}><LogoutIcon /></button>
      </div>

      {tab === 'players' && (
        <div className="db-players-layout">
          <div className="db-players-list">
            <div className="db-search">
              <SearchIcon />
              <input placeholder="Поиск по имени, SteamID, IP..." value={search}
                onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchPlayers()} />
              {search && <button className="db-search-clear" onClick={() => { setSearch(''); fetchData() }}><CloseIcon /></button>}
            </div>
            <div className="db-list">
              {loading ? <div className="db-loading"><SpinnerIcon />Загрузка...</div> :
               players.length === 0 ? <div className="db-empty">Нет игроков</div> :
               players.map(p => (
                <div key={p.steam_id} className={`db-player-item ${selectedPlayer?.steam_id === p.steam_id ? 'active' : ''}`} 
                     onClick={() => loadPlayerDetails(p.steam_id)}>
                  <img src={p.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                  <div className="db-player-item-info">
                    <span className="db-player-item-name">{p.steam_name}</span>
                    <span className="db-player-item-meta">{p.total_connections} подкл. · {p.playtime_hours || 0}ч · {timeAgo(p.last_seen)}</span>
                  </div>
                  {p.countryCode && <img className="db-player-item-flag" src={`https://hatscripts.github.io/circle-flags/flags/${p.countryCode}.svg`} alt="" />}
                </div>
              ))}
            </div>
          </div>

          {selectedPlayer ? (
            <div className="db-player-details">
              <div className="db-details-header">
                <img src={selectedPlayer.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                <div className="db-details-header-info">
                  <h3>{selectedPlayer.steam_name}</h3>
                  <div className="db-details-steamid" onClick={() => copyToClipboard(selectedPlayer.steam_id)}>
                    {selectedPlayer.steam_id} <CopyIcon />
                  </div>
                </div>
                <button className="db-details-close" onClick={() => setSelectedPlayer(null)}><CloseIcon /></button>
              </div>

              <div className="db-details-grid">
                <div className="db-details-card">
                  <span className="db-details-label">Первый визит</span>
                  <span className="db-details-value">{formatDate(selectedPlayer.first_seen)}</span>
                </div>
                <div className="db-details-card">
                  <span className="db-details-label">Последний визит</span>
                  <span className="db-details-value">{formatDate(selectedPlayer.last_seen)}</span>
                </div>
                <div className="db-details-card">
                  <span className="db-details-label">Подключений</span>
                  <span className="db-details-value">{selectedPlayer.total_connections}</span>
                </div>
                <div className="db-details-card">
                  <span className="db-details-label">Время игры</span>
                  <span className="db-details-value">{formatTime(selectedPlayer.total_playtime_seconds)}</span>
                </div>
                <div className="db-details-card">
                  <span className="db-details-label">Страна, город</span>
                  <span className="db-details-value">
                    {selectedPlayer.countryCode && <img src={`https://hatscripts.github.io/circle-flags/flags/${selectedPlayer.countryCode}.svg`} alt="" />}
                    {selectedPlayer.country || '—'} {selectedPlayer.city}
                  </span>
                </div>
                <div className="db-details-card">
                  <span className="db-details-label">Провайдер</span>
                  <span className="db-details-value">{selectedPlayer.provider || '—'}</span>
                </div>
              </div>

              <div className="db-details-section">
                <div className="db-details-section-header"><TagIcon /> Теги</div>
                <div className="db-tags-list">
                  {selectedPlayer.tags?.map(t => (
                    <span key={t} className="db-tag">{t} <button onClick={() => removeTag(t)}><CloseIcon /></button></span>
                  ))}
                  <div className="db-tag-add">
                    <input placeholder="Новый тег" value={tagText} onChange={e => setTagText(e.target.value)} 
                           onKeyDown={e => e.key === 'Enter' && addTag()} />
                    <button onClick={addTag}><PlusIcon /></button>
                  </div>
                </div>
              </div>

              <div className="db-details-section">
                <div className="db-details-section-header"><HistoryIcon /> История никнеймов ({selectedPlayer.names_history?.length || 0})</div>
                <div className="db-history-list">
                  {selectedPlayer.names_history?.map((h, i) => (
                    <div key={i} className="db-history-item">
                      <span className="db-history-name">{h.name}</span>
                      <span className="db-history-date">{formatDate(h.date)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="db-details-section">
                <div className="db-details-section-header"><GlobeIcon /> История IP ({selectedPlayer.ips_history?.length || 0})</div>
                <div className="db-history-list">
                  {selectedPlayer.ips_history?.map((h, i) => (
                    <div key={i} className="db-history-item db-ip-item">
                      <div className="db-ip-main">
                        <span className="db-ip-address" onClick={() => copyToClipboard(h.ip)}>{h.ip} <CopyIcon /></span>
                        <span className="db-ip-geo">{h.country} {h.city}</span>
                      </div>
                      <span className="db-ip-provider">{h.provider}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="db-details-section">
                <div className="db-details-section-header"><NoteIcon /> Заметки ({selectedPlayer.notes?.length || 0})</div>
                <div className="db-notes-list">
                  {selectedPlayer.notes?.map(n => (
                    <div key={n.id} className="db-note-item">
                      <p>{n.text}</p>
                      <span>{n.author} · {formatDate(n.date)}</span>
                    </div>
                  ))}
                  <div className="db-note-add">
                    <textarea placeholder="Добавить заметку..." value={noteText} onChange={e => setNoteText(e.target.value)} />
                    <button onClick={addNote}><PlusIcon /> Добавить</button>
                  </div>
                </div>
              </div>

              <div className="db-details-section">
                <div className="db-details-section-header"><ServerIcon /> Серверы</div>
                <div className="db-servers-list">
                  {selectedPlayer.servers_played?.map((s, i) => (
                    <span key={i} className="db-server-tag">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="db-player-empty">
              <UsersIcon />
              <p>Выберите игрока из списка</p>
            </div>
          )}
        </div>
      )}

      {tab === 'activity' && (
        <div className="db-activity">
          {loading ? <div className="db-loading"><SpinnerIcon />Загрузка...</div> :
           activity.length === 0 ? <div className="db-empty">Нет логов</div> :
           activity.map(log => (
            <div key={log.id} className={`db-log db-log-${log.type}`}>
              <div className="db-log-icon">{getActivityIcon(log.type)}</div>
              <div className="db-log-content">
                <p>{getActivityText(log)}</p>
                <span>{formatDate(log.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'stats' && stats && (
        <div className="db-stats">
          <div className="db-stat"><div className="db-stat-icon"><UsersIcon /></div><div className="db-stat-info"><span>Всего игроков</span><strong>{stats.totalPlayers}</strong></div></div>
          <div className="db-stat online"><div className="db-stat-icon"><OnlineIcon /></div><div className="db-stat-info"><span>Сейчас онлайн</span><strong>{stats.onlinePlayers}</strong></div></div>
          <div className="db-stat"><div className="db-stat-icon"><ServerIcon /></div><div className="db-stat-info"><span>Серверов</span><strong>{stats.totalServers}</strong></div></div>
          <div className="db-stat online"><div className="db-stat-icon"><ServerIcon /></div><div className="db-stat-info"><span>Серверов онлайн</span><strong>{stats.onlineServers}</strong></div></div>
          <div className="db-stat"><div className="db-stat-icon"><CalendarIcon /></div><div className="db-stat-info"><span>Игроков за день</span><strong>{stats.playersToday}</strong></div></div>
          <div className="db-stat"><div className="db-stat-icon"><CalendarIcon /></div><div className="db-stat-info"><span>Игроков за неделю</span><strong>{stats.playersWeek}</strong></div></div>
          <div className="db-stat new"><div className="db-stat-icon"><StarIcon /></div><div className="db-stat-info"><span>Новых за день</span><strong>{stats.newPlayersToday}</strong></div></div>
          <div className="db-stat new"><div className="db-stat-icon"><StarIcon /></div><div className="db-stat-info"><span>Новых за неделю</span><strong>{stats.newPlayersWeek}</strong></div></div>
        </div>
      )}
    </div>
  )
}
  


// SVG Icons
function LockIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9.24 2 7 4.24 7 7V9H6C4.9 9 4 9.9 4 11V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V11C20 9.9 19.1 9 18 9H17V7C17 4.24 14.76 2 12 2ZM12 4C13.66 4 15 5.34 15 7V9H9V7C9 5.34 10.34 4 12 4ZM12 13C13.1 13 14 13.9 14 15C14 16.1 13.1 17 12 17C10.9 17 10 16.1 10 15C10 13.9 10.9 13 12 13Z"/></svg> }
function KeyIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.65 10C11.83 7.67 9.61 6 7 6C3.69 6 1 8.69 1 12C1 15.31 3.69 18 7 18C9.61 18 11.83 16.33 12.65 14H17V18H21V14H23V10H12.65ZM7 14C5.9 14 5 13.1 5 12C5 10.9 5.9 10 7 10C8.1 10 9 10.9 9 12C9 13.1 8.1 14 7 14Z"/></svg> }
function DatabaseIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C7.58 3 4 4.79 4 7V17C4 19.21 7.59 21 12 21S20 19.21 20 17V7C20 4.79 16.42 3 12 3ZM18 17C18 17.5 15.87 19 12 19S6 17.5 6 17V14.77C7.61 15.55 9.72 16 12 16S16.39 15.55 18 14.77V17ZM18 12.45C16.7 13.4 14.42 14 12 14C9.58 14 7.3 13.4 6 12.45V9.64C7.47 10.47 9.61 11 12 11C14.39 11 16.53 10.47 18 9.64V12.45ZM12 9C8.13 9 6 7.5 6 7S8.13 5 12 5 18 6.5 18 7 15.87 9 12 9Z"/></svg> }
function UsersIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 11C17.66 11 18.99 9.66 18.99 8C18.99 6.34 17.66 5 16 5C14.34 5 13 6.34 13 8C13 9.66 14.34 11 16 11ZM8 11C9.66 11 10.99 9.66 10.99 8C10.99 6.34 9.66 5 8 5C6.34 5 5 6.34 5 8C5 9.66 6.34 11 8 11ZM8 13C5.67 13 1 14.17 1 16.5V19H15V16.5C15 14.17 10.33 13 8 13ZM16 13C15.71 13 15.38 13.02 15.03 13.05C16.19 13.89 17 15.02 17 16.5V19H23V16.5C23 14.17 18.33 13 16 13Z"/></svg> }
function ActivityIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 5.5C14.6 5.5 15.5 4.6 15.5 3.5C15.5 2.4 14.6 1.5 13.5 1.5C12.4 1.5 11.5 2.4 11.5 3.5C11.5 4.6 12.4 5.5 13.5 5.5ZM9.8 8.9L7 23H9.1L10.9 15L13 17V23H15V15.5L12.9 13.5L13.5 10.5C14.8 12 16.8 13 19 13V11C17.1 11 15.5 10 14.7 8.6L13.7 7C13.3 6.4 12.7 6 12 6C11.7 6 11.5 6.1 11.2 6.1L6 8.3V13H8V9.6L9.8 8.9Z"/></svg> }
function ChartIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M11 3V21H13V3H11ZM5 13V21H7V13H5ZM17 9V21H19V9H17Z"/></svg> }
function LogoutIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 7L15.59 8.41L18.17 11H8V13H18.17L15.59 15.58L17 17L22 12L17 7ZM4 5H12V3H4C2.9 3 2 3.9 2 5V19C2 20.1 2.9 21 4 21H12V19H4V5Z"/></svg> }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.5 14H14.71L14.43 13.73C15.41 12.59 16 11.11 16 9.5C16 5.91 13.09 3 9.5 3C5.91 3 3 5.91 3 9.5C3 13.09 5.91 16 9.5 16C11.11 16 12.59 15.41 13.73 14.43L14 14.71V15.5L19 20.49L20.49 19L15.5 14ZM9.5 14C7.01 14 5 11.99 5 9.5C5 7.01 7.01 5 9.5 5C11.99 5 14 7.01 14 9.5C14 11.99 11.99 14 9.5 14Z"/></svg> }
function CloseIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/></svg> }
function SpinnerIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" className="spin"><path d="M12 4V2C6.48 2 2 6.48 2 12H4C4 7.58 7.58 4 12 4Z"/></svg> }
function CopyIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"/></svg> }
function PlusIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg> }
function TagIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58L12.41 2.58C12.05 2.22 11.55 2 11 2H4C2.9 2 2 2.9 2 4V11C2 11.55 2.22 12.05 2.59 12.42L11.59 21.42C11.95 21.78 12.45 22 13 22C13.55 22 14.05 21.78 14.41 21.41L21.41 14.41C21.78 14.05 22 13.55 22 13C22 12.45 21.77 11.94 21.41 11.58ZM5.5 7C4.67 7 4 6.33 4 5.5C4 4.67 4.67 4 5.5 4C6.33 4 7 4.67 7 5.5C7 6.33 6.33 7 5.5 7Z"/></svg> }
function HistoryIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 3C8.03 3 4 7.03 4 12H1L4.89 15.89L4.96 16.03L9 12H6C6 8.13 9.13 5 13 5C16.87 5 20 8.13 20 12C20 15.87 16.87 19 13 19C11.07 19 9.32 18.21 8.06 16.94L6.64 18.36C8.27 19.99 10.51 21 13 21C17.97 21 22 16.97 22 12C22 7.03 17.97 3 13 3ZM12 8V13L16.28 15.54L17 14.33L13.5 12.25V8H12Z"/></svg> }
function NoteIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H14.82C14.4 1.84 13.3 1 12 1C10.7 1 9.6 1.84 9.18 3H5C3.9 3 3 3.9 3 5V19C3 20.1 3.9 21 5 21H19C20.1 21 21 20.1 21 19V5C21 3.9 20.1 3 19 3ZM12 3C12.55 3 13 3.45 13 4C13 4.55 12.55 5 12 5C11.45 5 11 4.55 11 4C11 3.45 11.45 3 12 3ZM14 17H7V15H14V17ZM17 13H7V11H17V13ZM17 9H7V7H17V9Z"/></svg> }

function ConnectIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z"/></svg> }
function DisconnectIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.47 2 2 6.47 2 12C2 17.53 6.47 22 12 22C17.53 22 22 17.53 22 12C22 6.47 17.53 2 12 2ZM17 15.59L15.59 17L12 13.41L8.41 17L7 15.59L10.59 12L7 8.41L8.41 7L12 10.59L15.59 7L17 8.41L13.41 12L17 15.59Z"/></svg> }
function StarIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 17.27L18.18 21L16.54 13.97L22 9.24L14.81 8.63L12 2L9.19 8.63L2 9.24L7.46 13.97L5.82 21L12 17.27Z"/></svg> }
function EditIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21H6.75L17.81 9.94L14.06 6.19L3 17.25ZM20.71 7.04C21.1 6.65 21.1 6.02 20.71 5.63L18.37 3.29C17.98 2.9 17.35 2.9 16.96 3.29L15.13 5.12L18.88 8.87L20.71 7.04Z"/></svg> }
function GlobeIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM11 19.93C7.05 19.44 4 16.08 4 12C4 11.38 4.08 10.79 4.21 10.21L9 15V16C9 17.1 9.9 18 11 18V19.93ZM17.9 17.39C17.64 16.58 16.9 16 16 16H15V13C15 12.45 14.55 12 14 12H8V10H10C10.55 10 11 9.55 11 9V7H13C14.1 7 15 6.1 15 5V4.59C17.93 5.78 20 8.65 20 12C20 14.08 19.2 15.97 17.9 17.39Z"/></svg> }
function SyncIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4V1L8 5L12 9V6C15.31 6 18 8.69 18 12C18 13.01 17.75 13.97 17.3 14.8L18.76 16.26C19.54 15.03 20 13.57 20 12C20 7.58 16.42 4 12 4ZM12 18C8.69 18 6 15.31 6 12C6 10.99 6.25 10.03 6.7 9.2L5.24 7.74C4.46 8.97 4 10.43 4 12C4 16.42 7.58 20 12 20V23L16 19L12 15V18Z"/></svg> }
function LogIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z"/></svg> }
function OnlineIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2Z"/></svg> }
function ServerIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2 6C2 4.9 2.9 4 4 4H20C21.1 4 22 4.9 22 6V10H2V6ZM6 7.5C6 8.05 5.55 8.5 5 8.5C4.45 8.5 4 8.05 4 7.5C4 6.95 4.45 6.5 5 6.5C5.55 6.5 6 6.95 6 7.5ZM2 12H22V16C22 17.1 21.1 18 20 18H4C2.9 18 2 17.1 2 16V12ZM6 14.5C6 15.05 5.55 15.5 5 15.5C4.45 15.5 4 15.05 4 14.5C4 13.95 4.45 13.5 5 13.5C5.55 13.5 6 13.95 6 14.5Z"/></svg> }
function CalendarIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H18V2H16V4H8V2H6V4H5C3.89 4 3 4.9 3 6V20C3 21.1 3.89 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V10H19V20ZM19 8H5V6H19V8Z"/></svg> }
