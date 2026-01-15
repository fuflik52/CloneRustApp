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
      const mapScale = canvas.width / worldSize

      // Рисуем всех игроков
      mapData.players.forEach((player) => {
        if (!player.position) return
        
        const { x, z } = player.position
        
        const canvasX = (x + worldSize / 2) * mapScale
        const canvasY = (worldSize / 2 - z) * mapScale

        // Разные размеры точек для разнообразия
        const baseDotSize = player.team ? 14 : 12
        const dotSize = Math.max(baseDotSize, baseDotSize / scale)

        // Рисуем тень
        ctx.beginPath()
        ctx.arc(canvasX + 2, canvasY + 2, dotSize, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)'
        ctx.fill()

        // Рисуем точку игрока
        ctx.beginPath()
        ctx.arc(canvasX, canvasY, dotSize, 0, Math.PI * 2)
        
        // Градиент для точки
        const gradient = ctx.createRadialGradient(canvasX, canvasY, 0, canvasX, canvasY, dotSize)
        if (player.team) {
          gradient.addColorStop(0, '#66ff66')
          gradient.addColorStop(1, '#4CAF50')
        } else {
          gradient.addColorStop(0, '#ff6666')
          gradient.addColorStop(1, '#FF5252')
        }
        ctx.fillStyle = gradient
        ctx.fill()
        
        // Обводка
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = Math.max(3, 4 / scale)
        ctx.stroke()
        
        // Внутренняя точка
        ctx.beginPath()
        ctx.arc(canvasX, canvasY, dotSize / 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.fill()

        // Рисуем имя игрока
        if (scale >= 0.6) {
          const fontSize = Math.max(14, 16 / scale)
          ctx.font = `bold ${fontSize}px Arial, sans-serif`
          ctx.fillStyle = '#fff'
          ctx.strokeStyle = '#000'
          ctx.lineWidth = Math.max(4, 5 / scale)
          ctx.lineJoin = 'round'
          ctx.miterLimit = 2
          
          const textX = canvasX + dotSize + 8
          const textY = canvasY + 6
          
          ctx.strokeText(player.name, textX, textY)
          ctx.fillText(player.name, textX, textY)
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

  // Ограничение перетаскивания
  const clampOffset = (newOffset: { x: number; y: number }, currentScale: number) => {
    if (!canvasRef.current) return newOffset

    const canvas = canvasRef.current
    const containerWidth = window.innerWidth
    const containerHeight = window.innerHeight
    
    const scaledWidth = canvas.width * currentScale
    const scaledHeight = canvas.height * currentScale
    
    // Минимальные и максимальные значения offset
    const minX = containerWidth - scaledWidth - 100
    const maxX = 100
    const minY = containerHeight - scaledHeight - 100
    const maxY = 100
    
    return {
      x: Math.max(minX, Math.min(maxX, newOffset.x)),
      y: Math.max(minY, Math.min(maxY, newOffset.y))
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!mapData || !canvasRef.current || !containerRef.current) return

    if (isDragging) {
      const dx = e.clientX - dragStart.x
      const dy = e.clientY - dragStart.y
      const newOffset = clampOffset({ x: offset.x + dx, y: offset.y + dy }, scale)
      setOffset(newOffset)
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
      if (distance < 20) {
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

  const handleWheel = (e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.5, Math.min(3, scale * delta))
    setScale(newScale)
    
    // Ограничиваем offset при зуме
    setOffset(prev => clampOffset(prev, newScale))
  }

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    container.addEventListener('wheel', handleWheel, { passive: false })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [scale, offset])

  const zoomToPlayer = (player: Player) => {
    if (!player.position || !canvasRef.current || !mapData) return
    
    const canvas = canvasRef.current
    const worldSize = mapData.worldSize
    const mapScale = canvas.width / worldSize
    
    const { x, z } = player.position
    
    const canvasX = (x + worldSize / 2) * mapScale
    const canvasY = (worldSize / 2 - z) * mapScale
    
    const targetScale = 2
    setScale(targetScale)
    
    const containerWidth = window.innerWidth
    const containerHeight = window.innerHeight
    
    const offsetX = (containerWidth / 2) - (canvasX * targetScale)
    const offsetY = (containerHeight / 2) - (canvasY * targetScale)
    
    setOffset(clampOffset({ x: offsetX, y: offsetY }, targetScale))
    setShowPlayerList(false)
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
          top: 160,
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
                width: 12,
                height: 12,
                borderRadius: '50%',
                background: player.team ? '#4CAF50' : '#FF5252',
                border: '2px solid #fff',
                flexShrink: 0,
                boxShadow: player.team ? '0 0 8px #4CAF50' : '0 0 8px #FF5252'
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
          onClick={() => {
            const newScale = Math.min(3, scale * 1.2)
            setScale(newScale)
            setOffset(prev => clampOffset(prev, newScale))
          }}
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
        >
          ⟲
        </button>
        <button
          onClick={() => {
            const newScale = Math.max(0.5, scale * 0.8)
            setScale(newScale)
            setOffset(prev => clampOffset(prev, newScale))
          }}
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
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none'
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
