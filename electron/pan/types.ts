/**
 * 网盘服务类型与接口定义
 */

export type PanType =
  | 'quark'
  | 'baidu'
  | '123pan'
  | 'xunlei'
  | '115'
  | 'lanzou'
  | 'uc'
  | '139'
  | 'guangya'
  | 'ilanzou';

export interface PanShareCreatedInfo {
  shareUrl: string;
  passcode?: string;
  shareId?: string;
  title?: string;
  warning?: string;
}

export interface PanCreateShareParams {
  fids: string[];
  expireType: number; // ShareExpire 中性码：1=永久, 2=1天, 3=7天, 4=30天；115专用：101=永久, 102=1天, 103=3天, 104=7天, 105=15天
  passcode?: string;
  fidsInfo?: Array<{ fid: string; isDirectory?: boolean }>;
}

export interface PanPublicAccount {
  type: PanType;
  name: string;
  avatar?: string;
  quotaText?: string;
  totalSpace?: number;
  usedSpace?: number;
  updatedAt: number;
}

export interface PanMetaConfig {
  type: PanType;
  name: string;
  loginUrl: string;
  domain: string;
  requiredCookies: string[]; // 判定登录成功的关键 Cookie 名称
  needAuth: boolean;         // 是否必须登录账号才可解析/下载
}

export interface PanAccount {
  type: PanType;
  name: string;              // 用户昵称或标识
  avatar?: string;
  cookies: Record<string, string>;
  token?: string;
  quotaText?: string;        // 格式化容量，例如 "15.2 GB / 1 TB"
  totalSpace?: number;
  usedSpace?: number;
  extra?: Record<string, any>;
  updatedAt: number;
}

export interface PanFileItem {
  id: string;
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
  downloadUrl?: string;      // 若已解析出直链
  rawInfo?: any;
}

export interface PanParseResult {
  panType: PanType;
  shareTitle: string;
  files: PanFileItem[];
  error?: string;
}

export interface PanShareDownloadItem {
  fid: string;
  fidToken?: string;
  pwdId?: string;
  stoken?: string;
  extra?: Record<string, any>;
}

export interface PanDownloadItemLink {
  fid: string;
  url: string;
  size?: number;
  filename?: string;
  headers: Record<string, string>;
  cleanupDirFid?: string;
}

export interface PanProvider {
  panType: PanType;
  canHandle(url: string): boolean;
  parse(url: string, password?: string, account?: PanAccount): Promise<PanParseResult>;
  getDownloadUrl?(fileItem: PanFileItem, account?: PanAccount): Promise<string>;
  getShareDownloadUrls?(items: PanShareDownloadItem[], account?: PanAccount): Promise<Record<string, string>>;
  getShareDownloadUrlsDetail?(items: PanShareDownloadItem[], account?: PanAccount): Promise<Record<string, PanDownloadItemLink>>;
  saveShareItems?(items: PanShareDownloadItem[], targetDirFid: string, account: PanAccount): Promise<{ savedCount: number }>;
}

export interface PanDriveItem {
  id: string;              // fid
  name: string;            // 文件名
  pdir_fid: string;        // 父目录 fid
  size: number;            // 字节大小
  isDirectory: boolean;    // 是否为文件夹
  updatedAt: number;       // 更新时间戳
  formatType?: string;     // folder, video, audio, image, etc.
  thumbnail?: string;
  downloadUrl?: string;    // 直链
  extra?: Record<string, any>;
}

export interface PanDriveListResult {
  files: PanDriveItem[];
  total: number;
  pdir_fid: string;
}

export interface PanDriveProvider {
  panType: PanType;
  listFiles(pdirFid: string, account: PanAccount): Promise<PanDriveListResult>;
  getDriveDownloadUrl(fid: string, account: PanAccount): Promise<string>;
  getBatchDownloadUrls?(fids: string[], account: PanAccount): Promise<Record<string, string>>;
  getBatchDownloadUrlsDetail?(fids: string[], account: PanAccount): Promise<Record<string, PanDownloadItemLink>>;
  deleteFiles(fids: string[], account: PanAccount): Promise<boolean>;
  getQuota?(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null>;
  createFolder?(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }>;
  renameItem?(fid: string, newName: string, account: PanAccount, extra?: { isDirectory?: boolean }): Promise<boolean>;
  moveItems?(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean>;
  createShare?(params: PanCreateShareParams, account: PanAccount): Promise<PanShareCreatedInfo>;
}

