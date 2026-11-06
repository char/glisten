// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/** @title Memory and storage examples
 *  @notice Assembly uses Yul builtins and scoped blocks.
 */
contract Slots {
    uint256 private stored;

    function load() external view returns (uint256 result) {
        assembly ("memory-safe") {
            let value := sload(stored.slot)
            switch value
            case 0 { result := 1 }
            default {
                mstore(0x00, value)
                result := mload(0x00)
            }
        }
    }

    function sum(uint256 n) external pure returns (uint256 result) {
        assembly {
            for { let i := 0 } lt(i, n) { i := add(i, 1) } {
                result := add(result, i)
            }
        }
    }
}
