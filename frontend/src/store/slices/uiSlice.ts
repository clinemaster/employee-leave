import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store";

interface UIState {
  sidebarOpen: boolean;
  activeModal: string | null;
  filters: Record<string, string | undefined>;
}

const initialState: UIState = {
  sidebarOpen: true,
  activeModal: null,
  filters: {},
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    openModal: (state, action: PayloadAction<string>) => {
      state.activeModal = action.payload;
    },
    closeModal: (state) => {
      state.activeModal = null;
    },
    setFilter: (state, action: PayloadAction<{ key: string; value: string | undefined }>) => {
      state.filters[action.payload.key] = action.payload.value;
    },
    clearFilters: (state) => {
      state.filters = {};
    },
  },
});

export const { toggleSidebar, setSidebarOpen, openModal, closeModal, setFilter, clearFilters } =
  uiSlice.actions;
export default uiSlice.reducer;

export const selectSidebarState = (state: RootState): boolean => state.ui.sidebarOpen;
export const selectActiveModal = (state: RootState): string | null => state.ui.activeModal;
export const selectFilters = (state: RootState): Record<string, string | undefined> => state.ui.filters;
