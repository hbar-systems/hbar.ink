'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'
import type { Document, DocumentStatus, DocumentSystem, DocumentAIPolicy } from '@/types/document'
import { Toast, ToastProvider, useToast } from '@/components/ui/toast'
import { FocusModeProvider, useFocusMode } from './focus-mode-wrapper'

interface SidebarLayoutProps {
  children: React.ReactNode
}

function SidebarLayoutContent({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const pathname = usePathname()
  const { showToast } = useToast()
  const { focusMode } = useFocusMode()
  
  // ALL hooks must be declared before any conditional returns
  const [sidebarVisible, setSidebarVisible] = useState(false)
  const [mouseNearEdge, setMouseNearEdge] = useState(false)
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [systemFilter, setSystemFilter] = useState<DocumentSystem | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all')
  const [aiPolicyFilter, setAiPolicyFilter] = useState<DocumentAIPolicy | 'all'>('all')
  const [availableSystems, setAvailableSystems] = useState<DocumentSystem[]>([])
  const [pinnedDocIds, setPinnedDocIds] = useState<Set<string>>(new Set())
  const [savedViews, setSavedViews] = useState<Array<{name: string, filters: any}>>([{name: 'All', filters: {}}, {name: 'Notes', filters: {kind: 'note'}}, {name: 'Prompts', filters: {kind: 'prompt'}}])
  const [activeView, setActiveView] = useState('All')
  
  // Track mouse position for edge hover
  useEffect(() => {
    if (!focusMode) return
    
    const handleMouseMove = (e: MouseEvent) => {
      setMouseNearEdge(e.clientX <= 12)
    }
    
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [focusMode])
  
  // Keyboard shortcut Cmd+B to toggle sidebar in focus mode
  useEffect(() => {
    if (!focusMode) return
    
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
        e.preventDefault()
        setSidebarVisible(prev => !prev)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [focusMode])
  
  // Show sidebar when mouse near edge or manually toggled
  useEffect(() => {
    if (focusMode && mouseNearEdge) {
      setSidebarVisible(true)
    }
  }, [focusMode, mouseNearEdge])
  
  // Load pinned docs and saved views from localStorage
  useEffect(() => {
    const pinned = localStorage.getItem('pinned-docs')
    if (pinned) {
      setPinnedDocIds(new Set(JSON.parse(pinned)))
    }
    
    const views = localStorage.getItem('saved-views')
    if (views) {
      const parsed = JSON.parse(views)
      setSavedViews([...savedViews, ...parsed])
    }
  }, [])
  
  // Toggle pin
  const togglePin = (docId: string) => {
    const newPinned = new Set(pinnedDocIds)
    if (newPinned.has(docId)) {
      newPinned.delete(docId)
    } else {
      newPinned.add(docId)
    }
    setPinnedDocIds(newPinned)
    localStorage.setItem('pinned-docs', JSON.stringify(Array.from(newPinned)))
  }
  
  // Apply view
  const applyView = (view: {name: string, filters: any}) => {
    setActiveView(view.name)
    setSystemFilter(view.filters.system || 'all')
    setStatusFilter(view.filters.status || 'all')
    setAiPolicyFilter(view.filters.aiPolicy || 'all')
  }
  
  // Fetch documents
  useEffect(() => {
    if (focusMode && !sidebarVisible) return // Don't fetch if sidebar not visible in focus mode
    
    const fetchDocuments = async () => {
      setLoading(true)
      
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .order('updated_at', { ascending: false })
      
      if (error) {
        console.error('Error fetching documents:', error)
        setLoading(false)
        return
      }
      
      if (documents) {
        setDocuments(documents as Document[])
        
        // Extract unique systems for filter dropdown
        const systemsSet = new Set<DocumentSystem>()
        documents.forEach(doc => systemsSet.add(doc.system as DocumentSystem))
        const systems = Array.from(systemsSet)
        setAvailableSystems(systems)
      }
      
      setLoading(false)
    }
    
    fetchDocuments()
  }, [supabase, focusMode, sidebarVisible, pathname])
  
  // In focus mode without sidebar visible, render only children
  if (focusMode && !sidebarVisible) {
    return <div className="min-h-screen" style={{ backgroundColor: '#f6f5f2' }}>{children}</div>
  }
  
  // Separate pinned and unpinned documents
  const pinnedDocs = documents.filter(doc => pinnedDocIds.has(doc.id))
  const unpinnedDocs = documents.filter(doc => !pinnedDocIds.has(doc.id))
  
  // Filter documents based on search query and filters
  const filteredDocuments = unpinnedDocs.filter(doc => {
    // Search query filter
    const matchesSearch = searchQuery === '' || 
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.content_md.toLowerCase().includes(searchQuery.toLowerCase())
    
    // System filter
    const matchesSystem = systemFilter === 'all' || doc.system === systemFilter
    
    // Status filter
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter
    
    // AI policy filter
    const matchesAiPolicy = aiPolicyFilter === 'all' || doc.ai_policy === aiPolicyFilter
    
    return matchesSearch && matchesSystem && matchesStatus && matchesAiPolicy
  })
  
  // Handle creating a new document
  const handleCreateDocument = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        showToast('You must be logged in to create a document', 'error')
        return
      }

      const { data, error } = await supabase
        .from('documents')
        .insert([{ 
          owner_id: user.id,
          title: 'Untitled',
          content_md: '',
          system: 'personal',
          source_kind: 'note',
          status: 'draft',
          ai_policy: 'deny',
          style_preset: 'WritersRoom',
          tags: []
        }])
        .select()
        .single()
      
      if (error) {
        console.error('Error creating document:', error)
        showToast(`Failed to create document: ${error.message}`, 'error')
        return
      }
      
      if (data) {
        router.push(`/doc/${data.id}`)
      }
    } catch (error) {
      console.error('Error creating document:', error)
      showToast(`Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    }
  }

  return (
    <div 
      className="flex h-screen" 
      style={{ backgroundColor: '#f6f5f2' }}
      onMouseLeave={() => focusMode && !mouseNearEdge && setSidebarVisible(false)}
    >
      {/* Sidebar */}
      <div 
        className={`w-80 border-r border-gray-200 flex flex-col h-full ${
          focusMode ? 'fixed left-0 top-0 z-50 shadow-2xl' : ''
        }`}
        style={{ backgroundColor: '#fafaf9' }}
        onMouseLeave={() => focusMode && setSidebarVisible(false)}
      >
        {/* Sidebar header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="text-lg opacity-40">ℏ</span>
              <h1 className="text-lg font-semibold text-gray-900" style={{ letterSpacing: '-0.01em' }}>hbar.ink</h1>
            </div>
            <form action="/auth/signout" method="post">
              <button 
                type="submit"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Sign out
              </button>
            </form>
          </div>
          <button
            onClick={handleCreateDocument}
            className="w-full px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 hover:border-gray-400 transition-colors"
          >
            New Document
          </button>
        </div>
        
        {/* Views */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center gap-1 mb-2">
            {savedViews.map(view => (
              <button
                key={view.name}
                onClick={() => applyView(view)}
                className={`px-2 py-1 text-xs transition-colors ${
                  activeView === view.name ? 'text-gray-900 font-medium' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {view.name}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-3 py-1.5 border-0 bg-white text-sm focus:outline-none focus:ring-0 placeholder-gray-400"
          />
        </div>
        
        {/* Document list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-xs text-gray-400">Loading...</div>
          ) : (
            <>
              {/* Pinned section */}
              {pinnedDocs.length > 0 && (
                <div className="mb-2">
                  <div className="px-4 py-2 text-xs font-medium text-gray-500">Pinned</div>
                  <ul>
                    {pinnedDocs.map(doc => (
                      <li key={doc.id} className="group relative">
                        <Link 
                          href={`/doc/${doc.id}`}
                          className={`block px-4 py-3 hover:bg-white/50 transition-colors ${
                            pathname === `/doc/${doc.id}` ? 'bg-white border-l-2 border-gray-400' : ''
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-900 truncate">
                                {doc.title || 'Untitled'}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-gray-400">
                                <span>{doc.system}</span>
                                <span>·</span>
                                <span>{doc.status === 'terminal' ? 'sealed' : doc.status}</span>
                              </div>
                            </div>
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                togglePin(doc.id)
                              }}
                              className="text-gray-600 hover:text-gray-800 transition-colors"
                              title="Unpin document"
                            >
                              📌
                            </button>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              
              {/* Regular documents */}
              {filteredDocuments.length === 0 && pinnedDocs.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-400">
                  {searchQuery ? 'No matches' : 'No documents'}
                </div>
              ) : (
                <ul>
                  {filteredDocuments.map(doc => (
                    <li key={doc.id} className="group relative">
                      <Link 
                        href={`/doc/${doc.id}`}
                        className={`block px-4 py-3 hover:bg-white/50 transition-colors ${
                          pathname === `/doc/${doc.id}` ? 'bg-white border-l-2 border-gray-400' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-gray-900 truncate">
                              {doc.title || 'Untitled'}
                            </p>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                              <span>{doc.system}</span>
                              <span>·</span>
                              <span>{doc.status === 'terminal' ? 'sealed' : doc.status}</span>
                              <span className="ml-auto">
                                {formatDistanceToNow(new Date(doc.updated_at), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.preventDefault()
                              togglePin(doc.id)
                            }}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                            title="Pin document"
                          >
                            📌
                          </button>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}

export default function SidebarLayout({ children }: { children: React.ReactNode }) {
  return (
    <FocusModeProvider>
      <ToastProvider>
        <SidebarLayoutContent>{children}</SidebarLayoutContent>
      </ToastProvider>
    </FocusModeProvider>
  )
}
