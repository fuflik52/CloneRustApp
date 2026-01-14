import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'

interface PlayerDB {
  steam_id: string
  steam_name: string
  avatar: string
  first_seen: number
  last_seen: number
  total_connections: number
  playtime_hours: number
  country: string
  countryCode: string
  city: string
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
  const { showToast } = useToast()
  const navigate = useNavigate()

  const checkAuth = () => {
    if (password === SECRET_PASSWORD) {
      setIsAuthed(true)
      localStorage.setItem('db_auth', 'true')
    } else {
      showToast('Неверный пароль', 'error')
    }
  }

  useEffect(() => {
    if (localStorage.getItem('db_auth') === 'true') setIsAuthed(true)
  }, [])

  useEffect(() => {
    if (isAuthed) fetchData()
  }, [isAuthed, tab])

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

  const openPlayer = (steamId: string) => {
    navigate(`/players?player=${steamId}`)
  }

  const formatDate = (ts: number) => new Date(ts).toLocaleString('ru')
  const timeAgo = (ts: number) => {
    const diff = Date.now() - ts
    const mins = Math.floor(diff / 60000)
    if (mins < 60) return `${mins} мин назад`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours} ч назад`
    const days = Math.floor(hours / 24)
    return `${days} дн назад`
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
      case 'server_sync': return <>Синхронизация: {d.total} игроков ({d.online} онлайн, {d.sleepers} спящих)</>
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
        <div className="db-players">
          <div className="db-search">
            <SearchIcon />
            <input placeholder="Поиск по имени, SteamID, IP..." value={search}
              onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchPlayers()} />
            {search && <button className="db-search-clear" onClick={() => { setSearch(''); fetchData() }}><CloseIcon /></button>}
          </div>

          <div className="db-table">
            <div className="db-table-header">
              <div className="db-col-player">Игрок</div>
              <div className="db-col-id">SteamID</div>
              <div className="db-col-country">Страна</div>
              <div className="db-col-time">Наиграно</div>
              <div className="db-col-seen">Последний визит</div>
              <div className="db-col-action"></div>
            </div>
            <div className="db-table-body">
              {loading ? <div className="db-loading"><SpinnerIcon />Загрузка...</div> :
               players.length === 0 ? <div className="db-empty">Нет игроков</div> :
               players.map(p => (
                <div key={p.steam_id} className="db-row" onClick={() => openPlayer(p.steam_id)}>
                  <div className="db-col-player">
                    <img src={p.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                    <span>{p.steam_name}</span>
                  </div>
                  <div className="db-col-id">{p.steam_id}</div>
                  <div className="db-col-country">
                    {p.countryCode && <img src={`https://hatscripts.github.io/circle-flags/flags/${p.countryCode}.svg`} alt="" />}
                    <span>{p.country || '—'}</span>
                  </div>
                  <div className="db-col-time">{p.playtime_hours || 0}ч</div>
                  <div className="db-col-seen">{timeAgo(p.last_seen)}</div>
                  <div className="db-col-action"><OpenIcon /></div>
                </div>
              ))}
            </div>
          </div>
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
function OpenIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 19H5V5H12V3H5C3.89 3 3 3.9 3 5V19C3 20.1 3.89 21 5 21H19C20.1 21 21 20.1 21 19V12H19V19ZM14 3V5H17.59L7.76 14.83L9.17 16.24L19 6.41V10H21V3H14Z"/></svg> }
function SpinnerIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" className="spin"><path d="M12 4V2C6.48 2 2 6.48 2 12H4C4 7.58 7.58 4 12 4Z"/></svg> }

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
