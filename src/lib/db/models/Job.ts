import mongoose, { Schema, Document, Model } from 'mongoose';
import type { ScrapeJob, JobStatus } from '@/types';

export interface IJobDocument extends Omit<ScrapeJob, '_id'>, Document {}

const JobSchema = new Schema<IJobDocument>(
  {
    jobId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    entryUsername: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'cancelled'] as JobStatus[],
      default: 'pending',
      index: true,
    },
    maxDepth: {
      type: Number,
      default: 1,
    },
    currentDepth: {
      type: Number,
      default: 0,
    },
    totalProfiles: {
      type: Number,
      default: 0,
    },
    processedProfiles: {
      type: Number,
      default: 0,
    },
    failedProfiles: {
      type: Number,
      default: 0,
    },
    scrapeFollowers: {
      type: Boolean,
      default: true,
    },
    scrapeFollowing: {
      type: Boolean,
      default: false,
    },
    scrapePosts: {
      type: Boolean,
      default: true,
    },
    startedAt: {
      type: Date,
    },
    completedAt: {
      type: Date,
    },
    error: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes
JobSchema.index({ sessionId: 1, status: 1, createdAt: -1 });
JobSchema.index({ status: 1, createdAt: -1 });

export const Job: Model<IJobDocument> =
  mongoose.models.Job || mongoose.model<IJobDocument>('Job', JobSchema);

export default Job;

