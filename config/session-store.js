const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const { dbConfig } = require('./database');

// Konfigurasi MySQL Session Store
const sessionStoreOptions = {
  host: dbConfig.host,
  port: dbConfig.port,
  user: dbConfig.user,
  password: dbConfig.password,
  database: dbConfig.database,
  charset: dbConfig.charset,
  
  // Interval pembersihan session yang expired (dalam ms)
  expiration: 24 * 60 * 60 * 1000, // 24 jam
  
  // Interval untuk membersihkan expired sessions otomatis
  clearExpiredInterval: 60 * 60 * 1000, // 1 jam
  
  // Buat tabel otomatis dengan schema yang sesuai
  createDatabaseTable: true,
  
  // Schema configuration untuk mengatasi datetime issue
  schema: {
    tableName: 'sessions',
    columnNames: {
      session_id: 'session_id',
      expires: 'expires', 
      data: 'data'
    }
  },
  
  // Connection options
  reconnect: true,
  acquireTimeout: 60000,
  timeout: 60000,
  connectionLimit: 1,
  endConnectionOnClose: true
};

// Buat session store
const sessionStore = new MySQLStore(sessionStoreOptions);

// Handle session store events
sessionStore.onReady().then(() => {
  console.log('✅ MySQL Session Store ready');
}).catch(error => {
  console.error('❌ MySQL Session Store error:', error);
});

// Event listeners untuk monitoring
sessionStore.on('connect', () => {
  console.log('🔗 Session store connected to MySQL');
});

sessionStore.on('disconnect', () => {
  console.log('🔌 Session store disconnected from MySQL');
});

sessionStore.on('error', (error) => {
  console.error('❌ Session store error:', error);
});

module.exports = sessionStore; 
