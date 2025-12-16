'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Users, UserPlus, ImageIcon, Lock, CheckCircle } from 'lucide-react';
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
  interests: string[];
  niche?: string;
  scrapedAt: string;
}

interface ProfileCardProps {
  profile: Profile;
}

export function ProfileCard({ profile }: ProfileCardProps) {
  const formatCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  return (
    <Link href={`/profiles/${profile.username}`}>
      <Card className="bg-zinc-900/50 border-zinc-800 hover:border-purple-500/50 transition-all hover:shadow-lg hover:shadow-purple-500/10 cursor-pointer group">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Avatar className="h-12 w-12 border-2 border-zinc-700 group-hover:border-purple-500 transition-colors">
              <AvatarImage src={profile.profilePicUrl} alt={profile.username} />
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                {profile.username.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-white truncate">
                  @{profile.username}
                </span>
                {profile.isVerified && (
                  <CheckCircle className="h-4 w-4 text-blue-400 flex-shrink-0" />
                )}
                {profile.isPrivate && (
                  <Lock className="h-3 w-3 text-zinc-500 flex-shrink-0" />
                )}
              </div>
              
              {profile.fullName && (
                <p className="text-sm text-zinc-400 truncate">{profile.fullName}</p>
              )}
            </div>
          </div>

          {profile.bio && (
            <p className="mt-3 text-sm text-zinc-400 line-clamp-2">{profile.bio}</p>
          )}

          <div className="mt-3 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1 text-zinc-400">
              <Users className="h-3.5 w-3.5" />
              <span>{formatCount(profile.followersCount)}</span>
            </div>
            <div className="flex items-center gap-1 text-zinc-400">
              <UserPlus className="h-3.5 w-3.5" />
              <span>{formatCount(profile.followingCount)}</span>
            </div>
            <div className="flex items-center gap-1 text-zinc-400">
              <ImageIcon className="h-3.5 w-3.5" />
              <span>{formatCount(profile.postsCount)}</span>
            </div>
          </div>

          {profile.niche && (
            <div className="mt-3">
              <Badge 
                variant="outline" 
                className="bg-purple-500/10 text-purple-400 border-purple-500/30 text-xs"
              >
                {profile.niche}
              </Badge>
            </div>
          )}

          {profile.interests && profile.interests.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1">
              {profile.interests.slice(0, 3).map((interest) => (
                <Badge
                  key={interest}
                  variant="outline"
                  className="bg-zinc-800/50 text-zinc-400 border-zinc-700 text-xs"
                >
                  {interest}
                </Badge>
              ))}
              {profile.interests.length > 3 && (
                <Badge
                  variant="outline"
                  className="bg-zinc-800/50 text-zinc-500 border-zinc-700 text-xs"
                >
                  +{profile.interests.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

