/** 产品页外链与文档入口（页脚、说明页复用） */
export const SITE_LINKS = {
  github: "https://github.com/zzengzeng/DeFiStaking",
  prd: "https://github.com/zzengzeng/DeFiStaking/blob/main/PRD.md",
  security: "https://github.com/zzengzeng/DeFiStaking/blob/main/docs/security/audit-and-bounty.md",
  contributing: "https://github.com/zzengzeng/DeFiStaking/blob/main/CONTRIBUTING.md",
} as const;

function readSocialUrl(raw: string | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).href;
  } catch {
    return null;
  }
}

export type SocialId = "twitter" | "discord" | "telegram";

export type SocialLink = {
  id: SocialId;
  href: string;
  labelKey: `social.${SocialId}`;
};

/** 须静态引用 NEXT_PUBLIC_*，否则客户端 bundle 无法内联 env（见 Next.js public env 规则） */
const SOCIAL_SOURCES: { id: SocialId; raw: string | undefined }[] = [
  { id: "twitter", raw: process.env.NEXT_PUBLIC_SOCIAL_TWITTER },
  { id: "discord", raw: process.env.NEXT_PUBLIC_SOCIAL_DISCORD },
  { id: "telegram", raw: process.env.NEXT_PUBLIC_SOCIAL_TELEGRAM },
];

/** 已配置的社交链接（未配置 env 时不展示） */
export function getConfiguredSocialLinks(): SocialLink[] {
  return SOCIAL_SOURCES.map(({ id, raw }) => {
    const href = readSocialUrl(raw);
    if (!href) return null;
    return { id, href, labelKey: `social.${id}` as const };
  }).filter((x): x is SocialLink => x !== null);
}

export const hasSocialLinks = getConfiguredSocialLinks().length > 0;
