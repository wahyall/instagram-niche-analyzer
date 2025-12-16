'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Users, TrendingUp, Hash, BarChart3, Loader2 } from 'lucide-react';

interface Stats {
  totalProfiles: number;
  nicheDistribution: Record<string, number>;
  averageFollowers: number;
  topInterests: Array<{ interest: string; count: number }>;
}

export function StatsCards() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/stats');
        const data = await response.json();
        if (data.success) {
          setStats(data.stats);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  const topNiche = stats?.nicheDistribution
    ? Object.entries(stats.nicheDistribution).sort((a, b) => b[1] - a[1])[0]
    : null;

  const topInterest = stats?.topInterests?.[0];
  const nicheCount = stats?.nicheDistribution
    ? Object.keys(stats.nicheDistribution).length
    : 0;

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Total Profiles</p>
              <p className="text-2xl font-bold text-white">
                {stats?.totalProfiles.toLocaleString() || 0}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-purple-500/20 flex items-center justify-center">
              <Users className="h-5 w-5 text-purple-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Avg. Followers</p>
              <p className="text-2xl font-bold text-white">
                {stats?.averageFollowers.toLocaleString() || 0}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-pink-500/20 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-pink-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Top Niche</p>
              <p className="text-lg font-bold text-white truncate max-w-[120px]">
                {topNiche ? topNiche[0] : 'N/A'}
              </p>
              {topNiche && (
                <p className="text-xs text-zinc-500">{topNiche[1]} profiles</p>
              )}
            </div>
            <div className="h-10 w-10 rounded-full bg-orange-500/20 flex items-center justify-center">
              <Hash className="h-5 w-5 text-orange-400" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-zinc-400">Top Interest</p>
              <p className="text-lg font-bold text-white truncate max-w-[120px]">
                {topInterest?.interest || 'N/A'}
              </p>
              {topInterest && (
                <p className="text-xs text-zinc-500">{topInterest.count} profiles</p>
              )}
            </div>
            <div className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center">
              <BarChart3 className="h-5 w-5 text-blue-400" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

