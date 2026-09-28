# Tech Stack

Approved languages, frameworks, runtimes and infrastructure. Replace the samples with your enterprise stack.

## Approved stack
- Backend: Java 17+/Spring Boot 3, Node.js 20 LTS/TypeScript, Python 3.11+
- Frontend: React 18 + TypeScript
- Data: PostgreSQL, Redis; ORM: JPA/Hibernate, Prisma, SQLAlchemy
- Messaging: Kafka
- Infra: Docker, Kubernetes (Helm), Terraform
- CI/CD: GitHub Actions
- Observability: OpenTelemetry, structured JSON logs

## Rules
- [TS-01] New code uses only languages, frameworks and runtimes listed in the approved stack.
- [TS-02] New infrastructure (databases, queues, cloud services) is on the approved list or has an architecture-review reference in the PR/Jira.
- [TS-03] Frontend code is TypeScript; no new plain JavaScript source files.
- [TS-04] Container images use the approved base images and do not run as root.
