pragma solidity ^0.6.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Sample is ERC20, Ownable {
    constructor() public Ownable() ERC20("Sample", "SAMPLE") {
        _mint(super.owner(), 1000000 * 10**uint256(super.decimals()));
    }
}
