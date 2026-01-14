import { useState, useEffect, useRef } from 'react'
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

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [searchParams, setSearchParams] = useSearchParams()
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{id: string, x: number, y: number} | null>(null)
  const { showToast } = useToast()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const playerSteamId = searchParams.get('player')
  const navigate = useNavigate()

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
      {contextMenu && (
        <div className="chat-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }}>
          <button onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) handlePlayerClick(m.steam_id) }}>Открыть профиль</button>
          <button onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) copyToClipboard(m.steam_id) }}>Скопировать SteamID</button>
          <button onClick={() => { const m = messages.find(x => x.id === contextMenu.id); if (m) setSearchParams({ player: m.steam_id }) }}>Все сообщения</button>
          <button className="destructive">Выдать мут</button>
        </div>
      )}
    </div>
  )
}

function ChatEmptyIcon() { return <svg width="64" height="64" viewBox="0 0 24 24" fill="#444"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg> }
function ProfileIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4ZM12 14C8.67 14 2 15.67 2 19V20C2 20.55 2.45 21 3 21H21C21.55 21 22 20.55 22 20V19C22 15.67 15.33 14 12 14Z"/></svg> }
function MuteIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 11C17 11.53 16.92 12.04 16.76 12.52L8.11 3.86C9.02 2.73 10.43 2 12 2C14.76 2 17 4.24 17 7V11Z"/><path d="M2.29 2.29C2.68 1.9 3.32 1.9 3.71 2.29L21.71 20.29C22.1 20.68 22.1 21.32 21.71 21.71C21.32 22.1 20.68 22.1 20.29 21.71L17.04 18.46C15.96 19.2 14.62 19.78 13 19.95V21C13 21.55 12.55 22 12 22C11.45 22 11 21.55 11 21V19.95C7.45 19.58 5.3 17.28 4.18 15.54C3.87 15.08 4.01 14.46 4.47 14.16C4.93 13.86 5.55 13.99 5.85 14.46C6.89 16.06 8.8 18 12 18C13.46 18 14.65 17.6 15.6 17.01L14.12 15.53C13.47 15.83 12.76 16 12 16C9.24 16 7 13.76 7 11V8.41L2.29 3.71C1.9 3.32 1.9 2.68 2.29 2.29Z"/></svg> }
function MoreGridIcon() { return <svg viewBox="0 0 24 25" fill="currentColor"><path fillRule="evenodd" clipRule="evenodd" d="M3 5.5C3 4.4 3.9 3.5 5 3.5C6.1 3.5 7 4.4 7 5.5C7 6.6 6.1 7.5 5 7.5C3.9 7.5 3 6.6 3 5.5ZM10 5.5C10 4.4 10.9 3.5 12 3.5C13.1 3.5 14 4.4 14 5.5C14 6.6 13.1 7.5 12 7.5C10.9 7.5 10 6.6 10 5.5ZM17 5.5C17 4.4 17.9 3.5 19 3.5C20.1 3.5 21 4.4 21 5.5C21 6.6 20.1 7.5 19 7.5C17.9 7.5 17 6.6 17 5.5ZM3 12.5C3 11.4 3.9 10.5 5 10.5C6.1 10.5 7 11.4 7 12.5C7 13.6 6.1 14.5 5 14.5C3.9 14.5 3 13.6 3 12.5ZM10 12.5C10 11.4 10.9 10.5 12 10.5C13.1 10.5 14 11.4 14 12.5C14 13.6 13.1 14.5 12 14.5C10.9 14.5 10 13.6 10 12.5ZM17 12.5C17 11.4 17.9 10.5 19 10.5C20.1 10.5 21 11.4 21 12.5C21 13.6 20.1 14.5 19 14.5C17.9 14.5 17 13.6 17 12.5ZM3 19.5C3 18.4 3.9 17.5 5 17.5C6.1 17.5 7 18.4 7 19.5C7 20.6 6.1 21.5 5 21.5C3.9 21.5 3 20.6 3 19.5ZM10 19.5C10 18.4 10.9 17.5 12 17.5C13.1 17.5 14 18.4 14 19.5C14 20.6 13.1 21.5 12 21.5C10.9 21.5 10 20.6 10 19.5ZM17 19.5C17 18.4 17.9 17.5 19 17.5C20.1 17.5 21 18.4 21 19.5C21 20.6 20.1 21.5 19 21.5C17.9 21.5 17 20.6 17 19.5Z"/></svg> }
function SendIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg> }
