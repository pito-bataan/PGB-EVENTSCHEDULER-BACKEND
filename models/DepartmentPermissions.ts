import mongoose, { Document, Schema } from 'mongoose';

export interface IDepartmentPermissions extends Document {
  department: string;
  permissions: {
    myRequirements: boolean;
    manageLocation: boolean;
    myCalendar: boolean;
  };
  updatedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const DepartmentPermissionsSchema: Schema = new Schema({
  department: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  permissions: {
    myRequirements: {
      type: Boolean,
      default: false
    },
    manageLocation: {
      type: Boolean,
      default: false
    },
    myCalendar: {
      type: Boolean,
      default: false
    }
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
DepartmentPermissionsSchema.index({ department: 1 });

export default mongoose.model<IDepartmentPermissions>('DepartmentPermissions', DepartmentPermissionsSchema);
