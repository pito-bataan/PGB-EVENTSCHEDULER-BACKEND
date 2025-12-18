import express, { Request, Response } from 'express';
import LocationAvailability, { ILocationAvailability } from '../models/LocationAvailability.js';
import { authenticateToken } from '../middleware/auth.js';
import mongoose from 'mongoose';

const router = express.Router();

// Interface for request body
interface LocationAvailabilityRequest {
  date: string;
  locationName: string;
  capacity: number;
  description?: string;
  status: 'available' | 'unavailable';
}

// GET /api/location-availability - Get all location availabilities
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { date, locationName, departmentName } = req.query;
    
    // Build query object
    const query: any = {};
    
    if (date) {
      query.date = date;
    }
    
    if (locationName) {
      query.locationName = { $regex: locationName, $options: 'i' };
    }
    
    if (departmentName) {
      query.departmentName = departmentName;
    }

    const locationAvailabilities = await LocationAvailability
      .find(query)
      .populate('setBy', 'username email')
      .sort({ date: 1, locationName: 1 });

    res.json({
      success: true,
      data: locationAvailabilities
    });
  } catch (error) {
    console.error('Error fetching location availabilities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch location availabilities',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/location-availability/:id - Get specific location availability
router.get('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location availability ID'
      });
    }

    const locationAvailability = await LocationAvailability
      .findById(id)
      .populate('setBy', 'username email');

    if (!locationAvailability) {
      return res.status(404).json({
        success: false,
        message: 'Location availability not found'
      });
    }

    res.json({
      success: true,
      data: locationAvailability
    });
  } catch (error) {
    console.error('Error fetching location availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch location availability',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/location-availability - Create new location availability
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { date, locationName, capacity, description, status }: LocationAvailabilityRequest = req.body;
    const userId = req.user!._id;
    const userDepartment = req.user!.department;

    // Validation
    if (!date || !locationName || capacity === undefined || capacity === null) {
      return res.status(400).json({
        success: false,
        message: 'Date, location name, and capacity are required'
      });
    }

    // Parse and validate capacity
    const capacityNum = typeof capacity === 'string' ? parseInt(capacity, 10) : capacity;
    
    if (isNaN(capacityNum) || capacityNum < 1) {
      return res.status(400).json({
        success: false,
        message: 'Capacity must be a valid number greater than 0'
      });
    }

    console.log(`Backend received capacity: ${capacity} -> parsed as: ${capacityNum}`);

    if (!['available', 'unavailable'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "available" or "unavailable"'
      });
    }

    // Check if location availability already exists for this date and location
    const existingAvailability = await LocationAvailability.findOne({
      date,
      locationName: { $regex: `^${locationName}$`, $options: 'i' }
    });

    if (existingAvailability) {
      return res.status(409).json({
        success: false,
        message: `Location "${locationName}" availability already set for ${date}`
      });
    }

    // Create new location availability
    const newLocationAvailability = new LocationAvailability({
      date,
      locationName: locationName.trim(),
      capacity: capacityNum, // Use the parsed and validated capacity
      description: description?.trim() || '',
      status,
      setBy: userId,
      departmentName: userDepartment
    });

    const savedLocationAvailability = await newLocationAvailability.save();
    
    // Populate the response
    const populatedLocationAvailability = await LocationAvailability
      .findById(savedLocationAvailability._id)
      .populate('setBy', 'username email');

    res.status(201).json({
      success: true,
      message: 'Location availability created successfully',
      data: populatedLocationAvailability
    });
  } catch (error) {
    console.error('Error creating location availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create location availability',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/location-availability/bulk-create - Bulk create location availabilities
router.post('/bulk-create', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { locations } = req.body;
    const userId = req.user!._id;
    const userDepartment = req.user!.department;

    if (!Array.isArray(locations) || locations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Locations array is required and must not be empty'
      });
    }

    // Validate all locations
    const validatedLocations = [];
    const errors = [];

    for (let i = 0; i < locations.length; i++) {
      const loc = locations[i];
      
      if (!loc.date || !loc.locationName || loc.capacity === undefined || loc.capacity === null) {
        errors.push(`Location ${i + 1}: Missing required fields`);
        continue;
      }

      const capacityNum = typeof loc.capacity === 'string' ? parseInt(loc.capacity, 10) : loc.capacity;
      
      if (isNaN(capacityNum) || capacityNum < 1) {
        errors.push(`Location ${i + 1}: Invalid capacity`);
        continue;
      }

      if (!['available', 'unavailable'].includes(loc.status)) {
        errors.push(`Location ${i + 1}: Invalid status`);
        continue;
      }

      validatedLocations.push({
        date: loc.date,
        locationName: loc.locationName.trim(),
        capacity: capacityNum,
        description: loc.description?.trim() || '',
        status: loc.status,
        setBy: userId,
        departmentName: userDepartment,
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }

    if (validatedLocations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid locations to create',
        errors
      });
    }

    // Get existing locations to avoid duplicates
    const existingLocations = await LocationAvailability.find({
      $or: validatedLocations.map(loc => ({
        date: loc.date,
        locationName: { $regex: `^${loc.locationName}$`, $options: 'i' }
      }))
    });

    const existingKeys = new Set(
      existingLocations.map(loc => `${loc.date}-${loc.locationName.toLowerCase()}`)
    );

    // Filter out duplicates
    const locationsToInsert = validatedLocations.filter(loc => {
      const key = `${loc.date}-${loc.locationName.toLowerCase()}`;
      return !existingKeys.has(key);
    });

    if (locationsToInsert.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'All locations already exist',
        insertedCount: 0,
        duplicateCount: validatedLocations.length
      });
    }

    // Bulk insert using insertMany for optimal performance
    const result = await LocationAvailability.insertMany(locationsToInsert, { 
      ordered: false // Continue inserting even if some fail
    });

    res.status(201).json({
      success: true,
      message: `Successfully created ${result.length} location availabilities`,
      insertedCount: result.length,
      duplicateCount: validatedLocations.length - locationsToInsert.length,
      requestedCount: locations.length,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Error bulk creating location availabilities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk create location availabilities',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/location-availability/:id - Update location availability
router.put('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { date, locationName, capacity, description, status }: LocationAvailabilityRequest = req.body;
    const userId = (req as any).user.userId;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location availability ID'
      });
    }

    // Validation
    if (!date || !locationName || !capacity) {
      return res.status(400).json({
        success: false,
        message: 'Date, location name, and capacity are required'
      });
    }

    if (capacity < 1) {
      return res.status(400).json({
        success: false,
        message: 'Capacity must be at least 1'
      });
    }

    if (!['available', 'unavailable'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status must be either "available" or "unavailable"'
      });
    }

    // Find existing location availability
    const existingAvailability = await LocationAvailability.findById(id);
    
    if (!existingAvailability) {
      return res.status(404).json({
        success: false,
        message: 'Location availability not found'
      });
    }

    // Check if another location availability exists for this date and location (excluding current one)
    const duplicateAvailability = await LocationAvailability.findOne({
      _id: { $ne: id },
      date,
      locationName: { $regex: `^${locationName}$`, $options: 'i' }
    });

    if (duplicateAvailability) {
      return res.status(409).json({
        success: false,
        message: `Location "${locationName}" availability already set for ${date}`
      });
    }

    // Update location availability
    const updatedLocationAvailability = await LocationAvailability.findByIdAndUpdate(
      id,
      {
        date,
        locationName: locationName.trim(),
        capacity,
        description: description?.trim() || '',
        status,
        updatedAt: new Date()
      },
      { new: true, runValidators: true }
    ).populate('setBy', 'username email');

    res.json({
      success: true,
      message: 'Location availability updated successfully',
      data: updatedLocationAvailability
    });
  } catch (error) {
    console.error('Error updating location availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update location availability',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/location-availability/:id - Delete location availability
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid location availability ID'
      });
    }

    const deletedLocationAvailability = await LocationAvailability.findByIdAndDelete(id);

    if (!deletedLocationAvailability) {
      return res.status(404).json({
        success: false,
        message: 'Location availability not found'
      });
    }

    res.json({
      success: true,
      message: 'Location availability deleted successfully',
      data: deletedLocationAvailability
    });
  } catch (error) {
    console.error('Error deleting location availability:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete location availability',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/location-availability/bulk-delete - Bulk delete location availabilities
router.post('/bulk-delete', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'IDs array is required and must not be empty'
      });
    }

    // Validate all IDs
    const invalidIds = ids.filter(id => !mongoose.Types.ObjectId.isValid(id));
    if (invalidIds.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Invalid location availability IDs: ${invalidIds.join(', ')}`
      });
    }

    // Bulk delete using MongoDB's deleteMany
    const result = await LocationAvailability.deleteMany({
      _id: { $in: ids }
    });

    res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} location availabilities`,
      deletedCount: result.deletedCount,
      requestedCount: ids.length
    });
  } catch (error) {
    console.error('Error bulk deleting location availabilities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bulk delete location availabilities',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/location-availability/calendar/:year/:month - Get location availabilities for calendar view
router.get('/calendar/:year/:month', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { year, month } = req.params;
    
    // Validate year and month
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    
    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return res.status(400).json({
        success: false,
        message: 'Invalid year or month'
      });
    }

    // Create date range for the month
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-31`;

    const locationAvailabilities = await LocationAvailability
      .find({
        date: {
          $gte: startDate,
          $lte: endDate
        }
      })
      .populate('setBy', 'username email')
      .sort({ date: 1, locationName: 1 });

    res.json({
      success: true,
      data: locationAvailabilities
    });
  } catch (error) {
    console.error('Error fetching calendar location availabilities:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch calendar location availabilities',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Cleanup function to delete past location availability records
export const cleanupPastLocationAvailabilities = async () => {
  try {
    // Get today's date in YYYY-MM-DD format
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    console.log(`🧹 Starting cleanup of location availabilities before ${todayStr}`);
    
    // Delete all location availability records with dates before today
    const result = await LocationAvailability.deleteMany({
      date: { $lt: todayStr }
    });
    
    console.log(`✅ Cleanup completed: Deleted ${result.deletedCount} past location availability records`);
    
    return {
      success: true,
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} past location availability records`
    };
  } catch (error) {
    console.error('❌ Error during location availability cleanup:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      message: 'Failed to cleanup past location availabilities'
    };
  }
};

// Manual cleanup endpoint (for testing or manual triggers)
router.post('/cleanup-past', authenticateToken, async (req: Request, res: Response) => {
  try {
    const result = await cleanupPastLocationAvailabilities();
    
    if (result.success) {
      res.json({
        success: true,
        message: result.message,
        deletedCount: result.deletedCount
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.message,
        error: result.error
      });
    }
  } catch (error) {
    console.error('Error in manual cleanup endpoint:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to execute cleanup',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
