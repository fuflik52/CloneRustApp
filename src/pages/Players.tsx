import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { useServer } from '../App'

interface PlayerStats {
  kills: number
  deaths: number
  headshots: number
  bodyshots: number
  limbshots: number
  playtime_hours: number
  reports_count: number
  kd: number
}

interface Player {
  steam_id: string
  name: string
  ip: string
  ping: number
  online: boolean
  position: string
  server: string
  serverName?: string
  country?: string
  countryCode?: string
  city?: string
  provider?: string
  avatar?: string
  firstSeen?: string
  stats?: PlayerStats
}

interface SteamInfo {
  steamId: string
  personaName: string
  avatar: string
  profileUrl: string
  privacy: string
  isPrivate: boolean
  accountCreated: string | null
  lastLogoff: string | null
  rustHours: number | null
  recentHours: number | null
  vacBans: number
  gameBans: number
  daysSinceLastBan: number | null
  communityBanned: boolean
}

interface KillEvent {
  id: string
  timestamp: number
  killer_steam_id: string
  killer_name: string
  killer_avatar?: string
  victim_steam_id: string
  victim_name: string
  victim_avatar?: string
  weapon: string
  ammo?: string
  bone: string
  distance: number
  old_hp?: number
  new_hp?: number
  is_headshot: boolean
  server: string
  hit_history?: CombatLogEntry[]
}

interface CombatLogEntry {
  time: number
  attacker: string
  attacker_steam_id?: string
  target: string
  target_steam_id?: string
  weapon: string
  ammo: string
  bone: string
  distance: number
  hp_old: number
  hp_new: number
  info: string
  proj_hits?: number
  proj_integrity?: number
  proj_travel?: number
  proj_mismatch?: number
  desync?: number
  attacker_dead?: boolean
}

interface CustomAction {
  id: string
  name: string
  group: string
  enabled: boolean
  accessLevel: 'safe' | 'dangerous' | 'very-dangerous' | 'admin'
  commands: string[]
  allowOffline: boolean
  selectServer: boolean
  confirmBefore: boolean
}

export default function Players() {
  const { serverId, serverSlug } = useServer()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [allPlayers, setAllPlayers] = useState<Player[]>([])
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [steamInfo, setSteamInfo] = useState<SteamInfo | null>(null)
  const [steamLoading, setSteamLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [activityTab, setActivityTab] = useState<'sessions' | 'ips' | 'nicknames'>('sessions')
  const [statsTab, setStatsTab] = useState<'main' | 'kills'>('main')
  const [statsPeriod, setStatsPeriod] = useState('7d')
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [showDemoStats, setShowDemoStats] = useState(false)
  const [playerKills, setPlayerKills] = useState<KillEvent[]>([])
  const [killsLoading, setKillsLoading] = useState(false)
  const [combatLogOpen, setCombatLogOpen] = useState(false)
  const [selectedKillForCombat, setSelectedKillForCombat] = useState<KillEvent | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number } | null>(null)
  const [customActions, setCustomActions] = useState<CustomAction[]>([])
  const [openSubmenu, setOpenSubmenu] = useState<'actions' | null>(null)
  const [submenuPos, setSubmenuPos] = useState<{ x: number, y: number } | null>(null)
  const [showMuteModal, setShowMuteModal] = useState(false)
  const [showBanModal, setShowBanModal] = useState(false)
  const [showKickModal, setShowKickModal] = useState(false)
  const [muteReason, setMuteReason] = useState('')
  const [muteDuration, setMuteDuration] = useState('1h')
  const [banReason, setBanReason] = useState('')
  const [banDuration, setBanDuration] = useState('')
  const [kickReason, setKickReason] = useState('')
  const [mutedPlayers, setMutedPlayers] = useState<Record<string, { id?: string, reason: string, expires?: number }>>({})
  const [bannedPlayers, setBannedPlayers] = useState<Record<string, { id?: string, reason: string, expires?: number }>>({})
  const [durationDropdownOpen, setDurationDropdownOpen] = useState(false)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const submenuRef = useRef<HTMLDivElement>(null)
  const actionsMenuItemRef = useRef<HTMLButtonElement>(null)
  const { showToast } = useToast()

  const durationOptions = [
    { value: '10m', label: '10 минут' },
    { value: '30m', label: '30 минут' },
    { value: '1h', label: '1 час' },
    { value: '6h', label: '6 часов' },
    { value: '1d', label: '1 день' },
    { value: '7d', label: '7 дней' },
    { value: '0', label: 'Навсегда' }
  ]

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    showToast('Текст скопирован в буфер обмена')
  }

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node
      const inMenu = contextMenuRef.current?.contains(target)
      const inSubmenu = submenuRef.current?.contains(target)
      if (!inMenu && !inSubmenu) setContextMenu(null)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!contextMenu) {
      setOpenSubmenu(null)
      setSubmenuPos(null)
    }
  }, [contextMenu])

  useEffect(() => {
    if (!serverId) return
    const fetchActions = async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/actions`)
        if (res.ok) setCustomActions(await res.json())
      } catch {}
    }
    fetchActions()
  }, [serverId])

  const handleContextMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOpenSubmenu(null)
    setSubmenuPos(null)
    setContextMenu({ x: e.clientX + 8, y: e.clientY + 8 })
  }

  useEffect(() => {
    if (!contextMenu) return
    const raf = requestAnimationFrame(() => {
      if (!contextMenuRef.current) return
      const padding = 8
      const rect = contextMenuRef.current.getBoundingClientRect()
      const maxX = Math.max(padding, window.innerWidth - rect.width - padding)
      const maxY = Math.max(padding, window.innerHeight - rect.height - padding)
      const x = Math.min(Math.max(padding, contextMenu.x), maxX)
      const y = Math.min(Math.max(padding, contextMenu.y), maxY)
      if (x !== contextMenu.x || y !== contextMenu.y) setContextMenu({ x, y })
    })
    return () => cancelAnimationFrame(raf)
  }, [contextMenu])

  useEffect(() => {
    if (!contextMenu || openSubmenu !== 'actions') return
    const raf = requestAnimationFrame(() => {
      if (!actionsMenuItemRef.current || !submenuRef.current) return
      const padding = 8
      const gap = 8
      const itemRect = actionsMenuItemRef.current.getBoundingClientRect()
      const submenuRect = submenuRef.current.getBoundingClientRect()

      let x = itemRect.right + gap
      if (x + submenuRect.width > window.innerWidth - padding) {
        x = itemRect.left - submenuRect.width - gap
      }

      const maxX = Math.max(padding, window.innerWidth - submenuRect.width - padding)
      const maxY = Math.max(padding, window.innerHeight - submenuRect.height - padding)
      x = Math.min(Math.max(padding, x), maxX)

      let y = itemRect.top
      y = Math.min(Math.max(padding, y), maxY)
      setSubmenuPos({ x, y })
    })
    return () => cancelAnimationFrame(raf)
  }, [contextMenu, openSubmenu, customActions.length])

  const executeCustomAction = async (action: CustomAction) => {
    if (!serverId || !selectedPlayer) return
    if (!selectedPlayer.online && !action.allowOffline) {
      showToast('Нельзя выполнить действие для офлайн игрока', 'info')
      return
    }
    if (action.confirmBefore) {
      const ok = window.confirm(`Выполнить действие «${action.name}» для игрока ${selectedPlayer.name}?`)
      if (!ok) return
    }

    try {
      const res = await fetch(`/api/servers/${serverId}/actions/${action.id}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steam_id: selectedPlayer.steam_id,
          steam_name: selectedPlayer.name,
          player_ip: selectedPlayer.ip,
        })
      })

      if (res.ok) {
        const data = await res.json().catch(() => null)
        showToast(`Действие выполнено: ${data?.action || action.name}`, 'success')
      } else {
        const data = await res.json().catch(() => null)
        showToast(data?.error || 'Ошибка выполнения действия', 'error')
      }
    } catch {
      showToast('Ошибка выполнения действия', 'error')
    }

    setContextMenu(null)
  }

  const handleMute = async () => {
    if (!selectedPlayer || !muteReason) return
    try {
      const res = await fetch(`/api/servers/${serverId}/cmd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'mute', target_steam_id: selectedPlayer.steam_id, reason: muteReason, duration: muteDuration, broadcast: true })
      })
      if (res.ok) {
        showToast(`Игрок ${selectedPlayer.name} замьючен`)
        setShowMuteModal(false)
        setMuteReason('')
        // Обновляем список мутов
        setMutedPlayers(prev => ({
          ...prev,
          [selectedPlayer.steam_id]: { reason: muteReason }
        }))
      } else {
        showToast('Ошибка выдачи мута', 'error')
      }
    } catch { showToast('Ошибка выдачи мута', 'error') }
  }

  const handleBan = async () => {
    if (!selectedPlayer || !banReason) return
    try {
      const res = await fetch(`/api/servers/${serverId}/cmd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ban', target_steam_id: selectedPlayer.steam_id, reason: banReason, duration: banDuration || null, broadcast: true })
      })
      if (res.ok) {
        showToast(`Игрок ${selectedPlayer.name} заблокирован`)
        setShowBanModal(false)
        setBanReason('')
        // Обновляем список банов
        setBannedPlayers(prev => ({
          ...prev,
          [selectedPlayer.steam_id]: { reason: banReason }
        }))
      } else {
        showToast('Ошибка блокировки', 'error')
      }
    } catch { showToast('Ошибка блокировки', 'error') }
  }

  const handleKick = async () => {
    if (!selectedPlayer) return
    try {
      const res = await fetch(`/api/servers/${serverId}/cmd`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'kick', target_steam_id: selectedPlayer.steam_id, reason: kickReason || 'Kicked by admin' })
      })
      if (res.ok) {
        showToast(`Игрок ${selectedPlayer.name} кикнут`)
        setShowKickModal(false)
        setKickReason('')
      } else {
        showToast('Ошибка кика', 'error')
      }
    } catch { showToast('Ошибка кика', 'error') }
  }

  const goToPlayerChat = () => {
    if (!selectedPlayer || !serverSlug) return
    navigate(`/${serverSlug}/chat?player=${selectedPlayer.steam_id}`)
    setContextMenu(null)
  }

  // Загружаем муты и баны
  useEffect(() => {
    const fetchMutesAndBans = async () => {
      if (!serverId) return
      try {
        const [mutesRes, bansRes] = await Promise.all([
          fetch(`/api/servers/${serverId}/mutes`),
          fetch(`/api/servers/${serverId}/bans`)
        ])
        if (mutesRes.ok) {
          const mutes = await mutesRes.json()
          const mutesMap: Record<string, { id?: string, reason: string, expires?: number }> = {}
          mutes.forEach((m: any) => { mutesMap[m.steam_id] = { id: m.id, reason: m.reason, expires: m.expires } })
          setMutedPlayers(mutesMap)
        }
        if (bansRes.ok) {
          const bans = await bansRes.json()
          const bansMap: Record<string, { id?: string, reason: string, expires?: number }> = {}
          bans.forEach((b: any) => { bansMap[b.steam_id] = { id: b.id, reason: b.reason, expires: b.expires } })
          setBannedPlayers(bansMap)
        }
      } catch {}
    }
    fetchMutesAndBans()
    const interval = setInterval(fetchMutesAndBans, 10000)
    return () => clearInterval(interval)
  }, [serverId])

  const handleUnmute = async () => {
    if (!selectedPlayer || !serverId) return
    try {
      const mute = mutedPlayers[selectedPlayer.steam_id]
      const res = await fetch(`/api/servers/${serverId}/mutes/${mute?.id || selectedPlayer.steam_id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Мут снят')
        setMutedPlayers(prev => {
          const copy = { ...prev }
          delete copy[selectedPlayer.steam_id]
          return copy
        })
        // Отправляем команду unmute на игровой сервер
        await fetch(`/api/servers/${serverId}/cmd`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'unmute', steam_id: selectedPlayer.steam_id })
        })
      }
    } catch {
      showToast('Ошибка', 'error')
    }
    setContextMenu(null)
  }

  const handleUnban = async () => {
    if (!selectedPlayer || !serverId) return
    try {
      const ban = bannedPlayers[selectedPlayer.steam_id]
      const res = await fetch(`/api/servers/${serverId}/bans/${ban?.id || selectedPlayer.steam_id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Бан снят')
        setBannedPlayers(prev => {
          const copy = { ...prev }
          delete copy[selectedPlayer.steam_id]
          return copy
        })
        // Отправляем команду unban на игровой сервер
        await fetch(`/api/servers/${serverId}/cmd`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'unban', steam_id: selectedPlayer.steam_id })
        })
      }
    } catch {
      showToast('Ошибка', 'error')
    }
    setContextMenu(null)
  }

  // Читаем player из URL при загрузке
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const playerId = params.get('player')
    if (playerId && allPlayers.length > 0) {
      const player = allPlayers.find(p => p.steam_id === playerId)
      if (player && !selectedPlayer) {
        handleSelectPlayer(player)
      }
    }
  }, [allPlayers])

  // Загружаем Steam инфо при выборе игрока
  const handleSelectPlayer = async (player: Player) => {
    setSelectedPlayer(player)
    setSteamInfo(null)
    setSteamLoading(true)
    setActiveTab('overview')
    setPlayerStats(null)
    
    // Обновляем URL
    const url = new URL(window.location.href)
    url.searchParams.set('player', player.steam_id)
    window.history.pushState({}, '', url.toString())
    
    // Загружаем Steam инфо
    try {
      const res = await fetch(`/api/player/${player.steam_id}/steam`)
      if (res.ok) {
        const data = await res.json()
        if (!data.error) {
          setSteamInfo(data)
        }
      }
    } catch {}
    setSteamLoading(false)
    
    // Загружаем статистику
    loadPlayerStats(player.steam_id)
  }

  const loadPlayerStats = async (steamId: string) => {
    setStatsLoading(true)
    try {
      const res = await fetch(`/api/player/${steamId}/stats`)
      if (res.ok) {
        const data = await res.json()
        setPlayerStats(data)
      }
    } catch {}
    setStatsLoading(false)
  }

  const loadPlayerKills = async (steamId: string) => {
    setKillsLoading(true)
    try {
      const res = await fetch(`/api/player/${steamId}/kills`)
      if (res.ok) {
        const data = await res.json()
        setPlayerKills(data)
      }
    } catch {}
    setKillsLoading(false)
  }

  // Демо данные для статистики
  const demoStats: PlayerStats = {
    kills: 156,
    deaths: 89,
    headshots: 67,
    bodyshots: 54,
    limbshots: 35,
    playtime_hours: 247,
    reports_count: 3,
    kd: 1.75
  }

  // Демо данные для убийств
  const demoKills: KillEvent[] = [
    { id: '1', timestamp: Date.now() - 3600000, killer_steam_id: selectedPlayer?.steam_id || '', killer_name: selectedPlayer?.name || 'Player', killer_avatar: selectedPlayer?.avatar, victim_steam_id: '76561198012345678', victim_name: 'дед бом-бом', victim_avatar: '', weapon: 'ak47u', ammo: 'riflebullet', bone: 'head', distance: 23, old_hp: 59.32, new_hp: 0, is_headshot: true, server: 'Main', hit_history: [
      { time: 0, attacker: 'player', attacker_steam_id: selectedPlayer?.steam_id || '', target: 'player', target_steam_id: '76561198012345678', weapon: 'ak47u', ammo: 'riflebullet', bone: 'head', distance: 23, hp_old: 59.32, hp_new: 0, info: 'killed' },
      { time: 0.16, attacker: 'player', attacker_steam_id: selectedPlayer?.steam_id || '', target: 'player', target_steam_id: '76561198012345678', weapon: 'ak47u', ammo: 'riflebullet', bone: 'chest', distance: 24, hp_old: 78.50, hp_new: 59.32, info: 'hit' },
      { time: 0.38, attacker: 'player', attacker_steam_id: selectedPlayer?.steam_id || '', target: 'player', target_steam_id: '76561198012345678', weapon: 'ak47u', ammo: 'riflebullet', bone: 'stomach', distance: 25, hp_old: 100, hp_new: 78.50, info: 'hit' },
    ] },
    { id: '2', timestamp: Date.now() - 7200000, killer_steam_id: '76561198087654321', killer_name: 'RustKing', killer_avatar: '', victim_steam_id: selectedPlayer?.steam_id || '', victim_name: selectedPlayer?.name || 'Player', victim_avatar: selectedPlayer?.avatar, weapon: 'lr300', ammo: 'riflebullet', bone: 'chest', distance: 45, old_hp: 100, new_hp: 0, is_headshot: false, server: 'Main', hit_history: [
      { time: 0, attacker: 'player', attacker_steam_id: '76561198087654321', target: 'player', target_steam_id: selectedPlayer?.steam_id || '', weapon: 'lr300', ammo: 'riflebullet', bone: 'chest', distance: 45, hp_old: 35.20, hp_new: 0, info: 'killed' },
      { time: 0.12, attacker: 'player', attacker_steam_id: '76561198087654321', target: 'player', target_steam_id: selectedPlayer?.steam_id || '', weapon: 'lr300', ammo: 'riflebullet', bone: 'stomach', distance: 44, hp_old: 68.40, hp_new: 35.20, info: 'hit' },
      { time: 0.24, attacker: 'player', attacker_steam_id: '76561198087654321', target: 'player', target_steam_id: selectedPlayer?.steam_id || '', weapon: 'lr300', ammo: 'riflebullet', bone: 'chest', distance: 46, hp_old: 100, hp_new: 68.40, info: 'hit' },
    ] },
    { id: '3', timestamp: Date.now() - 10800000, killer_steam_id: selectedPlayer?.steam_id || '', killer_name: selectedPlayer?.name || 'Player', killer_avatar: selectedPlayer?.avatar, victim_steam_id: '76561198111222333', victim_name: 'ShadowHunter', victim_avatar: '', weapon: 'bolt', ammo: 'riflebullet', bone: 'head', distance: 156, old_hp: 80, new_hp: 0, is_headshot: true, server: 'Main', hit_history: [
      { time: 0, attacker: 'player', attacker_steam_id: selectedPlayer?.steam_id || '', target: 'player', target_steam_id: '76561198111222333', weapon: 'bolt', ammo: 'riflebullet', bone: 'head', distance: 156, hp_old: 80, hp_new: 0, info: 'killed' },
    ] },
    { id: '4', timestamp: Date.now() - 14400000, killer_steam_id: selectedPlayer?.steam_id || '', killer_name: selectedPlayer?.name || 'Player', killer_avatar: selectedPlayer?.avatar, victim_steam_id: '76561198444555666', victim_name: 'NightWolf', victim_avatar: '', weapon: 'mp5', ammo: 'pistolbullet', bone: 'stomach', distance: 12, old_hp: 45, new_hp: 0, is_headshot: false, server: 'Main', hit_history: [
      { time: 0, attacker: 'player', attacker_steam_id: selectedPlayer?.steam_id || '', target: 'player', target_steam_id: '76561198444555666', weapon: 'mp5', ammo: 'pistolbullet', bone: 'stomach', distance: 12, hp_old: 45, hp_new: 0, info: 'killed' },
      { time: 0.08, attacker: 'player', attacker_steam_id: selectedPlayer?.steam_id || '', target: 'player', target_steam_id: '76561198444555666', weapon: 'mp5', ammo: 'pistolbullet', bone: 'chest', distance: 11, hp_old: 72, hp_new: 45, info: 'hit' },
      { time: 0.16, attacker: 'player', attacker_steam_id: selectedPlayer?.steam_id || '', target: 'player', target_steam_id: '76561198444555666', weapon: 'mp5', ammo: 'pistolbullet', bone: 'arm', distance: 13, hp_old: 100, hp_new: 72, info: 'hit' },
    ] },
  ]

  const getDisplayStats = () => {
    if (showDemoStats) return demoStats
    return playerStats || selectedPlayer?.stats || null
  }

  const getDisplayKills = () => {
    if (showDemoStats) return demoKills
    return playerKills
  }

  const openCombatLog = (kill: KillEvent) => {
    setSelectedKillForCombat(kill)
    setCombatLogOpen(true)
  }

  const handleCloseModal = () => {
    setSelectedPlayer(null)
    setSteamInfo(null)
    setPlayerStats(null)
    // Убираем player из URL
    const url = new URL(window.location.href)
    url.searchParams.delete('player')
    window.history.pushState({}, '', url.toString())
  }

  useEffect(() => {
    const fetchPlayers = async () => {
      if (!serverId) return
      
      try {
        // Загружаем всех игроков из базы сервера (включая офлайн)
        const res = await fetch(`/api/servers/${serverId}/players/all`)
        if (res.ok) {
          const dbPlayers = await res.json()
          // Также загружаем онлайн игроков чтобы знать кто сейчас в игре
          const onlineRes = await fetch(`/api/servers/${serverId}/players`)
          const onlinePlayers = onlineRes.ok ? await onlineRes.json() : []
          const onlineIds = new Set(onlinePlayers.map((p: Player) => p.steam_id))
          
          // Преобразуем данные из базы в формат Player
          const players = dbPlayers.map((p: any) => ({
            steam_id: p.steam_id,
            name: p.steam_name,
            ip: p.ips_history?.[p.ips_history.length - 1]?.ip || '',
            ping: 0,
            online: onlineIds.has(p.steam_id),
            position: '',
            server: p.servers_played?.[p.servers_played.length - 1] || '',
            serverName: p.servers_played?.[p.servers_played.length - 1] || '',
            country: p.country || p.ips_history?.[p.ips_history.length - 1]?.country || '',
            countryCode: p.countryCode || '',
            city: p.city || p.ips_history?.[p.ips_history.length - 1]?.city || '',
            provider: p.provider || p.ips_history?.[p.ips_history.length - 1]?.provider || '',
            avatar: p.avatar || '',
            stats: p.stats || null
          }))
          setAllPlayers(players)
        }
      } catch {}
    }
    fetchPlayers()
    const interval = setInterval(fetchPlayers, 60000)
    return () => clearInterval(interval)
  }, [serverId])

  const players = allPlayers.filter(p => 
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    p.ip.includes(search) ||
    p.steam_id.includes(search)
  )

  return (
    <div className="players-page">
      <div className="players-header">
        <div className="players-title">
          <span>Игроки</span>
        </div>
        <div className="players-actions">
          <div className="search-input-wrapper">
            <input type="text" placeholder="Поиск" value={search} onChange={e => setSearch(e.target.value)} />
            {search && (
              <svg className="clear-icon" viewBox="0 0 24 24" onClick={() => setSearch('')}>
                <path fillRule="evenodd" clipRule="evenodd" d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM9.70711 8.29289C9.31658 7.90237 8.68342 7.90237 8.29289 8.29289C7.90237 8.68342 7.90237 9.31658 8.29289 9.70711L10.5858 12L8.29289 14.2929C7.90237 14.6834 7.90237 15.3166 8.29289 15.7071C8.68342 16.0976 9.31658 16.0976 9.70711 15.7071L12 13.4142L14.2929 15.7071C14.6834 16.0976 15.3166 16.0976 15.7071 15.7071C16.0976 15.3166 16.0976 14.6834 15.7071 14.2929L13.4142 12L15.7071 9.70711C16.0976 9.31658 16.0976 8.68342 15.7071 8.29289C15.3166 7.90237 14.6834 7.90237 14.2929 8.29289L12 10.5858L9.70711 8.29289Z" />
              </svg>
            )}
          </div>
          <button className="filter-btn"><FilterIcon /></button>
        </div>
      </div>

      <div className="players-table-header">
        <div className="table-col" style={{ minWidth: 180, maxWidth: 260 }}><PlayerIcon /><span>Игрок</span></div>
        <div className="table-col" style={{ minWidth: 120, maxWidth: 180 }}><TypeIcon /><span>Тип</span></div>
        <div className="table-col" style={{ minWidth: 120, maxWidth: 200 }}><IpIcon /><span>IP адрес</span></div>
        <div className="table-col" style={{ minWidth: 120, maxWidth: 200 }}><CountryIcon /><span>Страна</span></div>
        <div className="table-col" style={{ minWidth: 120, maxWidth: 200 }}><CityIcon /><span>Город</span></div>
        <div className="table-col" style={{ minWidth: 120, maxWidth: 200 }}><ProviderIcon /><span>Провайдер</span></div>
        <div className="table-col text-right" style={{ minWidth: 120 }}><ServerIcon /><span>Сервер</span></div>
      </div>

      <div className="players-list">
        {players.length === 0 ? (
          <div className="players-empty"><p>Нет игроков</p></div>
        ) : (
          players.map(player => (
            <div key={player.steam_id} className="player-row" onClick={() => handleSelectPlayer(player)}>
              <div className="table-col" style={{ minWidth: 180, maxWidth: 260 }}>
                <div className="player-info">
                  <div className="player-avatar">
                    <img src={player.avatar || `https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg`} alt={player.name} onError={(e) => { (e.target as HTMLImageElement).src = 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg' }} />
                    <div className={`status-badge ${player.online ? 'online' : 'offline'}`} />
                  </div>
                  <div className="player-details">
                    <span className="player-name">{player.name}</span>
                    <span className="player-status">{player.steam_id}</span>
                  </div>
                </div>
              </div>
              <div className="table-col" style={{ minWidth: 120, maxWidth: 180 }}><span className="type-badge">Лицензия</span></div>
              <div className="table-col ip-col" style={{ minWidth: 120, maxWidth: 200 }}>
                <span className="ip-blur">{player.ip}</span>
                <CopyIcon />
              </div>
              <div className="table-col" style={{ minWidth: 120, maxWidth: 200 }}>
                {player.countryCode && <img src={`https://hatscripts.github.io/circle-flags/flags/${player.countryCode}.svg`} alt="" className="country-flag" />}
                <span>{player.country || '—'}</span>
              </div>
              <div className="table-col" style={{ minWidth: 120, maxWidth: 200 }}><span>{player.city || '—'}</span></div>
              <div className="table-col" style={{ minWidth: 120, maxWidth: 200 }}><span>{player.provider || '—'}</span></div>
              <div className="table-col text-right" style={{ minWidth: 120 }}><span>{player.serverName || player.server}</span></div>
            </div>
          ))
        )}
      </div>

      {/* Player Modal */}
      {selectedPlayer && (
        <div className="player-modal-overlay" onClick={handleCloseModal}>
          <div className="player-modal" onClick={e => e.stopPropagation()}>
            <div className="player-modal-nav">
              <div className="modal-nav-header">
                <div className="modal-player-card">
                  <div className="modal-player-avatar">
                    <img src={steamInfo?.avatar || selectedPlayer.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                    <div className={`modal-status-badge ${selectedPlayer.online ? 'online' : 'offline'}`} />
                  </div>
                  <div className="modal-player-info">
                    <span className="modal-player-name">{steamInfo?.personaName || selectedPlayer.name}</span>
                    <span className="modal-player-status">{selectedPlayer.online ? 'онлайн' : 'нет на месте'}</span>
                  </div>
                </div>
                <div className="modal-action-btns">
                  <a href={`https://rustcheatcheck.ru/panel/player/${selectedPlayer.steam_id}`} target="_blank" rel="noopener noreferrer" className="modal-action-btn"><RccIcon /></a>
                  <a href={`https://steamcommunity.com/profiles/${selectedPlayer.steam_id}/`} target="_blank" rel="noopener noreferrer" className="modal-action-btn"><SteamIcon /></a>
                  <button className="modal-action-btn" onClick={handleContextMenu}><MoreIcon /></button>
                </div>
              </div>
              <div className="modal-menu-items">
                <div className={`modal-menu-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}><OverviewIcon /> Обзор</div>
                <div className={`modal-menu-item ${activeTab === 'team' ? 'active' : ''}`} onClick={() => setActiveTab('team')}><TeamIcon /> Команда</div>
                <div className={`modal-menu-item ${activeTab === 'reports' ? 'active' : ''}`} onClick={() => setActiveTab('reports')}><ReportsIcon /> Репорты</div>
                <div className={`modal-menu-item ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}><StatsIcon /> Статистика</div>
                <div className={`modal-menu-item ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}><ActivityIcon /> Лог активности</div>
                <div className={`modal-menu-item ${activeTab === 'alerts' ? 'active' : ''}`} onClick={() => setActiveTab('alerts')}><AlertsIcon /> Оповещения</div>
                <div className={`modal-menu-item ${activeTab === 'drawings' ? 'active' : ''}`} onClick={() => setActiveTab('drawings')}><DrawingsIcon /> Рисунки</div>
                <div className={`modal-menu-item ${activeTab === 'checks' ? 'active' : ''}`} onClick={() => setActiveTab('checks')}><ChecksIcon /> Проверки</div>
                <div className={`modal-menu-item ${activeTab === 'mutes' ? 'active' : ''}`} onClick={() => setActiveTab('mutes')}><MutesIcon /> Муты</div>
                <div className={`modal-menu-item ${activeTab === 'bans' ? 'active' : ''}`} onClick={() => setActiveTab('bans')}><BansIcon /> Блокировки</div>
              </div>
            </div>
            <div className="player-modal-content">
              <div className="modal-content-body">
                {activeTab === 'overview' && (
                  <>
                    <div className="modal-tags">
                      <span className="modal-tag">👶 Соло</span>
                      {selectedPlayer.countryCode && <span className="modal-tag">🌍 {selectedPlayer.countryCode.toUpperCase()}</span>}
                    </div>
                    <div className="modal-info-card">
                      <div className="modal-card-title">Об игроке</div>
                      <div className="modal-card-grid">
                        <div className="modal-card-cell">
                          <span className="cell-label">Играл на</span>
                          <span className="cell-value">{selectedPlayer.serverName || selectedPlayer.server || 'N/A'}</span>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">SteamID</span>
                          <div className="cell-value-actions">
                            <span className="cell-value-white">{selectedPlayer.steam_id || 'N/A'}</span>
                            <button className="cell-action-btn" onClick={() => copyToClipboard(selectedPlayer.steam_id)} title="Копировать"><CopySmallIcon /></button>
                            <a href={`https://steamcommunity.com/profiles/${selectedPlayer.steam_id}/`} target="_blank" className="cell-action-btn" title="Открыть Steam"><OpenLinkIcon /></a>
                          </div>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">Впервые замечен</span>
                          <span className="cell-value">{selectedPlayer.firstSeen || `${new Date().toLocaleDateString('ru')} в ${new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`}</span>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">IP адрес</span>
                          <div className="cell-value-actions">
                            <span className="cell-value-white">{selectedPlayer.ip || 'N/A'}</span>
                            <button className="cell-action-btn" onClick={() => copyToClipboard(selectedPlayer.ip)} title="Копировать"><CopySmallIcon /></button>
                          </div>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">Страна, город</span>
                          <div className="cell-value-country">
                            {selectedPlayer.countryCode && <img src={`https://hatscripts.github.io/circle-flags/flags/${selectedPlayer.countryCode}.svg`} alt="" />}
                            <span>{selectedPlayer.country && selectedPlayer.city ? `${selectedPlayer.country}, ${selectedPlayer.city}` : selectedPlayer.country || 'N/A'}</span>
                          </div>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">Провайдер</span>
                          <span className="cell-value">{selectedPlayer.provider || 'N/A'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="modal-info-card">
                      <div className="modal-card-title">Информация из Steam</div>
                      {steamLoading ? (
                        <div className="steam-loading">
                          <div className="steam-spinner"></div>
                          <span>Загрузка данных Steam...</span>
                        </div>
                      ) : (
                      <div className="modal-card-grid">
                        <div className="modal-card-cell">
                          <span className="cell-label">Приватность</span>
                          <span className="cell-value">{steamInfo?.privacy || 'N/A'}</span>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">Аккаунт создан</span>
                          <span className="cell-value">
                            {steamInfo?.accountCreated 
                              ? `${new Date(steamInfo.accountCreated).toLocaleDateString('ru')} в ${new Date(steamInfo.accountCreated).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`
                              : steamInfo?.isPrivate ? 'Информация скрыта' : 'N/A'}
                          </span>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">Часов в RUST</span>
                          <span className="cell-value">
                            {steamInfo?.rustHours !== null && steamInfo?.rustHours !== undefined
                              ? `~${steamInfo.rustHours.toLocaleString()}`
                              : steamInfo?.isPrivate ? 'Информация скрыта' : 'N/A'}
                          </span>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">Часов за 2 недели</span>
                          <span className="cell-value">
                            {steamInfo?.recentHours !== null && steamInfo?.recentHours !== undefined
                              ? `${steamInfo.recentHours}`
                              : steamInfo?.isPrivate ? 'Информация скрыта' : 'N/A'}
                          </span>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">Gamebans / VAC</span>
                          <span className="cell-value" style={{ color: (steamInfo?.vacBans || 0) + (steamInfo?.gameBans || 0) > 0 ? '#ef4444' : undefined }}>
                            {steamInfo 
                              ? (steamInfo.vacBans + steamInfo.gameBans > 0 
                                  ? `${steamInfo.gameBans} game / ${steamInfo.vacBans} VAC` 
                                  : 'Банов нет')
                              : 'N/A'}
                          </span>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">Последнее обновление</span>
                          <span className="cell-value">{new Date().toLocaleDateString('ru')} в {new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                      )}
                    </div>
                  </>
                )}

                {activeTab === 'activity' && (
                  <div className="activity-log">
                    <div className="activity-tabs">
                      <button className={`activity-tab ${activityTab === 'sessions' ? 'active' : ''}`} onClick={() => setActivityTab('sessions')}>Сессии</button>
                      <button className={`activity-tab ${activityTab === 'ips' ? 'active' : ''}`} onClick={() => setActivityTab('ips')}>IP адреса</button>
                      <button className={`activity-tab ${activityTab === 'nicknames' ? 'active' : ''}`} onClick={() => setActivityTab('nicknames')}>Никнеймы</button>
                    </div>

                    {activityTab === 'sessions' && (
                      <div className="activity-list">
                        <div className="activity-card">
                          <div className="activity-card-header">
                            <div className="activity-badge"><CalendarIcon /> {new Date().toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })} в {new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                            <div className="activity-badge red">Выход</div>
                          </div>
                          <div className="activity-card-row"><span className="row-label">Длительность сеанса:</span><span className="row-value">5 минут</span></div>
                          <div className="activity-card-row"><span className="row-label">Статус:</span><span className="row-value">Онлайн</span></div>
                          <div className="activity-card-row"><span className="row-label">Причина выхода:</span><span className="row-value">Disconnected: disconnect</span></div>
                        </div>
                        <div className="activity-connector"></div>
                        <div className="activity-card">
                          <div className="activity-card-header">
                            <div className="activity-badge"><CalendarIcon /> {new Date().toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })} в {new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                            <div className="activity-badge green">Вход</div>
                          </div>
                          <div className="activity-card-row"><span className="row-label">IP адрес:</span><span className="row-value hyperlink">{selectedPlayer.ip}</span></div>
                          <div className="activity-card-row"><span className="row-label">Сервер:</span><span className="row-value">{selectedPlayer.serverName || selectedPlayer.server}</span></div>
                          <div className="activity-card-row"><span className="row-label">Тип клиента:</span><span className="row-value">Лицензия</span></div>
                        </div>
                      </div>
                    )}

                    {activityTab === 'ips' && (
                      <div className="activity-list">
                        <div className="activity-info-box">
                          <div className="activity-info-gradient"></div>
                          <InfoIcon />
                          <span>В этом разделе отображаются все IP-адреса, с которых этот игрок заходил на серверы.</span>
                        </div>
                        <div className="activity-card">
                          <div className="activity-card-header">
                            <div className="activity-badge"><CalendarIcon /> {new Date().toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })} в {new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
                            <button className="activity-share-btn"><ShareIcon /></button>
                          </div>
                          <div className="activity-card-row"><span className="row-label">IP адрес:</span><div className="row-value-copy"><span className="hyperlink">{selectedPlayer.ip}</span><button className="row-copy-btn" onClick={() => copyToClipboard(selectedPlayer.ip)}><CopySmallIcon /></button></div></div>
                          <div className="activity-card-row"><span className="row-label">Страна:</span><span className="row-value">{selectedPlayer.countryCode && <img src={`https://hatscripts.github.io/circle-flags/flags/${selectedPlayer.countryCode}.svg`} className="mini-flag" />} {selectedPlayer.country}</span></div>
                          <div className="activity-card-row"><span className="row-label">Город:</span><span className="row-value">{selectedPlayer.city}</span></div>
                          <div className="activity-card-row"><span className="row-label">Провайдер:</span><span className="row-value">{selectedPlayer.provider}</span></div>
                        </div>
                      </div>
                    )}

                    {activityTab === 'nicknames' && (
                      <div className="activity-list">
                        <div className="activity-info-box">
                          <div className="activity-info-gradient"></div>
                          <InfoIcon />
                          <span>В этом разделе отображаются все известные нам ники этого игрока.</span>
                        </div>
                        <div className="activity-card">
                          <div className="activity-card-header">
                            <div className="activity-badge"><CalendarIcon /> {new Date().toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })} в {new Date().toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}</div>
                            <button className="activity-share-btn"><ShareIcon /></button>
                          </div>
                          <div className="activity-card-row"><span className="row-label">Никнейм:</span><div className="row-value-copy"><span>{selectedPlayer.name}</span><button className="row-copy-btn" onClick={() => copyToClipboard(selectedPlayer.name)}><CopySmallIcon /></button></div></div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'stats' && (
                  <div className="stats-page">
                    <div className="stats-header">
                      <div className="stats-tabs">
                        <button className={`stats-tab ${statsTab === 'main' ? 'active' : ''}`} onClick={() => setStatsTab('main')}>Основное</button>
                        <button className={`stats-tab ${statsTab === 'kills' ? 'active' : ''}`} onClick={() => { setStatsTab('kills'); if (selectedPlayer && !showDemoStats) loadPlayerKills(selectedPlayer.steam_id) }}>Убийства</button>
                      </div>
                      <div className="stats-header-actions">
                        <button className={`demo-btn ${showDemoStats ? 'active' : ''}`} onClick={() => setShowDemoStats(!showDemoStats)}>
                          {showDemoStats ? 'Скрыть демо' : 'Показать демо'}
                        </button>
                        <div className="stats-period-select">
                          <select value={statsPeriod} onChange={(e) => setStatsPeriod(e.target.value)}>
                            <option value="7d">7 дней</option>
                            <option value="30d">30 дней</option>
                            <option value="all">Всё время</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {statsTab === 'main' && (
                      <>
                        {statsLoading && !showDemoStats ? (
                          <div className="stats-loading">
                            <div className="steam-spinner"></div>
                            <span>Загрузка статистики...</span>
                          </div>
                        ) : (
                          <>
                            <div className="stats-cards-row">
                              <div className="stats-card">
                                <span className="stats-card-title">K/D</span>
                                <span className="stats-card-value">{getDisplayStats()?.kd?.toFixed(2) || '0.00'}</span>
                              </div>
                              <div className="stats-card">
                                <span className="stats-card-title">На проекте</span>
                                <span className="stats-card-value">{getDisplayStats()?.playtime_hours?.toFixed(0) || '0'} ч.</span>
                              </div>
                              <div className="stats-card">
                                <span className="stats-card-title">Репортов</span>
                                <span className="stats-card-value">{getDisplayStats()?.reports_count || '0'}</span>
                              </div>
                            </div>

                            <div className="stats-charts-row">
                              <div className="stats-chart-card">
                                <div className="stats-chart-info">
                                  <div className="stats-chart-legend">
                                    <div className="legend-item">
                                      <span className="legend-dot kills"></span>
                                      <span className="legend-label">Убийств</span>
                                    </div>
                                    <div className="legend-value">{getDisplayStats()?.kills || 0}</div>
                                  </div>
                                  <div className="stats-chart-legend">
                                    <div className="legend-item">
                                      <span className="legend-dot deaths"></span>
                                      <span className="legend-label">Смертей</span>
                                    </div>
                                    <div className="legend-value">{getDisplayStats()?.deaths || 0}</div>
                                  </div>
                                </div>
                                <div className="stats-donut-chart">
                                  <DonutChart 
                                    kills={getDisplayStats()?.kills || 0} 
                                    deaths={getDisplayStats()?.deaths || 0} 
                                  />
                                </div>
                              </div>

                              <div className="stats-chart-card">
                                <div className="stats-chart-info">
                                  <div className="stats-chart-legend">
                                    <div className="legend-item">
                                      <span className="legend-dot headshot"></span>
                                      <span className="legend-label">В голову</span>
                                    </div>
                                    <div className="legend-value">{getDisplayStats()?.headshots || 0}</div>
                                  </div>
                                  <div className="stats-chart-legend">
                                    <div className="legend-item">
                                      <span className="legend-dot bodyshot"></span>
                                      <span className="legend-label">В туловище</span>
                                    </div>
                                    <div className="legend-value">{getDisplayStats()?.bodyshots || 0}</div>
                                  </div>
                                  <div className="stats-chart-legend">
                                    <div className="legend-item">
                                      <span className="legend-dot limbshot"></span>
                                      <span className="legend-label">В конечности</span>
                                    </div>
                                    <div className="legend-value">{getDisplayStats()?.limbshots || 0}</div>
                                  </div>
                                </div>
                                <div className="stats-donut-chart">
                                  <BodyPartsChart 
                                    headshots={getDisplayStats()?.headshots || 0}
                                    bodyshots={getDisplayStats()?.bodyshots || 0}
                                    limbshots={getDisplayStats()?.limbshots || 0}
                                  />
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    )}

                    {statsTab === 'kills' && (
                      <div className="kills-tab">
                        {killsLoading && !showDemoStats ? (
                          <div className="stats-loading">
                            <div className="steam-spinner"></div>
                            <span>Загрузка убийств...</span>
                          </div>
                        ) : (
                          <>
                            <div className="kills-table-header">
                              <div className="kills-col date">Дата</div>
                              <div className="kills-col killer">Убийца</div>
                              <div className="kills-col target">Цель</div>
                              <div className="kills-col weapon">Оружие</div>
                              <div className="kills-col combatlog">Combatlog</div>
                            </div>
                            <div className="kills-list">
                              {getDisplayKills().length === 0 ? (
                                <div className="kills-empty">
                                  <span>Нет данных об убийствах</span>
                                </div>
                              ) : (
                                getDisplayKills().map(kill => (
                                  <div key={kill.id} className="kills-row">
                                    <div className="kills-col date">
                                      <span className="kill-date">{new Date(kill.timestamp).toLocaleDateString('ru', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                                      <span className="kill-time">{new Date(kill.timestamp).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                                    </div>
                                    <div className="kills-col killer">
                                      <span className={`killer-name ${kill.killer_steam_id === selectedPlayer?.steam_id ? 'is-player' : ''}`}>
                                        {kill.killer_name.length > 12 ? kill.killer_name.slice(0, 12) + '...' : kill.killer_name}
                                      </span>
                                    </div>
                                    <div className="kills-col target">
                                      <span className={`target-name ${kill.victim_steam_id === selectedPlayer?.steam_id ? 'is-player' : ''}`}>
                                        {kill.victim_name.length > 12 ? kill.victim_name.slice(0, 12) + '...' : kill.victim_name}
                                      </span>
                                    </div>
                                    <div className="kills-col weapon">
                                      <span className="weapon-name">{kill.weapon}</span>
                                      <span className="weapon-info">{kill.distance.toFixed(0)} м. | <span className={kill.is_headshot ? 'headshot' : ''}>{kill.bone}</span></span>
                                    </div>
                                    <div className="kills-col combatlog">
                                      <button className="combatlog-btn" onClick={() => openCombatLog(kill)}>
                                        <CombatLogIcon />
                                      </button>
                                    </div>
                                  </div>
                                ))
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Combat Log Modal */}
                {combatLogOpen && selectedKillForCombat && (
                  <div className="combatlog-modal-overlay" onClick={() => setCombatLogOpen(false)}>
                    <div className="combatlog-modal" onClick={e => e.stopPropagation()}>
                      <div className="combatlog-header">
                        <span className="combatlog-title">Комбатлог</span>
                        <button className="combatlog-close" onClick={() => setCombatLogOpen(false)}>
                          <CloseIcon />
                        </button>
                      </div>
                      <div className="combatlog-content">
                        {(selectedKillForCombat.hit_history || []).length === 0 ? (
                          <div className="combatlog-empty">
                            <div className="combatlog-empty-icon">
                              <CombatLogEmptyIcon />
                            </div>
                            <span className="combatlog-empty-title">Нет данных комбатлога</span>
                            <span className="combatlog-empty-desc">История урона для этого убийства недоступна</span>
                          </div>
                        ) : (
                          <>
                            <div className="combatlog-table-container">
                              <table className="combatlog-table">
                                <thead>
                                  <tr>
                                    <th>Time</th>
                                    <th>Attacker</th>
                                    <th>Target</th>
                                    <th>Weapon</th>
                                    <th>Ammo</th>
                                    <th>Bone</th>
                                    <th>Distance</th>
                                    <th>Old_hp</th>
                                    <th>New_hp</th>
                                    <th>Info</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {(selectedKillForCombat.hit_history || []).map((entry, idx) => (
                                    <tr key={idx}>
                                      <td>{typeof entry.time === 'number' ? entry.time.toFixed(2) : entry.time}</td>
                                      <td>{entry.attacker === 'player' ? (entry.attacker_steam_id === selectedKillForCombat.killer_steam_id ? selectedKillForCombat.killer_name : selectedKillForCombat.victim_name) : entry.attacker}</td>
                                      <td className="target-cell">{entry.target === 'player' ? (entry.target_steam_id === selectedKillForCombat.victim_steam_id ? selectedKillForCombat.victim_name : selectedKillForCombat.killer_name) : entry.target}</td>
                                      <td>{entry.weapon}</td>
                                      <td>{entry.ammo}</td>
                                      <td className={entry.bone === 'head' ? 'bone-head' : ''}>{entry.bone}</td>
                                      <td>{entry.distance.toFixed(2)}</td>
                                      <td>{entry.hp_old.toFixed(2)}</td>
                                      <td>{entry.hp_new.toFixed(2)}</td>
                                      <td>{entry.info}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div className="combatlog-divider">
                              <div className="divider-line"></div>
                              <span className="divider-text">Участники файта</span>
                              <div className="divider-line"></div>
                            </div>
                            <div className="combatlog-players">
                              <div className="combatlog-player">
                                <div className="combatlog-player-avatar">
                                  <img src={selectedKillForCombat.killer_avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                                </div>
                                <div className="combatlog-player-info">
                                  <span className="combatlog-player-name">{selectedKillForCombat.killer_name}</span>
                                  <span className="combatlog-player-id">{selectedKillForCombat.killer_steam_id}</span>
                                </div>
                              </div>
                              <div className="combatlog-player">
                                <div className="combatlog-player-avatar">
                                  <img src={selectedKillForCombat.victim_avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                                </div>
                                <div className="combatlog-player-info">
                                  <span className="combatlog-player-name">{selectedKillForCombat.victim_name}</span>
                                  <span className="combatlog-player-id">{selectedKillForCombat.victim_steam_id}</span>
                                </div>
                              </div>
                              <div className="combatlog-player-empty"></div>
                              <div className="combatlog-player-empty"></div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab !== 'overview' && activeTab !== 'activity' && activeTab !== 'stats' && (
                  <div className="tab-placeholder">
                    <div className="placeholder-icon-box">
                      <BoxIcon />
                    </div>
                    <span className="placeholder-title">Раздел в разработке</span>
                    <span className="placeholder-desc">Этот функционал скоро будет доступен</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mute Modal */}
      {showMuteModal && selectedPlayer && (
        <div className="action-modal-overlay" onClick={() => { setShowMuteModal(false); setDurationDropdownOpen(false) }}>
          <div className="mute-modal-new" onClick={e => e.stopPropagation()}>
            <div className="mute-modal-header">
              <span>Выдать мут</span>
              <button className="close-btn" onClick={() => { setShowMuteModal(false); setDurationDropdownOpen(false) }}>×</button>
            </div>
            <div className="mute-modal-player">
              <span>Игрок: <strong>{selectedPlayer.name}</strong></span>
            </div>
            <div className="mute-modal-body">
              <div className="mute-field">
                <label>Причина</label>
                <input 
                  type="text"
                  placeholder="Введите причину мута"
                  value={muteReason}
                  onChange={e => setMuteReason(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="mute-field">
                <label>Длительность</label>
                <div className="duration-select-wrapper">
                  <div 
                    className={`duration-select-trigger ${durationDropdownOpen ? 'open' : ''}`}
                    onClick={() => setDurationDropdownOpen(!durationDropdownOpen)}
                  >
                    <span>{durationOptions.find(o => o.value === muteDuration)?.label}</span>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                  {durationDropdownOpen && (
                    <div className="duration-select-dropdown">
                      {durationOptions.map(option => (
                        <div 
                          key={option.value}
                          className={`duration-option ${muteDuration === option.value ? 'selected' : ''}`}
                          onClick={() => {
                            setMuteDuration(option.value)
                            setDurationDropdownOpen(false)
                          }}
                        >
                          <div className="duration-option-icon"></div>
                          {option.label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <button className="mute-submit-btn" onClick={handleMute} disabled={!muteReason.trim()}>
                Выдать мут
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ban Modal */}
      {showBanModal && selectedPlayer && (
        <div className="action-modal-overlay" onClick={() => setShowBanModal(false)}>
          <div className="action-modal" onClick={e => e.stopPropagation()}>
            <div className="action-modal-header">
              <span>Заблокировать игрока</span>
              <button className="action-modal-close" onClick={() => setShowBanModal(false)}><CloseIcon /></button>
            </div>
            <div className="action-modal-content">
              <div className="action-modal-player">
                <img src={selectedPlayer.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                <span>{selectedPlayer.name}</span>
              </div>
              <div className="action-input-group">
                <label>Причина</label>
                <input type="text" placeholder="Читы / Макросы" value={banReason} onChange={e => setBanReason(e.target.value)} />
              </div>
              <div className="action-input-group">
                <label>Длительность (оставьте пустым для перманентного)</label>
                <input type="text" placeholder="7d, 30d, 1y или пусто" value={banDuration} onChange={e => setBanDuration(e.target.value)} />
              </div>
            </div>
            <div className="action-modal-footer">
              <button className="btn-cancel" onClick={() => setShowBanModal(false)}>Отмена</button>
              <button className="btn-action destructive" onClick={handleBan} disabled={!banReason}>Заблокировать</button>
            </div>
          </div>
        </div>
      )}

      {/* Kick Modal */}
      {showKickModal && selectedPlayer && (
        <div className="action-modal-overlay" onClick={() => setShowKickModal(false)}>
          <div className="action-modal" onClick={e => e.stopPropagation()}>
            <div className="action-modal-header">
              <span>Кикнуть игрока</span>
              <button className="action-modal-close" onClick={() => setShowKickModal(false)}><CloseIcon /></button>
            </div>
            <div className="action-modal-content">
              <div className="action-modal-player">
                <img src={selectedPlayer.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                <span>{selectedPlayer.name}</span>
              </div>
              <div className="action-input-group">
                <label>Причина (опционально)</label>
                <input type="text" placeholder="Kicked by admin" value={kickReason} onChange={e => setKickReason(e.target.value)} />
              </div>
            </div>
            <div className="action-modal-footer">
              <button className="btn-cancel" onClick={() => setShowKickModal(false)}>Отмена</button>
              <button className="btn-action destructive" onClick={handleKick}>Кикнуть</button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && selectedPlayer && typeof document !== 'undefined' && createPortal(
        <>
          <div
            ref={contextMenuRef}
            className="player-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button className="context-menu-item" onClick={() => { showToast('Функция в разработке'); setContextMenu(null) }}>
              <CheckIcon /> Начать проверку
            </button>
            <button className="context-menu-item" onClick={() => { copyToClipboard(selectedPlayer.steam_id); setContextMenu(null) }}>
              <CopySmallIcon /> Скопировать SteamID
            </button>
            <button className="context-menu-item" onClick={goToPlayerChat}>
              <ChatIcon /> Сообщения
            </button>
            <button className="context-menu-item has-submenu" onClick={() => { showToast('Функция в разработке'); setContextMenu(null) }}>
              <ReportsIcon /> Репорты
              <ArrowRightIcon />
            </button>

            <button
              ref={actionsMenuItemRef}
              className="context-menu-item has-submenu"
              onClick={(e) => {
                e.stopPropagation()
                if (customActions.filter(a => a.enabled).length === 0) {
                  showToast('Нет доступных действий', 'info')
                  return
                }
                setOpenSubmenu(prev => prev === 'actions' ? null : 'actions')
              }}
            >
              <ActionsIcon /> Действия
              <ArrowRightIcon />
            </button>

            <button className="context-menu-item" onClick={() => { showToast('Функция в разработке'); setContextMenu(null) }}>
              <NoteIcon /> Добавить заметку
            </button>
            <div className="context-menu-divider" />
            {mutedPlayers[selectedPlayer.steam_id] ? (
              <button className="context-menu-item success" onClick={handleUnmute}>
                <UnmuteIcon /> Снять мут
              </button>
            ) : (
              <button className="context-menu-item destructive" onClick={() => { setShowMuteModal(true); setContextMenu(null) }}>
                <MutesIcon /> Выдать мут
              </button>
            )}
            <button className="context-menu-item destructive" onClick={() => { setShowKickModal(true); setContextMenu(null) }}>
              <KickIcon /> Кикнуть
            </button>
            {bannedPlayers[selectedPlayer.steam_id] ? (
              <button className="context-menu-item success" onClick={handleUnban}>
                <UnbanIcon /> Снять бан
              </button>
            ) : (
              <button className="context-menu-item destructive" onClick={() => { setShowBanModal(true); setContextMenu(null) }}>
                <BansIcon /> Заблокировать
              </button>
            )}
          </div>

          {openSubmenu === 'actions' && (
            <div
              ref={submenuRef}
              className="player-context-submenu"
              style={{
                left: submenuPos?.x ?? 0,
                top: submenuPos?.y ?? 0,
                visibility: submenuPos ? 'visible' : 'hidden',
              }}
            >
              {Object.entries(
                customActions
                  .filter(a => a.enabled)
                  .reduce((acc, action) => {
                    const group = (action.group || 'Без группы').trim() || 'Без группы'
                    acc[group] ||= []
                    acc[group].push(action)
                    return acc
                  }, {} as Record<string, CustomAction[]>)
              )
                .sort(([a], [b]) => a.localeCompare(b, 'ru'))
                .map(([group, actions]) => (
                  <div key={group}>
                    <div className="context-submenu-group-title">{group}</div>
                    {actions
                      .slice()
                      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
                      .map(action => (
                        <button
                          key={action.id}
                          className="context-menu-item"
                          onClick={() => executeCustomAction(action)}
                        >
                          {action.name}
                        </button>
                      ))}
                  </div>
                ))}
            </div>
          )}
        </>,
        document.body
      )}
    </div>
  )
}

function FilterIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M5.95123 2.99707C6.50352 2.99707 6.95123 3.44479 6.95123 3.99707V9.99999C6.95123 10.5523 6.50352 11 5.95123 11C5.39895 11 4.95123 10.5523 4.95123 9.99999V3.99707C4.95123 3.44479 5.39895 2.99707 5.95123 2.99707ZM11.9998 2.99707C12.5521 2.99707 12.9998 3.44479 12.9998 3.99707V7.99902H13.955C14.5072 7.99902 14.955 8.44674 14.955 8.99902C14.955 9.55131 14.5072 9.99902 13.955 9.99902H10.0446C9.49233 9.99902 9.04462 9.55131 9.04462 8.99902C9.04462 8.44674 9.49233 7.99902 10.0446 7.99902H10.9998V3.99707C10.9998 3.44479 11.4476 2.99707 11.9998 2.99707ZM18.0484 2.99707C18.6007 2.99707 19.0484 3.44479 19.0484 3.99707V12.0008C19.0484 12.5531 18.6007 13.0008 18.0484 13.0008C17.4961 13.0008 17.0484 12.5531 17.0484 12.0008V3.99707C17.0484 3.44479 17.4961 2.99707 18.0484 2.99707ZM11.9998 12.0005C12.5521 12.0005 12.9998 12.4482 12.9998 13.0005V20.0038C12.9998 20.5561 12.5521 21.0038 11.9998 21.0038C11.4475 21.0038 10.9998 20.5561 10.9998 20.0038V13.0005C10.9998 12.4482 11.4475 12.0005 11.9998 12.0005ZM2.99609 14.0015C2.99609 13.4492 3.44381 13.0015 3.99609 13.0015H7.90643C8.45871 13.0015 8.90643 13.4492 8.90643 14.0015C8.90643 14.5538 8.45871 15.0015 7.90643 15.0015H6.95123V20.004C6.95123 20.5562 6.50352 21.004 5.95123 21.004C5.39895 21.004 4.95123 20.5562 4.95123 20.004V15.0015H3.99609C3.44381 15.0015 2.99609 14.5538 2.99609 14.0015ZM15.0932 16.002C15.0932 15.4497 15.5409 15.002 16.0932 15.002H20.0035C20.5558 15.002 21.0035 15.4497 21.0035 16.002C21.0035 16.5542 20.5558 17.002 20.0035 17.002H19.0484V20.0036C19.0484 20.5559 18.6007 21.0036 18.0484 21.0036C17.4961 21.0036 17.0484 20.5559 17.0484 20.0036V17.002H16.0932C15.5409 17.002 15.0932 16.5542 15.0932 16.002Z" /></svg>
}

function PlayerIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4ZM12 14C8.67 14 2 15.67 2 19V20C2 20.55 2.45 21 3 21H21C21.55 21 22 20.55 22 20V19C22 15.67 15.33 14 12 14Z" /></svg>
}

function TypeIcon() {
  return <svg viewBox="0 0 24 24"><path d="M4 6H2V20C2 21.1 2.9 22 4 22H18V20H4V6ZM20 2H8C6.9 2 6 2.9 6 4V16C6 17.1 6.9 18 8 18H20C21.1 18 22 17.1 22 16V4C22 2.9 21.1 2 20 2ZM20 16H8V4H20V16ZM13 14H15V11H18V9H15V6H13V9H10V11H13V14Z" /></svg>
}

function IpIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9C5 13.17 9.42 18.92 11.24 21.11C11.64 21.59 12.37 21.59 12.77 21.11C14.58 18.92 19 13.17 19 9C19 5.13 15.87 2 12 2ZM12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z" /></svg>
}

function CountryIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM11 19.93C7.05 19.44 4 16.08 4 12C4 11.38 4.08 10.79 4.21 10.21L9 15V16C9 17.1 9.9 18 11 18V19.93ZM17.9 17.39C17.64 16.58 16.9 16 16 16H15V13C15 12.45 14.55 12 14 12H8V10H10C10.55 10 11 9.55 11 9V7H13C14.1 7 15 6.1 15 5V4.59C17.93 5.78 20 8.65 20 12C20 14.08 19.2 15.97 17.9 17.39Z" /></svg>
}

function CityIcon() {
  return <svg viewBox="0 0 24 24"><path d="M15 11V5L12 2L9 5V7H3V21H21V11H15ZM7 19H5V17H7V19ZM7 15H5V13H7V15ZM7 11H5V9H7V11ZM13 19H11V17H13V19ZM13 15H11V13H13V15ZM13 11H11V9H13V11ZM13 7H11V5H13V7ZM19 19H17V17H19V19ZM19 15H17V13H19V15Z" /></svg>
}

function ProviderIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20ZM11 16H13V18H11V16ZM12 6C9.79 6 8 7.79 8 10H10C10 8.9 10.9 8 12 8C13.1 8 14 8.9 14 10C14 12 11 11.75 11 15H13C13 12.75 16 12.5 16 10C16 7.79 14.21 6 12 6Z" /></svg>
}

function ServerIcon() {
  return <svg viewBox="0 0 24 24"><path d="M2 6C2 4.9 2.9 4 4 4H20C21.1 4 22 4.9 22 6V10H2V6ZM6 7.5C6 8.05 5.55 8.5 5 8.5C4.45 8.5 4 8.05 4 7.5C4 6.95 4.45 6.5 5 6.5C5.55 6.5 6 6.95 6 7.5ZM2 12H22V16C22 17.1 21.1 18 20 18H4C2.9 18 2 17.1 2 16V12ZM6 14.5C6 15.05 5.55 15.5 5 15.5C4.45 15.5 4 15.05 4 14.5C4 13.95 4.45 13.5 5 13.5C5.55 13.5 6 13.95 6 14.5Z" /></svg>
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M8.7587 3L9 3C9.55229 3 10 3.44772 10 4C10 4.55229 9.55229 5 9 5H8.8C7.94342 5 7.36113 5.00078 6.91104 5.03755C6.47262 5.07337 6.24842 5.1383 6.09202 5.21799C5.7157 5.40973 5.40973 5.7157 5.21799 6.09202C5.1383 6.24842 5.07337 6.47262 5.03755 6.91104C5.00078 7.36113 5 7.94342 5 8.8V15.2C5 16.0566 5.00078 16.6389 5.03755 17.089C5.07337 17.5274 5.1383 17.7516 5.21799 17.908C5.40973 18.2843 5.7157 18.5903 6.09202 18.782C6.24842 18.8617 6.47262 18.9266 6.91104 18.9624C7.36113 18.9992 7.94342 19 8.8 19H15.2C16.0566 19 16.6389 18.9992 17.089 18.9624C17.5274 18.9266 17.7516 18.8617 17.908 18.782C18.2843 18.5903 18.5903 18.2843 18.782 17.908C18.8617 17.7516 18.9266 17.5274 18.9624 17.089C18.9992 16.6389 19 16.0566 19 15.2V15C19 14.4477 19.4477 14 20 14C20.5523 14 21 14.4477 21 15V15.2413C21 16.0463 21 16.7106 20.9558 17.2518C20.9099 17.8139 20.8113 18.3306 20.564 18.816C20.1805 19.5686 19.5686 20.1805 18.816 20.564C18.3306 20.8113 17.8139 20.9099 17.2518 20.9558C16.7106 21 16.0463 21 15.2413 21H8.75868C7.95372 21 7.28936 21 6.74817 20.9558C6.18608 20.9099 5.66937 20.8113 5.18404 20.564C4.43139 20.1805 3.81947 19.5686 3.43597 18.816C3.18868 18.3306 3.09012 17.8139 3.04419 17.2518C2.99998 16.7106 2.99999 16.0463 3 15.2413V8.7587C2.99999 7.95373 2.99998 7.28937 3.04419 6.74817C3.09012 6.18608 3.18868 5.66937 3.43597 5.18404C3.81947 4.43139 4.43139 3.81947 5.18404 3.43597C5.66937 3.18868 6.18608 3.09012 6.74817 3.04419C7.28937 2.99998 7.95373 2.99999 8.7587 3ZM14 5C13.4477 5 13 4.55229 13 4C13 3.44772 13.4477 3 14 3H20C20.5523 3 21 3.44772 21 4V10C21 10.5523 20.5523 11 20 11C19.4477 11 19 10.5523 19 10V6.41422L11.7071 13.7071C11.3166 14.0976 10.6834 14.0976 10.2929 13.7071C9.90237 13.3166 9.90237 12.6834 10.2929 12.2929L17.5858 5H14Z" /></svg>
}

function RccIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12.2666 2.01143C12.6444 2.0857 13.0275 2.14283 13.3999 2.23424C15.4668 2.75985 17.1181 4.88516 17.1829 7.09617C17.1883 7.18758 17.1829 7.2847 17.1829 7.39325C16.1791 7.39325 15.1915 7.39325 14.2093 7.39325C14.1554 7.13045 14.123 6.87335 14.042 6.6334C13.7021 5.64501 12.6659 5.01085 11.6945 5.16511C10.6584 5.3365 9.83278 6.25632 9.80583 7.33612C9.7788 8.49589 9.79499 9.66139 9.80044 10.8211C9.80044 10.9126 9.84895 11.0325 9.91913 11.084C10.8419 11.7581 11.5381 12.678 12.2342 13.5864C13.2866 14.9461 14.3011 16.3401 15.3264 17.7285C16.1576 18.8539 17.4419 19.1796 18.5913 18.5397C19.7139 17.917 20.2966 16.4315 19.9243 15.1517C19.5412 13.8434 18.3215 13.015 17.0425 13.1921C16.028 13.3349 15.1321 14.1748 14.8677 15.2318C14.8461 15.3117 14.83 15.3918 14.7922 15.5288C14.0745 14.5976 13.3837 13.7006 12.6821 12.7922C13.1031 12.0723 13.6373 11.4782 14.3065 11.0325C16.2222 9.75283 18.219 9.64425 20.1833 10.8326C22.207 12.0609 23.1352 14.0091 22.9842 16.4716C22.7845 19.7338 20.0646 22.2189 16.9886 21.9847C15.4506 21.8704 14.1662 21.1564 13.1948 19.8995C12.0885 18.4712 11.0631 16.9799 9.95686 15.5516C9.42262 14.8661 8.8452 14.1862 8.18143 13.6606C6.99419 12.7294 5.42379 13.0036 4.58733 14.1691C3.65373 15.4774 3.78324 17.2542 4.90033 18.2769C5.51553 18.8425 6.24406 18.9225 7.01038 18.7453C7.84144 18.5511 8.50521 18.0654 9.05026 17.3857C9.19597 17.2028 9.34168 17.0257 9.51437 16.8085C10.1457 17.6313 10.7663 18.4425 11.4356 19.3109C11.0362 19.7051 10.6692 20.1223 10.2537 20.4651C8.73727 21.722 7.01577 22.2818 5.12158 21.8019C2.88203 21.2306 1.60843 19.5966 1.12814 17.2656C0.480561 14.1176 2.35316 10.924 5.2619 10.1528C5.66124 10.0499 6.07678 10.0042 6.48691 9.99847C6.77292 9.99276 6.82689 9.89561 6.8215 9.6214C6.80531 8.83868 6.81071 8.06169 6.8161 7.27899C6.84848 4.58236 8.87757 2.28566 11.4193 2.06284C11.5057 2.05713 11.592 2.02285 11.6784 2C11.8726 2.01143 12.0669 2.01143 12.2666 2.01143Z"/></svg>
}

function SteamIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 2C13.3132 2 14.6136 2.25866 15.8268 2.7612C17.0401 3.26375 18.1425 4.00035 19.0711 4.92893C19.9997 5.85752 20.7362 6.95991 21.2388 8.17317C21.7413 9.38642 22 10.6868 22 12C22 14.6522 20.9464 17.1957 19.0711 19.0711C17.1957 20.9464 14.6522 22 12 22C7.4 22 3.55 18.92 2.36 14.73L6.19 16.31C6.32176 16.9503 6.67016 17.5257 7.17652 17.9391C7.68289 18.3526 8.31627 18.5789 8.97 18.58C10.53 18.58 11.8 17.31 11.8 15.75V15.62L15.2 13.19H15.28C17.36 13.19 19.05 11.5 19.05 9.42C19.05 7.34 17.36 5.65 15.28 5.65C13.2 5.65 11.5 7.34 11.5 9.42V9.47L9.13 12.93L8.97 12.92C8.38 12.92 7.83 13.1 7.38 13.41L2 11.2C2.43 6.05 6.73 2 12 2ZM8.28 17.17C9.08 17.5 10 17.13 10.33 16.33C10.66 15.53 10.28 14.62 9.5 14.29L8.22 13.76C8.71 13.58 9.26 13.57 9.78 13.79C10.31 14 10.72 14.41 10.93 14.94C11.15 15.46 11.15 16.04 10.93 16.56C10.5 17.64 9.23 18.16 8.15 17.71C7.65 17.5 7.27 17.12 7.06 16.67L8.28 17.17ZM17.8 9.42C17.8 10.81 16.67 11.94 15.28 11.94C14.6134 11.9374 13.975 11.6707 13.5046 11.1984C13.0341 10.7261 12.77 10.0866 12.77 9.42C12.7687 9.09001 12.8327 8.76303 12.9584 8.4579C13.084 8.15278 13.2689 7.87555 13.5022 7.64221C13.7356 7.40887 14.0128 7.22404 14.3179 7.09837C14.623 6.9727 14.95 6.90868 15.28 6.91C15.9466 6.90999 16.5861 7.17412 17.0584 7.64455C17.5307 8.11498 17.7974 8.75339 17.8 9.42ZM13.4 9.42C13.4 10.46 14.24 11.31 15.29 11.31C16.33 11.31 17.17 10.46 17.17 9.42C17.17 8.38 16.33 7.53 15.29 7.53C14.24 7.53 13.4 8.38 13.4 9.42Z"/></svg>
}

function MoreIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
}

function OverviewIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
}

function TeamIcon() {
  return <svg viewBox="0 0 24 24"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>
}

function ReportsIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M11.3498 2.16624C11.7712 2.02141 12.2288 2.02141 12.6502 2.16624L19.6502 4.57249C20.4578 4.85011 21 5.60988 21 6.46387V11.9125C21 14.7193 19.8511 16.742 18.1875 18.317C16.6151 19.8056 14.5552 20.9164 12.6319 21.9535L12.4748 22.0382C12.1785 22.1981 11.8215 22.1981 11.5252 22.0382L11.3681 21.9535C9.44484 20.9164 7.38493 19.8056 5.8125 18.317C4.14891 16.742 3 14.7193 3 11.9125V6.46387C3 5.60988 3.54224 4.85011 4.34984 4.57249L11.3498 2.16624ZM14.7071 14.2071C14.3166 14.5976 13.6834 14.5976 13.2929 14.2071L12 12.9142L10.7071 14.2071C10.3166 14.5976 9.68342 14.5976 9.29289 14.2071C8.90237 13.8166 8.90237 13.1834 9.29289 12.7929L10.5858 11.5L9.29289 10.2071C8.90237 9.81658 8.90237 9.18342 9.29289 8.79289C9.68342 8.40237 10.3166 8.40237 10.7071 8.79289L12 10.0858L13.2929 8.79289C13.6834 8.40237 14.3166 8.40237 14.7071 8.79289C15.0976 9.18342 15.0976 9.81658 14.7071 10.2071L13.4142 11.5L14.7071 12.7929C15.0976 13.1834 15.0976 13.8166 14.7071 14.2071Z" /></svg>
}

function ActionsIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.3 7.3 0 0 0-1.63-.94l-.36-2.54A.5.5 0 0 0 14.4 2h-3.8a.5.5 0 0 0-.49.42l-.36 2.54c-.58.23-1.12.53-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L3.21 8.84a.5.5 0 0 0 .12.64l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.41 1.05.71 1.63.94l.36 2.54c.05.24.25.42.49.42h3.8c.24 0 .45-.18.49-.42l.36-2.54c.58-.23 1.12-.53 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z" />
    </svg>
  )
}

function StatsIcon() {
  return <svg viewBox="0 0 24 24"><path d="M11.1699 3C10.3415 3 9.66992 3.67157 9.66992 4.5V19.501C9.66992 20.3294 10.3415 21.001 11.1699 21.001H12.8399C13.6683 21.001 14.3399 20.3294 14.3399 19.501V4.5C14.3399 3.67157 13.6683 3 12.8399 3H11.1699Z" /><path d="M4.5 13C3.67157 13 3 13.6716 3 14.5V19.501C3 20.3294 3.67157 21.001 4.5 21.001H6.17C6.99843 21.001 7.67 20.3294 7.67 19.501V14.5C7.67 13.6716 6.99843 13 6.17 13H4.5Z" /><path d="M16.3398 9.5C16.3398 8.67157 17.0114 8 17.8398 8H19.5098C20.3383 8 21.0098 8.67157 21.0098 9.5V19.501C21.0098 20.3294 20.3383 21.001 19.5098 21.001H17.8398C17.0114 21.001 16.3398 20.3294 16.3398 19.501V9.5Z" /></svg>
}

function ActivityIcon() {
  return <svg viewBox="0 0 24 24"><path d="M13.5 5.5c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.8 8.9L7 23h2.1l1.8-8 2.1 2v6h2v-7.5l-2.1-2 .6-3C14.8 12 16.8 13 19 13v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1L6 8.3V13h2V9.6l1.8-.7"/></svg>
}

function AlertsIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C8.10602 2 4.89608 5.05346 4.70162 8.94258L4.51173 12.7405L3.19098 15.382C3.06539 15.6332 3 15.9101 3 16.191C3 17.1901 3.80992 18 4.80902 18H7.10002C7.56329 20.2822 9.58104 22 12 22C14.419 22 16.4367 20.2822 16.9 18H19.191C20.1901 18 21 17.1901 21 16.191C21 15.9101 20.9346 15.6332 20.809 15.382L19.4883 12.7405L19.2984 8.94258C19.1039 5.05346 15.894 2 12 2ZM12 20C10.6938 20 9.58254 19.1652 9.17071 18H14.8293C14.4175 19.1652 13.3062 20 12 20Z" /></svg>
}

function DrawingsIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12ZM14 11.75C15.2426 11.75 16.25 10.7426 16.25 9.5C16.25 8.25736 15.2426 7.25 14 7.25C12.7574 7.25 11.75 8.25736 11.75 9.5C11.75 10.7426 12.7574 11.75 14 11.75ZM12 20C13.1739 20 14.2887 19.7472 15.293 19.293L9.41424 13.4142C8.63319 12.6332 7.36686 12.6332 6.58581 13.4142L4.70703 15.293C5.9623 18.0687 8.75562 20 12 20Z" /></svg>
}

function ChecksIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M11.3498 2.16624C11.7712 2.02141 12.2288 2.02141 12.6502 2.16624L19.6502 4.57249C20.4578 4.85011 21 5.60988 21 6.46387V11.9125C21 14.7193 19.8511 16.742 18.1875 18.317C16.6151 19.8056 14.5552 20.9164 12.6319 21.9535L12.4748 22.0382C12.1785 22.1981 11.8215 22.1981 11.5252 22.0382L11.3681 21.9535C9.44484 20.9164 7.38493 19.8056 5.8125 18.317C4.14891 16.742 3 14.7193 3 11.9125V6.46387C3 5.60988 3.54224 4.85011 4.34984 4.57249L11.3498 2.16624ZM15.2071 10.4571C15.5976 10.0666 15.5976 9.43342 15.2071 9.04289C14.8166 8.65237 14.1834 8.65237 13.7929 9.04289L11 11.8358L10.2071 11.0429C9.81658 10.6524 9.18342 10.6524 8.79289 11.0429C8.40237 11.4334 8.40237 12.0666 8.79289 12.4571L10.2929 13.9571C10.4804 14.1446 10.7348 14.25 11 14.25C11.2652 14.25 11.5196 14.1446 11.7071 13.9571L15.2071 10.4571Z" /></svg>
}

function MutesIcon() {
  return <svg viewBox="0 0 24 24"><path d="M17.0004 11C17.0004 11.5306 16.9178 12.0418 16.7647 12.5216L8.10645 3.86334C9.02299 2.72695 10.4268 2 12.0004 2C14.7619 2 17.0004 4.23858 17.0004 7V11Z" /><path d="M2.29289 2.29289C2.68342 1.90237 3.31658 1.90237 3.70711 2.29289L21.7071 20.2929C22.0976 20.6834 22.0976 21.3166 21.7071 21.7071C21.3166 22.0976 20.6834 22.0976 20.2929 21.7071L17.0438 18.458C15.9626 19.203 14.6237 19.7784 13 19.9485V21C13 21.5523 12.5523 22 12 22C11.4477 22 11 21.5523 11 21V19.9488C7.44647 19.5784 5.29912 17.2758 4.1755 15.5444C3.87485 15.0811 4.00669 14.4618 4.46998 14.1612C4.93326 13.8605 5.55255 13.9924 5.85319 14.4556C6.8928 16.0576 8.79991 18 12 18C13.4637 18 14.646 17.5974 15.5989 17.0131L14.1167 15.5309C13.4734 15.8318 12.7556 16 12 16C9.23859 16 7.00001 13.7614 7.00001 11V8.41423L2.29289 3.70711C1.90237 3.31658 1.90237 2.68342 2.29289 2.29289Z" /></svg>
}

function BansIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C9.23858 2 7 4.23858 7 7V9H6C4.89543 9 4 9.89543 4 11V20C4 21.1046 4.89543 22 6 22H18C19.1046 22 20 21.1046 20 20V11C20 9.89543 19.1046 9 18 9H17V7C17 4.23858 14.7614 2 12 2ZM15 9V7C15 5.34315 13.6569 4 12 4C10.3431 4 9 5.34315 9 7V9H15ZM12 13C12.5523 13 13 13.4477 13 14V17C13 17.5523 12.5523 18 12 18C11.4477 18 11 17.5523 11 17V14C11 13.4477 11.4477 13 12 13Z" /></svg>
}

function ChatIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 3C7.02944 3 3 7.02944 3 12C3 13.6362 3.44511 15.1701 4.22167 16.4876L3.0711 20.9289L7.51244 19.7783C8.82988 20.5549 10.3638 21 12 21C16.9706 21 21 16.9706 21 12C21 7.02944 16.9706 3 12 3ZM8 11C8 10.4477 8.44772 10 9 10H15C15.5523 10 16 10.4477 16 11C16 11.5523 15.5523 12 15 12H9C8.44772 12 8 11.5523 8 11ZM9 13C8.44772 13 8 13.4477 8 14C8 14.5523 8.44772 15 9 15H13C13.5523 15 14 14.5523 14 14C14 13.4477 13.5523 13 13 13H9Z" /></svg>
}

function KickIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM9.70711 8.29289C9.31658 7.90237 8.68342 7.90237 8.29289 8.29289C7.90237 8.68342 7.90237 9.31658 8.29289 9.70711L10.5858 12L8.29289 14.2929C7.90237 14.6834 7.90237 15.3166 8.29289 15.7071C8.68342 16.0976 9.31658 16.0976 9.70711 15.7071L12 13.4142L14.2929 15.7071C14.6834 16.0976 15.3166 16.0976 15.7071 15.7071C16.0976 15.3166 16.0976 14.6834 15.7071 14.2929L13.4142 12L15.7071 9.70711C16.0976 9.31658 16.0976 8.68342 15.7071 8.29289C15.3166 7.90237 14.6834 7.90237 14.2929 8.29289L12 10.5858L9.70711 8.29289Z" /></svg>
}

function UnmuteIcon() {
  return <svg viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5zm6 6c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
}

function UnbanIcon() {
  return <svg viewBox="0 0 24 24"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zM9 6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9V6zm9 14H6V10h12v10zm-6-3c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM16.7071 9.70711C17.0976 9.31658 17.0976 8.68342 16.7071 8.29289C16.3166 7.90237 15.6834 7.90237 15.2929 8.29289L10 13.5858L8.70711 12.2929C8.31658 11.9024 7.68342 11.9024 7.29289 12.2929C6.90237 12.6834 6.90237 13.3166 7.29289 13.7071L9.29289 15.7071C9.68342 16.0976 10.3166 16.0976 10.7071 15.7071L16.7071 9.70711Z" /></svg>
}

function NoteIcon() {
  return <svg viewBox="0 0 24 24"><path fillRule="evenodd" clipRule="evenodd" d="M4 4C4 2.89543 4.89543 2 6 2H14C14.2652 2 14.5196 2.10536 14.7071 2.29289L19.7071 7.29289C19.8946 7.48043 20 7.73478 20 8V20C20 21.1046 19.1046 22 18 22H6C4.89543 22 4 21.1046 4 20V4ZM6 4H13V8C13 8.55228 13.4477 9 14 9H18V20H6V4ZM15 4.41421L17.5858 7H15V4.41421ZM8 12C8 11.4477 8.44772 11 9 11H15C15.5523 11 16 11.4477 16 12C16 12.5523 15.5523 13 15 13H9C8.44772 13 8 12.5523 8 12ZM9 15C8.44772 15 8 15.4477 8 16C8 16.5523 8.44772 17 9 17H13C13.5523 17 14 16.5523 14 16C14 15.4477 13.5523 15 13 15H9Z" /></svg>
}

function ArrowRightIcon() {
  return <svg viewBox="0 0 24 24" className="arrow-right"><path fillRule="evenodd" clipRule="evenodd" d="M9.29289 7.29289C9.68342 6.90237 10.3166 6.90237 10.7071 7.29289L14.1768 10.7626C14.8602 11.446 14.8602 12.554 14.1768 13.2374L10.7071 16.7071C10.3166 17.0976 9.68342 17.0976 9.29289 16.7071C8.90237 16.3166 8.90237 15.6834 9.29289 15.2929L12.5858 12L9.29289 8.70711C8.90237 8.31658 8.90237 7.68342 9.29289 7.29289Z" /></svg>
}

function CopySmallIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16"><path fillRule="evenodd" clipRule="evenodd" d="M7 5C7 3.89543 7.89543 3 9 3H18C19.1046 3 20 3.89543 20 5V14C20 15.1046 19.1046 16 18 16H16V18C16 19.1046 15.1046 20 14 20H6C4.89543 20 4 19.1046 4 18V9C4 7.89543 4.89543 7 6 7H7V5ZM9 7H14C15.1046 7 16 7.89543 16 9V14H18V5H9V7ZM6 9H14V18H6V9Z" fill="currentColor"/></svg>
}

function OpenLinkIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16"><path fillRule="evenodd" clipRule="evenodd" d="M8.7587 3L9 3C9.55229 3 10 3.44772 10 4C10 4.55229 9.55229 5 9 5H8.8C7.94342 5 7.36113 5.00078 6.91104 5.03755C6.47262 5.07337 6.24842 5.1383 6.09202 5.21799C5.7157 5.40973 5.40973 5.7157 5.21799 6.09202C5.1383 6.24842 5.07337 6.47262 5.03755 6.91104C5.00078 7.36113 5 7.94342 5 8.8V15.2C5 16.0566 5.00078 16.6389 5.03755 17.089C5.07337 17.5274 5.1383 17.7516 5.21799 17.908C5.40973 18.2843 5.7157 18.5903 6.09202 18.782C6.24842 18.8617 6.47262 18.9266 6.91104 18.9624C7.36113 18.9992 7.94342 19 8.8 19H15.2C16.0566 19 16.6389 18.9992 17.089 18.9624C17.5274 18.9266 17.7516 18.8617 17.908 18.782C18.2843 18.5903 18.5903 18.2843 18.782 17.908C18.8617 17.7516 18.9266 17.5274 18.9624 17.089C18.9992 16.6389 19 16.0566 19 15.2V15C19 14.4477 19.4477 14 20 14C20.5523 14 21 14.4477 21 15V15.2413C21 16.0463 21 16.7106 20.9558 17.2518C20.9099 17.8139 20.8113 18.3306 20.564 18.816C20.1805 19.5686 19.5686 20.1805 18.816 20.564C18.3306 20.8113 17.8139 20.9099 17.2518 20.9558C16.7106 21 16.0463 21 15.2413 21H8.75868C7.95372 21 7.28936 21 6.74817 20.9558C6.18608 20.9099 5.66937 20.8113 5.18404 20.564C4.43139 20.1805 3.81947 19.5686 3.43597 18.816C3.18868 18.3306 3.09012 17.8139 3.04419 17.2518C2.99998 16.7106 2.99999 16.0463 3 15.2413V8.7587C2.99999 7.95373 2.99998 7.28937 3.04419 6.74817C3.09012 6.18608 3.18868 5.66937 3.43597 5.18404C3.81947 4.43139 4.43139 3.81947 5.18404 3.43597C5.66937 3.18868 6.18608 3.09012 6.74817 3.04419C7.28937 2.99998 7.95373 2.99999 8.7587 3ZM14 5C13.4477 5 13 4.55229 13 4C13 3.44772 13.4477 3 14 3H20C20.5523 3 21 3.44772 21 4V10C21 10.5523 20.5523 11 20 11C19.4477 11 19 10.5523 19 10V6.41422L11.7071 13.7071C11.3166 14.0976 10.6834 14.0976 10.2929 13.7071C9.90237 13.3166 9.90237 12.6834 10.2929 12.2929L17.5858 5H14Z" fill="currentColor"/></svg>
}


function CalendarIcon() {
  return <svg viewBox="0 0 24 24" width="14" height="14"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z" fill="currentColor"/></svg>
}

function ShareIcon() {
  return <svg viewBox="0 0 24 24" width="16" height="16"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92s2.92-1.31 2.92-2.92-1.31-2.92-2.92-2.92z" fill="currentColor"/></svg>
}

function InfoIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/></svg>
}

function BoxIcon() {
  return (
    <svg viewBox="0 0 130 107" width="100" height="82" stroke="#666" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" fill="none">
      <path d="M101.3 80.5195V100.519C101.3 101.519 100.64 102.409 99.3 103.179C97.97 103.949 96.43 104.329 94.7 104.329C92.97 104.329 91.43 103.939 90.08 103.159C88.74 102.379 88.07 101.499 88.06 100.489L87.97 83.2995V75.4495C87.97 75.4495 88.01 75.4595 88.03 75.4595L88.06 80.4895C88.07 81.4995 88.74 82.3795 90.08 83.1595C91.43 83.9395 92.97 84.3295 94.7 84.3295C96.43 84.3295 97.97 83.9495 99.3 83.1795C100.64 82.4095 101.3 81.5195 101.3 80.5195Z"/>
      <path d="M127.94 44.5996V64.5296C127.97 69.8496 124.72 74.3996 118.2 78.1596C115.92 79.4796 113.33 80.5896 110.42 81.4896C107.54 82.3896 104.5 82.9996 101.3 83.3096V80.5196L101.27 75.4396L101.21 63.3196C104.44 63.0096 107.51 62.3996 110.42 61.4896C111.44 61.1796 112.41 60.8396 113.35 60.4696C115.1 59.7896 116.72 59.0196 118.2 58.1596C120.15 57.0396 121.81 55.8396 123.17 54.5696C126.35 51.6296 127.94 48.2996 127.94 44.5996Z"/>
      <path d="M77.4199 14.4096C77.4199 15.4596 76.7599 16.3696 75.4199 17.1396C74.0899 17.9096 72.51 18.2896 70.7 18.2896C68.89 18.2896 67.3099 17.8996 65.9699 17.1196L51.7399 8.89955C50.3899 8.12955 49.72 7.21955 49.71 6.16955C49.71 5.11955 50.37 4.21955 51.71 3.43955C53.04 2.66955 54.6199 2.28955 56.4299 2.28955C58.2399 2.28955 59.8199 2.68955 61.1599 3.45955L75.39 11.6796C76.74 12.4496 77.4099 13.3596 77.4199 14.4096Z"/>
      <path d="M54.0001 55.3195C54.0001 56.3595 53.3401 57.2695 52.0001 58.0395C50.6701 58.8195 49.0901 59.1995 47.2801 59.1995C45.4701 59.1895 43.89 58.7995 42.54 58.0295L4.60004 36.1195C3.25004 35.3395 2.58007 34.4295 2.57007 33.3795C2.57007 32.3395 3.23007 31.4295 4.57007 30.6595C5.90007 29.8895 7.48004 29.4995 9.29004 29.5095C11.1 29.5095 12.6801 29.8995 14.0301 30.6795L26.1401 37.6695L26.8401 38.0695L50.0901 51.4895L51.97 52.5795C53.32 53.3595 53.9901 54.2695 54.0001 55.3195Z"/>
      <path d="M53.8501 28.0197C53.8501 28.6297 53.6201 29.1997 53.1501 29.7197C52.8401 30.0797 52.4001 30.4197 51.8501 30.7397C50.5201 31.5197 48.9401 31.8997 47.1301 31.8997C45.3201 31.8897 43.7401 31.4997 42.4001 30.7297L28.1701 22.5097C26.8201 21.7397 26.1501 20.8197 26.1401 19.7797C26.1401 18.7297 26.8001 17.8197 28.1401 17.0497C29.4701 16.2797 31.0501 15.8997 32.8601 15.8997C34.6701 15.8997 36.2501 16.2897 37.5901 17.0697L49.7101 24.0597L50.4101 24.4697L51.8201 25.2797C53.1701 26.0597 53.8401 26.9697 53.8501 28.0197Z"/>
      <path d="M118.05 30.8595C111.49 27.0795 103.6 25.1695 94.38 25.1595C88.1 25.1495 82.45 26.0095 77.42 27.7495C75.65 28.3695 73.96 29.0895 72.35 29.9195C71.81 30.1895 71.2901 30.4795 70.7701 30.7795C67.9601 32.3995 65.76 34.1695 64.17 36.0795C62.06 38.5995 61.0101 41.3795 61.0301 44.4095C61.0501 48.0995 62.64 51.4195 65.8 54.3695C67.2 55.6795 68.91 56.9095 70.92 58.0795C72.36 58.9095 73.93 59.6595 75.62 60.3295C76.61 60.7295 77.66 61.0995 78.74 61.4395C81.66 62.3495 84.73 62.9695 87.97 63.2995L88.0301 75.4595L88.06 80.4895C88.07 81.4995 88.7401 82.3795 90.0801 83.1595C91.4301 83.9395 92.9701 84.3295 94.7001 84.3295C96.4301 84.3295 97.97 83.9495 99.3 83.1795C100.64 82.4095 101.3 81.5195 101.3 80.5195L101.27 75.4395L101.21 63.3195C104.44 63.0095 107.51 62.3995 110.42 61.4895C111.44 61.1795 112.41 60.8395 113.35 60.4695C115.1 59.7895 116.72 59.0195 118.2 58.1595C120.15 57.0395 121.81 55.8395 123.17 54.5695C126.35 51.6295 127.94 48.2995 127.94 44.5995V44.5295C127.91 39.2095 124.61 34.6495 118.05 30.8595ZM113.37 48.5795C112.4 50.0895 110.85 51.4495 108.71 52.6895C107.46 53.4095 106.13 54.0195 104.71 54.5095C101.69 55.5595 98.3 56.0795 94.55 56.0695C90.74 56.0595 87.31 55.5195 84.25 54.4395C82.87 53.9495 81.5701 53.3495 80.3401 52.6395C78.1601 51.3795 76.58 49.9795 75.6 48.4395C74.8 47.1895 74.4001 45.8595 74.3901 44.4295C74.3701 41.2495 76.33 38.5195 80.25 36.2595C84.18 33.9895 88.9 32.8595 94.42 32.8695C99.94 32.8795 104.67 34.0195 108.63 36.3095C112.58 38.5895 114.56 41.3195 114.58 44.5095C114.58 45.9595 114.19 47.3195 113.37 48.5795Z"/>
      <path d="M114.58 44.5094C114.58 45.9595 114.19 47.3194 113.37 48.5794C112.4 50.0894 110.85 51.4494 108.71 52.6894C107.46 53.4094 106.13 54.0194 104.71 54.5094C101.65 53.4194 98.22 52.8794 94.42 52.8694C90.66 52.8594 87.27 53.3894 84.25 54.4394C82.87 53.9494 81.5701 53.3494 80.3401 52.6394C78.1601 51.3794 76.58 49.9795 75.6 48.4395C74.8 47.1895 74.4 45.8594 74.39 44.4294C74.37 41.2494 76.33 38.5194 80.25 36.2594C84.18 33.9894 88.9 32.8595 94.42 32.8695C99.94 32.8795 104.67 34.0194 108.63 36.3094C112.58 38.5894 114.56 41.3194 114.58 44.5094Z"/>
      <path d="M77.4199 14.4094V27.7494C75.6499 28.3694 73.9599 29.0894 72.3499 29.9194C71.8099 30.1894 71.29 30.4794 70.77 30.7794C67.96 32.3994 65.7599 34.1694 64.1699 36.0794L53.8499 30.1194V28.0194C53.8399 26.9694 53.1699 26.0594 51.8199 25.2794L50.4099 24.4694L49.71 24.0594V6.16943C49.72 7.21943 50.3899 8.12944 51.7399 8.89944L65.9699 17.1194C67.3099 17.8994 68.89 18.2894 70.7 18.2894C72.51 18.2894 74.0899 17.9094 75.4199 17.1394C76.7599 16.3694 77.4199 15.4594 77.4199 14.4094Z"/>
      <path d="M53.8501 28.0195V48.0195C53.8501 49.0595 53.1901 49.9695 51.8501 50.7395C51.3101 51.0595 50.7201 51.3095 50.0901 51.4895L26.8401 38.0695L26.1401 37.6695V19.7795C26.1401 20.8195 26.8201 21.7395 28.1701 22.5095L42.4001 30.7295C43.7401 31.4995 45.3201 31.8895 47.1301 31.8995C48.9401 31.8995 50.5201 31.5195 51.8501 30.7395C52.4001 30.4195 52.8401 30.0795 53.1501 29.7195C53.6201 29.1995 53.8501 28.6295 53.8501 28.0195Z"/>
      <path d="M54.0001 55.3196V75.3196C54.0001 76.3596 53.3401 77.2696 52.0001 78.0396C50.6701 78.8196 49.0901 79.1996 47.2801 79.1996C45.4701 79.1896 43.89 78.7996 42.54 78.0296L4.60004 56.1196C3.25004 55.3396 2.58007 54.4296 2.57007 53.3796V33.3796C2.58007 34.4296 3.25004 35.3396 4.60004 36.1196L42.54 58.0296C43.89 58.7996 45.4701 59.1896 47.2801 59.1996C49.0901 59.1996 50.6701 58.8196 52.0001 58.0396C53.3401 57.2696 54.0001 56.3596 54.0001 55.3196Z"/>
      <path d="M87.97 63.2997V83.2997C84.73 82.9697 81.66 82.3497 78.74 81.4397C75.82 80.5197 73.21 79.3997 70.92 78.0797C64.35 74.2897 61.06 69.7297 61.03 64.4097V44.4097C61.05 48.0997 62.64 51.4197 65.8 54.3697C67.2 55.6797 68.91 56.9097 70.92 58.0797C72.36 58.9097 73.93 59.6597 75.62 60.3297C76.61 60.7297 77.66 61.0997 78.74 61.4397C81.66 62.3497 84.73 62.9697 87.97 63.2997Z"/>
    </svg>
  )
}

function CombatLogIcon() {
  return <svg viewBox="0 0 24 24" width="17" height="17"><path fillRule="evenodd" clipRule="evenodd" d="M7 2C5.34315 2 4 3.34315 4 5V19C4 20.6569 5.34315 22 7 22H17C18.6569 22 20 20.6569 20 19V5C20 3.34315 18.6569 2 17 2H7ZM6 19C6 19.5523 6.44772 20 7 20H17C17.5523 20 18 19.5523 18 19V17.8293C17.6872 17.9398 17.3506 18 17 18H7C6.44772 18 6 18.4477 6 19ZM9 6C8.44772 6 8 6.44772 8 7C8 7.55228 8.44772 8 9 8H15C15.5523 8 16 7.55228 16 7C16 6.44772 15.5523 6 15 6H9ZM8 11C8 10.4477 8.44772 10 9 10H12C12.5523 10 13 10.4477 13 11C13 11.5523 12.5523 12 12 12H9C8.44772 12 8 11.5523 8 11Z" fill="currentColor"/></svg>
}

function CombatLogEmptyIcon() {
  return <svg viewBox="0 0 24 24" width="48" height="48"><path fillRule="evenodd" clipRule="evenodd" d="M7 2C5.34315 2 4 3.34315 4 5V19C4 20.6569 5.34315 22 7 22H17C18.6569 22 20 20.6569 20 19V5C20 3.34315 18.6569 2 17 2H7ZM9 7C9 6.44772 9.44772 6 10 6H14C14.5523 6 15 6.44772 15 7C15 7.55228 14.5523 8 14 8H10C9.44772 8 9 7.55228 9 7ZM9 11C9 10.4477 9.44772 10 10 10H14C14.5523 10 15 10.4477 15 11C15 11.5523 14.5523 12 14 12H10C9.44772 12 9 11.5523 9 11ZM10 14C9.44772 14 9 14.4477 9 15C9 15.5523 9.44772 16 10 16H12C12.5523 16 13 15.5523 13 15C13 14.4477 12.5523 14 12 14H10Z" fill="#444"/></svg>
}

function CloseIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18"><path fillRule="evenodd" clipRule="evenodd" d="M4.29289 4.29289C4.68342 3.90237 5.31658 3.90237 5.70711 4.29289L12 10.5858L18.2929 4.29289C18.6834 3.90237 19.3166 3.90237 19.7071 4.29289C20.0976 4.68342 20.0976 5.31658 19.7071 5.70711L13.4142 12L19.7071 18.2929C20.0976 18.6834 20.0976 19.3166 19.7071 19.7071C19.3166 20.0976 18.6834 20.0976 18.2929 19.7071L12 13.4142L5.70711 19.7071C5.31658 20.0976 4.68342 20.0976 4.29289 19.7071C3.90237 19.3166 3.90237 18.6834 4.29289 18.2929L10.5858 12L4.29289 5.70711C3.90237 5.31658 3.90237 4.68342 4.29289 4.29289Z" fill="currentColor"/></svg>
}

// Компонент для круговой диаграммы убийств/смертей с анимацией
function DonutChart({ kills, deaths }: { kills: number, deaths: number }) {
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const total = kills + deaths || 1
  
  useEffect(() => {
    setAnimatedProgress(0)
    const timer = setTimeout(() => {
      setAnimatedProgress(1)
    }, 50)
    return () => clearTimeout(timer)
  }, [kills, deaths])
  
  const radius = 50
  const cx = 60
  const cy = 60
  const innerRadius = 32
  const circumference = 2 * Math.PI * radius
  
  const killsPercent = (kills / total) * animatedProgress
  const deathsPercent = (deaths / total) * animatedProgress
  
  const deathsOffset = circumference * (1 - deathsPercent)
  
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
      {/* Background circle */}
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#333"
        strokeWidth={radius - innerRadius}
      />
      {/* Deaths arc */}
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#6F6F6F"
        strokeWidth={radius - innerRadius}
        strokeDasharray={circumference}
        strokeDashoffset={deathsOffset}
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
      {/* Kills arc */}
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#BBC94E"
        strokeWidth={radius - innerRadius}
        strokeDasharray={`${circumference * killsPercent} ${circumference}`}
        strokeDashoffset={-circumference * deathsPercent}
        style={{ transition: 'stroke-dasharray 0.8s ease-out, stroke-dashoffset 0.8s ease-out' }}
      />
    </svg>
  )
}

// Компонент для круговой диаграммы частей тела с анимацией
function BodyPartsChart({ headshots, bodyshots, limbshots }: { headshots: number, bodyshots: number, limbshots: number }) {
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const total = headshots + bodyshots + limbshots || 1
  
  useEffect(() => {
    setAnimatedProgress(0)
    const timer = setTimeout(() => {
      setAnimatedProgress(1)
    }, 50)
    return () => clearTimeout(timer)
  }, [headshots, bodyshots, limbshots])
  
  const radius = 50
  const cx = 60
  const cy = 60
  const innerRadius = 32
  const circumference = 2 * Math.PI * radius
  
  const headshotsPercent = (headshots / total) * animatedProgress
  const bodyshotsPercent = (bodyshots / total) * animatedProgress
  const limbshotsPercent = (limbshots / total) * animatedProgress
  
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
      {/* Background circle */}
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#333"
        strokeWidth={radius - innerRadius}
      />
      {/* Limbshots arc */}
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#6F6F6F"
        strokeWidth={radius - innerRadius}
        strokeDasharray={`${circumference * limbshotsPercent} ${circumference}`}
        strokeDashoffset={0}
        style={{ transition: 'stroke-dasharray 0.8s ease-out' }}
      />
      {/* Bodyshots arc */}
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#fdba74"
        strokeWidth={radius - innerRadius}
        strokeDasharray={`${circumference * bodyshotsPercent} ${circumference}`}
        strokeDashoffset={-circumference * limbshotsPercent}
        style={{ transition: 'stroke-dasharray 0.8s ease-out, stroke-dashoffset 0.8s ease-out' }}
      />
      {/* Headshots arc */}
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#f97316"
        strokeWidth={radius - innerRadius}
        strokeDasharray={`${circumference * headshotsPercent} ${circumference}`}
        strokeDashoffset={-circumference * (limbshotsPercent + bodyshotsPercent)}
        style={{ transition: 'stroke-dasharray 0.8s ease-out, stroke-dashoffset 0.8s ease-out' }}
      />
    </svg>
  )
}
