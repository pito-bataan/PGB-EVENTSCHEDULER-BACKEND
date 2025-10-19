import mongoose, { Document, Schema } from 'mongoose';

export interface IUserActivityLog extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  email: string;
  department: string;
  action: string; // e.g., 'reschedule_event', 'create_event', 'delete_event', etc.
  description: string; // Human-readable description
  eventId?: mongoose.Types.ObjectId;
  eventTitle?: string;
  details?: any; // Additional details (e.g., old vs new dates)
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const UserActivityLogSchema: Schema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  username: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true
  },
  department: {
    type: String,
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['login', 'reschedule_event', 'create_event', 'delete_event', 'update_event', 'submit_event', 'other']
  },
  description: {
    type: String,
    required: true
  },
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Event'
  },
  eventTitle: {
    type: String
  },
  details: {
    type: Schema.Types.Mixed
  },
  timestamp: {
    type: Date,
    default: Date.now,
    required: true
  },
  ipAddress: {
    type: String
  },
  userAgent: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
UserActivityLogSchema.index({ userId: 1, timestamp: -1 });
UserActivityLogSchema.index({ department: 1, timestamp: -1 });
UserActivityLogSchema.index({ action: 1, timestamp: -1 });
UserActivityLogSchema.index({ eventId: 1 });
UserActivityLogSchema.index({ timestamp: -1 });

export default mongoose.model<IUserActivityLog>('UserActivityLog', UserActivityLogSchema);
