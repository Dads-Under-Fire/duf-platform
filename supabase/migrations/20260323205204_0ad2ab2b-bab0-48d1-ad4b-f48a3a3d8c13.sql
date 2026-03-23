ALTER TABLE public.communication_shield_sessions
  ADD COLUMN IF NOT EXISTS free_regenerations_used integer NOT NULL DEFAULT 0;