-- Create a function to prevent status changes from 'terminal'
CREATE OR REPLACE FUNCTION prevent_terminal_status_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the old status was 'terminal' and the new status is different
  IF OLD.status = 'terminal' AND NEW.status != 'terminal' THEN
    RAISE EXCEPTION 'Cannot change status from terminal to %', NEW.status;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger that fires before updates on the documents table
DROP TRIGGER IF EXISTS trg_prevent_terminal_status_change ON public.documents;
CREATE TRIGGER trg_prevent_terminal_status_change
BEFORE UPDATE ON public.documents
FOR EACH ROW
EXECUTE FUNCTION prevent_terminal_status_change();
