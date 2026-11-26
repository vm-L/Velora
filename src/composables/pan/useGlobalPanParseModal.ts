import { ref } from 'vue';

const panParseVisible = ref(false);
const panParseInitialUrl = ref('');

/**
 * 全局网盘分享解析弹窗控制器（供首页与浏览器工作区共用同一弹窗实例）
 */
export function useGlobalPanParseModal() {
  const openPanParseModal = (rawTextOrUrl = '', password = '') => {
    const trimmedUrl = (rawTextOrUrl || '').trim();
    const trimmedPwd = (password || '').trim();
    if (trimmedUrl && trimmedPwd && !/(?:提取码|密码|访问码|pwd=|code=)/i.test(trimmedUrl)) {
      panParseInitialUrl.value = `${trimmedUrl} 提取码: ${trimmedPwd}`;
    } else {
      panParseInitialUrl.value = trimmedUrl;
    }
    panParseVisible.value = true;
  };

  const closePanParseModal = () => {
    panParseVisible.value = false;
    panParseInitialUrl.value = '';
  };

  return {
    panParseVisible,
    panParseInitialUrl,
    openPanParseModal,
    closePanParseModal
  };
}
