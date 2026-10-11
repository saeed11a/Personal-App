import { supabase } from "@/api/supabaseClient";

// The signed-in account's own picture (0008_profile_avatar.sql).
//
// A picture lives in the `avatars` bucket at '<user id>/avatar.<ext>'. The first path
// segment is the owner, which is exactly what the storage policies check, so an
// account can only ever write inside its own folder. What gets saved on the profile
// is the bucket's public URL with a ?v= stamp, so a replaced picture is not served
// from a stale cache entry, and it is still there after a refresh or a new sign-in.

export const AVATAR_BUCKET = "avatars";
// Kept in step with the bucket's file_size_limit and allowed_mime_types in 0008.
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** A message for a file that cannot be used, or "" when it is fine. */
export function avatarFileError(file) {
  if (!file) return "Choose an image first.";
  if (!AVATAR_TYPES.includes(file.type)) return "Use a PNG, JPEG, WEBP or GIF image.";
  if (file.size > AVATAR_MAX_BYTES) return "That image is larger than 2 MB. Choose a smaller one.";
  return "";
}

/**
 * Uploads one image and saves its URL on the caller's own profile.
 * Returns the stored URL. Throws with a readable message on any failure.
 */
export async function saveAvatar(userId, file) {
  if (!supabase) throw new Error("Supabase is not configured");
  if (!userId) throw new Error("Sign in again to change your picture.");

  const problem = avatarFileError(file);
  if (problem) throw new Error(problem);

  const path = `${userId}/avatar.${EXTENSIONS[file.type] || "png"}`;

  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (uploadError) throw new Error(uploadError.message);

  // Drop an earlier picture saved under a different extension. Best effort only: the
  // new picture is already in place, so a failure here leaves a stray file, never a
  // broken avatar.
  const { data: existing } = await supabase.storage.from(AVATAR_BUCKET).list(userId);
  const stale = (existing || [])
    .map((entry) => `${userId}/${entry.name}`)
    .filter((name) => name !== path);
  if (stale.length) await supabase.storage.from(AVATAR_BUCKET).remove(stale);

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  const url = `${data.publicUrl}?v=${Date.now()}`;

  // Only the caller's own avatar_url is written, and the database decides that
  // (set_own_avatar) — this code never chooses which profile row is touched.
  const { error: saveError } = await supabase.rpc("set_own_avatar", { p_url: url });
  if (saveError) throw new Error(saveError.message);

  return url;
}
