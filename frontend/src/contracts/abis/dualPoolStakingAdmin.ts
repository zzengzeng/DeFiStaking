/** DualPoolStakingAdmin 门面：与 `src/DualPoolStakingAdmin.sol` 对齐的最小子集（供 `encodeFunctionData`）。 */
export const dualPoolStakingAdminAbi = [
  {
    type: "function",
    name: "setFees",
    stateMutability: "nonpayable",
    inputs: [
      { name: "newWithdrawFeeBP", type: "uint256" },
      { name: "newMidTermFeeBP", type: "uint256" },
      { name: "newPenaltyFeeBP", type: "uint256" },
    ],
    outputs: [],
  },
  { type: "function", name: "setLockDuration", stateMutability: "nonpayable", inputs: [{ name: "newLockDuration", type: "uint256" }], outputs: [] },
  { type: "function", name: "setMinEarlyExitAmountB", stateMutability: "nonpayable", inputs: [{ name: "newMin", type: "uint256" }], outputs: [] },
  { type: "function", name: "setMaxTransferFeeBP", stateMutability: "nonpayable", inputs: [{ name: "newMaxTransferFeeBP", type: "uint256" }], outputs: [] },
  {
    type: "function",
    name: "rebalanceBudgets",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "uint8" },
      { name: "to", type: "uint8" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  { type: "function", name: "unpause", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "setUserModule", stateMutability: "nonpayable", inputs: [{ name: "newModule", type: "address" }], outputs: [] },
  { type: "function", name: "setAdminModule", stateMutability: "nonpayable", inputs: [{ name: "newModule", type: "address" }], outputs: [] },
  {
    type: "function",
    name: "setAdmin",
    stateMutability: "nonpayable",
    inputs: [
      { name: "newAdmin", type: "address" },
      { name: "enabled", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "setOperator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "newOperator", type: "address" },
      { name: "enabled", type: "bool" },
    ],
    outputs: [],
  },
] as const;
