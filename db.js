const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'database.sqlite');

let db = null;

const initializeDatabase = () => {
  return new Promise((resolve, reject) => {
    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('Error opening database:', err);
        reject(err);
        return;
      }
      console.log('✅ Connected to SQLite database');
      createTables().then(resolve).catch(reject);
    });
  });
};

const createTables = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Users table
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        googleId TEXT UNIQUE,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        picture TEXT,
        isAdmin INTEGER DEFAULT 0,
        isActive INTEGER DEFAULT 1,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        lastLogin TEXT
      )`, (err) => {
        if (err) {
          console.error('Error creating users table:', err);
          reject(err);
          return;
        }
      });

      // Activity logs table
      db.run(`CREATE TABLE IF NOT EXISTS activity_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        userId INTEGER,
        action TEXT NOT NULL,
        details TEXT,
        ipAddress TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id)
      )`, (err) => {
        if (err) {
          console.error('Error creating activity_logs table:', err);
          reject(err);
          return;
        }
      });

      // Settings table
      db.run(`CREATE TABLE IF NOT EXISTS settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        value TEXT,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      )`, (err) => {
        if (err) {
          console.error('Error creating settings table:', err);
          reject(err);
          return;
        }
      });

      // Files table
      db.run(`CREATE TABLE IF NOT EXISTS files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        filename TEXT NOT NULL,
        originalName TEXT NOT NULL,
        filePath TEXT NOT NULL,
        fileSize INTEGER NOT NULL,
        mimeType TEXT,
        description TEXT,
        uploadedBy INTEGER NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (uploadedBy) REFERENCES users(id)
      )`, (err) => {
        if (err) {
          console.error('Error creating files table:', err);
          reject(err);
          return;
        }
      });

      // Comments table
      db.run(`CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fileId INTEGER NOT NULL,
        userId INTEGER NOT NULL,
        content TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fileId) REFERENCES files(id) ON DELETE CASCADE,
        FOREIGN KEY (userId) REFERENCES users(id)
      )`, (err) => {
        if (err) {
          console.error('Error creating comments table:', err);
          reject(err);
          return;
        }
        // Insert default settings
        db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES 
          ('siteName', 'Admin WebApp'),
          ('maintenanceMode', '0'),
          ('allowRegistrations', '1')
        `);
        resolve();
      });
    });
  });
};

// User functions
const getUserById = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const getUserByGoogleId = (googleId) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE googleId = ?', [googleId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const getUserByEmail = (email) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM users WHERE email = ?', [email], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const createUser = (userData) => {
  return new Promise((resolve, reject) => {
    const { googleId, email, name, picture, isAdmin } = userData;
    db.run(
      'INSERT INTO users (googleId, email, name, picture, isAdmin, lastLogin) VALUES (?, ?, ?, ?, ?, ?)',
      [googleId, email, name, picture, isAdmin ? 1 : 0, new Date().toISOString()],
      function(err) {
        if (err) reject(err);
        else {
          getUserById(this.lastID).then(resolve).catch(reject);
        }
      }
    );
  });
};

const updateUser = (id, updates) => {
  return new Promise((resolve, reject) => {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(id);
    
    db.run(`UPDATE users SET ${fields} WHERE id = ?`, values, (err) => {
      if (err) reject(err);
      else getUserById(id).then(resolve).catch(reject);
    });
  });
};

const getAllUsers = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, email, name, picture, isAdmin, isActive, createdAt, lastLogin FROM users ORDER BY createdAt DESC', (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const deleteUser = (id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM users WHERE id = ?', [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Activity log functions
const createActivityLog = (logData) => {
  return new Promise((resolve, reject) => {
    const { userId, action, details, ipAddress } = logData;
    db.run(
      'INSERT INTO activity_logs (userId, action, details, ipAddress) VALUES (?, ?, ?, ?)',
      [userId, action, details, ipAddress],
      function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
};

const getActivityLogs = (limit = 100) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT al.*, u.name as userName, u.email as userEmail 
       FROM activity_logs al 
       LEFT JOIN users u ON al.userId = u.id 
       ORDER BY al.createdAt DESC 
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

// Settings functions
const getSetting = (key) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) reject(err);
      else resolve(row ? row.value : null);
    });
  });
};

const setSetting = (key, value) => {
  return new Promise((resolve, reject) => {
    db.run(
      'INSERT OR REPLACE INTO settings (key, value, updatedAt) VALUES (?, ?, ?)',
      [key, value, new Date().toISOString()],
      (err) => {
        if (err) reject(err);
        else resolve();
      }
    );
  });
};

const getAllSettings = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM settings', (err, rows) => {
      if (err) reject(err);
      else {
        const settings = {};
        rows.forEach(row => {
          settings[row.key] = row.value;
        });
        resolve(settings);
      }
    });
  });
};

// File functions
const createFile = (fileData) => {
  return new Promise((resolve, reject) => {
    const { filename, originalName, filePath, fileSize, mimeType, description, uploadedBy } = fileData;
    db.run(
      'INSERT INTO files (filename, originalName, filePath, fileSize, mimeType, description, uploadedBy) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [filename, originalName, filePath, fileSize, mimeType, description || null, uploadedBy],
      function(err) {
        if (err) reject(err);
        else {
          getFileById(this.lastID).then(resolve).catch(reject);
        }
      }
    );
  });
};

const getFileById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT f.*, u.name as uploaderName, u.email as uploaderEmail 
       FROM files f 
       LEFT JOIN users u ON f.uploadedBy = u.id 
       WHERE f.id = ?`,
      [id],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

const getAllFiles = () => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT f.*, u.name as uploaderName, u.email as uploaderEmail 
       FROM files f 
       LEFT JOIN users u ON f.uploadedBy = u.id 
       ORDER BY f.createdAt DESC`,
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

const updateFile = (id, updates) => {
  return new Promise((resolve, reject) => {
    const fields = Object.keys(updates).map(key => `${key} = ?`).join(', ');
    const values = Object.values(updates);
    values.push(new Date().toISOString()); // updatedAt
    values.push(id);
    
    db.run(`UPDATE files SET ${fields}, updatedAt = ? WHERE id = ?`, values, (err) => {
      if (err) reject(err);
      else getFileById(id).then(resolve).catch(reject);
    });
  });
};

const deleteFile = (id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM files WHERE id = ?', [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

// Comment functions
const createComment = (commentData) => {
  return new Promise((resolve, reject) => {
    const { fileId, userId, content } = commentData;
    db.run(
      'INSERT INTO comments (fileId, userId, content) VALUES (?, ?, ?)',
      [fileId, userId, content],
      function(err) {
        if (err) reject(err);
        else {
          getCommentById(this.lastID).then(resolve).catch(reject);
        }
      }
    );
  });
};

const getCommentById = (id) => {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT c.*, u.name as userName, u.email as userEmail, u.picture as userPicture 
       FROM comments c 
       LEFT JOIN users u ON c.userId = u.id 
       WHERE c.id = ?`,
      [id],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
};

const getCommentsByFileId = (fileId) => {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT c.*, u.name as userName, u.email as userEmail, u.picture as userPicture 
       FROM comments c 
       LEFT JOIN users u ON c.userId = u.id 
       WHERE c.fileId = ? 
       ORDER BY c.createdAt ASC`,
      [fileId],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
};

const updateComment = (id, content) => {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE comments SET content = ?, updatedAt = ? WHERE id = ?',
      [content, new Date().toISOString(), id],
      (err) => {
        if (err) reject(err);
        else getCommentById(id).then(resolve).catch(reject);
      }
    );
  });
};

const deleteComment = (id) => {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM comments WHERE id = ?', [id], (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
};

module.exports = {
  db,
  initializeDatabase,
  getUserById,
  getUserByGoogleId,
  getUserByEmail,
  createUser,
  updateUser,
  getAllUsers,
  deleteUser,
  createActivityLog,
  getActivityLogs,
  getSetting,
  setSetting,
  getAllSettings,
  createFile,
  getFileById,
  getAllFiles,
  updateFile,
  deleteFile,
  createComment,
  getCommentById,
  getCommentsByFileId,
  updateComment,
  deleteComment
};






