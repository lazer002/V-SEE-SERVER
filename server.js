const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();
require('./db/connection.js'); // Your MongoDB connection logic
const Chat = require('./model/chat.js'); // Your Chat model
const router = require('./router/router'); // Your routes if any

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL, // Ensure this is correctly set
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Middleware setup
app.use(cors({ origin: process.env.CLIENT_URL, credentials: true }));
app.use(express.json());
app.use('/uploads', express.static('uploads')); // Serve static files if necessary
app.use('/', router); // Use your routes

// Socket.IO connection
io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`Client joined room: ${room}`);
  });

  socket.on('sendMessage', async (message) => {
    console.log('Received message: ', message);
    try {
      let chat = await Chat.findOne({
        $or: [
          { user1Id: message.senderId, user2Id: message.receiverId },
          { user1Id: message.receiverId, user2Id: message.senderId },
        ],
      });

      if (!chat) {
        chat = new Chat({
          user1Id: message.senderId,
          user2Id: message.receiverId,
          messages: [message],
        });
      } else {
        chat.messages.push(message);
      }

      await chat.save();

      io.to(message.receiverId).emit('receiveMessage', message);
      io.to(message.senderId).emit('receiveMessage', message);
    } catch (error) {
      console.error('Error saving message:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});

// Start server
const PORT = process.env.PORT || 8945;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
