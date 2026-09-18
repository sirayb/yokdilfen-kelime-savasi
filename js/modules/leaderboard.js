import { getLeaderboard } from '../api.js';

export async function renderLeaderboard(identity) {
  const body = document.getElementById('leaderboard-body');
  body.innerHTML = '<tr><td colspan="8" class="mono">Yükleniyor...</td></tr>';

  const rows = await getLeaderboard('live');

  if (rows.length === 0) {
    body.innerHTML = '<tr><td colspan="8" class="mono">Henüz tamamlanmış düello yok.</td></tr>';
    return;
  }

  body.innerHTML = rows
    .map(
      (r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(r.userId === identity.userId ? 'Sen' : r.name)}</td>
        <td>${r.wins}</td>
        <td>${r.totalScore}</td>
        <td>${r.correct}</td>
        <td>${r.wrong}</td>
        <td>${r.longestStreak}</td>
        <td>${r.matches}</td>
      </tr>`
    )
    .join('');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
