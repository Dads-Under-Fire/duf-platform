-- Fix search_path security warning on trigger function
CREATE OR REPLACE FUNCTION public.update_ai_system_prompts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;