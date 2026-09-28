---
name: enterprise-code-review
description: Review a pull request against the functional and non-functional requirements in its linked Jira story or epic and against the enterprise standards bundled with this skill. Also identifies gaps in the business requirements and explains required fixes in plain language for non-technical readers. Use when asked to review a PR against requirements, standards, approved libraries or tech stack.
argument-hint: "<PR URL> [JIRA-KEY of story or epic]"
---

# Enterprise Code Review

Review one pull request against (a) the requirements in its linked Jira story or epic and (b) every enterprise standard in the `standards/` folder next to this file. Also review the requirements themselves for gaps. Post the result on the PR, written so both engineers and non-technical stakeholders (product owners, business analysts) can act on it.

## Inputs
- PR URL (required).
- Jira issue key of a story or an epic (optional). If missing, extract it from the PR title, head branch name, then PR body using the regex `[A-Z][A-Z0-9]+-\d+`. Use the first match.

## Procedure
1. Read every `*.md` file in the `standards/` directory of this skill (the skill's base directory is reported when it is invoked). Each file is one enterprise standard; treat every bullet under a `## Rules` heading as a checkable rule with the ID given in brackets (e.g. `[CS-03]`). `requirements-quality.md` applies to the Jira requirements, all other files apply to the code.
2. Fetch the PR metadata and full diff with the git PR tools. Note changed files, languages, and any dependency manifest changes (`package.json`, `pom.xml`, `build.gradle`, `requirements*.txt`, `pyproject.toml`, `go.mod`, `*.csproj`, Dockerfiles, IaC).
3. Resolve the Jira key (see Inputs). If none is found, post a PR comment asking for one and stop.
4. Fetch the Jira issue through the Atlassian MCP: issue type, summary, description, acceptance criteria (description section or custom field), labels, components, and linked issues/sub-tasks. Also fetch linked Confluence pages if the ticket references them.
   - If the issue is an **epic**: also fetch its child stories (JQL `parent = <KEY>` or `"Epic Link" = <KEY>`). Treat the epic's description as scope/context and each child story's acceptance criteria as requirements. Mark stories not touched by this PR as `Out of scope for this PR` rather than `Not met`, unless the PR claims to deliver them.
   - If the issue is a **story/task/bug**: also fetch its parent epic (summary and description only) for context.
5. Build the requirement list:
   - Functional requirements (FR-n): one per acceptance criterion or explicit behaviour in the ticket(s). For epics, prefix with the story key, e.g. `FR-PROJ-12-1`.
   - Non-functional requirements (NFR-n): explicit NFRs from the ticket(s) (performance, security, availability, accessibility, compliance, logging, etc.).
   Quote the ticket text for each; do not invent requirements.
6. Analyse the requirements for gaps (business-requirement review). Apply every rule in `requirements-quality.md` to the ticket(s) and, using the code as a second lens, look for:
   - Behaviour implemented in the code that no requirement asks for (possible scope creep or undocumented requirement).
   - Scenarios the code has to handle but the ticket is silent on (errors, empty/invalid input, permissions, limits, time zones, currencies, concurrency).
   - Missing NFRs that the enterprise NFR checklist expects for this kind of change.
   - Ambiguous, conflicting, or untestable acceptance criteria.
   Record each as a gap `GAP-n` with a suggested question or acceptance criterion the product owner can add to Jira. These are suggestions, not code findings; never count them as `Not met`.
7. Check out the PR head branch and read the changed code in context (callers, tests, config). Run the repo's existing lint/test commands if they are cheap and documented; note results, do not fix code.
8. Evaluate each FR/NFR: `Met`, `Partially met`, `Not met`, `Not verifiable from code`, or (epics only) `Out of scope for this PR`, citing `file:line` evidence and the tests that cover it.
9. Evaluate each code standards rule that applies to the changed code: `Pass` or `Violation`, citing `file:line`. Dependency additions must be checked against `approved-libraries.md`; languages/frameworks/infra against `tech-stack.md`.
10. For every `Not met`, `Partially met`, or `Violation` finding, write the fix twice:
    - **Technical fix**: concrete change for the developer (what to change, where), used in the inline comment.
    - **Plain-language fix**: one or two sentences with no code, jargon, or file paths, describing the business impact and what needs to happen (e.g. "Customers can currently submit a booking with a check-out date before the check-in date. The form must reject this and show an error."). Explain any unavoidable technical term in brackets.
11. Post inline PR review comments for each finding on the relevant line, prefixed with the requirement/rule ID and a severity (`Blocker`, `Major`, `Minor`), containing the technical fix.
12. Post one summary PR comment using the report template below. Use a "Request changes" verdict if any Blocker exists or any in-scope FR is `Not met`; otherwise "Approve with comments" or "Approve". Requirement gaps alone never change the verdict.
13. If the Atlassian MCP allows commenting, optionally add a Jira comment on the story/epic listing the `GAP-n` items so the product owner sees them; only do this if the session instructions ask for it.

## Report template
```
## Enterprise Code Review — <JIRA-KEY>: <ticket summary>
**Verdict:** <Approve | Approve with comments | Request changes>

### Summary for business stakeholders
<3–6 sentences, no jargon: what this change delivers, whether it meets the ticket, the most important problems, and what is needed before release.>

| # | What is wrong (plain language) | Business impact | What needs to happen | Severity |
|---|--------------------------------|-----------------|----------------------|----------|

### Gaps in the business requirements
| ID | Gap | Why it matters | Suggested question / acceptance criterion for Jira |
|----|-----|----------------|----------------------------------------------------|

<details><summary>Technical details for developers</summary>

### Requirements traceability
| ID | Requirement (from Jira) | Status | Evidence |
|----|-------------------------|--------|----------|

### Standards compliance
| Rule | Standard | Status | Evidence |
|------|----------|--------|----------|
(list only rules that apply to this diff)

### Findings and fixes
- [Blocker|Major|Minor] <ID> <file:line> — <issue> → <technical fix>

### Not verified
- Requirements with no tests, or standards that could not be verified from the code.
</details>
```

## Rules
- Only report issues grounded in the diff, the ticket(s), or a standards rule. No generic advice.
- The stakeholder summary and plain-language table must be understandable without reading code: no file paths, function names, stack traces, or unexplained acronyms.
- Requirement gaps are suggestions to the product owner; phrase them as questions or proposed acceptance criteria, not as developer defects.
- Never push commits, approve via GitHub review state, or merge. Comments only.
- Keep the summary comment under ~300 lines; developer detail stays inside the collapsed `<details>` block.
