import { addWord } from '../api.js';

export function initAddWord(identity, onAdded) {
  const form = document.getElementById('add-word-form');
  const msg = document.getElementById('add-word-msg');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.classList.add('hidden');

    const en = document.getElementById('add-en').value.trim();
    const tr = document.getElementById('add-tr').value.trim();
    const example = document.getElementById('add-example').value.trim();

    if (!en || !tr) return;

    try {
      await addWord({ en, tr, example, addedBy: identity.userId });
      form.reset();
      if (onAdded) await onAdded();
    } catch (err) {
      msg.textContent = 'Hata: ' + err.message;
      msg.classList.remove('hidden');
    }
  });
}
