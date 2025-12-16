'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  RefreshCw,
  User,
  Users,
  AlertTriangle
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
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

interface JobsListProps {
  refreshTrigger?: number;
}

export function JobsList({ refreshTrigger }: JobsListProps) {
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
    fetchJobs();
    
    // Poll for updates every 5 seconds if there are active jobs
    const interval = setInterval(() => {
      if (jobs.some((job) => job.status === 'processing' || job.status === 'pending')) {
        fetchJobs();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [refreshTrigger]);

  const getStatusIcon = (status: Job['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-400" />;
      case 'processing':
        return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-400" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-400" />;
      case 'cancelled':
        return <AlertTriangle className="h-4 w-4 text-orange-400" />;
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
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <Card className="bg-zinc-900/50 border-zinc-800">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="bg-zinc-900/50 border-zinc-800">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-white flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-400" />
            Recent Jobs
          </CardTitle>
          <CardDescription className="text-zinc-400">
            Monitor your scraping jobs
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={fetchJobs}
          className="text-zinc-400 hover:text-white"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <div className="text-center py-8 text-zinc-500">
            <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No jobs yet. Start scraping to see jobs here.</p>
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {jobs.map((job) => (
                <div
                  key={job.jobId}
                  className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-zinc-400" />
                      <span className="font-medium text-white">@{job.entryUsername}</span>
                    </div>
                    {getStatusBadge(job.status)}
                  </div>

                  {(job.status === 'processing' || job.status === 'pending') && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-zinc-400">
                        <span>Progress</span>
                        <span>{job.processedProfiles} / {job.totalProfiles} profiles</span>
                      </div>
                      <Progress value={job.progress} className="h-2 bg-zinc-700" />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-400">
                    <span>Depth: {job.currentDepth}/{job.maxDepth}</span>
                    <span>Processed: {job.processedProfiles}</span>
                    {job.failedProfiles > 0 && (
                      <span className="text-red-400">Failed: {job.failedProfiles}</span>
                    )}
                    <span>Created: {formatDate(job.createdAt)}</span>
                  </div>

                  {job.error && (
                    <p className="text-xs text-red-400 bg-red-900/20 rounded p-2">
                      {job.error}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

