require('dotenv').config();
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'soewondo_chat',
  port: parseInt(process.env.DB_PORT) || 3306,
  charset: 'utf8mb4'
};

let connection = null;

const connectDB = async () => {
  try {
    // Koneksi tanpa database untuk membuat database jika belum ada
    const tempConnection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password
    });

    // Buat database jika belum ada
    await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS ${dbConfig.database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConnection.end();

    // Koneksi ke database
    connection = await mysql.createConnection(dbConfig);
    console.log(`✅ Koneksi MySQL berhasil ke database ${dbConfig.database}`);
    
    return connection;
  } catch (error) {
    console.error('❌ Error koneksi database:', error.message);
    throw error;
  }
};

const getConnection = () => {
  if (!connection) {
    throw new Error('Database belum terkoneksi. Panggil connectDB() terlebih dahulu.');
  }
  return connection;
};

const closeConnection = async () => {
  if (connection) {
    await connection.end();
    connection = null;
    console.log('📝 Koneksi database ditutup');
  }
};

module.exports = {
  connectDB,
  getConnection,
  closeConnection,
  dbConfig
}; 
