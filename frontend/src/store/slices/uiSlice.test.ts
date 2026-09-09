import uiReducer, {
  toggleSidebar,
  setSidebarOpen,
  openModal,
  closeModal,
  setFilter,
  clearFilters,
  selectSidebarState,
  selectActiveModal,
  selectFilters,
} from "./uiSlice";
import type { RootState } from "@/store";

describe("uiSlice", () => {
  it("returns the initial state", () => {
    const state = uiReducer(undefined, { type: "@@INIT" });
    expect(state).toEqual({ sidebarOpen: true, activeModal: null, filters: {} });
  });

  it("toggleSidebar flips the boolean each time", () => {
    let state = uiReducer(undefined, toggleSidebar());
    expect(state.sidebarOpen).toBe(false);
    state = uiReducer(state, toggleSidebar());
    expect(state.sidebarOpen).toBe(true);
  });

  it("setSidebarOpen sets an explicit value", () => {
    const state = uiReducer(undefined, setSidebarOpen(false));
    expect(state.sidebarOpen).toBe(false);
  });

  it("openModal sets the active modal id, closeModal clears it", () => {
    let state = uiReducer(undefined, openModal("confirm-delete"));
    expect(state.activeModal).toBe("confirm-delete");
    state = uiReducer(state, closeModal());
    expect(state.activeModal).toBeNull();
  });

  it("setFilter adds/overwrites a key and clearFilters resets the map", () => {
    let state = uiReducer(undefined, setFilter({ key: "status", value: "PENDING" }));
    expect(state.filters).toEqual({ status: "PENDING" });
    state = uiReducer(state, setFilter({ key: "status", value: "APPROVED" }));
    expect(state.filters).toEqual({ status: "APPROVED" });
    state = uiReducer(state, setFilter({ key: "leave_type", value: undefined }));
    expect(state.filters).toEqual({ status: "APPROVED", leave_type: undefined });
    state = uiReducer(state, clearFilters());
    expect(state.filters).toEqual({});
  });

  describe("selectors", () => {
    const rootState = {
      ui: { sidebarOpen: false, activeModal: "m1", filters: { status: "DRAFT" } },
    } as unknown as RootState;

    it("read straight through the ui slice", () => {
      expect(selectSidebarState(rootState)).toBe(false);
      expect(selectActiveModal(rootState)).toBe("m1");
      expect(selectFilters(rootState)).toEqual({ status: "DRAFT" });
    });
  });
});
