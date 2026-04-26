function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

async function loadSurveys() {
  const res = await fetch('/api/surveys');
  const surveys = await res.json();
  const select = document.getElementById('survey-select');
  for (const s of surveys) {
    const opt = document.createElement('option');
    opt.value = s.id;
    opt.textContent = s.title;
    select.appendChild(opt);
  }
}

async function loadResults(surveyId) {
  const res = await fetch(`/api/surveys/${surveyId}/responses`);
  if (!res.ok) return;
  const { survey, responses } = await res.json();
  renderTable(survey, responses);
}

function renderTable(survey, responses) {
  const tableWrap = document.getElementById('table-wrap');
  const emptyState = document.getElementById('empty-state');
  const noSurvey = document.getElementById('no-survey-state');
  const meta = document.getElementById('results-meta');
  const badge = document.getElementById('response-count-badge');
  const exportBtn = document.getElementById('export-btn');

  noSurvey.classList.add('hidden');
  meta.classList.remove('hidden');
  badge.textContent = `${responses.length} response${responses.length !== 1 ? 's' : ''}`;

  if (responses.length === 0) {
    tableWrap.classList.add('hidden');
    emptyState.classList.remove('hidden');
    exportBtn.disabled = true;
    return;
  }

  emptyState.classList.add('hidden');
  tableWrap.classList.remove('hidden');
  exportBtn.disabled = false;

  const questions = survey.questions.slice().sort((a, b) => a.order - b.order);

  // Build header
  const thead = document.getElementById('results-thead');
  thead.innerHTML = '';
  const headerRow = document.createElement('tr');
  headerRow.innerHTML = '<th>#</th><th>Submitted</th>' +
    questions.map(q => `<th>${escHtml(q.prompt)}</th>`).join('');
  thead.appendChild(headerRow);

  // Build rows sorted by submission time (newest first)
  const sorted = responses.slice().sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  const tbody = document.getElementById('results-tbody');
  tbody.innerHTML = '';

  sorted.forEach((r, i) => {
    const tr = document.createElement('tr');
    const answerMap = Object.fromEntries(r.answers.map(a => [a.questionId, a.value]));
    tr.innerHTML =
      `<td class="timestamp">${sorted.length - i}</td>` +
      `<td class="timestamp">${escHtml(formatDate(r.submittedAt))}</td>` +
      questions.map(q => `<td class="answer">${escHtml(answerMap[q.id] ?? '')}</td>`).join('');
    tbody.appendChild(tr);
  });

  // Stash for CSV export
  exportBtn.onclick = () => exportCsv(survey, questions, sorted);
}

function exportCsv(survey, questions, responses) {
  const headers = ['#', 'Submitted', ...questions.map(q => q.prompt)];
  const rows = responses.map((r, i) => {
    const answerMap = Object.fromEntries(r.answers.map(a => [a.questionId, a.value]));
    return [
      responses.length - i,
      r.submittedAt,
      ...questions.map(q => answerMap[q.id] ?? ''),
    ];
  });

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${survey.title.replace(/[^a-z0-9]/gi, '_')}_results.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('survey-select').addEventListener('change', e => {
  const id = e.target.value;
  const exportBtn = document.getElementById('export-btn');
  if (!id) {
    document.getElementById('table-wrap').classList.add('hidden');
    document.getElementById('empty-state').classList.add('hidden');
    document.getElementById('results-meta').classList.add('hidden');
    document.getElementById('no-survey-state').classList.remove('hidden');
    exportBtn.disabled = true;
    return;
  }
  loadResults(id);
});

loadSurveys();
