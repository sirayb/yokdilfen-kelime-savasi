import {
  getWords,
  createDuel,
  getOpenDuelsForUser,
  submitDuelResult,
  getDuelParticipants,
} from '../api.js';

const HP_LOSS = 25;
const BASE_SCORE = 10;
const SPEED_BONUS_MAX = 10;

let identityRef = null;
let userNames = new Map();
let onFinishedCallback = null;

let selection = { source: 'all', count: 15, time: 8, direction: 'tr_en' };

let session = null; // active duel play state
let timerHandle = null;

export function initDuel(identity, allUsers, onFinished) {
  identityRef = identity;
  userNames = new Map(allUsers.map((u) => [u.id, u.display_name]));
  onFinishedCallback = onFinished;

  wireChipGroup('duel-source', (v) => (selection.source = v));
  wireChipGroup('duel-count', (v) => (selection.count = Number(v)));
  wireChipGroup('duel-time', (v) => (selection.time = Number(v)));
  wireChipGroup('duel-direction', (v) => (selection.direction = v));

  document.getElementById('duel-create').addEventListener('click', handleCreateDuel);
  document.getElementById('duel-submit').addEventListener('click', handleSubmitAnswer);
  document.getElementById('duel-answer-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleSubmitAnswer();
  });
  document.getElementById('duel-result-back').addEventListener('click', backToSetup);
}

function wireChipGroup(groupId, onSelect) {
  document.getElementById(groupId).addEventListener('click', (e) => {
    const btn = e.target.closest('.chip');
    if (!btn) return;
    document.querySelectorAll(`#${groupId} .chip`).forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    onSelect(btn.dataset.value);
  });
}

export async function renderDuelTab() {
  const list = document.getElementById('duel-open-list');
  list.innerHTML = '<p class="mono">Yükleniyor...</p>';
  const openDuels = await getOpenDuelsForUser(identityRef.userId);

  if (openDuels.length === 0) {
    list.innerHTML = '<p class="mono">Açık düello yok.</p>';
    return;
  }

  list.innerHTML = openDuels
    .map(
      (d) => `
      <div class="word-row">
        <div>
          <div class="term">${sourceLabel(d.source)} · ${d.question_count} soru · ${d.time_per_question}sn · ${directionLabel(d.direction)}</div>
          <div class="example">Oluşturan: ${d.created_by === identityRef.userId ? 'Sen' : userNames.get(d.created_by) || '—'}</div>
        </div>
        <button class="btn" data-play="${d.id}">Oyna</button>
      </div>`
    )
    .join('');

  list.querySelectorAll('[data-play]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const duel = openDuels.find((d) => d.id === btn.dataset.play);
      await playDuel(duel);
    });
  });
}

function sourceLabel(s) {
  return { all: 'Herkesin Kelimeleri', opponent: 'Rakip Kelimeleri', mine: 'Kendi Kelimeleri' }[s] || s;
}
function directionLabel(d) {
  return { tr_en: 'TR→EN', en_tr: 'EN→TR', mixed: 'Karma' }[d] || d;
}

async function handleCreateDuel() {
  const msg = document.getElementById('duel-setup-msg');
  msg.classList.add('hidden');

  const words = await getWords();
  let pool = words;
  if (selection.source === 'mine') pool = pool.filter((w) => w.added_by === identityRef.userId);
  else if (selection.source === 'opponent') pool = pool.filter((w) => w.added_by !== identityRef.userId);

  if (pool.length < selection.count) {
    msg.textContent = `Bu kaynakta en az ${selection.count} kelime gerekli, mevcut: ${pool.length}.`;
    msg.classList.remove('hidden');
    return;
  }

  const wordIds = shuffle(pool)
    .slice(0, selection.count)
    .map((w) => w.id);

  const duel = await createDuel({
    createdBy: identityRef.userId,
    source: selection.source,
    questionCount: selection.count,
    timePerQuestion: selection.time,
    direction: selection.direction,
    wordIds,
  });

  await playDuel(duel);
}

async function playDuel(duel) {
  const words = await getWords();
  const wordById = new Map(words.map((w) => [w.id, w]));

  const questions = duel.word_ids
    .map((id, i) => {
      const word = wordById.get(id);
      if (!word) return null;
      const dir = duel.direction === 'mixed' ? (i % 2 === 0 ? 'tr_en' : 'en_tr') : duel.direction;
      return { word, dir };
    })
    .filter(Boolean);

  session = {
    duel,
    questions,
    index: 0,
    hp: 100,
    score: 0,
    streak: 0,
    longestStreak: 0,
    correct: 0,
    wrong: 0,
    eliminated: false,
    answers: [],
    timeLeft: duel.time_per_question,
  };

  document.getElementById('duel-setup').classList.add('hidden');
  document.getElementById('duel-result').classList.add('hidden');
  document.getElementById('duel-session').classList.remove('hidden');
  document.getElementById('duel-my-name').textContent = identityRef.displayName;

  updateHud();
  showQuestion();
}

function updateHud() {
  document.getElementById('duel-my-hp').style.width = `${session.hp}%`;
  document.getElementById('duel-my-score').textContent = session.score;
  document.getElementById('duel-my-streak').textContent = session.streak;
}

function showQuestion() {
  const q = session.questions[session.index];
  document.getElementById('duel-prompt-label').textContent = q.dir === 'tr_en' ? 'TR → EN' : 'EN → TR';
  document.getElementById('duel-prompt-word').textContent = q.dir === 'tr_en' ? q.word.tr : q.word.en;
  document.getElementById('duel-question-progress').textContent = `${session.index + 1} / ${session.questions.length}`;
  document.getElementById('duel-answer-input').value = '';
  document.getElementById('duel-answer-input').focus();

  session.timeLeft = session.duel.time_per_question;
  const totalMs = session.duel.time_per_question * 1000;
  const start = performance.now();

  clearInterval(timerHandle);
  timerHandle = setInterval(() => {
    const elapsed = performance.now() - start;
    const remainingMs = Math.max(0, totalMs - elapsed);
    session.timeLeft = remainingMs / 1000;
    document.getElementById('duel-timer-bar').style.width = `${(remainingMs / totalMs) * 100}%`;
    if (remainingMs <= 0) {
      clearInterval(timerHandle);
      handleAnswer(null);
    }
  }, 100);
}

function handleSubmitAnswer() {
  if (!session) return;
  const val = document.getElementById('duel-answer-input').value;
  clearInterval(timerHandle);
  handleAnswer(val);
}

function normalize(str) {
  return (str || '').trim().toLocaleLowerCase('tr').normalize('NFC');
}

function handleAnswer(userAnswer) {
  const q = session.questions[session.index];
  const correctAnswer = q.dir === 'tr_en' ? q.word.en : q.word.tr;
  const isCorrect = userAnswer !== null && normalize(userAnswer) === normalize(correctAnswer);
  const timeRatio = session.timeLeft / session.duel.time_per_question;

  if (isCorrect) {
    session.correct++;
    session.streak++;
    session.longestStreak = Math.max(session.longestStreak, session.streak);
    const multiplier = 1 + Math.floor(session.streak / 3) * 0.5;
    const gain = Math.round((BASE_SCORE + timeRatio * SPEED_BONUS_MAX) * multiplier);
    session.score += gain;
  } else {
    session.wrong++;
    session.streak = 0;
    session.hp = Math.max(0, session.hp - HP_LOSS);
    if (session.hp === 0) session.eliminated = true;
  }

  session.answers.push({ wordId: q.word.id, correct: isCorrect, userAnswer: userAnswer || '' });
  session.index++;
  updateHud();

  if (session.eliminated || session.index >= session.questions.length) {
    endDuel();
  } else {
    showQuestion();
  }
}

async function endDuel() {
  clearInterval(timerHandle);

  await submitDuelResult(session.duel.id, identityRef.userId, {
    score: session.score,
    hp: session.hp,
    correct: session.correct,
    wrong: session.wrong,
    longestStreak: session.longestStreak,
    eliminated: session.eliminated,
    answers: session.answers,
  });

  const participants = await getDuelParticipants(session.duel.id);
  const me = participants.find((p) => p.user_id === identityRef.userId);
  const opponent = participants.find((p) => p.user_id !== identityRef.userId);

  document.getElementById('duel-session').classList.add('hidden');
  document.getElementById('duel-result').classList.remove('hidden');

  const content = document.getElementById('duel-result-content');
  let html = `
    <div class="word-row">
      <div class="term">Sen</div>
      <div class="mono">Skor: ${me.score} · Doğru: ${me.correct} · Yanlış: ${me.wrong} · Seri: ${me.longest_streak}${me.eliminated ? ' · ELENDİN' : ''}</div>
    </div>`;

  if (opponent && opponent.finished_at) {
    html += `
    <div class="word-row">
      <div class="term">${userNames.get(opponent.user_id) || 'Rakip'}</div>
      <div class="mono">Skor: ${opponent.score} · Doğru: ${opponent.correct} · Yanlış: ${opponent.wrong} · Seri: ${opponent.longest_streak}${opponent.eliminated ? ' · ELENDİ' : ''}</div>
    </div>
    <h3 style="margin-top:14px;">${me.score > opponent.score ? 'Kazandın!' : me.score < opponent.score ? 'Kaybettin.' : 'Berabere.'}</h3>`;
  } else {
    html += `<p class="hint" style="color:var(--text-muted);margin-top:10px;">Rakibin henüz bu düelloyu oynamadı. Oynadığında sonuçlar karşılaştırılacak.</p>`;
  }

  content.innerHTML = html;
  session = null;

  if (onFinishedCallback) await onFinishedCallback();
}

function backToSetup() {
  document.getElementById('duel-result').classList.add('hidden');
  document.getElementById('duel-setup').classList.remove('hidden');
  renderDuelTab();
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
