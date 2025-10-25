import cron from 'node-cron';
import { cleanupPastLocationAvailabilities } from '../routes/locationAvailability.js';
import { cleanupPastResourceAvailabilities } from '../routes/resourceAvailability.js';
import Event from '../models/Event.js';

// Auto-complete events that have ended
const autoCompleteEvents = async (io: any) => {
  try {
    const now = new Date();
    
    // Find events that should be completed (ended but not yet marked as completed/cancelled)
    const events = await Event.find({
      status: { $nin: ['completed', 'cancelled'] }
    });
    
    let completedCount = 0;
    
    for (const event of events) {
      try {
        // Parse end date and time to create a complete datetime
        // endDate is a Date object, endTime is a string like "14:00"
        const endDate = new Date(event.endDate);
        const [hours, minutes] = event.endTime.split(':').map(Number);
        
        // Create a new date with the time set
        const eventEndDateTime = new Date(endDate);
        eventEndDateTime.setHours(hours, minutes, 0, 0);
        
        // Check if event has ended
        if (eventEndDateTime <= now) {
          // Update status to completed
          event.status = 'completed';
          await event.save();
          
          completedCount++;
          
          // Emit WebSocket event to notify all clients
          if (io) {
            io.emit('event-status-updated', {
              eventId: event._id,
              eventTitle: event.eventTitle,
              status: 'completed',
              autoCompleted: true,
              completedAt: now.toISOString()
            });
            
            // Also emit general event update
            io.emit('event-updated', {
              eventId: event._id,
              eventTitle: event.eventTitle,
              action: 'auto-completed'
            });
          }
          
          // Only log when event is actually completed
          console.log(`✅ Auto-completed: ${event.eventTitle}`);
        }
      } catch (error) {
        console.error(`❌ Error auto-completing event ${event.eventTitle}:`, error);
      }
    }
    
    // Only log summary if events were completed
    if (completedCount > 0) {
      console.log(`🎉 Auto-completed ${completedCount} event(s) at ${now.toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}`);
    }
    
    return { success: true, completedCount };
  } catch (error) {
    console.error('❌ Error in autoCompleteEvents:', error);
    return { success: false, completedCount: 0, error };
  }
};

// Schedule cleanup to run daily at midnight (00:00)
export const startScheduler = (io?: any) => {
  console.log('🕐 Starting automated scheduler...');
  
  // Get current time for logging
  const now = new Date();
  const currentTime = now.toLocaleString('en-PH', { 
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit', 
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  console.log(`🕐 Current time (Asia/Manila): ${currentTime}`);
  
  // Run cleanup daily at midnight
  cron.schedule('0 0 * * *', async () => {
    const scheduleTime = new Date().toLocaleString('en-PH', { 
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    console.log(`🕐 Running scheduled cleanup at: ${scheduleTime}`);
    console.log('🧹 Cleaning up past location availabilities...');
    const locationResult = await cleanupPastLocationAvailabilities();
    console.log(`📍 Location cleanup result: ${JSON.stringify(locationResult)}`);
    
    console.log('🧹 Cleaning up past resource availabilities...');
    const resourceResult = await cleanupPastResourceAvailabilities();
    console.log(`📦 Resource cleanup result: ${JSON.stringify(resourceResult)}`);
    
    console.log('✅ All cleanup tasks completed!');
  }, {
    scheduled: true,
    timezone: "Asia/Manila"
  });
  
  // Run cleanup every 12 hours (at 12:00 PM and 12:00 AM)
  cron.schedule('0 */12 * * *', async () => {
    const cleanupTime = new Date().toLocaleString('en-PH', { 
      timeZone: 'Asia/Manila',
      year: 'numeric',
      month: '2-digit', 
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    console.log(`🕐 Running 12-hour cleanup at: ${cleanupTime}`);
    const locationResult = await cleanupPastLocationAvailabilities();
    const resourceResult = await cleanupPastResourceAvailabilities();
    
    if ((locationResult.deletedCount || 0) > 0 || (resourceResult.deletedCount || 0) > 0) {
      console.log(`🧹 12-hour cleanup result: Deleted ${locationResult.deletedCount || 0} location records, ${resourceResult.deletedCount || 0} resource records`);
    } else {
      console.log(`✅ 12-hour cleanup completed: No old records to delete`);
    }
  }, {
    scheduled: true,
    timezone: "Asia/Manila"
  });
  
  // Auto-complete events every minute
  cron.schedule('* * * * *', async () => {
    await autoCompleteEvents(io);
  }, {
    scheduled: true,
    timezone: "Asia/Manila"
  });
  
  console.log('✅ Scheduler started successfully');
  console.log('📅 Daily cleanup scheduled for midnight (00:00) Asia/Manila');
  console.log('🕐 12-hour cleanup scheduled for 12:00 AM and 12:00 PM Asia/Manila');
  console.log('⏰ Auto-complete events running every minute');
  console.log('🔧 Manual cleanup available at: POST /api/cleanup-now');
};

// Function to run cleanup immediately (for testing)
export const runCleanupNow = async () => {
  console.log('🧹 Running immediate cleanup...');
  console.log('🧹 Cleaning up past location availabilities...');
  const locationResult = await cleanupPastLocationAvailabilities();
  console.log('🧹 Cleaning up past resource availabilities...');
  const resourceResult = await cleanupPastResourceAvailabilities();
  
  return {
    success: locationResult.success && resourceResult.success,
    locationAvailabilities: locationResult,
    resourceAvailabilities: resourceResult,
    totalDeleted: (locationResult.deletedCount || 0) + (resourceResult.deletedCount || 0)
  };
};
