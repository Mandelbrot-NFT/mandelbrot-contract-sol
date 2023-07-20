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

    struct Node {
        uint256 parentId;
        Field field;
        uint256 minimumPrice;
    }

    struct Metadata {
        uint256 tokenId;
        uint256 parentId;
        Field field;
        uint256 minimumPrice;
    }

    Counters.Counter private _tokenIds;
    mapping(uint256 => Node) private _nodes;
    mapping(uint256 => uint256[]) private _children;

    constructor() ERC1155("") {
        _mint(msg.sender, FUEL, 10000 * 10 ** 18, "");
        Field memory field = Field(0, 0, 4000000000000000000, 4000000000000000000);
        _mintInternal(0, msg.sender, field, 10 * 10 ** 18);
    }

    function _setNode(uint256 tokenId, uint256 parentId, Field memory field, uint256 minimumPrice) internal virtual {
        _nodes[tokenId] = Node(parentId, field, minimumPrice);
    }

    function _mintInternal(uint256 parentId, address recipient, Field memory field, uint256 minimumPrice) internal virtual returns (uint256) {
        require(_nodes[parentId].minimumPrice <= minimumPrice, "Child's minimum price has to be at least as much as parent's.");
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId, 1, "");
        _setNode(newItemId, parentId, field, minimumPrice);
        return newItemId;
    }

    function mintNFT(uint256 parentId, address recipient, Field memory field) public returns (uint256) {
        require(_children[parentId].length < 5, "A maximum of 20 child NFTs can be minted.");
        Node memory parentNode = _nodes[parentId];
        Field memory parentField = parentNode.field;
        require(
            parentField.min_x <= field.min_x && field.max_x <= parentField.max_x &&
            parentField.min_y <= field.min_y && field.max_y <= parentField.max_y,
            "NFT has to be within the bounds of its parent."
        );
        uint256[] memory children = _children[parentId];
        for (uint i = 0; i < children.length; i++) {
            Field memory siblingField = _nodes[children[i]].field;
            require(
                field.min_x > siblingField.max_x ||
                field.max_x < siblingField.min_x ||
                field.min_y > siblingField.max_y ||
                field.max_y < siblingField.min_y,
                "NFTs cannot overlap."
            );
        }

        uint256 newItemId = _mintInternal(parentId, recipient, field, parentNode.minimumPrice);
        _children[parentId].push(newItemId);
        return newItemId;
    }

    function setMinimumPrice(uint256 tokenId, uint256 price) public {
        _nodes[tokenId].minimumPrice = price;
    }

    function getMetadata(uint256 tokenId) public view virtual returns (Metadata memory) {
        Node memory node = _nodes[tokenId];
        return Metadata(tokenId, node.parentId, node.field, node.minimumPrice);
    }

    function getChildrenMetadata(uint256 parentId) public view virtual returns (Metadata[] memory) {
        uint256[] memory children = _children[parentId];
        Metadata[] memory result = new Metadata[](children.length);
        for (uint i = 0; i < children.length; i++) {
            Node memory node = _nodes[children[i]];
            result[i] = (Metadata(children[i], parentId, node.field, node.minimumPrice));
        }
        return result;
    }
}