const fs = require("fs")
const path = require("path")
const { getTokenBytecode } = require("./helper.js")
const NonfungiblePositionManagerJSON = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json")

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const MandelbrotNFT = await ethers.getContractFactory("MandelbrotNFT");
    const token = await MandelbrotNFT.deploy();
    console.log("NFT address:", token.address);

    const Wrapped1155Factory = await ethers.getContractAt(
        JSON.parse(fs.readFileSync(path.resolve(__dirname, "./Wrapped1155Factory.json"), "utf8")).abi,
        "0x3D1C1C85fbe6698F043D0Dc38BD8259B1004d05a"
    );
    const calldataBytes = getTokenBytecode("Wrapped OM", "wOM", 18);
    console.log("Calldata:", calldataBytes);
    const wrappedOMAddress = await Wrapped1155Factory.getWrapped1155(token.address, 0, calldataBytes);
    console.log("ERC20 address:", wrappedOMAddress);

    tx = await token.safeTransferFrom(
        deployer.address,
        Wrapped1155Factory.address,
        0,
        10000n * 10n ** 18n,
        calldataBytes,
        { from: deployer.address },
    );
    await tx.wait(1);
    console.log("Wrapped OM token");

    const uniswapAddress = "0x1238536071E1c677A632429e3655c799b22cDA52";
    let ERC20 = await ethers.getContractAt(
        JSON.parse(fs.readFileSync(path.resolve(__dirname, "./IERC20.json"), "utf8")).abi,
        wrappedOMAddress
    );
    tx = await ERC20.approve(uniswapAddress, 10000n * 10n ** 18n);
    await tx.wait(1);
    console.log("Approved wOM");
    const wethAddress = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";
    ERC20 = await ethers.getContractAt(
        JSON.parse(fs.readFileSync(path.resolve(__dirname, "./IERC20.json"), "utf8")).abi,
        wethAddress
    );
    tx = await ERC20.approve(uniswapAddress, 10n ** 18n);
    await tx.wait(1);
    console.log("Approved wETH");

    let PositionManagerInterface = new ethers.utils.Interface(NonfungiblePositionManagerJSON.abi);
    const createPoolCalldata = PositionManagerInterface.encodeFunctionData("createAndInitializePoolIfNecessary", [
        wrappedOMAddress,
        wethAddress,
        3000,
        354304812133004293256224153n
        // BigInt(Math.sqrt(0.00002499911396006976660520530753029078141480567865073680877685546875) * 2.0 ** 96.0)
    ]);
    const mintCalldata = PositionManagerInterface.encodeFunctionData("mint", [{
        token0: wrappedOMAddress,
        token1: wethAddress,
        fee: 3000,
        tickLower: -115140,
        tickUpper: 0,
        amount0Desired: 9999999999999999993769n,
        amount1Desired: 58866725786751106n,
        amount0Min: 9974981479366954013211n,
        amount1Min: 58363890979279799n,
        recipient: deployer.address,
        deadline: Math.floor(Date.now() / 1000) + 30
    }]);

    const PositionManager = await ethers.getContractAt(NonfungiblePositionManagerJSON.abi, uniswapAddress);
    await PositionManager.multicall([
        createPoolCalldata,
        mintCalldata
    ]);
}
  
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });