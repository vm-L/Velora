import { ref } from 'vue';

const isElementPickingActive = ref(false);

export const useElementPickerSession = () => {
  const startElementPickingSession = () => {
    isElementPickingActive.value = true;
  };

  const endElementPickingSession = () => {
    isElementPickingActive.value = false;
  };

  return {
    isElementPickingActive,
    startElementPickingSession,
    endElementPickingSession
  };
};
