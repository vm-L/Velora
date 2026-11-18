import crypto from 'crypto';

/**
 * 115 电脑端下载接口 (proapi.115.com/app/chrome/downurl) 请求/响应加解密
 * 对齐 YunX-Desktop Pan115Crypto.kt (1024-bit RSA modPow + XOR)
 */

const KEY_TABLE = [
  0xf0, 0xe5, 0x69, 0xae, 0xbf, 0xdc, 0xbf, 0x8a,
  0x1a, 0x45, 0xe8, 0xbe, 0x7d, 0xa6, 0x73, 0xb8,
  0xde, 0x8f, 0xe7, 0xc4, 0x45, 0xda, 0x86, 0xc4,
  0x9b, 0x64, 0x8b, 0x14, 0x6a, 0xb4, 0xf1, 0xaa,
  0x38, 0x01, 0x35, 0x9e, 0x26, 0x69, 0x2c, 0x86,
  0x00, 0x6b, 0x4f, 0xa5, 0x36, 0x34, 0x62, 0xa6,
  0x2a, 0x96, 0x68, 0x18, 0xf2, 0x4a, 0xfd, 0xbd,
  0x6b, 0x97, 0x8f, 0x4d, 0x8f, 0x89, 0x13, 0xb7,
  0x6c, 0x8e, 0x93, 0xed, 0x0e, 0x0d, 0x48, 0x3e,
  0xd7, 0x2f, 0x88, 0xd8, 0xfe, 0xfe, 0x7e, 0x86,
  0x50, 0x95, 0x4f, 0xd1, 0xeb, 0x83, 0x26, 0x34,
  0xdb, 0x66, 0x7b, 0x9c, 0x7e, 0x9d, 0x7a, 0x81,
  0x32, 0xea, 0xb6, 0x33, 0xde, 0x3a, 0xa9, 0x59,
  0x34, 0x66, 0x3b, 0xaa, 0xba, 0x81, 0x60, 0x48,
  0xb9, 0xd5, 0x81, 0x9c, 0xf8, 0x6c, 0x84, 0x77,
  0xff, 0x54, 0x78, 0x26, 0x5f, 0xbe, 0xe8, 0x1e,
  0x36, 0x9f, 0x34, 0x80, 0x5c, 0x45, 0x2c, 0x9b,
  0x76, 0xd5, 0x1b, 0x8f, 0xcc, 0xc3, 0xb8, 0xf5
];

const LONG_KEY = [
  0x78, 0x06, 0xad, 0x4c, 0x33, 0x86, 0x5d, 0x18, 0x4c, 0x01, 0x3f, 0x46
];

const MODULUS = BigInt(
  '0x8686980c0f5a24c4b9d43020cd2c22703ff3f450756529058b1cf88f09b86021' +
  '36477198a6e2683149659bd122c33592fdb5ad47944ad1ea4d36c6b172aad633' +
  '8c3bb6ac6227502d010993ac967d1aef00f0c8e038de2e4d3bc2ec368af2e9f1' +
  '0a6f1eda4f7262f136420c07c331b871bf139f74f3010e3c4fe57df3afb71683'
);

const EXPONENT = BigInt(0x10001);
const RSA_ENCODE_BLOCK = 117;
const RSA_BLOCK = 128;

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let result = BigInt(1);
  let b = base % mod;
  let e = exp;
  while (e > BigInt(0)) {
    if (e & BigInt(1)) {
      result = (result * b) % mod;
    }
    e >>= BigInt(1);
    b = (b * b) % mod;
  }
  return result;
}

function bytesToBigInt(buf: Buffer): bigint {
  if (buf.length === 0) return BigInt(0);
  return BigInt('0x' + buf.toString('hex'));
}

function bigIntToFixedBuffer(value: bigint, length = RSA_BLOCK): Buffer {
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = '0' + hex;
  }
  const raw = Buffer.from(hex, 'hex');
  if (raw.length === length) return raw;
  const out = Buffer.alloc(length, 0);
  if (raw.length > length) {
    raw.copy(out, 0, raw.length - length);
  } else {
    raw.copy(out, length - raw.length);
  }
  return out;
}

function deriveKey(seed: Buffer, size: number): Buffer {
  const out = Buffer.alloc(size);
  for (let i = 0; i < size; i++) {
    const left = KEY_TABLE[size * i];
    const right = KEY_TABLE[size * (size - 1 - i)];
    out[i] = ((seed[i % seed.length] + left) & 0xff) ^ right;
  }
  return out;
}

function xorTransform(data: Buffer, key: Buffer): void {
  const offset = data.length % 4;
  for (let i = 0; i < offset; i++) {
    data[i] = data[i] ^ key[i % key.length];
  }
  for (let i = offset; i < data.length; i++) {
    data[i] = data[i] ^ key[(i - offset) % key.length];
  }
}

function reverseBuffer(data: Buffer): void {
  let left = 0;
  let right = data.length - 1;
  while (left < right) {
    const tmp = data[left];
    data[left] = data[right];
    data[right] = tmp;
    left++;
    right--;
  }
}

function symmetricEncode(data: Buffer, key: Buffer): void {
  xorTransform(data, deriveKey(key, 4));
  reverseBuffer(data);
  xorTransform(data, Buffer.from(LONG_KEY));
}

function symmetricDecode(data: Buffer, key: Buffer, salt: Buffer): void {
  xorTransform(data, deriveKey(salt, 12));
  reverseBuffer(data);
  xorTransform(data, deriveKey(key, 4));
}

function rsaEncrypt(input: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < input.length) {
    const size = Math.min(RSA_ENCODE_BLOCK, input.length - offset);
    const block = Buffer.alloc(RSA_BLOCK, 0xff);
    block[0] = 0;
    block[1] = 2;
    const separator = RSA_BLOCK - size - 1;
    block[separator] = 0;
    input.copy(block, separator + 1, offset, offset + size);
    const encrypted = bigIntToFixedBuffer(modPow(bytesToBigInt(block), EXPONENT, MODULUS));
    chunks.push(encrypted);
    offset += size;
  }
  return Buffer.concat(chunks);
}

function rsaDecrypt(input: Buffer): Buffer {
  const chunks: Buffer[] = [];
  let offset = 0;
  while (offset < input.length) {
    const size = Math.min(RSA_BLOCK, input.length - offset);
    const block = input.subarray(offset, offset + size);
    const plain = bigIntToFixedBuffer(modPow(bytesToBigInt(block), EXPONENT, MODULUS));
    let start = -1;
    for (let i = 2; i < plain.length; i++) {
      if (plain[i] === 0) {
        start = i + 1;
        break;
      }
    }
    if (start < 1 || start >= plain.length) {
      throw new Error('115 下载响应缺少 RSA 分隔符');
    }
    chunks.push(plain.subarray(start));
    offset += size;
  }
  return Buffer.concat(chunks);
}

export const Pan115Crypto = {
  newKey(): Buffer {
    return crypto.randomBytes(16);
  },

  encode(payload: string, key: Buffer): string {
    if (key.length !== 16) {
      throw new Error('115 下载协议要求 16 字节 key');
    }
    const body = Buffer.from(payload, 'utf8');
    symmetricEncode(body, key);
    const plain = Buffer.concat([key, body]);
    return rsaEncrypt(plain).toString('base64');
  },

  decode(data: string, key: Buffer): string {
    if (key.length !== 16) {
      throw new Error('115 下载协议要求 16 字节 key');
    }
    const cleanBase64 = data.replace(/\s+/g, '');
    const decrypted = rsaDecrypt(Buffer.from(cleanBase64, 'base64'));
    if (decrypted.length <= 16) {
      throw new Error('115 下载响应长度异常');
    }
    const salt = decrypted.subarray(0, 16);
    const body = Buffer.from(decrypted.subarray(16));
    symmetricDecode(body, key, salt);
    return body.toString('utf8');
  }
};
