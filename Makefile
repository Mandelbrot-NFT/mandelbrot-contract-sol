deploy:
	npx hardhat run scripts/deploy.js --network sepolia

tests:
	npx hardhat test

console:
	npx hardhat console --network sepolia
