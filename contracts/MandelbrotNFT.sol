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

    struct Bid {
        uint256 parentId;
        Field field;
        address recipient;
        uint256 amount;
    }

    struct BidView {
        uint256 bidId;
        uint256 parentId;
        Field field;
        address recipient;
        uint256 amount;
    }

    Counters.Counter private _tokenIds;
    Counters.Counter private _bidIdCounter;
    mapping(uint256 => Node) private _nodes;
    mapping(uint256 => uint256[]) private _children;
    mapping(uint256 => Bid) private _bids;
    mapping(uint256 => uint256[]) private _bidIds;

    constructor() ERC1155("") {
        _mint(msg.sender, FUEL, 10000 * 10 ** 18, "");
        Field memory field = Field(0, 0, 4000000000000000000, 4000000000000000000);
        _mintInternal(0, msg.sender, field, 10 * 10 ** 18);
    }

    function _setNode(uint256 tokenId, uint256 parentId, Field memory field, uint256 minimumPrice) internal {
        _nodes[tokenId] = Node(parentId, field, minimumPrice);
    }

    function _mintInternal(uint256 parentId, address recipient, Field memory field, uint256 minimumPrice) internal returns (uint256) {
        require(_nodes[parentId].minimumPrice <= minimumPrice, "Child's minimum price has to be at least as much as parent's.");
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId, 1, "");
        _setNode(newItemId, parentId, field, minimumPrice);
        return newItemId;
    }

    modifier validBounds(uint256 parentId, Field memory field) {
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
        _;
    }

    function bid(uint256 parentId, address recipient, Field memory field, uint256 amount) validBounds(parentId, field) public returns (uint256) {
        require(_nodes[parentId].minimumPrice <= amount, "Bid must exceed minimum mint price.");

        _burn(msg.sender, FUEL, amount);
        // _safeTransferFrom(msg.sender, address(this), FUEL, amount, "");

        _bidIdCounter.increment();
        uint256 newBidId = _bidIdCounter.current();
        _bids[newBidId] = Bid(parentId, field, recipient, amount);
        _bidIds[parentId].push(newBidId);
        return newBidId;
    }

    function getBids(uint256 parentId) public view returns (BidView[] memory)  {
        uint256[] memory bidIds = _bidIds[parentId];
        BidView[] memory result = new BidView[](bidIds.length);
        for (uint i = 0; i < bidIds.length; i++) {
            Bid memory bid_ = _bids[bidIds[i]];
            result[i] = (BidView(bidIds[i], parentId, bid_.field, bid_.recipient, bid_.amount));
        }
        return result;
    }

    // function cancelBid - can be done either by bidder or parent NFT owner, releases funds

    // function approveBid - mints the NFT

    function mintNFT(uint256 parentId, address recipient, Field memory field) validBounds(parentId, field) public returns (uint256) {
        require(_children[parentId].length < 5, "A maximum of 20 child NFTs can be minted.");

        uint256 newItemId = _mintInternal(parentId, recipient, field, _nodes[parentId].minimumPrice);
        _children[parentId].push(newItemId);
        return newItemId;
    }

    function getMetadata(uint256 tokenId) public view returns (Metadata memory) {
        Node memory node = _nodes[tokenId];
        return Metadata(tokenId, node.parentId, node.field, node.minimumPrice);
    }

    function getChildrenMetadata(uint256 parentId) public view returns (Metadata[] memory) {
        uint256[] memory children = _children[parentId];
        Metadata[] memory result = new Metadata[](children.length);
        for (uint i = 0; i < children.length; i++) {
            Node memory node = _nodes[children[i]];
            result[i] = (Metadata(children[i], parentId, node.field, node.minimumPrice));
        }
        return result;
    }

    function setMinimumPrice(uint256 tokenId, uint256 price) public {
        _nodes[tokenId].minimumPrice = price;
    }
}