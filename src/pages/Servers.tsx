import { useState, useEffect } from 'react'
import { useToast } from '../components/Toast'

interface Server {
  id: string
  name: string
  secretKey: string
  hostname: string
  port: number
  online: number
  maxPlayers: number
  lastUpdate: string
  status: 'online' | 'offline'
  createdAt?: number
}

function CountdownTimer({ createdAt }: { createdAt?: number }) {
  const [timeLeft, setTimeLeft] = useState('5:00')
  
  useEffect(() => {
    const calcTime = () => {
      if (!createdAt) return '5:00'
      const elapsed = Date.now() - createdAt
      const remaining = Math.max(0, 5 * 60 * 1000 - elapsed)
      const mins = Math.floor(remaining / 60000)
      const secs = Math.floor((remaining % 60000) / 1000)
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    
    setTimeLeft(calcTime())
    const interval = setInterval(() => setTimeLeft(calcTime()), 1000)
    return () => clearInterval(interval)
  }, [createdAt])
  
  return <span className="countdown-timer">{timeLeft}</span>
}

export default function Servers() {
  const [servers, setServers] = useState<Server[]>([])
  const [showModal, setShowModal] = useState(false)
  const [serverName, setServerName] = useState('')
  const [newServer, setNewServer] = useState<Server | null>(null)
  const [copiedKey, setCopiedKey] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<Server | null>(null)
  const { showToast } = useToast()

  useEffect(() => {
    fetchServers()
    const interval = setInterval(fetchServers, 5000)
    return () => clearInterval(interval)
  }, [])

  const fetchServers = async () => {
    try {
      const res = await fetch('http://localhost:3001/api/servers')
      if (res.ok) setServers(await res.json())
    } catch {}
  }

  const createServer = async () => {
    if (!serverName.trim()) return
    try {
      const res = await fetch('http://localhost:3001/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: serverName })
      })
      if (res.ok) {
        const server = await res.json()
        setNewServer(server)
        setServerName('')
        fetchServers()
      }
    } catch {}
  }

  const deleteServer = async (id: string) => {
    try {
      await fetch(`http://localhost:3001/api/servers/${id}`, { method: 'DELETE' })
      fetchServers()
      setDeleteConfirm(null)
      showToast('Сервер удалён')
    } catch {}
  }

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key)
    setCopiedKey(key)
    showToast('Ключ скопирован')
    setTimeout(() => setCopiedKey(''), 2000)
  }

  return (
    <div className="servers-page">
      <div className="servers-header">
        <span>Серверы</span>
        <button className="add-server-btn" onClick={() => setShowModal(true)}>
          <PlusIcon />Подключить сервер
        </button>
      </div>

      {servers.length === 0 ? (
        <div className="servers-empty">
          <ServerEmptyIcon />
          <p>Серверы не подключены</p>
          <span>Подключите сервер чтобы начать</span>
        </div>
      ) : (
        <div className="servers-list">
          {servers.map(server => (
            <div key={server.id} className={`server-card ${server.status}`}>
              <div className="server-info">
                <div className="server-name">
                  <div className={`status-dot ${server.status}`} />
                  <span>{server.name}</span>
                </div>
                <div className="server-stats">
                  {server.status === 'online' ? (
                    <>
                      <span>{server.hostname}:{server.port}</span>
                      <span className="sep">•</span>
                      <span>{server.online}/{server.maxPlayers} игроков</span>
                      <span className="sep">•</span>
                      <span>Обновлено: {server.lastUpdate}</span>
                    </>
                  ) : (
                    <>
                      <div className="loader">
                        <div className="line"></div><div className="line"></div><div className="line"></div>
                        <div className="line"></div><div className="line"></div><div className="line"></div>
                        <div className="line"></div><div className="line"></div><div className="line"></div>
                        <div className="line"></div><div className="line"></div><div className="line"></div>
                      </div>
                      <span>Ожидает подключения...</span>
                      <span className="sep">•</span>
                      <CountdownTimer createdAt={server.createdAt} />
                    </>
                  )}
                </div>
              </div>
              <div className="server-actions">
                <button className="key-btn" onClick={() => copyKey(server.secretKey)} title="Копировать ключ">
                  {copiedKey === server.secretKey ? <CheckIcon /> : <KeyIcon />}
                </button>
                <button className="delete-btn" onClick={() => setDeleteConfirm(server)} title="Удалить">
                  <TrashIcon />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay active" onClick={() => { setShowModal(false); setNewServer(null) }}>
          <div className="modal server-modal divided-card" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span>{newServer ? 'Сервер создан' : 'Подключить сервер'}</span>
              <button onClick={() => { setShowModal(false); setNewServer(null) }}><CloseIcon /></button>
            </div>
            {newServer ? (
              <div className="modal-body success-body">
                <div className="success-header">
                  <div className="success-icon-wrap">
                    <SuccessCheckIcon />
                  </div>
                  <p className="success-title">Сервер успешно создан!</p>
                </div>
                <div className="key-display">
                  <label><KeyLockIcon /> Secret Key (скопируйте в конфиг плагина)</label>
                  <div className="key-value">
                    <code>{newServer.secretKey}</code>
                    <button onClick={() => copyKey(newServer.secretKey)}>
                      {copiedKey === newServer.secretKey ? <CheckIcon /> : <CopyIcon />}
                    </button>
                  </div>
                </div>
                <div className="instructions">
                  <div className="instruction-item"><span className="step-num">1</span><DownloadIcon /> Скачайте плагин PanRust.cs</div>
                  <div className="instruction-item"><span className="step-num">2</span><FolderIcon /> Поместите в папку oxide/plugins</div>
                  <div className="instruction-item"><span className="step-num">3</span><ConfigIcon /> В конфиге укажите Secret Key</div>
                  <div className="instruction-item"><span className="step-num">4</span><RefreshIcon /> Перезагрузите плагин</div>
                </div>
                <button className="modal-btn-gray" onClick={() => { setShowModal(false); setNewServer(null) }}>Готово</button>
              </div>
            ) : (
              <div className="modal-body">
                <div className="form-group">
                  <label>Название сервера</label>
                  <input type="text" placeholder="Мой Rust сервер" value={serverName} onChange={e => setServerName(e.target.value)} />
                </div>
                <button className="modal-btn" onClick={createServer} disabled={!serverName.trim()}>Создать</button>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="modal-overlay active" onClick={() => setDeleteConfirm(null)}>
          <div className="confirm-modal" onClick={e => e.stopPropagation()}>
            <h3>Удалить сервер?</h3>
            <p>Вы уверены что хотите удалить сервер «{deleteConfirm.name}»? Это действие нельзя отменить.</p>
            <div className="confirm-actions">
              <button className="confirm-btn-cancel" onClick={() => setDeleteConfirm(null)}>Отмена</button>
              <button className="confirm-btn-delete" onClick={() => deleteServer(deleteConfirm.id)}>Удалить</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PlusIcon() { return <svg viewBox="0 0 24 24"><path d="M19 13H13V19H11V13H5V11H11V5H13V11H19V13Z"/></svg> }
function ServerEmptyIcon() { return <svg viewBox="0 0 24 24" className="empty-icon"><path d="M2 6C2 4.9 2.9 4 4 4H20C21.1 4 22 4.9 22 6V10H2V6ZM6 7.5C6 8.05 5.55 8.5 5 8.5C4.45 8.5 4 8.05 4 7.5C4 6.95 4.45 6.5 5 6.5C5.55 6.5 6 6.95 6 7.5ZM2 12H22V16C22 17.1 21.1 18 20 18H4C2.9 18 2 17.1 2 16V12ZM6 14.5C6 15.05 5.55 15.5 5 15.5C4.45 15.5 4 15.05 4 14.5C4 13.95 4.45 13.5 5 13.5C5.55 13.5 6 13.95 6 14.5Z"/></svg> }
function KeyIcon() { return <svg viewBox="0 0 24 24"><path d="M12.65 10C11.83 7.67 9.61 6 7 6C3.69 6 1 8.69 1 12C1 15.31 3.69 18 7 18C9.61 18 11.83 16.33 12.65 14H17V18H21V14H23V10H12.65ZM7 14C5.9 14 5 13.1 5 12C5 10.9 5.9 10 7 10C8.1 10 9 10.9 9 12C9 13.1 8.1 14 7 14Z"/></svg> }
function TrashIcon() { return <svg viewBox="0 0 24 24"><path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z"/></svg> }
function CheckIcon() { return <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12L3.41 13.41L9 19L21 7L19.59 5.59L9 16.17Z"/></svg> }
function CopyIcon() { return <svg viewBox="0 0 24 24"><path d="M16 1H4C2.9 1 2 1.9 2 3V17H4V3H16V1ZM19 5H8C6.9 5 6 5.9 6 7V21C6 22.1 6.9 23 8 23H19C20.1 23 21 22.1 21 21V7C21 5.9 20.1 5 19 5ZM19 21H8V7H19V21Z"/></svg> }
function CloseIcon() { return <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5L12 10.59L6.41 5L5 6.41L10.59 12L5 17.59L6.41 19L12 13.41L17.59 19L19 17.59L13.41 12L19 6.41Z"/></svg> }
function SuccessCheckIcon() { return <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg> }
function KeyLockIcon() { return <svg viewBox="0 0 24 24"><path d="M12.65 10C11.83 7.67 9.61 6 7 6C3.69 6 1 8.69 1 12C1 15.31 3.69 18 7 18C9.61 18 11.83 16.33 12.65 14H17V18H21V14H23V10H12.65ZM7 14C5.9 14 5 13.1 5 12C5 10.9 5.9 10 7 10C8.1 10 9 10.9 9 12C9 13.1 8.1 14 7 14Z"/></svg> }
function DownloadIcon() { return <svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg> }
function FolderIcon() { return <svg viewBox="0 0 24 24"><path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/></svg> }
function ConfigIcon() { return <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg> }
function RefreshIcon() { return <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg> }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WarningIcon() { return <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg> }
