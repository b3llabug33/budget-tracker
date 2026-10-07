// AES-256-GCM encryption for the Plaid access token, so it is never stored in plain text.
const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const hex = process.env.ENCRYPTION_KEY || '';
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error('ENCRYPTION_KEY must be 64 hex characters (32 bytes). See .env.example.');
  }
  return Buffer.from(hex, 'hex');
}

// Returns "iv:authTag:ciphertext", each part base64.
function encrypt(plainText) {
  const iv = crypto.randomBytes(12); // 96-bit IV is the standard size for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString('base64')).join(':');
}

function decrypt(payload) {
  const [iv, tag, encrypted] = payload.split(':').map((s) => Buffer.from(s, 'base64'));
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag); // decryption fails if the data was tampered with
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

module.exports = { encrypt, decrypt, getKey };
