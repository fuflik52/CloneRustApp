import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { allItems } from '../data/menuItems'
import { getIcon } from './icons/MenuIcons'

interface SearchModalProps {
  open: boolean
  onClose: () => void
}

interface SearchResult {
  type: 'page' | 'player'
  id: string
  name: string
  subtitle?: string
  icon?: string
  avatar?: string
  online?: boolean
  url: string
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  // Поиск по всему
  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    const q = query.toLowerCase()
    const combined: SearchResult[] = []

    // Поиск по разделам меню (синхронно)
    const pages = allItems.filter(item => 
      item.name.toLowerCase().includes(q)
    ).map(item => ({
      type: 'page' as const,
      id: item.slug,
      name: item.name,
      subtitle: 'Раздел',
      icon: item.icon,
      url: `/${item.slug}`
    }))
    combined.push(...pages)

    // Сразу показываем страницы
    setResults(combined)

    // Поиск по игрокам через API (асинхронно)
    const searchPlayers = async () => {
      setLoading(true)
      try {
        // Ищем по всей базе игроков
        const res = await fetch(`/api/players/search?q=${encodeURIComponent(q)}`)
        if (res.ok) {
          const players = await res.json()
          const filtered = players.slice(0, 5).map((p: any) => ({
            type: 'player' as const,
            id: p.steam_id,
            name: p.steam_name || p.name,
            subtitle: p.country ? `${p.country}` : 'Игрок',
            avatar: p.avatar,
            online: false,
            url: `/secret-db-panel?player=${p.steam_id}`
          }))
          setResults(prev => [...prev.filter(r => r.type === 'page'), ...filtered].slice(0, 10))
        }
      } catch {}
      setLoading(false)
    }

    const debounce = setTimeout(searchPlayers, 200)
    return () => clearTimeout(debounce)
  }, [query])

  const handleSelect = useCallback((result: SearchResult) => {
    navigate(result.url)
    onClose()
    setQuery('')
  }, [navigate, onClose])

  useEffect(() => {
    if (!open) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(prev => Math.min(prev + 1, results.length - 1))
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(prev => Math.max(prev - 1, 0))
      }
      if (e.key === 'Enter' && results[selectedIndex]) {
        handleSelect(results[selectedIndex])
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, results, selectedIndex, handleSelect])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  useEffect(() => {
    if (!open) {
      setQuery('')
      setResults([])
    }
  }, [open])

  if (!open) return null

  return (
    <div className={`search-modal-overlay ${open ? 'active' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="search-modal">
        <div className="search-input-box">
          <svg className="modal-search-icon" viewBox="0 0 24 24" fill="none">
            <path d="M20 20L16.05 16.05M18 11C18 14.866 14.866 18 11 18C7.13401 18 4 14.866 4 11C4 7.13401 7.13401 4 11 4C14.866 4 18 7.13401 18 11Z" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Поиск по разделам и игрокам..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoFocus
          />
        </div>
        
        <div className="search-results">
          {loading && (
            <div className="search-loading">
              <div className="loader">
                <div className="line"></div><div className="line"></div><div className="line"></div>
                <div className="line"></div><div className="line"></div><div className="line"></div>
                <div className="line"></div><div className="line"></div><div className="line"></div>
                <div className="line"></div><div className="line"></div><div className="line"></div>
              </div>
              <span>Поиск...</span>
            </div>
          )}
          
          {!loading && query.trim() && results.length === 0 && (
            <div className="search-empty">
              <span>Ничего не найдено</span>
            </div>
          )}
          
          {!loading && results.map((result, i) => (
            <div
              key={`${result.type}-${result.id}`}
              className={`search-result-item ${i === selectedIndex ? 'selected' : ''}`}
              onClick={() => handleSelect(result)}
            >
              {result.type === 'player' ? (
                <>
                  <img src={result.avatar || 'https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" className="search-result-avatar" />
                  <div className="search-result-info">
                    <span className="search-result-name">{result.name}</span>
                    <span className="search-result-meta">{result.subtitle}</span>
                  </div>
                  <div className={`search-result-status ${result.online ? 'online' : ''}`} />
                </>
              ) : (
                <>
                  {result.icon && getIcon(result.icon)}
                  <div className="search-result-info">
                    <span className="search-result-name">{result.name}</span>
                    <span className="search-result-meta">{result.subtitle}</span>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
        
        <div className="search-footer">
          <div className="kbd"><span className="kbd-key">↓</span><span className="kbd-key">↑</span><span className="kbd-text">перемещаться</span></div>
          <div className="kbd"><span className="kbd-key">ENTR</span><span className="kbd-text">выбрать</span></div>
          <div className="kbd ml-auto"><span className="kbd-key">ESC</span><span className="kbd-text">закрыть</span></div>
        </div>
      </div>
    </div>
  )
}
