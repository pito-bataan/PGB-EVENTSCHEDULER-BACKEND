import express, { Request, Response } from 'express';
import Event from '../models/Event.js';
import { authenticateToken } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';

const router = express.Router();

// Configure multer for event report uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/event-reports';
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
    fileSize: 10 * 1024 * 1024, // 10MB limit per file
  },
  fileFilter: (req, file, cb) => {
    // Only allow PDF files for reports
    const allowedTypes = /pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed for event reports'));
    }
  }
});

// POST /api/event-reports/:eventId/upload - Upload event reports
router.post('/:eventId/upload', authenticateToken, upload.fields([
  { name: 'completionReport', maxCount: 1 },
  { name: 'postActivityReport', maxCount: 1 },
  { name: 'assessmentReport', maxCount: 1 },
  { name: 'feedbackForm', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const userId = (req as any).user._id;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    console.log('📊 [EVENT REPORTS] Upload request for event:', eventId);
    console.log('👤 User ID:', userId);

    // Find the event
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Verify the user is the event creator
    if (event.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to upload reports for this event'
      });
    }

    // Verify event is completed
    if (event.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: 'Reports can only be uploaded for completed events'
      });
    }

    // Initialize eventReports if it doesn't exist
    if (!event.eventReports) {
      event.eventReports = {};
    }

    // Process each report type
    const reportTypes = ['completionReport', 'postActivityReport', 'assessmentReport', 'feedbackForm'];
    const uploadedReports: string[] = [];

    for (const reportType of reportTypes) {
      if (files[reportType] && files[reportType].length > 0) {
        const file = files[reportType][0];
        
        // Store file metadata
        (event.eventReports as any)[reportType] = {
          uploaded: true,
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          uploadedAt: new Date(),
          fileUrl: `/uploads/event-reports/${file.filename}`
        };

        uploadedReports.push(reportType);
        console.log(`✅ Uploaded ${reportType}: ${file.originalname}`);
      }
    }

    if (uploadedReports.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No report files were uploaded'
      });
    }

    // Mark the eventReports field as modified for Mongoose
    event.markModified('eventReports');

    // Save the updated event
    await event.save();

    console.log(`✅ [EVENT REPORTS] Successfully uploaded ${uploadedReports.length} report(s) for event ${eventId}`);

    res.status(200).json({
      success: true,
      message: `Successfully uploaded ${uploadedReports.length} report(s)`,
      data: {
        uploadedReports,
        eventReports: event.eventReports
      }
    });

  } catch (error: any) {
    console.error('❌ [EVENT REPORTS] Upload error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to upload event reports',
      error: error.message
    });
  }
});

// GET /api/event-reports/:eventId - Get event reports for a specific event
router.get('/:eventId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const userId = (req as any).user._id;

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({
        success: false,
        message: 'Event not found'
      });
    }

    // Verify the user is the event creator
    if (event.createdBy.toString() !== userId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view reports for this event'
      });
    }

    res.status(200).json({
      success: true,
      data: {
        eventReports: event.eventReports || {}
      }
    });

  } catch (error: any) {
    console.error('❌ [EVENT REPORTS] Fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch event reports',
      error: error.message
    });
  }
});

export default router;
