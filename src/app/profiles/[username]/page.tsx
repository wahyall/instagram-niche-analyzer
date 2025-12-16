'use client';

import { useState, useEffect, use } from 'react';
import { useSession } from '@/hooks/useSession';
import { Header } from '@/components/dashboard/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  Users, 
  UserPlus, 
  ImageIcon, 
  Lock, 
  CheckCircle, 
  ExternalLink,
  ArrowLeft,
  Calendar,
  Heart,
  MessageCircle
} from 'lucide-react';
import Link from 'next/link';

interface Profile {
  username: string;
  fullName: string;
  bio: string;
  profilePicUrl: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  isPrivate: boolean;
  isVerified: boolean;
  externalUrl?: string;
  interests: string[];
  niche?: string;
  scrapedAt: string;
  scrapedDepth: number;
  parentUsername?: string;
  followers?: string[];
  following?: string[];
}

interface Post {
  postId: string;
  shortcode: string;
  caption: string;
  imageUrl: string;
  likesCount: number;
  commentsCount: number;
  postedAt: string;
  type: 'post' | 'reel' | 'carousel';
  isVideo: boolean;
}

export default function ProfileDetailPage({ params }: { params: Promise<{ username: string }> }) {
  const resolvedParams = use(params);
  const { loading: sessionLoading } = useSession(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [similarProfiles, setSimilarProfiles] = useState<Array<{ username: string; score: number }>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const response = await fetch(`/api/profiles/${resolvedParams.username}`);
        const data = await response.json();

        if (data.success) {
          setProfile(data.profile);
          setPosts(data.posts);
          setSimilarProfiles(data.similarProfiles);
        } else {
          setError(data.error || 'Failed to load profile');
        }
      } catch (err) {
        setError('Connection error');
      } finally {
        setLoading(false);
      }
    };

    if (!sessionLoading) {
      fetchProfile();
    }
  }, [resolvedParams.username, sessionLoading]);

  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-zinc-950">
        <Header />
        <main className="container mx-auto px-4 py-8">
          <div className="text-center py-12">
            <p className="text-red-400">{error || 'Profile not found'}</p>
            <Link href="/profiles">
              <Button variant="outline" className="mt-4">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Profiles
              </Button>
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <Link href="/profiles">
          <Button variant="ghost" className="mb-6 text-zinc-400 hover:text-white">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Profiles
          </Button>
        </Link>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Profile Info */}
          <Card className="lg:col-span-1 bg-zinc-900/50 border-zinc-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <Avatar className="h-24 w-24 mx-auto border-4 border-zinc-700">
                  <AvatarImage src={profile.profilePicUrl} alt={profile.username} />
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white text-2xl">
                    {profile.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

                <div className="mt-4 flex items-center justify-center gap-2">
                  <h1 className="text-xl font-bold text-white">@{profile.username}</h1>
                  {profile.isVerified && (
                    <CheckCircle className="h-5 w-5 text-blue-400" />
                  )}
                  {profile.isPrivate && (
                    <Lock className="h-4 w-4 text-zinc-500" />
                  )}
                </div>

                {profile.fullName && (
                  <p className="text-zinc-400">{profile.fullName}</p>
                )}

                <a
                  href={`https://instagram.com/${profile.username}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-sm text-purple-400 hover:text-purple-300"
                >
                  View on Instagram
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="mt-6 grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-xl font-bold text-white">{formatCount(profile.followersCount)}</p>
                  <p className="text-xs text-zinc-500">Followers</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{formatCount(profile.followingCount)}</p>
                  <p className="text-xs text-zinc-500">Following</p>
                </div>
                <div>
                  <p className="text-xl font-bold text-white">{formatCount(profile.postsCount)}</p>
                  <p className="text-xs text-zinc-500">Posts</p>
                </div>
              </div>

              {profile.bio && (
                <div className="mt-6 p-4 bg-zinc-800/50 rounded-lg">
                  <p className="text-sm text-zinc-300 whitespace-pre-wrap">{profile.bio}</p>
                </div>
              )}

              {profile.niche && (
                <div className="mt-4">
                  <p className="text-xs text-zinc-500 mb-2">Niche</p>
                  <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/30">
                    {profile.niche}
                  </Badge>
                </div>
              )}

              {profile.interests && profile.interests.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs text-zinc-500 mb-2">Interests</p>
                  <div className="flex flex-wrap gap-2">
                    {profile.interests.map((interest) => (
                      <Badge
                        key={interest}
                        variant="outline"
                        className="bg-zinc-800/50 text-zinc-400 border-zinc-700"
                      >
                        {interest}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 pt-4 border-t border-zinc-800 text-xs text-zinc-500">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Scraped: {formatDate(profile.scrapedAt)}
                </div>
                {profile.parentUsername && (
                  <p className="mt-1">
                    From: <Link href={`/profiles/${profile.parentUsername}`} className="text-purple-400 hover:underline">@{profile.parentUsername}</Link>
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Posts and Similar Profiles */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recent Posts */}
            <Card className="bg-zinc-900/50 border-zinc-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <ImageIcon className="h-5 w-5 text-purple-400" />
                  Recent Posts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {posts.length === 0 ? (
                  <p className="text-zinc-500 text-center py-8">No posts available</p>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {posts.map((post) => (
                      <div key={post.postId} className="relative group">
                        <div className="aspect-square bg-zinc-800 rounded-lg overflow-hidden">
                          {post.imageUrl ? (
                            <img
                              src={post.imageUrl}
                              alt={post.caption?.slice(0, 50) || 'Post'}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-zinc-600" />
                            </div>
                          )}
                        </div>
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-4">
                          <div className="flex items-center gap-1 text-white text-sm">
                            <Heart className="h-4 w-4" />
                            {formatCount(post.likesCount)}
                          </div>
                          <div className="flex items-center gap-1 text-white text-sm">
                            <MessageCircle className="h-4 w-4" />
                            {formatCount(post.commentsCount)}
                          </div>
                        </div>
                        {post.type === 'reel' && (
                          <Badge className="absolute top-2 right-2 bg-pink-500 text-white text-xs">
                            Reel
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Similar Profiles */}
            {similarProfiles.length > 0 && (
              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardHeader>
                  <CardTitle className="text-white flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-400" />
                    Similar Profiles
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    {similarProfiles.map((similar) => (
                      <Link key={similar.username} href={`/profiles/${similar.username}`}>
                        <Badge
                          variant="outline"
                          className="bg-zinc-800/50 text-zinc-300 border-zinc-700 hover:bg-zinc-700 cursor-pointer"
                        >
                          @{similar.username}
                          <span className="ml-1 text-zinc-500">
                            ({Math.round(similar.score * 100)}%)
                          </span>
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

