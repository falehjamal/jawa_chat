const { getConnection } = require('../config/database');
const bcrypt = require('bcryptjs');

// Load environment variables
require('dotenv').config();
const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 10;

class User {
  constructor(data) {
    this.id = data.id;
    this.username = data.username;
    this.password = data.password;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
    this.last_seen = data.last_seen;
    this.is_online = data.is_online;
  }

  // Register user baru
  static async register(username, password) {
    try {
      const db = getConnection();
      
      // Cek apakah username sudah ada
      const [existing] = await db.execute(
        'SELECT id FROM users WHERE username = ?',
        [username]
      );
      
      if (existing.length > 0) {
        throw new Error('Username sudah digunakan');
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
      
      // Insert user baru
      const [result] = await db.execute(
        'INSERT INTO users (username, password) VALUES (?, ?)',
        [username, hashedPassword]
      );

      return {
        id: result.insertId,
        username: username,
        message: 'User berhasil didaftarkan'
      };
    } catch (error) {
      throw error;
    }
  }

  // Login user
  static async login(username, password) {
    try {
      const db = getConnection();
      
      const [users] = await db.execute(
        'SELECT * FROM users WHERE username = ?',
        [username]
      );
      
      if (users.length === 0) {
        throw new Error('Username tidak ditemukan');
      }

      const user = users[0];
      const isValidPassword = await bcrypt.compare(password, user.password);
      
      if (!isValidPassword) {
        throw new Error('Password salah');
      }

      // Update status online dan last_seen
      await db.execute(
        'UPDATE users SET is_online = TRUE, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );

      return new User(user);
    } catch (error) {
      throw error;
    }
  }

  // Logout user
  static async logout(userId) {
    try {
      const db = getConnection();
      
      await db.execute(
        'UPDATE users SET is_online = FALSE, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
        [userId]
      );
      
      return { message: 'Logout berhasil' };
    } catch (error) {
      throw error;
    }
  }

  // Get user by ID
  static async findById(id) {
    try {
      const db = getConnection();
      
      const [users] = await db.execute(
        'SELECT * FROM users WHERE id = ?',
        [id]
      );
      
      if (users.length === 0) {
        return null;
      }

      return new User(users[0]);
    } catch (error) {
      throw error;
    }
  }

  // Get user by username
  static async findByUsername(username) {
    try {
      const db = getConnection();
      
      const [users] = await db.execute(
        'SELECT * FROM users WHERE username = ?',
        [username]
      );
      
      if (users.length === 0) {
        return null;
      }

      return new User(users[0]);
    } catch (error) {
      throw error;
    }
  }

  // Get all online users dengan status detail
  static async getOnlineUsers() {
    try {
      const db = getConnection();
      
      const [users] = await db.execute(
        'SELECT id, username, last_seen, is_online FROM users WHERE is_online = TRUE ORDER BY username'
      );
      
      return users;
    } catch (error) {
      throw error;
    }
  }

  // Get all users dengan status detail (termasuk offline)
  static async getAllUsersWithStatus() {
    try {
      const db = getConnection();
      
      const [users] = await db.execute(
        'SELECT id, username, last_seen, is_online FROM users ORDER BY is_online DESC, username'
      );
      
      return users.map(user => {
        return {
          ...user,
          status: this.formatUserStatus(user.is_online, user.last_seen)
        };
      });
    } catch (error) {
      throw error;
    }
  }

  // Format status user sesuai ketentuan baru
  static formatUserStatus(isOnline, lastSeen) {
    if (isOnline) {
      return {
        text: 'Online',
        type: 'online'
      };
    }
    
    if (!lastSeen) {
      return {
        text: 'Offline',
        type: 'offline'
      };
    }
    
    const now = new Date();
    const lastSeenDate = new Date(lastSeen);
    const diffMinutes = Math.floor((now - lastSeenDate) / (1000 * 60));
    
    if (diffMinutes <= 3) {
      return {
        text: `Terakhir dilihat ${diffMinutes} menit yang lalu`,
        type: 'recent_offline',
        minutes: diffMinutes
      };
    } else {
      // Format jam:menit
      const hours = lastSeenDate.getHours().toString().padStart(2, '0');
      const minutes = lastSeenDate.getMinutes().toString().padStart(2, '0');
      return {
        text: `Terakhir dilihat ${hours}.${minutes}`,
        type: 'offline'
      };
    }
  }

  // Update user online status
  static async updateOnlineStatus(userId, isOnline) {
    try {
      const db = getConnection();
      
      await db.execute(
        'UPDATE users SET is_online = ?, last_seen = CURRENT_TIMESTAMP WHERE id = ?',
        [isOnline, userId]
      );
      
      return { message: 'Status berhasil diupdate' };
    } catch (error) {
      throw error;
    }
  }

  // Method untuk mendapatkan data user tanpa password
  toJSON() {
    return {
      id: this.id,
      username: this.username,
      created_at: this.created_at,
      updated_at: this.updated_at,
      last_seen: this.last_seen,
      is_online: this.is_online
    };
  }
}

module.exports = User; 
