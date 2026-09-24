/**
 * Skill-graph adjacency (v1.2) — the deterministic layer.
 *
 * A curated taxonomy of ~260 skills mapped to canonical families
 * (language, framework, data, cloud, ml, mobile, devops, design,
 * product, security, marketing, finance). Adjacency = family overlap:
 * skills sharing a family are neighbors, ordered by how many families
 * they share. Zero LLM calls — this runs offline, in tests, and in the
 * CLI the same way it runs in the product.
 */

export interface SkillNode {
  readonly skill: string;
  readonly families: readonly string[];
}

/** Category labels for family-grouped skills (case-insensitive match keys). */
const F = {
  lang: "language",
  framework: "framework",
  data: "data",
  cloud: "cloud",
  ml: "ml",
  mobile: "mobile",
  devops: "devops",
  design: "design",
  product: "product",
  security: "security",
  marketing: "marketing",
  finance: "finance",
} as const;

/** Flattened [skill, families[]] pairs; normalized to a key at load. */
const RAW: ReadonlyArray<readonly [string, readonly string[]]> = [
  // Languages
  ["TypeScript", [F.lang]],
  ["JavaScript", [F.lang]],
  ["Python", [F.lang]],
  ["Java", [F.lang]],
  ["Go", [F.lang]],
  ["Rust", [F.lang]],
  ["Ruby", [F.lang]],
  ["PHP", [F.lang]],
  ["C#", [F.lang]],
  ["C++", [F.lang]],
  ["C", [F.lang]],
  ["Swift", [F.lang, F.mobile]],
  ["Kotlin", [F.lang, F.mobile]],
  ["Scala", [F.lang, F.data]],
  ["R", [F.lang, F.data]],
  ["SQL", [F.lang, F.data]],
  ["Bash", [F.lang, F.devops]],
  ["PowerShell", [F.lang, F.devops]],
  ["Elixir", [F.lang]],
  ["Haskell", [F.lang]],
  ["Lua", [F.lang]],
  ["Dart", [F.lang, F.mobile]],
  ["Objective-C", [F.lang, F.mobile]],
  ["HTML", [F.lang, F.design]],
  ["CSS", [F.lang, F.design]],
  ["Sass", [F.lang, F.design]],

  // Frameworks & runtimes
  ["React", [F.framework]],
  ["Next.js", [F.framework]],
  ["Vue", [F.framework]],
  ["Nuxt", [F.framework]],
  ["Angular", [F.framework]],
  ["Svelte", [F.framework]],
  ["Remix", [F.framework]],
  ["Node.js", [F.framework]],
  ["Express", [F.framework]],
  ["Fastify", [F.framework]],
  ["Hono", [F.framework]],
  ["NestJS", [F.framework]],
  ["Django", [F.framework]],
  ["Flask", [F.framework]],
  ["FastAPI", [F.framework]],
  ["Spring Boot", [F.framework]],
  ["Rails", [F.framework]],
  ["Laravel", [F.framework]],
  ["Symfony", [F.framework]],
  ["ASP.NET", [F.framework]],
  ["Gin", [F.framework]],
  ["Echo", [F.framework]],
  ["Fiber", [F.framework]],
  ["Gatsby", [F.framework]],
  ["Astro", [F.framework]],
  ["Tailwind CSS", [F.framework, F.design]],
  ["GraphQL", [F.framework, F.data]],
  ["tRPC", [F.framework]],
  ["Redux", [F.framework]],
  ["Zustand", [F.framework]],
  ["React Native", [F.framework, F.mobile]],
  ["Expo", [F.framework, F.mobile]],
  ["Flutter", [F.framework, F.mobile]],
  [".NET", [F.framework]],
  ["Xamarin", [F.framework, F.mobile]],

  // Data & storage
  ["PostgreSQL", [F.data]],
  ["MySQL", [F.data]],
  ["SQLite", [F.data]],
  ["MongoDB", [F.data]],
  ["Redis", [F.data]],
  ["Elasticsearch", [F.data]],
  ["OpenSearch", [F.data]],
  ["ClickHouse", [F.data]],
  ["Snowflake", [F.data]],
  ["BigQuery", [F.data]],
  ["Redshift", [F.data]],
  ["Databricks", [F.data]],
  ["Kafka", [F.data]],
  ["RabbitMQ", [F.data]],
  ["NATS", [F.data]],
  ["SQS", [F.data]],
  ["SNS", [F.data]],
  ["Cassandra", [F.data]],
  ["DynamoDB", [F.data]],
  ["Firestore", [F.data]],
  ["Supabase", [F.data]],
  ["Firebase", [F.data]],
  ["Neo4j", [F.data]],
  ["pgvector", [F.data]],
  ["Pinecone", [F.data]],
  ["Milvus", [F.data]],
  ["Weaviate", [F.data]],
  ["dbt", [F.data]],
  ["Airflow", [F.data, F.devops]],
  ["Dagster", [F.data]],
  ["Prefect", [F.data]],
  ["Spark", [F.data]],
  ["Hadoop", [F.data]],
  ["Flink", [F.data]],
  ["Pandas", [F.data]],
  ["NumPy", [F.data]],
  ["Polars", [F.data]],
  ["Apache Beam", [F.data]],
  ["Hive", [F.data]],
  ["ETL", [F.data]],
  ["Data modeling", [F.data]],
  ["Data warehousing", [F.data]],
  ["Reverse ETL", [F.data]],
  ["Segment", [F.data]],
  ["Metabase", [F.data]],
  ["Tableau", [F.data]],
  ["Power BI", [F.data]],
  ["Looker", [F.data]],
  ["Grafana", [F.data, F.devops]],
  ["Excel", [F.data, F.finance]],

  // Cloud & infrastructure
  ["AWS", [F.cloud]],
  ["GCP", [F.cloud]],
  ["Azure", [F.cloud]],
  ["Docker", [F.cloud, F.devops]],
  ["Kubernetes", [F.cloud, F.devops]],
  ["Terraform", [F.cloud, F.devops]],
  ["Pulumi", [F.cloud, F.devops]],
  ["Helm", [F.cloud, F.devops]],
  ["Serverless", [F.cloud]],
  ["Lambda", [F.cloud]],
  ["Cloudflare Workers", [F.cloud]],
  ["Vercel", [F.cloud]],
  ["Netlify", [F.cloud]],
  ["Heroku", [F.cloud]],
  ["Render", [F.cloud]],
  ["Fly.io", [F.cloud]],
  ["S3", [F.cloud]],
  ["EC2", [F.cloud]],
  ["ECS", [F.cloud, F.devops]],
  ["EKS", [F.cloud, F.devops]],
  ["CloudFormation", [F.cloud, F.devops]],
  ["CDK", [F.cloud, F.devops]],
  ["CloudRun", [F.cloud]],
  ["Cloud Run", [F.cloud]],
  ["App Engine", [F.cloud]],
  ["OpenStack", [F.cloud]],
  ["Istio", [F.cloud, F.devops]],
  ["Linkerd", [F.cloud, F.devops]],
  ["Consul", [F.cloud, F.devops]],
  ["Vault", [F.cloud, F.security]],
  ["NGINX", [F.cloud, F.devops]],
  ["HAProxy", [F.cloud, F.devops]],
  ["Envoy", [F.cloud, F.devops]],
  ["CDN", [F.cloud]],
  ["CloudFront", [F.cloud]],

  // ML / AI
  ["Machine Learning", [F.ml, F.data]],
  ["Deep Learning", [F.ml]],
  ["NLP", [F.ml]],
  ["Computer Vision", [F.ml]],
  ["LLMs", [F.ml]],
  ["LLM", [F.ml]],
  ["LangChain", [F.ml]],
  ["LlamaIndex", [F.ml]],
  ["RAG", [F.ml]],
  ["Vector databases", [F.ml, F.data]],
  ["Embeddings", [F.ml]],
  ["Prompt engineering", [F.ml]],
  ["PyTorch", [F.ml]],
  ["TensorFlow", [F.ml]],
  ["JAX", [F.ml]],
  ["Keras", [F.ml]],
  ["scikit-learn", [F.ml]],
  ["XGBoost", [F.ml]],
  ["LightGBM", [F.ml]],
  ["Hugging Face", [F.ml]],
  ["Transformers", [F.ml]],
  ["OpenAI API", [F.ml]],
  ["Anthropic API", [F.ml]],
  ["Vertex AI", [F.ml, F.cloud]],
  ["SageMaker", [F.ml, F.cloud]],
  ["Azure ML", [F.ml, F.cloud]],
  ["MLflow", [F.ml]],
  ["Weights & Biases", [F.ml]],
  ["Ray", [F.ml]],
  ["ONNX", [F.ml]],
  ["TensorRT", [F.ml]],
  ["OpenCV", [F.ml]],
  ["spaCy", [F.ml, F.data]],
  ["NLTK", [F.ml]],
  ["Statistics", [F.ml, F.data]],
  ["A/B testing", [F.ml, F.product]],

  // Mobile
  ["iOS", [F.mobile]],
  ["Android", [F.mobile]],
  ["SwiftUI", [F.mobile]],
  ["Jetpack Compose", [F.mobile]],
  ["App Store", [F.mobile]],
  ["Play Store", [F.mobile]],
  ["Mobile CI/CD", [F.mobile, F.devops]],

  // DevOps & delivery
  ["CI/CD", [F.devops]],
  ["GitHub Actions", [F.devops]],
  ["GitLab CI", [F.devops]],
  ["Jenkins", [F.devops]],
  ["CircleCI", [F.devops]],
  ["ArgoCD", [F.devops]],
  ["FluxCD", [F.devops]],
  ["GitOps", [F.devops]],
  ["Ansible", [F.devops]],
  ["Chef", [F.devops]],
  ["Puppet", [F.devops]],
  ["Prometheus", [F.devops]],
  ["Datadog", [F.devops]],
  ["New Relic", [F.devops]],
  ["Sentry", [F.devops]],
  ["OpenTelemetry", [F.devops]],
  ["PagerDuty", [F.devops]],
  ["Opsgenie", [F.devops]],
  ["Incident response", [F.devops]],
  ["SRE", [F.devops]],
  ["SLOs", [F.devops]],
  ["Error budgets", [F.devops]],
  ["Observability", [F.devops]],
  ["Linux", [F.devops]],
  ["Networking", [F.devops]],
  ["DNS", [F.devops]],
  ["Load balancing", [F.devops]],
  ["Git", [F.devops]],
  ["Monorepo", [F.devops]],
  ["Turborepo", [F.devops]],
  ["Nx", [F.devops]],
  ["Feature flags", [F.devops, F.product]],
  ["LaunchDarkly", [F.devops, F.product]],

  // Security
  ["OAuth", [F.security]],
  ["OIDC", [F.security]],
  ["SAML", [F.security]],
  ["SSO", [F.security]],
  ["JWT", [F.security]],
  ["Zero trust", [F.security]],
  ["Penetration testing", [F.security]],
  ["Threat modeling", [F.security]],
  ["SOC 2", [F.security]],
  ["ISO 27001", [F.security]],
  ["GDPR", [F.security]],
  ["HIPAA", [F.security]],
  ["AppSec", [F.security]],
  ["DevSecOps", [F.security, F.devops]],
  ["Cryptography", [F.security]],
  ["WAF", [F.security]],
  ["SIEM", [F.security]],
  ["Burp Suite", [F.security]],
  ["Metasploit", [F.security]],
  ["Wireshark", [F.security]],
  ["Nmap", [F.security]],
  ["Vulnerability management", [F.security]],

  // Design & frontend craft
  ["Figma", [F.design]],
  ["Sketch", [F.design]],
  ["Adobe XD", [F.design]],
  ["Adobe Creative Suite", [F.design]],
  ["Photoshop", [F.design]],
  ["Illustrator", [F.design]],
  ["After Effects", [F.design]],
  ["Design systems", [F.design]],
  ["Accessibility", [F.design]],
  ["WCAG", [F.design]],
  ["UX research", [F.design, F.product]],
  ["Usability testing", [F.design, F.product]],
  ["Prototyping", [F.design]],
  ["Wireframing", [F.design]],
  ["User-centered design", [F.design]],
  ["Interaction design", [F.design]],
  ["Motion design", [F.design]],
  ["Illustration", [F.design]],
  ["Typography", [F.design]],
  ["Responsive design", [F.design]],

  // Product & delivery
  ["Product management", [F.product]],
  ["Product strategy", [F.product]],
  ["Roadmapping", [F.product]],
  ["Agile", [F.product]],
  ["Scrum", [F.product]],
  ["Kanban", [F.product]],
  ["Jira", [F.product]],
  ["Linear", [F.product]],
  ["Confluence", [F.product]],
  ["Notion", [F.product]],
  ["Stakeholder management", [F.product]],
  ["User stories", [F.product]],
  ["Backlog grooming", [F.product]],
  ["Product analytics", [F.product, F.data]],
  ["Mixpanel", [F.product, F.data]],
  ["Amplitude", [F.product, F.data]],
  ["PostHog", [F.product, F.data]],
  ["Google Analytics", [F.product, F.data]],
  ["Customer interviews", [F.product, F.design]],
  ["Market research", [F.product, F.marketing]],
  ["Go-to-market", [F.product, F.marketing]],
  ["OKRs", [F.product]],
  ["Technical writing", [F.product]],
  ["Documentation", [F.product]],

  // Marketing & growth
  ["SEO", [F.marketing]],
  ["Content marketing", [F.marketing]],
  ["Email marketing", [F.marketing]],
  ["HubSpot", [F.marketing]],
  ["Salesforce", [F.marketing, F.finance]],
  ["Marketo", [F.marketing]],
  ["Mailchimp", [F.marketing]],
  ["Klaviyo", [F.marketing]],
  ["Google Ads", [F.marketing]],
  ["Facebook Ads", [F.marketing]],
  ["Meta Ads", [F.marketing]],
  ["LinkedIn Ads", [F.marketing]],
  ["Copywriting", [F.marketing]],
  ["Brand strategy", [F.marketing]],
  ["Growth marketing", [F.marketing]],
  ["Lifecycle marketing", [F.marketing]],
  ["Marketing analytics", [F.marketing, F.data]],
  ["Social media marketing", [F.marketing]],
  ["Public relations", [F.marketing]],
  ["Event marketing", [F.marketing]],
  ["Partnerships", [F.marketing, F.product]],
  ["Sales", [F.marketing, F.finance]],
  ["Sales enablement", [F.marketing]],
  ["CRM", [F.marketing, F.finance]],
  ["Outreach", [F.marketing]],
  ["Salesloft", [F.marketing]],
  ["Ahrefs", [F.marketing]],
  ["SEMrush", [F.marketing]],
  ["Webflow", [F.marketing, F.design]],

  // Finance & ops
  ["Financial modeling", [F.finance]],
  ["FP&A", [F.finance]],
  ["Accounting", [F.finance]],
  ["Bookkeeping", [F.finance]],
  ["QuickBooks", [F.finance]],
  ["Xero", [F.finance]],
  ["NetSuite", [F.finance]],
  ["SAP", [F.finance]],
  ["Stripe", [F.finance]],
  ["Adyen", [F.finance]],
  ["Plaid", [F.finance]],
  ["Payments", [F.finance]],
  ["Billing", [F.finance]],
  ["Invoicing", [F.finance]],
  ["Payroll", [F.finance]],
  ["Expenses", [F.finance]],
  ["Audit", [F.finance]],
  ["Compliance", [F.finance, F.security]],
  ["Tax", [F.finance]],
  ["Treasury", [F.finance]],
  ["Valuation", [F.finance]],
  ["Venture capital", [F.finance]],
  ["Fundraising", [F.finance]],
  ["Unit economics", [F.finance, F.product]],
  ["Budgeting", [F.finance]],
  ["Forecasting", [F.finance]],
  ["Tableau Finance", [F.finance]],
];

/** Normalized skill key → node. */
const INDEX = new Map<string, SkillNode>(
  RAW.map(([skill, families]) => [normalize(skill), { skill, families }]),
);

function normalize(skill: string): string {
  return skill.toLowerCase().replace(/[^a-z0-9+#.]/g, "");
}

/** Lookup a candidate's raw skills against the taxonomy; returns nodes for known skills. */
export function knownSkills(skills: readonly string[]): SkillNode[] {
  const seen = new Set<string>();
  const out: SkillNode[] = [];
  for (const raw of skills) {
    const key = normalize(raw);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const node = INDEX.get(key);
    if (node) out.push(node);
  }
  return out;
}

/**
 * Compute the skill-graph view for a candidate against a target skill set
 * (the job's rubric criteria, the JD keywords, or any skill list).
 *
 * - matched: target skills the candidate demonstrates (direct or alias)
 * - adjacent: candidate skills in families the target cares about but not
 *   themselves required — the "also strong at" signal
 * - missing: target skills with no signal anywhere in the candidate profile
 */
export function skillGraph(
  candidateSkills: readonly string[],
  targetSkills: readonly string[],
): { matched: string[]; adjacent: string[]; missing: string[] } {
  const knownCandidate = knownSkills(candidateSkills);
  const candidateFamilies = new Set<string>();
  for (const node of knownCandidate) for (const f of node.families) candidateFamilies.add(f);

  const candidateSkillNames = new Set(knownCandidate.map((n) => n.skill));

  const matched: string[] = [];
  const missing: string[] = [];
  const adjacentSet = new Set<string>();

  for (const target of targetSkills) {
    const tKey = normalize(target);
    if (!tKey) continue;
    const tNode = INDEX.get(tKey);
    if (tNode && candidateSkillNames.has(tNode.skill)) {
      matched.push(tNode.skill);
      continue;
    }
    // Alias/substring pass: "Postgres" matches "PostgreSQL", "k8s" handled
    // by the taxonomy itself; substring catches compounds like "AWS Lambda".
    if (tNode) {
      const tNorm = normalize(tNode.skill);
      const hit = candidateSkills.some((s) => {
        const sNorm = normalize(s);
        return sNorm.length > 2 && (sNorm.includes(tNorm) || tNorm.includes(sNorm));
      });
      if (hit) {
        matched.push(tNode.skill);
        continue;
      }
    }
    missing.push(target);
  }

  // Adjacent: candidate skills sharing any family with any target skill,
  // but not already matched.
  const targetFamilies = new Set<string>();
  for (const target of targetSkills) {
    const tNode = INDEX.get(normalize(target));
    if (tNode) for (const f of tNode.families) targetFamilies.add(f);
  }
  if (targetFamilies.size > 0) {
    for (const node of knownCandidate) {
      if (matched.includes(node.skill)) continue;
      if (node.families.some((f) => targetFamilies.has(f))) adjacentSet.add(node.skill);
    }
  }

  return {
    matched,
    adjacent: [...adjacentSet].sort(),
    missing,
  };
}

/** Families a candidate demonstrably touches — used for the "strength profile" chip row. */
export function candidateFamilies(skills: readonly string[]): string[] {
  const families = new Set<string>();
  for (const node of knownSkills(skills)) for (const f of node.families) families.add(f);
  return [...families].sort();
}

/**
 * One deterministic headline number for the self-check (v1.3):
 * matched targets weigh 1, adjacent (same skill family) weigh 0.5,
 * missing weigh 0 — over every target the JD names. Not an AI
 * judgment: a coverage estimate that always traces back to the chips
 * shown underneath it.
 */
export function matchPct(graph: {
  matched: readonly string[];
  adjacent: readonly string[];
  missing: readonly string[];
}): number {
  const matched = graph.matched.length;
  const adjacent = graph.adjacent.length;
  const missing = graph.missing.length;
  const targets = matched + missing;
  if (targets === 0) return adjacent > 0 ? 50 : 0;
  return Math.round(((matched + adjacent * 0.5) / targets) * 100);
}

/** Common JD spellings that should resolve to a taxonomy skill. */
const ALIASES: ReadonlyArray<readonly [string, string]> = [
  ["Postgres", "PostgreSQL"],
  ["k8s", "Kubernetes"],
  ["Node", "Node.js"],
  ["NodeJS", "Node.js"],
  ["Golang", "Go"],
  ["Vue.js", "Vue"],
  ["AngularJS", "Angular"],
  ["NextJS", "Next.js"],
  ["d3", "Data modeling"], // never matched; d3 is too ambiguous — placeholder excluded below
];

/**
 * Short skills that collide with ordinary words. These match only when
 * capitalized exactly ("Go", "R", "C") so "who go above" never yields
 * the Go language and "annual raffle" never yields R.
 */
const CASE_SENSITIVE = new Set(["Go", "R", "C", "C++", "C#"]);

// Precompiled matchers. Word-boundary char classes keep matches off
// compound words; CASE_SENSITIVE entries skip the `i` flag.
const TEXT_MATCHERS: ReadonlyArray<readonly [RegExp, string]> = (() => {
  const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pairs: Array<[RegExp, string]> = RAW.map(([skill]) => [
    new RegExp(
      `(^|[^A-Za-z0-9+#])${escapeRe(skill)}([^A-Za-z0-9+#]|$)`,
      CASE_SENSITIVE.has(skill) ? "" : "i",
    ),
    skill,
  ]);
  for (const [alias, target] of ALIASES) {
    if (alias === "d3") continue;
    pairs.push([new RegExp(`(^|[^A-Za-z0-9+#])${escapeRe(alias)}([^A-Za-z0-9+#]|$)`, "i"), target]);
  }
  return pairs;
})();

/**
 * Extract known skills mentioned anywhere in free text (a job description,
 * a summary paragraph). Deterministic, no LLM. Order follows the taxonomy,
 * deduped, canonical names only.
 */
export function skillsInText(text: string): string[] {
  if (!text) return [];
  const found = new Set<string>();
  for (const [re, skill] of TEXT_MATCHERS) {
    if (re.test(text)) found.add(skill);
  }
  return [...found];
}
