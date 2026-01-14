import { Routes, Route, Navigate } from 'react-router-dom'
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
import { useState, useEffect } from 'react'

function AppContent() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => 
    localStorage.getItem('sidebarCollapsed') === 'true'
  )
  const { showToast } = useToast()

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F' || e.code === 'KeyF')) {
        e.preventDefault()
        e.stopImmediatePropagation()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true })
  }, [])

  // Консольные команды для тестовых игроков
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
    
    console.log('%c🎮 Консольные команды:', 'color: #84cc16; font-weight: bold')
    console.log('%c  addPlayers()    - добавить тестовых игроков', 'color: #888')
    console.log('%c  removePlayers() - удалить тестовых игроков', 'color: #888')
    
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

  return (
    <>
      <Sidebar 
        collapsed={collapsed} 
        onToggle={toggleSidebar}
        onSearchClick={() => setSearchOpen(true)}
      />
      <main className={`main-content ${collapsed ? 'collapsed' : ''}`}>
        <Routes>
          <Route path="/" element={<Navigate to="/welcome" replace />} />
          <Route path="/welcome" element={<Welcome />} />
          <Route path="/players" element={<Players />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/checks" element={<Checks />} />
          <Route path="/signs" element={<Signs />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/sleepingbags" element={<SleepingBags />} />
          <Route path="/mutes" element={<Mutes />} />
          <Route path="/bans" element={<Bans />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/servers" element={<Servers />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/staff" element={<Staff />} />
        </Routes>
      </main>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  )
}
