import { generateEmbedding } from "./localEmbeddings";
import { chatWithContext } from "./openai";
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

// Query type detection for followers/following queries
type QueryType =
  | 'list_followers'
  | 'list_following'
  | 'following_niche'
  | 'followers_following_niche'
  | 'general';

interface QueryInfo {
  type: QueryType;
  username: string | null;
  page: number;
}

function detectQueryType(message: string): QueryInfo {
  // Extract username pattern: @username or "akun X" or just username after certain keywords
  const usernamePatterns = [
    /@([\w.]+)/i,
    /akun\s+([\w.]+)/i,
    /username\s+([\w.]+)/i,
    /following\s+([\w.]+)/i,
    /followers\s+(?:dari\s+)?([\w.]+)/i,
  ];

  let username: string | null = null;
  for (const pattern of usernamePatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      username = match[1];
      break;
    }
  }

  // Extract page number
  const pageMatch = message.match(/halaman\s+(\d+)|page\s+(\d+)/i);
  const page = pageMatch ? parseInt(pageMatch[1] || pageMatch[2]) : 1;

  // Detect query patterns - order matters (more specific patterns first)

  // Pattern: "followers X kebanyakan mem-follow niche apa" or "niche yang difollow followers X"
  if (/followers.*mem-?follow.*niche|niche.*difollow.*followers|apa\s+yang\s+difollow.*followers|followers.*follow.*akun.*niche/i.test(message)) {
    return { type: 'followers_following_niche', username, page };
  }

  // Pattern: "akun X suka follow niche apa" or "niche apa yang difollow akun X"
  if (/niche\s+apa.*following|follow.*niche\s+apa|suka\s+follow.*niche|niche.*yang.*difollow|following.*niche/i.test(message)) {
    return { type: 'following_niche', username, page };
  }

  // Pattern: "followers X siapa saja" or "daftar followers X"
  if (/followers\s+.*\s+siapa|siapa\s+saja\s+followers|daftar\s+followers|list\s+followers/i.test(message)) {
    return { type: 'list_followers', username, page };
  }

  // Pattern: "following X siapa saja" or "daftar following X"
  if (/following\s+.*\s+siapa|siapa\s+saja.*following|daftar\s+following|list\s+following|lanjutkan.*following/i.test(message)) {
    return { type: 'list_following', username, page };
  }

  return { type: 'general', username, page };
}

// Get paginated list of followers or following
export async function getRelationshipContext(
  username: string,
  type: 'followers' | 'following',
  sessionId: string,
  page: number = 1,
  pageSize: number = 100
): Promise<string> {
  await connectDB();

  // Try to find profile with sessionId first, then without
  let profile = await Profile.findOne({ username, sessionId }).lean();
  if (!profile) {
    profile = await Profile.findOne({ username }).lean();
  }

  if (!profile) {
    return `Profile @${username} tidak ditemukan dalam database.`;
  }

  const accountList = type === 'followers'
    ? (profile.followers || [])
    : (profile.following || []);

  const total = accountList.length;

  if (total === 0) {
    return `@${username} tidak memiliki data ${type} yang tersimpan.`;
  }

  const totalPages = Math.ceil(total / pageSize);
  const startIdx = (page - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, total);
  const paginatedAccounts = accountList.slice(startIdx, endIdx);

  return `
=== DAFTAR ${type.toUpperCase()} @${username} ===
Total: ${total.toLocaleString()} akun
Halaman: ${page} dari ${totalPages} (${pageSize} akun per halaman)

${type === 'followers' ? 'Followers' : 'Following'} (${startIdx + 1}-${endIdx}):
${paginatedAccounts.map(acc => `@${acc}`).join(', ')}

${page < totalPages ? `[Untuk melihat halaman berikutnya, tanyakan "lanjutkan daftar ${type} ${username} halaman ${page + 1}"]` : '[Ini adalah halaman terakhir]'}
`;
}

// Analyze niche distribution of accounts that a user follows
export async function getFollowingNicheAnalysis(
  username: string,
  sessionId: string
): Promise<string> {
  await connectDB();

  // Try to find profile with sessionId first, then without
  let profile = await Profile.findOne({ username, sessionId }).lean();
  if (!profile) {
    profile = await Profile.findOne({ username }).lean();
  }

  if (!profile) {
    return `Profile @${username} tidak ditemukan dalam database.`;
  }

  const followingList = profile.following || [];

  if (followingList.length === 0) {
    return `@${username} tidak memiliki data following yang tersimpan.`;
  }

  // Use MongoDB aggregation to analyze niche distribution
  const nicheAggregation = await Profile.aggregate([
    { $match: { username: { $in: followingList } } },
    { $group: {
        _id: '$niche',
        count: { $sum: 1 },
        sampleAccounts: { $push: '$username' }
    }},
    { $sort: { count: -1 } },
    { $project: {
        niche: '$_id',
        count: 1,
        sampleAccounts: { $slice: ['$sampleAccounts', 5] }
    }}
  ]);

  const interestAggregation = await Profile.aggregate([
    { $match: { username: { $in: followingList } } },
    { $unwind: '$interests' },
    { $group: { _id: '$interests', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 15 }
  ]);

  const analyzedCount = await Profile.countDocuments({ username: { $in: followingList } });
  const totalFollowing = followingList.length;

  if (analyzedCount === 0) {
    return `@${username} mem-follow ${totalFollowing} akun, namun tidak ada yang ditemukan di database untuk dianalisis.`;
  }

  const nicheDistribution = nicheAggregation.map((n) => ({
    ...n,
    percentage: Math.round((n.count / analyzedCount) * 100 * 10) / 10
  }));

  const interestDistribution = interestAggregation.map(i => ({
    interest: i._id,
    count: i.count,
    percentage: Math.round((i.count / analyzedCount) * 100 * 10) / 10
  }));

  return `
=== ANALISIS NICHE FOLLOWING @${username} ===
Total Following: ${totalFollowing.toLocaleString()} akun
Ditemukan di Database: ${analyzedCount.toLocaleString()} akun (${Math.round((analyzedCount / totalFollowing) * 100 * 10) / 10}%)

--- DISTRIBUSI NICHE YANG DIFOLLOW ---
${nicheDistribution.map((n, i) =>
  `${i + 1}. ${n.niche || 'Unknown'}: ${n.count} akun (${n.percentage}%) - ${n.sampleAccounts.map((a: string) => '@' + a).join(', ')}`
).join('\n')}

--- TOP 15 INTERESTS ---
${interestDistribution.map((i, idx) =>
  `${idx + 1}. ${i.interest}: ${i.count} mentions (${i.percentage}%)`
).join('\n')}
`;
}

// Analyze what niches followers of an account tend to follow
export async function getFollowersFollowingNicheAnalysis(
  entryUsername: string,
  sessionId: string
): Promise<string> {
  await connectDB();

  // Get followers of entry account (profiles with parentUsername = entryUsername)
  const followers = await Profile.find({
    parentUsername: entryUsername,
    sessionId
  }).lean();

  if (followers.length === 0) {
    return `Tidak ada data followers dari @${entryUsername} yang tersimpan dalam session ini.`;
  }

  // Collect all following from all followers
  const allFollowing: string[] = [];
  const followersWithData: string[] = [];

  followers.forEach(f => {
    if (f.following && f.following.length > 0) {
      allFollowing.push(...f.following);
      followersWithData.push(f.username);
    }
  });

  if (allFollowing.length === 0) {
    return `Followers @${entryUsername} tidak memiliki data following yang tersimpan.`;
  }

  // Count frequency of each followed account
  const followCounts: Record<string, number> = {};
  allFollowing.forEach(username => {
    followCounts[username] = (followCounts[username] || 0) + 1;
  });

  const uniqueFollowed = Object.keys(followCounts);

  // Aggregate niche distribution
  const nicheAggregation = await Profile.aggregate([
    { $match: { username: { $in: uniqueFollowed } } },
    { $group: {
        _id: '$niche',
        uniqueAccounts: { $sum: 1 },
        accounts: { $push: '$username' }
    }},
    { $sort: { uniqueAccounts: -1 } }
  ]);

  // Enhance with follow counts
  const nicheDistribution = nicheAggregation.map(n => {
    const totalFollowsForNiche = n.accounts.reduce((sum: number, acc: string) =>
      sum + (followCounts[acc] || 0), 0);
    const topAccounts = n.accounts
      .map((acc: string) => ({ username: acc, count: followCounts[acc] || 0 }))
      .sort((a: {count: number}, b: {count: number}) => b.count - a.count)
      .slice(0, 5);

    return {
      niche: n._id || 'Unknown',
      totalFollows: totalFollowsForNiche,
      uniqueAccounts: n.uniqueAccounts,
      topAccounts
    };
  }).sort((a, b) => b.totalFollows - a.totalFollows);

  const totalFollows = Object.values(followCounts).reduce((a, b) => a + b, 0);
  const foundInDb = await Profile.countDocuments({ username: { $in: uniqueFollowed } });

  if (foundInDb === 0) {
    return `Followers @${entryUsername} mem-follow ${uniqueFollowed.length} unique akun, namun tidak ada yang ditemukan di database untuk dianalisis.`;
  }

  return `
=== ANALISIS AGREGAT: APA YANG DIFOLLOW OLEH FOLLOWERS @${entryUsername} ===

Entry Account: @${entryUsername}
Total Followers: ${followers.length.toLocaleString()} akun
Followers dengan Data Following: ${followersWithData.length.toLocaleString()} akun (${Math.round((followersWithData.length / followers.length) * 100 * 10) / 10}%)

--- RINGKASAN ---
Total Unique Akun yang Difollow: ${uniqueFollowed.length.toLocaleString()} akun
Ditemukan di Database: ${foundInDb.toLocaleString()} akun (${Math.round((foundInDb / uniqueFollowed.length) * 100 * 10) / 10}%)

--- DISTRIBUSI NICHE YANG PALING BANYAK DIFOLLOW ---
${nicheDistribution.slice(0, 10).map((n, i) =>
  `${i + 1}. ${n.niche}: ${n.totalFollows.toLocaleString()} follows dari ${n.uniqueAccounts} unique akun
   Top: ${n.topAccounts.map((a: {username: string, count: number}) => `@${a.username} (${a.count}x)`).join(', ')}`
).join('\n')}

--- INSIGHT ---
Followers @${entryUsername} paling banyak mem-follow akun dengan niche:
${nicheDistribution.slice(0, 3).map((n, i) =>
  `${i + 1}. ${n.niche} (${Math.round((n.totalFollows / totalFollows) * 100)}%)`
).join('\n')}
`;
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
      const followersList = fullProfile.followers || [];
      const followingList = fullProfile.following || [];

      const profileContext = [
        `--- Profile: @${username} (Relevance: ${(score * 100).toFixed(
          1
        )}%) ---`,
        `Name: ${fullProfile.fullName || "N/A"}`,
        `Bio: ${fullProfile.bio || "N/A"}`,
        `Followers: ${followersList.length} akun${followersList.length > 0 ? ` (sample: ${followersList.slice(0, 20).join(", ")}${followersList.length > 20 ? "..." : ""})` : ""}`,
        `Following: ${followingList.length} akun${followingList.length > 0 ? ` (sample: ${followingList.slice(0, 20).join(", ")}${followingList.length > 20 ? "..." : ""})` : ""}`,
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

  // Detect query type for followers/following queries
  const queryInfo = detectQueryType(lastUserMessage.content);
  let additionalContext = "";

  // Generate additional context based on query type
  if (queryInfo.username) {
    switch (queryInfo.type) {
      case 'list_followers':
        additionalContext = await getRelationshipContext(
          queryInfo.username, 'followers', sessionId, queryInfo.page
        );
        break;
      case 'list_following':
        additionalContext = await getRelationshipContext(
          queryInfo.username, 'following', sessionId, queryInfo.page
        );
        break;
      case 'following_niche':
        additionalContext = await getFollowingNicheAnalysis(queryInfo.username, sessionId);
        break;
      case 'followers_following_niche':
        additionalContext = await getFollowersFollowingNicheAnalysis(queryInfo.username, sessionId);
        break;
    }
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

  // Combine additional context with main context
  const fullContext = additionalContext
    ? `${additionalContext}\n\n${context}`
    : context;

  // Generate response with context
  const response = await chatWithContext(
    messages.map((m) => ({ role: m.role, content: m.content })),
    fullContext
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
