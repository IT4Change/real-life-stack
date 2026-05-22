# AGENTS.md

This repository is agent-readable, but it does not require a specific agent runtime.

Read this file first, then read [docs/agent-workspace.md](./docs/agent-workspace.md) for detailed project context.

## Repository Purpose

Real Life Stack is a modular app and UI toolkit for local communities, commons, and decentralized collaboration.

The core architecture is:

```text
App Shell / Space Modules -> hooks -> DataInterface -> connector -> data source
```

The DataInterface and connector boundaries are the most important contracts in this repository.

## Source of Truth

- Spec index: [docs/spec/README.md](./docs/spec/README.md)
- Architecture: [docs/spec/00-architecture.md](./docs/spec/00-architecture.md)
- App composition: [docs/spec/01-app-composition.md](./docs/spec/01-app-composition.md)
- DataInterface core: [docs/spec/02-data-interface.md](./docs/spec/02-data-interface.md)
- Connector capabilities: [docs/spec/03-capabilities.md](./docs/spec/03-capabilities.md)
- Items, relations and groups/spaces: [docs/spec/04-items-relations-groups-spaces.md](./docs/spec/04-items-relations-groups-spaces.md)
- Confirmations and trust: [docs/spec/05-confirmations-and-trust.md](./docs/spec/05-confirmations-and-trust.md)
- Historical architecture reference, not directly normative: [docs/spec/architektur2.md](./docs/spec/architektur2.md)
- Reactivity and relations: [docs/spec/reaktivitaet.md](./docs/spec/reaktivitaet.md)
- Module brainstorm, inspiration only until refreshed: [docs/modules/](./docs/modules/)
- Concept docs: [docs/concepts/](./docs/concepts/)
- Historical archive: [docs/archive/](./docs/archive/)
- AI workflow: [docs/ki-workflow.md](./docs/ki-workflow.md)

When code and docs disagree, do not silently invent a new rule. Prefer a small fix, a clear PR note, or an issue.

## Contribution Levels

Contributors do not need to use the `wot-agent-runner`.

| Level | Meaning |
|---|---|
| L0 Human contribution | Normal PRs by people. Follow README, docs, tests, and review. |
| L1 Agent-readable contribution | Agent or human follows `AGENTS.md` and `docs/agent-workspace.md`. |
| L2 RLAP-compatible contribution | Task or PR states scope, checks, human gates, and unresolved questions. |
| L3 Runner-conformant contribution | `wot-agent-runner` creates task, run state, handoff, conformance report, and PR summary. |

The runner is optional. Clear scope, working checks, and human review are not optional.

## Rules For Agents

- Keep changes small and reviewable.
- Respect package boundaries. Connectors must not import from other connectors.
- Keep hooks thin. Business logic belongs in connectors, shared helpers, or explicit modules.
- Put shared data helpers in `packages/data-interface`.
- Put reusable UI in `packages/toolkit`, not directly into apps.
- Use type-only imports where appropriate.
- Do not touch generated output such as Storybook static builds unless the task explicitly asks for it.
- Do not write secrets, tokens, or private credentials into docs, prompts, tests, logs, or code.
- Do not auto-merge or make release decisions.

## Expected Checks

Run the smallest relevant checks for the touched area. Typical commands are:

```bash
pnpm build
pnpm test
pnpm build:toolkit
git diff --check
```

If a check cannot be run, say why in the PR or handoff.

## Agent Handoff

Every agent-assisted change should make the following visible:

- what changed,
- why it changed,
- which files were touched,
- which checks ran,
- what remains uncertain,
- what needs human decision.

If the work uses RLAP or `wot-agent-runner`, include the task, run ID, PR summary, checks, and human gates.

## Related Agent Infrastructure

- RLAP: <https://github.com/real-life-org/real-life-agent-protocol>
- WoT Agent Runner: <https://github.com/real-life-org/wot-agent-runner>
- WoT Spec: <https://github.com/real-life-org/wot-spec>
- Real Life Network Protocol: <https://github.com/real-life-org/real-life-network-protocol>

These systems support agentic work, but they do not replace normal contributor judgment or maintainer review.
