import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { z } from "zod";
import { getSession } from "@/lib/scraper/auth";
import { addScrapeJob } from "@/lib/queue/scrapeQueue";
import { Job } from "@/lib/db/models";
import connectDB from "@/lib/db/mongodb";

const scrapeSchema = z.object({
  entryUsername: z
    .string()
    .min(1, "Username is required")
    .regex(/^[a-zA-Z0-9._]+$/, "Invalid username format"),
  maxDepth: z.number().int().min(0).max(3).default(1),
  scrapeFollowers: z.boolean().default(true),
  scrapeFollowing: z.boolean().default(false),
  scrapePosts: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get("ig_session")?.value;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Validate session
    const session = await getSession(sessionId);
    if (!session.valid) {
      return NextResponse.json(
        { success: false, error: "Session expired" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const {
      entryUsername,
      maxDepth,
      scrapeFollowers,
      scrapeFollowing,
      scrapePosts,
    } = scrapeSchema.parse(body);

    await connectDB();

    // Check for existing active job
    const existingJob = await Job.findOne({
      sessionId,
      status: { $in: ["pending", "processing"] },
    });

    if (existingJob) {
      existingJob.status = "cancelled";
      existingJob.completedAt = new Date();
      await existingJob.save();
      return NextResponse.json(
        {
          success: false,
          error:
            "A scrape job is already running. Please wait for it to complete.",
          jobId: existingJob.jobId,
        },
        { status: 409 }
      );
    }

    // Create new job
    const jobId = uuidv4();

    await Job.create({
      jobId,
      sessionId,
      entryUsername,
      status: "pending",
      maxDepth,
      currentDepth: 0,
      totalProfiles: 1, // Start with entry profile
      processedProfiles: 0,
      failedProfiles: 0,
      scrapeFollowers,
      scrapeFollowing,
      scrapePosts,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Add initial scrape job to queue
    await addScrapeJob({
      jobId,
      sessionId,
      username: entryUsername,
      depth: 0,
      maxDepth,
      scrapeFollowers,
      scrapeFollowing,
      scrapePosts,
    });

    return NextResponse.json({
      success: true,
      jobId,
      message: `Started scraping @${entryUsername}`,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation error",
          details: error.issues,
        },
        { status: 400 }
      );
    }

    console.error("Scrape error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
