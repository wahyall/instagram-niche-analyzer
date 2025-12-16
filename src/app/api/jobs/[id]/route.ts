import { NextRequest, NextResponse } from 'next/server';
import { Job } from '@/lib/db/models';
import connectDB from '@/lib/db/mongodb';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = request.cookies.get('ig_session')?.value;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;

    await connectDB();

    const job = await Job.findOne({ jobId, sessionId }).lean();

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      job: {
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
      },
    });
  } catch (error) {
    console.error('Job fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sessionId = request.cookies.get('ig_session')?.value;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { id: jobId } = await params;

    await connectDB();

    const job = await Job.findOne({ jobId, sessionId });

    if (!job) {
      return NextResponse.json(
        { success: false, error: 'Job not found' },
        { status: 404 }
      );
    }

    if (job.status === 'processing') {
      // Cancel the job
      job.status = 'cancelled';
      job.completedAt = new Date();
      await job.save();
    }

    return NextResponse.json({
      success: true,
      message: 'Job cancelled',
    });
  } catch (error) {
    console.error('Job cancel error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

