// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockSenderFeeERC20 is ERC20 {
    uint8 private immutable decimals_;
    uint256 public feeBP;
    uint256 public constant BASIS_POINTS = 10000;

    constructor(string memory _name, string memory _symbol, uint8 _decimals) ERC20(_name, _symbol) {
        decimals_ = _decimals;
    }

    function decimals() public view override returns (uint8) {
        return decimals_;
    }

    function setFee(uint256 _feeBP) external {
        feeBP = _feeBP;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    function _update(address from, address to, uint256 value) internal override {
        if (from == address(0) || to == address(0) || feeBP == 0) {
            super._update(from, to, value);
            return;
        }

        uint256 fee = value * feeBP / BASIS_POINTS;
        super._update(from, to, value);

        if (fee > 0) {
            super._update(from, address(0), fee);
        }
    }
}
