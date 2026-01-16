import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '../components/Toast'
import { useServer } from '../App'

interface Report {
  id: string
  serverId: string
  serverName: string
  initiator_steam_id: string
  initiator_name: string
  initiator_avatar?: string
  target_steam_id: string
  target_name: string
  target_avatar?: string
  target_kd?: number
  target_reports_count?: number
  reason: string
  message: string
  timestamp: number
  date: string
}

function DateIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M19 4H5C3.9 4 3 4.9 3 6V20C3 21.1 3.9 22 5 22H19C20.1 22 21 21.1 21 20V6C21 4.9 20.1 4 19 4ZM19 20H5V10H19V20ZM19 8H5V6H19V8ZM7 14H17V16H7V14ZM7 12H17V14H7V12Z"/>
    </svg>
  )
}

function ServerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M20 4H4C2.9 4 2 4.9 2 6V10H22V6C22 4.9 21.1 4 20 4ZM4 8C3.45 8 3 8.45 3 9C3 9.55 3.45 10 4 10C4.55 10 5 9.55 5 9C5 8.45 4.55 8 4 8ZM22 12H2V18C2 19.1 2.9 20 4 20H20C21.1 20 22 19.1 22 18V12ZM4 16C3.45 16 3 16.45 3 17C3 17.55 3.45 18 4 18C4.55 18 5 17.55 5 17C5 16.45 4.55 16 4 16Z"/>
    </svg>
  )
}

function ReporterIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4ZM12 14C8.67 14 2 15.67 2 19V20C2 20.55 2.45 21 3 21H21C21.55 21 22 20.55 22 20V19C22 15.67 15.33 14 12 14Z"/>
    </svg>
  )
}

function SuspectIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4ZM12 14C8.67 14 2 15.67 2 19V20C2 20.55 2.45 21 3 21H21C21.55 21 22 20.55 22 20V19C22 15.67 15.33 14 12 14Z"/>
    </svg>
  )
}

function KdIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M7 8V16H9V13H11V16H13V8H11V11H9V8H7ZM17 12V16H19V12H17ZM15 8V16H17V14H19C19.55 14 20 13.55 20 13V11C20 10.45 19.55 10 19 10H15V8ZM17 12H19V11H17V12Z"/>
    </svg>
  )
}

function ReportsCountIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M14 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.89 22 5.99 22H18C19.1 22 20 21.1 20 20V8L14 2ZM16 18H8V16H16V18ZM16 14H8V12H16V14ZM13 9V3.5L18.5 9H13Z"/>
    </svg>
  )
}

function ReasonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12S6.48 22 12 22 22 17.52 22 12 17.52 2 12 2ZM13 17H11V15H13V17ZM13 13H11V7H13V13Z"/>
    </svg>
  )
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="#525252">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.29289 7.29289C9.68342 6.90237 10.3166 6.90237 10.7071 7.29289L14.1768 10.7626C14.8602 11.446 14.8602 12.554 14.1768 13.2374L10.7071 16.7071C10.3166 17.0976 9.68342 17.0976 9.29289 16.7071C8.90237 16.3166 8.90237 15.6834 9.29289 15.2929L12.5858 12L9.29289 8.70711C8.90237 8.31658 8.90237 7.68342 9.29289 7.29289Z"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20">
      <path d="M5.93777 20.0665L6.93555 20L5.93777 20.0665ZM18.0622 20.0665L17.0644 20L18.0622 20.0665ZM3 5C2.44772 5 2 5.44772 2 6C2 6.55228 2.44772 7 3 7V5ZM21 7C21.5523 7 22 6.55228 22 6C22 5.44772 21.5523 5 21 5V7ZM11 11C11 10.4477 10.5523 10 10 10C9.44772 10 9 10.4477 9 11H11ZM9 16C9 16.5523 9.44772 17 10 17C10.5523 17 11 16.5523 11 16H9ZM15 11C15 10.4477 14.5523 10 14 10C13.4477 10 13 10.4477 13 11H15ZM13 16C13 16.5523 13.4477 17 14 17C14.5523 17 15 16.5523 15 16H13ZM14.9056 6.24926C15.0432 6.78411 15.5884 7.1061 16.1233 6.96844C16.6581 6.83078 16.9801 6.28559 16.8424 5.75074L14.9056 6.24926ZM4.00221 6.06652L4.93998 20.133L6.93555 20L5.99779 5.93348L4.00221 6.06652ZM6.93555 22H17.0644V20H6.93555V22ZM19.06 20.133L19.9978 6.06652L18.0022 5.93348L17.0644 20L19.06 20.133ZM19 5H5V7H19V5ZM3 7H5V5H3V7ZM19 7H21V5H19V7ZM17.0644 22C18.1174 22 18.99 21.1836 19.06 20.133L17.0644 20L17.0644 20V22ZM4.93998 20.133C5.01002 21.1836 5.88262 22 6.93555 22V20L6.93555 20L4.93998 20.133ZM9 11V16H11V11H9ZM13 11V16H15V11H13ZM12 4C13.3965 4 14.5725 4.95512 14.9056 6.24926L16.8424 5.75074C16.2874 3.59442 14.3312 2 12 2V4ZM9.09447 6.24926C9.42756 4.95512 10.6035 4 12 4V2C9.66885 2 7.7126 3.59442 7.1576 5.75074L9.09447 6.24926Z" fill="currentColor"/>
    </svg>
  )
}


interface ReportsProps {
  targetSteamId?: string
  isPlayerProfile?: boolean
}

export default function Reports({ targetSteamId, isPlayerProfile }: ReportsProps = {}) {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const { showToast } = useToast()
  const { serverId, serverSlug } = useServer()
  const navigate = useNavigate()

  // Открыть профиль игрока на странице Players
  const openPlayer = (steamId: string) => {
    navigate(`/${serverSlug}/players?player=${steamId}`)
  }

  const fetchReports = async () => {
    if (!serverId && !targetSteamId) return
    setLoading(true)
    setError(null)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const url = `/api/servers/${serverId}/reports`
      const res = await fetch(url, { signal: controller.signal })
      clearTimeout(timeoutId)
      if (!res.ok) throw new Error(`Ошибка ${res.status}: ${res.statusText}`)
      let data = await res.json()
      if (targetSteamId) data = data.filter((r: Report) => r.target_steam_id === targetSteamId)
      setReports(data)
      setError(null)
    } catch (err: any) {
      clearTimeout(timeoutId)
      if (err.name === 'AbortError') {
        setError('Таймаут: Превышено время ожидания')
        showToast('Таймаут при загрузке репортов', 'error')
      } else {
        setError(err.message || 'Ошибка загрузки')
        showToast(err.message || 'Ошибка', 'error')
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (serverId || targetSteamId) fetchReports()
  }, [serverId, targetSteamId])

  const deleteReport = async (id: string) => {
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' })
      if (res.ok) { showToast('Репорт удален'); fetchReports() }
      else showToast('Ошибка при удалении', 'error')
    } catch { showToast('Ошибка сети', 'error') }
  }

  const formatDateParts = (timestamp: number) => {
    const date = new Date(timestamp)
    return {
      date: date.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      time: date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    }
  }


  return (
    <div className={`page reports-page ${isPlayerProfile ? 'in-profile' : ''}`}>
      <div className="reports-table-container">
        <div className="reports-table">
          <div className="table-header">
            <div className="th date-col"><DateIcon /><span>Дата</span></div>
            {!isPlayerProfile && <div className="th server-col"><ServerIcon /><span>Сервер</span></div>}
            <div className="th player-col"><ReporterIcon /><span>Отправил жалобу</span></div>
            {!isPlayerProfile && (
              <>
                <div className="th arrow-col"></div>
                <div className="th player-col"><SuspectIcon /><span>Подозреваемый</span></div>
              </>
            )}
            <div className="th spacer-col"></div>
            {!isPlayerProfile && <div className="th kd-col"><KdIcon /><span>K/D</span></div>}
            <div className="th reports-col"><ReportsCountIcon /><span>Жалоб</span></div>
            <div className="th reason-col"><ReasonIcon /><span>Причина</span></div>
            <div className="th actions-col"></div>
          </div>
          <div className="table-body">
            {loading ? null : error ? (
              <div className="table-empty table-error">
                <div className="error-title">Ошибка загрузки</div>
                <div className="error-message">{error}</div>
                <button className="retry-btn" onClick={fetchReports}>Повторить</button>
              </div>
            ) : reports.length === 0 ? (
              <div className="table-empty">Репортов пока нет</div>
            ) : (
              reports.map(report => {
                const { date, time } = formatDateParts(report.timestamp)
                return (
                  <div className="table-row" key={report.id}>
                    <div className="td date-col">
                      <div className="date-cell">
                        <span className="date-main">{date}</span>
                        <span className="date-time">{time}</span>
                      </div>
                    </div>
                    {!isPlayerProfile && <div className="td server-col"><span className="server-name">{report.serverName}</span></div>}
                    <div className="td player-col">
                      <div className="player-box clickable" onClick={() => openPlayer(report.initiator_steam_id)}>
                        <div className="player-avatar-wrap">
                          <img src={report.initiator_avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" className="player-avatar" />
                          <div className="status-badge offline"></div>
                        </div>
                        <div className="player-info">
                          <span className="player-name">{report.initiator_name}</span>
                          <span className="player-steamid">{report.initiator_steam_id}</span>
                        </div>
                      </div>
                    </div>
                    {!isPlayerProfile && (
                      <>
                        <div className="td arrow-cell arrow-col"><ArrowIcon /></div>
                        <div className="td player-col">
                          <div className="player-box target clickable" onClick={() => openPlayer(report.target_steam_id)}>
                            <div className="player-avatar-wrap">
                              <img src={report.target_avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} alt="" className="player-avatar" />
                              <div className="status-badge offline"></div>
                            </div>
                            <div className="player-info">
                              <span className="player-name">{report.target_name}</span>
                              <span className="player-steamid">{report.target_steam_id}</span>
                            </div>
                          </div>
                        </div>
                      </>
                    )}
                    <div className="td spacer-col"></div>
                    {!isPlayerProfile && <div className="td kd-col"><span className="kd-value">{(report.target_kd || 0).toFixed(2)}</span></div>}
                    <div className="td reports-col"><span className="reports-count">{report.target_reports_count || 1} шт.</span></div>
                    <div className="td reason-col"><div className="reason-badge">{report.reason}</div></div>
                    <div className="td actions-cell actions-col">
                      <button className="delete-btn" onClick={() => deleteReport(report.id)} title="Удалить"><TrashIcon /></button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
      <style>{`

        .reports-page { margin: -40px; padding: 0; width: calc(100vw - 260px); max-width: none; }
        .reports-page.in-profile { margin: 0; width: 100%; }
        .main-content.collapsed .reports-page { width: calc(100vw - 60px); }
        .main-content.collapsed .reports-page.in-profile { width: 100%; }
        .reports-table-container { background: #151515; border-bottom: 1px solid #262626; width: 100%; }
        .in-profile .reports-table-container { background: transparent; border-bottom: none; }
        .reports-table { width: 100%; overflow: hidden; }
        .table-header { display: flex; border-bottom: 1px solid #262626; background: #151515; }
        .in-profile .table-header { background: #1a1a1a; border-bottom: 1px solid #333; }
        .th { padding: 14px 16px; color: #525252; font-size: 12px; font-weight: 500; text-transform: uppercase; white-space: nowrap; display: flex; align-items: center; gap: 8px; }
        .th svg { width: 16px; height: 16px; fill: #525252; flex-shrink: 0; }
        .th.date-col { min-width: 120px; flex: 0 0 140px; }
        .th.server-col { min-width: 140px; flex: 0 0 160px; }
        .th.player-col { min-width: 200px; flex: 1 1 0; }
        .in-profile .th.player-col { min-width: 150px; }
        .th.arrow-col { min-width: 30px; flex: 0 0 40px; }
        .th.spacer-col { min-width: 10px; flex: 0 0 20px; }
        .th.kd-col { min-width: 70px; flex: 0 0 90px; }
        .th.reports-col { min-width: 80px; flex: 0 0 100px; }
        .th.reason-col { min-width: 120px; flex: 0 0 150px; }
        .th.actions-col { min-width: 50px; flex: 1 0 70px; }
        .table-body { background: #0f0f0f; }
        .in-profile .table-body { background: transparent; }
        .table-row { display: flex; border-bottom: 1px solid #1a1a1a; transition: background 0.15s; }
        .table-row:hover { background: #1a1a1a; }
        .td { padding: 12px 16px; display: flex; align-items: center; min-width: 0; }
        .td.date-col { min-width: 120px; flex: 0 0 140px; }
        .td.server-col { min-width: 140px; flex: 0 0 160px; }
        .td.player-col { min-width: 200px; flex: 1 1 0; }
        .in-profile .td.player-col { min-width: 150px; }
        .td.arrow-col { min-width: 30px; flex: 0 0 40px; }
        .td.spacer-col { min-width: 10px; flex: 0 0 20px; }
        .td.kd-col { min-width: 70px; flex: 0 0 90px; }
        .td.reports-col { min-width: 80px; flex: 0 0 100px; }
        .td.reason-col { min-width: 120px; flex: 0 0 150px; }
        .td.actions-col { min-width: 50px; flex: 1 0 70px; }
        .date-cell { display: flex; flex-direction: column; gap: 2px; }
        .date-main { color: #a3a3a3; font-size: 13px; font-weight: 500; }
        .date-time { color: #525252; font-size: 12px; }
        .server-name { color: #525252; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .player-box { display: flex; align-items: center; gap: 10px; min-width: 0; width: 100%; }
        .player-box.clickable { cursor: pointer; border-radius: 8px; padding: 4px; margin: -4px; transition: background 0.15s; }
        .player-box.clickable:hover { background: #262626; }
        .player-avatar-wrap { position: relative; width: 36px; height: 36px; }
        .player-avatar { width: 36px; height: 36px; border-radius: 50%; background: #262626; }
        .status-badge { position: absolute; bottom: -2px; right: -2px; width: 12px; height: 12px; border-radius: 50%; border: 2px solid #0f0f0f; }
        .status-badge.offline { background: #525252; }
        .status-badge.online { background: #22c55e; }
        .player-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
        .player-name { color: #e5e5e5; font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .player-steamid { color: #525252; font-size: 11px; font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .arrow-cell { justify-content: center; }
        .kd-value { color: #a3a3a3; font-size: 13px; font-weight: 500; font-variant-numeric: tabular-nums; text-decoration: underline; text-decoration-style: dashed; text-underline-offset: 4px; text-decoration-color: #404040; cursor: help; }
        .reports-count { color: #a3a3a3; font-size: 13px; font-weight: 500; }
        .reason-badge { background: #262626; color: #a3a3a3; padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 500; border: 1px solid #333; }
        .actions-cell { justify-content: flex-end; }
        .delete-btn { background: transparent; border: 1px solid #333; color: #525252; cursor: pointer; padding: 6px 8px; border-radius: 6px; transition: all 0.15s; display: flex; align-items: center; justify-content: center; }
        .delete-btn:hover { background: #1a1a1a; border-color: #404040; color: #a3a3a3; }
        .table-empty { padding: 60px 20px; text-align: center; color: #525252; font-size: 14px; }
        .table-error { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 40px 20px; }
        .error-title { color: #ef4444; font-size: 16px; font-weight: 600; }
        .error-message { color: #a3a3a3; font-size: 14px; max-width: 600px; line-height: 1.5; }
        .retry-btn { background: #262626; border: 1px solid #404040; color: #e5e5e5; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; transition: all 0.15s; margin-top: 8px; }
        .retry-btn:hover { background: #333; border-color: #525252; }
      `}</style>
    </div>
  )
}