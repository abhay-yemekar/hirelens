import "dotenv/config";

async function main(): Promise<void> {
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("DATABASE_URL is required");
    process.exit(1);
  }
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { Pool } = await import("pg");
  const authSchema = await import("../auth-schema.js");
  const domainSchema = await import("./schema/index.js");
  const { randomUUID } = await import("node:crypto");
  const db = drizzle(new Pool({ connectionString: url, max: 1 }));

  const [org] = await db
    .insert(authSchema.organization)
    .values({
      id: randomUUID(),
      name: "HireLens Demo",
      slug: "hirelens-demo",
      createdAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();
  if (!org) {
    console.log("Seed already applied (demo org exists).");
    process.exit(0);
  }

  const [user] = await db
    .insert(authSchema.user)
    .values({
      id: randomUUID(),
      email: "demo@hirelens.dev",
      name: "Demo Recruiter",
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoNothing()
    .returning();

  if (user) {
    await db.insert(authSchema.member).values({
      id: randomUUID(),
      organizationId: org.id,
      userId: user.id,
      role: "owner",
      createdAt: new Date(),
    });
  }

  const jd = `Generative AI Engineer

Requirements:
- Strong Python and backend engineering
- Experience with RAG, embeddings, vector databases
- Familiar with React/TypeScript for internal tools
- Knowledge of PostgreSQL and cloud (AWS)
Nice to have:
- Real-time voice agents (STT/TTS)
- Docker/Kubernetes`;

  const [job] = await db
    .insert(domainSchema.jobs)
    .values({ orgId: org.id, title: "Generative AI Engineer", description: jd, status: "open" })
    .returning();

  console.log(`Seeded org=${org.slug} job=${job?.id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
