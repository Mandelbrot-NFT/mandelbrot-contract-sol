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
    uint256 public constant MAXIMUM_FIELD_PORTION = 10; // 10%
    uint256 public constant MINT_FEE = 40;
    uint256 public constant UPSTREAM_SHARE = 20;

    struct Field {
        uint256 left;
        uint256 bottom;
        uint256 right;
        uint256 top;
    }

    struct Metadata {
        address owner;
        uint256 parentId;
        Field field;
        uint256 lockedFuel;
        uint256 minimumBid;
    }

    struct MetadataView {
        uint256 tokenId;
        address owner;
        uint256 parentId;
        Field field;
        uint256 lockedFuel;
        uint256 minimumBid;
    }

    Counters.Counter private _tokenIds;
    mapping(uint256 => Metadata) private _metadata;
    mapping(uint256 => uint256[]) private _children;
    mapping(uint256 => uint256[]) private _bidIds;

    error TokenNotFound();
    error NoRightsToBurn(); // Only the token owner can burn it
    error TokenNotEmpty(); // Cannot burn token if it has children
    error BidNotFound();
    error BidTooLow(); // Bid must exceed or equal minimum bid price
    error MinimumBidTooLow(); // Child's minimum bid has to be at least as much as parent's
    error TooManyChildTokens(); // A maximum of MAX_CHILDREN child tokens can be minted
    error NoRightsToApproveBid(); // Only the owner of parent token can approve the bid
    error NoRightsToDeleteBid(); // Only the bid creator can delete it
    error FieldOutside(); // Token has to be within the field of its parent
    error FieldsOverlap(); // Sibling fields cannot overlap
    error FieldTooLarge(); // Token's field cannot exceed MAXIMUM_FIELD_PORTION % of its parent's

    constructor() ERC1155("") {
        _mint(msg.sender, FUEL, TOTAL_SUPPLY, "");
        Field memory field = Field(0, 0, 3000000000000000000, 3000000000000000000);
        _mintInternal(0, msg.sender, field, 0, BASE_MINIMUM_BID);
    }

    modifier tokenExists(uint256 tokenId) {
        if (_metadata[tokenId].owner == address(0) || balanceOf(_metadata[tokenId].owner, tokenId) == 0) revert TokenNotFound();
        _;
    }

    modifier bidExists(uint256 bidId) {
        if (_metadata[bidId].owner == address(0) || balanceOf(_metadata[bidId].owner, bidId) == 1) revert BidNotFound();
        _;
    }

    function _validateBidField(uint256 parentId, Field memory field) internal view {
        Field storage parentField = _metadata[parentId].field;
        if (field.left < parentField.left ||
            field.right > parentField.right ||
            field.bottom < parentField.bottom ||
            field.top > parentField.top) revert FieldOutside();
        if (((field.right - field.left) * (field.top - field.bottom)) * 100 /
            ((parentField.right - parentField.left) * (parentField.top - parentField.bottom)) >
            MAXIMUM_FIELD_PORTION) revert FieldTooLarge();
    }

    function _validateTokenField(uint256 parentId, Field memory field) internal view {
        uint256[] storage children = _children[parentId];
        for (uint i = 0; i < children.length; i++) {
            Field storage siblingField = _metadata[children[i]].field;
            if (!(field.left > siblingField.right ||
                  field.right < siblingField.left ||
                  field.bottom > siblingField.top ||
                  field.top < siblingField.bottom)) revert FieldsOverlap();
        }
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
                _metadata[tokenId].owner = to;
            }
        }
    }

    function _mintInternal(
        uint256 parentId,
        address recipient,
        Field memory field,
        uint256 lockedFuel,
        uint256 minimumBid
    ) internal returns (uint256) {
        if (minimumBid < _metadata[parentId].minimumBid) revert MinimumBidTooLow();
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId, 1, "");
        _metadata[newItemId] = Metadata(recipient, parentId, field, lockedFuel, minimumBid);
        return newItemId;
    }

    function _deleteBid(uint256 bidId) bidExists(bidId) internal {
        uint256[] storage bidIds = _bidIds[_metadata[bidId].parentId];
        for (uint256 i; i < bidIds.length; i++) {
            if (bidIds[i] == bidId) {
                bidIds[i] = bidIds[bidIds.length - 1];
                bidIds.pop();
                break;
            }
        }
        _mint(_metadata[bidId].owner, FUEL, _metadata[bidId].lockedFuel, "");
        delete _metadata[bidId];
    }

    function bid(
        uint256 parentId,
        address recipient,
        Field calldata field,
        uint256 amount,
        uint256 minimumBid
    ) tokenExists(parentId) external returns (uint256) {
        uint256 parentMinimumBid = _metadata[parentId].minimumBid;
        if (amount < parentMinimumBid) revert BidTooLow();
        if (minimumBid < parentMinimumBid) revert MinimumBidTooLow();
        _validateBidField(parentId, field);

        _burn(msg.sender, FUEL, amount);
        // _safeTransferFrom(msg.sender, address(this), FUEL, amount, "");

        _tokenIds.increment();
        uint256 newBidId = _tokenIds.current();
        _metadata[newBidId] = Metadata(recipient, parentId, field, amount, minimumBid);
        _bidIds[parentId].push(newBidId);
        return newBidId;
    }

    function approve(uint256 bidId) bidExists(bidId) public {
        Metadata storage bid_ = _metadata[bidId];
        uint256 parentId = bid_.parentId;
        if (msg.sender != _metadata[parentId].owner) revert NoRightsToApproveBid();
        uint256[] storage children = _children[parentId];
        if (children.length == MAX_CHILDREN) revert TooManyChildTokens();
        _validateTokenField(parentId, bid_.field);

        uint256 remaining_payout = bid_.lockedFuel * MINT_FEE / 100;
        bid_.lockedFuel -= remaining_payout;

        uint256 ancestorId = bid_.parentId;
        uint256 upstream_share = UPSTREAM_SHARE;
        while (true) {
            Metadata storage ancestor = _metadata[ancestorId];
            if (ancestor.parentId == 0) {
                _mint(ancestor.owner, FUEL, remaining_payout, "");
                break;
            } else {
                _mint(ancestor.owner, FUEL, remaining_payout * (100 - upstream_share) / 100, "");
                remaining_payout = remaining_payout * upstream_share / 100;
                ancestorId = ancestor.parentId;
                upstream_share = UPSTREAM_SHARE + (100 - UPSTREAM_SHARE) * (100 - 100 * _children[ancestorId].length / MAX_CHILDREN) / 100;
            }
        }

        _mint(bid_.owner, bidId, 1, "");
        children.push(bidId);

        uint256[] storage bidIds = _bidIds[parentId];
        for (uint256 i; i < bidIds.length; i++) {
            if (bidIds[i] == bidId) {
                bidIds[i] = bidIds[bidIds.length - 1];
                bidIds.pop();
                break;
            }
        }
    }

    function batchApprove(uint256[] calldata bidIds) external {
        for (uint256 i; i < bidIds.length; i++) {
            approve(bidIds[i]);
        }
    }

    function deleteBid(uint256 bidId) bidExists(bidId) external {
        Metadata storage bid_ = _metadata[bidId];
        if (msg.sender != bid_.owner) revert NoRightsToDeleteBid();
        _deleteBid(bidId);
        if (_bidIds[bid_.parentId].length == 0) {
            delete _bidIds[bidId];
        }
    }

    // For testing purposes only
    // function mintNFT(uint256 parentId, address recipient, Field memory field) validField(parentId, field) public returns (uint256) {
    //     require(_children[parentId].length < MAX_CHILDREN, string.concat("A maximum of ", Strings.toString(MAX_CHILDREN)," child NFTs can be minted."));

    //     uint256 newItemId = _mintInternal(parentId, recipient, field, _metadata[parentId].minimumBid);
    //     _children[parentId].push(newItemId);
    //     return newItemId;
    // }

    function burn(uint256 tokenId) tokenExists(tokenId) external {
        if (msg.sender != _metadata[tokenId].owner) revert NoRightsToBurn();
        if (_children[tokenId].length != 0) revert TokenNotEmpty();

        delete _children[tokenId];

        uint256[] storage bids = _bidIds[tokenId];
        for (uint256 i; i < bids.length; i++) {
            _deleteBid(bids[i]);
        }
        delete _bidIds[tokenId];

        uint256[] storage children = _children[_metadata[tokenId].parentId];
        for (uint256 i; i < children.length; i++) {
            if (children[i] == tokenId) {
                children[i] = children[children.length - 1];
                children.pop();
                break;
            }
        }
        _mint(msg.sender, FUEL, _metadata[tokenId].lockedFuel, "");
        delete _metadata[tokenId];

        _burn(msg.sender, tokenId, 1);
    }

    function uri(uint256 tokenId) public pure override returns (string memory) {
        return string.concat(BASE_URL, Strings.toString(tokenId));
    }

    function getBids(uint256 parentId) tokenExists(parentId) external view returns (MetadataView[] memory) {
        uint256[] storage bidIds = _bidIds[parentId];
        MetadataView[] memory result = new MetadataView[](bidIds.length);
        for (uint i = 0; i < bidIds.length; i++) {
            Metadata storage bid_ = _metadata[bidIds[i]];
            result[i] = (MetadataView(bidIds[i], bid_.owner, parentId, bid_.field, bid_.lockedFuel, bid_.minimumBid));
        }
        return result;
    }

    function getMetadata(uint256 tokenId) tokenExists(tokenId) external view returns (MetadataView memory) {
        Metadata storage metadata = _metadata[tokenId];
        return MetadataView(tokenId, metadata.owner, metadata.parentId, metadata.field, metadata.lockedFuel, metadata.minimumBid);
    }

    function getChildrenMetadata(uint256 parentId) tokenExists(parentId) external view returns (MetadataView[] memory) {
        uint256[] storage children = _children[parentId];
        MetadataView[] memory result = new MetadataView[](children.length);
        for (uint i = 0; i < children.length; i++) {
            Metadata storage metadata = _metadata[children[i]];
            result[i] = (MetadataView(children[i], metadata.owner, parentId, metadata.field, metadata.lockedFuel, metadata.minimumBid));
        }
        return result;
    }

    function getAncestryMetadata(uint256 tokenId) tokenExists(tokenId) external view returns (MetadataView[] memory) {
        uint depth = 0;
        uint256 ancestorId = tokenId;
        do {
            depth += 1;
            ancestorId = _metadata[ancestorId].parentId;
        } while (ancestorId != 0);

        MetadataView[] memory result = new MetadataView[](depth);
        ancestorId = tokenId;
        for (uint i = 0; i < depth; i++) {
            Metadata storage metadata = _metadata[ancestorId];
            result[i] = (MetadataView(ancestorId, metadata.owner, metadata.parentId, metadata.field, metadata.lockedFuel, metadata.minimumBid));
            ancestorId = metadata.parentId;
        }
        return result;
    }

    function setminimumBid(uint256 tokenId, uint256 minimumBid) tokenExists(tokenId) external {
        if (minimumBid < _metadata[_metadata[tokenId].parentId].minimumBid) revert MinimumBidTooLow();
        _metadata[tokenId].minimumBid = minimumBid;
    }
}