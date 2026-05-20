// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice 18-decimal ERC20 with configurable transfer tax (fee on transfer) for FOT / slippage tests.
contract MockFOTERC20 {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice Tax in basis points deducted from every transfer amount (recipient receives `amount * (1 - feeBps/10000)`).
    uint256 public feeBps;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    constructor(string memory _name, string memory _symbol, uint256 feeBps_) {
        name = _name;
        symbol = _symbol;
        feeBps = feeBps_;
    }

    function setFeeBps(uint256 feeBps_) external {
        feeBps = feeBps_;
    }

    function mint(address to, uint256 amount) external {
        require(to != address(0), "zero");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        if (allowed != type(uint256).max) {
            require(allowed >= amount, "allowance");
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(from != address(0), "from zero");
        require(to != address(0), "to zero");
        uint256 fromBal = balanceOf[from];
        require(fromBal >= amount, "balance");
        balanceOf[from] = fromBal - amount;
        uint256 fee = (amount * feeBps) / 10_000;
        uint256 received = amount - fee;
        balanceOf[to] += received;
        emit Transfer(from, to, received);
    }
}
