export interface CMSCategory {
  id: number
  name: string
  parentId: number
}

export interface CMSVideo {
  id: number
  name: string
  categoryId: number
  categoryName: string
  remarks: string
  time: string
  pic: string
  score: string
}

export interface CMSPlayEpisode {
  name: string
  url: string
}

export interface CMSPlaySource {
  from: string
  episodes: CMSPlayEpisode[]
}

export interface CMSVideoDetail extends CMSVideo {
  pic: string
  actor: string
  director: string
  area: string
  lang: string
  year: string
  content: string
  playSources: CMSPlaySource[]
}

export function decodeHtmlEntities(str: string): string {
  if (!str) return ''
  return str
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&apos;/g, "'")
}

/**
 * 解析 macCMS 视频播放集数串
 * 格式例如: 第01集$https://xxx.m3u8#第02集$https://yyy.m3u8$$$第01集$网页播放链接
 */
export function parsePlayUrl(vodPlayFrom: string, vodPlayUrl: string): CMSPlaySource[] {
  if (!vodPlayFrom || !vodPlayUrl) return []

  const sources = vodPlayFrom.split('$$$')
  const urlsBySource = vodPlayUrl.split('$$$')
  const result: CMSPlaySource[] = []

  for (let i = 0; i < sources.length; i++) {
    const from = sources[i].trim()
    if (!from) continue

    const episodesStr = urlsBySource[i] || ''
    const episodesList = episodesStr.split('#')
    const episodes: CMSPlayEpisode[] = []

    for (let j = 0; j < episodesList.length; j++) {
      const epStr = episodesList[j].trim()
      if (!epStr) continue

      const parts = epStr.split('$')
      if (parts.length >= 2) {
        const name = decodeHtmlEntities(parts[0].trim())
        const url = parts.slice(1).join('$').trim() // 考虑 url 包含 $ 的特例
        episodes.push({ name, url })
      } else if (parts.length === 1) {
        const url = parts[0].trim()
        episodes.push({ name: `第${j + 1}集`, url })
      }
    }

    if (episodes.length > 0) {
      result.push({ from, episodes })
    }
  }

  return result
}



function isValidUrl(url: string): boolean {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))
}

/**
 * 组装基础请求 URL 并附加参数
 */
function buildUrl(baseUrl: string, params: Record<string, any>): string {
  if (!isValidUrl(baseUrl)) {
    throw new Error(`[CMS] Invalid or empty API URL: "${baseUrl}"`)
  }
  let url = baseUrl
  const separator = url.includes('?') ? '&' : '?'
  
  const queryParts: string[] = []
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null && val !== '') {
      queryParts.push(`${key}=${encodeURIComponent(String(val))}`)
    }
  }
  
  return queryParts.length > 0 ? `${url}${separator}${queryParts.join('&')}` : url
}

export const cmsService = {
  /**
   * 获取资源站的分类列表
   */
  async getCategories(apiUrl: string): Promise<CMSCategory[]> {
    if (!isValidUrl(apiUrl)) {
      console.warn('[CMS] getCategories skipped: invalid apiUrl', apiUrl)
      return []
    }
    if (!window.electronAPI || !window.electronAPI.fetchUrl) {
      throw new Error('Electron API [fetchUrl] is not available')
    }
    const data = await window.electronAPI.fetchUrl(apiUrl)
    if (!data || !Array.isArray(data.class)) return []
    const list: CMSCategory[] = data.class.map((item: any) => ({
      id: Number(item.type_id),
      name: decodeHtmlEntities(String(item.type_name)),
      parentId: Number(item.type_pid || 0)
    }))
    return list
  },

  /**
   * 分页、分类、关键词获取视频列表
   */
  async getVideoList(
    apiUrl: string,
    params: { page?: number; categoryId?: number; keyword?: string }
  ): Promise<{ list: CMSVideo[]; total: number; pageCount: number; page: number }> {
    if (!isValidUrl(apiUrl)) {
      console.warn('[CMS] getVideoList skipped: invalid apiUrl', apiUrl)
      return { list: [], total: 0, pageCount: 0, page: params.page || 1 }
    }
    if (!window.electronAPI || !window.electronAPI.fetchUrl) {
      throw new Error('Electron API [fetchUrl] is not available')
    }

    const queryParams: Record<string, any> = {
      ac: 'detail', // 直接请求详细列表，以获得海报图和评分
      pg: params.page || 1
    }
    if (params.categoryId) {
      queryParams.t = params.categoryId
    }
    if (params.keyword) {
      queryParams.wd = params.keyword
    }

    const requestUrl = buildUrl(apiUrl, queryParams)
    const data = await window.electronAPI.fetchUrl(requestUrl)

    if (!data || !Array.isArray(data.list)) {
      return { list: [], total: 0, pageCount: 0, page: params.page || 1 }
    }

    const list: CMSVideo[] = data.list.map((item: any) => ({
      id: Number(item.vod_id),
      name: decodeHtmlEntities(String(item.vod_name)),
      categoryId: Number(item.type_id),
      categoryName: decodeHtmlEntities(String(item.type_name)),
      remarks: decodeHtmlEntities(String(item.vod_remarks || '')),
      time: String(item.vod_time || ''),
      pic: String(item.vod_pic || ''),
      score: String(item.vod_score || '0.0')
    }))

    return {
      list,
      total: Number(data.total || 0),
      pageCount: Number(data.pagecount || 0),
      page: Number(data.page || params.page || 1)
    }
  },

  /**
   * 获取视频的播放详情
   */
  async getVideoDetail(apiUrl: string, id: number): Promise<CMSVideoDetail | null> {
    if (!isValidUrl(apiUrl)) {
      console.warn('[CMS] getVideoDetail skipped: invalid apiUrl', apiUrl)
      return null
    }
    if (!window.electronAPI || !window.electronAPI.fetchUrl) {
      throw new Error('Electron API [fetchUrl] is not available')
    }

    const requestUrl = buildUrl(apiUrl, { ac: 'detail', ids: id })
    const data = await window.electronAPI.fetchUrl(requestUrl)

    if (!data || !Array.isArray(data.list) || data.list.length === 0) {
      return null
    }

    const item = data.list[0]
    const playSources = parsePlayUrl(item.vod_play_from || '', item.vod_play_url || '')

    return {
      id: Number(item.vod_id),
      name: decodeHtmlEntities(String(item.vod_name)),
      categoryId: Number(item.type_id),
      categoryName: decodeHtmlEntities(String(item.type_name)),
      remarks: decodeHtmlEntities(String(item.vod_remarks || '')),
      time: String(item.vod_time || ''),
      pic: String(item.vod_pic || ''),
      score: String(item.vod_score || '0.0'),
      actor: decodeHtmlEntities(String(item.vod_actor || '')),
      director: decodeHtmlEntities(String(item.vod_director || '')),
      area: decodeHtmlEntities(String(item.vod_area || '')),
      lang: decodeHtmlEntities(String(item.vod_lang || '')),
      year: String(item.vod_year || ''),
      content: decodeHtmlEntities(String(item.vod_content || '').replace(/<\/?[^>]+(>|$)/g, '')),
      playSources
    }
  }
}
