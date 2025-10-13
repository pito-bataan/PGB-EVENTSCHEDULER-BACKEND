import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import Message, { IMessage } from '../models/Message.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Configure multer for message file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/messages';
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
    fileSize: 25 * 1024 * 1024, // 25MB limit for messages
  },
  fileFilter: (req, file, cb) => {
    // Allow more file types for messages
    const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx|txt|zip|rar|mp4|mov|avi|mp3|wav/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype) || file.mimetype.startsWith('application/') || file.mimetype.startsWith('text/');

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('File type not supported'));
    }
  }
});

// GET /api/messages/conversation/:eventId/:userId - Get messages between current user and another user for specific event
router.get('/conversation/:eventId/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { eventId, userId } = req.params;
    const currentUserId = (req.user as any)?._id;
    const { page = 1, limit = 50 } = req.query;
    
    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    if (!eventId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID and User ID are required'
      });
    }

    // Ensure IDs are strings
    const currentUserIdStr = String(currentUserId);
    const userIdStr = String(userId);

    // Find messages between current user and target user for specific event
    const messages = await Message.find({
      eventId,
      isDeleted: false,
      $or: [
        { senderId: currentUserIdStr, receiverId: userIdStr },
        { senderId: userIdStr, receiverId: currentUserIdStr }
      ]
    })
    .populate('senderId', 'email department')
    .populate('receiverId', 'email department')
    .sort({ timestamp: -1 })
    .skip(skip)
    .limit(limitNum);

    // Get total count for pagination
    const total = await Message.countDocuments({
      eventId,
      isDeleted: false,
      $or: [
        { senderId: currentUserIdStr, receiverId: userIdStr },
        { senderId: userIdStr, receiverId: currentUserIdStr }
      ]
    });

    res.status(200).json({
      success: true,
      data: messages.reverse(), // Reverse to show oldest first
      pagination: {
        current: pageNum,
        pages: Math.ceil(total / limitNum),
        total,
        limit: limitNum
      }
    });
  } catch (error) {
    console.error('Error fetching conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/messages/send - Send a new message
router.post('/send', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { eventId, receiverId, content, messageType = 'text' } = req.body;
    const senderId = (req.user as any)?._id;

    if (!eventId || !receiverId || !content) {
      return res.status(400).json({
        success: false,
        message: 'Event ID, receiver ID, and content are required'
      });
    }

    if (content.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Message content cannot be empty'
      });
    }

    if (content.length > 2000) {
      return res.status(400).json({
        success: false,
        message: 'Message cannot exceed 2000 characters'
      });
    }

    // Ensure IDs are strings
    const senderIdStr = String(senderId);
    const receiverIdStr = String(receiverId);

    // Create new message
    const newMessage: IMessage = new Message({
      eventId,
      senderId: senderIdStr,
      receiverId: receiverIdStr,
      content: content.trim(),
      messageType,
      timestamp: new Date(),
      isRead: false
    });

    const savedMessage = await newMessage.save();
    
    // Populate sender and receiver info
    const populatedMessage = await Message.findById(savedMessage._id)
      .populate('senderId', 'email department')
      .populate('receiverId', 'email department');

    console.log(`📨 Message sent from ${(req.user as any)?.email} to receiver ${receiverIdStr} for event ${eventId}`);

    // Emit real-time message to receiver
    const io = (req as any).app.get('io');
    if (io) {
      // Send to receiver's personal room
      io.to(`user-${receiverIdStr}`).emit('new-message', {
        message: populatedMessage,
        conversationId: `${eventId}-${senderIdStr}`
      });
      
      // Send to conversation room (if both users are in the same conversation)
      io.to(`conversation-${eventId}-${senderIdStr}-${receiverIdStr}`).emit('new-message', {
        message: populatedMessage,
        conversationId: `${eventId}-${senderIdStr}`
      });
      
      console.log(`🔔 Real-time message sent to user-${receiverIdStr}`);
    }

    res.status(201).json({
      success: true,
      message: 'Message sent successfully',
      data: populatedMessage
    });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// POST /api/messages/send-file - Send a message with file attachment
router.post('/send-file', authenticateToken, upload.single('file'), async (req: Request, res: Response) => {
  try {
    const { eventId, receiverId, content = '' } = req.body;
    const senderId = (req.user as any)?._id;
    const file = req.file;

    if (!eventId || !receiverId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID and receiver ID are required'
      });
    }

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'File is required'
      });
    }

    // Determine message type based on file
    let messageType: 'image' | 'file' = 'file';
    if (file.mimetype.startsWith('image/')) {
      messageType = 'image';
    }

    // Create attachment object
    const attachment = {
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype
    };

    // Create new message with file attachment
    let messageContent = content.trim();
    
    // If no custom content provided, set default content based on message type
    if (!messageContent) {
      if (messageType === 'image') {
        messageContent = '🖼️ Image';
      } else {
        const truncatedFileName = file.originalname.length > 30 
          ? file.originalname.substring(0, 27) + '...' 
          : file.originalname;
        messageContent = `📎 ${truncatedFileName}`;
      }
    }

    // Ensure IDs are strings
    const senderIdStr = String(senderId);
    const receiverIdStr = String(receiverId);

    const newMessage: IMessage = new Message({
      eventId,
      senderId: senderIdStr,
      receiverId: receiverIdStr,
      content: messageContent,
      messageType,
      timestamp: new Date(),
      isRead: false,
      attachments: [attachment]
    });

    const savedMessage = await newMessage.save();
    
    // Populate sender and receiver info
    const populatedMessage = await Message.findById(savedMessage._id)
      .populate('senderId', 'email department')
      .populate('receiverId', 'email department');

    console.log(`📎 File message sent from ${(req.user as any)?.email} to receiver ${receiverIdStr} for event ${eventId}`);
    console.log(`📁 File: ${file.originalname} (${file.size} bytes)`);

    // Emit real-time message to receiver
    const io = (req as any).app.get('io');
    if (io) {
      // Send to receiver's personal room
      io.to(`user-${receiverIdStr}`).emit('new-message', {
        message: populatedMessage,
        conversationId: `${eventId}-${senderIdStr}`
      });
      
      // Send to conversation room (if both users are in the same conversation)
      io.to(`conversation-${eventId}-${senderIdStr}-${receiverIdStr}`).emit('new-message', {
        message: populatedMessage,
        conversationId: `${eventId}-${senderIdStr}`
      });
      
      console.log(`🔔 Real-time file message sent to user-${receiverIdStr}`);
    }

    res.status(201).json({
      success: true,
      message: 'File message sent successfully',
      data: populatedMessage
    });
  } catch (error) {
    console.error('Error sending file message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send file message',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/messages/unread-count/:eventId/:userId - Get unread message count
router.get('/unread-count/:eventId/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { eventId, userId } = req.params;
    const currentUserId = (req.user as any)?._id;

    // Convert ObjectIds to strings properly
    let senderIdStr: string;
    let receiverIdStr: string;
    
    try {
      senderIdStr = userId?.toString?.() || String(userId);
    } catch (e) {
      senderIdStr = String(userId);
    }
    
    try {
      receiverIdStr = currentUserId?.toString?.() || String(currentUserId);
    } catch (e) {
      receiverIdStr = String(currentUserId);
    }

    console.log(`🔍 Unread count query - Event: ${eventId}, Sender: ${senderIdStr}, Receiver: ${receiverIdStr}`);

    const unreadCount = await Message.countDocuments({
      eventId,
      senderId: senderIdStr,
      receiverId: receiverIdStr,
      isRead: false,
      isDeleted: false
    });

    res.status(200).json({
      success: true,
      data: { unreadCount }
    });
  } catch (error) {
    console.error('Error fetching unread count:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch unread count',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/messages/mark-conversation-read/:eventId/:userId - Mark all messages in conversation as read
router.put('/mark-conversation-read/:eventId/:userId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { eventId, userId } = req.params;
    const currentUserId = (req.user as any)?._id;

    if (!eventId || !userId) {
      return res.status(400).json({
        success: false,
        message: 'Event ID and User ID are required'
      });
    }

    // Ensure IDs are strings
    const userIdStr = String(userId);
    const currentUserIdStr = String(currentUserId);

    // Mark messages as read (where current user is receiver)
    const updatedMessages = await Message.updateMany({
      eventId,
      senderId: userIdStr,
      receiverId: currentUserIdStr,
      isRead: false,
      isDeleted: false
    }, {
      isRead: true
    });

    // Emit read status update to sender if messages were marked as read
    if (updatedMessages.modifiedCount > 0) {
      const io = (req as any).app.get('io');
      if (io) {
        // Notify sender that their messages have been read
        io.to(`user-${userIdStr}`).emit('messages-read', {
          eventId,
          readerId: currentUserIdStr,
          conversationId: `${eventId}-${currentUserIdStr}`
        });
        console.log(`👀 Notified user ${userIdStr} that messages were seen by ${currentUserIdStr}`);
      }
    }

    res.status(200).json({
      success: true,
      message: 'Conversation marked as read',
      data: { markedCount: updatedMessages.modifiedCount }
    });
  } catch (error) {
    console.error('Error marking conversation as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark conversation as read',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// PUT /api/messages/:messageId/read - Mark message as read
router.put('/:messageId/read', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const currentUserId = (req.user as any)?._id;

    // Ensure ID is string
    const currentUserIdStr = String(currentUserId);

    const message = await Message.findOneAndUpdate({
      _id: messageId,
      receiverId: currentUserIdStr,
      isDeleted: false
    }, {
      isRead: true
    }, { new: true });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you are not authorized to mark it as read'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message marked as read',
      data: message
    });
  } catch (error) {
    console.error('Error marking message as read:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark message as read',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// DELETE /api/messages/:messageId - Delete message (soft delete)
router.delete('/:messageId', authenticateToken, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const currentUserId = (req.user as any)?._id;

    // Ensure ID is string
    const currentUserIdStr = String(currentUserId);

    const message = await Message.findOneAndUpdate({
      _id: messageId,
      senderId: currentUserIdStr,
      isDeleted: false
    }, {
      isDeleted: true,
      deletedAt: new Date()
    }, { new: true });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found or you are not authorized to delete it'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete message',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// GET /api/messages/file/:filename - Serve uploaded files
router.get('/file/:filename', authenticateToken, (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    const filePath = path.join(process.cwd(), 'uploads', 'messages', filename);
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        success: false,
        message: 'File not found'
      });
    }
    
    // Send file
    res.sendFile(filePath);
  } catch (error) {
    console.error('Error serving file:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to serve file',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
