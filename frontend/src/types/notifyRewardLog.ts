/** 链上 `RewardNotified` 一行（与 `indexNotifyRewardLogs` 返回一致） */
export type IndexedNotifyReward = {
  pool: 0 | 1;
  amount: string;
  duration: string;
  rate: string;
  blockNumber: string;
  /** Unix 秒（服务端 enrich 后提供） */
  blockTimestamp?: string;
  transactionHash: `0x${string}`;
  logIndex: number;
};
