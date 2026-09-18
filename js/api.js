import { getClient } from './supabaseClient.js';
import { normalizeWordField } from './wordUtils.js';

// ---------- words ----------

export async function getWords() {
  const { data, error } = await getClient()
    .from('words')
    .select('id, en, tr, example, added_by, created_at')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function addWord({ en, tr, example, addedBy }) {
  const { error } = await getClient()
    .from('words')
    .insert({
      en: normalizeWordField(en),
      tr: normalizeWordField(tr),
      example: example || null,
      added_by: addedBy,
    });
  if (error) throw error;
}

export async function deleteWord(wordId, userId) {
  const { error } = await getClient()
    .from('words')
    .delete()
    .eq('id', wordId)
    .eq('added_by', userId);
  if (error) throw error;
}

// ---------- weak words ----------

export async function getWeakWordIds(userId) {
  const { data, error } = await getClient()
    .from('weak_words')
    .select('word_id')
    .eq('user_id', userId);
  if (error) throw error;
  return new Set(data.map((r) => r.word_id));
}

export async function markWeak(userId, wordId) {
  const { error } = await getClient()
    .from('weak_words')
    .upsert({ user_id: userId, word_id: wordId });
  if (error) throw error;
}

export async function unmarkWeak(userId, wordId) {
  const { error } = await getClient()
    .from('weak_words')
    .delete()
    .eq('user_id', userId)
    .eq('word_id', wordId);
  if (error) throw error;
}

// ---------- duels ----------

export async function createDuel({ createdBy, source, questionCount, timePerQuestion, direction, wordIds }) {
  const { data, error } = await getClient()
    .from('duels')
    .insert({
      created_by: createdBy,
      source,
      question_count: questionCount,
      time_per_question: timePerQuestion,
      direction,
      word_ids: wordIds,
      status: 'open',
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getOpenDuelsForUser(userId) {
  const { data: duels, error } = await getClient()
    .from('duels')
    .select('*')
    .eq('status', 'open')
    .order('created_at', { ascending: false });
  if (error) throw error;

  const { data: myParticipations, error: pErr } = await getClient()
    .from('duel_participants')
    .select('duel_id')
    .eq('user_id', userId)
    .not('finished_at', 'is', null);
  if (pErr) throw pErr;

  const finishedIds = new Set(myParticipations.map((p) => p.duel_id));
  return duels.filter((d) => !finishedIds.has(d.id));
}

export async function getDuel(duelId) {
  const { data, error } = await getClient().from('duels').select('*').eq('id', duelId).single();
  if (error) throw error;
  return data;
}

export async function submitDuelResult(duelId, userId, result) {
  const { error } = await getClient()
    .from('duel_participants')
    .upsert({
      duel_id: duelId,
      user_id: userId,
      score: result.score,
      hp: result.hp,
      correct: result.correct,
      wrong: result.wrong,
      longest_streak: result.longestStreak,
      eliminated: result.eliminated,
      answers: result.answers,
      finished_at: new Date().toISOString(),
    });
  if (error) throw error;

  const { data: participants, error: pErr } = await getClient()
    .from('duel_participants')
    .select('user_id, finished_at')
    .eq('duel_id', duelId);
  if (pErr) throw pErr;

  if (participants.every((p) => p.finished_at)) {
    await getClient().from('duels').update({ status: 'completed' }).eq('id', duelId);
  }
}

export async function getDuelParticipants(duelId) {
  const { data, error } = await getClient()
    .from('duel_participants')
    .select('*, users(display_name)')
    .eq('duel_id', duelId);
  if (error) throw error;
  return data;
}

export async function getMyFinishedDuelCount(userId) {
  const { count, error } = await getClient()
    .from('duel_participants')
    .select('duel_id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('finished_at', 'is', null);
  if (error) throw error;
  return count || 0;
}

export async function getMyDuelStats(userId) {
  const { data, error } = await getClient()
    .from('duel_participants')
    .select('correct, wrong, longest_streak')
    .eq('user_id', userId)
    .not('finished_at', 'is', null);
  if (error) throw error;

  return data.reduce(
    (acc, row) => ({
      matches: acc.matches + 1,
      correct: acc.correct + row.correct,
      wrong: acc.wrong + row.wrong,
      longestStreak: Math.max(acc.longestStreak, row.longest_streak),
    }),
    { matches: 0, correct: 0, wrong: 0, longestStreak: 0 }
  );
}

// ---------- leaderboard ----------

export async function getLeaderboard() {
  const { data, error } = await getClient()
    .from('duel_participants')
    .select('user_id, score, correct, wrong, longest_streak, finished_at, users(display_name)')
    .not('finished_at', 'is', null);
  if (error) throw error;

  const byUser = new Map();
  for (const row of data) {
    const key = row.user_id;
    if (!byUser.has(key)) {
      byUser.set(key, {
        userId: key,
        name: row.users?.display_name || '—',
        totalScore: 0,
        correct: 0,
        wrong: 0,
        longestStreak: 0,
        matches: 0,
      });
    }
    const entry = byUser.get(key);
    entry.totalScore += row.score;
    entry.correct += row.correct;
    entry.wrong += row.wrong;
    entry.longestStreak = Math.max(entry.longestStreak, row.longest_streak);
    entry.matches += 1;
  }

  return [...byUser.values()].sort((a, b) => b.totalScore - a.totalScore);
}
