# Enterprise Code Review plugin

A Devin plugin that reviews pull requests against:

1. **Functional / non-functional requirements** from the Jira story or epic linked to the PR (via the Atlassian MCP). For an epic, its child stories are included.
2. **Enterprise standards** stored as Markdown in `skills/enterprise-code-review/standards/`.

It also reviews the requirements themselves and reports gaps (missing, ambiguous or untestable acceptance criteria, unhandled scenarios, missing NFRs) as suggestions for the product owner. The PR summary starts with a plain-language section for non-technical stakeholders; developer detail is collapsed below it.

## Layout
```
enterprise-review-plugin/
├── .devin-plugin/plugin.json
├── skills/enterprise-code-review/
│   ├── SKILL.md                  # review procedure + report format
│   └── standards/                # your enterprise "skills" — one file per standard
│       ├── coding-standards.md
│       ├── approved-libraries.md
│       ├── tech-stack.md
│       ├── nfr-checklist.md
│       └── requirements-quality.md  # applied to the Jira story/epic
└── templates/REVIEW.md           # optional: copy into target repos for built-in Devin Review
```

## Adding or updating standards
- Add or edit any `*.md` file in `standards/`. Every file is loaded on each review.
- Put checkable rules under a `## Rules` heading, one bullet per rule, each with a unique ID in brackets, e.g. `- [SEC-07] ...`. The ID is used in the review's traceability tables and inline comments.
- Commit to the default branch; the next review picks it up.
- Alternatively, zip this folder and use Customize → Plugins → Add plugin → **Upload .zip**, or edit the installed plugin in the web editor.

## Install (org admin)
Customize → Plugins → Add plugin → **From repository**: enter `sri465inno/uc-agentic-quality-engineering`, subdirectory `enterprise-review-plugin`, scope **Organization**.

## Prerequisites
- Atlassian MCP connected at the organization scope (Jira read access).
- GitHub integration with access to the repositories being reviewed.

## Running a review
- Manually: start a Devin session with the `!enterprise_review` playbook and a PR URL (optionally a Jira key).
- Automatically: a Devin Automation on `pull_request` opened / ready_for_review, or a PR comment starting with `/review-reqs`.

The Jira key (story or epic) is taken from the PR title, branch name, or body (pattern `ABC-123`), or passed explicitly.
