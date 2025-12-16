'use client';

import { useState, useEffect } from 'react';
import { useSession } from '@/hooks/useSession';
import { Header } from '@/components/dashboard/Header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { 
  Loader2, 
  Clock, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  User,
  Trash2
} from 'lucide-react';

interface Job {
  jobId: string;
  entryUsername: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  maxDepth: number;
  currentDepth: number;
  totalProfiles: number;
  processedProfiles: number;
  failedProfiles: number;
  progress: number;
  scrapeFollowers: boolean;
  scrapeFollowing: boolean;
  scrapePosts: boolean;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export default function JobsPage() {
  const { loading: sessionLoading } = useSession(true);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    try {
      const response = await fetch('/api/jobs');
      const data = await response.json();
      if (data.success) {
        setJobs(data.jobs);
      }
    } catch (error) {
      console.error('Failed to fetch jobs:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionLoading) {
      fetchJobs();
      
      const interval = setInterval(() => {
        if (jobs.some((job) => job.status === 'processing' || job.status === 'pending')) {
          fetchJobs();
        }
      }, 5000);

      return () => clearInterval(interval);
    }
  }, [sessionLoading]);

  const handleCancelJob = async (jobId: string) => {
    try {
      await fetch(`/api/jobs/${jobId}`, { method: 'DELETE' });
      fetchJobs();
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const getStatusIcon = (status: Job['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-5 w-5 text-yellow-400" />;
      case 'processing':
        return <Loader2 className="h-5 w-5 text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-400" />;
      case 'failed':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'cancelled':
        return <AlertTriangle className="h-5 w-5 text-orange-400" />;
    }
  };

  const getStatusBadge = (status: Job['status']) => {
    const variants: Record<Job['status'], string> = {
      pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
      processing: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      completed: 'bg-green-500/20 text-green-400 border-green-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30',
      cancelled: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
    };

    return (
      <Badge variant="outline" className={variants[status]}>
        {getStatusIcon(status)}
        <span className="ml-1 capitalize">{status}</span>
      </Badge>
    );
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const calculateDuration = (startedAt?: string, completedAt?: string) => {
    if (!startedAt) return 'N/A';
    const start = new Date(startedAt);
    const end = completedAt ? new Date(completedAt) : new Date();
    const diff = Math.floor((end.getTime() - start.getTime()) / 1000);
    
    if (diff < 60) return `${diff}s`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ${diff % 60}s`;
    return `${Math.floor(diff / 3600)}h ${Math.floor((diff % 3600) / 60)}m`;
  };

  if (sessionLoading || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-white">Jobs</h1>
            <p className="text-zinc-400 mt-1">
              Monitor dan manage scraping jobs
            </p>
          </div>
          <Button
            variant="outline"
            onClick={fetchJobs}
            className="bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {jobs.length === 0 ? (
          <Card className="bg-zinc-900/50 border-zinc-800">
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 mx-auto mb-3 text-zinc-600" />
              <p className="text-zinc-500">No jobs yet. Start scraping from the dashboard.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {jobs.map((job) => (
              <Card key={job.jobId} className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-4">
                      <div className="h-12 w-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                        <User className="h-6 w-6 text-white" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-white">@{job.entryUsername}</h3>
                        <p className="text-sm text-zinc-400">
                          Created: {formatDate(job.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(job.status)}
                      {(job.status === 'pending' || job.status === 'processing') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleCancelJob(job.jobId)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-900/20"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {(job.status === 'processing' || job.status === 'pending') && (
                    <div className="mt-4 space-y-2">
                      <div className="flex justify-between text-sm text-zinc-400">
                        <span>Progress</span>
                        <span>{job.processedProfiles} / {job.totalProfiles} profiles ({job.progress}%)</span>
                      </div>
                      <Progress value={job.progress} className="h-2 bg-zinc-700" />
                    </div>
                  )}

                  <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-zinc-500">Max Depth</p>
                      <p className="text-white">{job.maxDepth}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Current Depth</p>
                      <p className="text-white">{job.currentDepth}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Processed</p>
                      <p className="text-white">{job.processedProfiles}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Failed</p>
                      <p className={job.failedProfiles > 0 ? 'text-red-400' : 'text-white'}>
                        {job.failedProfiles}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {job.scrapeFollowers && (
                      <Badge variant="outline" className="bg-zinc-800/50 text-zinc-400 border-zinc-700">
                        Followers
                      </Badge>
                    )}
                    {job.scrapeFollowing && (
                      <Badge variant="outline" className="bg-zinc-800/50 text-zinc-400 border-zinc-700">
                        Following
                      </Badge>
                    )}
                    {job.scrapePosts && (
                      <Badge variant="outline" className="bg-zinc-800/50 text-zinc-400 border-zinc-700">
                        Posts
                      </Badge>
                    )}
                  </div>

                  {job.startedAt && (
                    <div className="mt-4 pt-4 border-t border-zinc-800 flex flex-wrap gap-4 text-sm text-zinc-500">
                      <span>Started: {formatDate(job.startedAt)}</span>
                      {job.completedAt && (
                        <span>Completed: {formatDate(job.completedAt)}</span>
                      )}
                      <span>Duration: {calculateDuration(job.startedAt, job.completedAt)}</span>
                    </div>
                  )}

                  {job.error && (
                    <div className="mt-4 p-3 bg-red-900/20 border border-red-800 rounded-lg">
                      <p className="text-sm text-red-400">{job.error}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

