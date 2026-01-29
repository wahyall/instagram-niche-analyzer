import { getRedisClient } from "./redis";
import type { InstagramProfile, InstagramPost } from "@/types";

// Buffer configuration
export const BUFFER_THRESHOLD = 100;
const BUFFER_KEY = "ai-analysis:buffer";
const BUFFER_LOCK_KEY = "ai-analysis:buffer:lock";
const LOCK_TTL_MS = 30000; // 30 seconds lock timeout

export interface BufferedProfile {
  jobId: string;
  profile: InstagramProfile;
  posts: InstagramPost[];
  addedAt: number;
}

/**
 * Add a profile to the AI analysis buffer
 * @param profile The Instagram profile to analyze
 * @param posts The posts associated with the profile
 * @param jobId The scrape job ID
 */
export async function addToBuffer(
  profile: InstagramProfile,
  posts: InstagramPost[],
  jobId: string
): Promise<number> {
  const redis = getRedisClient();

  const bufferedProfile: BufferedProfile = {
    jobId,
    profile,
    posts,
    addedAt: Date.now(),
  };

  // Add to Redis list (right push)
  const newSize = await redis.rpush(
    BUFFER_KEY,
    JSON.stringify(bufferedProfile)
  );

  console.log(
    `[AIBuffer] Added @${profile.username} to buffer. Size: ${newSize}`
  );

  return newSize;
}

/**
 * Get the current number of profiles in the buffer
 */
export async function getBufferSize(): Promise<number> {
  const redis = getRedisClient();
  return await redis.llen(BUFFER_KEY);
}

/**
 * Acquire a lock for buffer flushing to prevent concurrent access
 */
async function acquireLock(): Promise<boolean> {
  const redis = getRedisClient();
  // SET NX with expiry - only sets if key doesn't exist
  const result = await redis.set(BUFFER_LOCK_KEY, "1", "PX", LOCK_TTL_MS, "NX");
  return result === "OK";
}

/**
 * Release the buffer lock
 */
async function releaseLock(): Promise<void> {
  const redis = getRedisClient();
  await redis.del(BUFFER_LOCK_KEY);
}

/**
 * Flush up to `count` profiles from the buffer
 * Uses atomic LPOP operations to prevent race conditions
 * @param count Maximum number of profiles to retrieve (default: BUFFER_THRESHOLD)
 * @returns Array of buffered profiles
 */
export async function flushBuffer(
  count: number = BUFFER_THRESHOLD
): Promise<BufferedProfile[]> {
  const redis = getRedisClient();

  // Try to acquire lock
  const hasLock = await acquireLock();
  if (!hasLock) {
    console.log("[AIBuffer] Could not acquire lock, another process is flushing");
    return [];
  }

  try {
    const profiles: BufferedProfile[] = [];

    // Use LPOP to atomically remove items from the left of the list
    for (let i = 0; i < count; i++) {
      const item = await redis.lpop(BUFFER_KEY);
      if (!item) break;

      try {
        const parsed = JSON.parse(item) as BufferedProfile;
        profiles.push(parsed);
      } catch (parseError) {
        console.error("[AIBuffer] Failed to parse buffered item:", parseError);
      }
    }

    if (profiles.length > 0) {
      console.log(`[AIBuffer] Flushed ${profiles.length} profiles from buffer`);
    }

    return profiles;
  } finally {
    await releaseLock();
  }
}

/**
 * Flush all profiles for a specific job from the buffer
 * Used when a job completes to ensure all remaining profiles are processed
 * @param jobId The job ID to filter by
 * @returns Array of buffered profiles for the specified job
 */
export async function flushBufferForJob(
  jobId: string
): Promise<BufferedProfile[]> {
  const redis = getRedisClient();

  // Try to acquire lock
  const hasLock = await acquireLock();
  if (!hasLock) {
    console.log("[AIBuffer] Could not acquire lock for job flush");
    return [];
  }

  try {
    // Get all items from buffer
    const allItems = await redis.lrange(BUFFER_KEY, 0, -1);

    if (allItems.length === 0) {
      return [];
    }

    const jobProfiles: BufferedProfile[] = [];
    const remainingItems: string[] = [];

    // Separate profiles for this job from others
    for (const item of allItems) {
      try {
        const parsed = JSON.parse(item) as BufferedProfile;
        if (parsed.jobId === jobId) {
          jobProfiles.push(parsed);
        } else {
          remainingItems.push(item);
        }
      } catch (parseError) {
        console.error("[AIBuffer] Failed to parse buffered item:", parseError);
      }
    }

    // Replace buffer with remaining items atomically
    if (remainingItems.length !== allItems.length) {
      const multi = redis.multi();
      multi.del(BUFFER_KEY);
      if (remainingItems.length > 0) {
        multi.rpush(BUFFER_KEY, ...remainingItems);
      }
      await multi.exec();
    }

    if (jobProfiles.length > 0) {
      console.log(
        `[AIBuffer] Flushed ${jobProfiles.length} profiles for job ${jobId}`
      );
    }

    return jobProfiles;
  } finally {
    await releaseLock();
  }
}

/**
 * Check if the buffer has reached the threshold for processing
 */
export async function shouldProcessBatch(): Promise<boolean> {
  const size = await getBufferSize();
  return size >= BUFFER_THRESHOLD;
}
