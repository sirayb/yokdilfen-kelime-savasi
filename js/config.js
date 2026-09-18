// anon key RLS ile korunur, tarayıcı tarafında herkese açık kullanılmak üzere
// tasarlanmıştır — bu yüzden burada sabit değer olarak tutuluyor, kullanıcıdan
// istenmiyor. Gizli tutulması gereken service_role key asla buraya konmamalı.
const SUPABASE_URL = 'https://qerrstupajwdnfnqdjjo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFlcnJzdHVwYWp3ZG5mbnFkampvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk3NDY2MDgsImV4cCI6MjEwNTMyMjYwOH0.gymitCHMZ0cDktjAquEYHJIocQ9gpe4_sLvghx3GmhQ';

const KEYS = {
  userId: 'yokdilfen_user_id',
  displayName: 'yokdilfen_display_name',
  theme: 'yokdilfen_theme',
};

export function getSupabaseConfig() {
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
}

export function getIdentity() {
  const userId = localStorage.getItem(KEYS.userId);
  const displayName = localStorage.getItem(KEYS.displayName);
  return userId && displayName ? { userId, displayName } : null;
}

export function saveIdentity(userId, displayName) {
  localStorage.setItem(KEYS.userId, userId);
  localStorage.setItem(KEYS.displayName, displayName);
}

export function setDisplayName(name) {
  localStorage.setItem(KEYS.displayName, name);
}

export function getTheme() {
  return localStorage.getItem(KEYS.theme) || 'light';
}

export function setTheme(theme) {
  localStorage.setItem(KEYS.theme, theme);
}

export function clearAll() {
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
}
