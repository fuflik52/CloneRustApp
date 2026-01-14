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
  const navigate = useNavigate()
  const chatEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<ChatMessage[]>([])
  const playerSteamId = searchParams.get('player')

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  // Загрузка сообщений
  const fetchMessages = async () => {
    try {
      const url = playerSteamId 
        ? `/api/chat/player/${playerSteamId}?limit=200`
        : '/api/chat?limit=200'
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        const newMessages = playerSteamId ? data : data.messages
        // Проверяем есть ли новые сообщения
        if (JSON.stringify(newMessages) !== JSON.stringify(messagesRef.current)) {
          messagesRef.current = newMessages
          setMessages(newMessages)
        }
      }
    } catch {}
  }


  useEffect(() => {
    fetchMessages()
    // Обновляем каждую секунду для real-time
    const interval = setInterval(fetchMessages, 1000)
    return () => clearInterval(interval)
  }, [playerSteamId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  // Открыть профиль игрока на странице Players
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
        showToast('Сообщение отправлено в игру')
        // Сразу обновляем чат
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

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' })
  }

  const formatFullDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return `${date.toLocaleDateString('ru')} в ${date.toLocaleTimeString('ru')}`
  }

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
                      <ReplyIcon />
                    </button>
                    <button className="action-btn destructive" title="Выдать мут">
                      <MuteIcon />
                    </button>
                    <button className="action-btn" title="Полное меню" onClick={(e) => handleContextMenu(e, msg.id)}>
                      <MoreGridIcon />
                    </button>
                  </div>
                )}
                <span className="message-time" title={formatFullDate(msg.timestamp)}>
                  {formatTime(msg.timestamp)}
                </span>
                <span className="message-content">
                  {msg.is_team && <span className="team-badge">[TEAM]</span>}
                  {msg.avatar && (
                    <img 
                      src={msg.avatar} 
                      alt="" 
                      className="message-avatar"
                      onClick={() => handlePlayerClick(msg.steam_id)}
                    />
                  )}
                  <button 
                    className={`message-author ${msg.is_admin ? 'admin' : ''}`}
                    onClick={() => handlePlayerClick(msg.steam_id)}
                  >
                    {msg.name}
                  </button>
                  <span className="message-text">{msg.message}</span>
                </span>
              </div>
            ))
          )}
          <div ref={chatEndRef} />
        </div>

        <div className="chat-input-area">
          <span className="input-hint" title="Сообщение будет отправлено в игру">?</span>
          <input
            type="text"
            placeholder={playerSteamId ? "Написать игроку в ЛС..." : "Написать в глобальный чат..."}
            value={inputMessage}
            onChange={e => setInputMessage(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSendMessage()}
          />
          <button className="send-btn" onClick={handleSendMessage} disabled={!inputMessage.trim()}>
            <SendIcon />
          </button>
        </div>
      </div>


      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="chat-context-menu"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button onClick={() => {
            const msg = messages.find(m => m.id === contextMenu.id)
            if (msg) handlePlayerClick(msg.steam_id)
          }}>
            Открыть профиль
          </button>
          <button onClick={() => {
            const msg = messages.find(m => m.id === contextMenu.id)
            if (msg) copyToClipboard(msg.steam_id)
          }}>
            Скопировать SteamID
          </button>
          <button onClick={() => {
            const msg = messages.find(m => m.id === contextMenu.id)
            if (msg) setSearchParams({ player: msg.steam_id })
          }}>
            Все сообщения игрока
          </button>
          <button className="destructive">
            Выдать мут
          </button>
        </div>
      )}
    </div>
  )
}

// Icons
function ChatEmptyIcon() {
  return (
    <svg width="64" height="64" viewBox="0 0 24 24" fill="#444">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
    </svg>
  )
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4ZM12 14C8.67 14 2 15.67 2 19V20C2 20.55 2.45 21 3 21H21C21.55 21 22 20.55 22 20V19C22 15.67 15.33 14 12 14Z"/>
    </svg>
  )
}

function MuteIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.0004 11C17.0004 11.5306 16.9178 12.0418 16.7647 12.5216L8.10645 3.86334C9.02299 2.72695 10.4268 2 12.0004 2C14.7619 2 17.0004 4.23858 17.0004 7V11Z"/>
      <path d="M2.29289 2.29289C2.68342 1.90237 3.31658 1.90237 3.70711 2.29289L21.7071 20.2929C22.0976 20.6834 22.0976 21.3166 21.7071 21.7071C21.3166 22.0976 20.6834 22.0976 20.2929 21.7071L17.0438 18.458C15.9626 19.203 14.6237 19.7784 13 19.9485V21C13 21.5523 12.5523 22 12 22C11.4477 22 11 21.5523 11 21V19.9488C7.44647 19.5784 5.29912 17.2758 4.1755 15.5444C3.87485 15.0811 4.00669 14.4618 4.46998 14.1612C4.93326 13.8605 5.55255 13.9924 5.85319 14.4556C6.8928 16.0576 8.79991 18 12 18C13.4637 18 14.646 17.5974 15.5989 17.0131L14.1167 15.5309C13.4734 15.8318 12.7556 16 12 16C9.23859 16 7.00001 13.7614 7.00001 11V8.41423L2.29289 3.70711C1.90237 3.31658 1.90237 2.68342 2.29289 2.29289Z"/>
    </svg>
  )
}

function MoreGridIcon() {
  return (
    <svg viewBox="0 0 24 25" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M3 5.5C3 4.39543 3.89543 3.5 5 3.5C6.10457 3.5 7 4.39543 7 5.5C7 6.60457 6.10457 7.5 5 7.5C3.89543 7.5 3 6.60457 3 5.5ZM10 5.5C10 4.39543 10.8954 3.5 12 3.5C13.1046 3.5 14 4.39543 14 5.5C14 6.60457 13.1046 7.5 12 7.5C10.8954 7.5 10 6.60457 10 5.5ZM17 5.5C17 4.39543 17.8954 3.5 19 3.5C20.1046 3.5 21 4.39543 21 5.5C21 6.60457 20.1046 7.5 19 7.5C17.8954 7.5 17 6.60457 17 5.5ZM3 12.5C3 11.3954 3.89543 10.5 5 10.5C6.10457 10.5 7 11.3954 7 12.5C7 13.6046 6.10457 14.5 5 14.5C3.89543 14.5 3 13.6046 3 12.5ZM10 12.5C10 11.3954 10.8954 10.5 12 10.5C13.1046 10.5 14 11.3954 14 12.5C14 13.6046 13.1046 14.5 12 14.5C10.8954 14.5 10 13.6046 10 12.5ZM17 12.5C17 11.3954 17.8954 10.5 19 10.5C20.1046 10.5 21 11.3954 21 12.5C21 13.6046 20.1046 14.5 19 14.5C17.8954 14.5 17 13.6046 17 12.5ZM3 19.5C3 18.3954 3.89543 17.5 5 17.5C6.10457 17.5 7 18.3954 7 19.5C7 20.6046 6.10457 21.5 5 21.5C3.89543 21.5 3 20.6046 3 19.5ZM10 19.5C10 18.3954 10.8954 17.5 12 17.5C13.1046 17.5 14 18.3954 14 19.5C14 20.6046 13.1046 21.5 12 21.5C10.8954 21.5 10 20.6046 10 19.5ZM17 19.5C17 18.3954 17.8954 17.5 19 17.5C20.1046 17.5 21 18.3954 21 19.5C21 20.6046 20.1046 21.5 19 21.5C17.8954 21.5 17 20.6046 17 19.5Z"/>
    </svg>
  )
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
    </svg>
  )
}