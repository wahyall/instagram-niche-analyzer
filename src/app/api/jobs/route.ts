import { NextRequest, NextResponse } from 'next/server';
import { Job } from '@/lib/db/models';
import connectDB from '@/lib/db/mongodb';
import { getJobCounts } from '@/lib/queue/scrapeQueue';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('ig_session')?.value;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    await connectDB();

    // Get jobs for this session
    const jobs = await Job.find({ sessionId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Get queue stats
    const queueStats = await getJobCounts();

    return NextResponse.json({
      success: true,
      jobs: jobs.map((job) => ({
        jobId: job.jobId,
        entryUsername: job.entryUsername,
        status: job.status,
        maxDepth: job.maxDepth,
        currentDepth: job.currentDepth,
        totalProfiles: job.totalProfiles,
        processedProfiles: job.processedProfiles,
        failedProfiles: job.failedProfiles,
        progress: job.totalProfiles > 0 
          ? Math.round((job.processedProfiles / job.totalProfiles) * 100)
          : 0,
        scrapeFollowers: job.scrapeFollowers,
        scrapeFollowing: job.scrapeFollowing,
        scrapePosts: job.scrapePosts,
        startedAt: job.startedAt,
        completedAt: job.completedAt,
        createdAt: job.createdAt,
        error: job.error,
      })),
      queueStats,
    });
  } catch (error) {
    console.error('Jobs fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

