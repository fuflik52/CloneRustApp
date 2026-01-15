import { useState, useEffect } from 'react'

interface Report {
  id: string
  serverId: string
  serverName: string
  initiator_steam_id: string
  initiator_name: string
  target_steam_id: string
  target_name: string
  reason: string
  message: string
  timestamp: number
  date: string
}

export default function Reports() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
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
  }, [])

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
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
                <th>Причина</th>
                <th>Сообщение</th>
              </tr>
            </thead>
            <tbody>
              {reports.map(report => (
                <tr key={report.id}>
                  <td>
                    <div className="report-date">{formatDate(report.timestamp)}</div>
                  </td>
                  <td>
                    <div className="report-server">{report.serverName}</div>
                  </td>
                  <td>
                    <div className="player-info">
                      <div className="player-name">{report.initiator_name}</div>
                      <div className="player-steamid">{report.initiator_steam_id}</div>
                    </div>
                  </td>
                  <td>
                    <div className="player-info">
                      <div className="player-name-red">{report.target_name}</div>
                      <div className="player-steamid">{report.target_steam_id}</div>
                    </div>
                  </td>
                  <td>
                    <span className="reason-badge">{report.reason}</span>
                  </td>
                  <td>
                    <div className="report-message">{report.message || '-'}</div>
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
          border-radius: 8px;
          overflow: hidden;
          margin-top: 20px;
        }
        .reason-badge {
          background: rgba(239, 68, 68, 0.2);
          color: #ef4444;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 12px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .player-name-red {
          color: #ef4444;
          font-weight: 600;
        }
        .report-message {
          color: #a3a3a3;
          font-size: 13px;
          max-width: 300px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .loading, .empty-state {
          padding: 40px;
          text-align: center;
          color: #737373;
        }
        .report-date {
          color: #737373;
          font-size: 13px;
        }
        .report-server {
          color: #3b82f6;
          font-weight: 500;
        }
      `}</style>
    </div>
  )
}
