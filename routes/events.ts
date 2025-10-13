
import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Event, { IEvent } from '../models/Event.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Log all requests to events endpoint
router.use((req, res, next) => {
  console.log(`📥 ${req.method} ${req.path} - Request received`);
  console.log('📋 Headers:', req.headers.authorization ? 'Bearer token present' : 'No auth token');
  next();
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/events';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only images and documents are allowed'));
    }
  }
});

// GET /api/events - Fetch all events (Admin only)
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const events = await Event.find()
      .populate('createdBy', 'name email department')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/events/my - Fetch user's events
router.get('/my', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const events = await Event.find({ createdBy: userId })
      .populate('createdBy', 'name email department')
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      count: events.length,
      data: events
    });
  } catch (error) {
    console.error('Error fetching user events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch events',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/events/:id - Get single event
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const event = await Event.findById(id).populate('createdBy', 'name email department');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.status(200).json({
      success: true,
      data: event
    });
  } catch (error) {
    console.error('Error fetching event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/events - Create a new event request
router.post('/', authenticateToken, upload.fields([
  { name: 'attachments', maxCount: 10 },
  { name: 'brieferTemplate', maxCount: 1 },
  { name: 'availableForDL', maxCount: 1 },
  { name: 'programme', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user._id;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };
    
    console.log('🔍 POST /api/events - User ID:', userId);
    console.log('📋 User object:', (req as any).user);
    console.log('🏢 Requestor Department from form:', req.body.requestorDepartment);
    
    // Parse form data
    const {
      eventTitle,
      requestor,
      requestorDepartment,
      location,
      participants,
      vip,
      vvip,
      withoutGov,
      multipleLocations,
      description,
      startDate,
      startTime,
      endDate,
      endTime,
      contactNumber,
      contactEmail,
      taggedDepartments,
      departmentRequirements,
      noAttachments
    } = req.body;

    // Validate required fields
    const requiredFields = {
      eventTitle,
      requestor,
      requestorDepartment,
      location,
      participants,
      startDate,
      startTime,
      endDate,
      endTime,
      contactNumber,
      contactEmail
    };

    const missingFields = Object.entries(requiredFields)
      .filter(([key, value]) => !value)
      .map(([key]) => key);

    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    // Process attachments
    const attachments = files.attachments ? files.attachments.map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      uploadedAt: new Date()
    })) : [];

    // Process government files (if w/o gov is true)
    let govFiles: any = undefined;
    if (withoutGov === 'true') {
      govFiles = {};
      
      if (files.brieferTemplate) {
        const file = files.brieferTemplate[0];
        govFiles.brieferTemplate = {
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }
      
      if (files.availableForDL) {
        const file = files.availableForDL[0];
        govFiles.availableForDL = {
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }
      
      if (files.programme) {
        const file = files.programme[0];
        govFiles.programme = {
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date()
        };
      }
    }

    // Create new event
    const newEvent = new Event({
      eventTitle,
      requestor,
      requestorDepartment,
      location,
      participants: parseInt(participants),
      vip: vip ? parseInt(vip) : 0,
      vvip: vvip ? parseInt(vvip) : 0,
      withoutGov: withoutGov === 'true',
      multipleLocations: multipleLocations === 'true',
      description: description || '',
      startDate: new Date(startDate),
      startTime,
      endDate: new Date(endDate),
      endTime,
      contactNumber,
      contactEmail,
      attachments,
      noAttachments: noAttachments === 'true',
      govFiles,
      taggedDepartments: taggedDepartments ? JSON.parse(taggedDepartments) : [],
      departmentRequirements: departmentRequirements ? JSON.parse(departmentRequirements) : {},
      status: 'submitted',
      submittedAt: new Date(),
      createdBy: userId
    });

    const savedEvent = await newEvent.save();
    await savedEvent.populate('createdBy', 'name email department');

    // 🔔 REAL-TIME NOTIFICATION BROADCASTING
    console.log('🔔 Broadcasting new event notification for:', savedEvent.eventTitle);
    
    // Get Socket.IO instance
    const io = req.app.get('io');
    if (io) {
      // Determine who should receive notifications
      const targetUsers = new Set<string>();
      
      // 1. Add requestor (event creator) for their own upcoming event notifications
      if (userId) {
        targetUsers.add(userId.toString());
        console.log(`📤 Adding requestor ${userId} to notification targets`);
      }
      
      // 2. Add users from tagged departments for tagged notifications
      const taggedDepts = savedEvent.taggedDepartments || [];
      console.log(`🏢 Tagged departments:`, taggedDepts);
      
      // For now, we'll broadcast to all connected users in tagged departments
      // In a real system, you'd query users by department from the database
      
      // Broadcast new notification event to all relevant users
      targetUsers.forEach(targetUserId => {
        io.to(`user-${targetUserId}`).emit('new-notification', {
          eventId: savedEvent._id,
          eventTitle: savedEvent.eventTitle,
          notificationType: 'upcoming',
          timestamp: new Date(),
          message: `New event "${savedEvent.eventTitle}" has been created`
        });
        console.log(`🔔 Sent new-notification to user-${targetUserId}`);
      });
      
      // Also broadcast to all connected clients (for tagged department users)
      io.emit('new-notification', {
        eventId: savedEvent._id,
        eventTitle: savedEvent.eventTitle,
        notificationType: 'tagged',
        timestamp: new Date(),
        taggedDepartments: taggedDepts,
        message: `New event "${savedEvent.eventTitle}" has tagged your department`
      });
      
      console.log(`🔄 Broadcasted new-notification event to all clients for event: ${savedEvent.eventTitle}`);
    } else {
      console.log('⚠️ Socket.IO not available for broadcasting');
    }

    res.status(201).json({
      success: true,
      message: 'Event request submitted successfully',
      data: savedEvent
    });
  } catch (error) {
    console.error('❌ ERROR creating event:', error);
    console.error('❌ ERROR stack:', error instanceof Error ? error.stack : 'No stack');
    console.error('❌ ERROR message:', error instanceof Error ? error.message : 'Unknown error');
    res.status(500).json({
      success: false,
      message: 'Failed to create event request',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/events/:id/status - Update event status (Admin only)
router.put('/:id/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userRole = (req as any).user.role;

    // Check if user is admin
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const validStatuses = ['draft', 'submitted', 'approved', 'rejected', 'completed'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be one of: ' + validStatuses.join(', ')
      });
    }

    const event = await Event.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    ).populate('createdBy', 'name email department');

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Event status updated successfully',
      data: event
    });
  } catch (error) {
    console.error('Error updating event status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update event status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/events/:id - Delete event
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user._id;
    const userRole = (req as any).user.role;

    const event = await Event.findById(id);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user owns the event or is admin
    if (event.createdBy.toString() !== userId && userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only delete your own events.'
      });
    }

    await Event.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete event',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/events/attachment/:filename - Serve attachment files
router.get('/attachment/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { download } = req.query;
    const filePath = path.join(process.cwd(), 'uploads', 'events', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // If download=true, force download with Content-Disposition header
    if (download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    
    // Serve the file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving attachment:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to serve attachment',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/events/:id - Update event details (location, dates, times)
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { location, startDate, startTime, endDate, endTime } = req.body;
    const userId = (req as any).user._id;

    // Find the event and check ownership
    const event = await Event.findById(id);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user owns this event
    if (event.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only edit your own events.'
      });
    }

    // Update the event
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      {
        location,
        startDate: new Date(startDate),
        startTime,
        endDate: new Date(endDate),
        endTime,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: 'Event updated successfully',
      event: updatedEvent
    });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update event',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/events/govfile/:filename - Serve government files
router.get('/govfile/:filename', (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const { download } = req.query;
    const filePath = path.join(process.cwd(), 'uploads', 'events', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'Government file not found'
      });
    }
    
    // If download=true, force download with Content-Disposition header
    if (download === 'true') {
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    }
    
    // Serve the file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving government file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to serve government file',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
