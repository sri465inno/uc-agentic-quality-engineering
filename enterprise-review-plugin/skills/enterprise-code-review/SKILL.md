---
name: enterprise-code-review
description: Review a pull request against the functional and non-functional requirements in its linked Jira ticket and against the enterprise standards bundled with this skill. Use when asked to review a PR against requirements, standards, approved libraries or tech stack.
argument-hint: "<PR URL> [JIRA-KEY]"
---

# Enterprise Code Review

Review one pull request against (a) the requirements in its linked Jira ticket and (b) every enterprise standard in the `standards/` folder next to this file. Post the result on the PR.

## Inputs
- PR URL (required).
- Jira issue key (optional). If missing, extract it from the PR title, head branch name, then PR body using the regex `[A-Z][A-Z0-9]+-\d+`. Use the first match.

## Procedure
1. Read every `*.md` file in the `standards/` directory of this skill (the skill's base directory is reported when it is invoked). Each file is one enterprise standard; treat every bullet under a `## Rules` heading as a checkable rule with the ID given in brackets (e.g. `[CS-03]`).
2. Fetch the PR metadata and full diff with the git PR tools. Note changed files, languages, and any dependency manifest changes (`package.json`, `pom.xml`, `build.gradle`, `requirements*.txt`, `pyproject.toml`, `go.mod`, `*.csproj`, Dockerfiles, IaC).
3. Resolve the Jira key (see Inputs). If none is found, post a PR comment asking for one and stop.
4. Fetch the Jira issue through the Atlassian MCP: summary, description, acceptance criteria (description section or custom field), labels, components, and linked issues/sub-tasks. Also fetch linked Confluence pages if the ticket references them.
5. Build the requirement list:
   - Functional requirements (FR-n): one per acceptance criterion or explicit behaviour in the ticket.
   - Non-functional requirements (NFR-n): explicit NFRs from the ticket (performance, security, availability, accessibility, compliance, logging, etc.).
   Quote the ticket text for each; do not invent requirements.
6. Check out the PR head branch and read the changed code in context (callers, tests, config). Run the repo's existing lint/test commands if they are cheap and documented; note results, do not fix code.
7. Evaluate each FR/NFR: `Met`, `Partially met`, `Not met`, or `Not verifiable from code`, citing `file:line` evidence and the tests that cover it.
8. Evaluate each standards rule that applies to the changed code: `Pass` or `Violation`, citing `file:line`. Dependency additions must be checked against `approved-libraries.md`; languages/frameworks/infra against `tech-stack.md`.
9. Post inline PR review comments for each `Not met`, `Partially met`, or `Violation` finding on the relevant line, prefixed with the requirement/rule ID and a severity (`Blocker`, `Major`, `Minor`).
10. Post one summary PR comment using the report template below. Use a "Request changes" verdict if any Blocker exists or any FR is `Not met`; otherwise "Approve with comments" or "Approve".

## Report template
```
## Enterprise Code Review — <JIRA-KEY>: <ticket summary>
**Verdict:** <Approve | Approve with comments | Request changes>

### Requirements traceability
| ID | Requirement (from Jira) | Status | Evidence |
|----|-------------------------|--------|----------|

### Standards compliance
| Rule | Standard | Status | Evidence |
|------|----------|--------|----------|
(list only rules that apply to this diff)

### Findings
- [Blocker|Major|Minor] <ID> <file:line> — <issue> → <suggested fix>

### Gaps
- Requirements with no implementation or no tests; standards that could not be verified.
```

## Rules
- Only report issues grounded in the diff, the ticket, or a standards rule. No generic advice.
- Never push commits, approve via GitHub review state, or merge. Comments only.
- Keep the summary comment under ~300 lines; collapse long tables with `<details>`.
