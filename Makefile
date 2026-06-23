-include .env

.PHONY: all test clean remove install update build snapshot format static-analysis anvil deploy deploy-production deploy-reuse-tokens deploy-reuse-tokens-sync deploy-separated-roles verify-last-deploy production-readiness testnet-demo-env frontend-production-env frontend-contract-sync post-deploy-verify preprod-rehearsal init-governance-wallets validate-governance-env sync-frontend-addresses mint-tokenb-to-operator help

DEFAULT_ANVIL_KEY := 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
SLITHER_ACCEPTED_EXCLUDES := arbitrary-send-erc20,uninitialized-state,unused-return,timestamp,assembly,low-level-calls,naming-convention,constable-states,immutable-states
# Sepolia 已部署 MockERC20（与 frontend/.env.local 一致）；可用 TOKEN_A=/TOKEN_B= 覆盖
SEPOLIA_TOKEN_A ?= 0xba2f8128e5f0a47f820010eedd3f96e0b6e0e67b
SEPOLIA_TOKEN_B ?= 0x2a082fec5f9b75c27f85617d90a7d3ace62743c4

# 本地 Anvil 默认；Sepolia：`make deploy NETWORK=sepolia`（需 .env 中 RPC / signer / 浏览器 API）
all: clean install update build

# Clean artifacts
clean :; forge clean

# 删除依赖目录（慎用；之后需 `make install`）
remove :; rm -rf lib

# 与 remappings 对齐：forge-std + OpenZeppelin Contracts
install :; forge install foundry-rs/forge-std --no-commit && forge install openzeppelin/openzeppelin-contracts@v5.6.1 --no-commit

update :; forge update

build :; forge build

test :; forge test

snapshot :; forge snapshot

format :; forge fmt

static-analysis :; slither . --filter-paths "lib|out|cache|docs|frontend" --exclude $(SLITHER_ACCEPTED_EXCLUDES)

anvil :; anvil -m 'test test test test test test test test test test test junk' --steps-tracing --block-time 1

# Sepolia：推荐 `make deploy NETWORK=sepolia`（避免未加引号的 ARGS 被 Make 拆成多个目标，或 `--network  sepolia` 双空格导致匹配失败）
SEPOLIA_ON :=
ifeq ($(strip $(NETWORK)),sepolia)
	SEPOLIA_ON := 1
endif
ifneq ($(and $(findstring --network,$(ARGS)),$(findstring sepolia,$(ARGS))),)
	SEPOLIA_ON := 1
endif

NETWORK_ARGS := --rpc-url http://localhost:8545 --private-key $(DEFAULT_ANVIL_KEY) --broadcast

ifeq ($(SEPOLIA_ON),1)
ifeq ($(strip $(SEPOLIA_RPC_URL)),)
$(error Sepolia 部署需要 .env 中的 SEPOLIA_RPC_URL。推荐: make deploy NETWORK=sepolia)
endif
ifneq ($(strip $(DEPLOYER_ACCOUNT)),)
	NETWORK_ARGS := --rpc-url $(SEPOLIA_RPC_URL) --account $(DEPLOYER_ACCOUNT) --broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv
else
ifeq ($(strip $(PRIVATE_KEY)),)
$(error Sepolia 部署需要 DEPLOYER_ACCOUNT（推荐，Foundry keystore）或 PRIVATE_KEY（仅限非生产测试）)
endif
	NETWORK_ARGS := --rpc-url $(SEPOLIA_RPC_URL) --private-key $(PRIVATE_KEY) --broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv
endif
endif

# 部署 DualPoolStaking 全栈（MockERC20 A/B、核心、模块、Admin、Timelock）
deploy:
	@forge script script/DualPoolStaking.s.sol:DeployDualPoolStaking $(NETWORK_ARGS)

# 生产部署闸门：先检查安全文档、治理 env、占位符、角色隔离，再广播。
production-readiness:
	@bash script/check-production-readiness.sh

frontend-production-env:
	@bash script/check-frontend-production-env.sh

testnet-demo-env:
	@bash script/check-testnet-demo-env.sh

frontend-contract-sync:
	@bash script/check-frontend-contract-sync.sh

post-deploy-verify:
	@bash script/post-deploy-verify.sh

preprod-rehearsal:
	@bash script/preprod-rehearsal.sh

# 分角色治理彩排：生成 6 钱包 → 校验隔离 → 复用 Token 部署 Staking 栈
init-governance-wallets:
	@bash script/init-separated-governance-env.sh

validate-governance-env:
	@bash script/validate-governance-separation.sh

sync-frontend-addresses:
	@bash script/sync-frontend-from-broadcast.sh

# 部署者将 TokenB mint 给 Operator（新版 MockERC20 仅 owner 可 mint）
MINT_TOKENB_AMOUNT ?= 80000
mint-tokenb-to-operator:
	@if [ -z "$(strip $(OPERATOR))" ]; then echo "用法: make mint-tokenb-to-operator OPERATOR=0x… [AMOUNT=80000]"; exit 1; fi
	@if [ -z "$(strip $(SEPOLIA_RPC_URL))" ]; then echo "需要 .env 中的 SEPOLIA_RPC_URL"; exit 1; fi
	@TOKEN_B_ADDR=$${TOKEN_B:-$(SEPOLIA_TOKEN_B)}; \
	if [ -n "$(strip $(DEPLOYER_ACCOUNT))" ]; then \
	  cast send "$$TOKEN_B_ADDR" "mint(address,uint256)" "$(OPERATOR)" "$$(cast to-wei $(MINT_TOKENB_AMOUNT))" \
	    --rpc-url "$(SEPOLIA_RPC_URL)" --account "$(DEPLOYER_ACCOUNT)"; \
	elif [ -n "$(strip $(PRIVATE_KEY))" ]; then \
	  cast send "$$TOKEN_B_ADDR" "mint(address,uint256)" "$(OPERATOR)" "$$(cast to-wei $(MINT_TOKENB_AMOUNT))" \
	    --rpc-url "$(SEPOLIA_RPC_URL)" --private-key "$(PRIVATE_KEY)"; \
	else \
	  echo "需要 DEPLOYER_ACCOUNT 或 PRIVATE_KEY（须为 TokenB owner）"; exit 1; \
	fi

deploy-separated-roles: validate-governance-env
	@$(MAKE) deploy-reuse-tokens NETWORK=sepolia
	@echo ""
	@echo "部署完成。请执行: make sync-frontend-addresses"

deploy-production: export PRODUCTION=true
deploy-production: production-readiness
	@if [ "$(SEPOLIA_ON)" != "1" ]; then echo "生产部署必须显式指定 NETWORK=sepolia"; exit 1; fi
	@if [ -z "$(strip $(DEPLOYER_ACCOUNT))" ]; then echo "生产部署必须设置 DEPLOYER_ACCOUNT（Foundry keystore account）"; exit 1; fi
	@if [ -n "$(strip $(PRIVATE_KEY))" ]; then echo "生产部署禁止使用 PRIVATE_KEY；请从环境中移除并使用 DEPLOYER_ACCOUNT"; exit 1; fi
	@forge script script/DualPoolStaking.s.sol:DeployDualPoolStaking --rpc-url $(SEPOLIA_RPC_URL) --account $(DEPLOYER_ACCOUNT) --broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv

# 强制 new MockERC20（ZZTokenA/ZZTKA、ZZTokenB/ZZTKB），忽略 .env 中的 TOKEN_A / TOKEN_B
deploy-fresh-tokens:
	@env -u TOKEN_A -u TOKEN_B forge script script/DualPoolStaking.s.sol:DeployDualPoolStaking $(NETWORK_ARGS)

# 复用链上已有 TokenA/TokenB，仅部署 Staking、模块、Admin、Timelock
deploy-reuse-tokens:
	@TOKEN_A=$(if $(strip $(TOKEN_A)),$(TOKEN_A),$(SEPOLIA_TOKEN_A)) TOKEN_B=$(if $(strip $(TOKEN_B)),$(TOKEN_B),$(SEPOLIA_TOKEN_B)) forge script script/DualPoolStaking.s.sol:DeployDualPoolStaking $(NETWORK_ARGS)

# 部署后自动同步前端地址并校验（Sepolia 复用 Token）
# 若 .env 同时有 DEPLOYER_ACCOUNT 与 PRIVATE_KEY，用 env -u 避免 keystore 交互卡住
deploy-reuse-tokens-sync:
ifneq ($(strip $(PRIVATE_KEY)),)
	@env -u DEPLOYER_ACCOUNT $(MAKE) deploy-reuse-tokens NETWORK=$(if $(strip $(NETWORK)),$(NETWORK),sepolia)
else
	@$(MAKE) deploy-reuse-tokens NETWORK=$(if $(strip $(NETWORK)),$(NETWORK),sepolia)
endif
	@$(MAKE) sync-frontend-addresses
	@$(MAKE) frontend-contract-sync
	@$(MAKE) post-deploy-verify

# 补验最近一次 Sepolia 部署（--resume，不重新广播）；用于 verify 队列超时等场景
verify-last-deploy:
	@if [ "$(SEPOLIA_ON)" != "1" ]; then echo "补验需要 NETWORK=sepolia（读取 broadcast/DualPoolStaking.s.sol/11155111/run-latest.json）"; exit 1; fi
	@TOKEN_A=$(if $(strip $(TOKEN_A)),$(TOKEN_A),$(SEPOLIA_TOKEN_A)) TOKEN_B=$(if $(strip $(TOKEN_B)),$(TOKEN_B),$(SEPOLIA_TOKEN_B)) forge script script/DualPoolStaking.s.sol:DeployDualPoolStaking $(NETWORK_ARGS) --resume

help:
	@echo "Targets: all clean remove install update build test snapshot format static-analysis anvil deploy deploy-production deploy-reuse-tokens deploy-separated-roles verify-last-deploy production-readiness init-governance-wallets validate-governance-env sync-frontend-addresses help"
	@echo "  make deploy              # 本地 Anvil（先另开终端: make anvil）"
	@echo "  make static-analysis     # Slither（排除已登记 accepted findings 的 detector）"
	@echo "  make deploy NETWORK=sepolia   # Sepolia（推荐；.env: SEPOLIA_RPC_URL DEPLOYER_ACCOUNT ETHERSCAN_API_KEY）"
	@echo "  make production-readiness      # 主网上线前安全闸门"
	@echo "  make testnet-demo-env          # Sepolia 公开演示环境检查（宽松）"
	@echo "  make frontend-production-env   # 前端生产环境变量闸门"
	@echo "  make frontend-contract-sync    # broadcast / 前端 env / 前端 ABI 漂移检查"
	@echo "  make post-deploy-verify        # 部署后链上角色、模块、Timelock 校验"
	@echo "  make preprod-rehearsal         # 测试 + 静态分析 + 生产闸门 + 前端构建"
	@echo "  make deploy-production NETWORK=sepolia   # 生产保护部署（需治理 env；自动 PRODUCTION=true）"
	@echo "  make init-governance-wallets             # 生成 6 个分离角色钱包并写入 .env"
	@echo "  make validate-governance-env             # 校验治理地址互不相同"
	@echo "  make deploy-separated-roles NETWORK=sepolia  # 分角色彩排部署（复用 Token）"
	@echo "  make sync-frontend-addresses             # broadcast → frontend/.env.local"
	@echo "  make mint-tokenb-to-operator OPERATOR=0x…  # 部署者 mint TokenB 给 Operator"
	@echo "  make deploy-fresh-tokens NETWORK=sepolia   # 新部署 ZZTKA/ZZTKB（不读 TOKEN_A/B）"
	@echo "  make deploy-reuse-tokens NETWORK=sepolia   # 复用 Sepolia 已有 TOKEN_A/B，只部署 Staking 栈"
	@echo "  make deploy-reuse-tokens-sync NETWORK=sepolia  # 部署 + sync-frontend-addresses + 校验"
	@echo "  make verify-last-deploy NETWORK=sepolia   # 补验上次部署（不重新广播；verify 超时时用）"
	@echo "  make deploy ARGS=\"--network sepolia\"   # 同上（ARGS 必须整段加引号，否则 sepolia 会被当成另一个目标）"
