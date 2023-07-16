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

    struct Metadata {
        uint256 tokenId;
        uint256 parentId;
        Field field;
    }

    Counters.Counter private _tokenIds;
    mapping(uint256 => string) private _tokenURIs;
    Field[] private _fields;
    mapping(uint256 => Field) private _tokenFields;
    mapping(uint256 => uint256[]) private _children;

    constructor() ERC1155("") {
        Field memory field = Field(0, 0, 4000000000000000000, 4000000000000000000);
        uint256 newItemId = _tokenIds.current();
        _mint(msg.sender, newItemId, 1, "");
        _setTokenURI(newItemId, string.concat(Strings.toString(field.min_x), ",", Strings.toString(field.min_y), ":",
                                              Strings.toString(field.max_x), ",", Strings.toString(field.max_y)));
        _setTokenField(newItemId, field);
    }

    function _setTokenURI(uint256 tokenId, string memory _tokenURI) internal virtual {
        _tokenURIs[tokenId] = _tokenURI;
    }

    function _setTokenField(uint256 tokenId, Field memory _field) internal virtual {
        _fields.push(_field);
        _tokenFields[tokenId] = _field;
    }

    function mintNFT(uint256 parentId, address recipient, Field memory field) public onlyOwner returns (uint256) {
        require(_children[parentId].length < 5, "A maximum of 20 child NFTs can be minted.");

        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId, 1, "");
        _setTokenURI(newItemId, string.concat(Strings.toString(field.min_x), ",", Strings.toString(field.min_y), ":",
                                              Strings.toString(field.max_x), ",", Strings.toString(field.max_y)));
        _setTokenField(newItemId, field);
        _children[parentId].push(newItemId);
        return newItemId;
    }

    function fields() public view virtual returns (Field[] memory) {
        return _fields;
    }

    function get_children(uint256 parentId) public view virtual returns (Metadata[] memory) {
        uint256[] memory children = _children[parentId];
        Metadata[] memory result = new Metadata[](children.length);
        for (uint i = 0; i < children.length; i++) {
            result[i] = (Metadata(children[i], parentId, _tokenFields[children[i]]));
        }
        return result;
    }
}