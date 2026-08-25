# Goalflow Product Constitution

This document is a release invariant. Engineering changes may improve reliability, recovery, accessibility, performance, installation, and security, but they must preserve the behavior described here. An unusual behavior is intentional until evidence proves it is an objective defect.

## Purpose

Goalflow exists to produce action. It helps a person decide intentionally, commit to an order, stop renegotiating, execute one thing, complete it, and continue. It is not fundamentally a task database. A tidy backlog is not the success metric; completed action is.

## Planning and execution

- Planning is where the user decides.
- Current is where the user does.
- Current answers one question: “What am I doing now?”
- Current strongly privileges one deterministic next action and must not become another prioritization environment.
- Every actionable task belongs to a specific local calendar day or a future month that later requires deliberate planning. There is no generic Inbox, Someday, project, or unscheduled-task swamp.
- Overdue work cannot silently disappear, and required planning cannot silently be bypassed. Some friction protects an earlier intention from present avoidance.

## Behavioral mechanisms

- Frogs are anti-avoidance commitments. Frogs cannot be skipped or simply postponed; repeated forward postponement can create a frog.
- If a task is too large to execute, breakdown creates smaller scheduled actions and closes the correct parent. Breakdown is preferable to endless postponement.
- Ordering is deliberate and deterministic. Before-frog habits, frogs, and ordinary work retain their existing precedence.
- Habits generate at most one intended instance per local day.
- Completion is durable and completed work must not reappear as open Current work after reload or synchronization.

## Local-first operation

A person’s ability to act on today’s commitments must not depend on backend availability, Wi-Fi, an AI provider, Telegram, or hosting uptime. Local scheduling, planning, completion, persistence, and reload recovery are fundamental. Cloud synchronization, AI, voice, and Telegram are enhancements. A failed optional service must leave core Goalflow usable.

## Biological reality and direction

Circadian planning exists because human capacity changes during the day. Preserve that logic as a support for action, not quantified-self entertainment.

The direction of the product is:

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

Goals serve action, not endless reflection. Gamification reinforces completion without addictive engagement loops. AI may clarify, break down, challenge, or reflect, but it is never necessary to use Goalflow and never replaces the user’s judgment.

## Interaction quality

Goalflow should feel immediate, stable, calm, tactile, predictable, and trustworthy. Engineering may fix lag, double actions, touch targets, keyboard obstruction, focus loss, back behavior, modal traps, scroll bugs, safe-area overlap, loading/error states, accessibility barriers, offline behavior, and broken layouts. These are operational defects, not permission to redesign the information architecture, colors, typography system, navigation philosophy, terminology, scheduling model, visual identity, or deliberate friction.

Before changing visible behavior, ask: “Is this an objective defect, or merely my preference?” If uncertain, preserve the behavior, add characterization coverage where useful, document the uncertainty, and continue elsewhere.

## Release rule

Preserve the product. Perfect the implementation. Prefer the smallest reversible change that protects data, scheduling, planning, Current, completion, local persistence, recovery, security, and installability.
