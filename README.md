# 📞 Pastoral CRM

A lightweight outreach system built on Google Apps Script and Google Sheets — designed to make sure nothing slips.

**[Demo →](https://amber-e-moseri.github.io/Pastoral_CRM/)**

---

## Screenshots
<img width="1918" height="851" alt="image" src="https://github.com/user-attachments/assets/91595f00-fe77-472c-8345-9657e2a03eb3" />
<img width="1901" height="911" alt="image" src="https://github.com/user-attachments/assets/a8b9e64d-abb0-4809-9ceb-a9a03c4cd6d7" />
<img width="1901" height="907" alt="image" src="https://github.com/user-attachments/assets/a8833303-83d1-4afb-91cb-80134bb9f32d" />
<img width="1900" height="913" alt="image" src="https://github.com/user-attachments/assets/4a33b232-5a17-4fd7-aaf4-8dce86d5f165" />



---


## The Problem

A pastor managing outreach to a number of people had no clear system.

Follow-ups were missed, notes were scattered, and there wasn't a simple way to know who needed attention next.

The goal was simple:

> Have one flow where everything is clear and nothing is forgotten.

It was built for church leadership. But the problem is not unique to that context.

Anyone who makes regular mentorship calls, coaches a group, or is responsible for staying connected with a set of people will run into the same issue. The names change. The system is the same.

---

## What This Solves

- Every call is logged  
- Every follow-up is tracked  
- Every person has a clear next step  

No guessing. No relying on memory. Just clarity and consistency.

---

## Features

- **Priority dashboard** — see callbacks, overdue, due today, and upcoming at a glance  
- **Call logging** — outcome, notes, and next action in one flow  
- **Smart scheduling** — next due dates are set automatically based on cadence  
- **Inline history** — see recent interactions while logging a call  
- **Full history** — view all interactions per person  
- **Analytics** — weekly trends, reached count, silent people, and role frequency  
- **Email reminders** — daily and weekly summaries  
- **Add people directly** — no need to go into the sheet for normal use  
- **Settings from the app** — adjust reminder hours, timezone, and cadence easily  
- **Works anywhere** — mobile-friendly, no Google login required  

---

## Demo

This public demo is hosted on GitHub Pages and uses sample data.

**Live Demo:**  
https://amber-e-moseri.github.io/Pastoral_CRM/

> Note: this demo is separate from the private production version and does not expose real user data.

---

## Tech Stack

| Layer | Tool |
|---|---|
| Backend | Google Apps Script |
| Database | Google Sheets |
| Frontend | HTML / CSS / JavaScript |
| Email | GmailApp |
| Hosting | GitHub Pages / Netlify |

No frameworks, no build tools — kept simple on purpose so it is easy to run, easy to maintain, and easy for the user to keep using.

---

## Architecture

The frontend is a static file hosted publicly.

It talks to a Google Apps Script web app as a simple HTTP API.

```text
Frontend (HTML/JS)
        ↓
Apps Script Web App (API)
        ↓
Core Logic (Code.gs)
        ↓
Google Sheets (PEOPLE / INTERACTIONS / FOLLOWUPS / SETTINGS)
```

Everything is separated properly, so the frontend can change later without needing to rebuild the backend.

That means the same backend structure could later support:

* a React frontend
* a mobile app
* another internal dashboard

---

## Data Model

There are four main sheets:

| Sheet        | Purpose                                                     |
| ------------ | ----------------------------------------------------------- |
| PEOPLE       | Who is being tracked                                        |
| INTERACTIONS | Every call that has been logged                             |
| FOLLOWUPS    | Open callbacks and follow-ups                               |
| SETTINGS     | App configuration like reminder emails, hours, and timezone |

Each dashboard load transforms the raw sheet data into clear priority buckets:

| Bucket    | Meaning                               |
| --------- | ------------------------------------- |
| callbacks | Open follow-ups waiting on a response |
| overdue   | Past due date                         |
| today     | Due today                             |
| this week | Coming up in the next few days        |
| no date   | Active but not yet scheduled          |

So instead of thinking through rows manually, the user can just see what matters and act on it.

---

## Engineering Decisions

These were not random choices. Each one solved a real issue in the workflow.

### 1. Google Sheets instead of a traditional database

The user already lives in Google Workspace.

So instead of introducing a database they would not manage themselves, the system was built around a tool they already understand.

That made the system more usable and more self-serviceable.

**Tradeoff:** Sheets is slower and less scalable than a real database.  
**Answer:** caching and lean API design.

---

### 2. Server-side caching with explicit invalidation

Reading from Sheets repeatedly is slow.

So the people list, due buckets, cadence list, and interaction history are cached for a short time. Every write clears the cache.

This gives:

* faster reads
* fresh data after updates
* less repeated sheet work

Fast when reading. Accurate when writing.

---

### 3. Batch writes instead of unnecessary repeated updates

Writing cell by cell in Apps Script adds up quickly.

Originally, that kind of pattern would make simple actions slower than they needed to be.

So updates were consolidated as much as possible and expensive recalculations were kept out of the critical save path.

That made the app feel much more responsive.

---

### 4. Daily recalculation instead of recalculating everything on every save

Recalculating all due statuses after every logged call works, but it is expensive.

That work was moved to a scheduled trigger instead.

A call save should only do what is needed for that call, not refresh the whole world every single time.

Simple decision. Big performance difference.

---

### 5. Duplicate protection

People double tap. Especially on mobile.

So duplicate submissions are blocked using a short-lived cache key based on the interaction payload.

That means if the same call is submitted again within a short window, it is ignored server-side.

It is a simple reliability feature, but it matters.

---

### 6. Cadence-based scheduling

Each person can have their own cadence.

After a successful contact, the system calculates the next due date based on that cadence. If there is no custom cadence set, it falls back to a default value.

This keeps follow-up practical and personalized instead of one-size-fits-all.

---

### 7. Fixed cadence column for speed

Cadence is read using a fixed column constant.

That is faster than scanning headers every single time, but it also means the sheet structure needs to stay consistent.

The important thing is that this tradeoff is explicit, not hidden.

---

### 8. API and frontend separation from the start

The frontend is just a static interface.  
The backend is just an Apps Script API.

That separation was intentional.

So the project is still simple, but not tightly coupled in a messy way.

---

### 9. Reading from the right source

Early on, the reached count was always showing zero — even when 18 calls had been made that week.

The bug was subtle. The metric was reading `DueStatus = 'Completed'` from the PEOPLE sheet. But once a successful call is logged, the next due date moves forward. The person is no longer "due this week" by the time analytics runs, so they disappear from the count entirely.

The fix was to read from the INTERACTIONS sheet instead — count unique people with a `Successful` outcome this week, directly from the source.

That is the kind of thing that looks fine in theory but breaks in practice. The Sheets data model makes it easy to read from the wrong place without realising it.

---

## Analytics

The analytics page makes outreach visible, not just logged.

This includes:

* **Weekly call volume** — total calls made each week over the last 1–3 months  
* **Reached this week** — unique people with a successful contact this week  
* **Silent people** — anyone with no successful contact in 6+ weeks, with a direct link to log a call  
* **Role frequency** — average days between successful contacts, grouped by role  
* **Best week** — the highest-reach week in the selected range  

So it is not just about logging activity. It also helps show whether the system is actually being used effectively.

---

## What I'd Do Next

If this needed to scale, the natural next steps would be:

* move the data layer to **PostgreSQL**
* add **TypeScript** for stronger frontend safety
* move the UI into **React** as the interface keeps growing
* add a proper **authentication layer**
* introduce more structured **role-based access**

Google Sheets works well for this use case. The right tool for the right context. But it is still the weakest part of the stack if the system ever needs to grow much further.

---

## Setup

### 1. Create a Google Sheet

Create a sheet and open:

**Extensions → Apps Script**

### 2. Paste the backend code

Paste in `Code.gs` and run:

```javascript
setupSystem()
```

This creates the required sheets:

* PEOPLE
* INTERACTIONS
* FOLLOWUPS
* SETTINGS

### 3. Deploy the Apps Script web app

Deploy as:

* **Execute as:** Me
* **Who has access:** Anyone

Then copy the `/exec` URL.

### 4. Connect the frontend to the API

In `index.html`, set:

```javascript
const API = "YOUR_APPS_SCRIPT_EXEC_URL";
```

### 5. Configure settings

Set things like:

* reminder email
* morning reminder hour
* weekly summary hour
* timezone

This can be done in the sheet or via the frontend settings page.

### 6. Set triggers

Run `resetAllTriggers()` or create them manually for:

| Function                      | Schedule     |
| ----------------------------- | ------------ |
| `refreshDueStatuses`          | Daily        |
| `sendMorningDueNowReminder`   | Daily        |
| `sendMondayFollowupsThisWeek` | Every Monday |

### 7. Host the frontend

You can host the frontend on:

* GitHub Pages
* Netlify
* any static host

### 8. Add people

Use the **Add Person** page in the app, or insert rows directly into the PEOPLE sheet.

---

## Why This Project Matters

This was not built as just another CRUD demo.

It was built around a real workflow and a real need:

* missed follow-ups
* scattered notes
* no visibility
* no consistency

The value of the system is not in being flashy.

It is in making the next action clear.

---

## Core Idea

> Clarity → Consistency → Results

If you always know who to call next, and you follow through, nothing slips.
