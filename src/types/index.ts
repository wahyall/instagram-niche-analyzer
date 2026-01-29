// Instagram Session Types
export interface InstagramSession {
  _id?: string;
  sessionId: string;
  username: string;
  cookies: string; // Encrypted
  userAgent: string;
  createdAt: Date;
  lastUsedAt: Date;
  isValid: boolean;
}

// Profile Types
export interface InstagramProfile {
  _id?: string;
  username: string;
  fullName: string;
  bio: string;
  profilePicUrl: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isPrivate: boolean;
  isVerified: boolean;
  externalUrl?: string;
  scrapedAt: Date;
  scrapedDepth: number;
  parentUsername?: string;
  sessionId: string;
  interests: string[];
  niche?: string;
  followers?: string[];
  following?: string[];
}

// Post Types
export interface InstagramPost {
  _id?: string;
  profileId: string;
  postId: string;
  shortcode: string;
  caption: string;
  imageUrl: string;
  videoUrl?: string;
  likesCount: number;
  commentsCount: number;
  postedAt: Date;
  type: 'post' | 'reel' | 'carousel';
  isVideo: boolean;
}

// Scrape Job Types
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface ScrapeJob {
  _id?: string;
  jobId: string;
  sessionId: string;
  entryUsername: string;
  status: JobStatus;
  maxDepth: number;
  currentDepth: number;
  totalProfiles: number;
  processedProfiles: number;
  failedProfiles: number;
  scrapeFollowers: boolean;
  scrapeFollowing: boolean;
  scrapePosts: boolean;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// API Request/Response Types
export interface LoginRequest {
  username: string;
  password: string;
  rememberSession?: boolean;
}

export interface LoginResponse {
  success: boolean;
  sessionId?: string;
  requires2FA?: boolean;
  error?: string;
}

export interface Verify2FARequest {
  code: string;
  sessionId: string;
}

export interface StartScrapeRequest {
  sessionId: string;
  entryUsername: string;
  maxDepth: number;
  scrapeFollowers: boolean;
  scrapeFollowing: boolean;
  scrapePosts: boolean;
}

export interface StartScrapeResponse {
  success: boolean;
  jobId?: string;
  error?: string;
}

// RAG Types
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  sessionId: string;
}

export interface ChatResponse {
  success: boolean;
  message?: string;
  sources?: ProfileSource[];
  error?: string;
}

export interface ProfileSource {
  username: string;
  relevance: number;
  snippet: string;
}

// Embedding Types
export interface ProfileEmbedding {
  id: string;
  values: number[];
  metadata: {
    username: string;
    bio: string;
    interests: string[];
    niche?: string;
    followersCount: number;
  };
}

// Queue Job Data
export interface ScrapeJobData {
  jobId: string;
  sessionId: string;
  username: string;
  depth: number;
  maxDepth: number;
  parentUsername?: string;
  scrapeFollowers: boolean;
  scrapeFollowing: boolean;
  scrapePosts: boolean;
}

// Scraped Data from Instagram
export interface ScrapedProfileData {
  username: string;
  fullName: string;
  bio: string;
  profilePicUrl: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isPrivate: boolean;
  isVerified: boolean;
  externalUrl?: string;
}

export interface ScrapedPostData {
  postId: string;
  shortcode: string;
  caption: string;
  imageUrl: string;
  videoUrl?: string;
  likesCount: number;
  commentsCount: number;
  postedAt: Date;
  type: 'post' | 'reel' | 'carousel';
  isVideo: boolean;
}

// Auth Queue Types
export * from './auth';

