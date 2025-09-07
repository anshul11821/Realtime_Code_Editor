import { useEffect, useState } from "react";
import Editor from "@monaco-editor/react";
import io from "socket.io-client";

const socket = io("http://127.0.0.1:5000");

const App = () => {
  const [joined, setJoined] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [userName, setUserName] = useState("");
  const [language, setLanguage] = useState("javascript");
  const [code, setCode] = useState("// start code here");
  const [copySuccess, setCopySuccess] = useState("");
  const [users, setUsers] = useState([]);
  const [typing, setTyping] = useState("");
  const [outPut, setOutPut] = useState("");
  const [version, setVersion] = useState("*");

  // File system state
  const [files, setFiles] = useState({});
  const [activeFile, setActiveFile] = useState("");
  const [openTabs, setOpenTabs] = useState([]);
  const [expandedFolders, setExpandedFolders] = useState(new Set(["src"]));
  const [showNewFileModal, setShowNewFileModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [fileToDelete, setFileToDelete] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [roomInfo, setRoomInfo] = useState({});

  useEffect(() => {
    // Update code and language when active file changes
    if (files[activeFile]) {
      setCode(files[activeFile].content);
      setLanguage(files[activeFile].language);
    }
  }, [activeFile, files]);

  useEffect(() => {
    socket.on("userJoined", (users) => {
      setUsers(users);
    });

    socket.on("codeUpdate", ({ fileName, content, user }) => {
      setFiles((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          content: content
        }
      }));

      // Update current editor if it's the same file
      if (fileName === activeFile) {
        setCode(content);
      }
    });

    socket.on("userTyping", ({ user, fileName }) => {
      setTyping(
        `${user.slice(0, 8)}... is typing in ${fileName.split("/").pop()}`
      );
      setTimeout(() => setTyping(""), 2000);
    });

    socket.on("languageUpdate", ({ language: newLanguage, fileName }) => {
      setFiles((prev) => ({
        ...prev,
        [fileName]: {
          ...prev[fileName],
          language: newLanguage
        }
      }));

      if (fileName === activeFile) {
        setLanguage(newLanguage);
      }
    });

    socket.on("codeResponse", (response) => {
      setOutPut(response.run.output);
    });

    // File system events
    socket.on("fileSystemSync", (syncedFiles) => {
      setFiles(syncedFiles);

      // Set first file as active if no active file
      const fileNames = Object.keys(syncedFiles);
      if (fileNames.length > 0 && !activeFile) {
        const firstFile = fileNames[0];
        setActiveFile(firstFile);
        setOpenTabs([firstFile]);
      }
    });

    socket.on("fileCreated", ({ fileName, content, language, user }) => {
      setFiles((prev) => ({
        ...prev,
        [fileName]: { content, language }
      }));

      // Show notification
      console.log(`${user} created file: ${fileName}`);
    });

    socket.on("fileDeleted", ({ fileName, user }) => {
      setFiles((prev) => {
        const newFiles = { ...prev };
        delete newFiles[fileName];
        return newFiles;
      });

      // Remove from open tabs if it's open
      setOpenTabs((prev) => prev.filter((tab) => tab !== fileName));

      // Switch to another file if this was active
      if (activeFile === fileName) {
        const remainingFiles = Object.keys(files).filter((f) => f !== fileName);
        if (remainingFiles.length > 0) {
          setActiveFile(remainingFiles[0]);
        }
      }

      console.log(`${user} deleted file: ${fileName}`);
    });

    socket.on("roomInfo", (info) => {
      setRoomInfo(info);
    });

    return () => {
      socket.off("userJoined");
      socket.off("codeUpdate");
      socket.off("userTyping");
      socket.off("languageUpdate");
      socket.off("codeResponse");
      socket.off("fileSystemSync");
      socket.off("fileCreated");
      socket.off("fileDeleted");
      socket.off("roomInfo");
    };
  }, [activeFile, files]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      socket.emit("leaveRoom");
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  const joinRoom = () => {
    if (roomId && userName) {
      socket.emit("join", { roomId, userName });
      setJoined(true);
    }
  };

  const leaveRoom = () => {
    socket.emit("leaveRoom");
    setJoined(false);
    setRoomId("");
    setUserName("");
    setCode("// start code here");
    setLanguage("javascript");
    setFiles({});
    setActiveFile("");
    setOpenTabs([]);
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    setCopySuccess("Copied!");
    setTimeout(() => setCopySuccess(""), 2000);
  };

  const handleCodeChange = (newCode) => {
    setCode(newCode);

    // Update the file in our local state immediately for responsiveness
    setFiles((prev) => ({
      ...prev,
      [activeFile]: {
        ...prev[activeFile],
        content: newCode
      }
    }));

    // Emit to server
    socket.emit("codeChange", { roomId, code: newCode, fileName: activeFile });
    socket.emit("typing", { roomId, userName, fileName: activeFile });
  };

  const handleLanguageChange = (e) => {
    const newLanguage = e.target.value;
    setLanguage(newLanguage);

    // Update file language
    setFiles((prev) => ({
      ...prev,
      [activeFile]: {
        ...prev[activeFile],
        language: newLanguage
      }
    }));

    socket.emit("languageChange", {
      roomId,
      language: newLanguage,
      fileName: activeFile
    });
  };

  const runCode = () => {
    socket.emit("compileCode", {
      code,
      roomId,
      language,
      version,
      fileName: activeFile
    });
  };

  // File system functions
  const getFileIcon = (fileName) => {
    const extension = fileName.split(".").pop().toLowerCase();
    const iconMap = {
      js: "📄",
      jsx: "⚛️",
      ts: "🔷",
      tsx: "🔷",
      py: "🐍",
      java: "☕",
      cpp: "⚡",
      c: "⚡",
      html: "🌐",
      css: "🎨",
      md: "📝",
      json: "📋",
      xml: "📄",
      yml: "⚙️",
      yaml: "⚙️",
      txt: "📄",
      php: "🐘",
      rb: "💎",
      go: "🐹",
      rs: "🦀",
      sh: "🐚"
    };
    return iconMap[extension] || "📄";
  };

  const organizeFiles = () => {
    const organized = {};
    Object.keys(files).forEach((filePath) => {
      const parts = filePath.split("/");
      let current = organized;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // It's a file
          current[part] = { type: "file", path: filePath };
        } else {
          // It's a folder
          if (!current[part]) {
            current[part] = { type: "folder", children: {} };
          }
          current = current[part].children;
        }
      });
    });
    return organized;
  };

  const toggleFolder = (folderPath) => {
    setExpandedFolders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(folderPath)) {
        newSet.delete(folderPath);
      } else {
        newSet.add(folderPath);
      }
      return newSet;
    });
  };

  const openFile = (filePath) => {
    setActiveFile(filePath);
    if (!openTabs.includes(filePath)) {
      setOpenTabs((prev) => [...prev, filePath]);
    }
  };

  const closeTab = (filePath, e) => {
    e.stopPropagation();
    setOpenTabs((prev) => prev.filter((tab) => tab !== filePath));
    if (activeFile === filePath) {
      const remainingTabs = openTabs.filter((tab) => tab !== filePath);
      if (remainingTabs.length > 0) {
        setActiveFile(remainingTabs[remainingTabs.length - 1]);
      } else {
        // If no tabs left, open the first available file
        const availableFiles = Object.keys(files);
        if (availableFiles.length > 0) {
          setActiveFile(availableFiles[0]);
          setOpenTabs([availableFiles[0]]);
        }
      }
    }
  };

  const createNewFile = () => {
    if (newFileName && !files[newFileName]) {
      const extension = newFileName.split(".").pop().toLowerCase();
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
        json: "json",
        txt: "plaintext",
        php: "php",
        rb: "ruby",
        go: "go",
        rs: "rust",
        sh: "shell"
      };

      const detectedLanguage = languageMap[extension] || "plaintext";
      const defaultContent = getDefaultContent(extension);

      // Emit create file event to server
      socket.emit("createFile", {
        roomId,
        fileName: newFileName,
        content: defaultContent,
        language: detectedLanguage
      });

      // Update local state immediately
      setFiles((prev) => ({
        ...prev,
        [newFileName]: {
          content: defaultContent,
          language: detectedLanguage
        }
      }));

      // Open the new file
      openFile(newFileName);
      setNewFileName("");
      setShowNewFileModal(false);
    }
  };

  const getDefaultContent = (extension) => {
    const templates = {
      js: '// JavaScript file\nconsole.log("Hello, World!");',
      jsx: 'import React from "react";\n\nconst Component = () => {\n  return <div>Hello, World!</div>;\n};\n\nexport default Component;',
      ts: '// TypeScript file\nconst message: string = "Hello, World!";\nconsole.log(message);',
      tsx: 'import React from "react";\n\ninterface Props {}\n\nconst Component: React.FC<Props> = () => {\n  return <div>Hello, World!</div>;\n};\n\nexport default Component;',
      py: '# Python file\nprint("Hello, World!")',
      java: 'public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello, World!");\n    }\n}',
      cpp: '#include <iostream>\n\nint main() {\n    std::cout << "Hello, World!" << std::endl;\n    return 0;\n}',
      c: '#include <stdio.h>\n\nint main() {\n    printf("Hello, World!\\n");\n    return 0;\n}',
      html: "<!DOCTYPE html>\n<html>\n<head>\n    <title>Document</title>\n</head>\n<body>\n    <h1>Hello, World!</h1>\n</body>\n</html>",
      css: "/* CSS file */\nbody {\n    font-family: Arial, sans-serif;\n    margin: 0;\n    padding: 20px;\n}",
      md: "# New Document\n\nWrite your content here...",
      json: '{\n  "name": "example",\n  "version": "1.0.0"\n}',
      go: 'package main\n\nimport "fmt"\n\nfunc main() {\n    fmt.Println("Hello, World!")\n}',
      rs: 'fn main() {\n    println!("Hello, World!");\n}',
      php: '<?php\necho "Hello, World!";\n?>',
      rb: '# Ruby file\nputs "Hello, World!"',
      sh: '#!/bin/bash\necho "Hello, World!"'
    };

    return templates[extension] || `// New ${extension} file\n`;
  };

  const deleteFile = (filePath) => {
    setFileToDelete(filePath);
    setShowDeleteConfirm(true);
  };

  const confirmDelete = () => {
    if (fileToDelete) {
      // Update local state immediately
      setFiles((prev) => {
        const newFiles = { ...prev };
        delete newFiles[fileToDelete];
        return newFiles;
      });

      // Close tab if it's open
      setOpenTabs((prev) => prev.filter((tab) => tab !== fileToDelete));

      // Switch active file if needed
      if (activeFile === fileToDelete) {
        const remainingFiles = Object.keys(files).filter(
          (f) => f !== fileToDelete
        );
        if (remainingFiles.length > 0) {
          setActiveFile(remainingFiles[0]);
        } else {
          setActiveFile("");
        }
      }

      // Emit file system update to server
      socket.emit("fileSystemUpdate", {
        roomId,
        action: "delete",
        fileName: fileToDelete
      });

      // Also emit the older deleteFile event for backward compatibility
      socket.emit("deleteFile", {
        roomId,
        fileName: fileToDelete
      });
    }

    setShowDeleteConfirm(false);
    setFileToDelete("");
  };

  const renderFileTree = (items, basePath = "") => {
    return Object.entries(items).map(([name, item]) => {
      const fullPath = basePath ? `${basePath}/${name}` : name;

      if (item.type === "folder") {
        const isExpanded = expandedFolders.has(fullPath);
        return (
          <div key={fullPath}>
            <div
              onClick={() => toggleFolder(fullPath)}
              className="flex items-center space-x-2 px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm group">
              <svg
                className={`w-4 h-4 text-gray-500 transition-transform ${
                  isExpanded ? "rotate-90" : ""
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <span>📁</span>
              <span className="font-medium text-gray-700">{name}</span>
            </div>
            {isExpanded && (
              <div className="ml-6">
                {renderFileTree(item.children, fullPath)}
              </div>
            )}
          </div>
        );
      } else {
        return (
          <div
            key={item.path}
            className={`flex items-center justify-between px-2 py-1 hover:bg-gray-100 cursor-pointer text-sm ml-6 group ${
              activeFile === item.path
                ? "bg-indigo-50 border-r-2 border-indigo-500"
                : ""
            }`}>
            <div
              onClick={() => openFile(item.path)}
              className="flex items-center space-x-2 flex-1">
              <span>{getFileIcon(name)}</span>
              <span className="text-gray-700">{name}</span>
            </div>
            <button
              onClick={() => deleteFile(item.path)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-opacity"
              title="Delete file">
              <svg
                className="w-3 h-3 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        );
      }
    });
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-lg shadow-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-6 text-center">
              <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-lg flex items-center justify-center mx-auto mb-3">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                  />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-white">CodeSync</h1>
              <p className="text-indigo-100 text-sm mt-1">
                Real-time collaborative coding
              </p>
            </div>

            <div className="px-8 py-8 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Room ID
                </label>
                <input
                  type="text"
                  placeholder="Enter room identifier"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-gray-50 text-gray-900"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  placeholder="Your display name"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  className="w-full px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors bg-gray-50 text-gray-900"
                />
              </div>

              <button
                onClick={joinRoom}
                disabled={!roomId || !userName}
                className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 rounded-md transition-colors shadow-sm disabled:shadow-none">
                Join Collaboration Session
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-gray-100 flex flex-col">
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-md flex items-center justify-center">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">CodeSync</h1>
              <div className="flex items-center space-x-2 text-sm text-gray-500">
                <span>Room:</span>
                <code className="bg-gray-100 px-2 py-0.5 rounded text-indigo-600 font-mono">
                  {roomId}
                </code>
                <button
                  onClick={copyRoomId}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  title="Copy Room ID">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {copySuccess && (
            <div className="bg-green-50 border border-green-200 text-green-800 px-3 py-1 rounded-md text-sm">
              ✓ {copySuccess}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span className="text-sm text-gray-600">{users.length} online</span>
          </div>

          {activeFile && (
            <select
              value={language}
              onChange={handleLanguageChange}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500">
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="java">Java</option>
              <option value="cpp">C++</option>
              <option value="c">C</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="markdown">Markdown</option>
              <option value="json">JSON</option>
              <option value="php">PHP</option>
              <option value="ruby">Ruby</option>
              <option value="go">Go</option>
              <option value="rust">Rust</option>
              <option value="shell">Shell</option>
            </select>
          )}

          <button
            onClick={runCode}
            disabled={!activeFile}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-md transition-colors flex items-center space-x-2 shadow-sm disabled:cursor-not-allowed">
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h1m4 0h1"
              />
            </svg>
            <span>Run</span>
          </button>

          <button
            onClick={leaveRoom}
            className="text-gray-500 hover:text-red-600 transition-colors"
            title="Leave Session">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* File Explorer */}
        <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-3 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900 text-sm">Explorer</h3>
            <div className="flex items-center space-x-1">
              <span className="text-xs text-gray-500">
                {Object.keys(files).length} files
              </span>
              <button
                onClick={() => setShowNewFileModal(true)}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="New File">
                <svg
                  className="w-4 h-4 text-gray-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {Object.keys(files).length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                <svg
                  className="w-12 h-12 text-gray-300 mx-auto mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p>No files in project</p>
                <p className="text-xs mt-1">Create a new file to get started</p>
              </div>
            ) : (
              renderFileTree(organizeFiles())
            )}
          </div>
        </div>

        {/* Users Panel */}
        <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide mb-3">
              Active Members
            </h3>
            <div className="space-y-2">
              {users.length === 0 ? (
                <div className="text-center py-8">
                  <svg
                    className="w-12 h-12 text-gray-300 mx-auto mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  <p className="text-gray-500 text-sm">No members online</p>
                </div>
              ) : (
                users.map((user, index) => (
                  <div
                    key={index}
                    className="flex items-center space-x-3 p-2 rounded-md hover:bg-gray-50">
                    <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-sm font-medium">
                      {user.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {user.slice(0, 20)}
                        {user.length > 20 ? "..." : ""}
                      </p>
                      <div className="flex items-center space-x-1">
                        <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                        <span className="text-xs text-gray-500">Online</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="flex-1 p-4">
            <h3 className="font-semibold text-gray-900 text-sm uppercase tracking-wide mb-3">
              Activity
            </h3>
            <div className="space-y-3">
              {typing && (
                <div className="flex items-start space-x-3 p-3 bg-blue-50 border border-blue-100 rounded-md">
                  <div className="flex space-x-1 mt-1">
                    <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></div>
                    <div
                      className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"
                      style={{ animationDelay: "0.1s" }}></div>
                    <div
                      className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"
                      style={{ animationDelay: "0.2s" }}></div>
                  </div>
                  <div>
                    <p className="text-sm text-blue-800 font-medium">
                      {typing}
                    </p>
                    <p className="text-xs text-blue-600">
                      Real-time collaboration
                    </p>
                  </div>
                </div>
              )}

              <div className="text-center py-8">
                <svg
                  className="w-10 h-10 text-gray-300 mx-auto mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                  />
                </svg>
                <p className="text-gray-500 text-xs">
                  Activity will appear here
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Editor and Output */}
        <div className="flex-1 flex flex-col">
          {/* File Tabs */}
          {openTabs.length > 0 && (
            <div className="bg-gray-50 border-b border-gray-200 flex items-center overflow-x-auto">
              {openTabs.map((filePath) => (
                <div
                  key={filePath}
                  onClick={() => setActiveFile(filePath)}
                  className={`flex items-center space-x-2 px-4 py-2 border-r border-gray-200 cursor-pointer hover:bg-gray-100 flex-shrink-0 ${
                    activeFile === filePath
                      ? "bg-white border-b-2 border-indigo-500"
                      : ""
                  }`}>
                  <span className="text-sm">{getFileIcon(filePath)}</span>
                  <span className="text-sm font-medium text-gray-700">
                    {filePath.split("/").pop()}
                  </span>
                  {openTabs.length > 1 && (
                    <button
                      onClick={(e) => closeTab(filePath, e)}
                      className="text-gray-400 hover:text-gray-600 ml-2">
                      <svg
                        className="w-3 h-3"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Code Editor */}
          <div className="flex-1 relative">
            {activeFile ? (
              <Editor
                height="100%"
                defaultLanguage={language}
                language={language}
                value={code}
                onChange={handleCodeChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily:
                    "JetBrains Mono, Fira Code, Monaco, Consolas, monospace",
                  lineHeight: 1.5,
                  padding: { top: 16, bottom: 16 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: "smooth",
                  renderWhitespace: "selection",
                  wordWrap: "on",
                  automaticLayout: true
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full bg-gray-50">
                <div className="text-center">
                  <svg
                    className="w-16 h-16 text-gray-300 mx-auto mb-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-600 mb-2">
                    No file selected
                  </h3>
                  <p className="text-gray-500">
                    Select a file from the explorer or create a new one to start
                    coding
                  </p>
                  <button
                    onClick={() => setShowNewFileModal(true)}
                    className="mt-4 bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors">
                    Create New File
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Output Console */}
          <div className="h-48 border-t border-gray-200 bg-gray-900 flex flex-col">
            <div className="bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <svg
                  className="w-4 h-4 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 9l3 3-3 3m5 0h3"
                  />
                </svg>
                <span className="text-sm font-medium text-gray-300">
                  Output Console
                </span>
                {activeFile && (
                  <span className="text-xs text-gray-500">
                    ({activeFile.split("/").pop()})
                  </span>
                )}
              </div>
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
            </div>
            <div className="flex-1 p-4 overflow-auto">
              <pre className="text-green-400 font-mono text-sm whitespace-pre-wrap">
                {outPut ||
                  "Program output will be displayed here...\nClick 'Run' to execute your code."}
              </pre>
            </div>
          </div>
        </div>
      </div>

      {/* New File Modal */}
      {showNewFileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Create New File
            </h3>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                File Path
              </label>
              <input
                type="text"
                placeholder="e.g., src/components/Header.js or styles.css"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                autoFocus
                onKeyPress={(e) => e.key === "Enter" && createNewFile()}
              />
              <p className="text-xs text-gray-500 mt-1">
                Include folders in the path to organize your files
              </p>
            </div>

            {newFileName && (
              <div className="mb-4 p-3 bg-gray-50 rounded-md">
                <p className="text-sm text-gray-600">
                  <strong>Detected:</strong> {getFileIcon(newFileName)}{" "}
                  {newFileName.split(".").pop().toUpperCase()} file
                </p>
              </div>
            )}

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowNewFileModal(false);
                  setNewFileName("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={createNewFile}
                disabled={!newFileName || files[newFileName]}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors">
                {files[newFileName] ? "File exists" : "Create File"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96 max-w-full mx-4">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.664-.833-2.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  Delete File
                </h3>
                <p className="text-sm text-gray-600">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="mb-6">
              <p className="text-sm text-gray-700">
                Are you sure you want to delete <strong>{fileToDelete}</strong>?
              </p>
            </div>

            <div className="flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setFileToDelete("");
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors">
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors">
                Delete File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
