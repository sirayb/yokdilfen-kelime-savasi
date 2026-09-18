import {
  getWords,
  createDuel,
  getOpenDuelsForUser,
  submitDuelResult,
  getDuelParticipants,
  getJoinableLiveDuels,
  getMyWaitingLiveDuels,
  getMyActiveLiveDuel,
  joinLiveDuel,
  cancelWaitingLiveDuel,
  advanceLiveQuestion,
  submitLiveAnswer,
  getLiveDuelAnswers,
  subscribeToLiveDuel,
  unsubscribeChannel,
} from '../api.js';
import { splitAlternatives, normalizeAnswer } from '../wordUtils.js';

const HP_LOSS = 25;
const BASE_SCORE = 10;
const SPEED_BONUS_MAX = 10;
const LIVE_ADVANCE_GRACE_MS = 4000;
const LIVE_CORRECT_POINTS = 15;
const LIVE_WRONG_POINTS = 5;

let identityRef = null;
let userNames = new Map();
let onFinishedCallback = null;

let selection = { mode: 'live', source: 'all', count: 15, time: 8, direction: 'tr_en' };

let session = null; // aktif düello oturumu (async ya da live)
let timerHandle = null;
let advanceFallbackHandle = null;

let liveChannel = null;
let liveChannelDuelId = null;
let waitingDuelId = null;

export function initDuel(identity, allUsers, onFinished) {
  identityRef = identity;
  userNames = new Map(allUsers.map((u) => [u.id, u.display_name]));
  onFinishedCallback = onFinished;

  wireChipGroup('duel-mode', (v) => (selection.mode = v));
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
  document.getElementById('duel-waiting-cancel').addEventListener('click', handleCancelWaiting);
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

function sourceLabel(s) {
  return { all: 'Herkesin Kelimeleri', opponent: 'Rakip Kelimeleri', mine: 'Kendi Kelimeleri' }[s] || s;
}
function directionLabel(d) {
  return { tr_en: 'TR→EN', en_tr: 'EN→TR', mixed: 'Karma' }[d] || d;
}
function opponentIdOf(duel) {
  return duel.created_by === identityRef.userId ? duel.joined_by : duel.created_by;
}

// ---------- sekme render ----------

export async function renderDuelTab() {
  if (session) return; // zaten bir düello oturumundayız, listeleri ezme

  const activeLive = await getMyActiveLiveDuel(identityRef.userId);
  if (activeLive) {
    await playLiveDuel(activeLive);
    return;
  }

  const joinableList = document.getElementById('duel-live-joinable-list');
  const waitingList = document.getElementById('duel-live-waiting-list');
  const openList = document.getElementById('duel-open-list');
  joinableList.innerHTML = '<p class="mono">Yükleniyor...</p>';
  waitingList.innerHTML = '';
  openList.innerHTML = '<p class="mono">Yükleniyor...</p>';

  const [joinable, mineWaiting, openDuels] = await Promise.all([
    getJoinableLiveDuels(identityRef.userId),
    getMyWaitingLiveDuels(identityRef.userId),
    getOpenDuelsForUser(identityRef.userId),
  ]);

  joinableList.innerHTML = joinable.length
    ? joinable
        .map(
          (d) => `
      <div class="word-row">
        <div>
          <div class="term">${sourceLabel(d.source)} · ${d.question_count} soru · ${d.time_per_question}sn · ${directionLabel(d.direction)}</div>
          <div class="example">Oluşturan: ${userNames.get(d.created_by) || '—'}</div>
        </div>
        <button class="btn" data-join="${d.id}">Katıl</button>
      </div>`
        )
        .join('')
    : '<p class="mono">Katılabileceğin canlı düello yok.</p>';

  joinableList.querySelectorAll('[data-join]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const duel = joinable.find((d) => d.id === btn.dataset.join);
      await handleJoinLiveDuel(duel);
    });
  });

  waitingList.innerHTML = mineWaiting
    .map(
      (d) => `
      <div class="word-row">
        <div>
          <div class="term">${sourceLabel(d.source)} · ${d.question_count} soru · ${d.time_per_question}sn · ${directionLabel(d.direction)}</div>
          <div class="example">Rakip bekleniyor...</div>
        </div>
        <button class="btn btn-secondary" data-resume="${d.id}">Bekleme Odasına Dön</button>
      </div>`
    )
    .join('');

  waitingList.querySelectorAll('[data-resume]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const duel = mineWaiting.find((d) => d.id === btn.dataset.resume);
      enterWaitingRoom(duel);
    });
  });

  openList.innerHTML = openDuels.length
    ? openDuels
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
        .join('')
    : '<p class="mono">Açık düello yok.</p>';

  openList.querySelectorAll('[data-play]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const duel = openDuels.find((d) => d.id === btn.dataset.play);
      await playAsyncDuel(duel);
    });
  });
}

// ---------- düello oluşturma ----------

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
    mode: selection.mode,
  });

  if (selection.mode === 'live') {
    enterWaitingRoom(duel);
  } else {
    await playAsyncDuel(duel);
  }
}

function buildQuestions(duel, words) {
  const wordById = new Map(words.map((w) => [w.id, w]));
  return duel.word_ids
    .map((id, i) => {
      const word = wordById.get(id);
      if (!word) return null;
      const dir = duel.direction === 'mixed' ? (i % 2 === 0 ? 'tr_en' : 'en_tr') : duel.direction;
      return { word, dir };
    })
    .filter(Boolean);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- ASYNC düello (herkes kendi zamanında) ----------

async function playAsyncDuel(duel) {
  const words = await getWords();

  session = {
    mode: 'async',
    duel,
    questions: buildQuestions(duel, words),
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

  showPanel('duel-session');
  document.getElementById('duel-opp-hud').classList.add('hidden');
  document.getElementById('duel-my-hp-wrap').classList.remove('hidden');
  document.getElementById('duel-waiting-opponent-msg').textContent = '';
  document.getElementById('duel-my-name').textContent = identityRef.displayName;

  updateHud();
  showAsyncQuestion();
}

function updateHud() {
  document.getElementById('duel-my-hp').style.width = `${session.hp}%`;
  document.getElementById('duel-my-score').textContent = session.score;
  document.getElementById('duel-my-streak').textContent = session.streak;
}

function showAsyncQuestion() {
  const q = session.questions[session.index];
  renderQuestionPrompt(q, session.index, session.questions.length);
  document.getElementById('duel-answer-input').disabled = false;
  document.getElementById('duel-submit').disabled = false;

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
      handleAsyncAnswer(null);
    }
  }, 100);
}

function renderQuestionPrompt(q, index, total) {
  document.getElementById('duel-prompt-label').textContent = q.dir === 'tr_en' ? 'TR → EN' : 'EN → TR';
  document.getElementById('duel-prompt-word').textContent = q.dir === 'tr_en' ? q.word.tr : q.word.en;
  document.getElementById('duel-question-progress').textContent = `${index + 1} / ${total}`;
  document.getElementById('duel-answer-input').value = '';
  document.getElementById('duel-answer-input').focus();
}

function evaluateAnswer(q, userAnswer) {
  const correctAnswer = q.dir === 'tr_en' ? q.word.en : q.word.tr;
  const acceptedAnswers = splitAlternatives(correctAnswer);
  return userAnswer !== null && acceptedAnswers.includes(normalizeAnswer(userAnswer));
}

function handleAsyncAnswer(userAnswer) {
  const q = session.questions[session.index];
  const isCorrect = evaluateAnswer(q, userAnswer);
  const timeRatio = session.timeLeft / session.duel.time_per_question;

  if (isCorrect) {
    session.correct++;
    session.streak++;
    session.longestStreak = Math.max(session.longestStreak, session.streak);
    const multiplier = 1 + Math.floor(session.streak / 3) * 0.5;
    session.score += Math.round((BASE_SCORE + timeRatio * SPEED_BONUS_MAX) * multiplier);
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
    endAsyncDuel();
  } else {
    showAsyncQuestion();
  }
}

async function endAsyncDuel() {
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

  showResult(me, opponent && opponent.finished_at ? opponent : null);
}

// ---------- LIVE düello (senkron) ----------

function enterWaitingRoom(duel) {
  waitingDuelId = duel.id;
  session = null;
  ensureLiveChannel(duel.id);
  showPanel('duel-waiting-room');
}

async function handleCancelWaiting() {
  if (!waitingDuelId) return;
  await cancelWaitingLiveDuel(waitingDuelId, identityRef.userId);
  waitingDuelId = null;
  unsubscribeChannel(liveChannel);
  liveChannel = null;
  liveChannelDuelId = null;
  backToSetup();
}

async function handleJoinLiveDuel(duel) {
  const msg = document.getElementById('duel-setup-msg');
  msg.classList.add('hidden');
  try {
    const updated = await joinLiveDuel(duel.id, identityRef.userId);
    ensureLiveChannel(duel.id);
    await playLiveDuel(updated);
  } catch (err) {
    msg.textContent = 'Bu düello az önce dolmuş olabilir, tekrar dene.';
    msg.classList.remove('hidden');
    await renderDuelTab();
  }
}

function ensureLiveChannel(duelId) {
  if (liveChannel && liveChannelDuelId === duelId) return;
  if (liveChannel) unsubscribeChannel(liveChannel);
  liveChannel = subscribeToLiveDuel(duelId, {
    onDuelChange: handleDuelRowUpdate,
    onAnswer: handleOpponentAnswerRow,
  });
  liveChannelDuelId = duelId;
}

function handleDuelRowUpdate(newRow) {
  if (waitingDuelId && newRow.id === waitingDuelId && newRow.live_status === 'active') {
    waitingDuelId = null;
    playLiveDuel(newRow);
    return;
  }
  if (!session || session.mode !== 'live' || newRow.id !== session.duel.id) return;

  session.duel = newRow;
  if (newRow.live_status === 'finished') {
    if (!session.finishing) {
      session.finishing = true;
      finishLiveDuel();
    }
    return;
  }
  if (newRow.current_question_index !== session.lastRenderedIndex) {
    session.myAnsweredCurrent = false;
    session.opponentAnsweredCurrent = false;
    session.myCorrectForCurrent = null;
    session.opponentCorrectForCurrent = null;
    goToLiveQuestion(newRow.current_question_index, newRow.current_question_started_at);
  }
}

function handleOpponentAnswerRow(row) {
  if (!session || session.mode !== 'live' || row.duel_id !== session.duel.id) return;
  if (row.user_id === identityRef.userId) return;

  session.opponentState = { score: row.score_after, hp: row.hp_after, streak: row.streak_after };
  updateOpponentHud();

  if (row.question_index === session.index) {
    session.opponentAnsweredCurrent = true;
    session.opponentCorrectForCurrent = row.correct;
    updateWaitingMsg();
    maybeAdvanceLive();
  }
}

async function playLiveDuel(duel) {
  const [words, existingAnswers] = await Promise.all([getWords(), getLiveDuelAnswers(duel.id)]);
  const opponentUserId = opponentIdOf(duel);

  session = {
    mode: 'live',
    duel,
    questions: buildQuestions(duel, words),
    index: duel.current_question_index,
    lastRenderedIndex: -1,
    hp: 100,
    score: 0,
    streak: 0,
    longestStreak: 0,
    correct: 0,
    wrong: 0,
    eliminated: false,
    answers: [],
    timeLeft: duel.time_per_question,
    opponentUserId,
    opponentState: { score: 0, hp: 100, streak: 0 },
    myAnsweredCurrent: false,
    opponentAnsweredCurrent: false,
    myCorrectForCurrent: null,
    opponentCorrectForCurrent: null,
    finishing: false,
  };

  // Sayfa yeniden yüklendiyse (reconnect) geçmiş cevaplardan durumu geri kur.
  const myRows = existingAnswers.filter((a) => a.user_id === identityRef.userId);
  const oppRows = existingAnswers.filter((a) => a.user_id === opponentUserId);
  const myLast = myRows[myRows.length - 1];
  const oppLast = oppRows[oppRows.length - 1];
  if (myLast) {
    session.score = myLast.score_after;
    session.streak = myLast.streak_after;
    session.correct = myRows.filter((r) => r.correct).length;
    session.wrong = myRows.filter((r) => !r.correct).length;
    session.longestStreak = myRows.reduce((m, r) => Math.max(m, r.streak_after), 0);
  }
  if (oppLast) {
    session.opponentState = { score: oppLast.score_after, hp: 100, streak: oppLast.streak_after };
  }
  const myCurrent = myRows.find((r) => r.question_index === session.index);
  session.myAnsweredCurrent = !!myCurrent;
  session.myCorrectForCurrent = myCurrent ? myCurrent.correct : null;
  const oppCurrent = oppRows.find((r) => r.question_index === session.index);
  session.opponentAnsweredCurrent = !!oppCurrent;
  session.opponentCorrectForCurrent = oppCurrent ? oppCurrent.correct : null;

  ensureLiveChannel(duel.id);

  showPanel('duel-session');
  document.getElementById('duel-opp-hud').classList.remove('hidden');
  document.getElementById('duel-my-hp-wrap').classList.add('hidden');
  document.getElementById('duel-opp-hp-wrap').classList.add('hidden');
  document.getElementById('duel-my-name').textContent = identityRef.displayName;
  document.getElementById('duel-opp-name').textContent = userNames.get(opponentUserId) || 'Rakip';

  updateHud();
  updateOpponentHud();
  goToLiveQuestion(session.index, duel.current_question_started_at);
}

function updateOpponentHud() {
  document.getElementById('duel-opp-hp').style.width = `${session.opponentState.hp}%`;
  document.getElementById('duel-opp-score').textContent = session.opponentState.score;
  document.getElementById('duel-opp-streak').textContent = session.opponentState.streak;
}

function updateWaitingMsg() {
  const el = document.getElementById('duel-waiting-opponent-msg');
  if (session.myAnsweredCurrent && !session.opponentAnsweredCurrent && session.myCorrectForCurrent !== true) {
    el.textContent = 'Cevap gönderildi, rakip bekleniyor...';
  } else {
    el.textContent = '';
  }
}

function goToLiveQuestion(index, startedAtIso) {
  clearInterval(timerHandle);
  clearTimeout(advanceFallbackHandle);

  if (index >= session.questions.length) {
    return; // finishLiveDuel, duels satırı 'finished' olunca dispatcher üzerinden tetiklenir
  }

  session.index = index;
  session.lastRenderedIndex = index;
  // Not: myAnsweredCurrent/opponentAnsweredCurrent burada sıfırlanmaz — ilk çağrıda
  // (playLiveDuel) reconnect sonrası geri kurulan değerler geçerli olsun diye;
  // sonraki sorulara geçişte sıfırlama işini handleDuelRowUpdate zaten yapıyor.

  const q = session.questions[index];
  renderQuestionPrompt(q, index, session.questions.length);

  const alreadyAnswered = session.myAnsweredCurrent;
  document.getElementById('duel-answer-input').disabled = alreadyAnswered;
  document.getElementById('duel-submit').disabled = alreadyAnswered;
  updateWaitingMsg();

  const totalMs = session.duel.time_per_question * 1000;
  const startedAtMs = new Date(startedAtIso).getTime();

  const tick = () => {
    const elapsed = Date.now() - startedAtMs;
    const remainingMs = Math.max(0, totalMs - elapsed);
    session.timeLeft = remainingMs / 1000;
    document.getElementById('duel-timer-bar').style.width = `${(remainingMs / totalMs) * 100}%`;
    if (remainingMs <= 0) {
      clearInterval(timerHandle);
      if (!session.myAnsweredCurrent) handleLiveAnswer(null, true);
    }
  };
  tick();
  timerHandle = setInterval(tick, 100);

  advanceFallbackHandle = setTimeout(() => {
    maybeAdvanceLive(true);
  }, totalMs + LIVE_ADVANCE_GRACE_MS);
}

function handleSubmitAnswer() {
  if (!session) return;
  const val = document.getElementById('duel-answer-input').value;
  if (session.mode === 'async') {
    clearInterval(timerHandle);
    handleAsyncAnswer(val);
  } else {
    handleLiveAnswer(val);
  }
}

async function handleLiveAnswer(userAnswer, isTimeout = false) {
  if (session.myAnsweredCurrent) return;
  session.myAnsweredCurrent = true;
  clearInterval(timerHandle);
  document.getElementById('duel-answer-input').disabled = true;
  document.getElementById('duel-submit').disabled = true;

  const q = session.questions[session.index];
  // Süre dolduğunda (gönderilmemiş cevap) hep "bilinmedi" sayılır, ceza yok —
  // sadece aktif olarak yanlış gönderilen cevaplar puan kaybettirir.
  const isCorrect = !isTimeout && evaluateAnswer(q, userAnswer);
  session.myCorrectForCurrent = isCorrect;

  if (isCorrect) {
    session.correct++;
    session.streak++;
    session.longestStreak = Math.max(session.longestStreak, session.streak);
    session.score += LIVE_CORRECT_POINTS;
  } else {
    session.wrong++;
    session.streak = 0;
    if (!isTimeout) session.score -= LIVE_WRONG_POINTS;
  }

  updateHud();
  updateWaitingMsg();

  await submitLiveAnswer(session.duel.id, session.index, identityRef.userId, {
    correct: isCorrect,
    scoreAfter: session.score,
    hpAfter: 100,
    streakAfter: session.streak,
  });

  maybeAdvanceLive();
}

async function maybeAdvanceLive(force = false) {
  if (!session || session.mode !== 'live') return;

  const someoneCorrect = session.myCorrectForCurrent === true || session.opponentCorrectForCurrent === true;
  const bothAnswered = session.myAnsweredCurrent && session.opponentAnsweredCurrent;
  if (!force && !someoneCorrect && !bothAnswered) return;

  const nextIndex = session.index + 1;
  const finished = nextIndex >= session.questions.length;
  await advanceLiveQuestion(
    session.duel.id,
    session.index,
    finished ? session.questions.length : nextIndex,
    finished
  );
  // Sonuç fark etmez — realtime UPDATE olayı (kendi yazdığımız da dahil) her iki tarafı da ilerletir.
}

async function finishLiveDuel() {
  clearInterval(timerHandle);
  clearTimeout(advanceFallbackHandle);

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

  unsubscribeChannel(liveChannel);
  liveChannel = null;
  liveChannelDuelId = null;

  showResult(me, opponent && opponent.finished_at ? opponent : null);
}

// ---------- ortak: sonuç / navigasyon ----------

function showResult(me, opponent) {
  showPanel('duel-result');

  const content = document.getElementById('duel-result-content');
  let html = `
    <div class="word-row">
      <div class="term">Sen</div>
      <div class="mono">Skor: ${me.score} · Doğru: ${me.correct} · Yanlış: ${me.wrong} · Seri: ${me.longest_streak}${me.eliminated ? ' · ELENDİN' : ''}</div>
    </div>`;

  if (opponent) {
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

  if (onFinishedCallback) onFinishedCallback();
}

function showPanel(id) {
  ['duel-setup', 'duel-waiting-room', 'duel-session', 'duel-result'].forEach((panelId) => {
    document.getElementById(panelId).classList.toggle('hidden', panelId !== id);
  });
}

function backToSetup() {
  showPanel('duel-setup');
  renderDuelTab();
}
