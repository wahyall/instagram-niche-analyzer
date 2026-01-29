import {
  flushBuffer,
  flushBufferForJob,
  BufferedProfile,
  BUFFER_THRESHOLD,
} from "./aiAnalysisBuffer";
import {
  analyzeAndUpdateProfilesBatch,
  createBulkProfileEmbeddings,
} from "../ai/embeddings";
import { Profile } from "../db/models";
import connectDB from "../db/mongodb";
import type { InstagramProfile, InstagramPost } from "@/types";

/**
 * Process a batch of profiles from the buffer
 * 1. Flush profiles from buffer
 * 2. Call batch AI analysis
 * 3. Update Profile documents in MongoDB
 * 4. Create embeddings in Qdrant
 */
export async function processBatch(): Promise<number> {
  // Flush up to BUFFER_THRESHOLD profiles
  const bufferedProfiles = await flushBuffer(BUFFER_THRESHOLD);

  if (bufferedProfiles.length === 0) {
    return 0;
  }

  console.log(
    `[AIAnalysisWorker] Processing batch of ${bufferedProfiles.length} profiles`
  );

  await connectDB();

  // Prepare data for batch analysis
  const profilesData = bufferedProfiles.map((bp) => ({
    profile: bp.profile,
    posts: bp.posts,
  }));

  // Batch AI analysis (SINGLE GEMINI API CALL)
  const analysisResults = await analyzeAndUpdateProfilesBatch(profilesData);

  // Update profiles in MongoDB with analysis results
  const updatePromises = analysisResults.map(async (result) => {
    try {
      await Profile.updateOne(
        { username: result.username },
        {
          $set: {
            interests: result.interests,
            niche: result.niche,
          },
        }
      );
    } catch (error) {
      console.error(
        `[AIAnalysisWorker] Failed to update profile @${result.username}:`,
        error
      );
    }
  });

  await Promise.all(updatePromises);

  // Create embeddings in batch
  // First, fetch the updated profiles with interests/niche
  const embeddingData: Array<{
    profile: InstagramProfile;
    posts: InstagramPost[];
  }> = [];

  for (let i = 0; i < bufferedProfiles.length; i++) {
    const bp = bufferedProfiles[i];
    const result = analysisResults[i];

    // Update the profile object with analysis results for embedding
    const updatedProfile: InstagramProfile = {
      ...bp.profile,
      interests: result.interests,
      niche: result.niche,
    };

    embeddingData.push({
      profile: updatedProfile,
      posts: bp.posts,
    });
  }

  // Create embeddings in bulk
  try {
    await createBulkProfileEmbeddings(embeddingData);
    console.log(
      `[AIAnalysisWorker] Created embeddings for ${embeddingData.length} profiles`
    );
  } catch (embeddingError) {
    console.error(
      "[AIAnalysisWorker] Failed to create bulk embeddings:",
      embeddingError
    );
  }

  console.log(
    `[AIAnalysisWorker] Completed batch processing of ${bufferedProfiles.length} profiles`
  );

  return bufferedProfiles.length;
}

/**
 * Process all remaining profiles for a specific job
 * Called when a scrape job completes to ensure all profiles are analyzed
 * @param jobId The job ID to process
 */
export async function processJobRemaining(jobId: string): Promise<number> {
  const bufferedProfiles = await flushBufferForJob(jobId);

  if (bufferedProfiles.length === 0) {
    return 0;
  }

  console.log(
    `[AIAnalysisWorker] Processing remaining ${bufferedProfiles.length} profiles for job ${jobId}`
  );

  await connectDB();

  // Prepare data for batch analysis
  const profilesData = bufferedProfiles.map((bp) => ({
    profile: bp.profile,
    posts: bp.posts,
  }));

  // Batch AI analysis
  const analysisResults = await analyzeAndUpdateProfilesBatch(profilesData);

  // Update profiles in MongoDB
  const updatePromises = analysisResults.map(async (result) => {
    try {
      await Profile.updateOne(
        { username: result.username },
        {
          $set: {
            interests: result.interests,
            niche: result.niche,
          },
        }
      );
    } catch (error) {
      console.error(
        `[AIAnalysisWorker] Failed to update profile @${result.username}:`,
        error
      );
    }
  });

  await Promise.all(updatePromises);

  // Create embeddings
  const embeddingData: Array<{
    profile: InstagramProfile;
    posts: InstagramPost[];
  }> = [];

  for (let i = 0; i < bufferedProfiles.length; i++) {
    const bp = bufferedProfiles[i];
    const result = analysisResults[i];

    const updatedProfile: InstagramProfile = {
      ...bp.profile,
      interests: result.interests,
      niche: result.niche,
    };

    embeddingData.push({
      profile: updatedProfile,
      posts: bp.posts,
    });
  }

  try {
    await createBulkProfileEmbeddings(embeddingData);
    console.log(
      `[AIAnalysisWorker] Created embeddings for ${embeddingData.length} profiles (job ${jobId})`
    );
  } catch (embeddingError) {
    console.error(
      "[AIAnalysisWorker] Failed to create bulk embeddings:",
      embeddingError
    );
  }

  console.log(
    `[AIAnalysisWorker] Completed processing remaining profiles for job ${jobId}`
  );

  return bufferedProfiles.length;
}
