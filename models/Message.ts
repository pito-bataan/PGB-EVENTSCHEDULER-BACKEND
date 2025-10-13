import mongoose, { Document, Schema } from 'mongoose';

export interface IMessage extends Document {
  eventId: mongoose.Types.ObjectId;
  senderId: mongoose.Types.ObjectId;
  receiverId: mongoose.Types.ObjectId;
  content: string;
  messageType: 'text' | 'image' | 'file';
  timestamp: Date;
  isRead: boolean;
  attachments?: {
    fileName: string;
    filePath: string;
    fileSize: number;
    mimeType: string;
  }[];
  isEdited: boolean;
  editedAt?: Date;
  isDeleted: boolean;
  deletedAt?: Date;
}

const MessageSchema: Schema = new Schema({
  eventId: {
    type: Schema.Types.ObjectId,
    ref: 'Event',
    required: [true, 'Event ID is required']
  },
  senderId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender ID is required']
  },
  receiverId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Receiver ID is required']
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  messageType: {
    type: String,
    enum: ['text', 'image', 'file'],
    default: 'text'
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  isRead: {
    type: Boolean,
    default: false
  },
  attachments: [{
    fileName: {
      type: String,
      required: true
    },
    filePath: {
      type: String,
      required: true
    },
    fileSize: {
      type: Number,
      required: true
    },
    mimeType: {
      type: String,
      required: true
    }
  }],
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Index for efficient queries
MessageSchema.index({ eventId: 1, senderId: 1, receiverId: 1 });
MessageSchema.index({ timestamp: -1 });
MessageSchema.index({ isDeleted: 1 });

export default mongoose.model<IMessage>('Message', MessageSchema);
