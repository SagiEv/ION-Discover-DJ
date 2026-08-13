import React, { useEffect } from 'react'
import { useAppStore } from '../store/appStore.js'

export function ToastContainer() {
  const toasts = useAppStore(s => s.toasts)
  const removeToast = useAppStore(s => s.removeToast)

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => removeToast(toast.id)} />
      ))}
    </div>
  )
}

const SuccessIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
    <polyline points="22 4 12 14.01 9 11.01"/>
  </svg>
)

const ErrorIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="15" y1="9" x2="9" y2="15"/>
    <line x1="9" y1="9" x2="15" y2="15"/>
  </svg>
)

const WarningIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>
  </svg>
)

const InfoIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-a)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"/>
    <line x1="12" y1="16" x2="12" y2="12"/>
    <line x1="12" y1="8" x2="12.01" y2="8"/>
  </svg>
)

function ToastItem({ toast, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, toast.duration || 4000)
    return () => clearTimeout(timer)
  }, [toast.id, toast.duration, onDismiss])

  const IconComponent = toast.type === 'success' ? SuccessIcon
    : toast.type === 'error' ? ErrorIcon
    : toast.type === 'warning' ? WarningIcon
    : InfoIcon

  return (
    <div className={`toast toast--${toast.type || 'info'}`} onClick={onDismiss}>
      <span className="toast__icon"><IconComponent /></span>
      <span className="toast__message">{toast.message}</span>
    </div>
  )
}
