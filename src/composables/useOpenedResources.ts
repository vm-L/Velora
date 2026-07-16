import { ref } from 'vue';

const openedResources = ref<Array<{id: string, url: string}>>([]);

export const useOpenedResources = () => {
  const openResource = (id: string, url: string) => {
    if (!openedResources.value.find(r => r.id === id)) {
      openedResources.value.push({ id, url });
    }
  };
  return { openedResources, openResource };
};
