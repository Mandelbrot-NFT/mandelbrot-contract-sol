deploy:
	npx hardhat run scripts/deploy.js --network sepolia

test:
	npx hardhat test

console:
	npx hardhat console --network sepolia
