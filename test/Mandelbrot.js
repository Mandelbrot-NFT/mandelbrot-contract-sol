const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

describe("Mandelbrot contract", function () {
  async function deployTokenFixture() {
    const Mandelbrot = await ethers.getContractFactory("Mandelbrot");
    const [owner, addr1, addr2, addr3] = await ethers.getSigners();
    const mandelbrot = await Mandelbrot.deploy();
    await mandelbrot.deployed();
    return { Mandelbrot: Mandelbrot, mandelbrot, owner, addr1, addr2, addr3 };
  }

  async function fundAccounts() {
    const { mandelbrot, owner, addr1, addr2, addr3 } = await loadFixture(deployTokenFixture);
    const addr1FUELBalance = 200n * 10n ** 18n;
    const addr2FUELBalance = 200n * 10n ** 18n;
    const addr3FUELBalance = 200n * 10n ** 18n;
    await mandelbrot.transfer(addr1.address, addr1FUELBalance);
    await mandelbrot.transfer(addr2.address, addr2FUELBalance);
    await mandelbrot.transfer(addr3.address, addr3FUELBalance);
    return { addr1FUELBalance, addr2FUELBalance, addr3FUELBalance };
  }

  async function mint() {
    const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
    await loadFixture(fundAccounts);
    const originTokenId = 1;
    const usedFUEL = 15n * 10n ** 18n;
    const minimumBid = 20n * 10n ** 18n;
    const args = [
      originTokenId,
      addr1.address,
      {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
      usedFUEL,
      minimumBid
    ];
    const bidId = await mandelbrot.connect(addr1).callStatic.bid(...args);
    let tx = await mandelbrot.connect(addr1).bid(...args);
    await tx.wait();
    return { bidId, usedFUEL, minimumBid };
  }


  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      const { mandelbrot, owner } = await loadFixture(deployTokenFixture);
      expect(await mandelbrot.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply of FUEL to the owner", async function () {
      const { mandelbrot, owner } = await loadFixture(deployTokenFixture);
      const ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(await mandelbrot.TOTAL_SUPPLY());
    });

    it("Should assign the origin token to the owner", async function () {
      const { mandelbrot, owner } = await loadFixture(deployTokenFixture);
      const originTokenId = 1;
      const originTokenBalance = await mandelbrot["balanceOf(address,uint256)"](owner.address, originTokenId);
      expect(originTokenBalance).to.equal(1);
    });

    it("Origin token metadata is correct", async function () {
      const { mandelbrot, owner } = await loadFixture(deployTokenFixture);
      const originTokenId = 1;
      const originTokenMetadata = await mandelbrot.getMetadata(originTokenId);
      expect(originTokenMetadata.tokenId).to.equal(originTokenId);
      expect(originTokenMetadata.owner).to.equal(owner.address);
      expect(originTokenMetadata.parentId).to.equal(0);
      expect(originTokenMetadata.field.left).to.equal(0);
      expect(originTokenMetadata.field.right).to.equal(3n * 16n ** 63n);
      expect(originTokenMetadata.field.bottom).to.equal(0);
      expect(originTokenMetadata.field.top).to.equal(3n * 16n ** 63n);
      expect(originTokenMetadata.lockedFUEL).to.equal(0);
      expect(originTokenMetadata.minimumBid).to.equal(await mandelbrot.BASE_MINIMUM_BID());
    });
  });


  describe("Bidding", function () {
    it("Should create a bid", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      const { addr1FUELBalance, addr2FUELBalance } = await loadFixture(fundAccounts);
      const { bidId, usedFUEL, minimumBid } = await loadFixture(mint);
      const originTokenId = 1;

      expect(bidId).to.equal(2);
      const remainingFUELBalance = await mandelbrot["balanceOf(address)"](addr1.address);
      expect(remainingFUELBalance).to.equal(addr1FUELBalance - usedFUEL);

      const bids = await mandelbrot.getBids(originTokenId);
      expect(bids.length).to.equal(1);
      const bidMetadata = bids[0];
      expect(bidMetadata.tokenId).to.equal(bidId);
      expect(bidMetadata.owner).to.equal(addr1.address);
      expect(bidMetadata.parentId).to.equal(originTokenId);
      expect(bidMetadata.field.left).to.equal(24n * 16n ** 62n);
      expect(bidMetadata.field.right).to.equal(2n * 16n ** 63n);
      expect(bidMetadata.field.bottom).to.equal(24n * 16n ** 62n);
      expect(bidMetadata.field.top).to.equal(2n * 16n ** 63n);
      expect(bidMetadata.lockedFUEL).to.equal(usedFUEL);
      expect(bidMetadata.minimumBid).to.equal(minimumBid);
    });

    it("Should revert with TokenNotFound", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const invalidTokenId = 10;

      const usedFUEL = 5n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        invalidTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(mandelbrot.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrot, "TokenNotFound");
    });

    it("Should revert with BidTooLow", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedFUEL = 5n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(mandelbrot.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrot, "BidTooLow");
    });

    it("Should revert with MinimumBidTooLow", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 5n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(mandelbrot.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrot, "MinimumBidTooLow");
    });

    it("Should revert with FieldOutside", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 35n * 16n ** 62n, "right": 4n * 16n ** 63n, "bottom": 35n * 16n ** 62n, "top": 4n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(mandelbrot.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrot, "FieldOutside");
    });

    it("Should revert with FieldTooLarge", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 3n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 3n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(mandelbrot.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrot, "FieldTooLarge");
    });

    it("Should revert with ERC1155InsufficientBalance", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(mandelbrot.connect(addr1).bid(...args)).to.be.revertedWithCustomError(mandelbrot, "ERC1155InsufficientBalance");
    });
  });


  describe("Approval", function () {
    it("Should approve bid", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const { bidId, usedFUEL, minimumBid } = await loadFixture(mint);
      const originTokenId = 1;

      let ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(9400n * 10n ** 18n);

      let tx = await mandelbrot.batchApprove([bidId]);
      await tx.wait();

      ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(BigInt(9400 + 15 * await mandelbrot.MINT_FEE() / 100) * 10n ** 18n);

      const tokenBalance = await mandelbrot["balanceOf(address,uint256)"](addr1.address, bidId);
      expect(tokenBalance).to.equal(1);

      const children = await mandelbrot.getChildrenMetadata(originTokenId);
      expect(children.length).to.equal(1);
      const tokenMetadata = children[0];
      expect(tokenMetadata.tokenId).to.equal(bidId);
      expect(tokenMetadata.owner).to.equal(addr1.address);
      expect(tokenMetadata.parentId).to.equal(originTokenId);
      expect(tokenMetadata.field.left).to.equal(24n * 16n ** 62n);
      expect(tokenMetadata.field.right).to.equal(2n * 16n ** 63n);
      expect(tokenMetadata.field.bottom).to.equal(24n * 16n ** 62n);
      expect(tokenMetadata.field.top).to.equal(2n * 16n ** 63n);
      expect(tokenMetadata.lockedFUEL).to.equal(usedFUEL * (100n - BigInt(await mandelbrot.MINT_FEE())) / 100n);
      expect(tokenMetadata.minimumBid).to.equal(minimumBid);

      expect((await mandelbrot.getBids(originTokenId)).length).to.equal(0);
    });

    it("Should distribute fees hierarchically", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      let expectedOwnerFUELBalance = 9400n * 10n ** 18n;
      let ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      const usedFUEL = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      for (i = 0; i < 5; i++) {
        const args = [
          originTokenId,
          addr1.address,
          {"left": BigInt(i * 3) * 16n ** 62n, "right": BigInt(i * 3 + 2) * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedFUEL,
          minimumBid
        ];
        await mandelbrot.connect(addr1).bid(...args);
      }
      await mandelbrot.batchApprove([2, 3, 4, 5, 6]);

      expectedOwnerFUELBalance += BigInt(5 * 10 * await mandelbrot.MINT_FEE() / 100) * 10n ** 18n;
      ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      let addr1FUELBalance = await mandelbrot["balanceOf(address)"](addr1.address);
      expect(addr1FUELBalance).to.equal(150n * 10n ** 18n);

      const args = [
        2,
        addr2.address,
        {"left": 1n * 16n ** 62n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedFUEL,
        minimumBid
      ];
      await mandelbrot.connect(addr2).bid(...args);
      await mandelbrot.connect(addr1).batchApprove([7]);

      addr1FUELBalance = await mandelbrot["balanceOf(address)"](addr1.address);
      expect(addr1FUELBalance).to.equal(BigInt(1500 + 100 * await mandelbrot.MINT_FEE() / 100 * (1 - await mandelbrot.UPSTREAM_SHARE() / 100)) * 10n ** 17n);

      expectedOwnerFUELBalance += BigInt(100 * await mandelbrot.MINT_FEE() / 100 * await mandelbrot.UPSTREAM_SHARE() / 100) * 10n ** 17n;
      ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);
    });

    it("Should distribute less fees hierarchically if not full", async function () {
      const { mandelbrot, owner, addr1, addr2, addr3 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const FUEL = await mandelbrot.FUEL();
      const MINT_FEE = await mandelbrot.MINT_FEE();
      const UPSTREAM_SHARE = await mandelbrot.UPSTREAM_SHARE();

      let expectedOwnerFUELBalance = 9400n * 10n ** 18n;
      let ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      let expectedAddr1FUELBalance = 200n * 10n ** 18n;
      let addr1FUELBalance = await mandelbrot["balanceOf(address)"](addr1.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      let expectedAddr2FUELBalance = 200n * 10n ** 18n;
      let addr2FUELBalance = await mandelbrot["balanceOf(address)"](addr2.address);
      expect(addr2FUELBalance).to.equal(expectedAddr2FUELBalance);

      const usedFUEL = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      let args = [
        originTokenId,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await mandelbrot.connect(addr1).bid(...args);
      await mandelbrot.batchApprove([2]);

      expectedOwnerFUELBalance += BigInt(10 * MINT_FEE / 100) * 10n ** 18n;
      ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      expectedAddr1FUELBalance -= 10n * 10n ** 18n;
      addr1FUELBalance = await mandelbrot["balanceOf(address)"](addr1.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      for (i = 0; i < 3; i++) {
        args = [
          2,
          addr2.address,
          {"left": BigInt(i * 3) * 16n ** 61n, "right": BigInt(i * 3 + 2) * 16n ** 61n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedFUEL,
          minimumBid
        ];
        await mandelbrot.connect(addr2).bid(...args);
      }
      await mandelbrot.connect(addr1).batchApprove([3, 4, 5]);

      expectedOwnerFUELBalance += BigInt(3 * 100 * MINT_FEE / 100 * UPSTREAM_SHARE / 100) * 10n ** 17n;
      ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      expectedAddr1FUELBalance += BigInt(3 * 100 * MINT_FEE / 100 * (1 - UPSTREAM_SHARE / 100)) * 10n ** 17n;
      addr1FUELBalance = await mandelbrot["balanceOf(address)"](addr1.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      expectedAddr2FUELBalance -= 3n * 10n * 10n ** 18n;
      addr2FUELBalance = await mandelbrot["balanceOf(address)"](addr2.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      args = [
        3,
        addr2.address,
        {"left": 0n, "right": 2n * 10n ** 15n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedFUEL,
        minimumBid
      ];
      await mandelbrot.connect(addr3).bid(...args);
      await mandelbrot.connect(addr2).batchApprove([6]);

      let addr2share = BigInt(100 * MINT_FEE / 100 * (1 - UPSTREAM_SHARE / 100)) * 10n ** 17n;
      expectedAddr2FUELBalance += addr2share;
      addr2FUELBalance = await mandelbrot["balanceOf(address)"](addr2.address);
      expect(addr2FUELBalance).to.equal(expectedAddr2FUELBalance);

      let addr1share = (BigInt(10 * MINT_FEE / 100) * 10n ** 18n - addr2share) * (100n - BigInt(1 * UPSTREAM_SHARE + (100 - UPSTREAM_SHARE) * (1 - 3 / 5))) / 100n;
      expectedAddr1FUELBalance += addr1share;
      addr1FUELBalance = await mandelbrot["balanceOf(address)"](addr1.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      expectedOwnerFUELBalance += BigInt(10 * MINT_FEE / 100) * 10n ** 18n - addr2share - addr1share;
      ownerFUELBalance = await mandelbrot["balanceOf(address)"](owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);
    });

    it("Should revert with BidNotFound", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      const invalidBidId = 10;
      
      await expect(mandelbrot["approve(uint256)"](invalidBidId)).to.be.revertedWithCustomError(mandelbrot, "BidNotFound");
    });

    it("Should revert with NoRightsToApproveBid", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const { bidId, usedFUEL, minimumBid } = await loadFixture(mint);
      
      await expect(mandelbrot.connect(addr1)["approve(uint256)"](bidId)).to.be.revertedWithCustomError(mandelbrot, "NoRightsToApproveBid");
    });

    it("Should revert with TooManyChildTokens", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      for (i = 0; i < 6; i++) {
        const args = [
          originTokenId,
          addr1.address,
          {"left": BigInt(i * 3) * 16n ** 62n, "right": BigInt(i * 3 + 2) * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedFUEL,
          minimumBid
        ];
        await mandelbrot.connect(addr1).bid(...args);
      }
      
      await expect(mandelbrot.batchApprove([2, 3, 4, 5, 6, 7])).to.be.revertedWithCustomError(mandelbrot, "TooManyChildTokens");
    });

    it("Should revert with FieldsOverlap", async function () {
      const { mandelbrot, owner, addr1, addr2 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      for (i = 0; i < 6; i++) {
        const args = [
          originTokenId,
          addr1.address,
          {"left": BigInt(i * 3) * 16n ** 62n, "right": BigInt(i * 3 + 5) * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedFUEL,
          minimumBid
        ];
        await mandelbrot.connect(addr1).bid(...args);
      }
      
      await expect(mandelbrot.batchApprove([2, 3])).to.be.revertedWithCustomError(mandelbrot, "FieldsOverlap");
    });
  });

  describe("Metadata", function () {
    it("Should return ancestry metadata", async function () {
      const { mandelbrot, owner, addr1, addr2, addr3 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedFUEL = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      let args = [
        originTokenId,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await mandelbrot.connect(addr1).bid(...args);
      await mandelbrot.batchApprove([2]);

      args = [
        2,
        addr2.address,
        {"left": 0n, "right": 2n * 16n ** 61n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await mandelbrot.connect(addr2).bid(...args);
      await mandelbrot.connect(addr1).batchApprove([3]);

      args = [
        3,
        addr2.address,
        {"left": 0n, "right": 2n * 16n ** 60n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedFUEL,
        minimumBid
      ];
      await mandelbrot.connect(addr3).bid(...args);
      await mandelbrot.connect(addr2).batchApprove([4]);

      let metadata = await mandelbrot.getAncestryMetadata(4);
    });

    it("Should return owned items", async function () {
      const { mandelbrot, owner, addr1 } = await loadFixture(deployTokenFixture);
      await loadFixture(fundAccounts);
      const originTokenId = 1;

      const usedFUEL = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      let args = [
        originTokenId,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await mandelbrot.connect(addr1).bid(...args);
      await mandelbrot.batchApprove([2]);

      args = [
        2,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 61n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await mandelbrot.connect(addr1).bid(...args);
      await mandelbrot.connect(addr1).batchApprove([3]);

      args = [
        3,
        addr1.address,
        {"left": 0n, "right": 2n * 16n ** 60n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedFUEL,
        minimumBid
      ];
      await mandelbrot.connect(addr1).bid(...args);

      let { tokens, bids } = await mandelbrot.getOwnedItems(addr1.address);
      expect(tokens.length).to.equal(2);
      expect(bids.length).to.equal(1);
    });
  });
});