export type ConfigBackupSectionKey =
  | 'general'           // 常规与偏好设置 (主题、关闭行为)
  | 'download'          // 下载与存储设置 (目录、并发、缓冲、子目录匹配)
  | 'videoCompress'     // 视频压缩参数 (开关、阈值、最低码率)
  | 'lanShare'          // 局域网共享设置 (开关、端口、密码、权限)
  | 'externalSites'     // 网页资源站点
  | 'localResources'    // 本地资源挂载
  | 'cmsResources'      // CMS 影视资源站
  | 'customParseRules'  // 域名解析规则
  | 'customScripts'     // 注入脚本与自定义样式
  | 'adBlockSources';   // 广告拦截规则源

export interface ConfigBackupSectionMeta {
  key: ConfigBackupSectionKey;
  title: string;
  category: string;
  description: string;
  icon: string;
}

export const BACKUP_SECTIONS: ConfigBackupSectionMeta[] = [
  {
    key: 'general',
    title: '常规与外观',
    category: '系统偏好',
    description: '深浅主题外观、窗口关闭与系统托盘行为',
    icon: 'settings'
  },
  {
    key: 'download',
    title: '下载与存储',
    category: '下载传输',
    description: '下载存储目录、并发任务数、内存缓冲区与智能子目录匹配',
    icon: 'download'
  },
  {
    key: 'videoCompress',
    title: '视频自动压缩',
    category: '转码压缩',
    description: '自动转码开关、压缩触发体积阈值与保底码率',
    icon: 'compress'
  },
  {
    key: 'lanShare',
    title: '局域网服务',
    category: '网络共享',
    description: '局域网共享服务开关、端口号、访问鉴权密码与编辑权限',
    icon: 'external-link'
  },
  {
    key: 'externalSites',
    title: '网页资源站点',
    category: '资源库',
    description: '快捷访问与收藏的外部网页站点列表',
    icon: 'globe'
  },
  {
    key: 'localResources',
    title: '本地目录挂载',
    category: '资源库',
    description: '本地挂载的音视频与媒体资源文件夹',
    icon: 'folder'
  },
  {
    key: 'cmsResources',
    title: 'CMS 影视资源站',
    category: '资源库',
    description: '配置的苹果CMS / JSON 视频采集资源站接口',
    icon: 'play'
  },
  {
    key: 'customParseRules',
    title: '嗅探解析规则',
    category: '解析规则',
    description: '各站点域名绑定的高级嗅探提取规则与下载动作',
    icon: 'magic'
  },
  {
    key: 'customScripts',
    title: '注入脚本与样式',
    category: '增强定制',
    description: '网页注入运行的自定义 JS 脚本、全局 CSS 样式与瀑布流规则',
    icon: 'js'
  },
  {
    key: 'adBlockSources',
    title: '广告拦截规则源',
    category: '安全防护',
    description: '自定义订阅或内置启用的广告过滤拦截规则源',
    icon: 'shield'
  }
];
