import mongoose, { Document, Schema } from 'mongoose';

export interface INotificationRead extends Document {
  userId: string;
  eventId: string;
  notificationId: string;
  readAt: Date;
  notificationType: 'upcoming' | 'tagged' | 'status';
  category: string;
}

const NotificationReadSchema: Schema = new Schema({
  userId: {
    type: String,
    required: [true, 'User ID is required'],
    trim: true
  },
  eventId: {
    type: String,
    required: [true, 'Event ID is required'],
    trim: true
  },
  notificationId: {
    type: String,
    required: [true, 'Notification ID is required'],
    trim: true,
    unique: true
  },
  readAt: {
    type: Date,
    default: Date.now
  },
  notificationType: {
    type: String,
    enum: ['upcoming', 'tagged', 'status'],
    required: [true, 'Notification type is required']
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
    trim: true
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
NotificationReadSchema.index({ userId: 1, eventId: 1 });
NotificationReadSchema.index({ userId: 1, notificationId: 1 });

export default mongoose.model<INotificationRead>('NotificationRead', NotificationReadSchema);
