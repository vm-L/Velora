import { ref } from 'vue'

export interface OpenedCMSItem {
  id: string
  url: string
  lastRoute?: string
}

const openedCMS = ref<OpenedCMSItem[]>([])

export const useOpenedCMS = () => {
  const openCMS = (id: string, url: string, initialRoute?: string) => {
    const existing = openedCMS.value.find(c => c.id === id)
    if (!existing) {
      openedCMS.value.push({
        id,
        url,
        lastRoute: initialRoute || `/resource/cms/${id}`
      })
    }
  }

  const updateLastRoute = (id: string, fullPath: string) => {
    const item = openedCMS.value.find(c => c.id === id)
    if (item) {
      item.lastRoute = fullPath
    }
  }

  const getLastRoute = (id: string): string => {
    const item = openedCMS.value.find(c => c.id === id)
    return item?.lastRoute || `/resource/cms/${id}`
  }

  const removeCMS = (id: string) => {
    openedCMS.value = openedCMS.value.filter(c => c.id !== id)
  }

  return { openedCMS, openCMS, updateLastRoute, getLastRoute, removeCMS }
}
