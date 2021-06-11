// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;

import "../interfaces/IERC20.sol";

contract Token is IERC20 {
    uint256 constant private MAX_UINT256 = type(uint256).max;
    mapping (address => uint256) public balances;
    mapping (address => mapping (address => uint256)) public allowed;
    uint public override totalSupply;
    string public name;
    uint8 public decimals;
    string public symbol;

    constructor()  {
        name = "Test Token";
        symbol = "TEST";
        decimals = 18;
    }

    function mint(address to, uint wad) public {
        _mint(to, wad);
    }

    function burn(uint wad) public {
        _burn(msg.sender, wad);
    }

    function _mint(address to, uint amount) internal {
        balances[to] += amount;
        totalSupply += amount;
        emit Transfer(address(0), to, amount);
    }

    function _burn(address to, uint amount) internal {
        balances[to] -= amount;
        totalSupply -= amount;
        emit Transfer(to, address(0), amount);
    }

    function transfer(address _to, uint256 _value) public override returns (bool success) {
        require(balances[msg.sender] >= _value);
        balances[msg.sender] -= _value;
        balances[_to] += _value;
        emit Transfer(msg.sender, _to, _value); //solhint-disable-line indent, no-unused-vars
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) public override returns (bool success) {
        uint256 allowance = allowed[_from][msg.sender];
        require(balances[_from] >= _value && allowance >= _value);
        balances[_to] += _value;
        balances[_from] -= _value;
        if (allowance < MAX_UINT256) {
            allowed[_from][msg.sender] -= _value;
        }
        emit Transfer(_from, _to, _value); //solhint-disable-line indent, no-unused-vars
        return true;
    }

    function balanceOf(address _owner) public view override returns (uint256 balance) {
        return balances[_owner];
    }

    function approve(address _spender, uint256 _value) public override returns (bool success) {
        allowed[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value); //solhint-disable-line indent, no-unused-vars
        return true;
    }

    function allowance(address _owner, address _spender) public view override returns (uint256 remaining) {
        return allowed[_owner][_spender];
    }
}