/** 支持的语言；与 `messages/zh.ts`、`messages/en.ts` 一一对应 */
export type Locale = "zh" | "en";

/**
 * 嵌套消息树：叶子为 string，中间节点为对象。
 * 运行时通过点分键访问，如 `console.poolA.stakeTitle`。
 */
export type MessageTree = {
  readonly [key: string]: string | MessageTree;
};
