async function init() {
  const [stateRes, surveysRes, infoRes] = await Promise.all([
    fetch('/api/state'),
    fetch('/api/surveys'),
    fetch('/api/server-info'),
  ]);
  const state = await stateRes.json();
  const surveys = await surveysRes.json();
  const { baseUrl } = await infoRes.json();

  if (!state.activeSurveyId) {
    document.getElementById('no-active').classList.remove('hidden');
    return;
  }

  const survey = surveys.find(s => s.id === state.activeSurveyId);
  if (!survey) {
    document.getElementById('no-active').classList.remove('hidden');
    return;
  }

  document.getElementById('survey-title').textContent = survey.title;
  document.getElementById('survey-description').textContent = survey.description || '';
  document.getElementById('response-count').textContent = survey.responseCount ?? 0;
  document.getElementById('question-count').textContent = survey.questions.length;

  const surveyUrl = `${baseUrl}/survey/${survey.id}`;
  document.getElementById('qr-url').textContent = surveyUrl;
  document.getElementById('display-link').href = `/display/${survey.id}`;
  document.getElementById('survey-link').href = `/survey/${survey.id}`;

  new QRCode(document.getElementById('qr-code'), {
    text: surveyUrl,
    width: 240,
    height: 240,
    colorDark: '#1a2744',
    colorLight: '#ffffff',
  });

  document.getElementById('active-survey').classList.remove('hidden');
}

init();
