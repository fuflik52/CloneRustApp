import { useState, useEffect } from 'react'
import { useServer } from '../App'
import '../styles/settings.css'

interface CustomAction {
  id: string
  name: string
  group: string
  enabled: boolean
  accessLevel: 'safe' | 'dangerous' | 'very-dangerous' | 'admin'
  commands: string[]
  allowOffline: boolean
  selectServer: boolean
  confirmBefore: boolean
}

const tabs = [
  { id: 'reports', name: 'Репорты' },
  { id: 'checks', name: 'Проверки' },
  { id: 'bans', name: 'Баны' },
  { id: 'banlist', name: 'Бан-лист' },
  { id: 'autokick', name: 'Авто-кик' },
  { id: 'actions', name: 'Действия' },
  { id: 'api', name: 'API' },
]

export default function Settings() {
  const { serverId } = useServer()
  const [activeTab, setActiveTab] = useState('actions')
  const [actions, setActions] = useState<CustomAction[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [showPresetModal, setShowPresetModal] = useState(false)

  // Загрузка действий из БД
  useEffect(() => {
    if (!serverId) return
    const fetchActions = async () => {
      try {
        const res = await fetch(`/api/servers/${serverId}/actions`)
        if (res.ok) {
          const data = await res.json()
          setActions(data)
        }
      } catch (err) {
        console.error('Failed to load actions:', err)
      }
    }
    fetchActions()
  }, [serverId])

  const toggleAction = async (id: string) => {
    const action = actions.find(a => a.id === id)
    if (!action) return
    
    const updated = { ...action, enabled: !action.enabled }
    setActions(prev => prev.map(a => a.id === id ? updated : a))
    
    try {
      await fetch(`/api/servers/${serverId}/actions/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      })
    } catch (err) {
      console.error('Failed to update action:', err)
    }
  }

  const deleteAction = async (id: string) => {
    setActions(prev => prev.filter(a => a.id !== id))
    try {
      await fetch(`/api/servers/${serverId}/actions/${id}`, { method: 'DELETE' })
    } catch (err) {
      console.error('Failed to delete action:', err)
    }
  }

  const saveAction = async (action: Omit<CustomAction, 'id'>) => {
    const newAction = { ...action, id: Date.now().toString() }
    setActions(prev => [...prev, newAction])
    setShowCreateModal(false)
    
    try {
      await fetch(`/api/servers/${serverId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAction)
      })
    } catch (err) {
      console.error('Failed to save action:', err)
    }
  }

  const getAccessLevelColor = (level: CustomAction['accessLevel']) => {
    switch (level) {
      case 'safe': return 'green'
      case 'dangerous': return 'yellow'
      case 'very-dangerous': return 'red'
      case 'admin': return 'purple'
      default: return 'red'
    }
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <h1>Настройки</h1>
        <p className="settings-subtitle">основные параметры сервиса модерации</p>
      </div>

      <div className="settings-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`settings-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.name}
          </button>
        ))}
      </div>

      {activeTab === 'actions' && (
        <div className="settings-content">
          <div className="settings-section">
            <div className="section-header">
              <p className="section-title">Пользовательские действия</p>
              <span className="section-subtitle">
                Дают возможность отправлять любые команды на сервер, это могут быть как стандартные консольные команды самой игры (например killplayer), так и команды от установленных на сервере плагинов, например, муты в вашей чат-системе.
              </span>
            </div>

            <div className="actions-buttons">
              <button className="add-action-btn new" onClick={() => setShowCreateModal(true)}>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M2 12C2 6.47715 6.47715 2 12 2C17.5228 2 22 6.47715 22 12C22 17.5228 17.5228 22 12 22C6.47715 22 2 17.5228 2 12ZM16 12.9999C16.5523 12.9999 17 12.5522 17 11.9999C17 11.4476 16.5523 10.9999 16 10.9999L13 11V8.00012C13 7.44784 12.5523 7.00012 12 7.00012C11.4477 7.00012 11 7.44784 11 8.00012V11L7.99997 11.0001C7.44769 11.0001 6.99998 11.4479 7 12.0001C7.00002 12.5524 7.44774 13.0001 8.00003 13.0001L11 13V16C11 16.5523 11.4477 17 12 17C12.5523 17 13 16.5523 13 16V13L16 12.9999Z"/>
                </svg>
                <p>Создать новое действие</p>
              </button>
              <button className="add-action-btn list" onClick={() => setShowPresetModal(true)}>
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path fillRule="evenodd" clipRule="evenodd" d="M7 3C5.89543 3 5 3.89543 5 5V7H3C1.89543 7 1 7.89543 1 9V19C1 20.1046 1.89543 21 3 21H17C18.1046 21 19 20.1046 19 19V17H21C22.1046 17 23 16.1046 23 15V7C23 5.89543 22.1046 5 21 5L14.4142 5L13 3.58579C12.6249 3.21071 12.1162 3 11.5858 3H7ZM19 15H21V7H14.4142C13.8838 7 13.3751 6.78929 13 6.41421L11.5858 5H7V7H7.58579C8.11622 7 8.62493 7.21071 9 7.58579L10.4142 9L17 9C18.1046 9 19 9.89543 19 11V15Z"/>
                </svg>
                <p>Добавить из списка</p>
              </button>
            </div>

            <div className="actions-list">
              {actions.length === 0 ? (
                <div className="actions-empty">
                  <p>Нет созданных действий</p>
                  <span>Создайте новое действие или добавьте из списка</span>
                </div>
              ) : (
                actions.map(action => (
                  <div key={action.id} className={`action-item ${getAccessLevelColor(action.accessLevel)}`}>
                    <div className="action-info">
                      <div className="action-icon">
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path fillRule="evenodd" clipRule="evenodd" d="M14.2426 3.03009C14.7784 3.16404 15.1042 3.70698 14.9702 4.24277L10.9702 20.2428C10.8363 20.7786 10.2934 21.1044 9.75756 20.9704C9.22176 20.8365 8.896 20.2935 9.02995 19.7577L13.03 3.7577C13.1639 3.22191 13.7068 2.89615 14.2426 3.03009ZM6.7072 7.29317C7.09772 7.68369 7.09772 8.31686 6.7072 8.70738L3.41431 12.0003L6.7072 15.2932C7.09772 15.6837 7.09772 16.3169 6.7072 16.7074C6.31668 17.0979 5.68351 17.0979 5.29299 16.7074L2.00009 13.4145C1.21904 12.6334 1.21905 11.3671 2.00009 10.5861L5.29299 7.29317C5.68351 6.90265 6.31668 6.90265 6.7072 7.29317ZM17.293 7.29317C17.6835 6.90265 18.3167 6.90265 18.7072 7.29317L22.0001 10.5861C22.7811 11.3671 22.7811 12.6334 22.0001 13.4145L18.7072 16.7074C18.3167 17.0979 17.6835 17.0979 17.293 16.7074C16.9025 16.3169 16.9025 15.6837 17.293 15.2932L20.5859 12.0003L17.293 8.70738C16.9025 8.31686 16.9025 7.68369 17.293 7.29317Z"/>
                        </svg>
                      </div>
                      <div className="action-text">
                        <p className="action-name">{action.name}</p>
                        <p className="action-group">{action.group || 'Без группы'}</p>
                      </div>
                    </div>
                    <div className="action-controls">
                      <label className="custom-switch">
                        <input type="checkbox" checked={action.enabled} onChange={() => toggleAction(action.id)} />
                        <div className="slider"></div>
                      </label>
                      <button className="action-menu-btn" onClick={() => deleteAction(action.id)}>
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path fillRule="evenodd" clipRule="evenodd" d="M10 4C10 2.89543 10.8954 2 12 2C13.1046 2 14 2.89543 14 4C14 5.10457 13.1046 6 12 6C10.8954 6 10 5.10457 10 4ZM10 12C10 10.8954 10.8954 10 12 10C13.1046 10 14 10.8954 14 12C14 13.1046 13.1046 14 12 14C10.8954 14 10 13.1046 10 12ZM10 20C10 18.8954 10.8954 18 12 18C13.1046 18 14 18.8954 14 20C14 21.1046 13.1046 22 12 22C10.8954 22 10 21.1046 10 20Z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="settings-divider"></div>

          <div className="settings-section">
            <div className="section-header">
              <p className="section-title">Переменные для действий</p>
              <p className="section-subtitle">
                Команды могут содержать любые <span className="bright">{'{переменные}'}</span>, что делает действия более гибкими. Например, для мута можно использовать переменную <span className="bright">{'{time}'}</span> вместо конкретного времени, что позволит модератору вводить нужную длительность блокировки чата перед выполнением действия.
              </p>
              <a href="https://docs.rustapp.io/start/custom-actions.html" target="_blank" rel="noopener noreferrer" className="docs-btn">
                Документация
              </a>
            </div>
          </div>
        </div>
      )}

      {activeTab !== 'actions' && (
        <div className="settings-content">
          <div className="settings-placeholder">
            <p>Раздел "{tabs.find(t => t.id === activeTab)?.name}" в разработке</p>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateActionModal onClose={() => setShowCreateModal(false)} onSave={saveAction} />
      )}

      {showPresetModal && (
        <PresetActionsModal onClose={() => setShowPresetModal(false)} onSelect={saveAction} />
      )}
    </div>
  )
}

interface CreateActionModalProps {
  onClose: () => void
  onSave: (action: Omit<CustomAction, 'id'>) => void
}

function CreateActionModal({ onClose, onSave }: CreateActionModalProps) {
  const [step, setStep] = useState(1)
  const [name, setName] = useState('')
  const [group, setGroup] = useState('')
  const [accessLevel, setAccessLevel] = useState<CustomAction['accessLevel']>('safe')
  const [allowOffline, setAllowOffline] = useState(false)
  const [selectServer, setSelectServer] = useState(false)
  const [confirmBefore, setConfirmBefore] = useState(false)
  const [commands, setCommands] = useState([''])
  const [showAccessDropdown, setShowAccessDropdown] = useState(false)

  const accessLevels = [
    { value: 'safe', label: 'Безопасно', color: 'green' },
    { value: 'dangerous', label: 'Опасно', color: 'yellow' },
    { value: 'very-dangerous', label: 'Очень опасно', color: 'red' },
    { value: 'admin', label: 'Только админам', color: 'admin' },
  ]

  const currentLevel = accessLevels.find(l => l.value === accessLevel)

  const AccessIcon = ({ color }: { color: string }) => (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={`level-icon ${color}`}>
      <path d="M3 5C3 3.89543 3.89543 3 5 3H9.25C10.3546 3 11.25 3.89543 11.25 5V6C11.25 7.10457 10.3546 8 9.25 8H5C3.89543 8 3 7.10457 3 6V5Z"/>
      <path d="M8.5 11.5C8.5 10.3954 9.39543 9.5 10.5 9.5H13.5C14.6046 9.5 15.5 10.3954 15.5 11.5V12.5C15.5 13.6046 14.6046 14.5 13.5 14.5H10.5C9.39543 14.5 8.5 13.6046 8.5 12.5V11.5Z"/>
      <path d="M3 11.375C3 10.3395 3.83947 9.5 4.875 9.5C5.91053 9.5 6.75 10.3395 6.75 11.375V12.625C6.75 13.6605 5.91053 14.5 4.875 14.5C3.83947 14.5 3 13.6605 3 12.625V11.375Z"/>
      <path d="M17.2 11.375C17.2 10.3395 18.0394 9.5 19.075 9.5C20.1105 9.5 20.95 10.3395 20.95 11.375V12.625C20.95 13.6605 20.1105 14.5 19.075 14.5C18.0394 14.5 17.2 13.6605 17.2 12.625V11.375Z"/>
      <path d="M12.75 5C12.75 3.89543 13.6454 3 14.75 3H19C20.1046 3 21 3.89543 21 5V6C21 7.10457 20.1046 8 19 8H14.75C13.6454 8 12.75 7.10457 12.75 6V5Z"/>
      <path d="M3 18C3 16.8954 3.89543 16 5 16H9.25C10.3546 16 11.25 16.8954 11.25 18V19C11.25 20.1046 10.3546 21 9.25 21H5C3.89543 21 3 20.1046 3 19V18Z"/>
      <path d="M12.75 18C12.75 16.8954 13.6454 16 14.75 16H19C20.1046 16 21 16.8954 21 18V19C21 20.1046 20.1046 21 19 21H14.75C13.6454 21 12.75 20.1046 12.75 19V18Z"/>
    </svg>
  )

  const variables = [
    { name: '{steam_id}', desc: 'SteamID выбранного игрока' },
    { name: '{steam_name}', desc: 'Имя выбранного игрока' },
    { name: '{player_ip}', desc: 'IP выбранного игрока' },
    { name: '{staff_steam_id}', desc: 'SteamID модератора', warning: true },
  ]

  const addCommand = () => {
    if (commands.length < 3) setCommands([...commands, ''])
  }

  const updateCommand = (index: number, value: string) => {
    const newCommands = [...commands]
    newCommands[index] = value
    setCommands(newCommands)
  }

  const handleSave = () => {
    onSave({ name, group, enabled: true, accessLevel, commands: commands.filter(c => c.trim()), allowOffline, selectServer, confirmBefore })
  }

  const canProceed = step === 1 ? name.trim() !== '' : commands.some(c => c.trim() !== '')

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="action-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-card">
          <div className="modal-card-header">
            <div className="header-text">
              <p className="header-title">Новое действие</p>
              <p className="header-subtitle">{step === 1 ? 'общие настройки' : 'команды'}</p>
            </div>
            <div className="header-icon">
              <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path fillRule="evenodd" clipRule="evenodd" d="M14.2426 3.03009C14.7784 3.16404 15.1042 3.70698 14.9702 4.24277L10.9702 20.2428C10.8363 20.7786 10.2934 21.1044 9.75756 20.9704C9.22176 20.8365 8.896 20.2935 9.02995 19.7577L13.03 3.7577C13.1639 3.22191 13.7068 2.89615 14.2426 3.03009ZM6.7072 7.29317C7.09772 7.68369 7.09772 8.31686 6.7072 8.70738L3.41431 12.0003L6.7072 15.2932C7.09772 15.6837 7.09772 16.3169 6.7072 16.7074C6.31668 17.0979 5.68351 17.0979 5.29299 16.7074L2.00009 13.4145C1.21904 12.6334 1.21905 11.3671 2.00009 10.5861L5.29299 7.29317C5.68351 6.90265 6.31668 6.90265 6.7072 7.29317ZM17.293 7.29317C17.6835 6.90265 18.3167 6.90265 18.7072 7.29317L22.0001 10.5861C22.7811 11.3671 22.7811 12.6334 22.0001 13.4145L18.7072 16.7074C18.3167 17.0979 17.6835 17.0979 17.293 16.7074C16.9025 16.3169 16.9025 15.6837 17.293 15.2932L20.5859 12.0003L17.293 8.70738C16.9025 8.31686 16.9025 7.68369 17.293 7.29317Z"/>
              </svg>
            </div>
          </div>

          <div className="modal-card-content">
            {step === 1 ? (
              <div className="step-content">
                <div className="form-group">
                  <label>Название</label>
                  <input type="text" placeholder="Введите название" value={name} onChange={e => setName(e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Группа</label>
                  <div className="suggester-input">
                    <input type="text" placeholder="Выберите или напишите название" value={group} onChange={e => setGroup(e.target.value)} />
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 6.4141L15.2929 9.70699C15.6834 10.0975 16.3166 10.0975 16.7071 9.70699C17.0976 9.31647 17.0976 8.6833 16.7071 8.29278L13.2374 4.82311C12.554 4.13969 11.446 4.13969 10.7626 4.82311L7.29289 8.29278C6.90237 8.6833 6.90237 9.31647 7.29289 9.70699C7.68342 10.0975 8.31658 10.0975 8.70711 9.70699L12 6.4141ZM7.29289 14.2928C7.68342 13.9023 8.31658 13.9023 8.70711 14.2928L12 17.5857L15.2929 14.2928C15.6834 13.9023 16.3166 13.9023 16.7071 14.2928C17.0976 14.6833 17.0976 15.3165 16.7071 15.707L13.2374 19.1767C12.554 19.8601 11.446 19.8601 10.7626 19.1767L7.29289 15.707C6.90237 15.3165 6.90237 14.6833 7.29289 14.2928Z"/>
                    </svg>
                  </div>
                </div>

                <div className="form-group">
                  <div className="label-with-info">
                    <label>Уровень доступа</label>
                    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="info-icon">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2ZM10 11C10 10.4477 10.4477 10 11 10H12C12.5523 10 13 10.4477 13 11V16C13 16.5523 12.5523 17 12 17C11.4477 17 11 16.5523 11 16V12C10.4477 12 10 11.5523 10 11ZM12 7C11.4477 7 11 7.44772 11 8C11 8.55228 11.4477 9 12 9C12.5523 9 13 8.55228 13 8C13 7.44772 12.5523 7 12 7Z"/>
                    </svg>
                  </div>
                  <div className="select-wrapper" onClick={() => setShowAccessDropdown(!showAccessDropdown)}>
                    <div className="select-activator">
                      <div className="select-value">
                        {currentLevel && <AccessIcon color={currentLevel.color} />}
                        <span>{currentLevel?.label || 'Выберите уровень доступа'}</span>
                      </div>
                      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className={`arrow ${showAccessDropdown ? 'open' : ''}`}>
                        <path fillRule="evenodd" clipRule="evenodd" d="M9.29289 7.29289C9.68342 6.90237 10.3166 6.90237 10.7071 7.29289L14.1768 10.7626C14.8602 11.446 14.8602 12.554 14.1768 13.2374L10.7071 16.7071C10.3166 17.0976 9.68342 17.0976 9.29289 16.7071C8.90237 16.3166 8.90237 15.6834 9.29289 15.2929L12.5858 12L9.29289 8.70711C8.90237 8.31658 8.90237 7.68342 9.29289 7.29289Z"/>
                      </svg>
                    </div>
                    {showAccessDropdown && (
                      <div className="select-options">
                        {accessLevels.map(level => (
                          <div key={level.value} className="select-option" onClick={() => { setAccessLevel(level.value as CustomAction['accessLevel']); setShowAccessDropdown(false) }}>
                            <AccessIcon color={level.color} />
                            <span>{level.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="checkboxes">
                  <label className="checkbox-container">
                    Разрешить для оффлайн игроков
                    <input type="checkbox" checked={allowOffline} onChange={e => setAllowOffline(e.target.checked)} />
                    <span className="checkbox-mark">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fillRule="evenodd" clipRule="evenodd" d="M4.25 6.75L3 8L6.75 11.75L13 5.5L11.75 4.25L6.75 9.25L4.25 6.75Z"/></svg>
                    </span>
                  </label>
                  <label className="checkbox-container">
                    Выбирать сервер перед выполнением
                    <input type="checkbox" checked={selectServer} onChange={e => setSelectServer(e.target.checked)} />
                    <span className="checkbox-mark">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fillRule="evenodd" clipRule="evenodd" d="M4.25 6.75L3 8L6.75 11.75L13 5.5L11.75 4.25L6.75 9.25L4.25 6.75Z"/></svg>
                    </span>
                  </label>
                  <label className="checkbox-container">
                    Подтверждать перед выполнением
                    <input type="checkbox" checked={confirmBefore} onChange={e => setConfirmBefore(e.target.checked)} />
                    <span className="checkbox-mark">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path fillRule="evenodd" clipRule="evenodd" d="M4.25 6.75L3 8L6.75 11.75L13 5.5L11.75 4.25L6.75 9.25L4.25 6.75Z"/></svg>
                    </span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="step-content">
                <div className="commands-group">
                  <div className="commands-header">
                    <p className="label">Команды ({commands.length}/3)</p>
                    {commands.length < 3 && <button className="add-cmd-btn" onClick={addCommand}>Добавить</button>}
                  </div>
                  <div className="commands-inputs">
                    {commands.map((cmd, i) => (
                      <input key={i} type="text" placeholder="Введите команду" value={cmd} onChange={e => updateCommand(i, e.target.value)} />
                    ))}
                  </div>
                </div>

                <div className="variables-list">
                  {variables.map(v => (
                    <div key={v.name} className="variable-item">
                      <span className="var-name">{v.name}</span>
                      <span className="var-desc">- {v.desc}</span>
                      {v.warning && (
                        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" className="warning-icon">
                          <path fillRule="evenodd" clipRule="evenodd" d="M9.40767 4.48839C10.5653 2.50387 13.4327 2.50387 14.5903 4.48838L21.6083 16.5192C22.7749 18.5191 21.3323 21.0308 19.0169 21.0308H4.98108C2.66571 21.0308 1.22309 18.5191 2.38974 16.5192L9.40767 4.48839ZM12 9.03076C12.5523 9.03076 13 9.47848 13 10.0308V13.0308C13 13.5831 12.5523 14.0308 12 14.0308C11.4477 14.0308 11 13.5831 11 13.0308V10.0308C11 9.47848 11.4477 9.03076 12 9.03076ZM10.75 16.0308C10.75 15.3404 11.3096 14.7808 12 14.7808C12.6904 14.7808 13.25 15.3404 13.25 16.0308C13.25 16.7212 12.6904 17.2808 12 17.2808C11.3096 17.2808 10.75 16.7212 10.75 16.0308Z"/>
                        </svg>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="modal-card-footer">
            <div className="steps-indicator">
              <div className={`step-dot ${step === 1 ? 'active' : ''}`}></div>
              <div className={`step-dot ${step === 2 ? 'active' : ''}`}></div>
            </div>
            <div className="footer-buttons">
              <button className="btn-default" onClick={step === 1 ? onClose : () => setStep(1)}>
                {step === 1 ? 'Закрыть' : 'Назад'}
              </button>
              <button className={`btn-primary ${!canProceed ? 'disabled' : ''}`} disabled={!canProceed} onClick={step === 1 ? () => setStep(2) : handleSave}>
                {step === 1 ? 'Далее' : 'Сохранить'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}


// Готовые команды Rust
const presetActions = [
  // Администрирование
  { name: 'Выдать Owner', group: 'Администрирование', command: 'ownerid {steam_id}', accessLevel: 'admin' as const, desc: 'Выдать права владельца' },
  { name: 'Выдать Moderator', group: 'Администрирование', command: 'moderatorid {steam_id}', accessLevel: 'admin' as const, desc: 'Выдать права модератора' },
  { name: 'Убрать Owner', group: 'Администрирование', command: 'removeowner {steam_id}', accessLevel: 'admin' as const, desc: 'Забрать права владельца' },
  { name: 'Убрать Moderator', group: 'Администрирование', command: 'removemoderator {steam_id}', accessLevel: 'admin' as const, desc: 'Забрать права модератора' },
  
  // Управление игроком
  { name: 'Кикнуть', group: 'Управление', command: 'kick {steam_id} "{reason}"', accessLevel: 'dangerous' as const, desc: 'Кикнуть игрока с сервера' },
  { name: 'Забанить', group: 'Управление', command: 'ban {steam_id} "{reason}"', accessLevel: 'very-dangerous' as const, desc: 'Забанить игрока навсегда' },
  { name: 'Разбанить', group: 'Управление', command: 'unban {steam_id}', accessLevel: 'dangerous' as const, desc: 'Разбанить игрока' },
  { name: 'Убить игрока', group: 'Управление', command: 'kill {steam_id}', accessLevel: 'dangerous' as const, desc: 'Убить игрока' },
  
  // Телепортация
  { name: 'ТП к игроку', group: 'Телепортация', command: 'teleport {staff_steam_id} {steam_id}', accessLevel: 'safe' as const, desc: 'Телепортироваться к игроку' },
  { name: 'ТП игрока к себе', group: 'Телепортация', command: 'teleport {steam_id} {staff_steam_id}', accessLevel: 'dangerous' as const, desc: 'Телепортировать игрока к себе' },
  
  // Инвентарь
  { name: 'Очистить инвентарь', group: 'Инвентарь', command: 'inventory.clearinventory {steam_id}', accessLevel: 'very-dangerous' as const, desc: 'Очистить весь инвентарь игрока' },
  { name: 'Выдать предмет', group: 'Инвентарь', command: 'inventory.giveto {steam_id} {item} {amount}', accessLevel: 'dangerous' as const, desc: 'Выдать предмет игроку' },
  
  // Здоровье
  { name: 'Вылечить', group: 'Здоровье', command: 'heal {steam_id}', accessLevel: 'safe' as const, desc: 'Полностью вылечить игрока' },
  { name: 'Воскресить', group: 'Здоровье', command: 'respawn {steam_id}', accessLevel: 'safe' as const, desc: 'Воскресить игрока' },
  
  // Постройки
  { name: 'Удалить постройки', group: 'Постройки', command: 'ent kill', accessLevel: 'very-dangerous' as const, desc: 'Удалить объект перед собой' },
  { name: 'Авторизовать в шкафу', group: 'Постройки', command: 'entauth {steam_id}', accessLevel: 'dangerous' as const, desc: 'Авторизовать игрока в шкафу' },
  
  // Информация
  { name: 'Информация об игроке', group: 'Информация', command: 'playerinfo {steam_id}', accessLevel: 'safe' as const, desc: 'Показать информацию об игроке' },
  
  // Oxide/uMod плагины
  { name: 'Мут (BetterChat)', group: 'Плагины', command: 'mute {steam_id} {time}', accessLevel: 'dangerous' as const, desc: 'Замутить игрока (BetterChat)' },
  { name: 'Размут (BetterChat)', group: 'Плагины', command: 'unmute {steam_id}', accessLevel: 'safe' as const, desc: 'Размутить игрока (BetterChat)' },
  { name: 'Заморозить', group: 'Плагины', command: 'freeze {steam_id}', accessLevel: 'dangerous' as const, desc: 'Заморозить игрока (Freeze)' },
  { name: 'Разморозить', group: 'Плагины', command: 'unfreeze {steam_id}', accessLevel: 'safe' as const, desc: 'Разморозить игрока (Freeze)' },
  { name: 'Vanish', group: 'Плагины', command: 'vanish', accessLevel: 'safe' as const, desc: 'Стать невидимым (Vanish)' },
  { name: 'Godmode', group: 'Плагины', command: 'god {steam_id}', accessLevel: 'dangerous' as const, desc: 'Включить бессмертие (Godmode)' },
]

interface PresetActionsModalProps {
  onClose: () => void
  onSelect: (action: Omit<CustomAction, 'id'>) => void
}

function PresetActionsModal({ onClose, onSelect }: PresetActionsModalProps) {
  const [search, setSearch] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)

  const groups = [...new Set(presetActions.map(a => a.group))]
  
  const filteredActions = presetActions.filter(a => {
    const matchesSearch = !search || 
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.command.toLowerCase().includes(search.toLowerCase())
    const matchesGroup = !selectedGroup || a.group === selectedGroup
    return matchesSearch && matchesGroup
  })

  const handleSelect = (preset: typeof presetActions[0]) => {
    onSelect({
      name: preset.name,
      group: preset.group,
      enabled: true,
      accessLevel: preset.accessLevel,
      commands: [preset.command],
      allowOffline: false,
      selectServer: false,
      confirmBefore: preset.accessLevel === 'very-dangerous' || preset.accessLevel === 'admin'
    })
  }

  const getAccessColor = (level: string) => {
    switch (level) {
      case 'safe': return 'green'
      case 'dangerous': return 'yellow'
      case 'very-dangerous': return 'red'
      case 'admin': return 'purple'
      default: return 'green'
    }
  }

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="preset-modal" onClick={e => e.stopPropagation()}>
        <div className="preset-header">
          <h3>Добавить из списка</h3>
          <button className="close-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          </button>
        </div>
        
        <div className="preset-search">
          <svg viewBox="0 0 24 24"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
          <input type="text" placeholder="Поиск команды..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>

        <div className="preset-groups">
          <button className={`group-btn ${!selectedGroup ? 'active' : ''}`} onClick={() => setSelectedGroup(null)}>Все</button>
          {groups.map(g => (
            <button key={g} className={`group-btn ${selectedGroup === g ? 'active' : ''}`} onClick={() => setSelectedGroup(g)}>{g}</button>
          ))}
        </div>

        <div className="preset-list">
          {filteredActions.map((preset, i) => (
            <div key={i} className={`preset-item ${getAccessColor(preset.accessLevel)}`} onClick={() => handleSelect(preset)}>
              <div className="preset-info">
                <p className="preset-name">{preset.name}</p>
                <p className="preset-desc">{preset.desc}</p>
                <code className="preset-cmd">{preset.command}</code>
              </div>
              <svg viewBox="0 0 24 24" className="add-icon"><path d="M12 5v14m-7-7h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
