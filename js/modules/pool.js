import { getWords, deleteWord } from '../api.js';

let currentFilter = 'all';
let cachedWords = [];
let userNames = new Map();
let identityRef = null;

export function initPool(identity, allUsers) {
  identityRef = identity;
  userNames = new Map(allUsers.map((u) => [u.id, u.display_name]));

  document.getElementById('pool-filter').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    document.querySelectorAll('#pool-filter .chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    render(identity);
  });

  document.getElementById('pool-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    const word = cachedWords.find((w) => w.id === btn.dataset.delete);
    if (!word) return;
    const sure = confirm(`"${word.en}" kelimesini silmek istediğine emin misin?`);
    if (!sure) return;
    await deleteWord(word.id, identityRef.userId);
    await renderPool(identityRef);
  });
}

export async function renderPool(identity) {
  cachedWords = await getWords();
  render(identity);
}

function render(identity) {
  const list = document.getElementById('pool-list');
  let words = cachedWords;

  if (currentFilter === 'mine') {
    words = words.filter((w) => w.added_by === identity.userId);
  } else if (currentFilter === 'others') {
    words = words.filter((w) => w.added_by !== identity.userId);
  }

  if (words.length === 0) {
    list.innerHTML = '<p class="mono">Kelime yok.</p>';
    return;
  }

  list.innerHTML = words
    .map((w) => {
      const isMine = w.added_by === identity.userId;
      const authorName = isMine ? 'Sen' : userNames.get(w.added_by) || '—';
      return `
        <div class="word-row">
          <div>
            <div class="term">${escapeHtml(w.en)} <span class="meaning">— ${escapeHtml(w.tr)}</span></div>
            ${w.example ? `<div class="example">${escapeHtml(w.example)}</div>` : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="tag ${isMine ? 'me' : ''}">${escapeHtml(authorName)}</span>
            ${isMine ? `<button class="btn btn-danger" style="padding:4px 10px;" data-delete="${w.id}">Sil</button>` : ''}
          </div>
        </div>`;
    })
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
