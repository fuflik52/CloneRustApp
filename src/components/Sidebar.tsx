import { NavLink, useLocation } from 'react-router-dom'
import { moderationItems, managementItems, projectItems } from '../data/menuItems'
import { getIcon } from './icons/MenuIcons'

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
  onSearchClick: () => void
  mobileOpen?: boolean
  onMobileClose?: () => void
  serverSlug?: string
  serverName?: string | null
}

export default function Sidebar({ collapsed, onToggle, onSearchClick, mobileOpen, onMobileClose, serverSlug, serverName }: SidebarProps) {
  const location = useLocation()
  const basePath = serverSlug ? `/${serverSlug}` : ''

  const handleNavClick = () => {
    if (onMobileClose) onMobileClose()
  }

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="header">
        <NavLink to="/profile" className="logo-wrapper">
          <img className="avatar" src="https://s3.rustapp.io/avatar-project/1755276829361-35f5b20e8642407589c95dc2.png" alt="" />
          <span className="logo-text">{serverName || 'PAN RUST'}</span>
        </NavLink>
        <div className="nav-btn" onClick={onToggle}>
          <svg viewBox="0 0 19 19" fill="none">
            <path d="M3.16602 4.74984C3.16602 3.87539 3.8749 3.1665 4.74935 3.1665H14.2493C15.1238 3.1665 15.8327 3.87539 15.8327 4.74984V14.2498C15.8327 15.1243 15.1238 15.8332 14.2493 15.8332H4.74935C3.8749 15.8332 3.16602 15.1243 3.16602 14.2498V4.74984Z" strokeWidth="1.58333" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M7.125 3.1665V15.8332" strokeWidth="1.58333" />
            <path d="M12.2708 7.9165L10.6875 9.49984L12.2708 11.0832" strokeWidth="1.58333" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>

      <div className="search-box" onClick={onSearchClick}>
        <div className="search-left">
          <svg className="search-icon" viewBox="0 0 24 24" fill="none">
            <path d="M20 20L16.05 16.05M18 11C18 14.866 14.866 18 11 18C7.13401 18 4 14.866 4 11C4 7.13401 7.13401 4 11 4C14.866 4 18 7.13401 18 11Z" strokeLinecap="round" />
          </svg>
          <span className="search-text">Поиск...</span>
        </div>
        <div className="search-hotkeys">
          <div className="hot-key">ctrl</div>
          <span className="plus">+</span>
          <div className="hot-key">f</div>
        </div>
      </div>

      <NavLink 
        to={`${basePath}/welcome`}
        className={`early-access ${location.pathname.endsWith('/welcome') ? 'active' : ''}`}
        onClick={handleNavClick}
      >
        <svg className="info-icon" viewBox="0 0 16 16">
          <path fillRule="evenodd" clipRule="evenodd" d="M8.0026 1.33594C4.32071 1.33594 1.33594 4.32071 1.33594 8.0026C1.33594 11.6845 4.32071 14.6693 8.0026 14.6693C11.6845 14.6693 14.6693 11.6845 14.6693 8.0026C14.6693 4.32071 11.6845 1.33594 8.0026 1.33594ZM6.66927 7.33594C6.66927 6.96775 6.96775 6.66927 7.33594 6.66927H8.0026C8.37079 6.66927 8.66927 6.96775 8.66927 7.33594V10.6693C8.66927 11.0375 8.37079 11.3359 8.0026 11.3359C7.63441 11.3359 7.33594 11.0375 7.33594 10.6693V8.0026C6.96775 8.0026 6.66927 7.70413 6.66927 7.33594ZM8.0026 4.66927C7.63441 4.66927 7.33594 4.96775 7.33594 5.33594C7.33594 5.70413 7.63441 6.0026 8.0026 6.0026C8.37079 6.0026 8.66927 5.70413 8.66927 5.33594C8.66927 4.96775 8.37079 4.66927 8.0026 4.66927Z" />
        </svg>
        <span className="early-access-text">Ранний доступ</span>
      </NavLink>

      <MenuSection title="Модерация" items={moderationItems} collapsed={collapsed} onNavClick={handleNavClick} basePath={basePath} />
      <MenuSection title="Управление" items={managementItems} collapsed={collapsed} onNavClick={handleNavClick} basePath={basePath} />
      <MenuSection title="Проект" items={projectItems} collapsed={collapsed} onNavClick={handleNavClick} basePath={basePath} />

      <div className="sidebar-footer">
        <NavLink 
          to="/profile" 
          className="profile-link"
          onClick={handleNavClick}
        >
          <div className="profile-avatar-small">
            <img src="https://avatars.cloudflare.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg" alt="" />
          </div>
          <span className="profile-link-text">Профиль</span>
        </NavLink>
      </div>
    </aside>
  )
}

interface MenuSectionProps {
  title: string
  items: { name: string; slug: string; icon: string }[]
  collapsed: boolean
  onNavClick?: () => void
  basePath: string
}

function MenuSection({ title, items, collapsed, onNavClick, basePath }: MenuSectionProps) {
  return (
    <div className="menu-section">
      <div className="section-header">
        <span className="section-title">{title}</span>
        <svg className="arrow-icon open" viewBox="0 0 24 24">
          <path fillRule="evenodd" clipRule="evenodd" d="M9.29289 7.29289C9.68342 6.90237 10.3166 6.90237 10.7071 7.29289L14.1768 10.7626C14.8602 11.446 14.8602 12.554 14.1768 13.2374L10.7071 16.7071C10.3166 17.0976 9.68342 17.0976 9.29289 16.7071C8.90237 16.3166 8.90237 15.6834 9.29289 15.2929L12.5858 12L9.29289 8.70711C8.90237 8.31658 8.90237 7.68342 9.29289 7.29289Z" />
        </svg>
      </div>
      {collapsed && <div className="divider" />}
      <div className="menu-items">
        {items.map(item => (
          <NavLink 
            key={item.slug} 
            to={`${basePath}/${item.slug}`} 
            className={({ isActive }) => `menu-item ${isActive ? 'active' : ''}`}
            onClick={onNavClick}
          >
            {getIcon(item.icon)}
            <span className="item-name">{item.name}</span>
          </NavLink>
        ))}
      </div>
    </div>
  )
}
