import express, { Request, Response } from 'express';
import Event from '../models/Event.js';
import StatusNotification from '../models/StatusNotification.js';
import Notification from '../models/Notification.js';
import UserActivityLog from '../models/UserActivityLog.js';
import ResourceAvailability from '../models/ResourceAvailability.js';
import LocationAvailability from '../models/LocationAvailability.js';
import Department from '../models/Department.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

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

// PATCH /api/events/:eventId/requirements/:requirementId/notes - Update requirement notes
router.patch('/:eventId/requirements/:requirementId/notes', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { eventId, requirementId } = req.params;
    const { departmentNotes } = req.body;
    const userDepartment = (req as any).user.department;

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user's department is tagged in this event
    if (!event.taggedDepartments.includes(userDepartment)) {
      return res.status(403).json({
        success: false,
        message: 'Your department is not tagged in this event'
      });
    }

    // Find and update the requirement
    let requirementFound = false;
    for (const [dept, requirements] of Object.entries(event.departmentRequirements) as [string, any[]][]) {
      const requirement = requirements.find(r => r.id === requirementId);
      if (requirement) {
        requirement.departmentNotes = departmentNotes;
        requirement.lastUpdated = new Date().toISOString();
        requirementFound = true;
        break;
      }
    }

    // Mark the departmentRequirements field as modified for Mongoose
    event.markModified('departmentRequirements');

    if (!requirementFound) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Save the updated event
    await event.save();

    // Debug: Log the saved requirement to verify departmentNotes is saved
    const savedRequirement = Object.values(event.departmentRequirements)
      .flat()
      .find(r => r.id === requirementId);
    console.log('🔍 Saved requirement after update:', JSON.stringify(savedRequirement, null, 2));

    res.status(200).json({
      success: true,
      message: 'Requirement notes updated successfully',
      data: event
    });
  } catch (error) {
    console.error('Error updating requirement notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update requirement notes',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PATCH /api/events/:eventId/requirements/:requirementId/status - Update requirement status
router.patch('/:eventId/requirements/:requirementId/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { eventId, requirementId } = req.params;
    const { status, declineReason } = req.body;
    const userDepartment = (req as any).user.department;
    
    console.log('🔄 STATUS UPDATE REQUEST received', { status, declineReason });

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Check if user's department is tagged in this event
    if (!event.taggedDepartments.includes(userDepartment)) {
      return res.status(403).json({
        success: false,
        message: 'Your department is not tagged in this event'
      });
    }

    // Find and update the requirement
    let requirementFound = false;
    let oldStatus = '';
    let requirementName = '';
    let updatedRequirement: any = null;
    
    for (const [dept, requirements] of Object.entries(event.departmentRequirements) as [string, any[]][]) {
      const requirement = requirements.find(r => r.id === requirementId);
      if (requirement) {
        oldStatus = requirement.status || 'pending';
        requirementName = requirement.name || 'Unknown Requirement';
        requirement.status = status;
        requirement.lastUpdated = new Date().toISOString();
        
        // Save decline reason if status is declined
        if (status === 'declined' && declineReason) {
          requirement.declineReason = declineReason;
          console.log('💾 Saving decline reason:', declineReason);
        }
        
        updatedRequirement = requirement;
        requirementFound = true;
        break;
      }
    }

    // Mark the departmentRequirements field as modified for Mongoose
    event.markModified('departmentRequirements');

    if (!requirementFound) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Save the updated event
    await event.save();

    // Emit real-time status update FIRST (before notification creation)
    if (oldStatus !== status) {
      const io = req.app.get('io');
      if (io) {
        const statusUpdateData = {
          eventId: event._id,
          requestorId: event.createdBy,
          departmentName: userDepartment,
          requirementName: requirementName,
          requirementId: requirementId,
          oldStatus: oldStatus,
          newStatus: status,
          departmentNotes: updatedRequirement?.departmentNotes || '',
          declineReason: status === 'declined' ? declineReason : undefined,
          type: 'status_update',
          notificationType: 'status_update'
        };
        
        // Send to event creator
        io.to(`user-${event.createdBy}`).emit('status-update', statusUpdateData);
        io.to(`user-${event.createdBy}`).emit('new-notification', {
          ...statusUpdateData,
          eventTitle: event.eventTitle,
          message: `${requirementName} status changed to "${status}" by ${userDepartment}`
        });
        
        // ALSO send to the user who made the update (for their own badge update!)
        const updatingUserId = (req as any).user.id;
        if (updatingUserId && updatingUserId.toString() !== event.createdBy.toString()) {
          io.to(`user-${updatingUserId}`).emit('status-update', statusUpdateData);
          console.log(`🔔 Status update sent to updating user: ${updatingUserId}`);
        }
        
        console.log('🔄 Status update broadcasted to all relevant users');
      }
      
      // Then try to create notifications (non-critical)
      try {
        // Create notification in main notifications collection
        const eventIdStr = (event._id as any).toString();
        const notificationId = `status-${eventIdStr}-${requirementId}`;
        const notification = new Notification({
          id: notificationId,
          title: "Status Updated",
          message: `"${requirementName}" status: "${status}" by ${userDepartment} for event "${event.eventTitle}"`,
          type: "status",
          category: "status",
          eventId: eventIdStr,
          requirementId: requirementId,
          departmentNotes: updatedRequirement?.departmentNotes || '',
          userId: (event.createdBy as any).toString()
        });

        await notification.save();
        console.log('📝 Status notification created in main notifications collection');

        // Keep the old StatusNotification for backward compatibility (optional)
        const statusNotification = new StatusNotification({
          eventId: event._id,
          requestorId: event.createdBy,
          departmentName: userDepartment,
          requirementName: requirementName,
          requirementId: requirementId,
          oldStatus: oldStatus,
          newStatus: status,
          departmentNotes: updatedRequirement?.departmentNotes || '',
          updatedBy: (req as any).user.id
        });

        await statusNotification.save();
        console.log('📝 Legacy status notification also created');
      } catch (notificationError) {
        console.error('Error creating status notification:', notificationError);
        // Don't fail the main request if notification creation fails
      }
    }

    // Verify status was saved successfully
    const savedRequirement = Object.values(event.departmentRequirements)
      .flat()
      .find((r: any) => r.id === requirementId);
    console.log('✅ Requirement status updated successfully');

    res.status(200).json({
      success: true,
      message: 'Requirement status updated successfully',
      data: event
    });
  } catch (error) {
    console.error('Error updating requirement status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update event status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PATCH /api/events/:eventId/requirements/:requirementId/departments - Change requirement department tags
router.patch('/:eventId/requirements/:requirementId/departments', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { eventId, requirementId } = req.params;
    const { departments } = req.body;
    
    console.log('🔄 DEPARTMENT CHANGE REQUEST:', { eventId, requirementId, departments });

    if (!Array.isArray(departments) || departments.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Departments array is required and cannot be empty'
      });
    }

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Find the requirement in current departments
    let requirement: any = null;
    let oldDepartment: string = '';
    
    for (const [dept, requirements] of Object.entries(event.departmentRequirements) as [string, any[]][]) {
      const foundReq = requirements.find(r => r.id === requirementId);
      if (foundReq) {
        requirement = foundReq;
        oldDepartment = dept;
        // Remove from old department
        event.departmentRequirements[dept] = requirements.filter(r => r.id !== requirementId);
        if (event.departmentRequirements[dept].length === 0) {
          delete event.departmentRequirements[dept];
        }
        break;
      }
    }

    if (!requirement) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Add requirement to new department(s)
    for (const newDept of departments) {
      if (!event.departmentRequirements[newDept]) {
        event.departmentRequirements[newDept] = [];
      }
      event.departmentRequirements[newDept].push(requirement);
    }

    // Update tagged departments list - ONLY include departments that have requirements
    const allDepts = Object.keys(event.departmentRequirements);
    event.taggedDepartments = allDepts; // Replace entire array with only departments that have requirements

    // Mark as modified for Mongoose
    event.markModified('departmentRequirements');
    event.markModified('taggedDepartments');

    // Save the event
    await event.save();

    console.log(`✅ Requirement moved from ${oldDepartment} to ${departments.join(', ')}`);

    res.status(200).json({
      success: true,
      message: 'Department tags updated successfully',
      data: event
    });
  } catch (error) {
    console.error('Error updating department tags:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update department tags',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/events/:eventId/add-department - Add department with requirements to existing event
router.post('/:eventId/add-department', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { departmentName, requirements } = req.body;
    
    console.log('➕ ADD DEPARTMENT REQUEST:', { eventId, departmentName, requirementsCount: requirements?.length });

    if (!departmentName || !Array.isArray(requirements) || requirements.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Department name and requirements array are required'
      });
    }

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Initialize departmentRequirements if it doesn't exist
    if (!event.departmentRequirements) {
      event.departmentRequirements = {};
    }

    // Add or update requirements for this department
    if (!event.departmentRequirements[departmentName]) {
      event.departmentRequirements[departmentName] = [];
    }

    // Add new requirements (filter out duplicates by name)
    requirements.forEach((newReq: any) => {
      if (newReq.selected) {
        const existingReq = event.departmentRequirements[departmentName].find(
          (r: any) => r.name === newReq.name
        );
        
        if (!existingReq) {
          // Add new requirement with availability info
          event.departmentRequirements[departmentName].push({
            id: newReq.id,
            name: newReq.name,
            type: newReq.type,
            selected: true,
            quantity: newReq.quantity || undefined,
            notes: newReq.notes || '',
            totalQuantity: newReq.totalQuantity || newReq.baseQuantity || undefined,
            isAvailable: newReq.isAvailable,
            availabilityNotes: newReq.availabilityNotes || '',
            status: 'pending'
          });
          console.log(`  ➕ Added: ${newReq.name} (${newReq.quantity} of ${newReq.totalQuantity || newReq.baseQuantity})`);
        } else {
          console.log(`  ⚠️ Skipped duplicate: ${newReq.name}`);
        }
      }
    });

    // Update tagged departments list
    if (!event.taggedDepartments.includes(departmentName)) {
      event.taggedDepartments.push(departmentName);
    }

    // Mark as modified for Mongoose
    event.markModified('departmentRequirements');
    event.markModified('taggedDepartments');

    // Save the event
    await event.save();

    console.log(`✅ Added ${departmentName} with requirements to event`);

    res.status(200).json({
      success: true,
      message: 'Department added successfully',
      data: event
    });
  } catch (error) {
    console.error('Error adding department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add department',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PATCH /api/events/:id/status - Update event status (Admin only - Approve/Reject)
router.patch('/:id/status', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;
    
    console.log(`🔄 EVENT STATUS UPDATE REQUEST: ${id} -> ${status}`);
    
    // Validate status
    if (!['approved', 'rejected', 'submitted', 'cancelled'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be approved, rejected, submitted, or cancelled'
      });
    }
    
    // Prepare update object
    const updateData: any = { status };
    
    // Add reason if provided (for rejected or cancelled status)
    if (reason && (status === 'rejected' || status === 'cancelled')) {
      updateData.reason = reason;
    }
    
    // Find the event first to check if it's being cancelled
    const event = await Event.findById(id);
    
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }
    
    // If cancelling the event, reset all department requirements
    if (status === 'cancelled') {
      console.log(`🔄 Cancelling event: ${event.eventTitle} - Resetting all requirements`);
      
      // Reset all department requirements to pending
      const departmentRequirements = event.departmentRequirements || {};
      
      for (const department in departmentRequirements) {
        const requirements = departmentRequirements[department];
        if (Array.isArray(requirements)) {
          requirements.forEach((req: any) => {
            req.status = 'pending';
            req.declineReason = undefined;
            req.notes = undefined;
          });
        }
      }
      
      updateData.departmentRequirements = departmentRequirements;
      console.log(`✅ Reset ${Object.keys(departmentRequirements).length} department requirements`);
    }
    
    // Update the event
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    ).populate('createdBy', 'name email department');
    
    console.log(`✅ Event status updated: ${updatedEvent!.eventTitle} -> ${status}`);
    
    // Emit Socket.IO event for real-time updates
    const io = req.app.get('io');
    if (io) {
      // Get admin name for notification
      const adminUser = (req as any).user;
      const adminName = adminUser?.name || 'Admin';
      
      // Notify the event creator with new-notification event (for GlobalNotificationSystem)
      io.to(`user-${event.createdBy}`).emit('new-notification', {
        type: 'event_status_update',
        eventId: event._id,
        eventTitle: event.eventTitle,
        eventStatus: status,
        status: status,
        adminName: adminName,
        updatedBy: adminName,
        message: `Your event "${event.eventTitle}" has been ${status} by ${adminName}`,
        timestamp: Date.now()
      });
      
      // Also emit old event for backward compatibility
      io.to(`user-${event.createdBy}`).emit('event-status-updated', {
        eventId: event._id,
        eventTitle: event.eventTitle,
        status: status,
        message: `Your event "${event.eventTitle}" has been ${status}`
      });
      
      // Broadcast to all admins
      io.emit('event-updated', updatedEvent);
      
      // If cancelled, notify all tagged departments about requirement reset
      if (status === 'cancelled' && updatedEvent!.taggedDepartments) {
        updatedEvent!.taggedDepartments.forEach((dept: string) => {
          io.emit('status-update', {
            eventId: updatedEvent!._id,
            eventTitle: updatedEvent!.eventTitle,
            department: dept,
            message: `Event "${updatedEvent!.eventTitle}" has been cancelled. All requirements have been reset.`
          });
        });
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Event ${status} successfully`,
      data: updatedEvent
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

// GET /api/events/tagged - Fetch events where user's department is tagged
router.get('/tagged', authenticateToken, async (req: Request, res: Response) => {
  try {
    const userDepartment = (req as any).user.department;
    console.log('📥 GET /tagged - Request received');

    if (!userDepartment) {
      return res.status(400).json({
        success: false,
        message: 'User department not found'
      });
    }

    const events = await Event.find({
      taggedDepartments: userDepartment,
      status: { $ne: 'draft' } // Exclude draft events
    })
    .populate('createdBy', 'name email department')
    .sort({ createdAt: -1 })
    .lean(); // Bypass Mongoose cache and get fresh data from MongoDB

    console.log(`📋 Found ${events.length} tagged events`);

    // Recalculate availability for each event based on current startDate
    const eventsWithUpdatedAvailability = await Promise.all(events.map(async (event: any) => {
      const eventDate = new Date(event.startDate).toISOString().split('T')[0]; // Format: YYYY-MM-DD
      console.log(`🔄 Recalculating availability for event: ${event.eventTitle}, Date: ${eventDate}`);
      
      // Get department requirements for this event
      const departmentRequirements = event.departmentRequirements || {};
      
      // Update availability for ALL departments (not just user's department)
      for (const deptName in departmentRequirements) {
        const requirements = departmentRequirements[deptName];
        
        const updatedRequirements = await Promise.all(
          requirements.map(async (req: any) => {
            // Find the department to get the requirement details
            const department = await Department.findOne({ name: deptName });
            if (!department) {
              console.log(`⚠️ Department not found: ${deptName}`);
              return req;
            }
            
            // Find the requirement in the department
            const deptReq = department.requirements.find((r: any) => r.text === req.name);
            if (!deptReq) {
              console.log(`⚠️ Requirement not found: ${req.name} in ${deptName}`);
              return req;
            }
            
            // Check if there's a custom availability for this date
            const availability = await ResourceAvailability.findOne({
              departmentId: department._id,
              requirementId: deptReq._id,
              date: eventDate
            });
            
            const oldQuantity = req.totalQuantity;
            
            // Update totalQuantity based on availability or default
            if (availability) {
              req.totalQuantity = availability.quantity;
              console.log(`✅ ${deptName} - ${req.name}: Updated from ${oldQuantity} to ${availability.quantity} (custom availability for ${eventDate})`);
            } else if (deptReq.totalQuantity) {
              req.totalQuantity = deptReq.totalQuantity;
              console.log(`📋 ${deptName} - ${req.name}: Using default ${deptReq.totalQuantity} (no custom availability for ${eventDate})`);
            }
            
            return req;
          })
        );
        
        departmentRequirements[deptName] = updatedRequirements;
      }
      
      return {
        ...event,
        departmentRequirements
      };
    }));

    res.status(200).json({
      success: true,
      count: eventsWithUpdatedAvailability.length,
      data: eventsWithUpdatedAvailability
    });
  } catch (error) {
    console.error('Error fetching tagged events:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch tagged events',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
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
      .sort({ createdAt: -1 })
      .lean();

    console.log(`📋 Found ${events.length} user events`);

    // Recalculate availability for each event based on current startDate
    const eventsWithUpdatedAvailability = await Promise.all(events.map(async (event: any) => {
      const eventDate = new Date(event.startDate).toISOString().split('T')[0]; // Format: YYYY-MM-DD
      console.log(`🔄 [MY EVENTS] Recalculating availability for: ${event.eventTitle}, Date: ${eventDate}`);
      
      // Get department requirements for this event
      const departmentRequirements = event.departmentRequirements || {};
      
      // Update availability for ALL departments
      for (const deptName in departmentRequirements) {
        const requirements = departmentRequirements[deptName];
        
        const updatedRequirements = await Promise.all(
          requirements.map(async (req: any) => {
            // Find the department to get the requirement details
            const department = await Department.findOne({ name: deptName });
            if (!department) {
              console.log(`⚠️ [MY EVENTS] Department not found: ${deptName}`);
              return req;
            }
            
            // Find the requirement in the department
            const deptReq = department.requirements.find((r: any) => r.text === req.name);
            if (!deptReq) {
              console.log(`⚠️ [MY EVENTS] Requirement not found: ${req.name} in ${deptName}`);
              return req;
            }
            
            // Check if there's a custom availability for this date
            const availability = await ResourceAvailability.findOne({
              departmentId: department._id,
              requirementId: deptReq._id,
              date: eventDate
            });
            
            const oldQuantity = req.totalQuantity;
            
            // Update totalQuantity based on availability or default
            if (availability) {
              req.totalQuantity = availability.quantity;
              console.log(`✅ [MY EVENTS] ${deptName} - ${req.name}: Updated from ${oldQuantity} to ${availability.quantity} (custom for ${eventDate})`);
            } else if (deptReq.totalQuantity) {
              req.totalQuantity = deptReq.totalQuantity;
              console.log(`📋 [MY EVENTS] ${deptName} - ${req.name}: Using default ${deptReq.totalQuantity} (no custom for ${eventDate})`);
            }
            
            return req;
          })
        );
        
        departmentRequirements[deptName] = updatedRequirements;
      }
      
      return {
        ...event,
        departmentRequirements
      };
    }));

    res.status(200).json({
      success: true,
      count: eventsWithUpdatedAvailability.length,
      data: eventsWithUpdatedAvailability
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

    // 📍 AUTO-CREATE LOCATION AVAILABILITY FOR CUSTOM LOCATIONS
    const predefinedLocations = [
      'Atrium', 'AVR', 'Canteen', 'Covered Court', 'Function Hall',
      'Gymnasium', 'Lobby', 'Open Court', 'Oval', 'Parking Area',
      'Quadrangle', 'Rooftop'
    ];
    
    console.log(`🔍 Checking location: "${location}", Is predefined: ${predefinedLocations.includes(location)}`);
    
    if (location && !predefinedLocations.includes(location)) {
      console.log(`📍 Custom location detected: "${location}" - Auto-creating availability`);
      
      try {
        const eventDate = new Date(startDate).toISOString().split('T')[0];
        const userDepartment = (req as any).user.department || 'Unknown';
        
        console.log(`📅 Event date: ${eventDate}, User department: ${userDepartment}`);
        
        // Check if availability already exists for this location and date
        const existingAvailability = await LocationAvailability.findOne({
          date: eventDate,
          locationName: location
        });
        
        console.log(`🔍 Existing availability check:`, existingAvailability ? 'Found' : 'Not found');
        
        if (!existingAvailability) {
          const newLocation = await LocationAvailability.create({
            date: eventDate,
            locationName: location,
            capacity: 1, // Minimum capacity (N/A)
            description: 'Auto-created from event request',
            status: 'available',
            setBy: userId,
            departmentName: userDepartment
          });
          console.log(`✅ Auto-created location availability:`, newLocation);
        } else {
          console.log(`ℹ️ Location availability already exists for "${location}" on ${eventDate}`);
        }
      } catch (locationError) {
        console.error('❌ ERROR auto-creating location availability:', locationError);
        console.error('❌ ERROR details:', locationError instanceof Error ? locationError.message : 'Unknown error');
        // Don't fail the event creation if location availability fails
      }
    } else {
      console.log(`ℹ️ Skipping auto-create - predefined location or no location`);
    }

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
    const { location, startDate, startTime, endDate, endTime, departmentRequirements } = req.body;
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

    // Check if this is a reschedule (date/time/location changes)
    const isReschedule = (
      (location !== undefined && location !== event.location) ||
      (startDate !== undefined && startDate !== event.startDate?.toISOString().split('T')[0]) ||
      (startTime !== undefined && startTime !== event.startTime) ||
      (endDate !== undefined && endDate !== event.endDate?.toISOString().split('T')[0]) ||
      (endTime !== undefined && endTime !== event.endTime)
    );
    
    // Build update object with only provided fields
    const updateData: any = {
      updatedAt: new Date()
    };
    
    if (location !== undefined) updateData.location = location;
    if (startDate !== undefined) updateData.startDate = new Date(startDate);
    if (startTime !== undefined) updateData.startTime = startTime;
    if (endDate !== undefined) updateData.endDate = new Date(endDate);
    if (endTime !== undefined) updateData.endTime = endTime;
    if (departmentRequirements !== undefined) updateData.departmentRequirements = departmentRequirements;

    // Update the event
    const updatedEvent = await Event.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    );
    
    // 📍 AUTO-CREATE LOCATION AVAILABILITY FOR CUSTOM LOCATIONS (on update)
    if (location !== undefined && updatedEvent) {
      const predefinedLocations = [
        'Atrium', 'AVR', 'Canteen', 'Covered Court', 'Function Hall',
        'Gymnasium', 'Lobby', 'Open Court', 'Oval', 'Parking Area',
        'Quadrangle', 'Rooftop'
      ];
      
      if (!predefinedLocations.includes(location)) {
        console.log(`📍 Custom location detected on update: "${location}" - Auto-creating availability`);
        
        try {
          const eventDate = new Date(updatedEvent.startDate).toISOString().split('T')[0];
          const userDepartment = (req as any).user.department || 'Unknown';
          
          // Check if availability already exists for this location and date
          const existingAvailability = await LocationAvailability.findOne({
            date: eventDate,
            locationName: location
          });
          
          if (!existingAvailability) {
            await LocationAvailability.create({
              date: eventDate,
              locationName: location,
              capacity: 1, // Minimum capacity (N/A)
              description: 'Auto-created from event request',
              status: 'available',
              setBy: userId,
              departmentName: userDepartment
            });
            console.log(`✅ Auto-created location availability for "${location}" on ${eventDate}`);
          } else {
            console.log(`ℹ️ Location availability already exists for "${location}" on ${eventDate}`);
          }
        } catch (locationError) {
          console.error('⚠️ Error auto-creating location availability:', locationError);
          // Don't fail the event update if location availability fails
        }
      }
    }
    
    // Create activity log if this is a reschedule
    if (isReschedule && updatedEvent) {
      try {
        const user = (req as any).user;
        
        // Format dates nicely (e.g., "Oct 23, 2025 8:00 AM")
        const formatDateTime = (date: Date, time: string) => {
          const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
          const [hours, minutes] = time.split(':');
          const hour = parseInt(hours);
          const ampm = hour >= 12 ? 'PM' : 'AM';
          const displayHour = hour % 12 || 12;
          return `${dateStr} ${displayHour}:${minutes} ${ampm}`;
        };
        
        const oldStartFormatted = formatDateTime(event.startDate!, event.startTime);
        const oldEndFormatted = formatDateTime(event.endDate!, event.endTime);
        const newStartFormatted = formatDateTime(updatedEvent.startDate!, updatedEvent.startTime);
        const newEndFormatted = formatDateTime(updatedEvent.endDate!, updatedEvent.endTime);
        
        const oldSchedule = `${oldStartFormatted} - ${oldEndFormatted}`;
        const newSchedule = `${newStartFormatted} - ${newEndFormatted}`;
        
        // Determine what changed
        const locationChanged = location !== undefined && location !== event.location;
        const dateTimeChanged = (
          (startDate !== undefined && startDate !== event.startDate?.toISOString().split('T')[0]) ||
          (startTime !== undefined && startTime !== event.startTime) ||
          (endDate !== undefined && endDate !== event.endDate?.toISOString().split('T')[0]) ||
          (endTime !== undefined && endTime !== event.endTime)
        );
        
        let description = '';
        if (locationChanged && dateTimeChanged) {
          description = `Rescheduled event "${event.eventTitle}" from ${oldSchedule} at ${event.location} to ${newSchedule} at ${updatedEvent.location}`;
        } else if (locationChanged) {
          description = `Changed location for event "${event.eventTitle}" from ${event.location} to ${updatedEvent.location}`;
        } else {
          description = `Rescheduled event "${event.eventTitle}" from ${oldSchedule} to ${newSchedule}`;
        }
        
        await UserActivityLog.create({
          userId: user._id,
          username: event.requestor, // Use event's requestor name, not logged-in user
          email: user.email,
          department: event.requestorDepartment, // Use event's requestor department
          action: 'reschedule_event',
          description: description,
          eventId: event._id,
          eventTitle: event.eventTitle,
          details: {
            oldStartDate: event.startDate,
            oldStartTime: event.startTime,
            oldEndDate: event.endDate,
            oldEndTime: event.endTime,
            newStartDate: updatedEvent.startDate,
            newStartTime: updatedEvent.startTime,
            newEndDate: updatedEvent.endDate,
            newEndTime: updatedEvent.endTime,
            oldLocation: event.location,
            newLocation: updatedEvent.location
          },
          timestamp: new Date()
        });
        
        console.log(`📝 Activity log created: ${event.requestor} rescheduled event ${event.eventTitle}`);
      } catch (logError) {
        console.error('Error creating activity log:', logError);
        // Don't fail the request if logging fails
      }
    }

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