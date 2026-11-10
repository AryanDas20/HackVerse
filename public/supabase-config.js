// Browser-safe Supabase configuration for signed chat-media uploads.
// The anon/publishable key is public; NEVER place the service-role key here.
export const supabaseConfig = {
  url: "YOUR_SUPABASE_PROJECT_URL",
  anonKey: "YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY",
  bucket: "chat-media"
};
