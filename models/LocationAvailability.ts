import mongoose, { Document, Schema } from 'mongoose';

export interface ILocationAvailability extends Document {
  date: string; // Format: YYYY-MM-DD
  locationName: string;
  capacity: number;
  description: string;
  status: 'available' | 'unavailable';
  setBy: mongoose.Types.ObjectId;
  departmentName: string;
  createdAt: Date;
  updatedAt: Date;
}

const LocationAvailabilitySchema: Schema = new Schema({
  date: {
    type: String, // Format: YYYY-MM-DD
    required: true
  },
  locationName: {
    type: String,
    required: true,
    trim: true
  },
  capacity: {
    type: Number,
    required: true,
    min: 1
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  status: {
    type: String,
    enum: ['available', 'unavailable'],
    required: true,
    default: 'available'
  },
  setBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  departmentName: {
    type: String,
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

// Compound index for efficient queries - one location per date
LocationAvailabilitySchema.index({ 
  date: 1, 
  locationName: 1 
}, { unique: true });

// Index for date-based queries
LocationAvailabilitySchema.index({ date: 1 });

// Index for department-based queries
LocationAvailabilitySchema.index({ departmentName: 1 });

// Index for location name queries
LocationAvailabilitySchema.index({ locationName: 1 });

export default mongoose.model<ILocationAvailability>('LocationAvailability', LocationAvailabilitySchema);
