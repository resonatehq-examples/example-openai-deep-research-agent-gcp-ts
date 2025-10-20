# Research Agent Workflow — Resonate + Google Cloud Functions

This repository contains a single long-running, resumable workflow: a recursive **research agent** that uses the OpenAI chat completions API and is orchestrated with **Resonate**.
It is designed to run on a serverless platform (e.g., **Google Cloud Functions**) while the **Resonate Server** persists and resumes workflow state between spans.

---

# Overview

The `research` workflow implements a recursive research agent:

* It sends a system+user prompt to an LLM (via `OpenAI.chat.completions.create`).
* If the model returns **tool calls** asking for sub-research, the workflow:

  * spawns parallel child research runs (`ctx.beginRun`) for each subtopic,
  * awaits their results, and
  * feeds results back into the parent message stream as tool outputs.
* If the model returns a plain summary (no tool calls), the workflow returns that summary.

Because the workflow is written as a generator and executed with Resonate, each network call or multi-step operation can be a suspend/resume point — ideal for serverless.

---

# Architecture

```
┌────────────────────────────┐
│  Developer / CLI           │
│  resonate invoke research  │
└─────────────┬──────────────┘
              │
              ▼
┌──────────────────────────────┐
│      Resonate Server         │
│  - persists run state        │
│  - schedules & resumes runs  │
│  - invokes target function   │
└─────────────┬───────────────┘
              │
              ▼
┌──────────────────────────────┐
│ Google Cloud Function (this) │
│  - registers `research`      │
│  - calls OpenAI & orchestrates subruns
└─────────────┬───────────────┘
              │
              ▼
┌──────────────────────────────┐
│ External APIs (OpenAI)       │
└──────────────────────────────┘
```

---


# Environment variables / Secrets

* `OPENAI_API_KEY` — OpenAI API key (required)

---

# Workflow: key implementation notes

* The LLM call is performed via a helper function `prompt(...)` that returns the model message (and any `tool_calls`).
* The workflow inspects `message.tool_calls` and — for each `research` tool call — uses:

  * `yield* ctx.beginRun(research, subtopic, depth - 1)` to spawn a child run, then
  * `yield* handle` to await its result before continuing.
* The generator returns the final text (summary) once the model stops issuing tool calls.

This pattern allows parallel, resumable sub-research tasks that are resilient to process restarts.

---

## Triggering & Running

Once the Resonate Server and your Cloud Function are deployed and reachable:

```bash
resonate invoke research.<run-id> \
  --func research \
  --arg "causal inference in neural nets" \
  --arg 1 \
  --server https://resonate-server-... \
  --target https://your-cloud-function-url
```

* `research.<run-id>` — unique run/promise id of your choice.
* `--arg <topic>` — topic string.
* `--arg <depth>` — integer; `depth > 0` enables tool/sub-research spawning.
