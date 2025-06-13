const { connectDB, closeConnection } = require('../config/database');

// Load environment variables
require('dotenv').config();
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;
const DB_NAME = process.env.DB_NAME || 'soewondo_chat';

const runMigrations = async (keepConnection = false) => {
  try {
    console.log('🚀 Memulai migrasi database...');
    
    const db = await connectDB();

    // Migrasi tabel users
    console.log('📝 Membuat tabel users...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_online BOOLEAN DEFAULT FALSE,
        INDEX idx_username (username),
        INDEX idx_online (is_online)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Migrasi tabel messages
    console.log('📝 Membuat tabel messages...');
    await db.execute(`
      CREATE TABLE IF NOT EXISTS messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        sender_id INT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_edited BOOLEAN DEFAULT FALSE,
        edited_at TIMESTAMP NULL,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_created_at (created_at),
        INDEX idx_sender (sender_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Sessions table akan dibuat otomatis oleh express-mysql-session
    console.log('📝 Sessions table akan dibuat otomatis oleh express-mysql-session');

    // Tambahkan beberapa data dummy untuk testing (opsional)
    console.log('📝 Memeriksa data dummy...');
    const [users] = await db.execute('SELECT COUNT(*) as count FROM users');
    
    if (users[0].count === 0) {
      console.log('📝 Menambahkan data dummy...');
      const bcrypt = require('bcryptjs');
      
      // Hash password untuk user demo
      const hashedPassword = await bcrypt.hash('demo123', BCRYPT_ROUNDS);
      
      await db.execute(`
        INSERT INTO users (username, password) VALUES 
        ('demo_user', ?),
        ('test_user', ?)
      `, [hashedPassword, hashedPassword]);
      
      console.log('✅ Data dummy berhasil ditambahkan:');
      console.log('   - Username: demo_user, Password: demo123');
      console.log('   - Username: test_user, Password: demo123');
    }

    console.log('✅ Migrasi database selesai!');
    console.log('📊 Struktur database:');
    console.log(`   - Database: ${DB_NAME}`);
    console.log('   - Tabel: users (id, username, password, created_at, updated_at, last_seen, is_online)');
    console.log('   - Tabel: messages (id, sender_id, message, created_at, is_edited, edited_at)');
    console.log('   - Tabel: sessions (akan dibuat otomatis oleh express-mysql-session)');
    
  } catch (error) {
    console.error('❌ Error saat migrasi:', error.message);
    throw error;
  } finally {
    // Hanya tutup koneksi jika tidak diminta untuk mempertahankannya
    if (!keepConnection) {
      await closeConnection();
    }
  }
};

// Jalankan migrasi jika file ini dijalankan langsung
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('🎉 Migrasi berhasil completed!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Migrasi gagal:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations }; 
