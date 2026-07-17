import { ref } from 'vue'
import { db, type DownloadTask } from '../db'

const tasks = ref<DownloadTask[]>([])
const isInitialized = ref(false)
let isListenersInitialized = false;

export const useDownloads = () => {
  const loadTasks = async () => {
    // TODO: Load tasks
    isInitialized.value = true
  }

  const initListeners = () => {
    // TODO: Init IPC listeners
  }

  const addDownload = async (url: string, name: string, savePath: string): Promise<boolean> => {
    // TODO: Implement add download
    return true
  }

  const pauseTask = async (id: string) => {
    // TODO: Implement pause
  }

  const resumeTask = async (id: string) => {
    // TODO: Implement resume
  }

  const deleteTask = async (id: string, deleteFile = false) => {
    // TODO: Implement delete
  }

  return {
    tasks,
    isInitialized,
    loadTasks,
    initListeners,
    addDownload,
    pauseTask,
    resumeTask,
    deleteTask
  }
}
