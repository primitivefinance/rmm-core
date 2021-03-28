pragma solidity 0.7.6;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract Token is ERC20 {
    constructor() ERC20("Mintable Token", "TKN") {}

    function mint(address to, uint wad) public {
        _mint(to, wad);
    }

    function burn(uint wad) public {
        _burn(msg.sender, wad);
    }
}