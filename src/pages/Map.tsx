import { useEffect, useState, useRef } from 'react'
import { useServer } from '../App'

interface Player {
  steam_id: string
  name: string
  avatar: string
  position: { x: number; y: number; z: number }
  team: string | null
}

interface MapData {
  mapUrl: string
  worldSize: number
  players: Player[]
  serverName: string
  online: number
}

export default function Map() {
  const { serverId } = useServer()
  const [mapData, setMapData] = useState<MapData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hoveredPlayer, setHoveredPlayer] = useState<Player | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [isVisible, setIsVisible] = useState(true)
  const [nextUpdate, setNextUpdate] = useState(5)
  const [showPlayerList, setShowPlayerList] = useState(false)

  // Отслеживание видимости вкладки
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
      console.log('[MAP] Fetching map data for server:', serverId)
      try {
        const res = await fetch(`/api/servers/${serverId}/map`)
        console.log('[MAP] Response status:', res.status)
        
        if (res.ok) {
          const data = await res.json()
          console.log('[MAP] Received data:', data)
          console.log('[MAP] Players count:', data.players?.length || 0)
          console.log('[MAP] Players:', data.players)
          setMapData(data)
          setError('')
          setNextUpdate(5) // Сброс таймера
        } else {
          const errorText = await res.text()
          console.error('[MAP] Error response:', errorText)
          setError('Не удалось загрузить карту')
        }
      } catch (err) {
        console.error('[MAP] Fetch error:', err)
        setError('Ошибка подключения к серверу')
      } finally {
        setLoading(false)
      }
    }

    fetchMap()
    
    // Обновление только если вкладка активна, каждые 5 секунд
    const interval = setInterval(() => {
      if (isVisible) {
        fetchMap()
      }
    }, 5000)
    
    // Таймер обратного отсчета
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
      const mapScale = canvas.width / worldSize

      // Рисуем всех игроков
      console.log('[MAP] Drawing players:', mapData.players.length)
      mapData.players.forEach((player, index) => {
        console.log(`[MAP] Player ${index}:`, player.name, player.position)
        
        if (!player.position) {
          console.warn(`[MAP] Player ${player.name} has no position!`)
          return
        }
        
        const { x, z } = player.position
        
        const canvasX = (x + worldSize / 2) * mapScale
        const canvasY = (worldSize / 2 - z) * mapScale
        
        console.log(`[MAP] Drawing ${player.name} at canvas coords:`, canvasX, canvasY)

        const dotSize = Math.max(8, 10 / scale)

        // Рисуем точку игрока
        ctx.beginPath()
        ctx.arc(canvasX, canvasY, dotSize, 0, Math.PI * 2)
        ctx.fillStyle = player.team ? '#4CAF50' : '#FF5252'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = Math.max(2, 3 / scale)
        ctx.stroke()

        // Рисуем имя игрока
        if (scale >= 0.7) {
          const fontSize = Math.max(11, 13 / scale)
          ctx.font = `bold ${fontSize}px Arial`
          ctx.fillStyle = '#fff'
          ctx.strokeStyle = '#000'
          ctx.lineWidth = Math.max(2.5, 4 / scale)
          ctx.strokeText(player.name, canvasX + dotSize + 6, canvasY + 5)
          ctx.fillText(player.name, canvasX + dotSize + 6, canvasY + 5)
        }
      })
    }

    img.onerror = () => {
      setError('Не удалось загрузить изображение карты')
    }

    if (mapData.mapUrl) {
      img.src = mapData.mapUrl
    }
  }, [mapData, scale])

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapData || !canvasRef.current || !containerRef.current) return

    if (isDragging) {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      setOffset({ x: offset.x + dx, y: offset.y + dy })
      setDragStart({ x: e.clientX, y: e.clientY })
      return
    }

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const mouseX = (e.clientX - rect.left) / scale
    const mouseY = (e.clientY - rect.top) / scale

    setMousePos({ x: e.clientX, y: e.clientY })

    const worldSize = mapData.worldSize
    const mapScale = canvas.width / worldSize

    let found = false
    for (const player of mapData.players) {
      if (!player.position) continue
      
      const { x, z } = player.position
      const canvasX = (x + worldSize / 2) * mapScale
      const canvasY = (worldSize / 2 - z) * mapScale

      const distance = Math.sqrt((mouseX - canvasX) ** 2 + (mouseY - canvasY) ** 2)
      if (distance < 15) {
        setHoveredPlayer(player)
        found = true
        break
      }
    }

    if (!found) {
      setHoveredPlayer(null)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const zoomToPlayer = (player: Player) => {
    if (!player.position || !canvasRef.current || !mapData) return
    
    console.log('[MAP] Zooming to player:', player.name, player.position)
    
    const canvas = canvasRef.current
    const worldSize = mapData.worldSize
    const mapScale = canvas.width / worldSize
    
    const { x, z } = player.position
    
    // Вычисляем позицию игрока на canvas
    const canvasX = (x + worldSize / 2) * mapScale
    const canvasY = (worldSize / 2 - z) * mapScale
    
    console.log('[MAP] Canvas position:', canvasX, canvasY)
    console.log('[MAP] Canvas size:', canvas.width, canvas.height)
    
    // Устанавливаем зум
    const targetScale = 2
    setScale(targetScale)
    
    // Центрируем на игроке
    // Нужно сместить canvas так, чтобы точка игрока оказалась в центре экрана
    const containerWidth = window.innerWidth
    const containerHeight = window.innerHeight
    
    // Вычисляем смещение: центр экрана минус позиция игрока (с учетом зума)
    const offsetX = (containerWidth / 2) - (canvasX * targetScale)
    const offsetY = (containerHeight / 2) - (canvasY * targetScale)
    
    console.log('[MAP] Setting offset:', offsetX, offsetY)
    
    setOffset({ x: offsetX, y: offsetY })
    setShowPlayerList(false)
  }

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.5, Math.min(3, scale * delta))
    setScale(newScale)
  }

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        color: '#fff',
        fontSize: 18
      }}>
        <div>Загрузка карты...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh',
        background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
        color: '#ff5252',
        fontSize: 18
      }}>
        <div>{error}</div>
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)',
      overflow: 'hidden',
      position: 'fixed',
      top: 0,
      left: 0
    }}>
      {/* Информация о сервере */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'rgba(0, 0, 0, 0.85)',
        padding: '15px 20px',
        borderRadius: 12,
        color: '#fff',
        zIndex: 10,
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 8, color: '#84cc16' }}>
          {mapData?.serverName}
        </div>
        <div style={{ fontSize: 14, color: '#aaa' }}>
          Игроков онлайн: <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{mapData?.online || 0}</span>
        </div>
        <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
          Обновление через {nextUpdate} сек
        </div>
        <button
          onClick={() => setShowPlayerList(!showPlayerList)}
          style={{
            marginTop: 10,
            background: 'linear-gradient(135deg, #84cc16 0%, #65a30d 100%)',
            border: 'none',
            color: '#fff',
            padding: '8px 16px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 'bold',
            width: '100%'
          }}
        >
          {showPlayerList ? 'Скрыть список' : 'Показать игроков'}
        </button>
      </div>

      {/* Список игроков */}
      {showPlayerList && mapData && (
        <div style={{
          position: 'absolute',
          top: 140,
          left: 20,
          background: 'rgba(0, 0, 0, 0.9)',
          padding: '15px',
          borderRadius: 12,
          color: '#fff',
          zIndex: 10,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)',
          maxHeight: '60vh',
          overflowY: 'auto',
          minWidth: 250
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 10, fontSize: 14 }}>
            Игроки на карте ({mapData.players.length}):
          </div>
          {mapData.players.map((player) => (
            <div
              key={player.steam_id}
              onClick={() => zoomToPlayer(player)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 10px',
                marginBottom: 6,
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 8,
                cursor: 'pointer',
                transition: 'all 0.2s',
                border: '1px solid transparent'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(132, 204, 22, 0.2)'
                e.currentTarget.style.borderColor = '#84cc16'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'
                e.currentTarget.style.borderColor = 'transparent'
              }}
            >
              <div style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: player.team ? '#4CAF50' : '#FF5252',
                border: '2px solid #fff',
                flexShrink: 0
              }} />
              {player.avatar && (
                <img 
                  src={player.avatar} 
                  alt="" 
                  style={{ 
                    width: 32, 
                    height: 32, 
                    borderRadius: '50%',
                    border: '2px solid #84cc16'
                  }}
                />
              )}
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 'bold' }}>
                  {player.name}
                </div>
                <div style={{ fontSize: 10, color: '#888' }}>
                  {player.position ? 
                    `X: ${Math.round(player.position.x)} Z: ${Math.round(player.position.z)}` : 
                    'Нет позиции'
                  }
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Легенда */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        background: 'rgba(0, 0, 0, 0.85)',
        padding: '15px 20px',
        borderRadius: 12,
        color: '#fff',
        zIndex: 10,
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ marginBottom: 12, fontWeight: 'bold', fontSize: 14 }}>Легенда:</div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ 
            width: 14, 
            height: 14, 
            borderRadius: '50%', 
            background: '#4CAF50',
            marginRight: 10,
            border: '2px solid #fff',
            boxShadow: '0 0 8px rgba(76, 175, 80, 0.6)'
          }} />
          <span style={{ fontSize: 13 }}>В команде</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ 
            width: 14, 
            height: 14, 
            borderRadius: '50%', 
            background: '#FF5252',
            marginRight: 10,
            border: '2px solid #fff',
            boxShadow: '0 0 8px rgba(255, 82, 82, 0.6)'
          }} />
          <span style={{ fontSize: 13 }}>Соло</span>
        </div>
      </div>

      {/* Управление зумом */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        background: 'rgba(0, 0, 0, 0.85)',
        padding: '12px',
        borderRadius: 12,
        color: '#fff',
        zIndex: 10,
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 20px rgba(0, 0, 0, 0.5)'
      }}>
        <button
          onClick={() => setScale(Math.min(3, scale * 1.2))}
          style={{
            background: 'linear-gradient(135deg, #84cc16 0%, #65a30d 100%)',
            border: 'none',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 20,
            fontWeight: 'bold',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(132, 204, 22, 0.3)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          +
        </button>
        <button
          onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }) }}
          style={{
            background: 'rgba(255, 255, 255, 0.15)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 16,
            transition: 'all 0.2s'
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
        >
          ⟲
        </button>
        <button
          onClick={() => setScale(Math.max(0.5, scale * 0.8))}
          style={{
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            border: 'none',
            color: '#fff',
            padding: '10px 14px',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 20,
            fontWeight: 'bold',
            transition: 'all 0.2s',
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.3)'
          }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
        >
          −
        </button>
        <div style={{ 
          textAlign: 'center', 
          fontSize: 13, 
          marginTop: 4,
          color: '#aaa',
          fontWeight: 'bold'
        }}>
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* Карта */}
      <div 
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => { setHoveredPlayer(null); setIsDragging(false) }}
        onWheelCapture={handleWheel}
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          touchAction: 'none'
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: 'none',
            maxHeight: 'none',
            width: 'auto',
            height: 'auto',
            boxShadow: '0 8px 40px rgba(0, 0, 0, 0.7)',
            borderRadius: 8,
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.3s ease-out',
            imageRendering: 'crisp-edges'
          }}
        />
      </div>

      {/* Tooltip при наведении на игрока */}
      {hoveredPlayer && (
        <div style={{
          position: 'fixed',
          left: mousePos.x + 15,
          top: mousePos.y + 15,
          background: 'rgba(0, 0, 0, 0.95)',
          padding: '12px 16px',
          borderRadius: 10,
          color: '#fff',
          zIndex: 100,
          pointerEvents: 'none',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.7)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {hoveredPlayer.avatar && (
              <img 
                src={hoveredPlayer.avatar} 
                alt="" 
                style={{ 
                  width: 40, 
                  height: 40, 
                  borderRadius: '50%',
                  border: '2px solid #84cc16'
                }}
              />
            )}
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 14, marginBottom: 4 }}>
                {hoveredPlayer.name}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {hoveredPlayer.steam_id}
              </div>
              {hoveredPlayer.team && (
                <div style={{ 
                  fontSize: 10, 
                  color: '#4CAF50',
                  marginTop: 4,
                  background: 'rgba(76, 175, 80, 0.2)',
                  padding: '2px 6px',
                  borderRadius: 4,
                  display: 'inline-block'
                }}>
                  В команде
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
