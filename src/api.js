const { Router } = require('express');
const store = require('./store');
const { wordFrequency } = require('./stopWords');

function aggregateResults(survey, responses) {
  return survey.questions.map(q => {
    const answers = responses
      .flatMap(r => r.answers.filter(a => a.questionId === q.id))
      .map(a => a.value);

    if (q.type === 'free_text') {
      return { questionId: q.id, type: q.type, display: q.display, words: wordFrequency(answers) };
    }

    if (q.type === 'multiple_choice') {
      const counts = {};
      for (const choice of q.choices) counts[choice] = 0;
      for (const v of answers) if (v in counts) counts[v]++;
      return { questionId: q.id, type: q.type, display: q.display, counts };
    }

    if (q.type === 'rating') {
      const buckets = {};
      for (let i = 1; i <= q.scale; i++) buckets[i] = 0;
      for (const v of answers) {
        const n = Number(v);
        if (n >= 1 && n <= q.scale) buckets[n]++;
      }
      const avg = answers.length
        ? answers.reduce((s, v) => s + Number(v), 0) / answers.length
        : null;
      return { questionId: q.id, type: q.type, display: q.display, buckets, average: avg, count: answers.length };
    }

    return { questionId: q.id, type: q.type };
  });
}

module.exports = function apiRouter(io) {
  const router = Router();

  // --- Surveys ---

  router.get('/surveys', (req, res) => {
    const surveys = store.getSurveys().map(s => ({
      ...s,
      responseCount: store.getResponseCount(s.id),
    }));
    res.json(surveys);
  });

  router.get('/surveys/:id', (req, res) => {
    const survey = store.getSurvey(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Not found' });
    res.json({ ...survey, responseCount: store.getResponseCount(survey.id) });
  });

  router.post('/surveys', async (req, res) => {
    const { title, description, questions } = req.body;
    if (!title) return res.status(400).json({ error: 'title is required' });
    const survey = await store.createSurvey({ title, description, questions });
    res.status(201).json(survey);
  });

  router.put('/surveys/:id', async (req, res) => {
    const survey = await store.updateSurvey(req.params.id, req.body);
    if (!survey) return res.status(404).json({ error: 'Not found' });
    res.json(survey);
  });

  router.delete('/surveys/:id', async (req, res) => {
    const ok = await store.deleteSurvey(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  });

  // --- State ---

  router.get('/state', (req, res) => res.json(store.getState()));

  router.put('/surveys/:id/activate', async (req, res) => {
    const survey = store.getSurvey(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Not found' });
    await store.setActiveSurvey(req.params.id);
    io.emit('survey_activated', { surveyId: req.params.id });
    res.json(store.getState());
  });

  router.put('/surveys/:id/pin/:questionId', async (req, res) => {
    const survey = store.getSurvey(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Not found' });
    const question = survey.questions.find(q => q.id === req.params.questionId);
    if (!question) return res.status(404).json({ error: 'Question not found' });
    await store.setPinnedQuestion(req.params.questionId);
    io.to(`display:${req.params.id}`).emit('question_pinned', {
      surveyId: req.params.id,
      questionId: req.params.questionId,
    });
    res.json(store.getState());
  });

  // --- Results ---

  router.get('/surveys/:id/results', (req, res) => {
    const survey = store.getSurvey(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Not found' });
    const responses = store.getResponses(req.params.id);
    res.json({
      surveyId: survey.id,
      totalResponses: responses.length,
      questions: aggregateResults(survey, responses),
    });
  });

  // --- Responses ---

  router.post('/surveys/:id/responses', async (req, res) => {
    const survey = store.getSurvey(req.params.id);
    if (!survey) return res.status(404).json({ error: 'Not found' });

    const { deviceToken, answers } = req.body;
    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'answers array is required' });
    }

    const result = await store.addResponse(req.params.id, { deviceToken, answers });
    if (result && result.duplicate) {
      return res.status(409).json({ error: 'Already submitted' });
    }

    // Broadcast updated results to display clients
    const responses = store.getResponses(req.params.id);
    const aggregated = aggregateResults(survey, responses);
    io.to(`display:${req.params.id}`).emit('results_update', {
      surveyId: req.params.id,
      totalResponses: responses.length,
      questions: aggregated,
    });
    io.to(`display:${req.params.id}`).emit('new_response', {
      surveyId: req.params.id,
      totalCount: responses.length,
    });

    res.status(201).json({ ok: true });
  });

  return router;
};
