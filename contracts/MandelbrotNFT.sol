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

    uint256 public constant TOTAL_SUPPLY = 10000 * 10 ** 18;
    uint256 public constant BASE_MINIMUM_BID = 10 * 10 ** 18;
    uint256 public constant MAX_CHILDREN = 5;
    uint256 public constant PARENT_SHARE = 10;
    uint256 public constant UPSTREAM_SHARE = 50;

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
        uint256 lockedFuel;
        uint256 minimumPrice;
    }

    struct Metadata {
        uint256 tokenId;
        address owner;
        uint256 parentId;
        Field field;
        uint256 lockedFuel;
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
        _mint(msg.sender, FUEL, TOTAL_SUPPLY, "");
        Field memory field = Field(0, 0, 4000000000000000000, 4000000000000000000);
        _mintInternal(0, msg.sender, field, 0, BASE_MINIMUM_BID);
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

    function _setNode(
        uint256 tokenId,
        address recipient,
        uint256 parentId,
        Field memory field,
        uint256 lockedFuel,
        uint256 minimumPrice
    ) internal {
        _nodes[tokenId] = Node(recipient, parentId, field, lockedFuel, minimumPrice);
    }

    function _mintInternal(
        uint256 parentId,
        address recipient,
        Field memory field,
        uint256 lockedFuel,
        uint256 minimumPrice
    ) internal returns (uint256) {
        require(_nodes[parentId].minimumPrice <= minimumPrice, "Child's minimum price has to be at least as much as parent's.");
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId, 1, "");
        _setNode(newItemId, recipient, parentId, field, lockedFuel, minimumPrice);
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

    function _deleteBid(uint256 bidId) internal {
        uint256[] storage bidIds = _bidIds[_bids[bidId].parentId];
        for (uint256 i; i < bidIds.length; i++) {
            if (bidIds[i] == bidId) {
                bidIds[i] = bidIds[bidIds.length - 1];
                bidIds.pop();
                break;
            }
        }
        _mint(_bids[bidId].recipient, FUEL, _bids[bidId].amount, "");
        delete _bids[bidId];
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
        require(_children[parentId].length < MAX_CHILDREN, string.concat("A maximum of ", Strings.toString(MAX_CHILDREN)," child NFTs can be minted."));
        _validateBounds(parentId, bid_.field);

        uint256 payout = bid_.amount * PARENT_SHARE / 100;
        uint256 remainder = bid_.amount;
        uint256 ancestorId = bid_.parentId;
        do {
            remainder -= payout;
            _mint(_nodes[ancestorId].owner, FUEL, payout, "");
            ancestorId = _nodes[ancestorId].parentId;
            payout = payout * UPSTREAM_SHARE / 100;
        } while (ancestorId != 0);

        uint256 newItemId = _mintInternal(parentId, bid_.recipient, bid_.field, remainder, _nodes[parentId].minimumPrice);
        _children[parentId].push(newItemId);

        uint256[] storage bidIds = _bidIds[parentId];
        for (uint256 i; i < bidIds.length; i++) {
            if (bidIds[i] == bidId) {
                bidIds[i] = bidIds[bidIds.length - 1];
                bidIds.pop();
                break;
            }
        }
        delete _bids[bidId];

        return newItemId;
    }

    function batchApprove(uint256[] memory bidIds) public returns (uint256[] memory) {
        uint256[] memory tokenIds = new uint256[](bidIds.length);
        for (uint256 i; i < bidIds.length; i++) {
            tokenIds[i] = approve(bidIds[i]);
        }
        return tokenIds;
    }

    function deleteBid(uint256 bidId) public {
        require(msg.sender == _bids[bidId].recipient, "Only the bid creator can delete it.");
        _deleteBid(bidId);
    }

    // For testing purposes only
    // function mintNFT(uint256 parentId, address recipient, Field memory field) validBounds(parentId, field) public returns (uint256) {
    //     require(_children[parentId].length < MAX_CHILDREN, string.concat("A maximum of ", Strings.toString(MAX_CHILDREN)," child NFTs can be minted."));

    //     uint256 newItemId = _mintInternal(parentId, recipient, field, _nodes[parentId].minimumPrice);
    //     _children[parentId].push(newItemId);
    //     return newItemId;
    // }

    function getMetadata(uint256 tokenId) public view returns (Metadata memory) {
        Node memory node = _nodes[tokenId];
        return Metadata(tokenId, node.owner, node.parentId, node.field, node.lockedFuel, node.minimumPrice);
    }

    function getChildrenMetadata(uint256 parentId) public view returns (Metadata[] memory) {
        uint256[] memory children = _children[parentId];
        Metadata[] memory result = new Metadata[](children.length);
        for (uint i = 0; i < children.length; i++) {
            Node memory node = _nodes[children[i]];
            result[i] = (Metadata(children[i], node.owner, parentId, node.field, node.lockedFuel, node.minimumPrice));
        }
        return result;
    }

    function setMinimumPrice(uint256 tokenId, uint256 price) public {
        require(price >= _nodes[_nodes[tokenId].parentId].minimumPrice, "Child's minimum price must be more than parent's minimum price.");
        _nodes[tokenId].minimumPrice = price;
    }
}