import { getWords, getWeakWordIds, getMyDuelStats } from '../api.js';

export async function renderHome(identity) {
  const el = document.getElementById('home-stats');
  el.innerHTML = '<p class="mono">Yükleniyor...</p>';

  const [words, weakIds, duelStats] = await Promise.all([
    getWords(),
    getWeakWordIds(identity.userId),
    getMyDuelStats(identity.userId),
  ]);

  const myWords = words.filter((w) => w.added_by === identity.userId).length;

  const stats = [
    { label: 'Toplam Kelime', value: words.length },
    { label: 'Kendi Eklediklerin', value: myWords },
    { label: 'Maç Sayısı', value: duelStats.matches },
    { label: 'En Uzun Seri', value: duelStats.longestStreak },
    { label: 'Doğru', value: duelStats.correct },
    { label: 'Yanlış', value: duelStats.wrong },
    { label: 'Zayıf Kelime', value: weakIds.size },
  ];

  el.innerHTML = stats
    .map(
      (s) => `
      <div class="stat-card">
        <div class="label">${s.label}</div>
        <div class="value">${s.value}</div>
      </div>`
    )
    .join('');
}
