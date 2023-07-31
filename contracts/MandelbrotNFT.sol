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
        address owner;
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

    function _afterTokenTransfer(
        address operator,
        address from,
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) internal override {
        super._afterTokenTransfer(operator, from, to, ids, amounts, data);
        for (uint i = 0; i < ids.length; i++) {
            uint256 tokenId = ids[i];
            if (tokenId > 0) {
                _nodes[tokenId].owner = to;
            }
        }
    }

    function _setNode(uint256 tokenId, uint256 parentId, Field memory field, uint256 minimumPrice) internal {
        _nodes[tokenId] = Node(msg.sender, parentId, field, minimumPrice);
    }

    function _mintInternal(uint256 parentId, address recipient, Field memory field, uint256 minimumPrice) internal returns (uint256) {
        require(_nodes[parentId].minimumPrice <= minimumPrice, "Child's minimum price has to be at least as much as parent's.");
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId, 1, "");
        _setNode(newItemId, parentId, field, minimumPrice);
        return newItemId;
    }

    function _validateBounds(uint256 parentId, Field memory field) internal view {
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
    }

    modifier validBounds(uint256 parentId, Field memory field) {
        _validateBounds(parentId, field);
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

    function approve(uint256 bidId) public returns (uint256) {
        Bid memory bid_ = _bids[bidId];
        uint256 parentId = bid_.parentId;
        require(msg.sender == _nodes[parentId].owner, "Only the owner of parent NFT can approve the bid.");
        require(_children[parentId].length < 5, "A maximum of 20 child NFTs can be minted.");
        _validateBounds(parentId, bid_.field);

        // TODO: hierarchical compensation
        _mint(_nodes[bid_.parentId].owner, FUEL, bid_.amount, "");

        uint256 newItemId = _mintInternal(parentId, bid_.recipient, bid_.field, _nodes[parentId].minimumPrice);
        _children[parentId].push(newItemId);

        delete _bids[bidId];
        uint256[] storage bidIds = _bidIds[parentId];
        for (uint256 i; i < bidIds.length; i++) {
            if (bidIds[i] == bidId) {
                bidIds[i] = bidIds[bidIds.length - 1];
                bidIds.pop();
                break;
            }
        }

        return newItemId;
    }

    function batchApprove(uint256[] memory bidIds) public returns (uint256[] memory) {
        uint256[] memory tokenIds = new uint256[](bidIds.length);
        for (uint256 i; i < bidIds.length; i++) {
            tokenIds[i] = approve(bidIds[i]);
        }
        return tokenIds;
    }

    // For testing purposes only
    // function mintNFT(uint256 parentId, address recipient, Field memory field) validBounds(parentId, field) public returns (uint256) {
    //     require(_children[parentId].length < 5, "A maximum of 20 child NFTs can be minted.");

    //     uint256 newItemId = _mintInternal(parentId, recipient, field, _nodes[parentId].minimumPrice);
    //     _children[parentId].push(newItemId);
    //     return newItemId;
    // }

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
        require(price >= _nodes[_nodes[tokenId].parentId].minimumPrice, "Child's minimum price must be more than parent's minimum price.");
        _nodes[tokenId].minimumPrice = price;
    }
}