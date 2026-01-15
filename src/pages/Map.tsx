import { useEffect, useState, useRef } from 'react'
import { useServer } from '../App'

interface Player {
  steam_id: string
  name: string
  avatar: string
  position: { x: number; y: number; z: number }
  team: string | null
  online?: boolean
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

      // Красная зона (радиация) вокруг карты
      const redZoneWidth = canvas.width * 0.08 // 8% от размера карты - средний отступ
      
      // Полупрозрачный красный градиент по краям
      // Верхняя полоса
      const gradientTop = ctx.createLinearGradient(0, 0, 0, redZoneWidth)
      gradientTop.addColorStop(0, 'rgba(255, 50, 50, 0.5)')
      gradientTop.addColorStop(1, 'rgba(255, 50, 50, 0)')
      ctx.fillStyle = gradientTop
      ctx.fillRect(0, 0, canvas.width, redZoneWidth)
      
      // Нижняя полоса
      const gradientBottom = ctx.createLinearGradient(0, canvas.height - redZoneWidth, 0, canvas.height)
      gradientBottom.addColorStop(0, 'rgba(255, 50, 50, 0)')
      gradientBottom.addColorStop(1, 'rgba(255, 50, 50, 0.5)')
      ctx.fillStyle = gradientBottom
      ctx.fillRect(0, canvas.height - redZoneWidth, canvas.width, redZoneWidth)
      
      // Левая полоса
      const gradientLeft = ctx.createLinearGradient(0, 0, redZoneWidth, 0)
      gradientLeft.addColorStop(0, 'rgba(255, 50, 50, 0.5)')
      gradientLeft.addColorStop(1, 'rgba(255, 50, 50, 0)')
      ctx.fillStyle = gradientLeft
      ctx.fillRect(0, 0, redZoneWidth, canvas.height)
      
      // Правая полоса
      const gradientRight = ctx.createLinearGradient(canvas.width - redZoneWidth, 0, canvas.width, 0)
      gradientRight.addColorStop(0, 'rgba(255, 50, 50, 0)')
      gradientRight.addColorStop(1, 'rgba(255, 50, 50, 0.5)')
      ctx.fillStyle = gradientRight
      ctx.fillRect(canvas.width - redZoneWidth, 0, redZoneWidth, canvas.height)
      
      // Красная обводка по краю карты
      ctx.strokeStyle = 'rgba(255, 50, 50, 0.8)'
      ctx.lineWidth = 4
      ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4)

      // Рисуем сетку координат как в Rust
      const gridSize = Math.floor(canvas.width / 15) // 15x15 сетка - меньше квадраты, больше их
      const gridCount = Math.ceil(canvas.width / gridSize)
      
      // Линии сетки
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)'
      ctx.lineWidth = 1
      
      for (let i = 0; i <= gridCount; i++) {
        const pos = i * gridSize
        // Вертикальные линии
        ctx.beginPath()
        ctx.moveTo(pos, 0)
        ctx.lineTo(pos, canvas.height)
        ctx.stroke()
        
        // Горизонтальные линии
        ctx.beginPath()
        ctx.moveTo(0, pos)
        ctx.lineTo(canvas.width, pos)
        ctx.stroke()
      }

      // Рисуем только онлайн игроков с валидными позициями
      mapData.players.forEach((player) => {
        // Пропускаем игроков без позиции или с невалидными координатами
        if (!player.position) return
        
        const { x, z } = player.position
        
        // Пропускаем игроков в центре карты (0,0,0) - невалидные позиции
        if (x === 0 && z === 0) return
        
        // Проверяем что игрок в пределах карты (не в море)
        const halfSize = worldSize / 2
        if (Math.abs(x) > halfSize || Math.abs(z) > halfSize) return
        
        const canvasX = (x + worldSize / 2) * mapScale
        const canvasY = (worldSize / 2 - z) * mapScale

        // Уменьшенный размер точек
        const baseDotSize = 8
        const dotSize = Math.max(baseDotSize, baseDotSize / scale)

        // Рисуем тень
        ctx.beginPath()
        ctx.arc(canvasX + 1, canvasY + 1, dotSize, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)'
        ctx.fill()

        // Рисуем точку игрока (желтый цвет для онлайн)
        ctx.beginPath()
        ctx.arc(canvasX, canvasY, dotSize, 0, Math.PI * 2)
        ctx.fillStyle = '#f3c366'
        ctx.fill()
        
        // Обводка - темно-коричневая
        ctx.strokeStyle = '#3b311f'
        ctx.lineWidth = Math.max(2, 3 / scale)
        ctx.stroke()
        
        // Внутренняя точка (маленькая)
        ctx.beginPath()
        ctx.arc(canvasX, canvasY, dotSize / 3, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
        ctx.fill()

        // Рисуем имя игрока
        if (scale >= 0.6) {
          const fontSize = Math.max(12, 14 / scale)
          ctx.font = `bold ${fontSize}px Arial, sans-serif`
          ctx.fillStyle = '#fff'
          ctx.strokeStyle = '#000'
          ctx.lineWidth = Math.max(3, 4 / scale)
          ctx.lineJoin = 'round'
          ctx.miterLimit = 2
          
          const textX = canvasX + dotSize + 6
          const textY = canvasY + 4
          
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
    
    if (!canvasRef.current || !containerRef.current) return
    
    const rect = containerRef.current.getBoundingClientRect()
    
    // Позиция курсора относительно viewport
    const mouseX = e.clientX
    const mouseY = e.clientY
    
    // Позиция курсора относительно контейнера
    const containerMouseX = mouseX - rect.left
    const containerMouseY = mouseY - rect.top
    
    // Позиция курсора в координатах канваса до зума
    const canvasMouseX = (containerMouseX - offset.x) / scale
    const canvasMouseY = (containerMouseY - offset.y) / scale
    
    const delta = e.deltaY > 0 ? 0.9 : 1.1
    const newScale = Math.max(0.1, Math.min(10, scale * delta))
    
    // Новая позиция offset чтобы курсор остался на том же месте (как в Figma)
    const newOffsetX = containerMouseX - canvasMouseX * newScale
    const newOffsetY = containerMouseY - canvasMouseY * newScale
    
    setScale(newScale)
    setOffset({ x: newOffsetX, y: newOffsetY })
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
    
    // Координаты игрока на канвасе
    const canvasX = (x + worldSize / 2) * mapScale
    const canvasY = (worldSize / 2 - z) * mapScale
    
    const targetScale = 2
    
    const containerWidth = window.innerWidth
    const containerHeight = window.innerHeight
    
    // Центрируем игрока на экране
    const offsetX = (containerWidth / 2) - (canvasX * targetScale)
    const offsetY = (containerHeight / 2) - (canvasY * targetScale)
    
    // Сначала устанавливаем зум, потом позицию
    setScale(targetScale)
    setTimeout(() => {
      setOffset({ x: offsetX, y: offsetY })
    }, 0)
    
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
      {/* Информация о сервере - компактный дизайн */}
      <div style={{
        position: 'absolute',
        top: 15,
        left: 15,
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '10px 15px',
        borderRadius: 8,
        color: '#fff',
        zIndex: 10,
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        fontSize: 13,
        display: 'flex',
        alignItems: 'center',
        gap: 12
      }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#84cc16" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 6v6l4 2"/>
        </svg>
        <div>
          <div style={{ fontWeight: 'bold', color: '#84cc16', marginBottom: 3 }}>
            {mapData?.serverName}
          </div>
          <div style={{ fontSize: 11, color: '#888' }}>
            Онлайн: <span style={{ color: '#4CAF50', fontWeight: 'bold' }}>{mapData?.online || 0}</span> • 
            Обновление: {nextUpdate}с
          </div>
        </div>
        <button
          onClick={() => setShowPlayerList(!showPlayerList)}
          style={{
            background: 'rgba(132, 204, 22, 0.2)',
            border: '1px solid #84cc16',
            color: '#84cc16',
            padding: '6px 12px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 11,
            fontWeight: 'bold',
            marginLeft: 8
          }}
        >
          {showPlayerList ? '✕' : '👥'}
        </button>
      </div>

      {/* Список игроков - компактный */}
      {showPlayerList && mapData && (
        <div style={{
          position: 'absolute',
          top: 70,
          left: 15,
          background: 'rgba(0, 0, 0, 0.85)',
          padding: '10px',
          borderRadius: 8,
          color: '#fff',
          zIndex: 10,
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          maxHeight: '60vh',
          overflowY: 'auto',
          minWidth: 200,
          maxWidth: 250
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: 8, fontSize: 12, color: '#888' }}>
            Онлайн ({mapData.players.filter(p => {
              if (!p.position) return false;
              const { x, z } = p.position;
              if (x === 0 && z === 0) return false;
              const halfSize = mapData.worldSize / 2;
              return Math.abs(x) <= halfSize && Math.abs(z) <= halfSize;
            }).length})
          </div>
          {mapData.players.filter(p => {
            if (!p.position) return false;
            const { x, z } = p.position;
            if (x === 0 && z === 0) return false;
            const halfSize = mapData.worldSize / 2;
            return Math.abs(x) <= halfSize && Math.abs(z) <= halfSize;
          }).map((player) => (
            <div
              key={player.steam_id}
              onClick={() => zoomToPlayer(player)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 8px',
                marginBottom: 4,
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: 6,
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
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#f3c366',
                border: '2px solid #3b311f',
                flexShrink: 0
              }} />
              {player.avatar && (
                <img 
                  src={player.avatar} 
                  alt="" 
                  style={{ 
                    width: 24, 
                    height: 24, 
                    borderRadius: '50%',
                    border: '1px solid #84cc16'
                  }}
                />
              )}
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {player.name}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Управление зумом - компактное */}
      <div style={{
        position: 'absolute',
        bottom: 15,
        right: 15,
        background: 'rgba(0, 0, 0, 0.7)',
        padding: '8px',
        borderRadius: 8,
        color: '#fff',
        zIndex: 10,
        backdropFilter: 'blur(10px)',
        display: 'flex',
        gap: 6,
        border: '1px solid rgba(255, 255, 255, 0.1)',
        alignItems: 'center'
      }}>
        <button
          onClick={() => {
            const newScale = Math.min(10, scale * 1.2)
            setScale(newScale)
          }}
          style={{
            background: 'rgba(132, 204, 22, 0.3)',
            border: '1px solid #84cc16',
            color: '#84cc16',
            padding: '6px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: 'bold',
            lineHeight: 1
          }}
        >
          +
        </button>
        <div style={{ 
          fontSize: 11, 
          color: '#888',
          fontWeight: 'bold',
          minWidth: 40,
          textAlign: 'center'
        }}>
          {Math.round(scale * 100)}%
        </div>
        <button
          onClick={() => { 
            setScale(1)
            setOffset({ x: 0, y: 0 })
          }}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            padding: '6px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 14,
            lineHeight: 1
          }}
          title="Сбросить"
        >
          ⟲
        </button>
        <button
          onClick={() => {
            const newScale = Math.max(0.1, scale * 0.8)
            setScale(newScale)
          }}
          style={{
            background: 'rgba(239, 68, 68, 0.3)',
            border: '1px solid #ef4444',
            color: '#ef4444',
            padding: '6px 10px',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 16,
            fontWeight: 'bold',
            lineHeight: 1
          }}
        >
          −
        </button>
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

      {/* Tooltip при наведении на игрока - компактный */}
      {hoveredPlayer && (
        <div style={{
          position: 'fixed',
          left: mousePos.x + 12,
          top: mousePos.y + 12,
          background: 'rgba(0, 0, 0, 0.9)',
          padding: '8px 12px',
          borderRadius: 6,
          color: '#fff',
          zIndex: 100,
          pointerEvents: 'none',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          fontSize: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {hoveredPlayer.avatar && (
              <img 
                src={hoveredPlayer.avatar} 
                alt="" 
                style={{ 
                  width: 28, 
                  height: 28, 
                  borderRadius: '50%',
                  border: '2px solid #84cc16'
                }}
              />
            )}
            <div>
              <div style={{ fontWeight: 'bold', fontSize: 13 }}>
                {hoveredPlayer.name}
              </div>
              {hoveredPlayer.team && (
                <div style={{ 
                  fontSize: 9, 
                  color: '#4CAF50',
                  marginTop: 2
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
