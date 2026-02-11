'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface FocusModeContextType {
  focusMode: boolean
  toggleFocusMode: () => void
}

const FocusModeContext = createContext<FocusModeContextType | undefined>(undefined)

export function useFocusMode() {
  const context = useContext(FocusModeContext)
  if (!context) {
    throw new Error('useFocusMode must be used within FocusModeProvider')
  }
  return context
}

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focusMode, setFocusMode] = useState(false)

  // Sync with localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('focus-mode') === 'true'
    setFocusMode(saved)
  }, [])

  const toggleFocusMode = () => {
    const newValue = !focusMode
    setFocusMode(newValue)
    localStorage.setItem('focus-mode', String(newValue))
  }

  // Global keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + \ to toggle
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        toggleFocusMode()
      }
      // Esc to exit focus mode
      if (e.key === 'Escape' && focusMode) {
        e.preventDefault()
        setFocusMode(false)
        localStorage.setItem('focus-mode', 'false')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusMode])

  return (
    <FocusModeContext.Provider value={{ focusMode, toggleFocusMode }}>
      {children}
    </FocusModeContext.Provider>
  )
}
