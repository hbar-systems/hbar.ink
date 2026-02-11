'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

export type ToastType = 'success' | 'error' | 'info'

interface ToastProps {
  message: string
  type?: ToastType
  duration?: number
  onClose?: () => void
}

export function Toast({ message, type = 'info', duration = 3000, onClose }: ToastProps) {
  const [isVisible, setIsVisible] = useState(true)
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(false)
      if (onClose) onClose()
    }, duration)
    
    return () => clearTimeout(timer)
  }, [duration, onClose])
  
  const bgColor = type === 'success' ? 'bg-green-500' :
                  type === 'error' ? 'bg-red-500' :
                  'bg-blue-500'
  
  if (!isVisible) return null
  
  return (
    <div className={`fixed bottom-4 right-4 px-4 py-2 rounded shadow-lg text-white ${bgColor} transition-opacity duration-300 flex items-center`}>
      <span>{message}</span>
      <button 
        onClick={() => {
          setIsVisible(false)
          if (onClose) onClose()
        }}
        className="ml-3 text-white hover:text-gray-200"
      >
        &times;
      </button>
    </div>
  )
}

interface ToastContainerProps {
  toasts: Array<{
    id: string
    message: string
    type: ToastType
  }>
  removeToast: (id: string) => void
}

export function ToastContainer({ toasts, removeToast }: ToastContainerProps) {
  const [isMounted, setIsMounted] = useState(false)
  
  useEffect(() => {
    setIsMounted(true)
    return () => setIsMounted(false)
  }, [])
  
  if (!isMounted) return null
  
  return createPortal(
    <div className="fixed bottom-0 right-0 p-4 z-50 flex flex-col space-y-2">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => removeToast(toast.id)}
        />
      ))}
    </div>,
    document.body
  )
}

// Toast context and provider
import { createContext, useContext, ReactNode } from 'react'

interface ToastContextType {
  showToast: (message: string, type?: ToastType) => void
}

const ToastContext = createContext<ToastContextType | undefined>(undefined)

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider')
  }
  return context
}

interface ToastProviderProps {
  children: ReactNode
}

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Array<{
    id: string
    message: string
    type: ToastType
  }>>([])
  
  const showToast = (message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).substring(2, 9)
    setToasts(prev => [...prev, { id, message, type }])
  }
  
  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id))
  }
  
  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  )
}
