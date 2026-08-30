# Goalflow Telegram V1 — Product & Engineering Context

Status: Authoritative working context for the Telegram companion  
Repository: `mariusschober/Goalflow`  
Authoritative production branch: `goalflow-production`  
Production head observed when this document was prepared: `44f2e47f4d7e589f17a746c96cabf58e7b2fbb8a`  
Date: 2026-08-30

> This document defines the intended Telegram product. It does not override Goalflow's core product constitution, scheduling semantics, data-integrity rules, or the authoritative Sync protocol. When this document conflicts with `docs/PRODUCT_PHILOSOPHY.md`, the production constitution wins unless the owner explicitly says otherwise.

---

## 1. Why this exists

Goalflow is becoming an ecosystem rather than one interface.

Parallel work is already underway:

- Spark 1.2: native macOS companion.
- Spark 1.2: Chrome extension.
- Luna Max: native Android production improvements.
- Sol Max: Sync reliability, convergence, and zero-silent-data-loss work.

Telegram is another surface, but it has a different job.

The Telegram companion is **not** a replacement for Goalflow Web, Android, macOS, or the Chrome extension. It is a very small **remote control, quick-capture surface, and quick-status surface** that is useful when Telegram is already the lowest-friction interface available.

The Telegram product should exploit what Telegram is uniquely good at:

1. instantaneous conversational text capture;
2. frictionless speech/voice capture;
3. forwarding messages directly into Goalflow;
4. inline buttons for small, explicit actions;
5. a tiny Mini App for glanceable status and structured capture/editing;
6. deep links back into the real Goalflow application when meaningful planning or editing is required.

Do not turn Telegram into another general-purpose task manager.

---

## 2. Governing Goalflow philosophy

Read `docs/PRODUCT_PHILOSOPHY.md` before changing Telegram behavior.

Core invariant:

```text
TRUE NORTH / DIRECTION
        ↓
GOALS
        ↓
COMMITMENTS
        ↓
TODAY
        ↓
CURRENT
        ↓
ACTION
```

For Telegram, the relevant implications are:

- Goalflow exists to produce action, not merely maintain a tidy task database.
- Planning is where the user decides.
- Current is where the user does.
- Current must answer one question: **What am I doing now?**
- Current must privilege one deterministic next action and must not become another prioritization environment.
- Every actionable task must belong to a specific local calendar day or a future month.
- There is no generic unscheduled inbox.
- Required planning cannot silently be bypassed.
- Frogs are anti-avoidance commitments and preserve their canonical behavior.
- Completion must be durable.
- Telegram is an optional enhancement. Failure of Telegram must never damage the core product.

Telegram therefore supports capture and visibility around the user's deliberate plan. It does **not** become a place for broad daily replanning.

---

## 3. Product definition

### One-line definition

**Goalflow Telegram = quick capture + speech capture + forwarded-message capture + quick Current/Today status + a tiny Mini App dashboard.**

It is a **remote control**, not a full Goalflow client.

### Telegram is allowed to do

- Capture a task from plain text.
- Capture a task from a Telegram voice message.
- Capture a task by forwarding an existing Telegram message to Goalflow.
- Preserve source context for forwarded captures when Telegram provides it.
- Understand practical scheduling information from natural language.
- Ask the minimum clarification required when scheduling is missing or ambiguous.
- Show Current.
- Show Today as a compact read-only status.
- Provide safe small inline actions such as Undo or choosing a capture date.
- Open the exact task or relevant Goalflow surface via deep link.
- Open a small Telegram Mini App.
- Use the Mini App for status, capture, editing capture metadata, date selection, and direct navigation back into Goalflow.

### Telegram is not allowed to become

- a full Planning interface;
- a Goals manager;
- a Habits manager;
- a Stats dashboard;
- a full task backlog;
- a task reordering environment;
- a duplicate Android app;
- a duplicate PWA;
- an AI chat interface;
- a focus timer;
- a Pomodoro controller;
- a focus-session controller;
- a separate local-first data store;
- a new Sync engine;
- a place that invents alternate Goalflow scheduling or Current semantics.

---

## 4. V1 feature scope

### 4.1 Plain-text capture — V1

The fastest path should be simply sending the bot a message.

Examples:

```text
Call Peter tomorrow 14:30 20m #sales
Order booth lighting next Friday
Prepare MEDICA exhibitor email 45m #movetrics
```

Expected behavior:

- Parse task title.
- Parse explicit or natural date when confidently deterministic.
- Parse explicit time when present.
- Parse duration when present.
- Parse tags when present and compatible with the canonical task model.
- Use the user's Goalflow timezone.
- Never silently invent important scheduling data.
- If a date/month is missing, do not silently put the task into Today.

Factory behavior for an unscheduled capture:

```text
Buy printer paper

When?

[Today] [Tomorrow]
[Pick date] [Future month]
```

The existing Telegram implementation currently defaults unscheduled captures to Today. That behavior is no longer acceptable for the Telegram V1 product because it silently converts capture into a commitment.

A user preference may eventually allow a configurable default such as Today, but V1 factory behavior must require an explicit date/month when none is supplied.

### 4.2 Speech-to-Task — V1

Voice is a first-class Telegram feature.

Example:

> "Tomorrow afternoon ask Saad about the new enclosure, fifteen minutes, Movetrics."

The bot should:

1. download the voice note safely;
2. transcribe it using the existing speech-provider abstraction;
3. parse the transcript through the same capture semantics used for text;
4. show the interpreted task back to the user;
5. require confirmation before durable creation when transcription or interpretation could be wrong;
6. allow cancellation/editing without creating duplicate tasks;
7. retain safe idempotency under Telegram retries.

Do not build a separate AI task model for voice. Voice is another input method into the same capture pipeline.

### 4.3 Forward-to-Goalflow — V1

Forwarding a Telegram message to the Goalflow bot is an intentional capture action.

Goal:

A user sees a message such as:

> "Could you send me the revised offer next Wednesday?"

They forward it to Goalflow.

Goalflow should recognize that this is a forwarded source message rather than treating the full forwarded message blindly as the final task title.

The interaction should be minimal. Depending on how confidently the intent can be derived:

```text
Forwarded message captured.

What do you want to do?

[Create task]
```

or allow the user to reply with:

```text
Send revised offer Wednesday 20m
```

Source preservation requirements:

- Preserve the original forwarded text/caption.
- Preserve source metadata that Telegram actually exposes and that is appropriate to store.
- Never assume Telegram exposes information that it has withheld for privacy.
- Where available, preserve useful source context such as original message ID, source chat/title/username, forwarded origin metadata, and a Telegram link/reference if one can be constructed safely.
- Make it possible for a later Goalflow surface to show where the commitment came from.
- Do not silently throw away the source message after extracting a title.
- Do not store unnecessary Telegram content beyond the intentional forwarded capture.

If canonical Goalflow storage does not currently have a safe structured home for source context, **do not improvise a cross-platform schema change while Sync is actively being hardened**. Characterize the requirement, isolate it, and coordinate the smallest compatible representation.

### 4.4 Undo — V1

Fast capture needs fast recovery.

After task creation:

```text
Added:
Send revised offer
Wednesday · 20 min

[Undo] [Open]
```

Undo must use canonical task mutation semantics and must be safe under retries.

### 4.5 Current — V1

`/current`, the Mini App, or an appropriate bot button should expose exactly one Current commitment.

Example:

```text
CURRENT

🐸 Prepare MEDICA outreach
45 min · #movetrics

[Open in Goalflow]
```

The exact displayed metadata should remain compact.

Do not expose a huge list of alternatives around Current.

No Telegram focus timer or session controls in V1.

### 4.6 Today — V1

Today is allowed as quick status, not as a replanning environment.

Example:

```text
TODAY

→ Prepare MEDICA outreach · 45m
  Call Peter · 20m
  Gym · 90m

3 open · 2h 35m remaining

[Current] [Open Planning]
```

Rules:

- read-only or nearly read-only;
- canonical ordering;
- planning gate respected;
- no drag/reorder;
- no complex editing;
- no alternate priority system;
- no bypassing required planning.

### 4.7 Deep links — V1

Where Goalflow already supports or can safely support deep linking:

- `Open` should open the exact task/context, not generic home.
- `Open Planning` should go to Planning.
- `Current` should go to Current.
- A forwarded-source task should eventually be able to expose its source context in Goalflow.

Do not invent fragile deep links without checking current routing.

### 4.8 Mini App — V1

The Mini App is approved for V1.

However, it is intentionally tiny.

#### Correct Mini App

A compact Telegram-native control panel:

```text
CURRENT
Prepare MEDICA outreach

Today · 45 min · #movetrics

[Open in Goalflow]

────────────────

TODAY
3 open · 2h 15m

1. Prepare MEDICA outreach
2. Call Peter
3. Order booth lighting

────────────────

[+ Capture Task]
```

It may additionally support:

- structured capture;
- clean date picker;
- clean time picker;
- duration picker;
- tags when useful;
- editing a pending capture;
- confirmation/undo;
- task deep links.

#### Wrong Mini App

Do not build:

- full Planning;
- Goal editing;
- Habit management;
- full statistics;
- Settings duplication;
- large backlog browsing;
- full PWA navigation;
- focus timer;
- music;
- AI assistant chat;
- gamification dashboards.

#### Architecture

The Mini App is another server-backed view onto Goalflow state.

It must:

- validate Telegram Mini App `initData` server-side;
- never trust client-side identity data by itself;
- reuse authoritative Goalflow server/domain operations;
- not create its own Sync engine;
- not create an independent durable task store;
- not reimplement scheduling/business rules in frontend JavaScript.

The Mini App should be built **after core bot semantics are correct**, even though it is part of V1.

---

## 5. Primary interaction model

The bot should feel like a tool, not like a chatbot.

Prefer:

- compact messages;
- small inline keyboards;
- edited-in-place status where useful;
- deterministic behavior;
- minimal clarification;
- clear success/failure;
- no engagement copy.

Avoid:

- long conversational explanations;
- motivational messages;
- repeated confirmations for low-risk read actions;
- command memorization as the primary UI;
- huge reply keyboards;
- noisy push notifications.

Todorant is useful as a historical reference because its Telegram integration treated Current as a compact message with inline Done/Skip/Refresh actions and edited that message in place. Learn from the interaction constraint, not from its architecture, product model, command set, or implementation details.

Reference repository for learning only:

`backmeupplz/todorant-backend`

Do not copy it. Do not port it. Do not inherit its data model.

---

## 6. Existing Goalflow Telegram implementation

Do not start from scratch.

Relevant existing code already includes:

```text
server/telegram/bot.ts
server/telegram/capture.ts
server/telegram/capture.test.ts
server/routes/telegram.ts
server/routes/telegramAuth.ts
server/speech/openai.ts
server/speech/types.ts
server/routes/tasks.ts
src/domain/scheduling.ts
services/syncProtocol.ts
services/cloudSync.ts
```

Existing Telegram capabilities already include substantial pieces of:

- linked Telegram identities;
- server-side webhook processing;
- webhook-secret validation;
- update deduplication;
- deterministic idempotency keys derived from Telegram update IDs;
- plain-text capture;
- voice download/transcription;
- pending voice captures;
- confirmation/cancellation;
- `/current`;
- `/today`;
- `/done`;
- `/skip`;
- rescheduling;
- shared Goalflow queue/planning-gate logic.

This is a foundation to evolve, not legacy code to throw away.

Characterize existing behavior with tests before replacing it.

---

## 7. Data-integrity and Sync boundary

Goalflow's highest engineering invariant remains:

> ZERO SILENT DATA LOSS.

Telegram must preserve this.

### Critical architectural rule

**Telegram does not get its own Sync engine.**

The bot is already server-side.

Once Telegram tells the user that a task was durably added, completed, undone, or moved, that state must already have been accepted by the authoritative server-side mutation path.

Do not add:

- Telegram local outbox;
- Telegram-specific conflict resolution;
- duplicate sync protocol;
- alternate revisions;
- direct ad hoc mutation logic that bypasses canonical server operations.

### Parallel-work constraint

Sol Max is actively hardening Sync reliability.

Luna Max is actively working on native Android production improvements.

Spark agents are simultaneously working on macOS and Chrome.

Therefore:

- create a dedicated Telegram feature branch;
- branch from the latest `goalflow-production` when work begins;
- record the exact base SHA in the Telegram handoff/status document;
- keep Telegram commits narrow and reviewable;
- do not merge or rewrite other agents' branches;
- do not alter Sync protocol semantics unless absolutely necessary;
- do not perform broad database migrations merely to make Telegram easier;
- if a shared-domain/schema change appears necessary, isolate it and document the dependency rather than casually changing it;
- rebase/merge from production only deliberately and with tests.

---

## 8. Authentication and security

Existing Telegram identity/linking work should be reviewed and preserved unless objectively defective.

Requirements:

- private-chat use should be the default safe assumption;
- bot access must be linked to a Goalflow user;
- webhook requests must remain authenticated;
- Telegram update retries must remain safe;
- mutations must remain idempotent;
- rate-limit abuse-sensitive endpoints;
- do not log message content unnecessarily;
- do not log voice audio;
- do not log secrets/tokens;
- voice files should be held only as long as required for transcription;
- Mini App identity must be verified server-side from Telegram-provided signed init data;
- forwarded-source metadata should respect what Telegram actually discloses.

---

## 9. Scheduling semantics

Telegram must use Goalflow scheduling semantics rather than inventing its own.

Required principles:

- use the user's Goalflow timezone;
- date-only commitments remain local calendar dates;
- no silent UTC day shifts;
- no scheduling into the past;
- exact day vs future-month semantics remain canonical;
- if the user's wording is ambiguous, ask;
- if the user's wording is sufficiently deterministic, do not add unnecessary friction;
- never silently default an unscheduled factory capture to Today.

Natural-language parsing should be deterministic where practical.

Examples to support progressively:

```text
tomorrow
today
next Friday
September
in September
2026-09-14
14:30
at 14:30
20m
45 min
2h
#movetrics
#sales
```

Do not use an LLM merely to parse obvious date/time tokens if deterministic parsing is safer.

AI may be used only where it materially improves ambiguous natural-language interpretation and must never silently create a wrong commitment.

---

## 10. Notifications

Telegram push access is valuable precisely because it is scarce.

V1 should not become an engagement-notification system.

No:

- streak spam;
- motivational nags;
- generic productivity reminders;
- "you haven't done anything today" messages;
- repeated overdue-task pressure;
- promotional messages.

If proactive notifications are added later, they must correspond to meaningful Goalflow state transitions and be explicitly controlled by user preferences.

---

## 11. Product-quality bar

Telegram should feel:

- immediate;
- calm;
- predictable;
- sparse;
- trustworthy;
- unusually fast.

The success metric is not command count.

A good V1 user should be able to:

1. link Telegram;
2. send a text task;
3. schedule it with almost no friction;
4. undo it;
5. send a voice task;
6. confirm the transcription;
7. forward a message and turn it into a commitment while retaining source context;
8. ask for Current;
9. ask for Today;
10. open the tiny Mini App;
11. jump into the exact Goalflow task or Planning when more work is required.

---

## 12. V1 exclusions

Explicitly out of scope unless the owner changes this document:

- focus sessions;
- focus timer;
- Pomodoro;
- ticking sound;
- break timers;
- music;
- detailed completion flow;
- flow-state tracking;
- full planning;
- goal management;
- habit management;
- statistics;
- gamification dashboards;
- project management;
- collaboration/chat;
- broad AI assistant behavior;
- Telegram-specific sync architecture.

---

## 13. Recommended engineering tranches

Spark should plan the exact implementation after inspecting the live repository. The following is a product-level sequencing recommendation, not a mandate to ignore better technical sequencing discovered in code.

### Tranche 1 — Establish the Telegram V1 foundation

Goal: make the existing bot safe, product-consistent, testable, and ready for richer capture.

Recommended work:

- create dedicated Telegram branch from current `goalflow-production`;
- inspect all existing Telegram/auth/scheduling/task mutation code;
- add or strengthen characterization tests around current bot behavior;
- define a clean internal Telegram interaction/service boundary rather than expanding a monolithic handler indefinitely;
- preserve webhook deduplication and idempotency;
- remove the factory silent-default-to-Today behavior;
- implement explicit scheduling clarification for unscheduled text capture;
- improve compact Current/Today presentation and useful inline buttons;
- retain safe Undo;
- document exact unresolved dependencies on Sync/shared schema;
- update a durable Telegram V1 progress/handoff document;
- stop.

Do not begin the full Mini App during Tranche 1.

Do not try to finish V1 in the first session.

### Tranche 2 — Rich capture

- natural date/time/duration/tag parsing;
- Speech-to-Task production flow;
- Forward-to-Goalflow;
- source-context preservation;
- edit/confirm capture flow;
- exact task deep links;
- adversarial and retry tests.

### Tranche 3 — Mini App

- server-validated Telegram identity;
- Current;
- Today;
- structured capture;
- date/time/duration editing;
- deep links;
- responsive Telegram-native UI;
- security and authorization tests.

### Tranche 4 — Production hardening

- webhook chaos/retry cases;
- duplicate updates;
- voice-provider failures;
- partial database failures;
- timezone/DST cases;
- forwarded-message privacy variations;
- Mini App authorization attacks;
- rate limiting;
- logging review;
- deployment/configuration docs;
- end-to-end manual verification with a real Telegram bot.

---

## 14. How Spark should work

Spark may plan autonomously.

It should not assume the context document contains every implementation detail.

Required working behavior:

1. read this document;
2. read `docs/PRODUCT_PHILOSOPHY.md`;
3. inspect the complete current Telegram implementation and the shared task/scheduling boundaries it calls;
4. inspect current branch/commit state before making changes;
5. create a dedicated Telegram branch;
6. write a durable full V1 implementation plan/status document into the repository;
7. execute only the first bounded tranche in the first work session;
8. add tests before or with behavior changes;
9. make small reviewable commits;
10. push safely to the Telegram branch;
11. never force-push production;
12. never overwrite other agents' work;
13. stop after the agreed tranche with:
    - commits;
    - tests executed;
    - evidence;
    - unresolved risks;
    - shared-schema/Sync dependencies;
    - exact next checkpoint.

When uncertain whether visible Goalflow behavior is intentional, preserve it and document the uncertainty.

---

## 15. Acceptance criteria for the eventual Telegram V1

V1 is not production-complete until all of the following are true.

### Capture

- plain text capture works;
- unscheduled captures require explicit scheduling;
- natural scheduling covers agreed common forms;
- duration/time/tags are preserved where supported;
- Undo is safe and idempotent;
- duplicate Telegram updates cannot create duplicate tasks.

### Voice

- voice transcription works;
- failure is explicit;
- confirmation prevents accidental commitments;
- audio handling is bounded and private;
- retries do not duplicate capture/task creation.

### Forwarded messages

- forwarding is recognized;
- original content is retained as intentional source context;
- exposed source metadata is retained where useful and lawful;
- privacy-hidden Telegram metadata is not fabricated;
- task creation remains explicit and deterministic.

### Status

- Current matches canonical Goalflow Current;
- planning gate is respected;
- Today uses canonical ordering;
- Today does not become a planning/reordering interface.

### Mini App

- Telegram identity is validated server-side;
- only the linked Goalflow user's data is accessible;
- Current and Today work;
- structured capture works;
- task/Planning deep links work;
- it does not create alternate business rules or sync.

### Reliability

- webhook retries are safe;
- idempotency is preserved;
- no silent data loss;
- no silent incorrect scheduling;
- timezone behavior is tested;
- existing Goalflow core continues to work if Telegram is down.

---

## 16. Final product test

Before adding any Telegram feature, ask:

> Does Telegram make this action materially faster because the user is already in Telegram?

If no, the feature probably belongs in Goalflow Web, Android, macOS, or Chrome instead.

The constraint is the product.

Telegram should feel powerful because it does very little, immediately.
