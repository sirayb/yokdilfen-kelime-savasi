import { addWord } from '../api.js';

export function initAddWord(identity, onAdded) {
  const form = document.getElementById('add-word-form');
  const msg = document.getElementById('add-word-msg');
  const exampleField = document.getElementById('add-example');

  exampleField.addEventListener('input', () => autoGrow(exampleField));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.classList.add('hidden');

    const en = document.getElementById('add-en').value.trim();
    const tr = document.getElementById('add-tr').value.trim();
    const example = exampleField.value.trim();

    if (!en || !tr) return;

    try {
      await addWord({ en, tr, example, addedBy: identity.userId });
      form.reset();
      autoGrow(exampleField);
      if (onAdded) await onAdded();
    } catch (err) {
      msg.textContent = 'Hata: ' + err.message;
      msg.classList.remove('hidden');
    }
  });
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight}px`;
}
