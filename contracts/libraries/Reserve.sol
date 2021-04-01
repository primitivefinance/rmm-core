pragma solidity 0.7.6;
pragma abicoder v2;

/**
 * @notice  Engine Reserves
 * @author  Primitive
 * @dev     This library is holds the data structure for an Engine's Reserves.
 */

library Reserve {
    // An Engine has two reserves of RISKY and RISK-FREE assets, X and Y, and total liquidity shares.
    struct Data {
        // Total Reserves for the RISKY asset.
        uint RX1;
        // Total Reserves for the RISK-FREE asset.
        uint RY2;
        // Total liquidity shares, also the quantity of options replicated, open interest. 
        uint liquidity;
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

    /**
     * @notice  Fetches the reserve Id, which is an encoded `owner`.
     * @return  The reserve Id as a bytes32.
     */
    function getReserveId(address engine) internal view returns (bytes32) {
        return keccak256(abi.encodePacked(engine));
    }
}