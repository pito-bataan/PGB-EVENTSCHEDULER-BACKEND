import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  username: string;
  email: string;
  password: string;
  department: string;
  role: 'User' | 'Admin';
  status: 'active' | 'inactive';
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [30, 'Username cannot exceed 30 characters']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  department: {
    type: String,
    required: [true, 'Department is required'],
    enum: [
      'ACCOUNTING', 'ADMINISTRATOR', 'ASSESSOR', 'BAC', 'BCMH', 'BHSO', 'BUDGET', 
      'DOLE', 'INB', 'JCPJMH', 'LEGAL', 'MBDA', 'MDH', 'ODH', 'OMSP', 'OPA', 
      'OPAgriculturist', 'OPG', 'OPPDC', 'OSM', 'OSSP', 'OVG', 'PCEDO', 'PDRRMO', 
      'PEO', 'PESO', 'PG-ENRO', 'PGO', 'PGO-BAC', 'PGO-IAS', 'PGO-ISKOLAR', 
      'PGSO', 'PHO', 'PHRMO', 'PIO', 'PITO', 'PLO', 'PMO', 'PPDO', 'PPO', 'PPP', 
      'PSWDO', 'SAP', 'SP', 'TOURISM', 'TREASURY', 'VET'
    ]
  },
  role: {
    type: String,
    enum: ['User', 'Admin'],
    default: 'User'
  },
  status: {
    type: String,
    enum: ['active', 'inactive'],
    default: 'active'
  }
}, {
  timestamps: true
});

// Hash password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password as string, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// Compare password method
UserSchema.methods.comparePassword = async function(candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
