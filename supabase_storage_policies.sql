-- Reference Supabase Storage RLS policies for bucket: lesimagesprofiles
-- DO NOT apply automatically. Review and apply manually in Supabase Dashboard > Storage > Policies.
--
-- Note: The current app authenticates users via Firebase Auth (not Supabase Auth),
-- so Supabase requests arrive with the `anon` / publishable role unless a custom JWT bridge is added.
-- Therefore:
--   1. Public read on `lesimagesprofiles` allows profile avatars, chat images, backgrounds, and files to load via public URLs.
--   2. Restricting INSERT/DELETE to authenticated Supabase users requires bridging Firebase Auth JWTs to Supabase;
--      until then, keep bucket size/MIME limits configured in Supabase Dashboard and avoid predictable overwrites.

-- Ensure bucket exists as public for getPublicUrl() reads:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('lesimagesprofiles', 'lesimagesprofiles', true) ON CONFLICT (id) DO UPDATE SET public = true;

-- Read policy (public URLs / getPublicUrl):
CREATE POLICY "Allow public read on lesimagesprofiles"
ON storage.objects FOR SELECT
USING (bucket_id = 'lesimagesprofiles');

-- Temporary client upload/delete policies while Firebase Auth is separate from Supabase Auth:
-- (Replace `true` with `auth.role() = 'authenticated'` once Firebase-to-Supabase JWT exchange is configured)
CREATE POLICY "Allow upload to lesimagesprofiles"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'lesimagesprofiles');

CREATE POLICY "Allow update in lesimagesprofiles"
ON storage.objects FOR UPDATE
USING (bucket_id = 'lesimagesprofiles')
WITH CHECK (bucket_id = 'lesimagesprofiles');

CREATE POLICY "Allow delete in lesimagesprofiles"
ON storage.objects FOR DELETE
USING (bucket_id = 'lesimagesprofiles');
