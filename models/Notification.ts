import mongoose, { Document, Schema } from 'mongoose';

export interface INotification extends Document {
  id: string;
  title: string;
  message: string;
  type: 'upcoming' | 'tagged' | 'status';
  category: 'upcoming' | 'tagged' | 'status';
  eventId: string;
  eventDate?: string;
  requirementId?: string;
  departmentNotes?: string;
  userId: string; // The user who should receive this notification
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema: Schema = new Schema({
  id: {
    type: String,
    required: true,
    unique: true
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['upcoming', 'tagged', 'status'],
    required: true
  },
  category: {
    type: String,
    enum: ['upcoming', 'tagged', 'status'],
    required: true
  },
  eventId: {
    type: String,
    required: true
  },
  eventDate: {
    type: String
  },
  requirementId: {
    type: String
  },
  departmentNotes: {
    type: String,
    default: ''
  },
  userId: {
    type: String,
    required: true
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
// Note: 'id' field already has an index due to unique: true
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ eventId: 1 });

export default mongoose.model<INotification>('Notification', NotificationSchema);
