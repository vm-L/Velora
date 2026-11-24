import os from 'os';

/**
 * 自动评分并选取本机最适合局域网访问的物理网卡 IPv4 地址
 */
export function getLocalIp(): string {
  const interfaces = os.networkInterfaces();
  interface Candidate {
    ip: string;
    score: number;
    devName: string;
  }

  const candidates: Candidate[] = [];

  // 虚拟网卡特征词列表（强惩罚）
  const virtualPatterns = [
    'vethernet', 'wsl', 'vmware', 'vmnet', 'virtualbox', 'vbox',
    'docker', 'container', 'tun', 'tap', 'tailscale', 'zerotier',
    'loopback', 'hyper-v', 'bridge', 'virbr', 'dummy', 'host-only',
    'npcap', 'pcap', 'utun', 'awdl', 'llw', 'teredo', 'isatap',
    'pseudo', 'vpn'
  ];

  // 物理网卡特征词列表（加分）
  const wifiPatterns = ['wi-fi', 'wifi', 'wlan', 'wireless', '无线'];
  const ethernetPatterns = ['ethernet', 'eth', 'en0', 'en1', '以太网', '本地连接'];

  for (const devName of Object.keys(interfaces)) {
    const iface = interfaces[devName];
    if (!iface) continue;

    const lowerDev = devName.toLowerCase();
    const isVirtual = virtualPatterns.some(p => lowerDev.includes(p));
    const isWifi = wifiPatterns.some(p => lowerDev.includes(p));
    const isEthernet = ethernetPatterns.some(p => lowerDev.includes(p));

    for (const alias of iface) {
      if (alias.family !== 'IPv4' || alias.internal) continue;
      const ip = alias.address;
      if (!ip || ip === '127.0.0.1' || ip === '0.0.0.0' || ip.startsWith('169.254.') || ip.startsWith('255.')) {
        continue;
      }

      let score = 0;

      // 虚拟网卡惩罚
      if (isVirtual) {
        score -= 100;
      } else {
        // 物理网卡加分
        if (isWifi) score += 50;
        else if (isEthernet) score += 45;
        else score += 10;
      }

      // IP 地址网段评分
      if (ip.startsWith('192.168.')) {
        score += 30;
      } else if (ip.startsWith('10.')) {
        score += 20;
      } else if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip)) {
        score += 10;
      } else {
        score += 5;
      }

      // 主机位特征：.1 通常是虚拟适配器或网关地址，真实 DHCP 客户端通常 > .1
      const parts = ip.split('.');
      if (parts.length === 4) {
        const lastOctet = parseInt(parts[3], 10);
        if (lastOctet === 1) {
          score -= 20;
        } else if (lastOctet >= 2 && lastOctet <= 254) {
          score += 15;
        }
      }

      candidates.push({ ip, score, devName });
    }
  }

  if (candidates.length === 0) {
    return '127.0.0.1';
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].ip;
}
