import { configureStore } from "@reduxjs/toolkit";
import { baseApi } from "@/lib/api/baseApi";
import authReducer from "@/store/slices/authSlice";
import uiReducer from "@/store/slices/uiSlice";
import notificationReducer from "@/store/slices/notificationSlice";

const rootReducer = {
  auth: authReducer,
  ui: uiReducer,
  notifications: notificationReducer,
  [baseApi.reducerPath]: baseApi.reducer,
};

export const makeStore = (preloadedAuth?: ReturnType<typeof authReducer>) =>
  configureStore({
    reducer: rootReducer,
    ...(preloadedAuth ? { preloadedState: { auth: preloadedAuth } } : {}),
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(baseApi.middleware),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
