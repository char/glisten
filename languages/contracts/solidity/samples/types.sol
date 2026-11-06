// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

interface IPrice { function price() external view returns (uint256); }
library Quotes {
    struct Quote { address payable recipient; uint256 amount; bytes32 memo; }
    enum Status { Pending, Paid, Cancelled }
    uint256 internal constant SCALE = 1e18;
    uint256 internal constant LIMIT = 1_000 ether;
    uint256 internal constant DELAY = 2 days + 3 hours + 1 seconds;

    function payment(address payable to, uint256 amount) internal pure returns (Quote memory) {
        require(amount > 0, "amount must be positive");
        bytes memory encoded = hex"deadbeef";
        string memory message = unicode"Hello, 世界";
        assert(encoded.length == 4 && bytes(message).length > 0);
        return Quote(to, amount * SCALE, bytes32(0));
    }
}
