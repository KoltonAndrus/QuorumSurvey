const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const SURVEYS_DIR = path.join(DATA_DIR, 'surveys');
const RESPONSES_DIR = path.join(DATA_DIR, 'responses');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

// In-memory cache
const cache = {
  surveys: {},      // surveyId -> survey object
  responses: {},    // surveyId -> [response, ...]
  state: { activeSurveyId: null, pinnedQuestionId: null },
};

async function loadData() {
  // Load state
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    cache.state = JSON.parse(raw);
  } catch {
    await saveState();
  }

  // Load surveys
  const surveyFiles = await fs.readdir(SURVEYS_DIR).catch(() => []);
  for (const file of surveyFiles) {
    if (!file.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(SURVEYS_DIR, file), 'utf8');
    const survey = JSON.parse(raw);
    cache.surveys[survey.id] = survey;
  }

  // Load responses (scan per-survey subdirs)
  for (const surveyId of Object.keys(cache.surveys)) {
    const dir = path.join(RESPONSES_DIR, surveyId);
    cache.responses[surveyId] = [];
    const files = await fs.readdir(dir).catch(() => []);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      const raw = await fs.readFile(path.join(dir, file), 'utf8');
      cache.responses[surveyId].push(JSON.parse(raw));
    }
  }

  console.log(`Loaded ${Object.keys(cache.surveys).length} survey(s) from disk`);
}

// --- State ---

function getState() {
  return cache.state;
}

async function saveState() {
  await fs.writeFile(STATE_FILE, JSON.stringify(cache.state, null, 2));
}

async function setActiveSurvey(surveyId) {
  cache.state.activeSurveyId = surveyId;
  cache.state.pinnedQuestionId = null;
  await saveState();
}

async function setPinnedQuestion(questionId) {
  cache.state.pinnedQuestionId = questionId;
  await saveState();
}

// --- Surveys ---

function getSurveys() {
  return Object.values(cache.surveys).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function getSurvey(id) {
  return cache.surveys[id] || null;
}

async function createSurvey(data) {
  const survey = {
    id: uuidv4(),
    title: data.title,
    description: data.description || '',
    createdAt: new Date().toISOString(),
    questions: (data.questions || []).map((q, i) => ({
      id: uuidv4(),
      order: i + 1,
      prompt: q.prompt,
      type: q.type,
      display: q.display,
      choices: q.choices || [],
      scale: q.scale || 5,
      wordCloudMaxWords: q.wordCloudMaxWords || 50,
      wordCloudColorScheme: q.wordCloudColorScheme || 'blue',
    })),
  };

  cache.surveys[survey.id] = survey;
  cache.responses[survey.id] = [];
  await fs.writeFile(
    path.join(SURVEYS_DIR, `${survey.id}.json`),
    JSON.stringify(survey, null, 2)
  );
  return survey;
}

async function updateSurvey(id, data) {
  const existing = cache.surveys[id];
  if (!existing) return null;

  const updated = {
    ...existing,
    title: data.title ?? existing.title,
    description: data.description ?? existing.description,
    questions: data.questions
      ? data.questions.map((q, i) => ({
          id: q.id || uuidv4(),
          order: i + 1,
          prompt: q.prompt,
          type: q.type,
          display: q.display,
          choices: q.choices || [],
          scale: q.scale || 5,
          wordCloudMaxWords: q.wordCloudMaxWords || 50,
          wordCloudColorScheme: q.wordCloudColorScheme || 'blue',
        }))
      : existing.questions,
  };

  cache.surveys[id] = updated;
  await fs.writeFile(
    path.join(SURVEYS_DIR, `${id}.json`),
    JSON.stringify(updated, null, 2)
  );
  return updated;
}

async function deleteSurvey(id) {
  if (!cache.surveys[id]) return false;
  delete cache.surveys[id];
  delete cache.responses[id];
  await fs.unlink(path.join(SURVEYS_DIR, `${id}.json`)).catch(() => {});
  if (cache.state.activeSurveyId === id) {
    cache.state.activeSurveyId = null;
    cache.state.pinnedQuestionId = null;
    await saveState();
  }
  return true;
}

// --- Responses ---

function getResponses(surveyId) {
  return cache.responses[surveyId] || [];
}

function getResponseCount(surveyId) {
  return (cache.responses[surveyId] || []).length;
}

async function addResponse(surveyId, data) {
  const responses = cache.responses[surveyId];
  if (!responses) return null;

  // Dedup by device token
  if (data.deviceToken && responses.some(r => r.deviceToken === data.deviceToken)) {
    return { duplicate: true };
  }

  const response = {
    id: uuidv4(),
    surveyId,
    submittedAt: new Date().toISOString(),
    deviceToken: data.deviceToken || null,
    answers: data.answers || [],
  };

  responses.push(response);

  const dir = path.join(RESPONSES_DIR, surveyId);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, `${response.id}.json`),
    JSON.stringify(response, null, 2)
  );

  return response;
}

module.exports = {
  loadData,
  getState,
  setActiveSurvey,
  setPinnedQuestion,
  getSurveys,
  getSurvey,
  createSurvey,
  updateSurvey,
  deleteSurvey,
  getResponses,
  getResponseCount,
  addResponse,
};
