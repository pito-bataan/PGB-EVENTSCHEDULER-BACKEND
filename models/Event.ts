import mongoose, { Document, Schema } from 'mongoose';

export interface IGovFile {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
}

export interface IAttachment {
  filename: string;
  originalName: string;
  mimetype: string;
  size: number;
  uploadedAt: Date;
}

export interface IEvent extends Document {
  // Basic Event Information
  eventTitle: string;
  requestor: string;
  requestorDepartment: string; // Department of the person who submitted the request
  location: string;
  participants: number;
  vip?: number;
  vvip?: number;
  withoutGov: boolean;
  multipleLocations: boolean;
  description?: string;
  
  // Schedule Information
  startDate: Date;
  startTime: string;
  endDate: Date;
  endTime: string;
  
  // Contact Information
  contactNumber: string;
  contactEmail: string;
  
  // File Attachments
  attachments: IAttachment[];
  noAttachments: boolean;
  
  // Government Files (for w/o gov events)
  govFiles?: {
    brieferTemplate?: IGovFile;
    availableForDL?: IGovFile;
    programme?: IGovFile;
  };
  
  // Department & Requirements
  taggedDepartments: string[];
  departmentRequirements: any; // Will store the requirements object
  
  // Status & Metadata
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed';
  submittedAt?: Date;
  createdBy: mongoose.Types.ObjectId; // Reference to User
  createdAt: Date;
  updatedAt: Date;
}

const GovFileSchema: Schema = new Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

const AttachmentSchema: Schema = new Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  uploadedAt: { type: Date, default: Date.now }
});

const EventSchema: Schema = new Schema({
  // Basic Event Information
  eventTitle: {
    type: String,
    required: [true, 'Event title is required'],
    trim: true,
    maxlength: [500, 'Title cannot exceed 500 characters']
  },
  requestor: {
    type: String,
    required: [true, 'Requestor is required'],
    trim: true,
    maxlength: [100, 'Requestor name cannot exceed 100 characters']
  },
  requestorDepartment: {
    type: String,
    required: [true, 'Requestor department is required'],
    trim: true,
    maxlength: [100, 'Department name cannot exceed 100 characters']
  },
  location: {
    type: String,
    required: [true, 'Location is required'],
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  },
  participants: {
    type: Number,
    required: [true, 'Number of participants is required'],
    min: [1, 'At least 1 participant is required']
  },
  vip: {
    type: Number,
    default: 0,
    min: [0, 'VIP count cannot be negative']
  },
  vvip: {
    type: Number,
    default: 0,
    min: [0, 'VVIP count cannot be negative']
  },
  withoutGov: {
    type: Boolean,
    default: false
  },
  multipleLocations: {
    type: Boolean,
    default: false
  },
  description: {
    type: String,
    trim: true,
    maxlength: [5000, 'Description cannot exceed 5000 characters']
  },
  
  // Schedule Information
  startDate: {
    type: Date,
    required: [true, 'Start date is required']
  },
  startTime: {
    type: String,
    required: [true, 'Start time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
  },
  endDate: {
    type: Date,
    required: [true, 'End date is required']
  },
  endTime: {
    type: String,
    required: [true, 'End time is required'],
    match: [/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Invalid time format (HH:MM)']
  },
  
  // Contact Information
  contactNumber: {
    type: String,
    required: [true, 'Contact number is required'],
    match: [/^09\d{9}$/, 'Invalid phone number format (09XXXXXXXXX)']
  },
  contactEmail: {
    type: String,
    required: [true, 'Contact email is required'],
    lowercase: true,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Invalid email format']
  },
  
  // File Attachments
  attachments: {
    type: [AttachmentSchema],
    default: []
  },
  noAttachments: {
    type: Boolean,
    default: false
  },
  
  // Government Files (for w/o gov events)
  govFiles: {
    brieferTemplate: GovFileSchema,
    availableForDL: GovFileSchema,
    programme: GovFileSchema
  },
  
  // Department & Requirements
  taggedDepartments: {
    type: [String],
    default: []
  },
  departmentRequirements: {
    type: Schema.Types.Mixed,
    default: {}
  },
  
  // Status & Metadata
  status: {
    type: String,
    enum: ['draft', 'submitted', 'approved', 'rejected', 'completed'],
    default: 'draft'
  },
  submittedAt: {
    type: Date
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  }
}, {
  timestamps: true
});

export default mongoose.model<IEvent>('Event', EventSchema);
