'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useEditor, EditorContent } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Highlight from '@tiptap/extension-highlight'
import { Color } from '@tiptap/extension-color'
import { TextStyle } from '@tiptap/extension-text-style'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Markdown } from 'tiptap-markdown'
import { Document as DocType, DocumentStatus, DocumentSystem, DocumentSourceKind, DocumentAIPolicy, StylePreset } from '@/types/document'
import { useToast, ToastProvider } from '@/components/ui/toast'
import { useFocusMode } from '@/components/layout/focus-mode-wrapper'
import { downloadTextFile } from '@/lib/file-utils'
import { jsPDF } from 'jspdf'

// Tab / Shift-Tab: indent list items, soft-tab in plain paragraphs
const TabHandler = Extension.create({
  name: 'tabHandler',
  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        if (editor.isActive('listItem') || editor.isActive('taskItem')) {
          return editor.commands.sinkListItem('listItem')
        }
        return editor.commands.insertContent('  ')
      },
      'Shift-Tab': ({ editor }) => {
        if (editor.isActive('listItem') || editor.isActive('taskItem')) {
          return editor.commands.liftListItem('listItem')
        }
        return false
      },
    }
  },
})

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
  const [saveError, setSaveError] = useState<string | null>(null)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const saveInProgressRef = useRef(false)
  const [showCmdK, setShowCmdK] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<DocType[]>([])
  const [editorWidth, setEditorWidth] = useState<'wide' | 'comfort' | 'narrow'>('comfort')
  const [showMetadata, setShowMetadata] = useState(false)
  const [headerVisible, setHeaderVisible] = useState(true)
  const [fontOverride, setFontOverride] = useState<'quicksand' | 'montserrat' | 'audiowide' | 'spectral' | null>(null)
  const [showExportMenu, setShowExportMenu] = useState(false)

  const { focusMode, toggleFocusMode } = useFocusMode()
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: 'Start writing...' }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({
        html: false,
        transformCopiedText: true,
        transformPastedText: true,
      }),
      TabHandler,
    ],
    content: docRow.content_md,
    editable: status !== 'terminal',
    onUpdate: ({ editor }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const md = (editor.storage as any).markdown.getMarkdown()
      setContent(md)
    },
  })

  // Sync editable with status changes (e.g. after sealing)
  useEffect(() => {
    if (editor) {
      editor.setEditable(status !== 'terminal')
    }
  }, [editor, status])

  // Load editor width and font preferences from localStorage
  useEffect(() => {
    const savedWidth = localStorage.getItem('editor-width') as 'wide' | 'comfort' | 'narrow' | null
    if (savedWidth) setEditorWidth(savedWidth)

    const savedFont = localStorage.getItem('font-override') as 'quicksand' | 'montserrat' | 'audiowide' | 'spectral' | null
    if (savedFont) setFontOverride(savedFont)
  }, [])

  const handleWidthChange = (width: 'wide' | 'comfort' | 'narrow') => {
    setEditorWidth(width)
    localStorage.setItem('editor-width', width)
  }

  const handleFontChange = (font: 'quicksand' | 'montserrat' | 'audiowide' | 'spectral' | null) => {
    setFontOverride(font)
    if (font) {
      localStorage.setItem('font-override', font)
    } else {
      localStorage.removeItem('font-override')
    }
  }

  const getFontClass = () => {
    if (fontOverride === 'quicksand') return 'font-quicksand'
    if (fontOverride === 'montserrat') return 'font-montserrat'
    if (fontOverride === 'audiowide') return 'font-audiowide'
    if (fontOverride === 'spectral') return 'font-spectral'
    return 'font-montserrat'
  }

  // Autosave when content changes (debounced)
  useEffect(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)

    localStorage.setItem(
      `draft-${docRow.id}`,
      JSON.stringify({ content, timestamp: new Date().toISOString() })
    )

    saveTimeoutRef.current = setTimeout(async () => {
      await saveDocument()
    }, 800)

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [content])

  useEffect(() => {
    if (title === docRow.title) return
    const t = setTimeout(async () => { await saveDocument() }, 500)
    return () => clearTimeout(t)
  }, [title])

  useEffect(() => {
    saveDocument()
  }, [stylePreset])

  useEffect(() => {
    saveDocument()
  }, [status])

  useEffect(() => {
    saveDocument()
  }, [system, sourceKind, aiPolicy])

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveDocument()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setShowCmdK(true)
      }
      if (e.key === 'Escape' && showCmdK) {
        e.preventDefault()
        setShowCmdK(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showCmdK, focusMode])

  // Cmd+K document search
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
      if (error) { console.error('Error searching documents:', error); return }
      setSearchResults(documents as DocType[])
    }
    if (showCmdK) searchDocuments()
  }, [searchQuery, showCmdK])

  const saveDocument = async () => {
    if (saveInProgressRef.current) return
    saveInProgressRef.current = true
    setIsSaving(true)
    setSaveError(null)

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
        setSaveError(error.message)
        showToast('Failed to save document', 'error')
        return
      }

      setLastSaved(new Date())
      setSaveError(null)
    } catch (error) {
      console.error('Error saving document:', error)
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setSaveError(errorMsg)
      showToast('Failed to save document', 'error')
    } finally {
      setIsSaving(false)
      saveInProgressRef.current = false
    }
  }

  const handleExport = () => {
    if (typeof window === 'undefined') return
    const sanitizedTitle = (title || 'untitled').replace(/[^a-z0-9]/gi, '-').toLowerCase()
    const date = new Date().toISOString().split('T')[0]
    const filename = `hbarink__${sanitizedTitle}__${date}.md`
    const exportContent = `# ${title || 'Untitled'}\n\n${content}`
    downloadTextFile(filename, exportContent, 'text/markdown')
    showToast('Document exported as Markdown', 'success')
  }

  const handleExportPDF = () => {
    if (typeof window === 'undefined') return
    try {
      const doc = new jsPDF()
      const sanitizedTitle = (title || 'untitled').replace(/[^a-z0-9]/gi, '-').toLowerCase()
      const date = new Date().toISOString().split('T')[0]
      const filename = `hbarink__${sanitizedTitle}__${date}.pdf`
      const pageWidth = doc.internal.pageSize.getWidth()
      const margin = 20
      const maxWidth = pageWidth - margin * 2
      doc.setFontSize(20)
      doc.text(title || 'Untitled', margin, margin)
      doc.setFontSize(12)
      const lines = doc.splitTextToSize(content, maxWidth)
      doc.text(lines, margin, margin + 15)
      doc.save(filename)
      showToast('Document exported as PDF', 'success')
    } catch (error) {
      console.error('PDF export error:', error)
      showToast('Failed to export PDF', 'error')
    }
  }

  const emitTerminalityEvent = ({ doc_id, owner_id, at }: { doc_id: string; owner_id: string; at: Date }) => {
    console.log('Terminality event:', { doc_id, owner_id, at })
    // Stub — will be replaced with hbar.economy minting logic
  }

  const [showTerminalModal, setShowTerminalModal] = useState(false)
  const [sealedAt, setSealedAt] = useState<string | null>(docRow.sealed_at || null)

  const handleSealClick = () => {
    if (status !== 'terminal') setShowTerminalModal(true)
  }

  const handleDuplicateAsDraft = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { showToast('You must be logged in to duplicate a document', 'error'); return }

      const { data, error } = await supabase
        .from('documents')
        .insert([{
          owner_id: user.id,
          title: `${title} (Copy)`,
          content_md: content,
          system,
          source_kind: sourceKind,
          status: 'draft',
          ai_policy: aiPolicy,
          style_preset: stylePreset,
          tags: docRow.tags,
        }])
        .select()
        .single()

      if (error) { showToast(`Failed to duplicate: ${error.message}`, 'error'); return }
      if (data) { router.push(`/doc/${data.id}`); router.refresh() }
    } catch (error) {
      showToast(`Failed to duplicate: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
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
          .update({ status: 'terminal' })
          .eq('id', docRow.id)
        if (error) { showToast(`Failed to seal document: ${error.message}`, 'error'); return }
        emitTerminalityEvent({ doc_id: docRow.id, owner_id: docRow.owner_id, at: now })
        showToast('Document sealed successfully', 'success')
      } catch (error) {
        showToast('Failed to seal document', 'error')
      } finally {
        setShowTerminalModal(false)
      }
    }
  }

  const handleSendToBrain = async () => {
    if (aiPolicy === 'deny') { alert('This document cannot be sent to Brain. AI policy is set to deny.'); return }
    const brainUrl = process.env.NEXT_PUBLIC_HBAR_BRAIN_URL
    if (!brainUrl) { alert('HBAR_BRAIN_URL not configured'); return }
    try {
      const payload = { doc_id: docRow.id, title, content_md: content, system, source_kind: sourceKind, tags: docRow.tags, status, created_at: docRow.created_at, updated_at: docRow.updated_at }
      const response = await fetch(`${brainUrl}/v1/ink/ingest`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await response.json()
      if (data.ok) { alert('Document sent to Brain successfully!') }
      else { alert(`Error sending document to Brain: ${data.error || 'Unknown error'}`) }
    } catch (error) {
      alert(`Error sending document to Brain: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  return (
    <>
      <div className={`${stylePreset} min-h-screen`} style={{ backgroundColor: stylePreset === 'NightInk' ? '#1a1a1a' : '#f6f5f2' }}>
        {/* Header hover zone in focus mode */}
        {focusMode && (
          <div className="fixed top-0 left-0 right-0 h-16 z-40" onMouseEnter={() => setHeaderVisible(true)} />
        )}

        <header
          className={`border-b transition-opacity duration-300 relative z-50 ${
            focusMode && !headerVisible ? 'opacity-0 pointer-events-none' : 'opacity-100'
          } ${stylePreset === 'NightInk' ? 'border-gray-700' : 'border-gray-200'}`}
          style={{ backgroundColor: stylePreset === 'NightInk' ? '#222222' : '#fafaf9' }}
          onMouseLeave={() => focusMode && setHeaderVisible(false)}
        >
          <div className="max-w-7xl mx-auto px-8 py-5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-6">
                <button onClick={() => router.push('/app')} className="text-gray-400 hover:text-gray-600 transition-colors text-sm cursor-pointer" type="button">
                  ← Back
                </button>
                <a href="/" className="text-gray-900 hover:text-gray-700 transition-colors" title="hbar.ink home">
                  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" className="opacity-40 hover:opacity-60 transition-opacity">
                    <path d="M8 2L2 6V14H6V10H10V14H14V6L8 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </a>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <select value={stylePreset} onChange={(e) => setStylePreset(e.target.value as StylePreset)} className="text-xs border-0 bg-transparent focus:ring-0 text-gray-600" disabled={status === 'terminal'}>
                    <option value="WritersRoom">Writer's Room</option>
                    <option value="NightInk">Night Ink</option>
                  </select>
                  <span className="text-gray-300">·</span>
                  <select
                    value={fontOverride || 'default'}
                    onChange={(e) => handleFontChange(e.target.value === 'default' ? null : e.target.value as 'quicksand' | 'montserrat' | 'audiowide' | 'spectral')}
                    className="text-xs border-0 bg-transparent focus:ring-0 text-gray-600"
                  >
                    <option value="default">Auto</option>
                    <option value="quicksand">Quicksand</option>
                    <option value="montserrat">Montserrat</option>
                    <option value="audiowide">Audiowide</option>
                    <option value="spectral">Spectral</option>
                  </select>
                  <span className="text-gray-300">·</span>
                  {(['narrow', 'comfort', 'wide'] as const).map((w) => (
                    <button key={w} onClick={() => handleWidthChange(w)} className={`capitalize transition-colors ${editorWidth === w ? 'text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}>
                      {w}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="text-xs">
                  {isSaving ? <span className="text-gray-500">Saving...</span>
                    : saveError ? <span className="text-red-500">Error</span>
                    : lastSaved ? <span className="text-gray-400">Saved {lastSaved.toLocaleTimeString()}</span>
                    : null}
                </div>
                <button onClick={toggleFocusMode} className={`px-3 py-1.5 text-xs transition-colors ${focusMode ? 'text-gray-900 font-medium' : 'text-gray-600 hover:text-gray-900'}`}>
                  Focus
                </button>
                <div className="relative">
                  <button onClick={() => setShowExportMenu(prev => !prev)} className="px-3 py-1.5 text-xs text-gray-600 hover:text-gray-900 transition-colors">
                    Export ▾
                  </button>
                  {showExportMenu && (
                    <div className="absolute right-0 mt-1 bg-white border border-gray-200 shadow-lg rounded z-50 min-w-[120px]">
                      <button onClick={() => { handleExport(); setShowExportMenu(false) }} className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                        .md (Markdown)
                      </button>
                      <button onClick={() => { handleExportPDF(); setShowExportMenu(false) }} className="block w-full text-left px-4 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors border-t border-gray-100">
                        .pdf (PDF)
                      </button>
                    </div>
                  )}
                </div>
                {status === 'terminal' ? (
                  <button onClick={handleDuplicateAsDraft} className="px-4 py-1.5 text-xs text-gray-900 border border-gray-300 hover:border-gray-400 transition-colors">
                    Duplicate to Edit
                  </button>
                ) : (
                  <button onClick={handleSealClick} className="px-4 py-1.5 text-xs text-gray-500 hover:text-gray-700 transition-colors">
                    Seal
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className={`mx-auto transition-all duration-300 ${
          editorWidth === 'wide' ? 'max-w-[1100px]' :
          editorWidth === 'comfort' ? 'max-w-[820px]' :
          'max-w-[680px]'
        }`}>
          {/* Sealed document banner */}
          {status === 'terminal' && (
            <div className="mt-12 mb-6 px-8 py-3 border-l-2 border-gray-300 bg-gray-50/50 text-sm text-gray-600">
              This document is sealed. <button onClick={handleDuplicateAsDraft} className="underline hover:text-gray-900">Duplicate to edit</button>.
            </div>
          )}

          {/* Title */}
          <div className="mt-16 mb-8 px-8">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={`w-full text-3xl font-semibold border-none focus:ring-0 focus:outline-none bg-transparent ${
                stylePreset === 'NightInk' ? 'text-gray-100 placeholder-gray-600' : 'text-gray-900 placeholder-gray-300'
              } ${getFontClass()}`}
              placeholder="Untitled"
              disabled={status === 'terminal'}
              style={{ letterSpacing: fontOverride === 'audiowide' ? '0.05em' : '-0.02em' }}
            />
          </div>

          {/* Collapsible metadata */}
          <div className="px-8 mb-6">
            <button onClick={() => setShowMetadata(!showMetadata)} className="text-xs text-gray-400 hover:text-gray-600 transition-colors">
              {showMetadata ? '− Hide' : '+ Show'} document info
            </button>
            {showMetadata && (
              <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                {status === 'terminal' ? (
                  <>
                    <span>{system}</span>
                    <span className="text-gray-300">·</span>
                    <span>{sourceKind}</span>
                    <span className="text-gray-300">·</span>
                    <span>Sealed</span>
                    <span className="text-gray-300">·</span>
                    <span>{aiPolicy}</span>
                  </>
                ) : (
                  <>
                    <select value={system} onChange={(e) => setSystem(e.target.value as DocumentSystem)} className="text-xs border-0 bg-transparent focus:ring-0 text-gray-500 p-0">
                      <option value="personal">personal</option>
                      <option value="hbar.systems">hbar.systems</option>
                      <option value="BrainFoundry">BrainFoundry</option>
                      <option value="hbar.work">hbar.work</option>
                      <option value="hbar.build">hbar.build</option>
                      <option value="hbar.agency">hbar.agency</option>
                      <option value="hbar.shop">hbar.shop</option>
                      <option value="hbar.bio">hbar.bio</option>
                      <option value="hbar.blog">hbar.blog</option>
                      <option value="hbar.science">hbar.science</option>
                      <option value="hbar.university">hbar.university</option>
                      <option value="hbar.economy">hbar.economy</option>
                      <option value="hbar.music">hbar.music</option>
                      <option value="hbar.art">hbar.art</option>
                      <option value="hbar.poker">hbar.poker</option>
                      <option value="hbar.vision">hbar.vision</option>
                      <option value="ableton.systems">ableton.systems</option>
                      <option value="orfeo.music">orfeo.music</option>
                    </select>
                    <span className="text-gray-300">·</span>
                    <select value={sourceKind} onChange={(e) => setSourceKind(e.target.value as DocumentSourceKind)} className="text-xs border-0 bg-transparent focus:ring-0 text-gray-500 p-0">
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
                    <span className="text-gray-300">·</span>
                    <select value={status} onChange={(e) => setStatus(e.target.value as DocumentStatus)} className="text-xs border-0 bg-transparent focus:ring-0 text-gray-500 p-0">
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                    </select>
                    <span className="text-gray-300">·</span>
                    <select value={aiPolicy} onChange={(e) => setAiPolicy(e.target.value as DocumentAIPolicy)} className="text-xs border-0 bg-transparent focus:ring-0 text-gray-500 p-0">
                      <option value="deny">deny</option>
                      <option value="allow_rag_only">allow_rag_only</option>
                      <option value="allow">allow</option>
                    </select>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Writing area — TipTap rich text editor */}
          <div
            className={`px-8 pb-24 ${getFontClass()}`}
            style={{
              fontSize: '19px',
              lineHeight: '1.75',
              letterSpacing: fontOverride === 'audiowide' ? '0.05em' : '0.01em',
              color: stylePreset === 'NightInk' ? '#f3f4f6' : '#1f2937',
            }}
          >
            <EditorContent
              editor={editor}
              className={`tiptap-editor ${stylePreset === 'NightInk' ? 'tiptap-dark' : 'tiptap-light'}`}
            />
          </div>
        </div>
      </div>

      {/* Seal confirmation modal */}
      {showTerminalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Seal Document?</h3>
            <p className="text-sm text-gray-500 mb-6">
              Sealing is permanent. Once a document is sealed, it becomes read-only and cannot be edited further. Continue?
            </p>
            <div className="flex justify-end space-x-3">
              <button onClick={() => setShowTerminalModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleConfirmSeal} className="px-4 py-2 text-sm font-medium text-white bg-purple-600 border border-transparent rounded-md shadow-sm hover:bg-purple-700">
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
                    <a href={`/doc/${searchDoc.id}`} className="block px-4 py-3 hover:bg-gray-50" onClick={() => setShowCmdK(false)}>
                      <p className="text-sm font-medium text-gray-900">{searchDoc.title}</p>
                      <p className="text-sm text-gray-500">
                        {searchDoc.system} • {searchDoc.status} • {new Date(searchDoc.updated_at).toLocaleDateString()}
                      </p>
                    </a>
                  </li>
                ))}
                {searchQuery && searchResults.length === 0 && <li className="px-4 py-3 text-sm text-gray-500">No documents found</li>}
                {!searchQuery && <li className="px-4 py-3 text-sm text-gray-500">Type to search documents</li>}
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
