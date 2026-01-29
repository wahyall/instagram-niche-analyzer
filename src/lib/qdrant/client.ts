import { QdrantClient } from "@qdrant/js-client-rest";

const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;
const COLLECTION_NAME = "instagram-profiles";
const VECTOR_SIZE = 384; // all-MiniLM-L6-v2 dimension (via @xenova/transformers)

let qdrantClient: QdrantClient | null = null;

export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    // Support both local (no API key) and cloud (with API key) deployments
    qdrantClient = new QdrantClient({
      url: QDRANT_URL,
      ...(QDRANT_API_KEY && { apiKey: QDRANT_API_KEY }),
    });
  }
  return qdrantClient;
}

export interface ProfileMetadata {
  username: string;
  bio: string;
  interests: string[];
  niche: string;
  followersCount: number;
  sessionId: string;
}

// Initialize collection if it doesn't exist
export async function initializeCollection(): Promise<void> {
  const client = getQdrantClient();

  try {
    const collections = await client.getCollections();
    const exists = collections.collections.some(
      (c) => c.name === COLLECTION_NAME
    );

    if (!exists) {
      await client.createCollection(COLLECTION_NAME, {
        vectors: {
          size: VECTOR_SIZE,
          distance: "Cosine",
        },
        optimizers_config: {
          default_segment_number: 2,
        },
        replication_factor: 1,
      });
      console.log(`Created Qdrant collection: ${COLLECTION_NAME}`);

      // Create payload indexes for filtering
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "sessionId",
        field_schema: "keyword",
      });
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "username",
        field_schema: "keyword",
      });
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: "niche",
        field_schema: "keyword",
      });
      console.log("Created payload indexes for filtering");
    }
  } catch (error) {
    console.error("Error initializing Qdrant collection:", error);
    throw error;
  }
}

export async function upsertProfileEmbedding(
  id: string,
  embedding: number[],
  metadata: ProfileMetadata
): Promise<void> {
  const client = getQdrantClient();

  await initializeCollection();

  await client.upsert(COLLECTION_NAME, {
    wait: true,
    points: [
      {
        id: generatePointId(id),
        vector: embedding,
        payload: {
          ...metadata,
          originalId: id,
        },
      },
    ],
  });
}

export async function upsertBulkProfileEmbeddings(
  records: Array<{
    id: string;
    embedding: number[];
    metadata: ProfileMetadata;
  }>
): Promise<void> {
  const client = getQdrantClient();

  await initializeCollection();

  const points = records.map((record) => ({
    id: generatePointId(record.id),
    vector: record.embedding,
    payload: {
      ...record.metadata,
      originalId: record.id,
    },
  }));

  // Qdrant handles batches well, but let's batch for safety
  const batchSize = 100;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    await client.upsert(COLLECTION_NAME, {
      wait: true,
      points: batch,
    });
  }
}

export async function queryProfiles(
  embedding: number[],
  topK: number = 10,
  filter?: { sessionId?: string }
): Promise<
  Array<{
    id: string;
    score: number;
    metadata: ProfileMetadata;
  }>
> {
  const client = getQdrantClient();

  await initializeCollection();

  // Build filter for Qdrant
  const qdrantFilter = filter?.sessionId
    ? {
        must: [
          {
            key: "sessionId",
            match: { value: filter.sessionId },
          },
        ],
      }
    : undefined;

  const results = await client.search(COLLECTION_NAME, {
    vector: embedding,
    limit: topK,
    with_payload: true,
    filter: qdrantFilter,
  });

  return results.map((result) => {
    const payload = result.payload as unknown as ProfileMetadata & { originalId: string };
    return {
      id: payload?.originalId || String(result.id),
      score: result.score,
      metadata: {
        username: payload?.username || "",
        bio: payload?.bio || "",
        interests: payload?.interests || [],
        niche: payload?.niche || "",
        followersCount: payload?.followersCount || 0,
        sessionId: payload?.sessionId || "",
      },
    };
  });
}

export async function deleteProfileEmbedding(id: string): Promise<void> {
  const client = getQdrantClient();

  await client.delete(COLLECTION_NAME, {
    wait: true,
    points: [generatePointId(id)],
  });
}

export async function deleteProfilesBySession(sessionId: string): Promise<void> {
  const client = getQdrantClient();

  await client.delete(COLLECTION_NAME, {
    wait: true,
    filter: {
      must: [
        {
          key: "sessionId",
          match: { value: sessionId },
        },
      ],
    },
  });
}

// Get collection info
export async function getCollectionInfo(): Promise<{
  vectorsCount: number;
  pointsCount: number;
}> {
  const client = getQdrantClient();

  try {
    const info = await client.getCollection(COLLECTION_NAME);
    return {
      vectorsCount: info.indexed_vectors_count || 0,
      pointsCount: info.points_count || 0,
    };
  } catch {
    return { vectorsCount: 0, pointsCount: 0 };
  }
}

// Generate a numeric ID from string (Qdrant prefers numeric IDs for performance)
function generatePointId(stringId: string): number {
  let hash = 0;
  for (let i = 0; i < stringId.length; i++) {
    const char = stringId.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

export default getQdrantClient;

