'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface AppContextType {
  focusMode: boolean
  toggleFocusMode: () => void
  stylePreset: string
  setStylePreset: (preset: string) => void
}

const AppContext = createContext<AppContextType | undefined>(undefined)

export function useFocusMode() {
  const context = useContext(AppContext)
  if (!context) throw new Error('useFocusMode must be used within FocusModeProvider')
  return context
}

export function FocusModeProvider({ children }: { children: ReactNode }) {
  const [focusMode, setFocusMode] = useState(false)
  const [stylePreset, setStylePresetState] = useState('WritersRoom')

  useEffect(() => {
    setFocusMode(localStorage.getItem('focus-mode') === 'true')
    setStylePresetState(localStorage.getItem('style-preset') || 'WritersRoom')
  }, [])

  const toggleFocusMode = () => {
    const next = !focusMode
    setFocusMode(next)
    localStorage.setItem('focus-mode', String(next))
  }

  const setStylePreset = (preset: string) => {
    setStylePresetState(preset)
    localStorage.setItem('style-preset', preset)
  }

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        toggleFocusMode()
      }
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
    <AppContext.Provider value={{ focusMode, toggleFocusMode, stylePreset, setStylePreset }}>
      {children}
    </AppContext.Provider>
  )
}
