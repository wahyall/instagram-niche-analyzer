import { chromium, Browser, Page, BrowserContext, Cookie } from "playwright";
import type { ScrapedProfileData, ScrapedPostData } from "@/types";

const INSTAGRAM_URL = "https://www.instagram.com";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Rate limiting configuration
const RATE_LIMIT = {
  minDelay: 2000,
  maxDelay: 5000,
  scrollDelay: 1000,
};

function randomDelay(
  min: number = RATE_LIMIT.minDelay,
  max: number = RATE_LIMIT.maxDelay
): Promise<void> {
  const delay = Math.floor(Math.random() * (max - min + 1)) + min;
  return new Promise((resolve) => setTimeout(resolve, delay));
}

export class InstagramScraper {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private isLoggedIn: boolean = false;
  private resourceBlockMode: "login" | "scrape" = "login";

  async init(cookies?: Cookie[]): Promise<void> {
    this.browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--disable-gpu",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: 1280, height: 720 },
      locale: "en-US",
    });

    if (cookies && cookies.length > 0) {
      await this.context.addCookies(cookies);
      this.isLoggedIn = true;
    }

    this.page = await this.context.newPage();

    // Block unnecessary resources (but keep CSS/fonts during login so elements are actually visible/clickable)
    await this.page.route("**/*", (route) => {
      const resourceType = route.request().resourceType();
      // Always block heavy assets
      if (["image", "media"].includes(resourceType)) return route.abort();
      // Only block CSS/fonts after login (scraping mode)
      if (
        this.resourceBlockMode === "scrape" &&
        ["stylesheet", "font"].includes(resourceType)
      ) {
        return route.abort();
      }
      return route.continue();
    });
  }

  async close(): Promise<void> {
    if (this.page) await this.page.close();
    if (this.context) await this.context.close();
    if (this.browser) await this.browser.close();
    this.page = null;
    this.context = null;
    this.browser = null;
    this.isLoggedIn = false;
  }

  async getCookies(): Promise<Cookie[]> {
    if (!this.context) throw new Error("Browser not initialized");
    return this.context.cookies();
  }

  async login(
    username: string,
    password: string
  ): Promise<{
    success: boolean;
    requires2FA: boolean;
    cookies?: Cookie[];
    error?: string;
  }> {
    if (!this.page) throw new Error("Browser not initialized");

    try {
      this.resourceBlockMode = "login";
      await this.page.goto(`${INSTAGRAM_URL}/accounts/login/`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Wait for page to be fully loaded
      await this.page
        .waitForLoadState("networkidle", { timeout: 15000 })
        .catch(() => {});
      await randomDelay(2000, 3000);

      // Accept cookies if dialog appears
      try {
        const cookieButton = await this.page.$(
          'button:has-text("Allow all cookies"), button:has-text("Allow essential and optional cookies")'
        );
        if (cookieButton) {
          await cookieButton.click();
          await randomDelay(1000, 2000);
        }
      } catch {
        // Cookie dialog may not appear
      }

      // Wait for login form to be visible
      try {
        await this.page.waitForSelector('input[name="email"]', {
          timeout: 10000,
        });
      } catch {
        // Try alternate selectors for login form
        await this.page.waitForSelector(
          'input[aria-label="Phone number, username, or email"]',
          { timeout: 5000 }
        );
      }

      // Fill login form
      const usernameInput =
        (await this.page.$('input[name="email"]')) ||
        (await this.page.$(
          'input[aria-label="Phone number, username, or email"]'
        ));
      if (usernameInput) {
        await usernameInput.fill(username);
      } else {
        throw new Error("Username input not found");
      }
      await randomDelay(500, 1000);

      const passwordInput =
        (await this.page.$('input[name="pass"]')) ||
        (await this.page.$('input[aria-label="Password"]'));
      if (passwordInput) {
        await passwordInput.fill(password);
      } else {
        throw new Error("Password input not found");
      }
      await randomDelay(500, 1000);

      // Click login button (locator.click waits for visible/enabled/stable)
      const loginButton = this.page.locator('[data-visualcompletion="ignore"]').first() || this.page.locator('button[type="submit"]').first();

      if (!loginButton) {
        throw new Error("Login button not found");
      }

      await loginButton.waitFor({ state: "visible", timeout: 15000 });

      console.log("[Login] Clicking login button...");
      await loginButton.click({ timeout: 30000 });

      // Instagram often logs in via XHR without a full navigation.
      // Wait for *either* a URL change or a known post-login element / challenge.
      await Promise.race([
        this.page.waitForURL(/two_factor|challenge|accounts\/onetap|\/$/, {
          timeout: 20000,
        }),
        this.page.waitForSelector(
          'svg[aria-label="Home"], a[href="/"], nav[role="navigation"]',
          { timeout: 20000 }
        ),
        this.page.waitForSelector(
          'input[name="verificationCode"], input[name="security_code"]',
          { timeout: 20000 }
        ),
      ]).catch(() => {});

      // Wait for page to stabilize after navigation
      await this.page
        .waitForLoadState("networkidle", { timeout: 15000 })
        .catch(() => {});
      await randomDelay(2000, 3000);

      // Get current URL to determine state
      const currentUrl = this.page.url();

      // Check for 2FA page
      if (
        currentUrl.includes("two_factor") ||
        currentUrl.includes("challenge")
      ) {
        // Wait for 2FA input
        try {
          await this.page.waitForSelector(
            'input[name="verificationCode"], input[name="security_code"]',
            { timeout: 5000 }
          );
          return {
            success: false,
            requires2FA: true,
          };
        } catch {
          // Might be a different challenge type
          return {
            success: false,
            requires2FA: true,
          };
        }
      }

      // Check for login error on the page
      const errorElement = await this.page.$(
        '[data-testid="login-error-message"], #slfErrorAlert, div[role="alert"]'
      );
      if (errorElement) {
        const errorText = await errorElement.textContent();
        return {
          success: false,
          requires2FA: false,
          error: errorText || "Login failed - incorrect credentials",
        };
      }

      // Check if we're on the home page (logged in successfully)
      if (
        currentUrl === `${INSTAGRAM_URL}/` ||
        currentUrl.includes("/accounts/onetap")
      ) {
        this.isLoggedIn = true;
        this.resourceBlockMode = "scrape";
        const cookies = await this.getCookies();
        return {
          success: true,
          requires2FA: false,
          cookies,
        };
      }

      // Alternative check: look for home icon or profile elements
      try {
        await this.page.waitForSelector(
          'svg[aria-label="Home"], a[href="/"], nav[role="navigation"]',
          { timeout: 10000 }
        );
        this.isLoggedIn = true;
        this.resourceBlockMode = "scrape";
        const cookies = await this.getCookies();
        return {
          success: true,
          requires2FA: false,
          cookies,
        };
      } catch {
        // Check one more time for 2FA
        const twoFactorInput = await this.page.$(
          'input[name="verificationCode"], input[name="security_code"]'
        );
        if (twoFactorInput) {
          return {
            success: false,
            requires2FA: true,
          };
        }

        return {
          success: false,
          requires2FA: false,
          error: "Failed to verify login - please check credentials",
        };
      }
    } catch (error) {
      return {
        success: false,
        requires2FA: false,
        error:
          error instanceof Error ? error.message : "Unknown error during login",
      };
    }
  }

  async verify2FA(code: string): Promise<{
    success: boolean;
    cookies?: Cookie[];
    error?: string;
  }> {
    if (!this.page) throw new Error("Browser not initialized");

    console.log("[verify2FA] Starting 2FA verification...");
    try {
      // Find the 2FA input field
      const codeInput =
        (await this.page.$('input[name="verificationCode"]')) ||
        (await this.page.$('input[name="security_code"]')) ||
        (await this.page.$('input[type="number"]'));

      if (!codeInput) {
        return { success: false, error: "2FA input field not found" };
      }

      await codeInput.fill(code);
      await randomDelay(500, 1000);

      // Find and click the confirm/submit button
      const confirmButton =
        (await this.page.$('button[type="button"]:has-text("Confirm")')) ||
        (await this.page.$('button:has-text("Confirm")')) ||
        (await this.page.$('button[type="submit"]'));

      if (!confirmButton) {
        return { success: false, error: "Confirm button not found" };
      }

      // Click and wait for navigation
      await Promise.all([
        this.page
          .waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30000 })
          .catch(() => {}),
        confirmButton.click(),
      ]);

      // Wait for page to stabilize
      await this.page
        .waitForLoadState("networkidle", { timeout: 15000 })
        .catch(() => {});
      await randomDelay(2000, 3000);

      // Get current URL
      const currentUrl = this.page.url();

      // Check if we're on the home page
      if (
        currentUrl === `${INSTAGRAM_URL}/` ||
        currentUrl.includes("/accounts/onetap")
      ) {
        this.isLoggedIn = true;
        const cookies = await this.getCookies();
        return { success: true, cookies };
      }

      // Check for home icon or navigation
      try {
        await this.page.waitForSelector(
          'svg[aria-label="Home"], a[href="/"], nav[role="navigation"]',
          { timeout: 10000 }
        );
        this.isLoggedIn = true;
        const cookies = await this.getCookies();
        return { success: true, cookies };
      } catch {
        // Check for error message
        const errorElement = await this.page.$(
          'div[role="alert"], #slfErrorAlert'
        );
        if (errorElement) {
          const errorText = await errorElement.textContent();
          return { success: false, error: errorText || "Invalid 2FA code" };
        }
        return { success: false, error: "Failed to verify 2FA code" };
      }
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error during 2FA verification",
      };
    }
  }

  async scrapeProfile(username: string): Promise<ScrapedProfileData | null> {
    if (!this.page || !this.isLoggedIn) {
      throw new Error("Not logged in");
    }

    try {
      console.log(`[scrapeProfile] Starting scrape for: ${username}`);

      // Use domcontentloaded instead of networkidle to avoid timeout
      await this.page.goto(`${INSTAGRAM_URL}/${username}/`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      console.log(`[scrapeProfile] Page navigated, waiting for network...`);

      // Wait for page to stabilize (with timeout catch)
      await this.page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {
          console.log("[scrapeProfile] Network idle timeout - continuing...");
        });
      await randomDelay(1500, 2500);

      // Check if profile exists
      const notFound = await this.page.$(
        'h2:has-text("Sorry, this page isn\'t available")'
      );
      if (notFound) {
        console.log("[scrapeProfile] 404 - Page not found");
        return null;
      }

      // Also check for other "not found" indicators
      const pageContent = await this.page.content();
      if (
        pageContent.includes("Sorry, this page isn't available") ||
        pageContent.includes("Page Not Found")
      ) {
        console.log("[scrapeProfile] 404 - Page not found (content check)");
        return null;
      }

      console.log("[scrapeProfile] Profile exists, extracting meta tags...");

      // Extract meta tags using $eval (more reliable than evaluate)
      const getMetaContent = async (selector: string): Promise<string> => {
        try {
          const content = await this.page!.$eval(selector, (el) =>
            el.getAttribute("content")
          );
          return content || "";
        } catch {
          return "";
        }
      };

      const ogDescription = await getMetaContent(
        'meta[property="og:description"]'
      );
      const metaDescription = await getMetaContent('meta[name="description"]');
      const ogTitle = await getMetaContent('meta[property="og:title"]');
      const ogImage = await getMetaContent('meta[property="og:image"]');

      console.log("[scrapeProfile] Meta tags extracted:", {
        ogDescription: ogDescription?.substring(0, 80) + "...",
        ogTitle: ogTitle?.substring(0, 50),
        hasOgImage: !!ogImage,
      });

      // Parse follower counts from description
      const parseCount = (str: string | undefined | null): number => {
        if (!str) return 0;
        try {
          const num = str.replace(/,/g, "");
          if (num.includes("K")) return Math.round(parseFloat(num) * 1000);
          if (num.includes("M")) return Math.round(parseFloat(num) * 1000000);
          if (num.includes("B"))
            return Math.round(parseFloat(num) * 1000000000);
          return parseInt(num, 10) || 0;
        } catch {
          return 0;
        }
      };

      // Extract counts from og:description
      // Format: "698M Followers, 313 Following, 8,272 Posts - See Instagram photos..."
      const followersMatch = ogDescription.match(
        /([\d,.]+[KMB]?)\s*Followers/i
      );
      const followingMatch = ogDescription.match(
        /([\d,.]+[KMB]?)\s*Following/i
      );
      const postsMatch = ogDescription.match(/([\d,.]+[KMB]?)\s*Posts/i);

      console.log("[scrapeProfile] Counts parsed:", {
        followersRaw: followersMatch?.[1],
        followingRaw: followingMatch?.[1],
        postsRaw: postsMatch?.[1],
      });

      // Get full name from og:title
      // Format: "Full Name (@username) • Instagram photos and videos"
      let fullName = "";
      const titleMatch = ogTitle.match(/^(.+?)\s*\(@/);
      if (titleMatch) {
        fullName = titleMatch[1].trim();
      }

      // Get bio from meta description
      // Format: "... on Instagram: "Bio text here""
      let bio = "";
      const bioMatch = metaDescription.match(/on Instagram:\s*"([^"]+)"/);
      if (bioMatch) {
        bio = bioMatch[1];
      }

      // If bio not found in meta, try to extract from page
      if (!bio) {
        try {
          bio = await this.page.evaluate(() => {
            const mainElement = document.querySelector("main");
            if (!mainElement) return "";

            const textContent = mainElement.innerText || "";
            const lines = textContent.split("\n").filter((l) => l.trim());

            for (const line of lines) {
              const trimmed = line.trim();
              if (
                trimmed &&
                !trimmed.match(/^\d/) &&
                !trimmed.match(/posts?$/i) &&
                !trimmed.match(/followers?$/i) &&
                !trimmed.match(/following$/i) &&
                trimmed.length > 5 &&
                trimmed.length < 500 &&
                !trimmed.match(/^(Posts|Reels|Tagged|Related|See all)$/i)
              ) {
                return trimmed;
              }
            }
            return "";
          });
        } catch {
          console.log("[scrapeProfile] Bio fallback extraction failed");
        }
      }

      // Get profile pic - prefer og:image
      let profilePicUrl = ogImage || "";
      if (!profilePicUrl) {
        try {
          profilePicUrl = await this.page.$eval(
            'img[alt*="profile picture"]',
            (el) => el.getAttribute("src") || ""
          );
        } catch {
          profilePicUrl = "";
        }
      }

      // Check if private
      let isPrivate = false;
      try {
        isPrivate = await this.page.evaluate(() => {
          const pageText = document.body.innerText || "";
          return (
            pageText.includes("This Account is Private") ||
            pageText.includes("This account is private")
          );
        });
      } catch {
        isPrivate = false;
      }

      // Check if verified
      let isVerified = false;
      try {
        const verifiedBadge = await this.page.$(
          'svg[aria-label="Verified"], img[alt="Verified"], [title="Verified"]'
        );
        isVerified = !!verifiedBadge;
      } catch {
        isVerified = false;
      }

      // Try to get external URL
      let externalUrl = "";
      try {
        externalUrl = await this.page.evaluate(() => {
          const link = document.querySelector('a[href*="l.instagram.com"]');
          if (link) {
            const href = link.getAttribute("href") || "";
            const match = href.match(/u=([^&]+)/);
            if (match) return decodeURIComponent(match[1]);
          }
          return "";
        });
      } catch {
        externalUrl = "";
      }

      const profileData: ScrapedProfileData = {
        username,
        fullName: fullName || "",
        bio: bio || "",
        profilePicUrl: profilePicUrl || "",
        followersCount: parseCount(followersMatch?.[1]),
        followingCount: parseCount(followingMatch?.[1]),
        postsCount: parseCount(postsMatch?.[1]),
        isPrivate,
        isVerified,
        externalUrl: externalUrl || "",
      };

      console.log("[scrapeProfile] Final profile data:", {
        username: profileData.username,
        fullName: profileData.fullName,
        followersCount: profileData.followersCount,
        followingCount: profileData.followingCount,
        postsCount: profileData.postsCount,
        isVerified: profileData.isVerified,
        hasBio: !!profileData.bio,
        hasProfilePic: !!profileData.profilePicUrl,
      });

      return profileData;
    } catch (error) {
      console.error(
        `[scrapeProfile] Error scraping profile ${username}:`,
        error
      );
      return null;
    }
  }

  async scrapeFollowers(
    username: string
  ): Promise<string[]> {
    if (!this.page || !this.isLoggedIn) {
      throw new Error("Not logged in");
    }

    console.log(`[scrapeFollowers] Starting for ${username}`);

    try {
      await this.page.goto(`${INSTAGRAM_URL}/${username}/`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      console.log("[scrapeFollowers] Page navigated, waiting for network...");

      await this.page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {
          console.log("[scrapeFollowers] Network idle timeout - continuing...");
        });
      await randomDelay(1500, 2500);

      // Click on followers link using text-based selector
      console.log("[scrapeFollowers] Looking for followers link...");
      const followersLink = await this.page.$(
        `a[href*="/${username}/followers"], a:has-text("followers")`
      );

      if (!followersLink) {
        console.log(
          "[scrapeFollowers] Using text-based click for followers..."
        );
        await this.page.click('a:has-text("followers")');
      } else {
        console.log("[scrapeFollowers] Found followers link, clicking...");
        await followersLink.click();
      }

      // Wait for dialog to appear
      console.log("[scrapeFollowers] Waiting for dialog...");
      await this.page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
      await randomDelay();

      // Check if we're prompted to login (not authenticated)
      const loginPrompt = await this.page.$('button:has-text("Log in")');
      if (loginPrompt) {
        console.error(
          "[scrapeFollowers] Login prompt detected - session may be invalid"
        );
        await this.page.keyboard.press("Escape");
        return [];
      }

      console.log("[scrapeFollowers] Dialog opened, starting extraction...");

      const followers: string[] = [];
      let previousCount = 0;
      let retries = 0;
      let lastScrollHeight = 0;
      const excludePaths = [
        "explore",
        "direct",
        "accounts",
        "p",
        "reel",
        "stories",
        "reels",
        "tags",
        "about",
        "help",
      ];

      // Find the scrollable container once using multiple detection strategies
      const scrollContainerFound = await this.page.evaluate(`
        (function() {
          const dialog = document.querySelector('div[role="dialog"]');
          if (!dialog) return { found: false, method: 'no-dialog' };

          function isScrollable(el) {
            const style = window.getComputedStyle(el);
            const overflowY = style.overflowY;
            const overflow = style.overflow;
            const hasScrollOverflow =
              overflowY === 'scroll' ||
              overflowY === 'auto' ||
              overflow === 'scroll' ||
              overflow === 'auto' ||
              (typeof overflow === 'string' && overflow.includes('scroll')) ||
              (typeof overflow === 'string' && overflow.includes('auto'));
            const hasScrollableContent = el.scrollHeight > el.clientHeight + 10;
            return hasScrollOverflow && hasScrollableContent;
          }

          const scrollables = dialog.querySelectorAll("div");
          for (const el of scrollables) {
            if (isScrollable(el)) {
              el.setAttribute("data-scroll-container", "true");
              return { found: true, method: 'overflow-style' };
            }
          }

          let bestCandidate = null;
          let maxScrollDiff = 0;
          for (const el of scrollables) {
            const scrollDiff = el.scrollHeight - el.clientHeight;
            if (scrollDiff > 50 && scrollDiff > maxScrollDiff) {
              maxScrollDiff = scrollDiff;
              bestCandidate = el;
            }
          }
          if (bestCandidate) {
            bestCandidate.setAttribute("data-scroll-container", "true");
            return { found: true, method: 'max-scroll-height' };
          }

          return { found: false, method: 'none-found' };
        })()
      `);

      console.log(`[scrapeFollowers] Scroll container detection: ${JSON.stringify(scrollContainerFound)}`);

      while (retries < 15) {
        // Scroll the dialog incrementally using multiple strategies
        const scrollResult = await this.page.evaluate(`
          (function() {
            function scrollElement(el) {
              const prevScrollTop = el.scrollTop;
              el.scrollTop = el.scrollTop + 600;
              const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
              return {
                scrolled: el.scrollTop !== prevScrollTop,
                atEnd: atEnd,
                scrollHeight: el.scrollHeight
              };
            }

            const markedEl = document.querySelector('[data-scroll-container="true"]');
            if (markedEl) {
              return scrollElement(markedEl);
            }

            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return { scrolled: false, atEnd: true, scrollHeight: 0 };

            const scrollables = dialog.querySelectorAll("div");
            for (const el of scrollables) {
              if (el.scrollHeight > el.clientHeight + 50) {
                const prevScrollTop = el.scrollTop;
                el.scrollTop = el.scrollTop + 600;
                if (el.scrollTop !== prevScrollTop) {
                  el.setAttribute("data-scroll-container", "true");
                  const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
                  return { 
                    scrolled: true, 
                    atEnd: atEnd, 
                    scrollHeight: el.scrollHeight 
                  };
                }
              }
            }

            return { scrolled: false, atEnd: true, scrollHeight: 0 };
          })()
        `) as { scrolled: boolean; atEnd: boolean; scrollHeight: number };

        // If JS scroll didn't work, try keyboard scroll
        if (!scrollResult.scrolled) {
          console.log("[scrapeFollowers] JS scroll failed, trying keyboard scroll...");
          // Focus the dialog and use Page Down
          await this.page.keyboard.press("PageDown");
          await this.page.waitForTimeout(300);
        }

        // Wait for network activity after scrolling (Instagram loads more on scroll)
        if (scrollResult.scrolled) {
          // Wait for potential loading spinner to appear and disappear
          try {
            await this.page.waitForSelector('div[role="dialog"] [data-visualcompletion="loading-state"]', { 
              timeout: 500 
            }).catch(() => {});
            await this.page.waitForSelector('div[role="dialog"] [data-visualcompletion="loading-state"]', { 
              state: "hidden", 
              timeout: 3000 
            }).catch(() => {});
          } catch {
            // Loading spinner might not appear
          }

          // Also wait for network to settle
          await this.page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
        }

        // Additional delay to let content render
        await this.page.waitForTimeout(RATE_LIMIT.scrollDelay + 500);

        // Extract usernames using $$eval for better reliability
        let newUsernames: string[] = [];
        try {
          newUsernames = await this.page.$$eval(
            'div[role="dialog"] a[href^="/"]',
            function(links, args) {
              const { excludeList, targetUser } = args as { excludeList: string[]; targetUser?: string };
              const names: string[] = [];
              links.forEach(function(link) {
                const href = link.getAttribute("href");
                if (!href) return;

                const match = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
                if (match) {
                  const extractedUsername = match[1];
                  if (
                    extractedUsername &&
                    !excludeList.includes(extractedUsername.toLowerCase()) &&
                    extractedUsername !== targetUser &&
                    !names.includes(extractedUsername)
                  ) {
                    names.push(extractedUsername);
                  }
                }
              });
              return names;
            },
            { excludeList: excludePaths, targetUser: username }
          );
        } catch (e) {
          console.log("[scrapeFollowers] Error extracting usernames:", e);
          newUsernames = [];
        }

        // Add new unique usernames
        newUsernames.forEach((u) => {
          if (!followers.includes(u)) {
            followers.push(u);
          }
        });

        // Check if we've reached the end of the list
        const scrollHeightUnchanged = scrollResult.scrollHeight === lastScrollHeight;
        lastScrollHeight = scrollResult.scrollHeight;

        if (followers.length === previousCount) {
          retries++;
          // If at end of list and no new followers, we're done
          if (scrollResult.atEnd && scrollHeightUnchanged) {
            console.log("[scrapeFollowers] Reached end of followers list");
            break;
          }
          console.log(
            `[scrapeFollowers] No new followers found, retry ${retries}/15`
          );
        } else {
          retries = 0;
          previousCount = followers.length;
          console.log(
            `[scrapeFollowers] Found ${followers.length} followers so far...`
          );
        }

        await randomDelay(800, 1500);
      }

      // Close dialog
      console.log("[scrapeFollowers] Closing dialog...");
      await this.page.keyboard.press("Escape");
      await randomDelay(300, 500);

      const result = followers;
      console.log(
        `[scrapeFollowers] Complete. Extracted ${result.length} followers`
      );

      return result;
    } catch (error) {
      console.error(
        `[scrapeFollowers] Error scraping followers for ${username}:`,
        error
      );
      return [];
    }
  }

  async scrapeFollowing(
    username: string
  ): Promise<string[]> {
    if (!this.page || !this.isLoggedIn) {
      throw new Error("Not logged in");
    }

    console.log(`[scrapeFollowing] Starting for ${username}`);

    try {
      await this.page.goto(`${INSTAGRAM_URL}/${username}/`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      console.log("[scrapeFollowing] Page navigated, waiting for network...");

      await this.page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {
          console.log("[scrapeFollowing] Network idle timeout - continuing...");
        });
      await randomDelay(1500, 2500);

      // Click on following link using text-based selector
      console.log("[scrapeFollowing] Looking for following link...");
      const followingLink = await this.page.$(
        `a[href*="/${username}/following"], a:has-text("following")`
      );

      if (!followingLink) {
        console.log(
          "[scrapeFollowing] Using text-based click for following..."
        );
        await this.page.click('a:has-text("following")');
      } else {
        console.log("[scrapeFollowing] Found following link, clicking...");
        await followingLink.click();
      }

      // Wait for dialog to appear
      console.log("[scrapeFollowing] Waiting for dialog...");
      await this.page.waitForSelector('div[role="dialog"]', { timeout: 10000 });
      await randomDelay();

      // Check if we're prompted to login (not authenticated)
      const loginPrompt = await this.page.$('button:has-text("Log in")');
      if (loginPrompt) {
        console.error(
          "[scrapeFollowing] Login prompt detected - session may be invalid"
        );
        await this.page.keyboard.press("Escape");
        return [];
      }

      console.log("[scrapeFollowing] Dialog opened, starting extraction...");

      const following: string[] = [];
      let previousCount = 0;
      let retries = 0;
      let lastScrollHeight = 0;
      const excludePaths = [
        "explore",
        "direct",
        "accounts",
        "p",
        "reel",
        "stories",
        "reels",
        "tags",
        "about",
        "help",
      ];

      // Find the scrollable container once using multiple detection strategies
      const scrollContainerFound = await this.page.evaluate(`
        (function() {
          const dialog = document.querySelector('div[role="dialog"]');
          if (!dialog) return { found: false, method: 'no-dialog' };

          function isScrollable(el) {
            const style = window.getComputedStyle(el);
            const overflowY = style.overflowY;
            const overflow = style.overflow;
            const hasScrollOverflow =
              overflowY === 'scroll' ||
              overflowY === 'auto' ||
              overflow === 'scroll' ||
              overflow === 'auto' ||
              (typeof overflow === 'string' && overflow.includes('scroll')) ||
              (typeof overflow === 'string' && overflow.includes('auto'));
            const hasScrollableContent = el.scrollHeight > el.clientHeight + 10;
            return hasScrollOverflow && hasScrollableContent;
          }

          const scrollables = dialog.querySelectorAll("div");
          for (const el of scrollables) {
            if (isScrollable(el)) {
              el.setAttribute("data-scroll-container", "true");
              return { found: true, method: 'overflow-style' };
            }
          }

          let bestCandidate = null;
          let maxScrollDiff = 0;
          for (const el of scrollables) {
            const scrollDiff = el.scrollHeight - el.clientHeight;
            if (scrollDiff > 50 && scrollDiff > maxScrollDiff) {
              maxScrollDiff = scrollDiff;
              bestCandidate = el;
            }
          }
          if (bestCandidate) {
            bestCandidate.setAttribute("data-scroll-container", "true");
            return { found: true, method: 'max-scroll-height' };
          }

          return { found: false, method: 'none-found' };
        })()
      `);

      console.log(`[scrapeFollowing] Scroll container detection: ${JSON.stringify(scrollContainerFound)}`);

      while (retries < 15) {
        // Scroll the dialog incrementally using multiple strategies
        const scrollResult = await this.page.evaluate(`
          (function() {
            function scrollElement(el) {
              const prevScrollTop = el.scrollTop;
              el.scrollTop = el.scrollTop + 600;
              const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
              return {
                scrolled: el.scrollTop !== prevScrollTop,
                atEnd: atEnd,
                scrollHeight: el.scrollHeight
              };
            }

            const markedEl = document.querySelector('[data-scroll-container="true"]');
            if (markedEl) {
              return scrollElement(markedEl);
            }

            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return { scrolled: false, atEnd: true, scrollHeight: 0 };

            const scrollables = dialog.querySelectorAll("div");
            for (const el of scrollables) {
              if (el.scrollHeight > el.clientHeight + 50) {
                const prevScrollTop = el.scrollTop;
                el.scrollTop = el.scrollTop + 600;
                if (el.scrollTop !== prevScrollTop) {
                  el.setAttribute("data-scroll-container", "true");
                  const atEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - 10;
                  return { 
                    scrolled: true, 
                    atEnd: atEnd, 
                    scrollHeight: el.scrollHeight 
                  };
                }
              }
            }

            return { scrolled: false, atEnd: true, scrollHeight: 0 };
          })()
        `) as { scrolled: boolean; atEnd: boolean; scrollHeight: number };

        // If JS scroll didn't work, try keyboard scroll
        if (!scrollResult.scrolled) {
          console.log("[scrapeFollowing] JS scroll failed, trying keyboard scroll...");
          // Focus the dialog and use Page Down
          await this.page.keyboard.press("PageDown");
          await this.page.waitForTimeout(2000);
        }

        // Wait for network activity after scrolling (Instagram loads more on scroll)
        if (scrollResult.scrolled) {
          // Wait for potential loading spinner to appear and disappear
          try {
            await this.page.waitForSelector('div[role="dialog"] svg[aria-label="Loading..."]', { 
              timeout: 500 
            }).catch(() => {});
            await this.page.waitForSelector('div[role="dialog"] svg[aria-label="Loading..."]', { 
              state: "hidden", 
              timeout: 3000 
            }).catch(() => {});
          } catch {
            // Loading spinner might not appear
          }

          // Also wait for network to settle
          await this.page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
        }

        // Additional delay to let content render
        await this.page.waitForTimeout(RATE_LIMIT.scrollDelay + 500);

        // Extract usernames using $$eval for better reliability
        let newUsernames: string[] = [];
        try {
          newUsernames = await this.page.$$eval(
            'div[role="dialog"] a[href^="/"]',
            function(links, args) {
              const { excludeList, targetUser } = args as { excludeList: string[]; targetUser: string };
              const names: string[] = [];
              links.forEach(function(link) {
                const href = link.getAttribute("href");
                if (!href) return;

                const match = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
                if (match) {
                  const extractedUsername = match[1];
                  if (
                    extractedUsername &&
                    !excludeList.includes(extractedUsername.toLowerCase()) &&
                    extractedUsername !== targetUser &&
                    !names.includes(extractedUsername)
                  ) {
                    names.push(extractedUsername);
                  }
                }
              });
              return names;
            },
            { excludeList: excludePaths, targetUser: username }
          );
        } catch (e) {
          console.log("[scrapeFollowing] Error extracting usernames:", e);
          newUsernames = [];
        }

        // Add new unique usernames
        newUsernames.forEach((u) => {
          if (!following.includes(u)) {
            following.push(u);
          }
        });

        // Check if we've reached the end of the list
        const scrollHeightUnchanged = scrollResult.scrollHeight === lastScrollHeight;
        lastScrollHeight = scrollResult.scrollHeight;

        if (following.length === previousCount) {
          retries++;
          // If at end of list and no new following, we're done
          if (scrollResult.atEnd && scrollHeightUnchanged) {
            console.log("[scrapeFollowing] Reached end of following list");
            break;
          }
          console.log(
            `[scrapeFollowing] No new following found, retry ${retries}/15`
          );
        } else {
          retries = 0;
          previousCount = following.length;
          console.log(
            `[scrapeFollowing] Found ${following.length} following so far...`
          );
        }

        await randomDelay(800, 1500);
      }

      // Close dialog
      console.log("[scrapeFollowing] Closing dialog...");
      await this.page.keyboard.press("Escape");
      await randomDelay(300, 500);

      const result = following;
      console.log(
        `[scrapeFollowing] Complete. Extracted ${result.length} following`
      );

      return result;
    } catch (error) {
      console.error(
        `[scrapeFollowing] Error scraping following for ${username}:`,
        error
      );
      return [];
    }
  }

  async scrapePosts(
    username: string,
    limit: number = 12
  ): Promise<ScrapedPostData[]> {
    if (!this.page || !this.isLoggedIn) {
      throw new Error("Not logged in");
    }

    console.log(`[scrapePosts] Starting for ${username}, limit: ${limit}`);

    try {
      await this.page.goto(`${INSTAGRAM_URL}/${username}/`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      console.log("[scrapePosts] Page navigated, waiting for network...");

      await this.page
        .waitForLoadState("networkidle", { timeout: 10000 })
        .catch(() => {
          console.log("[scrapePosts] Network idle timeout - continuing...");
        });
      await randomDelay(1500, 2500);

      // Get post and reel links using $$eval for better reliability
      console.log("[scrapePosts] Extracting post links...");
      let allLinks: string[] = [];

      try {
        allLinks = await this.page.$$eval(
          'a[href*="/p/"], a[href*="/reel/"]',
          function(links, maxPosts) {
            const hrefs: string[] = [];
            const seenShortcodes = new Set<string>();

            links.forEach(function(link) {
              const href = link.getAttribute("href");
              if (!href || hrefs.length >= maxPosts) return;

              const match = href.match(/\/(p|reel)\/([^/]+)/);
              if (match) {
                const shortcode = match[2];
                if (!seenShortcodes.has(shortcode)) {
                  seenShortcodes.add(shortcode);
                  hrefs.push(href);
                }
              }
            });

            return hrefs;
          },
          limit
        );
      } catch (e) {
        console.log("[scrapePosts] Error extracting post links:", e);
        allLinks = [];
      }

      console.log(`[scrapePosts] Found ${allLinks.length} post links`);

      const posts: ScrapedPostData[] = [];

      // Helper function to get meta content
      const getMetaContent = async (selector: string): Promise<string> => {
        try {
          const content = await this.page!.$eval(selector, (el) =>
            el.getAttribute("content")
          );
          return content || "";
        } catch {
          return "";
        }
      };

      for (let i = 0; i < Math.min(allLinks.length, limit); i++) {
        const link = allLinks[i];
        console.log(
          `[scrapePosts] Processing post ${i + 1}/${Math.min(
            allLinks.length,
            limit
          )}: ${link}`
        );

        try {
          // Construct full URL
          const fullUrl = link.startsWith("http")
            ? link
            : `${INSTAGRAM_URL}${link.startsWith("/") ? "" : "/"}${link}`;

          await this.page.goto(fullUrl, {
            waitUntil: "domcontentloaded",
            timeout: 30000,
          });

          await this.page
            .waitForLoadState("networkidle", { timeout: 8000 })
            .catch(() => {});
          await randomDelay(1000, 2000);

          // Extract meta tags individually for better reliability
          const ogDescription = await getMetaContent(
            'meta[property="og:description"]'
          );
          const metaDescription = await getMetaContent(
            'meta[name="description"]'
          );
          const imageUrl = await getMetaContent('meta[property="og:image"]');
          const videoUrl = await getMetaContent('meta[property="og:video"]');

          // Extract shortcode from URL
          const shortcodeMatch = link.match(/\/(p|reel)\/([^/]+)/);
          const shortcode = shortcodeMatch ? shortcodeMatch[2] : "";
          const isReel = link.includes("/reel/");

          // Extract caption from meta description
          let caption = "";
          const captionMatch =
            metaDescription.match(/on Instagram:\s*"([^"]+)"/) ||
            ogDescription.match(/:\s*"([^"]+)"/) ||
            metaDescription.match(/: "([^"]+)"/);
          if (captionMatch) {
            caption = captionMatch[1];
          } else {
            caption = ogDescription || metaDescription || "";
          }

          // Check for carousel and get engagement metrics
          let isCarousel = false;
          let likes = 0;
          let comments = 0;

          try {
            const pageInfo = await this.page.evaluate(() => {
              const isCarousel =
                document.querySelector('[aria-label="Next"]') !== null ||
                document.querySelector('[aria-label="Go to next slide"]') !==
                  null;

              const pageText = document.body.innerText || "";
              const likesMatch = pageText.match(
                /([\d,]+)\s*(?:likes?|views?)/i
              );
              const commentsMatch = pageText.match(/([\d,]+)\s*comments?/i);

              return {
                isCarousel,
                likes: likesMatch
                  ? parseInt(likesMatch[1].replace(/,/g, ""), 10) || 0
                  : 0,
                comments: commentsMatch
                  ? parseInt(commentsMatch[1].replace(/,/g, ""), 10) || 0
                  : 0,
              };
            });

            isCarousel = pageInfo.isCarousel;
            likes = pageInfo.likes;
            comments = pageInfo.comments;
          } catch (e) {
            console.log(
              `[scrapePosts] Error getting page info for ${shortcode}:`,
              e
            );
          }

          // Determine post type
          let type: "post" | "reel" | "carousel" = "post";
          if (isReel) {
            type = "reel";
          } else if (isCarousel) {
            type = "carousel";
          }

          if (shortcode) {
            const postData: ScrapedPostData = {
              postId: shortcode,
              shortcode,
              caption,
              imageUrl,
              videoUrl,
              likesCount: likes,
              commentsCount: comments,
              postedAt: new Date(),
              type,
              isVideo: isReel || !!videoUrl,
            };

            posts.push(postData);
            console.log(
              `[scrapePosts] Extracted post ${shortcode}: type=${type}, likes=${likes}`
            );
          }
        } catch (error) {
          console.error(`[scrapePosts] Error scraping post ${link}:`, error);
        }
      }

      console.log(`[scrapePosts] Complete. Extracted ${posts.length} posts`);
      return posts;
    } catch (error) {
      console.error(
        `[scrapePosts] Error scraping posts for ${username}:`,
        error
      );
      return [];
    }
  }

  isAuthenticated(): boolean {
    return this.isLoggedIn;
  }
}

export default InstagramScraper;
