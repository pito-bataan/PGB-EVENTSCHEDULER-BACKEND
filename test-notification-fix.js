const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/eventscheduler', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function testNotificationCollections() {
  try {
    console.log('🔍 Checking notification collections...');
    
    // Get all collection names
    const collections = await mongoose.connection.db.listCollections().toArray();
    const collectionNames = collections.map(c => c.name);
    
    console.log('📋 Available collections:');
    collectionNames.forEach(name => {
      if (name.toLowerCase().includes('notification')) {
        console.log(`  - ${name}`);
      }
    });
    
    // Check if main notifications collection exists
    if (collectionNames.includes('notifications')) {
      const notificationsCount = await mongoose.connection.db.collection('notifications').countDocuments();
      console.log(`✅ Main 'notifications' collection exists with ${notificationsCount} documents`);
      
      // Show sample documents
      const sampleNotifications = await mongoose.connection.db.collection('notifications').find().limit(3).toArray();
      console.log('📄 Sample notifications:');
      sampleNotifications.forEach(notif => {
        console.log(`  - ID: ${notif.id}, Type: ${notif.type}, Title: ${notif.title}`);
      });
    } else {
      console.log('❌ Main "notifications" collection does not exist yet');
    }
    
    // Check statusnotifications collection
    if (collectionNames.includes('statusnotifications')) {
      const statusCount = await mongoose.connection.db.collection('statusnotifications').countDocuments();
      console.log(`📊 'statusnotifications' collection has ${statusCount} documents`);
    }
    
    // Check notificationreads collection
    if (collectionNames.includes('notificationreads')) {
      const readsCount = await mongoose.connection.db.collection('notificationreads').countDocuments();
      console.log(`📖 'notificationreads' collection has ${readsCount} documents`);
    }
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await mongoose.connection.close();
  }
}

testNotificationCollections();
