import notificationReducer, {
  setUnreadCount,
  decrementUnread,
  togglePanel,
  setPanelOpen,
  selectUnreadNotificationCount,
  selectNotificationPanelOpen,
} from "./notificationSlice";
import type { RootState } from "@/store";

describe("notificationSlice", () => {
  it("returns the initial state", () => {
    const state = notificationReducer(undefined, { type: "@@INIT" });
    expect(state).toEqual({ unreadCount: 0, panelOpen: false });
  });

  it("setUnreadCount sets an explicit count", () => {
    const state = notificationReducer(undefined, setUnreadCount(5));
    expect(state.unreadCount).toBe(5);
  });

  it("decrementUnread decreases the count by one", () => {
    const start = notificationReducer(undefined, setUnreadCount(3));
    const state = notificationReducer(start, decrementUnread());
    expect(state.unreadCount).toBe(2);
  });

  it("decrementUnread never goes below zero", () => {
    const start = notificationReducer(undefined, setUnreadCount(0));
    const state = notificationReducer(start, decrementUnread());
    expect(state.unreadCount).toBe(0);
  });

  it("togglePanel flips panelOpen, setPanelOpen sets it explicitly", () => {
    let state = notificationReducer(undefined, togglePanel());
    expect(state.panelOpen).toBe(true);
    state = notificationReducer(state, togglePanel());
    expect(state.panelOpen).toBe(false);
    state = notificationReducer(state, setPanelOpen(true));
    expect(state.panelOpen).toBe(true);
  });

  describe("selectors", () => {
    const rootState = { notifications: { unreadCount: 7, panelOpen: true } } as unknown as RootState;

    it("read straight through the notifications slice", () => {
      expect(selectUnreadNotificationCount(rootState)).toBe(7);
      expect(selectNotificationPanelOpen(rootState)).toBe(true);
    });
  });
});
