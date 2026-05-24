import type { SupabaseClient } from '@supabase/supabase-js';

export async function uploadFile(
  supabase: SupabaseClient,
  bucket: string,
  file: File,
  scope: { tenant_id: string | null; user_id: string },
): Promise<string> {
  if (!scope.tenant_id) throw new Error('Missing tenant_id');
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${scope.tenant_id}/${scope.user_id}/${Date.now()}-${safeName}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getSignedUrl(
  supabase: SupabaseClient,
  bucket: string,
  path: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}
