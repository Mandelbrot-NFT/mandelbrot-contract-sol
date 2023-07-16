// SPDX-License-Identifier: MIT
pragma solidity >=0.8.0 <0.9.0;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";


contract MandelbrotNFT is ERC1155, Ownable {
    using Counters for Counters.Counter;

    uint256 public constant FUEL = 0;

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
        _mint(msg.sender, FUEL, 10**18, "");
        _tokenIds.increment();

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
        Field memory parent_field = _tokenFields[parentId];
        require(
            parent_field.min_x <= field.min_x && field.max_x <= parent_field.max_x &&
            parent_field.min_y <= field.min_y && field.max_y <= parent_field.max_y,
            "NFT has to be within the bounds of its parent."
        );
        uint256[] memory children = _children[parentId];
        for (uint i = 0; i < children.length; i++) {
            Field memory sibling_field = _tokenFields[children[i]];
            require(
                field.min_x > sibling_field.max_x ||
                field.max_x < sibling_field.min_x ||
                field.min_y > sibling_field.max_y ||
                field.max_y < sibling_field.min_y,
                "NFTs cannot overlap."
            );
        }

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

    function getMetadata(uint256 tokenId) public view virtual returns (Metadata memory) {
        return Metadata(tokenId, 0, _tokenFields[tokenId]);
    }

    function getChildrenMetadata(uint256 parentId) public view virtual returns (Metadata[] memory) {
        uint256[] memory children = _children[parentId];
        Metadata[] memory result = new Metadata[](children.length);
        for (uint i = 0; i < children.length; i++) {
            result[i] = (Metadata(children[i], parentId, _tokenFields[children[i]]));
        }
        return result;
    }
}