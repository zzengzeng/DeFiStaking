// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MockERC20
/// @notice Minimal ERC20-style test token (18 decimals) with external `mint` for localnets and Foundry tests.
/// @dev Not intended for production; no access control on `mint`.
contract MockERC20 {
    /// @notice Human-readable token name.
    string public name;
    /// @notice Token symbol.
    string public symbol;
    /// @notice Fixed 18 decimals for compatibility with staking math.
    uint8 public constant decimals = 18;
    /// @notice Total minted supply.
    uint256 public totalSupply;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice Emitted when `value` tokens move from `from` to `to` (`from == address(0)` for mints).
    event Transfer(address indexed from, address indexed to, uint256 value);
    /// @notice Emitted when `owner` sets `spender` allowance to `value`.
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /// @notice Sets metadata; does not pre-mint supply.
    /// @param _name Token name.
    /// @param _symbol Token symbol.
    constructor(string memory _name, string memory _symbol) {
        name = _name;
        symbol = _symbol;
    }

    /// @notice Transfers `amount` from `msg.sender` to `to`.
    /// @param to Recipient.
    /// @param amount Amount in smallest units.
    /// @return ok Always true on success (reverts otherwise).
    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    /// @notice Approves `spender` to spend up to `amount` on behalf of `msg.sender`.
    /// @param spender Spender address.
    /// @param amount Allowance amount.
    /// @return ok Always true on success.
    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    /// @notice Transfers `amount` from `from` to `to` using allowance, decrementing allowance unless set to `type(uint256).max`.
    /// @param from Source balance.
    /// @param to Recipient.
    /// @param amount Amount to move.
    /// @return ok Always true on success.
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "ERC20: insufficient allowance");
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    /// @notice Mints `amount` to `to`, increasing `totalSupply`.
    /// @param to Recipient; must not be zero address.
    /// @param amount Mint amount.
    function mint(address to, uint256 amount) external {
        require(to != address(0), "ERC20: mint to zero");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    /// @dev Updates balances and emits `Transfer`; used by `transfer` and `transferFrom`.
    /// @param from Source account holding `amount`.
    /// @param to Recipient account.
    /// @param amount Amount in smallest units (18-decimal wei for this mock).
    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "ERC20: transfer from zero");
        require(to != address(0), "ERC20: transfer to zero");
        uint256 fromBal = balanceOf[from];
        require(fromBal >= amount, "ERC20: insufficient balance");
        balanceOf[from] = fromBal - amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
