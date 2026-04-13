# 📞 Pastoral CRM (Flock)

A lightweight outreach system built on Google Apps Script and Google Sheets — designed to make sure nothing slips.

**[Demo →](https://amber-e-moseri.github.io/Pastoral_CRM/)**

---

## The Problem

A pastor managing outreach to a number of people had no clear system.

Follow-ups were missed. Notes were scattered. And there wasn’t a simple way to know who needed attention next.

The goal was simple:

> Have one flow where everything is clear and nothing is forgotten.

This was built for church leadership. But the problem is not unique.

Anyone responsible for consistent follow-up — mentorship, coaching, team leadership — runs into the same issue.

---

## What This Solves

* Every call is logged
* Every follow-up is tracked
* Every person has a clear next step

No guessing. No relying on memory. Just clarity and consistency.

---

## What’s New (v3)

This version moves the system from a simple tracker → a more complete pastoral CRM.

* **AI Log Assistant** — log calls in plain language, edit before saving
* **Editable confirm step** — fix person, result, or follow-up date instantly
* **Daily summary notifications** — know what’s due without opening the app
* **Draft restore** — continue where you left off if interrupted
* **Return-to-context navigation** — go back to where you started after logging
* **Improved settings structure** — clearer separation of app vs people settings
* **Mobile-first UX improvements** — faster, cleaner, fewer taps

---

## Features

* **Priority dashboard**
  See callbacks, overdue, due today, and upcoming at a glance

* **AI-assisted logging**
  Describe the call naturally → system extracts result and next step

* **Call logging flow**
  Outcome, summary, and next action in one clean step

* **Smart scheduling**
  Next due dates calculated automatically based on cadence

* **Call history**
  Clean interaction timeline per person

* **Daily progress tracking**
  See how many calls you’ve completed today

* **Offline support (light)**
  Save locally when offline, sync later

* **Daily notification reminder**
  One summary notification — not noisy, just useful

* **Add people directly**
  No need to go into the sheet

* **Settings from the app**
  Manage cadence, reminders, and preferences easily

* **Works anywhere**
  Mobile-friendly, no Google login required

---

## Demo

This public demo is hosted on GitHub Pages and uses sample data.

**Live Demo:**
https://amber-e-moseri.github.io/Pastoral_CRM/

> Note: This demo is separate from the private production version and does not expose real user data.

---

## Tech Stack

| Layer    | Tool                    |
| -------- | ----------------------- |
| Backend  | Google Apps Script      |
| Database | Google Sheets           |
| Frontend | HTML / CSS / JavaScript |
| Email    | GmailApp                |
| Hosting  | GitHub Pages / Netlify  |

No frameworks. No build tools.

Kept simple on purpose — easy to run, easy to maintain, easy to keep using.

---

## Architecture

```text
Frontend (HTML/JS)
        ↓
Apps Script Web App (API)
        ↓
Core Logic (Code.gs)
        ↓
Google Sheets (PEOPLE / INTERACTIONS / FOLLOWUPS / SETTINGS)
```

Frontend and backend are separated cleanly.

So the system can later support:

* a React frontend
* a mobile app
* another internal dashboard

without rewriting the backend.

---

## Data Model

| Sheet        | Purpose                       |
| ------------ | ----------------------------- |
| PEOPLE       | Who is being tracked          |
| INTERACTIONS | Every call logged             |
| FOLLOWUPS    | Open callbacks and follow-ups |
| SETTINGS     | App configuration             |

v3 addition:

* **Notes (PEOPLE sheet)** — persistent per-person context 

---

## Engineering Decisions

These were intentional, not random.

### 1. Sheets instead of a database

The user already understands it.

That made the system usable immediately.

---

### 2. Caching for speed

* People list
* Due buckets

Cached briefly → invalidated on write

Fast reads, fresh data.

---

### 3. No heavy recalculation on save

Saving a call does **not** refresh everything.

That work runs on a scheduled trigger instead.

---

### 4. Duplicate protection

Double taps happen.

Duplicate submissions are blocked server-side.

---

### 5. Cadence-based scheduling

Each person can have their own follow-up rhythm.

Not one-size-fits-all.

---

### 6. API-first structure

Frontend is static. Backend is an API.

Simple, but scalable.

---

## AI Assist (v3)

The goal is not “more AI.”

It is:

> Make logging faster, but still correct.

So the system:

* parses natural language
* suggests result + next step
* lets you **edit before saving**
* never silently commits wrong data

If unsure:

* it asks
* or lets you correct it quickly

---

## Notifications

Minimal by design.

* **One daily summary**
* No spam
* No per-person noise

Example:

> You have 4 people due today

---

## Analytics

The analytics page makes outreach visible:

* Weekly call volume
* Reached this week (correctly from INTERACTIONS, not PEOPLE)
* Silent people (6+ weeks)
* Role frequency
* Best week

This helps answer:

> Are we actually being consistent?

---

## What I’d Do Next

If scaling:

* move data → PostgreSQL
* introduce TypeScript
* migrate UI → React
* add authentication
* add role-based access

Sheets works well here. But it’s still the weakest layer long-term.

---

## Setup

### 1. Create a Google Sheet

Extensions → Apps Script

### 2. Paste backend code

Run:

```javascript
setupSystem()
```

---

### 3. Deploy web app

* Execute as: Me
* Access: Anyone

Copy `/exec` URL

---

### 4. Connect frontend

```javascript
const API = "YOUR_APPS_SCRIPT_EXEC_URL";
```

---

### 5. Configure settings

* reminder email
* notification hour
* timezone
* your name

---

### 6. Set triggers

| Function                    | Schedule |
| --------------------------- | -------- |
| refreshDueStatuses          | Daily    |
| sendMorningDueNowReminder   | Daily    |
| sendMondayFollowupsThisWeek | Weekly   |

---

### 7. Host frontend

* GitHub Pages
* Netlify

---

## Why This Project Matters

This was not built as a demo.

It was built around a real workflow:

* missed follow-ups
* scattered notes
* no visibility
* inconsistency

The value is not in complexity.

It is in making the next action clear.

---

## Core Idea

> Clarity → Consistency → Results

If you always know who to call next, and you follow through, nothing slips.
