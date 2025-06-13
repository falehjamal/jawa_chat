require('dotenv').config();

const config = {
  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'soewondo_chat',
    port: parseInt(process.env.DB_PORT) || 3306,
    charset: 'utf8mb4',
    acquireTimeout: 60000,
    timeout: 60000
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  // Session Configuration
  session: {
    secret: process.env.SESSION_SECRET || 'soewondo-chat-default-secret-change-in-production',
    maxAge: parseInt(process.env.SESSION_MAX_AGE) || 24 * 60 * 60 * 1000, // 24 jam
    cookieName: 'soewondo_chat_session',
    // Database session store settings
    dbSessionCleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL) || 60 * 60 * 1000 // 1 jam
  },

  // Application Settings
  app: {
    name: process.env.APP_NAME || 'Jawa Chat',
    maxMessageLength: parseInt(process.env.MAX_MESSAGE_LENGTH) || 1000,
    maxUsernameLength: parseInt(process.env.MAX_USERNAME_LENGTH) || 50,
    minUsernameLength: parseInt(process.env.MIN_USERNAME_LENGTH) || 3,
    minPasswordLength: parseInt(process.env.MIN_PASSWORD_LENGTH) || 6
  },

  // Security Settings
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 10,
    loginRateLimit: parseInt(process.env.LOGIN_RATE_LIMIT) || 5,
    chatRateLimit: parseInt(process.env.CHAT_RATE_LIMIT) || 10
  },

  // Development flags
  isDevelopment: () => config.server.nodeEnv === 'development',
  isProduction: () => config.server.nodeEnv === 'production'
};

// Validasi konfigurasi critical
const validateConfig = () => {
  const errors = [];

  if (!config.database.host) {
    errors.push('DB_HOST is required');
  }

  if (!config.database.user) {
    errors.push('DB_USER is required');
  }

  if (!config.database.database) {
    errors.push('DB_NAME is required');
  }

  if (!config.session.secret || config.session.secret === 'soewondo-chat-default-secret-change-in-production') {
    if (config.isProduction()) {
      errors.push('SESSION_SECRET must be set in production');
    } else {
      console.warn('⚠️  Warning: Using default SESSION_SECRET. Change this in production!');
    }
  }

  if (config.app.minPasswordLength < 6) {
    errors.push('MIN_PASSWORD_LENGTH should be at least 6 characters');
  }

  if (config.app.minUsernameLength < 3) {
    errors.push('MIN_USERNAME_LENGTH should be at least 3 characters');
  }

  if (errors.length > 0) {
    console.error('❌ Configuration errors:');
    errors.forEach(error => console.error(`   - ${error}`));
    throw new Error('Invalid configuration. Please check your environment variables.');
  }

  // Log konfigurasi di development
  if (config.isDevelopment()) {
    console.log('🔧 Configuration loaded:');
    console.log(`   - App Name: ${config.app.name}`);
    console.log(`   - Environment: ${config.server.nodeEnv}`);
    console.log(`   - Port: ${config.server.port}`);
    console.log(`   - Database: ${config.database.host}:${config.database.port}/${config.database.database}`);
    console.log(`   - Max message length: ${config.app.maxMessageLength}`);
    console.log(`   - Session max age: ${config.session.maxAge / 1000 / 60} minutes`);
  }
};

// Validasi saat module dimuat
validateConfig();

module.exports = config; 
