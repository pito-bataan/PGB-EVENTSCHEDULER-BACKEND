import mongoose, { Document, Schema } from 'mongoose';

export interface IRequirement {
  _id?: any;
  text: string;
  type: 'physical' | 'service';
  totalQuantity?: number;
  isActive: boolean;
  isAvailable?: boolean;
  responsiblePerson?: string;
  createdAt: Date;
  updatedAt?: Date;
}

export interface IDepartment extends Document {
  name: string;
  requirements: IRequirement[];
  isVisible: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const RequirementSchema: Schema = new Schema({
  text: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['physical', 'service'],
    required: true,
    default: 'physical'
  },
  totalQuantity: {
    type: Number,
    min: 1,
    default: 1
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isAvailable: {
    type: Boolean,
    default: true
  },
  responsiblePerson: {
    type: String,
    trim: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const DepartmentSchema: Schema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    uppercase: true
  },
  requirements: {
    type: [RequirementSchema],
    default: []
  },
  isVisible: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for faster queries
DepartmentSchema.index({ name: 1 });
DepartmentSchema.index({ isVisible: 1 });

export default mongoose.model<IDepartment>('Department', DepartmentSchema);
