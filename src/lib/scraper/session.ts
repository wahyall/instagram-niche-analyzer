import { Cookie } from 'playwright';
import { InstagramScraper } from './instagram';
import { getSession, invalidateSession } from './auth';

// Pool of active scrapers for reuse
interface ScraperEntry {
  scraper: InstagramScraper;
  lastUsed: Date;
  inUse: boolean;
  useCount: number; // Track number of times acquired for debugging
}

const scraperPool: Map<string, ScraperEntry> = new Map();

// Per-session lock to prevent race conditions when acquiring/releasing scrapers
// Each session has a promise chain that serializes access
const sessionLocks: Map<string, Promise<void>> = new Map();

const MAX_SCRAPER_AGE = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Cleanup old scrapers periodically
setInterval(() => {
  const now = Date.now();
  scraperPool.forEach((entry, sessionId) => {
    if (!entry.inUse && now - entry.lastUsed.getTime() > MAX_SCRAPER_AGE) {
      entry.scraper.close();
      scraperPool.delete(sessionId);
      sessionLocks.delete(sessionId);
    }
  });
}, CLEANUP_INTERVAL);

/**
 * Acquire a lock for a session to prevent race conditions.
 * Returns a release function that must be called when done.
 */
function acquireSessionLock(sessionId: string): Promise<() => void> {
  // Get the current lock promise (or a resolved one if none exists)
  const currentLock = sessionLocks.get(sessionId) || Promise.resolve();
  
  // Create a new promise that will be resolved when we release the lock
  let releaseLock: () => void;
  const newLock = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  
  // Chain our lock after the current one
  sessionLocks.set(sessionId, currentLock.then(() => newLock));
  
  // Wait for the previous lock to release, then return our release function
  return currentLock.then(() => releaseLock!);
}

export async function getScraperForSession(sessionId: string): Promise<InstagramScraper | null> {
  // Acquire lock to prevent race conditions
  const releaseLock = await acquireSessionLock(sessionId);
  
  try {
    // Check if we have an existing scraper that's not in use
    const existing = scraperPool.get(sessionId);
    if (existing && !existing.inUse) {
      existing.inUse = true;
      existing.lastUsed = new Date();
      existing.useCount++;
      console.log(`[Session] Reusing existing scraper for session ${sessionId} (use count: ${existing.useCount})`);
      return existing.scraper;
    }
    
    // If existing scraper is in use, we need to wait or create a new instance
    // For simplicity, we'll wait - the lock mechanism ensures serialized access
    if (existing && existing.inUse) {
      console.log(`[Session] Scraper for session ${sessionId} is in use, waiting...`);
      // Release the lock and retry after a delay
      releaseLock();
      await new Promise(resolve => setTimeout(resolve, 1000));
      return getScraperForSession(sessionId);
    }

    // Get session from database
    const session = await getSession(sessionId);
    if (!session.valid || !session.cookies) {
      console.log(`[Session] Session ${sessionId} is invalid or has no cookies`);
      return null;
    }

    // Create new scraper
    console.log(`[Session] Creating new scraper for session ${sessionId}`);
    const scraper = new InstagramScraper();
    await scraper.init(session.cookies);

    // Store in pool
    scraperPool.set(sessionId, {
      scraper,
      lastUsed: new Date(),
      inUse: true,
      useCount: 1,
    });

    return scraper;
  } finally {
    // Always release the lock
    releaseLock();
  }
}

export function releaseScraperForSession(sessionId: string): void {
  const entry = scraperPool.get(sessionId);
  if (entry) {
    entry.inUse = false;
    entry.lastUsed = new Date();
    console.log(`[Session] Released scraper for session ${sessionId}`);
  }
}

export async function closeScraperForSession(sessionId: string): Promise<void> {
  const releaseLock = await acquireSessionLock(sessionId);
  
  try {
    const entry = scraperPool.get(sessionId);
    if (entry) {
      await entry.scraper.close();
      scraperPool.delete(sessionId);
    }
  } finally {
    releaseLock();
    sessionLocks.delete(sessionId);
  }
}

export async function closeAllScrapers(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  
  scraperPool.forEach((entry) => {
    closePromises.push(entry.scraper.close());
  });

  await Promise.all(closePromises);
  scraperPool.clear();
  sessionLocks.clear();
}

export async function refreshSessionCookies(sessionId: string): Promise<Cookie[] | null> {
  const entry = scraperPool.get(sessionId);
  if (!entry) {
    return null;
  }

  try {
    const cookies = await entry.scraper.getCookies();
    return cookies;
  } catch {
    return null;
  }
}

export async function validateAndRefreshSession(sessionId: string): Promise<boolean> {
  const session = await getSession(sessionId);
  if (!session.valid) {
    return false;
  }

  // Try to get a scraper for this session
  const scraper = await getScraperForSession(sessionId);
  if (!scraper) {
    return false;
  }

  // Check if the scraper is authenticated
  const isAuthenticated = scraper.isAuthenticated();
  
  // Release the scraper
  releaseScraperForSession(sessionId);

  if (!isAuthenticated) {
    await invalidateSession(sessionId);
    return false;
  }

  return true;
}

export function getActiveScraperCount(): number {
  let count = 0;
  scraperPool.forEach((entry) => {
    if (entry.inUse) count++;
  });
  return count;
}

export function getTotalScraperCount(): number {
  return scraperPool.size;
}
