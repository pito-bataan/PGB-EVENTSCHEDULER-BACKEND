import express from 'express';
import NotificationRead from '../models/NotificationRead.js';
import StatusNotification from '../models/StatusNotification.js';
import Event from '../models/Event.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get read notifications for current user
router.get('/read-status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    
    const readNotifications = await NotificationRead.find({ userId });
    
    // Convert to Set of notification IDs for frontend
    const readNotificationIds = readNotifications.map(n => n.notificationId);
    
    res.json({
      success: true,
      data: readNotificationIds
    });
  } catch (error) {
    console.error('Error fetching read notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch read notifications'
    });
  }
});

// Mark notification as read
router.post('/mark-read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    const { notificationId, eventId, notificationType, category } = req.body;
    
    console.log('📖 Marking notification as read');
    
    // Check if already marked as read
    const existingRead = await NotificationRead.findOne({
      userId,
      notificationId
    });
    
    if (existingRead) {
      return res.json({
        success: true,
        message: 'Notification already marked as read',
        data: existingRead
      });
    }
    
    // Create new read record
    const notificationRead = new NotificationRead({
      userId,
      eventId,
      notificationId,
      notificationType,
      category,
      readAt: new Date()
    });
    
    await notificationRead.save();
    
    // Emit real-time notification read event to all connected clients
    const io = req.app.get('io');
    if (io) {
      // Notify all users that this notification was read by this user
      io.emit('notification-read', {
        userId,
        notificationId,
        eventId,
        readAt: notificationRead.readAt
      });
      
      console.log('🔄 Notification read event broadcasted');
    }
    
    res.json({
      success: true,
      message: 'Notification marked as read',
      data: notificationRead
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notification as read'
    });
  }
});

// Mark multiple notifications as read
router.post('/mark-multiple-read', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    const { notifications } = req.body; // Array of notification objects
    
    console.log(`📖 Marking ${notifications.length} notifications as read`);
    
    const readRecords = [];
    
    for (const notification of notifications) {
      const { notificationId, eventId, notificationType, category } = notification;
      
      // Check if already exists
      const existingRead = await NotificationRead.findOne({
        userId,
        notificationId
      });
      
      if (!existingRead) {
        const notificationRead = new NotificationRead({
          userId,
          eventId,
          notificationId,
          notificationType,
          category,
          readAt: new Date()
        });
        
        await notificationRead.save();
        readRecords.push(notificationRead);
      }
    }
    
    // Emit real-time events for all newly read notifications
    const io = req.app.get('io');
    if (io && readRecords.length > 0) {
      readRecords.forEach(record => {
        io.emit('notification-read', {
          userId,
          notificationId: record.notificationId,
          eventId: record.eventId,
          readAt: record.readAt
        });
      });
      
      console.log(`🔄 Broadcasted ${readRecords.length} notification-read events`);
    }
    
    res.json({
      success: true,
      message: `Marked ${readRecords.length} notifications as read`,
      data: readRecords
    });
  } catch (error) {
    console.error('Error marking multiple notifications as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark notifications as read'
    });
  }
});

// Get notification statistics
router.get('/stats', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    
    const totalRead = await NotificationRead.countDocuments({ userId });
    const readByType = await NotificationRead.aggregate([
      { $match: { userId } },
      { $group: { _id: '$notificationType', count: { $sum: 1 } } }
    ]);
    
    res.json({
      success: true,
      data: {
        totalRead,
        readByType
      }
    });
  } catch (error) {
    console.error('Error fetching notification stats:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch notification statistics'
    });
  }
});

// Broadcast new notification to relevant users (called when events are created/updated)
router.post('/broadcast-new', authenticateToken, async (req, res) => {
  try {
    const { eventId, notificationType, targetUsers } = req.body;
    
    console.log(`📢 Broadcasting new notification for event ${eventId} to ${targetUsers.length} users`);
    
    const io = req.app.get('io');
    if (io) {
      // Emit to specific users
      targetUsers.forEach((userId: string) => {
        io.to(`user-${userId}`).emit('new-notification', {
          eventId,
          notificationType,
          timestamp: new Date()
        });
      });
      
      console.log(`🔄 Broadcasted new-notification event to ${targetUsers.length} users`);
    }
    
    res.json({
      success: true,
      message: 'Notification broadcasted successfully'
    });
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to broadcast notification'
    });
  }
});

// Get status notifications for current user
router.get('/status', authenticateToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }
    
    console.log('📋 Fetching status notifications');
    
    // Get status notifications for events created by this user
    const statusNotifications = await StatusNotification.find({ requestorId: userId })
      .populate('eventId', 'eventTitle')
      .populate('updatedBy', 'name')
      .sort({ createdAt: -1 })
      .limit(50); // Limit to last 50 notifications
    
    console.log(`📋 Found ${statusNotifications.length} status notifications`);
    
    res.json({
      success: true,
      data: statusNotifications
    });
  } catch (error) {
    console.error('Error fetching status notifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch status notifications'
    });
  }
});

// Create status notification (called when requirement status is updated)
router.post('/status', authenticateToken, async (req, res) => {
  try {
    const { 
      eventId, 
      requestorId, 
      departmentName, 
      requirementName, 
      requirementId,
      oldStatus, 
      newStatus, 
      departmentNotes 
    } = req.body;
    
    const updatedBy = req.user?.id;
    
    console.log('📝 Creating status notification');
    
    // Create status notification
    const statusNotification = new StatusNotification({
      eventId,
      requestorId,
      departmentName,
      requirementName,
      requirementId,
      oldStatus,
      newStatus,
      departmentNotes,
      updatedBy
    });
    
    await statusNotification.save();
    
    // Populate the notification for real-time broadcast
    await statusNotification.populate('eventId', 'eventTitle');
    await statusNotification.populate('updatedBy', 'name');
    
    // Emit real-time status update to the requestor
    const io = req.app.get('io');
    if (io) {
      const statusUpdateData = {
        _id: statusNotification._id,
        eventId: statusNotification.eventId,
        requestorId: statusNotification.requestorId,
        departmentName: statusNotification.departmentName,
        requirementName: statusNotification.requirementName,
        requirementId: statusNotification.requirementId,
        oldStatus: statusNotification.oldStatus,
        newStatus: statusNotification.newStatus,
        departmentNotes: statusNotification.departmentNotes,
        updatedAt: statusNotification.updatedAt,
        type: 'status_update',
        notificationType: 'status_update'
      };
      
      // Send to specific user room
      io.to(`user-${requestorId}`).emit('status-update', statusUpdateData);
      
      // Also send as general notification for popup
      io.to(`user-${requestorId}`).emit('new-notification', {
        ...statusUpdateData,
        eventTitle: (statusNotification.eventId as any)?.eventTitle || 'Unknown Event',
        message: `${requirementName} status changed to "${newStatus}" by ${departmentName}`
      });
      
      console.log('🔄 Status update broadcasted');
    }
    
    res.json({
      success: true,
      message: 'Status notification created successfully',
      data: statusNotification
    });
  } catch (error) {
    console.error('Error creating status notification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create status notification'
    });
  }
});

export default router;
