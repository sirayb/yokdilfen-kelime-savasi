import { getSupabaseConfig, saveSupabaseConfig, getIdentity, getTheme, setTheme } from './config.js';
import { resetClient } from './supabaseClient.js';
import { ensureIdentity, getAllUsers } from './identity.js';
import { renderHome } from './modules/home.js';
import { initAddWord } from './modules/addWord.js';
import { initPool, renderPool } from './modules/pool.js';
import { initTraining } from './modules/training.js';
import { initDuel, renderDuelTab } from './modules/duel.js';
import { renderLeaderboard } from './modules/leaderboard.js';
import { initConnection } from './modules/connection.js';

applyTheme(getTheme());

let identity = getIdentity();
const config = getSupabaseConfig();

if (!config || !identity) {
  showSetupScreen();
} else {
  boot();
}

function showSetupScreen() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');

  const cfg = getSupabaseConfig();
  if (cfg) {
    document.getElementById('setup-url').value = cfg.url;
    document.getElementById('setup-key').value = cfg.anonKey;
  }

  document.getElementById('setup-submit').addEventListener('click', async () => {
    const url = document.getElementById('setup-url').value.trim();
    const key = document.getElementById('setup-key').value.trim();
    const name = document.getElementById('setup-name').value.trim();
    const errEl = document.getElementById('setup-error');
    errEl.classList.add('hidden');

    if (!url || !key || !name) {
      errEl.textContent = 'Tüm alanları doldur.';
      errEl.classList.remove('hidden');
      return;
    }

    try {
      saveSupabaseConfig(url, key);
      resetClient();
      identity = await ensureIdentity(name);
      document.getElementById('setup-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      await boot();
    } catch (err) {
      errEl.textContent = 'Bağlantı hatası: ' + err.message;
      errEl.classList.remove('hidden');
    }
  });
}

async function boot() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  document.getElementById('current-user-badge').textContent = identity.displayName;

  initTabs();
  initThemeToggle();

  const allUsers = await getAllUsers();

  initAddWord(identity, async () => {
    await renderHome(identity);
    await renderPool(identity);
  });
  initPool(identity, allUsers);
  initTraining(identity);
  initDuel(identity, allUsers, async () => {
    await renderHome(identity);
    await renderLeaderboard(identity);
  });
  initConnection(identity);

  await refreshActiveTab('home');
}

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
      await refreshActiveTab(btn.dataset.tab);
    });
  });
}

async function refreshActiveTab(tab) {
  if (tab === 'home') await renderHome(identity);
  else if (tab === 'pool') await renderPool(identity);
  else if (tab === 'duel') await renderDuelTab();
  else if (tab === 'leaderboard') await renderLeaderboard(identity);
}

function initThemeToggle() {
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setTheme(next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}
