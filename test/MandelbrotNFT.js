const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("MandelbrotNFT contract", function () {
  async function deployTokenFixture() {
    const MandelbrotNFT = await ethers.getContractFactory("MandelbrotNFT");
    const [owner, addr1, addr2, addr3] = await ethers.getSigners();
    const mandelbrotNFT = await MandelbrotNFT.deploy();
    await mandelbrotNFT.deployed();
    return { MandelbrotNFT, mandelbrotNFT, owner, addr1, addr2, addr3 };
  }

  async function fundAccounts() {
    const { mandelbrotNFT, owner, addr1, addr2, addr3 } = await loadFixture(deployTokenFixture);
    const addr1OMBalance = 200n * 10n ** 18n;
    const addr2OMBalance = 200n * 10n ** 18n;
    const addr3OMBalance = 200n * 10n ** 18n;
    await mandelbrotNFT.safeTransferFrom(owner.address, addr1.address, await mandelbrotNFT.OM(), addr1OMBalance, 0x0);
    await mandelbrotNFT.safeTransferFrom(owner.address, addr2.address, await mandelbrotNFT.OM(), addr2OMBalance, 0x0);
    await mandelbrotNFT.safeTransferFrom(owner.address, addr3.address, await mandelbrotNFT.OM(), addr2OMBalance, 0x0);
    return { addr1OMBalance, addr2OMBalance, addr3OMBalance };
  }

  async function mint() {
    const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
    await loadFixture(fundAccounts);
    const originTokenId = 1;
    const usedOM = 15n * 10n ** 18n;
    const minimumBid = 20n * 10n ** 18n;
    const args = [
      originTokenId,
      addr1.address,
      {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
      usedOM,
      minimumBid
    ];
    const bidId = await mandelbrotNFT.connect(addr1).callStatic.bid(...args);
    let tx = await mandelbrotNFT.connect(addr1).bid(...args);
    await tx.wait();
    return { bidId, usedOM, minimumBid };
  }


  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { mandelbrotNFT, owner } = await loadFixture(deployTokenFixture);
      expect(await mandelbrotNFT.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply of OM to the owner", async function () {
      const { mandelbrotNFT, owner } = await loadFixture(deployTokenFixture);
      const ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, await mandelbrotNFT.OM());
      expect(ownerOMBalance).to.equal(await mandelbrotNFT.TOTAL_SUPPLY());
    });

    it("Should assign the origin token to the owner", async function () {
      const { mandelbrotNFT, owner } = await loadFixture(deployTokenFixture);
      const originTokenId = 1;
      const originTokenBalance = await mandelbrotNFT.balanceOf(owner.address, originTokenId);
      expect(originTokenBalance).to.equal(1);
    });

    it("Origin token metadata is correct", async function () {
      const { mandelbrotNFT, owner } = await loadFixture(deployTokenFixture);
      const originTokenId = 1;
      const originTokenMetadata = await mandelbrotNFT.getMetadata(originTokenId);
      expect(originTokenMetadata.tokenId).to.equal(originTokenId);
      expect(originTokenMetadata.owner).to.equal(owner.address);
      expect(originTokenMetadata.parentId).to.equal(0);
      expect(originTokenMetadata.field.left).to.equal(0);
      expect(originTokenMetadata.field.right).to.equal(3n * 16n ** 63n);
      expect(originTokenMetadata.field.bottom).to.equal(0);
      expect(originTokenMetadata.field.top).to.equal(3n * 16n ** 63n);
      expect(originTokenMetadata.lockedOM).to.equal(0);
      expect(originTokenMetadata.minimumBid).to.equal(await mandelbrotNFT.BASE_MINIMUM_BID());
    });
  });


  describe("Bidding", function () {
    it("Should create a bid", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      const { addr1OMBalance, addr2OMBalance } = await loadFixture(fundAccounts);
      const { bidId, usedOM, minimumBid } = await loadFixture(mint);
      const originTokenId = 1;

      expect(bidId).to.equal(2);
      const remainingOMBalance = await mandelbrotNFT.balanceOf(addr1.address, await mandelbrotNFT.OM());
      expect(remainingOMBalance).to.equal(addr1OMBalance - usedOM);

      const bids = await mandelbrotNFT.getBids(originTokenId);
      expect(bids.length).to.equal(1);
      const bidMetadata = bids[0];
      expect(bidMetadata.tokenId).to.equal(bidId);
      expect(bidMetadata.owner).to.equal(addr1.address);
      expect(bidMetadata.parentId).to.equal(originTokenId);
      expect(bidMetadata.field.left).to.equal(24n * 16n ** 62n);
      expect(bidMetadata.field.right).to.equal(2n * 16n ** 63n);
      expect(bidMetadata.field.bottom).to.equal(24n * 16n ** 62n);
      expect(bidMetadata.field.top).to.equal(2n * 16n ** 63n);
      expect(bidMetadata.lockedOM).to.equal(usedOM);
      expect(bidMetadata.minimumBid).to.equal(minimumBid);
    });

    it("Should revert with TokenNotFound", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const invalidTokenId = 10;

      const usedOM = 5n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        invalidTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await expect(mandelbrotNFT.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrotNFT, "TokenNotFound");
    });

    it("Should revert with BidTooLow", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedOM = 5n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await expect(mandelbrotNFT.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrotNFT, "BidTooLow");
    });

    it("Should revert with MinimumBidTooLow", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedOM = 15n * 10n ** 18n;
      const minimumBid = 5n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await expect(mandelbrotNFT.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrotNFT, "MinimumBidTooLow");
    });

    it("Should revert with FieldOutside", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedOM = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 35n * 16n ** 62n, "right": 4n * 16n ** 63n, "bottom": 35n * 16n ** 62n, "top": 4n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await expect(mandelbrotNFT.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrotNFT, "FieldOutside");
    });

    it("Should revert with FieldTooLarge", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedOM = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 3n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 3n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await expect(mandelbrotNFT.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrotNFT, "FieldTooLarge");
    });

    it("Should revert with 'ERC1155: burn amount exceeds balance'", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      const originTokenId = 1;

      const usedOM = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await expect(mandelbrotNFT.connect(addr1).bid(...args)).to.be.revertedWith("ERC1155: burn amount exceeds balance");
    });
  });


  describe("Approval", function () {
    it("Should approve bid", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const { bidId, usedOM, minimumBid } = await loadFixture(mint);
      const originTokenId = 1;

      let ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, await mandelbrotNFT.OM());
      expect(ownerOMBalance).to.equal(9400n * 10n ** 18n);

      let tx = await mandelbrotNFT.batchApprove([bidId]);
      await tx.wait();

      ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, await mandelbrotNFT.OM());
      expect(ownerOMBalance).to.equal(BigInt(9400 + 15 * await mandelbrotNFT.MINT_FEE() / 100) * 10n ** 18n);

      const tokenBalance = await mandelbrotNFT.balanceOf(addr1.address, bidId);
      expect(tokenBalance).to.equal(1);

      const children = await mandelbrotNFT.getChildrenMetadata(originTokenId);
      expect(children.length).to.equal(1);
      const tokenMetadata = children[0];
      expect(tokenMetadata.tokenId).to.equal(bidId);
      expect(tokenMetadata.owner).to.equal(addr1.address);
      expect(tokenMetadata.parentId).to.equal(originTokenId);
      expect(tokenMetadata.field.left).to.equal(24n * 16n ** 62n);
      expect(tokenMetadata.field.right).to.equal(2n * 16n ** 63n);
      expect(tokenMetadata.field.bottom).to.equal(24n * 16n ** 62n);
      expect(tokenMetadata.field.top).to.equal(2n * 16n ** 63n);
      expect(tokenMetadata.lockedOM).to.equal(usedOM * (100n - BigInt(await mandelbrotNFT.MINT_FEE())) / 100n);
      expect(tokenMetadata.minimumBid).to.equal(minimumBid);

      expect((await mandelbrotNFT.getBids(originTokenId)).length).to.equal(0);
    });

    it("Should distribute fees hierarchically", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      let expectedOwnerOMBalance = 9400n * 10n ** 18n;
      let ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, await mandelbrotNFT.OM());
      expect(ownerOMBalance).to.equal(expectedOwnerOMBalance);

      const usedOM = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      for (i = 0; i < 5; i++) {
        const args = [
          originTokenId,
          addr1.address,
          {"left": BigInt(i * 3) * 16n ** 62n, "right": BigInt(i * 3 + 2) * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedOM,
          minimumBid
        ];
        await mandelbrotNFT.connect(addr1).bid(...args);
      }
      await mandelbrotNFT.batchApprove([2, 3, 4, 5, 6]);

      expectedOwnerOMBalance += BigInt(5 * 10 * await mandelbrotNFT.MINT_FEE() / 100) * 10n ** 18n;
      ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, await mandelbrotNFT.OM());
      expect(ownerOMBalance).to.equal(expectedOwnerOMBalance);

      let addr1OMBalance = await mandelbrotNFT.balanceOf(addr1.address, await mandelbrotNFT.OM());
      expect(addr1OMBalance).to.equal(150n * 10n ** 18n);

      const args = [
        2,
        addr2.address,
        {"left": 1n * 16n ** 62n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedOM,
        minimumBid
      ];
      await mandelbrotNFT.connect(addr2).bid(...args);
      await mandelbrotNFT.connect(addr1).batchApprove([7]);

      addr1OMBalance = await mandelbrotNFT.balanceOf(addr1.address, await mandelbrotNFT.OM());
      expect(addr1OMBalance).to.equal(BigInt(1500 + 100 * await mandelbrotNFT.MINT_FEE() / 100 * (1 - await mandelbrotNFT.UPSTREAM_SHARE() / 100)) * 10n ** 17n);

      expectedOwnerOMBalance += BigInt(100 * await mandelbrotNFT.MINT_FEE() / 100 * await mandelbrotNFT.UPSTREAM_SHARE() / 100) * 10n ** 17n;
      ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, await mandelbrotNFT.OM());
      expect(ownerOMBalance).to.equal(expectedOwnerOMBalance);
    });

    it("Should distribute less fees hierarchically if not full", async function () {
      const { mandelbrotNFT, owner, addr1, addr2, addr3 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const OM = await mandelbrotNFT.OM();
      const MINT_FEE = await mandelbrotNFT.MINT_FEE();
      const UPSTREAM_SHARE = await mandelbrotNFT.UPSTREAM_SHARE();

      let expectedOwnerOMBalance = 9400n * 10n ** 18n;
      let ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, OM);
      expect(ownerOMBalance).to.equal(expectedOwnerOMBalance);

      let expectedAddr1OMBalance = 200n * 10n ** 18n;
      let addr1OMBalance = await mandelbrotNFT.balanceOf(addr1.address, OM);
      expect(addr1OMBalance).to.equal(expectedAddr1OMBalance);

      let expectedAddr2OMBalance = 200n * 10n ** 18n;
      let addr2OMBalance = await mandelbrotNFT.balanceOf(addr2.address, OM);
      expect(addr2OMBalance).to.equal(expectedAddr2OMBalance);

      const usedOM = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      let args = [
        originTokenId,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await mandelbrotNFT.connect(addr1).bid(...args);
      await mandelbrotNFT.batchApprove([2]);

      expectedOwnerOMBalance += BigInt(10 * MINT_FEE / 100) * 10n ** 18n;
      ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, OM);
      expect(ownerOMBalance).to.equal(expectedOwnerOMBalance);

      expectedAddr1OMBalance -= 10n * 10n ** 18n;
      addr1OMBalance = await mandelbrotNFT.balanceOf(addr1.address, OM);
      expect(addr1OMBalance).to.equal(expectedAddr1OMBalance);

      for (i = 0; i < 3; i++) {
        args = [
          2,
          addr2.address,
          {"left": BigInt(i * 3) * 16n ** 61n, "right": BigInt(i * 3 + 2) * 16n ** 61n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedOM,
          minimumBid
        ];
        await mandelbrotNFT.connect(addr2).bid(...args);
      }
      await mandelbrotNFT.connect(addr1).batchApprove([3, 4, 5]);

      expectedOwnerOMBalance += BigInt(3 * 100 * MINT_FEE / 100 * UPSTREAM_SHARE / 100) * 10n ** 17n;
      ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, OM);
      expect(ownerOMBalance).to.equal(expectedOwnerOMBalance);

      expectedAddr1OMBalance += BigInt(3 * 100 * MINT_FEE / 100 * (1 - UPSTREAM_SHARE / 100)) * 10n ** 17n;
      addr1OMBalance = await mandelbrotNFT.balanceOf(addr1.address, OM);
      expect(addr1OMBalance).to.equal(expectedAddr1OMBalance);

      expectedAddr2OMBalance -= 3n * 10n * 10n ** 18n;
      addr2OMBalance = await mandelbrotNFT.balanceOf(addr2.address, OM);
      expect(addr1OMBalance).to.equal(expectedAddr1OMBalance);

      args = [
        3,
        addr2.address,
        {"left": 0n, "right": 2n * 10n ** 15n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedOM,
        minimumBid
      ];
      await mandelbrotNFT.connect(addr3).bid(...args);
      await mandelbrotNFT.connect(addr2).batchApprove([6]);

      let addr2share = BigInt(100 * MINT_FEE / 100 * (1 - UPSTREAM_SHARE / 100)) * 10n ** 17n;
      expectedAddr2OMBalance += addr2share;
      addr2OMBalance = await mandelbrotNFT.balanceOf(addr2.address, OM);
      expect(addr2OMBalance).to.equal(expectedAddr2OMBalance);

      let addr1share = (BigInt(10 * MINT_FEE / 100) * 10n ** 18n - addr2share) * (100n - BigInt(1 * UPSTREAM_SHARE + (100 - UPSTREAM_SHARE) * (1 - 3 / 5))) / 100n;
      expectedAddr1OMBalance += addr1share;
      addr1OMBalance = await mandelbrotNFT.balanceOf(addr1.address, OM);
      expect(addr1OMBalance).to.equal(expectedAddr1OMBalance);

      expectedOwnerOMBalance += BigInt(10 * MINT_FEE / 100) * 10n ** 18n - addr2share - addr1share;
      ownerOMBalance = await mandelbrotNFT.balanceOf(owner.address, await mandelbrotNFT.OM());
      expect(ownerOMBalance).to.equal(expectedOwnerOMBalance);
    });

    it("Should revert with BidNotFound", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      const invalidBidId = 10;
      
      await expect(mandelbrotNFT.approve(invalidBidId)).to.be.revertedWithCustomError(mandelbrotNFT, "BidNotFound");
    });

    it("Should revert with NoRightsToApproveBid", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const { bidId, usedOM, minimumBid } = await loadFixture(mint);
      
      await expect(mandelbrotNFT.connect(addr1).approve(bidId)).to.be.revertedWithCustomError(mandelbrotNFT, "NoRightsToApproveBid");
    });

    it("Should revert with TooManyChildTokens", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedOM = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      for (i = 0; i < 6; i++) {
        const args = [
          originTokenId,
          addr1.address,
          {"left": BigInt(i * 3) * 16n ** 62n, "right": BigInt(i * 3 + 2) * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedOM,
          minimumBid
        ];
        await mandelbrotNFT.connect(addr1).bid(...args);
      }
      
      await expect(mandelbrotNFT.batchApprove([2, 3, 4, 5, 6, 7])).to.be.revertedWithCustomError(mandelbrotNFT, "TooManyChildTokens");
    });

    it("Should revert with FieldsOverlap", async function () {
      const { mandelbrotNFT, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedOM = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      for (i = 0; i < 6; i++) {
        const args = [
          originTokenId,
          addr1.address,
          {"left": BigInt(i * 3) * 16n ** 62n, "right": BigInt(i * 3 + 5) * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedOM,
          minimumBid
        ];
        await mandelbrotNFT.connect(addr1).bid(...args);
      }
      
      await expect(mandelbrotNFT.batchApprove([2, 3])).to.be.revertedWithCustomError(mandelbrotNFT, "FieldsOverlap");
    });
  });

  describe("Metadata", function () {
    it("Should return ancestry metadata", async function () {
      const { mandelbrotNFT, owner, addr1, addr2, addr3 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedOM = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      let args = [
        originTokenId,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await mandelbrotNFT.connect(addr1).bid(...args);
      await mandelbrotNFT.batchApprove([2]);

      args = [
        2,
        addr2.address,
        {"left": 0n, "right": 2n * 16n ** 61n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await mandelbrotNFT.connect(addr2).bid(...args);
      await mandelbrotNFT.connect(addr1).batchApprove([3]);

      args = [
        3,
        addr2.address,
        {"left": 0n, "right": 2n * 16n ** 60n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedOM,
        minimumBid
      ];
      await mandelbrotNFT.connect(addr3).bid(...args);
      await mandelbrotNFT.connect(addr2).batchApprove([4]);

      let metadata = await mandelbrotNFT.getAncestryMetadata(4);
    });

    it("Should return owned items", async function () {
      const { mandelbrotNFT, owner, addr1 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedOM = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      let args = [
        originTokenId,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await mandelbrotNFT.connect(addr1).bid(...args);
      await mandelbrotNFT.batchApprove([2]);

      args = [
        2,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 61n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedOM,
        minimumBid
      ];
      await mandelbrotNFT.connect(addr1).bid(...args);
      await mandelbrotNFT.connect(addr1).batchApprove([3]);

      args = [
        3,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 60n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedOM,
        minimumBid
      ];
      await mandelbrotNFT.connect(addr1).bid(...args);

      let { tokens, bids } = await mandelbrotNFT.getOwnedItems(addr1.address);
      expect(tokens.length).to.equal(2);
      expect(bids.length).to.equal(1);
    });
  });
});