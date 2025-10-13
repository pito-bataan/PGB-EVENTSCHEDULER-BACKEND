import express, { Request, Response } from 'express';
import User, { IUser } from '../models/User.js';
import { generateToken, authenticateToken, requireAdmin } from '../middleware/auth.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// POST /api/users/setup - Create first admin user (no auth required)
router.post('/setup', async (req: Request, res: Response) => {
  try {
    // Check if any admin users exist
    const adminExists = await User.findOne({ role: 'Admin' });
    
    if (adminExists) {
      return res.status(400).json({
        success: false,
        message: 'Admin user already exists. Use /register endpoint with admin authentication.'
      });
    }

    const { username, email, password, department } = req.body;

    // Validate required fields
    if (!username || !email || !password || !department) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: username, email, password, department'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }

    // Create first admin user
    const newUser: IUser = new User({
      username,
      email,
      password,
      department,
      role: 'Admin', // Force admin role for setup
      status: 'active'
    });

    const savedUser = await newUser.save();

    // Generate JWT token for immediate login
    const token = generateToken(savedUser);

    // Remove password from response
    const userResponse = savedUser.toObject();
    delete (userResponse as any).password;

    res.status(201).json({
      success: true,
      message: 'First admin user created successfully',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    console.error('Error creating admin user:', error);
    
    // Handle mongoose validation errors
    if (error instanceof Error && error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }

    // Handle duplicate key errors
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create admin user',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/users/register - Register new user (Admin only)
router.post('/register', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, email, password, department, role } = req.body;

    // Validate required fields
    if (!username || !email || !password || !department || !role) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required: username, email, password, department, role'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email }, { username }]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or username already exists'
      });
    }

    // Create new user
    const newUser: IUser = new User({
      username,
      email,
      password,
      department,
      role,
      status: 'active'
    });

    const savedUser = await newUser.save();

    // Remove password from response
    const userResponse = savedUser.toObject();
    delete (userResponse as any).password;

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: userResponse
    });
  } catch (error) {
    console.error('Error creating user:', error);
    
    // Handle mongoose validation errors
    if (error instanceof Error && error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }

    // Handle duplicate key errors
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/users/login - User login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required'
      });
    }

    // Find user by username or email
    const user = await User.findOne({
      $or: [{ username }, { email: username }]
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if account is active
    if (user.status !== 'active') {
      return res.status(401).json({
        success: false,
        message: 'Account is inactive. Please contact administrator.'
      });
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Generate JWT token
    const token = generateToken(user);

    // Remove password from response
    const userResponse = user.toObject();
    delete (userResponse as any).password;

    res.status(200).json({
      success: true,
      message: 'Login successful',
      data: {
        user: userResponse,
        token
      }
    });
  } catch (error) {
    console.error('Error during login:', error);
    res.status(500).json({
      success: false,
      message: 'Login failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/users - Get all users (Admin only)
router.get('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 10, search = '', department = '' } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build search query
    const query: any = {};
    
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (department) {
      query.department = department;
    }

    // Get users with pagination
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await User.countDocuments(query);

    res.status(200).json({
      success: true,
      data: users,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/users/department/:departmentName - Get users from specific department (authenticated users only)
router.get('/department/:departmentName', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { departmentName } = req.params;
    
    if (!departmentName) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required'
      });
    }

    // Find users in the specified department (excluding passwords)
    const users = await User.find({ 
      department: departmentName,
      status: 'active' // Only return active users
    })
    .select('-password')
    .sort({ username: 1 });

    res.status(200).json({
      success: true,
      data: users,
      message: `Found ${users.length} users in ${departmentName} department`
    });
  } catch (error) {
    console.error('Error fetching department users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department users',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/users/me - Get current user profile
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  try {
    const user = await User.findById((req.user as any)?._id).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    console.error('Error fetching user profile:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user profile',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/users/:id - Update user information (Admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { username, email, status, password } = req.body;

    // Validate required fields
    if (!username || !email || !status) {
      return res.status(400).json({
        success: false,
        message: 'Username, email, and status are required'
      });
    }

    // Validate status
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "active" or "inactive"'
      });
    }

    // Check if username or email already exists (excluding current user)
    const existingUser = await User.findOne({
      $and: [
        { _id: { $ne: id } },
        { $or: [{ email }, { username }] }
      ]
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    // Prepare update data
    const updateData: any = {
      username,
      email,
      status
    };

    // Add password if provided (hash it first)
    if (password && password.trim()) {
      const salt = await bcrypt.genSalt(12);
      updateData.password = await bcrypt.hash(password, salt);
      console.log('🔒 Password hashed for user update');
    }

    const user = await User.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log(`✅ User updated successfully: ${user.username}`);

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Error updating user:', error);
    
    // Handle mongoose validation errors
    if (error instanceof Error && error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        error: error.message
      });
    }

    // Handle duplicate key errors
    if (error instanceof Error && 'code' in error && error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Username or email already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/users/:id/status - Update user status (Admin only)
router.put('/:id/status', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "active" or "inactive"'
      });
    }

    const user = await User.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User status updated successfully',
      data: user
    });
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/users/:id - Delete user (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Prevent admin from deleting themselves
    if ((req.user as any)?._id.toString() === id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findByIdAndDelete(id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
