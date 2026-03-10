'use client'

import { useState, useEffect, useRef } from 'react'
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

const TrashIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M2 4h12M6 4V2h4v2M13 4l-1 10H4L3 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

function SidebarLayoutContent({ children }: { children: React.ReactNode }) {
  const supabase = createClientComponentClient()
  const router = useRouter()
  const pathname = usePathname()
  const { showToast } = useToast()
  const { focusMode, stylePreset } = useFocusMode()

  const isNight = stylePreset === 'NightInk'
  const bg = isNight ? '#1a1a1a' : '#f6f5f2'
  const sidebarBg = isNight ? '#1e1e1e' : '#fafaf9'
  const border = isNight ? 'border-gray-700' : 'border-gray-200'
  const textPrimary = isNight ? 'text-gray-100' : 'text-gray-900'
  const textMuted = isNight ? 'text-gray-500' : 'text-gray-400'
  const textSecondary = isNight ? 'text-gray-400' : 'text-gray-500'
  const hoverBg = isNight ? 'hover:bg-white/5' : 'hover:bg-white/50'
  const activeBg = isNight ? 'bg-white/10 border-l-2 border-gray-500' : 'bg-white border-l-2 border-gray-400'

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
  const [savedViews, setSavedViews] = useState<Array<{name: string, filters: any}>>([
    {name: 'All', filters: {}},
    {name: 'Notes', filters: {kind: 'note'}},
    {name: 'Prompts', filters: {kind: 'prompt'}}
  ])
  const [activeView, setActiveView] = useState('All')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState('')
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [deleteAccountConfirmText, setDeleteAccountConfirmText] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  // Edge hover in focus mode
  useEffect(() => {
    if (!focusMode) return
    const handleMouseMove = (e: MouseEvent) => setMouseNearEdge(e.clientX <= 12)
    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [focusMode])

  // Cmd+B sidebar toggle in focus mode
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

  // Cmd+N handler installed after handleCreateDocument is defined (see below)

  useEffect(() => {
    if (focusMode && mouseNearEdge) setSidebarVisible(true)
  }, [focusMode, mouseNearEdge])

  useEffect(() => {
    const pinned = localStorage.getItem('pinned-docs')
    if (pinned) setPinnedDocIds(new Set(JSON.parse(pinned)))

    const views = localStorage.getItem('saved-views')
    if (views) {
      const parsed = JSON.parse(views)
      setSavedViews([...savedViews, ...parsed])
    }
  }, [])

  const togglePin = (docId: string) => {
    const newPinned = new Set(pinnedDocIds)
    if (newPinned.has(docId)) newPinned.delete(docId)
    else newPinned.add(docId)
    setPinnedDocIds(newPinned)
    localStorage.setItem('pinned-docs', JSON.stringify(Array.from(newPinned)))
  }

  const applyView = (view: {name: string, filters: any}) => {
    setActiveView(view.name)
    setSystemFilter(view.filters.system || 'all')
    setStatusFilter(view.filters.status || 'all')
    setAiPolicyFilter(view.filters.aiPolicy || 'all')
  }

  useEffect(() => {
    if (focusMode && !sidebarVisible) return
    const fetchDocuments = async () => {
      setLoading(true)
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) { console.error('Error fetching documents:', error); setLoading(false); return }
      if (documents) {
        setDocuments(documents as Document[])
        const systemsSet = new Set<DocumentSystem>()
        documents.forEach(doc => systemsSet.add(doc.system as DocumentSystem))
        setAvailableSystems(Array.from(systemsSet))
      }
      setLoading(false)
    }
    fetchDocuments()
  }, [supabase, focusMode, sidebarVisible, pathname])

  if (focusMode && !sidebarVisible) {
    return <div className="min-h-screen" style={{ backgroundColor: bg }}>{children}</div>
  }

  const pinnedDocs = documents.filter(doc => pinnedDocIds.has(doc.id))
  const unpinnedDocs = documents.filter(doc => !pinnedDocIds.has(doc.id))

  const filteredDocuments = unpinnedDocs.filter(doc => {
    const matchesSearch = searchQuery === '' ||
      doc.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doc.content_md.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesSystem = systemFilter === 'all' || doc.system === systemFilter
    const matchesStatus = statusFilter === 'all' || doc.status === statusFilter
    const matchesAiPolicy = aiPolicyFilter === 'all' || doc.ai_policy === aiPolicyFilter
    return matchesSearch && matchesSystem && matchesStatus && matchesAiPolicy
  })

  const handleDeleteDocument = async (docId: string) => {
    try {
      const { error } = await supabase.from('documents').delete().eq('id', docId)
      if (error) { showToast(`Failed to delete: ${error.message}`, 'error'); return }
      showToast('Document deleted', 'success')
      setDeleteConfirmId(null)
      setDeleteConfirmTitle('')
      setDocuments(prev => prev.filter(d => d.id !== docId))
      if (pathname === `/doc/${docId}`) router.push('/app')
    } catch (error) {
      showToast('Failed to delete document', 'error')
    }
  }

  const handleExportAll = async () => {
    if (isExporting) return
    setIsExporting(true)
    try {
      const { data: allDocs, error } = await supabase.from('documents').select('*').order('updated_at', { ascending: false })
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
      showToast('Failed to export documents', 'error')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDeleteAccount = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { showToast('Not authenticated', 'error'); return }
      const { error: docsError } = await supabase.from('documents').delete().eq('owner_id', user.id)
      if (docsError) { showToast(`Failed to delete documents: ${docsError.message}`, 'error'); return }
      await supabase.auth.signOut()
      showToast('All data deleted. Account signed out.', 'success')
      setShowDeleteAccount(false)
      router.push('/login')
    } catch (error) {
      showToast('Failed to delete account', 'error')
    }
  }

  const handleCreateDocument = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { showToast('You must be logged in to create a document', 'error'); return }
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
          style_preset: stylePreset,
          tags: []
        }])
        .select()
        .single()
      if (error) { showToast(`Failed to create document: ${error.message}`, 'error'); return }
      if (!data) { showToast('Failed to create document — please try again', 'error'); return }

      // Add to sidebar list immediately (don't wait for next fetch)
      setDocuments(prev => [data as Document, ...prev])

      // Hard navigate so the server component always fetches fresh data for the new doc.
      // router.push can serve a cached server response that doesn't yet know about the
      // newly inserted row, causing a silent redirect back to /app and "disappearing" note.
      window.location.href = `/doc/${data.id}`
    } catch (error) {
      showToast(`Failed to create document: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    }
  }

  // Cmd+N: always calls the latest handleCreateDocument via ref (avoids stale closure)
  const handleCreateDocumentRef = useRef(handleCreateDocument)
  handleCreateDocumentRef.current = handleCreateDocument
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault()
        handleCreateDocumentRef.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div
      className="flex h-screen"
      style={{ backgroundColor: bg }}
      onMouseLeave={() => focusMode && !mouseNearEdge && setSidebarVisible(false)}
    >
      {/* Sidebar */}
      <div
        className={`w-80 border-r ${border} flex flex-col h-full ${focusMode ? 'fixed left-0 top-0 z-50 shadow-2xl' : ''}`}
        style={{ backgroundColor: sidebarBg }}
        onMouseLeave={() => focusMode && setSidebarVisible(false)}
      >
        {/* Header */}
        <div className={`p-6 border-b ${border}`}>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <span className="text-lg opacity-40">ℏ</span>
              <h1 className={`text-lg font-semibold ${textPrimary}`} style={{ letterSpacing: '-0.01em' }}>hbar.ink</h1>
            </div>
            <form action="/auth/signout" method="post">
              <button type="submit" className={`text-xs ${textMuted} hover:${textPrimary} transition-colors`}>
                Sign out
              </button>
            </form>
          </div>
          <button
            onClick={handleCreateDocument}
            className={`w-full px-4 py-2 text-sm border transition-colors ${
              isNight
                ? 'text-gray-300 hover:text-gray-100 border-gray-600 hover:border-gray-400'
                : 'text-gray-700 hover:text-gray-900 border-gray-300 hover:border-gray-400'
            }`}
          >
            New Document <span className="opacity-40 text-xs ml-1">⌘N</span>
          </button>
        </div>

        {/* Views + Search */}
        <div className={`p-4 border-b ${border}`}>
          <div className="flex items-center gap-1 mb-2">
            {savedViews.map(view => (
              <button
                key={view.name}
                onClick={() => applyView(view)}
                className={`px-2 py-1 text-xs transition-colors ${
                  activeView === view.name
                    ? `${textPrimary} font-medium`
                    : `${textSecondary} hover:${textPrimary}`
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
            className={`w-full px-3 py-1.5 border-0 text-sm focus:outline-none focus:ring-0 bg-transparent ${
              isNight ? 'text-gray-200 placeholder-gray-600' : 'text-gray-800 placeholder-gray-400'
            }`}
          />
        </div>

        {/* Document list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className={`p-4 text-center text-xs ${textMuted}`}>Loading...</div>
          ) : (
            <>
              {/* Pinned */}
              {pinnedDocs.length > 0 && (
                <div className="mb-2">
                  <div className={`px-4 py-2 text-xs font-medium ${textSecondary}`}>Pinned</div>
                  <ul>
                    {pinnedDocs.map(doc => (
                      <li key={doc.id} className="group relative">
                        <Link
                          href={`/doc/${doc.id}`}
                          className={`block px-4 py-3 transition-colors ${pathname === `/doc/${doc.id}` ? activeBg : hoverBg}`}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <p className={`text-sm truncate ${textPrimary}`}>{doc.title || 'Untitled'}</p>
                              <div className={`flex items-center gap-2 text-xs ${textMuted}`}>
                                <span>{doc.system}</span>
                                <span>·</span>
                                <span>{doc.status === 'terminal' ? 'sealed' : doc.status}</span>
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <button
                                onClick={(e) => { e.preventDefault(); togglePin(doc.id) }}
                                className={`${isNight ? 'text-gray-400 hover:text-gray-200' : 'text-gray-600 hover:text-gray-800'} transition-colors`}
                                title="Unpin"
                              >📌</button>
                              <button
                                onClick={(e) => { e.preventDefault(); setDeleteConfirmId(doc.id); setDeleteConfirmTitle(doc.title || 'Untitled') }}
                                className={`${isNight ? 'text-gray-600' : 'text-gray-300'} hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity`}
                                title="Delete"
                              ><TrashIcon /></button>
                            </div>
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Regular docs */}
              {filteredDocuments.length === 0 && pinnedDocs.length === 0 ? (
                <div className={`p-4 text-center text-xs ${textMuted}`}>
                  {searchQuery ? 'No matches' : 'No documents'}
                </div>
              ) : (
                <ul>
                  {filteredDocuments.map(doc => (
                    <li key={doc.id} className="group relative">
                      <Link
                        href={`/doc/${doc.id}`}
                        className={`block px-4 py-3 transition-colors ${pathname === `/doc/${doc.id}` ? activeBg : hoverBg}`}
                      >
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm truncate ${textPrimary}`}>{doc.title || 'Untitled'}</p>
                            <div className={`flex items-center gap-2 text-xs ${textMuted}`}>
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
                              onClick={(e) => { e.preventDefault(); togglePin(doc.id) }}
                              className={`${isNight ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}
                              title="Pin"
                            >📌</button>
                            <button
                              onClick={(e) => { e.preventDefault(); setDeleteConfirmId(doc.id); setDeleteConfirmTitle(doc.title || 'Untitled') }}
                              className={`${isNight ? 'text-gray-600' : 'text-gray-300'} hover:text-red-500`}
                              title="Delete"
                            ><TrashIcon /></button>
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

        {/* Bottom actions */}
        <div className={`p-4 border-t ${border} space-y-2`}>
          <button
            onClick={handleExportAll}
            disabled={isExporting}
            className={`w-full text-left px-3 py-2 text-xs transition-colors rounded ${
              isNight ? 'text-gray-500 hover:text-gray-300 hover:bg-white/5' : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
            }`}
          >
            {isExporting ? 'Exporting...' : 'Download all as ZIP'}
          </button>
          <button
            onClick={() => setShowDeleteAccount(true)}
            className={`w-full text-left px-3 py-2 text-xs transition-colors rounded ${
              isNight ? 'text-gray-700 hover:text-red-400' : 'text-gray-400 hover:text-red-500'
            }`}
          >
            Delete account & data
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>

      {/* Delete account modal */}
      {showDeleteAccount && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Delete account?</h3>
            <p className="text-sm text-gray-500 mb-4">
              This will permanently delete <strong>all your documents</strong> and sign you out. This cannot be undone.
            </p>
            <p className="text-sm text-gray-500 mb-2">We recommend downloading your documents first.</p>
            <button onClick={handleExportAll} disabled={isExporting} className="mb-4 text-xs text-blue-600 hover:text-blue-800 underline">
              {isExporting ? 'Exporting...' : 'Download all as ZIP first'}
            </button>
            <p className="text-sm text-gray-600 mb-2">Type <strong>DELETE</strong> to confirm:</p>
            <input
              type="text"
              value={deleteAccountConfirmText}
              onChange={(e) => setDeleteAccountConfirmText(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm mb-4 focus:outline-none focus:ring-1 focus:ring-red-500"
              placeholder="Type DELETE"
            />
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setShowDeleteAccount(false); setDeleteAccountConfirmText('') }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleDeleteAccount} disabled={deleteAccountConfirmText !== 'DELETE'} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 disabled:opacity-30 disabled:cursor-not-allowed">
                Delete everything
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete document modal */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Delete document?</h3>
            <p className="text-sm text-gray-500 mb-6">
              <strong>{deleteConfirmTitle}</strong> will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => { setDeleteConfirmId(null); setDeleteConfirmTitle('') }} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={() => deleteConfirmId && handleDeleteDocument(deleteConfirmId)} className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700">
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
