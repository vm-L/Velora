import { ref } from 'vue';

export interface OpenedLocalItem {
  id: string;
  name: string;
  path: string;
}

const openedLocal = ref<OpenedLocalItem[]>([]);

export function useOpenedLocal() {
  const openLocal = (id: string, path: string, name: string) => {
    const existing = openedLocal.value.find(item => item.id === id);
    if (!existing) {
      openedLocal.value.push({ id, path, name });
    } else {
      existing.path = path;
      existing.name = name;
    }
  };

  const closeLocal = (id: string) => {
    const index = openedLocal.value.findIndex(item => item.id === id);
    if (index !== -1) {
      openedLocal.value.splice(index, 1);
    }
  };

  return {
    openedLocal,
    openLocal,
    closeLocal
  };
}
