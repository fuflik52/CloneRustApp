import { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'

interface Suggestion {
  id: number
  type: string
  text: string
  likes: number
  dislikes: number
  liked: boolean
  disliked: boolean
}

export default function Welcome() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [tipVisible, setTipVisible] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [suggestionText, setSuggestionText] = useState('')
  const [selectOpen, setSelectOpen] = useState(false)
  const [selectedType, setSelectedType] = useState('idea')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const selectRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(e.target as Node)) {
        setSelectOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeTab = searchParams.get('section') || 'roadmap'
  const setTab = (tab: string) => setSearchParams({ section: tab })

  const types = [
    { value: 'idea', label: 'Идея', icon: <IdeaIcon /> },
    { value: 'improvement', label: 'Улучшение', icon: <ImprovementIcon /> },
    { value: 'feature', label: 'Функционал', icon: <FeatureIcon /> },
    { value: 'bug', label: 'Баг', icon: <BugIcon /> },
  ]

  const selectedTypeData = types.find(t => t.value === selectedType)!

  const createSuggestion = () => {
    if (!suggestionText.trim()) return
    const newSuggestion: Suggestion = {
      id: Date.now(),
      type: selectedType,
      text: suggestionText,
      likes: 0,
      dislikes: 0,
      liked: false,
      disliked: false,
    }
    setSuggestions([newSuggestion, ...suggestions])
    setSuggestionText('')
    setSelectedType('idea')
    setModalOpen(false)
  }

  const handleLike = (id: number) => {
    setSuggestions(suggestions.map(s => {
      if (s.id !== id) return s
      if (s.liked) return { ...s, likes: s.likes - 1, liked: false }
      return { ...s, likes: s.likes + 1, liked: true, dislikes: s.disliked ? s.dislikes - 1 : s.dislikes, disliked: false }
    }))
  }

  const handleDislike = (id: number) => {
    setSuggestions(suggestions.map(s => {
      if (s.id !== id) return s
      if (s.disliked) return { ...s, dislikes: s.dislikes - 1, disliked: false }
      return { ...s, dislikes: s.dislikes + 1, disliked: true, likes: s.liked ? s.likes - 1 : s.likes, liked: false }
    }))
  }

  const getTypeIcon = (type: string) => types.find(t => t.value === type)?.icon

  return (
    <div className="page">
      <h1 className="welcome-title">PAN RUST, добро пожаловать в RustApp! 🔥</h1>
      <p className="welcome-desc">
        Сервис находится в раннем доступе. Мы активно добавляем новый функционал и улучшаем существующий. 
        Пожалуйста, если вы обнаружили баг, сообщите нам, и мы постараемся исправить его как можно скорее.
      </p>

      <div className="tabs">
        <button className={`tab ${activeTab === 'roadmap' ? 'active' : ''}`} onClick={() => setTab('roadmap')}>Дорожная карта</button>
        <button className={`tab ${activeTab === 'suggestions' ? 'active' : ''}`} onClick={() => setTab('suggestions')}>Предложения</button>
        <button className={`tab ${activeTab === 'links' ? 'active' : ''}`} onClick={() => setTab('links')}>Ссылки</button>
      </div>

      {activeTab === 'roadmap' && (
        <div className="tab-content">
          {tipVisible && (
            <div className="tip-box">
              <div className="tip-gradient" />
              <div className="tip-content">
                <TipIcon />
                <span className="tip-text">
                  Это лишь ориентировочные планы, которые могут не совпадать с тем, что мы в итоге реализуем. 
                  Некоторые запланированные функции намеренно не включены в роадмап.
                </span>
              </div>
              <svg className="tip-close" viewBox="0 0 24 24" onClick={() => setTipVisible(false)}>
                <path fillRule="evenodd" clipRule="evenodd" d="M4.29289 4.29289C4.68342 3.90237 5.31658 3.90237 5.70711 4.29289L12 10.5858L18.2929 4.29289C18.6834 3.90237 19.3166 3.90237 19.7071 4.29289C20.0976 4.68342 20.0976 5.31658 19.7071 5.70711L13.4142 12L19.7071 18.2929C20.0976 18.6834 20.0976 19.3166 19.7071 19.7071C19.3166 20.0976 18.6834 20.0976 18.2929 19.7071L12 13.4142L5.70711 19.7071C5.31658 20.0976 4.68342 20.0976 4.29289 19.7071C3.90237 19.3166 3.90237 18.6834 4.29289 18.2929L10.5858 12L4.29289 5.70711C3.90237 5.31658 3.90237 4.68342 4.29289 4.29289Z" />
              </svg>
            </div>
          )}
          <div className="roadmap-list">
            <div className="roadmap-item">
              <Loader />
              <span>Исправление багов и улучшение пользовательского опыта</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'suggestions' && (
        <div className="tab-content">
          <div className="suggestions-header">
            <span className="suggestions-title">Предложения комьюнити</span>
            <button className="btn-primary" onClick={() => setModalOpen(true)}>
              <EditIcon />
            </button>
          </div>
          {suggestions.length === 0 ? (
            <div className="empty-state">
              <SadIcon />
              <p>Предложений пока нет</p>
            </div>
          ) : (
            <div className="suggestions-list">
              {suggestions.map(s => (
                <div key={s.id} className="suggestion-card">
                  <div className="suggestion-header">
                    <div className={`suggestion-badge ${s.type}`}>
                      {getTypeIcon(s.type)}
                      <span>{types.find(t => t.value === s.type)?.label}</span>
                    </div>
                  </div>
                  <p className="suggestion-text">{s.text}</p>
                  <div className="suggestion-actions">
                    <button className={`vote-btn ${s.liked ? 'active' : ''}`} onClick={() => handleLike(s.id)}>
                      <LikeIcon />
                      <span>{s.likes}</span>
                    </button>
                    <button className={`vote-btn ${s.disliked ? 'active' : ''}`} onClick={() => handleDislike(s.id)}>
                      <DislikeIcon />
                      <span>{s.dislikes}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'links' && (
        <div className="tab-content">
          <div className="empty-state">
            <SadIcon />
            <p>Ссылки пока отсутствуют</p>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="modal-overlay active" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="divided-card">
            <div className="card-header">Сделать предложение</div>
            <div className="card-content">
              <div ref={selectRef} className={`select-wrapper ${selectOpen ? 'open' : ''}`} onClick={() => setSelectOpen(!selectOpen)}>
                {selectedTypeData.icon}
                <span>{selectedTypeData.label}</span>
                <svg className="select-arrow" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M9.29289 7.29289C9.68342 6.90237 10.3166 6.90237 10.7071 7.29289L14.1768 10.7626C14.8602 11.446 14.8602 12.554 14.1768 13.2374L10.7071 16.7071C10.3166 17.0976 9.68342 17.0976 9.29289 16.7071C8.90237 16.3166 8.90237 15.6834 9.29289 15.2929L12.5858 12L9.29289 8.70711C8.90237 8.31658 8.90237 7.68342 9.29289 7.29289Z" />
                </svg>
                <div className="options-list">
                  {types.map(type => (
                    <div key={type.value} className="option" onClick={e => { e.stopPropagation(); setSelectedType(type.value); setSelectOpen(false) }}>
                      {type.icon}
                      <span>{type.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <textarea
                placeholder="Опишите предложение подробнее..."
                rows={5}
                value={suggestionText}
                onChange={e => setSuggestionText(e.target.value)}
              />
            </div>
            <div className="card-footer">
              <button className="btn-default" onClick={() => setModalOpen(false)}>Закрыть</button>
              <button className={`btn-primary ${!suggestionText.trim() ? 'btn-disabled' : ''}`} disabled={!suggestionText.trim()} onClick={createSuggestion}>
                Создать пост
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Loader() {
  return (
    <div className="loader">
      {[...Array(12)].map((_, i) => <div key={i} className="line" />)}
    </div>
  )
}

function TipIcon() {
  return (
    <svg className="tip-icon" viewBox="0 0 16 16">
      <path fillRule="evenodd" clipRule="evenodd" d="M8.0026 1.33594C4.32071 1.33594 1.33594 4.32071 1.33594 8.0026C1.33594 11.6845 4.32071 14.6693 8.0026 14.6693C11.6845 14.6693 14.6693 11.6845 14.6693 8.0026C14.6693 4.32071 11.6845 1.33594 8.0026 1.33594ZM6.66927 7.33594C6.66927 6.96775 6.96775 6.66927 7.33594 6.66927H8.0026C8.37079 6.66927 8.66927 6.96775 8.66927 7.33594V10.6693C8.66927 11.0375 8.37079 11.3359 8.0026 11.3359C7.63441 11.3359 7.33594 11.0375 7.33594 10.6693V8.0026C6.96775 8.0026 6.66927 7.70413 6.66927 7.33594ZM8.0026 4.66927C7.63441 4.66927 7.33594 4.96775 7.33594 5.33594C7.33594 5.70413 7.63441 6.0026 8.0026 6.0026C8.37079 6.0026 8.66927 5.70413 8.66927 5.33594C8.66927 4.96775 8.37079 4.66927 8.0026 4.66927Z" />
    </svg>
  )
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M7.16146 3H11C11.5523 3 12 3.44772 12 4C12 4.55228 11.5523 5 11 5H7.2C6.62345 5 6.25117 5.00078 5.96784 5.02393C5.69617 5.04612 5.59546 5.0838 5.54601 5.10899C5.35785 5.20487 5.20487 5.35785 5.109 5.54601C5.0838 5.59545 5.04612 5.69617 5.02393 5.96784C5.00078 6.25117 5 6.62345 5 7.2V16.8C5 17.3766 5.00078 17.7488 5.02393 18.0322C5.04612 18.3038 5.0838 18.4045 5.109 18.454C5.20487 18.6422 5.35785 18.7951 5.54601 18.891C5.59546 18.9162 5.69617 18.9539 5.96784 18.9761C6.25117 18.9992 6.62345 19 7.2 19H16.8C17.3766 19 17.7488 18.9992 18.0322 18.9761C18.3038 18.9539 18.4045 18.9162 18.454 18.891C18.6422 18.7951 18.7951 18.6422 18.891 18.454C18.9162 18.4045 18.9539 18.3038 18.9761 18.0322C18.9992 17.7488 19 17.3766 19 16.8V13C19 12.4477 19.4477 12 20 12C20.5523 12 21 12.4477 21 13V16.8386C21 17.3657 21 17.8205 20.9694 18.195C20.9371 18.5904 20.8658 18.9836 20.673 19.362C20.3854 19.9265 19.9265 20.3854 19.362 20.673C18.9836 20.8658 18.5904 20.9371 18.195 20.9694C17.8205 21 17.3657 21 16.8386 21H7.16144C6.6343 21 6.17954 21 5.80497 20.9694C5.40963 20.9371 5.01641 20.8658 4.63803 20.673C4.07354 20.3854 3.6146 19.9265 3.32698 19.362C3.13419 18.9836 3.06287 18.5904 3.03057 18.195C2.99997 17.8205 2.99998 17.3657 3 16.8385V7.16146C2.99998 6.63431 2.99997 6.17954 3.03057 5.80497C3.06287 5.40963 3.13419 5.01641 3.32698 4.63803C3.6146 4.07354 4.07354 3.6146 4.63803 3.32698C5.01641 3.13419 5.40963 3.06287 5.80497 3.03057C6.17955 2.99997 6.63431 2.99998 7.16146 3Z" />
      <path d="M20.8713 2.9568C19.6997 1.78523 17.8003 1.78523 16.6287 2.9568L8.58579 10.9997C8.21072 11.3748 8 11.8835 8 12.4139V14.9997C8 15.552 8.44772 15.9997 9 15.9997H11.5858C12.1162 15.9997 12.6249 15.789 13 15.4139L21.0429 7.37102C22.2145 6.19944 22.2145 4.29995 21.0429 3.12838L20.8713 2.9568Z" />
    </svg>
  )
}

function LikeIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path d="M21 10C21 15.75 12.75 20 12 20C11.25 20 3 15.75 3 10C3 6 5.5 4 8 4C10.5 4 12 5.5 12 5.5C12 5.5 13.5 4 16 4C18.5 4 21 6 21 10Z" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

function DislikeIcon() {
  return (
    <svg viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M12 3.99978C12 2.98809 12.8943 1.8124 14.2366 2.15412C16.3994 2.70471 18 4.66406 18 6.99978C18 7.81803 17.8031 8.59066 17.4546 9.27247C18.9445 9.85434 20 11.3038 20 12.9998C20 13.4376 19.9295 13.8572 19.7997 14.2491C21.0892 14.7651 22 16.0261 22 17.4998C22 19.4328 20.433 20.9998 18.5 20.9998H5.5C3.567 20.9998 2 19.4328 2 17.4998C2 16.0261 2.91085 14.7651 4.2003 14.2491C4.07052 13.8572 4 13.4376 4 12.9998C4 11.4171 4.91885 10.0495 6.25252 9.40084C6.08934 8.96463 6 8.49237 6 7.99978C6 5.79064 7.79086 3.99978 10 3.99978H12ZM11 8.99975C10.4477 8.99975 10 9.44747 10 9.99975C10 10.5521 10.4477 10.9998 11 10.9998H12C12.5523 10.9998 13 10.5521 13 9.99975C13 9.44747 12.5523 8.99975 12 8.99975H11ZM14 13.9998C13.4477 13.9998 13 14.4475 13 14.9998C13 15.5521 13.4477 15.9998 14 15.9998H15C15.5523 15.9998 16 15.5521 16 14.9998C16 14.4475 15.5523 13.9998 15 13.9998H14Z" />
    </svg>
  )
}

function SadIcon() {
  return (
    <svg className="sad-icon" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="10" strokeWidth="2" fill="none" />
      <circle cx="9" cy="10" r="1.5" />
      <circle cx="15" cy="10" r="1.5" />
      <path d="M8 16c1.5-2 6.5-2 8 0" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}



function IdeaIcon() {
  return (
    <svg className="select-icon" viewBox="0 0 24 24">
      <path d="M12 2C7.58172 2 4 5.58172 4 10C4 12.9113 5.55568 15.4582 7.87631 16.8565C7.9173 16.8812 7.95853 16.9056 8 16.9296V17H16V16.9296C16.0415 16.9056 16.0827 16.8812 16.1237 16.8565C18.4443 15.4582 20 12.9113 20 10C20 5.58172 16.4183 2 12 2Z" />
      <path d="M12 23C9.79086 23 8 21.2091 8 19H16C16 21.2091 14.2091 23 12 23Z" />
    </svg>
  )
}

function ImprovementIcon() {
  return (
    <svg className="select-icon" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M15 14.9123L12 17.4623V19.2336L14.5145 17.7249C14.8157 17.5442 15 17.2187 15 16.8675V14.9123ZM10 17.414L6.58579 13.9998H4.76619C3.2116 13.9998 2.25138 12.3039 3.0512 10.9708L4.5599 8.45634C5.10207 7.55273 6.07859 6.99983 7.13238 6.99983H10.8147C13.3392 4.32966 16.2007 2.36872 19.9142 2.04636C21.0833 1.94487 22.055 2.9165 21.9535 4.08559C21.6311 7.79909 19.6702 10.6606 17 13.1852V16.8675C17 17.9212 16.4471 18.8978 15.5435 19.4399L13.029 20.9486C11.6959 21.7485 10 20.7882 10 19.2336V17.414ZM9.08756 8.99983H7.13238C6.78112 8.99983 6.45561 9.18413 6.27489 9.48534L4.76619 11.9998H6.53756L9.08756 8.99983ZM2 18.9998C2 17.343 3.34315 15.9998 5 15.9998C6.65685 15.9998 8 17.343 8 18.9998C8 20.6567 6.65685 21.9998 5 21.9998H3C2.44772 21.9998 2 21.5521 2 20.9998V18.9998Z" />
    </svg>
  )
}

function FeatureIcon() {
  return (
    <svg className="select-icon" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.99618 2.86888C10.3581 2.32605 10.9673 2 11.6197 2H12.3803C13.0327 2 13.6419 2.32605 14.0038 2.86888L15.145 4.58067L16.894 4.17706C17.5495 4.02578 18.2367 4.22288 18.7125 4.69859L19.3014 5.28754C19.7771 5.76326 19.9742 6.45048 19.8229 7.10601L19.4193 8.85498L21.1311 9.99618C21.674 10.3581 22 10.9673 22 11.6197V12.3803C22 13.0327 21.674 13.6419 21.1311 14.0038L19.4193 15.145L19.8229 16.894C19.9742 17.5495 19.7771 18.2367 19.3014 18.7125L18.7125 19.3014C18.2367 19.7771 17.5495 19.9742 16.894 19.8229L15.145 19.4193L14.0038 21.1311C13.6419 21.674 13.0327 22 12.3803 22H11.6197C10.9673 22 10.3581 21.674 9.99618 21.1311L8.85498 19.4193L7.10601 19.8229C6.45048 19.9742 5.76326 19.7771 5.28754 19.3014L4.69859 18.7125C4.22288 18.2367 4.02578 17.5495 4.17706 16.894L4.58067 15.145L2.86888 14.0038C2.32605 13.6419 2 13.0327 2 12.3803V11.6197C2 10.9673 2.32605 10.3581 2.86888 9.99618L4.58067 8.85498L4.17706 7.10601C4.02578 6.45048 4.22288 5.76326 4.69859 5.28754L5.28754 4.69859C5.76326 4.22288 6.45048 4.02578 7.10601 4.17706L8.85498 4.58067L9.99618 2.86888ZM8.5 12C8.5 10.067 10.067 8.5 12 8.5C13.933 8.5 15.5 10.067 15.5 12C15.5 13.933 13.933 15.5 12 15.5C10.067 15.5 8.5 13.933 8.5 12Z" />
    </svg>
  )
}

function BugIcon() {
  return (
    <svg className="select-icon" viewBox="0 0 24 24">
      <path fillRule="evenodd" clipRule="evenodd" d="M16.9994 7.53479C16.9998 7.52324 17 7.51164 17 7.5V7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7V7.5C7 7.51164 7.0002 7.52324 7.00059 7.53479C6.77768 7.66368 6.56836 7.81347 6.37531 7.98147L3.56434 7.05069C3.04005 6.87708 2.4743 7.16137 2.30069 7.68566C2.12708 8.20995 2.41137 8.7757 2.93566 8.94931L5.21464 9.70394C5.07551 10.1104 5 10.5464 5 11V12H3C2.44772 12 2 12.4477 2 13C2 13.5523 2.44772 14 3 14H5V15C5 15.4297 5.03871 15.8503 5.11283 16.2585L2.90826 17.0602C2.38922 17.2489 2.12147 17.8227 2.31021 18.3417C2.49895 18.8608 3.07271 19.1285 3.59174 18.9398L5.74968 18.1551C6.75996 20.1525 8.69958 21.6001 11 21.9291V13C11 12.4477 11.4477 12 12 12C12.5523 12 13 12.4477 13 13V21.9291C15.3004 21.6001 17.24 20.1525 18.2503 18.1551L20.4083 18.9398C20.9273 19.1285 21.5011 18.8608 21.6898 18.3417C21.8785 17.8227 21.6108 17.2489 21.0917 17.0602L18.8872 16.2585C18.9613 15.8503 19 15.4297 19 15V14H21C21.5523 14 22 13.5523 22 13C22 12.4477 21.5523 12 21 12H19V11C19 10.5285 18.9184 10.076 18.7686 9.65593L21.0441 8.95578C21.5719 8.79336 21.8682 8.23378 21.7058 7.70591C21.5434 7.17805 20.9838 6.8818 20.4559 7.04422L17.5678 7.93288C17.3907 7.78447 17.2006 7.65112 16.9994 7.53479ZM12 4C10.3431 4 9 5.34315 9 7H15C15 5.34315 13.6569 4 12 4Z" />
    </svg>
  )
}
