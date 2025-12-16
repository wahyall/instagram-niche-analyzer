import { generateEmbedding, chatWithContext } from "./openai";
import { queryProfiles, ProfileMetadata } from "../qdrant/client";
import { Profile } from "../db/models";
import connectDB from "../db/mongodb";
import type { ChatMessage, ProfileSource } from "@/types";

export async function searchRelevantProfiles(
  query: string,
  sessionId?: string,
  topK: number = 10
): Promise<
  Array<{
    username: string;
    score: number;
    metadata: ProfileMetadata;
  }>
> {
  // Generate embedding for the query
  const queryEmbedding = await generateEmbedding(query);

  // Build filter if sessionId provided
  const filter = sessionId ? { sessionId } : undefined;

  // Query Qdrant
  const results = await queryProfiles(queryEmbedding, topK, filter);

  return results.map((result) => ({
    username: result.metadata.username,
    score: result.score,
    metadata: result.metadata,
  }));
}

export async function buildContextFromProfiles(
  profiles: Array<{
    username: string;
    score: number;
    metadata: ProfileMetadata;
  }>
): Promise<string> {
  await connectDB();

  const contextParts: string[] = [];

  for (const { username, score, metadata } of profiles) {
    // Get full profile from database
    const fullProfile = await Profile.findOne({ username }).lean();

    if (fullProfile) {
      const profileContext = [
        `--- Profile: @${username} (Relevance: ${(score * 100).toFixed(
          1
        )}%) ---`,
        `Name: ${fullProfile.fullName || "N/A"}`,
        `Bio: ${fullProfile.bio || "N/A"}`,
        `Followers: ${fullProfile.followersCount.toLocaleString()}`,
        `Following: ${fullProfile.followingCount.toLocaleString()}`,
        `Posts: ${fullProfile.postsCount}`,
        `Interests: ${metadata.interests.join(", ") || "Unknown"}`,
        `Niche: ${metadata.niche || "Unknown"}`,
        `Private: ${fullProfile.isPrivate ? "Yes" : "No"}`,
        `Verified: ${fullProfile.isVerified ? "Yes" : "No"}`,
      ].join("\n");

      contextParts.push(profileContext);
    }
  }

  return contextParts.join("\n\n");
}

// Get comprehensive statistics for all scraped profiles
export async function getComprehensiveStats(sessionId: string): Promise<{
  totalProfiles: number;
  nicheDistribution: Array<{
    niche: string;
    count: number;
    percentage: number;
  }>;
  interestDistribution: Array<{
    interest: string;
    count: number;
    percentage: number;
  }>;
  followerStats: {
    total: number;
    average: number;
    median: number;
    min: number;
    max: number;
  };
  verifiedCount: number;
  privateCount: number;
  topProfilesByFollowers: Array<{
    username: string;
    followers: number;
    niche: string;
  }>;
  contentSuggestions: string[];
}> {
  await connectDB();

  const profiles = await Profile.find({ sessionId }).lean();
  const totalProfiles = profiles.length;

  if (totalProfiles === 0) {
    return {
      totalProfiles: 0,
      nicheDistribution: [],
      interestDistribution: [],
      followerStats: { total: 0, average: 0, median: 0, min: 0, max: 0 },
      verifiedCount: 0,
      privateCount: 0,
      topProfilesByFollowers: [],
      contentSuggestions: [],
    };
  }

  // Niche distribution with percentage
  const nicheCounts: Record<string, number> = {};
  profiles.forEach((profile) => {
    const niche = profile.niche || "Unknown";
    nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
  });

  const nicheDistribution = Object.entries(nicheCounts)
    .map(([niche, count]) => ({
      niche,
      count,
      percentage: Math.round((count / totalProfiles) * 100 * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  // Interest distribution with percentage
  const interestCounts: Record<string, number> = {};
  profiles.forEach((profile) => {
    (profile.interests || []).forEach((interest) => {
      interestCounts[interest] = (interestCounts[interest] || 0) + 1;
    });
  });

  const interestDistribution = Object.entries(interestCounts)
    .map(([interest, count]) => ({
      interest,
      count,
      percentage: Math.round((count / totalProfiles) * 100 * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  // Follower statistics
  const followerCounts = profiles
    .map((p) => p.followersCount)
    .sort((a, b) => a - b);
  const totalFollowers = followerCounts.reduce((sum, c) => sum + c, 0);
  const medianIndex = Math.floor(followerCounts.length / 2);

  const followerStats = {
    total: totalFollowers,
    average: Math.round(totalFollowers / totalProfiles),
    median:
      followerCounts.length % 2 === 0
        ? Math.round(
            (followerCounts[medianIndex - 1] + followerCounts[medianIndex]) / 2
          )
        : followerCounts[medianIndex],
    min: followerCounts[0] || 0,
    max: followerCounts[followerCounts.length - 1] || 0,
  };

  // Verified and private counts
  const verifiedCount = profiles.filter((p) => p.isVerified).length;
  const privateCount = profiles.filter((p) => p.isPrivate).length;

  // Top profiles by followers
  const topProfilesByFollowers = profiles
    .sort((a, b) => b.followersCount - a.followersCount)
    .slice(0, 10)
    .map((p) => ({
      username: p.username,
      followers: p.followersCount,
      niche: p.niche || "Unknown",
    }));

  // Generate content suggestions based on top interests and niches
  const topNiches = nicheDistribution.slice(0, 3).map((n) => n.niche);
  const topInterests = interestDistribution.slice(0, 5).map((i) => i.interest);

  const contentSuggestions = generateContentSuggestions(
    topNiches,
    topInterests
  );

  return {
    totalProfiles,
    nicheDistribution,
    interestDistribution,
    followerStats,
    verifiedCount,
    privateCount,
    topProfilesByFollowers,
    contentSuggestions,
  };
}

// Generate content suggestions based on interests and niches
function generateContentSuggestions(
  niches: string[],
  interests: string[]
): string[] {
  const suggestions: string[] = [];

  const nicheSuggestions: Record<string, string[]> = {
    "Fitness & Health": [
      "Tutorial workout routine yang mudah diikuti",
      "Tips nutrisi dan meal prep",
      "Transformation story dan motivasi",
      "Review produk fitness/suplemen",
    ],
    "Fashion & Beauty": [
      "OOTD dan styling tips",
      "Tutorial makeup untuk berbagai occasion",
      "Review produk skincare/makeup",
      "Haul dan try-on session",
    ],
    Technology: [
      "Review gadget dan tech tips",
      "Tutorial software/app",
      "Tech news dan trend update",
      "Unboxing dan first impression",
    ],
    "Food & Cooking": [
      "Recipe video step-by-step",
      "Restaurant review dan food recommendation",
      "Meal prep ideas",
      "Cooking tips dan kitchen hacks",
    ],
    Travel: [
      "Travel vlog dan destination guide",
      "Budget travel tips",
      "Hidden gems dan local recommendation",
      "Packing tips dan travel essentials",
    ],
    "Business & Entrepreneurship": [
      "Tips bisnis dan strategi growth",
      "Behind the scene bisnis",
      "Success story dan lessons learned",
      "Productivity tips dan tools recommendation",
    ],
    Entertainment: [
      "Konten hiburan dan comedy",
      "Review film/series/musik",
      "Trending topic dan pop culture",
      "Challenge dan trend participation",
    ],
    Education: [
      "Educational content sesuai expertise",
      "Tips dan tricks yang useful",
      "Myth-busting dan fact-checking",
      "Q&A session dengan audience",
    ],
  };

  // Add suggestions based on niches
  niches.forEach((niche) => {
    const nicheSuggestion = nicheSuggestions[niche];
    if (nicheSuggestion) {
      suggestions.push(...nicheSuggestion.slice(0, 2));
    }
  });

  // Add general suggestions based on interests
  if (interests.length > 0) {
    suggestions.push(
      `Konten seputar ${interests.slice(0, 3).join(", ")} yang sedang trending`,
      `Kolaborasi dengan creator di niche ${interests[0]}`,
      `Behind the scene atau day-in-my-life content`
    );
  }

  // Remove duplicates and limit
  return [...new Set(suggestions)].slice(0, 8);
}

// Build comprehensive context for chat including statistics
async function buildComprehensiveContext(
  sessionId: string,
  relevantProfiles: Array<{
    username: string;
    score: number;
    metadata: ProfileMetadata;
  }>
): Promise<string> {
  const stats = await getComprehensiveStats(sessionId);
  const profileContext = await buildContextFromProfiles(relevantProfiles);

  const statsContext = `
=== STATISTIK DATA FOLLOWERS ===

Total Profiles Scraped: ${stats.totalProfiles}

--- DISTRIBUSI NICHE (Top 10) ---
${stats.nicheDistribution
  .slice(0, 10)
  .map((n, i) => `${i + 1}. ${n.niche}: ${n.count} profiles (${n.percentage}%)`)
  .join("\n")}

--- DISTRIBUSI MINAT/INTEREST (Top 15) ---
${stats.interestDistribution
  .slice(0, 15)
  .map(
    (i, idx) =>
      `${idx + 1}. ${i.interest}: ${i.count} profiles (${i.percentage}%)`
  )
  .join("\n")}

--- STATISTIK FOLLOWERS ---
- Total Followers: ${stats.followerStats.total.toLocaleString()}
- Rata-rata Followers: ${stats.followerStats.average.toLocaleString()}
- Median Followers: ${stats.followerStats.median.toLocaleString()}
- Min Followers: ${stats.followerStats.min.toLocaleString()}
- Max Followers: ${stats.followerStats.max.toLocaleString()}

--- AKUN STATS ---
- Akun Verified: ${stats.verifiedCount} (${Math.round(
    (stats.verifiedCount / stats.totalProfiles) * 100
  )}%)
- Akun Private: ${stats.privateCount} (${Math.round(
    (stats.privateCount / stats.totalProfiles) * 100
  )}%)

--- TOP 10 PROFILES BY FOLLOWERS ---
${stats.topProfilesByFollowers
  .map(
    (p, i) =>
      `${i + 1}. @${p.username} - ${p.followers.toLocaleString()} followers (${
        p.niche
      })`
  )
  .join("\n")}

--- SARAN KONTEN BERDASARKAN DATA ---
${stats.contentSuggestions.map((s, i) => `${i + 1}. ${s}`).join("\n")}

=== PROFILE RELEVAN DENGAN PERTANYAAN ===
${profileContext || "Tidak ada profile spesifik yang relevan."}
`;

  return statsContext;
}

// Enhanced chat function with comprehensive context
export async function chat(
  messages: ChatMessage[],
  sessionId?: string
): Promise<{
  response: string;
  sources: ProfileSource[];
}> {
  // Get the last user message for context search
  const lastUserMessage = [...messages]
    .reverse()
    .find((m) => m.role === "user");

  if (!lastUserMessage) {
    return {
      response: "Silakan ajukan pertanyaan tentang data Instagram profiles.",
      sources: [],
    };
  }

  if (!sessionId) {
    return {
      response: "Session tidak ditemukan. Silakan login ulang.",
      sources: [],
    };
  }

  // Search for relevant profiles (for specific profile questions)
  let relevantProfiles: Array<{
    username: string;
    score: number;
    metadata: ProfileMetadata;
  }> = [];

  try {
    relevantProfiles = await searchRelevantProfiles(
      lastUserMessage.content,
      sessionId,
      5
    );
  } catch (error) {
    // If Qdrant search fails, continue with just stats
    console.error("Qdrant search error:", error);
  }

  // Build comprehensive context including statistics
  const context = await buildComprehensiveContext(sessionId, relevantProfiles);

  // Generate response with context
  const response = await chatWithContext(
    messages.map((m) => ({ role: m.role, content: m.content })),
    context
  );

  // Build sources
  const sources: ProfileSource[] = relevantProfiles.map((profile) => ({
    username: profile.username,
    relevance: profile.score,
    snippet: profile.metadata.bio || profile.metadata.niche || "No description",
  }));

  return { response, sources };
}

// Legacy function for API compatibility
export async function getProfileStats(sessionId: string): Promise<{
  totalProfiles: number;
  nicheDistribution: Record<string, number>;
  averageFollowers: number;
  topInterests: Array<{ interest: string; count: number }>;
}> {
  const stats = await getComprehensiveStats(sessionId);

  const nicheDistribution: Record<string, number> = {};
  stats.nicheDistribution.forEach((n) => {
    nicheDistribution[n.niche] = n.count;
  });

  return {
    totalProfiles: stats.totalProfiles,
    nicheDistribution,
    averageFollowers: stats.followerStats.average,
    topInterests: stats.interestDistribution.slice(0, 10).map((i) => ({
      interest: i.interest,
      count: i.count,
    })),
  };
}

export async function findSimilarProfiles(
  username: string,
  topK: number = 5
): Promise<
  Array<{
    username: string;
    score: number;
    metadata: ProfileMetadata;
  }>
> {
  await connectDB();

  // Get the profile
  const profile = await Profile.findOne({ username }).lean();

  if (!profile) {
    throw new Error(`Profile ${username} not found`);
  }

  // Build search text from profile
  const searchText = [
    profile.bio || "",
    (profile.interests || []).join(" "),
    profile.niche || "",
  ].join(" ");

  // Search for similar profiles
  const results = await searchRelevantProfiles(
    searchText,
    profile.sessionId,
    topK + 1
  );

  // Filter out the original profile
  return results.filter((r) => r.username !== username).slice(0, topK);
}

// Get followers of a specific account (entry point)
export async function getFollowersAnalysis(
  entryUsername: string,
  sessionId: string
): Promise<{
  entryProfile: {
    username: string;
    fullName: string;
    followersCount: number;
  } | null;
  followersStats: {
    total: number;
    nicheDistribution: Array<{
      niche: string;
      count: number;
      percentage: number;
    }>;
    interestDistribution: Array<{
      interest: string;
      count: number;
      percentage: number;
    }>;
  };
}> {
  await connectDB();

  // Get entry point profile
  const entryProfile = await Profile.findOne({
    username: entryUsername,
    sessionId,
  }).lean();

  // Get all followers (profiles with parentUsername = entryUsername)
  const followers = await Profile.find({
    parentUsername: entryUsername,
    sessionId,
  }).lean();

  if (followers.length === 0) {
    return {
      entryProfile: entryProfile
        ? {
            username: entryProfile.username,
            fullName: entryProfile.fullName,
            followersCount: entryProfile.followersCount,
          }
        : null,
      followersStats: {
        total: 0,
        nicheDistribution: [],
        interestDistribution: [],
      },
    };
  }

  // Calculate niche distribution
  const nicheCounts: Record<string, number> = {};
  followers.forEach((f) => {
    const niche = f.niche || "Unknown";
    nicheCounts[niche] = (nicheCounts[niche] || 0) + 1;
  });

  const nicheDistribution = Object.entries(nicheCounts)
    .map(([niche, count]) => ({
      niche,
      count,
      percentage: Math.round((count / followers.length) * 100 * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  // Calculate interest distribution
  const interestCounts: Record<string, number> = {};
  followers.forEach((f) => {
    (f.interests || []).forEach((interest) => {
      interestCounts[interest] = (interestCounts[interest] || 0) + 1;
    });
  });

  const interestDistribution = Object.entries(interestCounts)
    .map(([interest, count]) => ({
      interest,
      count,
      percentage: Math.round((count / followers.length) * 100 * 10) / 10,
    }))
    .sort((a, b) => b.count - a.count);

  return {
    entryProfile: entryProfile
      ? {
          username: entryProfile.username,
          fullName: entryProfile.fullName,
          followersCount: entryProfile.followersCount,
        }
      : null,
    followersStats: {
      total: followers.length,
      nicheDistribution,
      interestDistribution,
    },
  };
}
