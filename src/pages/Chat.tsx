import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'

interface ChatMessage {
  id: string
  steam_id: string
  name: string
  avatar: string
  message: string
  is_team: boolean
  is_admin?: boolean
  server: string
  timestamp: number
  date: string
}

interface Player {
  id: string
  steam_id: string
  name: string
  avatar: string
  role?: string
}

interface MuteInfo {
  steam_id: string
  reason: string
  duration: string
  expired_at: number
  created_at: number
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{id: string, x: number, y: number} | null>(null)
  const [mutedPlayers, setMutedPlayers] = useState<Record<string, MuteInfo>>({})
  const [muteModal, setMuteModal] = useState<{steamId: string, name: string} | null>(null)
  const [muteReason, setMuteReason] = useState('')
  const [muteDuration, setMuteDuration] = useState('1h')
  const [durationDropdownOpen, setDurationDropdownOpen] = useState(false)

  const durationOptions = [
    { value: '5m', label: '5 минут' },
    { value: '15m', label: '15 минут' },
    { value: '30m', label: '30 минут' },
    { value: '1h', label: '1 час' },
    { value: '3h', label: '3 часа' },
    { value: '6h', label: '6 часов' },
    { value: '12h', label: '12 часов' },
    { value: '1d', label: '1 день' },
    { value: '3d', label: '3 дня' },
    { value: '7d', label: '7 дней' },
    { value: '30d', label: '30 дней' },
    { value: '0', label: 'Навсегда' }
  ]

  const { showToast } = useToast()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const playerSteamId = searchParams.get('player')
  const navigate = useNavigate()

  // Фильтры
  const [textFilter, setTextFilter] = useState('')
  const [showTextFilterModal, setShowTextFilterModal] = useState(false)
  const [tempTextFilter, setTempTextFilter] = useState('')
  const [showCalendar, setShowCalendar] = useState(false)
  const [dateFrom, setDateFrom] = useState<Date | null>(null)
  const [dateTo, setDateTo] = useState<Date | null>(null)
  const [showPlayerSearch, setShowPlayerSearch] = useState(false)
  const [playerSearchQuery, setPlayerSearchQuery] = useState('')
  const [selectedPlayerIndex, setSelectedPlayerIndex] = useState(0)
  const [dbPlayers, setDbPlayers] = useState<Player[]>([])
  const [loadingPlayers, setLoadingPlayers] = useState(false)
  const calendarRef = useRef<HTMLDivElement>(null)
  const playerSearchRef = useRef<HTMLDivElement>(null)

  // Календарь
  const [calendarMonth, setCalendarMonth] = useState(new Date())
  const [selectingDate, setSelectingDate] = useState<'from' | 'to'>('from')

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const days: (Date | null)[] = []
    
    // Добавляем пустые дни в начале (понедельник = 0)
    let startDay = firstDay.getDay() - 1
    if (startDay < 0) startDay = 6
    for (let i = 0; i < startDay; i++) days.push(null)
    
    // Добавляем дни месяца
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i))
    }
    return days
  }

  const isDateInRange = (date: Date) => {
    if (!dateFrom || !dateTo) return false
    return date >= dateFrom && date <= dateTo
  }

  const isDateSelected = (date: Date) => {
    if (dateFrom && date.toDateString() === dateFrom.toDateString()) return true
    if (dateTo && date.toDateString() === dateTo.toDateString()) return true
    return false
  }

  const handleDateClick = (date: Date) => {
    if (selectingDate === 'from') {
      setDateFrom(date)
      setDateTo(null)
      setSelectingDate('to')
    } else {
      if (dateFrom && date < dateFrom) {
        setDateFrom(date)
        setDateTo(dateFrom)
      } else {
        setDateTo(date)
      }
      setSelectingDate('from')
    }
  }

  const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 
                      'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь']
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const fetchMessages = async () => {
    try {
      const url = playerSteamId 
        ? `/api/chat/player/${playerSteamId}?limit=200`
        : '/api/chat?limit=200'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const newMessages = playerSteamId ? data : data.messages
        if (JSON.stringify(newMessages) !== JSON.stringify(messagesRef.current)) {
          messagesRef.current = newMessages
          setMessages(newMessages)
        }
      }
    } catch {}
  }

  useEffect(() => {
    fetchMessages()
    const interval = setInterval(fetchMessages, 1000)
    return () => clearInterval(interval)
  }, [playerSteamId])

  // Загружаем список замьюченных игроков
  useEffect(() => {
    const fetchMutes = async () => {
      try {
        const res = await fetch('/api/mutes')
        if (res.ok) {
          const data = await res.json()
          const mutesMap: Record<string, MuteInfo> = {}
          data.forEach((m: MuteInfo) => { mutesMap[m.steam_id] = m })
          setMutedPlayers(mutesMap)
        }
      } catch {}
    }
    fetchMutes()
    const interval = setInterval(fetchMutes, 10000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handlePlayerClick = (steamId: string) => {
    navigate(`/players?player=${steamId}`)
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim()) return
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target_steam_id: playerSteamId || null,
          message: inputMessage,
          is_global: !playerSteamId
        })
      })
      if (res.ok) {
        setInputMessage('')
        showToast('Сообщение отправлено')
        fetchMessages()
      }
    } catch {
      showToast('Ошибка отправки', 'error')
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    showToast('Скопировано')
  }

  const handleMute = async (steamId: string, name: string) => {
    setMuteModal({ steamId, name })
    setMuteReason('')
    setMuteDuration('1h')
    setContextMenu(null)
  }

  const submitMute = async () => {
    if (!muteModal || !muteReason.trim()) return
    try {
      const res = await fetch('/api/mutes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          steam_id: muteModal.steamId,
          reason: muteReason,
          duration: muteDuration,
          broadcast: true
        })
      })
      if (res.ok) {
        showToast('Мут выдан')
        setMuteModal(null)
        // Обновляем список мутов
        const mutesRes = await fetch('/api/mutes')
        if (mutesRes.ok) {
          const data = await mutesRes.json()
          const mutesMap: Record<string, MuteInfo> = {}
          data.forEach((m: MuteInfo) => { mutesMap[m.steam_id] = m })
          setMutedPlayers(mutesMap)
        }
      }
    } catch {
      showToast('Ошибка', 'error')
    }
  }

  const handleUnmute = async (steamId: string) => {
    try {
      const res = await fetch(`/api/mutes/${steamId}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Мут снят')
        setMutedPlayers(prev => {
          const copy = { ...prev }
          delete copy[steamId]
          return copy
        })
      }
    } catch {
      showToast('Ошибка', 'error')
    }
  }

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  const formatFullDate = (ts: number) => `${new Date(ts).toLocaleDateString('ru')} в ${new Date(ts).toLocaleTimeString('ru')}`

  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault()
    setContextMenu({ id: msgId, x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  // Закрытие календаря и поиска игроков при клике вне
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (calendarRef.current && !calendarRef.current.contains(e.target as Node)) {
        setShowCalendar(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Поиск игроков из БД при вводе
  useEffect(() => {
    if (!playerSearchQuery.trim()) {
      setDbPlayers([])
      return
    }
    
    const searchPlayers = async () => {
      setLoadingPlayers(true)
      try {
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(playerSearchQuery)}`)
        if (res.ok) {
          const data = await res.json()
          setDbPlayers(data.slice(0, 20).map((p: any) => ({
            id: p.steam_id,
            steam_id: p.steam_id,
            name: p.steam_name || p.name,
            avatar: p.avatar,
            role: 'офлайн'
          })))
        }
      } catch {}
      setLoadingPlayers(false)
    }
    
    const debounce = setTimeout(searchPlayers, 300)
    return () => clearTimeout(debounce)
  }, [playerSearchQuery])

  // Фильтрация сообщений
  const filteredMessages = messages.filter(msg => {
    // Фильтр по тексту
    if (textFilter && !msg.message.toLowerCase().includes(textFilter.toLowerCase()) && 
        !msg.name.toLowerCase().includes(textFilter.toLowerCase())) {
      return false
    }
    // Фильтр по дате
    if (dateFrom && msg.timestamp < dateFrom.getTime()) return false
    if (dateTo && msg.timestamp > dateTo.getTime() + 86400000) return false
    return true
  })

  // Подсветка текста
  const highlightText = (text: string, search: string) => {
    if (!search) return text
    const parts = text.split(new RegExp(`(${search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, i) => 
      part.toLowerCase() === search.toLowerCase() 
        ? <span key={i} className="highlight">{part}</span> 
        : part
    )
  }

  // Получаем уникальных игроков из сообщений чата
  const chatPlayers = React.useMemo(() => {
    const uniquePlayers = new Map<string, Player>()
    messages.forEach(msg => {
      if (!uniquePlayers.has(msg.steam_id)) {
        uniquePlayers.set(msg.steam_id, {
          id: msg.steam_id,
          steam_id: msg.steam_id,
          name: msg.name,
          avatar: msg.avatar,
          role: msg.is_admin ? 'сотрудник проекта' : 'игрок'
        })
      }
    })
    return Array.from(uniquePlayers.values())
  }, [messages])

  // Объединяем игроков из чата и из БД (без дубликатов)
  const allPlayers = React.useMemo(() => {
    const combined = new Map<string, Player>()
    
    // Сначала добавляем игроков из чата (они приоритетнее)
    chatPlayers.forEach(p => combined.set(p.steam_id, p))
    
    // Добавляем игроков из БД (если их нет в чате)
    dbPlayers.forEach(p => {
      if (!combined.has(p.steam_id)) {
        combined.set(p.steam_id, p)
      }
    })
    
    return Array.from(combined.values())
  }, [chatPlayers, dbPlayers])

  // Фильтрация игроков по поиску
  const filteredPlayers = playerSearchQuery.trim() 
    ? allPlayers 
    : chatPlayers.filter(p => 
        p.name.toLowerCase().includes(playerSearchQuery.toLowerCase()) ||
        p.steam_id.includes(playerSearchQuery)
      )

  // Навигация по списку игроков
  const handlePlayerSearchKeyDown = (e: React.KeyboardEvent) => {
    const maxIndex = filteredPlayers.length - 1
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedPlayerIndex(i => Math.min(i + 1, maxIndex))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedPlayerIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter' && filteredPlayers[selectedPlayerIndex]) {
      e.preventDefault()
      selectPlayer(filteredPlayers[selectedPlayerIndex])
    } else if (e.key === 'Escape') {
      setShowPlayerSearch(false)
    }
  }

  const selectPlayer = (player: Player) => {
    setSearchParams({ player: player.steam_id })
    setShowPlayerSearch(false)
    setPlayerSearchQuery('')
  }

  const applyTextFilter = () => {
    setTextFilter(tempTextFilter)
    setShowTextFilterModal(false)
  }

  const clearTextFilter = () => {
    setTextFilter('')
    setTempTextFilter('')
  }

  const clearDateFilter = () => {
    setDateFrom(null)
    setDateTo(null)
  }

  return (
    <div className="chat-page">
      {/* Панель фильтров */}
      <div className="chat-header-controls">
        <div className="chat-filter-buttons">
          {/* Кнопка фильтра по тексту */}
          <button 
            className={`filter-btn ${textFilter ? 'active' : ''}`}
            onClick={() => { 
              console.log('Text filter clicked')
              setTempTextFilter(textFilter)
              setShowTextFilterModal(true) 
            }}
            title="Фильтр по тексту"
          >
            <TextSearchIcon />
          </button>

          {/* Кнопка календаря */}
          <div className="calendar-wrapper" ref={calendarRef}>
            <button 
              className={`filter-btn ${dateFrom || dateTo ? 'active' : ''}`}
              onClick={() => {
                console.log('Calendar clicked')
                setShowCalendar(!showCalendar)
              }}
              title="Фильтр по дате"
            >
              <CalendarIcon />
            </button>
            {showCalendar && (
              <div className="calendar-dropdown">
                <div className="calendar-nav">
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}>
                    <ChevronLeftIcon />
                  </button>
                  <span>{monthNames[calendarMonth.getMonth()]} {calendarMonth.getFullYear()}</span>
                  <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}>
                    <ChevronRightIcon />
                  </button>
                </div>
                <div className="calendar-weekdays">
                  {dayNames.map(d => <span key={d}>{d}</span>)}
                </div>
                <div className="calendar-days">
                  {getDaysInMonth(calendarMonth).map((date, i) => (
                    <button
                      key={i}
                      className={`calendar-day ${!date ? 'empty' : ''} ${date && isDateSelected(date) ? 'selected' : ''} ${date && isDateInRange(date) ? 'in-range' : ''} ${date && date.toDateString() === new Date().toDateString() ? 'today' : ''}`}
                      onClick={() => date && handleDateClick(date)}
                      disabled={!date}
                    >
                      {date?.getDate()}
                    </button>
                  ))}
                </div>
                <div className="calendar-footer">
                  <div className="calendar-range-info">
                    <span>{dateFrom ? dateFrom.toLocaleDateString('ru') : 'Начало'}</span>
                    <span>—</span>
                    <span>{dateTo ? dateTo.toLocaleDateString('ru') : 'Конец'}</span>
                  </div>
                  <div className="calendar-actions">
                    {(dateFrom || dateTo) && (
                      <button className="clear-btn" onClick={clearDateFilter}>Сбросить</button>
                    )}
                    <button className="apply-btn" onClick={() => setShowCalendar(false)}>Применить</button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Кнопка поиска по игроку */}
          <button 
            className={`filter-btn ${playerSteamId ? 'active' : ''}`}
            onClick={() => {
              console.log('Player search clicked')
              setShowPlayerSearch(!showPlayerSearch)
            }}
            title="Поиск по игроку"
          >
            <PlayerIcon />
          </button>
        </div>

        {/* Активные фильтры */}
        {textFilter && (
          <div className="filter-tag-group">
            <div className="filter-tag-icon">
              <TextSearchIcon />
            </div>
            <div className="filter-tag-text">{textFilter}</div>
            <button className="filter-tag-close" onClick={clearTextFilter}>×</button>
          </div>
        )}
        
        {(dateFrom || dateTo) && (
          <div className="filter-tag-group">
            <div className="filter-tag-icon">
              <CalendarIcon />
            </div>
            <div className="filter-tag-text">
              {dateFrom ? `${dateFrom.getDate().toString().padStart(2, '0')} ${monthNames[dateFrom.getMonth()].slice(0, 3)} ${dateFrom.getFullYear()}` : '...'}
              {dateTo ? ` - ${dateTo.getDate().toString().padStart(2, '0')} ${monthNames[dateTo.getMonth()].slice(0, 3)} ${dateTo.getFullYear()}` : ''}
            </div>
            <button className="filter-tag-close" onClick={clearDateFilter}>×</button>
          </div>
        )}
        
        {playerSteamId && (
          <div className="filter-tag-group">
            <div className="filter-tag-icon player">
              {chatPlayers.find(p => p.steam_id === playerSteamId)?.avatar ? (
                <img src={chatPlayers.find(p => p.steam_id === playerSteamId)?.avatar} alt="" />
              ) : (
                <PlayerIcon />
              )}
            </div>
            <div className="filter-tag-text">
              {chatPlayers.find(p => p.steam_id === playerSteamId)?.name || playerSteamId}
            </div>
            <button className="filter-tag-icon-btn" onClick={() => handlePlayerClick(playerSteamId)}>
              <PlayerIcon />
            </button>
            <button className="filter-tag-close" onClick={() => setSearchParams({})}>×</button>
          </div>
        )}
      </div>

      <div className="chat-container">
        <div className="chat-messages">
          {filteredMessages.length === 0 ? (
            <div className="chat-empty">
              <ChatEmptyIcon />
              <span>Нет сообщений</span>
              <p>{textFilter || dateFrom || dateTo ? 'Сообщения не найдены по заданным фильтрам' : 'Сообщения из игрового чата будут отображаться здесь'}</p>
            </div>
          ) : (
            filteredMessages.map(msg => (
              <div 
                key={msg.id} 
                className={`chat-message ${msg.is_admin ? 'admin' : ''} ${hoveredMessage === msg.id ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredMessage(msg.id)}
                onMouseLeave={() => setHoveredMessage(null)}
                onContextMenu={(e) => handleContextMenu(e, msg.id)}
              >
                {hoveredMessage === msg.id && (
                  <div className="message-actions">
                    <button className="action-btn" title="Открыть профиль" onClick={() => handlePlayerClick(msg.steam_id)}>
                      <ProfileIcon />
                    </button>
                    {mutedPlayers[msg.steam_id] ? (
                      <button className="action-btn success" title="Снять мут" onClick={() => handleUnmute(msg.steam_id)}>
                        <UnmuteIcon />
                      </button>
                    ) : (
                      <button className="action-btn destructive" title="Выдать мут" onClick={() => handleMute(msg.steam_id, msg.name)}>
                        <MuteIcon />
                      </button>
                    )}
                    <button className="action-btn" title="Меню" onClick={(e) => handleContextMenu(e, msg.id)}>
                      <MoreGridIcon />
                    </button>
                  </div>
                )}
                <span className="message-time" title={formatFullDate(msg.timestamp)}>{formatTime(msg.timestamp)}</span>
                <span className="message-content">
                  {msg.is_team && <span className="team-badge">[TEAM]</span>}
                  {msg.avatar && <img src={msg.avatar} alt="" className="message-avatar" onClick={() => handlePlayerClick(msg.steam_id)} />}
                  {mutedPlayers[msg.steam_id] && (
                    <span className="muted-icon" title={`Мут: ${mutedPlayers[msg.steam_id].reason}`}>
                      <MutedMicIcon />
                    </span>
                  )}
                  <button className={`message-author ${msg.is_admin ? 'admin' : ''}`} onClick={() => handlePlayerClick(msg.steam_id)}>
                    {highlightText(msg.name, textFilter)}
                  </button>
                  <span className="message-text">{highlightText(msg.message, textFilter)}</span>
                </span>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-input-area">
          <span className="input-hint" title="Сообщение отправится в игру">?</span>
          <input
            type="text"
            placeholder={playerSteamId ? "Написать игроку в ЛС..." : "Написать в глобальный чат..."}
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
          />
          <button className="send-btn" onClick={handleSendMessage} disabled={!inputMessage.trim()}><SendIcon /></button>
        </div>
      </div>
      {contextMenu && (
        <div className="chat-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) handlePlayerClick(m.steam_id) }}>Открыть профиль</button>
          <button onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) copyToClipboard(m.steam_id) }}>Скопировать SteamID</button>
          <button onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) setSearchParams({ player: m.steam_id }) }}>Все сообщения</button>
          {(() => {
            const m = messages.find(x => x.id === contextMenu.id)
            if (m && mutedPlayers[m.steam_id]) {
              return <button className="success" onClick={() => { handleUnmute(m.steam_id); setContextMenu(null) }}>Снять мут</button>
            }
            return <button className="destructive" onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) handleMute(m.steam_id, m.name) }}>Выдать мут</button>
          })()}
        </div>
      )}

      {/* Модальное окно фильтра по тексту */}
      {showTextFilterModal && (
        <div className="chat-modal-overlay" onClick={() => setShowTextFilterModal(false)}>
          <div className="text-filter-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>Фильтр по тексту</span>
              <button className="close-btn" onClick={() => setShowTextFilterModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <input 
                type="text"
                placeholder="Введите текст"
                value={tempTextFilter}
                onChange={e => setTempTextFilter(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && applyTextFilter()}
                autoFocus
              />
              <button className="apply-btn" onClick={applyTextFilter}>Применить</button>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно поиска игрока */}
      {showPlayerSearch && (
        <div className="chat-modal-overlay" onClick={() => setShowPlayerSearch(false)}>
          <div className="player-search-modal-border" onClick={e => e.stopPropagation()} ref={playerSearchRef}>
            <div className="player-search-modal">
              <div className="player-search-input">
                <SearchIcon />
                <input 
                  type="text"
                  placeholder="Введите ник, steamid или IP"
                  value={playerSearchQuery}
                  onChange={e => { setPlayerSearchQuery(e.target.value); setSelectedPlayerIndex(0) }}
                  onKeyDown={handlePlayerSearchKeyDown}
                  autoFocus
                />
                {loadingPlayers && <span className="search-loading-indicator">...</span>}
              </div>
              <div className="player-search-list">
                {!playerSearchQuery.trim() && chatPlayers.length === 0 ? (
                  <div className="player-search-empty">
                    <EmptyListIcon />
                    <span>Введите ник для поиска</span>
                    <p>Поиск по всем игрокам в базе данных</p>
                  </div>
                ) : filteredPlayers.length === 0 && !loadingPlayers ? (
                  <div className="player-search-empty">
                    <SearchEmptyIcon />
                    <span>Ничего не найдено</span>
                    <p>Попробуйте изменить запрос</p>
                  </div>
                ) : (
                  filteredPlayers.slice(0, 15).map((player, idx) => (
                    <div 
                      key={player.id}
                      className={`player-search-item ${idx === selectedPlayerIndex ? 'selected' : ''}`}
                      onClick={() => selectPlayer(player)}
                    >
                      <div className="player-avatar-wrapper">
                        <img src={player.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                        <span className={`player-status ${player.role === 'офлайн' ? 'offline' : ''}`}></span>
                      </div>
                      <div className="player-info">
                        <span className="player-name">{player.name}</span>
                        <span className="player-role">{player.role || 'игрок'}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="player-search-footer">
                <div className="kbd-hint">
                  <span className="kbd">↓</span>
                  <span className="kbd">↑</span>
                  <span>перемещаться</span>
                </div>
                <div className="kbd-hint">
                  <span className="kbd">ENTR</span>
                  <span>выбрать</span>
                </div>
                <div className="kbd-hint ml-auto">
                  <span className="kbd">ESC</span>
                  <span>закрыть</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно мута */}
      {muteModal && (
        <div className="chat-modal-overlay" onClick={() => setMuteModal(null)}>
          <div className="mute-modal" onClick={e => e.stopPropagation()}>
            <div className="mute-modal-content">
              <div className="mute-modal-header">
                <span>Выдать мут</span>
                <button className="close-btn" onClick={() => setMuteModal(null)}>×</button>
              </div>
              <div className="mute-modal-player">
                <span>Игрок: <strong>{muteModal.name}</strong></span>
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
                <button className="mute-submit-btn" onClick={submitMute} disabled={!muteReason.trim()}>
                  Выдать мут
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChatEmptyIcon() { return <svg width="64" height="64" viewBox="0 0 24 24" fill="#444"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg> }
function ProfileIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4ZM12 14C8.67 14 2 15.67 2 19V20C2 20.55 2.45 21 3 21H21C21.55 21 22 20.55 22 20V19C22 15.67 15.33 14 12 14Z"/></svg> }
function MuteIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 11C17 11.53 16.92 12.04 16.76 12.52L8.11 3.86C9.02 2.73 10.43 2 12 2C14.76 2 17 4.24 17 7V11Z"/><path d="M2.29 2.29C2.68 1.9 3.32 1.9 3.71 2.29L21.71 20.29C22.1 20.68 22.1 21.32 21.71 21.71C21.32 22.1 20.68 22.1 20.29 21.71L17.04 18.46C15.96 19.2 14.62 19.78 13 19.95V21C13 21.55 12.55 22 12 22C11.45 22 11 21.55 11 21V19.95C7.45 19.58 5.3 17.28 4.18 15.54C3.87 15.08 4.01 14.46 4.47 14.16C4.93 13.86 5.55 13.99 5.85 14.46C6.89 16.06 8.8 18 12 18C13.46 18 14.65 17.6 15.6 17.01L14.12 15.53C13.47 15.83 12.76 16 12 16C9.24 16 7 13.76 7 11V8.41L2.29 3.71C1.9 3.32 1.9 2.68 2.29 2.29Z"/></svg> }
function UnmuteIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C14.76 2 17 4.24 17 7V11C17 13.76 14.76 16 12 16C9.24 16 7 13.76 7 11V7C7 4.24 9.24 2 12 2ZM13 19.95V21C13 21.55 12.55 22 12 22C11.45 22 11 21.55 11 21V19.95C7.45 19.58 5.3 17.28 4.18 15.54C3.87 15.08 4.01 14.46 4.47 14.16C4.93 13.86 5.55 13.99 5.85 14.46C6.89 16.06 8.8 18 12 18C15.2 18 17.11 16.06 18.15 14.46C18.45 13.99 19.07 13.86 19.53 14.16C19.99 14.46 20.13 15.08 19.82 15.54C18.7 17.28 16.55 19.58 13 19.95Z"/></svg> }
function MutedMicIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 11C17 11.53 16.92 12.04 16.76 12.52L8.11 3.86C9.02 2.73 10.43 2 12 2C14.76 2 17 4.24 17 7V11Z"/><path d="M2.29 2.29C2.68 1.9 3.32 1.9 3.71 2.29L21.71 20.29C22.1 20.68 22.1 21.32 21.71 21.71C21.32 22.1 20.68 22.1 20.29 21.71L17.04 18.46C15.96 19.2 14.62 19.78 13 19.95V21C13 21.55 12.55 22 12 22C11.45 22 11 21.55 11 21V19.95C7.45 19.58 5.3 17.28 4.18 15.54C3.87 15.08 4.01 14.46 4.47 14.16C4.93 13.86 5.55 13.99 5.85 14.46C6.89 16.06 8.8 18 12 18C13.46 18 14.65 17.6 15.6 17.01L14.12 15.53C13.47 15.83 12.76 16 12 16C9.24 16 7 13.76 7 11V8.41L2.29 3.71C1.9 3.32 1.9 2.68 2.29 2.29Z"/></svg> }
function MoreGridIcon() { return <svg viewBox="0 0 24 25" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M3 5.5C3 4.4 3.9 3.5 5 3.5C6.1 3.5 7 4.4 7 5.5C7 6.6 6.1 7.5 5 7.5C3.9 7.5 3 6.6 3 5.5ZM10 5.5C10 4.4 10.9 3.5 12 3.5C13.1 3.5 14 4.4 14 5.5C14 6.6 13.1 7.5 12 7.5C10.9 7.5 10 6.6 10 5.5ZM17 5.5C17 4.4 17.9 3.5 19 3.5C20.1 3.5 21 4.4 21 5.5C21 6.6 20.1 7.5 19 7.5C17.9 7.5 17 6.6 17 5.5ZM3 12.5C3 11.4 3.9 10.5 5 10.5C6.1 10.5 7 11.4 7 12.5C7 13.6 6.1 14.5 5 14.5C3.9 14.5 3 13.6 3 12.5ZM10 12.5C10 11.4 10.9 10.5 12 10.5C13.1 10.5 14 11.4 14 12.5C14 13.6 13.1 14.5 12 14.5C10.9 14.5 10 13.6 10 12.5ZM17 12.5C17 11.4 17.9 10.5 19 10.5C20.1 10.5 21 11.4 21 12.5C21 13.6 20.1 14.5 19 14.5C17.9 14.5 17 13.6 17 12.5ZM3 19.5C3 18.4 3.9 17.5 5 17.5C6.1 17.5 7 18.4 7 19.5C7 20.6 6.1 21.5 5 21.5C3.9 21.5 3 20.6 3 19.5ZM10 19.5C10 18.4 10.9 17.5 12 17.5C13.1 17.5 14 18.4 14 19.5C14 20.6 13.1 21.5 12 21.5C10.9 21.5 10 20.6 10 19.5ZM17 19.5C17 18.4 17.9 17.5 19 17.5C20.1 17.5 21 18.4 21 19.5C21 20.6 20.1 21.5 19 21.5C17.9 21.5 17 20.6 17 19.5Z"/></svg> }
function SendIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg> }

// Иконки для фильтров
function TextSearchIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C10.527 22 9.12598 21.6809 7.86443 21.1072L3.91523 21.8461C2.86781 22.0421 1.95576 21.114 2.16998 20.0701L2.95146 16.2622C2.34094 14.9681 2 13.5225 2 12ZM6.25 12C6.25 12.6904 6.80964 13.25 7.5 13.25C8.19036 13.25 8.75 12.6904 8.75 12C8.75 11.3096 8.19036 10.75 7.5 10.75C6.80964 10.75 6.25 11.3096 6.25 12ZM10.75 12C10.75 12.6904 11.3096 13.25 12 13.25C12.6904 13.25 13.25 12.6904 13.25 12C13.25 11.3096 12.6904 10.75 12 10.75C11.3096 10.75 10.75 11.3096 10.75 12ZM16.5 13.25C15.8096 13.25 15.25 12.6904 15.25 12C15.25 11.3096 15.8096 10.75 16.5 10.75C17.1904 10.75 17.75 11.3096 17.75 12C17.75 12.6904 17.1904 13.25 16.5 13.25Z"/></svg> }
function CalendarIcon() { return <svg viewBox="0 0 17 17" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M5.66667 1.41699C6.05786 1.41699 6.375 1.73413 6.375 2.12533V2.83366H10.625V2.12533C10.625 1.73413 10.9421 1.41699 11.3333 1.41699C11.7245 1.41699 12.0417 1.73413 12.0417 2.12533V2.83366H12.75C13.9236 2.83366 14.875 3.78506 14.875 4.95866V12.7503C14.875 13.924 13.9236 14.8753 12.75 14.8753H4.25C3.0764 14.8753 2.125 13.924 2.125 12.7503V4.95866C2.125 3.78506 3.0764 2.83366 4.25 2.83366H4.95833V2.12533C4.95833 1.73413 5.27547 1.41699 5.66667 1.41699ZM3.54167 7.79199V12.7503C3.54167 13.1415 3.8588 13.4587 4.25 13.4587H12.75C13.1412 13.4587 13.4583 13.1415 13.4583 12.7503V7.79199H3.54167Z"/></svg> }
function PlayerIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22ZM15 10C15 11.6569 13.6569 13 12 13C10.3431 13 9 11.6569 9 10C9 8.34315 10.3431 7 12 7C13.6569 7 15 8.34315 15 10ZM12.0002 20C9.76181 20 7.73814 19.0807 6.28613 17.5991C7.61787 16.005 9.60491 15 12.0002 15C14.3955 15 16.3825 16.005 17.7143 17.5991C16.2623 19.0807 14.2386 20 12.0002 20Z"/></svg> }
function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 20L16.05 16.05M18 11C18 14.866 14.866 18 11 18C7.13401 18 4 14.866 4 11C4 7.13401 7.13401 4 11 4C14.866 4 18 7.13401 18 11Z"/></svg> }
function EmptyListIcon() { return <svg viewBox="0 0 24 24" width="48" height="48" fill="#555"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-5-9h10v2H7z"/></svg> }
function SearchEmptyIcon() { return <svg viewBox="0 0 24 24" width="48" height="48" fill="#555"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg> }
function ChevronLeftIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg> }
function ChevronRightIcon() { return <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg> }
