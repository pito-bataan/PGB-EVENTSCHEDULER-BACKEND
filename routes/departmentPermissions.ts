import express from 'express';
import DepartmentPermissions from '../models/DepartmentPermissions';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Get permissions for a specific department
router.get('/:department', authenticateToken, async (req, res) => {
  try {
    const { department } = req.params;
    
    let permissions = await DepartmentPermissions.findOne({ department });
    
    // If no permissions found, return default permissions
    if (!permissions) {
      permissions = {
        department,
        permissions: {
          myRequirements: false,
          manageLocation: false,
          myCalendar: false
        }
      } as any;
    } else {
      // Ensure backward compatibility - add myCalendar if it doesn't exist
      if (permissions.permissions && typeof permissions.permissions.myCalendar === 'undefined') {
        permissions.permissions.myCalendar = false;
        // Save the updated permissions to database
        await DepartmentPermissions.findOneAndUpdate(
          { department },
          { 
            'permissions.myCalendar': false 
          }
        );
      }
    }
    
    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error fetching department permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department permissions'
    });
  }
});

// Get all department permissions
router.get('/', authenticateToken, async (req, res) => {
  try {
    const permissions = await DepartmentPermissions.find()
      .populate('updatedBy', 'name email')
      .sort({ department: 1 });
    
    res.json({
      success: true,
      data: permissions
    });
  } catch (error) {
    console.error('Error fetching all department permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department permissions'
    });
  }
});

// Update permissions for a specific department
router.put('/:department', authenticateToken, async (req, res) => {
  try {
    const { department } = req.params;
    const { permissions } = req.body;
    const userId = (req as any).user.id;
    
    // Validate permissions object
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Invalid permissions data'
      });
    }
    
    // Validate permission fields
    const { myRequirements, manageLocation, myCalendar } = permissions;
    if (typeof myRequirements !== 'boolean' || typeof manageLocation !== 'boolean' || typeof myCalendar !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Permission values must be boolean'
      });
    }
    
    // Update or create department permissions
    const updatedPermissions = await DepartmentPermissions.findOneAndUpdate(
      { department },
      {
        department,
        permissions: {
          myRequirements,
          manageLocation,
          myCalendar
        },
        updatedBy: userId
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).populate('updatedBy', 'name email');
    
    console.log(`✅ Department permissions updated for ${department}:`, permissions);
    
    res.json({
      success: true,
      message: 'Department permissions updated successfully',
      data: updatedPermissions
    });
  } catch (error) {
    console.error('Error updating department permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update department permissions'
    });
  }
});

// Reset permissions for a department to defaults
router.delete('/:department', authenticateToken, async (req, res) => {
  try {
    const { department } = req.params;
    const userId = (req as any).user.id;
    
    // Reset to default permissions
    const defaultPermissions = await DepartmentPermissions.findOneAndUpdate(
      { department },
      {
        department,
        permissions: {
          myRequirements: true,
          manageLocation: true,
          myCalendar: true
        },
        updatedBy: userId
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    ).populate('updatedBy', 'name email');
    
    console.log(`🔄 Department permissions reset to defaults for ${department}`);
    
    res.json({
      success: true,
      message: 'Department permissions reset to defaults',
      data: defaultPermissions
    });
  } catch (error) {
    console.error('Error resetting department permissions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset department permissions'
    });
  }
});

export default router;
