import { NextRequest, NextResponse } from 'next/server';
import { Profile, Post } from '@/lib/db/models';
import connectDB from '@/lib/db/mongodb';
import { findSimilarProfiles } from '@/lib/ai/rag';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  try {
    const sessionId = request.cookies.get('ig_session')?.value;

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { username } = await params;

    await connectDB();

    const profile = await Profile.findOne({ username, sessionId }).lean();

    if (!profile) {
      return NextResponse.json(
        { success: false, error: 'Profile not found' },
        { status: 404 }
      );
    }

    // Get posts for this profile
    const posts = await Post.find({ profileId: username })
      .sort({ postedAt: -1 })
      .limit(12)
      .lean();

    // Get similar profiles
    let similarProfiles: Array<{ username: string; score: number }> = [];
    try {
      const similar = await findSimilarProfiles(username, 5);
      similarProfiles = similar.map((p) => ({
        username: p.username,
        score: p.score,
      }));
    } catch {
      // Ignore errors in finding similar profiles
    }

    return NextResponse.json({
      success: true,
      profile: {
        username: profile.username,
        fullName: profile.fullName,
        bio: profile.bio,
        profilePicUrl: profile.profilePicUrl,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        postsCount: profile.postsCount,
        isPrivate: profile.isPrivate,
        isVerified: profile.isVerified,
        externalUrl: profile.externalUrl,
        interests: profile.interests,
        niche: profile.niche,
        scrapedAt: profile.scrapedAt,
        scrapedDepth: profile.scrapedDepth,
        parentUsername: profile.parentUsername,
        followers: profile.followers?.slice(0, 10),
        following: profile.following?.slice(0, 10),
      },
      posts: posts.map((post) => ({
        postId: post.postId,
        shortcode: post.shortcode,
        caption: post.caption,
        imageUrl: post.imageUrl,
        videoUrl: post.videoUrl,
        likesCount: post.likesCount,
        commentsCount: post.commentsCount,
        postedAt: post.postedAt,
        type: post.type,
        isVideo: post.isVideo,
      })),
      similarProfiles,
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

