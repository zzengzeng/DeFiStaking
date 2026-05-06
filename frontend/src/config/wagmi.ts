import { createConfig } from "wagmi";
import { injected } from "wagmi/connectors";
import { http } from "viem";
import { sepolia } from "wagmi/chains";

const sepoliaRpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL_SEPOLIA ??
  "https://ethereum-sepolia-rpc.publicnode.com";

export const wagmiConfig = createConfig({
  chains: [sepolia],
  connectors: [injected()],
  transports: {
    [sepolia.id]: http(sepoliaRpcUrl),
  },
  ssr: true,
});
