const fs = require("fs")
const path = require("path")
const { getTokenBytecode } = require("./helper.js")

async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    console.log("Account balance:", (await deployer.getBalance()).toString());

    const MandelbrotNFT = await ethers.getContractFactory("MandelbrotNFT");
    const token = await MandelbrotNFT.deploy();

    console.log("NFT address:", token.address);

    const abi = JSON.parse(fs.readFileSync(path.resolve(__dirname, "./Wrapped1155Factory.json"), "utf8")).abi;
    const Wrapped1155Factory = await ethers.getContractAt(abi, "0x3D1C1C85fbe6698F043D0Dc38BD8259B1004d05a");
    const calldataBytes = getTokenBytecode("Wrapped Mandelbrot FUEL", "wFUEL", 18);
    console.log("Calldata:", calldataBytes);
    const WrapperFUEL = await Wrapped1155Factory.getWrapped1155(token.address, 0, calldataBytes);

    await token.safeTransferFrom(
        deployer.address,
        Wrapped1155Factory.address,
        0,
        "10000000000000000000000",
        calldataBytes,
        { from: deployer.address },
    );

    console.log("ERC20 address:", WrapperFUEL);
}
  
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });