const socket = io();
let surveys = [];
let editingSurveyId = null;
let pinnedQuestionId = null;
let activeResponseCount = 0;

// --- Views ---

function showView(id) {
  ['list-view', 'editor-view', 'active-view'].forEach(v =>
    document.getElementById(v).classList.toggle('hidden', v !== id)
  );
}

// --- Survey list ---

async function loadSurveys() {
  const res = await fetch('/api/surveys');
  surveys = await res.json();

  const state = await fetch('/api/state').then(r => r.json());
  pinnedQuestionId = state.pinnedQuestionId;

  renderSurveyList(state.activeSurveyId);
}

function renderSurveyList(activeSurveyId) {
  const container = document.getElementById('survey-list');
  if (!surveys.length) {
    container.innerHTML = '<p class="empty">No surveys yet. Create one to get started.</p>';
    return;
  }
  container.innerHTML = '';
  for (const s of surveys) {
    const card = document.createElement('div');
    card.className = 'survey-card' + (s.id === activeSurveyId ? ' active' : '');

    card.innerHTML = `
      <div class="card-main">
        <strong>${escHtml(s.title)}</strong>
        <span class="meta">${s.questions.length} question${s.questions.length !== 1 ? 's' : ''} · ${s.responseCount} response${s.responseCount !== 1 ? 's' : ''}</span>
        ${s.id === activeSurveyId ? '<span class="badge-active">Active</span>' : ''}
      </div>
      <div class="card-actions">
        ${s.id === activeSurveyId
          ? `<button class="btn btn-secondary" data-action="manage" data-id="${s.id}">Manage</button>`
          : `<button class="btn btn-ghost" data-action="activate" data-id="${s.id}">Activate</button>`}
        <button class="btn btn-ghost" data-action="edit" data-id="${s.id}">Edit</button>
        <button class="btn btn-danger" data-action="delete" data-id="${s.id}">Delete</button>
      </div>
    `;
    container.appendChild(card);
  }
}

document.getElementById('survey-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;

  if (action === 'activate') {
    await fetch(`/api/surveys/${id}/activate`, { method: 'PUT' });
    await loadSurveys();
  } else if (action === 'edit') {
    openEditor(id);
  } else if (action === 'delete') {
    if (!confirm('Delete this survey and all its responses?')) return;
    await fetch(`/api/surveys/${id}`, { method: 'DELETE' });
    await loadSurveys();
  } else if (action === 'manage') {
    openActiveView(id);
  }
});

// --- Active survey view ---

async function openActiveView(surveyId) {
  const survey = surveys.find(s => s.id === surveyId);
  if (!survey) return;

  document.getElementById('active-title').textContent = survey.title;
  document.getElementById('open-display-btn').href = `/display/${surveyId}`;

  const results = await fetch(`/api/surveys/${surveyId}/results`).then(r => r.json());
  activeResponseCount = results.totalResponses;
  updateActiveResponseCount();

  const state = await fetch('/api/state').then(r => r.json());
  pinnedQuestionId = state.pinnedQuestionId;

  renderPinList(survey, pinnedQuestionId);
  showView('active-view');

  socket.emit('join_display', { surveyId });
}

function updateActiveResponseCount() {
  document.getElementById('active-response-count').textContent =
    `${activeResponseCount} response${activeResponseCount !== 1 ? 's' : ''}`;
}

function renderPinList(survey, currentPinned) {
  const container = document.getElementById('pin-list');
  container.innerHTML = '';
  for (const q of survey.questions) {
    const row = document.createElement('div');
    row.className = 'pin-row' + (q.id === currentPinned ? ' pinned' : '');
    row.dataset.surveyId = survey.id;
    row.dataset.questionId = q.id;

    const typeLabel = { free_text: 'Free text', multiple_choice: 'Multiple choice', rating: 'Rating' }[q.type] || q.type;
    const displayLabel = { word_cloud: 'Word cloud', bar_chart: 'Bar chart', pie_chart: 'Pie chart', histogram: 'Histogram' }[q.display] || q.display;

    row.innerHTML = `
      <div class="pin-info">
        <span class="pin-prompt">${escHtml(q.prompt)}</span>
        <span class="pin-meta">${typeLabel} · ${displayLabel}</span>
      </div>
      <button class="btn ${q.id === currentPinned ? 'btn-primary' : 'btn-ghost'}" data-action="pin">
        ${q.id === currentPinned ? 'Pinned' : 'Pin'}
      </button>
    `;
    container.appendChild(row);
  }
}

document.getElementById('pin-list').addEventListener('click', async e => {
  const btn = e.target.closest('[data-action="pin"]');
  if (!btn) return;
  const row = btn.closest('.pin-row');
  const { surveyId, questionId } = row.dataset;
  await fetch(`/api/surveys/${surveyId}/pin/${questionId}`, { method: 'PUT' });
  pinnedQuestionId = questionId;
  const survey = surveys.find(s => s.id === surveyId);
  renderPinList(survey, questionId);
});

document.getElementById('active-back-btn').addEventListener('click', () => {
  showView('list-view');
  loadSurveys();
});

// Live update response count while in active view
socket.on('new_response', data => {
  activeResponseCount = data.totalCount;
  if (!document.getElementById('active-view').classList.contains('hidden')) {
    updateActiveResponseCount();
  }
});

// --- Editor ---

function openEditor(surveyId = null) {
  editingSurveyId = surveyId;
  document.getElementById('editor-title').textContent = surveyId ? 'Edit Survey' : 'New Survey';

  const survey = surveyId ? surveys.find(s => s.id === surveyId) : null;
  document.getElementById('f-title').value = survey?.title || '';
  document.getElementById('f-desc').value = survey?.description || '';

  document.getElementById('question-list').innerHTML = '';
  for (const q of (survey?.questions || [])) addQuestionRow(q);

  showView('editor-view');
}

function addQuestionRow(q = null) {
  const idx = document.getElementById('question-list').children.length;
  const row = document.createElement('div');
  row.className = 'question-row';
  row.innerHTML = `
    <div class="qrow-header">
      <span class="qrow-num">Q${idx + 1}</span>
      <button type="button" class="btn btn-danger btn-sm" data-action="remove-question">Remove</button>
    </div>
    <div class="field">
      <label>Prompt</label>
      <input type="text" name="prompt" value="${escHtml(q?.prompt || '')}" placeholder="Question text" required />
    </div>
    <div class="field-row">
      <div class="field">
        <label>Type</label>
        <select name="type">
          <option value="free_text" ${q?.type === 'free_text' ? 'selected' : ''}>Free text</option>
          <option value="multiple_choice" ${q?.type === 'multiple_choice' ? 'selected' : ''}>Multiple choice</option>
          <option value="rating" ${q?.type === 'rating' ? 'selected' : ''}>Rating</option>
        </select>
      </div>
      <div class="field">
        <label>Display</label>
        <select name="display">
          <option value="word_cloud" ${q?.display === 'word_cloud' ? 'selected' : ''}>Word cloud</option>
          <option value="bar_chart" ${q?.display === 'bar_chart' ? 'selected' : ''}>Bar chart</option>
          <option value="pie_chart" ${q?.display === 'pie_chart' ? 'selected' : ''}>Pie chart</option>
          <option value="histogram" ${q?.display === 'histogram' ? 'selected' : ''}>Histogram</option>
        </select>
      </div>
    </div>
    <div class="field choices-field" style="display:none">
      <label>Choices <span class="optional">(one per line)</span></label>
      <textarea name="choices" rows="3" placeholder="Option A&#10;Option B&#10;Option C">${(q?.choices || []).join('\n')}</textarea>
    </div>
    <div class="field rating-field" style="display:none">
      <label>Scale</label>
      <select name="scale">
        <option value="5" ${q?.scale === 5 ? 'selected' : ''}>1–5</option>
        <option value="10" ${q?.scale === 10 ? 'selected' : ''}>1–10</option>
      </select>
    </div>
  `;

  const typeSelect = row.querySelector('[name="type"]');
  const displaySelect = row.querySelector('[name="display"]');

  function syncFields() {
    const type = typeSelect.value;
    row.querySelector('.choices-field').style.display = type === 'multiple_choice' ? '' : 'none';
    row.querySelector('.rating-field').style.display = type === 'rating' ? '' : 'none';
    // Auto-set sensible display default when type changes
    const map = { free_text: 'word_cloud', multiple_choice: 'bar_chart', rating: 'histogram' };
    if (map[type]) displaySelect.value = map[type];
  }

  typeSelect.addEventListener('change', syncFields);
  syncFields();

  row.querySelector('[data-action="remove-question"]').addEventListener('click', () => {
    row.remove();
    renumberQuestions();
  });

  document.getElementById('question-list').appendChild(row);
}

function renumberQuestions() {
  document.querySelectorAll('.qrow-num').forEach((el, i) => { el.textContent = `Q${i + 1}`; });
}

document.getElementById('add-question-btn').addEventListener('click', () => addQuestionRow());
document.getElementById('new-survey-btn').addEventListener('click', () => openEditor());
document.getElementById('back-btn').addEventListener('click', () => { showView('list-view'); loadSurveys(); });

document.getElementById('survey-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  btn.disabled = true;

  const questions = Array.from(document.querySelectorAll('.question-row')).map(row => ({
    id: row.dataset.id || undefined,
    prompt: row.querySelector('[name="prompt"]').value.trim(),
    type: row.querySelector('[name="type"]').value,
    display: row.querySelector('[name="display"]').value,
    choices: row.querySelector('[name="choices"]').value.split('\n').map(s => s.trim()).filter(Boolean),
    scale: Number(row.querySelector('[name="scale"]').value),
  }));

  const body = {
    title: document.getElementById('f-title').value.trim(),
    description: document.getElementById('f-desc').value.trim(),
    questions,
  };

  const url = editingSurveyId ? `/api/surveys/${editingSurveyId}` : '/api/surveys';
  const method = editingSurveyId ? 'PUT' : 'POST';
  await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  btn.disabled = false;
  showView('list-view');
  loadSurveys();
});

// --- Utils ---

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// --- Boot ---
loadSurveys();
