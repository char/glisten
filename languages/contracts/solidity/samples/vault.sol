// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title A minimal ether vault
contract Vault {
    address public immutable owner;
    mapping(address => uint256) public balance;
    event Deposited(address indexed sender, uint256 amount);
    error InsufficientBalance(uint256 requested);

    constructor() { owner = msg.sender; }

    /// @notice Adds ether to the sender's balance.
    function deposit() public payable {
        balance[msg.sender] += msg.value;
        emit Deposited(msg.sender, msg.value);
    }

    /// @param amount The amount to withdraw.
    function withdraw(uint256 amount) external {
        if (balance[msg.sender] < amount) revert InsufficientBalance(amount);
        balance[msg.sender] -= amount;
        payable(msg.sender).transfer(amount);
    }

    receive() external payable { deposit(); }
}
