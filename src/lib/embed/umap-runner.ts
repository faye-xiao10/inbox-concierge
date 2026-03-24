import { UMAP } from 'umap-js';

function zeros(count: number): [number, number][] {
  return Array.from({ length: count }, () => [0, 0] as [number, number]);
}

function isValidEmbedding(embedding: number[]): boolean {
  return (
    Array.isArray(embedding) &&
    embedding.length > 0 &&
    embedding.every((v) => typeof v === 'number' && !isNaN(v) && isFinite(v))
  );
}

export async function runUmap(
  embeddings: number[][],
): Promise<[number, number][]> {
  if (embeddings.length < 4) {
    return zeros(embeddings.length);
  }

  const validEmbeddings = embeddings.filter(isValidEmbedding);
  if (validEmbeddings.length !== embeddings.length) {
    console.error(
      `runUmap: ${embeddings.length - validEmbeddings.length} invalid embeddings detected, aborting UMAP`,
    );
    return zeros(embeddings.length);
  }

  try {
    const umap = new UMAP({
      nComponents: 2,
      nNeighbors: Math.min(15, embeddings.length - 1),
      minDist: 0.1,
      spread: 1.0,
    });

    const result = umap.fit(embeddings);

    return result.map((coords) => [coords[0], coords[1]] as [number, number]);
  } catch (error) {
    console.error('UMAP failed, returning zeros:', error);
    return zeros(embeddings.length);
  }
}
