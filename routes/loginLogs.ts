import express from 'express';
import LoginLog from '../models/LoginLog.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get all login logs (Admin only)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const logs = await LoginLog.find()
      .sort({ loginTime: -1 })
      .limit(1000); // Limit to last 1000 logs
    
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching login logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch login logs'
    });
  }
});

// Create a login log (called after successful login)
router.post('/', async (req, res) => {
  try {
    const { userId, username, email, department, ipAddress, userAgent } = req.body;
    
    const loginLog = new LoginLog({
      userId,
      username,
      email,
      department,
      loginTime: new Date(),
      ipAddress,
      userAgent
    });
    
    await loginLog.save();
    
    console.log(`✅ Login log created for user: ${username}`);
    
    res.json({
      success: true,
      message: 'Login log created successfully',
      data: loginLog
    });
  } catch (error) {
    console.error('Error creating login log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create login log'
    });
  }
});

// Get login logs for a specific user
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    
    const logs = await LoginLog.find({ userId })
      .sort({ loginTime: -1 })
      .limit(100);
    
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching user login logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user login logs'
    });
  }
});

// Get login logs by date range
router.get('/range', authenticateToken, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const query: any = {};
    
    if (startDate && endDate) {
      query.loginTime = {
        $gte: new Date(startDate as string),
        $lte: new Date(endDate as string)
      };
    }
    
    const logs = await LoginLog.find(query)
      .sort({ loginTime: -1 });
    
    res.json({
      success: true,
      data: logs
    });
  } catch (error) {
    console.error('Error fetching login logs by range:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch login logs'
    });
  }
});

// Delete old login logs (cleanup - Admin only)
router.delete('/cleanup/:days', authenticateToken, async (req, res) => {
  try {
    const { days } = req.params;
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(String(days)));
    
    const result = await LoginLog.deleteMany({
      loginTime: { $lt: daysAgo }
    });
    
    console.log(`🗑️ Deleted ${result.deletedCount} login logs older than ${days} days`);
    
    res.json({
      success: true,
      message: `Deleted ${result.deletedCount} old login logs`,
      deletedCount: result.deletedCount
    });
  } catch (error) {
    console.error('Error deleting old login logs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete old login logs'
    });
  }
});

export default router;
