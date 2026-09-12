/**
 * Demo dataset for the no-signup live demo. Every person, company, and
 * email is fictional; resumes are deliberately varied in seniority and
 * fit so the ranking is meaningful. No real PII anywhere.
 */
import type { Rubric } from "@hirelens/core";

export const DEMO_JD = `Senior Backend Engineer — Meridian Pay

We are looking for a Senior Backend Engineer to own the core payments
platform at Meridian Pay. You will design and operate services that
handle tens of thousands of requests per second, with zero tolerance
for data loss.

Responsibilities
- Design and build event-driven services in TypeScript/Node.js or Go
- Own distributed systems decisions: queues, retries, idempotency,
  exactly-once processing
- Operate PostgreSQL at scale: schema design, migrations, query tuning
- Drive reliability: observability, runbooks, chaos testing, SLOs
- Mentor mid-level engineers and review architecture proposals

Required
- 5+ years backend engineering, 2+ in payments or fintech
- Deep experience with PostgreSQL and at least one queue system
- Strong grasp of distributed-systems fundamentals: consistency,
  partitioning, failure modes
- Production incident response experience

Nice to have
- Kubernetes and infrastructure as code (Terraform)
- Experience with fraud or risk systems
- Open-source contributions`;

export interface DemoResume {
  id: string;
  name: string;
  role: string;
  text: string;
}

export const DEMO_RESUMES: DemoResume[] = [
  {
    id: "jordan-avery",
    name: "Jordan Avery",
    role: "Senior Backend Engineer",
    text: `Jordan Avery
Senior Backend Engineer — San Francisco, CA — jordan.avery@example.com

EXPERIENCE

Senior Backend Engineer — Acme Corp — 2021–present
- Led migration of the payments platform to Kubernetes, cutting deploy time 80%.
- Built event-driven services in TypeScript on Node.js handling 40k req/s.
- Designed idempotent webhook delivery with a Postgres-backed outbox table.
- Introduced SLO dashboards and on-call runbooks; MTTR down 45%.

Backend Engineer — Northwind Systems — 2018–2021
- Owned PostgreSQL schema for a 200M-row ledger; cut slow queries 60%.
- Built retry queues with exponential backoff for third-party integrations.
- Participated in weekly incident reviews and postmortems.

SKILLS
TypeScript, Node.js, Go, PostgreSQL, Redis, Kafka, Kubernetes, Terraform, AWS

EDUCATION
B.S. Computer Science, State University (2014–2018)`,
  },
  {
    id: "priya-sharma",
    name: "Priya Sharma",
    role: "Backend Engineer",
    text: `Priya Sharma
Backend Engineer — Austin, TX — priya.sharma@example.com

EXPERIENCE

Backend Engineer — Brightloop — 2020–present
- Built REST and event-driven services in Go and TypeScript.
- Designed a message queue layer with retries and dead-letter queues.
- Wrote database migrations for a customer-facing PostgreSQL service.
- Improved p95 latency of the checkout API by 35% through query tuning.

Software Engineer — TinyApps — 2018–2020
- Full-stack web development; introduced automated testing to the team.
- Learned distributed systems fundamentals through internal courses.

SKILLS
Go, TypeScript, PostgreSQL, RabbitMQ, Docker, AWS, Terraform (learning)

EDUCATION
B.S. Software Engineering, University of Texas (2014–2018)`,
  },
  {
    id: "marcus-lee",
    name: "Marcus Lee",
    role: "Staff Engineer",
    text: `Marcus Lee
Staff Engineer — Seattle, WA — marcus.lee@example.com

EXPERIENCE

Staff Engineer — Cascade Data — 2019–present
- Architected a multi-region event pipeline processing 1M events/sec.
- Led the design of a consistency model for cross-region ledger replication.
- Owned incident response process; wrote the company's chaos-testing playbook.
- Mentored 8 engineers; authored the internal distributed-systems course.

Senior Engineer — Gridline — 2015–2019
- Ran a PostgreSQL fleet of 40 nodes; designed sharding for a payments ledger.
- Built fraud-detection rules engine processing 10k decisions/sec.

SKILLS
Go, Rust, PostgreSQL, Kafka, Kubernetes, Terraform, distributed systems

EDUCATION
M.S. Computer Science, Carnegie Mellon (2013–2015)`,
  },
  {
    id: "sophia-nguyen",
    name: "Sophia Nguyen",
    role: "Backend Engineer (Fintech)",
    text: `Sophia Nguyen
Backend Engineer — New York, NY — sophia.nguyen@example.com

EXPERIENCE

Backend Engineer — Federal Bank Corp — 2021–present
- Built settlement services in Java/Spring and Node.js handling daily transfers.
- Implemented exactly-once processing with deduplication keys and idempotency.
- Worked with auditors on reconciliation reports for millions of transactions.

Software Engineer — Ledgerly — 2019–2021
- Payments ledger services; PostgreSQL schema design and migrations.
- Built retry and dead-letter infrastructure for external bank integrations.

SKILLS
Java, Node.js, TypeScript, PostgreSQL, RabbitMQ, Kafka, AWS

EDUCATION
B.S. Computer Science, NYU (2015–2019)`,
  },
  {
    id: "david-okafor",
    name: "David Okafor",
    role: "Platform Engineer",
    text: `David Okafor
Platform Engineer — Chicago, IL — david.okafor@example.com

EXPERIENCE

Platform Engineer — CloudNine — 2020–present
- Managed Kubernetes clusters for production workloads across 3 regions.
- Wrote Terraform modules adopted by 12 teams; standardized IaC.
- Built internal developer platform with self-service deployments.
- Reduced infrastructure spend 30% through right-sizing.

DevOps Engineer — Hostly — 2018–2020
- CI/CD pipelines, monitoring, and on-call for web services.

SKILLS
Kubernetes, Terraform, AWS, Docker, Linux, Go, Prometheus

EDUCATION
B.S. Information Systems, DePaul University (2014–2018)`,
  },
  {
    id: "emily-chen",
    name: "Emily Chen",
    role: "Data Engineer",
    text: `Emily Chen
Data Engineer — Boston, MA — emily.chen@example.com

EXPERIENCE

Data Engineer — Insight Analytics — 2021–present
- Built streaming pipelines in Python and Spark ingesting 5TB/day.
- Designed star schemas in PostgreSQL and Redshift for analytics teams.
- Implemented data quality checks and backfill automation.

Data Analyst — RetailNow — 2019–2021
- SQL reporting and dashboards; moved to engineering after 9 months.

SKILLS
Python, Spark, PostgreSQL, Kafka, Airflow, AWS Redshift

EDUCATION
B.S. Statistics, Boston University (2015–2019)`,
  },
  {
    id: "liam-murphy",
    name: "Liam Murphy",
    role: "Frontend Engineer",
    text: `Liam Murphy
Frontend Engineer — Denver, CO — liam.murphy@example.com

EXPERIENCE

Frontend Engineer — Pixelworks — 2021–present
- Built React/TypeScript product surfaces used by 2M monthly users.
- Owned design-system components and performance budgets.
- Led migration from class components to hooks; reduced bundle 40%.

Web Developer — StudioBlue — 2019–2021
- Marketing sites and interactive campaigns.

SKILLS
React, TypeScript, Next.js, CSS, Node.js (basic), PostgreSQL (basic)

EDUCATION
B.A. Graphic Design, University of Colorado (2015–2019)`,
  },
  {
    id: "olivia-brown",
    name: "Olivia Brown",
    role: "Site Reliability Engineer",
    text: `Olivia Brown
Site Reliability Engineer — London, UK — olivia.brown@example.com

EXPERIENCE

SRE — FintechScale — 2020–present
- Owned reliability for a payments API serving 200M requests/day.
- Wrote SLOs and error budgets; drove MTTR down 60%.
- Built chaos experiments on Kafka and PostgreSQL failover paths.
- On-call rotation lead; authored postmortem culture.

Systems Engineer — Hostaro — 2018–2020
- Linux systems administration and monitoring for e-commerce clients.

SKILLS
Kubernetes, Terraform, Prometheus, Grafana, PostgreSQL, Kafka, Go

EDUCATION
B.S. Computer Science, Imperial College London (2014–2018)`,
  },
  {
    id: "noah-williams",
    name: "Noah Williams",
    role: "Backend Engineer (Junior)",
    text: `Noah Williams
Backend Engineer — Atlanta, GA — noah.williams@example.com

EXPERIENCE

Backend Developer — StartupHub — 2023–present
- Built REST APIs in Node.js/TypeScript for internal tools.
- Wrote PostgreSQL queries and simple migrations.
- Implemented background jobs with a task queue.

Intern — CodeCamp — Summer 2022
- Full-stack intern; shipped a customer dashboard feature.

SKILLS
TypeScript, Node.js, PostgreSQL, Docker (basics), Git

EDUCATION
B.S. Computer Science, Georgia Tech (2019–2023)`,
  },
  {
    id: "amelia-carter",
    name: "Amelia Carter",
    role: "Backend Engineer (Mid)",
    text: `Amelia Carter
Backend Engineer — Toronto, ON — amelia.carter@example.com

EXPERIENCE

Backend Engineer — LoopPay — 2020–present
- Payments reconciliation services in Node.js and TypeScript.
- Introduced idempotency keys and retry semantics across 6 services.
- PostgreSQL query tuning; reduced deadlocks with better transaction design.
- Wrote integration test suites covering failure modes.

Software Developer — CloudDesk — 2018–2020
- SaaS backend; REST APIs and database design.

SKILLS
TypeScript, Node.js, PostgreSQL, Redis, RabbitMQ, AWS

EDUCATION
B.S. Computer Science, University of Toronto (2014–2018)`,
  },
  {
    id: "ethan-patel",
    name: "Ethan Patel",
    role: "Backend Engineer",
    text: `Ethan Patel
Backend Engineer — San Jose, CA — ethan.patel@example.com

EXPERIENCE

Software Engineer — QuickServe — 2022–present
- Built order-processing services in Go and TypeScript.
- Designed a queue-based retry system for payment notifications.
- Worked with PostgreSQL for transactional order data.

Software Engineer — DevShop — 2021–2022
- Web app development; some database work.

SKILLS
Go, TypeScript, PostgreSQL, Redis, Docker, AWS

EDUCATION
B.S. Computer Engineering, San Jose State (2017–2021)`,
  },
  {
    id: "isabella-rossi",
    name: "Isabella Rossi",
    role: "Marketing Manager",
    text: `Isabella Rossi
Marketing Manager — Miami, FL — isabella.rossi@example.com

EXPERIENCE

Marketing Manager — BrightBrand — 2021–present
- Led go-to-market campaigns for SaaS products; grew pipeline 40%.
- Managed a team of four and a $2M annual budget.
- Ran paid acquisition and content strategy.

Marketing Specialist — AdVenture — 2019–2021
- Social media and email campaigns.

SKILLS
Campaign strategy, SEO, paid ads, analytics dashboards, Excel

EDUCATION
B.A. Marketing, University of Miami (2015–2019)`,
  },
];

export const DEMO_RUBRIC: Rubric = {
  version: 1,
  key: "senior-backend-engineer-demo",
  title: "Senior Backend Engineer (demo)",
  exclusions: ["school name", "university", "graduation year", "photo", "name"],
  criteria: [
    {
      key: "event-driven-systems",
      title: "Event-driven & queue architecture",
      weight: 1,
      scale: [
        { label: "No evidence", description: "No mention of queues or event-driven design." },
        { label: "Minimal", description: "Mentions queues or events in passing." },
        { label: "Basic", description: "Built a queue consumer or producer once." },
        { label: "Solid", description: "Designed queues with retries, DLQs, or ordering." },
        {
          label: "Strong",
          description: "Led an event-driven migration or multi-service pipeline.",
        },
        {
          label: "Exceptional",
          description: "Architected exactly-once semantics or large-scale event pipelines.",
        },
      ],
      doNotUse: ["years of experience", "school"],
    },
    {
      key: "postgres-at-scale",
      title: "PostgreSQL at scale",
      weight: 1,
      scale: [
        { label: "No evidence", description: "No database work mentioned." },
        { label: "Minimal", description: "Used PostgreSQL for CRUD." },
        { label: "Basic", description: "Wrote migrations or schema designs." },
        { label: "Solid", description: "Tuned queries or designed schemas for large tables." },
        {
          label: "Strong",
          description: "Operated production PostgreSQL; solved scaling problems.",
        },
        {
          label: "Exceptional",
          description: "Led sharding, replication, or multi-node fleet design.",
        },
      ],
      doNotUse: ["years of experience", "school"],
    },
    {
      key: "distributed-systems",
      title: "Distributed systems fundamentals",
      weight: 1,
      scale: [
        { label: "No evidence", description: "No distributed systems exposure." },
        { label: "Minimal", description: "Used a distributed store without design work." },
        {
          label: "Basic",
          description: "Handled retries, timeouts, or idempotency in one service.",
        },
        {
          label: "Solid",
          description: "Designed for consistency, partitioning, or failure modes.",
        },
        {
          label: "Strong",
          description: "Owned reliability or consistency decisions across services.",
        },
        { label: "Exceptional", description: "Architected multi-region or exactly-once systems." },
      ],
      doNotUse: ["years of experience", "school"],
    },
    {
      key: "reliability-ops",
      title: "Reliability & incident response",
      weight: 1,
      scale: [
        { label: "No evidence", description: "No reliability work mentioned." },
        { label: "Minimal", description: "Participated in on-call." },
        { label: "Basic", description: "Wrote a runbook or postmortem." },
        { label: "Solid", description: "Drove incident response or improved MTTR." },
        { label: "Strong", description: "Owned SLOs, error budgets, or chaos testing." },
        { label: "Exceptional", description: "Built the reliability program for an org." },
      ],
      doNotUse: ["years of experience", "school"],
    },
    {
      key: "fintech-payments",
      title: "Fintech / payments context",
      weight: 0.8,
      scale: [
        { label: "No evidence", description: "No payments or fintech experience." },
        { label: "Minimal", description: "Mentions fintech domain knowledge." },
        { label: "Basic", description: "Built a payment-adjacent integration." },
        { label: "Solid", description: "Worked on payments or settlement services." },
        { label: "Strong", description: "Owned payments infrastructure with audit requirements." },
        { label: "Exceptional", description: "Led fraud, risk, or ledger systems at scale." },
      ],
      doNotUse: ["years of experience", "school"],
    },
    {
      key: "platform-tooling",
      title: "Kubernetes & infrastructure as code",
      weight: 0.6,
      scale: [
        { label: "No evidence", description: "No infra tooling mentioned." },
        { label: "Minimal", description: "Used Docker locally." },
        { label: "Basic", description: "Deployed to Kubernetes with manifests." },
        { label: "Solid", description: "Wrote Terraform or managed cluster workloads." },
        { label: "Strong", description: "Owned Kubernetes infrastructure for production." },
        { label: "Exceptional", description: "Built internal platforms or multi-region clusters." },
      ],
      doNotUse: ["years of experience", "school"],
    },
  ],
};
