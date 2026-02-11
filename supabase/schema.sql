-- Create documents table
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled',
  content_md text NOT NULL DEFAULT '',
  system text NOT NULL DEFAULT 'personal',
  source_kind text NOT NULL DEFAULT 'note',
  status text NOT NULL DEFAULT 'draft',
  tags text[] NOT NULL DEFAULT '{}'::text[],
  ai_policy text NOT NULL DEFAULT 'deny',
  style_preset text NOT NULL DEFAULT 'WritersRoom',
  pin_rank int NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX documents_owner_id_updated_at_idx ON public.documents (owner_id, updated_at DESC);
CREATE INDEX documents_owner_id_status_idx ON public.documents (owner_id, status);
CREATE INDEX documents_owner_id_system_idx ON public.documents (owner_id, system);

-- Enable Row Level Security
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view their own documents" 
  ON public.documents 
  FOR SELECT 
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can insert their own documents" 
  ON public.documents 
  FOR INSERT 
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can update their own documents" 
  ON public.documents 
  FOR UPDATE 
  USING (auth.uid() = owner_id);

CREATE POLICY "Users can delete their own documents" 
  ON public.documents 
  FOR DELETE 
  USING (auth.uid() = owner_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER set_updated_at
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();
