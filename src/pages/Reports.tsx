import { useState, useEffect } from 'react'
import { useToast } from '../components/Toast'

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
  reason: string
  message: string
  timestamp: number
  date: string
}

function DonutChart({ kills, deaths }: { kills: number, deaths: number }) {
  const [animatedProgress, setAnimatedProgress] = useState(0)
  const total = kills + deaths || 1
  
  useEffect(() => {
    setAnimatedProgress(0)
    const timer = setTimeout(() => {
      setAnimatedProgress(1)
    }, 50)
    return () => clearTimeout(timer)
  }, [kills, deaths])
  
  const radius = 50
  const cx = 60
  const cy = 60
  const innerRadius = 32
  const circumference = 2 * Math.PI * radius
  
  const killsPercent = (kills / total) * animatedProgress
  const deathsPercent = (deaths / total) * animatedProgress
  
  const deathsOffset = circumference * (1 - deathsPercent)
  
  return (
    <svg width="40" height="40" viewBox="0 0 120 120" style={{ transform: 'rotate(-90deg)' }}>
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#333"
        strokeWidth={radius - innerRadius}
      />
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#6F6F6F"
        strokeWidth={radius - innerRadius}
        strokeDasharray={circumference}
        strokeDashoffset={deathsOffset}
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
      <circle
        cx={cx}
        cy={cy}
        r={(radius + innerRadius) / 2}
        fill="none"
        stroke="#BBC94E"
        strokeWidth={radius - innerRadius}
        strokeDasharray={`${circumference * killsPercent} ${circumference}`}
        strokeDashoffset={-circumference * deathsPercent}
        style={{ transition: 'stroke-dasharray 0.8s ease-out, stroke-dashoffset 0.8s ease-out' }}
      />
    </svg>
  )
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" width="18" height="18"><path d="M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19ZM19 4H15.5L14.5 3H9.5L8.5 4H5V6H19V4Z" fill="currentColor"/></svg>
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const { showToast } = useToast()

  const fetchReports = () => {
    fetch('/api/reports')
      .then(res => res.json())
      .then(data => {
        setReports(data)
        setLoading(false)
      })
      .catch(err => {
        console.error('Error fetching reports:', err)
        setLoading(false)
      })
  }

  useEffect(() => {
    fetchReports()
  }, [])

  const deleteReport = async (id: string) => {
    if (!window.confirm('Вы уверены, что хотите удалить этот репорт?')) return
    
    try {
      const res = await fetch(`/api/reports/${id}`, { method: 'DELETE' })
      if (res.ok) {
        showToast('Репорт удален')
        fetchReports()
      } else {
        showToast('Ошибка при удалении репорта', 'error')
      }
    } catch (err) {
      showToast('Ошибка сети', 'error')
    }
  }

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Репорты</h1>
          <p className="page-desc">Жалобы игроков на читерство и другие нарушения</p>
        </div>
      </div>

      <div className="reports-container">
        {loading ? (
          <div className="loading">Загрузка репортов...</div>
        ) : reports.length === 0 ? (
          <div className="empty-state">Репортов пока нет</div>
        ) : (
          <table className="players-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Сервер</th>
                <th>Отправитель</th>
                <th>Подозреваемый</th>
                <th>K/D</th>
                <th>Причина</th>
                <th>Сообщение</th>
                <th style={{ width: '50px' }}></th>
              </tr>
            </thead>
            <tbody>
              {reports.map(report => (
                <tr key={report.id}>
                  <td className="date-cell">
                    <div className="report-date">{formatDate(report.timestamp)}</div>
                  </td>
                  <td>
                    <div className="report-server">{report.serverName}</div>
                  </td>
                  <td>
                    <div className="player-cell">
                      <img 
                        src={report.initiator_avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} 
                        alt="" 
                        className="player-avatar-small"
                      />
                      <div className="player-info">
                        <div className="player-name">{report.initiator_name}</div>
                        <div className="player-steamid">{report.initiator_steam_id}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="player-cell">
                      <img 
                        src={report.target_avatar || 'https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg'} 
                        alt="" 
                        className="player-avatar-small red-border"
                      />
                      <div className="player-info">
                        <div className="player-name-red">{report.target_name}</div>
                        <div className="player-steamid">{report.target_steam_id}</div>
                      </div>
                    </div>
                  </td>
                  <td className="kd-cell">
                    <div className="kd-wrapper">
                      <DonutChart kills={report.target_kd ? Math.round(report.target_kd * 10) : 0} deaths={10} />
                      <span className="kd-value">{(report.target_kd || 0).toFixed(2)}</span>
                    </div>
                  </td>
                  <td>
                    <span className="reason-badge">{report.reason}</span>
                  </td>
                  <td>
                    <div className="report-message" title={report.message}>{report.message || '-'}</div>
                  </td>
                  <td>
                    <button className="action-btn delete" onClick={() => deleteReport(report.id)} title="Удалить репорт">
                      <TrashIcon />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .reports-container {
          background: #1a1a1a;
          border-radius: 12px;
          overflow: hidden;
          margin-top: 20px;
          border: 1px solid #333;
        }
        .players-table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        .players-table th {
          padding: 16px;
          color: #737373;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
          border-bottom: 1px solid #333;
        }
        .players-table td {
          padding: 12px 16px;
          border-bottom: 1px solid #262626;
          vertical-align: middle;
        }
        .player-cell {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .player-avatar-small {
          width: 32px;
          height: 32px;
          border-radius: 6px;
          background: #333;
        }
        .player-avatar-small.red-border {
          border: 1px solid #ef4444;
        }
        .player-info {
          display: flex;
          flex-direction: column;
        }
        .player-name {
          color: #e5e5e5;
          font-weight: 500;
          font-size: 14px;
        }
        .player-name-red {
          color: #ef4444;
          font-weight: 600;
          font-size: 14px;
        }
        .player-steamid {
          color: #737373;
          font-size: 11px;
        }
        .kd-cell {
          width: 100px;
        }
        .kd-wrapper {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .kd-value {
          color: #BBC94E;
          font-weight: 600;
          font-size: 14px;
        }
        .reason-badge {
          background: rgba(239, 68, 68, 0.15);
          color: #ef4444;
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          border: 1px solid rgba(239, 68, 68, 0.3);
        }
        .report-message {
          color: #a3a3a3;
          font-size: 13px;
          max-width: 250px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .date-cell {
          white-space: nowrap;
        }
        .report-date {
          color: #737373;
          font-size: 13px;
        }
        .report-server {
          color: #3b82f6;
          font-weight: 600;
          font-size: 13px;
        }
        .action-btn {
          background: transparent;
          border: none;
          color: #737373;
          cursor: pointer;
          padding: 8px;
          border-radius: 6px;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .action-btn:hover {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
        }
        .action-btn.delete:hover {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
        .loading, .empty-state {
          padding: 60px;
          text-align: center;
          color: #737373;
          font-size: 15px;
        }
      `}</style>
    </div>
  )
}
