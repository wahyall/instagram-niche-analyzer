import { Worker, Job } from "bullmq";
import { Cookie } from "playwright";
import { createNewRedisConnection } from "./redis";
import { getAuthJobState, setAuthJobState } from "./authQueue";
import { InstagramScraper } from "../scraper/instagram";
import { Session } from "../db/models";
import { encrypt, generateSessionId } from "../utils/encryption";
import connectDB from "../db/mongodb";
import type { AuthJobData, AuthJobState } from "@/types";

const QUEUE_NAME = "instagram-auth";

// Store pending 2FA sessions (scraper instances waiting for 2FA code)
const pendingAuthSessions: Map<string, InstagramScraper> = new Map();

// Cleanup timer for pending sessions
const cleanupTimers: Map<string, NodeJS.Timeout> = new Map();

function scheduleSessionCleanup(authJobId: string, scraper: InstagramScraper): void {
  // Clean up after 5 minutes if 2FA not completed
  const timer = setTimeout(async () => {
    const pendingScraper = pendingAuthSessions.get(authJobId);
    if (pendingScraper) {
      console.log(`[AuthWorker] Cleaning up expired 2FA session: ${authJobId}`);
      await pendingScraper.close();
      pendingAuthSessions.delete(authJobId);
    }
    cleanupTimers.delete(authJobId);
  }, 5 * 60 * 1000);

  cleanupTimers.set(authJobId, timer);
}

function cancelSessionCleanup(authJobId: string): void {
  const timer = cleanupTimers.get(authJobId);
  if (timer) {
    clearTimeout(timer);
    cleanupTimers.delete(authJobId);
  }
}

async function saveSession(username: string, cookies: Cookie[]): Promise<string> {
  await connectDB();

  const sessionId = generateSessionId();
  const encryptedCookies = encrypt(JSON.stringify(cookies));

  // Remove existing sessions for this username
  await Session.deleteMany({ username });

  // Create new session
  await Session.create({
    sessionId,
    username,
    cookies: encryptedCookies,
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    createdAt: new Date(),
    lastUsedAt: new Date(),
    isValid: true,
  });

  return sessionId;
}

async function processLoginJob(job: Job<AuthJobData>): Promise<void> {
  const { authJobId, username, password } = job.data;

  console.log(`[AuthWorker] Processing login for: ${username}`);

  // Update state to processing
  const currentState = await getAuthJobState(authJobId);
  if (!currentState) {
    throw new Error("Auth job state not found");
  }

  await setAuthJobState({
    ...currentState,
    status: "processing",
    updatedAt: Date.now(),
  });

  const scraper = new InstagramScraper();

  try {
    await scraper.init();
    const result = await scraper.login(username, password!);

    if (result.requires2FA) {
      console.log(`[AuthWorker] 2FA required for: ${username}`);

      // Store scraper for 2FA completion
      pendingAuthSessions.set(authJobId, scraper);
      scheduleSessionCleanup(authJobId, scraper);

      // Update state to waiting_2fa
      await setAuthJobState({
        ...currentState,
        status: "waiting_2fa",
        result: {
          success: false,
          requires2FA: true,
        },
        updatedAt: Date.now(),
      });

      return;
    }

    if (!result.success) {
      console.log(`[AuthWorker] Login failed for: ${username} - ${result.error}`);
      await scraper.close();

      await setAuthJobState({
        ...currentState,
        status: "failed",
        result: {
          success: false,
          error: result.error || "Login failed",
        },
        updatedAt: Date.now(),
      });

      return;
    }

    // Login successful - save session
    console.log(`[AuthWorker] Login successful for: ${username}`);
    const sessionId = await saveSession(username, result.cookies!);
    await scraper.close();

    await setAuthJobState({
      ...currentState,
      status: "completed",
      result: {
        success: true,
        sessionId,
      },
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error(`[AuthWorker] Login error for ${username}:`, error);
    await scraper.close();

    await setAuthJobState({
      ...currentState,
      status: "failed",
      result: {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      updatedAt: Date.now(),
    });
  }
}

async function process2FAJob(job: Job<AuthJobData>): Promise<void> {
  const { authJobId, code } = job.data;

  console.log(`[AuthWorker] Processing 2FA verification for job: ${authJobId}`);

  const scraper = pendingAuthSessions.get(authJobId);
  if (!scraper) {
    // Check if there's a state we can update
    const currentState = await getAuthJobState(authJobId);
    if (currentState) {
      await setAuthJobState({
        ...currentState,
        status: "failed",
        result: {
          success: false,
          error: "2FA session expired. Please login again.",
        },
        updatedAt: Date.now(),
      });
    }
    return;
  }

  const currentState = await getAuthJobState(authJobId);
  if (!currentState) {
    await scraper.close();
    pendingAuthSessions.delete(authJobId);
    cancelSessionCleanup(authJobId);
    throw new Error("Auth job state not found");
  }

  await setAuthJobState({
    ...currentState,
    status: "processing",
    updatedAt: Date.now(),
  });

  try {
    const result = await scraper.verify2FA(code!);

    if (!result.success) {
      console.log(`[AuthWorker] 2FA verification failed: ${result.error}`);

      await setAuthJobState({
        ...currentState,
        status: "waiting_2fa", // Keep waiting for another attempt
        result: {
          success: false,
          requires2FA: true,
          error: result.error || "Invalid 2FA code",
        },
        updatedAt: Date.now(),
      });

      return;
    }

    // 2FA successful - save session
    console.log(`[AuthWorker] 2FA verification successful`);

    // Get username from cookies
    const cookies = result.cookies!;
    const dsUserIdCookie = cookies.find((c) => c.name === "ds_user_id");
    const username = dsUserIdCookie?.value || "unknown";

    const sessionId = await saveSession(username, cookies);

    // Clean up
    pendingAuthSessions.delete(authJobId);
    cancelSessionCleanup(authJobId);
    await scraper.close();

    await setAuthJobState({
      ...currentState,
      status: "completed",
      result: {
        success: true,
        sessionId,
      },
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error(`[AuthWorker] 2FA error:`, error);

    await setAuthJobState({
      ...currentState,
      status: "failed",
      result: {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      updatedAt: Date.now(),
    });

    // Clean up on error
    pendingAuthSessions.delete(authJobId);
    cancelSessionCleanup(authJobId);
    await scraper.close();
  }
}

export function createAuthWorker(): Worker<AuthJobData> {
  const connection = createNewRedisConnection();

  const worker = new Worker<AuthJobData>(
    QUEUE_NAME,
    async (job: Job<AuthJobData>) => {
      const { type } = job.data;

      if (type === "login") {
        await processLoginJob(job);
      } else if (type === "verify-2fa") {
        await process2FAJob(job);
      } else {
        throw new Error(`Unknown auth job type: ${type}`);
      }
    },
    {
      connection,
      concurrency: 1, // Process one auth job at a time
    }
  );

  worker.on("completed", (job) => {
    console.log(`[AuthWorker] Job ${job.id} completed`);
  });

  worker.on("failed", (job, err) => {
    console.error(`[AuthWorker] Job ${job?.id} failed:`, err.message);
  });

  worker.on("error", (err) => {
    console.error("[AuthWorker] Worker error:", err);
  });

  return worker;
}

export default createAuthWorker;
