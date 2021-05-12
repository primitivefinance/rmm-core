// SPDX-License-Identifier: GPL-3.0-only
pragma solidity 0.8.0;
pragma abicoder v2;

/**
 * @notice  Engine Reserves
 * @author  Primitive
 * @dev     This library holds the data structure for an Engine's Reserves.
 */

library Reserve {
    // An Engine has two reserves of RISKY and RISK-FREE assets, X and Y, and total liquidity shares.
    struct Data {
        // the reserve for the risky asset
        uint RX1;
        // the reserve for the risk free asset
        uint RY2;
        // the total supply of liquidity shares
        uint liquidity;
        // the liquidity available for lending
        uint float;
        // the liquidity unavailable because it was borrowed
        uint debt;
    }

    /**
     * @notice  Fetches an Engine Registry's Reserve Data struct using a mapping of Reserve Ids.
     */
    function fetch(
        mapping(bytes32 => Data) storage reserves,
        address engine
    ) internal returns (Data storage) {
        return reserves[getReserveId(engine)];
    }

    function swap(Data storage reserve, bool addXRemoveY, uint deltaIn, uint deltaOut) internal returns (Data storage) {
        if(addXRemoveY) {
            reserve.RX1 += deltaIn;
            reserve.RY2 -= deltaOut;
        } else {
            reserve.RX1 -= deltaOut;
            reserve.RY2 += deltaIn;
        }

        return reserve;
    }

    function mint(Data storage reserve, uint deltaX, uint deltaY, uint deltaL) internal returns (Data storage) {
        reserve.RX1 += deltaX;
        reserve.RY2 += deltaY;
        reserve.liquidity += deltaL;
        return reserve;
    }

    function burn(Data storage reserve, uint deltaX, uint deltaY, uint deltaL) internal returns (Data storage) {
        reserve.RX1 -= deltaX;
        reserve.RY2 -= deltaY;
        reserve.liquidity -= deltaL;
        return reserve;
    }

    function addFloat(Data storage reserve, uint deltaL) internal returns (Data storage) {
        reserve.float += deltaL;
        return reserve;
    }

    function borrowFloat(Data storage reserve, uint deltaL) internal returns (Data storage) {
        reserve.float -= deltaL;
        reserve.debt += deltaL;
        return reserve;
    }

    function removeFloat(Data storage reserve, uint deltaL) internal returns (Data storage) {
        reserve.float -= deltaL;
        return reserve;
    }

    /**
     * @notice  Fetches the reserve Id, which is an encoded `owner`.
     * @return  The reserve Id as a bytes32.
     */
    function getReserveId(address engine) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(engine));
    }
}
