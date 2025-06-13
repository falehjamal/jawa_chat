const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const session = require('express-session');
const bodyParser = require('body-parser');
const path = require('path');

// Import konfigurasi dan database
const config = require('./config/environment');
const { connectDB, closeConnection } = require('./config/database');
const sessionStore = require('./config/session-store');
const User = require('./models/User');
const Message = require('./models/Message');
const Conversation = require('./models/Conversation');
const PrivateMessage = require('./models/PrivateMessage');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Session middleware dengan MySQL store
app.use(session({
  key: 'soewondo_chat_session',
  secret: config.session.secret,
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiration on activity
  cookie: { 
    secure: config.isProduction(),
    maxAge: config.session.maxAge,
    httpOnly: true // Security: prevent XSS attacks
  }
}));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Helper function untuk log session activity
function logSessionActivity(sessionId, userId, action) {
  console.log(`🔗 Session ${action}: ${sessionId} for user ${userId}`);
}

// Helper function untuk mendapatkan users dengan status
async function getUsersWithStatus() {
  const db = require('./config/database').getConnection();
  
  // Get online users
  const [onlineUsers] = await db.execute(
    'SELECT id, username, last_seen, is_online FROM users WHERE is_online = TRUE ORDER BY username'
  );
  
  // Get recently offline users (last 24 hours)
  const [recentOfflineUsers] = await db.execute(
    `SELECT id, username, last_seen, is_online 
     FROM users 
     WHERE is_online = FALSE 
       AND last_seen >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
     ORDER BY last_seen DESC`
  );
  
  // Combine and format status
  const allUsers = [...onlineUsers, ...recentOfflineUsers];
  return allUsers.map(user => ({
    ...user,
    status: User.formatUserStatus(user.is_online, user.last_seen)
  }));
}

// Middleware untuk cek authentication
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized. Silakan login terlebih dahulu.' });
  }
  next();
};

// Routes
app.get('/', (req, res) => {
  if (!req.session.user) {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
  } else {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
  }
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/chat', (req, res) => {
  if (!req.session.user) {
    res.redirect('/login');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'chat.html'));
  }
});

app.get('/private-chat', (req, res) => {
  if (!req.session.user) {
    res.redirect('/login');
  } else {
    res.sendFile(path.join(__dirname, 'public', 'private-chat.html'));
  }
});

// API Routes
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password harus diisi' });
    }

    if (username.length < config.app.minUsernameLength) {
      return res.status(400).json({ error: `Username minimal ${config.app.minUsernameLength} karakter` });
    }

    if (username.length > config.app.maxUsernameLength) {
      return res.status(400).json({ error: `Username maksimal ${config.app.maxUsernameLength} karakter` });
    }

    if (password.length < config.app.minPasswordLength) {
      return res.status(400).json({ error: `Password minimal ${config.app.minPasswordLength} karakter` });
    }

    const result = await User.register(username, password);
    res.json({ success: true, message: 'Registrasi berhasil!', data: result });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username dan password harus diisi' });
    }

    const user = await User.login(username, password);
    
    // Simpan session dengan user data
    req.session.user = user.toJSON();
    req.session.userId = user.id; // Untuk tracking
    req.session.loginTime = new Date();
    
    // Log session activity
    logSessionActivity(req.sessionID, user.id, 'created');
    
    res.json({ 
      success: true, 
      message: 'Login berhasil!', 
      user: user.toJSON(),
      sessionId: req.sessionID
    });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

app.post('/api/logout', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const sessionId = req.sessionID;
    
    // Update user status offline
    await User.logout(userId);
    
    // Destroy session (akan dihapus dari database otomatis)
    req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session:', err);
        return res.status(500).json({ error: 'Gagal logout' });
      }
      
      logSessionActivity(sessionId, userId, 'destroyed');
      res.json({ success: true, message: 'Logout berhasil' });
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/user', requireAuth, (req, res) => {
  res.json({ user: req.session.user });
});

app.get('/api/messages', requireAuth, async (req, res) => {
  try {
    const messages = await Message.getRecent(50);
    res.json({ messages: messages.map(msg => msg.toJSON()) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/online-users', requireAuth, async (req, res) => {
  try {
    const users = await User.getOnlineUsers();
    // Add status formatting for each user
    const usersWithStatus = users.map(user => ({
      ...user,
      status: User.formatUserStatus(user.is_online, user.last_seen)
    }));
    res.json({ users: usersWithStatus });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan semua user dengan status detail
app.get('/api/all-users-status', requireAuth, async (req, res) => {
  try {
    const users = await User.getAllUsersWithStatus();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan users dengan status (kombinasi online dan offline recent)
app.get('/api/users-with-status', requireAuth, async (req, res) => {
  try {
    const users = await getUsersWithStatus();
    res.json({ users });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan info session
app.get('/api/session-info', requireAuth, (req, res) => {
  try {
    const sessionInfo = {
      sessionId: req.sessionID,
      userId: req.session.userId,
      loginTime: req.session.loginTime,
      user: req.session.user,
      cookie: {
        maxAge: req.session.cookie.maxAge,
        expires: req.session.cookie.expires
      }
    };
    
    res.json({ sessionInfo });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan active sessions info
app.get('/api/active-sessions', requireAuth, async (req, res) => {
  try {
    const { getConnection } = require('./config/database');
    const db = getConnection();
    
    // Get active sessions from default sessions table
    const [sessions] = await db.execute(`
      SELECT 
        session_id,
        expires,
        data
      FROM sessions
      WHERE expires > UNIX_TIMESTAMP() * 1000
      ORDER BY expires DESC
    `);
    
    // Parse session data to get user info
    const sessionsWithUserInfo = sessions.map(session => {
      try {
        const sessionData = JSON.parse(session.data);
        return {
          session_id: session.session_id,
          expires: new Date(session.expires),
          user: sessionData.user || null,
          userId: sessionData.userId || null,
          loginTime: sessionData.loginTime || null
        };
      } catch (e) {
        return {
          session_id: session.session_id,
          expires: new Date(session.expires),
          user: null,
          userId: null,
          loginTime: null
        };
      }
    });
    
    res.json({ 
      activeSessions: sessionsWithUserInfo,
      totalCount: sessionsWithUserInfo.length 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan app info (tidak perlu auth)
app.get('/api/app-info', (req, res) => {
  res.json({
    appName: config.app.name,
    version: '2.0.0',
    description: 'Real-time chat application with WebSocket',
    features: ['Real-time messaging', 'Online users', 'Session persistence', 'Private messaging']
  });
});

// ==================== PRIVATE CHAT API ROUTES ====================

// API untuk mendapatkan semua conversation user
app.get('/api/conversations', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const conversations = await Conversation.getForUser(userId);
    res.json({ conversations: conversations.map(conv => conv.toJSON()) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk membuat atau mendapatkan conversation dengan user tertentu
app.post('/api/conversations', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const { targetUserId } = req.body;
    
    if (!targetUserId) {
      return res.status(400).json({ error: 'Target user ID diperlukan' });
    }
    
    if (targetUserId === userId) {
      return res.status(400).json({ error: 'Tidak dapat membuat conversation dengan diri sendiri' });
    }
    
    const conversation = await Conversation.findOrCreate(userId, targetUserId);
    res.json({ conversation: conversation.toJSON() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan conversation dengan user tertentu
app.get('/api/conversations/with/:userId', requireAuth, async (req, res) => {
  try {
    const currentUserId = req.session.user.id;
    const targetUserId = parseInt(req.params.userId);
    
    const conversation = await Conversation.findBetweenUsers(currentUserId, targetUserId);
    
    if (!conversation) {
      return res.status(404).json({ error: 'Conversation tidak ditemukan' });
    }
    
    res.json({ conversation: conversation.toJSON() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan pesan dalam conversation
app.get('/api/conversations/:conversationId/messages', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const conversationId = parseInt(req.params.conversationId);
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    const messages = await PrivateMessage.getByConversation(conversationId, userId, limit, offset);
    res.json({ messages: messages.map(msg => msg.toJSON()) });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk mengirim pesan private
app.post('/api/conversations/:conversationId/messages', requireAuth, async (req, res) => {
  try {
    const senderId = req.session.user.id;
    const conversationId = parseInt(req.params.conversationId);
    const { message, receiverId } = req.body;
    
    if (!message || !receiverId) {
      return res.status(400).json({ error: 'Message dan receiver ID diperlukan' });
    }
    
    const privateMessage = await PrivateMessage.sendMessage(senderId, receiverId, message);
    const messageData = privateMessage.toJSON();
    
    // Emit real-time event ke receiver jika online
    const receiverSockets = userConnections.get(receiverId);
    if (receiverSockets && receiverSockets.size > 0) {
      receiverSockets.forEach(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('private-message', messageData);
        }
      });
    }
    
    // Emit ke sender juga untuk konfirmasi
    const senderSockets = userConnections.get(senderId);
    if (senderSockets && senderSockets.size > 0) {
      senderSockets.forEach(socketId => {
        const socket = io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('private-message-sent', messageData);
        }
      });
    }
    
    res.json({ message: messageData });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk menandai conversation sebagai sudah dibaca
app.put('/api/conversations/:conversationId/read', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const conversationId = parseInt(req.params.conversationId);
    
    await PrivateMessage.markConversationAsRead(conversationId, userId);
    
    // Emit real-time event ke sender bahwa pesan sudah dibaca
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      const otherUserId = conversation.user1_id === userId ? conversation.user2_id : conversation.user1_id;
      const senderSockets = userConnections.get(otherUserId);
      if (senderSockets && senderSockets.size > 0) {
        senderSockets.forEach(socketId => {
          const socket = io.sockets.sockets.get(socketId);
          if (socket) {
            socket.emit('messages-read', {
              conversationId: conversationId,
              readBy: userId
            });
          }
        });
      }
    }
    
    res.json({ success: true, message: 'Conversation ditandai sebagai sudah dibaca' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk mendapatkan jumlah pesan belum dibaca
app.get('/api/private-messages/unread-count', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const unreadCount = await PrivateMessage.getUnreadCount(userId);
    res.json({ unreadCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API untuk menghapus conversation
app.delete('/api/conversations/:conversationId', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const conversationId = parseInt(req.params.conversationId);
    
    await Conversation.delete(conversationId, userId);
    res.json({ success: true, message: 'Conversation berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== END PRIVATE CHAT API ROUTES ====================

// Map untuk menyimpan socket dan user (Enhanced)
const userSockets = new Map(); // socket.id -> userData
const userConnections = new Map(); // userId -> Set of socket.ids

// Socket.IO connection handling dengan enhanced real-time features
io.on('connection', (socket) => {
  console.log('🔌 Socket terhubung:', socket.id);

  // Handle user join dengan real-time updates
  socket.on('user-join', async (userData) => {
    try {
      // Simpan mapping socket ke user
      userSockets.set(socket.id, userData);
      
      // Track multiple connections per user
      if (!userConnections.has(userData.id)) {
        userConnections.set(userData.id, new Set());
      }
      userConnections.get(userData.id).add(socket.id);
      
      // Update status online di database
      await User.updateOnlineStatus(userData.id, true);
      
      // Get updated online users list
      const usersWithStatus = await getUsersWithStatus();
      const onlineCount = usersWithStatus.filter(user => user.is_online).length;
      
      // Broadcast ke semua client bahwa user baru online (real-time)
      socket.broadcast.emit('user-connected', {
        user: userData,
        timestamp: new Date(),
        totalOnline: onlineCount
      });
      
      // Send complete updated list ke semua client
      io.emit('online-users-update', {
        users: usersWithStatus,
        totalCount: onlineCount,
        timestamp: new Date()
      });
      
      // Send welcome message ke user yang baru join
      socket.emit('join-success', {
        message: `Selamat datang, ${userData.username}!`,
        onlineUsers: usersWithStatus,
        totalOnline: onlineCount
      });
      
      console.log(`👤 User ${userData.username} bergabung (Socket: ${socket.id})`);
      console.log(`📊 Total online users: ${onlineCount}`);
      
    } catch (error) {
      console.error('❌ Error user join:', error);
      socket.emit('error', { message: 'Gagal bergabung ke chat' });
    }
  });

  // Handle pesan chat baru
  socket.on('chat-message', async (data) => {
    try {
      const userData = userSockets.get(socket.id);
      if (!userData) {
        socket.emit('error', { message: 'User tidak terautentikasi' });
        return;
      }

      // Simpan pesan ke database
      const message = await Message.create(userData.id, data.message);
      const messageData = message.toJSON();

      // Broadcast pesan ke semua client
      io.emit('chat-message', messageData);
      
      console.log(`Pesan dari ${userData.username}: ${data.message}`);
    } catch (error) {
      console.error('Error saving message:', error);
      socket.emit('error', { message: 'Gagal mengirim pesan' });
    }
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    const userData = userSockets.get(socket.id);
    if (userData) {
      socket.broadcast.emit('user-typing', {
        username: userData.username,
        userId: userData.id
      });
    }
  });

  socket.on('stop-typing', () => {
    const userData = userSockets.get(socket.id);
    if (userData) {
      socket.broadcast.emit('user-stop-typing', {
        userId: userData.id
      });
    }
  });

  // Handle private typing indicator
  socket.on('private-typing', (data) => {
    const userData = userSockets.get(socket.id);
    if (userData && data.receiverId) {
      const receiverSockets = userConnections.get(data.receiverId);
      if (receiverSockets && receiverSockets.size > 0) {
        receiverSockets.forEach(socketId => {
          const receiverSocket = io.sockets.sockets.get(socketId);
          if (receiverSocket) {
            receiverSocket.emit('private-typing', {
              conversationId: data.conversationId,
              username: userData.username,
              userId: userData.id
            });
          }
        });
      }
    }
  });

  socket.on('private-stop-typing', (data) => {
    const userData = userSockets.get(socket.id);
    if (userData && data.receiverId) {
      const receiverSockets = userConnections.get(data.receiverId);
      if (receiverSockets && receiverSockets.size > 0) {
        receiverSockets.forEach(socketId => {
          const receiverSocket = io.sockets.sockets.get(socketId);
          if (receiverSocket) {
            receiverSocket.emit('private-stop-typing', {
              conversationId: data.conversationId,
              userId: userData.id
            });
          }
        });
      }
    }
  });

  // Handle disconnect dengan real-time cleanup
  socket.on('disconnect', async () => {
    try {
      const userData = userSockets.get(socket.id);
      if (userData) {
        // Remove socket dari user connections
        const userSocketSet = userConnections.get(userData.id);
        if (userSocketSet) {
          userSocketSet.delete(socket.id);
          
          // Jika user tidak punya socket lain, mark sebagai offline
          if (userSocketSet.size === 0) {
            userConnections.delete(userData.id);
            
            // Update status offline di database
            await User.updateOnlineStatus(userData.id, false);
            
            // Get updated users with status
            const usersWithStatus = await getUsersWithStatus();
            const onlineCount = usersWithStatus.filter(user => user.is_online).length;
            
            // Broadcast user disconnected (real-time)
            socket.broadcast.emit('user-disconnected', {
              user: userData,
              timestamp: new Date(),
              totalOnline: onlineCount
            });
            
            // Send updated list ke semua client
            socket.broadcast.emit('online-users-update', {
              users: usersWithStatus,
              totalCount: onlineCount,
              timestamp: new Date()
            });
            
            console.log(`👤 User ${userData.username} offline (semua koneksi terputus)`);
            console.log(`📊 Total online users: ${onlineCount}`);
          } else {
            console.log(`🔌 Socket ${socket.id} terputus, tapi user ${userData.username} masih online di socket lain`);
          }
        }
        
        // Hapus socket mapping
        userSockets.delete(socket.id);
      }
    } catch (error) {
      console.error('❌ Error user disconnect:', error);
    }
  });

  // Handle manual user leave (logout)
  socket.on('user-leave', async () => {
    try {
      const userData = userSockets.get(socket.id);
      if (userData) {
        // Force offline semua koneksi user ini
        const userSocketSet = userConnections.get(userData.id);
        if (userSocketSet) {
          // Disconnect semua socket user ini
          userSocketSet.forEach(socketId => {
            const userSocket = userSockets.get(socketId);
            if (userSocket) {
              userSockets.delete(socketId);
            }
          });
          userConnections.delete(userData.id);
        }
        
        // Update status offline
        await User.updateOnlineStatus(userData.id, false);
        
        // Get updated list
        const usersWithStatus = await getUsersWithStatus();
        const onlineCount = usersWithStatus.filter(user => user.is_online).length;
        
        // Broadcast user left
        socket.broadcast.emit('user-disconnected', {
          user: userData,
          timestamp: new Date(),
          totalOnline: onlineCount,
          reason: 'logout'
        });
        
        // Update online users list
        socket.broadcast.emit('online-users-update', {
          users: usersWithStatus,
          totalCount: onlineCount,
          timestamp: new Date()
        });
        
        console.log(`🚪 User ${userData.username} logout (manual)`);
      }
    } catch (error) {
      console.error('❌ Error user leave:', error);
    }
  });
});

// Inisialisasi database dan jalankan server
const initServer = async () => {
  try {
    console.log(`🚀 Memulai ${config.app.name} Server...`);
    
    // Koneksi ke database
    await connectDB();
    
    // Jalankan migrasi otomatis (mempertahankan koneksi)
    const { runMigrations } = require('./migrations/migrate');
    await runMigrations(true);
    
    const PORT = config.server.port;
    server.listen(PORT, () => {
      console.log('✅ Server berhasil berjalan!');
      console.log(`🌐 URL: http://localhost:${PORT}`);
      console.log(`💬 ${config.app.name} siap digunakan!`);
      console.log(`🔧 Environment: ${config.server.nodeEnv}`);
    });
    
  } catch (error) {
    console.error('💥 Gagal memulai server:', error);
    process.exit(1);
  }
};

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n📝 Menutup server...');
  await closeConnection();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n📝 Menutup server...');
  await closeConnection();
  process.exit(0);
});

// Mulai server
initServer(); 
