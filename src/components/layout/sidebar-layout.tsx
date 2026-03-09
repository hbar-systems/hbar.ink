'use client'

import { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { formatDistanceToNow } from 'date-fns'
import JSZip from 'jszip'
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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState('')
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  
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
  
  // Handle deleting a document
  const handleDeleteDocument = async (docId: string) => {
    try {
      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('id', docId)

      if (error) {
        console.error('Error deleting document:', error)
        showToast(`Failed to delete: ${error.message}`, 'error')
        return
      }

      showToast('Document deleted', 'success')
      setDeleteConfirmId(null)
      setDeleteConfirmTitle('')

      // Remove from local state
      setDocuments(prev => prev.filter(d => d.id !== docId))

      // If we're viewing the deleted doc, go to /app
      if (pathname === `/doc/${docId}`) {
        router.push('/app')
      }
    } catch (error) {
      console.error('Error deleting document:', error)
      showToast('Failed to delete document', 'error')
    }
  }

  // Handle exporting all documents as ZIP
  const handleExportAll = async () => {
    if (isExporting) return
    setIsExporting(true)
    
    try {
      const { data: allDocs, error } = await supabase
        .from('documents')
        .select('*')
        .order('updated_at', { ascending: false })

      if (error || !allDocs || allDocs.length === 0) {
        showToast(error ? `Export failed: ${error.message}` : 'No documents to export', 'error')
        setIsExporting(false)
        return
      }

      const zip = new JSZip()
      const date = new Date().toISOString().split('T')[0]

      allDocs.forEach((doc: Document) => {
        const sanitizedTitle = (doc.title || 'untitled').replace(/[^a-z0-9]/gi, '-').toLowerCase()
        const filename = `${sanitizedTitle}__${doc.system}__${doc.status}.md`
        const header = `# ${doc.title || 'Untitled'}\n\n---\nsystem: ${doc.system}\nkind: ${doc.source_kind}\nstatus: ${doc.status}\nai_policy: ${doc.ai_policy}\ncreated: ${doc.created_at}\nupdated: ${doc.updated_at}\n---\n\n`
        zip.file(filename, header + doc.content_md)
      })

      const blob = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hbar-ink-export__${date}.zip`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showToast(`Exported ${allDocs.length} documents`, 'success')
    } catch (error) {
      console.error('Export error:', error)
      showToast('Failed to export documents', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  // Handle deleting account
  const handleDeleteAccount = async () => {
    try {
      // Delete all documents first
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        showToast('Not authenticated', 'error')
        return
      }

      const { error: docsError } = await supabase
        .from('documents')
        .delete()
        .eq('owner_id', user.id)

      if (docsError) {
        console.error('Error deleting documents:', docsError)
        showToast(`Failed to delete documents: ${docsError.message}`, 'error')
        return
      }

      // Sign out (Supabase doesn't allow self-delete via client SDK,
      // but we've wiped all user data)
      await supabase.auth.signOut()
      
      showToast('All data deleted. Account signed out.', 'success')
      setShowDeleteAccount(false)
      router.push('/login')
    } catch (error) {
      console.error('Error deleting account:', error)
      showToast('Failed to delete account', 'error')
    }
  }

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
                            <div className="flex flex-col gap-1">
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
                              <button
                                onClick={(e) => {
                                  e.preventDefault()
                                  setDeleteConfirmId(doc.id)
                                  setDeleteConfirmTitle(doc.title || 'Untitled')
                                }}
                                className="text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete document"
                              >
                                🗑
                              </button>
                            </div>
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
                          <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                togglePin(doc.id)
                              }}
                              className="text-gray-400 hover:text-gray-600"
                              title="Pin document"
                            >
                              📌
                            </button>
                            <button
                              onClick={(e) => {
                                e.preventDefault()
                                setDeleteConfirmId(doc.id)
                                setDeleteConfirmTitle(doc.title || 'Untitled')
                              }}
                              className="text-gray-300 hover:text-red-500"
                              title="Delete document"
                            >
                              �
                            </button>
                          </div>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        {/* Account actions at bottom */}
        <div className="p-4 border-t border-gray-200 space-y-2">
          <button
            onClick={handleExportAll}
            disabled={isExporting}
            className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:text-gray-700 hover:bg-white/50 transition-colors rounded"
          >
            {isExporting ? 'Exporting...' : 'Download all as ZIP'}
          </button>
          <button
            onClick={() => setShowDeleteAccount(true)}
            className="w-full text-left px-3 py-2 text-xs text-gray-400 hover:text-red-500 transition-colors rounded"
          >
            Delete account & data
          </button>
        </div>
      </div>
      
      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {/* Delete account confirmation modal */}
      {showDeleteAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Delete account?</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will permanently delete <strong>all your documents</strong> and sign you out. This cannot be undone.
            </p>
            <p className="text-sm text-gray-500 mb-2">
              We recommend downloading your documents first.
            </p>
            <button
              onClick={handleExportAll}
              disabled={isExporting}
              className="mb-4 text-xs text-blue-600 hover:text-blue-800 underline"
            >
              {isExporting ? 'Exporting...' : 'Download all as ZIP first'}
            </button>
            <p className="text-sm text-gray-600 mb-2">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteAccountConfirmText}
              onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="Type DELETE"
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowDeleteAccount(false); setDeleteAccountConfirmText('') }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteAccountConfirmText !== 'DELETE'}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                Delete everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Delete document?</h3>
            <p className="text-sm text-gray-500 mb-6">
              <strong>{deleteConfirmTitle}</strong> will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setDeleteConfirmId(null); setDeleteConfirmTitle('') }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteConfirmId && handleDeleteDocument(deleteConfirmId)}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
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
