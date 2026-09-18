import { getWords, getWeakWordIds, markWeak, unmarkWeak } from '../api.js';

let identityRef = null;
let source = 'all';
let direction = 'tr_en';
let queue = [];
let index = 0;
let knowCount = 0;
let dontKnowCount = 0;

export function initTraining(identity) {
  identityRef = identity;

  document.getElementById('training-source').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    setActiveChip('#training-source', btn);
    source = btn.dataset.value;
  });

  document.getElementById('training-direction').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    setActiveChip('#training-direction', btn);
    direction = btn.dataset.value;
  });

  document.getElementById('training-start').addEventListener('click', startSession);
  document.getElementById('training-restart').addEventListener('click', resetToSetup);
  document.getElementById('training-stop').addEventListener('click', finishSession);
  document.getElementById('training-flip').addEventListener('click', () => {
    document.getElementById('training-card').classList.toggle('flipped');
  });
  document.getElementById('training-know').addEventListener('click', () => answer(true));
  document.getElementById('training-dont-know').addEventListener('click', () => answer(false));
}

function setActiveChip(groupSelector, activeBtn) {
  document.querySelectorAll(`${groupSelector} .chip`).forEach((c) => c.classList.remove('active'));
  activeBtn.classList.add('active');
}

async function startSession() {
  const errMsg = document.getElementById('training-empty-msg');
  errMsg.classList.add('hidden');

  const [words, weakIds] = await Promise.all([getWords(), getWeakWordIds(identityRef.userId)]);

  let pool = words;
  if (source === 'mine') pool = pool.filter((w) => w.added_by === identityRef.userId);
  else if (source === 'others') pool = pool.filter((w) => w.added_by !== identityRef.userId);
  else if (source === 'weak') pool = pool.filter((w) => weakIds.has(w.id));

  if (pool.length === 0) {
    errMsg.textContent = 'Bu filtreyle çalışılacak kelime yok.';
    errMsg.classList.remove('hidden');
    return;
  }

  queue = shuffle(pool).map((w) => ({
    word: w,
    dir: direction === 'mixed' ? (Math.random() < 0.5 ? 'tr_en' : 'en_tr') : direction,
  }));
  index = 0;
  knowCount = 0;
  dontKnowCount = 0;

  document.getElementById('training-setup').classList.add('hidden');
  document.getElementById('training-summary').classList.add('hidden');
  document.getElementById('training-session').classList.remove('hidden');
  showCard();
}

function showCard() {
  document.getElementById('training-card').classList.remove('flipped');
  const { word, dir } = queue[index];

  const front = dir === 'tr_en' ? word.tr : word.en;
  const back = dir === 'tr_en' ? word.en : word.tr;

  document.getElementById('training-front-word').textContent = front;
  document.getElementById('training-back-word').textContent = back;
  document.getElementById('training-back-example').textContent = word.example || '';
  document.getElementById('training-progress').textContent = `${index + 1} / ${queue.length}`;
}

async function answer(knew) {
  const { word } = queue[index];

  if (knew) {
    knowCount++;
    await unmarkWeak(identityRef.userId, word.id);
  } else {
    dontKnowCount++;
    await markWeak(identityRef.userId, word.id);
  }

  index++;
  if (index >= queue.length) {
    finishSession();
  } else {
    showCard();
  }
}

function finishSession() {
  document.getElementById('training-session').classList.add('hidden');
  document.getElementById('training-summary').classList.remove('hidden');
  document.getElementById('training-summary-text').textContent =
    `Bildiğin: ${knowCount}  /  Bilemediğin: ${dontKnowCount}`;
}

function resetToSetup() {
  document.getElementById('training-summary').classList.add('hidden');
  document.getElementById('training-setup').classList.remove('hidden');
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
