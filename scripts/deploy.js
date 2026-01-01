const hre = require("hardhat");

async function main() {
    console.log("Starting deployment...");
    
    // Get the deployer account
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);
    
    // Get account balance
    const balance = await hre.ethers.provider.getBalance(deployer.address);
    console.log("Account balance:", hre.ethers.formatEther(balance), "ETH");
    
    // Deploy Mock Token A
    console.log("\nDeploying Token A...");
    const MockERC20 = await hre.ethers.getContractFactory("MockERC20");
    const tokenA = await MockERC20.deploy("Token A", "TKA");
    await tokenA.waitForDeployment();
    const tokenAAddress = await tokenA.getAddress();
    console.log("Token A deployed to:", tokenAAddress);
    
    // Deploy Mock Token B
    console.log("\nDeploying Token B...");
    const tokenB = await MockERC20.deploy("Token B", "TKB");
    await tokenB.waitForDeployment();
    const tokenBAddress = await tokenB.getAddress();
    console.log("Token B deployed to:", tokenBAddress);
    
    // Deploy DEX
    console.log("\nDeploying DEX...");
    const DEX = await hre.ethers.getContractFactory("DEX");
    const dex = await DEX.deploy(tokenAAddress, tokenBAddress);
    await dex.waitForDeployment();
    const dexAddress = await dex.getAddress();
    console.log("DEX deployed to:", dexAddress);
    
    // Mint some tokens to deployer for testing
    console.log("\nMinting test tokens...");
    const mintAmount = hre.ethers.parseEther("1000000");
    await tokenA.mint(deployer.address, mintAmount);
    await tokenB.mint(deployer.address, mintAmount);
    console.log("Minted", hre.ethers.formatEther(mintAmount), "of each token to deployer");
    
    // Display summary
    console.log("\n=== Deployment Summary ===");
    console.log("Token A:", tokenAAddress);
    console.log("Token B:", tokenBAddress);
    console.log("DEX:", dexAddress);
    console.log("========================\n");
    
    // Save deployment addresses to a file
    const fs = require("fs");
    const deploymentInfo = {
        network: hre.network.name,
        deployer: deployer.address,
        tokenA: tokenAAddress,
        tokenB: tokenBAddress,
        dex: dexAddress,
        timestamp: new Date().toISOString()
    };
    
    fs.writeFileSync(
        "deployment-info.json",
        JSON.stringify(deploymentInfo, null, 2)
    );
    console.log("Deployment info saved to deployment-info.json");
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
