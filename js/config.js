const KEYS = {
  url: 'yokdilfen_supabase_url',
  anonKey: 'yokdilfen_supabase_anon_key',
  userId: 'yokdilfen_user_id',
  displayName: 'yokdilfen_display_name',
  theme: 'yokdilfen_theme',
};

export function getSupabaseConfig() {
  const url = localStorage.getItem(KEYS.url);
  const anonKey = localStorage.getItem(KEYS.anonKey);
  return url && anonKey ? { url, anonKey } : null;
}

export function saveSupabaseConfig(url, anonKey) {
  localStorage.setItem(KEYS.url, url);
  localStorage.setItem(KEYS.anonKey, anonKey);
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
