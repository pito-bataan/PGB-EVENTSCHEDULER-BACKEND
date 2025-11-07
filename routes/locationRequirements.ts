import express, { Request, Response } from 'express';
import LocationRequirement from '../models/LocationRequirement';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Drop old index and migrate (run once after deleting old data)
router.post('/fix-index', authenticateToken, async (req: Request, res: Response) => {
  try {
    const collection = LocationRequirement.collection;
    
    // Drop the old locationName unique index
    try {
      await collection.dropIndex('locationName_1');
      console.log('✅ Dropped old locationName_1 index');
      res.json({
        message: 'Old index dropped successfully. You can now save new requirements.'
      });
    } catch (error: any) {
      if (error.code === 27 || error.codeName === 'IndexNotFound') {
        console.log('ℹ️ Index locationName_1 does not exist (already dropped)');
        res.json({
          message: 'Index already dropped or does not exist. You can now save new requirements.'
        });
      } else {
        console.error('Error dropping index:', error);
        throw error;
      }
    }
  } catch (error) {
    console.error('Error fixing index:', error);
    res.status(500).json({ message: 'Error fixing index', error: (error as Error).message });
  }
});

// Get all location requirements
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const requirements = await LocationRequirement.find()
      .populate('setBy', 'name email')
      .sort({ locationNames: 1 });
    
    res.json(requirements);
  } catch (error) {
    console.error('Error fetching location requirements:', error);
    res.status(500).json({ message: 'Error fetching location requirements' });
  }
});

// Get requirements for a specific location (searches in locationNames array)
router.get('/:locationName', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { locationName } = req.params;
    
    const requirement = await LocationRequirement.findOne({ 
      locationNames: decodeURIComponent(locationName) 
    }).populate('setBy', 'name email');
    
    if (!requirement) {
      return res.json({ 
        locationNames: [decodeURIComponent(locationName)],
        requirements: [] 
      });
    }
    
    res.json(requirement);
  } catch (error) {
    console.error('Error fetching location requirement:', error);
    res.status(500).json({ message: 'Error fetching location requirement' });
  }
});

// Create or update requirements for multiple locations
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { locationNames, requirements } = req.body;
    
    // req.user is the full User document, so use _id
    const userId = (req as any).user?._id;
    const departmentName = (req as any).user?.department || (req as any).user?.departmentName || 'PGSO';

    if (!locationNames || !Array.isArray(locationNames) || locationNames.length === 0) {
      return res.status(400).json({ message: 'At least one location name is required' });
    }
    
    if (!userId) {
      return res.status(400).json({ message: 'User ID not found in request' });
    }

    if (!Array.isArray(requirements)) {
      return res.status(400).json({ message: 'Requirements must be an array' });
    }

    // Validate requirements
    for (const req of requirements) {
      if (!req.name || typeof req.name !== 'string') {
        return res.status(400).json({ message: 'Each requirement must have a name' });
      }
      if (!req.quantity || typeof req.quantity !== 'number' || req.quantity < 1) {
        return res.status(400).json({ message: 'Each requirement must have a valid quantity' });
      }
    }

    // Sort locationNames for consistent comparison
    const sortedLocationNames = [...locationNames].sort();

    // Find existing document with the same set of locations
    const existingRequirement = await LocationRequirement.findOne({
      locationNames: { $all: sortedLocationNames, $size: sortedLocationNames.length }
    });

    let locationRequirement;
    if (existingRequirement) {
      // Update existing
      existingRequirement.requirements = requirements;
      existingRequirement.setBy = userId;
      existingRequirement.departmentName = departmentName;
      existingRequirement.updatedAt = new Date();
      locationRequirement = await existingRequirement.save();
      await locationRequirement.populate('setBy', 'name email');
    } else {
      // Create new
      locationRequirement = await LocationRequirement.create({
        locationNames: sortedLocationNames,
        requirements,
        setBy: userId,
        departmentName
      });
      await locationRequirement.populate('setBy', 'name email');
    }

    res.status(200).json({
      message: 'Location requirements saved successfully',
      data: locationRequirement
    });
  } catch (error) {
    console.error('Error saving location requirements:', error);
    res.status(500).json({ message: 'Error saving location requirements' });
  }
});

// Delete requirements by ID
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const result = await LocationRequirement.findByIdAndDelete(id);
    
    if (!result) {
      return res.status(404).json({ message: 'Location requirements not found' });
    }
    
    res.json({ 
      message: 'Location requirements deleted successfully',
      data: result
    });
  } catch (error) {
    console.error('Error deleting location requirements:', error);
    res.status(500).json({ message: 'Error deleting location requirements' });
  }
});

export default router;
