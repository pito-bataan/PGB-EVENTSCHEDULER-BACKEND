const mongoose = require('mongoose');
require('dotenv').config();

async function checkNotifications() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');
    
    // Check StatusNotification collection
    const StatusNotification = mongoose.model('StatusNotification', new mongoose.Schema({}, { strict: false }));
    const notifications = await StatusNotification.find({}).limit(10);
    console.log('Status Notifications Count:', notifications.length);
    console.log('Status Notifications:', JSON.stringify(notifications, null, 2));
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkNotifications();
