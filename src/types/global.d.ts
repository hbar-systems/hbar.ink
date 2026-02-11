import { DocumentSystem, DocumentSourceKind, DocumentStatus, DocumentAIPolicy } from './document';

// Augment the Document interface to avoid conflicts with DOM Document
declare global {
  // Use a different name to avoid conflicts
  interface DocumentRow {
    id: string;
    owner_id: string;
    title: string;
    content_md: string;
    system: DocumentSystem;
    source_kind: DocumentSourceKind;
    status: DocumentStatus;
    tags: string[];
    ai_policy: DocumentAIPolicy;
    style_preset: string;
    pin_rank: number | null;
    created_at: string;
    updated_at: string;
  }
}
