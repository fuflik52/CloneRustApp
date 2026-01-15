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

  useEffect(() => {
    if (!serverId) return

    const fetchMap = async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/map`)
        if (res.ok) {
          const data = await res.json()
          setMapData(data)
          setError('')
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
    const interval = setInterval(fetchMap, 5000) // Обновление каждые 5 секунд

    return () => clearInterval(interval)
  }, [serverId])

  useEffect(() => {
    if (!mapData || !canvasRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Загружаем изображение карты
    const img = new Image()
    img.crossOrigin = 'anonymous'
    
    img.onload = () => {
      // Устанавливаем размер canvas
      canvas.width = img.width
      canvas.height = img.height

      // Очищаем canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Рисуем карту
      ctx.drawImage(img, 0, 0)

      // Рисуем игроков
      const worldSize = mapData.worldSize
      const mapScale = canvas.width / worldSize

      mapData.players.forEach(player => {
        const { x, z } = player.position
        
        // Конвертируем мировые координаты в координаты canvas
        const canvasX = (x + worldSize / 2) * mapScale
        const canvasY = (worldSize / 2 - z) * mapScale

        // Размер точки зависит от зума
        const dotSize = Math.max(6, 8 / scale)

        // Рисуем точку игрока
        ctx.beginPath()
        ctx.arc(canvasX, canvasY, dotSize, 0, Math.PI * 2)
        ctx.fillStyle = player.team ? '#4CAF50' : '#FF5252'
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = Math.max(1.5, 2 / scale)
        ctx.stroke()

        // Рисуем имя игрока (только если зум достаточно большой)
        if (scale >= 0.8) {
          const fontSize = Math.max(10, 12 / scale)
          ctx.font = `bold ${fontSize}px Arial`
          ctx.fillStyle = '#fff'
          ctx.strokeStyle = '#000'
          ctx.lineWidth = Math.max(2, 3 / scale)
          ctx.strokeText(player.name, canvasX + dotSize + 4, canvasY + 4)
          ctx.fillText(player.name, canvasX + dotSize + 4, canvasY + 4)
        }
      })
    }

    img.onerror = () => {
      setError('Не удалось загрузить изображение карты')
    }

    if (mapData.mapUrl) {
      img.src = mapData.mapUrl
    } else {
      // Если нет URL карты, рисуем заглушку
      ctx.fillStyle = '#1a1a1a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#666'
      ctx.font = '24px Arial'
      ctx.textAlign = 'center'
      ctx.fillText('Карта недоступна', canvas.width / 2, canvas.height / 2)
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

    // Проверяем, наведен ли курсор на игрока
    let found = false
    for (const player of mapData.players) {
      const { x, z } = player.position
      const canvasX = (x + worldSize / 2) * mapScale
      const canvasY = (worldSize / 2 - z) * mapScale

      const distance = Math.sqrt((mouseX - canvasX) ** 2 + (mouseY - canvasY) ** 2)
      if (distance < 10) {
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
        background: '#0a0a0a',
        color: '#fff'
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
        background: '#0a0a0a',
        color: '#ff5252'
      }}>
        <div>{error}</div>
      </div>
    )
  }

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      background: '#0a0a0a',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* Информация о сервере */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        background: 'rgba(0, 0, 0, 0.8)',
        padding: '15px 20px',
        borderRadius: 8,
        color: '#fff',
        zIndex: 10,
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 5 }}>
          {mapData?.serverName}
        </div>
        <div style={{ fontSize: 14, color: '#aaa' }}>
          Игроков онлайн: {mapData?.online || 0}
        </div>
      </div>

      {/* Легенда */}
      <div style={{
        position: 'absolute',
        top: 20,
        right: 20,
        background: 'rgba(0, 0, 0, 0.8)',
        padding: '15px 20px',
        borderRadius: 8,
        color: '#fff',
        zIndex: 10,
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ marginBottom: 10, fontWeight: 'bold' }}>Легенда:</div>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 5 }}>
          <div style={{ 
            width: 12, 
            height: 12, 
            borderRadius: '50%', 
            background: '#4CAF50',
            marginRight: 8,
            border: '2px solid #fff'
          }} />
          <span>В команде</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{ 
            width: 12, 
            height: 12, 
            borderRadius: '50%', 
            background: '#FF5252',
            marginRight: 8,
            border: '2px solid #fff'
          }} />
          <span>Соло</span>
        </div>
      </div>

      {/* Управление зумом */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        background: 'rgba(0, 0, 0, 0.8)',
        padding: '10px',
        borderRadius: 8,
        color: '#fff',
        zIndex: 10,
        backdropFilter: 'blur(10px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8
      }}>
        <button
          onClick={() => setScale(Math.min(3, scale * 1.2))}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 18,
            fontWeight: 'bold'
          }}
        >
          +
        </button>
        <button
          onClick={() => { setScale(1); setOffset({ x: 0, y: 0 }) }}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 12
          }}
        >
          ⟲
        </button>
        <button
          onClick={() => setScale(Math.max(0.5, scale * 0.8))}
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            color: '#fff',
            padding: '8px 12px',
            borderRadius: 4,
            cursor: 'pointer',
            fontSize: 18,
            fontWeight: 'bold'
          }}
        >
          −
        </button>
        <div style={{ 
          textAlign: 'center', 
          fontSize: 12, 
          marginTop: 4,
          color: '#aaa'
        }}>
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* Карта */}
      <div 
        ref={containerRef}
        onWheel={handleWheel}
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
          cursor: isDragging ? 'grabbing' : 'grab'
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            maxWidth: '95%',
            maxHeight: '95%',
            boxShadow: '0 0 50px rgba(0, 0, 0, 0.5)',
            transform: `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
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
          padding: '10px 15px',
          borderRadius: 8,
          color: '#fff',
          zIndex: 100,
          pointerEvents: 'none',
          backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {hoveredPlayer.avatar && (
              <img 
                src={hoveredPlayer.avatar} 
                alt="" 
                style={{ width: 32, height: 32, borderRadius: '50%' }}
              />
            )}
            <div>
              <div style={{ fontWeight: 'bold' }}>{hoveredPlayer.name}</div>
              <div style={{ fontSize: 12, color: '#aaa' }}>
                {hoveredPlayer.steam_id}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
