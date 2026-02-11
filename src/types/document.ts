export type DocumentStatus = 'draft' | 'active' | 'terminal'
export type DocumentSystem = 
  | 'personal' 
  | 'hbar.systems' 
  | 'BrainFoundry'
  | 'hbar.work' 
  | 'hbar.build' 
  | 'hbar.agency' 
  | 'hbar.shop' 
  | 'hbar.bio' 
  | 'hbar.blog' 
  | 'hbar.science' 
  | 'hbar.university' 
  | 'hbar.economy' 
  | 'hbar.music' 
  | 'hbar.art' 
  | 'hbar.poker' 
  | 'hbar.vision' 
  | 'ableton.systems' 
  | 'orfeo.music'
export type DocumentSourceKind = 'note' | 'essay' | 'paper_section' | 'plan' | 'meeting' | 'prompt' | 'spec' | 'log' | 'archive' | 'dataset_card'
export type DocumentAIPolicy = 'allow' | 'allow_rag_only' | 'deny'
export type StylePreset = 'WritersRoom' | 'NightInk'

export interface Document {
  id: string
  owner_id: string
  title: string
  content_md: string
  system: DocumentSystem
  source_kind: DocumentSourceKind
  status: DocumentStatus
  tags: string[]
  ai_policy: DocumentAIPolicy
  style_preset: StylePreset
  pin_rank: number | null
  created_at: string
  updated_at: string
  sealed_at?: string | null
}
