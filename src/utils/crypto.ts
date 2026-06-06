/**
 * Native AES-256-GCM client-side encryption/decryption utilities.
 * Uses window.crypto.subtle (Web Crypto API) and requires zero external dependencies.
 */

// Helper to convert string to ArrayBuffer
function stringToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str)
}

// Helper to convert ArrayBuffer to string
function bufferToString(buf: ArrayBuffer): string {
  return new TextDecoder().decode(buf)
}

// Helper to convert ArrayBuffer to Base64
function bufferToBase64(buf: ArrayBuffer): string {
  const binary = String.fromCharCode(...new Uint8Array(buf))
  return window.btoa(binary)
}

// Helper to convert Base64 to ArrayBuffer
function base64ToBuffer(base64: string): Uint8Array {
  const binary = window.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Derive a cryptographic key from password + salt using PBKDF2
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    stringToBuffer(password) as any,
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as any,
      iterations: 100000,
      hash: 'SHA-256',
    } as any,
    baseKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt a text payload with a password.
 * Returns a Base64 encoded string containing the salt, IV, and ciphertext.
 */
export async function encryptText(text: string, password: string): Promise<string> {
  const salt = window.crypto.getRandomValues(new Uint8Array(16))
  const iv = window.crypto.getRandomValues(new Uint8Array(12))
  const key = await deriveKey(password, salt)

  const ciphertext = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
    },
    key,
    stringToBuffer(text) as any
  )

  // Package: Salt (16 bytes) + IV (12 bytes) + Ciphertext (variable)
  const packaged = new Uint8Array(salt.length + iv.length + ciphertext.byteLength)
  packaged.set(salt, 0)
  packaged.set(iv, salt.length)
  packaged.set(new Uint8Array(ciphertext), salt.length + iv.length)

  return bufferToBase64(packaged.buffer)
}

/**
 * Decrypt a Base64 encoded packaged payload with a password.
 * Returns the original decrypted text.
 */
export async function decryptText(encryptedBase64: string, password: string): Promise<string> {
  const packaged = base64ToBuffer(encryptedBase64)
  
  if (packaged.length < 28) {
    throw new Error('Invalid backup file payload format.')
  }

  const salt = packaged.slice(0, 16)
  const iv = packaged.slice(16, 28)
  const ciphertext = packaged.slice(28)

  const key = await deriveKey(password, salt)

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as any,
    },
    key,
    ciphertext as any
  )

  return bufferToString(decrypted)
}
