import mongoose, { Schema, Document, Model } from 'mongoose';
import type { InstagramSession } from '@/types';

export interface ISessionDocument extends Omit<InstagramSession, '_id'>, Document {}

const SessionSchema = new Schema<ISessionDocument>(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    username: {
      type: String,
      required: true,
      index: true,
    },
    cookies: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    isValid: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: false,
  }
);

// Index for finding valid sessions
SessionSchema.index({ isValid: 1, lastUsedAt: -1 });

// TTL index - sessions expire after 7 days of inactivity
SessionSchema.index({ lastUsedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export const Session: Model<ISessionDocument> =
  mongoose.models.Session || mongoose.model<ISessionDocument>('Session', SessionSchema);

export default Session;

