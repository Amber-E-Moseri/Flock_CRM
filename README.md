# Flock — Pastoral CRM

A lightweight relationship management system built on Google Apps Script and Google Sheets. Built to make sure no one slips through the cracks.

**[Live Demo →](https://flockdemo.netlify.app/)**

---

## Screenshots

<img width="1898" height="916" alt="Priority dashboard" src="https://github.com/user-attachments/assets/75de2bbb-bf94-4786-b6e6-76000caa8558" />
<img width="1900" height="913" alt="Log call flow" src="https://github.com/user-attachments/assets/4a33b232-5a17-4fd7-aaf4-8dce86d5f165" />
<img width="1901" height="912" alt="Call history" src="https://github.com/user-attachments/assets/03306a19-88a5-4b4a-bc5f-580b4d6015d2" />
<img width="1918" height="851" alt="Analytics" src="https://github.com/user-attachments/assets/91595f00-fe77-472c-8345-9657e2a03eb3" />
<img width="1901" height="911" alt="Settings" src="https://github.com/user-attachments/assets/a8b9e64d-abb0-4809-9ceb-a9a03c4cd6d7" />
<img width="1901" height="907" alt="Add person" src="https://github.com/user-attachments/assets/a8833303-83d1-4afb-91cb-80134bb9f32d" />
<img width="1897" height="915" alt="Mobile view" src="https://github.com/user-attachments/assets/9dada27d-31a5-4d80-8880-028c9b8d2369" />

---

## The Problem

I built this for a pastor who was managing outreach to dozens of people with no real system. Every few weeks he'd realize he hadn't spoken to someone in over a month — not because he didn't care, but because there was no clear view of who needed attention next. Notes were scattered across texts and memory. Follow-ups were missed.

The same problem exists for anyone responsible for consistent, personal outreach — mentors, coaches, team leads, community organizers. The tools that exist are either too heavy (full CRMs) or too passive (spreadsheets). There was nothing designed around the simple question: *who do I call next, and why?*

---

## What It Does

- **Priority dashboard** — see callbacks, overdue, due today, and upcoming at a glance
- **AI-assisted logging** — describe a call in plain language; the system extracts result and next step, lets you edit before saving
- **Smart scheduling** — next due dates calculated automatically per person based on their cadence
- **Call history** — clean interaction timeline per person
- **Offline support** — saves locally when offline, syncs when back online
- **Daily notification** — one morning summary of who's due today, nothing more
- **Todos** — lightweight task layer attached to people and follow-ups
- **Analytics** — weekly call volume, silent contacts (6+ weeks), best week, role frequency

---

## What's New (v3)

- **AI Log Assistant** — log calls in plain language, edit before saving
- **Editable confirm step** — fix person, result, or follow-up date before committing
- **Daily summary notifications** — know what's due without opening the app
- **Draft restore** — continue where you left off if interrupted
- **Return-to-context navigation** — go back to where you started after logging
- **Backend test suite** — smoke tests for all core write operations via Node test runner + custom GAS harness
- **Module split** — `app-core.js` broken into focused `core-*.js` modules

---

## Architecture

```
Frontend (HTML / CSS / JS)
        ↓
Google Apps Script Web App  ←  API layer
        ↓
Core Logic (code.gs)
        ↓
Google Sheets  ←  PEOPLE / INTERACTIONS / FOLLOWUPS / SETTINGS / TODOS
```

The frontend is fully static. It talks to the backend through a single API endpoint — no server, no hosting costs, no build pipeline. This separation means the frontend could be replaced with a React app or mobile client without touching the backend.

**Frontend modules:**

| File | Responsibility |
| --- | --- |
| `core-api.js` | All fetch calls to the GAS backend |
| `core-cache.js` | Client-side caching and invalidation |
| `core-log.js` | Call logging flow |
| `core-ai.js` | AI assist parsing and confirm step |
| `core-navigation.js` | View routing and return-to-context |
| `core-analytics.js` | Analytics rendering |
| `core-history.js` | Per-person interaction timeline |
| `core-settings.js` | Settings UI |
| `core-init.js` | Bootstrap and app initialization |
| `core-config.js` | Config loading from meta tag |
| `drafts-offline.js` | Offline queue and draft persistence |
| `todos.js` | Todo layer |

---

## Tech Stack

| Layer    | Tool                    |
| -------- | ----------------------- |
| Backend  | Google Apps Script      |
| Database | Google Sheets           |
| Frontend | HTML / CSS / JavaScript |
| Email    | GmailApp                |
| Hosting  | GitHub Pages / Netlify  |
| Tests    | Node.js test runner + custom GAS harness |

No frameworks. No build tools. Kept simple intentionally — easy to run, easy to maintain, easy to keep using.

---

## Engineering Decisions

These were deliberate choices, not defaults.

### Google Sheets as the database

The user already understood Sheets and could see and audit his own data directly. A proper database would have required me to build an admin UI just to replace what Sheets provides for free. That's complexity without benefit at this scale.

The tradeoff: Sheets doesn't handle concurrency well and has API rate limits. That's acceptable for a single-user tool. At team scale, I'd migrate to PostgreSQL — the API-first architecture makes that swap straightforward without rewriting the frontend.

### API-first structure

The frontend never touches Sheets directly — it only calls the GAS web app, which acts as a REST API. Every read and write goes through `code.gs`. This means the frontend is fully replaceable (React, mobile app, another dashboard), all business logic lives in one place, and input validation and sanitization happens once, server-side.

### Caching for speed

People lists and due-date buckets are cached briefly and invalidated on write. GAS cold starts are slow — caching keeps the UI feeling responsive without stale data.

### No heavy recalculation on save

Saving a call doesn't refresh all due statuses. That calculation runs on a scheduled trigger instead. This keeps the logging flow fast and separates concerns cleanly.

### Cadence-based scheduling

Each person has their own follow-up rhythm rather than one global setting. A close contact might be weekly; a peripheral one might be monthly. The system respects that difference automatically.

### Offline queue

Calls are queued in localStorage when offline and synced when connectivity is restored. Draft state is also persisted so an interrupted logging flow can be resumed. Both were real pain points — the pastor often logged calls from places with spotty signal.

### AI assist with a mandatory edit step

The AI parses natural language call descriptions and suggests a result and next step. But it never commits silently — the user always sees and can edit the suggestion before it saves. The goal was speed without sacrificing accuracy.

---

## Testing

Backend logic is tested via a custom GAS harness that mocks `SpreadsheetApp`, `CacheService`, `ContentService`, and `Utilities` in a plain Node.js environment — no emulator, no deploy required.

```bash
node tests/run-backend-tests.js
```

Tests cover the core write operations: `api_saveInteraction`, `api_addPerson`, `computeDuePeople_`, duplicate prevention, and the `doPost`/`doGet` routing layer.

---

## Data Model

| Sheet        | Purpose                                 |
| ------------ | --------------------------------------- |
| PEOPLE       | Who is being tracked                    |
| INTERACTIONS | Every call logged                       |
| FOLLOWUPS    | Open callbacks and follow-ups           |
| SETTINGS     | App configuration                       |
| TODOS        | Tasks attached to people and follow-ups |

---

## What I'd Do Differently

**Add authentication from day one.** The GAS endpoint is deployed as "Access: Anyone" — which made early iteration fast, but it means anyone with the `/exec` URL can read or write all data. Retrofitting auth is always harder than building it in. A shared secret header verified in `doPost`/`doGet` would have been a one-hour addition early on; it's more disruptive now.

---

## Setup

### 1. Create a Google Sheet

Extensions → Apps Script → paste `code.gs` → run `setupSystem()`

### 2. Deploy the web app

- Execute as: Me
- Access: Anyone

Copy the `/exec` URL.

### 3. Connect the frontend

Set the API URL at deploy time — do not commit it directly:

```html
<meta name="flock-api-url" content="YOUR_APPS_SCRIPT_EXEC_URL" />
```

Or use the inject script with an environment variable:

```bash
FLOCK_CLIENT_API_URL=https://script.google.com/... node inject-config.js
```

### 4. Configure settings

Set reminder email, notification hour, timezone, and your name from the app's Settings page.

### 5. Set triggers

| Function                    | Schedule |
| --------------------------- | -------- |
| refreshDueStatuses          | Daily    |
| sendMorningDueNowReminder   | Daily    |
| sendMondayFollowupsThisWeek | Weekly   |

### 6. Host the frontend

GitHub Pages or Netlify both work. The frontend is fully static — no server required.

---

## If I Were Scaling This

- Move data → PostgreSQL (Sheets is the weakest layer long-term)
- Introduce TypeScript
- Migrate UI → React
- Add proper authentication (JWT or session-based)
- Add role-based access for team use

The architecture is already set up for this — the API boundary means none of these changes require rewriting both layers at once.

---

## Why This Project

This wasn't built as a demo. It came from a real workflow with real gaps — missed follow-ups, scattered notes, no visibility into consistency. The value isn't in technical complexity. It's in making the next action obvious.

> Clarity → Consistency → Results