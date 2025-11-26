type Doc = { id: string; text: string; embedding: number[] };

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-10);
}

class InMemoryVectorStore {
  private docs: Doc[] = [];

  clear() { this.docs = []; }

  add(doc: Doc) { this.docs.push(doc); }

  search(queryEmbedding: number[], k = 4) {
    return this.docs
      .map((d) => ({
        ...d,
        score: cosine(queryEmbedding, d.embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

export const vectorStore = new InMemoryVectorStore();
