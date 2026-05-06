-include .env

.PHONY: all test clean remove install update build snapshot format anvil deploy help

DEFAULT_ANVIL_KEY := 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80

# 本地 Anvil 默认；Sepolia：`make deploy ARGS="--network sepolia"`（需 .env 中 RPC / 私钥 / 浏览器 API）
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
ifeq ($(strip $(PRIVATE_KEY)),)
$(error Sepolia 部署需要 .env 中的 PRIVATE_KEY)
endif
	NETWORK_ARGS := --rpc-url $(SEPOLIA_RPC_URL) --private-key $(PRIVATE_KEY) --broadcast --verify --etherscan-api-key $(ETHERSCAN_API_KEY) -vvvv
endif

# 部署 DualPoolStaking 全栈（MockERC20 A/B、核心、模块、Admin、Timelock）
deploy:
	@forge script script/DualPoolStaking.s.sol:DeployDualPoolStaking $(NETWORK_ARGS)

help:
	@echo "Targets: all clean remove install update build test snapshot format anvil deploy help"
	@echo "  make deploy              # 本地 Anvil（先另开终端: make anvil）"
	@echo "  make deploy NETWORK=sepolia   # Sepolia（推荐；.env: SEPOLIA_RPC_URL PRIVATE_KEY ETHERSCAN_API_KEY）"
	@echo "  make deploy ARGS=\"--network sepolia\"   # 同上（ARGS 必须整段加引号，否则 sepolia 会被当成另一个目标）"
