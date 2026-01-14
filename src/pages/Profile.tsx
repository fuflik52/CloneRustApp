import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

interface Server {
  id: string
  name: string
  hostname: string
  secretKey: string
  online: number
  maxPlayers: number
  status: string
  logo?: string
}

export default function Profile() {
  const [servers, setServers] = useState<Server[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [serverName, setServerName] = useState('')
  const [serverSlug, setServerSlug] = useState('')
  const [serverWebsite, setServerWebsite] = useState('')
  const [serverLogo, setServerLogo] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [errors, setErrors] = useState<{name?: string, slug?: string, website?: string}>({})
  const navigate = useNavigate()

  useEffect(() => {
    const fetchServers = async () => {
      try {
        const res = await fetch('/api/servers')
        if (res.ok) {
          const data = await res.json()
          setServers(data)
        }
      } catch {}
    }
    fetchServers()
  }, [])

  const handleServerClick = (server: Server) => {
    // Создаём slug из имени сервера
    const slug = server.name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    localStorage.setItem('selectedServer', server.id)
    navigate(`/${slug}/welcome`)
  }

  const handleCreateServer = async () => {
    // Валидация
    const newErrors: {name?: string, slug?: string, website?: string} = {}
    
    if (!serverName.trim() || serverName.length < 6 || serverName.length > 32) {
      newErrors.name = 'Длина от 6 до 32 символов'
    }
    
    if (!serverSlug.trim() || !/^[a-z0-9-]+$/.test(serverSlug)) {
      newErrors.slug = 'Только строчные латинские буквы'
    }
    
    if (serverWebsite && !serverWebsite.startsWith('http')) {
      newErrors.website = 'Должно быть ссылкой'
    }
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }
    
    setCreating(true)
    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: serverName, slug: serverSlug, website: serverWebsite, logo: serverLogo })
      })
      if (res.ok) {
        const newServer = await res.json()
        setServers([...servers, newServer])
        closeModal()
        navigate(`/${serverSlug}/welcome`)
      } else {
        const err = await res.json()
        alert(err.error || 'Ошибка создания проекта')
      }
    } catch (e) {
      console.error('Create server error:', e)
      alert('Ошибка создания проекта')
    }
    setCreating(false)
  }

  const closeModal = () => {
    setShowCreateModal(false)
    setServerName('')
    setServerSlug('')
    setServerWebsite('')
    setServerLogo(null)
    setErrors({})
  }

  const handleNameChange = (value: string) => {
    setServerName(value)
    setErrors({})
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert('Файл слишком большой (макс 10MB)')
        return
      }
      const reader = new FileReader()
      reader.onload = () => {
        setServerLogo(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  // Генерируем slug для отображения
  const getSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')

  return (
    <div className="profile-page">
      <div className="profile-container">
        <div className="profile-header">
          <div className="profile-avatar">
            <img src="https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg" alt="" />
          </div>
          <p className="profile-name">Admin</p>
          <span className="profile-username">@admin</span>
        </div>

        <div className="profile-content">
          <div className="profile-projects">
            {servers.length === 0 ? (
              <div className="profile-empty">
                <p>Нет проектов</p>
                <span>Создайте свой первый проект</span>
              </div>
            ) : (
              servers.map(server => (
                <div key={server.id} className="profile-project" onClick={() => handleServerClick(server)}>
                  <div className="project-info">
                    <div className="project-logo">
                      {server.logo ? (
                        <img src={server.logo} alt="" />
                      ) : (
                        <DefaultProjectIcon />
                      )}
                    </div>
                    <div className="project-details">
                      <p className="project-name">{server.name}</p>
                      <p className="project-url">app.bublickrust.ru/{getSlug(server.name)}</p>
                    </div>
                  </div>
                  <ArrowIcon />
                </div>
              ))
            )}
          </div>

          <div className="profile-buttons">
            <button className="profile-btn primary" onClick={() => setShowCreateModal(true)}>
              <PlusIcon />
              <p>Создать новый проект</p>
            </button>
            <button className="profile-btn">
              <SettingsIcon />
              <p>Настройки аккаунта</p>
            </button>
            <button className="profile-btn">
              <LogoutIcon />
              <p>Выйти с аккаунта</p>
            </button>
          </div>
        </div>
      </div>

      {/* Модальное окно создания проекта */}
      {showCreateModal ? (
        <div className="create-modal-overlay" onClick={closeModal}>
          <div className="create-modal" onClick={e => e.stopPropagation()}>
            <div className="create-modal-header">
              <span>Новый проект</span>
            </div>
            
            <div className="create-modal-content">
              {/* Название проекта */}
              <div className="create-input-group">
                <label>Название проекта</label>
                <input 
                  type="text"
                  placeholder="Null Rust"
                  value={serverName}
                  onChange={e => handleNameChange(e.target.value)}
                  className={errors.name ? 'error' : ''}
                />
                {errors.name && <span className="input-error">{errors.name}</span>}
              </div>

              {/* Ссылка */}
              <div className="create-input-group">
                <label>Ссылка</label>
                <div className="input-with-prefix">
                  <span className="prefix">app.bublickrust.ru/</span>
                  <input 
                    type="text"
                    placeholder="nullrust"
                    value={serverSlug}
                    onChange={e => { setServerSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')); setErrors({}) }}
                    className={errors.slug ? 'error' : ''}
                  />
                </div>
                {errors.slug && <span className="input-error">{errors.slug}</span>}
              </div>

              {/* Сайт проекта */}
              <div className="create-input-group">
                <label>Сайт проекта</label>
                <input 
                  type="text"
                  placeholder="https://nullrust.com"
                  value={serverWebsite}
                  onChange={e => { setServerWebsite(e.target.value); setErrors({}) }}
                  className={errors.website ? 'error' : ''}
                />
                {errors.website && <span className="input-error">{errors.website}</span>}
              </div>

              {/* Загрузка логотипа */}
              <div className="upload-logo-area" onClick={() => document.getElementById('logo-input')?.click()}>
                <div className="upload-preview">
                  {serverLogo ? (
                    <img src={serverLogo} alt="" />
                  ) : (
                    <CameraIcon />
                  )}
                </div>
                <div className="upload-text">
                  <p className="upload-title">Загрузите логотип проекта</p>
                  <span className="upload-subtitle">PNG, JPEG или GIF (не более 10MB)</span>
                </div>
                <input 
                  type="file" 
                  id="logo-input"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  style={{ display: 'none' }}
                />
              </div>
            </div>

            <div className="create-modal-footer">
              <button className="btn-cancel" onClick={closeModal}>Закрыть</button>
              <button 
                className="btn-create" 
                onClick={handleCreateServer}
                disabled={creating}
              >
                {creating ? 'Создание...' : 'Создать'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function DefaultProjectIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="arrow-icon">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.29289 7.29289C9.68342 6.90237 10.3166 6.90237 10.7071 7.29289L14.1768 10.7626C14.8602 11.446 14.8602 12.554 14.1768 13.2374L10.7071 16.7071C10.3166 17.0976 9.68342 17.0976 9.29289 16.7071C8.90237 16.3166 8.90237 15.6834 9.29289 15.2929L12.5858 12L9.29289 8.70711C8.90237 8.31658 8.90237 7.68342 9.29289 7.29289Z"/>
    </svg>
  )
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16 12.9999C16.5523 12.9999 17 12.5522 17 11.9999C17 11.4476 16.5523 10.9999 16 10.9999L13 11V8.00012C13 7.44784 12.5523 7.00012 12 7.00012C11.4477 7.00012 11 7.44784 11 8.00012V11L7.99997 11.0001C7.44769 11.0001 6.99998 11.4479 7 12.0001C7.00002 12.5524 7.44774 13.0001 8.00003 13.0001L11 13V16C11 16.5523 11.4477 17 12 17C12.5523 17 13 16.5523 13 16V13L16 12.9999Z"/>
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.99618 2.86888C10.3581 2.32605 10.9673 2 11.6197 2H12.3803C13.0327 2 13.6419 2.32605 14.0038 2.86888L15.145 4.58067L16.894 4.17706C17.5495 4.02578 18.2367 4.22288 18.7125 4.69859L19.3014 5.28754C19.7771 5.76326 19.9742 6.45048 19.8229 7.10601L19.4193 8.85498L21.1311 9.99618C21.674 10.3581 22 10.9673 22 11.6197V12.3803C22 13.0327 21.674 13.6419 21.1311 14.0038L19.4193 15.145L19.8229 16.894C19.9742 17.5495 19.7771 18.2367 19.3014 18.7125L18.7125 19.3014C18.2367 19.7771 17.5495 19.9742 16.894 19.8229L15.145 19.4193L14.0038 21.1311C13.6419 21.674 13.0327 22 12.3803 22H11.6197C10.9673 22 10.3581 21.674 9.99618 21.1311L8.85498 19.4193L7.10601 19.8229C6.45048 19.9742 5.76326 19.7771 5.28754 19.3014L4.69859 18.7125C4.22288 18.2367 4.02578 17.5495 4.17706 16.894L4.58067 15.145L2.86888 14.0038C2.32605 13.6419 2 13.0327 2 12.3803V11.6197C2 10.9673 2.32605 10.3581 2.86888 9.99618L4.58067 8.85498L4.17706 7.10601C4.02578 6.45048 4.22288 5.76326 4.69859 5.28754L5.28754 4.69859C5.76326 4.22288 6.45048 4.02578 7.10601 4.17706L8.85498 4.58067L9.99618 2.86888ZM8.5 12C8.5 10.067 10.067 8.5 12 8.5C13.933 8.5 15.5 10.067 15.5 12C15.5 13.933 13.933 15.5 12 15.5C10.067 15.5 8.5 13.933 8.5 12Z"/>
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" clipRule="evenodd" d="M3 5C3 3.89543 3.89543 3 5 3L11.25 3C11.8023 3 12.25 3.44772 12.25 4C12.25 4.55229 11.8023 5 11.25 5L5 5L5 19H11.25C11.8023 19 12.25 19.4477 12.25 20C12.25 20.5523 11.8023 21 11.25 21H5C3.89543 21 3 20.1046 3 19L3 5ZM14.7929 6.79289C15.1834 6.40237 15.8166 6.40237 16.2071 6.79289L20.7071 11.2929C21.0976 11.6834 21.0976 12.3166 20.7071 12.7071L16.2071 17.2071C15.8166 17.5976 15.1834 17.5976 14.7929 17.2071C14.4024 16.8166 14.4024 16.1834 14.7929 15.7929L17.5858 13L8.75 13C8.19772 13 7.75 12.5523 7.75 12C7.75 11.4477 8.19772 11 8.75 11L17.5858 11L14.7929 8.20711C14.4024 7.81658 14.4024 7.18342 14.7929 6.79289Z"/>
    </svg>
  )
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 49 49" fill="currentColor">
      <path d="M29.0711 6.08691C31.0111 6.10689 32.5911 7.10578 33.5111 8.90378C33.7486 9.37826 34.0798 10.0712 34.4267 10.8023L34.8455 11.6862L35.0511 12.1202L35.2511 12.5597C35.3311 12.6996 35.4711 12.7995 35.6511 12.7995C40.4511 12.7995 44.3711 16.7151 44.3711 21.5098V33.3766C44.3711 38.1713 40.4511 42.0869 35.6511 42.0869H13.0911C8.27109 42.0869 4.37109 38.1713 4.37109 33.3766V21.5098C4.37109 16.7151 8.27109 12.7995 13.0911 12.7995C13.2511 12.7995 13.4111 12.7195 13.4711 12.5597L13.5911 12.32C14.1511 11.1413 14.8311 9.7029 15.2311 8.90378C16.1511 7.10578 17.7111 6.10689 19.6511 6.08691H29.0711ZM24.3711 18.8927C22.2711 18.8927 20.2911 19.7118 18.7911 21.2101C17.3111 22.7084 16.4911 24.6663 16.5111 26.744C16.5111 28.8416 17.3311 30.7995 18.8111 32.2978C20.3111 33.7761 22.2711 34.5952 24.3711 34.5952C26.5311 34.5952 28.4911 33.7162 29.9111 32.2978C31.3311 30.8794 32.2111 28.9215 32.2311 26.744C32.2311 24.6663 31.4111 22.6885 29.9311 21.1901C28.4511 19.7118 26.4711 18.8927 24.3711 18.8927ZM24.3711 21.8894C25.6711 21.8894 26.8911 22.3888 27.8111 23.3078C28.7311 24.2268 29.2311 25.4454 29.2311 26.744C29.2111 29.421 27.0511 31.5986 24.3711 31.5986C23.0711 31.5986 21.8511 31.0991 20.9311 30.1801C20.0111 29.2612 19.5111 28.0425 19.5111 26.744V26.724C19.4911 25.4654 19.9911 24.2467 20.9111 23.3278C21.8511 22.3888 23.0711 21.8894 24.3711 21.8894ZM35.5911 18.4132C34.5911 18.4132 33.7911 19.2323 33.7911 20.2312C33.7911 21.2301 34.5911 22.0292 35.5911 22.0292C36.5911 22.0292 37.4111 21.2301 37.4111 20.2312C37.4111 19.2323 36.5911 18.4132 35.5911 18.4132Z"/>
    </svg>
  )
}


