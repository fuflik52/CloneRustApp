import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
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
  steam_id: string
  steam_name: string
  avatar: string
  country?: string
  countryCode?: string
  city?: string
  provider?: string
  ips_history?: { ip: string; country?: string; city?: string }[]
  servers_played?: string[]
  first_seen?: number
  last_seen?: number
}

interface SteamInfo {
  privacy: string
  isPrivate: boolean
  accountCreated: string | null
  rustHours: number | null
  recentHours: number | null
  vacBans: number
  gameBans: number
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{id: string, x: number, y: number} | null>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [steamInfo, setSteamInfo] = useState<SteamInfo | null>(null)
  const [steamLoading, setSteamLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const { showToast } = useToast()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const playerSteamId = searchParams.get('player')


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

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Открыть профиль игрока в модалке
  const handlePlayerClick = async (steamId: string) => {
    try {
      const res = await fetch(`/api/players/db/${steamId}`)
      if (res.ok) {
        const player = await res.json()
        setSelectedPlayer(player)
        setActiveTab('overview')
        setSteamInfo(null)
        setSteamLoading(true)
        // Загружаем Steam инфо
        try {
          const steamRes = await fetch(`/api/player/${steamId}/steam`)
          if (steamRes.ok) {
            const data = await steamRes.json()
            if (!data.error) setSteamInfo(data)
          }
        } catch {}
        setSteamLoading(false)
      }
    } catch {
      showToast('Игрок не найден', 'error')
    }
  }

  const handleCloseModal = () => {
    setSelectedPlayer(null)
    setSteamInfo(null)
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

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  const formatFullDate = (ts: number) => `${new Date(ts).toLocaleDateString('ru')} в ${new Date(ts).toLocaleTimeString('ru')}`
  const formatDate = (ts: number) => `${new Date(ts).toLocaleDateString('ru')} в ${new Date(ts).toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })}`

  const handleContextMenu = (e: React.MouseEvent, msgId: string) => {
    e.preventDefault()
    setContextMenu({ id: msgId, x: e.clientX, y: e.clientY })
  }

  useEffect(() => {
    const handleClick = () => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])


  return (
    <div className="chat-page">
      {playerSteamId && (
        <div className="chat-filter-bar">
          <span>Сообщения игрока: {playerSteamId}</span>
          <button onClick={() => setSearchParams({})}>Показать все</button>
        </div>
      )}
      <div className="chat-container">
        <div className="chat-messages">
          {messages.length === 0 ? (
            <div className="chat-empty">
              <ChatEmptyIcon />
              <span>Нет сообщений</span>
              <p>Сообщения из игрового чата будут отображаться здесь</p>
            </div>
          ) : (
            messages.map(msg => (
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
                    <button className="action-btn destructive" title="Выдать мут">
                      <MuteIcon />
                    </button>
                    <button className="action-btn" title="Меню" onClick={(e) => handleContextMenu(e, msg.id)}>
                      <MoreGridIcon />
                    </button>
                  </div>
                )}
                <span className="message-time" title={formatFullDate(msg.timestamp)}>{formatTime(msg.timestamp)}</span>
                <span className="message-content">
                  {msg.is_team && <span className="team-badge">[TEAM]</span>}
                  {msg.avatar && <img src={msg.avatar} alt="" className="message-avatar" onClick={() => handlePlayerClick(msg.steam_id)} />}
                  <button className={`message-author ${msg.is_admin ? 'admin' : ''}`} onClick={() => handlePlayerClick(msg.steam_id)}>{msg.name}</button>
                  <span className="message-text">{msg.message}</span>
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

      {/* Context Menu */}
      {contextMenu && (
        <div className="chat-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) handlePlayerClick(m.steam_id) }}>Открыть профиль</button>
          <button onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) copyToClipboard(m.steam_id) }}>Скопировать SteamID</button>
          <button onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) setSearchParams({ player: m.steam_id }) }}>Все сообщения</button>
          <button className="destructive">Выдать мут</button>
        </div>
      )}


      {/* Player Modal */}
      {selectedPlayer && (
        <div className="player-modal-overlay" onClick={handleCloseModal}>
          <div className="player-modal" onClick={e => e.stopPropagation()}>
            <div className="player-modal-nav">
              <div className="modal-nav-header">
                <div className="modal-player-card">
                  <div className="modal-player-avatar">
                    <img src={selectedPlayer.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" />
                  </div>
                  <div className="modal-player-info">
                    <span className="modal-player-name">{selectedPlayer.steam_name}</span>
                    <span className="modal-player-status">{selectedPlayer.steam_id}</span>
                  </div>
                </div>
                <div className="modal-action-btns">
                  <a href={`https://steamcommunity.com/profiles/${selectedPlayer.steam_id}/`} target="_blank" className="modal-action-btn"><SteamIcon /></a>
                  <button className="modal-action-btn"><MoreIcon /></button>
                </div>
              </div>
              <div className="modal-menu-items">
                <div className={`modal-menu-item ${activeTab === 'overview' ? 'active' : ''}`} onClick={() => setActiveTab('overview')}><OverviewIcon /> Обзор</div>
                <div className={`modal-menu-item ${activeTab === 'stats' ? 'active' : ''}`} onClick={() => setActiveTab('stats')}><StatsIcon /> Статистика</div>
                <div className={`modal-menu-item ${activeTab === 'activity' ? 'active' : ''}`} onClick={() => setActiveTab('activity')}><ActivityIcon /> Активность</div>
                <div className={`modal-menu-item ${activeTab === 'mutes' ? 'active' : ''}`} onClick={() => setActiveTab('mutes')}><MutesIcon /> Муты</div>
                <div className={`modal-menu-item ${activeTab === 'bans' ? 'active' : ''}`} onClick={() => setActiveTab('bans')}><BansIcon /> Блокировки</div>
              </div>
            </div>
            <div className="player-modal-content">
              <div className="modal-content-header">
                <button className="modal-close-btn" onClick={handleCloseModal}><CloseIcon /></button>
              </div>
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
                          <span className="cell-value">{selectedPlayer.servers_played?.[selectedPlayer.servers_played.length - 1] || 'N/A'}</span>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">SteamID</span>
                          <div className="cell-value-actions">
                            <span className="cell-value-white">{selectedPlayer.steam_id}</span>
                            <button className="cell-action-btn" onClick={() => copyToClipboard(selectedPlayer.steam_id)}><CopyIcon /></button>
                          </div>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">Впервые замечен</span>
                          <span className="cell-value">{selectedPlayer.first_seen ? formatDate(selectedPlayer.first_seen) : 'N/A'}</span>
                        </div>
                        <div className="modal-card-cell">
                          <span className="cell-label">IP адрес</span>
                          <div className="cell-value-actions">
                            <span className="cell-value-white">{selectedPlayer.ips_history?.[selectedPlayer.ips_history.length - 1]?.ip || 'N/A'}</span>
                            <button className="cell-action-btn" onClick={() => copyToClipboard(selectedPlayer.ips_history?.[selectedPlayer.ips_history.length - 1]?.ip || '')}><CopyIcon /></button>
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
                        <div className="steam-loading"><div className="steam-spinner"></div><span>Загрузка...</span></div>
                      ) : (
                        <div className="modal-card-grid">
                          <div className="modal-card-cell"><span className="cell-label">Приватность</span><span className="cell-value">{steamInfo?.privacy || 'N/A'}</span></div>
                          <div className="modal-card-cell"><span className="cell-label">Аккаунт создан</span><span className="cell-value">{steamInfo?.accountCreated ? formatDate(new Date(steamInfo.accountCreated).getTime()) : steamInfo?.isPrivate ? 'Скрыто' : 'N/A'}</span></div>
                          <div className="modal-card-cell"><span className="cell-label">Часов в RUST</span><span className="cell-value">{steamInfo?.rustHours != null ? `~${steamInfo.rustHours}` : steamInfo?.isPrivate ? 'Скрыто' : 'N/A'}</span></div>
                          <div className="modal-card-cell"><span className="cell-label">Часов за 2 недели</span><span className="cell-value">{steamInfo?.recentHours != null ? steamInfo.recentHours : steamInfo?.isPrivate ? 'Скрыто' : 'N/A'}</span></div>
                          <div className="modal-card-cell"><span className="cell-label">Gamebans / VAC</span><span className="cell-value" style={{ color: (steamInfo?.vacBans || 0) + (steamInfo?.gameBans || 0) > 0 ? '#ef4444' : undefined }}>{steamInfo ? ((steamInfo.vacBans || 0) + (steamInfo.gameBans || 0) > 0 ? `${steamInfo.gameBans} game / ${steamInfo.vacBans} VAC` : 'Банов нет') : 'N/A'}</span></div>
                          <div className="modal-card-cell"><span className="cell-label">Последнее обновление</span><span className="cell-value">{formatDate(Date.now())}</span></div>
                        </div>
                      )}
                    </div>
                  </>
                )}
                {activeTab !== 'overview' && (
                  <div className="tab-placeholder">
                    <div className="placeholder-icon-box"><BoxIcon /></div>
                    <span className="placeholder-title">Раздел в разработке</span>
                    <span className="placeholder-desc">Этот функционал скоро будет доступен</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// Icons
function ChatEmptyIcon() { return <svg width="64" height="64" viewBox="0 0 24 24" fill="#444"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg> }
function ProfileIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4ZM12 14C8.67 14 2 15.67 2 19V20C2 20.55 2.45 21 3 21H21C21.55 21 22 20.55 22 20V19C22 15.67 15.33 14 12 14Z"/></svg> }
function MuteIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 11C17 11.53 16.92 12.04 16.76 12.52L8.11 3.86C9.02 2.73 10.43 2 12 2C14.76 2 17 4.24 17 7V11Z"/><path d="M2.29 2.29C2.68 1.9 3.32 1.9 3.71 2.29L21.71 20.29C22.1 20.68 22.1 21.32 21.71 21.71C21.32 22.1 20.68 22.1 20.29 21.71L17.04 18.46C15.96 19.2 14.62 19.78 13 19.95V21C13 21.55 12.55 22 12 22C11.45 22 11 21.55 11 21V19.95C7.45 19.58 5.3 17.28 4.18 15.54C3.87 15.08 4.01 14.46 4.47 14.16C4.93 13.86 5.55 13.99 5.85 14.46C6.89 16.06 8.8 18 12 18C13.46 18 14.65 17.6 15.6 17.01L14.12 15.53C13.47 15.83 12.76 16 12 16C9.24 16 7 13.76 7 11V8.41L2.29 3.71C1.9 3.32 1.9 2.68 2.29 2.29Z"/></svg> }
function MoreGridIcon() { return <svg viewBox="0 0 24 25" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M3 5.5C3 4.4 3.9 3.5 5 3.5C6.1 3.5 7 4.4 7 5.5C7 6.6 6.1 7.5 5 7.5C3.9 7.5 3 6.6 3 5.5ZM10 5.5C10 4.4 10.9 3.5 12 3.5C13.1 3.5 14 4.4 14 5.5C14 6.6 13.1 7.5 12 7.5C10.9 7.5 10 6.6 10 5.5ZM17 5.5C17 4.4 17.9 3.5 19 3.5C20.1 3.5 21 4.4 21 5.5C21 6.6 20.1 7.5 19 7.5C17.9 7.5 17 6.6 17 5.5ZM3 12.5C3 11.4 3.9 10.5 5 10.5C6.1 10.5 7 11.4 7 12.5C7 13.6 6.1 14.5 5 14.5C3.9 14.5 3 13.6 3 12.5ZM10 12.5C10 11.4 10.9 10.5 12 10.5C13.1 10.5 14 11.4 14 12.5C14 13.6 13.1 14.5 12 14.5C10.9 14.5 10 13.6 10 12.5ZM17 12.5C17 11.4 17.9 10.5 19 10.5C20.1 10.5 21 11.4 21 12.5C21 13.6 20.1 14.5 19 14.5C17.9 14.5 17 13.6 17 12.5ZM3 19.5C3 18.4 3.9 17.5 5 17.5C6.1 17.5 7 18.4 7 19.5C7 20.6 6.1 21.5 5 21.5C3.9 21.5 3 20.6 3 19.5ZM10 19.5C10 18.4 10.9 17.5 12 17.5C13.1 17.5 14 18.4 14 19.5C14 20.6 13.1 21.5 12 21.5C10.9 21.5 10 20.6 10 19.5ZM17 19.5C17 18.4 17.9 17.5 19 17.5C20.1 17.5 21 18.4 21 19.5C21 20.6 20.1 21.5 19 21.5C17.9 21.5 17 20.6 17 19.5Z"/></svg> }
function SendIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg> }
function SteamIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3l-.5 3H13v6.95c5.05-.5 9-4.76 9-9.95 0-5.52-4.48-10-10-10z"/></svg> }
function OverviewIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/></svg> }
function StatsIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/></svg> }
function ActivityIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 3c-4.97 0-9 4.03-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42C8.27 19.99 10.51 21 13 21c4.97 0 9-4.03 9-9s-4.03-9-9-9zm-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8H12z"/></svg> }
function MutesIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z"/></svg> }
function BansIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg> }
function CloseIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg> }
function CopyIcon() { return <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg> }
function MoreIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg> }
function BoxIcon() { return <svg width="48" height="48" viewBox="0 0 24 24" fill="#444"><path d="M20 3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H4V5h16v14z"/></svg> }