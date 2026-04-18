'use strict';

const os   = require('os');
const path = require('path');
const fs   = require('fs').promises;
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');

// DATA_DIR must be set before requiring store.js — the constant is evaluated at require time.
const TEST_DATA_DIR = path.join(os.tmpdir(), `quorum-test-${process.pid}`);
process.env.DATA_DIR = TEST_DATA_DIR;

const store = require('../src/store');
const { aggregateResults } = require('../src/api');

// ── Survey definition ──────────────────────────────────────────────────────

const SURVEY_DEF = {
  title: 'Simulated 20-User Survey',
  description: 'Integration test survey',
  questions: [
    {
      prompt: 'Describe your experience',
      type: 'free_text',
      display: 'word_cloud',
    },
    {
      prompt: 'Which option do you prefer?',
      type: 'multiple_choice',
      display: 'bar_chart',
      choices: ['A', 'B', 'C', 'D'],
    },
    {
      prompt: 'Rate us 1–5',
      type: 'rating',
      display: 'histogram',
      scale: 5,
    },
  ],
};

// ── User scenarios ─────────────────────────────────────────────────────────
//
// 20 users across 6 answer patterns:
//   Groups 1 & 5 both write "amazing"         → same exact word, higher frequency
//   Group 3 writes "amazing service"           → "amazing" shared across groups 1/3/5
//   Groups 1 & 3 both choose A                → predictable multiple-choice totals
//   Groups 1 & 3 both rate 5                  → predictable histogram
//   "could be better" contains stop word "be" → "be" must be excluded from word cloud
//
const SCENARIOS = [
  { n: 6, text: 'amazing',          choice: 'A', rating: 5 },
  { n: 4, text: 'great experience', choice: 'B', rating: 4 },
  { n: 3, text: 'amazing service',  choice: 'A', rating: 5 },
  { n: 3, text: 'good',             choice: 'C', rating: 3 },
  { n: 2, text: 'amazing',          choice: 'B', rating: 2 },
  { n: 2, text: 'could be better',  choice: 'D', rating: 1 },
];

// ── Expected results ───────────────────────────────────────────────────────
//
// "amazing": groups 1(6) + 3(3) + 5(2) = 11
// "be" is a stop word → excluded
// (2×1 + 2×2 + 3×3 + 4×4 + 9×5) / 20 = 76/20 = 3.8
//
const EXPECTED_WORDS   = { amazing: 11, great: 4, experience: 4, service: 3, good: 3, could: 2, better: 2 };
const EXPECTED_CHOICES = { A: 9, B: 6, C: 3, D: 2 };
const EXPECTED_BUCKETS = { 1: 2, 2: 2, 3: 3, 4: 4, 5: 9 };
const EXPECTED_AVERAGE = 3.8;

// ── Shared test state ──────────────────────────────────────────────────────

let survey;
let freeTextId, choiceId, ratingId;

// ── Helpers ────────────────────────────────────────────────────────────────

function buildUsers() {
  const users = [];
  let i = 0;
  for (const s of SCENARIOS) {
    for (let j = 0; j < s.n; j++) {
      users.push({
        deviceToken: `test-device-${i++}`,
        answers: [
          { questionId: freeTextId, value: s.text           },
          { questionId: choiceId,   value: s.choice         },
          { questionId: ratingId,   value: String(s.rating) },
        ],
      });
    }
  }
  return users;
}

// ── Global setup / teardown ────────────────────────────────────────────────

before(async () => {
  await fs.mkdir(path.join(TEST_DATA_DIR, 'surveys'),   { recursive: true });
  await fs.mkdir(path.join(TEST_DATA_DIR, 'responses'), { recursive: true });
  await store.loadData();
});

after(async () => {
  await fs.rm(TEST_DATA_DIR, { recursive: true, force: true });
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('Survey creation', () => {
  test('creates a survey with all three question types', async () => {
    survey = await store.createSurvey(SURVEY_DEF);
    [freeTextId, choiceId, ratingId] = survey.questions.map(q => q.id);

    assert.ok(survey.id);
    assert.equal(survey.title, SURVEY_DEF.title);
    assert.equal(survey.questions.length, 3);
    assert.equal(survey.questions[0].type, 'free_text');
    assert.equal(survey.questions[1].type, 'multiple_choice');
    assert.equal(survey.questions[2].type, 'rating');
    assert.deepEqual(survey.questions[1].choices, ['A', 'B', 'C', 'D']);
    assert.equal(survey.questions[2].scale, 5);
  });

  test('persists the survey to disk', async () => {
    const raw    = await fs.readFile(path.join(TEST_DATA_DIR, 'surveys', `${survey.id}.json`), 'utf8');
    const parsed = JSON.parse(raw);
    assert.equal(parsed.id, survey.id);
    assert.equal(parsed.questions.length, 3);
  });

  test('activates the survey and clears any pinned question', async () => {
    await store.setActiveSurvey(survey.id);
    const state = store.getState();
    assert.equal(state.activeSurveyId, survey.id);
    assert.equal(state.pinnedQuestionId, null);
  });
});

describe('Response submission', () => {
  test('accepts all 20 unique-token responses', async () => {
    const users = buildUsers();
    assert.equal(users.length, 20);

    for (const user of users) {
      const result = await store.addResponse(survey.id, user);
      assert.ok(result.id, `missing id for ${user.deviceToken}`);
      assert.equal(result.surveyId, survey.id);
    }

    assert.equal(store.getResponseCount(survey.id), 20);
  });

  test('rejects a duplicate device token', async () => {
    const result = await store.addResponse(survey.id, {
      deviceToken: 'test-device-0',
      answers: [
        { questionId: freeTextId, value: 'duplicate attempt' },
        { questionId: choiceId,   value: 'A' },
        { questionId: ratingId,   value: '3' },
      ],
    });
    assert.equal(result.duplicate, true);
    assert.equal(store.getResponseCount(survey.id), 20, 'count must not increase on duplicate');
  });

  test('allows multiple anonymous (null-token) submissions', async () => {
    const before = store.getResponseCount(survey.id);
    for (let i = 0; i < 3; i++) {
      const result = await store.addResponse(survey.id, {
        deviceToken: null,
        answers: [
          { questionId: freeTextId, value: 'anonymous' },
          { questionId: choiceId,   value: 'A' },
          { questionId: ratingId,   value: '3' },
        ],
      });
      assert.ok(result.id, `anonymous submission ${i} should succeed`);
    }
    assert.equal(store.getResponseCount(survey.id), before + 3);
  });
});

describe('Results aggregation', () => {
  // Snapshot the first 20 responses (before the anonymous ones were added)
  // so aggregation assertions match the controlled SCENARIOS above exactly.
  let results;

  before(() => {
    const first20 = store.getResponses(survey.id).slice(0, 20);
    results = aggregateResults(survey, first20);
  });

  describe('free-text word cloud', () => {
    test('"amazing" is the top word, appearing across three user groups', () => {
      const q = results.find(r => r.questionId === freeTextId);
      assert.equal(q.words[0].word, 'amazing');
      assert.equal(q.words[0].count, EXPECTED_WORDS.amazing);
    });

    test('all expected word counts are correct', () => {
      const q       = results.find(r => r.questionId === freeTextId);
      const wordMap = Object.fromEntries(q.words.map(w => [w.word, w.count]));
      for (const [word, count] of Object.entries(EXPECTED_WORDS)) {
        assert.equal(wordMap[word], count, `"${word}" count mismatch`);
      }
    });

    test('stop word "be" is excluded from the word cloud', () => {
      const q     = results.find(r => r.questionId === freeTextId);
      const words = q.words.map(w => w.word);
      assert.ok(!words.includes('be'), '"be" should be filtered as a stop word');
    });

    test('words are sorted by frequency descending', () => {
      const q = results.find(r => r.questionId === freeTextId);
      for (let i = 1; i < q.words.length; i++) {
        assert.ok(
          q.words[i - 1].count >= q.words[i].count,
          `word at index ${i - 1} should have count ≥ word at index ${i}`
        );
      }
    });
  });

  describe('multiple-choice bar chart', () => {
    test('vote counts match the expected distribution', () => {
      const q = results.find(r => r.questionId === choiceId);
      for (const [choice, count] of Object.entries(EXPECTED_CHOICES)) {
        assert.equal(q.counts[choice], count, `choice "${choice}" count mismatch`);
      }
    });

    test('option A has the most votes', () => {
      const q   = results.find(r => r.questionId === choiceId);
      const max = Math.max(...Object.values(q.counts));
      assert.equal(q.counts.A, max);
    });

    test('all four options have non-negative counts', () => {
      const q = results.find(r => r.questionId === choiceId);
      for (const choice of ['A', 'B', 'C', 'D']) {
        assert.ok(q.counts[choice] >= 0);
      }
    });
  });

  describe('rating histogram', () => {
    test('bucket counts match the expected distribution', () => {
      const q = results.find(r => r.questionId === ratingId);
      for (const [bucket, count] of Object.entries(EXPECTED_BUCKETS)) {
        assert.equal(q.buckets[Number(bucket)], count, `bucket ${bucket} count mismatch`);
      }
    });

    test('average rating is 3.8', () => {
      const q = results.find(r => r.questionId === ratingId);
      assert.ok(
        Math.abs(q.average - EXPECTED_AVERAGE) < 0.001,
        `expected average ${EXPECTED_AVERAGE}, got ${q.average}`
      );
    });

    test('response count equals 20', () => {
      const q = results.find(r => r.questionId === ratingId);
      assert.equal(q.count, 20);
    });

    test('bucket 5 has the most responses', () => {
      const q   = results.find(r => r.questionId === ratingId);
      const max = Math.max(...Object.values(q.buckets));
      assert.equal(q.buckets[5], max);
    });
  });
});

describe('Display — question pinning', () => {
  test('pins the free-text question', async () => {
    await store.setPinnedQuestion(freeTextId);
    assert.equal(store.getState().pinnedQuestionId, freeTextId);
  });

  test('switches the pin to the rating question', async () => {
    await store.setPinnedQuestion(ratingId);
    assert.equal(store.getState().pinnedQuestionId, ratingId);
  });

  test('activating a different survey clears the pinned question', async () => {
    const other = await store.createSurvey({ title: 'Secondary Survey', questions: [] });
    await store.setActiveSurvey(other.id);
    const state = store.getState();
    assert.equal(state.pinnedQuestionId, null);
    assert.equal(state.activeSurveyId, other.id);
  });
});
