import { ref } from 'vue';

const openedResources = ref<Array<{id: string, url: string}>>([]);

export const useOpenedResources = () => {
  const openResource = (id: string, url: string) => {
    const existing = openedResources.value.find(r => r.id === id);
    if (!existing) {
      openedResources.value.push({ id, url });
    } else {
      existing.url = url;
    }
  };

  const updateResourceUrl = (id: string, newUrl: string) => {
    const existing = openedResources.value.find(r => r.id === id);
    if (existing) {
      existing.url = newUrl;
    }
  };

  const closeResource = (id: string) => {
    const index = openedResources.value.findIndex(r => r.id === id);
    if (index !== -1) {
      openedResources.value.splice(index, 1);
    }
  };

  return { openedResources, openResource, updateResourceUrl, closeResource };
};
