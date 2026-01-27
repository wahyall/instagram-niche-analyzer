'use client';

import { useState, useEffect } from 'react';
import { ProfileCard } from './ProfileCard';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Search, Users, ChevronLeft, ChevronRight } from 'lucide-react';

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

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function ProfilesList() {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [niches, setNiches] = useState<string[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedNiche, setSelectedNiche] = useState<string>('-');
  const [sortBy, setSortBy] = useState('scrapedAt');
  const [sortOrder, setSortOrder] = useState('desc');

  const fetchProfiles = async (page: number = 1) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '20',
        sortBy,
        sortOrder,
      });

      if (search) params.set('search', search);
      if (selectedNiche !== '-') params.set('niche', selectedNiche);

      const response = await fetch(`/api/profiles?${params}`);
      const data = await response.json();

      if (data.success) {
        setProfiles(data.profiles);
        setPagination(data.pagination);
        setNiches(data.niches);
      }
    } catch (error) {
      console.error('Failed to fetch profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, [sortBy, sortOrder, selectedNiche]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchProfiles(1);
  };

  const handlePageChange = (newPage: number) => {
    fetchProfiles(newPage);
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input
              type="text"
              placeholder="Search profiles..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500"
            />
          </div>
          <Button type="submit" className="bg-purple-600 hover:bg-purple-700">
            Search
          </Button>
        </form>

        <div className="flex gap-2">
          <Select value={selectedNiche} onValueChange={setSelectedNiche}>
            <SelectTrigger className="w-[180px] bg-zinc-800 border-zinc-700 text-white">
              <SelectValue placeholder="All Niches" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="-">All Niches</SelectItem>
              {niches.map((niche) => (
                <SelectItem key={niche} value={niche}>
                  {niche}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={setSortBy}>
            <SelectTrigger className="w-[150px] bg-zinc-800 border-zinc-700 text-white">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="scrapedAt">Date Scraped</SelectItem>
              <SelectItem value="followersCount">Followers</SelectItem>
              <SelectItem value="followingCount">Following</SelectItem>
              <SelectItem value="postsCount">Posts</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortOrder} onValueChange={setSortOrder}>
            <SelectTrigger className="w-[120px] bg-zinc-800 border-zinc-700 text-white">
              <SelectValue placeholder="Order" />
            </SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="desc">Descending</SelectItem>
              <SelectItem value="asc">Ascending</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p>No profiles found. Start scraping to see profiles here.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {profiles.map((profile) => (
              <ProfileCard key={profile.username} profile={profile} />
            ))}
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between mt-6">
              <p className="text-sm text-zinc-400">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} profiles
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

