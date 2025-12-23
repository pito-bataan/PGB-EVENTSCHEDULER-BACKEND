import mongoose, { Document, Schema } from 'mongoose';

export interface INotificationDeleted extends Document {
  userId: string;
  notificationId: string;
  deletedAt: Date;
}

const NotificationDeletedSchema: Schema = new Schema({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    trim: true
  },
  notificationId: {
    type: String,
    required: [true, 'Notification ID is required'],
    trim: true
  },
  deletedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Prevent duplicates per user
NotificationDeletedSchema.index({ userId: 1, notificationId: 1 }, { unique: true });
NotificationDeletedSchema.index({ userId: 1, deletedAt: -1 });

export default mongoose.model<INotificationDeleted>('NotificationDeleted', NotificationDeletedSchema);
