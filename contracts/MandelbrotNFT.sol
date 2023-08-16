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

    string public constant BASE_URL = "https://mandelbrot-service.onrender.com/";
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
        uint256 minimumBid;
    }

    struct Metadata {
        uint256 tokenId;
        address owner;
        uint256 parentId;
        Field field;
        uint256 lockedFuel;
        uint256 minimumBid;
    }

    struct Bid {
        uint256 parentId;
        Field field;
        address recipient;
        uint256 amount;
        uint256 minimumBid;
    }

    struct BidView {
        uint256 bidId;
        uint256 parentId;
        Field field;
        address recipient;
        uint256 amount;
        uint256 minimumBid;
    }

    Counters.Counter private _tokenIds;
    Counters.Counter private _bidIdCounter;
    mapping(uint256 => Node) private _nodes;
    mapping(uint256 => uint256[]) private _children;
    mapping(uint256 => Bid) private _bids;
    mapping(uint256 => uint256[]) private _bidIds;

    constructor() ERC1155("") {
        _mint(msg.sender, FUEL, TOTAL_SUPPLY, "");
        Field memory field = Field(0, 0, 3000000000000000000, 3000000000000000000);
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
        uint256 minimumBid
    ) internal {
        _nodes[tokenId] = Node(recipient, parentId, field, lockedFuel, minimumBid);
    }

    function _mintInternal(
        uint256 parentId,
        address recipient,
        Field memory field,
        uint256 lockedFuel,
        uint256 minimumBid
    ) internal returns (uint256) {
        require(minimumBid >= _nodes[parentId].minimumBid, "Child's minimum bid has to be at least as much as parent's.");
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId, 1, "");
        _setNode(newItemId, recipient, parentId, field, lockedFuel, minimumBid);
        return newItemId;
    }

    modifier tokenExists(uint256 tokenId) {
        require(_nodes[tokenId].minimumBid > 0, "NFT doesn't exist.");
        _;
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

    function uri(uint256 tokenId) public pure override returns (string memory) {
        return string.concat(BASE_URL, Strings.toString(tokenId));
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

    function bid(
        uint256 parentId,
        address recipient,
        Field memory field,
        uint256 amount,
        uint256 minimumBid
    ) validBounds(parentId, field) public returns (uint256) {
        require(amount >= _nodes[parentId].minimumBid, "Bid must exceed or equal minimum bid price.");
        require(minimumBid >= _nodes[parentId].minimumBid, "Child's minimum bid has to be at least as much as parent's.");

        _burn(msg.sender, FUEL, amount);
        // _safeTransferFrom(msg.sender, address(this), FUEL, amount, "");

        _bidIdCounter.increment();
        uint256 newBidId = _bidIdCounter.current();
        _bids[newBidId] = Bid(parentId, field, recipient, amount, minimumBid);
        _bidIds[parentId].push(newBidId);
        return newBidId;
    }

    function getBids(uint256 parentId) tokenExists(parentId) public view returns (BidView[] memory) {
        uint256[] memory bidIds = _bidIds[parentId];
        BidView[] memory result = new BidView[](bidIds.length);
        for (uint i = 0; i < bidIds.length; i++) {
            Bid memory bid_ = _bids[bidIds[i]];
            result[i] = (BidView(bidIds[i], parentId, bid_.field, bid_.recipient, bid_.amount, bid_.minimumBid));
        }
        return result;
    }

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

        uint256 newItemId = _mintInternal(parentId, bid_.recipient, bid_.field, remainder, bid_.minimumBid);
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

    //     uint256 newItemId = _mintInternal(parentId, recipient, field, _nodes[parentId].minimumBid);
    //     _children[parentId].push(newItemId);
    //     return newItemId;
    // }

    function burn(uint256 tokenId) public {
        require(msg.sender == _nodes[tokenId].owner, "Only the NFT owner can burn it.");
        require(_children[tokenId].length == 0, "Cannot burn NFT if it has children.");

        uint256[] memory bids = _bidIds[tokenId];
        for (uint256 i; i < bids.length; i++) {
            _deleteBid(bids[i]);
        }

        uint256[] storage children = _children[_nodes[tokenId].parentId];
        for (uint256 i; i < children.length; i++) {
            if (children[i] == tokenId) {
                children[i] = children[children.length - 1];
                children.pop();
                break;
            }
        }
        _mint(msg.sender, FUEL, _nodes[tokenId].lockedFuel, "");
        delete _nodes[tokenId];

        _burn(msg.sender, tokenId, 1);
    }

    function getMetadata(uint256 tokenId) tokenExists(tokenId) public view returns (Metadata memory) {
        Node memory node = _nodes[tokenId];
        return Metadata(tokenId, node.owner, node.parentId, node.field, node.lockedFuel, node.minimumBid);
    }

    function getChildrenMetadata(uint256 parentId) tokenExists(parentId) public view returns (Metadata[] memory) {
        uint256[] memory children = _children[parentId];
        Metadata[] memory result = new Metadata[](children.length);
        for (uint i = 0; i < children.length; i++) {
            Node memory node = _nodes[children[i]];
            result[i] = (Metadata(children[i], node.owner, parentId, node.field, node.lockedFuel, node.minimumBid));
        }
        return result;
    }

    function getAncestryMetadata(uint256 tokenId) tokenExists(tokenId) public view returns (Metadata[] memory) {
        uint depth = 0;
        uint256 ancestorId = tokenId;
        do {
            depth += 1;
            ancestorId = _nodes[ancestorId].parentId;
        } while (ancestorId != 0);

        Metadata[] memory result = new Metadata[](depth);
        ancestorId = tokenId;
        for (uint i = 0; i < depth; i++) {
            Node memory node = _nodes[ancestorId];
            result[i] = (Metadata(ancestorId, node.owner, node.parentId, node.field, node.lockedFuel, node.minimumBid));
            ancestorId = node.parentId;
        }
        return result;
    }

    function setminimumBid(uint256 tokenId, uint256 minimumBid) public {
        require(minimumBid >= _nodes[_nodes[tokenId].parentId].minimumBid, "Child's minimum bid has to be at least as much as parent's.");
        _nodes[tokenId].minimumBid = minimumBid;
    }
}