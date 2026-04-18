const surveyId = location.pathname.split('/').pop();

function getOrCreateToken() {
  const key = `qs_token_${surveyId}`;
  let token = localStorage.getItem(key);
  if (!token) {
    token = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    localStorage.setItem(key, token);
  }
  return token;
}

function hasSubmitted() {
  return localStorage.getItem(`qs_submitted_${surveyId}`) === '1';
}

function markSubmitted() {
  localStorage.setItem(`qs_submitted_${surveyId}`, '1');
}

function show(id) {
  document.querySelectorAll('.screen').forEach(el => el.classList.add('hidden'));
  document.getElementById(id).classList.remove('hidden');
}

function renderQuestion(q, index) {
  const wrap = document.createElement('div');
  wrap.className = 'question';
  wrap.dataset.id = q.id;

  const label = document.createElement('p');
  label.className = 'question-prompt';
  label.textContent = `${index + 1}. ${q.prompt}`;
  wrap.appendChild(label);

  if (q.type === 'free_text') {
    const input = document.createElement('textarea');
    input.name = q.id;
    input.rows = 3;
    input.placeholder = 'Your answer…';
    wrap.appendChild(input);
  } else if (q.type === 'multiple_choice') {
    for (const choice of q.choices) {
      const card = document.createElement('label');
      card.className = 'choice-card';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = q.id;
      radio.value = choice;
      card.appendChild(radio);
      card.appendChild(document.createTextNode(choice));
      wrap.appendChild(card);
    }
  } else if (q.type === 'rating') {
    const ratingRow = document.createElement('div');
    ratingRow.className = 'rating-row';
    for (let i = 1; i <= q.scale; i++) {
      const btn = document.createElement('label');
      btn.className = 'rating-btn';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = q.id;
      radio.value = i;
      btn.appendChild(radio);
      btn.appendChild(document.createTextNode(i));
      ratingRow.appendChild(btn);
    }
    wrap.appendChild(ratingRow);
  }

  return wrap;
}

async function init() {
  if (hasSubmitted()) {
    show('already-submitted');
    return;
  }

  let survey;
  try {
    const res = await fetch(`/api/surveys/${surveyId}`);
    if (!res.ok) { show('not-found'); return; }
    survey = await res.json();
  } catch {
    show('not-found');
    return;
  }

  document.title = survey.title;
  document.getElementById('survey-title').textContent = survey.title;
  document.getElementById('survey-description').textContent = survey.description || '';

  const container = document.getElementById('questions');
  for (let i = 0; i < survey.questions.length; i++) {
    container.appendChild(renderQuestion(survey.questions[i], i));
  }

  show('survey-form');

  document.getElementById('form').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    btn.textContent = 'Submitting…';

    const answers = survey.questions.map(q => {
      const el = document.querySelector(`[name="${q.id}"]`);
      if (!el) return { questionId: q.id, value: '' };
      if (q.type === 'multiple_choice' || q.type === 'rating') {
        const checked = document.querySelector(`input[name="${q.id}"]:checked`);
        return { questionId: q.id, value: checked ? checked.value : '' };
      }
      return { questionId: q.id, value: el.value.trim() };
    });

    try {
      const res = await fetch(`/api/surveys/${surveyId}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceToken: getOrCreateToken(), answers }),
      });

      if (res.status === 409) { show('already-submitted'); return; }
      if (!res.ok) throw new Error('Submit failed');

      markSubmitted();
      show('thankyou');
    } catch {
      btn.disabled = false;
      btn.textContent = 'Submit';
      alert('Something went wrong. Please try again.');
    }
  });
}

init();
