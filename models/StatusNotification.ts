import mongoose, { Document, Schema } from 'mongoose';

export interface IStatusNotification extends Document {
  eventId: mongoose.Types.ObjectId;
  requestorId: mongoose.Types.ObjectId;
  departmentName: string;
  requirementName: string;
  requirementId: string;
  oldStatus: string;
  newStatus: string;
  departmentNotes?: string;
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StatusNotificationSchema: Schema = new Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  requestorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  departmentName: {
    type: String,
    required: true
  },
  requirementName: {
    type: String,
    required: true
  },
  requirementId: {
    type: String,
    required: true
  },
  oldStatus: {
    type: String,
    required: true
  },
  newStatus: {
    type: String,
    required: true,
    enum: ['pending', 'confirmed', 'declined', 'partially_fulfill', 'in_preparation']
  },
  departmentNotes: {
    type: String,
    default: ''
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
StatusNotificationSchema.index({ requestorId: 1, createdAt: -1 });
StatusNotificationSchema.index({ eventId: 1 });

export default mongoose.model<IStatusNotification>('StatusNotification', StatusNotificationSchema);
