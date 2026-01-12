import express, { Request, Response } from 'express';
import UserActivityLog from '../models/UserActivityLog.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all user activity logs (Admin only)
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const logs = await UserActivityLog.find()
      .sort({ timestamp: -1 })
      .limit(1000); // Limit to last 1000 logs
    
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching user activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user activity logs'
    });
  }
});

// Create a user activity log (no auth required for login logs)
router.post('/', async (req: Request, res: Response) => {
  try {
    const { 
      userId, 
      username, 
      email, 
      department, 
      action, 
      description, 
      eventId, 
      eventTitle,
      details,
      ipAddress, 
      userAgent 
    } = req.body;
    
    const activityLog = new UserActivityLog({
      userId,
      username,
      email,
      department,
      action,
      description,
      eventId,
      eventTitle,
      details,
      timestamp: new Date(),
      ipAddress,
      userAgent
    });
    
    await activityLog.save();
    
    console.log(`✅ User activity log created: ${action} by ${username}`);
    
    res.json({
      success: true,
      message: 'User activity log created successfully',
      data: activityLog
    });
  } catch (error) {
    console.error('Error creating user activity log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user activity log'
    });
  }
});

// Get activity logs for a specific user
router.get('/user/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    
    const logs = await UserActivityLog.find({ userId })
      .sort({ timestamp: -1 })
      .limit(100);
    
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching user activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user activity logs'
    });
  }
});

// Get activity logs by action type
router.get('/action/:action', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { action } = req.params;
    
    const logs = await UserActivityLog.find({ action })
      .sort({ timestamp: -1 })
      .limit(500);
    
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching activity logs by action:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs'
    });
  }
});

// Get activity logs by date range
router.get('/range', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query: any = {};
    
    if (startDate && endDate) {
      query.timestamp = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }
    
    const logs = await UserActivityLog.find(query)
      .sort({ timestamp: -1 });
    
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching activity logs by range:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch activity logs'
    });
  }
});

// Delete old activity logs (cleanup - Admin only)
router.delete('/cleanup/:days', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { days } = req.params;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(String(days)));
    
    const result = await UserActivityLog.deleteMany({
      timestamp: { $lt: daysAgo }
    });
    
    console.log(`🗑️ Deleted ${result.deletedCount} activity logs older than ${days} days`);
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old activity logs`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting old activity logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete old activity logs'
    });
  }
});

export default router;
