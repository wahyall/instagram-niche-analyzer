import { Queue, QueueEvents } from 'bullmq';
import { createNewRedisConnection } from './redis';
import type { ScrapeJobData } from '@/types';

const QUEUE_NAME = 'instagram-scrape';

let scrapeQueue: Queue<ScrapeJobData> | null = null;
let queueEvents: QueueEvents | null = null;

export function getScrapeQueue(): Queue<ScrapeJobData> {
  if (!scrapeQueue) {
    const connection = createNewRedisConnection();
    scrapeQueue = new Queue<ScrapeJobData>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: {
          count: 100,
          age: 24 * 60 * 60, // 24 hours
        },
        removeOnFail: {
          count: 50,
          age: 7 * 24 * 60 * 60, // 7 days
        },
      },
    });
  }
  return scrapeQueue;
}

export function getQueueEvents(): QueueEvents {
  if (!queueEvents) {
    const connection = createNewRedisConnection();
    queueEvents = new QueueEvents(QUEUE_NAME, { connection });
  }
  return queueEvents;
}

export async function addScrapeJob(data: ScrapeJobData): Promise<string> {
  const queue = getScrapeQueue();
  
  const job = await queue.add(`scrape-${data.username}`, data, {
    jobId: `${data.jobId}-${data.username}-${data.depth}`,
    priority: data.depth, // Lower depth = higher priority
    delay: data.depth > 0 ? 3000 : 0, // Delay for chained jobs
  });

  return job.id || '';
}

export async function addBulkScrapeJobs(jobs: ScrapeJobData[]): Promise<void> {
  const queue = getScrapeQueue();
  
  const bulkJobs = jobs.map((data) => ({
    name: `scrape-${data.username}`,
    data,
    opts: {
      jobId: `${data.jobId}-${data.username}-${data.depth}`,
      priority: data.depth,
      delay: 3000 + Math.random() * 2000, // Random delay between 3-5 seconds
    },
  }));

  await queue.addBulk(bulkJobs);
}

export async function getJobCounts(): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getScrapeQueue();
  const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
  return {
    waiting: counts.waiting || 0,
    active: counts.active || 0,
    completed: counts.completed || 0,
    failed: counts.failed || 0,
    delayed: counts.delayed || 0,
  };
}

export async function pauseQueue(): Promise<void> {
  const queue = getScrapeQueue();
  await queue.pause();
}

export async function resumeQueue(): Promise<void> {
  const queue = getScrapeQueue();
  await queue.resume();
}

export async function clearQueue(): Promise<void> {
  const queue = getScrapeQueue();
  await queue.drain();
}

export default getScrapeQueue;

