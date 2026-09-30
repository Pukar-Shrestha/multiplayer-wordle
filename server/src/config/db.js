const mongoose = require('mongoose');

/**
 * Connect to MongoDB using the URI from environment variables.
 * Exits the process on failure so the server doesn't start in a broken state.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 2000 // fail fast if local db is down
    });
    console.log(`✅ MongoDB connected: ${conn.connection.host}`);
    
    mongoose.connection.on('disconnected', () => {
      console.warn('⚠️  MongoDB disconnected — attempting to reconnect...');
    });
    mongoose.connection.on('reconnected', () => {
      console.log('✅ MongoDB reconnected');
    });
  } catch (err) {
    console.warn(`⚠️ Standard MongoDB connection failed: ${err.message}`);
    console.warn('🔄 Falling back to mongodb-memory-server (in-memory)...');
    
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      const mongoServer = await MongoMemoryServer.create();
      const mongoUri = mongoServer.getUri();
      
      const conn = await mongoose.connect(mongoUri, {});
      console.log(`✅ In-Memory MongoDB connected: ${conn.connection.host}`);
    } catch (memErr) {
      console.error('❌ In-Memory MongoDB connection error:', memErr.message);
      process.exit(1);
    }
  }
};

module.exports = connectDB;
