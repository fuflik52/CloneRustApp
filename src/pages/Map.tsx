import { useEffect, useState, useRef } from 'react'
import { useServer } from '../App'
import { useToast } from '../components/Toast'

interface Player {
  steam_id: string
  name: string
  avatar: string
  position: { x: number; y: number; z: number }
  team: string | null
}

interface Monument {
  name: string
  x: number
  y: number
  z: number
  type: string
}

interface MapData {
  mapUrl: string
  worldSize: number
  players: Player[]
  monuments: Monument[]
  serverName: string
  online: number
}

export default function Map() {
  const { serverId } = useServer()
  const { showToast } = useToast()
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [activeTab, setActiveTab] = useState<'actions' | 'messages' | 'reports'>('actions')
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isVisible, setIsVisible] = useState(true)
  const [nextUpdate, setNextUpdate] = useState(5)
  const [copiedText, setCopiedText] = useState('')

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden)
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    if (!serverId) return

    const fetchMap = async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/map`)
        
        if (res.ok) {
          const data = await res.json()
          setMapData(data)
          setError('')
          setNextUpdate(5)
        } else {
          setError('Не удалось загрузить карту')
        }
      } catch {
        setError('Ошибка подключения к серверу')
      } finally {
        setLoading(false)
      }
    }

    fetchMap()
    
    const interval = setInterval(() => {
      if (isVisible) {
        fetchMap()
      }
    }, 5000)
    
    const countdown = setInterval(() => {
      setNextUpdate(prev => prev > 0 ? prev - 1 : 5)
    }, 1000)

    return () => {
      clearInterval(interval)
      clearInterval(countdown)
    }
  }, [serverId, isVisible])

  useEffect(() => {
    if (!mapData || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      canvas.width = img.width
      canvas.height = img.height

      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0)

      const worldSize = mapData.worldSize

      if (mapData.players && mapData.players.length > 0) {
        mapData.players.forEach((player) => {
          if (!player.position) return
          
          const { x, z } = player.position
          if (x === 0 && z === 0) return
          
          const halfSize = worldSize / 2
          if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) return
          
          // Правильная конвертация координат Rust в координаты карты
          // В Rust: центр карты (0,0), X вправо, Z вверх
          // На canvas: (0,0) левый верхний угол
          const canvasX = ((halfSize + x) / worldSize) * canvas.width
          const canvasY = ((halfSize - z) / worldSize) * canvas.height
          const dotSize = 5 // Уменьшенный размер точек

          ctx.beginPath()
          ctx.arc(canvasX + 0.5, canvasY + 0.5, dotSize, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
          ctx.fill()

          ctx.beginPath()
          ctx.arc(canvasX, canvasY, dotSize, 0, Math.PI * 2)
          ctx.fillStyle = '#f3c366'
          ctx.fill()
          ctx.strokeStyle = '#3b311f'
          ctx.lineWidth = 1.5
          ctx.stroke()
          
          ctx.beginPath()
          ctx.arc(canvasX, canvasY, dotSize / 3, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
          ctx.fill()

          if (scale >= 0.6) {
            ctx.save()
            ctx.font = 'bold 11px Arial'
            ctx.fillStyle = '#fff'
            ctx.strokeStyle = '#000'
            ctx.lineWidth = 2.5
            ctx.strokeText(player.name, canvasX + dotSize + 4, canvasY + 3)
            ctx.fillText(player.name, canvasX + dotSize + 4, canvasY + 3)
            ctx.restore()
          }
        })
      }

      if (mapData.monuments && mapData.monuments.length > 0) {
        mapData.monuments.forEach((monument) => {
          const { x, z } = monument
          const halfSize = worldSize / 2
          const canvasX = ((halfSize + x) / worldSize) * canvas.width
          const canvasY = ((halfSize - z) / worldSize) * canvas.height
          const iconSize = 20
          
          ctx.save()
          ctx.font = `${iconSize}px Arial`
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.shadowColor = 'rgba(0, 0, 0, 0.8)'
          ctx.shadowBlur = 4
          ctx.shadowOffsetX = 2
          ctx.shadowOffsetY = 2
          ctx.fillText(getMonumentIcon(monument.name), canvasX, canvasY)
          ctx.restore()
          
          if (scale >= 1.2) {
            ctx.save()
            ctx.font = 'bold 12px Arial'
            ctx.fillStyle = '#fff'
            ctx.strokeStyle = '#000'
            ctx.lineWidth = 2
            ctx.textAlign = 'center'
            ctx.strokeText(monument.name, canvasX, canvasY + iconSize + 8)
            ctx.fillText(monument.name, canvasX, canvasY + iconSize + 8)
            ctx.restore()
          }
        })
      }
    }

    img.onerror = () => setError('Не удалось загрузить изображение карты')
    if (mapData.mapUrl) img.src = mapData.mapUrl
  }, [mapData, scale])

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!mapData || !canvasRef.current) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) / scale
    const mouseY = (e.clientY - rect.top) / scale
    const worldSize = mapData.worldSize
    const halfSize = worldSize / 2

    for (const player of mapData.players) {
      if (!player.position) continue
      const { x, z } = player.position
      const canvasX = ((halfSize + x) / worldSize) * canvas.width
      const canvasY = ((halfSize - z) / worldSize) * canvas.height
      const distance = Math.sqrt((mouseX - canvasX) ** 2 + (mouseY - canvasY) ** 2)
      if (distance < 20) {
        setSelectedPlayer(player)
        return
      }
    }
    setSelectedPlayer(null)
  }

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (!canvasRef.current || !containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    const mouseX = e.clientX
    const mouseY = e.clientY
    const containerMouseX = mouseX - rect.left
    const containerMouseY = mouseY - rect.top
    const canvasMouseX = (containerMouseX - offset.x) / scale
    const canvasMouseY = (containerMouseY - offset.y) / scale
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(10, scale * delta))
    
    setScale(newScale)
    setOffset({ 
      x: containerMouseX - canvasMouseX * newScale, 
      y: containerMouseY - canvasMouseY * newScale 
    })
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [scale, offset])

  const copyToClipboard = (text: string) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
      setCopiedText(text)
      showToast('Скопировано в буфер обмена')
      setTimeout(() => setCopiedText(''), 2000)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopiedText(text)
      showToast('Скопировано в буфер обмена')
      setTimeout(() => setCopiedText(''), 2000)
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: '#fff', fontSize: 18 }}>
        <div>Загрузка карты...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', color: '#ff5252', fontSize: 18 }}>
        <div>{error}</div>
      </div>
    )
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', overflow: 'hidden', position: 'fixed', top: 0, left: 0 }}>
      <div style={{ position: 'absolute', top: 15, left: 15, background: 'rgba(0, 0, 0, 0.7)', padding: '10px 15px', borderRadius: 8, color: '#fff', zIndex: 10, backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 255, 255, 0.1)', fontSize: 13 }}>
        <div style={{ fontWeight: 'bold', color: '#84cc16', marginBottom: 3 }}>{mapData?.serverName}</div>
        <div style={{ fontSize: 11, color: '#888' }}>Онлайн: <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{mapData?.online || 0}</span> • Обновление: {nextUpdate}с</div>
      </div>

      <div style={{ position: 'absolute', bottom: 15, right: 15, background: 'rgba(0, 0, 0, 0.7)', padding: '8px', borderRadius: 8, color: '#fff', zIndex: 10, backdropFilter: 'blur(10px)', display: 'flex', gap: 6, border: '1px solid rgba(255, 255, 255, 0.1)', alignItems: 'center' }}>
        <button onClick={() => setScale(Math.min(10, scale * 1.2))} style={{ background: 'rgba(132, 204, 22, 0.3)', border: '1px solid #84cc16', color: '#84cc16', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>+</button>
        <div style={{ fontSize: 11, color: '#888', fontWeight: 'bold', minWidth: 40, textAlign: 'center' }}>{Math.round(scale * 100)}%</div>
        <button onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }) }} style={{ background: 'rgba(255, 255, 255, 0.1)', border: '1px solid rgba(255, 255, 255, 0.2)', color: '#fff', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 14 }}>⟲</button>
        <button onClick={() => setScale(Math.max(0.1, scale * 0.8))} style={{ background: 'rgba(239, 68, 68, 0.3)', border: '1px solid #ef4444', color: '#ef4444', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 16, fontWeight: 'bold' }}>−</button>
      </div>

      {selectedPlayer && (
        <div style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: '#1a1a1a',
          padding: 0,
          borderRadius: 12,
          color: '#fff',
          zIndex: 100,
          border: '1px solid #333',
          minWidth: 400,
          maxWidth: 500,
          maxHeight: '80vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{ 
            padding: '20px', 
            borderBottom: '1px solid #333',
            display: 'flex',
            alignItems: 'center',
            gap: 15
          }}>
            <button
              onClick={() => setSelectedPlayer(null)}
              style={{
                position: 'absolute',
                top: 15,
                right: 15,
                background: 'transparent',
                border: 'none',
                color: '#888',
                fontSize: 20,
                cursor: 'pointer',
                padding: 5
              }}
            >
              ✕
            </button>
            
            {selectedPlayer.avatar && (
              <img 
                src={selectedPlayer.avatar} 
                alt="" 
                style={{ 
                  width: 64, 
                  height: 64, 
                  borderRadius: '50%',
                  border: '2px solid #84cc16'
                }}
              />
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
                {selectedPlayer.name}
              </div>
              <div style={{ 
                fontSize: 12, 
                color: '#888',
                display: 'flex',
                alignItems: 'center',
                gap: 8
              }}>
                <span>{selectedPlayer.steam_id}</span>
                <button
                  onClick={() => copyToClipboard(selectedPlayer.steam_id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#84cc16',
                    cursor: 'pointer',
                    padding: 0,
                    fontSize: 14
                  }}
                  title="Копировать Steam ID"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
              </div>
              {selectedPlayer.position && (
                <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                  X: {Math.round(selectedPlayer.position.x)} Y: {Math.round(selectedPlayer.position.y)} Z: {Math.round(selectedPlayer.position.z)}
                </div>
              )}
            </div>
          </div>

          <div style={{ 
            display: 'flex', 
            borderBottom: '1px solid #333',
            background: '#0f0f0f'
          }}>
            <button
              onClick={() => setActiveTab('actions')}
              style={{
                flex: 1,
                padding: '12px',
                background: activeTab === 'actions' ? '#1a1a1a' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'actions' ? '2px solid #84cc16' : '2px solid transparent',
                color: activeTab === 'actions' ? '#84cc16' : '#888',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 'bold'
              }}
            >
              Действия
            </button>
            <button
              onClick={() => setActiveTab('messages')}
              style={{
                flex: 1,
                padding: '12px',
                background: activeTab === 'messages' ? '#1a1a1a' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'messages' ? '2px solid #84cc16' : '2px solid transparent',
                color: activeTab === 'messages' ? '#84cc16' : '#888',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 'bold'
              }}
            >
              Сообщения
            </button>
            <button
              onClick={() => setActiveTab('reports')}
              style={{
                flex: 1,
                padding: '12px',
                background: activeTab === 'reports' ? '#1a1a1a' : 'transparent',
                border: 'none',
                borderBottom: activeTab === 'reports' ? '2px solid #84cc16' : '2px solid transparent',
                color: activeTab === 'reports' ? '#84cc16' : '#888',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: 'bold'
              }}
            >
              Репорты
            </button>
          </div>

          <div style={{ 
            padding: '20px',
            overflowY: 'auto',
            maxHeight: 'calc(80vh - 200px)'
          }}>
            {activeTab === 'actions' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button
                  onClick={() => copyToClipboard(`/tp ${selectedPlayer.steam_id}`)}
                  style={{
                    background: 'rgba(132, 204, 22, 0.1)',
                    border: '1px solid #84cc16',
                    color: '#84cc16',
                    padding: '12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5z"/>
                    <path d="M2 17l10 5 10-5"/>
                    <path d="M2 12l10 5 10-5"/>
                  </svg>
                  {copiedText === `/tp ${selectedPlayer.steam_id}` ? 'Скопировано!' : 'Телепорт к игроку'}
                </button>

                <button
                  style={{
                    background: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid #3b82f6',
                    color: '#3b82f6',
                    padding: '12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Добавить заметку
                </button>

                <button
                  style={{
                    background: 'rgba(251, 146, 60, 0.1)',
                    border: '1px solid #fb923c',
                    color: '#fb923c',
                    padding: '12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                  </svg>
                  Выдать мут
                </button>

                <button
                  style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #ef4444',
                    color: '#ef4444',
                    padding: '12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12"/>
                  </svg>
                  Кикнуть
                </button>

                <button
                  style={{
                    background: 'rgba(220, 38, 38, 0.1)',
                    border: '1px solid #dc2626',
                    color: '#dc2626',
                    padding: '12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    fontSize: 13,
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10
                  }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
                  </svg>
                  Заблокировать
                </button>
              </div>
            )}

            {activeTab === 'messages' && (
              <div style={{ 
                color: '#888', 
                textAlign: 'center', 
                padding: '40px 20px',
                fontSize: 14
              }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 15px', opacity: 0.3 }}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                <div>Нет сообщений</div>
              </div>
            )}

            {activeTab === 'reports' && (
              <div style={{ 
                color: '#888', 
                textAlign: 'center', 
                padding: '40px 20px',
                fontSize: 14
              }}>
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: '0 auto 15px', opacity: 0.3 }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                <div>Нет репортов</div>
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={containerRef} onMouseDown={(e) => { setIsDragging(true); setDragStart({ x: e.clientX, y: e.clientY }) }} onMouseMove={(e) => { if (isDragging) { setOffset({ x: offset.x + e.clientX - dragStart.x, y: offset.y + e.clientY - dragStart.y }); setDragStart({ x: e.clientX, y: e.clientY }) } }} onMouseUp={() => setIsDragging(false)} onMouseLeave={() => setIsDragging(false)} style={{ width: '100%', height: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden', cursor: isDragging ? 'grabbing' : 'grab', userSelect: 'none' }}>
        <canvas ref={canvasRef} onClick={handleCanvasClick} style={{ maxWidth: 'none', maxHeight: 'none', boxShadow: '0 8px 40px rgba(0, 0, 0, 0.7)', borderRadius: 8, transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: '0 0', imageRendering: 'crisp-edges' }} />
      </div>
    </div>
  )
}

function getMonumentIcon(name: string): string {
  const icons: Record<string, string> = {
    'Airfield': '✈️', 'Launch Site': '🚀', 'Military Tunnel': '🎖️', 'Military Tunnels': '🎖️',
    'Power Plant': '⚡', 'Water Treatment': '💧', 'Water Treatment Plant': '💧',
    'Train Yard': '🚂', 'Trainyard': '🚂', 'Dome': '🏛️', 'The Dome': '🏛️',
    'Satellite Dish': '📡', 'Satellite': '📡', 'Supermarket': '🏪', 'Gas Station': '⛽',
    'Lighthouse': '🗼', 'Harbor': '⚓', 'Large Harbor': '⚓', 'Junkyard': '🏚️',
    'Mining Outpost': '⛏️', 'Quarry': '🏗️', 'Sewer Branch': '🚰', 'Underwater Lab': '🔬',
    'Fishing Village': '🎣', 'Bandit Camp': '🏕️', 'Outpost': '🏘️', 'Arctic Research Base': '🧊',
    'Oil Rig': '🛢️', 'Large Oil Rig': '🛢️', 'Small Oil Rig': '🛢️', 'Cargo Ship': '🚢',
    'Excavator': '🏗️', 'Giant Excavator Pit': '🏗️', 'Ranch': '🐄', 'Barn': '🌾',
    'Missile Silo': '🚀', 'Abandoned Cabins': '🏚️', 'Abandoned Supermarket': '🏪',
    'Oxums Gas Station': '⛽', 'Stables': '🐴'
  }
  
  if (icons[name]) return icons[name]
  const lowerName = name.toLowerCase()
  for (const [key, icon] of Object.entries(icons)) {
    if (lowerName.includes(key.toLowerCase())) return icon
  }
  return '📍'
}
