import { Routes, Route, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import SearchModal from './components/SearchModal'
import { ToastProvider, useToast } from './components/Toast'
import Welcome from './pages/Welcome'
import Players from './pages/Players'
import Chat from './pages/Chat'
import Reports from './pages/Reports'
import Checks from './pages/Checks'
import Signs from './pages/Signs'
import Alerts from './pages/Alerts'
import SleepingBags from './pages/SleepingBags'
import Mutes from './pages/Mutes'
import Bans from './pages/Bans'
import Statistics from './pages/Statistics'
import Servers from './pages/Servers'
import Audit from './pages/Audit'
import Staff from './pages/Staff'
import Database from './pages/Database'
import Profile from './pages/Profile'
import Settings from './pages/Settings'
import { useState, useEffect, createContext, useContext } from 'react'

// Контекст для текущего сервера
interface ServerContextType {
  serverSlug: string | null
  serverName: string | null
  serverId: string | null
}

const ServerContext = createContext<ServerContextType>({ serverSlug: null, serverName: null, serverId: null })
export const useServer = () => useContext(ServerContext)

// Компонент с сайдбаром для страниц проекта
function ProjectLayout() {
  const { serverSlug } = useParams()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => 
    localStorage.getItem('sidebarCollapsed') === 'true'
  )
  const [serverName, setServerName] = useState<string | null>(null)
  const [serverLogo, setServerLogo] = useState<string | null>(null)
  const [serverId, setServerId] = useState<string | null>(null)
  const [serverNotFound, setServerNotFound] = useState(false)
  const { showToast } = useToast()

  // Загружаем имя сервера
  useEffect(() => {
    const fetchServer = async () => {
      try {
        const res = await fetch('/api/servers')
        if (res.ok) {
          const servers = await res.json()
          const server = servers.find((s: any) => 
            s.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') === serverSlug ||
            s.slug === serverSlug ||
            s.id === serverSlug
          )
          if (server) {
            setServerName(server.name)
            setServerLogo(server.logo || null)
            setServerId(server.id)
            setServerNotFound(false)
          } else {
            setServerNotFound(true)
          }
        }
      } catch {}
    }
    if (serverSlug) fetchServer()
  }, [serverSlug])

  // Редирект если проект не найден
  useEffect(() => {
    if (serverNotFound) {
      showToast('Проект не найден', 'error')
      navigate('/profile')
    }
  }, [serverNotFound, navigate, showToast])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') {
        setSearchOpen(false)
        setMobileMenuOpen(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [])

  useEffect(() => {
    (window as any).addPlayers = async () => {
      try {
        const res = await fetch('/api/test-players', { method: 'POST' })
        if (res.ok) {
          const data = await res.json()
          showToast(`Добавлено ${data.count} тестовых игроков`)
        }
      } catch {
        showToast('Ошибка при добавлении игроков', 'error')
      }
    };
    (window as any).removePlayers = async () => {
      try {
        const res = await fetch('/api/test-players', { method: 'DELETE' })
        if (res.ok) {
          showToast('Тестовые игроки удалены')
        }
      } catch {
        showToast('Ошибка при удалении игроков', 'error')
      }
    };
    return () => {
      delete (window as any).addPlayers
      delete (window as any).removePlayers
    }
  }, [showToast])

  const toggleSidebar = () => {
    setCollapsed(prev => {
      localStorage.setItem('sidebarCollapsed', String(!prev))
      return !prev
    })
  }

  const closeMobileMenu = () => setMobileMenuOpen(false)

  return (
    <ServerContext.Provider value={{ serverSlug: serverSlug || null, serverName, serverId }}>
      <header className="mobile-header">
        <button className="mobile-menu-btn" onClick={() => setMobileMenuOpen(true)}>
          <svg viewBox="0 0 24 24"><path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/></svg>
        </button>
        <div className="mobile-logo">
          <img src="https://s3.rustapp.io/avatar-project/1755276829361-35f5b20e8642407589c95dc2.png" alt="Logo" />
          <span>{serverName || 'PAN RUST'}</span>
        </div>
        <button className="mobile-menu-btn" onClick={() => setSearchOpen(true)}>
          <svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
        </button>
      </header>

      <div className={`mobile-overlay ${mobileMenuOpen ? 'active' : ''}`} onClick={closeMobileMenu} />

      <Sidebar 
        collapsed={collapsed} 
        onToggle={toggleSidebar}
        onSearchClick={() => setSearchOpen(true)}
        mobileOpen={mobileMenuOpen}
        onMobileClose={closeMobileMenu}
        serverSlug={serverSlug}
        serverName={serverName}
        serverLogo={serverLogo}
      />
      <main className={`main-content ${collapsed ? 'collapsed' : ''}`}>
        <Routes>
          <Route path="welcome" element={<Welcome />} />
          <Route path="players" element={<Players />} />
          <Route path="chat" element={<Chat />} />
          <Route path="reports" element={<Reports />} />
          <Route path="checks" element={<Checks />} />
          <Route path="signs" element={<Signs />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="sleepingbags" element={<SleepingBags />} />
          <Route path="mutes" element={<Mutes />} />
          <Route path="bans" element={<Bans />} />
          <Route path="statistics" element={<Statistics />} />
          <Route path="servers" element={<Servers />} />
          <Route path="audit" element={<Audit />} />
          <Route path="staff" element={<Staff />} />
          <Route path="secret-db-panel" element={<Database />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="welcome" replace />} />
        </Routes>
      </main>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </ServerContext.Provider>
  )
}

function AppContent() {
  const location = useLocation()
  
  // Проверяем есть ли сохранённый сервер
  useEffect(() => {
    const savedServer = localStorage.getItem('selectedServer')
    if (location.pathname === '/' && savedServer) {
      // Редирект на последний выбранный сервер
    }
  }, [location])

  return (
    <Routes>
      {/* Страница профиля без сайдбара */}
      <Route path="/profile" element={<Profile />} />
      
      {/* Редирект с корня на профиль */}
      <Route path="/" element={<Navigate to="/profile" replace />} />
      
      {/* Все страницы проекта с сайдбаром */}
      <Route path="/:serverSlug/*" element={<ProjectLayout />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
