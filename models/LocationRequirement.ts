import mongoose, { Document, Schema } from 'mongoose';

export interface ILocationRequirement extends Document {
  locationNames: string[]; // Changed to array for multiple locations
  requirements: Array<{
    name: string;
    quantity: number;
  }>;
  setBy: mongoose.Types.ObjectId;
  departmentName: string;
  createdAt: Date;
  updatedAt: Date;
}

const LocationRequirementSchema: Schema = new Schema({
  locationNames: {
    type: [String], // Array of location names
    required: true,
    validate: {
      validator: function(v: string[]) {
        return v && v.length > 0;
      },
      message: 'At least one location name is required'
    }
  },
  requirements: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    quantity: {
      type: Number,
      required: true,
      min: 1
    }
  }],
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

// Index for location names queries
LocationRequirementSchema.index({ locationNames: 1 });

// Index for department-based queries
LocationRequirementSchema.index({ departmentName: 1 });

const LocationRequirementModel = mongoose.model<ILocationRequirement>('LocationRequirement', LocationRequirementSchema);

// Drop old locationName index on startup (migration helper)
LocationRequirementModel.collection.dropIndex('locationName_1').then(() => {
  console.log('✅ Dropped old locationName_1 index');
}).catch((error) => {
  if (error.code === 27 || error.codeName === 'IndexNotFound') {
    console.log('ℹ️ Old locationName_1 index already dropped');
  } else {
    console.error('⚠️ Error dropping old index:', error.message);
  }
});

export default LocationRequirementModel;
