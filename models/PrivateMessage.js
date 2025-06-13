const { getConnection } = require('../config/database');
const Conversation = require('./Conversation');

class PrivateMessage {
  constructor(data) {
    this.id = data.id;
    this.conversation_id = data.conversation_id;
    this.sender_id = data.sender_id;
    this.receiver_id = data.receiver_id;
    this.message = data.message;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.is_read = data.is_read;
    this.read_at = data.read_at;
    this.is_edited = data.is_edited;
    this.edited_at = data.edited_at;
    this.message_type = data.message_type || 'text';
    
    // Data tambahan dari join
    this.sender_username = data.sender_username;
    this.receiver_username = data.receiver_username;
  }

  // Mengirim pesan private baru
  static async sendMessage(senderId, receiverId, message, messageType = 'text') {
    try {
      const db = getConnection();
      
      // Validasi input
      if (!message || message.trim().length === 0) {
        throw new Error('Pesan tidak boleh kosong');
      }
      
      if (senderId === receiverId) {
        throw new Error('Tidak dapat mengirim pesan ke diri sendiri');
      }
      
      // Cari atau buat conversation
      const conversation = await Conversation.findOrCreate(senderId, receiverId);
      
      // Insert pesan baru
      const [result] = await db.execute(`
        INSERT INTO private_messages 
        (conversation_id, sender_id, receiver_id, message, message_type) 
        VALUES (?, ?, ?, ?, ?)
      `, [conversation.id, senderId, receiverId, message.trim(), messageType]);
      
      const messageId = result.insertId;
      
      // Update last message di conversation
      await Conversation.updateLastMessage(conversation.id, messageId);
      
      // Update unread count untuk receiver
      await Conversation.updateUnreadCount(conversation.id, receiverId, true);
      
      // Ambil pesan yang baru dibuat dengan data lengkap
      const [newMessage] = await db.execute(`
        SELECT pm.*, 
               us.username as sender_username,
               ur.username as receiver_username
        FROM private_messages pm
        JOIN users us ON pm.sender_id = us.id
        JOIN users ur ON pm.receiver_id = ur.id
        WHERE pm.id = ?
      `, [messageId]);
      
      return new PrivateMessage(newMessage[0]);
      
    } catch (error) {
      throw error;
    }
  }

  // Mendapatkan pesan dalam conversation
  static async getByConversation(conversationId, userId, limit = 50, offset = 0) {
    try {
      const db = getConnection();
      
      // Verifikasi bahwa user adalah participant
      const [participants] = await db.execute(`
        SELECT user_id FROM conversation_participants 
        WHERE conversation_id = ? AND user_id = ?
      `, [conversationId, userId]);
      
      if (participants.length === 0) {
        throw new Error('Anda tidak memiliki akses ke conversation ini');
      }
      
      // Ambil pesan-pesan
      const [messages] = await db.execute(`
        SELECT pm.*,
               us.username as sender_username,
               ur.username as receiver_username
        FROM private_messages pm
        JOIN users us ON pm.sender_id = us.id
        JOIN users ur ON pm.receiver_id = ur.id
        WHERE pm.conversation_id = ?
        ORDER BY pm.created_at DESC
        LIMIT ? OFFSET ?
      `, [conversationId, limit, offset]);
      
      return messages.reverse().map(msg => new PrivateMessage(msg));
      
    } catch (error) {
      throw error;
    }
  }

  // Mendapatkan pesan berdasarkan ID
  static async findById(messageId, userId) {
    try {
      const db = getConnection();
      
      const [messages] = await db.execute(`
        SELECT pm.*,
               us.username as sender_username,
               ur.username as receiver_username
        FROM private_messages pm
        JOIN users us ON pm.sender_id = us.id
        JOIN users ur ON pm.receiver_id = ur.id
        WHERE pm.id = ? AND (pm.sender_id = ? OR pm.receiver_id = ?)
      `, [messageId, userId, userId]);
      
      if (messages.length === 0) {
        return null;
      }
      
      return new PrivateMessage(messages[0]);
      
    } catch (error) {
      throw error;
    }
  }

  // Edit pesan (hanya pemilik yang bisa edit)
  static async editMessage(messageId, newMessage, userId) {
    try {
      const db = getConnection();
      
      if (!newMessage || newMessage.trim().length === 0) {
        throw new Error('Pesan tidak boleh kosong');
      }
      
      const [result] = await db.execute(`
        UPDATE private_messages 
        SET message = ?, is_edited = 1, edited_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND sender_id = ?
      `, [newMessage.trim(), messageId, userId]);
      
      if (result.affectedRows === 0) {
        throw new Error('Pesan tidak ditemukan atau Anda tidak memiliki akses');
      }
      
      return await PrivateMessage.findById(messageId, userId);
      
    } catch (error) {
      throw error;
    }
  }

  // Hapus pesan (hanya pemilik yang bisa hapus)
  static async deleteMessage(messageId, userId) {
    try {
      const db = getConnection();
      
      // Ambil data pesan untuk update conversation jika perlu
      const message = await PrivateMessage.findById(messageId, userId);
      if (!message) {
        throw new Error('Pesan tidak ditemukan');
      }
      
      if (message.sender_id !== userId) {
        throw new Error('Anda tidak memiliki akses untuk menghapus pesan ini');
      }
      
      // Hapus pesan
      const [result] = await db.execute(`
        DELETE FROM private_messages WHERE id = ? AND sender_id = ?
      `, [messageId, userId]);
      
      if (result.affectedRows === 0) {
        throw new Error('Gagal menghapus pesan');
      }
      
      // Jika ini adalah last message, update conversation
      const conversation = await Conversation.findById(message.conversation_id);
      if (conversation && conversation.last_message_id === messageId) {
        // Cari pesan terakhir yang baru
        const [lastMessages] = await db.execute(`
          SELECT id FROM private_messages 
          WHERE conversation_id = ? 
          ORDER BY created_at DESC 
          LIMIT 1
        `, [message.conversation_id]);
        
        const newLastMessageId = lastMessages.length > 0 ? lastMessages[0].id : null;
        await Conversation.updateLastMessage(message.conversation_id, newLastMessageId);
      }
      
      return { message: 'Pesan berhasil dihapus' };
      
    } catch (error) {
      throw error;
    }
  }

  // Mark pesan sebagai read
  static async markAsRead(messageId, userId) {
    try {
      const db = getConnection();
      
      const [result] = await db.execute(`
        UPDATE private_messages 
        SET is_read = 1, read_at = CURRENT_TIMESTAMP 
        WHERE id = ? AND receiver_id = ? AND is_read = 0
      `, [messageId, userId]);
      
      return result.affectedRows > 0;
      
    } catch (error) {
      throw error;
    }
  }

  // Mark semua pesan dalam conversation sebagai read
  static async markConversationAsRead(conversationId, userId) {
    try {
      await Conversation.markAsRead(conversationId, userId);
      return { message: 'Semua pesan telah ditandai sebagai dibaca' };
      
    } catch (error) {
      throw error;
    }
  }

  // Mendapatkan jumlah unread messages untuk user
  static async getUnreadCount(userId) {
    try {
      const db = getConnection();
      
      const [result] = await db.execute(`
        SELECT COUNT(*) as unread_count
        FROM private_messages 
        WHERE receiver_id = ? AND is_read = 0
      `, [userId]);
      
      return result[0].unread_count || 0;
      
    } catch (error) {
      throw error;
    }
  }

  // Search pesan dalam conversation
  static async searchInConversation(conversationId, userId, searchTerm, limit = 20) {
    try {
      const db = getConnection();
      
      // Verifikasi akses
      const [participants] = await db.execute(`
        SELECT user_id FROM conversation_participants 
        WHERE conversation_id = ? AND user_id = ?
      `, [conversationId, userId]);
      
      if (participants.length === 0) {
        throw new Error('Anda tidak memiliki akses ke conversation ini');
      }
      
      const [messages] = await db.execute(`
        SELECT pm.*,
               us.username as sender_username,
               ur.username as receiver_username
        FROM private_messages pm
        JOIN users us ON pm.sender_id = us.id
        JOIN users ur ON pm.receiver_id = ur.id
        WHERE pm.conversation_id = ? 
          AND pm.message LIKE ?
        ORDER BY pm.created_at DESC
        LIMIT ?
      `, [conversationId, `%${searchTerm}%`, limit]);
      
      return messages.map(msg => new PrivateMessage(msg));
      
    } catch (error) {
      throw error;
    }
  }

  // Mendapatkan statistik pesan untuk conversation
  static async getConversationStats(conversationId, userId) {
    try {
      const db = getConnection();
      
      // Verifikasi akses
      const [participants] = await db.execute(`
        SELECT user_id FROM conversation_participants 
        WHERE conversation_id = ? AND user_id = ?
      `, [conversationId, userId]);
      
      if (participants.length === 0) {
        throw new Error('Anda tidak memiliki akses ke conversation ini');
      }
      
      const [stats] = await db.execute(`
        SELECT 
          COUNT(*) as total_messages,
          COUNT(CASE WHEN sender_id = ? THEN 1 END) as sent_by_me,
          COUNT(CASE WHEN receiver_id = ? THEN 1 END) as received_by_me,
          COUNT(CASE WHEN receiver_id = ? AND is_read = 0 THEN 1 END) as unread_count
        FROM private_messages 
        WHERE conversation_id = ?
      `, [userId, userId, userId, conversationId]);
      
      return stats[0];
      
    } catch (error) {
      throw error;
    }
  }

  // Method untuk format pesan ke JSON
  toJSON() {
    return {
      id: this.id,
      conversation_id: this.conversation_id,
      sender_id: this.sender_id,
      receiver_id: this.receiver_id,
      sender_username: this.sender_username,
      receiver_username: this.receiver_username,
      message: this.message,
      message_type: this.message_type,
      created_at: this.created_at,
      updated_at: this.updated_at,
      is_read: this.is_read,
      read_at: this.read_at,
      is_edited: this.is_edited,
      edited_at: this.edited_at,
      timestamp: this.formatTimestamp(),
      date_header: this.formatDateHeader()
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

  // Format date header (untuk grouping pesan berdasarkan tanggal)
  formatDateHeader() {
    if (!this.created_at) return '';
    
    const date = new Date(this.created_at);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) {
      return 'Hari ini';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Kemarin';
    } else {
      return date.toLocaleDateString('id-ID', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    }
  }

  // Check apakah pesan dari user yang sedang login
  isFromCurrentUser(currentUserId) {
    return this.sender_id === currentUserId;
  }
}

module.exports = PrivateMessage; 
