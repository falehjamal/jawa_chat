const { getConnection } = require('../config/database');

const migration = {
  up: async () => {
    const db = getConnection();
    
    console.log('📦 Menjalankan migration: Menambahkan tabel untuk private chat...');
    
    try {
      // 1. Tabel conversations - untuk menyimpan percakapan antar user
      await db.execute(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user1_id INT NOT NULL,
          user2_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          last_message_id INT NULL,
          last_message_at TIMESTAMP NULL,
          FOREIGN KEY (user1_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (user2_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_conversation (user1_id, user2_id),
          INDEX idx_user1 (user1_id),
          INDEX idx_user2 (user2_id),
          INDEX idx_last_message (last_message_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // 2. Tabel private_messages - untuk menyimpan pesan private
      await db.execute(`
        CREATE TABLE IF NOT EXISTS private_messages (
          id INT AUTO_INCREMENT PRIMARY KEY,
          conversation_id INT NOT NULL,
          sender_id INT NOT NULL,
          receiver_id INT NOT NULL,
          message TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          is_read TINYINT(1) DEFAULT 0,
          read_at TIMESTAMP NULL,
          is_edited TINYINT(1) DEFAULT 0,
          edited_at TIMESTAMP NULL,
          message_type ENUM('text', 'image', 'file') DEFAULT 'text',
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX idx_conversation (conversation_id),
          INDEX idx_sender (sender_id),
          INDEX idx_receiver (receiver_id),
          INDEX idx_created_at (created_at),
          INDEX idx_is_read (is_read)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // 3. Tabel conversation_participants - untuk tracking status percakapan
      await db.execute(`
        CREATE TABLE IF NOT EXISTS conversation_participants (
          id INT AUTO_INCREMENT PRIMARY KEY,
          conversation_id INT NOT NULL,
          user_id INT NOT NULL,
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          last_read_message_id INT NULL,
          last_read_at TIMESTAMP NULL,
          is_active TINYINT(1) DEFAULT 1,
          unread_count INT DEFAULT 0,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          UNIQUE KEY unique_participant (conversation_id, user_id),
          INDEX idx_conversation (conversation_id),
          INDEX idx_user (user_id),
          INDEX idx_unread (unread_count)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // 4. Update foreign key untuk last_message_id di conversations
      await db.execute(`
        ALTER TABLE conversations 
        ADD CONSTRAINT fk_last_message 
        FOREIGN KEY (last_message_id) REFERENCES private_messages(id) ON DELETE SET NULL
      `);
      
      console.log('✅ Migration berhasil: Tabel private chat berhasil dibuat');
      
    } catch (error) {
      console.error('❌ Migration gagal:', error.message);
      throw error;
    }
  },
  
  down: async () => {
    const db = getConnection();
    
    console.log('📦 Rollback migration: Menghapus tabel private chat...');
    
    try {
      // Drop foreign key constraint first
      await db.execute(`ALTER TABLE conversations DROP FOREIGN KEY IF EXISTS fk_last_message`);
      
      // Drop tables in reverse order
      await db.execute(`DROP TABLE IF EXISTS conversation_participants`);
      await db.execute(`DROP TABLE IF EXISTS private_messages`);
      await db.execute(`DROP TABLE IF EXISTS conversations`);
      
      console.log('✅ Rollback berhasil: Tabel private chat berhasil dihapus');
      
    } catch (error) {
      console.error('❌ Rollback gagal:', error.message);
      throw error;
    }
  }
};

module.exports = migration; 
