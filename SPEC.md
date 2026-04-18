# QuorumSurvey — Project Specification

## Overview

QuorumSurvey is a real-time audience survey tool designed for live presentations, workshops, and events. An admin creates a survey, displays it on a screen, attendees scan a QR code to submit responses from their phones, and results appear instantly in configurable visual formats.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Node.js Server                      │
│                                                         │
│  Express HTTP + Socket.IO WebSocket                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Admin API   │  │  Survey API  │  │  Results API │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                         │                               │
│               ┌─────────────────┐                       │
│               │  Filesystem DB  │                       │
│               │  (JSON files)   │                       │
│               └─────────────────┘                       │
└─────────────────────────────────────────────────────────┘
         │                │                │
   ┌───────────┐   ┌───────────┐   ┌───────────┐
   │   Admin   │   │  Results  │   │  Survey   │
   │   Page    │   │  Display  │   │  Input    │
   │ /admin    │   │ /display  │   │ /survey   │
   │           │   │ (+ QR)    │   │ /:id      │
   └───────────┘   └───────────┘   └───────────┘
```

---

## Pages

### 1. Admin Page — `/admin`

Purpose: Create and manage surveys, configure display options.

**Features:**
- Create a new survey with a title and one or more questions
- Choose question type per question:
  - **Free text** — word cloud display
  - **Multiple choice** — bar chart or pie chart display
  - **Rating (1–5 or 1–10)** — histogram or average display
- Set the active survey (only one survey accepts responses at a time)
- Archive / delete past surveys
- View a list of all surveys with response counts
- Button to open the Results Display for the active survey
- Live preview of the QR code for the active survey

**Survey configuration options:**
- Title
- Description (optional, shown to respondents)
- Questions (ordered list, each with type and prompt)
- Word cloud settings: max words, color scheme
- Display refresh rate (if not using WebSocket push)

---

### 2. Results Display Page — `/display/:surveyId`

Purpose: Shown on a projector/screen during a live event.

**Features:**
- Large, readable layout optimized for projection
- QR code prominently displayed linking to `/survey/:surveyId`
- Cycles through questions or pins to a single question (configurable)
- Real-time updates via WebSocket (no page refresh needed)
- Display modes per question type:
  - **Word Cloud** — animated, words sized by frequency; new submissions cause live resize
  - **Bar Chart** — animated bars, sorted by vote count
  - **Pie Chart** — live updating slices with labels
  - **Rating Histogram** — bars per rating value + running average
- Response count shown (e.g., "47 responses")
- Optional: toggle to show/hide raw response list

---

### 3. Survey Input Page — `/survey/:surveyId`

Purpose: Mobile-friendly page respondents reach by scanning the QR code.

**Features:**
- Shows survey title and description
- Renders each question in sequence or all at once (configurable)
- Input types:
  - Text field for free-text questions
  - Radio buttons / tap cards for multiple choice
  - Star or number selector for ratings
- Single submit button — responses sent via POST then confirmed with a thank-you screen
- Prevents duplicate submissions per device using `localStorage` token
- Works offline-first: queues submission if connectivity drops, retries on reconnect
- No login or account required

---

## Data Model

### Survey

```json
{
  "id": "uuid-v4",
  "title": "Post-talk Q&A",
  "description": "Quick check on the session",
  "createdAt": "ISO8601",
  "active": true,
  "questions": [
    {
      "id": "uuid-v4",
      "order": 1,
      "prompt": "What's your biggest takeaway?",
      "type": "free_text",
      "display": "word_cloud",
      "wordCloudMaxWords": 50,
      "wordCloudColorScheme": "blue"
    },
    {
      "id": "uuid-v4",
      "order": 2,
      "prompt": "How useful was this session?",
      "type": "rating",
      "scale": 5,
      "display": "histogram"
    },
    {
      "id": "uuid-v4",
      "order": 3,
      "prompt": "Which topic should we cover next?",
      "type": "multiple_choice",
      "choices": ["Security", "Observability", "SRE Practices", "Other"],
      "display": "bar_chart"
    }
  ]
}
```

### Response

```json
{
  "id": "uuid-v4",
  "surveyId": "uuid-v4",
  "submittedAt": "ISO8601",
  "deviceToken": "random-string",
  "answers": [
    { "questionId": "uuid-v4", "value": "reliability engineering mindset" },
    { "questionId": "uuid-v4", "value": 4 },
    { "questionId": "uuid-v4", "value": "Observability" }
  ]
}
```

---

## Filesystem Persistence

```
data/
  surveys/
    {surveyId}.json          ← survey definition
  responses/
    {surveyId}/
      {responseId}.json      ← one file per response
  state.json                 ← active survey ID, global settings
```

- Reads on startup load all surveys and response counts into memory
- Writes are append-only (new response = new file); no updates to existing response files
- Survey definitions are rewritten in place on edit
- A simple in-memory cache avoids re-scanning the filesystem on every request

---

## Server

**Stack:** Node.js, Express, Socket.IO, no build step required (vanilla JS + ESM or CommonJS).

**Key routes:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin` | Admin UI |
| GET | `/display/:id` | Results display UI |
| GET | `/survey/:id` | Respondent input UI |
| GET | `/api/surveys` | List all surveys |
| POST | `/api/surveys` | Create survey |
| PUT | `/api/surveys/:id` | Update survey |
| DELETE | `/api/surveys/:id` | Delete survey |
| PUT | `/api/surveys/:id/activate` | Set as active survey |
| GET | `/api/surveys/:id/results` | Aggregated results |
| POST | `/api/surveys/:id/responses` | Submit a response |

**WebSocket events (Socket.IO):**

| Event | Direction | Payload |
|-------|-----------|---------|
| `join_display` | client → server | `{ surveyId }` |
| `results_update` | server → client | `{ surveyId, questionId, aggregated }` |
| `new_response` | server → client | `{ surveyId, totalCount }` |
| `pin_question` | admin → server | `{ surveyId, questionId }` |
| `question_pinned` | server → display | `{ surveyId, questionId }` |

On new response: server re-aggregates that survey's results and broadcasts `results_update` to all clients in the display room. When admin pins a question, server stores the pinned question in `state.json` and broadcasts `question_pinned` to the display room.

---

## Frontend

- No framework — vanilla JS with ES modules
- Word cloud: [`wordcloud2.js`](https://github.com/timdream/wordcloud2.js) (CDN)
- Charts: [`Chart.js`](https://www.chartjs.org/) (CDN)
- QR code: [`qrcode.js`](https://davidshimjs.github.io/qrcodejs/) (CDN)
- Socket.IO client from CDN
- CSS: hand-written, minimal, mobile-first

---

## Non-Goals (v1)

- User authentication (admin page is unauthenticated)
- Multi-tenancy or teams
- Export to CSV/PDF
- Database (Postgres, SQLite, etc.) — filesystem only
- Webhooks or third-party integrations

---

## Decisions

1. **Question sequencing on display** — Admin manually pins which question is shown on the display via the admin page. The display page renders whichever question is currently pinned and updates instantly when the admin changes it via WebSocket push.

2. **Duplicate prevention** — `localStorage` token only. On first visit to a survey, the client generates a random token and stores it; the token is sent with the submission. The server rejects a second submission with the same token for the same survey. No IP-based rate limiting (would break shared conference WiFi).

3. **Word cloud filtering** — Stop words are filtered server-side using a standard English stop word list before aggregation. The filtered word list is used for the word cloud; raw responses are still stored in full.

4. **Survey URL format** — Full UUID path (`/survey/{uuid}`). No short codes needed for v1.
