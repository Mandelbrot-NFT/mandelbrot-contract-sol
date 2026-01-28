const { expect } = require("chai");
const { loadFixture } = require("@nomicfoundation/hardhat-network-helpers");

function forceERC20Interface(token) {
  const interface = token.interface;

  const originalGetFunction = interface.getFunction.bind(interface);

  interface.getFunction = (key) => {
    // Only intercept the ambiguous lookup
    switch (key) {
      case "balanceOf":
        return originalGetFunction("balanceOf(address)");
      default:
        return originalGetFunction(key);
    }
  };

  // return an "undo" function so you can restore after the test
  return () => {
    interface.getFunction = originalGetFunction;
  };
}

describe("Mandelbrot contract", function () {
  async function deploy() {
    const Mandelbrot = await ethers.getContractFactory("Mandelbrot");
    const [owner] = await ethers.getSigners();
    const mandelbrot = await Mandelbrot.deploy();
    return { Mandelbrot: Mandelbrot, mandelbrot, owner };
  }

  async function fundAccounts() {
    const { mandelbrot } = await loadFixture(deploy);
    const [_owner, addr1, addr2, addr3, addr4] = await ethers.getSigners();
    const addr1FUELBalance = 200n * 10n ** 18n;
    const addr2FUELBalance = 200n * 10n ** 18n;
    const addr3FUELBalance = 200n * 10n ** 18n;
    await mandelbrot.transfer(addr1.address, addr1FUELBalance);
    await mandelbrot.transfer(addr2.address, addr2FUELBalance);
    await mandelbrot.transfer(addr3.address, addr3FUELBalance);
    return { addr1, addr2, addr3, addr4, addr1FUELBalance, addr2FUELBalance, addr3FUELBalance };
  }

  async function mint() {
    const { mandelbrot } = await loadFixture(deploy);
    const { addr1 } = await loadFixture(fundAccounts);
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
    const bidId = await mandelbrot.connect(addr1).bid.staticCall(...args);
    let tx = await mandelbrot.connect(addr1).bid(...args);
    await tx.wait();
    return { bidId, usedFUEL, minimumBid };
  }

  let restore;

  beforeEach(async function () {
    Object.assign(this, await loadFixture(deploy));
    restore = forceERC20Interface(this.mandelbrot);
  });

  afterEach(function () {
    restore?.();
    restore = undefined;
  });

  describe("deploy", function () {
    it("should set the right owner", async function () {
      expect(await this.mandelbrot.owner()).to.equal(this.owner.address);
    });

    it("should assign the total supply of FUEL to the owner", async function () {
      const ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal(await this.mandelbrot.TOTAL_SUPPLY());
    });

    it("should assign the origin token to the owner", async function () {
      const originTokenId = 1;
      const originTokenBalance = await this.mandelbrot["balanceOf(address,uint256)"](this.owner.address, originTokenId);
      expect(originTokenBalance).to.equal(1);
    });

    it("should have correct origin token metadata", async function () {
      const originTokenId = 1;
      const originTokenMetadata = await this.mandelbrot.getMetadata(originTokenId);
      expect(originTokenMetadata.tokenId).to.equal(originTokenId);
      expect(originTokenMetadata.owner).to.equal(this.owner.address);
      expect(originTokenMetadata.parentId).to.equal(0);
      expect(originTokenMetadata.field.left).to.equal(0);
      expect(originTokenMetadata.field.right).to.equal(3n * 16n ** 63n);
      expect(originTokenMetadata.field.bottom).to.equal(0);
      expect(originTokenMetadata.field.top).to.equal(3n * 16n ** 63n);
      expect(originTokenMetadata.lockedFUEL).to.equal(0);
      expect(originTokenMetadata.minimumBid).to.equal(await this.mandelbrot.BASE_MINIMUM_BID());
    });
  });


  describe("bid", function () {
    beforeEach(async function () {
      Object.assign(this, await loadFixture(fundAccounts));
    });

    it("should create a bid", async function () {
      const { bidId, usedFUEL, minimumBid } = await loadFixture(mint);
      const originTokenId = 1;

      expect(bidId).to.equal(2);
      const remainingFUELBalance = await this.mandelbrot.balanceOf(this.addr1.address);
      expect(remainingFUELBalance).to.equal(this.addr1FUELBalance - usedFUEL);

      const bids = await this.mandelbrot.getBids(originTokenId);
      expect(bids.length).to.equal(1);
      const bidMetadata = bids[0];
      expect(bidMetadata.tokenId).to.equal(bidId);
      expect(bidMetadata.owner).to.equal(this.addr1.address);
      expect(bidMetadata.parentId).to.equal(originTokenId);
      expect(bidMetadata.field.left).to.equal(24n * 16n ** 62n);
      expect(bidMetadata.field.right).to.equal(2n * 16n ** 63n);
      expect(bidMetadata.field.bottom).to.equal(24n * 16n ** 62n);
      expect(bidMetadata.field.top).to.equal(2n * 16n ** 63n);
      expect(bidMetadata.lockedFUEL).to.equal(usedFUEL);
      expect(bidMetadata.minimumBid).to.equal(minimumBid);
    });

    it("should revert with TokenNotFound", async function () {
      const invalidTokenId = 10;

      const usedFUEL = 5n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        invalidTokenId,
        this.addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(this.mandelbrot.connect(this.addr1).bid(...args)).to.be.revertedWithCustomError(this.mandelbrot, "TokenNotFound");
    });

    it("should revert with BidTooLow", async function () {
      const originTokenId = 1;

      const usedFUEL = 5n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        this.addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(this.mandelbrot.connect(this.addr1).bid(...args)).to.be.revertedWithCustomError(this.mandelbrot, "BidTooLow");
    });

    it("should revert with MinimumBidTooLow", async function () {
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 5n * 10n ** 18n;
      const args = [
        originTokenId,
        this.addr1.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(this.mandelbrot.connect(this.addr1).bid(...args)).to.be.revertedWithCustomError(this.mandelbrot, "MinimumBidTooLow");
    });

    it("should revert with FieldOutside", async function () {
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        this.addr1.address,
        {"left": 35n * 16n ** 62n, "right": 4n * 16n ** 63n, "bottom": 35n * 16n ** 62n, "top": 4n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(this.mandelbrot.connect(this.addr1).bid(...args)).to.be.revertedWithCustomError(this.mandelbrot, "FieldOutside");
    });

    it("should revert with FieldTooLarge", async function () {
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        this.addr1.address,
        {"left": 24n * 16n ** 62n, "right": 3n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 3n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(this.mandelbrot.connect(this.addr1).bid(...args)).to.be.revertedWithCustomError(this.mandelbrot, "FieldTooLarge");
    });

    it("should revert with ERC1155InsufficientBalance", async function () {
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      const args = [
        originTokenId,
        this.addr4.address,
        {"left": 24n * 16n ** 62n, "right": 2n * 16n ** 63n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await expect(this.mandelbrot.connect(this.addr4).bid(...args)).to.be.revertedWithCustomError(this.mandelbrot, "ERC1155InsufficientBalance");
    });
  });


  describe("approve", function () {
    beforeEach(async function () {
      Object.assign(this, await loadFixture(fundAccounts));
    });

    it("should approve bid", async function () {
      const { bidId, usedFUEL, minimumBid } = await loadFixture(mint);
      const originTokenId = 1;

      let ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal(9400n * 10n ** 18n);

      let tx = await this.mandelbrot.batchApprove([bidId]);
      await tx.wait();

      ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal((9400n + 15n * await this.mandelbrot.MINT_FEE() / 100n) * 10n ** 18n);

      const tokenBalance = await this.mandelbrot["balanceOf(address,uint256)"](this.addr1.address, bidId);
      expect(tokenBalance).to.equal(1);

      const children = await this.mandelbrot.getChildrenMetadata(originTokenId);
      expect(children.length).to.equal(1);
      const tokenMetadata = children[0];
      expect(tokenMetadata.tokenId).to.equal(bidId);
      expect(tokenMetadata.owner).to.equal(this.addr1.address);
      expect(tokenMetadata.parentId).to.equal(originTokenId);
      expect(tokenMetadata.field.left).to.equal(24n * 16n ** 62n);
      expect(tokenMetadata.field.right).to.equal(2n * 16n ** 63n);
      expect(tokenMetadata.field.bottom).to.equal(24n * 16n ** 62n);
      expect(tokenMetadata.field.top).to.equal(2n * 16n ** 63n);
      expect(tokenMetadata.lockedFUEL).to.equal(usedFUEL * (100n - BigInt(await this.mandelbrot.MINT_FEE())) / 100n);
      expect(tokenMetadata.minimumBid).to.equal(minimumBid);

      expect((await this.mandelbrot.getBids(originTokenId)).length).to.equal(0);
    });

    it("should distribute fees hierarchically", async function () {
      const originTokenId = 1;

      let expectedOwnerFUELBalance = 9400n * 10n ** 18n;
      let ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      const usedFUEL = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      for (i = 0; i < 5; i++) {
        const args = [
          originTokenId,
          this.addr1.address,
          {"left": BigInt(i * 3) * 16n ** 62n, "right": BigInt(i * 3 + 2) * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedFUEL,
          minimumBid
        ];
        await this.mandelbrot.connect(this.addr1).bid(...args);
      }
      await this.mandelbrot.batchApprove([2, 3, 4, 5, 6]);

      expectedOwnerFUELBalance += (5n * 10n * await this.mandelbrot.MINT_FEE() / 100n) * 10n ** 18n;
      ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      let addr1FUELBalance = await this.mandelbrot.balanceOf(this.addr1.address);
      expect(addr1FUELBalance).to.equal(150n * 10n ** 18n);

      const args = [
        2,
        this.addr2.address,
        {"left": 1n * 16n ** 62n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedFUEL,
        minimumBid
      ];
      await this.mandelbrot.connect(this.addr2).bid(...args);
      await this.mandelbrot.connect(this.addr1).batchApprove([7]);

      addr1FUELBalance = await this.mandelbrot.balanceOf(this.addr1.address);
      expect(addr1FUELBalance).to.equal((1500n + (await this.mandelbrot.MINT_FEE()) * (100n - (await this.mandelbrot.UPSTREAM_SHARE())) / 100n) * 10n ** 17n);

      expectedOwnerFUELBalance += ((await this.mandelbrot.MINT_FEE()) * (await this.mandelbrot.UPSTREAM_SHARE()) / 100n) * 10n ** 17n;
      ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);
    });

    it("should distribute less fees hierarchically if not full", async function () {
      const originTokenId = 1;

      const MINT_FEE = await this.mandelbrot.MINT_FEE();
      const UPSTREAM_SHARE = await this.mandelbrot.UPSTREAM_SHARE();

      let expectedOwnerFUELBalance = 9400n * 10n ** 18n;
      let ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      let expectedAddr1FUELBalance = 200n * 10n ** 18n;
      let addr1FUELBalance = await this.mandelbrot.balanceOf(this.addr1.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      let expectedAddr2FUELBalance = 200n * 10n ** 18n;
      let addr2FUELBalance = await this.mandelbrot.balanceOf(this.addr2.address);
      expect(addr2FUELBalance).to.equal(expectedAddr2FUELBalance);

      const usedFUEL = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      let args = [
        originTokenId,
        this.addr1.address,
        {"left": 0n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await this.mandelbrot.connect(this.addr1).bid(...args);
      await this.mandelbrot.batchApprove([2]);

      expectedOwnerFUELBalance += (10n * MINT_FEE / 100n) * 10n ** 18n;
      ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      expectedAddr1FUELBalance -= 10n * 10n ** 18n;
      addr1FUELBalance = await this.mandelbrot.balanceOf(this.addr1.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      for (i = 0; i < 3; i++) {
        args = [
          2,
          this.addr2.address,
          {"left": BigInt(i * 3) * 16n ** 61n, "right": BigInt(i * 3 + 2) * 16n ** 61n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedFUEL,
          minimumBid
        ];
        await this.mandelbrot.connect(this.addr2).bid(...args);
      }
      await this.mandelbrot.connect(this.addr1).batchApprove([3, 4, 5]);

      expectedOwnerFUELBalance += (3n * 100n * MINT_FEE / 100n * UPSTREAM_SHARE / 100n) * 10n ** 17n;
      ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);

      expectedAddr1FUELBalance += (3n * 100n * MINT_FEE * (100n - UPSTREAM_SHARE)) / 100n / 100n * 10n ** 17n;
      addr1FUELBalance = await this.mandelbrot.balanceOf(this.addr1.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      expectedAddr2FUELBalance -= 3n * 10n * 10n ** 18n;
      addr2FUELBalance = await this.mandelbrot.balanceOf(this.addr2.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      args = [
        3,
        this.addr2.address,
        {"left": 0n, "right": 2n * 10n ** 15n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedFUEL,
        minimumBid
      ];
      await this.mandelbrot.connect(this.addr3).bid(...args);
      await this.mandelbrot.connect(this.addr2).batchApprove([6]);

      let addr2share = (MINT_FEE * (100n - UPSTREAM_SHARE) * 10n ** 17n) / 100n;
      expectedAddr2FUELBalance += addr2share;
      addr2FUELBalance = await this.mandelbrot.balanceOf(this.addr2.address);
      expect(addr2FUELBalance).to.equal(expectedAddr2FUELBalance);

      let addr1share = ((MINT_FEE * 10n ** 18n) / 10n - addr2share) * 3n * (100n - UPSTREAM_SHARE) / 5n / 100n;
      expectedAddr1FUELBalance += addr1share;
      addr1FUELBalance = await this.mandelbrot.balanceOf(this.addr1.address);
      expect(addr1FUELBalance).to.equal(expectedAddr1FUELBalance);

      expectedOwnerFUELBalance += (10n * MINT_FEE / 100n) * 10n ** 18n - addr2share - addr1share;
      ownerFUELBalance = await this.mandelbrot.balanceOf(this.owner.address);
      expect(ownerFUELBalance).to.equal(expectedOwnerFUELBalance);
    });

    it("should revert with BidNotFound", async function () {
      const invalidBidId = 10;
      
      await expect(this.mandelbrot["approve(uint256)"](invalidBidId)).to.be.revertedWithCustomError(this.mandelbrot, "BidNotFound");
    });

    it("should revert with NoRightsToApproveBid", async function () {
      const { bidId } = await loadFixture(mint);
      
      await expect(this.mandelbrot.connect(this.addr1)["approve(uint256)"](bidId)).to.be.revertedWithCustomError(this.mandelbrot, "NoRightsToApproveBid");
    });

    it("should revert with TooManyChildTokens", async function () {
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      for (i = 0; i < 6; i++) {
        const args = [
          originTokenId,
          this.addr1.address,
          {"left": BigInt(i * 3) * 16n ** 62n, "right": BigInt(i * 3 + 2) * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedFUEL,
          minimumBid
        ];
        await this.mandelbrot.connect(this.addr1).bid(...args);
      }
      
      await expect(this.mandelbrot.batchApprove([2, 3, 4, 5, 6, 7])).to.be.revertedWithCustomError(this.mandelbrot, "TooManyChildTokens");
    });

    it("should revert with FieldsOverlap", async function () {
      const originTokenId = 1;

      const usedFUEL = 15n * 10n ** 18n;
      const minimumBid = 20n * 10n ** 18n;
      for (i = 0; i < 6; i++) {
        const args = [
          originTokenId,
          this.addr1.address,
          {"left": BigInt(i * 3) * 16n ** 62n, "right": BigInt(i * 3 + 5) * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
          usedFUEL,
          minimumBid
        ];
        await this.mandelbrot.connect(this.addr1).bid(...args);
      }
      
      await expect(this.mandelbrot.batchApprove([2, 3])).to.be.revertedWithCustomError(this.mandelbrot, "FieldsOverlap");
    });
  });

  describe("metadata", function () {
    beforeEach(async function () {
      Object.assign(this, await loadFixture(fundAccounts));
    });

    it("should return ancestry metadata", async function () {
      const originTokenId = 1;

      const usedFUEL = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      let args = [
        originTokenId,
        this.addr1.address,
        {"left": 0n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await this.mandelbrot.connect(this.addr1).bid(...args);
      await this.mandelbrot.batchApprove([2]);

      args = [
        2,
        this.addr2.address,
        {"left": 0n, "right": 2n * 16n ** 61n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await this.mandelbrot.connect(this.addr2).bid(...args);
      await this.mandelbrot.connect(this.addr1).batchApprove([3]);

      args = [
        3,
        this.addr2.address,
        {"left": 0n, "right": 2n * 16n ** 60n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedFUEL,
        minimumBid
      ];
      await this.mandelbrot.connect(this.addr3).bid(...args);
      await this.mandelbrot.connect(this.addr2).batchApprove([4]);

      let metadata = await this.mandelbrot.getAncestryMetadata(4);
    });

    it("should return owned items", async function () {
      const originTokenId = 1;

      const usedFUEL = 10n * 10n ** 18n;
      const minimumBid = 10n * 10n ** 18n;
      let args = [
        originTokenId,
        this.addr1.address,
        {"left": 0n, "right": 2n * 16n ** 62n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await this.mandelbrot.connect(this.addr1).bid(...args);
      await this.mandelbrot.batchApprove([2]);

      args = [
        2,
        this.addr1.address,
        {"left": 0n, "right": 2n * 16n ** 61n, "bottom": 24n * 16n ** 62n, "top": 2n * 16n ** 63n},
        usedFUEL,
        minimumBid
      ];
      await this.mandelbrot.connect(this.addr1).bid(...args);
      await this.mandelbrot.connect(this.addr1).batchApprove([3]);

      args = [
        3,
        this.addr1.address,
        {"left": 0n, "right": 2n * 16n ** 60n, "bottom": 24n * 16n ** 62n, "top": 25n * 16n ** 62n},
        usedFUEL,
        minimumBid
      ];
      await this.mandelbrot.connect(this.addr1).bid(...args);

      let { tokens, bids } = await this.mandelbrot.getOwnedItems(this.addr1.address);
      expect(tokens.length).to.equal(2);
      expect(bids.length).to.equal(1);
    });
  });
});