import { ref } from 'vue'
import { cmsService, type CMSCategory, type CMSVideo, type CMSVideoDetail } from '../services/cmsService'

export const useCMS = (apiUrl: string) => {
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  const categories = ref<CMSCategory[]>([])
  const videos = ref<CMSVideo[]>([])
  
  const total = ref(0)
  const page = ref(1)
  const pageCount = ref(0)
  
  const keyword = ref('')
  const activeCategoryId = ref<number | null>(null)
  
  const selectedVideo = ref<CMSVideoDetail | null>(null)
  const detailLoading = ref(false)

  const loadCategories = async () => {
    try {
      loading.value = true
      error.value = null
      const data = await cmsService.getCategories(apiUrl)
      categories.value = data
    } catch (e: any) {
      error.value = e.message || '加载分类失败'
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  const loadVideos = async (pageNo: number = 1) => {
    try {
      loading.value = true
      error.value = null
      page.value = pageNo
      const data = await cmsService.getVideoList(apiUrl, {
        page: pageNo,
        categoryId: activeCategoryId.value || undefined,
        keyword: keyword.value || undefined
      })
      if (pageNo === 1) {
        videos.value = data.list
      } else {
        videos.value = [...videos.value, ...data.list]
      }
      total.value = data.total
      pageCount.value = data.pageCount
      page.value = data.page
    } catch (e: any) {
      error.value = e.message || '加载视频列表失败'
      console.error(e)
    } finally {
      loading.value = false
    }
  }

  const search = async (word: string) => {
    keyword.value = word
    activeCategoryId.value = null // 搜索时清除分类筛选
    await loadVideos(1)
  }

  const selectCategory = async (categoryId: number | null) => {
    activeCategoryId.value = categoryId
    keyword.value = '' // 切换分类时清除搜索词
    await loadVideos(1)
  }

  const loadVideoDetail = async (id: number) => {
    try {
      detailLoading.value = true
      error.value = null
      const data = await cmsService.getVideoDetail(apiUrl, id)
      selectedVideo.value = data
      return data
    } catch (e: any) {
      error.value = e.message || '获取视频详情失败'
      console.error(e)
      return null
    } finally {
      detailLoading.value = false
    }
  }

  return {
    loading,
    error,
    categories,
    videos,
    total,
    page,
    pageCount,
    keyword,
    activeCategoryId,
    selectedVideo,
    detailLoading,
    loadCategories,
    loadVideos,
    search,
    selectCategory,
    loadVideoDetail
  }
}
