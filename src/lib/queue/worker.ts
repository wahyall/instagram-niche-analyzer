import { Worker, Job } from "bullmq";
import { createNewRedisConnection } from "./redis";
import { addBulkScrapeJobs } from "./scrapeQueue";
import {
  getScraperForSession,
  releaseScraperForSession,
} from "../scraper/session";
import { Profile, Post, Job as JobModel } from "../db/models";
import {
  analyzeAndUpdateProfile,
  createProfileEmbedding,
} from "../ai/embeddings";
import connectDB from "../db/mongodb";
import type { ScrapeJobData, InstagramProfile, InstagramPost } from "@/types";

const QUEUE_NAME = "instagram-scrape";

export function createScrapeWorker(): Worker<ScrapeJobData> {
  const connection = createNewRedisConnection();

  const worker = new Worker<ScrapeJobData>(
    QUEUE_NAME,
    async (job: Job<ScrapeJobData>) => {
      console.log(`Processing job: ${job.id} - Scraping @${job.data.username}`);

      await connectDB();

      const {
        jobId,
        sessionId,
        username,
        depth,
        maxDepth,
        parentUsername,
        scrapeFollowers,
        scrapeFollowing,
        scrapePosts,
      } = job.data;

      // Update job status
      await JobModel.updateOne(
        { jobId },
        {
          status: "processing",
          startedAt: new Date(),
        }
      );

      const scraper = await getScraperForSession(sessionId);
      if (!scraper) {
        throw new Error("Session not found or expired");
      }

      try {
        // Scrape profile
        const profileData = await scraper.scrapeProfile(username);
        if (!profileData) {
          console.log(`Profile @${username} not found or private`);
          await JobModel.updateOne({ jobId }, { $inc: { failedProfiles: 1 } });
          return { success: false, reason: "Profile not found" };
        }

        // Scrape posts if enabled
        let posts: InstagramPost[] = [];
        if (scrapePosts && !profileData.isPrivate) {
          const scrapedPosts = await scraper.scrapePosts(username, 12);
          posts = scrapedPosts.map((p) => ({
            profileId: username,
            ...p,
          }));
        }

        console.log("Profile", profileData);
        console.log("Posts", posts);

        // Analyze interests and niche
        const analysis = await analyzeAndUpdateProfile(
          {
            ...profileData,
            sessionId,
            scrapedAt: new Date(),
            scrapedDepth: depth,
            interests: [],
            followers: [],
            following: [],
          },
          posts
        );

        // Save profile to database
        const profile: InstagramProfile = {
          ...profileData,
          sessionId,
          scrapedAt: new Date(),
          scrapedDepth: depth,
          parentUsername,
          interests: analysis.interests,
          niche: analysis.niche,
          followers: [],
          following: [],
        };

        await Profile.findOneAndUpdate({ username }, profile, {
          upsert: true,
          new: true,
        });

        // Save posts to database
        for (const post of posts) {
          await Post.findOneAndUpdate({ postId: post.postId }, post, {
            upsert: true,
          });
        }

        // Create embedding for RAG
        try {
          await createProfileEmbedding(profile, posts);
        } catch (embeddingError) {
          console.error("Error creating embedding:", embeddingError);
          // Don't fail the job if embedding fails
        }

        // Update job progress
        await JobModel.updateOne(
          { jobId },
          {
            $inc: { processedProfiles: 1 },
            currentDepth: depth,
          }
        );

        // Queue followers and following for scraping if not at max depth
        if (depth < maxDepth && !profileData.isPrivate) {
          const childJobs: ScrapeJobData[] = [];

          if (scrapeFollowers) {
            const followers = await scraper.scrapeFollowers(username, 50);
            profile.followers = followers;

            // Update total profiles count
            await JobModel.updateOne(
              { jobId },
              { $inc: { totalProfiles: followers.length } }
            );

            followers.forEach((follower) => {
              childJobs.push({
                jobId,
                sessionId,
                username: follower,
                depth: depth + 1,
                maxDepth,
                parentUsername: username,
                scrapeFollowers,
                scrapeFollowing,
                scrapePosts,
              });
            });
          }

          if (scrapeFollowing) {
            const following = await scraper.scrapeFollowing(username, 50);
            profile.following = following;

            // Update total profiles count
            await JobModel.updateOne(
              { jobId },
              { $inc: { totalProfiles: following.length } }
            );

            following.forEach((followedUser) => {
              // Avoid duplicates with followers
              if (!childJobs.some((j) => j.username === followedUser)) {
                childJobs.push({
                  jobId,
                  sessionId,
                  username: followedUser,
                  depth: depth + 1,
                  maxDepth,
                  parentUsername: username,
                  scrapeFollowers,
                  scrapeFollowing,
                  scrapePosts,
                });
              }
            });
          }

          // Update profile with followers/following
          await Profile.updateOne(
            { username },
            { followers: profile.followers, following: profile.following }
          );

          // Add child jobs to queue
          if (childJobs.length > 0) {
            await addBulkScrapeJobs(childJobs);
          }
        }

        console.log(`Successfully scraped @${username}`);
        return { success: true, username, depth };
      } finally {
        releaseScraperForSession(sessionId);
      }
    },
    {
      connection,
      concurrency: 2, // Process 2 jobs at a time
      limiter: {
        max: 10,
        duration: 60000, // 10 jobs per minute
      },
    }
  );

  worker.on("completed", async (job) => {
    console.log(`Job ${job.id} completed`);

    // Check if this is the last job for this scrape
    await checkAndCompleteJob(job.data.jobId);
  });

  worker.on("failed", async (job, err) => {
    console.error(`Job ${job?.id} failed:`, err.message);

    if (job) {
      await JobModel.updateOne(
        { jobId: job.data.jobId },
        { $inc: { failedProfiles: 1 } }
      );

      // Check if this is the last job
      await checkAndCompleteJob(job.data.jobId);
    }
  });

  worker.on("error", (err) => {
    console.error("Worker error:", err);
  });

  return worker;
}

async function checkAndCompleteJob(jobId: string): Promise<void> {
  await connectDB();

  const job = await JobModel.findOne({ jobId });
  if (!job) return;

  const totalProcessed = job.processedProfiles + job.failedProfiles;

  // If all profiles have been processed
  if (totalProcessed >= job.totalProfiles && job.totalProfiles > 0) {
    const status =
      job.failedProfiles === job.totalProfiles ? "failed" : "completed";

    await JobModel.updateOne(
      { jobId },
      {
        status,
        completedAt: new Date(),
      }
    );

    console.log(`Scrape job ${jobId} ${status}`);
  }
}

export default createScrapeWorker;
