import { supabase } from './supabase'
import { Document } from '@/types/document'

export async function createDocument(userId: string, title: string = 'Untitled') {
  const { data, error } = await supabase
    .from('documents')
    .insert([
      { 
        owner_id: userId,
        title
      }
    ])
    .select()
    .single()

  if (error) {
    throw new Error(`Error creating document: ${error.message}`)
  }

  return data as Document
}

export async function getDocuments(userId: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Error fetching documents: ${error.message}`)
  }

  return data as Document[]
}

export async function getDocumentsByStatus(userId: string, status: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('owner_id', userId)
    .eq('status', status)
    .order('updated_at', { ascending: false })

  if (error) {
    throw new Error(`Error fetching documents: ${error.message}`)
  }

  return data as Document[]
}

export async function getDocument(id: string) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    throw new Error(`Error fetching document: ${error.message}`)
  }

  return data as Document
}

export async function updateDocument(id: string, updates: Partial<Document>) {
  const { data, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) {
    throw new Error(`Error updating document: ${error.message}`)
  }

  return data as Document
}

export async function deleteDocument(id: string) {
  const { error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)

  if (error) {
    throw new Error(`Error deleting document: ${error.message}`)
  }

  return true
}
