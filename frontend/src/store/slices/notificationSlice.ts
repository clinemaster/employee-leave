import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { RootState } from "@/store";

interface NotificationUIState {
  unreadCount: number;
  panelOpen: boolean;
}

const initialState: NotificationUIState = {
  unreadCount: 0,
  panelOpen: false,
};

const notificationSlice = createSlice({
  name: "notifications",
  initialState,
  reducers: {
    setUnreadCount: (state, action: PayloadAction<number>) => {
      state.unreadCount = action.payload;
    },
    decrementUnread: (state) => {
      state.unreadCount = Math.max(0, state.unreadCount - 1);
    },
    togglePanel: (state) => {
      state.panelOpen = !state.panelOpen;
    },
    setPanelOpen: (state, action: PayloadAction<boolean>) => {
      state.panelOpen = action.payload;
    },
  },
});

export const { setUnreadCount, decrementUnread, togglePanel, setPanelOpen } = notificationSlice.actions;
export default notificationSlice.reducer;

export const selectUnreadNotificationCount = (state: RootState): number => state.notifications.unreadCount;
export const selectNotificationPanelOpen = (state: RootState): boolean => state.notifications.panelOpen;
