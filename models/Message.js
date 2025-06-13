const { getConnection } = require('../config/database');

class Message {
  constructor(data) {
    this.id = data.id;
    this.sender_id = data.sender_id;
    this.message = data.message;
    this.created_at = data.created_at;
    this.is_edited = data.is_edited;
    this.edited_at = data.edited_at;
    this.sender_username = data.sender_username; // Akan diisi saat join dengan tabel users
  }

  // Simpan pesan baru
  static async create(senderId, message) {
    try {
      const db = getConnection();
      
      const [result] = await db.execute(
        'INSERT INTO messages (sender_id, message) VALUES (?, ?)',
        [senderId, message]
      );

      // Ambil pesan yang baru dibuat beserta data sender
      const [newMessage] = await db.execute(`
        SELECT m.*, u.username as sender_username 
        FROM messages m 
        JOIN users u ON m.sender_id = u.id 
        WHERE m.id = ?
      `, [result.insertId]);

      return new Message(newMessage[0]);
    } catch (error) {
      throw error;
    }
  }

  // Ambil semua pesan dengan limit
  static async getAll(limit = 50, offset = 0) {
    try {
      const db = getConnection();
      
      const [messages] = await db.execute(`
        SELECT m.*, u.username as sender_username 
        FROM messages m 
        JOIN users u ON m.sender_id = u.id 
        ORDER BY m.created_at DESC 
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      return messages.reverse().map(msg => new Message(msg)); // Reverse untuk order ascending
    } catch (error) {
      throw error;
    }
  }

  // Ambil pesan terbaru (untuk real-time)
  static async getRecent(limit = 50) {
    try {
      const db = getConnection();
      
      const [messages] = await db.execute(`
        SELECT m.*, u.username as sender_username 
        FROM messages m 
        JOIN users u ON m.sender_id = u.id 
        ORDER BY m.created_at DESC 
        LIMIT ?
      `, [limit]);

      return messages.reverse().map(msg => new Message(msg));
    } catch (error) {
      throw error;
    }
  }

  // Ambil pesan berdasarkan ID
  static async findById(id) {
    try {
      const db = getConnection();
      
      const [messages] = await db.execute(`
        SELECT m.*, u.username as sender_username 
        FROM messages m 
        JOIN users u ON m.sender_id = u.id 
        WHERE m.id = ?
      `, [id]);

      if (messages.length === 0) {
        return null;
      }

      return new Message(messages[0]);
    } catch (error) {
      throw error;
    }
  }

  // Update pesan (edit)
  static async update(messageId, newMessage, senderId) {
    try {
      const db = getConnection();
      
      // Pastikan hanya pemilik pesan yang bisa edit
      const [result] = await db.execute(
        'UPDATE messages SET message = ?, is_edited = TRUE, edited_at = CURRENT_TIMESTAMP WHERE id = ? AND sender_id = ?',
        [newMessage, messageId, senderId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Pesan tidak ditemukan atau Anda tidak memiliki akses');
      }

      return await Message.findById(messageId);
    } catch (error) {
      throw error;
    }
  }

  // Hapus pesan
  static async delete(messageId, senderId) {
    try {
      const db = getConnection();
      
      // Pastikan hanya pemilik pesan yang bisa hapus
      const [result] = await db.execute(
        'DELETE FROM messages WHERE id = ? AND sender_id = ?',
        [messageId, senderId]
      );

      if (result.affectedRows === 0) {
        throw new Error('Pesan tidak ditemukan atau Anda tidak memiliki akses');
      }

      return { message: 'Pesan berhasil dihapus' };
    } catch (error) {
      throw error;
    }
  }

  // Hitung total pesan
  static async getTotalCount() {
    try {
      const db = getConnection();
      
      const [result] = await db.execute('SELECT COUNT(*) as total FROM messages');
      return result[0].total;
    } catch (error) {
      throw error;
    }
  }

  // Ambil pesan berdasarkan pengirim
  static async getByUser(userId, limit = 50) {
    try {
      const db = getConnection();
      
      const [messages] = await db.execute(`
        SELECT m.*, u.username as sender_username 
        FROM messages m 
        JOIN users u ON m.sender_id = u.id 
        WHERE m.sender_id = ? 
        ORDER BY m.created_at DESC 
        LIMIT ?
      `, [userId, limit]);

      return messages.reverse().map(msg => new Message(msg));
    } catch (error) {
      throw error;
    }
  }

  // Method untuk format pesan ke JSON
  toJSON() {
    return {
      id: this.id,
      sender_id: this.sender_id,
      sender_username: this.sender_username,
      message: this.message,
      created_at: this.created_at,
      is_edited: this.is_edited,
      edited_at: this.edited_at,
      timestamp: this.formatTimestamp()
    };
  }

  // Format timestamp untuk display
  formatTimestamp() {
    if (!this.created_at) return '';
    
    const date = new Date(this.created_at);
    return date.toLocaleTimeString('id-ID', {
      hour: '2-digit',
      minute: '2-digit'
    });
  }
}

module.exports = Message; 
