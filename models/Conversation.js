const { getConnection } = require('../config/database');

class Conversation {
  constructor(data) {
    this.id = data.id;
    this.user1_id = data.user1_id;
    this.user2_id = data.user2_id;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_message_id = data.last_message_id;
    this.last_message_at = data.last_message_at;
    
    // Data tambahan dari join
    this.other_user = data.other_user || null;
    this.last_message = data.last_message || null;
    this.unread_count = data.unread_count || 0;
  }

  // Membuat atau mendapatkan conversation antara dua user
  static async findOrCreate(user1Id, user2Id) {
    try {
      const db = getConnection();
      
      // Pastikan user1_id selalu lebih kecil dari user2_id untuk konsistensi
      const [smallerId, largerId] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];
      
      // Cek apakah conversation sudah ada
      const [existing] = await db.execute(`
        SELECT * FROM conversations 
        WHERE user1_id = ? AND user2_id = ?
      `, [smallerId, largerId]);
      
      if (existing.length > 0) {
        return new Conversation(existing[0]);
      }
      
      // Buat conversation baru
      const [result] = await db.execute(`
        INSERT INTO conversations (user1_id, user2_id) 
        VALUES (?, ?)
      `, [smallerId, largerId]);
      
      // Buat participant entries
      await db.execute(`
        INSERT INTO conversation_participants (conversation_id, user_id) 
        VALUES (?, ?), (?, ?)
      `, [result.insertId, user1Id, result.insertId, user2Id]);
      
      // Ambil conversation yang baru dibuat
      const [newConversation] = await db.execute(`
        SELECT * FROM conversations WHERE id = ?
      `, [result.insertId]);
      
      return new Conversation(newConversation[0]);
      
    } catch (error) {
      throw error;
    }
  }

  // Mendapatkan conversation berdasarkan ID
  static async findById(conversationId) {
    try {
      const db = getConnection();
      
      const [conversations] = await db.execute(`
        SELECT * FROM conversations WHERE id = ?
      `, [conversationId]);
      
      if (conversations.length === 0) {
        return null;
      }
      
      return new Conversation(conversations[0]);
      
    } catch (error) {
      throw error;
    }
  }

  // Mendapatkan semua conversation untuk user dengan informasi lengkap
  static async getForUser(userId, limit = 20) {
    try {
      const db = getConnection();
      
      const [conversations] = await db.execute(`
        SELECT 
          c.*,
          CASE 
            WHEN c.user1_id = ? THEN u2.username 
            ELSE u1.username 
          END as other_username,
          CASE 
            WHEN c.user1_id = ? THEN u2.id 
            ELSE u1.id 
          END as other_user_id,
          CASE 
            WHEN c.user1_id = ? THEN u2.is_online 
            ELSE u1.is_online 
          END as other_user_online,
          CASE 
            WHEN c.user1_id = ? THEN u2.last_seen 
            ELSE u1.last_seen 
          END as other_user_last_seen,
          pm.message as last_message_text,
          pm.created_at as last_message_time,
          pm.sender_id as last_message_sender_id,
          cp.unread_count
        FROM conversations c
        JOIN users u1 ON c.user1_id = u1.id
        JOIN users u2 ON c.user2_id = u2.id
        LEFT JOIN private_messages pm ON c.last_message_id = pm.id
        LEFT JOIN conversation_participants cp ON c.id = cp.conversation_id AND cp.user_id = ?
        WHERE c.user1_id = ? OR c.user2_id = ?
        ORDER BY c.last_message_at DESC, c.updated_at DESC
        LIMIT ?
      `, [userId, userId, userId, userId, userId, userId, userId, limit]);
      
      return conversations.map(conv => {
        const conversation = new Conversation(conv);
        conversation.other_user = {
          id: conv.other_user_id,
          username: conv.other_username,
          is_online: conv.other_user_online,
          last_seen: conv.other_user_last_seen
        };
        
        if (conv.last_message_text) {
          conversation.last_message = {
            text: conv.last_message_text,
            created_at: conv.last_message_time,
            sender_id: conv.last_message_sender_id,
            is_from_me: conv.last_message_sender_id === userId
          };
        }
        
        conversation.unread_count = conv.unread_count || 0;
        
        return conversation;
      });
      
    } catch (error) {
      throw error;
    }
  }

  // Update last message untuk conversation
  static async updateLastMessage(conversationId, messageId) {
    try {
      const db = getConnection();
      
      await db.execute(`
        UPDATE conversations 
        SET last_message_id = ?, last_message_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [messageId, conversationId]);
      
    } catch (error) {
      throw error;
    }
  }

  // Mendapatkan conversation antara dua user spesifik
  static async findBetweenUsers(user1Id, user2Id) {
    try {
      const db = getConnection();
      
      const [conversations] = await db.execute(`
        SELECT c.*,
          u1.username as user1_username,
          u2.username as user2_username,
          u1.is_online as user1_online,
          u2.is_online as user2_online
        FROM conversations c
        JOIN users u1 ON c.user1_id = u1.id
        JOIN users u2 ON c.user2_id = u2.id
        WHERE (c.user1_id = ? AND c.user2_id = ?) 
           OR (c.user1_id = ? AND c.user2_id = ?)
      `, [user1Id, user2Id, user2Id, user1Id]);
      
      if (conversations.length === 0) {
        return null;
      }
      
      const conv = conversations[0];
      const conversation = new Conversation(conv);
      
      // Tentukan siapa other user
      const isUser1 = conv.user1_id === user1Id;
      conversation.other_user = {
        id: isUser1 ? conv.user2_id : conv.user1_id,
        username: isUser1 ? conv.user2_username : conv.user1_username,
        is_online: isUser1 ? conv.user2_online : conv.user1_online
      };
      
      return conversation;
      
    } catch (error) {
      throw error;
    }
  }

  // Update unread count untuk participant
  static async updateUnreadCount(conversationId, userId, increment = true) {
    try {
      const db = getConnection();
      
      if (increment) {
        await db.execute(`
          UPDATE conversation_participants 
          SET unread_count = unread_count + 1 
          WHERE conversation_id = ? AND user_id = ?
        `, [conversationId, userId]);
      } else {
        await db.execute(`
          UPDATE conversation_participants 
          SET unread_count = 0, last_read_at = CURRENT_TIMESTAMP 
          WHERE conversation_id = ? AND user_id = ?
        `, [conversationId, userId]);
      }
      
    } catch (error) {
      throw error;
    }
  }

  // Mark all messages as read dalam conversation
  static async markAsRead(conversationId, userId) {
    try {
      const db = getConnection();
      
      // Update private messages
      await db.execute(`
        UPDATE private_messages 
        SET is_read = 1, read_at = CURRENT_TIMESTAMP 
        WHERE conversation_id = ? AND receiver_id = ? AND is_read = 0
      `, [conversationId, userId]);
      
      // Reset unread count
      await this.updateUnreadCount(conversationId, userId, false);
      
    } catch (error) {
      throw error;
    }
  }

  // Delete conversation (soft delete atau hard delete)
  static async delete(conversationId, userId) {
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
      
      // Hard delete - hapus semua data terkait
      await db.execute('DELETE FROM conversation_participants WHERE conversation_id = ?', [conversationId]);
      await db.execute('DELETE FROM private_messages WHERE conversation_id = ?', [conversationId]);
      await db.execute('DELETE FROM conversations WHERE id = ?', [conversationId]);
      
      return { message: 'Conversation berhasil dihapus' };
      
    } catch (error) {
      throw error;
    }
  }

  // Method untuk format conversation ke JSON
  toJSON() {
    return {
      id: this.id,
      user1_id: this.user1_id,
      user2_id: this.user2_id,
      created_at: this.created_at,
      updated_at: this.updated_at,
      last_message_at: this.last_message_at,
      other_user: this.other_user,
      last_message: this.last_message,
      unread_count: this.unread_count
    };
  }

  // Helper method untuk mendapatkan ID user lain dalam conversation
  getOtherUserId(currentUserId) {
    return this.user1_id === currentUserId ? this.user2_id : this.user1_id;
  }
}

module.exports = Conversation; 
