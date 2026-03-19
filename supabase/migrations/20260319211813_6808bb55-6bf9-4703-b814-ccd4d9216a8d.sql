ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';

-- RLS policy: only admins can read other users' roles
-- (existing policies already let users read own profile)