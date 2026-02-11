'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import ReactMarkdown from 'react-markdown'
import type { Document as DocType, StylePreset, DocumentSystem, DocumentSourceKind, DocumentStatus, DocumentAIPolicy } from '@/types/document'
import { downloadTextFile } from '@/lib/file-utils'
import { Toast, ToastProvider, useToast } from '@/components/ui/toast'

function DocumentEditorContent({ document: docRow }: { document: DocType }) {
  const { showToast } = useToast()
  const router = useRouter()
  const supabase = createClientComponentClient()
  
  const [title, setTitle] = useState(docRow.title)
  const [content, setContent] = useState(docRow.content_md)
  const [stylePreset, setStylePreset] = useState<StylePreset>(docRow.style_preset as StylePreset)
  const [status, setStatus] = useState<DocumentStatus>(docRow.status)
  const [system, setSystem] = useState<DocumentSystem>(docRow.system)
  const [sourceKind, setSourceKind] = useState<DocumentSourceKind>(docRow.source_kind)
  const [aiPolicy, setAiPolicy] = useState<DocumentAIPolicy>(docRow.ai_policy)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [showCmdK, setShowCmdK] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DocType[]>([])
  
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  // Load local draft if it exists and is newer
  useEffect(() => {
    const localDraft = localStorage.getItem(`draft-${docRow.id}`)
    if (localDraft) {
      try {
        const { content: localContent, timestamp } = JSON.parse(localDraft)
        const localTimestamp = new Date(timestamp)
        const serverTimestamp = new Date(docRow.updated_at)
        
        if (localTimestamp > serverTimestamp) {
          const shouldRestore = window.confirm(
            'A more recent local draft was found. Would you like to restore it?'
          )
          
          if (shouldRestore) {
            setContent(localContent)
          } else {
            localStorage.removeItem(`draft-${docRow.id}`)
          }
        }
      } catch (error) {
        console.error('Error parsing local draft:', error)
        localStorage.removeItem(`draft-${docRow.id}`)
      }
    }
  }, [docRow.id, docRow.updated_at])

  // Save document when content changes (debounced)
  useEffect(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    
    // Save to localStorage immediately
    localStorage.setItem(
      `draft-${docRow.id}`,
      JSON.stringify({ content, timestamp: new Date().toISOString() })
    )
    
    // Debounce server save
    saveTimeoutRef.current = setTimeout(async () => {
      await saveDocument()
    }, 800)
    
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [content])

  // Save document when title changes
  useEffect(() => {
    const saveTitle = async () => {
      await saveDocument()
    }
    
    saveTitle()
  }, [title])

  // Save document when style preset changes
  useEffect(() => {
    const saveStylePreset = async () => {
      await saveDocument()
    }
    
    saveStylePreset()
  }, [stylePreset])

  // Save document when status changes
  useEffect(() => {
    const saveStatus = async () => {
      await saveDocument()
    }
    
    saveStatus()
  }, [status])

  // Save document when metadata changes (system, sourceKind, aiPolicy)
  useEffect(() => {
    const saveMetadata = async () => {
      await saveDocument()
    }
    
    saveMetadata()
  }, [system, sourceKind, aiPolicy])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+S to save
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveDocument()
      }
      
      // Cmd+K to open document switcher
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCmdK(true)
      }
      
      // Escape to close document switcher
      if (e.key === 'Escape' && showCmdK) {
        e.preventDefault()
        setShowCmdK(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [showCmdK])

  // Search for documents when query changes
  useEffect(() => {
    const searchDocuments = async () => {
      if (!searchQuery.trim()) {
        setSearchResults([])
        return
      }
      
      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .ilike('title', `%${searchQuery}%`)
        .order('updated_at', { ascending: false })
        .limit(10)
      
      if (error) {
        console.error('Error searching documents:', error)
        return
      }
      
      setSearchResults(documents as DocType[])
    }
    
    if (showCmdK) {
      searchDocuments()
    }
  }, [searchQuery, showCmdK])

  const saveDocument = async () => {
    setIsSaving(true)
    
    try {
      const { error } = await supabase
        .from('documents')
        .update({
          title,
          content_md: content,
          style_preset: stylePreset,
          status,
          system,
          source_kind: sourceKind,
          ai_policy: aiPolicy,
        })
        .eq('id', docRow.id)
      
      if (error) {
        console.error('Error saving document:', error)
        showToast('Failed to save document', 'error')
        return
      }
      
      setLastSaved(new Date())
    } catch (error) {
      console.error('Error saving document:', error)
      showToast('Failed to save document', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = () => {
    // Only run in browser environment
    if (typeof window === 'undefined') return
    
    // Use our utility function to download the file
    const filename = `${title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.md`
    downloadTextFile(filename, content, 'text/markdown')
  }

  const emitTerminalityEvent = ({ doc_id, owner_id, at }: { doc_id: string, owner_id: string, at: Date }) => {
    console.log('Terminality event:', { doc_id, owner_id, at })
    // This is a stub that will be replaced with hbar.economy minting logic in the future
  }

  const [showTerminalModal, setShowTerminalModal] = useState(false)
  const [sealedAt, setSealedAt] = useState<string | null>(docRow.sealed_at || null)

  const handleSealClick = () => {
    if (status !== 'terminal') {
      setShowTerminalModal(true)
    }
  }
  
  const handleConfirmSeal = async () => {
    if (status !== 'terminal') {
      setStatus('terminal')
      const now = new Date()
      setSealedAt(now.toISOString())
      
      try {
        const { error } = await supabase
          .from('documents')
          .update({
            status: 'terminal',
            sealed_at: now.toISOString()
          })
          .eq('id', docRow.id)
        
        if (error) {
          console.error('Error sealing document:', error)
          showToast('Failed to seal document', 'error')
          return
        }
        
        emitTerminalityEvent({
          doc_id: docRow.id,
          owner_id: docRow.owner_id,
          at: now
        })
        
        showToast('Document sealed successfully', 'success')
      } catch (error) {
        console.error('Error sealing document:', error)
        showToast('Failed to seal document', 'error')
      } finally {
        setShowTerminalModal(false)
      }
    }
  }

  const handleSendToBrain = async () => {
    // Check if AI policy is deny
    if (aiPolicy === 'deny') {
      alert('This document cannot be sent to Brain. AI policy is set to deny.')
      return
    }
    
    // Check if HBAR_BRAIN_URL is configured
    const brainUrl = process.env.NEXT_PUBLIC_HBAR_BRAIN_URL
    if (!brainUrl) {
      alert('HBAR_BRAIN_URL not configured')
      return
    }
    
    try {
      const payload = {
        doc_id: docRow.id,
        title,
        content_md: content,
        system,
        source_kind: sourceKind,
        tags: docRow.tags,
        status,
        created_at: docRow.created_at,
        updated_at: docRow.updated_at
      }
      
      const response = await fetch(`${brainUrl}/v1/ink/ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      })
      
      const data = await response.json()
      
      if (data.ok) {
        alert('Document sent to Brain successfully!')
      } else {
        alert(`Error sending document to Brain: ${data.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error sending document to Brain:', error)
      alert(`Error sending document to Brain: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <>
      <div className={`${stylePreset} paper-texture ${status === 'terminal' ? 'terminal-document' : ''}`}>
        {status === 'terminal' && (
          <div className="bg-purple-800 text-white text-center py-1 text-sm font-medium">
            SEALED / TERMINAL {sealedAt && `— ${new Date(sealedAt).toLocaleDateString()} ${new Date(sealedAt).toLocaleTimeString()}`}
          </div>
        )}
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <a href="/app" className="text-gray-500 hover:text-gray-700">
                &larr; Back
              </a>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="text-xl font-semibold text-gray-900 border-none focus:ring-0 focus:outline-none bg-transparent"
                placeholder="Untitled"
              />
            </div>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-500">
                {isSaving ? 'Saving...' : lastSaved ? `Saved ${lastSaved.toLocaleTimeString()}` : ''}
              </div>
              
              <select
                value={stylePreset}
                onChange={(e) => setStylePreset(e.target.value as StylePreset)}
                className="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                disabled={status === 'terminal'}
              >
                <option value="WritersRoom">Writer's Room</option>
                <option value="Academia">Academia</option>
                <option value="NightInk">Night Ink</option>
              </select>
              
              <button
                onClick={() => {
                  setShowPreview(prev => !prev)
                }}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                {showPreview ? 'Edit' : 'Preview'}
              </button>
              
              <button
                onClick={handleExport}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Export .md
              </button>
              
              <div className="flex items-center space-x-2">
                <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  status === 'draft' ? 'bg-yellow-100 text-yellow-800' :
                  status === 'active' ? 'bg-green-100 text-green-800' :
                  'bg-purple-100 text-purple-800'
                }`}>
                  {status}
                </span>
                
                {status !== 'terminal' && (
                  <button
                    onClick={handleSealClick}
                    className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-purple-700"
                  >
                    Seal (Mark Terminal)
                  </button>
                )}
              </div>
              
              <button
                onClick={handleSendToBrain}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                disabled={aiPolicy === 'deny' || status === 'draft' || !process.env.NEXT_PUBLIC_HBAR_BRAIN_URL}
                title={aiPolicy === 'deny' ? 'AI policy is deny' : !process.env.NEXT_PUBLIC_HBAR_BRAIN_URL ? 'HBAR_BRAIN_URL not configured' : ''}
              >
                Send to Brain
              </button>
            </div>
          </div>
        </header>
        
        <div className="editor-container">
          {status === 'terminal' ? (
            <div className="mb-4 p-3 border border-purple-200 bg-purple-50 rounded-md">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-gray-500 block mb-1">System:</span>
                  <span className="text-sm">{system}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Kind:</span>
                  <span className="text-sm">{sourceKind}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block mb-1">AI Policy:</span>
                  <span className="text-sm">{aiPolicy}</span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block mb-1">Sealed At:</span>
                  <span className="text-sm">{sealedAt ? new Date(sealedAt).toLocaleString() : 'Unknown'}</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="mb-4 flex flex-wrap gap-2">
              <div className="flex items-center">
                <span className="text-xs text-gray-500 mr-2">System:</span>
                <select
                  value={system}
                  onChange={(e) => setSystem(e.target.value as DocumentSystem)}
                  className="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                >
                  <option value="personal">personal</option>
                  <option value="hbar.science">hbar.science</option>
                  <option value="hbar.blog">hbar.blog</option>
                  <option value="hbar.brain">hbar.brain</option>
                  <option value="hbar.economy">hbar.economy</option>
                </select>
              </div>
              
              <div className="flex items-center">
                <span className="text-xs text-gray-500 mr-2">Kind:</span>
                <select
                  value={sourceKind}
                  onChange={(e) => setSourceKind(e.target.value as DocumentSourceKind)}
                  className="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                >
                  <option value="note">note</option>
                  <option value="essay">essay</option>
                  <option value="paper_section">paper_section</option>
                  <option value="plan">plan</option>
                  <option value="meeting">meeting</option>
                  <option value="prompt">prompt</option>
                  <option value="spec">spec</option>
                  <option value="log">log</option>
                  <option value="archive">archive</option>
                  <option value="dataset_card">dataset_card</option>
                </select>
              </div>
              
              <div className="flex items-center">
                <span className="text-xs text-gray-500 mr-2">Status:</span>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as DocumentStatus)}
                  className="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                >
                  <option value="draft">draft</option>
                  <option value="active">active</option>
                </select>
              </div>
              
              <div className="flex items-center">
                <span className="text-xs text-gray-500 mr-2">AI:</span>
                <select
                  value={aiPolicy}
                  onChange={(e) => setAiPolicy(e.target.value as DocumentAIPolicy)}
                  className="text-sm border-gray-300 rounded-md shadow-sm focus:border-primary-300 focus:ring focus:ring-primary-200 focus:ring-opacity-50"
                >
                  <option value="deny">deny</option>
                  <option value="allow_rag_only">allow_rag_only</option>
                  <option value="allow">allow</option>
                </select>
              </div>
            </div>
          )}
          
          {showPreview ? (
            <div className="prose max-w-none">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : (
            <textarea
              ref={editorRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              className="editor-textarea"
              placeholder="Start writing..."
              disabled={status === 'terminal'}
              autoFocus
            />
          )}
        </div>
      </div>
      
      {/* Terminal confirmation modal */}
      {showTerminalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Seal Document?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Sealing is permanent. Once a document is sealed, it becomes read-only and cannot be edited further. Continue?
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowTerminalModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmSeal}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-purple-700"
              >
                Confirm Seal
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Command-K modal */}
      {showCmdK && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center pt-20 z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg">
            <div className="p-4 border-b">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documents..."
                className="w-full border-none focus:ring-0 focus:outline-none text-lg"
                autoFocus
              />
            </div>
            <div className="max-h-96 overflow-y-auto">
              <ul className="divide-y divide-gray-200">
                {searchResults.map((searchDoc) => (
                  <li key={searchDoc.id}>
                    <a
                      href={`/doc/${searchDoc.id}`}
                      className="block px-4 py-3 hover:bg-gray-50"
                      onClick={() => setShowCmdK(false)}
                    >
                      <p className="text-sm font-medium text-gray-900">{searchDoc.title}</p>
                      <p className="text-sm text-gray-500">
                        {searchDoc.system} • {searchDoc.status} • {new Date(searchDoc.updated_at).toLocaleDateString()}
                      </p>
                    </a>
                  </li>
                ))}
                {searchQuery && searchResults.length === 0 && (
                  <li className="px-4 py-3 text-sm text-gray-500">No documents found</li>
                )}
                {!searchQuery && (
                  <li className="px-4 py-3 text-sm text-gray-500">Type to search documents</li>
                )}
              </ul>
            </div>
            <div className="p-2 border-t text-xs text-gray-500 flex justify-between">
              <span>Press ESC to close</span>
              <span>Enter to select</span>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export default function DocumentEditor({ document: docRow }: { document: DocType }) {
  return (
    <ToastProvider>
      <DocumentEditorContent document={docRow} />
    </ToastProvider>
  )
}
