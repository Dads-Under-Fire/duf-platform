-- Table for centralized AI prompt management
CREATE TABLE public.ai_system_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('rewrite', 'respond')),
  version_label text NOT NULL DEFAULT 'v1',
  prompt_text text NOT NULL,
  is_active boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Only one active prompt per feature_key + mode combination
CREATE UNIQUE INDEX idx_one_active_prompt_per_mode
  ON public.ai_system_prompts (feature_key, mode)
  WHERE is_active = true;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_ai_system_prompts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_ai_system_prompts_updated_at
  BEFORE UPDATE ON public.ai_system_prompts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_ai_system_prompts_updated_at();

-- RLS: enabled but no public policies - only service_role can access
ALTER TABLE public.ai_system_prompts ENABLE ROW LEVEL SECURITY;

-- Add helpful comment
COMMENT ON TABLE public.ai_system_prompts IS 'Centralized AI system prompts with versioning. Only one active prompt per feature_key+mode.';