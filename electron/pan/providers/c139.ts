import crypto from 'crypto';
import zlib from 'zlib';
import { net } from 'electron';
import {
  PanProvider,
  PanParseResult,
  PanFileItem,
  PanAccount,
  PanDriveProvider,
  PanDriveListResult,
  PanDriveItem,
  PanShareDownloadItem,
  PanDownloadItemLink,
  PanCreateShareParams,
  PanShareCreatedInfo
} from '../types';
import { logger } from '../../logger';
import { toC139Period } from '../shareExpire';
import {
  buildCookieHeader,
  formatPanBytes,
  inferFormatType,
  mapConcurrent,
  parseTimestamp,
  sleep
} from '../utils';

export const C139_CONSTANTS = {
  SHARE_BASE: 'https://share-kd-njs.yun.139.com',
  SHARE_LIST_URL: 'https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IOutLink/getOutLinkInfoV6',
  SHARE_LINK_URL: 'https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IOutLink/dlFromOutLinkV3',
  SHARE_GENERAL_URL: 'https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IOutLink/getOutLinkGeneral',
  TRANSFER_CREATE_URL: 'https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IBatchOprTask/createOuterLinkBatchOprTask',
  TRANSFER_QUERY_URL: 'https://share-kd-njs.yun.139.com/yun-share/richlifeApp/devapp/IBatchOprTask/queryBatchOprTaskDetail',
  SHARE_AES_KEY: 'PVGDwmcvfs1uV3d1',
  SHARE_X_DEVICEINFO: '||3|12.27.0|||||chrome 150.0.0.0|360X444|zh-cn|||',
  SHARE_X_HUAWEI_CHANNELSRC: '10245500',
  SHARE_X_MM_SOURCE: '0002',
  SHARE_MOBILE_UA:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36',

  CLOUD_BASE: 'https://personal-kd-njs.yun.139.com',
  FILE_LIST_URL: 'https://personal-kd-njs.yun.139.com/hcy/file/list',
  FILE_UPDATE_URL: 'https://personal-kd-njs.yun.139.com/hcy/file/update',
  FILE_CREATE_URL: 'https://personal-kd-njs.yun.139.com/hcy/file/create',
  BATCH_MOVE_URL: 'https://personal-kd-njs.yun.139.com/hcy/file/batchMove',
  BATCH_TRASH_URL: 'https://personal-kd-njs.yun.139.com/hcy/recyclebin/batchTrash',
  DOWNLOAD_URL: 'https://personal-kd-njs.yun.139.com/hcy/file/getDownloadUrl',
  TASK_GET_URL: 'https://personal-kd-njs.yun.139.com/hcy/task/get',
  QUOTA_URL: 'https://user-njs.yun.139.com/user/disk/quota/detail',
  OUTLINK_CREATE_URL: 'https://yun.139.com/orchestration/personalCloud-rebuild/outlink/v1.0/getOutLink',

  YUN_CHANNEL_SOURCE: '10000034',
  MCLOUD_VERSION: '7.17.9',
  MCLOUD_CLIENT: '10701',
  MCLOUD_CHANNEL: '1000101',
  YUN_MODULE_TYPE: '100',
  M4C_SRC: '10002',
  M4C_CALLER: 'PC',
  X_DEVICEINFO: '||9|7.17.9|chrome|116.0.0.0|2cdaf7ada9e353c70eba99092e177991||windows 10||zh-CN|||',
  X_CLIENT_INFO: '||9|7.17.9|chrome|116.0.0.0|2cdaf7ada9e353c70eba99092e177991||windows 10||zh-CN|||dW5kZWZpbmVk||',
  PC_UA: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  REFERER: 'https://yun.139.com/',
  TEMP_DIR_NAME: 'Velora临时转存'
};

export class C139Provider implements PanProvider, PanDriveProvider {
  panType = '139' as const;

  /** 缓存个人盘条目类型及名称，供 createShare 区分目录/文件 */
  private itemMetaCache = new Map<string, { isDirectory: boolean; name: string }>();
  private ensureTempDirPromise: Promise<string> | null = null;

  private async ensureTempDir(account: PanAccount): Promise<string> {
    if (this.ensureTempDirPromise) {
      return this.ensureTempDirPromise;
    }
    this.ensureTempDirPromise = (async () => {
      try {
        const listed = await this.listFiles('/', account);
        const existing = listed.files.find(
          (f) => f.isDirectory && f.name === C139_CONSTANTS.TEMP_DIR_NAME
        );
        if (existing?.id) {
          return existing.id;
        }
      } catch {}

      const created = await this.createFolder('/', C139_CONSTANTS.TEMP_DIR_NAME, account);
      return created.fid;
    })().finally(() => {
      this.ensureTempDirPromise = null;
    });
    return this.ensureTempDirPromise;
  }

  private setItemMeta(fid: string, meta: { isDirectory: boolean; name: string }) {
    if (!fid) return;
    if (this.itemMetaCache.size >= 5000) {
      const oldestKey = this.itemMetaCache.keys().next().value;
      if (oldestKey !== undefined) this.itemMetaCache.delete(oldestKey);
    }
    this.itemMetaCache.set(fid, meta);
  }

  canHandle(url: string): boolean {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('yun.139.com') || lower.includes('caiyun.139.com');
  }

  private extractLinkId(url: string): string {
    const m1 = url.match(/yun\.139\.com\/shareweb\/.*?\/w\/i\/([A-Za-z0-9_-]+)/i);
    if (m1) return m1[1];
    const m2 = url.match(/caiyun\.139\.com\/m\/i\?([A-Za-z0-9_-]+)/i);
    if (m2) return m2[1];
    const m3 = url.match(/\/w\/i\/([A-Za-z0-9_-]+)/i);
    return m3 ? m3[1] : '';
  }

  private md5Hex(str: string): string {
    return crypto.createHash('md5').update(str, 'utf8').digest('hex');
  }

  private calSign(bodyJson: string, ts: string, rand: string): string {
    const encoded = encodeURIComponent(bodyJson);
    const sorted = Array.from(encoded).sort().join('');
    const b64 = Buffer.from(sorted, 'utf8').toString('base64');
    return this.md5Hex(this.md5Hex(b64) + this.md5Hex(`${ts}:${rand}`)).toUpperCase();
  }

  private signHeader(bodyJson: string): string {
    const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
    const pad = (n: number) => String(n).padStart(2, '0');
    const ts = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let rand = '';
    for (let i = 0; i < 16; i++) {
      rand += pool[crypto.randomInt(pool.length)];
    }
    return `${ts},${rand},${this.calSign(bodyJson, ts, rand)}`;
  }

  private getAuthContext(account?: PanAccount): { authorization: string; accountStr: string; cookieHeader: string } {
    const cookieHeader = buildCookieHeader(account?.cookies);
    const authorization = account?.cookies?.authorization || account?.extra?.authorization || '';
    let accountStr = account?.extra?.account || '';

    if (!accountStr && authorization) {
      try {
        const b64 = authorization.replace(/^Basic\s+/i, '').trim();
        const parts = Buffer.from(b64, 'base64').toString('utf8').split(':');
        if (parts[1]) accountStr = parts[1].trim();
      } catch {}
    }
    if (!accountStr && account?.cookies?.['ORCHES-I-ACCOUNT-ENCRYPT']) {
      try {
        accountStr = Buffer.from(account.cookies['ORCHES-I-ACCOUNT-ENCRYPT'], 'base64').toString('utf8').trim();
      } catch {}
    }
    if (!accountStr && account?.cookies?.['Login_UserNumber']) {
      accountStr = account.cookies['Login_UserNumber'].trim();
    }

    return { authorization, accountStr, cookieHeader };
  }

  private requireAuth(account: PanAccount): { authorization: string; accountStr: string; cookieHeader: string } {
    const ctx = this.getAuthContext(account);
    if (!ctx.authorization) {
      throw new Error('移动云盘登录态缺少 authorization，请在设置中重新登录');
    }
    return ctx;
  }

  private encryptShareBody(plain: string): string {
    const key = Buffer.from(C139_CONSTANTS.SHARE_AES_KEY, 'utf8');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return Buffer.concat([iv, ct]).toString('base64');
  }

  private decryptShareBody(b64: string): string {
    const raw = Buffer.from(b64.trim(), 'base64');
    if (raw.length <= 16) {
      throw new Error('响应数据长度异常');
    }
    const key = Buffer.from(C139_CONSTANTS.SHARE_AES_KEY, 'utf8');
    const iv = raw.subarray(0, 16);
    const ct = raw.subarray(16);
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    let plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    if (plain.length > 2 && plain[0] === 0x1f && plain[1] === 0x8b) {
      plain = zlib.gunzipSync(plain);
    }
    return plain.toString('utf8');
  }

  private parseEncryptedResponse(text: string): any {
    const trimmed = (text || '').trim();
    if (!trimmed) throw new Error('移动云盘请求失败：响应为空');
    if (trimmed.startsWith('<')) {
      throw new Error('移动云盘网关返回异常 HTML 响应，请稍后重试');
    }
    if (trimmed.startsWith('{')) {
      return JSON.parse(trimmed);
    }
    try {
      return JSON.parse(this.decryptShareBody(trimmed));
    } catch {
      if (trimmed.startsWith('<')) {
        throw new Error('移动云盘网关返回异常 HTML 响应，请稍后重试');
      }
      throw new Error('移动云盘加密响应解析失败');
    }
  }

  private async sharePostAnonymous(url: string, plainBody: string): Promise<any> {
    const encrypted = this.encryptShareBody(plainBody);
    const resp = await net.fetch(url, {
      method: 'POST',
      headers: {
        'hcy-cool-flag': '1',
        'x-deviceinfo': C139_CONSTANTS.SHARE_X_DEVICEINFO,
        'x-huawei-channelsrc': C139_CONSTANTS.SHARE_X_HUAWEI_CHANNELSRC,
        'x-mm-source': C139_CONSTANTS.SHARE_X_MM_SOURCE,
        'Content-Type': 'application/json;charset=UTF-8',
        'User-Agent': C139_CONSTANTS.SHARE_MOBILE_UA,
        'Origin': 'https://yun.139.com',
        'Referer': C139_CONSTANTS.REFERER,
        'Accept': 'application/json, text/plain, */*'
      },
      body: encrypted
    });
    const text = await resp.text();
    return this.parseEncryptedResponse(text);
  }

  private async sharePostEncrypted(url: string, plainBody: string, authorization?: string): Promise<any> {
    const encrypted = this.encryptShareBody(plainBody);
    const headers: Record<string, string> = {
      'hcy-cool-flag': '1',
      'x-deviceinfo': C139_CONSTANTS.SHARE_X_DEVICEINFO,
      'x-huawei-channelsrc': C139_CONSTANTS.SHARE_X_HUAWEI_CHANNELSRC,
      'x-mm-source': C139_CONSTANTS.SHARE_X_MM_SOURCE,
      'mcloud-sign': this.signHeader(plainBody),
      'Content-Type': 'application/json;charset=UTF-8',
      'User-Agent': C139_CONSTANTS.SHARE_MOBILE_UA,
      'Origin': 'https://yun.139.com',
      'Referer': C139_CONSTANTS.REFERER,
      'Accept': 'application/json, text/plain, */*'
    };
    if (authorization) {
      headers['Authorization'] = authorization;
    }
    const resp = await net.fetch(url, {
      method: 'POST',
      headers,
      body: encrypted
    });
    const text = await resp.text();
    return this.parseEncryptedResponse(text);
  }

  private async cloudPost(
    url: string,
    plainBody: string,
    authorization: string,
    cookie?: string,
    needSkey = false
  ): Promise<any> {
    const headers: Record<string, string> = {
      'Authorization': authorization,
      'mcloud-sign': this.signHeader(plainBody),
      'x-yun-channel-source': C139_CONSTANTS.YUN_CHANNEL_SOURCE,
      'x-yun-app-channel': C139_CONSTANTS.YUN_CHANNEL_SOURCE,
      'x-huawei-channelSrc': C139_CONSTANTS.YUN_CHANNEL_SOURCE,
      'mcloud-version': C139_CONSTANTS.MCLOUD_VERSION,
      'mcloud-client': C139_CONSTANTS.MCLOUD_CLIENT,
      'mcloud-channel': C139_CONSTANTS.MCLOUD_CHANNEL,
      'mcloud-route': '001',
      'x-yun-module-type': C139_CONSTANTS.YUN_MODULE_TYPE,
      'x-yun-api-version': 'v1',
      'x-yun-svc-type': '1',
      'x-SvcType': '1',
      'caller': 'web',
      'x-inner-ntwk': '2',
      'CMS-DEVICE': 'default',
      'x-m4c-src': C139_CONSTANTS.M4C_SRC,
      'x-m4c-caller': C139_CONSTANTS.M4C_CALLER,
      'X-Deviceinfo': C139_CONSTANTS.X_DEVICEINFO,
      'x-yun-client-info': C139_CONSTANTS.X_CLIENT_INFO,
      'INNER-HCY-ROUTER-HTTPS': '1',
      'Sec-Fetch-Site': 'same-site',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Dest': 'empty',
      'X-Requested-With': 'mark.via',
      'Content-Type': 'application/json;charset=UTF-8',
      'User-Agent': C139_CONSTANTS.PC_UA,
      'Origin': 'https://yun.139.com',
      'Referer': C139_CONSTANTS.REFERER,
      'Accept': 'application/json, text/plain, */*'
    };
    if (cookie) {
      headers['Cookie'] = cookie;
      if (needSkey) {
        const skeyPart = cookie
          .split(';')
          .map((s) => s.trim())
          .find((s) => s.startsWith('skey='));
        if (skeyPart) {
          const skeyVal = skeyPart.slice('skey='.length).trim();
          if (skeyVal) headers['mcloud-skey'] = skeyVal;
        }
      }
    }

    const resp = await net.fetch(url, {
      method: 'POST',
      headers,
      body: plainBody
    });
    const text = await resp.text();
    if (!text) throw new Error(`移动云盘请求失败（HTTP ${resp.status}）`);
    if (/^\s*</.test(text)) {
      throw new Error(`移动云盘返回异常页面（HTTP ${resp.status}），请稍后重试或重新登录`);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`移动云盘响应格式异常（HTTP ${resp.status}）`);
    }
  }

  private checkCloud(json: any, fallback: string) {
    const code = String(json?.code ?? '');
    if (json?.success !== false && (code === '0000' || code === '0')) return;
    if (code === '04000005' || code === '401') {
      throw new Error('移动云盘登录态已过期，请在设置中重新登录');
    }
    const msg = json?.message || json?.desc || fallback;
    throw new Error(`${msg}${code ? ` (code=${code})` : ''}`);
  }

  private async getOutLinkGeneral(linkId: string): Promise<{ lkName?: string; passwd?: string }> {
    try {
      const plain = JSON.stringify({
        getOutLinkGeneralReq: {
          linkID: linkId,
          isPasswd: 1,
          account: ''
        }
      });
      const respJson = await this.sharePostAnonymous(C139_CONSTANTS.SHARE_GENERAL_URL, plain);
      const resultCode = String(respJson?.resultCode ?? '');
      if ((resultCode && resultCode !== '0') || respJson?.success === false) {
        return {};
      }
      const arr = respJson?.data?.getOutLinkGeneralResp?.outLinkGeneral;
      if (Array.isArray(arr) && arr.length > 0) {
        return {
          lkName: arr[0]?.lkName || undefined,
          passwd: arr[0]?.passwd || undefined
        };
      }
    } catch {}
    return {};
  }

  /**
   * 1. 分享解析
   */
  async parse(url: string, password = '', _account?: PanAccount): Promise<PanParseResult> {
    const linkId = this.extractLinkId(url);
    if (!linkId) {
      return {
        panType: '139',
        shareTitle: '中国移动云盘',
        files: [],
        error: '无法从链接中提取分享 ID'
      };
    }

    try {
      const urlPwdMatch = url.match(/[?&](?:pwd|password|passcode)=([A-Za-z0-9]+)/i);
      const general = await this.getOutLinkGeneral(linkId);
      const effectivePwd = password || urlPwdMatch?.[1] || general.passwd || '';
      const shareTitle = general.lkName || '中国移动云盘分享';

      const files: PanFileItem[] = [];
      const visitedDirs = new Set<string>();

      const scanDir = async (pcaId: string, prefix: string): Promise<void> => {
        if (visitedDirs.has(pcaId)) return;
        visitedDirs.add(pcaId);

        const subDirs: Array<{ id: string; path: string }> = [];
        const seenItems = new Set<string>();
        const pageSize = 200;

        for (let page = 0; page < 50; page++) {
          const bNum = page * pageSize + 1;
          const eNum = (page + 1) * pageSize;
          const plain = JSON.stringify({
            getOutLinkInfoReq: {
              account: '',
              linkID: linkId,
              passwd: effectivePwd,
              caSrt: 1,
              coSrt: 1,
              srtDr: 0,
              bNum,
              pCaID: pcaId,
              eNum
            }
          });
          const respJson = await this.sharePostAnonymous(C139_CONSTANTS.SHARE_LIST_URL, plain);
          const resultCode = String(respJson?.resultCode ?? '');
          if (resultCode && resultCode !== '0') {
            if (resultCode === '9188') {
              throw new Error('提取码错误或缺失，请确认后重试');
            }
            throw new Error(respJson?.desc || `获取分享列表失败 (${resultCode})`);
          }
          if (respJson?.success === false) {
            throw new Error(respJson?.desc || '获取分享列表失败');
          }

          const data = respJson?.data;
          if (!data) break;

          let added = 0;
          if (Array.isArray(data.caLst)) {
            for (const ca of data.caLst) {
              const caId = String(ca?.caID || '');
              const caName = ca?.caName || '未知文件夹';
              if (!caId || seenItems.has(`d:${caId}`)) continue;
              seenItems.add(`d:${caId}`);
              added++;
              const itemPath = prefix ? `${prefix}/${caName}` : caName;
              subDirs.push({ id: caId, path: itemPath });
            }
          }

          if (Array.isArray(data.coLst)) {
            for (const co of data.coLst) {
              const coId = String(co?.coID || '');
              const coName = co?.coName || '未知文件';
              const isDir = co?.isdir === true || Number(co?.coType) === 2;
              if (!coId || seenItems.has(`${isDir ? 'd' : 'f'}:${coId}`)) continue;
              seenItems.add(`${isDir ? 'd' : 'f'}:${coId}`);
              added++;
              const itemPath = prefix ? `${prefix}/${coName}` : coName;
              if (isDir) {
                subDirs.push({ id: coId, path: itemPath });
              } else {
                files.push({
                  id: coId,
                  name: coName,
                  path: itemPath,
                  size: Number(co?.coSize || 0),
                  isDirectory: false,
                  rawInfo: {
                    fid: coId,
                    pwdId: linkId,
                    stoken: effectivePwd,
                    fidToken: pcaId,
                    isDir: false,
                    name: coName
                  }
                });
              }
            }
          }

          if (added < pageSize) break;
        }

        for (const sub of subDirs) {
          await scanDir(sub.id, sub.path);
        }
      };

      await scanDir('root', '');

      if (files.length === 0) {
        return {
          panType: '139',
          shareTitle,
          files: [],
          error: '未找到可下载的文件，请检查链接或提取码'
        };
      }

      return {
        panType: '139',
        shareTitle,
        files
      };
    } catch (err: any) {
      logger.error('C139Provider', `解析 139 分享异常: ${err.message}`);
      return {
        panType: '139',
        shareTitle: '中国移动云盘',
        files: [],
        error: err?.message || '解析移动云盘分享失败'
      };
    }
  }

  /**
   * 2. 获取分享直链（支持登录态下临时转存兜底）
   */
  async getShareDownloadUrlsDetail(
    items: PanShareDownloadItem[],
    account?: PanAccount
  ): Promise<Record<string, PanDownloadItemLink>> {
    const result: Record<string, PanDownloadItemLink> = {};
    if (!items || items.length === 0) return result;

    const auth = account ? this.getAuthContext(account) : { authorization: '', accountStr: '', cookieHeader: '' };

    const needTransferItems: PanShareDownloadItem[] = [];

    await mapConcurrent(items, 4, async (item) => {
      const linkId = item.pwdId || item.extra?.pwdId || '';
      if (!linkId) return;
      try {
        const plain = JSON.stringify({
          dlFromOutLinkReqV3: {
            account: auth.accountStr || '',
            linkID: linkId,
            coIDLst: { item: [item.fid] },
            commonAccountInfo: { account: auth.accountStr || '', accountType: 1 }
          }
        });
        const respJson = await this.sharePostEncrypted(
          C139_CONSTANTS.SHARE_LINK_URL,
          plain,
          auth.authorization || undefined
        );
        const resultCode = String(respJson?.resultCode ?? '');
        if ((!resultCode || resultCode === '0') && respJson?.success !== false) {
          const url = respJson?.data?.redrUrl;
          if (url) {
            result[item.fid] = {
              fid: item.fid,
              url,
              size: Number(respJson?.data?.coSize ?? respJson?.data?.size ?? 0) || undefined,
              filename: respJson?.data?.fileName || respJson?.data?.coName || item.extra?.name,
              headers: {
                Referer: C139_CONSTANTS.REFERER,
                'User-Agent': C139_CONSTANTS.SHARE_MOBILE_UA
              }
            };
            return;
          }
        }
      } catch (err: any) {
        logger.warn('C139Provider', `分享直链获取尝试失败 (${item.fid}): ${err.message}`);
      }
      needTransferItems.push(item);
    });

    // 若部分文件未拿到分享直链且已登录，通过个人盘临时目录转存后取个人盘高速直链
    if (needTransferItems.length > 0) {
      if (!account || !auth.authorization) {
        if (Object.keys(result).length === 0) {
          throw new Error('移动云盘该分享需要登录后方可获取下载地址，请在设置中登录中国移动云盘');
        }
        return result;
      }

      const byLink = new Map<string, PanShareDownloadItem[]>();
      for (const item of needTransferItems) {
        const linkId = item.pwdId || item.extra?.pwdId || '';
        if (!linkId) continue;
        const arr = byLink.get(linkId) || [];
        arr.push(item);
        byLink.set(linkId, arr);
      }

      const baseTempDirFid = await this.ensureTempDir(account);
      for (const [linkId, group] of Array.from(byLink.entries())) {
        let tempDirFid = '';
        try {
          const tempDirName = `tr_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
          const createdDir = await this.createFolder(baseTempDirFid, tempDirName, account);
          tempDirFid = createdDir.fid;

          const coIds = group.map((it) => it.fid);
          const taskId = await this.createTransferTask(coIds, [], tempDirFid, linkId, auth.accountStr, auth.authorization);
          let mapping: Record<string, string> = {};
          if (taskId) {
            for (let poll = 0; poll < 30; poll++) {
              await sleep(800);
              const res = await this.queryTransferTask(taskId, auth.accountStr, auth.authorization);
              if (res.done) {
                mapping = res.mapping;
                break;
              }
            }
          }

          let targetFiles: Array<{ id: string; name: string }> = [];
          const mappedIds = coIds.map((id) => mapping[id]).filter(Boolean);
          if (mappedIds.length > 0) {
            targetFiles = mappedIds.map((id) => ({ id, name: '' }));
          } else {
            const listed = await this.listFiles(tempDirFid, account);
            targetFiles = listed.files.filter((f) => !f.isDirectory).map((f) => ({ id: f.id, name: f.name }));
          }

          if (targetFiles.length === 0) {
            throw new Error('移动云盘临时转存后未找到目标文件');
          }

          const dlDetails = await this.getBatchDownloadUrlsDetail(
            targetFiles.map((f) => f.id),
            account
          );
          const usedTargetIds = new Set<string>();
          for (const origItem of group) {
            let targetId = mapping[origItem.fid];
            if (!targetId && origItem.extra?.name) {
              const matched = targetFiles.find((f) => !usedTargetIds.has(f.id) && f.name === origItem.extra?.name);
              targetId = matched?.id || '';
            }
            if (!targetId) continue;
            usedTargetIds.add(targetId);
            const link = dlDetails[targetId];
            if (link && link.url) {
              result[origItem.fid] = {
                ...link,
                fid: origItem.fid,
                cleanupDirFid: tempDirFid
              };
            }
          }

          if (!group.some((orig) => result[orig.fid]?.cleanupDirFid === tempDirFid)) {
            throw new Error('移动云盘临时转存后未能获取有效直链');
          }
        } catch (err: any) {
          if (tempDirFid) {
            this.deleteFiles([tempDirFid], account).catch(() => {});
          }
          if (Object.keys(result).length === 0) {
            throw err;
          }
        }
      }
    }

    return result;
  }

  async getShareDownloadUrls(items: PanShareDownloadItem[], account?: PanAccount): Promise<Record<string, string>> {
    const detail = await this.getShareDownloadUrlsDetail(items, account);
    const urls: Record<string, string> = {};
    for (const [k, v] of Object.entries(detail)) {
      urls[k] = v.url;
    }
    return urls;
  }

  private async createTransferTask(
    coIDLst: string[],
    catalogIDLst: string[],
    toFolderId: string,
    linkId: string,
    accountStr: string,
    authorization?: string
  ): Promise<string> {
    const taskInfo = {
      contentInfoList: coIDLst.map((id) => `/${id}`),
      catalogInfoList: catalogIDLst,
      newCatalogID: toFolderId,
      linkID: linkId,
      newCatalogName: '手机图片',
      needPassword: true
    };
    const req = {
      createOuterLinkBatchOprTaskReq: {
        msisdn: accountStr,
        ownerAccount: '',
        taskType: 1,
        taskInfo,
        linkID: linkId,
        needPassword: true
      },
      commonAccountInfo: {
        account: accountStr,
        accountType: 1
      }
    };
    const resp = await this.sharePostEncrypted(C139_CONSTANTS.TRANSFER_CREATE_URL, JSON.stringify(req), authorization);
    const code = String(resp?.resultCode || resp?.code || '');
    if (code && code !== '0') {
      throw new Error(resp?.desc || `创建移动云盘转存任务失败 (${code})`);
    }
    return resp?.data?.taskID || '';
  }

  private async queryTransferTask(
    taskId: string,
    accountStr: string,
    authorization?: string
  ): Promise<{ done: boolean; mapping: Record<string, string> }> {
    const req = {
      queryBatchOprTaskDetailReq: {
        taskID: taskId,
        msisdn: accountStr,
        commonAccountInfo: {
          account: accountStr,
          accountType: 1
        }
      }
    };
    const resp = await this.sharePostEncrypted(C139_CONSTANTS.TRANSFER_QUERY_URL, JSON.stringify(req), authorization);
    const code = String(resp?.resultCode || resp?.code || '');
    if (code && code !== '0') {
      throw new Error(resp?.desc || `查询移动云盘转存任务失败 (${code})`);
    }
    const data = resp?.data || {};
    const task = data.batchOprTask || {};
    const done = Number(task.progress || 0) >= 100 && Number(task.taskStatus || 0) === 2;
    const mapping: Record<string, string> = {};
    const arr = data?.contentList?.idRspInfo;
    if (Array.isArray(arr)) {
      for (const item of arr) {
        if (String(item?.reason) === '0000' && item?.srcId && item?.rstId) {
          mapping[String(item.srcId)] = String(item.rstId);
        }
      }
    }
    return { done, mapping };
  }

  /**
   * 3. 分享转存至个人盘
   */
  async saveShareItems(
    items: PanShareDownloadItem[],
    targetDirFid: string,
    account: PanAccount
  ): Promise<{ savedCount: number }> {
    const auth = this.requireAuth(account);
    const toFolderId = !targetDirFid || targetDirFid === '0' ? '/' : targetDirFid;
    const byLink = new Map<string, PanShareDownloadItem[]>();
    for (const item of items) {
      const linkId = item.pwdId || item.extra?.pwdId || '';
      if (!linkId) continue;
      const arr = byLink.get(linkId) || [];
      arr.push(item);
      byLink.set(linkId, arr);
    }

    let savedCount = 0;
    for (const [linkId, group] of Array.from(byLink.entries())) {
      const coIds = group.filter((it) => !it.extra?.isDir).map((it) => it.fid);
      const caIds = group.filter((it) => !!it.extra?.isDir).map((it) => it.fid);
      const taskId = await this.createTransferTask(coIds, caIds, toFolderId, linkId, auth.accountStr, auth.authorization);
      if (taskId) {
        for (let poll = 0; poll < 40; poll++) {
          const res = await this.queryTransferTask(taskId, auth.accountStr, auth.authorization);
          if (res.done) break;
          await sleep(750);
        }
      }
      savedCount += group.length;
    }

    return { savedCount };
  }

  /**
   * 4. 个人网盘文件列表
   */
  async listFiles(pdirFid: string, account: PanAccount): Promise<PanDriveListResult> {
    const auth = this.requireAuth(account);
    const displayParent = pdirFid || '0';
    const apiParent = !pdirFid || pdirFid === '0' ? '/' : pdirFid;

    const files: PanDriveItem[] = [];
    const seen = new Set<string>();
    let pageCursor: string | null = null;

    for (let page = 0; page < 50; page++) {
      const req = {
        pageInfo: {
          pageSize: 100,
          pageCursor
        },
        orderBy: 'updated_at',
        orderDirection: 'DESC',
        parentFileId: apiParent,
        imageThumbnailStyleList: ['Small', 'Large']
      };
      const resp = await this.cloudPost(C139_CONSTANTS.FILE_LIST_URL, JSON.stringify(req), auth.authorization);
      this.checkCloud(resp, '获取移动云盘文件列表失败');

      const data = resp?.data || {};
      const arr = Array.isArray(data.items) ? data.items : [];
      if (arr.length === 0) break;

      let added = 0;
      for (const item of arr) {
        const fid = String(item?.fileId || '');
        if (!fid || seen.has(fid)) continue;
        seen.add(fid);
        added++;
        const name = item?.name || '未知文件';
        const isDir = item?.type === 'folder';
        this.setItemMeta(fid, { isDirectory: isDir, name });
        files.push({
          id: fid,
          name,
          pdir_fid: displayParent,
          size: Number(item?.size || 0),
          isDirectory: isDir,
          updatedAt: parseTimestamp(item?.updatedAt || item?.createdAt),
          formatType: inferFormatType(name, isDir),
          thumbnail: item?.thumbnail
        });
      }

      const next = data.nextPageCursor;
      if (!next || added === 0) break;
      pageCursor = String(next);
    }

    return {
      files,
      total: files.length,
      pdir_fid: displayParent
    };
  }

  async getDriveDownloadUrl(fid: string, account: PanAccount): Promise<string> {
    const res = await this.getBatchDownloadUrls([fid], account);
    return res[fid] || '';
  }

  async getBatchDownloadUrls(fids: string[], account: PanAccount): Promise<Record<string, string>> {
    const details = await this.getBatchDownloadUrlsDetail(fids, account);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(details)) {
      out[k] = v.url;
    }
    return out;
  }

  async getBatchDownloadUrlsDetail(fids: string[], account: PanAccount): Promise<Record<string, PanDownloadItemLink>> {
    const auth = this.requireAuth(account);
    const out: Record<string, PanDownloadItemLink> = {};
    await mapConcurrent(fids, 4, async (fid) => {
      const resp = await this.cloudPost(
        C139_CONSTANTS.DOWNLOAD_URL,
        JSON.stringify({ fileId: fid }),
        auth.authorization
      );
      this.checkCloud(resp, '获取移动云盘下载链接失败');
      const data = resp?.data || {};
      const url = data.url;
      if (url) {
        out[fid] = {
          fid,
          url,
          size: Number(data.size || 0) || undefined,
          filename: data.name || this.itemMetaCache.get(fid)?.name || undefined,
          headers: {
            Referer: C139_CONSTANTS.REFERER,
            'User-Agent': C139_CONSTANTS.PC_UA
          }
        };
      }
    });
    return out;
  }

  private async waitTask(taskId: string, authorization: string): Promise<void> {
    for (let i = 0; i < 60; i++) {
      await sleep(750);
      const resp = await this.cloudPost(
        C139_CONSTANTS.TASK_GET_URL,
        JSON.stringify({ taskId }),
        authorization
      );
      this.checkCloud(resp, '查询移动云盘任务失败');
      const status = String(resp?.data?.taskInfo?.status || '').toLowerCase();
      if (status === 'succeed' || status === 'success' || Number(resp?.data?.taskInfo?.progress || 0) >= 100) {
        return;
      }
      if (status === 'failed' || status === 'error') {
        throw new Error('移动云盘异步操作失败');
      }
    }
  }

  async createFolder(parentFid: string, name: string, account: PanAccount): Promise<{ fid: string; name: string }> {
    const auth = this.requireAuth(account);
    const apiParent = !parentFid || parentFid === '0' ? '/' : parentFid;
    const req = {
      parentFileId: apiParent,
      name,
      description: '',
      type: 'folder',
      fileRenameMode: 'force_rename'
    };
    const resp = await this.cloudPost(C139_CONSTANTS.FILE_CREATE_URL, JSON.stringify(req), auth.authorization);
    this.checkCloud(resp, '新建文件夹失败');
    const fid = resp?.data?.fileId;
    if (!fid) throw new Error('移动云盘未返回新文件夹编号');
    this.setItemMeta(String(fid), { isDirectory: true, name });
    return { fid: String(fid), name };
  }

  async renameItem(fid: string, newName: string, account: PanAccount): Promise<boolean> {
    const auth = this.requireAuth(account);
    const req = {
      fileId: fid,
      name: newName,
      description: ''
    };
    const resp = await this.cloudPost(C139_CONSTANTS.FILE_UPDATE_URL, JSON.stringify(req), auth.authorization);
    this.checkCloud(resp, '重命名失败');
    const prev = this.itemMetaCache.get(fid);
    if (prev) this.setItemMeta(fid, { ...prev, name: newName });
    return true;
  }

  async moveItems(fids: string[], targetDirFid: string, account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const auth = this.requireAuth(account);
    const toParentFileId = !targetDirFid || targetDirFid === '0' ? '/' : targetDirFid;
    const req = {
      fileIds: fids,
      toParentFileId
    };
    const resp = await this.cloudPost(C139_CONSTANTS.BATCH_MOVE_URL, JSON.stringify(req), auth.authorization);
    this.checkCloud(resp, '移动文件失败');
    const taskId = resp?.data?.taskId;
    if (taskId) {
      await this.waitTask(String(taskId), auth.authorization);
    }
    return true;
  }

  async deleteFiles(fids: string[], account: PanAccount): Promise<boolean> {
    if (!fids || fids.length === 0) return true;
    const auth = this.requireAuth(account);
    const resp = await this.cloudPost(
      C139_CONSTANTS.BATCH_TRASH_URL,
      JSON.stringify({ fileIds: fids }),
      auth.authorization
    );
    this.checkCloud(resp, '删除文件失败');
    const taskId = resp?.data?.taskId;
    if (taskId) {
      await this.waitTask(String(taskId), auth.authorization);
    }
    return true;
  }

  async createShare(params: PanCreateShareParams, account: PanAccount): Promise<PanShareCreatedInfo> {
    const auth = this.requireAuth(account);
    if (!auth.accountStr) {
      throw new Error('无法从移动云盘登录态提取手机号，请在设置中重新登录');
    }
    const period = toC139Period(params.expireType);
    const coIDLst: string[] = [];
    const caIDLst: string[] = [];
    let firstName = '';

    for (const fid of params.fids) {
      const explicitInfo = params.fidsInfo?.find((info) => info.fid === fid);
      const meta = this.itemMetaCache.get(fid);
      if (!firstName && meta?.name) firstName = meta.name;
      const isDir = explicitInfo?.isDirectory !== undefined ? explicitInfo.isDirectory : Boolean(meta?.isDirectory);
      if (isDir) {
        caIDLst.push(fid);
      } else {
        coIDLst.push(fid);
      }
    }

    const dedicatedName = firstName || '移动云盘分享';
    const getOutLinkReq: Record<string, any> = {
      subLinkType: 0,
      encrypt: 1,
      coIDLst,
      caIDLst,
      pubType: 1,
      dedicatedName,
      periodUnit: 1,
      viewerLst: [],
      extInfo: { isWatermark: 0, shareChannel: '3001' },
      commonAccountInfo: { account: auth.accountStr, accountType: 1 }
    };
    if (period !== null) {
      getOutLinkReq.period = period;
    }

    const resp = await this.cloudPost(
      C139_CONSTANTS.OUTLINK_CREATE_URL,
      JSON.stringify({ getOutLinkReq }),
      auth.authorization,
      auth.cookieHeader,
      true
    );

    if (resp?.success === false || String(resp?.code) !== '0') {
      throw new Error(resp?.message || '移动云盘创建分享失败');
    }
    const resItem = resp?.data?.getOutLinkRes?.getOutLinkResSet?.[0];
    const shareUrl = resItem?.linkUrl;
    if (!shareUrl) {
      throw new Error('移动云盘创建分享失败：未返回分享链接');
    }
    return {
      shareUrl,
      passcode: resItem?.passwd || '',
      shareId: resItem?.linkID || '',
      title: dedicatedName
    };
  }

  async getQuota(account: PanAccount): Promise<{ used: number; total: number; quotaText: string } | null> {
    const auth = this.getAuthContext(account);
    if (!auth.authorization || !auth.accountStr) return null;
    try {
      const req = {
        userDomainId: '',
        commonAccountInfo: { account: auth.accountStr, accountType: 1 }
      };
      const resp = await this.cloudPost(
        C139_CONSTANTS.QUOTA_URL,
        JSON.stringify(req),
        auth.authorization,
        auth.cookieHeader,
        true
      );
      this.checkCloud(resp, '获取移动云盘容量失败');
      const data = resp?.data;
      if (!data) return null;
      const total = Number(data.diskSize || 0) * 1024 * 1024;
      const quotaItemUsed = data?.quotaList?.[0]?.usedSize;
      const used =
        quotaItemUsed !== undefined
          ? Number(quotaItemUsed) * 1024 * 1024
          : Math.max(0, total - Number(data.freeDiskSize || 0) * 1024 * 1024);
      if (total > 0) {
        return {
          used,
          total,
          quotaText: `${formatPanBytes(used)} / ${formatPanBytes(total)}`
        };
      }
      return null;
    } catch {
      return null;
    }
  }
}
