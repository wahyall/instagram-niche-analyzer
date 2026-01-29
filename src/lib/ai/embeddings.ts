import { generateEmbedding, generateEmbeddings } from "./localEmbeddings";
import { analyzeInterests, analyzeInterestsBatch, ProfileAnalysisInput, ProfileAnalysisResult } from "./openai";
import {
  upsertProfileEmbedding,
  upsertBulkProfileEmbeddings,
  ProfileMetadata,
} from "../qdrant/client";
import type { InstagramProfile, InstagramPost } from "@/types";

export async function createProfileEmbedding(
  profile: InstagramProfile,
  posts: InstagramPost[]
): Promise<void> {
  // Combine profile data for embedding
  const textContent = buildProfileText(profile, posts);

  // Generate embedding
  const embedding = await generateEmbedding(textContent);

  // Prepare metadata
  const metadata: ProfileMetadata = {
    username: profile.username,
    bio: profile.bio || "",
    interests: profile.interests || [],
    niche: profile.niche || "Unknown",
    followersCount: profile.followersCount,
    sessionId: profile.sessionId,
  };

  // Store in Qdrant
  await upsertProfileEmbedding(profile.username, embedding, metadata);
}

export async function createBulkProfileEmbeddings(
  profiles: Array<{
    profile: InstagramProfile;
    posts: InstagramPost[];
  }>
): Promise<void> {
  // Build text content for each profile
  const texts = profiles.map(({ profile, posts }) =>
    buildProfileText(profile, posts)
  );

  // Generate embeddings in batch
  const embeddings = await generateEmbeddings(texts);

  // Prepare records for Qdrant
  const records = profiles.map(({ profile }, index) => ({
    id: profile.username,
    embedding: embeddings[index],
    metadata: {
      username: profile.username,
      bio: profile.bio || "",
      interests: profile.interests || [],
      niche: profile.niche || "Unknown",
      followersCount: profile.followersCount,
      sessionId: profile.sessionId,
    } as ProfileMetadata,
  }));

  // Store in Qdrant
  await upsertBulkProfileEmbeddings(records);
}

export async function analyzeAndUpdateProfile(
  profile: InstagramProfile,
  posts: InstagramPost[]
): Promise<{ interests: string[]; niche: string }> {
  const captions = posts.filter((p) => p.caption).map((p) => p.caption);

  const analysis = await analyzeInterests(profile.bio || "", captions);

  return analysis;
}

/**
 * Batch analyze multiple profiles in a single API call
 * @param profilesData Array of profiles with their posts
 * @returns Array of analysis results with username, interests, and niche
 */
export async function analyzeAndUpdateProfilesBatch(
  profilesData: Array<{
    profile: InstagramProfile;
    posts: InstagramPost[];
  }>
): Promise<ProfileAnalysisResult[]> {
  if (profilesData.length === 0) {
    return [];
  }

  // Prepare input for batch analysis
  const analysisInputs: ProfileAnalysisInput[] = profilesData.map(
    ({ profile, posts }) => ({
      username: profile.username,
      bio: profile.bio || "",
      captions: posts.filter((p) => p.caption).map((p) => p.caption),
    })
  );

  // Call batch analysis
  const results = await analyzeInterestsBatch(analysisInputs);

  return results;
}

function buildProfileText(
  profile: InstagramProfile,
  posts: InstagramPost[]
): string {
  const parts: string[] = [];

  // Add username and name
  parts.push(`Username: ${profile.username}`);
  if (profile.fullName) {
    parts.push(`Name: ${profile.fullName}`);
  }

  // Add bio
  if (profile.bio) {
    parts.push(`Bio: ${profile.bio}`);
  }

  // Add stats
  parts.push(`Followers: ${profile.followersCount}`);
  parts.push(`Following: ${profile.followingCount}`);
  parts.push(`Posts: ${profile.postsCount}`);

  // Add interests if available
  if (profile.interests && profile.interests.length > 0) {
    parts.push(`Interests: ${profile.interests.join(", ")}`);
  }

  // Add niche if available
  if (profile.niche) {
    parts.push(`Niche: ${profile.niche}`);
  }

  // Add post captions (limit to first 5)
  const captions = posts
    .filter((p) => p.caption)
    .slice(0, 5)
    .map((p) => p.caption);

  if (captions.length > 0) {
    parts.push(`Recent post captions: ${captions.join(" | ")}`);
  }

  return parts.join("\n");
}

export function calculateTextLength(
  profile: InstagramProfile,
  posts: InstagramPost[]
): number {
  return buildProfileText(profile, posts).length;
}
