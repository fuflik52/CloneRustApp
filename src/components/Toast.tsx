import { useState, createContext, useContext, useCallback, useEffect } from 'react'

interface Toast {
  id: number
  message: string
  subtitle?: string
  type: 'success' | 'error' | 'info'
  hiding?: boolean
}

interface ToastContextType {
  showToast: (message: string, type?: 'success' | 'error' | 'info', subtitle?: string) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used within ToastProvider')
  return context
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const hideToast = useCallback((id: number) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, hiding: true } : t))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
  }, [])

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success', subtitle?: string) => {
    const id = Date.now()
    
    setToasts(prev => {
      // Если уже 5 — скрываем самый старый
      if (prev.filter(t => !t.hiding).length >= 5) {
        const oldest = prev.find(t => !t.hiding)
        if (oldest) {
          setTimeout(() => hideToast(oldest.id), 0)
        }
      }
      return [...prev, { id, message, type, subtitle }]
    })
    
    // Автоудаление через 3 сек
    setTimeout(() => hideToast(id), 3000)
  }, [hideToast])

  // Консольные команды для тестирования
  useEffect(() => {
    (window as any).toast = (msg: string) => showToast(msg);
    (window as any).toastError = (msg: string, sub?: string) => showToast(msg, 'error', sub)
    return () => { delete (window as any).toast; delete (window as any).toastError }
  }, [showToast])

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type} ${toast.hiding ? 'toast-hiding' : ''}`}>
            {toast.type === 'error' ? <ErrorIcon /> : toast.type === 'info' ? <InfoIcon /> : <CheckIcon />}
            <div className="toast-content">
              <span className="toast-message">{toast.message}</span>
              {toast.subtitle && <span className="toast-subtitle">{toast.subtitle}</span>}
            </div>
            {toast.type === 'error' && (
              <button className="toast-copy-btn" onClick={() => {
                const text = toast.subtitle ? `${toast.message}: ${toast.subtitle}` : toast.message
                if (navigator.clipboard && navigator.clipboard.writeText) {
                  navigator.clipboard.writeText(text)
                } else {
                  const textarea = document.createElement('textarea')
                  textarea.value = text
                  document.body.appendChild(textarea)
                  textarea.select()
                  document.execCommand('copy')
                  document.body.removeChild(textarea)
                }
                showToast('Ошибка скопирована')
              }} title="Копировать ошибку">
                <CopyIcon />
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

function CopyIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20"><path fillRule="evenodd" clipRule="evenodd" d="M7 5C7 3.89543 7.89543 3 9 3H18C19.1046 3 20 3.89543 20 5V14C20 15.1046 19.1046 16 18 16H16V18C16 19.1046 15.1046 20 14 20H6C4.89543 20 4 19.1046 4 18V9C4 7.89543 4.89543 7 6 7H7V5ZM9 7H14C15.1046 7 16 7.89543 16 9V14H18V5H9V7ZM6 9H14V18H6V9Z" fill="currentColor"/></svg>
}

function ErrorIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z" fill="currentColor"/></svg>
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/></svg>
}

function InfoIcon() {
  return <svg viewBox="0 0 24 24" width="20" height="20"><path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" fill="currentColor"/></svg>
}
