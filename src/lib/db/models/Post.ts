import mongoose, { Schema, Document, Model } from 'mongoose';
import type { InstagramPost } from '@/types';

export interface IPostDocument extends Omit<InstagramPost, '_id'>, Document {}

const PostSchema = new Schema<IPostDocument>(
  {
    profileId: {
      type: String,
      required: true,
      index: true,
    },
    postId: {
      type: String,
      required: true,
      unique: true,
    },
    shortcode: {
      type: String,
      required: true,
      index: true,
    },
    caption: {
      type: String,
      default: '',
    },
    imageUrl: {
      type: String,
      default: '',
    },
    videoUrl: {
      type: String,
    },
    likesCount: {
      type: Number,
      default: 0,
    },
    commentsCount: {
      type: Number,
      default: 0,
    },
    postedAt: {
      type: Date,
      required: true,
    },
    type: {
      type: String,
      enum: ['post', 'reel', 'carousel'],
      default: 'post',
    },
    isVideo: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Text index for caption search
PostSchema.index({ caption: 'text' });

// Compound indexes
PostSchema.index({ profileId: 1, postedAt: -1 });
PostSchema.index({ type: 1, likesCount: -1 });

export const Post: Model<IPostDocument> =
  mongoose.models.Post || mongoose.model<IPostDocument>('Post', PostSchema);

export default Post;

