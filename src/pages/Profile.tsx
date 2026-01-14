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
    navigate(`/servers?server=${server.id}`)
  }

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
                <p>Нет подключенных серверов</p>
                <span>Добавьте сервер на странице "Сервера"</span>
              </div>
            ) : (
              servers.map(server => (
                <div key={server.id} className="profile-project" onClick={() => handleServerClick(server)}>
                  <div className="project-info">
                    <div className="project-logo">
                      {server.logo ? (
                        <img src={server.logo} alt="" />
                      ) : (
                        <ServerIcon />
                      )}
                    </div>
                    <div className="project-details">
                      <p className="project-name">{server.name}</p>
                      <p className="project-url">app.bublickrust.ru/{server.name.toLowerCase().replace(/\s+/g, '')}</p>
                    </div>
                  </div>
                  <ArrowIcon />
                </div>
              ))
            )}
          </div>

          <div className="profile-buttons">
            <button className="profile-btn primary" onClick={() => navigate('/servers')}>
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
    </div>
  )
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path d="M4 1h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2m0 6h16V3H4v4m0 8h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2m0 6h16v-4H4v4M9 5h2v2H9V5m0 10h2v2H9v-2M5 5h2v2H5V5m0 10h2v2H5v-2z"/>
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
