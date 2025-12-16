import { NextRequest, NextResponse } from 'next/server';
import { Profile } from '@/lib/db/models';
import connectDB from '@/lib/db/mongodb';

export async function GET(request: NextRequest) {
  try {
    const sessionId = request.cookies.get('ig_session')?.value;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    const niche = searchParams.get('niche') || '';
    const sortBy = searchParams.get('sortBy') || 'scrapedAt';
    const sortOrder = searchParams.get('sortOrder') === 'asc' ? 1 : -1;

    await connectDB();

    // Build query
    const query: Record<string, unknown> = { sessionId };

    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { fullName: { $regex: search, $options: 'i' } },
        { bio: { $regex: search, $options: 'i' } },
      ];
    }

    if (niche) {
      query.niche = niche;
    }

    // Get total count
    const total = await Profile.countDocuments(query);

    // Get profiles
    const profiles = await Profile.find(query)
      .sort({ [sortBy]: sortOrder })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Get unique niches for filtering
    const niches = await Profile.distinct('niche', { sessionId });

    return NextResponse.json({
      success: true,
      profiles: profiles.map((profile) => ({
        username: profile.username,
        fullName: profile.fullName,
        bio: profile.bio,
        profilePicUrl: profile.profilePicUrl,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        postsCount: profile.postsCount,
        isPrivate: profile.isPrivate,
        isVerified: profile.isVerified,
        interests: profile.interests,
        niche: profile.niche,
        scrapedAt: profile.scrapedAt,
        scrapedDepth: profile.scrapedDepth,
        parentUsername: profile.parentUsername,
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      niches: niches.filter(Boolean),
    });
  } catch (error) {
    console.error('Profiles fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

