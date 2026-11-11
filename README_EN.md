# pqw-skills

Hand a long run to your agent, and trust it: you set the boundaries together, hand off one run at a time, the agent delivers in slices, and you come back to verify. 25 agent skills for Claude Code, Codex, Cursor and other coding agents.

```bash
claude plugin marketplace add PanQiWei/pqw-skills
claude plugin install pqw-skills@pqw
```

For Codex, Cursor, Kimi Code, DSH, Copilot and Gemini, see [Install](#install). After the install, ask "how do I use this flow" and the agent teaches you.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-0.25.1-informational.svg)](./CHANGELOG.md)
[![Skills](https://img.shields.io/badge/skills-25-success.svg)](#skills)
[![skills.sh](https://skills.sh/b/PanQiWei/pqw-skills)](https://skills.sh/PanQiWei/pqw-skills)
[![Hosts](https://img.shields.io/badge/hosts-Claude%20Code%20%7C%20Codex%20%7C%20Cursor%20%7C%20Kimi%20Code%20%7C%20DSH%20%7C%20Copilot%20%7C%20Gemini-8A2BE2.svg)](#install)
[![Language](https://img.shields.io/badge/lang-%E4%B8%AD%E6%96%87%20%7C%20English-lightgrey.svg)](./README.md)

[中文](./README.md)

![Hand a long run to your agent, and trust it. Act 1, without it: a one-line kickoff, drift midway, patch on patch, a report that says all done, and a day of rework for you. Act 2, with it: you lead six definition steps; in the handoff phase you commit, size and pass one run; the agent delivers slice by slice while a sentinel reviews on a timer; you come back to verify, and the run is taken back before the next one is passed. Act 3, six things you get: no wasted work, no guessed scope, no loose thinking, no silent drift, no self-praise, no burnout for you.](./assets/story-en.svg)

A single-session development flow distilled from working with Claude Code, Codex, Cursor and other coding agents. It is a control loop: remove as much uncertainty as possible before any code is written, hand execution to the agent, then look back from the top at a fixed cadence. Your attention goes into defining boundaries and making high-level judgments, not into watching the implementation line by line.

The skill text is written in Chinese. This page is the English guide to what the flow is, what each skill does and how to install the set. The skill files themselves are the source of truth.

## When to use it

The flow exists for large changes only. The criterion is blast radius: use it when a change touches domain boundaries, cross-domain collaboration or the global architecture of a system.

| Use the flow | Do not use the flow |
| --- | --- |
| Adding a domain to a complex system | A small bug fix |
| Delivering a feature that cuts vertically through several domains | A quick prototype to test an idea |
| Refactoring a subsystem | A small incremental interface, designed and implemented |
| A large-scale transformation | A local change whose impact is obvious at a glance |

Work that does not qualify skips the whole flow. There is no reduced version. Such work goes straight to its own skill.

## What is in the set

![The whole set: 25 skills on two axes. Across is the flow axis with 13 steps: six definition steps that you lead, a handoff phase between them, and seven delivery steps that the agent runs. Down is the thinking axis with six models: decompose, find the gap, shape, build, prove, hand off, plus one candid friend that speaks to the human. Marks show at which step each model appears. Below are the question each of the 13 steps and the handoff phase answers, the entry and teaching skills, the writing skills, the resident card for your project, and nine bundled scripts.](./assets/map-en.svg)

The repository is flat: one entry skill, 13 stage skills, one handoff-phase skill, six cross-cutting thinking-model skills, one candid-friend skill, plus the teaching and writing skills. Stages with custom methods have their text here. Stages that already have a mature method reference skills from pstack, ub-mode and mattpocock/skills instead of copying them.

The definition period is led by you. Each step answers one question, produces one artifact, and that artifact is the input to the next step. The order cannot be skipped. The handoff phase works like the exchange zone in a relay race. The design session runs it while you are present: commit writes this run's spec; size decides how big the run is and whether to split the work into several runs; pass writes the handoff pack, which holds this run only. Passing is a physical condition: a boundary that has not reached the single source of truth and has not passed review is not defined. After the pass, you can turn your attention away and the main agent drives delivery. When the run comes back, you return to the design session to take it back: you verify it by hand, then the next run is passed.

## Skills

The two figures above are the whole picture. Open the details below for what each skill does and which external skills it references.

<details>
<summary>Skill details</summary>

### Entry

- **[single-session-dev-flow](./skills/single-session-dev-flow/SKILL.md)**: decides whether the work qualifies, sets the stages, their order and the handoff phase, and names the skill to load at each stage. It writes the 13 stages and the four handoff-phase tasks into the session task list and contains no stage method. Its first section, the four rules for writing code (make it work first; then one pass to make it right; no speculative design or premature optimization; fix the root cause), applies to all coding work and is the only full statement of them in this repository. References in-your-own-words, poteto-mode and tdd; routes unqualified work to prototype or diagnosing-bugs.
- **[teach-pqw-skills](./skills/teach-pqw-skills/SKILL.md)**: teaches a person how to use the flow. Mental models and philosophy, what the human and the agent each do at every stage, how to write the first prompt, how to steer a run that drifted, how to wire the flow into a project. Answers and gives an example prompt; never starts the work.

### Definition period, human-led

| Step | Skill | Question it answers | References |
| --- | --- | --- | --- |
| 1 | [requirement-and-invariants](./skills/requirement-and-invariants/SKILL.md) | What capability does the user get, how does the system differ before and after, what must the system always preserve | in-your-own-words, grilling |
| 2 | [domain-impact-analysis](./skills/domain-impact-analysis/SKILL.md) | Which domains are affected, is a new domain needed, which are primary and which are incidental, how does the whole fit together | domain-modeling, principle-model-the-domain, blast-radius |
| 3 | [tech-research-and-reuse](./skills/tech-research-and-reuse/SKILL.md) | Is there a library, a similar system or a community implementation to reuse, and what is the argument for building our own | research, principle-subtract-before-you-add |
| 4 | [formal-guard](./skills/formal-guard/SKILL.md) | Which properties cannot be guarded by tests and need partial-function totalization, mathematical modeling and proof | create-formal-verification-skill, statechart, maintain-formal-verification-skill |
| 5 | [detailed-domain-design](./skills/detailed-domain-design/SKILL.md) | What do the objects, relations and repositories inside the domain look like, how are I/O and query performance decided | domain-modeling, codebase-design, architect, principle-type-system-discipline, principle-boundary-discipline |
| 6 | [formal-docs-landing](./skills/formal-docs-landing/SKILL.md) | What becomes a long-lived formal document, what uses the source as its document, which layer each lands in; deterministic document review on five criteria | technical-writing, writing-for-agents |

### Handoff phase, design session with you

- **[pass-the-baton](./skills/pass-the-baton/SKILL.md)**: pass the baton. The handoff is a phase, not a point: an exchange zone between definition and delivery, run by the design session while you are present. Four tasks: commit, writing this run's spec with you; size, writing the slice outline, asking for your acceptance window, checking the size and writing a roadmap when the work is split into runs; pass, running the handoff checklist and writing the handoff pack; take back, after the run returns you verify it by hand, and the design session records the result in the roadmap, revises the later runs and passes the next one. The design session is the orchestrator and alone holds the roadmap. The delivery session knows only its own run, does not negotiate scope with you, and sends the pack back when it is not fit. One run is passed at a time. When design and delivery are separate sessions, they coordinate through GitHub issues by default; a project can name another tracker, and without one the fallback is files. Ships the handoff checklist, the handoff pack template with the slice outline, a roadmap template and one page on GitHub issues. It is not a numbered stage and is not in the matrix; its pointer lines are registered under `stages` in `design/context-map.json`, and `check-repo` checks each one.

### Delivery period, agent-led

| Step | Skill | What it does | References |
| --- | --- | --- | --- |
| 7 | [spec-and-plan](./skills/spec-and-plan/SKILL.md) | Two moments: the spec (goal, boundary, acceptance criteria) is written at commit time in the handoff phase; the plan is written at the start of delivery, starting from the slice outline and cutting the run into ordered slices; ships both templates and `check-plan.mjs` (checks the structure of plan, spec and handoff pack; the pack can come from standard input) | to-spec, to-tickets (read from the installed path), sharpen |
| 8 | [context-pack](./skills/context-pack/SKILL.md) | Before the run, assemble the context pack and do detailed design plus technical verification of the key parts; before each slice, build the kickoff pack: context delta, technical design and verification, refined execution plan, milestone todo list | architect, prototype, principle-guard-the-context-window, recall |
| 9 | [delegate-brief](./skills/delegate-brief/SKILL.md) | Doing it yourself is the default. Two criteria decide whether to delegate: how much context you cannot write down the work needs, and whether its intermediate work is large and thrown away after; then pass the delegation gate. When delegating, supply goal, boundary, a spec file and context pack, cap what the subagent reads, pick the tier by the kind of work and do not use the top tier as a subagent; raw results go into a file and the report is short and points to it; one page on what the tokens cost; anti-cheating acceptance, escalation, merge-back. Ships `check-brief.mjs` | poteto-mode, swarm, principle-separate-before-serializing-shared-state |
| 10 | [one-lesson-rule](./skills/one-lesson-rule/SKILL.md) | A cheap, read-only sentinel subagent stays in the background holding the spec and plan; every 45 minutes it wakes itself, gathers working-tree facts, judges the six questions (drift, circling, context decay, subagent health, stale documents, implementation more complex than the essence) and sends a message of at most ten lines; the main agent acts on it at the next pause; subagent health is checked every 30 minutes | recall, show-me-your-work |
| 11 | [slice-closeout](./skills/slice-closeout/SKILL.md) | Six closeout steps per slice: type check and lint, check against spec and invariants, structure metrics and differential mutation on key positions only, remove AI slop, prove it works; one full pass over the whole run's changes after the last slice; deterministic acceptance, no adversarial review. Ships `metrics.mjs` (cyclomatic, cognitive complexity and CRAP of changed functions) and `mutation.mjs` (hotspot differential mutation with a time budget and guaranteed restore), a language-independent model plus a TypeScript adapter | code-review, deslop, unslop, principle-prove-it-works, typescript-best-practices, ub-mode |
| 12 | [progress-artifacts](./skills/progress-artifacts/SKILL.md) | Keep the human at the top with disposable artifacts: architecture diagrams, UML, quick demos, stored under the OS temp directory; ships a directory script, `build-report.mjs` for a single-file HTML report, a demo skeleton and `demo-append.mjs` | ketchup, prototype |
| 13 | [cleanup](./skills/cleanup/SKILL.md) | After each slice, remove intermediate products the next slice does not need; after the run, clean everything; one judgment only, keep or delete, no packing; ships a cleanup script and a delivery statement | none |

Implementation itself follows TDD, without over-design or over-optimization, carried by `pstack:poteto-mode` and `mattpocock-skills:tdd`. This repository does not rewrite them. The References column lists the external skills each `SKILL.md` currently declares; the full mapping of primary and secondary references is in [design/skill-mapping.md](./design/skill-mapping.md).

### Thinking models, cross-cutting

The flow axis answers "which step are we at, and what does it produce": the 13 stages above. The thinking axis answers "how do we think while doing this step": the six thinking models below. The two axes are independent. Any step can need any model, so the models are not stages. Each is a skill that can be loaded on its own at any time, also outside this flow. Type `/think-` to see all six.

| Order | Skill | Question it answers | The three actions, in short |
| --- | --- | --- | --- |
| Split | [think-orthogonal](./skills/think-orthogonal/SKILL.md) | How do we split this problem space? | Find the quantities that vary independently, each with one owner; cross them into a table and check every cell; design a structure that repeats at larger and smaller scales only once |
| Find the gap | [think-ought-vs-is](./skills/think-ought-vs-is/SKILL.md) | What is the real work here? | What it should be, what it is now, and the gap between them; the gap is all the work |
| Shape | [think-model-first](./skills/think-model-first/SKILL.md) | What shape should the code take? | Write states and operations as partial functions and make them total; translate them into a domain model and an object model, then write code |
| Build | [think-right-then-well](./skills/think-right-then-well/SKILL.md) | In which order do we build, and what counts as good? | Make it right: pass every acceptance criterion. Then one round to make it well: no new capability, only a better implementation, judged by structure metrics, differential mutation and a taste checklist |
| Prove | [think-evidence](./skills/think-evidence/SKILL.md) | How do we know it is true? | Every conclusion carries evidence or a label; the evidence must actually test what it claims to test; proofs establish truth, tests find defects |
| Hand over | [think-closed-loop](./skills/think-closed-loop/SKILL.md) | Who should do this, how big is one piece, and how often do we look? | Every handover loses information, so work that needs much context you cannot write down stays with you; a tight loop is a stable loop; the size of a piece is what the receiver can verify |

The first five are the natural order of work on one thing. The sixth, the closed loop, is about how the work changes hands: from the human to the main agent, from the main agent to a subagent, and from yourself before context compaction to yourself after it.

The two axes cross into the context map below. "Own" means the stage's output is itself the result of this model. "Slot" means the template has a fixed slot for it, so filling the template does the thinking. "Line" means a fixed pointer line, identical everywhere, sits at the step that needs the model. A blank cell is blank on purpose. The last row is the line in the plan's progress overview that lists the six skill names; after context compaction the agent reloads them from it. The single source is [design/context-map.json](./design/context-map.json); `check-repo` checks that every cell exists in the repository and that the Chinese README holds the same table.

| Stage | `think-orthogonal` | `think-ought-vs-is` | `think-model-first` | `think-right-then-well` | `think-evidence` | `think-closed-loop` |
| --- | --- | --- | --- | --- | --- | --- |
| 1 Requirements and invariants | Line | Own |  |  |  |  |
| 2 Domain impact | Own | Line |  |  |  |  |
| 3 Research and reuse |  | Own |  |  |  |  |
| 4 Formal guard | Line |  | Own |  | Own |  |
| 5 Detailed design | Line | Slot | Own |  | Line | Line |
| 6 Formal docs |  |  |  |  |  | Line |
| Handoff phase |  | Line |  |  | Own | Line |
| 7 Plan | Slot |  |  |  |  |  |
| 8 Slice kickoff pack | Line | Slot | Slot | Slot |  | Line |
| 9 Delegation |  | Slot |  |  | Own | Own |
| 10 Sentinel review |  | Line |  | Line | Own | Own |
| 11 Slice closeout |  | Line |  | Own | Own |  |
| 12 Reporting |  | Own |  |  |  | Line |
| 13 Cleanup |  |  |  |  |  |  |
| Work that does not qualify |  | Line |  | Line | Line |  |
| After compaction | Slot | Slot | Slot | Slot | Slot | Slot |

When you connect your own project, copy the [resident card](./skills/single-session-dev-flow/resident-card.md) verbatim into the project's always-loaded entry file, for example the root AGENTS.md: one sentence for each thinking model and one for the candid friend, each ending with the skill name. Sessions that do not run this flow then see them too. Re-sync that block after each upgrade; the project does not write a second copy by hand. The wording is in `teach-pqw-skills`, under connecting your own project.

### Candid friend, cross-cutting on the flow axis

- **[candid-friend](./skills/candid-friend/SKILL.md)**: the candid friend speaks once, then does what you decide. The other skills guard against the agent's failures; this one guards against the human's: a requirement that is unclear or has no evidence of use, a run larger than what the human can accept in one acceptance window, gaps in the handoff before the human leaves, a new run passed before the last one was accepted. The agent says it once in four fixed lines: reminder, evidence, recommendation, your options. Once the human decides, the agent does exactly that, with no discount and no conditions. All four moments are in the design session: when a requirement arrives it asks whether it is worth doing; when sizing the run it checks the size and proposes a split; before the pass it runs the bedtime handoff; when taking a run back it asks for verification before the next pass. During delivery it starts no conversation and does only two things without asking: it cuts the run short when the estimated finish slips past the acceptance window, and it lists what awaits human acceptance at the end. It is not a thinking model and is not in the matrix above; where it appears is registered under `crosscut` in `design/context-map.json`, and `check-repo` checks every place the same way. The questions asked when a requirement arrives combine gstack (github.com/garrytan/gstack: office-hours, plan-ceo-review, ETHOS) and Matt's grilling, triage, to-questionnaire, prototype and wayfinder; gstack is a source of ideas only and is not loaded. References grilling, to-questionnaire (read from the installed path) and prototype.

</details>

## External dependencies

| Skills | Source | Version | Local name |
| --- | --- | --- | --- |
| poteto-mode, deslop, unslop, create-formal-verification-skill, statechart, maintain-formal-verification-skill, architect, sharpen, recall, show-me-your-work, ketchup, in-your-own-words, blast-radius, swarm, technical-writing, typescript-best-practices and the principle series | Claude Code and Codex: [michael-denyer/pstack-claude](https://github.com/michael-denyer/pstack-claude/tree/df9bc05b818e2457ac23d3343e96e4ff284dd9e9/plugins/pstack); Cursor: the official pstack in [cursor/plugins](https://github.com/cursor/plugins/tree/1b6d44ff26d4e242f4e8f68c391e6d2f7ca16def) | port 0.9.132; Cursor 0.15.20 | `pstack:<name>` |
| ub-mode | [unclebob/ub-mode](https://github.com/unclebob/ub-mode/tree/3da62bf3f), a single `SKILL.md` placed in the host's user skills directory | commit 3da62bf | `ub-mode` |
| to-spec, to-tickets, to-questionnaire, research, domain-modeling, codebase-design, code-review, tdd, prototype, diagnosing-bugs, grilling, writing-for-agents | [mattpocock/skills](https://github.com/mattpocock/skills/tree/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills) | 1.3.2, commit 4ae2317 | `mattpocock-skills:<name>` |

A stage that references an external skill writes only this repository's additions and points to the external skill with "load skill `<skill>`", and the host decides how to load it. The exception is Matt's `to-spec`, `to-tickets` and `to-questionnaire`: they declare `disable-model-invocation: true`, so the host does not let the model load them automatically. The skills here read their text directly from the installed path and say so in the report. The versions in the table are the ones this repository's text was checked against. When upgrading, re-check whether a referenced skill was renamed or changed behavior.

The skill text and scripts install no npm packages themselves. Only the `slice-closeout` differential mutation has dependencies (`@stryker-mutator/core` and `@stryker-mutator/vitest-runner`, pinned in `skills/slice-closeout/scripts/package.json`): it supports vitest projects only, first takes Stryker from the project's own `node_modules`, otherwise run `npm ci --prefix <that scripts directory>` to install it into the skill directory. When that is not met the tool exits and says why. Structure metrics have no dependencies.

For maintaining this repository, use Claude Code's `skill-creator` plugin (`claude-plugins-official`) to audit skills and `/skill-doctor` to measure usage. Both are host tools, not skills this repository references.

## Install

Two routes. The plugin route is a read-only managed package with automatic updates. The skills.sh route copies editable files into your project and updates by hand. Pick one route per host; installing both makes every skill appear twice. Hosts that can auto-update should prefer the plugin route.

The repository ships its own marketplace (`.claude-plugin/marketplace.json`), named `pqw`, with the plugin `pqw-skills`. The version in `.claude-plugin/plugin.json` triggers a reinstall on the managed route only when it changes.

| Host | Route | Auto-update |
| --- | --- | --- |
| Claude Code | `@pqw` marketplace | yes, by default |
| Codex | `@pqw` marketplace | yes, at startup |
| GitHub Copilot CLI | `@pqw` marketplace | yes, after enabling `autoUpdate` once |
| VS Code | Chat: Install Plugin From Source | yes, daily |
| Kimi Code | `/plugins install`, managed copy | no, rerun the command |
| DeepSeek Harness (DSH) | copy into its skill directory | no, pull and copy again |
| Gemini CLI | `gemini skills install`, copies files | no, rerun the command |
| Cursor and others | skills.sh, copies files | no, `npx skills update` |

### Claude Code

```bash
claude plugin marketplace add PanQiWei/pqw-skills
claude plugin install pqw-skills@pqw
```

### Codex

Codex reads the marketplace manifest in this repository. The display data for the plugin is in the root `plugin.json`.

```bash
codex plugin marketplace add PanQiWei/pqw-skills
codex plugin add pqw-skills@pqw
```

### GitHub Copilot, CLI and VS Code

```bash
copilot plugin marketplace add PanQiWei/pqw-skills
copilot plugin install pqw-skills@pqw
```

Then add this once to `~/.copilot/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "pqw": { "source": { "source": "github", "repo": "PanQiWei/pqw-skills" }, "autoUpdate": true }
  }
}
```

In VS Code run **Chat: Install Plugin From Source** and enter `https://github.com/PanQiWei/pqw-skills`.

### Kimi Code

The repository root has a Kimi Code plugin manifest, `kimi.plugin.json`. In a Kimi Code session, type:

```text
/plugins install https://github.com/PanQiWei/pqw-skills
```

Kimi Code asks once whether you trust this third-party plugin. Then it fetches the latest release and keeps a managed copy. Run `/new` or `/reload` to apply it. The skills appear as `/skill:pqw-skills:<name>`. To pin a version, use a release page as the address, for example `https://github.com/PanQiWei/pqw-skills/releases/tag/v0.22.2`. To update, run the same command again.

### DeepSeek Harness (DSH)

DSH has no command that installs skills. It discovers skills in fixed directories: `.dsh/skills` and `.agents/skills` in the project, `~/.dsh/skills` and `~/.agents/skills` for the user. Each skill is a direct subdirectory there. To install for the user:

```bash
git clone https://github.com/PanQiWei/pqw-skills ~/.pqw-skills
mkdir -p ~/.dsh/skills && cp -R ~/.pqw-skills/skills/. ~/.dsh/skills/
```

To update, run `git pull` in `~/.pqw-skills`, then run the second line again. To install into one project only, copy to `.agents/skills` in the project root. Only profiles with the skill capability load them (terminal UI, web, headless, acp, sdk). `sdk-minimal` does not load skills.

### Gemini CLI

Gemini does not read `.claude-plugin`; `--path` points at a directory. The repository is flat, so one command installs the whole set.

```bash
gemini skills install https://github.com/PanQiWei/pqw-skills.git --path skills
```

Rerun to update.

### Cursor, OpenCode, Windsurf, Amp and others

Use skills.sh. `-a` preselects the host; omit it to choose interactively.

```bash
npx skills@latest add PanQiWei/pqw-skills -a cursor   # cursor, opencode, devin, windsurf, amp, pi
```

Update with `npx skills@latest update`. It does not pick up newly added skills, so rerun `add` when the set grows.

Install a single skill:

```bash
npx skills@latest add PanQiWei/pqw-skills --skill=<name>
```

### Local development

Symlink the skills into the local host directories; a pull takes effect immediately:

```bash
bash scripts/link-skills.sh
```

### External dependencies

The plugin does not bundle pstack, ub-mode or mattpocock/skills. Install them by their own instructions.

## Writing skills

They belong to no single stage. Every stage that writes documents uses them.

- **[clear-writing](./skills/clear-writing/SKILL.md)**: clear writing. English follows ASD-STE100; Chinese follows the clarity rules that do not depend on English grammar. Meaning, modality and required structure are kept. The body comes from the upstream asd-ste100-skill 0.4.0 (MIT). A project with its own documentation rules names them at the access point; otherwise the bundled default rules apply.
- **[write-agents-md](./skills/write-agents-md/SKILL.md)**: writing and governing AGENTS.md: create, revise, compress, review or migrate one, design inherited prompt scopes, decide where content belongs, and reconcile overlaps and conflicts between parent and child files.

## Repository layout

See [STRUCTURE.md](./STRUCTURE.md). Maintenance rules are in [AGENTS.md](./AGENTS.md), local development and release steps in [DEVELOPMENT.md](./DEVELOPMENT.md), and how to take part in [CONTRIBUTING.md](./CONTRIBUTING.md). Those three files are in Chinese; the short version for English readers is below.

## Contributing, in short

- Change a skill only for a failure observed in a real session: the agent drifted, skipped or looped. Say what failed and how the change prevents it.
- One change at a time. Run the same job with and without the change and keep the better one.
- Keep the entry skill thin. A rule that belongs to a stage goes into that stage's skill.
- Acceptance is deterministic: tests, formal proofs, checks against the written spec. No adversarial review.
- Before opening a pull request, run `node scripts/check-repo.mjs` and `claude plugin validate .`, and add a line to `CHANGELOG.md` when a skill's behavior changes.
- Security issues: see [SECURITY.md](./SECURITY.md). Conduct: see [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).

## License

[MIT](./LICENSE)
