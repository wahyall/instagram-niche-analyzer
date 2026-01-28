import mongoose, { Schema, Document, Model } from 'mongoose';
import type { InstagramProfile } from '@/types';

export interface IProfileDocument extends Omit<InstagramProfile, '_id'>, Document {}

const ProfileSchema = new Schema<IProfileDocument>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    fullName: {
      type: String,
      default: '',
    },
    bio: {
      type: String,
      default: '',
    },
    profilePicUrl: {
      type: String,
      default: '',
    },
    followersCount: {
      type: Number,
      default: 0,
    },
    followingCount: {
      type: Number,
      default: 0,
    },
    postsCount: {
      type: Number,
      default: 0,
    },
    isPrivate: {
      type: Boolean,
      default: false,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    externalUrl: {
      type: String,
    },
    scrapedAt: {
      type: Date,
      default: Date.now,
    },
    scrapedDepth: {
      type: Number,
      default: 0,
    },
    parentUsername: {
      type: String,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    interests: {
      type: [String],
      default: [],
    },
    niche: {
      type: String,
    },
    followers: {
      type: [String],
      default: [],
    },
    following: {
      type: [String],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

// Text index for search
ProfileSchema.index({ username: 'text', fullName: 'text', bio: 'text' });

// Compound indexes
ProfileSchema.index({ sessionId: 1, scrapedAt: -1 });
ProfileSchema.index({ niche: 1, followersCount: -1 });

// Indexes for followers/following queries
ProfileSchema.index({ parentUsername: 1, sessionId: 1 });
ProfileSchema.index({ username: 1, sessionId: 1 });

export const Profile: Model<IProfileDocument> =
  mongoose.models.Profile || mongoose.model<IProfileDocument>('Profile', ProfileSchema);

export default Profile;

