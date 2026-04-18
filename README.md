# QuorumSurvey

A real-time audience survey tool for live presentations and events. Attendees scan a QR code to submit responses from their phones; results appear instantly on screen as word clouds, bar charts, pie charts, or rating histograms.

## How it works

1. **Admin** creates a survey at `/admin`, choosing question types and display formats
2. **Display** page at `/display/:id` shows live results and a QR code on the projector
3. **Attendees** scan the QR code, land on `/survey/:id`, and submit their answers
4. Results update in real time via WebSocket — no refresh needed

## Pages

| Page | URL | Audience |
|------|-----|----------|
| Admin | `/admin` | Presenter |
| Results display | `/display/:surveyId` | Projector / screen |
| Survey input | `/survey/:surveyId` | Attendees (mobile) |

## Question types & display formats

| Question type | Display options |
|---------------|----------------|
| Free text | Word cloud |
| Multiple choice | Bar chart, pie chart |
| Rating (1–5 or 1–10) | Histogram + running average |

## Stack

- **Server:** Node.js, Express, Socket.IO
- **Frontend:** Vanilla JS (no build step), Chart.js, wordcloud2.js, qrcode.js
- **Persistence:** Local filesystem (JSON files under `data/`)

## Getting started

```bash
npm install
npm start
# Open http://localhost:3000/admin
```

## Data storage

```
data/
  surveys/          # survey definitions
  responses/        # one JSON file per submission
  state.json        # active survey + pinned question
```

See [SPEC.md](SPEC.md) for full architecture and data model details.
