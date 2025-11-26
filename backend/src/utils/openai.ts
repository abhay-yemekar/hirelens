const ollamaBase = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

// ===== Embeddings (Ollama) =====
export async function embed(text: string): Promise<number[]> {
  const model = process.env.EMBEDDING_MODEL || "nomic-embed-text";

  const res = await fetch(`${ollamaBase}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama embeddings error: ${errText}`);
  }

  const data = await res.json();
  return data.embedding;
}

// ===== Chat (Ollama) =====
// Uses /api/generate (simple, non-chat) so we stringify messages ourselves.
export async function chat(messages: { role: string; content: string }[]) {
  const model = process.env.CHAT_MODEL || "llama3.2";

  const prompt = messages
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n");

  const res = await fetch(`${ollamaBase}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      prompt,
      stream: false,
      options: { temperature: 0.2 },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama chat error: ${errText}`);
  }

  const data = await res.json();
  return data.response as string;
}
