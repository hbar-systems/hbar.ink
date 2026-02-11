-- Add sealed_at column to documents table
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS sealed_at timestamptz;

-- Update existing terminal documents to have a sealed_at timestamp
UPDATE public.documents
SET sealed_at = updated_at
WHERE status = 'terminal' AND sealed_at IS NULL;

-- Modify the prevent_terminal_status_change function to set sealed_at
CREATE OR REPLACE FUNCTION prevent_terminal_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the old status was 'terminal' and the new status is different
  IF OLD.status = 'terminal' AND NEW.status != 'terminal' THEN
    RAISE EXCEPTION 'Cannot change status from terminal to %', NEW.status;
  END IF;
  
  -- If status is changing to terminal, set the sealed_at timestamp
  IF OLD.status != 'terminal' AND NEW.status = 'terminal' THEN
    NEW.sealed_at = now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
