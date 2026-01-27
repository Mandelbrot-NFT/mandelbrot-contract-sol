const fs = require("fs")
const path = require("path")
const NonfungiblePositionManagerJSON = require("@uniswap/v3-periphery/artifacts/contracts/NonfungiblePositionManager.sol/NonfungiblePositionManager.json")

async function main() {
    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);
    console.log("Account balance:", (await deployer.getBalance()).toString());

    const Mandelbrot = await ethers.getContractFactory("Mandelbrot");
    let tx = await Mandelbrot.deploy();
    await tx.deployed();
    const mandelbrotAddress = tx.address;
    console.log("mandelbrot address:", mandelbrotAddress);

    const uniswapAddress = "0x1238536071E1c677A632429e3655c799b22cDA52";
    let ERC20 = await ethers.getContractAt(
        JSON.parse(fs.readFileSync(path.resolve(__dirname, "./IERC20.json"), "utf8")).abi,
        mandelbrotAddress
    );
    tx = await ERC20.approve(uniswapAddress, 10000n * 10n ** 18n);
    await tx.wait(1);
    console.log("Approved FUEL");
    const wethAddress = "0xfff9976782d46cc05630d1f6ebab18b2324d6b14";

    const erc20Abi = [
        "function balanceOf(address) view returns (uint256)",
        "function allowance(address,address) view returns (uint256)",
        "function approve(address,uint256) returns (bool)"
    ];
    
    const om = new ethers.Contract(mandelbrotAddress, erc20Abi, deployer);
    const weth = new ethers.Contract(wethAddress, [
        ...erc20Abi,
        "function deposit() payable"
    ], deployer);
    
    console.log("FUEL balance:", (await om.balanceOf(deployer.address)).toString());
    console.log("WETH balance:", (await weth.balanceOf(deployer.address)).toString());

    ERC20 = await ethers.getContractAt(
        JSON.parse(fs.readFileSync(path.resolve(__dirname, "./IERC20.json"), "utf8")).abi,
        wethAddress
    );
    tx = await ERC20.approve(uniswapAddress, 10n ** 18n);
    await tx.wait(1);

    let PositionManagerInterface = new ethers.utils.Interface(NonfungiblePositionManagerJSON.abi);
    const createPoolCalldata = PositionManagerInterface.encodeFunctionData("createAndInitializePoolIfNecessary", [
        mandelbrotAddress,
        wethAddress,
        3000,
        354304812133004293256224153n
        // BigInt(Math.sqrt(0.00002499911396006976660520530753029078141480567865073680877685546875) * 2.0 ** 96.0)
    ]);
    const mintCalldata = PositionManagerInterface.encodeFunctionData("mint", [{
        token0: mandelbrotAddress,
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

    console.log("FUEL allowance:", (await om.allowance(deployer.address, uniswapAddress)).toString());
    console.log("WETH allowance:", (await weth.allowance(deployer.address, uniswapAddress)).toString());

    tx = await PositionManager.multicall([
        createPoolCalldata,
        mintCalldata
    ]);
    await tx.wait(1);
}
  
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });