import mongoose, { Document, Schema } from 'mongoose';

export interface ILoginLog extends Document {
  userId: mongoose.Types.ObjectId;
  username: string;
  email: string;
  department: string;
  loginTime: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

const LoginLogSchema: Schema = new Schema({
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
  loginTime: {
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

// Index for efficient queries
LoginLogSchema.index({ userId: 1, loginTime: -1 });
LoginLogSchema.index({ department: 1 });
LoginLogSchema.index({ loginTime: -1 });

export default mongoose.model<ILoginLog>('LoginLog', LoginLogSchema);
