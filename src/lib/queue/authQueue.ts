import { Queue } from 'bullmq';
import { createNewRedisConnection, getRedisClient } from './redis';
import type { AuthJobData, AuthJobState } from '@/types';

const QUEUE_NAME = 'instagram-auth';
const AUTH_JOB_PREFIX = 'auth:job:';
const AUTH_JOB_TTL = 5 * 60; // 5 minutes in seconds

let authQueue: Queue<AuthJobData> | null = null;

export function getAuthQueue(): Queue<AuthJobData> {
  if (!authQueue) {
    const connection = createNewRedisConnection();
    authQueue = new Queue<AuthJobData>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: 1, // No retries for auth jobs
        removeOnComplete: {
          count: 10,
          age: 5 * 60, // 5 minutes
        },
        removeOnFail: {
          count: 10,
          age: 5 * 60, // 5 minutes
        },
      },
    });
  }
  return authQueue;
}

export async function addAuthJob(data: AuthJobData): Promise<string> {
  const queue = getAuthQueue();

  // Store initial job state in Redis
  await setAuthJobState({
    authJobId: data.authJobId,
    type: data.type,
    status: 'pending',
    createdAt: data.createdAt,
    updatedAt: data.createdAt,
    expiresAt: data.createdAt + AUTH_JOB_TTL * 1000,
  });

  const job = await queue.add(`auth-${data.type}-${data.username}`, data, {
    jobId: data.authJobId,
  });

  return job.id || '';
}

export async function getAuthJobState(authJobId: string): Promise<AuthJobState | null> {
  const redis = getRedisClient();
  const data = await redis.get(`${AUTH_JOB_PREFIX}${authJobId}`);

  if (!data) {
    return null;
  }

  return JSON.parse(data) as AuthJobState;
}

export async function setAuthJobState(state: AuthJobState): Promise<void> {
  const redis = getRedisClient();
  const key = `${AUTH_JOB_PREFIX}${state.authJobId}`;

  await redis.set(key, JSON.stringify(state), 'EX', AUTH_JOB_TTL);
}

export async function deleteAuthJobState(authJobId: string): Promise<void> {
  const redis = getRedisClient();
  await redis.del(`${AUTH_JOB_PREFIX}${authJobId}`);
}

export function generateAuthJobId(): string {
  return `auth-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export default getAuthQueue;
