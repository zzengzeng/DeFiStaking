import { create } from "zustand";

export type ProtocolStatus = "NORMAL" | "PAUSED" | "EMERGENCY" | "SHUTDOWN";

type UiState = {
  status: ProtocolStatus;
  setStatus: (status: ProtocolStatus) => void;
  insolvencyWarningOpen: boolean;
  setInsolvencyWarningOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  status: "NORMAL",
  setStatus: (status) => set({ status }),
  insolvencyWarningOpen: false,
  setInsolvencyWarningOpen: (insolvencyWarningOpen) => set({ insolvencyWarningOpen }),
}));
