import express, { Request, Response } from 'express';
import Department, { IDepartment } from '../models/Department.js';
import { authenticateToken, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// GET /api/departments - Get all departments (Admin only)
router.get('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { page = 1, limit = 50, search = '', visible } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Build search query
    const query: any = {};
    
    if (search) {
      query.name = { $regex: search, $options: 'i' };
    }
    
    if (visible !== undefined) {
      query.isVisible = visible === 'true';
    }

    // Get departments with pagination
    const departments = await Department.find(query)
      .sort({ name: 1 })
      .skip(skip)
      .limit(limitNum);

    // Get total count for pagination
    const total = await Department.countDocuments(query);

    res.status(200).json({
      success: true,
      data: departments,
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching departments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/departments - Create new department (Admin only)
router.post('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { name, requirements, isVisible = true } = req.body;

    // Validate required fields
    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'Department name is required'
      });
    }

    // Check if department already exists
    const existingDepartment = await Department.findOne({
      name: name.toUpperCase().trim()
    });

    if (existingDepartment) {
      return res.status(400).json({
        success: false,
        message: 'Department already exists'
      });
    }

    // Create new department
    const newDepartment: IDepartment = new Department({
      name: name.toUpperCase().trim(),
      requirements: requirements || '',
      isVisible
    });

    const savedDepartment = await newDepartment.save();

    res.status(201).json({
      success: true,
      message: 'Department created successfully',
      data: savedDepartment
    });
  } catch (error) {
    console.error('Error creating department:', error);
    
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
        message: 'Department already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create department',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/departments/:id/requirements - Get department requirements (Admin only)
router.get('/:id/requirements', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const department = await Department.findById(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    res.status(200).json({
      success: true,
      data: department.requirements
    });
  } catch (error) {
    console.error('Error fetching department requirements:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch department requirements',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/departments/:id/requirements - Add new requirement (Authenticated users)
router.post('/:id/requirements', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { text, type, totalQuantity, isActive, isAvailable, responsiblePerson } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Requirement text is required'
      });
    }

    if (!type || !['physical', 'service'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Requirement type must be either "physical" or "service"'
      });
    }

    const department = await Department.findById(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check if user can access this department (Admin or same department)
    if (req.user?.role !== 'Admin' && req.user?.department !== department.name) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only manage your own department requirements'
      });
    }

    // Add new requirement
    const newRequirement = {
      text: text.trim(),
      type,
      totalQuantity: type === 'physical' ? (totalQuantity || 1) : undefined,
      isActive: isActive !== false,
      isAvailable: isAvailable !== false,
      responsiblePerson: type === 'service' ? responsiblePerson : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    department.requirements.push(newRequirement as any);
    await department.save();

    // Get the added requirement with its ID
    const addedRequirement = department.requirements[department.requirements.length - 1];

    res.status(201).json({
      success: true,
      message: 'Requirement added successfully',
      data: addedRequirement
    });
  } catch (error) {
    console.error('Error adding department requirement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add requirement',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/departments/:id/requirements/:requirementId - Update requirement (Authenticated users)
router.put('/:id/requirements/:requirementId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id, requirementId } = req.params;
    const { text, type, totalQuantity, isActive, isAvailable, responsiblePerson } = req.body;

    const department = await Department.findById(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check if user can access this department (Admin or same department)
    if (req.user?.role !== 'Admin' && req.user?.department !== department.name) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only manage your own department requirements'
      });
    }

    // Find and update requirement
    const requirementIndex = department.requirements.findIndex(
      req => req._id?.toString() === requirementId
    );

    if (requirementIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    // Update requirement fields
    const requirement = department.requirements[requirementIndex];
    if (text !== undefined) requirement.text = text.trim();
    if (type !== undefined && ['physical', 'service'].includes(type)) requirement.type = type as 'physical' | 'service';
    if (totalQuantity !== undefined) requirement.totalQuantity = totalQuantity;
    if (isActive !== undefined) requirement.isActive = isActive;
    if (isAvailable !== undefined) requirement.isAvailable = isAvailable;
    if (responsiblePerson !== undefined) requirement.responsiblePerson = responsiblePerson;
    requirement.updatedAt = new Date();

    await department.save();

    res.status(200).json({
      success: true,
      message: 'Requirement updated successfully',
      data: requirement
    });
  } catch (error) {
    console.error('Error updating department requirement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update requirement',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/departments/:id/requirements/:requirementId/toggle - Toggle requirement status (Authenticated users)
router.put('/:id/requirements/:requirementId/toggle', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id, requirementId } = req.params;

    const department = await Department.findById(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check if user can access this department (Admin or same department)
    if (req.user?.role !== 'Admin' && req.user?.department !== department.name) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only manage your own department requirements'
      });
    }

    // Find and toggle requirement
    const requirementIndex = department.requirements.findIndex(
      req => req._id?.toString() === requirementId
    );

    if (requirementIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    const requirement = department.requirements[requirementIndex];
    requirement.isActive = !requirement.isActive;
    requirement.updatedAt = new Date();

    await department.save();

    res.status(200).json({
      success: true,
      message: 'Requirement status toggled successfully',
      data: requirement
    });
  } catch (error) {
    console.error('Error toggling requirement status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to toggle requirement status',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/departments/:id/requirements/:requirementId - Delete requirement (Authenticated users)
router.delete('/:id/requirements/:requirementId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id, requirementId } = req.params;

    const department = await Department.findById(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check if user can access this department (Admin or same department)
    if (req.user?.role !== 'Admin' && req.user?.department !== department.name) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only manage your own department requirements'
      });
    }

    // Remove requirement
    const initialLength = department.requirements.length;
    department.requirements = department.requirements.filter(
      req => req._id?.toString() !== requirementId
    );

    if (department.requirements.length === initialLength) {
      return res.status(404).json({
        success: false,
        message: 'Requirement not found'
      });
    }

    await department.save();

    res.status(200).json({
      success: true,
      message: 'Requirement deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting department requirement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete requirement',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/departments/:id/visibility - Toggle department visibility (Admin only)
router.put('/:id/visibility', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { isVisible } = req.body;

    if (typeof isVisible !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'isVisible must be a boolean value'
      });
    }

    const department = await Department.findByIdAndUpdate(
      id,
      { isVisible },
      { new: true }
    );

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Department visibility updated successfully',
      data: department
    });
  } catch (error) {
    console.error('Error updating department visibility:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update department visibility',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/departments/:id - Delete department (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const department = await Department.findByIdAndDelete(id);

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Department deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting department:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete department',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/departments/sync - Sync departments from frontend (Admin only)
router.post('/sync', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const { departments } = req.body;

    if (!departments || !Array.isArray(departments)) {
      return res.status(400).json({
        success: false,
        message: 'Departments array is required'
      });
    }

    const syncedDepartments = [];

    for (const dept of departments) {
      // Check if department already exists
      let existingDept = await Department.findOne({ name: dept.name.toUpperCase() });
      
      if (!existingDept) {
        // Create new department
        existingDept = new Department({
          name: dept.name.toUpperCase(),
          requirements: [],
          isVisible: dept.isVisible !== false
        });
        await existingDept.save();
      }
      
      syncedDepartments.push({
        id: (existingDept._id as any).toString(),
        name: existingDept.name,
        isVisible: existingDept.isVisible,
        createdAt: existingDept.createdAt,
        userCount: 0, // This would come from user collection count
        requirements: existingDept.requirements
      });
    }

    res.status(200).json({
      success: true,
      message: 'Departments synced successfully',
      data: syncedDepartments
    });
  } catch (error) {
    console.error('Error syncing departments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to sync departments',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/departments/name/:name/requirements - Add requirement by department name (Authenticated users)
router.post('/name/:name/requirements', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { name } = req.params;
    const { text, type, totalQuantity, isActive, isAvailable, responsiblePerson } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Requirement text is required'
      });
    }

    if (!type || !['physical', 'service'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Requirement type must be either "physical" or "service"'
      });
    }

    const department = await Department.findOne({ name: name.toUpperCase() });

    if (!department) {
      return res.status(404).json({
        success: false,
        message: 'Department not found'
      });
    }

    // Check if user can access this department (Admin or same department)
    if (req.user?.role !== 'Admin' && req.user?.department !== department.name) {
      return res.status(403).json({
        success: false,
        message: 'Access denied - you can only manage your own department requirements'
      });
    }

    // Add new requirement
    const newRequirement = {
      text: text.trim(),
      type,
      totalQuantity: type === 'physical' ? (totalQuantity || 1) : undefined,
      isActive: isActive !== false,
      isAvailable: isAvailable !== false,
      responsiblePerson: type === 'service' ? responsiblePerson : undefined,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    department.requirements.push(newRequirement as any);
    await department.save();

    // Get the added requirement with its ID
    const addedRequirement = department.requirements[department.requirements.length - 1];

    res.status(201).json({
      success: true,
      message: 'Requirement added successfully',
      data: addedRequirement
    });
  } catch (error) {
    console.error('Error adding department requirement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to add requirement',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/departments/visible - Get visible departments (Public)
router.get('/visible', async (req: Request, res: Response) => {
  try {
    const departments = await Department.find({ isVisible: true })
      .select('_id name requirements isVisible')
      .sort({ name: 1 });

    res.status(200).json({
      success: true,
      data: departments
    });
  } catch (error) {
    console.error('Error fetching visible departments:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch departments',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
