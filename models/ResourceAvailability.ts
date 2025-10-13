import mongoose, { Document, Schema } from 'mongoose';

export interface IResourceAvailability extends Document {
  departmentId: mongoose.Types.ObjectId;
  departmentName: string;
  requirementId: mongoose.Types.ObjectId;
  requirementText: string;
  date: string; // Format: YYYY-MM-DD
  isAvailable: boolean;
  notes: string;
  quantity: number;
  maxCapacity: number;
  setBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ResourceAvailabilitySchema: Schema = new Schema({
  departmentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Department',
    required: true
  },
  departmentName: {
    type: String,
    required: true
  },
  requirementId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  requirementText: {
    type: String,
    required: true
  },
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  isAvailable: {
    type: Boolean,
    required: true,
    default: true
  },
  notes: {
    type: String,
    default: ''
  },
  quantity: {
    type: Number,
    default: 1,
    min: 0
  },
  maxCapacity: {
    type: Number,
    default: 1,
    min: 1
  },
  setBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
ResourceAvailabilitySchema.index({ 
  departmentId: 1, 
  requirementId: 1, 
  date: 1 
}, { unique: true });

// Index for date-based queries
ResourceAvailabilitySchema.index({ date: 1 });

// Index for department-based queries
ResourceAvailabilitySchema.index({ departmentId: 1 });

export default mongoose.model<IResourceAvailability>('ResourceAvailability', ResourceAvailabilitySchema);
