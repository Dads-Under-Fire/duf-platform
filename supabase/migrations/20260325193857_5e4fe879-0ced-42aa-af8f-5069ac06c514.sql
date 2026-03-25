
-- Create storage bucket for case log attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('case-log-attachments', 'case-log-attachments', false);

-- Users can upload files to their own folder
CREATE POLICY "Users can upload own attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'case-log-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can read their own files
CREATE POLICY "Users can read own attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'case-log-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Users can delete their own files
CREATE POLICY "Users can delete own attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'case-log-attachments'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
