import { createContext, useContext } from "react";

export const ToastContext = createContext({ success: () => {}, error: () => {}, info: () => {} });

/** toast.success("..."), toast.error(errorOrMessage), toast.info("...") */
export function useToast() {
  return useContext(ToastContext);
}
