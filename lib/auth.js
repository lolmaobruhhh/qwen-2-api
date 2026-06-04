import db, { updateAccountToken, deactivateAccount } from './database.js';
import crypto from 'crypto';

export async function loginAccount(accountId, email, password) {
  try {
    let finalPassword = password;
    if (!/^[a-f0-9]{64}$/i.test(password)) {
        finalPassword = crypto.createHash('sha256').update(password).digest('hex');
    }

    const res = await fetch("https://chat.qwen.ai/api/v2/auths/signin", {
        method: "POST",
        headers: {
            "Accept": "application/json, text/plain, */*",
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36",
            "Origin": "https://chat.qwen.ai",
            "Referer": "https://chat.qwen.ai/auth"
        },
        body: JSON.stringify({ email, password: finalPassword })
    });

    if (!res.ok) {
        throw new Error(`Signin failed with status: ${res.status}`);
    }

    const json = await res.json();
    if (!json.success || !json.data || !json.data.token) {
        if (json.data && json.data.details) {
            throw new Error(`Qwen error: ${json.data.details}`);
        }
        if (json.message) {
            throw new Error(`Qwen error: ${json.message}`);
        }
        throw new Error("Invalid response format from Qwen signin. Payload: " + JSON.stringify(json));
    }

    const token = json.data.token;
    const expiresAt = json.data.expires_at || 0;

    // Update database
    updateAccountToken(accountId, token, expiresAt);
    return token;
  } catch (error) {
    console.error(`[Auth] Failed to login account ${email}:`, error.message);
    deactivateAccount(accountId);
    throw error;
  }
}

export async function getValidToken(account) {
  const now = Math.floor(Date.now() / 1000);
  // Give a 5 minute buffer for token expiration
  if (account.token && account.expires_at && account.expires_at > now + 300) {
    return account.token;
  }
  
  console.log(`[Auth] Token expired or missing for ${account.email}. Attempting login...`);
  return await loginAccount(account.id, account.email, account.password);
}
