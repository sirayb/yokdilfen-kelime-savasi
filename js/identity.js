import { getClient } from './supabaseClient.js';
import { getIdentity, saveIdentity, setDisplayName } from './config.js';

export async function ensureIdentity(displayNameIfNew) {
  let identity = getIdentity();
  if (identity) return identity;

  const userId = crypto.randomUUID();
  const { error } = await getClient()
    .from('users')
    .insert({ id: userId, display_name: displayNameIfNew });
  if (error) throw error;

  saveIdentity(userId, displayNameIfNew);
  return { userId, displayName: displayNameIfNew };
}

export async function renameCurrentUser(newName) {
  const identity = getIdentity();
  if (!identity) throw new Error('Kimlik bulunamadı');

  const { error } = await getClient()
    .from('users')
    .update({ display_name: newName })
    .eq('id', identity.userId);
  if (error) throw error;

  setDisplayName(newName);
}

export async function getAllUsers() {
  const { data, error } = await getClient().from('users').select('id, display_name');
  if (error) throw error;
  return data;
}
