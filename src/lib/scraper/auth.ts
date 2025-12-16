import { Cookie } from "playwright";
import { InstagramScraper } from "./instagram";
import { Session } from "../db/models";
import { encrypt, decrypt, generateSessionId } from "../utils/encryption";
import connectDB from "../db/mongodb";

export interface AuthResult {
  success: boolean;
  sessionId?: string;
  requires2FA?: boolean;
  error?: string;
}

// Store pending 2FA sessions temporarily
const pending2FASessions: Map<string, InstagramScraper> = new Map();

export async function loginToInstagram(
  username: string,
  password: string
): Promise<AuthResult> {
  const scraper = new InstagramScraper();

  try {
    await scraper.init();
    const result = await scraper.login(username, password);

    if (result.requires2FA) {
      // Store scraper for 2FA completion
      const tempSessionId = generateSessionId();
      pending2FASessions.set(tempSessionId, scraper);

      // Clean up after 5 minutes if 2FA not completed
      setTimeout(() => {
        const pendingScraper = pending2FASessions.get(tempSessionId);
        if (pendingScraper) {
          pendingScraper.close();
          pending2FASessions.delete(tempSessionId);
        }
      }, 5 * 60 * 1000);

      return {
        success: false,
        requires2FA: true,
        sessionId: tempSessionId, // Temporary session ID for 2FA
      };
    }

    if (!result.success) {
      await scraper.close();
      return {
        success: false,
        error: result.error || "Login failed",
      };
    }

    // Save session to database
    const sessionId = await saveSession(username, result.cookies!);
    await scraper.close();

    return {
      success: true,
      sessionId,
    };
  } catch (error) {
    await scraper.close();
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function verify2FA(
  tempSessionId: string,
  code: string
): Promise<AuthResult> {
  const scraper = pending2FASessions.get(tempSessionId);

  if (!scraper) {
    return {
      success: false,
      error: "2FA session expired. Please login again.",
    };
  }

  try {
    const result = await scraper.verify2FA(code);

    if (!result.success) {
      return {
        success: false,
        error: result.error || "Invalid 2FA code",
      };
    }

    // Get username from cookies
    const cookies = result.cookies!;
    const dsUserIdCookie = cookies.find((c) => c.name === "ds_user_id");
    const username = dsUserIdCookie?.value || "unknown";

    // Save session to database
    const sessionId = await saveSession(username, cookies);

    // Clean up
    pending2FASessions.delete(tempSessionId);
    await scraper.close();

    return {
      success: true,
      sessionId,
    };
  } catch (error) {
    pending2FASessions.delete(tempSessionId);
    await scraper.close();
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

async function saveSession(
  username: string,
  cookies: Cookie[]
): Promise<string> {
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

export async function getSession(sessionId: string): Promise<{
  valid: boolean;
  username?: string;
  cookies?: Cookie[];
}> {
  await connectDB();

  const session = await Session.findOne({ sessionId, isValid: true });

  if (!session) {
    return { valid: false };
  }

  try {
    const cookies = JSON.parse(decrypt(session.cookies)) as Cookie[];

    // Update last used
    session.lastUsedAt = new Date();
    await session.save();

    return {
      valid: true,
      username: session.username,
      cookies,
    };
  } catch {
    // If decryption fails, invalidate session
    session.isValid = false;
    await session.save();
    return { valid: false };
  }
}

export async function invalidateSession(sessionId: string): Promise<void> {
  await connectDB();
  await Session.updateOne({ sessionId }, { isValid: false });
}

export async function validateSession(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);

  if (!session.valid || !session.cookies) {
    return false;
  }

  // Optionally: verify session is still valid with Instagram
  // This would require making a request to Instagram
  // For now, we just check if the session exists and is not expired

  return true;
}

export async function getActiveSessionForUser(
  username: string
): Promise<string | null> {
  await connectDB();

  const session = await Session.findOne({
    username,
    isValid: true,
    lastUsedAt: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Within 7 days
  });

  return session?.sessionId || null;
}
