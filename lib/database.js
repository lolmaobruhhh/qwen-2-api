import path from 'path';
import fs from 'fs';

// Ensure data directory exists
const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
const dbPath = path.join(dataDir, 'proxy.db');

let db;
try {
  // Use dynamic import so it doesn't crash statically if missing
  const Database = (await import('better-sqlite3')).default;
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
} catch (e) {
  console.warn("⚠️ better-sqlite3 native bindings failed to load. Falling back to Mock DB for local testing.");
  db = {
    _mockData: { accounts: [], conversations: [] },
    _idCounter: 1,
    exec: () => {},
    prepare: (query) => ({
      run: (...args) => {
        if (query.includes("INSERT INTO accounts")) {
          db._mockData.accounts.push({
            id: db._idCounter++, email: args[0], password: args[1], token: null, expires_at: 0, active: 1, request_count: 0
          });
        }
        if (query.includes("UPDATE accounts SET password")) {
          const acc = db._mockData.accounts.find(a => a.email === args[1]);
          if(acc) acc.password = args[0];
        }
        if (query.includes("UPDATE accounts SET token")) {
          const acc = db._mockData.accounts.find(a => a.id === args[2]);
          if(acc) { acc.token = args[0]; acc.expires_at = args[1]; acc.active = 1; }
        }
        if (query.includes("UPDATE accounts SET active = 0")) {
          const acc = db._mockData.accounts.find(a => a.id === args[0]);
          if(acc) acc.active = 0;
        }
        if (query.includes("UPDATE accounts SET request_count")) {
          const acc = db._mockData.accounts.find(a => a.id === args[0]);
          if(acc) acc.request_count++;
        }
        if (query.includes("INSERT INTO conversations")) {
          const c = db._mockData.conversations.find(c => c.conv_key === args[0] && c.api_key_hash === args[1]);
          if(c) {
             c.qwen_chat_id = args[2]; c.account_id = args[3]; c.message_count = args[4]; c.last_msg_id = args[5];
          } else {
             db._mockData.conversations.push({
                conv_key: args[0], api_key_hash: args[1], qwen_chat_id: args[2], account_id: args[3], message_count: args[4], last_msg_id: args[5]
             });
          }
        }
      },
      get: (...args) => {
        if(query.includes("SELECT * FROM accounts WHERE active = 1")) return db._mockData.accounts.find(a => a.active === 1);
        if(query.includes("SELECT * FROM conversations")) return db._mockData.conversations.find(c => c.conv_key === args[0] && c.api_key_hash === args[1]);
        return null;
      },
      all: () => {
        if(query.includes("SELECT id, email")) return db._mockData.accounts;
        return [];
      }
    }),
    pragma: () => {}
  };
}

// Initialize Schema
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      token TEXT,
      expires_at INTEGER,
      active INTEGER DEFAULT 1,
      request_count INTEGER DEFAULT 0,
      last_used DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS conversations (
      conv_key TEXT NOT NULL,
      api_key_hash TEXT NOT NULL,
      qwen_chat_id TEXT NOT NULL,
      account_id INTEGER NOT NULL,
      message_count INTEGER DEFAULT 0,
      root_message_count INTEGER,
      last_msg_id TEXT,
      last_used DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(conv_key, api_key_hash)
    );
  `);
}

initSchema();

// Add PRAGMA migrations here if columns need adding in future updates.
try {
  db.prepare("ALTER TABLE conversations ADD COLUMN last_user_msg_id TEXT").run();
} catch (e) {
  // ignore if column exists
}

try {
  db.prepare("ALTER TABLE conversations ADD COLUMN root_message_count INTEGER").run();
} catch (e) {
  // ignore
}

// Export commonly used db methods
// --- Account Management ---
export function addAccount(email, password) {
  try {
    const stmt = db.prepare('INSERT INTO accounts (email, password) VALUES (?, ?)');
    stmt.run(email, password);
    return true;
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      // Update password if email exists
      db.prepare('UPDATE accounts SET password = ? WHERE email = ?').run(password, email);
      return true;
    }
    throw error;
  }
}

export function getAllAccounts() {
  return db.prepare('SELECT id, email, password, token, expires_at, active, request_count, last_used FROM accounts').all();
}

export function updateAccountToken(id, token, expiresAt) {
  db.prepare('UPDATE accounts SET token = ?, expires_at = ?, active = 1 WHERE id = ?').run(token, expiresAt, id);
}

export function deactivateAccount(id) {
  db.prepare('UPDATE accounts SET active = 0 WHERE id = ?').run(id);
}

// Get the least recently used active account
export function getNextAccount() {
  return db.prepare('SELECT * FROM accounts WHERE active = 1 ORDER BY last_used ASC LIMIT 1').get();
}

export function bumpAccountUsage(id) {
  db.prepare('UPDATE accounts SET request_count = request_count + 1, last_used = CURRENT_TIMESTAMP WHERE id = ?').run(id);
}

// --- Conversation Management ---
export function getConversation(convKey, apiKeyHash) {
  return db.prepare('SELECT * FROM conversations WHERE conv_key = ? AND api_key_hash = ?').get(convKey, apiKeyHash);
}

export function createOrUpdateConversation(convKey, apiKeyHash, qwenChatId, accountId, messageCount, rootMessageCount, lastMsgId, lastUserMsgId) {
  const insertOrReplace = db.prepare(`
    INSERT INTO conversations (conv_key, api_key_hash, qwen_chat_id, account_id, message_count, root_message_count, last_msg_id, last_user_msg_id, last_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(conv_key, api_key_hash) DO UPDATE SET 
      qwen_chat_id = excluded.qwen_chat_id,
      account_id = excluded.account_id,
      message_count = excluded.message_count,
      root_message_count = COALESCE(conversations.root_message_count, excluded.root_message_count),
      last_msg_id = excluded.last_msg_id,
      last_user_msg_id = excluded.last_user_msg_id,
      last_used = CURRENT_TIMESTAMP
  `);
  insertOrReplace.run(convKey, apiKeyHash, qwenChatId, accountId, messageCount, rootMessageCount || null, lastMsgId, lastUserMsgId || null);
}

export default db;
