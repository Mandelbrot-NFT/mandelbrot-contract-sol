// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";


contract MandelbrotNFT is ERC1155, Ownable {
    using Counters for Counters.Counter;

    struct Field {
        uint256 min_x;
        uint256 min_y;
        uint256 max_x;
        uint256 max_y;
    }

    Counters.Counter private _tokenIds;
    mapping(uint256 => string) private _tokenURIs;
    Field[] private _fields;
    mapping(uint256 => Field) private _tokenFields;

    constructor() ERC1155("") {}

    function _setTokenURI(uint256 tokenId, string memory _tokenURI) internal virtual {
        _tokenURIs[tokenId] = _tokenURI;
    }

    function _setTokenField(uint256 tokenId, Field memory _field) internal virtual {
        _fields.push(_field);
        _tokenFields[tokenId] = _field;
    }

    function mintNFT(address recipient, Field memory field) public onlyOwner returns (uint256) {
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId, 1, "");
        _setTokenURI(newItemId, string.concat(Strings.toString(field.min_x), ",", Strings.toString(field.min_y), ":",
                                              Strings.toString(field.max_x), ",", Strings.toString(field.max_y)));
        _setTokenField(newItemId, field);
        return newItemId;
    }

    function fields() public view virtual returns (Field[] memory) {
        return _fields;
    }
}