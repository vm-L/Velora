import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { safeStorage, app } from 'electron';
import { PanType, PanAccount, PanMetaConfig } from './types';
import { logger } from '../logger';

export const PAN_CONFIGS: Record<PanType, PanMetaConfig> = {
  quark: {
    type: 'quark',
    name: '夸克网盘',
    loginUrl: 'https://pan.quark.cn/',
    domain: 'pan.quark.cn',
    requiredCookies: ['kps', '__kps'],
    needAuth: true
  },
  baidu: {
    type: 'baidu',
    name: '百度网盘',
    loginUrl: 'https://pan.baidu.com/',
    domain: 'pan.baidu.com',
    requiredCookies: ['BDUSS'],
    needAuth: true
  },
  '123pan': {
    type: '123pan',
    name: '123云盘',
    loginUrl: 'https://www.123pan.com/',
    domain: '123pan.com',
    requiredCookies: ['token', 'uid'],
    needAuth: false
  },
  xunlei: {
    type: 'xunlei',
    name: '迅雷云盘',
    loginUrl: 'https://pan.xunlei.com/',
    domain: 'pan.xunlei.com',
    requiredCookies: ['sessionid', 'userid'],
    needAuth: true
  },
  '115': {
    type: '115',
    name: '115网盘',
    loginUrl: 'https://115.com/',
    domain: '115.com',
    requiredCookies: ['CID', 'SEID', 'UID'],
    needAuth: true
  },
  lanzou: {
    type: 'lanzou',
    name: '蓝奏云',
    loginUrl: 'https://pc.woozooo.com/mydisk.php',
    domain: 'lanzou.com',
    requiredCookies: ['ylogin', 'phpdisk_info'],
    needAuth: false
  },
  uc: {
    type: 'uc',
    name: 'UC网盘',
    loginUrl: 'https://drive.uc.cn/',
    domain: 'drive.uc.cn',
    requiredCookies: ['kps', '__kps'],
    needAuth: true
  },
  '139': {
    type: '139',
    name: '中国移动云盘',
    loginUrl: 'https://yun.139.com/',
    domain: 'yun.139.com',
    requiredCookies: ['authorization'],
    needAuth: false
  },
  guangya: {
    type: 'guangya',
    name: '光鸭云盘',
    loginUrl: 'https://www.guangyapan.com/',
    domain: 'guangyapan.com',
    requiredCookies: [],
    needAuth: false
  },
  ilanzou: {
    type: 'ilanzou',
    name: '蓝奏云优享版',
    loginUrl: 'https://www.ilanzou.com/',
    domain: 'ilanzou.com',
    requiredCookies: [],
    needAuth: false
  }
};

export class PanAccountManager {
  private static instance: PanAccountManager;
  private filePath: string;
  private accounts: Map<PanType, PanAccount> = new Map();
  private loaded = false;
  private loadCorrupted = false;

  private static readonly SAFE_MAGIC = Buffer.from('VSAFE1:');
  private static readonly GCM_MAGIC = Buffer.from('VGCM01:');

  private constructor() {
    let baseDir = process.cwd();
    if (process.env.PORTABLE_EXECUTABLE_DIR) {
      baseDir = process.env.PORTABLE_EXECUTABLE_DIR;
    } else if (app?.isPackaged && typeof app.getPath === 'function') {
      baseDir = path.dirname(app.getPath('exe'));
    }
    const dataDir = path.join(baseDir, 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch {}
    }
    this.filePath = path.join(dataDir, 'pan_accounts.enc');
  }

  static getInstance(): PanAccountManager {
    if (!PanAccountManager.instance) {
      PanAccountManager.instance = new PanAccountManager();
    }
    return PanAccountManager.instance;
  }

  public ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.load();
  }

  private getFallbackKey(): Buffer {
    return crypto.createHash('sha256').update('velora_pan_secure_key_' + (process.env.USER || process.env.USERNAME || 'default')).digest();
  }

  private decryptLegacyGcm(payload: Buffer): string {
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const encrypted = payload.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.getFallbackKey(), iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted) + decipher.final('utf8');
  }

  private encrypt(text: string): Buffer {
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      return Buffer.concat([PanAccountManager.SAFE_MAGIC, safeStorage.encryptString(text)]);
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.getFallbackKey(), iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([PanAccountManager.GCM_MAGIC, iv, tag, encrypted]);
  }

  private decrypt(buf: Buffer): string {
    if (buf.subarray(0, PanAccountManager.SAFE_MAGIC.length).equals(PanAccountManager.SAFE_MAGIC)) {
      if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
        throw new Error('safeStorage 当前不可用，无法解密系统密钥链密文');
      }
      return safeStorage.decryptString(buf.subarray(PanAccountManager.SAFE_MAGIC.length));
    }

    if (buf.subarray(0, PanAccountManager.GCM_MAGIC.length).equals(PanAccountManager.GCM_MAGIC)) {
      return this.decryptLegacyGcm(buf.subarray(PanAccountManager.GCM_MAGIC.length));
    }

    // 兼容无魔数前缀的历史密文
    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      try {
        return safeStorage.decryptString(buf);
      } catch {
        // Fallback to legacy unprefixed GCM
      }
    }
    return this.decryptLegacyGcm(buf);
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.filePath)) return;
      const data = fs.readFileSync(this.filePath);
      if (!data || data.length === 0) return;
      const json = this.decrypt(data);
      const parsed = JSON.parse(json);
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach((k) => {
          const acc = parsed[k];
          // 校验夸克账号有效性，过滤没有真实鉴权凭证的脏数据
          if (k === 'quark' && (!acc?.cookies?.['__pus'] && !acc?.cookies?.['__puus'] && !acc?.cookies?.['__kps'] && !acc?.cookies?.['kps'])) {
            return;
          }
          // 清洗历史脏昵称（如之前由 DOM 文本错误抓取的“慈祥的白猫0B/1TB查看”）
          if (k === 'quark' && typeof acc.name === 'string' && (acc.name.includes('查看') || acc.name.includes('0B/') || acc.name.includes('1TB'))) {
            acc.name = acc.name.replace(/\d+([KMGT]?B)?\/\d+([KMGT]?B)?.*$/i, '').replace(/查看.*$/, '').trim() || '夸克用户';
          }
          this.accounts.set(k as PanType, acc);
        });
      }
      this.loadCorrupted = false;
      logger.info('PanAccountManager', `已成功加载 ${this.accounts.size} 个网盘账号凭据`);
    } catch (err: any) {
      if (app && typeof app.isReady === 'function' && !app.isReady()) {
        // 若主进程在 ready 前意外触发加载，允许 ready 后重新加载而不锁死为空
        this.loaded = false;
      } else {
        this.loadCorrupted = true;
      }
      logger.error('PanAccountManager', `加载网盘凭据失败: ${err.message}`);
    }
  }

  private save(): void {
    try {
      if (this.loadCorrupted && fs.existsSync(this.filePath)) {
        try {
          fs.copyFileSync(this.filePath, `${this.filePath}.bak.${Date.now()}`);
          logger.warn('PanAccountManager', '检测到历史凭据文件未解密，写入新账号前已自动备份原文件');
        } catch {}
        this.loadCorrupted = false;
      }
      const obj: Record<string, any> = {};
      this.accounts.forEach((val, key) => {
        obj[key] = val;
      });
      const json = JSON.stringify(obj);
      const enc = this.encrypt(json);
      const tmpPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tmpPath, enc, { mode: 0o600 });
      fs.renameSync(tmpPath, this.filePath);
    } catch (err: any) {
      logger.error('PanAccountManager', `持久化网盘凭据失败: ${err.message}`);
    }
  }

  getAccount(type: PanType): PanAccount | null {
    this.ensureLoaded();
    return this.accounts.get(type) || null;
  }

  getAllAccounts(): PanAccount[] {
    this.ensureLoaded();
    return Array.from(this.accounts.values());
  }

  saveAccount(account: PanAccount): void {
    this.ensureLoaded();
    account.updatedAt = Date.now();
    this.accounts.set(account.type, account);
    this.save();
    logger.info('PanAccountManager', `网盘账号 ${account.type} (${account.name}) 凭据已保存`);
  }

  removeAccount(type: PanType): void {
    this.ensureLoaded();
    if (this.accounts.delete(type)) {
      this.save();
      logger.info('PanAccountManager', `网盘账号 ${type} 凭据已移除`);
    }
  }

  getCookieHeader(type: PanType): string {
    this.ensureLoaded();
    const account = this.getAccount(type);
    if (!account || !account.cookies) return '';
    return Object.entries(account.cookies)
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  mergeSetCookies(type: PanType, setCookies: string[]): void {
    this.ensureLoaded();
    if (!setCookies || setCookies.length === 0) return;
    const account = this.getAccount(type);
    if (!account || !account.cookies) return;

    let changed = false;
    for (const sc of setCookies) {
      const kv = sc.split(';')[0].trim();
      const eq = kv.indexOf('=');
      if (eq <= 0) continue;
      const name = kv.substring(0, eq).trim();
      const val = kv.substring(eq + 1).trim();
      if (['__puus', '__pus', '__pugs'].includes(name)) {
        if (account.cookies[name] !== val) {
          account.cookies[name] = val;
          changed = true;
        }
      }
    }

    if (changed) {
      account.updatedAt = Date.now();
      this.save();
      logger.info('PanAccountManager', `已自动更新网盘 ${type} 最新鉴权 Cookie (puus/pus)`);
    }
  }
}

export const panAccountManager = PanAccountManager.getInstance();
