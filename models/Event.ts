import mongoose, { Document, Schema } from 'mongoose';

export interface Requirement {
  id: string;
  name: string;
  selected: boolean;
  notes: string;
  type: string;
  totalQuantity: number;
  isAvailable: boolean;
  availabilityNotes: string;
  quantity: number;
  status?: string;
  departmentNotes?: string;
  lastUpdated?: string;
  requirementsStatus?: 'on-hold' | 'released'; // Track if requirements are on-hold or released to departments
  yesNoAnswer?: 'yes' | 'no'; // For yesno type requirements
}

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

export interface IEventReport {
  uploaded: boolean;
  filename?: string;
  originalName?: string;
  mimetype?: string;
  size?: number;
  uploadedAt?: Date;
  fileUrl?: string;
}

export interface IEvent extends Document {
  // Basic Event Information
  eventTitle: string;
  requestor: string;
  requestorDepartment: string; // Department of the person who submitted the request
  location: string;
  locations?: string[]; // Array of locations for multiple conference rooms
  participants: number;
  vip?: number;
  vvip?: number;
  withoutGov: boolean;
  multipleLocations: boolean;
  description?: string;
  eventType: 'simple' | 'complex';
  
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
  departmentRequirements: Record<string, Requirement[]>;
  
  // Status & Metadata
  status: 'draft' | 'submitted' | 'approved' | 'rejected' | 'completed';
  reason?: string; // Rejection or cancellation reason
  submittedAt?: Date;
  createdBy: mongoose.Types.ObjectId; // Reference to User
  createdAt: Date;
  updatedAt: Date;
  
  // Event Reports (uploaded after event completion)
  eventReports?: {
    completionReport?: IEventReport;
    postActivityReport?: IEventReport;
    assessmentReport?: IEventReport;
    feedbackForm?: IEventReport;
  };
  
  // Reports Status (pending or completed)
  reportsStatus?: 'pending' | 'completed';
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

const EventReportSchema: Schema = new Schema({
  uploaded: { type: Boolean, default: false },
  filename: { type: String },
  originalName: { type: String },
  mimetype: { type: String },
  size: { type: Number },
  uploadedAt: { type: Date },
  fileUrl: { type: String }
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
  locations: {
    type: [String],
    default: undefined
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
  eventType: {
    type: String,
    enum: ['simple', 'complex'],
    default: 'simple'
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
  reason: {
    type: String,
    required: false
  },
  submittedAt: {
    type: Date
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Creator is required']
  },
  
  // Event Reports (uploaded after event completion)
  eventReports: {
    completionReport: EventReportSchema,
    postActivityReport: EventReportSchema,
    assessmentReport: EventReportSchema,
    feedbackForm: EventReportSchema
  },
  
  // Reports Status (pending or completed)
  reportsStatus: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending'
  }
}, {
  timestamps: true
});

export default mongoose.model<IEvent>('Event', EventSchema);
