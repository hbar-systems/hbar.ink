'use client'

import { useEffect, useState } from 'react'
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { Document } from '@/types/document'
import { cn } from '@/lib/utils'

interface CmdKProps {
  isOpen: boolean
  onClose: () => void
}

export default function CmdK({ isOpen, onClose }: CmdKProps) {
  const router = useRouter()
  const supabase = createClientComponentClient()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<Document[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  
  useEffect(() => {
    const searchDocuments = async () => {
      if (!searchQuery.trim()) {
        const { data: recentDocs } = await supabase
          .from('documents')
          .select('*')
          .order('updated_at', { ascending: false })
          .limit(10)
        
        setSearchResults(recentDocs as Document[] || [])
        return
      }
      
      const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .ilike('title', `%${searchQuery}%`)
        .order('updated_at', { ascending: false })
        .limit(10)
      
      setSearchResults(documents as Document[] || [])
    }
    
    if (isOpen) {
      searchDocuments()
    }
  }, [searchQuery, isOpen, supabase])
  
  useEffect(() => {
    setSelectedIndex(0)
  }, [searchResults])
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex((prev) => 
            prev < searchResults.length - 1 ? prev + 1 : prev
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
          break
        case 'Enter':
          e.preventDefault()
          if (searchResults[selectedIndex]) {
            router.push(`/doc/${searchResults[selectedIndex].id}`)
            onClose()
          }
          break
        case 'Escape':
          e.preventDefault()
          onClose()
          break
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, searchResults, selectedIndex, router, onClose])
  
  if (!isOpen) return null
  
  return (
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
            {searchResults.map((doc, index) => (
              <li key={doc.id}>
                <a
                  href={`/doc/${doc.id}`}
                  className={cn(
                    "block px-4 py-3",
                    index === selectedIndex ? "bg-primary-50" : "hover:bg-gray-50"
                  )}
                  onClick={() => {
                    router.push(`/doc/${doc.id}`)
                    onClose()
                  }}
                >
                  <p className="text-sm font-medium text-gray-900">{doc.title}</p>
                  <p className="text-sm text-gray-500">
                    {doc.system} • {doc.status} • {new Date(doc.updated_at).toLocaleDateString()}
                  </p>
                </a>
              </li>
            ))}
            {searchQuery && searchResults.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-500">No documents found</li>
            )}
            {!searchQuery && searchResults.length === 0 && (
              <li className="px-4 py-3 text-sm text-gray-500">Recent documents will appear here</li>
            )}
          </ul>
        </div>
        <div className="p-2 border-t text-xs text-gray-500 flex justify-between">
          <span>Press ESC to close</span>
          <span>↑↓ to navigate • Enter to select</span>
        </div>
      </div>
    </div>
  )
}
