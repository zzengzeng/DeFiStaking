/** 链上 `RewardNotified` 一行（与 `indexNotifyRewardLogs` 返回一致） */
export type IndexedNotifyReward = {
  pool: 0 | 1;
  amount: string;
  duration: string;
  rate: string;
  blockNumber: string;
  transactionHash: `0x${string}`;
  logIndex: number;
};
