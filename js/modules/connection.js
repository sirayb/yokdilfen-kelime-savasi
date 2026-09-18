import { getClient } from '../supabaseClient.js';
import { clearAll } from '../config.js';
import { renameCurrentUser } from '../identity.js';

export function initConnection(identity) {
  document.getElementById('connection-name').value = identity.displayName;

  document.getElementById('connection-name-save').addEventListener('click', async () => {
    const newName = document.getElementById('connection-name').value.trim();
    if (!newName) return;
    await renameCurrentUser(newName);
    document.getElementById('current-user-badge').textContent = newName;
  });

  document.getElementById('connection-remove').addEventListener('click', () => {
    const sure = confirm('Bu cihazın bağlantısını kaldırmak istediğine emin misin? Supabase bilgilerin ve yerel kimliğin bu cihazdan silinecek.');
    if (!sure) return;
    clearAll();
    location.reload();
  });

  checkStatus();
}

async function checkStatus() {
  const dot = document.getElementById('connection-status-dot');
  const text = document.getElementById('connection-status-text');
  try {
    const { error } = await getClient().from('users').select('id').limit(1);
    if (error) throw error;
    dot.classList.add('ok');
    dot.classList.remove('bad');
    text.textContent = 'Bağlı';
  } catch (err) {
    dot.classList.add('bad');
    dot.classList.remove('ok');
    text.textContent = 'Bağlantı hatası: ' + err.message;
  }
}
