import express from "express";
import http from "http";
import path from "path";
import cors from "cors";
import axios from "axios";

const app = express();

const server = http.createServer(app);

const url = `https://realtime-code-editor-n4g7.onrender.com`;
const interval = 30000;

function reloadWebsite() {
  axios
    .get(url)
    .then(response => {
      console.log("website reloded");
    })
    .catch(error => {
      console.error(`Error : ${error.message}`);
    });
}

setInterval(reloadWebsite, interval);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});
app.use(cors());

// Enhanced room structure to support file systems
const rooms = new Map();

// Default project structure for new rooms
const getDefaultProjectStructure = () => ({
  "src/App.js": {
    content:
      '// Welcome to your collaborative project!\nconsole.log("Hello, world!");',
    language: "javascript"
  },
  "src/utils.js": {
    content:
      '// Utility functions\nexport const helper = () => {\n  return "Helper function";\n};',
    language: "javascript"
  },
  "README.md": {
    content:
      "# My Collaborative Project\n\nThis is a collaborative coding project.\n\n## Getting Started\n\n1. Start coding!\n2. Collaborate with your team\n3. Build something amazing",
    language: "markdown"
  }
});

// Language to extension mapping for code execution
const languageExecutionMap = {
  javascript: "javascript",
  typescript: "typescript",
  python: "python",
  java: "java",
  cpp: "cpp",
  c: "c",
  html: "html",
  css: "css"
};

io.on("connection", socket => {
  console.log("User Connected", socket.id);

  let currentRoom = null;
  let currentUser = null;

  socket.on("join", ({ roomId, userName }) => {
    // Leave previous room if exists
    if (currentRoom) {
      socket.leave(currentRoom);
      if (rooms.has(currentRoom)) {
        rooms.get(currentRoom).users.delete(currentUser);
        io
          .to(currentRoom)
          .emit("userJoined", Array.from(rooms.get(currentRoom).users));
      }
    }

    currentRoom = roomId;
    currentUser = userName;

    socket.join(roomId);

    // Initialize room if it doesn't exist
    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        users: new Set(),
        files: getDefaultProjectStructure(),
        activeFiles: {}, // Track which file each user is editing
        lastActivity: Date.now()
      });
      console.log(`Created new room: ${roomId} with default project structure`);
    }

    const room = rooms.get(roomId);
    room.users.add(userName);
    room.lastActivity = Date.now();

    // Send updated user list to all users in room
    io.to(roomId).emit("userJoined", Array.from(room.users));

    // Send current file system to the newly joined user
    socket.emit("fileSystemSync", room.files);

    console.log(
      `User ${userName} joined room ${roomId}. Users: ${room.users.size}`
    );
  });

  // Handle code changes for specific files
  socket.on("codeChange", ({ roomId, code, fileName }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);

      // Update file content in room
      if (room.files[fileName]) {
        room.files[fileName].content = code;
        room.lastActivity = Date.now();
      }

      // Track which file user is editing
      room.activeFiles[currentUser] = fileName;

      // Broadcast code update to other users
      socket.to(roomId).emit("codeUpdate", {
        fileName,
        content: code,
        user: currentUser
      });
    }
  });

  // Handle file system updates (create/delete/rename files)
  socket.on(
    "fileSystemUpdate",
    ({ roomId, files, action, fileName, newFileName }) => {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);

        switch (action) {
          case "create":
            if (fileName && !room.files[fileName]) {
              const extension = fileName.split(".").pop();
              const languageMap = {
                js: "javascript",
                jsx: "javascript",
                ts: "typescript",
                tsx: "typescript",
                py: "python",
                java: "java",
                cpp: "cpp",
                c: "c",
                html: "html",
                css: "css",
                md: "markdown",
                json: "json"
              };

              room.files[fileName] = {
                content: `// New ${extension} file\n`,
                language: languageMap[extension] || "plaintext"
              };

              console.log(`File created: ${fileName} in room ${roomId}`);
            }
            break;

          case "delete":
            if (fileName && room.files[fileName]) {
              delete room.files[fileName];
              console.log(`File deleted: ${fileName} in room ${roomId}`);
            }
            break;

          case "rename":
            if (
              fileName &&
              newFileName &&
              room.files[fileName] &&
              !room.files[newFileName]
            ) {
              room.files[newFileName] = { ...room.files[fileName] };
              delete room.files[fileName];
              console.log(
                `File renamed: ${fileName} -> ${newFileName} in room ${roomId}`
              );
            }
            break;

          case "bulk_update":
            if (files) {
              room.files = { ...room.files, ...files };
            }
            break;
        }

        room.lastActivity = Date.now();

        // Broadcast file system update to all users
        io.to(roomId).emit("fileSystemSync", room.files);
      }
    }
  );

  // Handle new file creation
  socket.on(
    "createFile",
    ({ roomId, fileName, content = "", language = "plaintext" }) => {
      if (rooms.has(roomId)) {
        const room = rooms.get(roomId);

        if (!room.files[fileName]) {
          room.files[fileName] = {
            content,
            language
          };

          room.lastActivity = Date.now();

          // Broadcast new file to all users
          io.to(roomId).emit("fileCreated", {
            fileName,
            content,
            language,
            user: currentUser
          });

          console.log(
            `File created: ${fileName} by ${currentUser} in room ${roomId}`
          );
        }
      }
    }
  );

  // Handle file deletion
  socket.on("deleteFile", ({ roomId, fileName }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);

      if (room.files[fileName]) {
        delete room.files[fileName];
        room.lastActivity = Date.now();

        // Broadcast file deletion to all users
        io.to(roomId).emit("fileDeleted", {
          fileName,
          user: currentUser
        });

        console.log(
          `File deleted: ${fileName} by ${currentUser} in room ${roomId}`
        );
      }
    }
  });

  socket.on("leaveRoom", () => {
    if (currentRoom && currentUser && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.users.delete(currentUser);
      delete room.activeFiles[currentUser];

      io.to(currentRoom).emit("userJoined", Array.from(room.users));

      socket.leave(currentRoom);

      console.log(
        `User ${currentUser} left room ${currentRoom}. Remaining users: ${room
          .users.size}`
      );

      // Clean up empty rooms after 5 minutes of inactivity
      if (room.users.size === 0) {
        setTimeout(() => {
          if (
            rooms.has(currentRoom) &&
            rooms.get(currentRoom).users.size === 0
          ) {
            rooms.delete(currentRoom);
            console.log(`Room ${currentRoom} cleaned up due to inactivity`);
          }
        }, 5 * 60 * 1000); // 5 minutes
      }

      currentRoom = null;
      currentUser = null;
    }
  });

  socket.on("typing", ({ roomId, userName, fileName }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.activeFiles[userName] = fileName;

      socket.to(roomId).emit("userTyping", {
        user: userName,
        fileName: fileName
      });
    }
  });

  socket.on("languageChange", ({ roomId, language, fileName }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);

      // Update language for specific file
      if (room.files[fileName]) {
        room.files[fileName].language = language;
        room.lastActivity = Date.now();
      }

      io.to(roomId).emit("languageUpdate", {
        language,
        fileName
      });
    }
  });

  // Enhanced code compilation with file support
  socket.on(
    "compileCode",
    async ({ code, roomId, language, version, fileName }) => {
      if (rooms.has(roomId)) {
        try {
          // Map frontend language names to Piston API language names
          const pistonLanguage = languageExecutionMap[language] || language;

          const response = await axios.post(
            "https://emkc.org/api/v2/piston/execute",
            {
              language: pistonLanguage,
              version: version || "*",
              files: [
                {
                  name: fileName || "main",
                  content: code
                }
              ]
            }
          );

          // Broadcast execution result to all users in room
          io.to(roomId).emit("codeResponse", {
            ...response.data,
            fileName,
            executedBy: currentUser
          });

          console.log(
            `Code executed in room ${roomId} by ${currentUser} for file ${fileName}`
          );
        } catch (error) {
          console.error("Code execution error:", error.message);

          // Send error to all users in room
          io.to(roomId).emit("codeResponse", {
            run: {
              output: `Execution Error: ${error.message}`
            },
            fileName,
            executedBy: currentUser
          });
        }
      }
    }
  );

  // Get room information
  socket.on("getRoomInfo", ({ roomId }) => {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      socket.emit("roomInfo", {
        userCount: room.users.size,
        users: Array.from(room.users),
        fileCount: Object.keys(room.files).length,
        activeFiles: room.activeFiles,
        lastActivity: room.lastActivity
      });
    }
  });

  socket.on("disconnect", () => {
    if (currentRoom && currentUser && rooms.has(currentRoom)) {
      const room = rooms.get(currentRoom);
      room.users.delete(currentUser);
      delete room.activeFiles[currentUser];

      io.to(currentRoom).emit("userJoined", Array.from(room.users));

      console.log(`User ${currentUser} disconnected from room ${currentRoom}`);
    }

    console.log("User disconnected:", socket.id);
  });
});

// Periodic cleanup of inactive rooms (runs every hour)
setInterval(() => {
  const now = Date.now();
  const inactivityThreshold = 24 * 60 * 60 * 1000; // 24 hours

  for (const [roomId, room] of rooms.entries()) {
    if (
      room.users.size === 0 &&
      now - room.lastActivity > inactivityThreshold
    ) {
      rooms.delete(roomId);
      console.log(`Cleaned up inactive room: ${roomId}`);
    }
  }
}, 60 * 60 * 1000); // Run every hour

const port = process.env.PORT || 5000;

const __dirname = path.resolve();

app.use(express.static(path.join(__dirname, "/frontend/dist")));

// API endpoint to get room statistics
app.get("/api/stats", (req, res) => {
  const stats = {
    totalRooms: rooms.size,
    totalUsers: Array.from(rooms.values()).reduce(
      (sum, room) => sum + room.users.size,
      0
    ),
    rooms: Array.from(rooms.entries()).map(([roomId, room]) => ({
      roomId,
      userCount: room.users.size,
      fileCount: Object.keys(room.files).length,
      lastActivity: new Date(room.lastActivity).toISOString()
    }))
  };

  res.json(stats);
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "frontend", "dist", "index.html"));
});

server.listen(port, () => {
  console.log(`CodeSync server running on port ${port}`);
  console.log(`Stats available at http://localhost:${port}/api/stats`);
});
