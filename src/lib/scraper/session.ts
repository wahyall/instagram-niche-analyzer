import { Cookie } from 'playwright';
import { InstagramScraper } from './instagram';
import { getSession, invalidateSession } from './auth';

// Pool of active scrapers for reuse
const scraperPool: Map<string, {
  scraper: InstagramScraper;
  lastUsed: Date;
  inUse: boolean;
}> = new Map();

const MAX_SCRAPER_AGE = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Cleanup old scrapers periodically
setInterval(() => {
  const now = Date.now();
  scraperPool.forEach((entry, sessionId) => {
    if (!entry.inUse && now - entry.lastUsed.getTime() > MAX_SCRAPER_AGE) {
      entry.scraper.close();
      scraperPool.delete(sessionId);
    }
  });
}, CLEANUP_INTERVAL);

export async function getScraperForSession(sessionId: string): Promise<InstagramScraper | null> {
  // Check if we have an existing scraper
  const existing = scraperPool.get(sessionId);
  if (existing && !existing.inUse) {
    existing.inUse = true;
    existing.lastUsed = new Date();
    return existing.scraper;
  }

  // Get session from database
  const session = await getSession(sessionId);
  if (!session.valid || !session.cookies) {
    return null;
  }

  // Create new scraper
  const scraper = new InstagramScraper();
  await scraper.init(session.cookies);

  // Store in pool
  scraperPool.set(sessionId, {
    scraper,
    lastUsed: new Date(),
    inUse: true,
  });

  return scraper;
}

export function releaseScraperForSession(sessionId: string): void {
  const entry = scraperPool.get(sessionId);
  if (entry) {
    entry.inUse = false;
    entry.lastUsed = new Date();
  }
}

export async function closeScraperForSession(sessionId: string): Promise<void> {
  const entry = scraperPool.get(sessionId);
  if (entry) {
    await entry.scraper.close();
    scraperPool.delete(sessionId);
  }
}

export async function closeAllScrapers(): Promise<void> {
  const closePromises: Promise<void>[] = [];
  
  scraperPool.forEach((entry) => {
    closePromises.push(entry.scraper.close());
  });

  await Promise.all(closePromises);
  scraperPool.clear();
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

