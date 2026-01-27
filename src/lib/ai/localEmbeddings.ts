import { pipeline, FeatureExtractionPipeline } from "@xenova/transformers";

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
export const EMBEDDING_DIMENSION = 384;

let embeddingPipeline: FeatureExtractionPipeline | null = null;

/**
 * Initialize or get the embedding pipeline (singleton)
 * Uses all-MiniLM-L6-v2 which produces 384-dimensional embeddings
 */
async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (!embeddingPipeline) {
    console.log(`Loading embedding model: ${MODEL_NAME}...`);
    embeddingPipeline = await pipeline("feature-extraction", MODEL_NAME, {
      quantized: true, // Use quantized model for faster inference
    });
    console.log("Embedding model loaded successfully");
  }
  return embeddingPipeline;
}

/**
 * Generate embedding for a single text
 * @param text - The text to embed
 * @returns Array of numbers representing the embedding (384 dimensions)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const extractor = await getEmbeddingPipeline();

  // Generate embedding with mean pooling and normalization
  const output = await extractor(text, {
    pooling: "mean",
    normalize: true,
  });

  // Convert to regular array
  return Array.from(output.data as Float32Array);
}

/**
 * Generate embeddings for multiple texts in batch
 * @param texts - Array of texts to embed
 * @returns Array of embeddings (each 384 dimensions)
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const extractor = await getEmbeddingPipeline();

  const embeddings: number[][] = [];

  // Process texts - @xenova/transformers handles batching internally
  // but we process one at a time for better memory management
  for (const text of texts) {
    const output = await extractor(text, {
      pooling: "mean",
      normalize: true,
    });
    embeddings.push(Array.from(output.data as Float32Array));
  }

  return embeddings;
}

/**
 * Preload the embedding model
 * Useful to call during app initialization to avoid cold start delays
 */
export async function preloadEmbeddingModel(): Promise<void> {
  await getEmbeddingPipeline();
}

